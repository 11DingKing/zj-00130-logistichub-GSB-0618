const db = require("../config/database");

const initDB = () => {
  console.log("🔧 开始初始化数据库...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'merchant')),
      phone TEXT,
      email TEXT,
      company_name TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      total_locations INTEGER DEFAULT 0,
      total_capacity REAL DEFAULT 0,
      used_capacity REAL DEFAULT 0,
      temperature_zone TEXT DEFAULT 'normal' CHECK(temperature_zone IN ('normal', 'cold', 'frozen', 'constant')),
      description TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      code TEXT UNIQUE NOT NULL,
      row TEXT NOT NULL,
      column TEXT NOT NULL,
      layer TEXT NOT NULL,
      capacity REAL NOT NULL,
      used_capacity REAL DEFAULT 0,
      temperature_zone TEXT DEFAULT 'normal' CHECK(temperature_zone IN ('normal', 'cold', 'frozen', 'constant')),
      allowed_categories TEXT,
      status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'locked', 'maintenance')),
      version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS goods_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      temperature_zone TEXT DEFAULT 'normal' CHECK(temperature_zone IN ('normal', 'cold', 'frozen', 'constant')),
      shelf_life_days INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      agreed_capacity REAL NOT NULL,
      billing_method TEXT NOT NULL CHECK(billing_method IN ('daily', 'monthly', 'per_pallet', 'per_volume')),
      unit_price REAL NOT NULL,
      price_tiers TEXT,
      start_date DATE NOT NULL,
      end_date DATE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'expired', 'terminated')),
      remarks TEXT,
      approved_at DATETIME,
      approved_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (category_id) REFERENCES goods_categories(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT UNIQUE NOT NULL,
      merchant_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      lease_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_volume REAL,
      production_date DATE,
      expiry_date DATE,
      inbound_date DATE NOT NULL,
      status TEXT DEFAULT 'normal' CHECK(status IN ('normal', 'near_expiry', 'expired', 'locked', 'slow_moving')),
      last_outbound_date DATE,
      last_move_date DATE,
      version INTEGER DEFAULT 0,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES goods_categories(id),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (lease_id) REFERENCES leases(id)
    );

    CREATE TABLE IF NOT EXISTS inbound_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      merchant_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      total_quantity REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'checking', 'putaway', 'completed', 'cancelled')),
      arrival_date DATE,
      contact_person TEXT,
      contact_phone TEXT,
      remarks TEXT,
      checked_by INTEGER,
      checked_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS inbound_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inbound_order_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      batch_no TEXT NOT NULL,
      planned_quantity REAL NOT NULL,
      actual_quantity REAL DEFAULT 0,
      unit TEXT NOT NULL,
      unit_volume REAL,
      production_date DATE,
      expiry_date DATE,
      location_id INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'putaway', 'completed', 'cancelled')),
      remarks TEXT,
      putaway_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inbound_order_id) REFERENCES inbound_orders(id),
      FOREIGN KEY (category_id) REFERENCES goods_categories(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE TABLE IF NOT EXISTS outbound_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      merchant_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      total_quantity REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'picking', 'checking', 'completed', 'cancelled')),
      delivery_date DATE,
      contact_person TEXT,
      contact_phone TEXT,
      destination TEXT,
      remarks TEXT,
      picked_by INTEGER,
      picked_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS outbound_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_order_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      requested_quantity REAL NOT NULL,
      allocated_quantity REAL DEFAULT 0,
      unit TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'allocated', 'picked', 'completed', 'cancelled')),
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (outbound_order_id) REFERENCES outbound_orders(id),
      FOREIGN KEY (category_id) REFERENCES goods_categories(id)
    );

    CREATE TABLE IF NOT EXISTS outbound_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_item_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      picked_quantity REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (outbound_item_id) REFERENCES outbound_items(id),
      FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_no TEXT UNIQUE NOT NULL,
      txn_type TEXT NOT NULL CHECK(txn_type IN ('inbound', 'outbound', 'transfer', 'adjustment')),
      reference_id INTEGER NOT NULL,
      reference_no TEXT,
      merchant_id INTEGER,
      warehouse_id INTEGER,
      location_id INTEGER,
      category_id INTEGER,
      batch_id INTEGER,
      quantity REAL NOT NULL,
      unit TEXT,
      operator_id INTEGER,
      txn_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_no TEXT UNIQUE NOT NULL,
      merchant_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      from_location_id INTEGER NOT NULL,
      to_location_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'cancelled')),
      reason TEXT,
      remarks TEXT,
      created_by INTEGER,
      processed_by INTEGER,
      completed_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (from_location_id) REFERENCES locations(id),
      FOREIGN KEY (to_location_id) REFERENCES locations(id),
      FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      merchant_id INTEGER NOT NULL,
      warehouse_id INTEGER DEFAULT 1,
      billing_period TEXT NOT NULL,
      billing_start_date DATE,
      billing_end_date DATE,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      adjusted_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'issued', 'paid', 'overdue', 'cancelled', 'disputed', 'dispute_rejected', 'adjusted')),
      due_date DATE,
      paid_at DATETIME,
      dispute_id INTEGER,
      issued_at DATETIME,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      lease_id INTEGER,
      location_id INTEGER,
      category_id INTEGER,
      description TEXT NOT NULL,
      billing_method TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '单位',
      days INTEGER,
      amount REAL NOT NULL,
      tier_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES bills(id),
      FOREIGN KEY (lease_id) REFERENCES leases(id),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (category_id) REFERENCES goods_categories(id)
    );

    CREATE TABLE IF NOT EXISTS bill_disputes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      merchant_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'rejected', 'adjusted')),
      admin_note TEXT,
      adjustment_amount REAL DEFAULT 0,
      adjustment_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by INTEGER,
      FOREIGN KEY (bill_id) REFERENCES bills(id),
      FOREIGN KEY (merchant_id) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_turnover_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      stat_date DATE NOT NULL,
      outbound_quantity REAL DEFAULT 0,
      avg_stock REAL DEFAULT 0,
      turnover_rate REAL DEFAULT 0,
      turnover_days REAL DEFAULT 0,
      transfer_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      UNIQUE(warehouse_id, stat_date)
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      module TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("✅ 数据库表创建完成");

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations(warehouse_id)",
    "CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_merchant ON inventory_batches(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_batches(location_id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory_batches(expiry_date)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_batches(status)",
    "CREATE INDEX IF NOT EXISTS idx_inbound_merchant ON inbound_orders(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_orders(status)",
    "CREATE INDEX IF NOT EXISTS idx_outbound_merchant ON outbound_orders(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_orders(status)",
    "CREATE INDEX IF NOT EXISTS idx_leases_merchant ON leases(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_txn_date ON transactions(txn_date)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(txn_type)",
    "CREATE INDEX IF NOT EXISTS idx_transfers_merchant ON inventory_transfers(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_transfers_status ON inventory_transfers(status)",
    "CREATE INDEX IF NOT EXISTS idx_transfers_from_location ON inventory_transfers(from_location_id)",
    "CREATE INDEX IF NOT EXISTS idx_transfers_to_location ON inventory_transfers(to_location_id)",
    "CREATE INDEX IF NOT EXISTS idx_bills_merchant ON bills(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(billing_period)",
    "CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status)",
    "CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id)",
    "CREATE INDEX IF NOT EXISTS idx_bill_items_lease ON bill_items(lease_id)",
    "CREATE INDEX IF NOT EXISTS idx_bill_disputes_bill ON bill_disputes(bill_id)",
    "CREATE INDEX IF NOT EXISTS idx_bill_disputes_merchant ON bill_disputes(merchant_id)",
    "CREATE INDEX IF NOT EXISTS idx_bill_disputes_status ON bill_disputes(status)",
    "CREATE INDEX IF NOT EXISTS idx_warehouse_turnover_date ON warehouse_turnover_stats(stat_date)",
    "CREATE INDEX IF NOT EXISTS idx_warehouse_turnover_warehouse ON warehouse_turnover_stats(warehouse_id)",
  ];

  indexes.forEach((idx) => {
    try {
      db.exec(idx);
    } catch (e) {
      console.log(`⚠️  索引创建跳过: ${idx.substring(0, 50)}...`);
    }
  });

  console.log("✅ 数据库索引创建完成");
  console.log("🎉 数据库初始化完成！");
};

if (require.main === module) {
  initDB();
}

module.exports = initDB;
