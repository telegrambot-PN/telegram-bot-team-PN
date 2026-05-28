// plugins/analytics/report.js
// Báo cáo doanh thu tự động — gửi cho admin hàng ngày

import { Order, Stock, Product, Ticket } from '../../db.js';
import { formatCurrency } from '../../utils/formatter.js';
import { logger } from '../../utils/logger.js';

let _bot = null;

export const initAnalytics = (bot) => {
  _bot = bot;

  // Gửi báo cáo lúc 23:59 mỗi ngày
  scheduleDailyReport();
};

/**
 * Tạo báo cáo doanh thu theo khoảng thời gian
 * @param {Date} from
 * @param {Date} to
 */
export const generateReport = async (from, to) => {
  const matchFilter = {
    status: 'paid',
    ...(from && to ? { createdAt: { $gte: from, $lte: to } } : {}),
  };

  const revenueResult = await Order.aggregate([
    { $match: matchFilter },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const totalRevenue = revenueResult[0]?.total || 0;
  let totalOrders = revenueResult[0]?.count;
  if (totalOrders === undefined) {
    totalOrders = await Order.countDocuments(matchFilter);
  }

  const totalProducts = await Product.countDocuments();
  const totalStock = await Stock.countDocuments({ status: 'available' });
  const openTickets = await Ticket.countDocuments({ status: 'open' });

  return { totalRevenue, totalOrders, totalProducts, totalStock, openTickets };
};

/**
 * Gửi báo cáo hàng ngày cho admin
 */
export const sendDailyReport = async () => {
  if (!_bot) return;

  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const report = await generateReport(startOfDay, now);

    const message =
      `📊 *BÁO CÁO DOANH THU NGÀY ${now.toLocaleDateString('vi-VN')}*\n` +
      `-----------------------------------------\n` +
      `💰 Doanh thu hôm nay: *${formatCurrency(report.totalRevenue)}*\n` +
      `📦 Đơn thành công: *${report.totalOrders} đơn*\n` +
      `🗝️ Tài khoản còn kho: *${report.totalStock}*\n` +
      `🚨 Tickets chưa xử lý: *${report.openTickets}*\n` +
      `-----------------------------------------\n` +
      `_Báo cáo tự động lúc ${now.toLocaleTimeString('vi-VN')}_`;

    const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    for (const adminId of adminIds) {
      await _bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' }).catch(() => {});
    }
  } catch (e) {
    logger.error('[Analytics] Lỗi gửi báo cáo ngày:', e.message);
  }
};

/**
 * Lên lịch gửi báo cáo hàng ngày lúc 23:59
 */
const scheduleDailyReport = () => {
  const now = new Date();
  const targetTime = new Date(now);
  targetTime.setHours(23, 59, 0, 0);

  if (now > targetTime) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  const msUntilReport = targetTime - now;

  setTimeout(() => {
    sendDailyReport();
    // Lặp lại mỗi 24 giờ
    setInterval(sendDailyReport, 24 * 60 * 60 * 1000);
  }, msUntilReport);

  logger.info(`[Analytics] Báo cáo ngày sẽ gửi lúc ${targetTime.toLocaleTimeString('vi-VN')}`);
};
