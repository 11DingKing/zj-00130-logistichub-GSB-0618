import api from "./api";

export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  getCurrentUser: () => api.get("/auth/me"),
};

export const warehouseAPI = {
  getAll: (params) => api.get("/warehouses", { params }),
  getById: (id) => api.get(`/warehouses/${id}`),
  create: (data) => api.post("/warehouses", data),
  update: (id, data) => api.put(`/warehouses/${id}`, data),
  delete: (id) => api.delete(`/warehouses/${id}`),
  getUtilization: (id) => api.get(`/warehouses/${id}/utilization`),
};

export const locationAPI = {
  getAll: (params) => api.get("/locations", { params }),
  getById: (id) => api.get(`/locations/${id}`),
  getByWarehouse: (warehouseId) =>
    api.get(`/locations/warehouse/${warehouseId}`),
  create: (data) => api.post("/locations", data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`),
  getAvailable: (params) =>
    api.get("/locations/available/for-lease", { params }),
};

export const leaseAPI = {
  getAll: (params) => api.get("/leases", { params }),
  getById: (id) => api.get(`/leases/${id}`),
  getMyLeases: () => api.get("/leases/merchant/my"),
  create: (data) => api.post("/leases", data),
  approve: (id) => api.put(`/leases/${id}/approve`),
  terminate: (id) => api.put(`/leases/${id}/terminate`),
};

export const inboundAPI = {
  getAll: (params) => api.get("/inbound", { params }),
  getById: (id) => api.get(`/inbound/${id}`),
  getMyOrders: () => api.get("/inbound/merchant/my"),
  create: (data) => api.post("/inbound", data),
  addItem: (id, data) => api.post(`/inbound/${id}/items`, data),
  check: (id, data) => api.put(`/inbound/${id}/check`, data),
  putaway: (id, data) => api.put(`/inbound/${id}/putaway`, data),
  complete: (id) => api.put(`/inbound/${id}/complete`),
};

export const outboundAPI = {
  getAll: (params) => api.get("/outbound", { params }),
  getById: (id) => api.get(`/outbound/${id}`),
  getMyOrders: () => api.get("/outbound/merchant/my"),
  create: (data) => api.post("/outbound", data),
  allocate: (id) => api.post(`/outbound/${id}/allocate`),
  confirmPick: (id, data) => api.put(`/outbound/${id}/pick`, data),
  complete: (id) => api.put(`/outbound/${id}/complete`),
};

export const inventoryAPI = {
  getAll: (params) => api.get("/inventory", { params }),
  getMyInventory: () => api.get("/inventory/merchant/my"),
  getBatchDetail: (batchId) => api.get(`/inventory/batch/${batchId}`),
  getByLocation: (locationId) => api.get(`/inventory/location/${locationId}`),
  getSlowMoving: (params) => api.get("/inventory/slow-moving", { params }),
  getNearExpiry: (params) => api.get("/inventory/near-expiry", { params }),
  getExpired: () => api.get("/inventory/expired"),
  checkSlowMoving: (data) => api.post("/inventory/check-slow-moving", data),
};

export const statsAPI = {
  getOverview: () => api.get("/stats/overview"),
  getWarehouseUtilization: (params) =>
    api.get("/stats/warehouse-utilization", { params }),
  getInventoryTurnover: (params) => api.get("/stats/turnover", { params }),
  getTimelinessStats: (params) => api.get("/stats/timeliness", { params }),
  getSlowMovingRatio: (params) =>
    api.get("/stats/slow-moving-ratio", { params }),
  getTransactions: (params) => api.get("/stats/transactions", { params }),
  getMerchantOverview: () => api.get("/stats/merchant/overview"),
  getIncomeTrend: (params) => api.get("/stats/income-trend", { params }),
  getWarehouseTurnover: (params) =>
    api.get("/stats/warehouse-turnover", { params }),
  getWarehouseIncome: (params) =>
    api.get("/stats/warehouse-income", { params }),
};

export const userAPI = {
  getAll: (params) => api.get("/users", { params }),
  getMerchants: () => api.get("/users/merchants"),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const categoriesAPI = {
  getAll: () => api.get("/goods_categories"),
};

export const transferAPI = {
  getAll: (params) => api.get("/transfers", { params }),
  getById: (id) => api.get(`/transfers/${id}`),
  getMyTransfers: () => api.get("/transfers/merchant/my"),
  getAvailableLocations: (params) =>
    api.get("/transfers/available-locations", { params }),
  create: (data) => api.post("/transfers", data),
  process: (id) => api.put(`/transfers/${id}/process`),
  complete: (id) => api.put(`/transfers/${id}/complete`),
  cancel: (id) => api.put(`/transfers/${id}/cancel`),
};

export const billAPI = {
  getAll: (params) => api.get("/bills", { params }),
  getById: (id) => api.get(`/bills/${id}`),
  getMyBills: () => api.get("/bills/merchant/my"),
  getSummary: (params) => api.get("/bills/summary", { params }),
  generateMonthly: (data) => api.post("/bills/generate-monthly", data),
  markPaid: (id) => api.put(`/bills/${id}/paid`),
  markOverdue: (id) => api.put(`/bills/${id}/overdue`),
  cancel: (id) => api.put(`/bills/${id}/cancel`),
};
