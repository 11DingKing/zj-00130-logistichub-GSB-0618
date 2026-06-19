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

const getBillingTiers = (billingMethod) => {
  return db.prepare(`
    SELECT * FROM billing_tiers 
    WHERE billing_method = ? 
    ORDER BY tier_from ASC
  `).all(billingMethod);
};

const calculateTieredAmount = (billingMethod, totalQuantity, days) => {
  const tiers = getBillingTiers(billingMethod);
  if (tiers.length === 0) {
    return { amount: 0, details: [] };
  }
  
  let remaining = totalQuantity;
  let totalAmount = 0;
  const details = [];
  
  for (const tier of tiers) {
    const tierSize = tier.tier_to ? tier.tier_to - tier.tier_from + 1 : remaining;
    const tierQty = Math.min(remaining, tierSize);
    
    if (tierQty <= 0) break;
    
    const tierAmount = tier.unit_price * tierQty * days;
    totalAmount += tierAmount;
    
    details.push({
      tier_from: tier.tier_from,
      tier_to: tier.tier_to,
      unit_price: tier.unit_price,
      quantity: Math.round(tierQty * 100) / 100,
      amount: Math.round(tierAmount * 100) / 100,
      description: tier.description
    });
    
    remaining -= tierQty;
    if (remaining <= 0) break;
  }
  
  return {
    amount: Math.round(totalAmount * 100) / 100,
    details
  };
};

const calculateLeaseAmount = (lease, periodStart, periodEnd) => {
  const days = calculateLeaseUsageDays(lease, periodStart, periodEnd);
  if (days <= 0) return { amount: 0, days: 0, quantity: 0, tierDetails: [] };
  
  const usage = calculateDailyUsage(lease.id, periodStart, periodEnd);
  let amount = 0;
  let quantity = 0;
  let tierDetails = [];
  
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
      const tieredResult = calculateTieredAmount(lease.billing_method, usage.averageUsage, days);
      amount = tieredResult.amount;
      tierDetails = tieredResult.details;
      break;
    default:
      break;
  }
  
  return {
    amount: Math.round(amount * 100) / 100,
    days,
    quantity: Math.round(quantity * 100) / 100,
    averageUsage: Math.round(usage.averageUsage * 100) / 100,
    tierDetails
  };
};

const getAllBills = (req, res) => {
  const { merchantId, status, billingPeriod, startDate, endDate } = req.query;
  
  let sql = `
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           COUNT(bi.id) as item_count,
           bd.id as dispute_id,
           bd.status as dispute_status_info,
           bd.reason as dispute_reason
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes bd ON b.id = bd.bill_id AND bd.status IN ('pending', 'approved', 'adjusted')
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

  const disputes = db.prepare(`
    SELECT bd.*,
           u.name as merchant_name,
           admin.name as resolved_by_name
    FROM bill_disputes bd
    LEFT JOIN users u ON bd.merchant_id = u.id
    LEFT JOIN users admin ON bd.resolved_by = admin.id
    WHERE bd.bill_id = ?
    ORDER BY bd.created_at DESC
  `).all(id);

  const adjustmentItems = db.prepare(`
    SELECT bi.*
    FROM bill_items bi
    WHERE bi.bill_id = ? AND bi.billing_method = 'adjustment'
    ORDER BY bi.id
  `).all(id);

  res.json({ 
    ...bill, 
    items, 
    disputes, 
    adjustmentItems,
    final_amount: bill.final_amount || bill.total_amount
  });
};

const getMyBills = (req, res) => {
  const { status, billingPeriod } = req.query;
  
  let sql = `
    SELECT b.*,
           COUNT(bi.id) as item_count,
           bd.id as dispute_id,
           bd.status as dispute_status_info,
           bd.reason as dispute_reason
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes bd ON b.id = bd.bill_id AND bd.status IN ('pending', 'approved', 'adjusted')
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
      db.prepare(`DELETE FROM bill_disputes WHERE bill_id IN (SELECT id FROM bills WHERE billing_period = ?)`).run(period);
      db.prepare(`DELETE FROM bills WHERE billing_period = ?`).run(period);
    }
    
    const results = [];
    
    for (const [merchantId, leases] of Object.entries(leasesByMerchant)) {
      const billNo = generateBillNo(merchantId, period);
      let totalAmount = 0;
      
      const firstLease = leases[0];
      const warehouseId = firstLease.location_id ? 1 : 1;
      const billResult = db.prepare(`
        INSERT INTO bills (bill_no, merchant_id, billing_period, billing_start_date, billing_end_date, total_amount, status, remarks, warehouse_id)
        VALUES (?, ?, ?, ?, ?, 0, 'pending', ?, ?)
      `).run(billNo, merchantId, period, periodStart, periodEnd, `${period} 月仓储费账单`, warehouseId);
      
      const billId = billResult.lastInsertRowid;
      
      for (const lease of leases) {
        const calculation = calculateLeaseAmount(lease, periodStart, periodEnd);
        
        if (calculation.amount > 0) {
          let description = `${lease.location_code} - ${lease.category_name} `;
          if (lease.billing_method === 'daily') {
            description += '按日计费';
          } else if (lease.billing_method === 'monthly') {
            description += '按月计费';
          } else if (lease.billing_method === 'per_pallet') {
            description += '按托盘阶梯计费';
          } else {
            description += '按体积阶梯计费';
          }
          
          if (calculation.tierDetails && calculation.tierDetails.length > 0) {
            description += ' (' + calculation.tierDetails.map(t => `${t.tier_from}-${t.tier_to || '∞'}:¥${t.unit_price}`).join(', ') + ')';
          }
          
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
          UPDATE bills SET total_amount = ?, final_amount = ?, status = 'issued', issued_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(Math.round(totalAmount * 100) / 100, Math.round(totalAmount * 100) / 100, billId);
        
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
  
  if (bill.status !== 'issued' && bill.status !== 'overdue' && bill.status !== 'adjusted') {
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

const submitDispute = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: '申诉理由不能为空' });
  }
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    return res.status(404).json({ error: '账单不存在' });
  }
  
  if (req.user.role === 'merchant' && bill.merchant_id !== req.user.id) {
    return res.status(403).json({ error: '无权对此账单发起申诉' });
  }
  
  if (!['issued', 'overdue', 'adjusted'].includes(bill.status)) {
    return res.status(400).json({ error: '当前账单状态不允许发起申诉' });
  }
  
  const pendingDispute = db.prepare(`
    SELECT id FROM bill_disputes WHERE bill_id = ? AND status = 'pending'
  `).get(id);
  
  if (pendingDispute) {
    return res.status(400).json({ error: '该账单已有待处理的申诉' });
  }
  
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO bill_disputes (bill_id, merchant_id, reason, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, bill.merchant_id, reason.trim());
    
    db.prepare(`
      UPDATE bills SET dispute_status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'submit_bill_dispute', 'billing', `对账单 ${bill.bill_no} 发起申诉`);
  });
  
  try {
    tx();
    res.json({ message: '申诉已提交，等待管理员审核' });
  } catch (err) {
    res.status(500).json({ error: '申诉提交失败: ' + err.message });
  }
};

const rejectDispute = (req, res) => {
  const { id, disputeId } = req.params;
  const { admin_notes } = req.body;
  
  const dispute = db.prepare('SELECT * FROM bill_disputes WHERE id = ? AND bill_id = ?').get(disputeId, id);
  if (!dispute) {
    return res.status(404).json({ error: '申诉记录不存在' });
  }
  
  if (dispute.status !== 'pending') {
    return res.status(400).json({ error: '该申诉已处理' });
  }
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE bill_disputes 
      SET status = 'rejected', admin_notes = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(admin_notes || '', req.user.id, disputeId);
    
    db.prepare(`
      UPDATE bills SET dispute_status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'reject_bill_dispute', 'billing', `驳回账单 ${bill.bill_no} 的申诉`);
  });
  
  try {
    tx();
    res.json({ message: '申诉已驳回' });
  } catch (err) {
    res.status(500).json({ error: '操作失败: ' + err.message });
  }
};

const approveDispute = (req, res) => {
  const { id, disputeId } = req.params;
  const { adjustment_amount, admin_notes } = req.body;
  
  if (!adjustment_amount || isNaN(adjustment_amount) || adjustment_amount <= 0) {
    return res.status(400).json({ error: '请输入有效的调整金额' });
  }
  
  const dispute = db.prepare('SELECT * FROM bill_disputes WHERE id = ? AND bill_id = ?').get(disputeId, id);
  if (!dispute) {
    return res.status(404).json({ error: '申诉记录不存在' });
  }
  
  if (dispute.status !== 'pending') {
    return res.status(400).json({ error: '该申诉已处理' });
  }
  
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  const finalAmount = Math.round((bill.total_amount - adjustment_amount) * 100) / 100;
  
  if (finalAmount < 0) {
    return res.status(400).json({ error: '调整金额不能大于账单总金额' });
  }
  
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE bill_disputes 
      SET status = 'adjusted', admin_notes = ?, adjustment_amount = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(admin_notes || '', adjustment_amount, req.user.id, disputeId);
    
    db.prepare(`
      INSERT INTO bill_items (bill_id, billing_method, description, unit_price, quantity, unit, amount)
      VALUES (?, 'adjustment', ?, 0, 0, '项', ?)
    `).run(id, `争议调整 - ${admin_notes || '管理员审核调整'}`, -adjustment_amount);
    
    db.prepare(`
      UPDATE bills SET 
        status = 'adjusted', 
        dispute_status = 'adjusted', 
        adjusted_amount = ?, 
        final_amount = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(adjustment_amount, finalAmount, id);
    
    db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'approve_bill_dispute', 'billing', `批准账单 ${bill.bill_no} 的申诉，调整金额 ¥${adjustment_amount}`);
  });
  
  try {
    tx();
    res.json({ 
      message: '申诉已通过，已生成调整明细', 
      final_amount: finalAmount,
      adjustment_amount: adjustment_amount
    });
  } catch (err) {
    res.status(500).json({ error: '操作失败: ' + err.message });
  }
};

const getBillingTiersHandler = (req, res) => {
  const { method } = req.query;
  let sql = 'SELECT * FROM billing_tiers';
  const params = [];
  
  if (method) {
    sql += ' WHERE billing_method = ?';
    params.push(method);
  }
  
  sql += ' ORDER BY billing_method, tier_from';
  const tiers = db.prepare(sql).all(...params);
  res.json(tiers);
};

const saveBillingTiers = (req, res) => {
  const { tiers } = req.body;
  
  if (!Array.isArray(tiers)) {
    return res.status(400).json({ error: '无效的阶梯价格数据' });
  }
  
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM billing_tiers').run();
    
    const insert = db.prepare(`
      INSERT INTO billing_tiers (billing_method, tier_from, tier_to, unit_price, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const tier of tiers) {
      insert.run(
        tier.billing_method,
        tier.tier_from,
        tier.tier_to || null,
        tier.unit_price,
        tier.description
      );
    }
  });
  
  try {
    tx();
    res.json({ message: '阶梯价格已保存' });
  } catch (err) {
    res.status(500).json({ error: '保存失败: ' + err.message });
  }
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
      SUM(CASE WHEN status = 'adjusted' THEN 1 ELSE 0 END) as adjusted_bills,
      SUM(CASE WHEN status IN ('issued', 'overdue') THEN total_amount ELSE 0 END) as receivable_amount,
      SUM(CASE WHEN status = 'paid' THEN COALESCE(final_amount, total_amount) ELSE 0 END) as received_amount,
      SUM(COALESCE(final_amount, total_amount)) as total_amount
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
      SUM(CASE WHEN b.status = 'paid' THEN COALESCE(b.final_amount, b.total_amount) ELSE 0 END) as paid_amount,
      SUM(CASE WHEN b.status IN ('issued', 'overdue') THEN COALESCE(b.final_amount, b.total_amount) ELSE 0 END) as unpaid_amount,
      SUM(COALESCE(b.final_amount, b.total_amount)) as total_amount
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
  submitDispute,
  rejectDispute,
  approveDispute,
  getBillingTiersHandler,
  saveBillingTiers,
  getBillingSummary
};
