// config/features.js
// Feature Flags — bật/tắt tính năng không cần sửa code lõi
// Để bật: thêm vào .env: FEATURE_BINANCE_PAY=true

export const FEATURES = {
  /** Thanh toán qua Binance Pay (USDT/BNB) */
  BINANCE_PAY: process.env.FEATURE_BINANCE_PAY === 'true',

  /** Thanh toán giả lập (để test) — tự động tắt khi BINANCE_PAY bật */
  SIMULATE_PAYMENT: process.env.FEATURE_BINANCE_PAY !== 'true',

  /** Tự động hoàn tiền khi kho hết và không thể cấp bù */
  WARRANTY_AUTO_REFUND: process.env.FEATURE_WARRANTY_AUTOREFUND !== 'false',

  /** Cảnh báo admin khi tồn kho dưới ngưỡng */
  LOW_STOCK_ALERT: process.env.FEATURE_LOW_STOCK_ALERT !== 'false',

  /** Báo cáo doanh thu tự động hàng ngày */
  ANALYTICS_DAILY_REPORT: process.env.FEATURE_ANALYTICS_DAILY === 'true',

  /** Lịch sử đơn hàng cho user (/myorders) */
  MY_ORDERS: process.env.FEATURE_MY_ORDERS !== 'false',

  /** Mã hóa dữ liệu tài khoản trong DB */
  ENCRYPT_ACCOUNTS: !!process.env.ENCRYPTION_KEY,

  /** Audit logging */
  AUDIT_LOG: process.env.FEATURE_AUDIT_LOG !== 'false',

  /** Category filter trong menu */
  CATEGORY_FILTER: process.env.FEATURE_CATEGORY_FILTER === 'true',
};

/**
 * In ra trạng thái tất cả feature flags khi khởi động
 */
export const printFeatureStatus = () => {
  console.log('\n📋 FEATURE FLAGS:');
  for (const [key, value] of Object.entries(FEATURES)) {
    const icon = value ? '✅' : '⬜';
    console.log(`  ${icon} ${key}`);
  }
  console.log('');
};
