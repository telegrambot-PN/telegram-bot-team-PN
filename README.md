# 🤖 Telegram Bot Đơn Giản Bằng Node.js & Telegraf

Dự án này là một mẫu Telegram Bot đơn giản, được xây dựng bằng **Node.js** và thư viện **Telegraf** (một thư viện tuyệt vời để tương tác với Telegram Bot API bằng ES Modules hiện đại).

---

## 📋 Mục lục
1. [Chuẩn bị Bot Token từ Telegram](#1-chuẩn-bị-bot-token-từ-telegram)
2. [Cài đặt và Chạy thử nghiệm](#2-cài-đặt-và-chạy-thử-nghiệm)
3. [Cấu trúc thư mục dự án](#3-cấu-trúc-thư-mục-dự-án)
4. [Các tính năng có sẵn](#4-các-tính-năng-có-sẵn)
5. [Hướng dẫn mở rộng tính năng](#5-hướng-dẫn-mở-rộng-tính-năng)

---

## 1. Chuẩn bị Bot Token từ Telegram

Để chạy được Bot này, trước tiên bạn cần lấy **Token** từ Telegram. Các bước thực hiện cực kỳ đơn giản:

1. Mở Telegram trên điện thoại hoặc máy tính của bạn.
2. Tìm kiếm người dùng có tên **`@BotFather`** (đây là Bot chính chủ của Telegram dùng để tạo và quản lý bot khác, hãy chọn tài khoản có dấu tích xanh để an tâm).
3. Gửi tin nhắn `/newbot` để bắt đầu tạo Bot mới.
4. Nhập **Tên** cho Bot của bạn (Ví dụ: `Bot Của Tôi`).
5. Nhập **Username** cho Bot của bạn. *Lưu ý: Username phải viết liền không dấu và bắt đầu hoặc kết thúc bằng từ `bot` hoặc `_bot` (Ví dụ: `my_test_123_bot`).*
6. Sau khi tạo thành công, **BotFather** sẽ gửi cho bạn một tin nhắn chứa đoạn mã **Token** (Ví dụ: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`). Hãy sao chép chuỗi mã này!

---

## 2. Cài đặt và Chạy thử nghiệm

### 🛠️ Yêu cầu hệ thống
- Đã cài đặt **Node.js** (Phiên bản v18 trở lên được khuyến nghị).

### 🚀 Các bước khởi chạy

1. **Đặt thư mục này làm Active Workspace**:
   Khuyến nghị bạn đặt thư mục `telegram-bot` làm thư mục làm việc chính trong trình soạn thảo của bạn.

2. **Cấu hình biến môi trường**:
   - Mở file `.env` trong thư mục này.
   - Thay thế chuỗi `YOUR_TELEGRAM_BOT_TOKEN_HERE` bằng **Token** bạn vừa sao chép từ BotFather ở bước 1.
   
   ```env
   BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```

3. **Cài đặt các thư viện cần thiết**:
   Mở terminal tại thư mục này và chạy lệnh sau để cài đặt các package phụ thuộc:
   ```bash
   npm install
   ```

4. **Chạy ứng dụng**:
   - **Chế độ thường (Production)**:
     ```bash
     npm start
     ```
   - **Chế độ phát triển (Tự động tải lại mã nguồn khi thay đổi)**:
     ```bash
     npm run dev
     ```

5. **Trải nghiệm Bot**:
   Nhấp vào liên kết Bot mà `@BotFather` đã gửi cho bạn hoặc tìm kiếm username bot của bạn trên Telegram, ấn **Start** (hoặc gửi lệnh `/start`) và trải nghiệm các tính năng!

---

## 3. Cấu trúc thư mục dự án

```text
telegram-bot/
├── index.js          # Mã nguồn chính điều khiển hoạt động của Bot
├── package.json      # Khai báo thông tin dự án và dependencies (Telegraf, Dotenv)
├── .env              # Lưu trữ Bot Token thực tế (Không chia sẻ file này lên mạng)
├── .env.example      # File mẫu cấu hình biến môi trường
└── README.md         # File tài liệu hướng dẫn này
```

---

## 4. Các tính năng có sẵn

Bot mẫu này đã được cài đặt sẵn một số tính năng tương tác cơ bản rất trực quan:
- **Lệnh `/start`**: Chào mừng người dùng kèm theo **Inline Keyboard (Bàn phím tương tác trực tiếp)**.
- **Tính năng Nhận Danh ngôn Ngẫu nhiên**: Khi nhấn vào nút tương ứng, bot sẽ chọn ngẫu nhiên một câu danh ngôn hay trong danh sách và gửi lại cho bạn.
- **Lệnh `/help`**: Liệt kê hướng dẫn và các lệnh có sẵn.
- **Tính năng Nhại lại (Echo)**: Bất kỳ tin nhắn chữ nào bạn gửi mà không phải là lệnh, Bot sẽ tự động gửi trả lại với tiền tố `Bot nhại lại: "nội dung của bạn"`.

---

## 5. Hướng dẫn mở rộng tính năng

Bạn muốn bot của mình thông minh hơn? Dưới đây là một số gợi ý và đoạn mã mẫu:

### ✉️ Lắng nghe các sự kiện khác nhau
Bạn có thể cấu hình bot để lắng nghe hình ảnh, sticker hoặc giọng nói:

```javascript
// Khi người dùng gửi một bức ảnh
bot.on('photo', (ctx) => {
  ctx.reply('🖼️ Ồ! Bức ảnh của bạn đẹp quá!');
});

// Khi người dùng gửi một sticker
bot.on('sticker', (ctx) => {
  ctx.reply('👍 Sticker này thật dễ thương!');
});
```

### 📡 Gọi API bên ngoài (Ví dụ: Lấy thời tiết, Tỷ giá coin...)
Bạn có thể cài đặt thư viện `axios` (`npm install axios`) để lấy dữ liệu từ API bên ngoài:

```javascript
import axios from 'axios';

bot.command('crypto', async (ctx) => {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const price = res.data.bitcoin.usd;
    ctx.reply(`💰 Giá Bitcoin hiện tại là: $${price.toLocaleString()} USD`);
  } catch (error) {
    ctx.reply('❌ Không thể lấy thông tin giá lúc này, vui lòng thử lại sau.');
  }
});
```

Chúc bạn có những trải nghiệm lập trình Telegram Bot thật vui vẻ! Nếu bạn cần thêm bất kỳ tính năng phức tạp nào khác, hãy chat trực tiếp để tôi viết code bổ sung cho bạn nhé! 🚀
