// handlers/user/menu.js
// Xây dựng giao diện Menu chính cho người dùng

import { Markup } from 'telegraf';
import { Product, Stock } from '../../db.js';
import { isAdmin } from '../../middlewares/auth.js';
import { formatCurrency } from '../../utils/formatter.js';
import { FEATURES } from '../../config/features.js';

/**
 * Tạo text và keyboard cho menu chính
 * @param {number|string} telegramId
 * @returns {Promise<{ text: string, keyboard: object }>}
 */
export async function getMenuMessageAndKeyboard(telegramId) {
  const products = await Product.find();

  let menuText =
    `🌟 *HỆ THỐNG BÁN TÀI KHOẢN SỐ TỰ ĐỘNG* 🌟\n` +
    `-----------------------------------------\n` +
    `Chào mừng bạn đến với hệ thống cung cấp tài khoản số tự động.\nAn toàn - Nhanh chóng - Giao hàng lập tức!\n\n` +
    `📋 *BẢNG GIÁ & KHO HÀNG HIỆN TẠI:*\n\n`;

  const buttons = [];

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const stockCount = await Stock.countDocuments({ productId: prod._id, status: 'available' });
    const isOutOfStock = stockCount === 0;

    menuText += `${i + 1}. *${prod.name}*\n`;
    menuText += `   💵 Giá: *${formatCurrency(prod.price)}* | Kho: _${isOutOfStock ? '❌ Hết hàng' : `🟢 Còn ${stockCount}`}_\n`;
    if (prod.description) menuText += `   👉 _${prod.description}_\n`;
    menuText += `\n`;

    buttons.push([
      Markup.button.callback(
        isOutOfStock ? `❌ ${prod.name} (Hết hàng)` : `🛒 Mua ${prod.name.replace(/[^\w\s]/g, '').trim()}`,
        isOutOfStock ? `out_of_stock` : `buy_${prod._id}`
      )
    ]);
  }

  menuText += `-----------------------------------------\n`;
  menuText += `👉 _Nhấp vào các nút bên dưới để tiến hành đặt mua._`;

  const userIsAdmin = await isAdmin(telegramId);
  if (userIsAdmin) {
    buttons.push([Markup.button.callback('⚙️ Trang Quản Trị Admin', 'admin_panel')]);
  }
  
  const bottomRow = [];
  if (FEATURES.MY_ORDERS) {
    bottomRow.push(Markup.button.callback('📦 Đơn Hàng Của Tôi', 'show_my_orders'));
  }
  bottomRow.push(Markup.button.callback('📖 Trợ Giúp', 'show_help'));
  buttons.push(bottomRow);

  return { text: menuText, keyboard: Markup.inlineKeyboard(buttons) };
}

/**
 * Đăng ký handlers cho menu actions
 * @param {import('telegraf').Telegraf} bot
 */
export function registerMenuHandlers(bot) {
  // Quay lại menu
  bot.action('show_menu', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const menu = await getMenuMessageAndKeyboard(ctx.from.id);
      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithMarkdown(menu.text, menu.keyboard);
    } catch (e) {
      console.error('show_menu error:', e);
    }
  });

  // Trợ giúp
  bot.action('show_help', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const helpText =
        `📖 *HƯỚNG DẪN MUA TÀI KHOẢN SỐ TỰ ĐỘNG:*\n\n` +
        `• Bước 1: Bấm nút \`🛒 Mua [Tên]\` ngay bên dưới thực đơn.\n` +
        `• Bước 2: Bot sẽ tạo đơn và gửi mã VietQR thanh toán.\n` +
        `• Bước 3: Bấm nút **[Test: Xác nhận đã nhận tiền (Simulate)]** để giả lập thanh toán.\n` +
        `• Bước 4: Tài khoản số sẽ được gửi trực tiếp cho bạn ngay lập tức!\n` +
        `• Bước 5: Nếu tài khoản bị lỗi, bấm **[Báo lỗi tài khoản]** để gửi khiếu nại tới Admin.\n\n` +
        `Gõ /start để quay lại thực đơn chính.`;
      return ctx.reply(helpText, Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu', 'show_menu')]]));
    } catch (e) {
      console.error('show_help error:', e);
    }
  });

  // Hết hàng
  bot.action('out_of_stock', async (ctx) => {
    return ctx.answerCbQuery('⚠️ Gói tài khoản này tạm thời đang cháy hàng! Vui lòng quay lại sau.', { show_alert: true });
  });
}
