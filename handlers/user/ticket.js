// handlers/user/ticket.js
// Luồng báo lỗi tài khoản và tạo ticket hỗ trợ (phía user)
// Tích hợp warranty policy — kiểm tra điều kiện trước khi cho mở ticket

import { Markup } from 'telegraf';
import { SESSION_STATES } from '../../config/constants.js';
import { canOpenTicket } from '../../plugins/warranty/policy.js';

/**
 * Đăng ký handler báo lỗi (report_error)
 * @param {import('telegraf').Telegraf} bot
 */
export function registerUserTicketHandlers(bot) {
  bot.action(/^report_error_(.+)$/, async (ctx) => {
    try {
      const orderId = ctx.match[1];

      // ✅ Kiểm tra warranty policy trước
      const { allowed, reason } = await canOpenTicket(orderId);
      if (!allowed) {
        await ctx.answerCbQuery();
        return ctx.reply(
          `⚠️ *Không thể mở yêu cầu hỗ trợ*\n\n${reason}\n\n` +
          `_Nếu bạn cần hỗ trợ thêm, vui lòng liên hệ trực tiếp với Admin._`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu', 'show_menu')]]) }
        );
      }

      // Lưu state để bot.on('text') biết user đang nhập mô tả lỗi
      ctx.session.state = `${SESSION_STATES.AWAITING_TICKET_DESC}${orderId}`;

      await ctx.answerCbQuery();
      return ctx.reply(
        `🚨 *BÁO LỖI TÀI KHOẢN & BẢO HÀNH*\n` +
        `-----------------------------------------\n` +
        `Mã đơn hàng: *${orderId}*\n\n` +
        `Vui lòng nhập chi tiết lỗi của tài khoản (Ví dụ: Sai mật khẩu, không đăng nhập được...) để gửi yêu cầu cho Ban Quản Trị:`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    } catch (e) {
      console.error('report_error_ error:', e);
    }
  });
}
