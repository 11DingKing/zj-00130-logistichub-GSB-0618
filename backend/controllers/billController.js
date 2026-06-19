const db = require("../config/database");
const moment = require("moment");

const safeJsonParse = (str) => {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

const generateBillNo = (merchantId, period) => {
  const periodStr = period.replace("-", "");
  const count = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM bills 
    WHERE merchant_id = ? AND billing_period = ?
  `,
    )
    .get(merchantId, period).count;
  return `BL${periodStr}${String(merchantId).padStart(4, "0")}${String(count + 1).padStart(2, "0")}`;
};

const calculateLeaseUsageDays = (lease, periodStart, periodEnd) => {
  const leaseStart = moment(lease.start_date);
  const leaseEnd = lease.end_date
    ? moment(lease.end_date)
    : moment(periodEnd).endOf("month");

  const actualStart = moment.max(leaseStart, moment(periodStart));
  const actualEnd = moment.min(leaseEnd, moment(periodEnd));

  if (actualEnd.isBefore(actualStart)) {
    return 0;
  }

  return actualEnd.diff(actualStart, "days") + 1;
};

const calculateDailyUsage = (lease, periodStart, periodEnd) => {
  const dailyUsages = db
    .prepare(
      `
    SELECT date(txn_date) as txn_day,
           SUM(CASE WHEN txn_type = 'inbound' THEN quantity
                    WHEN txn_type = 'outbound' THEN -quantity
                    WHEN txn_type = 'transfer' THEN quantity
                    ELSE 0 END) as daily_change
    FROM transactions
    WHERE merchant_id = ?
      AND location_id = ?
      AND category_id = ?
      AND txn_date >= ?
      AND txn_date <= ?
    GROUP BY date(txn_date)
    ORDER BY txn_date
  `,
    )
    .all(
      lease.merchant_id,
      lease.location_id,
      lease.category_id,
      periodStart,
      periodEnd,
    );

  const initialStock = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity), 0) as initial
    FROM inventory_batches
    WHERE lease_id = ? AND inbound_date < ?
  `,
    )
    .get(lease.id, periodStart).initial;

  let currentStock = initialStock;
  let totalUsage = 0;
  let days = 0;

  const periodStartM = moment(periodStart);
  const periodEndM = moment(periodEnd);
  const totalDays = periodEndM.diff(periodStartM, "days") + 1;

  for (let i = 0; i < totalDays; i++) {
    const currentDate = periodStartM
      .clone()
      .add(i, "days")
      .format("YYYY-MM-DD");
    const dayChange = dailyUsages.find((d) => d.txn_day === currentDate);

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
    daysWithStock: days,
  };
};

const parsePricingTiers = (raw) => {
  if (!raw) return null;
  try {
    const tiers = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    const normalized = tiers
      .map((t) => ({
        min: Number(t.min ?? 0),
        max:
          t.max === null || t.max === undefined || t.max === ""
            ? Infinity
            : Number(t.max),
        unit_price: Number(t.unit_price ?? t.price ?? 0),
      }))
      .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.unit_price))
      .sort((a, b) => a.min - b.min);
    return normalized.length ? normalized : null;
  } catch (e) {
    return null;
  }
};

const computeTieredCost = (quantity, tiers, fallbackUnitPrice) => {
  if (!tiers || tiers.length === 0) {
    return {
      unitCost: quantity * fallbackUnitPrice,
      breakdown: [
        {
          min: 0,
          max: null,
          unit_price: fallbackUnitPrice,
          quantity,
          subtotal: quantity * fallbackUnitPrice,
        },
      ],
    };
  }

  let remaining = quantity;
  let cursor = 0;
  let total = 0;
  const breakdown = [];
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierStart = Math.max(tier.min, cursor);
    const tierEnd = tier.max === Infinity ? Infinity : tier.max;
    if (quantity <= tierStart) break;
    const tierWidth =
      tierEnd === Infinity ? remaining : Math.max(0, tierEnd - tierStart);
    const consumed =
      tierEnd === Infinity ? remaining : Math.min(remaining, tierWidth);
    if (consumed <= 0) continue;
    const subtotal = consumed * tier.unit_price;
    total += subtotal;
    breakdown.push({
      min: tier.min,
      max: tier.max === Infinity ? null : tier.max,
      unit_price: tier.unit_price,
      quantity: Math.round(consumed * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
    });
    remaining -= consumed;
    cursor = tierEnd;
  }

  if (remaining > 0) {
    const subtotal = remaining * fallbackUnitPrice;
    total += subtotal;
    breakdown.push({
      min: cursor === Infinity ? 0 : cursor,
      max: null,
      unit_price: fallbackUnitPrice,
      quantity: Math.round(remaining * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  }

  return { unitCost: total, breakdown };
};

const calculateLeaseAmount = (lease, periodStart, periodEnd) => {
  const days = calculateLeaseUsageDays(lease, periodStart, periodEnd);
  if (days <= 0) return { amount: 0, days: 0, quantity: 0 };

  const usage = calculateDailyUsage(lease, periodStart, periodEnd);
  const tiers = parsePricingTiers(lease.pricing_tiers);
  let amount = 0;
  let quantity = 0;
  let breakdown = null;
  let effectiveUnitPrice = lease.unit_price;

  switch (lease.billing_method) {
    case "daily": {
      quantity = lease.agreed_capacity;
      const tiered = computeTieredCost(
        lease.agreed_capacity,
        tiers,
        lease.unit_price,
      );
      amount = tiered.unitCost * days;
      breakdown = tiered.breakdown;
      effectiveUnitPrice =
        lease.agreed_capacity > 0
          ? tiered.unitCost / lease.agreed_capacity
          : lease.unit_price;
      break;
    }
    case "monthly": {
      const monthDays = moment(periodEnd).daysInMonth();
      quantity = lease.agreed_capacity;
      const tiered = computeTieredCost(
        lease.agreed_capacity,
        tiers,
        lease.unit_price,
      );
      amount = tiered.unitCost * (days / monthDays);
      breakdown = tiered.breakdown;
      effectiveUnitPrice =
        lease.agreed_capacity > 0
          ? tiered.unitCost / lease.agreed_capacity
          : lease.unit_price;
      break;
    }
    case "per_pallet":
    case "per_volume": {
      quantity = usage.averageUsage;
      const tiered = computeTieredCost(
        usage.averageUsage,
        tiers,
        lease.unit_price,
      );
      amount = tiered.unitCost * days;
      breakdown = tiered.breakdown;
      effectiveUnitPrice =
        usage.averageUsage > 0
          ? tiered.unitCost / usage.averageUsage
          : lease.unit_price;
      break;
    }
    default:
      break;
  }

  return {
    amount: Math.round(amount * 100) / 100,
    days,
    quantity: Math.round(quantity * 100) / 100,
    averageUsage: Math.round(usage.averageUsage * 100) / 100,
    effectiveUnitPrice: Math.round(effectiveUnitPrice * 10000) / 10000,
    tierBreakdown: breakdown,
    isTiered: !!tiers,
  };
};

const getAllBills = (req, res) => {
  const { merchantId, status, billingPeriod, startDate, endDate } = req.query;

  let sql = `
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           COUNT(DISTINCT bi.id) as item_count,
           COUNT(DISTINCT CASE WHEN d.status = 'pending' THEN d.id END) as pending_dispute_count,
           COUNT(DISTINCT d.id) as total_dispute_count
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes d ON b.id = d.bill_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND b.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND b.merchant_id = ?";
    params.push(merchantId);
  }
  if (status) {
    sql += " AND b.status = ?";
    params.push(status);
  }
  if (billingPeriod) {
    sql += " AND b.billing_period = ?";
    params.push(billingPeriod);
  }
  if (startDate) {
    sql += " AND date(b.created_at) >= ?";
    params.push(startDate);
  }
  if (endDate) {
    sql += " AND date(b.created_at) <= ?";
    params.push(endDate);
  }

  sql += " GROUP BY b.id ORDER BY b.created_at DESC";

  const bills = db.prepare(sql).all(...params);
  res.json(bills);
};

const getBillById = (req, res) => {
  const { id } = req.params;

  const bill = db
    .prepare(
      `
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           u.email as merchant_email
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    WHERE b.id = ?
  `,
    )
    .get(id);

  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  if (req.user.role === "merchant" && bill.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此账单" });
  }

  const items = db
    .prepare(
      `
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
  `,
    )
    .all(id);

  const itemsWithBreakdown = items.map((it) => ({
    ...it,
    tier_breakdown: it.tier_breakdown ? safeJsonParse(it.tier_breakdown) : null,
  }));

  const disputes = db
    .prepare(
      `
    SELECT d.*,
           m.name as merchant_name,
           a.name as admin_name
    FROM bill_disputes d
    LEFT JOIN users m ON d.merchant_id = m.id
    LEFT JOIN users a ON d.admin_id = a.id
    WHERE d.bill_id = ?
    ORDER BY d.created_at DESC
  `,
    )
    .all(id);

  res.json({ ...bill, items: itemsWithBreakdown, disputes });
};

const getMyBills = (req, res) => {
  const { status, billingPeriod } = req.query;

  let sql = `
    SELECT b.*,
           COUNT(DISTINCT bi.id) as item_count,
           COUNT(DISTINCT CASE WHEN d.status = 'pending' THEN d.id END) as pending_dispute_count,
           COUNT(DISTINCT d.id) as total_dispute_count
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes d ON b.id = d.bill_id
    WHERE b.merchant_id = ?
  `;
  const params = [req.user.id];

  if (status) {
    sql += " AND b.status = ?";
    params.push(status);
  }
  if (billingPeriod) {
    sql += " AND b.billing_period = ?";
    params.push(billingPeriod);
  }

  sql += " GROUP BY b.id ORDER BY b.created_at DESC";

  const bills = db.prepare(sql).all(...params);
  res.json(bills);
};

const generateMonthlyBills = (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({ error: "年份和月份为必填项" });
  }

  const period = `${year}-${String(month).padStart(2, "0")}`;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = moment(periodStart).endOf("month").format("YYYY-MM-DD");

  const existingBills = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM bills WHERE billing_period = ?
  `,
    )
    .get(period).count;

  if (existingBills > 0 && !req.body.force) {
    return res.status(400).json({
      error: `${period} 月账单已生成，如需重新生成请设置 force=true`,
      existingCount: existingBills,
    });
  }

  const activeLeases = db
    .prepare(
      `
    SELECT l.*,
           loc.code as location_code,
           gc.name as category_name
    FROM leases l
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE l.status = 'active'
      AND l.start_date <= ?
      AND (l.end_date IS NULL OR l.end_date >= ?)
  `,
    )
    .all(periodEnd, periodStart);

  const leasesByMerchant = {};
  activeLeases.forEach((lease) => {
    if (!leasesByMerchant[lease.merchant_id]) {
      leasesByMerchant[lease.merchant_id] = [];
    }
    leasesByMerchant[lease.merchant_id].push(lease);
  });

  const tx = db.transaction(() => {
    if (existingBills > 0) {
      db.prepare(
        `
        DELETE FROM bill_items 
        WHERE bill_id IN (SELECT id FROM bills WHERE billing_period = ?)
      `,
      ).run(period);
      db.prepare(`DELETE FROM bills WHERE billing_period = ?`).run(period);
    }

    const results = [];

    for (const [merchantId, leases] of Object.entries(leasesByMerchant)) {
      const billNo = generateBillNo(merchantId, period);
      let totalAmount = 0;

      const billResult = db
        .prepare(
          `
        INSERT INTO bills (bill_no, merchant_id, billing_period, total_amount, status, remarks)
        VALUES (?, ?, ?, 0, 'pending', ?)
      `,
        )
        .run(billNo, merchantId, period, `${period} 月仓储费账单`);

      const billId = billResult.lastInsertRowid;

      for (const lease of leases) {
        const calculation = calculateLeaseAmount(lease, periodStart, periodEnd);

        if (calculation.amount > 0) {
          const methodLabel =
            lease.billing_method === "daily"
              ? "按日"
              : lease.billing_method === "monthly"
                ? "按月"
                : lease.billing_method === "per_pallet"
                  ? "按托盘"
                  : "按体积";
          const tierLabel = calculation.isTiered ? "（阶梯计价）" : "";
          const description = `${lease.location_code} - ${lease.category_name} ${methodLabel}计费${tierLabel}`;

          db.prepare(
            `
            INSERT INTO bill_items (
              bill_id, lease_id, location_id, category_id, billing_method,
              unit_price, quantity, unit, days, amount, description, item_type, tier_breakdown
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?)
          `,
          ).run(
            billId,
            lease.id,
            lease.location_id,
            lease.category_id,
            lease.billing_method,
            calculation.effectiveUnitPrice,
            calculation.quantity,
            lease.billing_method === "per_volume"
              ? "m³"
              : lease.billing_method === "per_pallet"
                ? "托盘"
                : "位",
            calculation.days,
            calculation.amount,
            description,
            calculation.tierBreakdown
              ? JSON.stringify(calculation.tierBreakdown)
              : null,
          );

          totalAmount += calculation.amount;
        }
      }

      if (totalAmount > 0) {
        db.prepare(
          `
          UPDATE bills SET total_amount = ?, status = 'issued', issued_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(Math.round(totalAmount * 100) / 100, billId);

        results.push({
          merchantId,
          billId,
          billNo,
          totalAmount: Math.round(totalAmount * 100) / 100,
          itemCount: leases.length,
        });
      } else {
        db.prepare(`DELETE FROM bills WHERE id = ?`).run(billId);
      }
    }

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "generate_bills",
      "billing",
      `生成 ${period} 月账单，共 ${results.length} 张`,
    );

    return results;
  });

  try {
    const results = tx();
    res.json({
      message: `${period} 月账单生成完成`,
      period,
      billCount: results.length,
      bills: results,
    });
  } catch (err) {
    res.status(500).json({ error: "账单生成失败: " + err.message });
  }
};

const markBillPaid = (req, res) => {
  const { id } = req.params;

  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  if (
    bill.status !== "issued" &&
    bill.status !== "overdue" &&
    bill.status !== "adjusted"
  ) {
    return res.status(400).json({ error: "账单状态不允许标记为已支付" });
  }

  db.prepare(
    `
    UPDATE bills SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "mark_bill_paid",
    "billing",
    `标记账单 ${bill.bill_no} 为已支付`,
  );

  res.json({ message: "账单已标记为已支付" });
};

const markBillOverdue = (req, res) => {
  const { id } = req.params;

  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  if (bill.status !== "issued") {
    return res.status(400).json({ error: "只有已出单的账单可以标记为逾期" });
  }

  db.prepare(
    `
    UPDATE bills SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "mark_bill_overdue",
    "billing",
    `标记账单 ${bill.bill_no} 为逾期`,
  );

  res.json({ message: "账单已标记为逾期" });
};

const cancelBill = (req, res) => {
  const { id } = req.params;

  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  if (bill.status === "paid") {
    return res.status(400).json({ error: "已支付的账单无法取消" });
  }

  db.prepare(
    `
    UPDATE bills SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(req.user.id, "cancel_bill", "billing", `取消账单 ${bill.bill_no}`);

  res.json({ message: "账单已取消" });
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
    sql += " WHERE billing_period = ?";
    params.push(`${year}-${String(month).padStart(2, "0")}`);
  }

  const summary = db.prepare(sql).get(...params);

  const byMerchant = db
    .prepare(
      `
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
  `,
    )
    .all();

  res.json({
    summary: {
      ...summary,
      collectionRate:
        summary.total_amount > 0
          ? Math.round(
              (summary.received_amount / summary.total_amount) * 10000,
            ) / 100
          : 0,
    },
    byMerchant,
  });
};

const createDispute = (req, res) => {
  const { id } = req.params;
  const { reason, expectedAmount } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "申诉理由不能为空" });
  }

  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }
  if (bill.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权对该账单发起申诉" });
  }
  if (!["issued", "overdue", "adjusted"].includes(bill.status)) {
    return res
      .status(400)
      .json({ error: `当前账单状态（${bill.status}）不允许申诉` });
  }

  const existing = db
    .prepare(
      `
    SELECT id FROM bill_disputes WHERE bill_id = ? AND status = 'pending'
  `,
    )
    .get(id);
  if (existing) {
    return res
      .status(400)
      .json({ error: "该账单已有待审核的申诉，请等待管理员处理" });
  }

  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO bill_disputes (bill_id, merchant_id, reason, expected_amount, status)
      VALUES (?, ?, ?, ?, 'pending')
    `,
      )
      .run(id, req.user.id, reason.trim(), expectedAmount ?? null);

    db.prepare(
      `
      UPDATE bills SET status = 'disputed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
    ).run(id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "create_bill_dispute",
      "billing",
      `商户对账单 ${bill.bill_no} 发起申诉`,
    );

    return result.lastInsertRowid;
  });

  try {
    const disputeId = tx();
    res.json({ message: "申诉已提交，等待管理员审核", disputeId });
  } catch (err) {
    res.status(500).json({ error: "提交申诉失败: " + err.message });
  }
};

const getAllDisputes = (req, res) => {
  const { status, billId } = req.query;
  let sql = `
    SELECT d.*,
           b.bill_no,
           b.billing_period,
           b.total_amount as bill_total_amount,
           b.status as bill_status,
           m.name as merchant_name,
           m.company_name as merchant_company,
           a.name as admin_name
    FROM bill_disputes d
    LEFT JOIN bills b ON d.bill_id = b.id
    LEFT JOIN users m ON d.merchant_id = m.id
    LEFT JOIN users a ON d.admin_id = a.id
    WHERE 1=1
  `;
  const params = [];
  if (status) {
    sql += " AND d.status = ?";
    params.push(status);
  }
  if (billId) {
    sql += " AND d.bill_id = ?";
    params.push(billId);
  }
  sql += " ORDER BY d.created_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
};

const getMyDisputes = (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT d.*,
           b.bill_no,
           b.billing_period,
           b.total_amount as bill_total_amount,
           b.status as bill_status,
           a.name as admin_name
    FROM bill_disputes d
    LEFT JOIN bills b ON d.bill_id = b.id
    LEFT JOIN users a ON d.admin_id = a.id
    WHERE d.merchant_id = ?
    ORDER BY d.created_at DESC
  `,
    )
    .all(req.user.id);
  res.json(rows);
};

const rejectDispute = (req, res) => {
  const { id } = req.params;
  const { adminResponse } = req.body;

  if (!adminResponse || !adminResponse.trim()) {
    return res.status(400).json({ error: "请填写驳回理由" });
  }

  const dispute = db
    .prepare("SELECT * FROM bill_disputes WHERE id = ?")
    .get(id);
  if (!dispute) {
    return res.status(404).json({ error: "申诉不存在" });
  }
  if (dispute.status !== "pending") {
    return res.status(400).json({ error: "该申诉已处理，无法再次操作" });
  }

  const bill = db
    .prepare("SELECT * FROM bills WHERE id = ?")
    .get(dispute.bill_id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE bill_disputes
      SET status = 'rejected', admin_id = ?, admin_response = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(req.user.id, adminResponse.trim(), id);

    const otherDisputes = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM bill_disputes
      WHERE bill_id = ? AND status = 'pending' AND id != ?
    `,
      )
      .get(dispute.bill_id, id).cnt;

    if (otherDisputes === 0) {
      const today = moment().format("YYYY-MM-DD");
      const wasOverdueByDueDate = bill.due_date && today > bill.due_date;
      const restoreStatus = wasOverdueByDueDate ? "overdue" : "issued";
      db.prepare(
        `
        UPDATE bills SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `,
      ).run(restoreStatus, dispute.bill_id);
    }

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "reject_bill_dispute",
      "billing",
      `驳回账单 ${bill.bill_no} 的申诉 #${id}`,
    );
  });

  try {
    tx();
    res.json({ message: "申诉已驳回，账单状态已恢复" });
  } catch (err) {
    res.status(500).json({ error: "驳回申诉失败: " + err.message });
  }
};

const approveDisputeWithAdjustment = (req, res) => {
  const { id } = req.params;
  const { adminResponse, adjustmentAmount, description } = req.body;

  const adjAmount = Number(adjustmentAmount);
  if (!Number.isFinite(adjAmount) || adjAmount === 0) {
    return res
      .status(400)
      .json({ error: "调整金额必须是非零数值（红字调整通常为负数）" });
  }
  if (!adminResponse || !adminResponse.trim()) {
    return res.status(400).json({ error: "请填写审核意见" });
  }

  const dispute = db
    .prepare("SELECT * FROM bill_disputes WHERE id = ?")
    .get(id);
  if (!dispute) {
    return res.status(404).json({ error: "申诉不存在" });
  }
  if (dispute.status !== "pending") {
    return res.status(400).json({ error: "该申诉已处理" });
  }

  const bill = db
    .prepare("SELECT * FROM bills WHERE id = ?")
    .get(dispute.bill_id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  const tx = db.transaction(() => {
    const desc =
      (description && description.trim()) || `红字调整 - 申诉 #${id} 处理结果`;
    const itemResult = db
      .prepare(
        `
      INSERT INTO bill_items (
        bill_id, billing_method, unit_price, quantity, unit, days, amount, description, item_type
      ) VALUES (?, 'adjustment', ?, 1, '次', 0, ?, ?, 'adjustment')
    `,
      )
      .run(dispute.bill_id, adjAmount, adjAmount, desc);

    const newTotal = Math.round((bill.total_amount + adjAmount) * 100) / 100;

    db.prepare(
      `
      UPDATE bills
      SET total_amount = ?, status = 'adjusted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(newTotal, dispute.bill_id);

    db.prepare(
      `
      UPDATE bill_disputes
      SET status = 'approved', admin_id = ?, admin_response = ?,
          adjustment_amount = ?, adjustment_item_id = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(
      req.user.id,
      adminResponse.trim(),
      adjAmount,
      itemResult.lastInsertRowid,
      id,
    );

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "approve_bill_dispute",
      "billing",
      `批准账单 ${bill.bill_no} 的申诉 #${id}，红字调整 ¥${adjAmount}，新总额 ¥${newTotal}`,
    );

    return { newTotal, adjustmentItemId: itemResult.lastInsertRowid };
  });

  try {
    const result = tx();
    res.json({
      message: "已生成红字调整明细，账单状态已更新为已调整",
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: "处理申诉失败: " + err.message });
  }
};

module.exports = {
  getAllBills,
  getBillById,
  getMyBills,
  generateMonthlyBills,
  markBillPaid,
  markBillOverdue,
  cancelBill,
  getBillingSummary,
  createDispute,
  getAllDisputes,
  getMyDisputes,
  rejectDispute,
  approveDisputeWithAdjustment,
};
