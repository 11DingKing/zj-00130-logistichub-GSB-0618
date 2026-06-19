const db = require('../config/database');

const migrate = () => {
  console.log('🔧 开始迁移：阶梯计价 & 账单争议功能...');

  try {
    db.exec(`ALTER TABLE leases ADD COLUMN price_tiers TEXT;`);
    console.log('✅ 添加 leases.price_tiers 字段');
  } catch (e) {
    console.log('⚠️  leases.price_tiers 字段可能已存在，跳过');
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bill_disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        merchant_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'rejected', 'adjusted')),
        admin_notes TEXT,
        adjustment_amount REAL DEFAULT 0,
        created_by INTEGER NOT NULL,
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id),
        FOREIGN KEY (merchant_id) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_bill_disputes_bill ON bill_disputes(bill_id);
      CREATE INDEX IF NOT EXISTS idx_bill_disputes_merchant ON bill_disputes(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_bill_disputes_status ON bill_disputes(status);
    `);
    console.log('✅ 创建 bill_disputes 表');
  } catch (e) {
    console.log('⚠️  bill_disputes 表可能已存在，跳过');
  }

  try {
    db.exec(`
      ALTER TABLE bill_items ADD COLUMN is_adjustment INTEGER DEFAULT 0;
      ALTER TABLE bill_items ADD COLUMN dispute_id INTEGER;
      ALTER TABLE bill_items ADD COLUMN tier_details TEXT;
    `);
    console.log('✅ 添加 bill_items 调整字段');
  } catch (e) {
    console.log('⚠️  bill_items 字段可能已存在，跳过');
  }

  try {
    db.exec(`
      ALTER TABLE bills ADD COLUMN disputed_at DATETIME;
      ALTER TABLE bills ADD COLUMN adjusted_at DATETIME;
    `);
    console.log('✅ 添加 bills 争议/调整时间字段');
  } catch (e) {
    console.log('⚠️  bills 字段可能已存在，跳过');
  }

  console.log('🎉 迁移完成！');
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;
