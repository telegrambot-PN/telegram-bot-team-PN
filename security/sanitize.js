// security/sanitize.js
// Làm sạch và validate input từ user trước khi xử lý

/**
 * Xóa ký tự đặc biệt nguy hiểm, giữ lại nội dung hợp lệ
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
export const sanitizeText = (input, maxLength = 1000) => {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    // Xóa ký tự điều khiển (trừ newline)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Validate và làm sạch danh sách tài khoản (mỗi dòng 1 tài khoản)
 * @param {string} rawText - Text nhiều dòng từ admin
 * @returns {{ accounts: string[], invalid: number }}
 */
export const sanitizeAccountList = (rawText) => {
  const lines = rawText.split('\n');
  const accounts = [];
  let invalid = 0;

  for (const line of lines) {
    const cleaned = sanitizeText(line, 500);
    if (!cleaned) continue;

    // Tài khoản hợp lệ: có ít nhất 3 ký tự
    if (cleaned.length >= 3) {
      accounts.push(cleaned);
    } else {
      invalid++;
    }
  }

  return { accounts, invalid };
};

/**
 * Validate giá tiền
 * @param {string} input
 * @returns {{ valid: boolean, value: number, error: string }}
 */
export const validatePrice = (input) => {
  const num = parseInt(String(input).replace(/[.,\s]/g, ''), 10);
  if (isNaN(num)) return { valid: false, value: 0, error: 'Không phải số hợp lệ' };
  if (num <= 0) return { valid: false, value: 0, error: 'Giá phải lớn hơn 0' };
  if (num > 100_000_000) return { valid: false, value: 0, error: 'Giá quá lớn (tối đa 100 triệu)' };
  return { valid: true, value: num, error: null };
};

/**
 * Làm sạch tên sản phẩm
 * @param {string} input
 * @returns {{ valid: boolean, value: string, error: string }}
 */
export const validateProductName = (input) => {
  const cleaned = sanitizeText(input, 200);
  if (!cleaned || cleaned.length < 3) {
    return { valid: false, value: '', error: 'Tên sản phẩm phải có ít nhất 3 ký tự' };
  }
  return { valid: true, value: cleaned, error: null };
};

/**
 * Làm sạch mô tả issue trong ticket
 * @param {string} input
 * @returns {{ valid: boolean, value: string, error: string }}
 */
export const validateIssueDescription = (input) => {
  const cleaned = sanitizeText(input, 2000);
  if (!cleaned || cleaned.length < 10) {
    return { valid: false, value: '', error: 'Mô tả lỗi phải có ít nhất 10 ký tự' };
  }
  return { valid: true, value: cleaned, error: null };
};
