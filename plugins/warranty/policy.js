// plugins/warranty/policy.js
// Chính sách bảo hành thông minh — kiểm tra điều kiện mở ticket

import { Ticket, Order, Product } from '../../db.js';
import { TICKET_STATUS } from '../../config/constants.js';

const DEFAULT_WARRANTY_DAYS = parseInt(process.env.DEFAULT_WARRANTY_DAYS || '7', 10);

/**
 * Kiểm tra xem một đơn hàng có được mở ticket hay không
 * @param {string} orderId
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
export const canOpenTicket = async (orderId) => {
  // Kiểm tra đơn hàng tồn tại và đã thanh toán
  const order = await Order.findOne({ orderId });
  if (!order) {
    return { allowed: false, reason: 'Đơn hàng không tồn tại.' };
  }
  if (order.status !== 'paid') {
    return { allowed: false, reason: 'Chỉ có thể báo lỗi đơn hàng đã thanh toán.' };
  }

  // Kiểm tra đã có ticket cho đơn này chưa
  const existingTicket = await Ticket.findOne({
    orderId,
    status: TICKET_STATUS.OPEN,
  });
  if (existingTicket) {
    return {
      allowed: false,
      reason: `Đơn hàng này đã có ticket đang xử lý (${existingTicket.ticketId}). Vui lòng chờ Admin phản hồi.`,
    };
  }

  // Kiểm tra thời hạn bảo hành
  const product = await Product.findById ? await Product.findById(order.productId) : null;
  const warrantyDays = product?.warrantyDays ?? DEFAULT_WARRANTY_DAYS;

  if (order.createdAt) {
    const purchaseDate = new Date(order.createdAt);
    const warrantyEnd = new Date(purchaseDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    if (now > warrantyEnd) {
      const expiredDays = Math.floor((now - warrantyEnd) / (24 * 60 * 60 * 1000));
      return {
        allowed: false,
        reason: `Đơn hàng này đã hết thời hạn bảo hành ${warrantyDays} ngày (quá hạn ${expiredDays} ngày).`,
      };
    }
  }

  return { allowed: true, reason: null };
};

/**
 * Tính ngày hết hạn bảo hành của một đơn hàng
 * @param {object} order
 * @param {number} warrantyDays
 * @returns {Date}
 */
export const getWarrantyExpiry = (order, warrantyDays = DEFAULT_WARRANTY_DAYS) => {
  const purchaseDate = new Date(order.createdAt || Date.now());
  return new Date(purchaseDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
};

/**
 * Kiểm tra xem bảo hành có còn hiệu lực không
 * @param {object} order
 * @param {number} warrantyDays
 * @returns {{ active: boolean, daysLeft: number }}
 */
export const checkWarrantyStatus = (order, warrantyDays = DEFAULT_WARRANTY_DAYS) => {
  const expiry = getWarrantyExpiry(order, warrantyDays);
  const now = new Date();
  const msLeft = expiry - now;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  return { active: msLeft > 0, daysLeft: Math.max(0, daysLeft) };
};
