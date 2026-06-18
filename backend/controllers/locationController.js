const db = require('../config/database');

const getAllLocations = (req, res) => {
  const { warehouseId, status, temperatureZone } = req.query;
  
  let sql = `
    SELECT l.*, w.name as warehouse_name, w.code as warehouse_code
    FROM locations l
    LEFT JOIN warehouses w ON l.warehouse_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (warehouseId) {
    sql += ' AND l.warehouse_id = ?';
    params.push(warehouseId);
  }
  if (status) {
    sql += ' AND l.status = ?';
    params.push(status);
  }
  if (temperatureZone) {
    sql += ' AND l.temperature_zone = ?';
    params.push(temperatureZone);
  }

  sql += ' ORDER BY w.code, l.row, l.column, l.layer';
  
  const locations = db.prepare(sql).all(...params);
  
  locations.forEach(l => {
    l.available_capacity = l.capacity - l.used_capacity;
    l.utilization_rate = l.capacity > 0 
      ? Math.round((l.used_capacity / l.capacity) * 100 * 100) / 100 
      : 0;
  });

  res.json(locations);
};

const getLocationById = (req, res) => {
  const { id } = req.params;
  
  const location = db.prepare(`
    SELECT l.*, w.name as warehouse_name, w.code as warehouse_code
    FROM locations l
    LEFT JOIN warehouses w ON l.warehouse_id = w.id
    WHERE l.id = ?
  `).get(id);
  
  if (!location) {
    return res.status(404).json({ error: '库位不存在' });
  }

  location.available_capacity = location.capacity - location.used_capacity;
  location.utilization_rate = location.capacity > 0 
    ? Math.round((location.used_capacity / location.capacity) * 100 * 100) / 100 
    : 0;

  const inventory = db.prepare(`
    SELECT ib.*, gc.name as category_name, gc.code as category_code, u.name as merchant_name
    FROM inventory_batches ib
    LEFT JOIN goods_categories gc ON ib.category_id = gc.id
    LEFT JOIN users u ON ib.merchant_id = u.id
    WHERE ib.location_id = ? AND ib.quantity > 0
    ORDER BY ib.inbound_date ASC
  `).all(id);

  const activeLease = db.prepare(`
    SELECT l.*, u.name as merchant_name, gc.name as category_name
    FROM leases l
    LEFT JOIN users u ON l.merchant_id = u.id
    LEFT JOIN goods_categories gc ON l.category_id = gc.id
    WHERE l.location_id = ? AND l.status = 'active'
  `).get(id);

  res.json({ ...location, inventory, activeLease });
};

const getLocationsByWarehouse = (req, res) => {
  const { warehouseId } = req.params;
  
  const locations = db.prepare(`
    SELECT l.*, w.name as warehouse_name
    FROM locations l
    LEFT JOIN warehouses w ON l.warehouse_id = w.id
    WHERE l.warehouse_id = ?
    ORDER BY l.row, l.column, l.layer
  `).all(warehouseId);

  locations.forEach(l => {
    l.available_capacity = l.capacity - l.used_capacity;
    l.utilization_rate = l.capacity > 0 
      ? Math.round((l.used_capacity / l.capacity) * 100 * 100) / 100 
      : 0;
  });

  res.json(locations);
};

const createLocation = (req, res) => {
  const { warehouseId, code, row, column, layer, capacity, temperatureZone, allowedCategories } = req.body;

  if (!warehouseId || !code || !row || !column || !layer || !capacity) {
    return res.status(400).json({ error: '仓库ID、库位编码、排、列、层、容量为必填项' });
  }

  const warehouse = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(warehouseId);
  if (!warehouse) {
    return res.status(404).json({ error: '仓库不存在' });
  }

  const existing = db.prepare('SELECT id FROM locations WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: '库位编码已存在' });
  }

  const result = db.prepare(`
    INSERT INTO locations (warehouse_id, code, row, column, layer, capacity, temperature_zone, allowed_categories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(warehouseId, code, row, column, layer, capacity, temperatureZone || 'normal', allowedCategories);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'create_location', 'locations', `创建库位: ${code}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: '库位创建成功'
  });
};

const updateLocation = (req, res) => {
  const { id } = req.params;
  const { row, column, layer, capacity, temperatureZone, allowedCategories, status } = req.body;

  const existing = db.prepare('SELECT id FROM locations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '库位不存在' });
  }

  const updateFields = [];
  const updateValues = [];

  if (row) { updateFields.push('row = ?'); updateValues.push(row); }
  if (column) { updateFields.push('column = ?'); updateValues.push(column); }
  if (layer) { updateFields.push('layer = ?'); updateValues.push(layer); }
  if (capacity) { updateFields.push('capacity = ?'); updateValues.push(capacity); }
  if (temperatureZone) { updateFields.push('temperature_zone = ?'); updateValues.push(temperatureZone); }
  if (allowedCategories !== undefined) { updateFields.push('allowed_categories = ?'); updateValues.push(allowedCategories); }
  if (status) { updateFields.push('status = ?'); updateValues.push(status); }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  updateValues.push(id);

  db.prepare(`UPDATE locations SET ${updateFields.join(', ')} WHERE id = ?`)
    .run(...updateValues);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'update_location', 'locations', `更新库位: ${id}`);

  res.json({ message: '库位更新成功' });
};

const deleteLocation = (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT id, used_capacity FROM locations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '库位不存在' });
  }

  if (existing.used_capacity > 0) {
    return res.status(400).json({ error: '库位还有库存，无法删除' });
  }

  const activeLease = db.prepare('SELECT id FROM leases WHERE location_id = ? AND status = ?').get(id, 'active');
  if (activeLease) {
    return res.status(400).json({ error: '库位有有效租约，无法删除' });
  }

  db.prepare('DELETE FROM locations WHERE id = ?').run(id);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'delete_location', 'locations', `删除库位: ${id}`);

  res.json({ message: '库位删除成功' });
};

const getAvailableLocationsForLease = (req, res) => {
  const { categoryId, temperatureZone, minCapacity } = req.query;

  let sql = `
    SELECT l.*, w.name as warehouse_name, w.code as warehouse_code
    FROM locations l
    LEFT JOIN warehouses w ON l.warehouse_id = w.id
    WHERE l.status = 'available'
      AND l.capacity - l.used_capacity > 0
      AND l.id NOT IN (SELECT location_id FROM leases WHERE status = 'active')
  `;
  const params = [];

  if (temperatureZone) {
    sql += ' AND l.temperature_zone = ?';
    params.push(temperatureZone);
  }
  if (minCapacity) {
    sql += ' AND l.capacity - l.used_capacity >= ?';
    params.push(parseFloat(minCapacity));
  }

  sql += ' ORDER BY w.code, l.row, l.column, l.layer';

  const locations = db.prepare(sql).all(...params);

  locations.forEach(l => {
    l.available_capacity = l.capacity - l.used_capacity;
  });

  res.json(locations);
};

module.exports = {
  getAllLocations,
  getLocationById,
  getLocationsByWarehouse,
  createLocation,
  updateLocation,
  deleteLocation,
  getAvailableLocationsForLease
};
