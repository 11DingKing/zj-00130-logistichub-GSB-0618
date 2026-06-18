# 园区仓储平台 - 完整架构说明文档

> 本文档深度解析园区级物流枢纽运营平台的前后端架构、业务流程、数据流转及核心算法。适用于开发人员快速上手、运维人员排障、产品人员理解业务逻辑。

---

## 目录

1. [项目技术栈概览](#1-项目技术栈概览)
2. [双角色权限体系详解](#2-双角色权限体系详解)
3. [核心业务流程详解](#3-核心业务流程详解)
4. [库存管控核心算法](#4-库存管控核心算法)
5. [三层架构协作关系](#5-三层架构协作关系)
6. [货物全生命周期数据流向图](#6-货物全生命周期数据流向图)
7. [数据库表关系与关键字段](#7-数据库表关系与关键字段)
8. [关键代码索引](#8-关键代码索引)
9. [附录：常量定义与状态枚举](#9-附录常量定义与状态枚举)

---

## 1. 项目技术栈概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React SPA)                    │
│  React 18 + React Router 6 + Ant Design 5 + Axios       │
│  ECharts (数据可视化) + Day.js (时间处理)                │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / REST API (JWT认证)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   后端 (Node.js + Express)              │
│  Express 4 + better-sqlite3 + JWT + bcryptjs            │
│  Moment.js + 事务支持 + 并发控制(乐观锁)                 │
└────────────────────┬────────────────────────────────────┘
                     │ 数据库驱动
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    数据库 (SQLite 3)                    │
│  WAL模式 + 外键约束 + 索引优化 + 20+业务表               │
└─────────────────────────────────────────────────────────┘
```

### 1.2 后端技术要点

| 技术 | 用途 | 关键文件 |
|------|------|----------|
| Express 4 | Web服务框架 | `backend/server.js` |
| better-sqlite3 | 高性能SQLite驱动 | `backend/config/database.js` |
| JWT | 身份认证 | `backend/middleware/auth.js` |
| bcryptjs | 密码加密 | `backend/controllers/authController.js` |
| Moment.js | 时间计算 | 各业务控制器 |
| 数据库事务 | 原子操作保证 | 入库/出库/租约审核流程 |

### 1.3 前端技术要点

| 技术 | 用途 | 关键文件 |
|------|------|----------|
| React 18 | UI框架 | `frontend/src/main.jsx` |
| React Router 6 | 路由管理 | `frontend/src/App.jsx` |
| Ant Design 5 | UI组件库 | 各页面组件 |
| Axios | HTTP客户端 | `frontend/src/services/api.js` |
| ECharts | 图表可视化 | 统计分析页面 |
| React Context | 全局状态管理 | `frontend/src/context/AuthContext.jsx` |

---

## 2. 双角色权限体系详解

系统设计了 **管理员（仓管）** 和 **入驻商户** 两种角色，权限严格隔离。

### 2.1 角色权限对比表

| 功能模块 | 管理员(admin) | 入驻商户(merchant) |
|---------|--------------|-------------------|
| **运营总览** | ✅ 全平台数据概览 | ❌ |
| **商户总览** | ❌ | ✅ 仅本人数据概览 |
| **库位管理** | ✅ 增删改查、温区配置 | ❌ |
| **入库管理** | ✅ 验货、上架、查看全部 | ✅ 创建申请、查看本人 |
| **出库管理** | ✅ 分配库存、拣货、查看全部 | ✅ 创建申请、查看本人 |
| **库存管理** | ✅ 全局查询、盘点、呆滞货标记 | ✅ 查看本人库存 |
| **移库管理** | ✅ 处理移库申请 | ✅ 发起移库申请 |
| **租约管理** | ✅ 审核、终止、查看全部 | ✅ 申请租赁、查看本人 |
| **账单管理** | ✅ 生成账单、标记缴费、查看全部 | ✅ 查看本人账单、缴费 |
| **统计分析** | ✅ 周转率、利用率、收入趋势 | ❌ |
| **商户管理** | ✅ 商户增删改查 | ❌ |

### 2.2 前端路由与布局

**管理员路由** (`/admin/*`) - 见 `frontend/src/App.jsx:89-108`
```
/admin                → 运营总览 (Dashboard)
/admin/locations      → 库位管理
/admin/inbound        → 入库管理
/admin/outbound       → 出库管理
/admin/inventory      → 库存管理
/admin/transfers      → 移库管理
/admin/leases         → 租约管理
/admin/bills          → 账单管理
/admin/stats          → 统计分析
/admin/merchants      → 商户管理
```

**商户路由** (`/merchant/*`) - 见 `frontend/src/App.jsx:111-126`
```
/merchant             → 商户总览
/merchant/inventory   → 我的库存
/merchant/inbound     → 入库申请
/merchant/outbound    → 出库申请
/merchant/leases      → 租约管理
/merchant/bills       → 我的账单
```

### 2.3 权限控制机制

**后端中间件** - `backend/middleware/auth.js`
- `authenticateToken`: JWT令牌验证，解析用户信息到 `req.user`
- `requireRole(...roles)`: 角色白名单校验，返回403禁止访问

**路由示例** - `backend/routes/inbound.js`
```javascript
// 双方都可查看，但商户只能看自己的（由controller内过滤）
router.get('/', authenticateToken, inboundController.getAllInboundOrders);
// 仅商户可创建入库单
router.post('/', authenticateToken, requireRole('merchant'), inboundController.createInboundOrder);
// 仅管理员可验货、上架
router.put('/:id/check', authenticateToken, requireRole('admin'), inboundController.checkInboundOrder);
router.put('/:id/putaway', authenticateToken, requireRole('admin'), inboundController.putawayItems);
```

### 2.4 数据隔离机制

所有列表查询在Controller层实现数据过滤：

```javascript
// 示例：入库单列表 - backend/controllers/inboundController.js:34-67
if (req.user.role === "merchant") {
  sql += " AND io.merchant_id = ?";  // 商户只能看自己的
  params.push(req.user.id);
} else if (merchantId) {
  sql += " AND io.merchant_id = ?";  // 管理员可筛选商户
  params.push(merchantId);
}
```

---

## 3. 核心业务流程详解

### 3.1 入库流程：从申请到上架

#### 3.1.1 流程概览

```
【商户】创建入库单
    ↓ (POST /api/inbound)
【系统】校验：是否有有效租约、库存是否充足
    ↓
【状态】inbound_orders.status = 'pending'
    ↓
【商户】可追加明细 (POST /api/inbound/:id/items)
    ↓
【仓管】验货，录入实际数量
    ↓ (PUT /api/inbound/:id/check)
【状态】inbound_orders.status = 'checking'
       inbound_items.status = 'putaway'
    ↓
【仓管】指定库位，执行上架
    ↓ (PUT /api/inbound/:id/putaway)
【关键操作】
  1. 校验库位容量（乐观锁：version + capacity判断）
  2. 库位容量实时扣减（locations.used_capacity += 数量）
  3. 创建库存批次（inventory_batches）
  4. 自动判定批次状态（临期/过期）
  5. 写入交易流水（transactions）
    ↓
【状态】全部上架完成后 → 'completed'
```

#### 3.1.2 库位分配与容量扣减

**核心代码** - `backend/controllers/inboundController.js:382-570`

```javascript
// 1. 库位容量原子性更新（带乐观锁检查）
const locationUpdate = db
  .prepare(
    `
    UPDATE locations 
    SET used_capacity = used_capacity + ?, 
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? 
      AND capacity - used_capacity >= ?
  `
  )
  .run(putawayQty, item.locationId, putawayQty);

if (locationUpdate.changes === 0) {
  throw new Error("库位容量不足，存在并发操作");
}

// 2. 创建库存批次，自动判定保质期状态
let batchStatus = "normal";
if (inboundItem.expiry_date) {
  const daysToExpiry = moment(inboundItem.expiry_date).diff(moment(), "days");
  if (daysToExpiry <= 0) {
    batchStatus = "expired";      // 已过期
  } else if (daysToExpiry <= 30) {
    batchStatus = "near_expiry";  // 临期（30天内）
  }
}
```

#### 3.1.3 批次号生成规则

**代码** - `backend/controllers/inboundController.js:14-22`
```
B + YYYYMMDD + 4位随机数
示例：B202501150001
```

#### 3.1.4 三层协作对应关系

| 步骤 | 前端页面 | 后端接口 | 数据表 |
|------|---------|---------|--------|
| 创建入库单 | `pages/merchant/Inbound.jsx` | `POST /api/inbound` | `inbound_orders`, `inbound_items` |
| 验货 | `pages/admin/Inbound.jsx` | `PUT /api/inbound/:id/check` | `inbound_orders.status`, `inbound_items.actual_quantity` |
| 上架 | `pages/admin/Inbound.jsx` | `PUT /api/inbound/:id/putaway` | `locations.used_capacity`, `inventory_batches`, `transactions` |

---

### 3.2 出库流程：先进先出与库存核减

#### 3.2.1 流程概览

```
【商户】创建出库单
    ↓ (POST /api/outbound)
【系统】校验库存总量是否充足
    ↓
【状态】outbound_orders.status = 'pending'
    ↓
【仓管】一键分配库存（FIFO策略）
    ↓ (POST /api/outbound/:id/allocate)
【关键操作】
  1. 按入库时间升序查询可用批次（FIFO）
  2. 优先级：临期 > 呆滞 > 正常
  3. 多批次分配，自动拆批
  4. 写入outbound_allocations分配明细
    ↓
【状态】outbound_orders.status = 'picking'
       outbound_items.status = 'allocated'
    ↓
【仓管】拣货确认
    ↓ (PUT /api/outbound/:id/pick)
【关键操作】
  1. 校验批次未过期、未锁定
  2. 库存批次数量扣减（乐观锁version校验）
  3. 库位容量释放（used_capacity -= 数量）
  4. 批次出库后置处理：
     - 数量清零 → status = 'locked'
     - 呆滞库存被出库 → status = 'normal'
  5. 写入交易流水
    ↓
【状态】outbound_orders.status = 'checking' → 'completed'
```

#### 3.2.2 先进先出（FIFO）算法

**核心代码** - `backend/controllers/outboundController.js:266-420`

```javascript
// 批次排序策略 - SQL ORDER BY
ORDER BY 
  ib.inbound_date ASC,                  // 1. 入库时间最早优先（FIFO核心）
  CASE ib.status 
    WHEN 'near_expiry' THEN 0           // 2. 临期优先出库
    WHEN 'slow_moving' THEN 1           // 3. 呆滞货优先出库
    ELSE 2 
  END,
  ib.expiry_date ASC                    // 4. 保质期更近优先

// 多批次自动拆批
let remainingQty = item.requested_quantity;
for (const batch of batches) {
  if (remainingQty <= 0) break;
  const allocateQty = Math.min(remainingQty, batch.quantity);
  // 写入分配明细
  db.prepare(`
    INSERT INTO outbound_allocations (outbound_item_id, batch_id, quantity)
    VALUES (?, ?, ?)
  `).run(item.id, batch.id, allocateQty);
  remainingQty -= allocateQty;
}
```

#### 3.2.3 库存核减与并发控制

**核心代码** - `backend/controllers/outboundController.js:486-516`

```javascript
// 带乐观锁的批次数量更新
const batchUpdate = db
  .prepare(
    `
    UPDATE inventory_batches 
    SET quantity = quantity - ?, 
        last_outbound_date = CURRENT_DATE,
        last_move_date = CURRENT_DATE,
        version = version + 1,
        status = CASE 
          WHEN quantity - ? <= 0 THEN 'locked'
          WHEN status = 'slow_moving' AND quantity - ? > 0 THEN 'normal'
          ELSE status 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? 
      AND quantity >= ?
      AND version = ?
  `
  )
  .run(pickQty, pickQty, pickQty, oi.batch_id, pickQty, batch.version);

if (batchUpdate.changes === 0) {
  throw new Error("库存已变更，请重新分配");
}

// 同步释放库位容量
db.prepare(
  `UPDATE locations SET used_capacity = used_capacity - ?, version = version + 1 
   WHERE id = ? AND used_capacity >= ?`
).run(pickQty, batch.location_id, pickQty);
```

#### 3.2.4 三层协作对应关系

| 步骤 | 前端页面 | 后端接口 | 数据表 |
|------|---------|---------|--------|
| 创建出库单 | `pages/merchant/Outbound.jsx` | `POST /api/outbound` | `outbound_orders`, `outbound_items` |
| 分配库存 | `pages/admin/Outbound.jsx` | `POST /api/outbound/:id/allocate` | `outbound_allocations`, `outbound_items.status` |
| 拣货确认 | `pages/admin/Outbound.jsx` | `PUT /api/outbound/:id/pick` | `inventory_batches.quantity`, `locations.used_capacity`, `transactions` |

---

## 4. 库存管控核心算法

### 4.1 保质期管控机制

#### 4.1.1 状态自动判定

| 状态 | 判定条件 | 阈值 | 能否出库 |
|------|---------|------|---------|
| `normal` | 保质期 > 30天 | - | ✅ |
| `near_expiry` | 0 < 保质期 ≤ 30天 | 30天 | ✅（优先出库） |
| `expired` | 保质期 ≤ 0 | 0天 | ❌ |

**判定时机**：
1. 入库上架时自动计算 - `inboundController.js:444-454`
2. 盘点时批量更新 - `inventoryController.js:317-390`
3. 出库拣货时二次校验 - `outboundController.js:459-476`

#### 4.1.2 临期/过期查询接口

```javascript
// 临期库存查询 - 默认30天阈值
GET /api/inventory/near-expiry?days=15

// 过期库存查询
GET /api/inventory/expired
```

**SQL核心逻辑** - `inventoryController.js:241-279`
```sql
WHERE ib.expiry_date IS NOT NULL
  AND julianday(ib.expiry_date) - julianday('now') <= ?  -- 小于阈值天数
  AND julianday(ib.expiry_date) - julianday('now') > 0   -- 还未过期
```

### 4.2 呆滞货（Slow Moving）判定

#### 4.2.1 判定规则

**定义**：库存在库超过一定天数未发生移动（入库或出库）

| 判定维度 | 计算公式 | 默认阈值 |
|---------|---------|---------|
| 无移动记录 | `当前日期 - inbound_date ≥ N天` | 90天 |
| 有移动记录 | `当前日期 - last_move_date ≥ N天` | 90天 |

**触发场景**：
1. 管理员主动盘点 - `POST /api/inventory/check-slow-moving`
2. 查询接口动态计算 - `GET /api/inventory/slow-moving`

**核心代码** - `inventoryController.js:317-379`
```javascript
UPDATE inventory_batches
SET status = 'slow_moving'
WHERE quantity > 0
  AND status = 'normal'
  AND (
    (last_move_date IS NULL AND julianday('now') - julianday(inbound_date) >= ?)
    OR (last_move_date IS NOT NULL AND julianday('now') - julianday(last_move_date) >= ?)
  )
```

#### 4.2.2 呆滞货出库特殊处理

出库时呆滞货批次会**优先分配**（见3.2.2 FIFO排序），且出库后状态自动恢复：

```javascript
-- 出库时状态自动更新
status = CASE 
  WHEN status = 'slow_moving' AND quantity - ? > 0 THEN 'normal'
  ELSE status 
END
```

### 4.3 库存周转计算

#### 4.3.1 核心公式

| 指标 | 公式 | 含义 |
|------|------|------|
| **库存周转率** | `出库总量 / 平均库存 / (统计天数/30)` | 每月库存周转次数 |
| **周转天数** | `30 / 库存周转率` | 库存周转一次需要的天数 |
| **库位利用率** | `used_capacity / capacity × 100%` | 库位容量使用比例 |
| **库位占用率** | `occupied_locations / total_locations × 100%` | 已占用库位比例 |
| **呆滞率** | `呆滞库存数量 / 总库存数量 × 100%` | 呆滞库存占比 |

#### 4.3.2 代码实现

**全局周转率** - `statsController.js:171-251`
```javascript
// 统计周期内出库总量
const outboundQty = db.prepare(`
  SELECT COALESCE(SUM(quantity), 0) as total
  FROM transactions WHERE txn_type = 'outbound' AND txn_date >= ?
`).get(startDate).total;

// 周转率计算（按月）
const turnoverRate = avgStock > 0 ? outboundQty / avgStock / (daysNum / 30) : 0;
const turnoverDays = turnoverRate > 0 ? 30 / turnoverRate : null;
```

**按仓库周转率** - `statsController.js:542-594`
```javascript
// 按仓库分组计算
w.turnoverRate = w.avgInventory > 0 
  ? w.outbound_qty / w.avgInventory / (daysNum / 30) 
  : 0;
w.turnoverDays = w.turnoverRate > 0 ? 30 / w.turnoverRate : null;
```

#### 4.3.3 统计接口

| 接口 | 用途 | 维度 |
|------|------|------|
| `GET /api/stats/overview` | 全局总览 | 仓库、库位、订单、商户 |
| `GET /api/stats/warehouse-utilization` | 库位利用率 | 按仓库 |
| `GET /api/stats/turnover` | 库存周转率 | 全局+按品类 |
| `GET /api/stats/warehouse-turnover` | 仓库周转率 | 按仓库 |
| `GET /api/stats/slow-moving-ratio` | 呆滞率 | 全局+按商户 |
| `GET /api/stats/income-trend` | 收入趋势 | 近12个月 |

---

## 5. 三层架构协作关系

### 5.1 通用请求流程

```
┌─────────────┐
│ 前端页面    │ 1. 用户操作（点击按钮、填写表单）
│  (React)    │
└─────┬───────┘
      │ 2. 调用API封装
      ▼
┌─────────────┐
│ api.js      │ 3. 自动注入JWT Header
│ (Axios)     │    统一错误处理
└─────┬───────┘
      │ 4. HTTP请求
      ▼
┌─────────────┐
│ auth.js     │ 5. JWT令牌验证
│ (中间件)    │ 6. 角色权限校验
└─────┬───────┘
      │ 7. 执行业务逻辑
      ▼
┌─────────────┐
│ Controller  │ 8. 参数校验
│             │ 9. 业务规则判断
│             │ 10. 数据库事务
└─────┬───────┘
      │ 11. SQL执行
      ▼
┌─────────────┐
│ SQLite      │ 12. 数据持久化
│ (WAL模式)   │ 13. 索引加速
└─────┬───────┘
      │ 14. 返回结果
      ▼
┌─────────────┐
│ 前端页面    │ 15. 状态更新、提示用户
│  (React)    │
└─────────────┘
```

### 5.2 前端分层设计

```
frontend/src/
├── pages/                 # 页面组件
│   ├── admin/            # 管理员页面（10个）
│   └── merchant/         # 商户页面（6个）
├── components/           # 通用组件
│   ├── AdminLayout.jsx   # 管理员布局（侧边栏菜单）
│   └── MerchantLayout.jsx # 商户布局
├── services/             # API层
│   ├── api.js            # Axios实例配置
│   └── apiEndpoints.js   # 各模块API封装（authAPI, inboundAPI...）
├── context/              # 状态管理
│   └── AuthContext.jsx   # 认证全局状态
├── hooks/                # 自定义Hooks
│   └── useRequest.js     # 请求封装
└── utils/                # 工具函数
    └── constants.js      # 状态枚举、格式化函数
```

### 5.3 后端分层设计

```
backend/
├── controllers/          # 业务逻辑层（11个控制器）
│   ├── inboundController.js
│   ├── outboundController.js
│   ├── inventoryController.js
│   ├── statsController.js
│   └── ...
├── routes/               # 路由层（11个路由文件）
│   ├── inbound.js        # 定义HTTP方法和权限
│   ├── outbound.js
│   └── ...
├── middleware/           # 中间件
│   └── auth.js           # JWT认证+角色校验
├── config/               # 配置
│   ├── database.js       # 数据库连接
│   └── logistichub.db    # SQLite数据库文件
├── scripts/              # 脚本
│   ├── initDB.js         # 建表脚本
│   └── seedData.js       # 种子数据
└── server.js             # 应用入口
```

### 5.4 各业务模块三层对应表

| 业务 | 前端页面 | 后端路由 | 后端控制器 | 主数据表 |
|------|---------|---------|-----------|----------|
| **认证** | `pages/Login.jsx` | `routes/auth.js` | `authController.js` | `users` |
| **入库** | `pages/xx/Inbound.jsx` | `routes/inbound.js` | `inboundController.js` | `inbound_orders`, `inbound_items` |
| **出库** | `pages/xx/Outbound.jsx` | `routes/outbound.js` | `outboundController.js` | `outbound_orders`, `outbound_allocations` |
| **库存** | `pages/xx/Inventory.jsx` | `routes/inventory.js` | `inventoryController.js` | `inventory_batches` |
| **库位** | `pages/admin/Locations.jsx` | `routes/locations.js` | `locationController.js` | `locations` |
| **租约** | `pages/xx/Leases.jsx` | `routes/leases.js` | `leaseController.js` | `leases` |
| **账单** | `pages/xx/Bills.jsx` | `routes/bills.js` | `billController.js` | `bills`, `bill_items` |
| **统计** | `pages/admin/Stats.jsx` | `routes/stats.js` | `statsController.js` | 多表关联 |
| **商户** | `pages/admin/Merchants.jsx` | `routes/users.js` | `userController.js` | `users` |
| **移库** | `pages/admin/Transfers.jsx` | `routes/transfers.js` | `transferController.js` | `inventory_transfers` |

---

## 6. 货物全生命周期数据流向图

### 6.1 完整状态流转图

```
                           ┌───────────────────────┐
                           │   商户创建入库申请    │
                           │  inbound.status=pending│
                           └──────────┬────────────┘
                                      │
                                      ▼
                           ┌───────────────────────┐
                           │   仓管验货             │
                           │  status=checking      │
                           │  items.actual_quantity│
                           └──────────┬────────────┘
                                      │
                                      ▼
                           ┌───────────────────────┐
                           │   仓管上架             │
                           │  status=putaway       │
┌──────────────────────────┴───────────────────────┴──────────────────────────┐
│  原子操作（事务保证）：                                                    │
│  1. locations.used_capacity += QTY   (库位容量扣减)                         │
│  2. INSERT inventory_batches        (创建批次，状态自动判定)                 │
│     ├─ status: normal / near_expiry / expired                              │
│     └─ batch_no: B + 日期 + 随机数                                          │
│  3. INSERT transactions            (入库流水)                                │
│  4. inbound_items.status=completed  (明细完成)                               │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                           ┌───────────────────────┐
                           │ 库存正常流转           │
                           │ status=normal         │
                           │ 可进行：移库、盘点      │
                           └──────────┬────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     │ 自动状态变更（盘点触发）        │                                │
     ▼                                ▼                                ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│  near_expiry  │              │  slow_moving  │              │    expired    │
│  保质期≤30天   │              │  90天未移动    │              │  保质期已过    │
│  可出库（优先）│              │  可出库（优先） │              │  ❌ 禁止出库   │
└───────┬───────┘              └───────┬───────┘              └───────────────┘
     │                                │
     │ 出库时自动恢复normal           │ 出库时自动恢复normal
     └───────────────┬────────────────┘
                     │
                     ▼
           ┌───────────────────────┐
           │ 商户创建出库申请        │
           │ outbound.status=pending│
           └──────────┬────────────┘
                      │
                      ▼
           ┌───────────────────────┐
           │ 仓管分配库存（FIFO）    │
           │ status=picking        │
           │ 写入allocations表     │
           └──────────┬────────────┘
                      │
                      ▼
           ┌───────────────────────┐
           │ 仓管拣货确认            │
           │ status=checking       │
┌──────────┴───────────────────────┴──────────────────────────────────────┐
│  原子操作（事务保证）：                                                   │
│  1. inventory_batches.quantity -= QTY  (乐观锁version校验)                │
│     ├─ 数量归零 → status=locked                                          │
│     └─ 呆滞出库 → status=normal                                          │
│  2. locations.used_capacity -= QTY   (释放库位容量)                        │
│  3. INSERT transactions             (出库流水)                             │
└────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
           ┌───────────────────────┐
           │ 出库完成               │
           │ status=completed      │
           └───────────────────────┘
```

### 6.2 数据走向时序图（入库→库存→出库）

```
  商户端                     后端API                     数据库
    │                          │                          │
    │ 1. 创建入库单            │                          │
    ├─────────────────────────►│                          │
    │                          │ 2. 校验租约              │
    │                          ├─────────────────────────►│
    │                          │ 3. 插入入库单/明细       │
    │                          ├─────────────────────────►│
    │                          │ 4. 返回成功              │
    │◄─────────────────────────┤                          │
    │                          │                          │
    │                          │ 5. 仓管验货              │
    │                          ├─────────────────────────►│
    │                          │    更新状态为checking    │
    │                          │                          │
    │                          │ 6. 仓管上架              │
    │                          ├─────────────────────────►│
    │                          │    ├─ 更新库位容量       │
    │                          │    ├─ 创建库存批次       │
    │                          │    └─ 写入交易流水       │
    │                          │ 7. 返回上架结果          │
    │◄─────────────────────────┤                          │
    │                          │                          │
    │                          │ 8. 库存状态变更（盘点）  │
    │                          ├─────────────────────────►│
    │                          │    标记临期/呆滞/过期     │
    │                          │                          │
    │ 9. 创建出库单            │                          │
    ├─────────────────────────►│                          │
    │                          │ 10. 校验库存总量         │
    │                          ├─────────────────────────►│
    │                          │ 11. 插入出库单/明细      │
    │                          ├─────────────────────────►│
    │                          │ 12. 返回成功             │
    │◄─────────────────────────┤                          │
    │                          │                          │
    │                          │ 13. 分配库存（FIFO）     │
    │                          ├─────────────────────────►│
    │                          │     查询可用批次（排序）  │
    │                          │     插入分配明细         │
    │                          │ 14. 返回分配结果         │
    │◄─────────────────────────┤                          │
    │                          │                          │
    │                          │ 15. 拣货确认             │
    │                          ├─────────────────────────►│
    │                          │    ├─ 扣减批次库存        │
    │                          │    ├─ 释放库位容量        │
    │                          │    └─ 写入交易流水        │
    │                          │ 16. 返回完成             │
    │◄─────────────────────────┤                          │
```

### 6.3 关键数据实体变迁表

以"一批100箱牛奶，保质期180天"为例，跟踪数据变化：

| 阶段 | 操作 | inventory_batches | locations | transactions | 批次状态 |
|------|------|-------------------|-----------|--------------|----------|
| 1 | 上架入库 | `{quantity:100, expiry_date:T+180, status:'normal'}` | `used_capacity += 100` | `txn_type:'inbound', qty:100` | normal |
| 2 | 存放170天 | - | - | - | 盘点后→`near_expiry`（距过期10天） |
| 3 | 分配出库 | - | - | - | FIFO优先分配 |
| 4 | 拣货出库30箱 | `quantity:70, last_outbound_date:now` | `used_capacity -= 30` | `txn_type:'outbound', qty:-30` | near_expiry |
| 5 | 存放20天 | - | - | - | 盘点后→`expired`（保质期已过） |
| 6 | 禁止出库 | 校验失败抛出错误 | - | - | expired（不可出库） |

---

## 7. 数据库表关系与关键字段

### 7.1 核心表关系ER图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │ warehouses  │       │ goods_cate- │
│  (用户表)   │       │  (仓库表)   │       │   gories    │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ 1:N                 │ 1:N                 │ 1:N
       ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   leases    │◄──────│  locations  │──────►│ inventory_  │
│  (租约表)   │       │  (库位表)   │       │   batches   │
└──────┬──────┘       └─────────────┘       └──────┬──────┘
       │ 1:N                                           │ 1:N
       ▼                                               ▼
┌─────────────┐                               ┌─────────────┐
│  bill_items │                               │ outbound_   │
│  (账单明细)  │                               │ allocations │
└──────┬──────┘                               └──────┬──────┘
       │ 1:N                                           │ 1:1
       ▼                                               ▼
┌─────────────┐                               ┌─────────────┐
│    bills    │                               │ outbound_   │
│  (账单主表)  │                               │    items    │
└─────────────┘                               └──────┬──────┘
                                                     │ 1:N
                                                     ▼
              ┌─────────────┐              ┌─────────────┐
              │ transactions│              │ outbound_   │
              │ (交易流水表) │              │   orders    │
              └─────────────┘              └─────────────┘
                      │                              ▲
                      │                              │
                      └───────────┬──────────────────┘
                                  │ 1:N
                          ┌─────────────┐
                          │ inbound_    │
                          │    items    │
                          └──────┬──────┘
                                 │ 1:N
                                 ▼
                          ┌─────────────┐
                          │ inbound_    │
                          │   orders    │
                          └─────────────┘
```

### 7.2 关键字段设计说明

#### 7.2.1 并发控制字段（乐观锁）

```sql
-- locations表 和 inventory_batches表 均有 version 字段
version INTEGER DEFAULT 0

-- 更新时必须匹配version，防止并发修改
UPDATE inventory_batches 
SET quantity = quantity - ?, version = version + 1
WHERE id = ? AND version = ?
```

#### 7.2.2 库存批次表 (inventory_batches) - 核心表

| 字段 | 类型 | 说明 |
|------|------|------|
| `batch_no` | TEXT | 批次号（唯一） |
| `merchant_id` | INTEGER | 所属商户 |
| `category_id` | INTEGER | 货物品类 |
| `location_id` | INTEGER | 存放库位 |
| `lease_id` | INTEGER | 关联租约 |
| `quantity` | REAL | 当前数量 |
| `unit` | TEXT | 计量单位 |
| `production_date` | DATE | 生产日期 |
| `expiry_date` | DATE | 过期日期 |
| `inbound_date` | DATE | 入库日期 |
| `status` | TEXT | normal/near_expiry/expired/locked/slow_moving |
| `last_outbound_date` | DATE | 最后出库日 |
| `last_move_date` | DATE | 最后移动日 |
| `version` | INTEGER | 乐观锁版本号 |

#### 7.2.3 库位表 (locations)

| 字段 | 类型 | 说明 |
|------|------|------|
| `warehouse_id` | INTEGER | 所属仓库 |
| `code` | TEXT | 库位编码（唯一） |
| `row/column/layer` | TEXT | 排/列/层坐标 |
| `capacity` | REAL | 总容量 |
| `used_capacity` | REAL | 已用容量 |
| `temperature_zone` | TEXT | 温区：normal/cold/frozen/constant |
| `status` | TEXT | available/occupied/locked/maintenance |
| `version` | INTEGER | 乐观锁版本号 |

#### 7.2.4 交易流水表 (transactions) - 审计核心

所有库存变动**必须**写入此表，用于追溯和统计：

| 字段 | 类型 | 说明 |
|------|------|------|
| `txn_no` | TEXT | 交易流水号 |
| `txn_type` | TEXT | inbound/outbound/transfer/adjustment |
| `reference_id` | INTEGER | 关联业务单ID |
| `reference_no` | TEXT | 关联业务单号 |
| `quantity` | REAL | 变动数量（出库为正，用于统计） |
| `operator_id` | INTEGER | 操作人 |
| `txn_date` | DATETIME | 交易时间 |

### 7.3 索引设计

**创建脚本** - `initDB.js:309-335`

```sql
-- 核心业务索引（共18个）
idx_inventory_merchant     -- 按商户查库存
idx_inventory_location     -- 按库位查库存
idx_inventory_expiry       -- 按过期时间查询（临期/过期）
idx_inventory_status       -- 按状态查询
idx_inbound_status         -- 入库单状态筛选
idx_outbound_status        -- 出库单状态筛选
idx_transactions_txn_date  -- 交易时间范围查询
...
```

---

## 8. 关键代码索引

### 8.1 入库核心流程

| 功能 | 文件 | 行号 |
|------|------|------|
| 创建入库单 | `inboundController.js` | 137-260 |
| 验货 | `inboundController.js` | 335-380 |
| **上架核心逻辑** | `inboundController.js` | 382-570 |
| 库位容量原子更新 | `inboundController.js` | 456-479 |
| 批次状态自动判定 | `inboundController.js` | 444-454 |
| 批次号生成 | `inboundController.js` | 14-22 |

### 8.2 出库核心流程

| 功能 | 文件 | 行号 |
|------|------|------|
| 创建出库单 | `outboundController.js` | 145-264 |
| **库存分配（FIFO）** | `outboundController.js` | 266-420 |
| 批次排序SQL | `outboundController.js` | 289-307 |
| **拣货确认（库存核减）** | `outboundController.js` | 422-593 |
| 乐观锁库存更新 | `outboundController.js` | 486-516 |
| 库位容量释放 | `outboundController.js` | 518-533 |

### 8.3 库存管控算法

| 功能 | 文件 | 行号 |
|------|------|------|
| 临期库存查询 | `inventoryController.js` | 241-279 |
| 过期库存查询 | `inventoryController.js` | 281-315 |
| 呆滞货查询 | `inventoryController.js` | 198-239 |
| **盘点（状态批量更新）** | `inventoryController.js` | 317-390 |
| 呆滞货判定SQL | `inventoryController.js` | 323-335 |
| 过期自动标记SQL | `inventoryController.js` | 338-349 |
| 临期自动标记SQL | `inventoryController.js` | 351-363 |

### 8.4 统计计算

| 功能 | 文件 | 行号 |
|------|------|------|
| 库存周转率 | `statsController.js` | 171-251 |
| 仓库周转率 | `statsController.js` | 542-594 |
| 库位利用率 | `statsController.js` | 115-169 |
| 呆滞率统计 | `statsController.js` | 323-409 |
| 收入趋势 | `statsController.js` | 671-705 |

### 8.5 权限与认证

| 功能 | 文件 | 行号 |
|------|------|------|
| JWT认证中间件 | `auth.js` | 3-18 |
| 角色校验中间件 | `auth.js` | 20-27 |
| 前端路由守卫 | `App.jsx` | 24-53 |
| 数据权限过滤 | 各Controller | 多处 |

---

## 9. 附录：常量定义与状态枚举

### 9.1 订单状态枚举 (`constants.js:1-14`)

| 状态值 | 显示文本 | 说明 |
|--------|---------|------|
| `pending` | 待处理 | 待审核/待验货 |
| `checking` | 验货中 | 入库验货中 |
| `putaway` | 上架中 | 入库上架中 |
| `picking` | 拣货中 | 出库拣货中 |
| `allocated` | 已分配 | 库存已分配 |
| `completed` | 已完成 | 流程结束 |
| `cancelled` | 已取消 | 已取消 |

### 9.2 库存状态枚举 (`constants.js:23-29`)

| 状态值 | 显示文本 | 说明 |
|--------|---------|------|
| `normal` | 正常 | 可正常出库 |
| `near_expiry` | 临期 | 保质期≤30天，优先出库 |
| `expired` | 过期 | 禁止出库 |
| `locked` | 锁定 | 已出清或特殊锁定 |
| `slow_moving` | 呆滞 | 90天未移动，优先出库 |

### 9.3 库位状态枚举 (`constants.js:16-21`)

| 状态值 | 显示文本 | 说明 |
|--------|---------|------|
| `available` | 可用 | 可租赁 |
| `occupied` | 占用 | 已租赁 |
| `locked` | 锁定 | 不可用 |
| `maintenance` | 维护 | 维护中 |

### 9.4 温区枚举 (`constants.js:31-36`)

| 状态值 | 显示文本 |
|--------|---------|
| `normal` | 常温 |
| `cold` | 冷藏 |
| `frozen` | 冷冻 |
| `constant` | 恒温 |

### 9.5 计费方式枚举 (`constants.js:38-43`)

| 方式 | 说明 |
|------|------|
| `daily` | 按天计费 |
| `monthly` | 按月计费 |
| `per_pallet` | 按托盘计费 |
| `per_volume` | 按体积计费 |

### 9.6 交易类型枚举 (`constants.js:45-50`)

| 类型 | 说明 |
|------|------|
| `inbound` | 入库 |
| `outbound` | 出库 |
| `transfer` | 移库 |
| `adjustment` | 调整 |

---

## 文档维护说明

- **文档版本**: v1.0
- **创建日期**: 2025-06-06
- **适用项目版本**: zj-00130-logistichub-5
- **维护责任人**: 开发团队
- **更新频率**: 重大功能迭代后更新

---

> **阅读指引**：接手开发时，建议按以下顺序阅读代码：
> 1. 本文档（建立整体认知）
> 2. `initDB.js`（理解数据模型）
> 3. `auth.js`（理解权限机制）
> 4. `inboundController.js`（理解入库流程）
> 5. `outboundController.js`（理解出库流程）
> 6. 各业务页面组件（理解交互逻辑）
