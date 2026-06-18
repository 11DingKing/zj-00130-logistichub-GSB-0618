const db = require("../config/database");
const moment = require("moment");

const getAllInventory = (req, res) => {
  const { merchantId, categoryId, locationId, status, days } = req.query;

  let sql = `
    SELECT ib.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit,
           loc.code as location_code,
           w.name as warehouse_name,
           w.code as warehouse_code
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    WHERE ib.quantity > 0
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND ib.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND ib.merchant_id = ?";
    params.push(merchantId);
  }
  if (categoryId) {
    sql += " AND ib.category_id = ?";
    params.push(categoryId);
  }
  if (locationId) {
    sql += " AND ib.location_id = ?";
    params.push(locationId);
  }
  if (status) {
    sql += " AND ib.status = ?";
    params.push(status);
  }

  sql += " ORDER BY ib.inbound_date ASC";

  const batches = db.prepare(sql).all(...params);

  batches.forEach((b) => {
    if (b.expiry_date) {
      const daysToExpiry = moment(b.expiry_date).diff(moment(), "days");
      b.days_to_expiry = daysToExpiry;
    }
    const lastMoveDate =
      b.last_move_date || b.last_outbound_date || b.inbound_date;
    b.days_since_last_move = moment().diff(moment(lastMoveDate), "days");
    if (b.last_outbound_date) {
      b.days_since_last_outbound = moment().diff(
        moment(b.last_outbound_date),
        "days",
      );
    } else {
      b.days_since_last_outbound = moment().diff(
        moment(b.inbound_date),
        "days",
      );
    }
  });

  res.json(batches);
};

const getMyInventory = (req, res) => {
  const batches = db
    .prepare(
      `
    SELECT ib.*,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit,
           loc.code as location_code,
           w.name as warehouse_name
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    WHERE ib.merchant_id = ? AND ib.quantity > 0
    ORDER BY ib.inbound_date ASC
  `,
    )
    .all(req.user.id);

  const summary = db
    .prepare(
      `
    SELECT 
      ib.category_id,
      gc.name as category_name,
      gc.unit as category_unit,
      SUM(ib.quantity) as total_quantity,
      COUNT(DISTINCT ib.id) as batch_count
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.merchant_id = ? AND ib.quantity > 0
    GROUP BY ib.category_id
  `,
    )
    .all(req.user.id);

  batches.forEach((b) => {
    if (b.expiry_date) {
      const daysToExpiry = moment(b.expiry_date).diff(moment(), "days");
      b.days_to_expiry = daysToExpiry;
    }
  });

  res.json({ batches, summary });
};

const getBatchDetail = (req, res) => {
  const { batchId } = req.params;

  const batch = db
    .prepare(
      `
    SELECT ib.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit,
           loc.code as location_code,
           w.name as warehouse_name,
           l.billing_method,
           l.unit_price
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    LEFT JOIN leases l ON ib.lease_id = l.id
    WHERE ib.id = ?
  `,
    )
    .get(batchId);

  if (!batch) {
    return res.status(404).json({ error: "批次不存在" });
  }

  if (req.user.role === "merchant" && batch.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此批次" });
  }

  if (batch.expiry_date) {
    const daysToExpiry = moment(batch.expiry_date).diff(moment(), "days");
    batch.days_to_expiry = daysToExpiry;
  }

  const transactions = db
    .prepare(
      `
    SELECT t.*, u.name as operator_name
    FROM transactions t
    LEFT JOIN users u ON t.operator_id = u.id
    WHERE t.batch_id = ?
    ORDER BY t.txn_date DESC
  `,
    )
    .all(batchId);

  res.json({ ...batch, transactions });
};

const getInventoryByLocation = (req, res) => {
  const { locationId } = req.params;

  const batches = db
    .prepare(
      `
    SELECT ib.*,
           u.name as merchant_name,
           gc.name as category_name,
           gc.unit as category_unit
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.location_id = ? AND ib.quantity > 0
    ORDER BY ib.inbound_date ASC
  `,
    )
    .all(locationId);

  res.json(batches);
};

const getSlowMovingInventory = (req, res) => {
  const { days } = req.query;
  const daysThreshold = days || 90;

  let sql = `
    SELECT ib.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           gc.name as category_name,
           loc.code as location_code,
           w.name as warehouse_name
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    WHERE ib.quantity > 0
      AND (
        (ib.last_move_date IS NULL AND julianday('now') - julianday(ib.inbound_date) >= ?)
        OR (ib.last_move_date IS NOT NULL AND julianday('now') - julianday(ib.last_move_date) >= ?)
      )
  `;
  const params = [daysThreshold, daysThreshold];

  if (req.user.role === "merchant") {
    sql += " AND ib.merchant_id = ?";
    params.push(req.user.id);
  }

  sql += " ORDER BY ib.inbound_date ASC";

  const batches = db.prepare(sql).all(...params);

  batches.forEach((b) => {
    const lastMoveDate =
      b.last_move_date || b.last_outbound_date || b.inbound_date;
    b.days_immobile = moment().diff(moment(lastMoveDate), "days");
  });

  res.json(batches);
};

const getNearExpiryInventory = (req, res) => {
  const { days } = req.query;
  const daysThreshold = days || 30;

  let sql = `
    SELECT ib.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           gc.name as category_name,
           loc.code as location_code,
           w.name as warehouse_name
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    WHERE ib.quantity > 0
      AND ib.expiry_date IS NOT NULL
      AND julianday(ib.expiry_date) - julianday('now') <= ?
      AND julianday(ib.expiry_date) - julianday('now') > 0
  `;
  const params = [daysThreshold];

  if (req.user.role === "merchant") {
    sql += " AND ib.merchant_id = ?";
    params.push(req.user.id);
  }

  sql += " ORDER BY ib.expiry_date ASC";

  const batches = db.prepare(sql).all(...params);

  batches.forEach((b) => {
    b.days_to_expiry = moment(b.expiry_date).diff(moment(), "days");
  });

  res.json(batches);
};

const getExpiredInventory = (req, res) => {
  let sql = `
    SELECT ib.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           gc.name as category_name,
           loc.code as location_code,
           w.name as warehouse_name
    FROM inventory_batches ib
    LEFT JOIN users u ON ib.merchant_id = u.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN locations loc ON ib.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    WHERE ib.quantity > 0
      AND ib.expiry_date IS NOT NULL
      AND julianday(ib.expiry_date) - julianday('now') <= 0
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND ib.merchant_id = ?";
    params.push(req.user.id);
  }

  sql += " ORDER BY ib.expiry_date ASC";

  const batches = db.prepare(sql).all(...params);

  batches.forEach((b) => {
    b.days_expired = moment().diff(moment(b.expiry_date), "days");
  });

  res.json(batches);
};

const checkSlowMoving = (req, res) => {
  const { days } = req.body;
  const daysThreshold = days || 90;

  const tx = db.transaction(() => {
    const updatedBatches = db
      .prepare(
        `
      UPDATE inventory_batches
      SET status = 'slow_moving', updated_at = CURRENT_TIMESTAMP
      WHERE quantity > 0
        AND status = 'normal'
        AND (
          (last_move_date IS NULL AND julianday('now') - julianday(inbound_date) >= ?)
          OR (last_move_date IS NOT NULL AND julianday('now') - julianday(last_move_date) >= ?)
        )
    `,
      )
      .run(daysThreshold, daysThreshold);

    const updatedExpired = db
      .prepare(
        `
      UPDATE inventory_batches
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE quantity > 0
        AND status != 'locked'
        AND status != 'expired'
        AND expiry_date IS NOT NULL
        AND julianday(expiry_date) - julianday('now') <= 0
    `,
      )
      .run();

    const updatedNearExpiry = db
      .prepare(
        `
      UPDATE inventory_batches
      SET status = 'near_expiry', updated_at = CURRENT_TIMESTAMP
      WHERE quantity > 0
        AND status = 'normal'
        AND expiry_date IS NOT NULL
        AND julianday(expiry_date) - julianday('now') <= 30
        AND julianday(expiry_date) - julianday('now') > 0
    `,
      )
      .run();

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "check_slow_moving",
      "inventory",
      `盘点呆滞库存，标记呆滞: ${updatedBatches.changes}，过期: ${updatedExpired.changes}，临期: ${updatedNearExpiry.changes}`,
    );

    return {
      slowMovingCount: updatedBatches.changes,
      expiredCount: updatedExpired.changes,
      nearExpiryCount: updatedNearExpiry.changes,
    };
  });

  try {
    const result = tx();
    res.json({
      message: "库存盘点完成",
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: "盘点失败: " + err.message });
  }
};

module.exports = {
  getAllInventory,
  getMyInventory,
  getBatchDetail,
  getInventoryByLocation,
  getSlowMovingInventory,
  getNearExpiryInventory,
  getExpiredInventory,
  checkSlowMoving,
};
