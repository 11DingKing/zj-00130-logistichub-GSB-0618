const db = require("../config/database");
const moment = require("moment");

const generateOrderNo = () => {
  return (
    "OUT" +
    moment().format("YYYYMMDDHHmmss") +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
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

const getAllOutboundOrders = (req, res) => {
  const { merchantId, status } = req.query;

  let sql = `
    SELECT oo.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           w.name as warehouse_name,
           COUNT(oi.id) as item_count
    FROM outbound_orders oo
    LEFT JOIN users u ON oo.merchant_id = u.id
    LEFT JOIN warehouses w ON oo.warehouse_id = w.id
    LEFT JOIN outbound_items oi ON oo.id = oi.outbound_order_id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND oo.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND oo.merchant_id = ?";
    params.push(merchantId);
  }
  if (status) {
    sql += " AND oo.status = ?";
    params.push(status);
  }

  sql += " GROUP BY oo.id ORDER BY oo.created_at DESC";

  const orders = db.prepare(sql).all(...params);
  res.json(orders);
};

const getOutboundOrderById = (req, res) => {
  const { id } = req.params;

  const order = db
    .prepare(
      `
    SELECT oo.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           u.phone as merchant_phone,
           w.name as warehouse_name
    FROM outbound_orders oo
    LEFT JOIN users u ON oo.merchant_id = u.id
    LEFT JOIN warehouses w ON oo.warehouse_id = w.id
    WHERE oo.id = ?
  `,
    )
    .get(id);

  if (!order) {
    return res.status(404).json({ error: "出库单不存在" });
  }

  if (req.user.role === "merchant" && order.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此出库单" });
  }

  const items = db
    .prepare(
      `
    SELECT oi.*,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit
    FROM outbound_items oi
    LEFT JOIN goods_categories gc ON oi.category_id = gc.id
    WHERE oi.outbound_order_id = ?
    ORDER BY oi.created_at ASC
  `,
    )
    .all(id);

  for (const item of items) {
    item.allocations = db
      .prepare(
        `
      SELECT oa.*,
             ib.batch_no,
             ib.expiry_date,
             ib.status as batch_status,
             loc.code as location_code,
             gc.name as category_name
      FROM outbound_allocations oa
      LEFT JOIN inventory_batches ib ON oa.batch_id = ib.id
      LEFT JOIN locations loc ON ib.location_id = loc.id
      LEFT JOIN goods_categories gc ON ib.category_id = gc.id
      WHERE oa.outbound_item_id = ?
      ORDER BY ib.inbound_date ASC
    `,
      )
      .all(item.id);
  }

  res.json({ ...order, items });
};

const getMyOutboundOrders = (req, res) => {
  const orders = db
    .prepare(
      `
    SELECT oo.*,
           w.name as warehouse_name,
           COUNT(oi.id) as item_count
    FROM outbound_orders oo
    LEFT JOIN warehouses w ON oo.warehouse_id = w.id
    LEFT JOIN outbound_items oi ON oo.id = oi.outbound_order_id
    WHERE oo.merchant_id = ?
    GROUP BY oo.id
    ORDER BY oo.created_at DESC
  `,
    )
    .all(req.user.id);

  res.json(orders);
};

const createOutboundOrder = (req, res) => {
  const {
    warehouseId,
    deliveryDate,
    contactPerson,
    contactPhone,
    destination,
    remarks,
    items,
  } = req.body;

  if (!warehouseId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "仓库ID和出库明细为必填项" });
  }

  const warehouse = db
    .prepare("SELECT id FROM warehouses WHERE id = ?")
    .get(warehouseId);
  if (!warehouse) {
    return res.status(404).json({ error: "仓库不存在" });
  }

  const tx = db.transaction(() => {
    const orderNo = generateOrderNo();

    const orderResult = db
      .prepare(
        `
      INSERT INTO outbound_orders (order_no, merchant_id, warehouse_id, delivery_date, contact_person, contact_phone, destination, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        orderNo,
        req.user.id,
        warehouseId,
        deliveryDate,
        contactPerson,
        contactPhone,
        destination,
        remarks,
      );

    const orderId = orderResult.lastInsertRowid;

    let totalQty = 0;

    for (const item of items) {
      if (!item.categoryId || !item.requestedQuantity || !item.unit) {
        throw new Error("出库明细缺少必要信息");
      }

      const category = db
        .prepare("SELECT * FROM goods_categories WHERE id = ?")
        .get(item.categoryId);
      if (!category) {
        throw new Error(`品类ID ${item.categoryId} 不存在`);
      }

      const totalStock = db
        .prepare(
          `
        SELECT COALESCE(SUM(quantity), 0) as total
        FROM inventory_batches ib
        JOIN leases l ON ib.lease_id = l.id
        JOIN locations loc ON ib.location_id = loc.id
        WHERE ib.merchant_id = ? 
          AND ib.category_id = ? 
          AND ib.status IN ('normal', 'near_expiry', 'slow_moving')
          AND ib.quantity > 0
          AND loc.warehouse_id = ?
          AND (ib.expiry_date IS NULL OR julianday(ib.expiry_date) - julianday('now') > 0)
      `,
        )
        .get(req.user.id, item.categoryId, warehouseId).total;

      if (totalStock < item.requestedQuantity) {
        throw new Error(
          `品类 ${category.name} 库存不足，当前库存: ${totalStock}，申请出库: ${item.requestedQuantity}`,
        );
      }

      db.prepare(
        `
        INSERT INTO outbound_items (outbound_order_id, category_id, requested_quantity, unit, remarks)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(
        orderId,
        item.categoryId,
        item.requestedQuantity,
        item.unit,
        item.remarks || null,
      );

      totalQty += item.requestedQuantity;
    }

    db.prepare(
      "UPDATE outbound_orders SET total_quantity = ? WHERE id = ?",
    ).run(totalQty, orderId);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "create_outbound", "outbound", `创建出库单: ${orderNo}`);

    return { orderId, orderNo };
  });

  try {
    const result = tx();
    res.status(201).json({
      id: result.orderId,
      orderNo: result.orderNo,
      message: "出库单创建成功，等待分配库存",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const allocateStock = (req, res) => {
  const { id } = req.params;

  const order = db
    .prepare("SELECT * FROM outbound_orders WHERE id = ?")
    .get(id);
  if (!order) {
    return res.status(404).json({ error: "出库单不存在" });
  }

  if (order.status !== "pending") {
    return res.status(400).json({ error: "出库单状态不允许分配库存" });
  }

  const items = db
    .prepare("SELECT * FROM outbound_items WHERE outbound_order_id = ?")
    .all(id);

  const warnings = [];
  const allocations = [];

  const tx = db.transaction(() => {
    for (const item of items) {
      const batches = db
        .prepare(
          `
        SELECT ib.*, loc.code as location_code, loc.temperature_zone as loc_temp
        FROM inventory_batches ib
        JOIN locations loc ON ib.location_id = loc.id
        WHERE ib.merchant_id = ? 
          AND ib.category_id = ? 
          AND ib.status IN ('normal', 'near_expiry', 'slow_moving')
          AND ib.quantity > 0
          AND loc.warehouse_id = ?
          AND (ib.expiry_date IS NULL OR julianday(ib.expiry_date) - julianday('now') > 0)
        ORDER BY 
          ib.inbound_date ASC,
          CASE ib.status WHEN 'near_expiry' THEN 0 WHEN 'slow_moving' THEN 1 ELSE 2 END,
          ib.expiry_date ASC
      `,
        )
        .all(order.merchant_id, item.category_id, order.warehouse_id);

      if (batches.length === 0) {
        throw new Error(`品类ID ${item.categoryId} 无可用库存`);
      }

      let remainingQty = item.requested_quantity;
      const itemAllocations = [];

      for (const batch of batches) {
        if (remainingQty <= 0) break;

        if (batch.status === "near_expiry") {
          warnings.push(
            `批次 ${batch.batch_no} 临近保质期 (${batch.expiry_date})，已优先分配出库`,
          );
        }
        if (batch.status === "slow_moving") {
          warnings.push(`批次 ${batch.batch_no} 为呆滞库存，已优先分配出库`);
        }

        const allocateQty = Math.min(remainingQty, batch.quantity);

        const existingAlloc = db
          .prepare(
            `
          SELECT id FROM outbound_allocations 
          WHERE outbound_item_id = ? AND batch_id = ?
        `,
          )
          .get(item.id, batch.id);

        if (existingAlloc) {
          db.prepare(
            `
            UPDATE outbound_allocations SET quantity = quantity + ? WHERE id = ?
          `,
          ).run(allocateQty, existingAlloc.id);
        } else {
          db.prepare(
            `
            INSERT INTO outbound_allocations (outbound_item_id, batch_id, quantity)
            VALUES (?, ?, ?)
          `,
          ).run(item.id, batch.id, allocateQty);
        }

        itemAllocations.push({
          batchId: batch.id,
          batchNo: batch.batch_no,
          locationCode: batch.location_code,
          quantity: allocateQty,
          expiryDate: batch.expiry_date,
          status: batch.status,
        });

        remainingQty -= allocateQty;
      }

      if (remainingQty > 0) {
        throw new Error(
          `品类ID ${item.categoryId} 库存不足，缺少 ${remainingQty} ${item.unit}`,
        );
      }

      const totalAllocated = itemAllocations.reduce(
        (sum, a) => sum + a.quantity,
        0,
      );

      db.prepare(
        `
        UPDATE outbound_items 
        SET allocated_quantity = ?, status = 'allocated'
        WHERE id = ?
      `,
      ).run(totalAllocated, item.id);

      allocations.push({
        itemId: item.id,
        categoryId: item.category_id,
        allocations: itemAllocations,
      });
    }

    db.prepare(
      `
      UPDATE outbound_orders 
      SET status = 'picking', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "allocate_outbound",
      "outbound",
      `分配出库单库存: ${id}`,
    );
  });

  try {
    tx();
    res.json({
      message: "库存分配成功，先进先出策略已应用",
      warnings,
      allocations,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const confirmPick = (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  const order = db
    .prepare("SELECT * FROM outbound_orders WHERE id = ?")
    .get(id);
  if (!order) {
    return res.status(404).json({ error: "出库单不存在" });
  }

  if (order.status !== "picking") {
    return res.status(400).json({ error: "出库单状态不允许拣货确认" });
  }

  const tx = db.transaction(() => {
    const outboundItems = db
      .prepare(
        `
      SELECT oi.*, oa.id as alloc_id, oa.batch_id, oa.quantity as alloc_qty
      FROM outbound_items oi
      LEFT JOIN outbound_allocations oa ON oi.id = oa.outbound_item_id
      WHERE oi.outbound_order_id = ? AND oi.status = 'allocated'
    `,
      )
      .all(id);

    for (const oi of outboundItems) {
      if (!oi.alloc_id) continue;

      const batch = db
        .prepare("SELECT * FROM inventory_batches WHERE id = ?")
        .get(oi.batch_id);
      if (!batch) {
        throw new Error(`批次ID ${oi.batch_id} 不存在`);
      }

      if (
        batch.status === "expired" ||
        (batch.expiry_date &&
          moment(batch.expiry_date).diff(moment(), "days") <= 0)
      ) {
        db.prepare(
          `
          UPDATE inventory_batches 
          SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status != 'expired'
        `,
        ).run(oi.batch_id);
        throw new Error(`批次 ${batch.batch_no} 已过期，禁止出库`);
      }

      if (batch.status === "locked") {
        throw new Error(`批次 ${batch.batch_no} 已锁定，禁止出库`);
      }

      let pickQty = oi.alloc_qty;
      if (items && items.length > 0) {
        const itemData = items.find((i) => i.itemId === oi.id);
        if (itemData && itemData.pickedQuantity !== undefined) {
          pickQty = itemData.pickedQuantity;
        }
      }

      const batchUpdate = db
        .prepare(
          `
        UPDATE inventory_batches 
        SET quantity = quantity - ?, 
            last_outbound_date = CURRENT_DATE,
            last_move_date = CURRENT_DATE,
            version = version + 1,
            status = CASE 
              WHEN quantity - ? <= 0 THEN 'locked'
              WHEN status = 'slow_moving' AND quantity - ? > 0 THEN 'normal'
              ELSE status 
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? 
          AND quantity >= ?
          AND version = ?
      `,
        )
        .run(pickQty, pickQty, pickQty, oi.batch_id, pickQty, batch.version);

      if (batchUpdate.changes === 0) {
        const currentBatch = db
          .prepare(
            "SELECT batch_no, quantity, version FROM inventory_batches WHERE id = ?",
          )
          .get(oi.batch_id);
        throw new Error(
          `批次 ${currentBatch?.batch_no || oi.batch_id} 库存已变更，请重新分配库存`,
        );
      }

      const locationUpdate = db
        .prepare(
          `
        UPDATE locations 
        SET used_capacity = used_capacity - ?, 
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? 
          AND used_capacity >= ?
      `,
        )
        .run(pickQty, batch.location_id, pickQty);

      if (locationUpdate.changes === 0) {
        throw new Error(`库位容量核减失败，存在并发操作，请重试`);
      }

      db.prepare(
        `
        UPDATE outbound_allocations 
        SET picked_quantity = picked_quantity + ?
        WHERE id = ?
      `,
      ).run(pickQty, oi.alloc_id);

      const txnNo = generateTxnNo();
      db.prepare(
        `
        INSERT INTO transactions (txn_no, txn_type, reference_id, reference_no, merchant_id, warehouse_id, location_id, category_id, batch_id, lease_id, quantity, unit, operator_id, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        txnNo,
        "outbound",
        id,
        order.order_no,
        order.merchant_id,
        order.warehouse_id,
        batch.location_id,
        batch.category_id,
        batch.id,
        batch.lease_id,
        pickQty,
        oi.unit,
        req.user.id,
        `出库批次: ${batch.batch_no}`,
      );
    }

    db.prepare(
      `
      UPDATE outbound_items 
      SET status = 'picked'
      WHERE outbound_order_id = ? AND status = 'allocated'
    `,
    ).run(id);

    db.prepare(
      `
      UPDATE outbound_orders 
      SET status = 'checking', picked_by = ?, picked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(req.user.id, id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "pick_outbound", "outbound", `拣货出库单: ${id}`);
  });

  try {
    tx();
    res.json({ message: "拣货确认成功" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const completeOutboundOrder = (req, res) => {
  const { id } = req.params;

  const order = db
    .prepare("SELECT * FROM outbound_orders WHERE id = ?")
    .get(id);
  if (!order) {
    return res.status(404).json({ error: "出库单不存在" });
  }

  if (order.status !== "picking" && order.status !== "checking") {
    return res.status(400).json({ error: "出库单状态不允许完成" });
  }

  const pendingItems = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM outbound_items 
    WHERE outbound_order_id = ? AND status NOT IN ('completed', 'picked')
  `,
    )
    .get(id).count;

  if (pendingItems > 0) {
    return res.status(400).json({ error: `还有 ${pendingItems} 项未完成拣货` });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE outbound_items 
      SET status = 'completed'
      WHERE outbound_order_id = ?
    `,
    ).run(id);

    db.prepare(
      `
      UPDATE outbound_orders 
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(req.user.id, "complete_outbound", "outbound", `完成出库单: ${id}`);
  });

  try {
    tx();
    res.json({ message: "出库单已完成" });
  } catch (err) {
    res.status(500).json({ error: "完成失败: " + err.message });
  }
};

module.exports = {
  getAllOutboundOrders,
  getOutboundOrderById,
  getMyOutboundOrders,
  createOutboundOrder,
  allocateStock,
  confirmPick,
  completeOutboundOrder,
};
