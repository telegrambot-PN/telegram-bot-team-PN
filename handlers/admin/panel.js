// handlers/admin/panel.js
// Admin panel — thống kê và menu quản trị

import { Markup } from 'telegraf';
import { Order, Product, Stock, Ticket } from '../../db.js';
import { requireAdmin, isAdmin } from '../../middlewares/auth.js';
import { formatCurrency } from '../../utils/formatter.js';

/**
 * Tạo text và keyboard cho Admin Panel
 * @returns {Promise<{ text: string, keyboard: object }>}
 */
export async function getAdminPanel() {
  const totalRevenueResult = await Order.aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;
  const totalPaidOrders = await Order.countDocuments({ status: 'paid' });
  const totalProducts = await Product.countDocuments();
  const totalStockAvailable = await Stock.countDocuments({ status: 'available' });
  const totalOpenTickets = await Ticket.countDocuments({ status: 'open' });

  const adminText =
    `⚙️ *BAN QUẢN TRỊ ADMIN - SHOP TÀI KHOẢN SỐ* 🌟\n` +
    `-----------------------------------------\n` +
    `📊 Thống kê hệ thống hiện tại:\n\n` +
    `💰 Tổng doanh thu: *${formatCurrency(totalRevenue)}*\n` +
    `📦 Đơn hàng thành công: *${totalPaidOrders} đơn*\n` +
    `🛒 Số gói sản phẩm: *${totalProducts} gói*\n` +
    `🗝️ Tài khoản trong kho: *${totalStockAvailable} tài khoản*\n` +
    `🚨 Tickets chờ xử lý: *${totalOpenTickets} ticket*\n\n` +
    `👉 _Lựa chọn tác vụ quản trị bên dưới:_`;

  const buttons = [
    [
      Markup.button.callback('➕ Thêm Sản Phẩm Mới', 'admin_add_product'),
      Markup.button.callback('🗝️ Nạp Kho (Add Stock)', 'admin_add_stock'),
    ],
    [
      Markup.button.callback('📥 Nhập SP từ CSV', 'admin_import_products_csv'),
      Markup.button.callback('📥 Nhập Kho từ CSV', 'admin_import_stocks_csv'),
    ],
    [Markup.button.callback('🚨 Tickets Hỗ Trợ', 'admin_view_tickets')],
    [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
  ];

  return { text: adminText, keyboard: Markup.inlineKeyboard(buttons) };
}

/**
 * Đăng ký handlers admin panel
 * @param {import('telegraf').Telegraf} bot
 */
export function registerAdminPanelHandlers(bot) {
  // Lệnh /admin
  bot.command('admin', async (ctx) => {
    try {
      if (!(await isAdmin(ctx.from.id))) {
        return ctx.reply('⚠️ Bạn không có quyền truy cập trang quản trị!');
      }
      const admin = await getAdminPanel();
      return ctx.replyWithMarkdown(admin.text, admin.keyboard);
    } catch (e) {
      console.error('/admin error:', e);
    }
  });

  // Nút mở Admin Panel
  bot.action('admin_panel', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;
      await ctx.answerCbQuery();
      const admin = await getAdminPanel();
      await ctx.deleteMessage().catch(() => {});
      return ctx.replyWithMarkdown(admin.text, admin.keyboard);
    } catch (e) {
      console.error('admin_panel error:', e);
    }
  });
}
