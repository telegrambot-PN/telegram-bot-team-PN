// plugins/binancePay/webhook.js
// Xử lý webhook callback từ Binance Pay khi thanh toán thành công

import { Order, Stock } from '../../db.js';
import { verifyWebhook } from './api.js';
import { decrypt } from '../../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { ORDER_STATUS, STOCK_STATUS } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { checkStockLevels } from '../notifications/alerts.js';

let _bot = null;

export const initWebhook = (bot) => {
  _bot = bot;
};

/**
 * Xử lý payload webhook từ Binance Pay
 * Được gọi từ HTTP server hoặc Telegram webhook proxy
 *
 * @param {object} params
 * @param {string} params.rawBody   - Raw request body string
 * @param {string} params.signature - Header BinancePay-Signature
 * @param {string} params.timestamp - Header BinancePay-Timestamp
 * @param {string} params.nonce     - Header BinancePay-Nonce
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const handleWebhook = async ({ rawBody, signature, timestamp, nonce }) => {
  // 1. Verify chữ ký webhook
  if (!verifyWebhook(rawBody, signature, timestamp, nonce)) {
    logger.warn('[BinancePay Webhook] Chữ ký không hợp lệ!');
    return { success: false, message: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { success: false, message: 'Invalid JSON' };
  }

  const { bizType, data } = payload;

  // Chỉ xử lý sự kiện thanh toán thành công
  if (bizType !== 'PAY' || data?.paymentStatus !== 'SUCCESS') {
    return { success: true, message: 'Ignored non-payment event' };
  }

  const merchantTradeNo = data?.merchantTradeNo; // = orderId của chúng ta
  if (!merchantTradeNo) return { success: false, message: 'Missing orderId' };

  // 2. Tìm đơn hàng
  const order = await Order.findOne({ orderId: merchantTradeNo }).populate('productId');
  if (!order) {
    logger.warn(`[BinancePay Webhook] Không tìm thấy đơn hàng: ${merchantTradeNo}`);
    return { success: false, message: 'Order not found' };
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    logger.info(`[BinancePay Webhook] Đơn ${merchantTradeNo} đã xử lý trước đó (${order.status})`);
    return { success: true, message: 'Already processed' };
  }

  // 3. Lấy tài khoản từ kho
  const account = await Stock.findOneAndUpdate(
    { productId: order.productId._id, status: STOCK_STATUS.AVAILABLE },
    { status: STOCK_STATUS.SOLD, soldTo: order.telegramId, soldAt: new Date() },
    { new: true }
  );

  if (!account) {
    // Kho hết — cần xử lý hoàn tiền
    order.status = ORDER_STATUS.CANCELED;
    await order.save();
    logger.warn(`[BinancePay Webhook] Kho hết cho đơn ${merchantTradeNo}`);

    if (_bot) {
      await _bot.telegram.sendMessage(
        order.telegramId,
        `❌ *Đơn hàng ${merchantTradeNo} không thể thực hiện*\n\nKho hàng vừa hết. Admin sẽ liên hệ hoàn tiền cho bạn sớm nhất!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
    return { success: true, message: 'Out of stock — refund needed' };
  }

  // 4. Cập nhật đơn hàng
  order.status = ORDER_STATUS.PAID;
  order.accountDelivered = account.accountData;
  order.paymentMethod = 'Binance Pay';
  order.transactionId = data?.transactionId;
  await order.save();

  // 5. Gửi tài khoản cho user
  const decryptedAccount = decrypt(account.accountData);

  logAction(AUDIT_ACTIONS.ACCOUNT_DELIVERED, order.telegramId, {
    orderId: order.orderId,
    productId: String(order.productId._id),
  });

  if (_bot) {
    await _bot.telegram.sendMessage(
      order.telegramId,
      `🎉 *THANH TOÁN BINANCE PAY THÀNH CÔNG!*\n` +
      `-----------------------------------------\n` +
      `🆔 Mã đơn hàng: *${order.orderId}*\n` +
      `📦 Sản phẩm: *${order.productId.name}*\n` +
      `✅ Trạng thái: *Đã giao hàng*\n\n` +
      `🗝️ *THÔNG TIN TÀI KHOẢN:*\n\`${decryptedAccount}\`\n\n` +
      `👉 _Lưu lại thông tin. Nếu có lỗi, gõ /start và báo lỗi tài khoản._`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  // 6. Phát sự kiện để các plugins khác xử lý (alert, analytics...)
  await eventBus.emit(EVENTS.ORDER_PAID, {
    orderId: order.orderId,
    productName: order.productId.name,
    amount: `${order.amount} USDT`,
    telegramId: order.telegramId,
  });

  // 7. Kiểm tra tồn kho sau khi bán
  await checkStockLevels().catch(() => {});

  return { success: true, message: 'Payment processed successfully' };
};
