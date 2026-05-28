// utils/keyboard.js
// Tập trung tạo các inline keyboard buttons thường dùng

import { Markup } from 'telegraf';

/** Nút quay lại menu chính */
export const backToMenuBtn = () =>
  Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu');

/** Nút quay lại admin panel */
export const backToAdminBtn = () =>
  Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel');

/** Nút quay lại danh sách tickets */
export const backToTicketsBtn = () =>
  Markup.button.callback('↩️ Quay lại danh sách Tickets', 'admin_view_tickets');

/** Keyboard chỉ có nút quay về menu */
export const menuKeyboard = () =>
  Markup.inlineKeyboard([[backToMenuBtn()]]);

/** Keyboard sau khi hoàn thành action admin */
export const adminDoneKeyboard = () =>
  Markup.inlineKeyboard([[backToAdminBtn()], [backToMenuBtn()]]);
