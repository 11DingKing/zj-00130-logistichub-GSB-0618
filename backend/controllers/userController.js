const bcrypt = require('bcryptjs');
const db = require('../config/database');

const getAllUsers = (req, res) => {
  const { role, status } = req.query;
  
  let sql = 'SELECT id, username, name, role, phone, email, company_name, status, created_at FROM users WHERE 1=1';
  const params = [];

  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';
  
  const users = db.prepare(sql).all(...params);
  res.json(users);
};

const getMerchants = (req, res) => {
  const merchants = db.prepare(`
    SELECT u.id, u.username, u.name, u.phone, u.email, u.company_name, u.status,
           COUNT(l.id) as lease_count,
           SUM(CASE WHEN l.status = 'active' THEN 1 ELSE 0 END) as active_lease_count
    FROM users u
    LEFT JOIN leases l ON u.id = l.merchant_id
    WHERE u.role = 'merchant'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  
  res.json(merchants);
};

const getUserById = (req, res) => {
  const { id } = req.params;
  
  if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: '权限不足' });
  }

  const user = db.prepare('SELECT id, username, name, role, phone, email, company_name, status, created_at FROM users WHERE id = ?')
    .get(id);
  
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json(user);
};

const createUser = (req, res) => {
  const { username, password, name, role, phone, email, companyName } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: '用户名、密码、姓名、角色为必填项' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (username, password, name, role, phone, email, company_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(username, hashedPassword, name, role, phone, email, companyName);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'create_user', 'users', `创建用户: ${username}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: '用户创建成功'
  });
};

const updateUser = (req, res) => {
  const { id } = req.params;
  
  if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: '权限不足' });
  }

  const { name, phone, email, companyName, status } = req.body;

  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existingUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const updateFields = [];
  const updateValues = [];

  if (name) { updateFields.push('name = ?'); updateValues.push(name); }
  if (phone) { updateFields.push('phone = ?'); updateValues.push(phone); }
  if (email) { updateFields.push('email = ?'); updateValues.push(email); }
  if (companyName) { updateFields.push('company_name = ?'); updateValues.push(companyName); }
  if (status && req.user.role === 'admin') { updateFields.push('status = ?'); updateValues.push(status); }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  updateValues.push(id);

  db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`)
    .run(...updateValues);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'update_user', 'users', `更新用户: ${id}`);

  res.json({ message: '用户更新成功' });
};

const deleteUser = (req, res) => {
  const { id } = req.params;

  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existingUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('inactive', id);

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'delete_user', 'users', `禁用用户: ${id}`);

  res.json({ message: '用户已禁用' });
};

module.exports = { getAllUsers, getMerchants, getUserById, createUser, updateUser, deleteUser };
