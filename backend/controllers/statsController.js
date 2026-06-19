const db = require("../config/database");
const moment = require("moment");

const getOverviewStats = (req, res) => {
  const warehouseStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_warehouses,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_warehouses
    FROM warehouses
  `,
    )
    .get();

  const locationStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_locations,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_locations,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_locations,
      SUM(capacity) as total_capacity,
      SUM(used_capacity) as used_capacity
    FROM locations
  `,
    )
    .get();

  const inventoryStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_batches,
      SUM(quantity) as total_quantity,
      SUM(CASE WHEN status = 'normal' THEN quantity ELSE 0 END) as normal_quantity,
      SUM(CASE WHEN status = 'near_expiry' THEN quantity ELSE 0 END) as near_expiry_quantity,
      SUM(CASE WHEN status = 'expired' THEN quantity ELSE 0 END) as expired_quantity,
      SUM(CASE WHEN status = 'slow_moving' THEN quantity ELSE 0 END) as slow_moving_quantity
    FROM inventory_batches
    WHERE quantity > 0
  `,
    )
    .get();

  const orderStats = db
    .prepare(
      `
    SELECT 
      (SELECT COUNT(*) FROM inbound_orders WHERE status = 'pending') as pending_inbound,
      (SELECT COUNT(*) FROM inbound_orders WHERE status IN ('checking', 'putaway')) as processing_inbound,
      (SELECT COUNT(*) FROM outbound_orders WHERE status = 'pending') as pending_outbound,
      (SELECT COUNT(*) FROM outbound_orders WHERE status IN ('picking', 'checking')) as processing_outbound,
      (SELECT COUNT(*) FROM leases WHERE status = 'pending') as pending_leases
  `,
    )
    .get();

  const merchantStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_merchants,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_merchants
    FROM users
    WHERE role = 'merchant'
  `,
    )
    .get();

  const utilizationRate =
    locationStats.total_capacity > 0
      ? Math.round(
          (locationStats.used_capacity / locationStats.total_capacity) *
            100 *
            100,
        ) / 100
      : 0;

  const locationOccupancyRate =
    locationStats.total_locations > 0
      ? Math.round(
          (locationStats.occupied_locations / locationStats.total_locations) *
            100 *
            100,
        ) / 100
      : 0;

  const slowMovingRatio =
    inventoryStats.total_quantity > 0
      ? Math.round(
          (inventoryStats.slow_moving_quantity /
            inventoryStats.total_quantity) *
            100 *
            100,
        ) / 100
      : 0;

  res.json({
    warehouses: warehouseStats,
    locations: {
      ...locationStats,
      utilizationRate,
      locationOccupancyRate,
    },
    inventory: {
      ...inventoryStats,
      slowMovingRatio,
    },
    orders: orderStats,
    merchants: merchantStats,
  });
};

const getWarehouseUtilization = (req, res) => {
  const { days } = req.query;
  const daysNum = days || 30;

  const warehouses = db
    .prepare(
      `
    SELECT w.id, w.code, w.name, w.temperature_zone,
           COUNT(l.id) as total_locations,
           SUM(l.capacity) as total_capacity,
           SUM(l.used_capacity) as used_capacity,
           SUM(CASE WHEN l.status = 'occupied' THEN 1 ELSE 0 END) as occupied_locations
    FROM warehouses w
    LEFT JOIN locations l ON w.id = l.warehouse_id
    WHERE w.status = 'active'
    GROUP BY w.id
  `,
    )
    .all();

  warehouses.forEach((w) => {
    w.capacityUtilization =
      w.total_capacity > 0
        ? Math.round((w.used_capacity / w.total_capacity) * 100 * 100) / 100
        : 0;
    w.locationUtilization =
      w.total_locations > 0
        ? Math.round((w.occupied_locations / w.total_locations) * 100 * 100) /
          100
        : 0;

    const inboundCount = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM inbound_orders 
      WHERE warehouse_id = ? AND status = 'completed' AND completed_at >= datetime('now', ?)
    `,
      )
      .get(w.id, `-${daysNum} days`).count;

    const outboundCount = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM outbound_orders 
      WHERE warehouse_id = ? AND status = 'completed' AND completed_at >= datetime('now', ?)
    `,
      )
      .get(w.id, `-${daysNum} days`).count;

    w.recentInbound = inboundCount;
    w.recentOutbound = outboundCount;
  });

  res.json(warehouses);
};

const getInventoryTurnover = (req, res) => {
  const { days } = req.query;
  const daysNum = days || 90;

  const endDate = moment();
  const startDate = moment().subtract(daysNum, "days");

  const outboundQty = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM transactions 
    WHERE txn_type = 'outbound' AND txn_date >= ?
  `,
    )
    .get(startDate.format("YYYY-MM-DD")).total;

  const avgInventory = db
    .prepare(
      `
    SELECT AVG(daily_total) as avg_stock
    FROM (
      SELECT date(txn_date) as txn_day,
             (SELECT COALESCE(SUM(quantity), 0) FROM inventory_batches WHERE created_at <= datetime(txn_date, '+1 day')) as daily_total
      FROM transactions
      WHERE txn_date >= ?
      GROUP BY txn_day
    )
  `,
    )
    .get(startDate.format("YYYY-MM-DD")).avg_stock;

  const currentInventory = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_batches WHERE quantity > 0
  `,
    )
    .get().total;

  const avgStock = avgInventory || currentInventory;
  const turnoverRate = avgStock > 0 ? outboundQty / avgStock : 0;
  const turnoverDays = turnoverRate > 0 ? daysNum / turnoverRate : null;

  const categoryTurnover = db
    .prepare(
      `
    SELECT 
      gc.id,
      gc.code,
      gc.name,
      gc.unit,
      COALESCE(SUM(CASE WHEN t.txn_type = 'outbound' THEN t.quantity END), 0) as outbound_qty,
      COALESCE((SELECT SUM(quantity) FROM inventory_batches WHERE category_id = gc.id AND quantity > 0), 0) as current_stock
    FROM goods_categories gc
    LEFT JOIN transactions t ON gc.id = t.category_id AND t.txn_date >= ?
    GROUP BY gc.id
  `,
    )
    .all(startDate.format("YYYY-MM-DD"));

  categoryTurnover.forEach((c) => {
    c.turnoverRate =
      c.current_stock > 0
        ? c.outbound_qty / c.current_stock / (daysNum / 30)
        : 0;
    c.turnoverDays = c.turnoverRate > 0 ? 30 / c.turnoverRate : null;
  });

  res.json({
    overall: {
      periodDays: daysNum,
      outboundQuantity: outboundQty,
      averageInventory: Math.round(avgStock * 100) / 100,
      currentInventory,
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      turnoverDays: turnoverDays ? Math.round(turnoverDays * 10) / 10 : null,
    },
    byCategory: categoryTurnover,
  });
};

const getTimelinessStats = (req, res) => {
  const { days } = req.query;
  const daysNum = days || 30;

  const inboundStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
      AVG(CASE 
        WHEN completed_at IS NOT NULL 
        THEN julianday(completed_at) - julianday(created_at) 
        ELSE NULL 
      END) as avg_processing_days
    FROM inbound_orders
    WHERE created_at >= datetime('now', ?)
  `,
    )
    .get(`-${daysNum} days`);

  const outboundStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
      AVG(CASE 
        WHEN completed_at IS NOT NULL 
        THEN julianday(completed_at) - julianday(created_at) 
        ELSE NULL 
      END) as avg_processing_days
    FROM outbound_orders
    WHERE created_at >= datetime('now', ?)
  `,
    )
    .get(`-${daysNum} days`);

  const inboundTimeliness =
    inboundStats.total > 0
      ? Math.round((inboundStats.completed / inboundStats.total) * 100 * 100) /
        100
      : 0;

  const outboundTimeliness =
    outboundStats.total > 0
      ? Math.round(
          (outboundStats.completed / outboundStats.total) * 100 * 100,
        ) / 100
      : 0;

  res.json({
    periodDays: daysNum,
    inbound: {
      ...inboundStats,
      timelinessRate: inboundTimeliness,
      avgProcessingDays: inboundStats.avg_processing_days
        ? Math.round(inboundStats.avg_processing_days * 10) / 10
        : 0,
    },
    outbound: {
      ...outboundStats,
      timelinessRate: outboundTimeliness,
      avgProcessingDays: outboundStats.avg_processing_days
        ? Math.round(outboundStats.avg_processing_days * 10) / 10
        : 0,
    },
  });
};

const getSlowMovingRatio = (req, res) => {
  const { days } = req.query;
  const daysThreshold = days || 90;

  const totalStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_batches,
      COUNT(DISTINCT merchant_id) as affected_merchants,
      SUM(quantity) as total_quantity
    FROM inventory_batches
    WHERE quantity > 0
  `,
    )
    .get();

  const slowMovingStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as slow_batches,
      COUNT(DISTINCT merchant_id) as slow_merchants,
      SUM(quantity) as slow_quantity
    FROM inventory_batches
    WHERE quantity > 0
      AND (
        (last_outbound_date IS NULL AND julianday('now') - julianday(inbound_date) >= ?)
        OR (last_outbound_date IS NOT NULL AND julianday('now') - julianday(last_outbound_date) >= ?)
      )
  `,
    )
    .all(daysThreshold, daysThreshold)[0] || {
    slow_batches: 0,
    slow_merchants: 0,
    slow_quantity: 0,
  };

  const byMerchant = db
    .prepare(
      `
    SELECT 
      u.id,
      u.name,
      u.company_name,
      COUNT(ib.id) as slow_batches,
      SUM(ib.quantity) as slow_quantity,
      gc.name as top_category
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.quantity > 0
      AND (
        (ib.last_outbound_date IS NULL AND julianday('now') - julianday(ib.inbound_date) >= ?)
        OR (ib.last_outbound_date IS NOT NULL AND julianday('now') - julianday(ib.last_outbound_date) >= ?)
      )
    GROUP BY u.id
    ORDER BY slow_quantity DESC
  `,
    )
    .all(daysThreshold, daysThreshold);

  const batchRatio =
    totalStats.total_batches > 0
      ? Math.round(
          (slowMovingStats.slow_batches / totalStats.total_batches) * 100 * 100,
        ) / 100
      : 0;

  const quantityRatio =
    totalStats.total_quantity > 0
      ? Math.round(
          (slowMovingStats.slow_quantity / totalStats.total_quantity) *
            100 *
            100,
        ) / 100
      : 0;

  res.json({
    daysThreshold,
    total: totalStats,
    slowMoving: slowMovingStats,
    batchRatio,
    quantityRatio,
    byMerchant,
  });
};

const getTransactionStats = (req, res) => {
  const { days } = req.query;
  const daysNum = days || 30;

  const dailyStats = db
    .prepare(
      `
    SELECT 
      date(txn_date) as txn_date,
      txn_type,
      COUNT(*) as txn_count,
      SUM(quantity) as total_quantity
    FROM transactions
    WHERE txn_date >= datetime('now', ?)
    GROUP BY date(txn_date), txn_type
    ORDER BY txn_date DESC
  `,
    )
    .all(`-${daysNum} days`);

  const summary = db
    .prepare(
      `
    SELECT 
      txn_type,
      COUNT(*) as total_count,
      SUM(quantity) as total_quantity
    FROM transactions
    WHERE txn_date >= datetime('now', ?)
    GROUP BY txn_type
  `,
    )
    .all(`-${daysNum} days`);

  const byMerchant = db
    .prepare(
      `
    SELECT 
      u.id,
      u.name,
      u.company_name,
      COUNT(t.id) as txn_count,
      SUM(CASE WHEN t.txn_type = 'inbound' THEN t.quantity ELSE 0 END) as inbound_qty,
      SUM(CASE WHEN t.txn_type = 'outbound' THEN t.quantity ELSE 0 END) as outbound_qty
    FROM transactions t
    LEFT JOIN users u ON t.merchant_id = u.id
    WHERE t.txn_date >= datetime('now', ?) AND t.merchant_id IS NOT NULL
    GROUP BY u.id
    ORDER BY txn_count DESC
    LIMIT 10
  `,
    )
    .all(`-${daysNum} days`);

  res.json({
    periodDays: daysNum,
    summary,
    dailyStats,
    topMerchants: byMerchant,
  });
};

const getMerchantOverview = (req, res) => {
  const merchantId = req.user.id;

  const inventoryStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_batches,
      SUM(quantity) as total_quantity,
      SUM(CASE WHEN status = 'near_expiry' THEN quantity ELSE 0 END) as near_expiry_qty,
      SUM(CASE WHEN status = 'slow_moving' THEN quantity ELSE 0 END) as slow_moving_qty,
      COUNT(DISTINCT category_id) as category_count
    FROM inventory_batches
    WHERE merchant_id = ? AND quantity > 0
  `,
    )
    .get(merchantId);

  const leaseStats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_leases,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_leases,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_leases
    FROM leases
    WHERE merchant_id = ?
  `,
    )
    .get(merchantId);

  const orderStats = db
    .prepare(
      `
    SELECT 
      (SELECT COUNT(*) FROM inbound_orders WHERE merchant_id = ? AND status != 'completed') as pending_inbound,
      (SELECT COUNT(*) FROM inbound_orders WHERE merchant_id = ? AND status = 'completed') as completed_inbound,
      (SELECT COUNT(*) FROM outbound_orders WHERE merchant_id = ? AND status != 'completed') as pending_outbound,
      (SELECT COUNT(*) FROM outbound_orders WHERE merchant_id = ? AND status = 'completed') as completed_outbound
    FROM leases
    LIMIT 1
  `,
    )
    .get(merchantId, merchantId, merchantId, merchantId);

  const recentTransactions = db
    .prepare(
      `
    SELECT t.*, 
           gc.name as category_name,
           w.name as warehouse_name
    FROM transactions t
    LEFT JOIN goods_categories gc ON t.category_id = gc.id
    LEFT JOIN warehouses w ON t.warehouse_id = w.id
    WHERE t.merchant_id = ?
    ORDER BY t.txn_date DESC
    LIMIT 10
  `,
    )
    .all(merchantId);

  res.json({
    inventory: inventoryStats,
    leases: leaseStats,
    orders: orderStats,
    recentTransactions,
  });
};

const getWarehouseTurnover = (req, res) => {
  const { warehouseId, days } = req.query;
  const daysNum = days || 90;
  const endDate = moment();
  const startDate = moment().subtract(daysNum, "days");

  let sql = `
    SELECT 
      w.id,
      w.code,
      w.name,
      w.temperature_zone,
      COALESCE(SUM(CASE WHEN t.txn_type = 'inbound' AND t.quantity > 0 THEN t.quantity END), 0) as inbound_qty,
      COALESCE(SUM(CASE WHEN t.txn_type = 'outbound' THEN ABS(t.quantity) END), 0) as outbound_qty,
      COALESCE((
        SELECT SUM(ib.quantity) 
        FROM inventory_batches ib
        LEFT JOIN locations l ON ib.location_id = l.id
        WHERE l.warehouse_id = w.id AND ib.quantity > 0
      ), 0) as current_inventory
    FROM warehouses w
    LEFT JOIN locations l ON w.id = l.warehouse_id
    LEFT JOIN transactions t ON l.id = t.location_id AND t.txn_date >= ?
    WHERE w.status = 'active'
  `;
  const params = [startDate.format("YYYY-MM-DD")];

  if (warehouseId) {
    sql += " AND w.id = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY w.id ORDER BY w.code";

  const warehouses = db.prepare(sql).all(...params);

  warehouses.forEach((w) => {
    w.avgInventory = w.current_inventory > 0 ? w.current_inventory : 0;
    w.turnoverRate =
      w.avgInventory > 0 ? w.outbound_qty / w.avgInventory / (daysNum / 30) : 0;
    w.turnoverDays = w.turnoverRate > 0 ? 30 / w.turnoverRate : null;

    w.turnoverRate = Math.round(w.turnoverRate * 100) / 100;
    w.turnoverDays = w.turnoverDays
      ? Math.round(w.turnoverDays * 10) / 10
      : null;
  });

  res.json({
    periodDays: daysNum,
    warehouses,
  });
};

const getWarehouseIncome = (req, res) => {
  const { warehouseId, year, month } = req.query;

  let periodFilter = "1=1";
  const params = [];

  if (year && month) {
    periodFilter = "b.billing_period = ?";
    params.push(`${year}-${String(month).padStart(2, "0")}`);
  } else if (year) {
    periodFilter = "b.billing_period LIKE ?";
    params.push(`${year}-%`);
  }

  let sql = `
    SELECT 
      w.id,
      w.code,
      w.name,
      w.temperature_zone,
      COALESCE(SUM(bi.amount), 0) as total_income,
      COALESCE(SUM(CASE WHEN b.status = 'paid' THEN bi.amount END), 0) as received_income,
      COALESCE(SUM(CASE WHEN b.status IN ('issued', 'overdue') THEN bi.amount END), 0) as receivable_income,
      COUNT(DISTINCT b.id) as bill_count,
      COUNT(DISTINCT b.merchant_id) as merchant_count
    FROM warehouses w
    LEFT JOIN locations l ON w.id = l.warehouse_id
    LEFT JOIN bill_items bi ON l.id = bi.location_id
    LEFT JOIN bills b ON bi.bill_id = b.id AND ${periodFilter} AND b.status != 'cancelled'
    WHERE w.status = 'active'
  `;

  if (warehouseId) {
    sql += " AND w.id = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY w.id ORDER BY total_income DESC";

  const warehouses = db.prepare(sql).all(...params);

  warehouses.forEach((w) => {
    w.total_income = Math.round(w.total_income * 100) / 100;
    w.received_income = Math.round(w.received_income * 100) / 100;
    w.receivable_income = Math.round(w.receivable_income * 100) / 100;
  });

  const totalIncome = warehouses.reduce((sum, w) => sum + w.total_income, 0);
  const totalReceived = warehouses.reduce(
    (sum, w) => sum + w.received_income,
    0,
  );
  const totalReceivable = warehouses.reduce(
    (sum, w) => sum + w.receivable_income,
    0,
  );

  res.json({
    period:
      year && month
        ? `${year}-${String(month).padStart(2, "0")}`
        : year || "全部",
    total: {
      total_income: Math.round(totalIncome * 100) / 100,
      received_income: Math.round(totalReceived * 100) / 100,
      receivable_income: Math.round(totalReceivable * 100) / 100,
      collection_rate:
        totalIncome > 0
          ? Math.round((totalReceived / totalIncome) * 10000) / 100
          : 0,
    },
    warehouses,
  });
};

const getIncomeTrend = (req, res) => {
  const { months } = req.query;
  const monthsNum = months || 12;

  const trends = [];
  for (let i = monthsNum - 1; i >= 0; i--) {
    const date = moment().subtract(i, "months");
    const period = date.format("YYYY-MM");

    const income = db
      .prepare(
        `
      SELECT 
        COALESCE(SUM(bi.amount), 0) as total_income,
        COALESCE(SUM(CASE WHEN b.status = 'paid' THEN bi.amount END), 0) as received_income
      FROM bill_items bi
      LEFT JOIN bills b ON bi.bill_id = b.id
      WHERE b.billing_period = ? AND b.status != 'cancelled'
    `,
      )
      .get(period);

    trends.push({
      period,
      month: date.format("MM月"),
      total_income: Math.round(income.total_income * 100) / 100,
      received_income: Math.round(income.received_income * 100) / 100,
    });
  }

  res.json({
    months: monthsNum,
    trends,
  });
};

const getMerchantBillingStats = (req, res) => {
  const merchantId = req.user.id;

  const stats = db
    .prepare(
      `
    SELECT 
      COUNT(*) as total_bills,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_bills,
      SUM(CASE WHEN status IN ('issued', 'overdue', 'dispute_rejected', 'adjusted') THEN 1 ELSE 0 END) as unpaid_bills,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_bills,
      SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed_bills,
      SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN status IN ('issued', 'overdue', 'dispute_rejected', 'adjusted') THEN total_amount ELSE 0 END) as unpaid_amount,
      SUM(total_amount) as total_amount
    FROM bills
    WHERE merchant_id = ? AND status != 'cancelled'
  `,
    )
    .get(merchantId);

  const recentBills = db
    .prepare(
      `
    SELECT b.*, COUNT(bi.id) as item_count
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    WHERE b.merchant_id = ?
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT 5
  `,
    )
    .all(merchantId);

  res.json({
    stats: {
      ...stats,
      total_amount: Math.round(stats.total_amount * 100) / 100,
      paid_amount: Math.round(stats.paid_amount * 100) / 100,
      unpaid_amount: Math.round(stats.unpaid_amount * 100) / 100,
    },
    recentBills,
  });
};

module.exports = {
  getOverviewStats,
  getWarehouseUtilization,
  getInventoryTurnover,
  getTimelinessStats,
  getSlowMovingRatio,
  getTransactionStats,
  getMerchantOverview,
  getWarehouseTurnover,
  getWarehouseIncome,
  getIncomeTrend,
  getMerchantBillingStats,
};
