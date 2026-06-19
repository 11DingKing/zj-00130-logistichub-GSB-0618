const db = require('../config/database');

const migrate = () => {
  console.log('🔧 开始账单/计费 V2 迁移...');

  try {
    const leaseCols = db.pragma('table_info(leases)');
    const hasPricingTiers = leaseCols.some(c => c.name === 'pricing_tiers');
    if (!hasPricingTiers) {
      db.exec('ALTER TABLE leases ADD COLUMN pricing_tiers TEXT');
      console.log('✅ leases 表添加 pricing_tiers 字段（JSON 文本，null 表示一口价）');
    } else {
      console.log('ℹ️  leases 表已存在 pricing_tiers 字段');
    }

    const billCols = db.pragma('table_info(bills)');
    const hasIssuedAt = billCols.some(c => c.name === 'issued_at');
    if (!hasIssuedAt) {
      db.exec('ALTER TABLE bills ADD COLUMN issued_at DATETIME');
      console.log('✅ bills 表补齐 issued_at 字段');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS bills_v2_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_no TEXT UNIQUE NOT NULL,
        merchant_id INTEGER NOT NULL,
        warehouse_id INTEGER,
        billing_period TEXT NOT NULL,
        billing_start_date DATE,
        billing_end_date DATE,
        total_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'issued', 'paid', 'overdue', 'cancelled', 'disputed', 'adjusted')),
        due_date DATE,
        issued_at DATETIME,
        paid_at DATETIME,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (merchant_id) REFERENCES users(id)
      )
    `);

    const sample = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bills'").get();
    const needsStatusExpand = sample && sample.sql && !/disputed/.test(sample.sql);
    if (needsStatusExpand) {
      console.log('🔧 bills.status CHECK 约束需要扩展，重建表...');
      db.exec('DROP TABLE IF EXISTS bills_v2_tmp');
      const tx = db.transaction(() => {
        db.exec(`
          CREATE TABLE bills_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_no TEXT UNIQUE NOT NULL,
            merchant_id INTEGER NOT NULL,
            warehouse_id INTEGER,
            billing_period TEXT NOT NULL,
            billing_start_date DATE,
            billing_end_date DATE,
            total_amount REAL DEFAULT 0,
            paid_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'issued', 'paid', 'overdue', 'cancelled', 'disputed', 'adjusted')),
            due_date DATE,
            issued_at DATETIME,
            paid_at DATETIME,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (merchant_id) REFERENCES users(id)
          )
        `);

        const oldCols = db.pragma('table_info(bills)').map(c => c.name);
        const copyCols = ['id','bill_no','merchant_id','warehouse_id','billing_period','billing_start_date','billing_end_date','total_amount','paid_amount','status','due_date','issued_at','paid_at','remarks','created_at','updated_at']
          .filter(c => oldCols.includes(c));
        const colList = copyCols.join(',');
        db.exec(`INSERT INTO bills_new (${colList}) SELECT ${colList} FROM bills`);
        db.exec('DROP TABLE bills');
        db.exec('ALTER TABLE bills_new RENAME TO bills');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bills_merchant ON bills(merchant_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(billing_period)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status)');
      });
      tx();
      console.log('✅ bills 表 status 状态机扩展为 7 个状态（新增 disputed/adjusted）');
    } else {
      console.log('ℹ️  bills.status 已包含 disputed/adjusted');
    }
    db.exec('DROP TABLE IF EXISTS bills_v2_tmp');

    const itemCols = db.pragma('table_info(bill_items)');
    const hasItemType = itemCols.some(c => c.name === 'item_type');
    if (!hasItemType) {
      db.exec("ALTER TABLE bill_items ADD COLUMN item_type TEXT DEFAULT 'normal'");
      console.log("✅ bill_items 表添加 item_type 字段（normal / adjustment 红字调整）");
    }
    const hasTierBreakdown = itemCols.some(c => c.name === 'tier_breakdown');
    if (!hasTierBreakdown) {
      db.exec('ALTER TABLE bill_items ADD COLUMN tier_breakdown TEXT');
      console.log('✅ bill_items 表添加 tier_breakdown 字段（阶梯计费明细 JSON）');
    }
    const hasCategoryId = itemCols.some(c => c.name === 'category_id');
    if (!hasCategoryId) {
      db.exec('ALTER TABLE bill_items ADD COLUMN category_id INTEGER REFERENCES goods_categories(id)');
      console.log('✅ bill_items 表添加 category_id 字段（账单明细品类外键）');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS bill_disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        merchant_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        expected_amount REAL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        admin_id INTEGER,
        admin_response TEXT,
        adjustment_amount REAL,
        adjustment_item_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        FOREIGN KEY (bill_id) REFERENCES bills(id),
        FOREIGN KEY (merchant_id) REFERENCES users(id),
        FOREIGN KEY (admin_id) REFERENCES users(id),
        FOREIGN KEY (adjustment_item_id) REFERENCES bill_items(id)
      )
    `);
    console.log('✅ bill_disputes 表已创建');

    db.exec('CREATE INDEX IF NOT EXISTS idx_disputes_bill ON bill_disputes(bill_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_disputes_merchant ON bill_disputes(merchant_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_disputes_status ON bill_disputes(status)');

    console.log('🎉 账单/计费 V2 迁移完成！');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    throw err;
  }
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;
