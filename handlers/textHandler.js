// handlers/textHandler.js
// Xử lý tất cả tin nhắn text thường — state machine dựa trên session
// Tích hợp: sanitize input, encrypt stock, audit log, event bus

import { Markup } from 'telegraf';
import { Product, Stock, Ticket } from '../db.js';
import { SESSION_STATES, TICKET_STATUS } from '../config/constants.js';
import { formatCurrency, generateId } from '../utils/formatter.js';
import { encrypt } from '../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../security/audit.js';
import { sanitizeText, sanitizeAccountList, validatePrice, validateProductName, validateIssueDescription } from '../security/sanitize.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
import { FEATURES } from '../config/features.js';

/**
 * Đăng ký handler bot.on('text')
 * @param {import('telegraf').Telegraf} bot
 */
export function registerTextHandler(bot) {
  bot.on('text', async (ctx) => {
    try {
      const rawText = ctx.message.text;
      const text = sanitizeText(rawText); // ✅ Sanitize mọi input
      const session = ctx.session;

      // Bỏ qua nếu là lệnh slash
      if (text.startsWith('/')) {
        session.state = null;
        return;
      }

      // ────────────────────────────────────────
      // FLOW USER: Nhập mô tả lỗi → tạo Ticket
      // ────────────────────────────────────────
      if (session.state?.startsWith(SESSION_STATES.AWAITING_TICKET_DESC)) {
        const orderId = session.state.split('_').slice(-1)[0];

        // ✅ Validate mô tả lỗi
        const { valid, value: issueDesc, error } = validateIssueDescription(text);
        if (!valid) {
          return ctx.reply(`⚠️ ${error}\n\nVui lòng nhập lại mô tả chi tiết hơn:`, Markup.forceReply());
        }

        const ticketId = generateId('TK');
        const ticket = new Ticket({
          ticketId,
          telegramId: String(ctx.from.id),
          orderId,
          issueDescription: issueDesc,
          status: TICKET_STATUS.OPEN,
        });
        await ticket.save();
        session.state = null;

        // ✅ Audit log
        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.TICKET_OPEN, ctx.from.id, { orderId, ticketId });
        }

        // ✅ Phát sự kiện để plugins xử lý
        await eventBus.emit(EVENTS.TICKET_OPENED, { ticketId, orderId, telegramId: String(ctx.from.id) });

        return ctx.reply(
          `✅ *GỬI YÊU CẦU HỖ TRỢ THÀNH CÔNG!*\n` +
          `-----------------------------------------\n` +
          `🆔 Mã Ticket: *${ticketId}*\n` +
          `📦 Đơn hàng: *${orderId}*\n` +
          `📝 Nội dung lỗi: _${issueDesc}_\n` +
          `⏳ Trạng thái: *Đang chờ xử lý*\n\n` +
          `Ban Quản Trị sẽ phản hồi hoặc đổi tài khoản mới cho bạn sớm nhất qua chat inbox!`,
          Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')]])
        );
      }

      // ────────────────────────────────────────
      // FLOW ADMIN: Thêm sản phẩm — Bước 1 (tên)
      // ────────────────────────────────────────
      if (session.state === SESSION_STATES.ADMIN_AWAITING_PROD_NAME) {
        const { valid, value: name, error } = validateProductName(text);
        if (!valid) {
          return ctx.reply(`⚠️ ${error}`, Markup.forceReply());
        }
        session.tempData.name = name;
        session.state = SESSION_STATES.ADMIN_AWAITING_PROD_PRICE;
        return ctx.reply(
          `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 2/3)*\n\n` +
          `Tên sản phẩm: *${name}*\n\n` +
          `Vui lòng nhập *Giá tiền* sản phẩm (chỉ nhập số nguyên, ví dụ: \`65000\`):`,
          { parse_mode: 'Markdown', ...Markup.forceReply() }
        );
      }

      // FLOW ADMIN: Thêm sản phẩm — Bước 2 (giá)
      if (session.state === SESSION_STATES.ADMIN_AWAITING_PROD_PRICE) {
        const { valid, value: price, error } = validatePrice(text);
        if (!valid) {
          return ctx.reply(`⚠️ ${error}`, Markup.forceReply());
        }
        session.tempData.price = price;
        session.state = SESSION_STATES.ADMIN_AWAITING_PROD_DESC;
        return ctx.reply(
          `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 3/3)*\n\n` +
          `Tên sản phẩm: *${session.tempData.name}*\n` +
          `Giá bán: *${formatCurrency(price)}*\n\n` +
          `Vui lòng nhập *Mô tả sản phẩm* chi tiết:`,
          { parse_mode: 'Markdown', ...Markup.forceReply() }
        );
      }

      // FLOW ADMIN: Thêm sản phẩm — Bước 3 (mô tả) → Lưu
      if (session.state === SESSION_STATES.ADMIN_AWAITING_PROD_DESC) {
        const desc = sanitizeText(text, 500);
        const product = new Product({
          name: session.tempData.name,
          price: session.tempData.price,
          category: 'Tài khoản số',
          description: desc,
        });
        await product.save();
        session.state = null;
        session.tempData = {};

        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.PRODUCT_ADDED, ctx.from.id, {
            productName: product.name,
            price: product.price,
          });
        }

        await eventBus.emit(EVENTS.PRODUCT_ADDED, { productId: String(product._id), name: product.name });

        return ctx.reply(
          `✅ *THÊM SẢN PHẨM THÀNH CÔNG!*\n\n` +
          `Sản phẩm *${product.name}* với giá *${formatCurrency(product.price)}* đã được thêm vào hệ thống!`,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
            [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
          ])
        );
      }

      // FLOW ADMIN: Nạp kho hàng loạt — có mã hóa
      if (session.state?.startsWith(SESSION_STATES.ADMIN_AWAITING_STOCK)) {
        const productId = session.state.split('_').slice(-1)[0];
        const product = await Product.findById(productId);
        if (!product) return ctx.reply('❌ Có lỗi xảy ra: Sản phẩm không còn tồn tại!');

        // ✅ Dùng sanitizeAccountList thay vì split thủ công
        const { accounts, invalid } = sanitizeAccountList(text);
        if (accounts.length === 0) {
          return ctx.reply('⚠️ Bạn chưa nhập tài khoản nào! Vui lòng nhập lại:', Markup.forceReply());
        }

        // ✅ Mã hóa accountData nếu FEATURES.ENCRYPT_ACCOUNTS bật
        const stockDocs = accounts.map((acc) => ({
          productId: product._id,
          accountData: FEATURES.ENCRYPT_ACCOUNTS ? encrypt(acc) : acc,
          status: 'available',
        }));

        await Stock.insertMany(stockDocs);
        session.state = null;

        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.STOCK_ADDED, ctx.from.id, {
            productName: product.name,
            count: accounts.length,
          });
        }

        await eventBus.emit(EVENTS.STOCK_ADDED, {
          productId: String(product._id),
          productName: product.name,
          count: accounts.length,
        });

        const warningText = invalid > 0 ? `\n⚠️ _${invalid} dòng không hợp lệ đã bị bỏ qua._` : '';
        return ctx.reply(
          `✅ *NẠP KHO THÀNH CÔNG!*\n\n` +
          `Đã nạp *${accounts.length}* tài khoản${FEATURES.ENCRYPT_ACCOUNTS ? ' (đã mã hóa 🔐)' : ''} vào kho sản phẩm *${product.name}*!${warningText}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
            [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
          ])
        );
      }

      // FLOW ADMIN: Nhập phản hồi ticket
      if (session.state?.startsWith(SESSION_STATES.ADMIN_AWAITING_TICKET_REPLY)) {
        const ticketDbId = session.state.split('_').slice(-1)[0];
        const ticket = await Ticket.findById(ticketDbId);
        if (!ticket) return ctx.reply('❌ Ticket không tồn tại!');

        const replyText = sanitizeText(text, 2000);
        ticket.status = TICKET_STATUS.RESOLVED;
        ticket.reply = replyText;
        await ticket.save();
        session.state = null;

        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.TICKET_RESOLVE, ctx.from.id, {
            ticketId: ticket.ticketId,
            orderId: ticket.orderId,
            method: 'text_reply',
          });
        }

        await eventBus.emit(EVENTS.TICKET_RESOLVED, { ticketId: ticket.ticketId, method: 'reply' });

        try {
          await ctx.telegram.sendMessage(
            ticket.telegramId,
            `🔔 *PHẢN HỒI HỖ TRỢ TỪ BAN QUẢN TRỊ!*\n` +
            `-----------------------------------------\n` +
            `Yêu cầu đơn hàng *${ticket.orderId}* (Ticket *${ticket.ticketId}*) đã được giải quyết.\n\n` +
            `💬 *NỘI DUNG PHẢN HỒI:*\n"${replyText}"\n\n` +
            `Cảm ơn bạn đã tin tưởng dịch vụ!`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.error('Không thể gửi inbox cho khách:', e);
        }

        return ctx.reply(
          `✅ *GỬI PHẢN HỒI THÀNH CÔNG!*\n\nTin nhắn đã chuyển tới khách và ticket *${ticket.ticketId}* đã đóng.`,
          Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại danh sách Tickets', 'admin_view_tickets')]])
        );
      }

      // Mặc định — echo lại tin nhắn
      return ctx.reply(
        `🤖 *Bot nhại lại:* "${sanitizeText(text, 200)}"\n\n` +
        `👉 _Nhập /start để xem thực đơn các sản phẩm tài khoản số tự động!_`
      );
    } catch (e) {
      console.error('textHandler error:', e);
    }
  });
}
