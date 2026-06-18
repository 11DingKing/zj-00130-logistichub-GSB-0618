const db = require('../config/database');
const moment = require('moment');

const generateBillNo = (merchantId, period) => {
  const periodStr = period.replace('-', '');
  const count = db.prepare(`
    SELECT COUNT(*) as count FROM bills 
    WHERE merchant_id = ? AND billing_period = ?
  `).get(merchantId, period).count;
  return `BL${periodStr}${String(merchantId).padStart(4, '0')}${String(count + 1).padStart(2, '0')}`;
};

const calculateLeaseUsageDays = (lease, periodStart, periodEnd) => {
  const leaseStart = moment(lease.start_date);
  const leaseEnd = lease.end_date ? moment(lease.end_date) : moment(periodEnd).endOf('month');
  
  const actualStart = moment.max(leaseStart, moment(periodStart));
  const actualEnd = moment.min(leaseEnd, moment(periodEnd));
  
  if (actualEnd.isBefore(actualStart)) {
    return 0;
  }
  
  return actualEnd.diff(actualStart, 'days') + 1;
};

const calculateDailyUsage = (leaseId, periodStart, periodEnd) => {
  const dailyUsages = db.prepare(`
    SELECT date(txn_date) as txn_day,
           SUM(CASE WHEN txn_type = 'inbound' THEN quantity
                    WHEN txn_type = 'outbound' THEN -quantity
                    WHEN txn_type = 'transfer' THEN quantity
                    ELSE 0 END) as daily_change
    FROM transactions
    WHERE lease_id = ? 
      AND txn_date >= ? 
      AND txn_date <= ?
    GROUP BY date(txn_date)
    ORDER BY txn_date
  `).all(leaseId, periodStart, periodEnd);
  
  const initialStock = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as initial
    FROM inventory_batches
    WHERE lease_id = ? AND inbound_date < ?
  `).get(leaseId, periodStart).initial;
  
  let currentStock = initialStock;
  let totalUsage = 0;
  let days = 0;
  
  const periodStartM = moment(periodStart);
  const periodEndM = moment(periodEnd);
  const totalDays = periodEndM.diff(periodStartM, 'days') + 1;
  
  for (let i = 0; i < totalDays; i++) {
    const currentDate = periodStartM.clone().add(i, 'days').format('YYYY-MM-DD');
    const dayChange = dailyUsages.find(d => d.txn_day === currentDate);
    
    if (dayChange) {
      currentStock += dayChange.daily_change;
    }
    
    if (currentStock > 0) {
      totalUsage += currentStock;
      days++;
    }
  }
  
  return {
    averageUsage: days > 0 ? totalUsage / days : 0,
    maxUsage: currentStock,
    daysWithStock: days
  };
};

const calculateLeaseAmount = (lease, periodStart, periodEnd) => {
  const days = calculateLeaseUsageDays(lease, periodStart, periodEnd);
  if (days <= 0) return { amount: 0, days: 0, quantity: 0 };
  
  const usage = calculateDailyUsage(lease.id, periodStart, periodEnd);
  let amount = 0;
  let quantity = 0;
  
  switch (lease.billing_method) {
    case 'daily':
      quantity = lease.agreed_capacity;
      amount = lease.unit_price * days * lease.agreed_capacity;
      break;
    case 'monthly':
      const monthDays = moment(periodEnd).daysInMonth();
      quantity = lease.agreed_capacity;
      amount = lease.unit_price * (days / monthDays) * lease.agreed_capacity;
      break;
    case 'per_pallet':
    case 'per_volume':
      quantity = usage.averageUsage;
      amount = lease.unit_price * usage.averageUsage * days;
      break;
    default:
      break;
  }
  
  return {
    amount: Math.round(amount * 100) / 100,
    days,
    quantity: Math.round(quantity * 100) / 100,
    averageUsage: Math.round(usage.averageUsage * 100) / 100
  };
};

const getAllBills = (req, res) => {
  const { merchantId, status, billingPeriod, startDate, endDate } = req.query;
  
  let sql = `
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           COUNT(bi.id) as item_count
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'merchant') {
    sql += ' AND b.merchant_id = ?';
    params.push(req.user.id);
  } else if (merchantId) {
    sql += ' AND b.merchant_id = ?';
    params.push(merchantId);
  }
  if (status) {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (billingPeriod) {
    sql += ' AND b.billing_period = ?';
    params.push(billingPeriod);
  }
  if (startDate) {
    sql += ' AND date(b.created_at) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date(b.created_at) <= ?';
    params.push(endDate);
  }

  sql += ' GROUP BY b.id ORDER BY b.created_at DESC';
  
  const bills = db.prepare(sql).all(...params);
  res.json(bills);
};

const getBillById = (req, res) => {
  const { id } = req.params;
  
  const bill = db.prepare(`
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           u.email as merchant_email
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    WHERE b.id = ?
  `).get(id);
  
  if (!bill) {
    return res.status(404).json({ error: '账单不存在' });
  }

  if (req.user.role === 'merchant' && bill.merchant_id !== req.user.id) {
    return res.status(403).json({ error: '无权查看此账单' });
  }

  const items = db.prepare(`
    SELECT bi.*,
           loc.code as location_code,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit
    FROM bill_items bi
    LEFT JOIN locations loc ON bi.location_id = loc.id
    LEFT JOIN goods_categories gc ON bi.category_id = gc.id
    WHERE bi.bill_id = ?
    ORDER BY bi.id
  `).all(id);

  res.json({ ...bill, items });
};

const getMyBills = (req, res) => {
  const { status, billingPeriod } = req.query;
  
  let sql = `
    SELECT b.*,
           COUNT(bi.id) as item_count
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE b.merchant_id = ?
  `;
  const params = [req.user.id];

  if (status) {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (billingPeriod) {
    sql += ' AND b.billing_period = ?';
    params.push(billingPeriod);
  }

  sql += ' GROUP BY b.id ORDER BY b.created_at DESC';
  
  const bills = db.prepare(sql).all(...params);
  res.json(bills);
};

const generateMonthlyBills = (req, res) => {
  const { year, month } = req.body;
  
  if (!year || !month) {
    return res.status(400).json({ error: '年份和月份为必填项' });
  }
  
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = moment(periodStart).endOf('month').format('YYYY-MM-DD');
  
  const existingBills = db.prepare(`
    SELECT COUNT(*) as count FROM bills WHERE billing_period = ?
  `).get(period).count;
  
  if (existingBills > 0 && !req.body.force) {
    return res.status(400).json({ 
      error: `${period} 月账单已生成，如需重新生成请设置 force=true`,
      existingCount: existingBills
    });
  }
  
  const activeLeases = db.prepare(`
    SELECT l.*,
           loc.code as location_code,
           gc.name as category_name
    FROM leases l
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE l.status = 'active'
      AND l.start_date <= ?
      AND (l.end_date IS NULL OR l.end_date >= ?)
  `).all(periodEnd, periodStart);
  
  const leasesByMerchant = {};
  activeLeases.forEach(lease => {
    if (!leasesByMerchant[lease.merchant_id]) {
      leasesByMerchant[lease.merchant_id] = [];
    }
    leasesByMerchant[lease.merchant_id].push(lease);
  });
  
  const tx = db.transaction(() => {
    if (existingBills > 0) {
      db.prepare(`
        DELETE FROM bill_items 
        WHERE bill_id IN (SELECT id FROM bills WHERE billing_period = ?)
      `).run(period);
      db.prepare(`DELETE FROM bills WHERE billing_period = ?`).run(period);
    }
    
    const results = [];
    
    for (const [merchantId, leases] of Object.entries(leasesByMerchant)) {
      const billNo = generateBillNo(merchantId, period);
      let totalAmount = 0;
      
      const billResult = db.prepare(`
        INSERT INTO bills (bill_no, merchant_id, billing_period, total_amount, status, remarks)
        VALUES (?, ?, ?, 0, 'pending', ?)
      `).run(billNo, merchantId, period, `${period} 月仓储费账单`);
      
      const billId = billResult.lastInsertRowid;
      
      for (const lease of leases) {
        const calculation = calculateLeaseAmount(lease, periodStart, periodEnd);
        
        if (calculation.amount > 0) {
          const description = `${lease.location_code} - ${lease.category_name} ${lease.billing_method === 'daily' ? '按日' : lease.billing_method === 'monthly' ? '按月' : lease.billing_method === 'per_pallet' ? '按托盘' : '按体积'}计费`;
          
          db.prepare(`
            INSERT INTO bill_items (
              bill_id, lease_id, location_id, category_id, billing_method,
              unit_price, quantity, days, amount, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            billId, lease.id, lease.location_id, lease.category_id, lease.billing_method,
            lease.unit_price, calculation.quantity, calculation.days, calculation.amount, description
          );
          
          totalAmount += calculation.amount;
        }
      }
      
      if (totalAmount > 0) {
        db.prepare(`
          UPDATE bills SET total_amount = ?, status = 'issued', issued_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(Math.round(totalAmount * 100) / 100, billId);
        
        results.push({
          merchantId,
          billId,
          billNo,
          totalAmount: Math.round(totalAmount * 100) / 100,
          itemCount: leases.length
        });
      } else {
        db.prepare(`DELETE FROM bills WHERE id = ?`).run(billId);
      }
    }
    
    db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'generate_bills', 'billing', `生成 ${period} 月账单，共 ${results.length} 张`);
    
    return results;
  });
  
  try {
    const results = tx();
    res.json({
      message: `${period} 月账单生成完成`,
      period,
      billCount: results.length,
      bills: results
    });
  } catch (err) {
    res.status(500).json({ error: '账单生成失败: ' + err.message });
  }
};

const markBillPaid = (req, res) => {
  const { id } = req.params;
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    return res.status(404).json({ error: '账单不存在' });
  }
  
  if (bill.status !== 'issued' && bill.status !== 'overdue') {
    return res.status(400).json({ error: '账单状态不允许标记为已支付' });
  }
  
  db.prepare(`
    UPDATE bills SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  
  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'mark_bill_paid', 'billing', `标记账单 ${bill.bill_no} 为已支付`);
  
  res.json({ message: '账单已标记为已支付' });
};

const markBillOverdue = (req, res) => {
  const { id } = req.params;
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    return res.status(404).json({ error: '账单不存在' });
  }
  
  if (bill.status !== 'issued') {
    return res.status(400).json({ error: '只有已出单的账单可以标记为逾期' });
  }
  
  db.prepare(`
    UPDATE bills SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  
  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'mark_bill_overdue', 'billing', `标记账单 ${bill.bill_no} 为逾期`);
  
  res.json({ message: '账单已标记为逾期' });
};

const cancelBill = (req, res) => {
  const { id } = req.params;
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    return res.status(404).json({ error: '账单不存在' });
  }
  
  if (bill.status === 'paid') {
    return res.status(400).json({ error: '已支付的账单无法取消' });
  }
  
  db.prepare(`
    UPDATE bills SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  
  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'cancel_bill', 'billing', `取消账单 ${bill.bill_no}`);
  
  res.json({ message: '账单已取消' });
};

const getBillingSummary = (req, res) => {
  const { year, month } = req.query;
  
  let sql = `
    SELECT 
      COUNT(*) as total_bills,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_bills,
      SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) as issued_bills,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_bills,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_bills,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bills,
      SUM(CASE WHEN status IN ('issued', 'overdue') THEN total_amount ELSE 0 END) as receivable_amount,
      SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as received_amount,
      SUM(total_amount) as total_amount
    FROM bills
  `;
  const params = [];
  
  if (year && month) {
    sql += ' WHERE billing_period = ?';
    params.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  
  const summary = db.prepare(sql).get(...params);
  
  const byMerchant = db.prepare(`
    SELECT 
      u.id,
      u.name,
      u.company_name,
      COUNT(b.id) as bill_count,
      SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN b.status IN ('issued', 'overdue') THEN b.total_amount ELSE 0 END) as unpaid_amount,
      SUM(b.total_amount) as total_amount
    FROM users u
    LEFT JOIN bills b ON u.id = b.merchant_id
    WHERE u.role = 'merchant'
    GROUP BY u.id
    ORDER BY total_amount DESC
  `).all();
  
  res.json({
    summary: {
      ...summary,
      collectionRate: summary.total_amount > 0 
        ? Math.round((summary.received_amount / summary.total_amount) * 10000) / 100 
        : 0
    },
    byMerchant
  });
};

module.exports = {
  getAllBills,
  getBillById,
  getMyBills,
  generateMonthlyBills,
  markBillPaid,
  markBillOverdue,
  cancelBill,
  getBillingSummary
};
