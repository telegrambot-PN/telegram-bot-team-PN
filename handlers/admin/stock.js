// handlers/admin/stock.js
// Quản lý kho hàng: chọn sản phẩm và nạp tài khoản hàng loạt
// Tích hợp: mã hóa accountData, audit log, low-stock alert

import { Markup } from 'telegraf';
import { Product } from '../../db.js';
import { encrypt } from '../../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { sanitizeAccountList } from '../../security/sanitize.js';
import { FEATURES } from '../../config/features.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { SESSION_STATES } from '../../config/constants.js';

/**
 * Đăng ký handlers nạp kho
 * @param {import('telegraf').Telegraf} bot
 */
export function registerAdminStockHandlers(bot) {
  // Chọn sản phẩm để nạp kho
  bot.action('admin_add_stock', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;

      const products = await Product.find();
      if (products.length === 0) {
        await ctx.answerCbQuery('⚠️ Hệ thống chưa có sản phẩm nào!');
        return ctx.reply('Vui lòng thêm sản phẩm trước khi nạp kho.');
      }

      const buttons = products.map((p) => [
        Markup.button.callback(`🗝️ Nạp: ${p.name}`, `admin_select_stock_${p._id}`),
      ]);
      buttons.push([Markup.button.callback('↩️ Quay lại Admin Panel', 'admin_panel')]);

      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      return ctx.reply(
        `🗝️ *NẠP KHO SẢN PHẨM (ADD STOCK)*\n\nChọn sản phẩm cần nạp thêm tài khoản:`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (e) {
      console.error('admin_add_stock error:', e);
    }
  });

  // Đã chọn sản phẩm — yêu cầu nhập danh sách accounts
  bot.action(/^admin_select_stock_(.+)$/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const product = await Product.findById(productId);
      if (!product) return ctx.answerCbQuery('⚠️ Sản phẩm không tồn tại!');

      ctx.session.state = `${SESSION_STATES.ADMIN_AWAITING_STOCK}${productId}`;

      await ctx.answerCbQuery();
      return ctx.reply(
        `🗝️ *NẠP KHO SẢN PHẨM:* *${product.name}*\n` +
        `-----------------------------------------\n` +
        `Gửi danh sách tài khoản cần nạp vào kho.\nĐịnh dạng: **mỗi dòng một tài khoản** (Ví dụ):\n` +
        `\`tk1@gmail.com|pass123\`\n` +
        `\`tk2@gmail.com|pass987\`\n\n` +
        `_Bot sẽ tự động tách dòng và nạp từng tài khoản._`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    } catch (e) {
      console.error('admin_select_stock_ error:', e);
    }
  });
}
