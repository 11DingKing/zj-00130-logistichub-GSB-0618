const db = require("../config/database");

const getAllLeases = (req, res) => {
  const { merchantId, status } = req.query;

  let sql = `
    SELECT l.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           loc.code as location_code,
           w.name as warehouse_name,
           gc.name as category_name,
           gc.code as category_code
    FROM leases l
    LEFT JOIN users u ON l.merchant_id = u.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND l.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND l.merchant_id = ?";
    params.push(merchantId);
  }
  if (status) {
    sql += " AND l.status = ?";
    params.push(status);
  }

  sql += " ORDER BY l.created_at DESC";

  const leases = db.prepare(sql).all(...params);
  res.json(leases);
};

const getLeaseById = (req, res) => {
  const { id } = req.params;

  const lease = db
    .prepare(
      `
    SELECT l.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           loc.code as location_code,
           loc.capacity as location_capacity,
           loc.temperature_zone as location_temp_zone,
           w.name as warehouse_name,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit
    FROM leases l
    LEFT JOIN users u ON l.merchant_id = u.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE l.id = ?
  `,
    )
    .get(id);

  if (!lease) {
    return res.status(404).json({ error: "租约不存在" });
  }

  if (req.user.role === "merchant" && lease.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此租约" });
  }

  const inventory = db
    .prepare(
      `
    SELECT ib.*, gc.name as category_name
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.lease_id = ? AND ib.quantity > 0
    ORDER BY ib.inbound_date ASC
  `,
    )
    .all(id);

  let parsedTiers = null;
  if (lease.price_tiers) {
    try {
      parsedTiers = JSON.parse(lease.price_tiers);
    } catch (e) {}
  }

  res.json({ ...lease, priceTiers: parsedTiers, inventory });
};

const getMyLeases = (req, res) => {
  const leases = db
    .prepare(
      `
    SELECT l.*,
           loc.code as location_code,
           w.name as warehouse_name,
           gc.name as category_name,
           SUM(ib.quantity) as current_stock
    FROM leases l
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN warehouses w ON loc.warehouse_id = w.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    LEFT JOIN inventory_batches ib ON l.id = ib.lease_id AND ib.quantity > 0
    WHERE l.merchant_id = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `,
    )
    .all(req.user.id);

  res.json(leases);
};

const createLease = (req, res) => {
  const {
    locationId,
    categoryId,
    agreedCapacity,
    billingMethod,
    unitPrice,
    priceTiers,
    startDate,
    endDate,
    remarks,
  } = req.body;

  if (
    !locationId ||
    !categoryId ||
    !agreedCapacity ||
    !billingMethod ||
    !unitPrice ||
    !startDate
  ) {
    return res.status(400).json({
      error: "库位ID、品类ID、约定容量、计费方式、单价、开始日期为必填项",
    });
  }

  const location = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(locationId);
  if (!location) {
    return res.status(404).json({ error: "库位不存在" });
  }

  if (location.status !== "available") {
    return res.status(400).json({ error: "库位不可用" });
  }

  const availableCapacity = location.capacity - location.used_capacity;
  if (agreedCapacity > availableCapacity) {
    return res.status(400).json({
      error: `库位剩余容量不足，当前剩余: ${availableCapacity}，申请容量: ${agreedCapacity}`,
    });
  }

  const category = db
    .prepare("SELECT * FROM goods_categories WHERE id = ?")
    .get(categoryId);
  if (!category) {
    return res.status(404).json({ error: "货物品类不存在" });
  }

  if (location.temperature_zone !== category.temperature_zone) {
    return res.status(400).json({
      error: `温区不匹配，库位温区: ${location.temperature_zone}，货品温区: ${category.temperature_zone}`,
    });
  }

  const activeLease = db
    .prepare("SELECT id FROM leases WHERE location_id = ? AND status = ?")
    .get(locationId, "active");
  if (activeLease) {
    return res.status(400).json({ error: "该库位已有有效租约" });
  }

  let priceTiersStr = null;
  if (priceTiers && Array.isArray(priceTiers) && priceTiers.length > 0) {
    priceTiersStr = JSON.stringify(priceTiers);
  }

  const result = db
    .prepare(
      `
    INSERT INTO leases (merchant_id, location_id, category_id, agreed_capacity, billing_method, unit_price, price_tiers, start_date, end_date, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      req.user.id,
      locationId,
      categoryId,
      agreedCapacity,
      billingMethod,
      unitPrice,
      priceTiersStr,
      startDate,
      endDate,
      remarks,
    );

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "create_lease",
    "leases",
    `申请库位租赁: 库位ID ${locationId}`,
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    message: "租赁申请已提交，等待审核",
  });
};

const approveLease = (req, res) => {
  const { id } = req.params;

  const lease = db.prepare("SELECT * FROM leases WHERE id = ?").get(id);
  if (!lease) {
    return res.status(404).json({ error: "租约不存在" });
  }

  if (lease.status !== "pending") {
    return res.status(400).json({ error: "租约状态不允许审核" });
  }

  const location = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(lease.location_id);
  const availableCapacity = location.capacity - location.used_capacity;

  if (lease.agreed_capacity > availableCapacity) {
    return res.status(400).json({
      error: `库位剩余容量不足，无法通过审核。当前剩余: ${availableCapacity}，申请容量: ${lease.agreed_capacity}`,
    });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE leases 
      SET status = 'active', approved_at = CURRENT_TIMESTAMP, approved_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(req.user.id, id);

    db.prepare(
      `
      UPDATE locations 
      SET status = 'occupied', used_capacity = used_capacity + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(lease.agreed_capacity, lease.location_id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "approve_lease", "leases", `审核通过租约: ${id}`);
  });

  try {
    tx();
    res.json({ message: "租约审核通过" });
  } catch (err) {
    res.status(500).json({ error: "审核失败: " + err.message });
  }
};

const terminateLease = (req, res) => {
  const { id } = req.params;

  const lease = db.prepare("SELECT * FROM leases WHERE id = ?").get(id);
  if (!lease) {
    return res.status(404).json({ error: "租约不存在" });
  }

  if (req.user.role === "merchant" && lease.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权操作此租约" });
  }

  if (lease.status !== "active") {
    return res.status(400).json({ error: "只有生效中的租约可以终止" });
  }

  const remainingStock = db
    .prepare(
      `
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM inventory_batches 
    WHERE lease_id = ? AND quantity > 0
  `,
    )
    .get(id).total;

  if (remainingStock > 0) {
    return res.status(400).json({
      error: `租约下还有库存 (${remainingStock})，请先出库后再终止`,
    });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE leases 
      SET status = 'terminated', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(id);

    db.prepare(
      `
      UPDATE locations 
      SET status = 'available', used_capacity = used_capacity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(lease.agreed_capacity, lease.location_id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "terminate_lease", "leases", `终止租约: ${id}`);
  });

  try {
    tx();
    res.json({ message: "租约已终止" });
  } catch (err) {
    res.status(500).json({ error: "终止失败: " + err.message });
  }
};

const updateLease = (req, res) => {
  const { id } = req.params;
  const { unitPrice, priceTiers, remarks } = req.body;

  const lease = db.prepare("SELECT * FROM leases WHERE id = ?").get(id);
  if (!lease) {
    return res.status(404).json({ error: "租约不存在" });
  }

  let priceTiersStr = lease.price_tiers;
  if (priceTiers !== undefined) {
    if (priceTiers && Array.isArray(priceTiers) && priceTiers.length > 0) {
      priceTiersStr = JSON.stringify(priceTiers);
    } else {
      priceTiersStr = null;
    }
  }

  db.prepare(
    `
    UPDATE leases 
    SET unit_price = COALESCE(?, unit_price),
        price_tiers = ?,
        remarks = COALESCE(?, remarks),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(unitPrice, priceTiersStr, remarks, id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(req.user.id, "update_lease", "leases", `更新租约: ${id}`);

  res.json({ message: "租约已更新" });
};

module.exports = {
  getAllLeases,
  getLeaseById,
  getMyLeases,
  createLease,
  approveLease,
  terminateLease,
  updateLease,
};
