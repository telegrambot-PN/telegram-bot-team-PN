// plugins/warranty/autoRefund.js
// Xử lý hoàn tiền tự động khi kho hết và không thể cấp bù

import { eventBus, EVENTS } from '../../core/eventBus.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { logger } from '../../utils/logger.js';

/**
 * Thực hiện hoàn tiền USDT qua Binance Pay (khi BINANCE_PAY bật)
 * Hoặc tạo ghi chú hoàn tiền thủ công (khi dùng simulate)
 *
 * @param {object} params
 * @param {object} params.ticket - Ticket đang xử lý
 * @param {object} params.order  - Đơn hàng liên quan
 * @param {object} params.bot    - Bot Telegraf instance
 * @returns {Promise<{ success: boolean, method: string, message: string }>}
 */
export const autoRefund = async ({ ticket, order, bot }) => {
  const useBinancePay = process.env.FEATURE_BINANCE_PAY === 'true';

  try {
    if (useBinancePay) {
      // TODO: Gọi Binance Pay Refund API khi có credentials
      // const result = await binancePayApi.refund({ orderId: order.orderId, amount: order.amount });
      logger.info(`[AutoRefund] Binance Pay refund cho đơn ${order.orderId} — chưa implement`);

      return {
        success: false,
        method: 'binance',
        message: 'Hoàn tiền Binance Pay chưa được cấu hình. Admin sẽ hoàn tiền thủ công.',
      };
    }

    // Chế độ simulate: tạo ghi chú hoàn tiền thủ công
    logAction(AUDIT_ACTIONS.REFUND_ISSUED, ticket.telegramId, {
      orderId: order.orderId,
      ticketId: ticket.ticketId,
      reason: 'Kho hết, không thể cấp bù',
    });

    // Thông báo admin cần hoàn tiền thủ công
    const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    for (const adminId of adminIds) {
      try {
        await bot.telegram.sendMessage(
          adminId,
          `🔔 *YÊU CẦU HOÀN TIỀN THỦ CÔNG*\n\n` +
          `Ticket: *${ticket.ticketId}*\n` +
          `Đơn hàng: *${order.orderId}*\n` +
          `Lý do: Kho hết sản phẩm, không thể cấp bù tự động\n\n` +
          `👉 Vui lòng hoàn tiền thủ công cho khách!`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        logger.warn('[AutoRefund] Không thể thông báo admin:', e.message);
      }
    }

    return {
      success: true,
      method: 'manual_notify',
      message: 'Đã thông báo Admin xử lý hoàn tiền thủ công.',
    };
  } catch (e) {
    logger.error('[AutoRefund] Lỗi xử lý hoàn tiền:', e.message);
    return { success: false, method: 'error', message: 'Lỗi hệ thống khi xử lý hoàn tiền.' };
  }
};
