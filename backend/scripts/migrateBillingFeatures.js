const db = require('../config/database');

const migrate = () => {
  console.log('🔧 开始迁移计费功能...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_method TEXT NOT NULL CHECK(billing_method IN ('per_pallet', 'per_volume')),
      tier_from REAL NOT NULL,
      tier_to REAL,
      unit_price REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bill_disputes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      merchant_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'adjusted')),
      admin_notes TEXT,
      adjustment_amount REAL DEFAULT 0,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bill_id) REFERENCES bills(id),
      FOREIGN KEY (merchant_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_billing_tiers_method ON billing_tiers(billing_method);
    CREATE INDEX IF NOT EXISTS idx_bill_disputes_bill ON bill_disputes(bill_id);
    CREATE INDEX IF NOT EXISTS idx_bill_disputes_status ON bill_disputes(status);
  `);

  const existingColumns = db.prepare("PRAGMA table_info(bills)").all();
  const columnNames = existingColumns.map(c => c.name);
  
  if (!columnNames.includes('dispute_status')) {
    db.exec(`ALTER TABLE bills ADD COLUMN dispute_status TEXT DEFAULT 'none' CHECK(dispute_status IN ('none', 'pending', 'approved', 'rejected', 'adjusted'))`);
  }
  if (!columnNames.includes('adjusted_amount')) {
    db.exec(`ALTER TABLE bills ADD COLUMN adjusted_amount REAL DEFAULT 0`);
  }
  if (!columnNames.includes('final_amount')) {
    db.exec(`ALTER TABLE bills ADD COLUMN final_amount REAL`);
  }

  const existingTiers = db.prepare('SELECT COUNT(*) as count FROM billing_tiers').get().count;
  if (existingTiers === 0) {
    const insertTier = db.prepare(`
      INSERT INTO billing_tiers (billing_method, tier_from, tier_to, unit_price, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    insertTier.run('per_pallet', 0, 100, 2.5, '0-100托盘单价');
    insertTier.run('per_pallet', 101, 500, 2.0, '101-500托盘单价');
    insertTier.run('per_pallet', 501, null, 1.5, '500以上托盘单价');
    insertTier.run('per_volume', 0, 100, 1.8, '0-100方单价');
    insertTier.run('per_volume', 101, 500, 1.4, '101-500方单价');
    insertTier.run('per_volume', 501, null, 1.0, '500以上方单价');
  }

  console.log('✅ 迁移完成');
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;
