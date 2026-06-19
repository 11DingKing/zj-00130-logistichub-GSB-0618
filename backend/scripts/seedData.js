const bcrypt = require('bcryptjs');
const db = require('../config/database');
const moment = require('moment');

const seedData = () => {
  console.log('🌱 开始填充模拟数据...');

  db.exec('PRAGMA foreign_keys = OFF');

  try {
    db.exec('DELETE FROM system_logs');
    db.exec('DELETE FROM transactions');
    db.exec('DELETE FROM outbound_allocations');
    db.exec('DELETE FROM outbound_items');
    db.exec('DELETE FROM outbound_orders');
    db.exec('DELETE FROM inbound_items');
    db.exec('DELETE FROM inbound_orders');
    db.exec('DELETE FROM inventory_batches');
    db.exec('DELETE FROM leases');
    db.exec('DELETE FROM goods_categories');
    db.exec('DELETE FROM locations');
    db.exec('DELETE FROM warehouses');
    db.exec('DELETE FROM users');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('users', 'warehouses', 'locations', 'goods_categories', 'leases', 'inventory_batches', 'inbound_orders', 'inbound_items', 'outbound_orders', 'outbound_items', 'outbound_allocations', 'transactions', 'system_logs')");

    console.log('✅ 清空旧数据完成');

    const hashedPassword = bcrypt.hashSync('123456', 10);

    const users = [
      { username: 'admin', name: '张管理员', role: 'admin', phone: '13800138000', email: 'admin@logistichub.com', companyName: '物流枢纽运营中心' },
      { username: 'merchant1', name: '李经理', role: 'merchant', phone: '13900139001', email: 'li@fresh.com', companyName: '鲜达食品有限公司' },
      { username: 'merchant2', name: '王总', role: 'merchant', phone: '13900139002', email: 'wang@speed.com', companyName: '速通快递有限公司' },
      { username: 'merchant3', name: '陈经理', role: 'merchant', phone: '13900139003', email: 'chen@med.com', companyName: '康泰医药有限公司' },
      { username: 'merchant4', name: '刘总', role: 'merchant', phone: '13900139004', email: 'liu@elec.com', companyName: '恒信电子科技有限公司' }
    ];

    const userStmt = db.prepare(`
      INSERT INTO users (username, password, name, role, phone, email, company_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    users.forEach(u => {
      userStmt.run(u.username, hashedPassword, u.name, u.role, u.phone, u.email, u.companyName);
    });

    console.log('✅ 用户数据填充完成');

    const warehouses = [
      { code: 'WH-A', name: 'A区常温仓库', address: '园区东区A栋', temperatureZone: 'normal', description: '普通货物存储区，1-5层' },
      { code: 'WH-B', name: 'B区恒温仓库', address: '园区东区B栋', temperatureZone: 'constant', description: '恒温恒湿仓储区，温度15-25℃' },
      { code: 'WH-C', name: 'C区冷藏仓库', address: '园区西区C栋', temperatureZone: 'cold', description: '冷藏区，温度0-10℃' },
      { code: 'WH-D', name: 'D区冷冻仓库', address: '园区西区D栋', temperatureZone: 'frozen', description: '冷冻区，温度-18℃以下' }
    ];

    const warehouseStmt = db.prepare(`
      INSERT INTO warehouses (code, name, address, temperature_zone, description)
      VALUES (?, ?, ?, ?, ?)
    `);

    warehouses.forEach(w => warehouseStmt.run(w.code, w.name, w.address, w.temperatureZone, w.description));
    console.log('✅ 仓库数据填充完成');

    const locationStmt = db.prepare(`
      INSERT INTO locations (warehouse_id, code, row, column, layer, capacity, temperature_zone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const rows = ['A', 'B', 'C', 'D'];
    const columns = [1, 2, 3, 4, 5];
    const layers = [1, 2, 3];

    for (let whId = 1; whId <= 4; whId++) {
      const wh = warehouses[whId - 1];
      rows.forEach(row => {
        columns.forEach(col => {
          layers.forEach(layer => {
            const code = `${wh.code}-${row}${col}-${layer}`;
            const capacity = 50 + Math.floor(Math.random() * 50);
            locationStmt.run(whId, code, row, col.toString(), layer.toString(), capacity, wh.temperatureZone);
          });
        });
      });
    }
    console.log('✅ 库位数据填充完成 (共240个库位)');

    const categories = [
      { code: 'FOOD-001', name: '大米', unit: '袋', temperatureZone: 'normal', shelfLifeDays: 365 },
      { code: 'FOOD-002', name: '面粉', unit: '袋', temperatureZone: 'normal', shelfLifeDays: 180 },
      { code: 'FOOD-003', name: '食用油', unit: '桶', temperatureZone: 'normal', shelfLifeDays: 540 },
      { code: 'FOOD-004', name: '牛奶', unit: '箱', temperatureZone: 'cold', shelfLifeDays: 21 },
      { code: 'FOOD-005', name: '鲜肉', unit: '公斤', temperatureZone: 'cold', shelfLifeDays: 7 },
      { code: 'FOOD-006', name: '速冻水饺', unit: '箱', temperatureZone: 'frozen', shelfLifeDays: 180 },
      { code: 'FOOD-007', name: '冰淇淋', unit: '箱', temperatureZone: 'frozen', shelfLifeDays: 365 },
      { code: 'MED-001', name: '感冒药片', unit: '盒', temperatureZone: 'normal', shelfLifeDays: 730 },
      { code: 'MED-002', name: '胰岛素', unit: '支', temperatureZone: 'cold', shelfLifeDays: 180 },
      { code: 'ELEC-001', name: '手机电池', unit: '个', temperatureZone: 'constant', shelfLifeDays: 730 },
      { code: 'ELEC-002', name: '笔记本电脑', unit: '台', temperatureZone: 'constant', shelfLifeDays: 1095 },
      { code: 'ELEC-003', name: '耳机', unit: '副', temperatureZone: 'normal', shelfLifeDays: 1095 },
      { code: 'LOG-001', name: '快递包裹', unit: '件', temperatureZone: 'normal', shelfLifeDays: 30 }
    ];

    const categoryStmt = db.prepare(`
      INSERT INTO goods_categories (code, name, unit, temperature_zone, shelf_life_days)
      VALUES (?, ?, ?, ?, ?)
    `);

    categories.forEach(c => categoryStmt.run(c.code, c.name, c.unit, c.temperatureZone, c.shelfLifeDays));
    console.log('✅ 货物品类数据填充完成');

    const leases = [
      { merchantId: 2, locationId: 1, categoryId: 1, agreedCapacity: 30, billingMethod: 'monthly', unitPrice: 100, startDate: moment().subtract(60, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 2, locationId: 2, categoryId: 2, agreedCapacity: 25, billingMethod: 'monthly', unitPrice: 100, startDate: moment().subtract(50, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 2, locationId: 49, categoryId: 4, agreedCapacity: 40, billingMethod: 'per_volume', unitPrice: 5, startDate: moment().subtract(45, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 2, locationId: 50, categoryId: 5, agreedCapacity: 100, billingMethod: 'per_volume', unitPrice: 8, startDate: moment().subtract(40, 'days').format('YYYY-MM-DD'), status: 'active', priceTiers: JSON.stringify([{min:0,max:50,price:10},{min:51,max:200,price:7},{min:201,price:5}]) },
      { merchantId: 2, locationId: 97, categoryId: 6, agreedCapacity: 60, billingMethod: 'per_volume', unitPrice: 10, startDate: moment().subtract(35, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 3, locationId: 10, categoryId: 13, agreedCapacity: 200, billingMethod: 'daily', unitPrice: 0.5, startDate: moment().subtract(70, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 3, locationId: 11, categoryId: 13, agreedCapacity: 200, billingMethod: 'daily', unitPrice: 0.5, startDate: moment().subtract(70, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 4, locationId: 5, categoryId: 8, agreedCapacity: 50, billingMethod: 'monthly', unitPrice: 120, startDate: moment().subtract(55, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 4, locationId: 51, categoryId: 9, agreedCapacity: 30, billingMethod: 'per_volume', unitPrice: 15, startDate: moment().subtract(55, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 5, locationId: 53, categoryId: 10, agreedCapacity: 100, billingMethod: 'per_pallet', unitPrice: 50, startDate: moment().subtract(65, 'days').format('YYYY-MM-DD'), status: 'active', priceTiers: JSON.stringify([{min:0,max:50,price:60},{min:51,max:100,price:45},{min:101,price:35}]) },
      { merchantId: 5, locationId: 54, categoryId: 11, agreedCapacity: 40, billingMethod: 'per_pallet', unitPrice: 80, startDate: moment().subtract(65, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 5, locationId: 6, categoryId: 12, agreedCapacity: 150, billingMethod: 'monthly', unitPrice: 90, startDate: moment().subtract(60, 'days').format('YYYY-MM-DD'), status: 'active' },
      { merchantId: 2, locationId: 3, categoryId: 3, agreedCapacity: 45, billingMethod: 'monthly', unitPrice: 100, startDate: moment().subtract(10, 'days').format('YYYY-MM-DD'), status: 'pending' }
    ];

    const leaseStmt = db.prepare(`
      INSERT INTO leases (merchant_id, location_id, category_id, agreed_capacity, billing_method, unit_price, price_tiers, start_date, status, approved_at, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    leases.forEach(l => {
      const approvedAt = l.status === 'active' ? moment().subtract(59, 'days').format('YYYY-MM-DD HH:mm:ss') : null;
      const approvedBy = l.status === 'active' ? 1 : null;
      leaseStmt.run(l.merchantId, l.locationId, l.categoryId, l.agreedCapacity, l.billingMethod, l.unitPrice, l.priceTiers || null, l.startDate, l.status, approvedAt, approvedBy);
    });
    console.log('✅ 租约数据填充完成');

    const locationUpdateStmt = db.prepare(`
      UPDATE locations SET used_capacity = ?, status = 'occupied' WHERE id = ?
    `);

    leases.filter(l => l.status === 'active').forEach(l => {
      const loc = db.prepare('SELECT used_capacity FROM locations WHERE id = ?').get(l.locationId);
      const newUsed = (loc?.used_capacity || 0) + l.agreedCapacity;
      locationUpdateStmt.run(newUsed, l.locationId);
    });

    const generateBatchNo = (date) => 'B' + date.format('YYYYMMDD') + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const generateTxnNo = () => 'TX' + moment().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const inventoryBatches = [
      { merchantId: 2, categoryId: 1, locationId: 1, leaseId: 1, quantity: 25, unit: '袋', inboundDate: moment().subtract(55, 'days'), expiryDate: moment().add(300, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 1, locationId: 1, leaseId: 1, quantity: 20, unit: '袋', inboundDate: moment().subtract(25, 'days'), expiryDate: moment().add(330, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 2, locationId: 2, leaseId: 2, quantity: 20, unit: '袋', inboundDate: moment().subtract(45, 'days'), expiryDate: moment().add(120, 'days'), status: 'near_expiry' },
      { merchantId: 2, categoryId: 2, locationId: 2, leaseId: 2, quantity: 15, unit: '袋', inboundDate: moment().subtract(20, 'days'), expiryDate: moment().add(150, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 3, locationId: 3, leaseId: 13, quantity: 40, unit: '桶', inboundDate: moment().subtract(8, 'days'), expiryDate: moment().add(500, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 4, locationId: 49, leaseId: 3, quantity: 30, unit: '箱', inboundDate: moment().subtract(10, 'days'), expiryDate: moment().add(7, 'days'), status: 'near_expiry' },
      { merchantId: 2, categoryId: 4, locationId: 49, leaseId: 3, quantity: 35, unit: '箱', inboundDate: moment().subtract(3, 'days'), expiryDate: moment().add(15, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 5, locationId: 50, leaseId: 4, quantity: 80, unit: '公斤', inboundDate: moment().subtract(2, 'days'), expiryDate: moment().add(3, 'days'), status: 'near_expiry' },
      { merchantId: 2, categoryId: 6, locationId: 97, leaseId: 5, quantity: 50, unit: '箱', inboundDate: moment().subtract(28, 'days'), expiryDate: moment().add(140, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 6, locationId: 97, leaseId: 5, quantity: 25, unit: '箱', inboundDate: moment().subtract(100, 'days'), expiryDate: moment().add(60, 'days'), status: 'slow_moving' },
      { merchantId: 2, categoryId: 7, locationId: 98, leaseId: 5, quantity: 45, unit: '箱', inboundDate: moment().subtract(95, 'days'), expiryDate: moment().add(250, 'days'), status: 'slow_moving' },
      { merchantId: 3, categoryId: 13, locationId: 10, leaseId: 6, quantity: 150, unit: '件', inboundDate: moment().subtract(3, 'days'), status: 'normal' },
      { merchantId: 3, categoryId: 13, locationId: 10, leaseId: 6, quantity: 180, unit: '件', inboundDate: moment().subtract(1, 'days'), status: 'normal' },
      { merchantId: 3, categoryId: 13, locationId: 11, leaseId: 7, quantity: 120, unit: '件', inboundDate: moment().subtract(2, 'days'), status: 'normal' },
      { merchantId: 3, categoryId: 13, locationId: 11, leaseId: 7, quantity: 95, unit: '件', inboundDate: moment().subtract(5, 'days'), status: 'normal' },
      { merchantId: 4, categoryId: 8, locationId: 5, leaseId: 8, quantity: 40, unit: '盒', inboundDate: moment().subtract(50, 'days'), expiryDate: moment().add(650, 'days'), status: 'normal' },
      { merchantId: 4, categoryId: 8, locationId: 5, leaseId: 8, quantity: 35, unit: '盒', inboundDate: moment().subtract(120, 'days'), expiryDate: moment().add(580, 'days'), status: 'slow_moving' },
      { merchantId: 4, categoryId: 9, locationId: 51, leaseId: 9, quantity: 20, unit: '支', inboundDate: moment().subtract(15, 'days'), expiryDate: moment().add(150, 'days'), status: 'normal' },
      { merchantId: 5, categoryId: 10, locationId: 53, leaseId: 10, quantity: 70, unit: '个', inboundDate: moment().subtract(40, 'days'), expiryDate: moment().add(650, 'days'), status: 'normal' },
      { merchantId: 5, categoryId: 10, locationId: 53, leaseId: 10, quantity: 50, unit: '个', inboundDate: moment().subtract(110, 'days'), expiryDate: moment().add(580, 'days'), status: 'slow_moving' },
      { merchantId: 5, categoryId: 11, locationId: 54, leaseId: 11, quantity: 30, unit: '台', inboundDate: moment().subtract(30, 'days'), expiryDate: moment().add(1000, 'days'), status: 'normal' },
      { merchantId: 5, categoryId: 12, locationId: 6, leaseId: 12, quantity: 100, unit: '副', inboundDate: moment().subtract(20, 'days'), expiryDate: moment().add(1000, 'days'), status: 'normal' },
      { merchantId: 5, categoryId: 12, locationId: 6, leaseId: 12, quantity: 85, unit: '副', inboundDate: moment().subtract(15, 'days'), expiryDate: moment().add(1000, 'days'), status: 'normal' },
      { merchantId: 2, categoryId: 4, locationId: 49, leaseId: 3, quantity: 5, unit: '箱', inboundDate: moment().subtract(30, 'days'), expiryDate: moment().subtract(5, 'days'), status: 'expired' }
    ];

    const batchStmt = db.prepare(`
      INSERT INTO inventory_batches (batch_no, merchant_id, category_id, location_id, lease_id, quantity, unit, production_date, expiry_date, inbound_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    inventoryBatches.forEach(b => {
      const batchNo = generateBatchNo(b.inboundDate);
      const prodDate = b.expiryDate ? b.expiryDate.clone().subtract(categories[b.categoryId - 1].shelfLifeDays, 'days') : null;
      batchStmt.run(
        batchNo,
        b.merchantId,
        b.categoryId,
        b.locationId,
        b.leaseId,
        b.quantity,
        b.unit,
        prodDate ? prodDate.format('YYYY-MM-DD') : null,
        b.expiryDate ? b.expiryDate.format('YYYY-MM-DD') : null,
        b.inboundDate.format('YYYY-MM-DD'),
        b.status
      );
    });

    const locationUsedStmt = db.prepare(`
      UPDATE locations SET used_capacity = used_capacity + ? WHERE id = ?
    `);
    inventoryBatches.forEach(b => {
      locationUsedStmt.run(b.quantity, b.locationId);
    });
    console.log('✅ 库存批次数据填充完成');

    const generateOrderNo = (prefix) => prefix + moment().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const inboundOrders = [
      { merchantId: 2, warehouseId: 1, status: 'completed', arrivalDate: moment().subtract(55, 'days'), contactPerson: '张收货', contactPhone: '13800138001', totalQty: 25 },
      { merchantId: 2, warehouseId: 1, status: 'completed', arrivalDate: moment().subtract(45, 'days'), contactPerson: '张收货', contactPhone: '13800138001', totalQty: 35 },
      { merchantId: 2, warehouseId: 3, status: 'completed', arrivalDate: moment().subtract(40, 'days'), contactPerson: '张收货', contactPhone: '13800138001', totalQty: 80 },
      { merchantId: 3, warehouseId: 1, status: 'completed', arrivalDate: moment().subtract(3, 'days'), contactPerson: '李快递', contactPhone: '13900139002', totalQty: 330 },
      { merchantId: 4, warehouseId: 1, status: 'completed', arrivalDate: moment().subtract(50, 'days'), contactPerson: '王医药', contactPhone: '13900139003', totalQty: 75 },
      { merchantId: 5, warehouseId: 2, status: 'completed', arrivalDate: moment().subtract(40, 'days'), contactPerson: '赵电子', contactPhone: '13900139004', totalQty: 100 },
      { merchantId: 2, warehouseId: 1, status: 'checking', arrivalDate: moment(), contactPerson: '张收货', contactPhone: '13800138001', totalQty: 60 },
      { merchantId: 3, warehouseId: 1, status: 'pending', arrivalDate: moment().add(1, 'days'), contactPerson: '李快递', contactPhone: '13900139002', totalQty: 200 }
    ];

    const inboundOrderStmt = db.prepare(`
      INSERT INTO inbound_orders (order_no, merchant_id, warehouse_id, total_quantity, status, arrival_date, contact_person, contact_phone, checked_by, checked_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const inboundItemStmt = db.prepare(`
      INSERT INTO inbound_items (inbound_order_id, category_id, batch_no, planned_quantity, actual_quantity, unit, production_date, expiry_date, location_id, status, putaway_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txnStmt = db.prepare(`
      INSERT INTO transactions (txn_no, txn_type, reference_id, reference_no, merchant_id, warehouse_id, location_id, category_id, batch_id, lease_id, quantity, unit, operator_id, remarks, txn_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const getBatchLeaseId = (batchId) => {
      if (!batchId) return null;
      const row = db.prepare('SELECT lease_id FROM inventory_batches WHERE id = ?').get(batchId);
      return row ? row.lease_id : null;
    };

    inboundOrders.forEach((order, idx) => {
      const orderNo = generateOrderNo('IN');
      const checkedBy = ['completed', 'checking'].includes(order.status) ? 1 : null;
      const checkedAt = ['completed', 'checking'].includes(order.status) ? order.arrivalDate.clone().add(2, 'hours').format('YYYY-MM-DD HH:mm:ss') : null;
      const completedAt = order.status === 'completed' ? order.arrivalDate.clone().add(4, 'hours').format('YYYY-MM-DD HH:mm:ss') : null;

      const orderId = inboundOrderStmt.run(
        orderNo, order.merchantId, order.warehouseId, order.totalQty, order.status,
        order.arrivalDate.format('YYYY-MM-DD'), order.contactPerson, order.contactPhone,
        checkedBy, checkedAt, completedAt
      ).lastInsertRowid;

      if (idx === 0) {
        inboundItemStmt.run(orderId, 1, generateBatchNo(order.arrivalDate), 25, 25, '袋', null, moment().add(300, 'days').format('YYYY-MM-DD'), 1, 'completed', completedAt);
        if (order.status === 'completed') {
          txnStmt.run(generateTxnNo(), 'inbound', orderId, orderNo, order.merchantId, order.warehouseId, 1, 1, 1, getBatchLeaseId(1), 25, '袋', 1, '入库大米25袋', order.arrivalDate.format('YYYY-MM-DD HH:mm:ss'));
        }
      } else if (idx === 1) {
        inboundItemStmt.run(orderId, 2, generateBatchNo(order.arrivalDate), 20, 20, '袋', null, moment().add(120, 'days').format('YYYY-MM-DD'), 2, 'completed', completedAt);
        inboundItemStmt.run(orderId, 1, generateBatchNo(order.arrivalDate.clone().add(30, 'days')), 15, 15, '袋', null, moment().add(330, 'days').format('YYYY-MM-DD'), 1, 'completed', completedAt);
        if (order.status === 'completed') {
          txnStmt.run(generateTxnNo(), 'inbound', orderId, orderNo, order.merchantId, order.warehouseId, 2, 2, 3, getBatchLeaseId(3), 20, '袋', 1, '入库面粉20袋', order.arrivalDate.format('YYYY-MM-DD HH:mm:ss'));
          txnStmt.run(generateTxnNo(), 'inbound', orderId, orderNo, order.merchantId, order.warehouseId, 1, 1, 2, getBatchLeaseId(2), 15, '袋', 1, '入库大米15袋', order.arrivalDate.clone().add(25, 'days').format('YYYY-MM-DD HH:mm:ss'));
        }
      } else if (idx === 2) {
        inboundItemStmt.run(orderId, 4, generateBatchNo(order.arrivalDate), 30, 30, '箱', null, moment().add(7, 'days').format('YYYY-MM-DD'), 49, 'completed', completedAt);
        inboundItemStmt.run(orderId, 5, generateBatchNo(order.arrivalDate), 50, 50, '公斤', null, moment().add(3, 'days').format('YYYY-MM-DD'), 50, 'completed', completedAt);
      } else if (idx === 6) {
        inboundItemStmt.run(orderId, 3, generateBatchNo(moment()), 40, 40, '桶', null, moment().add(500, 'days').format('YYYY-MM-DD'), null, 'putaway', null);
        inboundItemStmt.run(orderId, 3, generateBatchNo(moment()), 20, 20, '桶', null, moment().add(500, 'days').format('YYYY-MM-DD'), null, 'putaway', null);
      } else if (idx === 7) {
        inboundItemStmt.run(orderId, 13, generateBatchNo(moment()), 200, 0, '件', null, null, null, 'pending', null);
      } else {
        const categoryId = [8, 13, 10, 11][idx - 3] || 1;
        const locationId = [5, 10, 53, 54][idx - 3] || 1;
        const qty = [75, 330, 100, 30][idx - 3] || 10;
        inboundItemStmt.run(orderId, categoryId, generateBatchNo(order.arrivalDate), qty, qty, categories[categoryId - 1].unit, null, null, locationId, 'completed', completedAt);
      }
    });
    console.log('✅ 入库单数据填充完成');

    const outboundOrders = [
      { merchantId: 2, warehouseId: 1, status: 'completed', deliveryDate: moment().subtract(40, 'days'), contactPerson: '刘客户', contactPhone: '13700137001', destination: '北京市朝阳区', totalQty: 10 },
      { merchantId: 2, warehouseId: 1, status: 'completed', deliveryDate: moment().subtract(20, 'days'), contactPerson: '王客户', contactPhone: '13700137002', destination: '北京市海淀区', totalQty: 8 },
      { merchantId: 3, warehouseId: 1, status: 'completed', deliveryDate: moment().subtract(2, 'days'), contactPerson: '赵收件', contactPhone: '13700137003', destination: '北京市通州区', totalQty: 100 },
      { merchantId: 5, warehouseId: 2, status: 'completed', deliveryDate: moment().subtract(10, 'days'), contactPerson: '孙买家', contactPhone: '13700137004', destination: '北京市丰台区', totalQty: 20 },
      { merchantId: 2, warehouseId: 3, status: 'picking', deliveryDate: moment(), contactPerson: '周客户', contactPhone: '13700137005', destination: '北京市西城区', totalQty: 25 },
      { merchantId: 3, warehouseId: 1, status: 'pending', deliveryDate: moment().add(2, 'days'), contactPerson: '吴客户', contactPhone: '13700137006', destination: '北京市东城区', totalQty: 50 }
    ];

    const outboundOrderStmt = db.prepare(`
      INSERT INTO outbound_orders (order_no, merchant_id, warehouse_id, total_quantity, status, delivery_date, contact_person, contact_phone, destination, picked_by, picked_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const outboundItemStmt = db.prepare(`
      INSERT INTO outbound_items (outbound_order_id, category_id, requested_quantity, allocated_quantity, unit, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const outboundAllocStmt = db.prepare(`
      INSERT INTO outbound_allocations (outbound_item_id, batch_id, quantity, picked_quantity)
      VALUES (?, ?, ?, ?)
    `);

    outboundOrders.forEach((order, idx) => {
      const orderNo = generateOrderNo('OUT');
      const pickedBy = ['completed', 'picking'].includes(order.status) ? 1 : null;
      const pickedAt = ['completed', 'picking'].includes(order.status) ? order.deliveryDate.clone().subtract(1, 'day').format('YYYY-MM-DD HH:mm:ss') : null;
      const completedAt = order.status === 'completed' ? order.deliveryDate.format('YYYY-MM-DD HH:mm:ss') : null;

      const orderId = outboundOrderStmt.run(
        orderNo, order.merchantId, order.warehouseId, order.totalQty, order.status,
        order.deliveryDate.format('YYYY-MM-DD'), order.contactPerson, order.contactPhone, order.destination,
        pickedBy, pickedAt, completedAt
      ).lastInsertRowid;

      const categoryId = [1, 2, 13, 11, 4, 13][idx] || 1;
      const unit = categories[categoryId - 1].unit;
      const itemStatus = order.status === 'pending' ? 'pending' : (order.status === 'picking' ? 'allocated' : 'picked');

      const itemId = outboundItemStmt.run(orderId, categoryId, order.totalQty, order.status === 'pending' ? 0 : order.totalQty, unit, itemStatus, null).lastInsertRowid;

      if (order.status !== 'pending') {
        const batchId = [1, 3, 12, 21, 6, 12][idx] || 1;
        outboundAllocStmt.run(itemId, batchId, order.totalQty, order.status === 'completed' ? order.totalQty : 0);

        if (order.status === 'completed') {
          txnStmt.run(generateTxnNo(), 'outbound', orderId, orderNo, order.merchantId, order.warehouseId,
            [1, 2, 10, 54, 49, 10][idx] || 1, categoryId, batchId, getBatchLeaseId(batchId), order.totalQty, unit, 1,
            `出库${categories[categoryId - 1].name}${order.totalQty}${unit}`,
            order.deliveryDate.format('YYYY-MM-DD HH:mm:ss'));
        }
      }
    });

    const recentTxns = [
      { type: 'inbound', merchantId: 2, warehouseId: 1, locationId: 1, categoryId: 1, qty: 20, unit: '袋', date: moment().subtract(25, 'days'), batchId: 2 },
      { type: 'inbound', merchantId: 2, warehouseId: 3, locationId: 49, categoryId: 4, qty: 35, unit: '箱', date: moment().subtract(3, 'days'), batchId: 7 },
      { type: 'inbound', merchantId: 2, warehouseId: 3, locationId: 50, categoryId: 5, qty: 80, unit: '公斤', date: moment().subtract(2, 'days'), batchId: 8 },
      { type: 'outbound', merchantId: 3, warehouseId: 1, locationId: 11, categoryId: 13, qty: 100, unit: '件', date: moment().subtract(2, 'days'), batchId: 14 },
      { type: 'outbound', merchantId: 5, warehouseId: 2, locationId: 54, categoryId: 11, qty: 20, unit: '台', date: moment().subtract(10, 'days'), batchId: 21 },
      { type: 'inbound', merchantId: 2, warehouseId: 1, locationId: 3, categoryId: 3, qty: 40, unit: '桶', date: moment().subtract(8, 'days'), batchId: 5 },
      { type: 'outbound', merchantId: 2, warehouseId: 3, locationId: 49, categoryId: 4, qty: 10, unit: '箱', date: moment().subtract(15, 'days'), batchId: 6 },
      { type: 'inbound', merchantId: 3, warehouseId: 1, locationId: 10, categoryId: 13, qty: 180, unit: '件', date: moment().subtract(1, 'days'), batchId: 13 },
      { type: 'inbound', merchantId: 3, warehouseId: 1, locationId: 11, categoryId: 13, qty: 120, unit: '件', date: moment().subtract(2, 'days'), batchId: 14 },
      { type: 'outbound', merchantId: 2, warehouseId: 1, locationId: 1, categoryId: 1, qty: 5, unit: '袋', date: moment().subtract(5, 'days'), batchId: 1 },
      { type: 'adjustment', merchantId: 2, warehouseId: 1, locationId: 2, categoryId: 2, qty: -1, unit: '袋', date: moment().subtract(10, 'days'), batchId: 3 },
      { type: 'transfer', merchantId: 2, warehouseId: 4, locationId: 97, categoryId: 6, qty: 25, unit: '箱', date: moment().subtract(28, 'days'), batchId: 10 }
    ];

    recentTxns.forEach(t => {
      const refNo = t.type === 'inbound' ? 'IN' + t.date.format('YYYYMMDD') + '001' :
                    t.type === 'outbound' ? 'OUT' + t.date.format('YYYYMMDD') + '001' :
                    t.type === 'transfer' ? 'TR' + t.date.format('YYYYMMDD') + '001' :
                    'ADJ' + t.date.format('YYYYMMDD') + '001';
      
      txnStmt.run(generateTxnNo(), t.type, 100 + Math.floor(Math.random() * 100), refNo,
        t.merchantId, t.warehouseId, t.locationId, t.categoryId, t.batchId || null,
        getBatchLeaseId(t.batchId),
        t.qty, t.unit, 1, `${t.type === 'inbound' ? '入库' : t.type === 'outbound' ? '出库' : t.type === 'transfer' ? '移库' : '调整'}${categories[t.categoryId - 1].name}${t.qty}${t.unit}`,
        t.date.format('YYYY-MM-DD HH:mm:ss'));
    });

    console.log('✅ 出库单和交易流水数据填充完成');

    const logStmt = db.prepare(`
      INSERT INTO system_logs (user_id, action, module, details)
      VALUES (?, ?, ?, ?)
    `);

    logStmt.run(1, 'login', 'auth', '系统初始化完成');
    logStmt.run(1, 'seed_data', 'system', '模拟数据填充完成');

    console.log('✅ 系统日志填充完成');

    console.log('\n🎉 所有模拟数据填充完成！');
    console.log('\n📋 默认账户：');
    console.log('   管理员: admin / 123456');
    console.log('   商户1: merchant1 / 123456 (鲜达食品)');
    console.log('   商户2: merchant2 / 123456 (速通快递)');
    console.log('   商户3: merchant3 / 123456 (康泰医药)');
    console.log('   商户4: merchant4 / 123456 (恒信电子)');
    console.log('\n📊 数据概览：');
    console.log('   - 4个仓库 (常温/恒温/冷藏/冷冻)');
    console.log('   - 240个库位');
    console.log('   - 13个货物品类');
    console.log('   - 13份租约');
    console.log('   - 24个库存批次');
    console.log('   - 8份入库单');
    console.log('   - 6份出库单');
    console.log('   - 多笔交易流水');
  } catch (err) {
    console.error('❌ 数据填充失败:', err.message);
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
};

if (require.main === module) {
  seedData();
}

module.exports = seedData;
