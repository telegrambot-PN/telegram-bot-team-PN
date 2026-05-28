// plugins/notifications/index.js
// Entry point của Notifications Plugin

import { initAlerts } from './alerts.js';
import { FEATURES } from '../../config/features.js';

/**
 * Khởi tạo plugin notifications
 * @param {import('telegraf').Telegraf} bot
 */
export const initialize = async (bot) => {
  if (FEATURES.LOW_STOCK_ALERT) {
    initAlerts(bot);
  }
};
