// plugins/binancePay/index.js
import { initWebhook } from './webhook.js';
import { logger } from '../../utils/logger.js';

export const initialize = async (bot) => {
  initWebhook(bot);
  logger.info('[BinancePay] Plugin khởi tạo — webhook handler sẵn sàng');
};
