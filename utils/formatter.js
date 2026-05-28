// utils/formatter.js
// Các hàm định dạng hiển thị (tiền tệ, ngày tháng, text)

/**
 * Định dạng số tiền theo chuẩn VND
 * @param {number} amount
 * @returns {string} ví dụ: "65.000đ"
 */
export const formatCurrency = (amount) =>
  `${amount.toLocaleString('vi-VN')}đ`;

/**
 * Định dạng ngày giờ theo chuẩn Việt Nam
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDate = (date) =>
  new Date(date).toLocaleString('vi-VN');

/**
 * Tạo mã đơn hàng ngẫu nhiên
 * @param {string} prefix - ví dụ 'AG'
 * @returns {string} ví dụ: 'AG-4821'
 */
export const generateId = (prefix) =>
  `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * Escape ký tự đặc biệt trong Markdown
 * @param {string} text
 * @returns {string}
 */
export const escapeMd = (text) =>
  String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
