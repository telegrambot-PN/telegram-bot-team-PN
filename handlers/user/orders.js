// handlers/user/orders.js
// Quản lý và xem lịch sử đơn hàng của người dùng (/myorders hoặc click nút)

import { Markup } from 'telegraf';
import { Order, Product } from '../../db.js';
import { FEATURES } from '../../config/features.js';
import { formatCurrency, formatDate } from '../../utils/formatter.js';
import { decrypt } from '../../security/crypto.js';
import { BANK } from '../../config/constants.js';

/**
 * Lấy danh sách 5 đơn hàng gần nhất của người dùng
 * @param {string|number} telegramId 
 * @returns {Promise<{ text: string, keyboard: object }>}
 */
export async function getMyOrdersMessageAndKeyboard(telegramId) {
  const orders = await Order.find({ telegramId: String(telegramId) });
  
  // Sắp xếp theo ngày giảm dần và lấy 5 đơn gần nhất (đảm bảo chạy đúng cả MongoDB và Mock DB)
  const sortedOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);

  if (sortedOrders.length === 0) {
    return {
      text: `📦 *LỊCH SỬ ĐƠN HÀNG*\n-----------------------------------------\nBạn chưa thực hiện đơn hàng nào trên hệ thống! Đơn hàng của bạn sẽ xuất hiện tại đây sau khi bạn tiến hành mua sắm.`,
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu', 'show_menu')]])
    };
  }

  let text = `📦 *LỊCH SỬ 5 ĐƠN HÀNG GẦN NHẤT:*\n-----------------------------------------\n`;
  const buttons = [];

  for (let i = 0; i < sortedOrders.length; i++) {
    const order = sortedOrders[i];
    
    // Đảm bảo Product được nạp (chạy đúng cả MongoDB và Mock DB)
    let productName = 'Sản phẩm không rõ';
    if (order.productId) {
      if (typeof order.productId === 'object' && order.productId.name) {
        productName = order.productId.name;
      } else {
        const prod = await Product.findById(order.productId);
        if (prod) {
          order.productId = prod; // gán lại
          productName = prod.name;
        }
      }
    }

    const dateStr = formatDate(order.createdAt);
    let statusIcon = '⏳';
    let statusText = 'Chờ thanh toán';

    if (order.status === 'paid') {
      statusIcon = '✅';
      statusText = 'Đã thanh toán';
    } else if (order.status === 'canceled') {
      statusIcon = '❌';
      statusText = 'Đã hủy';
    }

    text += `${i + 1}. *${productName}*\n`;
    text += `   🆔 Mã đơn: \`${order.orderId}\`\n`;
    text += `   💵 Giá: *${formatCurrency(order.amount)}* | ${statusIcon} _${statusText}_\n`;
    text += `   📅 Ngày mua: _${dateStr}_\n\n`;

    // Nút xem chi tiết cho mỗi đơn hàng
    buttons.push([
      Markup.button.callback(
        `🔍 Chi tiết đơn: ${order.orderId}`,
        `view_order_${order.orderId}`
      )
    ]);
  }

  text += `👉 _Bấm các nút chi tiết đơn bên dưới để xem thông tin tài khoản đã cấp hoặc thanh toán tiếp đơn đang chờ._`;
  buttons.push([Markup.button.callback('↩️ Quay lại Menu', 'show_menu')]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

/**
 * Đăng ký handlers cho tính năng xem đơn hàng
 * @param {import('telegraf').Telegraf} bot
 */
export function registerUserOrdersHandlers(bot) {
  // Command /myorders
  bot.command('myorders', async (ctx) => {
    try {
      if (!FEATURES.MY_ORDERS) {
        return ctx.reply('⚠️ Tính năng xem lịch sử đơn hàng hiện đang tạm khóa.');
      }
      const res = await getMyOrdersMessageAndKeyboard(ctx.from.id);
      return ctx.replyWithMarkdown(res.text, res.keyboard);
    } catch (e) {
      console.error('/myorders error:', e);
    }
  });

  // Action show_my_orders
  bot.action('show_my_orders', async (ctx) => {
    try {
      if (!FEATURES.MY_ORDERS) {
        return ctx.answerCbQuery('⚠️ Tính năng này đang tạm khóa.', { show_alert: true });
      }
      await ctx.answerCbQuery();
      const res = await getMyOrdersMessageAndKeyboard(ctx.from.id);
      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithMarkdown(res.text, res.keyboard);
    } catch (e) {
      console.error('show_my_orders error:', e);
    }
  });

  // Xem chi tiết một đơn hàng cụ thể
  bot.action(/^view_order_(.+)$/, async (ctx) => {
    try {
      const orderId = ctx.match[1];
      const order = await Order.findOne({ orderId });
      if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng không tồn tại!');

      // Tải thông tin sản phẩm
      let product = null;
      if (order.productId) {
        if (typeof order.productId === 'object' && order.productId.name) {
          product = order.productId;
        } else {
          product = await Product.findById(order.productId);
        }
      }

      await ctx.answerCbQuery();

      if (order.status === 'paid') {
        const displayAccount = FEATURES.ENCRYPT_ACCOUNTS ? decrypt(order.accountDelivered) : order.accountDelivered;

        const paidText =
          `✅ *CHI TIẾT ĐƠN HÀNG ĐÃ THANH TOÁN*\n` +
          `-----------------------------------------\n` +
          `🆔 Mã đơn hàng: *${order.orderId}*\n` +
          `📦 Sản phẩm: *${product ? product.name : 'N/A'}*\n` +
          `💵 Giá tiền: *${formatCurrency(order.amount)}*\n` +
          `📅 Ngày mua: _${formatDate(order.createdAt)}_\n` +
          `🚚 Trạng thái: *Đã hoàn tất* ✅\n\n` +
          `🗝️ *THÔNG TIN TÀI KHOẢN CỦA BẠN:*\n` +
          `\`${displayAccount}\`\n\n` +
          `👉 _Nếu tài khoản có lỗi, bạn có thể tạo ticket báo lỗi ngay bên dưới!_`;

        await ctx.deleteMessage().catch(() => {});
        return ctx.reply(paidText, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚨 Báo lỗi tài khoản (Tạo Ticket)', `report_error_${order.orderId}`)],
            [
              Markup.button.callback('📦 Lịch sử đơn hàng', 'show_my_orders'),
              Markup.button.callback('↩️ Menu chính', 'show_menu'),
            ]
          ])
        });
      } else if (order.status === 'pending') {
        // Tái hiển thị thông tin thanh toán & VietQR
        const addInfo = `THANH TOAN DON HANG ${order.orderId}`;
        const qrUrl = `https://img.vietqr.io/image/${BANK.id}-${BANK.accountNo}-compact.png?amount=${order.amount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(BANK.accountName)}`;

        const pendingText =
          `📝 *HÓA ĐƠN THANH TOÁN ĐANG CHỜ*\n` +
          `-----------------------------------------\n` +
          `🆔 Mã đơn hàng: *${order.orderId}*\n` +
          `📦 Sản phẩm: *${product ? product.name : 'N/A'}*\n` +
          `💰 Số tiền: *${formatCurrency(order.amount)}*\n` +
          `📅 Ngày tạo: _${formatDate(order.createdAt)}_\n` +
          `🚚 Trạng thái: *Chờ thanh toán* ⏳\n\n` +
          `👉 *Hướng dẫn chuyển khoản:*\n` +
          `   • Ngân hàng: *MB Bank (MB)*\n` +
          `   • Số tài khoản: \`${BANK.accountNo}\`\n` +
          `   • Tên tài khoản: *${BANK.accountName}*\n` +
          `   • Số tiền: *${formatCurrency(order.amount)}*\n` +
          `   • Nội dung CK: \`${addInfo}\`\n\n` +
          `⚠️ *LƯU Ý:* Hệ thống đang ở chế độ **GIẢ LẬP**. Bấm nút bên dưới để giả lập thanh toán!`;

        await ctx.deleteMessage().catch(() => {});
        return ctx.replyWithPhoto(qrUrl, {
          caption: pendingText,
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💸 Test: Xác nhận đã nhận tiền (Simulate)', `simulate_paid_${order.orderId}`)],
            [
              Markup.button.callback('❌ Hủy đơn hàng', `cancel_order_${order.orderId}`),
              Markup.button.callback('📦 Lịch sử đơn', 'show_my_orders'),
            ],
          ])
        });
      } else {
        // Đơn đã hủy
        const canceledText =
          `❌ *THÔNG TIN ĐƠN HÀNG ĐÃ HỦY*\n` +
          `-----------------------------------------\n` +
          `🆔 Mã đơn hàng: *${order.orderId}*\n` +
          `📦 Sản phẩm: *${product ? product.name : 'N/A'}*\n` +
          `💵 Giá tiền: *${formatCurrency(order.amount)}*\n` +
          `📅 Ngày tạo: _${formatDate(order.createdAt)}_\n` +
          `🚚 Trạng thái: *Đã hủy* ❌\n\n` +
          `👉 _Đơn hàng này đã bị hủy. Bạn có thể tiến hành tạo đơn hàng mới._`;

        await ctx.deleteMessage().catch(() => {});
        return ctx.reply(canceledText, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('📦 Lịch sử đơn', 'show_my_orders'),
              Markup.button.callback('↩️ Menu chính', 'show_menu'),
            ]
          ])
        });
      }
    } catch (e) {
      console.error('view_order_ error:', e);
    }
  });
}
