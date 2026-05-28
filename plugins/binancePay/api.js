// plugins/binancePay/api.js
// Binance Pay Merchant API v2 — tạo QR thanh toán và verify webhook
// Docs: https://developers.binance.com/docs/binance-pay/api-order-create

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const BINANCE_PAY_BASE = 'https://bpay.binanceapi.com';

/**
 * Tạo chữ ký HMAC-SHA512 cho Binance Pay API
 */
const createSignature = (timestamp, nonce, body, secretKey) => {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createHmac('sha512', secretKey).update(payload).digest('hex').toUpperCase();
};

/**
 * Tạo đơn hàng Binance Pay và lấy QR code
 * @param {object} params
 * @param {string} params.orderId    - Mã đơn hàng nội bộ
 * @param {number} params.amountUSD  - Số tiền bằng USD (hoặc USDT)
 * @param {string} params.currency   - USDT | BNB | BUSD
 * @param {string} params.description - Mô tả sản phẩm
 * @returns {Promise<{ success: boolean, qrCode: string, prepayId: string, expireTime: number, error: string }>}
 */
export const createBinanceOrder = async ({ orderId, amountUSD, currency = 'USDT', description }) => {
  const apiKey = process.env.BINANCE_API_KEY;
  const secretKey = process.env.BINANCE_SECRET_KEY;
  const merchantId = process.env.BINANCE_MERCHANT_ID;

  if (!apiKey || !secretKey || !merchantId) {
    return {
      success: false,
      error: 'Binance Pay chưa được cấu hình. Vui lòng thêm BINANCE_API_KEY, BINANCE_SECRET_KEY, BINANCE_MERCHANT_ID vào .env',
    };
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');

  const body = JSON.stringify({
    env: { terminalType: 'APP' },
    merchantTradeNo: orderId,
    orderAmount: amountUSD.toFixed(2),
    currency,
    description: description || `Order ${orderId}`,
    goodsDetails: [
      {
        goodsType: '02',         // digital goods
        goodsCategory: 'Z000',   // others
        referenceGoodsId: orderId,
        goodsName: description || `Digital Account`,
        goodsUnitAmount: { currency, amount: amountUSD.toFixed(2) },
        goodsQuantity: '1',
      },
    ],
  });

  const signature = createSignature(timestamp, nonce, body, secretKey);

  try {
    const response = await fetch(`${BINANCE_PAY_BASE}/binancepay/openapi/v2/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonce,
        'BinancePay-Certificate-SN': apiKey,
        'BinancePay-Signature': signature,
      },
      body,
    });

    const data = await response.json();

    if (data.status === 'SUCCESS') {
      return {
        success: true,
        qrCode: data.data.qrcodeLink,
        prepayId: data.data.prepayId,
        checkoutUrl: data.data.checkoutUrl,
        expireTime: data.data.expireTime,
      };
    }

    logger.error('[BinancePay] API error:', data);
    return { success: false, error: data.errMsg || 'Lỗi Binance Pay API' };
  } catch (e) {
    logger.error('[BinancePay] Network error:', e.message);
    return { success: false, error: 'Không thể kết nối Binance Pay API' };
  }
};

/**
 * Verify chữ ký webhook từ Binance Pay
 * @param {string} payload - Raw body string
 * @param {string} signature - Header BinancePay-Signature
 * @param {string} timestamp - Header BinancePay-Timestamp
 * @param {string} nonce - Header BinancePay-Nonce
 * @returns {boolean}
 */
export const verifyWebhook = (payload, signature, timestamp, nonce) => {
  const secretKey = process.env.BINANCE_SECRET_KEY;
  if (!secretKey) return false;

  const expectedSig = createSignature(timestamp, nonce, payload, secretKey);
  return expectedSig === signature;
};

/**
 * Lấy trạng thái đơn hàng từ Binance Pay
 * @param {string} prepayId
 * @returns {Promise<{ status: string, transactionId: string }>}
 */
export const getBinanceOrderStatus = async (prepayId) => {
  const apiKey = process.env.BINANCE_API_KEY;
  const secretKey = process.env.BINANCE_SECRET_KEY;
  if (!apiKey || !secretKey) return { status: 'ERROR', transactionId: null };

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const body = JSON.stringify({ prepayId });
  const signature = createSignature(timestamp, nonce, body, secretKey);

  try {
    const response = await fetch(`${BINANCE_PAY_BASE}/binancepay/openapi/v2/order/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonce,
        'BinancePay-Certificate-SN': apiKey,
        'BinancePay-Signature': signature,
      },
      body,
    });
    const data = await response.json();
    return {
      status: data.data?.status || 'UNKNOWN',
      transactionId: data.data?.transactionId || null,
    };
  } catch (e) {
    logger.error('[BinancePay] Query error:', e.message);
    return { status: 'ERROR', transactionId: null };
  }
};
