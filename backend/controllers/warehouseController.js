const db = require('../config/database');

const getAllWarehouses = (req, res) => {
  const { status } = req.query;
  
  let sql = `
    SELECT w.*,
           COUNT(l.id) as total_locations,
           SUM(l.capacity) as total_capacity,
           SUM(l.used_capacity) as used_capacity
    FROM warehouses w
    LEFT JOIN locations l ON w.id = l.warehouse_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND w.status = ?';
    params.push(status);
  }

  sql += ' GROUP BY w.id ORDER BY w.created_at DESC';
  
  const warehouses = db.prepare(sql).all(...params);
  
  warehouses.forEach(w => {
    w.utilization_rate = w.total_capacity > 0 
      ? Math.round((w.used_capacity / w.total_capacity) * 100 * 100) / 100 
      : 0;
  });

  res.json(warehouses);
};

const getWarehouseById = (req, res) => {
  const { id } = req.params;
  
  const warehouse = db.prepare(`
    SELECT w.*,
           COUNT(l.id) as total_locations,
           SUM(l.capacity) as total_capacity,
           SUM(l.used_capacity) as used_capacity
    FROM warehouses w
    LEFT JOIN locations l ON w.id = l.warehouse_id
    WHERE w.id = ?
    GROUP BY w.id
  `).get(id);
  
  if (!warehouse) {
    return res.status(404).json({ error: '仓库不存在' });
  }

  warehouse.utilization_rate = warehouse.total_capacity > 0 
    ? Math.round((warehouse.used_capacity / warehouse.total_capacity) * 100 * 100) / 100 
    : 0;

  res.json(warehouse);
};

const createWarehouse = (req, res) => {
  const { code, name, address, temperatureZone, description } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: '仓库编码和名称为必填项' });
  }

  const existing = db.prepare('SELECT id FROM warehouses WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: '仓库编码已存在' });
  }

  const result = db.prepare(`
    INSERT INTO warehouses (code, name, address, temperature_zone, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(code, name, address, temperatureZone || 'normal', description);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'create_warehouse', 'warehouses', `创建仓库: ${code} - ${name}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: '仓库创建成功'
  });
};

const updateWarehouse = (req, res) => {
  const { id } = req.params;
  const { name, address, temperatureZone, description, status } = req.body;

  const existing = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '仓库不存在' });
  }

  const updateFields = [];
  const updateValues = [];

  if (name) { updateFields.push('name = ?'); updateValues.push(name); }
  if (address) { updateFields.push('address = ?'); updateValues.push(address); }
  if (temperatureZone) { updateFields.push('temperature_zone = ?'); updateValues.push(temperatureZone); }
  if (description) { updateFields.push('description = ?'); updateValues.push(description); }
  if (status) { updateFields.push('status = ?'); updateValues.push(status); }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  updateValues.push(id);

  db.prepare(`UPDATE warehouses SET ${updateFields.join(', ')} WHERE id = ?`)
    .run(...updateValues);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'update_warehouse', 'warehouses', `更新仓库: ${id}`);

  res.json({ message: '仓库更新成功' });
};

const deleteWarehouse = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '仓库不存在' });
  }

  const locationsCount = db.prepare('SELECT COUNT(*) as count FROM locations WHERE warehouse_id = ?').get(id).count;
  if (locationsCount > 0) {
    return res.status(400).json({ error: '仓库下还有库位，无法删除' });
  }

  db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'delete_warehouse', 'warehouses', `删除仓库: ${id}`);

  res.json({ message: '仓库删除成功' });
};

const getWarehouseUtilization = (req, res) => {
  const { id } = req.params;
  const { days } = req.query;
  const daysNum = days || 30;

  const locations = db.prepare(`
    SELECT l.*,
           CASE WHEN l.used_capacity > 0 THEN 1 ELSE 0 END as is_occupied
    FROM locations l
    WHERE l.warehouse_id = ?
    ORDER BY l.row, l.column, l.layer
  `).all(id);

  const recentTransactions = db.prepare(`
    SELECT t.*, u.name as merchant_name, gc.name as category_name
    FROM transactions t
    LEFT JOIN users u ON t.merchant_id = u.id
    LEFT JOIN goods_categories gc ON t.category_id = gc.id
    WHERE t.warehouse_id = ? AND t.txn_date >= datetime('now', ?)
    ORDER BY t.txn_date DESC
    LIMIT 50
  `).all(id, `-${daysNum} days`);

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN l.used_capacity > 0 THEN l.id END) as occupied_locations,
      COUNT(l.id) as total_locations,
      SUM(l.used_capacity) as used_capacity,
      SUM(l.capacity) as total_capacity
    FROM locations l
    WHERE l.warehouse_id = ?
  `).get(id);

  res.json({
    locations,
    recentTransactions,
    utilization: {
      locationRate: stats.total_locations > 0 
        ? Math.round((stats.occupied_locations / stats.total_locations) * 100 * 100) / 100 
        : 0,
      capacityRate: stats.total_capacity > 0 
        ? Math.round((stats.used_capacity / stats.total_capacity) * 100 * 100) / 100 
        : 0,
      ...stats
    }
  });
};

module.exports = { 
  getAllWarehouses, 
  getWarehouseById, 
  createWarehouse, 
  updateWarehouse, 
  deleteWarehouse,
  getWarehouseUtilization
};
