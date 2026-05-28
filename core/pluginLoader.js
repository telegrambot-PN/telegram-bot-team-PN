// core/pluginLoader.js
// Tự động load và khởi tạo các plugins dựa trên Feature Flags
// Để thêm plugin mới: tạo folder plugins/tenPlugin/index.js và thêm vào PLUGIN_REGISTRY

import { FEATURES } from '../config/features.js';
import { logger } from '../utils/logger.js';

/**
 * Danh sách plugins và điều kiện kích hoạt
 * Để thêm plugin mới: thêm 1 dòng vào đây
 */
const PLUGIN_REGISTRY = [
  {
    name: 'notifications',
    enabled: () => FEATURES.LOW_STOCK_ALERT || FEATURES.ANALYTICS_DAILY_REPORT,
    path: '../plugins/notifications/index.js',
  },
  {
    name: 'warranty',
    enabled: () => true, // Luôn bật
    path: '../plugins/warranty/index.js',
  },
  {
    name: 'binancePay',
    enabled: () => FEATURES.BINANCE_PAY,
    path: '../plugins/binancePay/index.js',
  },
  {
    name: 'analytics',
    enabled: () => FEATURES.ANALYTICS_DAILY_REPORT,
    path: '../plugins/analytics/index.js',
  },
];

/**
 * Load tất cả plugins được kích hoạt
 * @param {import('telegraf').Telegraf} bot - Bot instance
 */
export const loadPlugins = async (bot) => {
  logger.info('🔌 Đang khởi tạo plugins...');

  for (const plugin of PLUGIN_REGISTRY) {
    if (!plugin.enabled()) {
      logger.info(`  ⬜ [Plugin] ${plugin.name} — đã tắt`);
      continue;
    }

    try {
      const module = await import(plugin.path);
      if (typeof module.initialize === 'function') {
        await module.initialize(bot);
      }
      logger.info(`  ✅ [Plugin] ${plugin.name} — đã tải`);
    } catch (e) {
      logger.warn(`  ⚠️ [Plugin] ${plugin.name} — lỗi tải: ${e.message}`);
    }
  }
};
