const db = require("../config/database");
const moment = require("moment");

const generateTransferNo = () => {
  const date = moment().format("YYYYMMDD");
  const count = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM inventory_transfers 
    WHERE transfer_no LIKE ?
  `,
    )
    .get(`TR${date}%`).count;
  return `TR${date}${String(count + 1).padStart(4, "0")}`;
};

const getAllTransfers = (req, res) => {
  const {
    merchantId,
    status,
    fromLocationId,
    toLocationId,
    startDate,
    endDate,
  } = req.query;

  let sql = `
    SELECT it.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           fl.code as from_location_code,
           tl.code as to_location_code,
           ib.batch_no,
           gc.name as category_name,
           gc.code as category_code,
           op.name as operator_name
    FROM inventory_transfers it
    LEFT JOIN users u ON it.merchant_id = u.id
    LEFT JOIN locations fl ON it.from_location_id = fl.id
    LEFT JOIN locations tl ON it.to_location_id = tl.id
    LEFT JOIN inventory_batches ib ON it.batch_id = ib.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN users op ON it.operator_id = op.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "merchant") {
    sql += " AND it.merchant_id = ?";
    params.push(req.user.id);
  } else if (merchantId) {
    sql += " AND it.merchant_id = ?";
    params.push(merchantId);
  }
  if (status) {
    sql += " AND it.status = ?";
    params.push(status);
  }
  if (fromLocationId) {
    sql += " AND it.from_location_id = ?";
    params.push(fromLocationId);
  }
  if (toLocationId) {
    sql += " AND it.to_location_id = ?";
    params.push(toLocationId);
  }
  if (startDate) {
    sql += " AND date(it.created_at) >= ?";
    params.push(startDate);
  }
  if (endDate) {
    sql += " AND date(it.created_at) <= ?";
    params.push(endDate);
  }

  sql += " ORDER BY it.created_at DESC";

  const transfers = db.prepare(sql).all(...params);
  res.json(transfers);
};

const getTransferById = (req, res) => {
  const { id } = req.params;

  const transfer = db
    .prepare(
      `
    SELECT it.*,
           u.name as merchant_name,
           u.company_name as merchant_company,
           fl.code as from_location_code,
           tl.code as to_location_code,
           ib.batch_no,
           ib.quantity as current_batch_quantity,
           gc.name as category_name,
           gc.code as category_code,
           gc.unit as category_unit,
           op.name as operator_name
    FROM inventory_transfers it
    LEFT JOIN users u ON it.merchant_id = u.id
    LEFT JOIN locations fl ON it.from_location_id = fl.id
    LEFT JOIN locations tl ON it.to_location_id = tl.id
    LEFT JOIN inventory_batches ib ON it.batch_id = ib.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN users op ON it.operator_id = op.id
    WHERE it.id = ?
  `,
    )
    .get(id);

  if (!transfer) {
    return res.status(404).json({ error: "移库单不存在" });
  }

  if (req.user.role === "merchant" && transfer.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权查看此移库单" });
  }

  const fromLocation = db
    .prepare(
      `
    SELECT * FROM locations WHERE id = ?
  `,
    )
    .get(transfer.from_location_id);

  const toLocation = db
    .prepare(
      `
    SELECT * FROM locations WHERE id = ?
  `,
    )
    .get(transfer.to_location_id);

  res.json({ ...transfer, fromLocation, toLocation });
};

const getMyTransfers = (req, res) => {
  const { status } = req.query;

  let sql = `
    SELECT it.*,
           fl.code as from_location_code,
           tl.code as to_location_code,
           ib.batch_no,
           gc.name as category_name
    FROM inventory_transfers it
    LEFT JOIN locations fl ON it.from_location_id = fl.id
    LEFT JOIN locations tl ON it.to_location_id = tl.id
    LEFT JOIN inventory_batches ib ON it.batch_id = ib.id
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE it.merchant_id = ?
  `;
  const params = [req.user.id];

  if (status) {
    sql += " AND it.status = ?";
    params.push(status);
  }

  sql += " ORDER BY it.created_at DESC";

  const transfers = db.prepare(sql).all(...params);
  res.json(transfers);
};

const getAvailableLocationsForTransfer = (req, res) => {
  const { batchId, excludeLocationId } = req.query;

  if (!batchId) {
    return res.status(400).json({ error: "批次ID为必填项" });
  }

  const batch = db
    .prepare(
      `
    SELECT ib.*, gc.temperature_zone as category_temp_zone
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.id = ? AND ib.quantity > 0
  `,
    )
    .get(batchId);

  if (!batch) {
    return res.status(404).json({ error: "批次不存在或无库存" });
  }

  let sql = `
    SELECT l.*, 
           w.name as warehouse_name, 
           w.code as warehouse_code,
           l.capacity - l.used_capacity as available_capacity
    FROM locations l
    LEFT JOIN warehouses w ON l.warehouse_id = w.id
    WHERE l.status IN ('available', 'occupied')
      AND l.id != ?
      AND l.temperature_zone = ?
      AND l.id IN (
        SELECT location_id FROM leases 
        WHERE merchant_id = ? AND status = 'active'
      )
  `;
  const params = [
    excludeLocationId || batch.location_id,
    batch.category_temp_zone,
    batch.merchant_id,
  ];

  sql += " ORDER BY w.code, l.row, l.column, l.layer";

  const locations = db.prepare(sql).all(...params);

  res.json(locations);
};

const createTransfer = (req, res) => {
  const { batchId, toLocationId, quantity, transferType, reason, remarks } =
    req.body;

  if (!batchId || !toLocationId || !quantity || !transferType) {
    return res
      .status(400)
      .json({ error: "批次ID、目标库位ID、数量、移库类型为必填项" });
  }

  if (quantity <= 0) {
    return res.status(400).json({ error: "移库数量必须大于0" });
  }

  const batch = db
    .prepare(
      `
    SELECT ib.*, 
           gc.temperature_zone as category_temp_zone,
           gc.unit as category_unit
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    WHERE ib.id = ? AND ib.quantity > 0
  `,
    )
    .get(batchId);

  if (!batch) {
    return res.status(404).json({ error: "批次不存在或无库存" });
  }

  if (req.user.role === "merchant" && batch.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权操作此批次" });
  }

  if (batch.location_id === toLocationId) {
    return res.status(400).json({ error: "目标库位不能与原库位相同" });
  }

  if (transferType === "full" && quantity !== batch.quantity) {
    return res.status(400).json({ error: "整批移库数量必须等于批次库存数量" });
  }

  if (transferType === "partial" && quantity >= batch.quantity) {
    return res.status(400).json({ error: "拆批移库数量必须小于批次库存数量" });
  }

  const fromLocation = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(batch.location_id);
  const toLocation = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(toLocationId);

  if (!toLocation) {
    return res.status(404).json({ error: "目标库位不存在" });
  }

  if (toLocation.temperature_zone !== batch.category_temp_zone) {
    return res.status(400).json({
      error: `温区不匹配，目标库位温区: ${toLocation.temperature_zone}，货品温区: ${batch.category_temp_zone}`,
    });
  }

  const availableCapacity = toLocation.capacity - toLocation.used_capacity;
  if (quantity > availableCapacity) {
    return res.status(400).json({
      error: `目标库位剩余容量不足，当前剩余: ${availableCapacity}，移库数量: ${quantity}`,
    });
  }

  if (
    batch.expiry_date &&
    moment(batch.expiry_date).diff(moment(), "days") <= 0
  ) {
    return res.status(400).json({ error: "过期批次不允许移库" });
  }

  const toLease = db
    .prepare(
      `
    SELECT * FROM leases 
    WHERE location_id = ? AND merchant_id = ? AND status = 'active'
  `,
    )
    .get(toLocationId, batch.merchant_id);

  if (!toLease) {
    return res.status(400).json({ error: "目标库位不属于该商户的有效租约" });
  }

  if (toLease.category_id !== batch.category_id) {
    return res.status(400).json({ error: "目标库位租约品类与批次品类不匹配" });
  }

  const transferNo = generateTransferNo();

  const result = db
    .prepare(
      `
    INSERT INTO inventory_transfers (
      transfer_no, merchant_id, batch_id, from_location_id, to_location_id,
      quantity, unit, transfer_type, reason, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      transferNo,
      batch.merchant_id,
      batchId,
      batch.location_id,
      toLocationId,
      quantity,
      batch.category_unit,
      transferType,
      reason,
      remarks,
    );

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "create_transfer",
    "transfer",
    `创建移库单: ${transferNo}`,
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    transferNo,
    message: "移库单创建成功",
  });
};

const processTransfer = (req, res) => {
  const { id } = req.params;

  const transfer = db
    .prepare("SELECT * FROM inventory_transfers WHERE id = ?")
    .get(id);
  if (!transfer) {
    return res.status(404).json({ error: "移库单不存在" });
  }

  if (transfer.status !== "pending") {
    return res.status(400).json({ error: "移库单状态不允许处理" });
  }

  db.prepare(
    `
    UPDATE inventory_transfers 
    SET status = 'processing', operator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(req.user.id, id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "process_transfer",
    "transfer",
    `开始处理移库单: ${transfer.transfer_no}`,
  );

  res.json({ message: "移库单已开始处理" });
};

const completeTransfer = (req, res) => {
  const { id } = req.params;

  const transfer = db
    .prepare("SELECT * FROM inventory_transfers WHERE id = ?")
    .get(id);
  if (!transfer) {
    return res.status(404).json({ error: "移库单不存在" });
  }

  if (transfer.status !== "processing" && transfer.status !== "pending") {
    return res.status(400).json({ error: "移库单状态不允许完成" });
  }

  const batch = db
    .prepare("SELECT * FROM inventory_batches WHERE id = ?")
    .get(transfer.batch_id);
  if (!batch || batch.quantity < transfer.quantity) {
    return res.status(400).json({ error: "批次库存不足，无法完成移库" });
  }

  const fromLocation = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(transfer.from_location_id);
  const toLocation = db
    .prepare("SELECT * FROM locations WHERE id = ?")
    .get(transfer.to_location_id);

  const availableCapacity = toLocation.capacity - toLocation.used_capacity;
  if (transfer.quantity > availableCapacity) {
    return res.status(400).json({
      error: `目标库位剩余容量不足，当前剩余: ${availableCapacity}，移库数量: ${transfer.quantity}`,
    });
  }

  const toLease = db
    .prepare(
      `
    SELECT * FROM leases WHERE location_id = ? AND merchant_id = ? AND status = 'active'
  `,
    )
    .get(transfer.to_location_id, transfer.merchant_id);

  if (!toLease) {
    return res.status(400).json({ error: "目标库位无有效租约" });
  }

  const tx = db.transaction(() => {
    if (
      batch.expiry_date &&
      moment(batch.expiry_date).diff(moment(), "days") <= 0
    ) {
      db.prepare(
        `
        UPDATE inventory_batches 
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'expired'
      `,
      ).run(transfer.batch_id);
      throw new Error(`批次 ${batch.batch_no} 已过期，禁止移库`);
    }

    if (transfer.transfer_type === "full") {
      const batchUpdate = db
        .prepare(
          `
        UPDATE inventory_batches 
        SET location_id = ?, 
            lease_id = ?, 
            last_move_date = CURRENT_DATE,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? 
          AND quantity >= ?
          AND version = ?
      `,
        )
        .run(
          transfer.to_location_id,
          toLease.id,
          transfer.batch_id,
          transfer.quantity,
          batch.version,
        );

      if (batchUpdate.changes === 0) {
        throw new Error(`批次 ${batch.batch_no} 库存已变更，请重试`);
      }
    } else {
      const batchUpdate = db
        .prepare(
          `
        UPDATE inventory_batches 
        SET quantity = quantity - ?, 
            last_move_date = CURRENT_DATE,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? 
          AND quantity >= ?
          AND version = ?
      `,
        )
        .run(
          transfer.quantity,
          transfer.batch_id,
          transfer.quantity,
          batch.version,
        );

      if (batchUpdate.changes === 0) {
        throw new Error(`批次 ${batch.batch_no} 库存已变更，请重试`);
      }

      const newBatchNo = `${batch.batch_no}-${Date.now()}`;
      db.prepare(
        `
        INSERT INTO inventory_batches (
          batch_no, merchant_id, category_id, location_id, lease_id,
          quantity, unit, unit_volume, production_date, expiry_date,
          inbound_date, last_move_date, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)
      `,
      ).run(
        newBatchNo,
        batch.merchant_id,
        batch.category_id,
        transfer.to_location_id,
        toLease.id,
        transfer.quantity,
        batch.unit,
        batch.unit_volume,
        batch.production_date,
        batch.expiry_date,
        batch.inbound_date,
        `拆批移库自批次 ${batch.batch_no}`,
      );
    }

    const fromLocUpdate = db
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
      .run(transfer.quantity, transfer.from_location_id, transfer.quantity);

    if (fromLocUpdate.changes === 0) {
      throw new Error(`源库位容量核减失败，存在并发操作，请重试`);
    }

    const toLocUpdate = db
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
      .run(transfer.quantity, transfer.to_location_id, transfer.quantity);

    if (toLocUpdate.changes === 0) {
      throw new Error(`目标库位容量不足，存在并发操作，请重试`);
    }

    db.prepare(
      `
      UPDATE locations 
      SET status = CASE WHEN used_capacity > 0 THEN 'occupied' ELSE 'available' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(transfer.from_location_id);

    db.prepare(
      `
      UPDATE locations 
      SET status = 'occupied', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(transfer.to_location_id);

    const txnNo = `TX${moment().format("YYYYMMDDHHmmss")}`;
    db.prepare(
      `
      INSERT INTO transactions (
        txn_no, txn_type, reference_id, reference_no, merchant_id,
        warehouse_id, location_id, category_id, batch_id, lease_id, quantity,
        unit, operator_id, remarks
      ) VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      txnNo,
      transfer.id,
      transfer.transfer_no,
      transfer.merchant_id,
      fromLocation.warehouse_id,
      transfer.from_location_id,
      batch.category_id,
      transfer.batch_id,
      batch.lease_id,
      -transfer.quantity,
      transfer.unit,
      req.user.id,
      `移库出库: ${transfer.transfer_no}`,
    );

    db.prepare(
      `
      INSERT INTO transactions (
        txn_no, txn_type, reference_id, reference_no, merchant_id,
        warehouse_id, location_id, category_id, batch_id, lease_id, quantity,
        unit, operator_id, remarks
      ) VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      txnNo,
      transfer.id,
      transfer.transfer_no,
      transfer.merchant_id,
      toLocation.warehouse_id,
      transfer.to_location_id,
      batch.category_id,
      transfer.batch_id,
      batch.lease_id,
      transfer.quantity,
      transfer.unit,
      req.user.id,
      `移库入库: ${transfer.transfer_no}`,
    );

    db.prepare(
      `
      UPDATE inventory_transfers 
      SET status = 'completed', operator_id = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(req.user.id, id);

    db.prepare(
      "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
    ).run(
      req.user.id,
      "complete_transfer",
      "transfer",
      `完成移库单: ${transfer.transfer_no}`,
    );
  });

  try {
    tx();
    res.json({ message: "移库完成" });
  } catch (err) {
    res.status(500).json({ error: "移库失败: " + err.message });
  }
};

const cancelTransfer = (req, res) => {
  const { id } = req.params;

  const transfer = db
    .prepare("SELECT * FROM inventory_transfers WHERE id = ?")
    .get(id);
  if (!transfer) {
    return res.status(404).json({ error: "移库单不存在" });
  }

  if (transfer.status === "completed") {
    return res.status(400).json({ error: "已完成的移库单无法取消" });
  }

  if (req.user.role === "merchant" && transfer.merchant_id !== req.user.id) {
    return res.status(403).json({ error: "无权取消此移库单" });
  }

  db.prepare(
    `
    UPDATE inventory_transfers 
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(id);

  db.prepare(
    "INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)",
  ).run(
    req.user.id,
    "cancel_transfer",
    "transfer",
    `取消移库单: ${transfer.transfer_no}`,
  );

  res.json({ message: "移库单已取消" });
};

module.exports = {
  getAllTransfers,
  getTransferById,
  getMyTransfers,
  getAvailableLocationsForTransfer,
  createTransfer,
  processTransfer,
  completeTransfer,
  cancelTransfer,
};
