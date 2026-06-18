const db = require('../config/database');

const migrate = () => {
  console.log('🔧 开始数据库迁移...');

  try {
    const columns1 = db.pragma('table_info(locations)');
    const hasLocationVersion = columns1.some(c => c.name === 'version');
    if (!hasLocationVersion) {
      db.exec('ALTER TABLE locations ADD COLUMN version INTEGER DEFAULT 0');
      console.log('✅ locations 表添加 version 字段');
    } else {
      console.log('ℹ️  locations 表已存在 version 字段');
    }

    const columns2 = db.pragma('table_info(inventory_batches)');
    const hasBatchVersion = columns2.some(c => c.name === 'version');
    const hasLastMoveDate = columns2.some(c => c.name === 'last_move_date');
    
    if (!hasBatchVersion) {
      db.exec('ALTER TABLE inventory_batches ADD COLUMN version INTEGER DEFAULT 0');
      console.log('✅ inventory_batches 表添加 version 字段');
    } else {
      console.log('ℹ️  inventory_batches 表已存在 version 字段');
    }

    if (!hasLastMoveDate) {
      db.exec('ALTER TABLE inventory_batches ADD COLUMN last_move_date DATE');
      console.log('✅ inventory_batches 表添加 last_move_date 字段');
    } else {
      console.log('ℹ️  inventory_batches 表已存在 last_move_date 字段');
    }

    db.exec(`
      UPDATE inventory_batches 
      SET last_move_date = COALESCE(last_outbound_date, inbound_date)
      WHERE last_move_date IS NULL
    `);
    console.log('✅ 初始化 last_move_date 字段');

    console.log('🎉 数据库迁移完成！');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    throw err;
  }
};

if (require.main === module) {
  migrate();
}

module.exports = migrate;
