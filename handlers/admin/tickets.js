// handlers/admin/tickets.js
// Quản lý tickets hỗ trợ: xem, cấp bù, reply, đóng ticket

import { Markup } from 'telegraf';
import { Ticket, Order, Stock } from '../../db.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { SESSION_STATES, TICKET_STATUS, STOCK_STATUS } from '../../config/constants.js';
import { formatDate } from '../../utils/formatter.js';
import { decrypt } from '../../security/crypto.js';
import { FEATURES } from '../../config/features.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { autoRefund } from '../../plugins/warranty/autoRefund.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';

/**
 * Đăng ký handlers quản lý tickets
 * @param {import('telegraf').Telegraf} bot
 */
export function registerAdminTicketHandlers(bot) {
  // Xem danh sách ticket đang mở
  bot.action('admin_view_tickets', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;

      const tickets = await Ticket.find({ status: TICKET_STATUS.OPEN });
      if (tickets.length === 0) {
        await ctx.answerCbQuery('🎉 Không có ticket nào đang chờ xử lý!', { show_alert: true });
        return;
      }

      const buttons = tickets.map((t) => [
        Markup.button.callback(`🚨 ${t.ticketId} (Đơn: ${t.orderId})`, `admin_select_ticket_${t._id}`),
      ]);
      buttons.push([Markup.button.callback('↩️ Quay lại Admin Panel', 'admin_panel')]);

      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      return ctx.reply(
        `🚨 *DANH SÁCH TICKET BÁO LỖI CHỜ XỬ LÝ:*\n\nBấm vào mã ticket để xem chi tiết và giải quyết:`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (e) {
      console.error('admin_view_tickets error:', e);
    }
  });

  // Xem chi tiết 1 ticket
  bot.action(/^admin_select_ticket_(.+)$/, async (ctx) => {
    try {
      const ticketDbId = ctx.match[1];
      const ticket = await Ticket.findById(ticketDbId);
      if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');

      const order = await Order.findOne({ orderId: ticket.orderId }).populate('productId');

      // Giải mã tài khoản đã cấp nếu được bật
      let oldAccount = 'N/A';
      if (order && order.accountDelivered) {
        oldAccount = FEATURES.ENCRYPT_ACCOUNTS ? decrypt(order.accountDelivered) : order.accountDelivered;
      }

      const ticketDetail =
        `🚨 *CHI TIẾT TICKET LỖI:* *${ticket.ticketId}*\n` +
        `-----------------------------------------\n` +
        `• Đơn hàng: *${ticket.orderId}* (${order ? order.productId.name : 'N/A'})\n` +
        `• Khách hàng: ID \`${ticket.telegramId}\`\n` +
        `• Nội dung lỗi: _${ticket.issueDescription}_\n` +
        `• Tài khoản đã cấp: \`${oldAccount}\`\n` +
        `• Thời gian báo: _${formatDate(ticket.createdAt)}_\n` +
        `-----------------------------------------\n` +
        `👉 *LỰA CHỌN GIẢI QUYẾT:*\n` +
        `1. *Cấp bù tự động:* Bot tự lấy tài khoản mới từ kho.\n` +
        `2. *Trả lời bằng chat:* Nhập nội dung phản hồi cho khách.`;

      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
      return ctx.reply(ticketDetail, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Cấp bù tài khoản mới (Auto Replace)', `admin_replace_ticket_${ticketDbId}`)],
          [
            Markup.button.callback('✍️ Nhập tin nhắn phản hồi', `admin_reply_ticket_${ticketDbId}`),
            Markup.button.callback('✅ Giải quyết xong (Đóng)', `admin_resolve_ticket_${ticketDbId}`),
          ],
          [Markup.button.callback('↩️ Quay lại danh sách', 'admin_view_tickets')],
        ]),
      });
    } catch (e) {
      console.error('admin_select_ticket_ error:', e);
    }
  });

  // Cấp bù tài khoản mới tự động
  bot.action(/^admin_replace_ticket_(.+)$/, async (ctx) => {
    try {
      const ticketDbId = ctx.match[1];
      const ticket = await Ticket.findById(ticketDbId);
      if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');

      const order = await Order.findOne({ orderId: ticket.orderId });
      if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng liên quan không tồn tại!');

      const account = await Stock.findOneAndUpdate(
        { productId: order.productId, status: STOCK_STATUS.AVAILABLE },
        { status: STOCK_STATUS.SOLD, soldTo: ticket.telegramId, soldAt: new Date() },
        { new: true }
      );

      // Nếu kho đã hết
      if (!account) {
        if (FEATURES.WARRANTY_AUTO_REFUND) {
          await ctx.answerCbQuery('⚠️ Kho hết! Bắt đầu hoàn tiền tự động...', { show_alert: true });
          const refundRes = await autoRefund({ ticket, order, bot });

          if (refundRes.success) {
            ticket.status = TICKET_STATUS.RESOLVED;
            ticket.reply = `Tự động hoàn tiền do hết kho (${refundRes.message})`;
            await ticket.save();

            // Nhắn cho khách hàng
            try {
              await ctx.telegram.sendMessage(
                ticket.telegramId,
                `🔔 *HỖ TRỢ BẢO HÀNH — THÔNG BÁO HOÀN TIỀN*\n` +
                `-----------------------------------------\n` +
                `Yêu cầu lỗi đơn hàng *${ticket.orderId}* (Ticket *${ticket.ticketId}*) đã được giải quyết.\n\n` +
                `❌ Kho của chúng tôi hiện đã hết sản phẩm để cấp bù.\n` +
                `💰 *Hệ thống đã kích hoạt tiến trình hoàn tiền cho bạn.*\n` +
                `👉 _Chi tiết:_ ${refundRes.message}`,
                { parse_mode: 'Markdown' }
              );
            } catch (e) {
              console.error('Không thể nhắn tin cho khách:', e);
            }

            return ctx.reply(
              `❌ Kho hết! Đã kích hoạt hoàn tiền tự động thành công!\n\nChi tiết: ${refundRes.message}`,
              Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Tickets', 'admin_view_tickets')]])
            );
          } else {
            return ctx.reply(
              `❌ Kho hết! Cố gắng hoàn tiền tự động thất bại: ${refundRes.message}\n\nVui lòng hoàn tiền thủ công cho khách!`,
              Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Tickets', 'admin_view_tickets')]])
            );
          }
        }

        return ctx.reply('❌ Không thể cấp bù — kho hàng của sản phẩm này đã hết và tính năng Auto-Refund đang tắt!');
      }

      // Có tài khoản cấp bù
      const displayAccount = FEATURES.ENCRYPT_ACCOUNTS ? decrypt(account.accountData) : account.accountData;

      ticket.status = TICKET_STATUS.RESOLVED;
      ticket.reply = `Admin đã cấp bù tài khoản mới: ${displayAccount}`;
      await ticket.save();

      order.accountDelivered = account.accountData; // Lưu encrypted
      await order.save();

      await ctx.answerCbQuery('🔄 Đã cấp bù thành công!');

      // ✅ Audit log
      if (FEATURES.AUDIT_LOG) {
        logAction(AUDIT_ACTIONS.TICKET_RESOLVE, ctx.from.id, {
          ticketId: ticket.ticketId,
          orderId: ticket.orderId,
          method: 'replace',
        });
      }

      // ✅ Phát sự kiện
      await eventBus.emit(EVENTS.TICKET_RESOLVED, { ticketId: ticket.ticketId, method: 'replace' });

      // Nhắn riêng cho khách
      try {
        await ctx.telegram.sendMessage(
          ticket.telegramId,
          `🔔 *HỖ TRỢ ĐỔI TRẢ BẢO HÀNH TỰ ĐỘNG!*\n` +
          `-----------------------------------------\n` +
          `Yêu cầu lỗi đơn hàng *${ticket.orderId}* (Ticket *${ticket.ticketId}*) đã được Admin xử lý.\n\n` +
          `🗝️ *TÀI KHOẢN MỚI CẤP BÙ:*\n\`${displayAccount}\`\n\n` +
          `Cảm ơn bạn đã kiên nhẫn!`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.error('Không thể nhắn tin cho khách:', e);
      }

      return ctx.reply(
        `✅ Đã cấp bù tài khoản mới thành công!\n\nTài khoản mới: \`${displayAccount}\`\nHệ thống đã gửi inbox cho khách và đóng ticket.`,
        Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Tickets', 'admin_view_tickets')]])
      );
    } catch (e) {
      console.error('admin_replace_ticket_ error:', e);
    }
  });

  // Đóng ticket thủ công
  bot.action(/^admin_resolve_ticket_(.+)$/, async (ctx) => {
    try {
      const ticketDbId = ctx.match[1];
      const ticket = await Ticket.findById(ticketDbId);
      if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');

      ticket.status = TICKET_STATUS.RESOLVED;
      ticket.reply = 'Đã giải quyết và đóng thủ công bởi Admin.';
      await ticket.save();

      await ctx.answerCbQuery('✅ Đã giải quyết xong ticket!');

      // ✅ Audit log
      if (FEATURES.AUDIT_LOG) {
        logAction(AUDIT_ACTIONS.TICKET_RESOLVE, ctx.from.id, {
          ticketId: ticket.ticketId,
          orderId: ticket.orderId,
          method: 'resolve_manual',
        });
      }

      // ✅ Phát sự kiện
      await eventBus.emit(EVENTS.TICKET_RESOLVED, { ticketId: ticket.ticketId, method: 'resolve_manual' });

      return ctx.reply(
        `✅ Đã đóng ticket *${ticket.ticketId}* thành công!`,
        Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Tickets', 'admin_view_tickets')]])
      );
    } catch (e) {
      console.error('admin_resolve_ticket_ error:', e);
    }
  });

  // Bắt đầu flow reply ticket
  bot.action(/^admin_reply_ticket_(.+)$/, async (ctx) => {
    try {
      const ticketDbId = ctx.match[1];
      const ticket = await Ticket.findById(ticketDbId);
      if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');

      ctx.session.state = `${SESSION_STATES.ADMIN_AWAITING_TICKET_REPLY}${ticketDbId}`;

      await ctx.answerCbQuery();
      return ctx.reply(
        `✍️ *PHẢN HỒI TICKET:* *${ticket.ticketId}*\n\nNhập nội dung tin nhắn muốn gửi cho khách hàng:`,
        Markup.forceReply()
      );
    } catch (e) {
      console.error('admin_reply_ticket_ error:', e);
    }
  });
}
