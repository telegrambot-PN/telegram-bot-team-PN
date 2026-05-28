// core/eventBus.js
// Event System nội bộ — giao tiếp giữa các module không cần import trực tiếp
// Giúp plugins độc lập với nhau: plugin A phát sự kiện, plugin B lắng nghe

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Đăng ký lắng nghe một sự kiện
   * @param {string} event - Tên sự kiện
   * @param {Function} handler - Hàm xử lý async (event, data) => void
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
  }

  async emit(event, data = {}) {
    const handlers = this._listeners.get(event) || [];
    // Chạy song song và bất đồng bộ hoàn toàn để tránh block luồng chính của bot
    Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(data);
        } catch (e) {
          console.error(`[EventBus] Lỗi handler cho sự kiện "${event}":`, e.message);
        }
      })
    );
  }

  /**
   * Hủy đăng ký handler
   */
  off(event, handler) {
    if (!this._listeners.has(event)) return;
    const filtered = this._listeners.get(event).filter((h) => h !== handler);
    this._listeners.set(event, filtered);
  }
}

// Singleton — toàn bộ hệ thống dùng chung 1 instance
export const eventBus = new EventBus();

// Danh sách sự kiện chuẩn — dùng để tránh typo
export const EVENTS = {
  ORDER_CREATED:     'order.created',
  ORDER_PAID:        'order.paid',
  ORDER_CANCELED:    'order.canceled',
  ACCOUNT_DELIVERED: 'account.delivered',
  TICKET_OPENED:     'ticket.opened',
  TICKET_RESOLVED:   'ticket.resolved',
  STOCK_ADDED:       'stock.added',
  STOCK_LOW:         'stock.low',
  STOCK_EMPTY:       'stock.empty',
  PRODUCT_ADDED:     'product.added',
  REFUND_ISSUED:     'refund.issued',
  USER_REGISTERED:   'user.registered',
};
