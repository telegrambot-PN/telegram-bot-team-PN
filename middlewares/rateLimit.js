// middlewares/rateLimit.js
// Chống spam — giới hạn số lần user thực hiện action trong khoảng thời gian

const store = new Map(); // userId -> { count, resetAt }

/**
 * Kiểm tra và tăng rate limit cho một userId
 * @param {number|string} userId
 * @param {object} options
 * @param {number} options.maxRequests  - Số lần tối đa (mặc định 5)
 * @param {number} options.windowMs     - Cửa sổ thời gian ms (mặc định 10000 = 10s)
 * @returns {boolean} true nếu còn trong giới hạn, false nếu đã bị chặn
 */
export const checkRateLimit = (userId, { maxRequests = 5, windowMs = 10_000 } = {}) => {
  const now = Date.now();
  const key = String(userId);
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
};

/**
 * Telegraf middleware — tự động chặn nếu user spam
 * @param {object} options - maxRequests, windowMs
 */
export const rateLimitMiddleware = (options = {}) => async (ctx, next) => {
  if (!ctx.from) return next();

  const allowed = checkRateLimit(ctx.from.id, options);
  if (!allowed) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⏳ Bạn đang thao tác quá nhanh! Vui lòng chờ vài giây.', { show_alert: true });
    }
    return;
  }
  return next();
};
