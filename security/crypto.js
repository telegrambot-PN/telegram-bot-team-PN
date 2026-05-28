// security/crypto.js
// Mã hóa/giải mã dữ liệu nhạy cảm bằng AES-256-GCM
// Key lưu trong .env ENCRYPTION_KEY, không bao giờ commit lên git

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Lấy encryption key từ env, validate 32 bytes
 */
const getKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY phải có ít nhất 32 ký tự trong .env');
  }
  return Buffer.from(key.slice(0, 32), 'utf8');
};

/**
 * Mã hóa một chuỗi văn bản
 * @param {string} plaintext - Dữ liệu cần mã hóa (vd: "email|password")
 * @returns {string} - Chuỗi mã hóa dạng "iv:tag:encrypted" (base64)
 */
export const encrypt = (plaintext) => {
  if (!plaintext) return plaintext;
  try {
    const key = getKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  } catch (e) {
    // Nếu không có ENCRYPTION_KEY, trả về plain text với cảnh báo
    if (e.message.includes('ENCRYPTION_KEY')) {
      console.warn('[SECURITY] ⚠️ Đang lưu accountData dạng plain text! Hãy thêm ENCRYPTION_KEY vào .env');
      return plaintext;
    }
    throw e;
  }
};

/**
 * Giải mã chuỗi đã mã hóa
 * @param {string} encryptedText - Chuỗi "iv:tag:encrypted" từ encrypt()
 * @returns {string} - Dữ liệu gốc
 */
export const decrypt = (encryptedText) => {
  if (!encryptedText) return encryptedText;

  // Nếu không có đúng định dạng mã hóa → trả về nguyên (plain text cũ)
  if (!encryptedText.includes(':')) return encryptedText;

  try {
    const key = getKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (e) {
    console.error('[SECURITY] Lỗi giải mã data — có thể key thay đổi:', e.message);
    return '[DECRYPTION_ERROR]';
  }
};

/**
 * Tạo ngẫu nhiên ENCRYPTION_KEY 32 bytes (dùng khi setup lần đầu)
 * Chạy: node -e "import('./security/crypto.js').then(m => m.generateKey())"
 */
export const generateKey = () => {
  const key = randomBytes(32).toString('hex');
  console.log('✅ ENCRYPTION_KEY mới (copy vào .env):');
  console.log(`ENCRYPTION_KEY=${key}`);
  return key;
};
