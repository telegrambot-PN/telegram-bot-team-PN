// security/audit.js
// Audit log hành động hệ thống — KHÔNG lưu credentials, chỉ lưu metadata
// Nguyên tắc: log đủ để truy vết, không đủ để lộ data nhạy cảm

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const LOG_DIR = './logs';
const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);

// Đảm bảo thư mục logs tồn tại
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Hash Telegram ID để không lưu ID thật vào log
 * @param {string|number} telegramId
 * @returns {string} hash 8 ký tự
 */
const hashUserId = (telegramId) => {
  return createHash('sha256')
    .update(String(telegramId) + (process.env.ENCRYPTION_KEY || 'salt'))
    .digest('hex')
    .slice(0, 8);
};

/**
 * Lấy tên file log theo ngày
 */
const getLogFile = () => {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `audit-${date}.log`);
};

/**
 * Ghi một dòng audit log
 * @param {string} action - Hành động (purchase, ticket_open, stock_added, login...)
 * @param {string|number} telegramId - ID user (sẽ bị hash)
 * @param {object} metadata - Thông tin không nhạy cảm
 * @param {'success'|'fail'|'warn'} result
 */
export const logAction = (action, telegramId, metadata = {}, result = 'success') => {
  try {
    const entry = {
      ts: new Date().toISOString(),
      action,
      uid: telegramId ? hashUserId(telegramId) : 'system',
      result,
      // Chỉ lưu metadata an toàn — KHÔNG lưu: passwords, account credentials
      meta: sanitizeMetadata(metadata),
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(getLogFile(), line, 'utf8');
  } catch (e) {
    // Không crash bot nếu log thất bại
    console.warn('[AUDIT] Lỗi ghi log:', e.message);
  }
};

/**
 * Làm sạch metadata — xóa các field nhạy cảm
 */
const sanitizeMetadata = (meta) => {
  const SENSITIVE_KEYS = ['accountData', 'password', 'token', 'secret', 'key', 'credential'];
  const clean = { ...meta };
  for (const key of SENSITIVE_KEYS) {
    if (clean[key]) clean[key] = '[REDACTED]';
  }
  return clean;
};

/**
 * Xóa log cũ hơn RETENTION_DAYS ngày (gọi mỗi ngày)
 */
export const cleanOldLogs = () => {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      const filePath = path.join(LOG_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime.getTime() < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`[AUDIT] Đã xóa log cũ: ${file}`);
      }
    });
  } catch (e) {
    console.warn('[AUDIT] Lỗi xóa log cũ:', e.message);
  }
};

// Các action constants để dùng nhất quán
export const AUDIT_ACTIONS = {
  USER_START:       'user_start',
  USER_PURCHASE:    'user_purchase',
  PAYMENT_RECEIVED: 'payment_received',
  ACCOUNT_DELIVERED:'account_delivered',
  TICKET_OPEN:      'ticket_open',
  TICKET_RESOLVE:   'ticket_resolve',
  STOCK_ADDED:      'stock_added',
  PRODUCT_ADDED:    'product_added',
  ADMIN_LOGIN:      'admin_access',
  RATE_LIMITED:     'rate_limited',
  REFUND_ISSUED:    'refund_issued',
};
