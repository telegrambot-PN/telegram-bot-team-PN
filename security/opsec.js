// security/opsec.js
// Bộ kiểm soát và đánh giá bảo mật thông tin (OpSec & Trust Engine) v3.0
// Phát hiện clone, bots, trinh sát viên dựa trên tuổi tài khoản, hành vi và captcha.

import { User, Order } from '../db.js';
import { logger } from '../utils/logger.js';

/** Threshold xác định Telegram ID là tài khoản clone mới lập (thường > 7.5 tỷ) */
const NEW_ID_THRESHOLD = 7500000000;

/**
 * Đánh giá điểm tin cậy (Trust Score) của tài khoản người dùng
 * @param {string|number} telegramId
 * @param {string} username
 * @returns {Promise<{ score: number, isLowTrust: boolean, reasons: string[] }>}
 */
export const evaluateUserTrust = async (telegramId, username) => {
  let score = 100;
  const reasons = [];

  const numericId = parseInt(telegramId, 10);

  // 1. Kiểm tra tuổi tài khoản thông qua Telegram ID (tuần tự số)
  if (!isNaN(numericId) && numericId > NEW_ID_THRESHOLD) {
    score -= 40;
    reasons.push('Tài khoản mới tạo gần đây (ID rất lớn)');
  }

  // 2. Kiểm tra Username
  if (!username) {
    score -= 30;
    reasons.push('Không thiết lập Username Telegram');
  }

  // 3. Kiểm tra lịch sử spam đơn hàng (nếu có)
  try {
    const totalOrders = await Order.countDocuments({ telegramId: String(telegramId) });
    const paidOrders = await Order.countDocuments({ telegramId: String(telegramId), status: 'paid' });

    if (totalOrders > 3 && paidOrders === 0) {
      score -= 30;
      reasons.push('Có lịch sử tạo nhiều hóa đơn ảo không thanh toán');
    }
  } catch (e) {
    logger.warn('[OpSec] Lỗi truy vấn lịch sử đơn hàng để tính Trust Score:', e.message);
  }

  // Đảm bảo score tối thiểu là 0
  score = Math.max(0, score);

  return {
    score,
    isLowTrust: score < 50,
    reasons,
  };
};

/**
 * Tạo một Captcha phép toán ngẫu nhiên đơn giản
 * @returns {{ question: string, answer: number }}
 */
export const generateCaptcha = () => {
  const num1 = Math.floor(Math.random() * 9) + 1; // 1 to 9
  const num2 = Math.floor(Math.random() * 9) + 1; // 1 to 9
  return {
    question: `Giải phép toán sau để xác minh bạn không phải robot: *${num1} + ${num2} = ?*`,
    answer: num1 + num2,
  };
};

/**
 * Kiểm tra xem người dùng đã vượt qua xác minh captcha chưa
 * @param {string|number} telegramId
 * @returns {Promise<boolean>}
 */
export const isUserVerified = async (telegramId) => {
  try {
    const user = await User.findOne({ telegramId: String(telegramId) });
    return !!(user && user.captchaVerified);
  } catch (e) {
    logger.error('[OpSec] Lỗi kiểm tra captchaVerified:', e.message);
    return false;
  }
};

/**
 * Đánh dấu người dùng đã xác minh thành công vào DB
 * @param {string|number} telegramId
 */
export const markUserVerified = async (telegramId) => {
  try {
    await User.findOneAndUpdate(
      { telegramId: String(telegramId) },
      { $set: { captchaVerified: true } }
    );
    logger.info(`[OpSec] Đã xác minh Captcha thành công cho user ${telegramId}`);
  } catch (e) {
    logger.error('[OpSec] Lỗi cập nhật trạng thái xác minh captcha:', e.message);
  }
};
