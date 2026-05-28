// handlers/admin/product.js
// Quản lý sản phẩm: thêm mới (flow 3 bước)

import { Markup } from 'telegraf';
import { requireAdmin } from '../../middlewares/auth.js';
import { SESSION_STATES } from '../../config/constants.js';

/**
 * Đăng ký handlers thêm sản phẩm
 * @param {import('telegraf').Telegraf} bot
 */
export function registerAdminProductHandlers(bot) {
  // Bắt đầu flow thêm sản phẩm
  bot.action('admin_add_product', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;

      ctx.session.state = SESSION_STATES.ADMIN_AWAITING_PROD_NAME;
      ctx.session.tempData = {};

      await ctx.answerCbQuery();
      return ctx.reply(
        `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 1/3)*\n\n` +
        `Vui lòng nhập *Tên gói sản phẩm* mới muốn bán\n(Ví dụ: \`📺 Netflix Premium 1 Tháng\`):`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    } catch (e) {
      console.error('admin_add_product error:', e);
    }
  });
}
