// plugins/analytics/index.js
import { initAnalytics } from './report.js';

export const initialize = async (bot) => {
  initAnalytics(bot);
};
