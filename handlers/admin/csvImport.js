// handlers/admin/csvImport.js
// Quản lý và xử lý nhập sản phẩm & kho tài khoản hàng loạt từ tệp tin CSV (Excel)
// Độc lập, an toàn, tự động mã hóa tài khoản trước khi nạp kho.

import { Markup } from 'telegraf';
import { Product, Stock } from '../../db.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { encrypt } from '../../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../../security/audit.js';
import { eventBus, EVENTS } from '../../core/eventBus.js';
import { FEATURES } from '../../config/features.js';
import { logger } from '../../utils/logger.js';

/**
 * Hàm phân tích cú pháp CSV tuân thủ chuẩn RFC 4180
 * Hỗ trợ dấu phẩy trong dấu ngoặc kép và nhảy dòng
 * @param {string} text 
 * @returns {string[][]} danh sách các hàng tế bào
 */
export const parseCSV = (text) => {
  const lines = [];
  let row = [""];
  lines.push(row);
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      row = [""];
      lines.push(row);
    } else {
      row[row.length - 1] += c;
    }
  }

  // Loại bỏ hàng rỗng
  return lines
    .map(r => r.map(cell => cell.trim()))
    .filter(r => r.length > 0 && r.some(cell => cell !== ""));
};

/**
 * Đăng ký các handlers nhập dữ liệu CSV
 * @param {import('telegraf').Telegraf} bot 
 */
export function registerAdminCsvImportHandlers(bot) {
  // Click nút nhập sản phẩm từ CSV
  bot.action('admin_import_products_csv', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;

      ctx.session.state = 'admin_awaiting_products_csv';
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});

      return ctx.reply(
        `📥 *NHẬP SẢN PHẨM HÀNG LOẠT TỪ CSV (EXCEL)*\n` +
        `-----------------------------------------\n` +
        `Vui lòng thiết kế file CSV theo định dạng chuẩn sau:\n` +
        `\`name,price,category,description\`\n\n` +
        `💡 *Lưu ý quan trọng:*\n` +
        `• Chọn encoding là *UTF-8 (Comma delimited)* khi Save As file CSV trong Excel để tránh lỗi font tiếng Việt.\n` +
        `• Hàng đầu tiên trong file phải là tiêu đề cột (\`name,price...\`).\n\n` +
        `👉 Hãy gửi tệp tin đính kèm định dạng \`.csv\` lên đây:`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    } catch (e) {
      console.error('admin_import_products_csv error:', e);
    }
  });

  // Click nút nhập kho stock từ CSV
  bot.action('admin_import_stocks_csv', async (ctx) => {
    try {
      if (!(await requireAdmin(ctx))) return;

      ctx.session.state = 'admin_awaiting_stocks_csv';
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});

      return ctx.reply(
        `📥 *NẠP KHO HÀNG LOẠT TỪ CSV (EXCEL)*\n` +
        `-----------------------------------------\n` +
        `Vui lòng thiết kế file CSV theo định dạng chuẩn sau:\n` +
        `\`productName,accountData\`\n\n` +
        `🛡️ *An toàn bảo mật:*\n` +
        `• Tài khoản nạp vào sẽ được tự động **Mã hóa AES-256-GCM** bảo mật trước khi lưu vào CSDL.\n` +
        `• Hàng đầu tiên trong file phải là tiêu đề cột (\`productName,accountData\`).\n\n` +
        `👉 Hãy gửi tệp tin đính kèm định dạng \`.csv\` lên đây:`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    } catch (e) {
      console.error('admin_import_stocks_csv error:', e);
    }
  });

  // Xử lý khi nhận tệp tin đính kèm
  bot.on('document', async (ctx) => {
    try {
      const session = ctx.session;
      if (!session.state || !session.state.startsWith('admin_awaiting_')) return;
      if (!(await requireAdmin(ctx))) return;

      const doc = ctx.message.document;
      if (!doc.file_name.endsWith('.csv')) {
        return ctx.reply('⚠️ Định dạng tệp tin không hợp lệ! Vui lòng chỉ gửi tệp tin đuôi \`.csv\`.');
      }

      await ctx.reply('⏳ Đang nhận dữ liệu và phân tích cú pháp tệp CSV...');

      // 1. Tải file CSV từ máy chủ Telegram bằng fetch tích hợp sẵn
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink);
      const csvText = await response.text();

      // 2. Parse dữ liệu CSV
      const rows = parseCSV(csvText);
      if (rows.length <= 1) {
        return ctx.reply('⚠️ Tệp CSV rỗng hoặc chỉ có dòng tiêu đề!');
      }

      const headers = rows[0]; // Bỏ qua tiêu đề
      const dataRows = rows.slice(1);

      if (session.state === 'admin_awaiting_products_csv') {
        // Nhập Sản Phẩm
        let successCount = 0;
        let skipCount = 0;

        for (const row of dataRows) {
          if (row.length < 2) {
            skipCount++;
            continue;
          }

          const [name, priceStr, category, description] = row;
          const price = parseInt(priceStr, 10);

          if (!name || isNaN(price) || price <= 0) {
            skipCount++;
            continue;
          }

          const product = new Product({
            name,
            price,
            category: category || 'Tài khoản số',
            description: description || '',
          });
          await product.save();
          successCount++;
        }

        session.state = null;

        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.PRODUCT_ADDED, ctx.from.id, {
            method: 'csv_import',
            count: successCount,
          });
        }

        return ctx.reply(
          `✅ *NHẬP SẢN PHẨM THÀNH CÔNG!*\n\n` +
          `• Đã thêm thành công: *${successCount} sản phẩm*\n` +
          `• Bỏ qua (lỗi định dạng): *${skipCount} hàng*\n\n` +
          `Sản phẩm mới đã được cập nhật trực tiếp vào menu bán hàng!`,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
            [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
          ])
        );

      } else if (session.state === 'admin_awaiting_stocks_csv') {
        // Nhập Tồn Kho
        let successCount = 0;
        let skipCount = 0;
        const missingProducts = new Set();

        for (const row of dataRows) {
          if (row.length < 2) {
            skipCount++;
            continue;
          }

          const [productName, accountData] = row;
          if (!productName || !accountData) {
            skipCount++;
            continue;
          }

          // Tìm sản phẩm theo tên
          const product = await Product.findOne({ name: productName });
          if (!product) {
            missingProducts.add(productName);
            skipCount++;
            continue;
          }

          // Mã hóa tài khoản
          const secureAccount = FEATURES.ENCRYPT_ACCOUNTS ? encrypt(accountData) : accountData;

          const stock = new Stock({
            productId: product._id,
            accountData: secureAccount,
            status: 'available',
          });
          await stock.save();
          successCount++;

          // Phát sự kiện cập nhật kho
          await eventBus.emit(EVENTS.STOCK_ADDED, {
            productId: String(product._id),
            productName: product.name,
            count: 1,
          });
        }

        session.state = null;

        if (FEATURES.AUDIT_LOG) {
          logAction(AUDIT_ACTIONS.STOCK_ADDED, ctx.from.id, {
            method: 'csv_import',
            count: successCount,
          });
        }

        let reportText = 
          `✅ *NẠP KHO THÀNH CÔNG LÀM ĐỢT!*\n\n` +
          `• Đã nạp thành công: *${successCount} tài khoản*${FEATURES.ENCRYPT_ACCOUNTS ? ' (Đã mã hóa 🔐)' : ''}\n` +
          `• Bỏ qua (lỗi định dạng hoặc sản phẩm không có): *${skipCount} hàng*\n`;

        if (missingProducts.size > 0) {
          reportText += `\n⚠️ *Các sản phẩm chưa được tạo nên bị bỏ qua:*\n`;
          Array.from(missingProducts).slice(0, 5).forEach(pName => {
            reportText += `- _${pName}_\n`;
          });
          if (missingProducts.size > 5) reportText += `- _và ${missingProducts.size - 5} sản phẩm khác..._\n`;
        }

        return ctx.reply(
          reportText,
          Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
            [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')],
          ])
        );
      }

    } catch (e) {
      logger.error('Import CSV error:', e);
      ctx.reply('❌ Đã xảy ra lỗi hệ thống khi nhập tệp tin CSV! Vui lòng kiểm tra lại định dạng file của bạn.');
    }
  });
}
