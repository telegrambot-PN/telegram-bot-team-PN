// handlers/user/start.js
// Xử lý lệnh /start — đăng ký user và hiển thị menu

import { User } from '../../db.js';
import { getMenuMessageAndKeyboard } from './menu.js';

/**
 * Đăng ký handler /start
 * @param {import('telegraf').Telegraf} bot
 */
export function registerStartHandler(bot) {
  bot.start(async (ctx) => {
    try {
      const userId = ctx.from.id;

      // Reset session
      ctx.session.state = null;
      ctx.session.tempData = {};

      // Đăng ký user mới nếu chưa có
      let user = await User.findOne({ telegramId: String(userId) });
      if (!user) {
        const adminIds = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim());
        user = new User({
          telegramId: String(userId),
          firstName: ctx.from.first_name,
          username: ctx.from.username,
          role: adminIds.includes(String(userId)) ? 'admin' : 'user',
        });
        await user.save();
      }

      const menu = await getMenuMessageAndKeyboard(userId);
      return ctx.replyWithMarkdown(menu.text, menu.keyboard);
    } catch (e) {
      console.error('/start error:', e);
    }
  });
}
