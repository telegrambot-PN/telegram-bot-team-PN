// middlewares/auth.js
// Kiểm tra quyền hạn người dùng

import { User } from '../db.js';
import { ROLES } from '../config/constants.js';

/**
 * Kiểm tra user có phải admin/owner không
 * @param {number|string} telegramId
 * @returns {Promise<boolean>}
 */
export const isAdmin = async (telegramId) => {
  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim());
  if (adminIds.includes(String(telegramId))) return true;

  const user = await User.findOne({ telegramId: String(telegramId) });
  return user && (user.role === ROLES.ADMIN || user.role === ROLES.OWNER);
};

/**
 * Middleware bảo vệ action — chỉ cho phép admin truy cập
 * Dùng trong bot.action() wrapper nếu cần
 * @param {object} ctx
 * @returns {Promise<boolean>} true nếu là admin
 */
export const requireAdmin = async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !(await isAdmin(userId))) {
    await ctx.answerCbQuery('⚠️ Bạn không có quyền truy cập!', { show_alert: true });
    return false;
  }
  return true;
};
