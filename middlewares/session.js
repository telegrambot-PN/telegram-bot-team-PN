// middlewares/session.js
// Quản lý session in-memory cho mỗi user

const sessions = {};

/**
 * Lấy session của user, tạo mới nếu chưa có
 * @param {number|string} userId
 * @returns {{ state: string|null, tempData: object }}
 */
export const getSession = (userId) => {
  if (!sessions[userId]) {
    sessions[userId] = { state: null, tempData: {} };
  }
  return sessions[userId];
};

/**
 * Xóa session của user
 * @param {number|string} userId
 */
export const clearSession = (userId) => {
  if (sessions[userId]) {
    sessions[userId].state = null;
    sessions[userId].tempData = {};
  }
};

/**
 * Telegraf middleware — gắn session vào ctx
 */
export const sessionMiddleware = (ctx, next) => {
  if (ctx.from) {
    ctx.session = getSession(ctx.from.id);
  }
  return next();
};
