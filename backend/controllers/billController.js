const db = require("../config/database");
const moment = require("moment");

const BILL_STATUSES = [
  "pending",
  "issued",
  "paid",
  "overdue",
  "cancelled",
  "disputed",
  "dispute_rejected",
  "adjusted",
];

const DISPUTE_STATUSES = ["pending", "rejected", "adjusted"];

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

const calculateDailyUsage = (leaseId, periodStart, periodEnd) => {
  const dailyUsages = db
    .prepare(
      `
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
  `,
    )
    .all(leaseId, periodStart, periodEnd);

  const initialStock = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity), 0) as initial
    FROM inventory_batches
    WHERE lease_id = ? AND inbound_date < ?
  `,
    )
    .get(leaseId, periodStart).initial;

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

const parsePriceTiers = (lease) => {
  if (!lease.price_tiers) return null;
  try {
    const tiers = JSON.parse(lease.price_tiers);
    if (Array.isArray(tiers) && tiers.length > 0) {
      return tiers.sort((a, b) => (a.min_usage || 0) - (b.min_usage || 0));
    }
  } catch (e) {
    return null;
  }
  return null;
};

const calculateTieredAmount = (averageUsage, days, tiers) => {
  if (!tiers || tiers.length === 0 || averageUsage <= 0) {
    return [];
  }

  const tierDetails = [];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const minUsage = tier.min_usage || 0;
    const maxUsage = tier.max_usage || null;
    const unitPrice = tier.unit_price;

    if (averageUsage <= minUsage) {
      break;
    }

    let tierQuantity;
    if (maxUsage === null) {
      tierQuantity = averageUsage - minUsage;
    } else {
      tierQuantity = Math.min(maxUsage, averageUsage) - minUsage;
    }

    if (tierQuantity > 0) {
      const tierAmount =
        Math.round(unitPrice * tierQuantity * days * 100) / 100;
      tierDetails.push({
        min_usage: minUsage,
        max_usage: maxUsage,
        unit_price: unitPrice,
        quantity: Math.round(tierQuantity * 100) / 100,
        days,
        amount: tierAmount,
        description: maxUsage
          ? `${minUsage}-${maxUsage}档 (¥${unitPrice}/单位/天)`
          : `${minUsage}以上档 (¥${unitPrice}/单位/天)`,
      });
    }
  }

  return tierDetails;
};

const calculateLeaseAmount = (lease, periodStart, periodEnd) => {
  const days = calculateLeaseUsageDays(lease, periodStart, periodEnd);
  if (days <= 0) return { amount: 0, days: 0, quantity: 0, tierItems: [] };

  const usage = calculateDailyUsage(lease.id, periodStart, periodEnd);
  let amount = 0;
  let quantity = 0;
  let tierItems = [];

  switch (lease.billing_method) {
    case "daily":
      quantity = lease.agreed_capacity;
      amount = lease.unit_price * days * lease.agreed_capacity;
      break;
    case "monthly":
      const monthDays = moment(periodEnd).daysInMonth();
      quantity = lease.agreed_capacity;
      amount = lease.unit_price * (days / monthDays) * lease.agreed_capacity;
      break;
    case "per_pallet":
    case "per_volume":
      quantity = usage.averageUsage;
      const tiers = parsePriceTiers(lease);
      if (tiers) {
        tierItems = calculateTieredAmount(usage.averageUsage, days, tiers);
        amount = tierItems.reduce((sum, t) => sum + t.amount, 0);
      } else {
        amount = lease.unit_price * usage.averageUsage * days;
      }
      break;
    default:
      break;
  }

  return {
    amount: Math.round(amount * 100) / 100,
    days,
    quantity: Math.round(quantity * 100) / 100,
    averageUsage: Math.round(usage.averageUsage * 100) / 100,
    tierItems,
  };
};

const getAllBills = (req, res) => {
  const { merchantId, status, billingPeriod, startDate, endDate } = req.query;

  let sql = `
    SELECT b.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           d.reason as dispute_reason,
           d.status as dispute_status,
           d.created_at as dispute_created_at,
           d.resolved_at as dispute_resolved_at,
           COUNT(bi.id) as item_count
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes d ON b.dispute_id = d.id
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
           u.email as merchant_email,
           d.reason as dispute_reason,
           d.status as dispute_status,
           d.admin_note as dispute_admin_note,
           d.adjustment_amount as dispute_adjustment_amount,
           d.adjustment_reason as dispute_adjustment_reason,
           d.created_at as dispute_created_at,
           d.resolved_at as dispute_resolved_at,
           ru.name as resolved_by_name
    FROM bills b
    LEFT JOIN users u ON b.merchant_id = u.id
    LEFT JOIN bill_disputes d ON b.dispute_id = d.id
    LEFT JOIN users ru ON d.resolved_by = ru.id
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

  res.json({ ...bill, items });
};

const getMyBills = (req, res) => {
  const { status, billingPeriod } = req.query;

  let sql = `
    SELECT b.*,
           d.reason as dispute_reason,
           d.status as dispute_status,
           COUNT(bi.id) as item_count
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    LEFT JOIN bill_disputes d ON b.dispute_id = d.id
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
  const dueDate = moment(periodEnd).add(15, "days").format("YYYY-MM-DD");

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
           loc.warehouse_id as warehouse_id,
           gc.name as category_name,
           gc.unit as category_unit
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
      const disputeIds = db
        .prepare(
          `
        SELECT dispute_id FROM bills WHERE billing_period = ? AND dispute_id IS NOT NULL
      `,
        )
        .all(period)
        .map((r) => r.dispute_id);

      db.prepare(
        `
        DELETE FROM bill_items 
        WHERE bill_id IN (SELECT id FROM bills WHERE billing_period = ?)
      `,
      ).run(period);
      db.prepare(`DELETE FROM bills WHERE billing_period = ?`).run(period);

      if (disputeIds.length > 0) {
        const placeholders = disputeIds.map(() => "?").join(",");
        db.prepare(
          `DELETE FROM bill_disputes WHERE id IN (${placeholders})`,
        ).run(...disputeIds);
      }
    }

    const results = [];
    const insertItemStmt = db.prepare(`
      INSERT INTO bill_items (
        bill_id, lease_id, location_id, category_id, billing_method,
        unit_price, quantity, unit, days, amount, description, tier_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [merchantId, leases] of Object.entries(leasesByMerchant)) {
      const billNo = generateBillNo(merchantId, period);
      let totalAmount = 0;
      const primaryWarehouseId = leases[0].warehouse_id || 1;

      const billResult = db
        .prepare(
          `
        INSERT INTO bills (bill_no, merchant_id, warehouse_id, billing_period, billing_start_date, billing_end_date, due_date, total_amount, status, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?)
      `,
        )
        .run(
          billNo,
          merchantId,
          primaryWarehouseId,
          period,
          periodStart,
          periodEnd,
          dueDate,
          `${period} 月仓储费账单`,
        );

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

          if (calculation.tierItems && calculation.tierItems.length > 0) {
            for (const tier of calculation.tierItems) {
              const desc = `${lease.location_code} - ${lease.category_name} ${methodLabel}阶梯计费 ${tier.description}`;
              insertItemStmt.run(
                billId,
                lease.id,
                lease.location_id,
                lease.category_id,
                lease.billing_method,
                tier.unit_price,
                tier.quantity,
                lease.category_unit || "单位",
                tier.days,
                tier.amount,
                desc,
                JSON.stringify({
                  min_usage: tier.min_usage,
                  max_usage: tier.max_usage,
                  is_tier: true,
                }),
              );
            }
            totalAmount += calculation.amount;
          } else {
            const description = `${lease.location_code} - ${lease.category_name} ${methodLabel}计费`;
            insertItemStmt.run(
              billId,
              lease.id,
              lease.location_id,
              lease.category_id,
              lease.billing_method,
              lease.unit_price,
              calculation.quantity,
              lease.category_unit || "单位",
              calculation.days,
              calculation.amount,
              description,
              null,
            );
            totalAmount += calculation.amount;
          }
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

  const allowedStatuses = ["issued", "overdue", "dispute_rejected", "adjusted"];
  if (!allowedStatuses.includes(bill.status)) {
    return res.status(400).json({ error: "账单状态不允许标记为已支付" });
  }

  db.prepare(
    `
    UPDATE bills SET status = 'paid', paid_at = CURRENT_TIMESTAMP, paid_amount = total_amount, updated_at = CURRENT_TIMESTAMP
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

  if (bill.status !== "issued" && bill.status !== "dispute_rejected") {
    return res
      .status(400)
      .json({ error: "只有已出单或申诉被驳回的账单可以标记为逾期" });
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

  const disallowedStatuses = ["paid", "disputed", "adjusted"];
  if (disallowedStatuses.includes(bill.status)) {
    return res.status(400).json({ error: "当前状态的账单无法取消" });
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

const createDispute = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "申诉理由不能为空" });
  }

  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  if (!bill) {
    return res.status(404).json({ error: "账单不存在" });
  }

  if (req.user.role === "merchant" && bill.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权申诉此账单" });
  }

  const allowedStatuses = ["issued", "overdue", "dispute_rejected"];
  if (!allowedStatuses.includes(bill.status)) {
    return res.status(400).json({ error: "当前账单状态不允许发起申诉" });
  }

  const existingDispute = db
    .prepare(
      `
    SELECT * FROM bill_disputes WHERE bill_id = ? AND status = 'pending'
  `,
    )
    .get(id);
  if (existingDispute) {
    return res.status(400).json({ error: "该账单已有待处理的申诉" });
  }

  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO bill_disputes (bill_id, merchant_id, reason)
      VALUES (?, ?, ?)
    `,
      )
      .run(id, bill.merchant_id, reason.trim());

    const disputeId = result.lastInsertRowid;

    db.prepare(
      `
      UPDATE bills SET status = 'disputed', dispute_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(disputeId, id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "create_bill_dispute",
      "billing",
      `对账单 ${bill.bill_no} 发起申诉，理由: ${reason.trim()}`,
    );

    return disputeId;
  });

  try {
    const disputeId = tx();
    res.json({ message: "申诉已提交，等待管理员审核", disputeId });
  } catch (err) {
    res.status(500).json({ error: "申诉提交失败: " + err.message });
  }
};

const getDisputes = (req, res) => {
  const { billId, status, merchantId } = req.query;

  let sql = `
    SELECT d.*,
           b.bill_no,
           b.billing_period,
           b.total_amount as bill_total_amount,
           b.status as bill_status,
           u.name as merchant_name,
           u.company_name as merchant_company,
           ru.name as resolved_by_name
    FROM bill_disputes d
    LEFT JOIN bills b ON d.bill_id = b.id
    LEFT JOIN users u ON d.merchant_id = u.id
    LEFT JOIN users ru ON d.resolved_by = ru.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND d.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND d.merchant_id = ?";
    params.push(merchantId);
  }
  if (billId) {
    sql += " AND d.bill_id = ?";
    params.push(billId);
  }
  if (status) {
    sql += " AND d.status = ?";
    params.push(status);
  }

  sql += " ORDER BY d.created_at DESC";

  const disputes = db.prepare(sql).all(...params);
  res.json(disputes);
};

const getDisputeById = (req, res) => {
  const { id } = req.params;

  const dispute = db
    .prepare(
      `
    SELECT d.*,
           b.bill_no,
           b.billing_period,
           b.total_amount as bill_total_amount,
           b.status as bill_status,
           b.adjusted_amount,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           ru.name as resolved_by_name
    FROM bill_disputes d
    LEFT JOIN bills b ON d.bill_id = b.id
    LEFT JOIN users u ON d.merchant_id = u.id
    LEFT JOIN users ru ON d.resolved_by = ru.id
    WHERE d.id = ?
  `,
    )
    .get(id);

  if (!dispute) {
    return res.status(404).json({ error: "申诉记录不存在" });
  }

  if (req.user.role === "merchant" && dispute.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此申诉" });
  }

  const billItems = db
    .prepare(
      `
    SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id
  `,
    )
    .all(dispute.bill_id);

  res.json({ ...dispute, bill_items: billItems });
};

const rejectDispute = (req, res) => {
  const { id } = req.params;
  const { adminNote } = req.body;

  const dispute = db
    .prepare("SELECT * FROM bill_disputes WHERE id = ?")
    .get(id);
  if (!dispute) {
    return res.status(404).json({ error: "申诉记录不存在" });
  }

  if (dispute.status !== "pending") {
    return res.status(400).json({ error: "该申诉已处理" });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE bill_disputes 
      SET status = 'rejected', admin_note = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
      WHERE id = ?
    `,
    ).run(adminNote || "申诉理由不充分，予以驳回。", req.user.id, id);

    db.prepare(
      `
      UPDATE bills SET status = 'dispute_rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(dispute.bill_id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "reject_bill_dispute",
      "billing",
      `驳回账单申诉 #${id}，备注: ${adminNote || "无"}`,
    );
  });

  try {
    tx();
    res.json({ message: "申诉已驳回" });
  } catch (err) {
    res.status(500).json({ error: "操作失败: " + err.message });
  }
};

const adjustDispute = (req, res) => {
  const { id } = req.params;
  const { adjustmentAmount, adjustmentReason } = req.body;

  if (
    adjustmentAmount === undefined ||
    adjustmentAmount === null ||
    isNaN(Number(adjustmentAmount))
  ) {
    return res.status(400).json({ error: "调整金额为必填项" });
  }

  const adjAmount = Number(adjustmentAmount);
  if (adjAmount <= 0) {
    return res.status(400).json({ error: "调整金额必须大于0（为减免金额）" });
  }

  const dispute = db
    .prepare("SELECT * FROM bill_disputes WHERE id = ?")
    .get(id);
  if (!dispute) {
    return res.status(404).json({ error: "申诉记录不存在" });
  }

  if (dispute.status !== "pending") {
    return res.status(400).json({ error: "该申诉已处理" });
  }

  const bill = db
    .prepare("SELECT * FROM bills WHERE id = ?")
    .get(dispute.bill_id);
  if (!bill) {
    return res.status(404).json({ error: "关联账单不存在" });
  }

  if (adjAmount > bill.total_amount) {
    return res.status(400).json({ error: "调整金额不能超过账单总金额" });
  }

  const newTotal = Math.round((bill.total_amount - adjAmount) * 100) / 100;
  const reason = adjustmentReason || `争议调整，减免 ¥${adjAmount.toFixed(2)}`;

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO bill_items (bill_id, lease_id, location_id, category_id, billing_method,
        unit_price, quantity, unit, days, amount, description, tier_info)
      VALUES (?, NULL, NULL, NULL, 'adjustment', 0, 0, '项', 0, ?, ?, NULL)
    `,
    ).run(dispute.bill_id, -adjAmount, `【红字调整】${reason}`);

    db.prepare(
      `
      UPDATE bill_disputes 
      SET status = 'adjusted', adjustment_amount = ?, adjustment_reason = ?,
          resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
      WHERE id = ?
    `,
    ).run(adjAmount, reason, req.user.id, id);

    db.prepare(
      `
      UPDATE bills SET status = 'adjusted', total_amount = ?, adjusted_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(newTotal, adjAmount, dispute.bill_id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "adjust_bill_dispute",
      "billing",
      `调整账单 ${bill.bill_no}，减免 ¥${adjAmount.toFixed(2)}，原因: ${reason}`,
    );
  });

  try {
    tx();
    res.json({
      message: "账单已调整",
      newTotal,
      adjustmentAmount: adjAmount,
    });
  } catch (err) {
    res.status(500).json({ error: "调整失败: " + err.message });
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
      SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed_bills,
      SUM(CASE WHEN status = 'dispute_rejected' THEN 1 ELSE 0 END) as dispute_rejected_bills,
      SUM(CASE WHEN status = 'adjusted' THEN 1 ELSE 0 END) as adjusted_bills,
      SUM(CASE WHEN status IN ('issued', 'overdue', 'dispute_rejected') THEN total_amount ELSE 0 END) as receivable_amount,
      SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as received_amount,
      SUM(CASE WHEN status = 'adjusted' THEN total_amount ELSE 0 END) as adjusted_receivable,
      SUM(total_amount) as total_amount
    FROM bills
  `;
  const params = [];

  if (year && month) {
    sql += " WHERE billing_period = ?";
    params.push(`${year}-${String(month).padStart(2, "0")}`);
  }

  const summary = db.prepare(sql).get(...params);

  const pendingDisputes = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM bill_disputes WHERE status = 'pending'
  `,
    )
    .get().count;

  const byMerchant = db
    .prepare(
      `
    SELECT 
      u.id,
      u.name,
      u.company_name,
      COUNT(b.id) as bill_count,
      SUM(CASE WHEN b.status = 'paid' THEN b.total_amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN b.status IN ('issued', 'overdue', 'dispute_rejected', 'adjusted') THEN b.total_amount ELSE 0 END) as unpaid_amount,
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
      pending_disputes: pendingDisputes,
      receivable_amount:
        Math.round(
          (summary.receivable_amount + summary.adjusted_receivable) * 100,
        ) / 100,
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

const savePriceTiers = (req, res) => {
  const { id } = req.params;
  const { priceTiers } = req.body;

  const lease = db.prepare("SELECT * FROM leases WHERE id = ?").get(id);
  if (!lease) {
    return res.status(404).json({ error: "租约不存在" });
  }

  if (req.user.role === "merchant" && lease.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权修改此租约" });
  }

  if (priceTiers && !Array.isArray(priceTiers)) {
    return res.status(400).json({ error: "阶梯价格格式错误" });
  }

  let tiersJson = null;
  if (priceTiers && priceTiers.length > 0) {
    const sorted = priceTiers
      .filter((t) => t.min_usage !== undefined && t.unit_price !== undefined)
      .sort((a, b) => (a.min_usage || 0) - (b.min_usage || 0));

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].unit_price <= 0) {
        return res.status(400).json({ error: "阶梯单价必须大于0" });
      }
      if (i > 0 && sorted[i].min_usage <= sorted[i - 1].min_usage) {
        return res.status(400).json({ error: "阶梯起始用量必须递增" });
      }
    }

    tiersJson = JSON.stringify(sorted);
  }

  db.prepare(
    `
    UPDATE leases SET price_tiers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `,
  ).run(tiersJson, id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(req.user.id, "update_price_tiers", "leases", `更新租约 ${id} 阶梯价格`);

  res.json({
    message: "阶梯价格已保存",
    priceTiers: tiersJson ? JSON.parse(tiersJson) : null,
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
  getBillingSummary,
  createDispute,
  getDisputes,
  getDisputeById,
  rejectDispute,
  adjustDispute,
  calculateLeaseAmount,
  parsePriceTiers,
  savePriceTiers,
};
