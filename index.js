// index.js — Entry Point v2.0
// Plugin-based architecture: thêm tính năng mới chỉ cần tạo plugin mới

import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { Product, Stock } from './db.js';

// Core
import { loadPlugins } from './core/pluginLoader.js';

// Security
import { cleanOldLogs } from './security/audit.js';

// Config
import { FEATURES, printFeatureStatus } from './config/features.js';

// Middlewares
import { sessionMiddleware } from './middlewares/session.js';
import { rateLimitMiddleware } from './middlewares/rateLimit.js';

// User Handlers
import { registerStartHandler } from './handlers/user/start.js';
import { registerMenuHandlers } from './handlers/user/menu.js';
import { registerBuyHandlers } from './handlers/user/buy.js';
import { registerUserTicketHandlers } from './handlers/user/ticket.js';
import { registerUserOrdersHandlers } from './handlers/user/orders.js';

// Admin Handlers
import { registerAdminPanelHandlers } from './handlers/admin/panel.js';
import { registerAdminProductHandlers } from './handlers/admin/product.js';
import { registerAdminStockHandlers } from './handlers/admin/stock.js';
import { registerAdminTicketHandlers } from './handlers/admin/tickets.js';

// Text Handler (State Machine)
import { registerTextHandler } from './handlers/textHandler.js';

import { logger } from './utils/logger.js';

// ─── Tải cấu hình ────────────────────────────────────────
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('❌ LỖI: Bạn chưa thiết lập BOT_TOKEN trong file .env!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ─── Seed dữ liệu mẫu khi DB trống ──────────────────────
async function seedDefaultProducts() {
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      logger.info('🌱 Đang khởi tạo các sản phẩm mẫu...');
      const createdProducts = await Product.insertMany([
        { name: '📺 Netflix Premium 1 Tháng', price: 65000, category: 'Streaming', description: 'Xem phim 4K Ultra HD cực mượt, hỗ trợ 1 profile cá nhân riêng tư.' },
        { name: '🎵 Spotify Premium 1 Năm', price: 190000, category: 'Streaming', description: 'Nghe nhạc chất lượng cao không quảng cáo, tải nhạc offline suốt 12 tháng.' },
        { name: '❤️ YouTube Premium 6 Tháng', price: 95000, category: 'Streaming', description: 'Tắt màn hình nghe nhạc, không quảng cáo, bao gồm YouTube Music.' },
        { name: '🛡️ ExpressVPN Premium 1 Năm', price: 250000, category: 'VPN', description: 'Bảo mật thông tin tối đa, fake IP tốc độ cao đa nền tảng.' },
      ]);
      const dummyStocks = [];
      createdProducts.forEach((prod) => {
        for (let i = 1; i <= 3; i++) {
          dummyStocks.push({
            productId: prod._id,
            accountData: `acc_test_${prod.name.split(' ')[1].toLowerCase()}_${i}@test.com|password123_${i}`,
          });
        }
      });
      await Stock.insertMany(dummyStocks);
      logger.info('🌱 Khởi tạo sản phẩm và kho mẫu thành công!');
    }
  } catch (error) {
    logger.error('Lỗi khởi tạo sản phẩm mẫu:', error);
  }
}

// ─── Đăng ký Middlewares ─────────────────────────────────
bot.use(sessionMiddleware);
bot.use(rateLimitMiddleware({ maxRequests: 10, windowMs: 5000 }));

// ─── Đăng ký tất cả Handlers ─────────────────────────────
registerStartHandler(bot);
registerMenuHandlers(bot);
registerBuyHandlers(bot);
registerUserTicketHandlers(bot);
registerUserOrdersHandlers(bot);

registerAdminPanelHandlers(bot);
registerAdminProductHandlers(bot);
registerAdminStockHandlers(bot);
registerAdminTicketHandlers(bot);

registerTextHandler(bot);

// ─── Khởi động ───────────────────────────────────────────
async function main() {
  printFeatureStatus();
  await seedDefaultProducts();

  // Load tất cả plugins (notifications, warranty, binancePay, analytics...)
  await loadPlugins(bot);

  // Dọn log cũ
  if (FEATURES.AUDIT_LOG) cleanOldLogs();

  await bot.launch();

  logger.info('================================================================');
  logger.info('🚀 Bot Bán Tài Khoản Số v2.0 đã khởi động thành công!');
  logger.info(`🔐 Mã hóa: ${FEATURES.ENCRYPT_ACCOUNTS ? 'BẬT ✅' : 'TẮT ⚠️ (thêm ENCRYPTION_KEY vào .env)'}`);
  logger.info(`💳 Binance Pay: ${FEATURES.BINANCE_PAY ? 'BẬT ✅' : 'Simulate mode'}`);
  logger.info('================================================================');
}

main().catch((err) => {
  logger.error('❌ Lỗi khởi chạy:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
