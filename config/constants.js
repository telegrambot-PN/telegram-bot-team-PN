// config/constants.js
// Tập trung toàn bộ hằng số và cấu hình của hệ thống

export const BANK = {
  id: 'MB',
  accountNo: '8888999999',
  accountName: 'SHOP TAI KHOAN SO',
};

export const ORDER = {
  /** Thời gian tự động hủy đơn pending (phút) */
  TIMEOUT_MINUTES: 15,
  /** Prefix mã đơn hàng */
  ID_PREFIX: 'AG',
};

export const TICKET = {
  /** Prefix mã ticket */
  ID_PREFIX: 'TK',
};

export const STOCK = {
  /** Cảnh báo admin khi tồn kho dưới ngưỡng này */
  LOW_STOCK_THRESHOLD: 3,
};

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  CTV: 'ctv',
  USER: 'user',
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELED: 'canceled',
};

export const STOCK_STATUS = {
  AVAILABLE: 'available',
  SOLD: 'sold',
};

export const TICKET_STATUS = {
  OPEN: 'open',
  RESOLVED: 'resolved',
};

export const SESSION_STATES = {
  // User flows
  AWAITING_TICKET_DESC: 'awaiting_ticket_desc_',
  // Admin flows
  ADMIN_AWAITING_PROD_NAME: 'admin_awaiting_prod_name',
  ADMIN_AWAITING_PROD_PRICE: 'admin_awaiting_prod_price',
  ADMIN_AWAITING_PROD_DESC: 'admin_awaiting_prod_desc',
  ADMIN_AWAITING_STOCK: 'admin_awaiting_stock_',
  ADMIN_AWAITING_TICKET_REPLY: 'admin_awaiting_ticket_reply_',
};
