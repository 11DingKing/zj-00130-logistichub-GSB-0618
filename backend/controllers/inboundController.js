const db = require("../config/database");
const moment = require("moment");

const generateOrderNo = () => {
  return (
    "IN" +
    moment().format("YYYYMMDDHHmmss") +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
  );
};

const generateBatchNo = () => {
  return (
    "B" +
    moment().format("YYYYMMDD") +
    Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
  );
};

const generateTxnNo = () => {
  return (
    "TX" +
    moment().format("YYYYMMDDHHmmss") +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
  );
};

const getAllInboundOrders = (req, res) => {
  const { merchantId, status } = req.query;

  let sql = `
    SELECT io.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           w.name as warehouse_name,
           COUNT(ii.id) as item_count
    FROM inbound_orders io
    LEFT JOIN users u ON io.merchant_id = u.id
    LEFT JOIN warehouses w ON io.warehouse_id = w.id
    LEFT JOIN inbound_items ii ON io.id = ii.inbound_order_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND io.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND io.merchant_id = ?";
    params.push(merchantId);
  }
  if (status) {
    sql += " AND io.status = ?";
    params.push(status);
  }

  sql += " GROUP BY io.id ORDER BY io.created_at DESC";

  const orders = db.prepare(sql).all(...params);
  res.json(orders);
};

const getInboundOrderById = (req, res) => {
  const { id } = req.params;

  const order = db
    .prepare(
      `
    SELECT io.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           w.name as warehouse_name
    FROM inbound_orders io
    LEFT JOIN users u ON io.merchant_id = u.id
    LEFT JOIN warehouses w ON io.warehouse_id = w.id
    WHERE io.id = ?
  `,
    )
    .get(id);

  if (!order) {
    return res.status(404).json({ error: "入库单不存在" });
  }

  if (req.user.role === "merchant" && order.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此入库单" });
  }

  const items = db
    .prepare(
      `
    SELECT ii.*,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit,
           gc.temperature_zone as temp_zone,
           loc.code as location_code
    FROM inbound_items ii
    LEFT JOIN goods_categories gc ON ii.category_id = gc.id
    LEFT JOIN locations loc ON ii.location_id = loc.id
    WHERE ii.inbound_order_id = ?
    ORDER BY ii.created_at ASC
  `,
    )
    .all(id);

  res.json({ ...order, items });
};

const getMyInboundOrders = (req, res) => {
  const orders = db
    .prepare(
      `
    SELECT io.*,
           w.name as warehouse_name,
           COUNT(ii.id) as item_count
    FROM inbound_orders io
    LEFT JOIN warehouses w ON io.warehouse_id = w.id
    LEFT JOIN inbound_items ii ON io.id = ii.inbound_order_id
    WHERE io.merchant_id = ?
    GROUP BY io.id
    ORDER BY io.created_at DESC
  `,
    )
    .all(req.user.id);

  res.json(orders);
};

const createInboundOrder = (req, res) => {
  const {
    warehouseId,
    arrivalDate,
    contactPerson,
    contactPhone,
    remarks,
    items,
  } = req.body;

  if (!warehouseId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "仓库ID和入库明细为必填项" });
  }

  const warehouse = db
    .prepare("SELECT id FROM warehouses WHERE id = ?")
    .get(warehouseId);
  if (!warehouse) {
    return res.status(404).json({ error: "仓库不存在" });
  }

  const activeLeases = db
    .prepare(
      `
    SELECT l.*, loc.code as location_code, gc.temperature_zone as category_temp
    FROM leases l
    LEFT JOIN locations loc ON l.location_id = loc.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE l.merchant_id = ? AND l.status = 'active' AND loc.warehouse_id = ?
  `,
    )
    .all(req.user.id, warehouseId);

  if (activeLeases.length === 0) {
    return res
      .status(400)
      .json({ error: "您在该仓库没有有效租约，请先申请库位租赁" });
  }

  const tx = db.transaction(() => {
    const orderNo = generateOrderNo();

    const orderResult = db
      .prepare(
        `
      INSERT INTO inbound_orders (order_no, merchant_id, warehouse_id, arrival_date, contact_person, contact_phone, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        orderNo,
        req.user.id,
        warehouseId,
        arrivalDate,
        contactPerson,
        contactPhone,
        remarks,
      );

    const orderId = orderResult.lastInsertRowid;

    let totalQty = 0;

    for (const item of items) {
      if (!item.categoryId || !item.plannedQuantity || !item.unit) {
        throw new Error("入库明细缺少必要信息");
      }

      const category = db
        .prepare("SELECT * FROM goods_categories WHERE id = ?")
        .get(item.categoryId);
      if (!category) {
        throw new Error(`品类ID ${item.categoryId} 不存在`);
      }

      const lease = activeLeases.find((l) => l.category_id === item.categoryId);
      if (!lease) {
        throw new Error(`品类 ${category.name} 没有有效租约`);
      }

      const batchNo = item.batchNo || generateBatchNo();

      db.prepare(
        `
        INSERT INTO inbound_items (inbound_order_id, category_id, batch_no, planned_quantity, unit, unit_volume, production_date, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        orderId,
        item.categoryId,
        batchNo,
        item.plannedQuantity,
        item.unit,
        item.unitVolume || null,
        item.productionDate || null,
        item.expiryDate || null,
      );

      totalQty += item.plannedQuantity;
    }

    db.prepare("UPDATE inbound_orders SET total_quantity = ? WHERE id = ?").run(
      totalQty,
      orderId,
    );

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "create_inbound", "inbound", `创建入库单: ${orderNo}`);

    return { orderId, orderNo };
  });

  try {
    const result = tx();
    res.status(201).json({
      id: result.orderId,
      orderNo: result.orderNo,
      message: "入库单创建成功",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const addInboundItem = (req, res) => {
  const { id } = req.params;
  const {
    categoryId,
    plannedQuantity,
    unit,
    unitVolume,
    productionDate,
    expiryDate,
    batchNo,
  } = req.body;

  const order = db.prepare("SELECT * FROM inbound_orders WHERE id = ?").get(id);
  if (!order) {
    return res.status(404).json({ error: "入库单不存在" });
  }

  if (req.user.role === "merchant" && order.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权操作此入库单" });
  }

  if (order.status !== "pending") {
    return res.status(400).json({ error: "入库单状态不允许添加明细" });
  }

  const category = db
    .prepare("SELECT * FROM goods_categories WHERE id = ?")
    .get(categoryId);
  if (!category) {
    return res.status(404).json({ error: "货物品类不存在" });
  }

  const lease = db
    .prepare(
      `
    SELECT l.* FROM leases l
    WHERE l.merchant_id = ? AND l.category_id = ? AND l.status = 'active'
  `,
    )
    .get(order.merchant_id, categoryId);

  if (!lease) {
    return res.status(400).json({ error: "该品类没有有效租约" });
  }

  const result = db
    .prepare(
      `
    INSERT INTO inbound_items (inbound_order_id, category_id, batch_no, planned_quantity, unit, unit_volume, production_date, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      id,
      categoryId,
      batchNo || generateBatchNo(),
      plannedQuantity,
      unit,
      unitVolume || null,
      productionDate || null,
      expiryDate || null,
    );

  db.prepare(
    "UPDATE inbound_orders SET total_quantity = total_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(plannedQuantity, id);

  res.json({
    id: result.lastInsertRowid,
    message: "入库明细添加成功",
  });
};

const checkInboundOrder = (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const order = db.prepare("SELECT * FROM inbound_orders WHERE id = ?").get(id);
  if (!order) {
    return res.status(404).json({ error: "入库单不存在" });
  }

  if (order.status !== "pending") {
    return res.status(400).json({ error: "入库单状态不允许验货" });
  }

  const tx = db.transaction(() => {
    if (items && Array.isArray(items)) {
      for (const item of items) {
        db.prepare(
          `
          UPDATE inbound_items 
          SET actual_quantity = ?, status = 'putaway'
          WHERE id = ? AND inbound_order_id = ?
        `,
        ).run(item.actualQuantity, item.id, id);
      }
    }

    db.prepare(
      `
      UPDATE inbound_orders 
      SET status = 'checking', checked_by = ?, checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(req.user.id, id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "check_inbound", "inbound", `验货入库单: ${id}`);
  });

  try {
    tx();
    res.json({ message: "验货完成，等待上架" });
  } catch (err) {
    res.status(500).json({ error: "验货失败: " + err.message });
  }
};

const putawayItems = (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const order = db.prepare("SELECT * FROM inbound_orders WHERE id = ?").get(id);
  if (!order) {
    return res.status(404).json({ error: "入库单不存在" });
  }

  if (order.status !== "checking" && order.status !== "putaway") {
    return res.status(400).json({ error: "入库单状态不允许上架" });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "请提供上架明细" });
  }

  const tx = db.transaction(() => {
    for (const item of items) {
      const inboundItem = db
        .prepare(
          "SELECT * FROM inbound_items WHERE id = ? AND inbound_order_id = ?",
        )
        .get(item.id, id);
      if (!inboundItem) {
        throw new Error(`入库明细ID ${item.id} 不存在`);
      }

      if (inboundItem.status === "completed") {
        continue;
      }

      const location = db
        .prepare("SELECT * FROM locations WHERE id = ?")
        .get(item.locationId);
      if (!location) {
        throw new Error(`库位ID ${item.locationId} 不存在`);
      }

      const lease = db
        .prepare(
          `
        SELECT l.* FROM leases l
        WHERE l.merchant_id = ? AND l.category_id = ? AND l.location_id = ? AND l.status = 'active'
      `,
        )
        .get(order.merchant_id, inboundItem.category_id, item.locationId);

      if (!lease) {
        throw new Error(`库位 ${location.code} 没有该品类的有效租约`);
      }

      const putawayQty =
        item.putawayQuantity ||
        inboundItem.actual_quantity ||
        inboundItem.planned_quantity;

      const category = db
        .prepare("SELECT * FROM goods_categories WHERE id = ?")
        .get(inboundItem.category_id);
      let batchStatus = "normal";

      if (inboundItem.expiry_date) {
        const expiryDate = moment(inboundItem.expiry_date);
        const now = moment();
        const daysToExpiry = expiryDate.diff(now, "days");

        if (daysToExpiry <= 0) {
          batchStatus = "expired";
        } else if (daysToExpiry <= 30) {
          batchStatus = "near_expiry";
        }
      }

      const locationUpdate = db
        .prepare(
          `
        UPDATE locations 
        SET used_capacity = used_capacity + ?, 
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? 
          AND capacity - used_capacity >= ?
      `,
        )
        .run(putawayQty, item.locationId, putawayQty);

      if (locationUpdate.changes === 0) {
        const loc = db
          .prepare(
            "SELECT code, capacity, used_capacity FROM locations WHERE id = ?",
          )
          .get(item.locationId);
        const available = loc ? loc.capacity - loc.used_capacity : 0;
        throw new Error(
          `库位 ${loc?.code || item.locationId} 容量不足，剩余: ${available}，需上架: ${putawayQty}，请换库位或拆批`,
        );
      }

      db.prepare(
        `
        INSERT INTO inventory_batches (batch_no, merchant_id, category_id, location_id, lease_id, quantity, unit, unit_volume, production_date, expiry_date, inbound_date, status, last_move_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, CURRENT_DATE)
      `,
      ).run(
        inboundItem.batch_no,
        order.merchant_id,
        inboundItem.category_id,
        item.locationId,
        lease.id,
        putawayQty,
        inboundItem.unit,
        inboundItem.unit_volume,
        inboundItem.production_date,
        inboundItem.expiry_date,
        batchStatus,
      );

      db.prepare(
        `
        UPDATE inbound_items 
        SET actual_quantity = ?, location_id = ?, status = 'completed', putaway_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(putawayQty, item.locationId, inboundItem.id);

      const txnNo = generateTxnNo();
      db.prepare(
        `
        INSERT INTO transactions (txn_no, txn_type, reference_id, reference_no, merchant_id, warehouse_id, location_id, category_id, quantity, unit, operator_id, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        txnNo,
        "inbound",
        id,
        order.order_no,
        order.merchant_id,
        order.warehouse_id,
        item.locationId,
        inboundItem.category_id,
        putawayQty,
        inboundItem.unit,
        req.user.id,
        `上架批次: ${inboundItem.batch_no}`,
      );
    }

    const pendingItems = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM inbound_items 
      WHERE inbound_order_id = ? AND status != 'completed'
    `,
      )
      .get(id).count;

    const newStatus = pendingItems > 0 ? "putaway" : "completed";

    if (newStatus === "completed") {
      db.prepare(
        `
        UPDATE inbound_orders 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(id);
    } else {
      db.prepare(
        `
        UPDATE inbound_orders 
        SET status = 'putaway', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(id);
    }

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "putaway_inbound", "inbound", `上架入库单: ${id}`);
  });

  try {
    tx();
    res.json({ message: "上架操作成功" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const completeInboundOrder = (req, res) => {
  const { id } = req.params;

  const order = db.prepare("SELECT * FROM inbound_orders WHERE id = ?").get(id);
  if (!order) {
    return res.status(404).json({ error: "入库单不存在" });
  }

  const pendingItems = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM inbound_items 
    WHERE inbound_order_id = ? AND status != 'completed'
  `,
    )
    .get(id).count;

  if (pendingItems > 0) {
    return res.status(400).json({ error: `还有 ${pendingItems} 项未完成上架` });
  }

  db.prepare(
    `
    UPDATE inbound_orders 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(req.user.id, "complete_inbound", "inbound", `完成入库单: ${id}`);

  res.json({ message: "入库单已完成" });
};

module.exports = {
  getAllInboundOrders,
  getInboundOrderById,
  getMyInboundOrders,
  createInboundOrder,
  addInboundItem,
  checkInboundOrder,
  putawayItems,
  completeInboundOrder,
};
