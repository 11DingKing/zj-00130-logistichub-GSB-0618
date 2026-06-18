const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
  }

  const isValidPassword = bcrypt.compareSync(password, user.password);

  if (!isValidPassword) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      companyName: user.company_name
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(user.id, 'login', 'auth', `用户 ${user.username} 登录成功`);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      phone: user.phone,
      email: user.email,
      companyName: user.company_name
    }
  });
};

const logout = (req, res) => {
  db.prepare('INSERT INTO system_logs (user_id, action, module, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, 'logout', 'auth', `用户 ${req.user.username} 登出`);
  
  res.json({ message: '登出成功' });
};

const getCurrentUser = (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, phone, email, company_name, status FROM users WHERE id = ?')
    .get(req.user.id);
  
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json(user);
};

module.exports = { login, logout, getCurrentUser };
