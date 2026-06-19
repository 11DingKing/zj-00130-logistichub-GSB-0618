export const STATUS_MAP = {
  pending: { text: '待处理', color: 'default' },
  checking: { text: '验货中', color: 'blue' },
  putaway: { text: '上架中', color: 'cyan' },
  picking: { text: '拣货中', color: 'geekblue' },
  allocated: { text: '已分配', color: 'purple' },
  completed: { text: '已完成', color: 'success' },
  cancelled: { text: '已取消', color: 'default' },
  active: { text: '生效中', color: 'success' },
  terminated: { text: '已终止', color: 'default' },
  expired: { text: '已过期', color: 'error' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已拒绝', color: 'error' },
  adjusted: { text: '已调整', color: 'orange' }
};

export const LOCATION_STATUS_MAP = {
  available: { text: '可用', color: 'success' },
  occupied: { text: '占用', color: 'warning' },
  locked: { text: '锁定', color: 'error' },
  maintenance: { text: '维护', color: 'processing' }
};

export const INVENTORY_STATUS_MAP = {
  normal: { text: '正常', color: 'success' },
  near_expiry: { text: '临期', color: 'warning' },
  expired: { text: '过期', color: 'error' },
  locked: { text: '锁定', color: 'default' },
  slow_moving: { text: '呆滞', color: 'processing' }
};

export const TEMP_ZONE_MAP = {
  normal: { text: '常温', color: 'default' },
  cold: { text: '冷藏', color: 'blue' },
  frozen: { text: '冷冻', color: 'geekblue' },
  constant: { text: '恒温', color: 'green' }
};

export const BILLING_METHOD_MAP = {
  daily: '按日计费',
  monthly: '按月计费',
  per_pallet: '按托盘计费',
  per_volume: '按体积计费',
  adjustment: '争议调整'
};

export const BILL_STATUS_MAP = {
  pending: { text: '待生成', color: 'default' },
  issued: { text: '已出单', color: 'blue' },
  paid: { text: '已支付', color: 'green' },
  overdue: { text: '已逾期', color: 'red' },
  cancelled: { text: '已取消', color: 'default' },
  adjusted: { text: '已调整', color: 'orange' }
};

export const DISPUTE_STATUS_MAP = {
  none: { text: '无争议', color: 'default' },
  pending: { text: '申诉中', color: 'gold' },
  approved: { text: '申诉通过', color: 'green' },
  rejected: { text: '申诉驳回', color: 'red' },
  adjusted: { text: '已调整', color: 'orange' }
};

export const TXN_TYPE_MAP = {
  inbound: { text: '入库', color: 'success' },
  outbound: { text: '出库', color: 'error' },
  transfer: { text: '移库', color: 'blue' },
  adjustment: { text: '调整', color: 'warning' }
};

export const formatCapacity = (value) => {
  if (!value && value !== 0) return '-';
  return `${Number(value).toFixed(2)} m³`;
};

export const formatCurrency = (value) => {
  if (!value && value !== 0) return '-';
  return `¥${Number(value).toFixed(2)}`;
};

export const formatPercent = (value) => {
  if (!value && value !== 0) return '-';
  return `${Number(value).toFixed(2)}%`;
};
