import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { User, Product, Stock, Order, Ticket } from './db.js';

// Tải cấu hình
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('================================================================');
  console.error('❌ LỖI: Bạn chưa thiết lập BOT_TOKEN trong file .env!');
  console.error('================================================================');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Hệ thống session tạm trong bộ nhớ
const sessions = {};
const getSession = (userId) => {
  if (!sessions[userId]) {
    sessions[userId] = {
      state: null,
      tempData: {}
    };
  }
  return sessions[userId];
};

// Hàm kiểm tra quyền Admin
const isAdmin = async (telegramId) => {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  if (adminIds.includes(String(telegramId))) return true;
  
  const user = await User.findOne({ telegramId: String(telegramId) });
  return user && (user.role === 'admin' || user.role === 'owner');
};

// Hàm tự động tạo sản phẩm và kho hàng mẫu để test nhanh
async function seedDefaultProducts() {
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      console.log('🌱 Đang khởi tạo các sản phẩm mẫu vào MongoDB...');
      const createdProducts = await Product.insertMany([
        {
          name: '📺 Netflix Premium 1 Tháng',
          price: 65000,
          category: 'Giải trí',
          description: 'Xem phim 4K Ultra HD cực mượt, hỗ trợ 1 profile cá nhân riêng tư.'
        },
        {
          name: '🎵 Spotify Premium 1 Năm',
          price: 190000,
          category: 'Giải trí',
          description: 'Nghe nhạc chất lượng cao không quảng cáo, tải nhạc offline suốt 12 tháng.'
        },
        {
          name: '❤️ YouTube Premium 6 Tháng',
          price: 95000,
          category: 'Giải trí',
          description: 'Tắt màn hình nghe nhạc, không quảng cáo, bao gồm YouTube Music.'
        },
        {
          name: '🛡️ ExpressVPN Premium 1 Năm',
          price: 250000,
          category: 'VPN',
          description: 'Bảo mật thông tin tối đa, fake IP tốc độ cao đa nền tảng.'
        }
      ]);
      
      console.log('🌱 Đang nạp tài khoản mẫu vào kho Stock...');
      const dummyStocks = [];
      createdProducts.forEach((prod) => {
        for (let i = 1; i <= 3; i++) {
          dummyStocks.push({
            productId: prod._id,
            accountData: `acc_test_${prod.name.split(' ')[1].toLowerCase()}_${i}@test.com|password123_${i}`
          });
        }
      });
      await Stock.insertMany(dummyStocks);
      console.log('🌱 Khởi tạo sản phẩm và kho mẫu thành công!');
    }
  } catch (error) {
    console.error('Lỗi khởi tạo sản phẩm và kho mẫu:', error);
  }
}

// Gọi hàm seed dữ liệu mẫu
seedDefaultProducts();

// Hàm tạo giao diện Menu chính
async function getMenuMessageAndKeyboard(telegramId) {
  const products = await Product.find();
  
  let menuText = 
    `🌟 *HỆ THỐNG BÁN TÀI KHOẢN SỐ TỰ ĐỘNG* 🌟\n` +
    `-----------------------------------------\n` +
    `Chào mừng bạn đến với hệ thống cung cấp tài khoản số tự động. An toàn - Nhanh chóng - Giao hàng lập tức!\n\n` +
    `📋 *BẢNG GIÁ & KHO HÀNG HIỆN TẠI:*\n\n`;
    
  const buttons = [];
  
  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const stockCount = await Stock.countDocuments({ productId: prod._id, status: 'available' });
    const isOutOfStock = stockCount === 0;
    
    menuText += `${i + 1}. *${prod.name}*\n`;
    menuText += `   💵 Giá: *${prod.price.toLocaleString('vi-VN')}đ* | Kho: _${isOutOfStock ? '❌ Hết hàng' : `🟢 Còn ${stockCount}`}_\n`;
    if (prod.description) {
      menuText += `   👉 _${prod.description}_\n`;
    }
    menuText += `\n`;
    
    buttons.push([
      Markup.button.callback(
        isOutOfStock ? `❌ ${prod.name} (Hết hàng)` : `🛒 Mua ${prod.name.replace(/[^a-zA-Z0-9\s]/g, '').trim()}`,
        isOutOfStock ? `out_of_stock` : `buy_${prod._id}`
      )
    ]);
  }
  
  menuText += `-----------------------------------------\n`;
  menuText += `👉 _Vui lòng nhấp vào các nút bên dưới để tiến hành đặt mua tài khoản số của bạn._`;
  
  const userIsAdmin = await isAdmin(telegramId);
  if (userIsAdmin) {
    buttons.push([
      Markup.button.callback('⚙️ Trang Quản Trị Admin', 'admin_panel')
    ]);
  }
  
  buttons.push([
    Markup.button.callback('📖 Trợ Giúp', 'show_help')
  ]);
  
  return {
    text: menuText,
    keyboard: Markup.inlineKeyboard(buttons)
  };
}

// Giao diện quản trị Admin Panel
async function getAdminPanel() {
  const totalRevenueResult = await Order.aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;
  
  const totalPaidOrders = await Order.countDocuments({ status: 'paid' });
  const totalProducts = await Product.countDocuments();
  const totalStockAvailable = await Stock.countDocuments({ status: 'available' });
  const totalOpenTickets = await Ticket.countDocuments({ status: 'open' });
  
  let adminText = 
    `⚙️ *BAN QUẢN TRỊ ADMIN - SHOP TÀI KHOẢN SỐ* 🌟\n` +
    `-----------------------------------------\n` +
    `Tổng hợp số liệu thống kê hệ thống hiện tại:\n\n` +
    `💰 Tổng doanh thu: *${totalRevenue.toLocaleString('vi-VN')}đ*\n` +
    `📦 Số đơn hàng thành công: *${totalPaidOrders} đơn*\n` +
    `🛒 Số gói sản phẩm: *${totalProducts} gói*\n` +
    `🗝️ Tài khoản còn trong kho: *${totalStockAvailable} tài khoản*\n` +
    `🚨 Yêu cầu hỗ trợ (Tickets) chờ: *${totalOpenTickets} ticket*\n\n` +
    `👉 _Vui lòng lựa chọn các tác vụ quản trị dưới đây:_`;
    
  const buttons = [
    [
      Markup.button.callback('➕ Thêm Sản Phẩm Mới', 'admin_add_product'),
      Markup.button.callback('🗝️ Nạp Kho (Add Stock)', 'admin_add_stock')
    ],
    [
      Markup.button.callback('🚨 Tickets Hỗ Trợ', 'admin_view_tickets')
    ],
    [
      Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')
    ]
  ];
  
  return {
    text: adminText,
    keyboard: Markup.inlineKeyboard(buttons)
  };
}

// Xử lý lệnh /start
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = getSession(userId);
    session.state = null;
    
    // Đăng ký người dùng mới vào DB
    let user = await User.findOne({ telegramId: String(userId) });
    if (!user) {
      user = new User({
        telegramId: String(userId),
        firstName: ctx.from.first_name,
        username: ctx.from.username,
        role: (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).includes(String(userId)) ? 'admin' : 'user'
      });
      await user.save();
    }
    
    const menu = await getMenuMessageAndKeyboard(userId);
    return ctx.replyWithMarkdown(menu.text, menu.keyboard);
  } catch (error) {
    console.error('Lỗi khi chạy lệnh /start:', error);
  }
});

// Xử lý lệnh /admin
bot.command('admin', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!(await isAdmin(userId))) {
      return ctx.reply('⚠️ Bạn không có quyền truy cập trang quản trị!');
    }
    
    const admin = await getAdminPanel();
    return ctx.replyWithMarkdown(admin.text, admin.keyboard);
  } catch (error) {
    console.error('Lỗi khi chạy lệnh /admin:', error);
  }
});

// Quay lại menu
bot.action('show_menu', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    const menu = await getMenuMessageAndKeyboard(userId);
    
    await ctx.deleteMessage().catch(() => {});
    return ctx.replyWithMarkdown(menu.text, menu.keyboard);
  } catch (error) {
    console.error('Error showing menu:', error);
  }
});

// Bấm nút Trợ Giúp
bot.action('show_help', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const helpText = 
      `📖 *HƯỚNG DẪN MUA TÀI KHOẢN SỐ TỰ ĐỘNG:*\n\n` +
      `• Bước 1: Bấm nút \`🛒 Mua [Tên]\` ngay bên dưới thực đơn.\n` +
      `• Bước 2: Bot sẽ tạo đơn và gửi mã VietQR thanh toán.\n` +
      `• Bước 3: Ở chế độ Test, bạn bấm nút **[Test: Xác nhận đã nhận tiền (Simulate)]** để giả lập thanh toán.\n` +
      `• Bước 4: Tài khoản số sẽ được gửi trực tiếp cho bạn qua chat riêng ngay lập tức!\n` +
      `• Bước 5: Nếu tài khoản bị lỗi, bạn bấm nút **[Báo lỗi tài khoản]** để gửi khiếu nại tới Admin.\n\n` +
      `Gõ /start để quay lại thực đơn chính.`;
      
    return ctx.reply(helpText, Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu', 'show_menu')]]));
  } catch (error) {
    console.error('Error showing help:', error);
  }
});

// Nhấn nút thông báo hết hàng
bot.action('out_of_stock', async (ctx) => {
  return ctx.answerCbQuery('⚠️ Gói tài khoản này tạm thời đang cháy hàng! Vui lòng quay lại sau.', { show_alert: true });
});

// Luồng tạo đơn hàng mua sản phẩm
bot.action(/^buy_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = await Product.findById(productId);
    if (!product) return ctx.answerCbQuery('⚠️ Sản phẩm không tồn tại!');
    
    const stockCount = await Stock.countDocuments({ productId, status: 'available' });
    if (stockCount === 0) {
      return ctx.answerCbQuery('⚠️ Rất tiếc, sản phẩm này hiện tại đã hết hàng!', { show_alert: true });
    }
    
    const userId = ctx.from.id;
    const orderId = `AG-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Tạo đơn hàng lưu vào MongoDB
    const order = new Order({
      orderId,
      telegramId: String(userId),
      productId: product._id,
      amount: product.price,
      status: 'pending'
    });
    await order.save();
    
    await ctx.answerCbQuery('📝 Đã tạo hóa đơn thanh toán!');
    
    // MB Bank VietQR mock
    const bankId = 'MB';
    const accountNo = '8888999999';
    const accountName = 'SHOP TAI KHOAN SO';
    const addInfo = `THANH TOAN DON HANG ${orderId}`;
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${product.price}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountName)}`;
    
    const checkoutText = 
      `📝 *THÔNG TIN THANH TOÁN ĐƠN HÀNG* \n` +
      `-----------------------------------------\n` +
      `🆔 Mã đơn hàng: *${orderId}*\n` +
      `📦 Sản phẩm: *${product.name}*\n` +
      `💰 Số tiền: *${product.price.toLocaleString('vi-VN')}đ*\n` +
      `🚚 Trạng thái: *Chờ thanh toán* ⏳\n\n` +
      `👉 *Hướng dẫn chuyển khoản:* \n` +
      `1. Quét mã VietQR bên dưới bằng app Ngân hàng, hoặc nhập tay:\n` +
      `   • Ngân hàng: *MB Bank (MB)*\n` +
      `   • Số tài khoản: \`${accountNo}\`\n` +
      `   • Tên tài khoản: *${accountName}*\n` +
      `   • Số tiền: *${product.price.toLocaleString('vi-VN')}đ*\n` +
      `   • Nội dung chuyển khoản: \`${addInfo}\`\n\n` +
      `⚠️ *LƯU Ý:* Hệ thống hiện đang chạy ở chế độ **GIẢ LẬP**. Bạn hãy chuyển khoản hoặc bấm nút **Test: Xác nhận đã nhận tiền (Simulate)** phía dưới để bot tự động cấp tài khoản số ngay lập tức!`;
      
    await ctx.deleteMessage().catch(() => {});
    return ctx.replyWithPhoto(
      qrUrl,
      {
        caption: checkoutText,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💸 Test: Xác nhận đã nhận tiền (Simulate)', `simulate_paid_${orderId}`)
          ],
          [
            Markup.button.callback('❌ Hủy đơn hàng', `cancel_order_${orderId}`),
            Markup.button.callback('↩️ Quay lại Menu', 'show_menu')
          ]
        ])
      }
    );
  } catch (error) {
    console.error('Error starting buy process:', error);
  }
});

// Giả lập thanh toán thành công
bot.action(/^simulate_paid_(.+)$/, async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const order = await Order.findOne({ orderId }).populate('productId');
    if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng không tồn tại!');
    
    if (order.status !== 'pending') {
      return ctx.answerCbQuery(`⚠️ Đơn hàng đã xử lý (Status: ${order.status})`);
    }
    
    // Sử dụng findOneAndUpdate bảo vệ concurrency, tránh cấp trùng kho
    const account = await Stock.findOneAndUpdate(
      { productId: order.productId._id, status: 'available' },
      {
        status: 'sold',
        soldTo: order.telegramId,
        soldAt: new Date()
      },
      { new: true }
    );
    
    if (!account) {
      await ctx.answerCbQuery('⚠️ Gói này vừa hết hàng! Đã tự động hoàn/hủy đơn.');
      order.status = 'canceled';
      await order.save();
      return ctx.reply('❌ Kho hàng hiện tại đã hết sản phẩm. Vui lòng liên hệ Admin để nhận lại tiền hoặc chọn gói khác.');
    }
    
    // Cập nhật đơn hàng thành công
    order.status = 'paid';
    order.accountDelivered = account.accountData;
    await order.save();
    
    await ctx.answerCbQuery('🎉 Xác nhận thanh toán thành công!');
    
    const deliverText = 
      `🎉 *THANH TOÁN THÀNH CÔNG & GIAO HÀNG TỰ ĐỘNG!* \n` +
      `-----------------------------------------\n` +
      `🆔 Mã đơn hàng: *${orderId}*\n` +
      `📦 Sản phẩm: *${order.productId.name}*\n` +
      `💵 Tổng tiền: *${order.amount.toLocaleString('vi-VN')}đ*\n` +
      `🚚 Trạng thái: *Đã bàn giao tài khoản* ✅\n\n` +
      `🗝️ *THÔNG TIN TÀI KHOẢN CỦA BẠN:* \n` +
      `\`${account.accountData}\`\n\n` +
      `👉 _Bạn hãy lưu lại thông tin tài khoản trên. Nếu có bất kỳ lỗi gì, hãy bấm nút "Báo lỗi tài khoản" bên dưới để được xử lý ngay lập tức!_`;
      
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(
      deliverText,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🚨 Báo lỗi tài khoản (Tạo Ticket)', `report_error_${orderId}`)
          ],
          [
            Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')
          ]
        ])
      }
    );
  } catch (error) {
    console.error('Error simulating paid order:', error);
  }
});

// Luồng hủy hóa đơn chờ thanh toán
bot.action(/^cancel_order_(.+)$/, async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const order = await Order.findOne({ orderId });
    if (order && order.status === 'pending') {
      order.status = 'canceled';
      await order.save();
      await ctx.answerCbQuery('❌ Đơn hàng đã hủy.');
    } else {
      await ctx.answerCbQuery('⚠️ Không thể hủy đơn hàng này.');
    }
    
    const menu = await getMenuMessageAndKeyboard(ctx.from.id);
    await ctx.deleteMessage().catch(() => {});
    return ctx.replyWithMarkdown(menu.text, menu.keyboard);
  } catch (error) {
    console.error('Error canceling order:', error);
  }
});

// Khách hàng click Báo lỗi đơn hàng (Tạo Ticket)
bot.action(/^report_error_(.+)$/, async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const order = await Order.findOne({ orderId });
    if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng không tồn tại!');
    
    const userId = ctx.from.id;
    const session = getSession(userId);
    session.state = `awaiting_ticket_desc_${orderId}`;
    
    await ctx.answerCbQuery();
    return ctx.reply(
      `🚨 *BÁO LỖI TÀI KHOẢN & BẢO HÀNH*\n` +
      `-----------------------------------------\n` +
      `Mã đơn hàng: *${orderId}*\n\n` +
      `Vui lòng nhập chi tiết lỗi của tài khoản (Ví dụ: Sai mật khẩu, không đăng nhập được...) để gửi yêu cầu cho Ban Quản Trị:`,
      { parse_mode: 'Markdown', ...Markup.forceReply() }
    );
  } catch (error) {
    console.error('Error reporting order error:', error);
  }
});

// --- PHÂN HỆ QUẢN TRỊ ADMIN PANEL ---

// Mở Admin Panel
bot.action('admin_panel', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!(await isAdmin(userId))) {
      return ctx.answerCbQuery('⚠️ Bạn không có quyền truy cập trang quản trị!');
    }
    
    await ctx.answerCbQuery();
    const admin = await getAdminPanel();
    await ctx.deleteMessage().catch(() => {});
    return ctx.replyWithMarkdown(admin.text, admin.keyboard);
  } catch (error) {
    console.error('Error opening admin panel:', error);
  }
});

// Click nút Thêm sản phẩm mới
bot.action('admin_add_product', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!(await isAdmin(userId))) return ctx.answerCbQuery('⚠️ Yêu cầu quyền Admin!');
    
    const session = getSession(userId);
    session.state = 'admin_awaiting_prod_name';
    session.tempData = {};
    
    await ctx.answerCbQuery();
    return ctx.reply(
      `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 1/3)*\n\n` +
      `Vui lòng nhập *Tên gói sản phẩm* mới muốn bán (Ví dụ: \`📺 Netflix Premium 1 Tháng\`):`,
      { parse_mode: 'Markdown', ...Markup.forceReply() }
    );
  } catch (error) {
    console.error('Error admin add product:', error);
  }
});

// Click nút Nạp kho hàng (Add Stock)
bot.action('admin_add_stock', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!(await isAdmin(userId))) return ctx.answerCbQuery('⚠️ Yêu cầu quyền Admin!');
    
    const products = await Product.find();
    if (products.length === 0) {
      await ctx.answerCbQuery('⚠️ Hệ thống chưa có sản phẩm nào!');
      return ctx.reply('Vui lòng thêm sản phẩm trước khi nạp kho.');
    }
    
    const buttons = products.map((p) => [
      Markup.button.callback(`🗝️ Nạp: ${p.name}`, `admin_select_stock_${p._id}`)
    ]);
    buttons.push([Markup.button.callback('↩️ Quay lại Admin Panel', 'admin_panel')]);
    
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(
      `🗝️ *NẠP KHO SẢN PHẨM (ADD STOCK)*\n\n` +
      `Vui lòng chọn sản phẩm cần nạp thêm tài khoản vào kho:`,
      Markup.inlineKeyboard(buttons)
    );
  } catch (error) {
    console.error('Error admin add stock:', error);
  }
});

// Chọn sản phẩm để nạp kho
bot.action(/^admin_select_stock_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = await Product.findById(productId);
    if (!product) return ctx.answerCbQuery('⚠️ Sản phẩm không tồn tại!');
    
    const userId = ctx.from.id;
    const session = getSession(userId);
    session.state = `admin_awaiting_stock_${productId}`;
    
    await ctx.answerCbQuery();
    return ctx.reply(
      `🗝️ *NẠP KHO SẢN PHẨM:* *${product.name}*\n` +
      `-----------------------------------------\n` +
      `Gửi danh sách tài khoản cần nạp vào kho. Định dạng: **mỗi dòng một tài khoản** (Ví dụ):\n` +
      `\`tk1@gmail.com|pass123\`\n` +
      `\`tk2@gmail.com|pass987\`\n\n` +
      `_Bot sẽ tự động tách các dòng và nạp riêng từng tài khoản số._`,
      { parse_mode: 'Markdown', ...Markup.forceReply() }
    );
  } catch (error) {
    console.error('Error admin select stock:', error);
  }
});

// Xem danh sách Ticket báo lỗi chưa xử lý
bot.action('admin_view_tickets', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!(await isAdmin(userId))) return ctx.answerCbQuery('⚠️ Yêu cầu quyền Admin!');
    
    const tickets = await Ticket.find({ status: 'open' });
    if (tickets.length === 0) {
      await ctx.answerCbQuery('🎉 Tuyệt vời! Hiện tại không có ticket lỗi nào đang chờ xử lý.');
      return;
    }
    
    const buttons = tickets.map((t) => [
      Markup.button.callback(`🚨 ${t.ticketId} (Đơn: ${t.orderId})`, `admin_select_ticket_${t._id}`)
    ]);
    buttons.push([Markup.button.callback('↩️ Quay lại Admin Panel', 'admin_panel')]);
    
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(
      `🚨 *DANH SÁCH TICKET BÁO LỖI CHỜ XỬ LÝ:* \n\n` +
      `Bấm vào mã ticket phía dưới để xem chi tiết và giải quyết:`,
      Markup.inlineKeyboard(buttons)
    );
  } catch (error) {
    console.error('Error admin view tickets:', error);
  }
});

// Chọn xem chi tiết 1 ticket
bot.action(/^admin_select_ticket_(.+)$/, async (ctx) => {
  try {
    const ticketDbId = ctx.match[1];
    const ticket = await Ticket.findById(ticketDbId);
    if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');
    
    const order = await Order.findOne({ orderId: ticket.orderId }).populate('productId');
    
    let ticketDetail = 
      `🚨 *CHI TIẾT TICKET LỖI:* *${ticket.ticketId}*\n` +
      `-----------------------------------------\n` +
      `• Đơn hàng: *${ticket.orderId}* (${order ? order.productId.name : 'N/A'})\n` +
      `• Khách hàng: ID \`${ticket.telegramId}\`\n` +
      `• Nội dung lỗi: _${ticket.issueDescription}_\n` +
      `• Tài khoản đã cấp: \`${order ? order.accountDelivered : 'N/A'}\`\n` +
      `• Thời gian báo: _${new Date(ticket.createdAt).toLocaleString('vi-VN')}_\n` +
      `-----------------------------------------\n` +
      `👉 *LỰA CHỌN GIẢI QUYẾT:* \n` +
      `1. *Cấp bù tự động:* Bot tự động lấy tài khoản mới từ kho và inbox cho khách.\n` +
      `2. *Trả lời bằng chat:* Nhập nội dung phản hồi riêng cho khách.`;
      
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return ctx.reply(
      ticketDetail,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Cấp bù tài khoản mới (Auto Replace)', `admin_replace_ticket_${ticketDbId}`)
          ],
          [
            Markup.button.callback('✍️ Nhập tin nhắn phản hồi', `admin_reply_ticket_${ticketDbId}`),
            Markup.button.callback('✅ Giải quyết xong (Đóng)', `admin_resolve_ticket_${ticketDbId}`)
          ],
          [
            Markup.button.callback('↩️ Quay lại danh sách', 'admin_view_tickets')
          ]
        ])
      }
    );
  } catch (error) {
    console.error('Error admin select ticket:', error);
  }
});

// Tự động cấp bù tài khoản mới cho Ticket lỗi
bot.action(/^admin_replace_ticket_(.+)$/, async (ctx) => {
  try {
    const ticketDbId = ctx.match[1];
    const ticket = await Ticket.findById(ticketDbId);
    if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');
    
    const order = await Order.findOne({ orderId: ticket.orderId });
    if (!order) return ctx.answerCbQuery('⚠️ Đơn hàng liên quan không tồn tại!');
    
    // Tìm 1 tài khoản mới trong kho sản phẩm tương ứng
    const account = await Stock.findOneAndUpdate(
      { productId: order.productId, status: 'available' },
      {
        status: 'sold',
        soldTo: ticket.telegramId,
        soldAt: new Date()
      },
      { new: true }
    );
    
    if (!account) {
      return ctx.reply('❌ Không thể cấp bù do kho hàng của sản phẩm này hiện đã hết sạch!');
    }
    
    // Cập nhật ticket thành đã xử lý
    ticket.status = 'resolved';
    ticket.reply = `Admin đã tự động cấp bù tài khoản mới thay thế: ${account.accountData}`;
    await ticket.save();
    
    // Cập nhật lại tài khoản đã cấp trong hóa đơn gốc
    order.accountDelivered = account.accountData;
    await order.save();
    
    await ctx.answerCbQuery('🔄 Đã tự động cấp bù thành công!');
    
    // Bắn tin nhắn riêng cấp bù cho khách hàng
    try {
      await bot.telegram.sendMessage(
        ticket.telegramId,
        `🔔 *HỖ TRỢ ĐỔI TRẢ BẢO HÀNH TỰ ĐỘNG!* \n` +
        `-----------------------------------------\n` +
        `Yêu cầu lỗi đơn hàng *${ticket.orderId}* (Ticket *${ticket.ticketId}*) đã được Admin xử lý.\n\n` +
        `🗝️ *ĐÂY LÀ TÀI KHOẢN MỚI CẤP BÙ CHO BẠN:* \n` +
        `\`${account.accountData}\`\n\n` +
        `Cảm ơn bạn đã hợp tác và kiên nhẫn!`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Không thể nhắn tin trực tiếp cho khách:', e);
    }
    
    return ctx.reply(
      `✅ Đã thực hiện cấp bù tài khoản mới thành công cho khách!\n\n` +
      `Tài khoản cấp mới: \`${account.accountData}\`\n` +
      `Hệ thống đã tự động gửi tin nhắn inbox cho khách hàng và đóng ticket.`,
      Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại danh sách Tickets', 'admin_view_tickets')]])
    );
  } catch (error) {
    console.error('Error admin replace ticket:', error);
  }
});

// Đóng ticket thủ công
bot.action(/^admin_resolve_ticket_(.+)$/, async (ctx) => {
  try {
    const ticketDbId = ctx.match[1];
    const ticket = await Ticket.findById(ticketDbId);
    if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');
    
    ticket.status = 'resolved';
    ticket.reply = 'Đã giải quyết và đóng thủ công bởi Admin.';
    await ticket.save();
    
    await ctx.answerCbQuery('✅ Đã giải quyết xong ticket!');
    return ctx.reply(
      `✅ Đã đóng ticket *${ticket.ticketId}* thành công!`,
      Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại danh sách Tickets', 'admin_view_tickets')]])
    );
  } catch (error) {
    console.error('Error admin resolve ticket:', error);
  }
});

// Admin phản hồi ticket lỗi bằng cách gửi chat
bot.action(/^admin_reply_ticket_(.+)$/, async (ctx) => {
  try {
    const ticketDbId = ctx.match[1];
    const ticket = await Ticket.findById(ticketDbId);
    if (!ticket) return ctx.answerCbQuery('⚠️ Ticket không tồn tại!');
    
    const userId = ctx.from.id;
    const session = getSession(userId);
    session.state = `admin_awaiting_ticket_reply_${ticketDbId}`;
    
    await ctx.answerCbQuery();
    return ctx.reply(
      `✍️ *PHẢN HỒI TICKET:* *${ticket.ticketId}*\n\n` +
      `Vui lòng nhập nội dung tin nhắn bạn muốn gửi phản hồi cho khách hàng:`,
      Markup.forceReply()
    );
  } catch (error) {
    console.error('Error admin reply ticket button:', error);
  }
});

// Nhận tin nhắn chat thường (xử lý điền thông tin khi thêm sản phẩm, nạp kho, reply ticket)
bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const session = getSession(userId);
    const text = ctx.message.text.trim();
    
    if (text.startsWith('/')) {
      session.state = null;
      return;
    }
    
    // --- XỬ LÝ FLOW KHÁCH HÀNG (USER TICKET) ---
    if (session.state && session.state.startsWith('awaiting_ticket_desc_')) {
      const orderId = session.state.split('_').slice(-1)[0];
      const ticketId = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const ticket = new Ticket({
        ticketId,
        telegramId: String(userId),
        orderId,
        issueDescription: text
      });
      await ticket.save();
      session.state = null;
      
      return ctx.reply(
        `✅ *GỬI YÊU CẦU HỖ TRỢ THÀNH CÔNG!*\n` +
        `-----------------------------------------\n` +
        `🆔 Mã Ticket: *${ticketId}*\n` +
        `📦 Đơn hàng: *${orderId}*\n` +
        `📝 Nội dung lỗi: _${text}_\n` +
        `⏳ Trạng thái: *Đang chờ xử lý*\n\n` +
        `Ban Quản Trị đã ghi nhận lỗi đơn hàng này của bạn và sẽ tiến hành kiểm tra, phản hồi hoặc đổi trả tài khoản mới trực tiếp qua chat inbox của bạn sớm nhất!`,
        Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')]])
      );
    }
    
    // --- XỬ LÝ FLOW ADMIN PANEL ---
    
    // Admin: Thêm tên sản phẩm
    if (session.state === 'admin_awaiting_prod_name') {
      session.tempData.name = text;
      session.state = 'admin_awaiting_prod_price';
      return ctx.reply(
        `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 2/3)*\n\n` +
        `Tên sản phẩm: *${text}*\n\n` +
        `Vui lòng nhập *Giá tiền* sản phẩm (chỉ nhập số nguyên, ví dụ: \`65000\`):`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    }
    
    // Admin: Thêm giá sản phẩm
    if (session.state === 'admin_awaiting_prod_price') {
      const price = parseInt(text, 10);
      if (isNaN(price) || price <= 0) {
        return ctx.reply('⚠️ Giá tiền không hợp lệ! Vui lòng nhập số nguyên dương (Ví dụ: 65000):', Markup.forceReply());
      }
      session.tempData.price = price;
      session.state = 'admin_awaiting_prod_desc';
      return ctx.reply(
        `➕ *THÊM SẢN PHẨM MỚI (BƯỚC 3/3)*\n\n` +
        `Tên sản phẩm: *${session.tempData.name}*\n` +
        `Giá bán: *${price.toLocaleString('vi-VN')}đ*\n\n` +
        `Vui lòng nhập *Mô tả sản phẩm* chi tiết (Ví dụ: xem chất lượng 4K...):`,
        { parse_mode: 'Markdown', ...Markup.forceReply() }
      );
    }
    
    // Admin: Thêm mô tả sản phẩm và Lưu
    if (session.state === 'admin_awaiting_prod_desc') {
      const product = new Product({
        name: session.tempData.name,
        price: session.tempData.price,
        category: 'Tài khoản số',
        description: text
      });
      await product.save();
      session.state = null;
      session.tempData = {};
      
      return ctx.reply(
        `✅ *THÊM SẢN PHẨM THÀNH CÔNG!*\n\n` +
        `Sản phẩm *${product.name}* với giá *${product.price.toLocaleString('vi-VN')}đ* đã được thêm thành công vào cơ sở dữ liệu MongoDB và sẵn sàng để khách hàng chọn mua!`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
          [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')]
        ])
      );
    }
    
    // Admin: Nạp thêm kho hàng (Stock) hàng loạt
    if (session.state && session.state.startsWith('admin_awaiting_stock_')) {
      const productId = session.state.split('_').slice(-1)[0];
      const product = await Product.findById(productId);
      if (!product) return ctx.reply('❌ Có lỗi xảy ra: Sản phẩm không còn tồn tại trên hệ thống!');
      
      const accounts = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (accounts.length === 0) {
        return ctx.reply('⚠️ Bạn chưa nhập tài khoản nào! Vui lòng nhập lại danh sách tài khoản hợp lệ:', Markup.forceReply());
      }
      
      const stockDocs = accounts.map((acc) => ({
        productId: product._id,
        accountData: acc,
        status: 'available'
      }));
      
      await Stock.insertMany(stockDocs);
      session.state = null;
      
      return ctx.reply(
        `✅ *NẠP KHO THÀNH CÔNG!*\n\n` +
        `Đã nạp thành công *${accounts.length}* tài khoản số mới vào kho của sản phẩm *${product.name}*!\n\n` +
        `Tổng tài khoản trong kho hiện đã sẵn sàng để hệ thống tự động cấp bán.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Trở lại Admin Panel', 'admin_panel')],
          [Markup.button.callback('↩️ Quay lại Menu chính', 'show_menu')]
        ])
      );
    }
    
    // Admin: Nhập tin nhắn phản hồi Ticket lỗi gửi cho khách
    if (session.state && session.state.startsWith('admin_awaiting_ticket_reply_')) {
      const ticketDbId = session.state.split('_').slice(-1)[0];
      const ticket = await Ticket.findById(ticketDbId);
      if (!ticket) return ctx.reply('❌ Có lỗi xảy ra: Ticket không tồn tại!');
      
      ticket.status = 'resolved';
      ticket.reply = text;
      await ticket.save();
      session.state = null;
      
      // Bắn phản hồi inbox cho khách hàng
      try {
        await bot.telegram.sendMessage(
          ticket.telegramId,
          `🔔 *PHẢN HỒI HỖ TRỢ TỪ BAN QUẢN TRỊ!* \n` +
          `-----------------------------------------\n` +
          `Yêu cầu đơn hàng *${ticket.orderId}* (Ticket *${ticket.ticketId}*) đã được giải quyết.\n\n` +
          `💬 *NỘI DUNG PHẢN HỒI CỦA ADMIN:* \n` +
          `"${text}"\n\n` +
          `Cảm ơn bạn đã tin tưởng dịch vụ!`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.error('Không thể gửi inbox cho khách:', e);
      }
      
      return ctx.reply(
        `✅ *GỬI PHẢN HỒI THÀNH CÔNG!*\n\n` +
        `Tin nhắn đã được chuyển tới khách hàng và ticket *${ticket.ticketId}* đã chuyển sang trạng thái đã xử lý (đóng).`,
        Markup.inlineKeyboard([[Markup.button.callback('↩️ Quay lại danh sách Tickets', 'admin_view_tickets')]])
      );
    }
    
    // Phản hồi mặc định nếu chat thường ngoài luồng hội thoại
    return ctx.reply(
      `🤖 *Bot nhại lại:* "${text}"\n\n` +
      `👉 _Mẹo: Bạn hãy nhập lệnh /start để xem thực đơn các sản phẩm tài khoản số tự động nhé!_`
    );
  } catch (error) {
    console.error('Lỗi khi xử lý tin nhắn chat:', error);
  }
});

// Khởi chạy bot
bot.launch().then(() => {
  console.log('================================================================');
  console.log('🚀 Telegram Digital Account Selling Bot đã khởi động thành công!');
  console.log('🟢 Đang lắng nghe tin nhắn trên MongoDB...');
  console.log('================================================================');
}).catch((err) => {
  console.error('❌ Lỗi khi khởi chạy bot:', err);
});

// Đảm bảo dừng bot an toàn khi process bị terminate
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
