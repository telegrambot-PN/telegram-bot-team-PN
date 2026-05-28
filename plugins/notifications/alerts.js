// plugins/notifications/alerts.js
// Cảnh báo admin khi kho thấp, kho hết, hoặc có sự kiện quan trọng

import { Stock, Product } from '../../db.js';
import { STOCK, STOCK_STATUS } from '../../config/constants.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { logger } from '../../utils/logger.js';

let _bot = null;

/**
 * Khởi tạo module alerts với bot instance
 * @param {import('telegraf').Telegraf} bot
 */
export const initAlerts = (bot) => {
  _bot = bot;

  // Lắng nghe sự kiện kho thấp
  eventBus.on(EVENTS.STOCK_LOW, async ({ product, remaining }) => {
    await sendAdminAlert(
      `⚠️ *CẢNH BÁO KHO THẤP*\n\n` +
      `Sản phẩm: *${product.name}*\n` +
      `Còn lại: *${remaining} tài khoản*\n` +
      `Ngưỡng cảnh báo: ${STOCK.LOW_STOCK_THRESHOLD}\n\n` +
      `👉 _Hãy nạp thêm kho ngay để tránh gián đoạn bán hàng!_`
    );
  });

  // Lắng nghe sự kiện kho hết
  eventBus.on(EVENTS.STOCK_EMPTY, async ({ product }) => {
    await sendAdminAlert(
      `🚨 *CẢNH BÁO KHO HẾT HÀNG*\n\n` +
      `Sản phẩm: *${product.name}*\n` +
      `Kho đã hết sạch tài khoản!\n\n` +
      `Bot sẽ tự động ẩn sản phẩm này khỏi menu cho đến khi có hàng.`
    );
  });

  // Lắng nghe sự kiện đơn hàng mới
  eventBus.on(EVENTS.ORDER_PAID, async ({ orderId, productName, amount }) => {
    await sendAdminAlert(
      `💰 *ĐƠN HÀNG MỚI THÀNH CÔNG*\n\n` +
      `Mã đơn: *${orderId}*\n` +
      `Sản phẩm: *${productName}*\n` +
      `Doanh thu: *${amount}*`
    );
  });

  logger.info('[Alerts] Đã đăng ký lắng nghe sự kiện kho và đơn hàng');
};

/**
 * Gửi cảnh báo tới tất cả admin IDs trong .env
 * @param {string} message
 */
export const sendAdminAlert = async (message) => {
  if (!_bot) return;

  const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

  for (const adminId of adminIds) {
    try {
      await _bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
    } catch (e) {
      logger.warn(`[Alerts] Không thể gửi alert tới admin ${adminId}: ${e.message}`);
    }
  }
};

/**
 * Kiểm tra tồn kho tất cả sản phẩm và phát sự kiện nếu cần
 * Gọi sau mỗi lần bán hàng thành công
 */
export const checkStockLevels = async () => {
  try {
    const products = await Product.find();
    const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || String(STOCK.LOW_STOCK_THRESHOLD), 10);

    for (const product of products) {
      const remaining = await Stock.countDocuments({
        productId: product._id,
        status: STOCK_STATUS.AVAILABLE,
      });

      if (remaining === 0) {
        await eventBus.emit(EVENTS.STOCK_EMPTY, { product });
      } else if (remaining <= threshold) {
        await eventBus.emit(EVENTS.STOCK_LOW, { product, remaining });
      }
    }
  } catch (e) {
    logger.error('[Alerts] Lỗi kiểm tra tồn kho:', e.message);
  }
};
