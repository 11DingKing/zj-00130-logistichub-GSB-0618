const db = require("../config/database");

const migrate = () => {
  console.log("🔧 开始执行数据库迁移: 阶梯计价 + 账单争议功能...");

  const existingColumns = db.prepare("PRAGMA table_info(leases)").all();
  const columnNames = existingColumns.map((c) => c.name);

  if (!columnNames.includes("price_tiers")) {
    db.exec(`ALTER TABLE leases ADD COLUMN price_tiers TEXT`);
    console.log("✅ leases 表添加 price_tiers 列");
  }

  const billItemColumns = db.prepare("PRAGMA table_info(bill_items)").all();
  const biColumnNames = billItemColumns.map((c) => c.name);

  if (!biColumnNames.includes("category_id")) {
    db.exec(
      `ALTER TABLE bill_items ADD COLUMN category_id INTEGER REFERENCES goods_categories(id)`,
    );
    console.log("✅ bill_items 表添加 category_id 列");
  }

  if (!biColumnNames.includes("tier_info")) {
    db.exec(`ALTER TABLE bill_items ADD COLUMN tier_info TEXT`);
    console.log("✅ bill_items 表添加 tier_info 列");
  }

  const billColumns = db.prepare("PRAGMA table_info(bills)").all();
  const bColumnNames = billColumns.map((c) => c.name);

  if (!bColumnNames.includes("dispute_id")) {
    db.exec(`ALTER TABLE bills ADD COLUMN dispute_id INTEGER`);
    console.log("✅ bills 表添加 dispute_id 列");
  }
  if (!bColumnNames.includes("adjusted_amount")) {
    db.exec(`ALTER TABLE bills ADD COLUMN adjusted_amount REAL DEFAULT 0`);
    console.log("✅ bills 表添加 adjusted_amount 列");
  }
  if (!bColumnNames.includes("issued_at")) {
    db.exec(`ALTER TABLE bills ADD COLUMN issued_at DATETIME`);
    console.log("✅ bills 表添加 issued_at 列");
  }

  const billCreateSQL = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='bills'",
    )
    .get();
  const needsRebuild =
    billCreateSQL &&
    !billCreateSQL.sql.includes("'disputed'") &&
    !billCreateSQL.sql.includes("'dispute_rejected'");

  if (needsRebuild) {
    console.log("🔧 重建 bills 表以更新状态 CHECK 约束...");
    db.exec("PRAGMA foreign_keys = OFF");

    const existingBills = db.prepare("SELECT * FROM bills").all();

    db.exec(`DROP TABLE IF EXISTS bills_new`);
    db.exec(`
      CREATE TABLE bills_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_no TEXT UNIQUE NOT NULL,
        merchant_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        billing_period TEXT NOT NULL,
        billing_start_date DATE,
        billing_end_date DATE,
        total_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'issued', 'paid', 'overdue', 'cancelled', 'disputed', 'dispute_rejected', 'adjusted')),
        due_date DATE,
        issued_at DATETIME,
        paid_at DATETIME,
        remarks TEXT,
        dispute_id INTEGER,
        adjusted_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (merchant_id) REFERENCES users(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      )
    `);

    const insertBill = db.prepare(`
      INSERT INTO bills_new (id, bill_no, merchant_id, warehouse_id, billing_period,
        billing_start_date, billing_end_date, total_amount, paid_amount, status,
        due_date, issued_at, paid_at, remarks, dispute_id, adjusted_amount, created_at, updated_at)
      VALUES (@id, @bill_no, @merchant_id, @warehouse_id, @billing_period,
        @billing_start_date, @billing_end_date, @total_amount, @paid_amount, @status,
        @due_date, @issued_at, @paid_at, @remarks, @dispute_id, @adjusted_amount, @created_at, @updated_at)
    `);

    const insertMany = db.transaction((bills) => {
      for (const bill of bills) {
        insertBill.run({
          id: bill.id,
          bill_no: bill.bill_no,
          merchant_id: bill.merchant_id,
          warehouse_id: bill.warehouse_id,
          billing_period: bill.billing_period,
          billing_start_date: bill.billing_start_date,
          billing_end_date: bill.billing_end_date,
          total_amount: bill.total_amount || 0,
          paid_amount: bill.paid_amount || 0,
          status: bill.status || "pending",
          due_date: bill.due_date,
          issued_at: bill.issued_at,
          paid_at: bill.paid_at,
          remarks: bill.remarks,
          dispute_id: bill.dispute_id,
          adjusted_amount: bill.adjusted_amount || 0,
          created_at: bill.created_at,
          updated_at: bill.updated_at,
        });
      }
    });
    insertMany(existingBills);

    db.exec(`DROP TABLE bills`);
    db.exec(`ALTER TABLE bills_new RENAME TO bills`);
    db.exec("PRAGMA foreign_keys = ON");
    console.log("✅ bills 表重建完成，状态约束已更新");
  }

  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='bill_disputes'",
    )
    .get();

  if (!tableExists) {
    db.exec(`
      CREATE TABLE bill_disputes (
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
      )
    `);
    console.log("✅ 创建 bill_disputes 表");

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_bill_disputes_bill ON bill_disputes(bill_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_bill_disputes_merchant ON bill_disputes(merchant_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_bill_disputes_status ON bill_disputes(status)`,
    );
  }

  console.log("🎉 数据库迁移完成！");
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;
