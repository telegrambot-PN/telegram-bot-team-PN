import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/telegram_shop';

// Kết nối tới cơ sở dữ liệu MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000 // Timeout 5 giây nếu không kết nối được
})
  .then(() => console.log('🌿 Đã kết nối cơ sở dữ liệu MongoDB thành công!'))
  .catch((err) => {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    console.error('👉 Vui lòng kiểm tra lại cấu hình MONGODB_URI trong file .env và đảm bảo MongoDB của bạn đang hoạt động.');
    process.exit(1);
  });

// 1. User Schema (Thông tin người dùng)
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  firstName: { type: String },
  username: { type: String },
  role: { type: String, enum: ['owner', 'admin', 'ctv', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

// 2. Product Schema (Thông tin các gói tài khoản số)
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// 3. Stock Schema (Kho chứa tài khoản sẵn có để cấp tự động)
const stockSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  accountData: { type: String, required: true }, // định dạng user|pass hoặc link/cookie
  status: { type: String, enum: ['available', 'sold'], default: 'available' },
  soldTo: { type: String, default: null }, // telegram ID người mua
  soldAt: { type: Date, default: null }
});

// 4. Order Schema (Hóa đơn và trạng thái cấp tài khoản)
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  telegramId: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'Simulated QR' },
  status: { type: String, enum: ['pending', 'paid', 'canceled'], default: 'pending' },
  accountDelivered: { type: String, default: null }, // Dữ liệu tài khoản đã bàn giao
  createdAt: { type: Date, default: Date.now }
});

// 5. Ticket Schema (Hệ thống báo lỗi và bảo hành tài khoản)
const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  telegramId: { type: String, required: true },
  orderId: { type: String, required: true }, // Mã đơn hàng bị lỗi
  issueDescription: { type: String, required: true },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  reply: { type: String, default: null }, // Câu trả lời của Admin
  createdAt: { type: Date, default: Date.now }
});

// Đăng ký và xuất các Model
export const User = mongoose.model('User', userSchema);
export const Product = mongoose.model('Product', productSchema);
export const Stock = mongoose.model('Stock', stockSchema);
export const Order = mongoose.model('Order', orderSchema);
export const Ticket = mongoose.model('Ticket', ticketSchema);
