// handlers/user/buy.js
// Luồng mua hàng: chọn sản phẩm → tạo đơn → QR → xác nhận → cấp account
// Tích hợp: audit log, decrypt accountData, event bus, low-stock check

import { Markup } from 'telegraf';
import { Product, Stock, Order } from '../../db.js';
import { BANK, ORDER, ORDER_STATUS, STOCK_STATUS } from '../../config/constants.js';
import { formatCurrency, generateId } from '../../utils/formatter.js';
import { decrypt } from '../../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { FEATURES } from '../../config/features.js';
import { getMenuMessageAndKeyboard } from './menu.js';

/**
 * Đăng ký các handlers liên quan đến mua hàng
 * @param {import('telegraf').Telegraf} bot
 */
export function registerBuyHandlers(bot) {
  // Bắt đầu luồng mua
  bot.action(/^buy_(.+)$/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const product = await Product.findById(productId);
      if (!product) return ctx.answerCbQuery('⚠️ Sản phẩm không tồn tại!');

      const stockCount = await Stock.countDocuments({ productId, status: STOCK_STATUS.AVAILABLE });
      if (stockCount === 0) {
        return ctx.answerCbQuery('⚠️ Rất tiếc, sản phẩm này hiện đã hết hàng!', { show_alert: true });
      }

      const userId = ctx.from.id;
      const orderId = generateId(ORDER.ID_PREFIX);

      // Tạo đơn hàng
      const order = new Order({
        orderId,
        telegramId: String(userId),
        productId: product._id,
        amount: product.price,
        status: ORDER_STATUS.PENDING,
      });
      await order.save();

      await ctx.answerCbQuery('📝 Đã tạo hóa đơn thanh toán!');

      // Tạo QR VietQR
      const addInfo = `THANH TOAN DON HANG ${orderId}`;
      const qrUrl = `https://img.vietqr.io/image/${BANK.id}-${BANK.accountNo}-compact.png?amount=${product.price}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(BANK.accountName)}`;

      const checkoutText =
        `📝 *THÔNG TIN THANH TOÁN ĐƠN HÀNG*\n` +
        `-----------------------------------------\n` +
        `🆔 Mã đơn hàng: *${orderId}*\n` +
        `📦 Sản phẩm: *${product.name}*\n` +
        `💰 Số tiền: *${formatCurrency(product.price)}*\n` +
        `🚚 Trạng thái: *Chờ thanh toán* ⏳\n\n` +
        `👉 *Hướng dẫn chuyển khoản:*\n` +
        `   • Ngân hàng: *MB Bank (MB)*\n` +
        `   • Số tài khoản: \`${BANK.accountNo}\`\n` +
        `   • Tên tài khoản: *${BANK.accountName}*\n` +
        `   • Số tiền: *${formatCurrency(product.price)}*\n` +
        `   • Nội dung CK: \`${addInfo}\`\n\n` +
        `⚠️ *LƯU Ý:* Hệ thống đang ở chế độ **GIẢ LẬP**. Bấm nút bên dưới để giả lập thanh toán!`;

      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithPhoto(qrUrl, {
        caption: checkoutText,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💸 Test: Xác nhận đã nhận tiền (Simulate)', `simulate_paid_${orderId}`)],
          [
            Markup.button.callback('❌ Hủy đơn hàng', `cancel_order_${orderId}`),
            Markup.button.callback('↩️ Quay lại Menu', 'show_menu'),
          ],
        ]),
      });
    } catch (e) {
      console.error('buy_ error:', e);
    }
  });

  // Giả lập thanh toán thành công
  bot.action(/^simulate_paid_(.+)$/, async (ctx) => {
    try {
      const orderId = ctx.match[1];
      const order = await Order.findOne({ orderId }).populate('productId');
      if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng không tồn tại!');

      if (order.status !== ORDER_STATUS.PENDING) {
        return ctx.answerCbQuery(`⚠️ Đơn hàng đã xử lý (${order.status})`);
      }

      // Lấy tài khoản từ kho — dùng findOneAndUpdate để tránh trùng lặp
      const account = await Stock.findOneAndUpdate(
        { productId: order.productId._id, status: STOCK_STATUS.AVAILABLE },
        { status: STOCK_STATUS.SOLD, soldTo: order.telegramId, soldAt: new Date() },
        { new: true }
      );

      if (!account) {
        await ctx.answerCbQuery('⚠️ Gói này vừa hết hàng! Đơn hàng đã hủy.');
        order.status = ORDER_STATUS.CANCELED;
        await order.save();
        return ctx.reply('❌ Kho hàng đã hết. Vui lòng liên hệ Admin để nhận lại tiền hoặc chọn gói khác.');
      }

      order.status = ORDER_STATUS.PAID;
      order.accountDelivered = account.accountData; // lưu encrypted
      await order.save();

      await ctx.answerCbQuery('🎉 Xác nhận thanh toán thành công!');

      // ✅ Giải mã trước khi gửi cho user
      const displayAccount = FEATURES.ENCRYPT_ACCOUNTS ? decrypt(account.accountData) : account.accountData;

      // ✅ Audit log
      if (FEATURES.AUDIT_LOG) {
        logAction(AUDIT_ACTIONS.ACCOUNT_DELIVERED, ctx.from.id, {
          orderId,
          productId: String(order.productId._id),
        });
      }

      const deliverText =
        `🎉 *THANH TOÁN THÀNH CÔNG & GIAO HÀNG TỰ ĐỘNG!*\n` +
        `-----------------------------------------\n` +
        `🆔 Mã đơn hàng: *${orderId}*\n` +
        `📦 Sản phẩm: *${order.productId.name}*\n` +
        `💵 Tổng tiền: *${formatCurrency(order.amount)}*\n` +
        `🚚 Trạng thái: *Đã bàn giao tài khoản* ✅\n\n` +
        `🗝️ *THÔNG TIN TÀI KHOẢN CỦA BẠN:*\n` +
        `\`${displayAccount}\`\n\n` +
        `👉 _Lưu lại thông tin tài khoản. Nếu có lỗi, bấm "Báo lỗi tài khoản" bên dưới!_`;

      // ✅ Phát sự kiện (alert admin, analytics...)
      await eventBus.emit(EVENTS.ORDER_PAID, {
        orderId,
        productName: order.productId.name,
        amount: formatCurrency(order.amount),
        telegramId: String(ctx.from.id),
      });


      await ctx.deleteMessage().catch(() => {});
      return ctx.reply(deliverText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🚨 Báo lỗi tài khoản (Tạo Ticket)', `report_error_${orderId}`)],
          [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
        ]),
      });
    } catch (e) {
      console.error('simulate_paid_ error:', e);
    }
  });

  // Hủy đơn hàng
  bot.action(/^cancel_order_(.+)$/, async (ctx) => {
    try {
      const orderId = ctx.match[1];
      const order = await Order.findOne({ orderId });
      if (order && order.status === ORDER_STATUS.PENDING) {
        order.status = ORDER_STATUS.CANCELED;
        await order.save();
        await ctx.answerCbQuery('❌ Đơn hàng đã hủy.');
      } else {
        await ctx.answerCbQuery('⚠️ Không thể hủy đơn hàng này.');
      }

      const menu = await getMenuMessageAndKeyboard(ctx.from.id);
      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithMarkdown(menu.text, menu.keyboard);
    } catch (e) {
      console.error('cancel_order_ error:', e);
    }
  });
}
