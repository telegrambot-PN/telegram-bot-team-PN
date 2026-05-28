import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/telegram_shop';

// Phân tích host và port từ MONGODB_URI
let host = '127.0.0.1';
let port = 27017;
try {
  const urlParts = MONGODB_URI.replace('mongodb://', '').split('/')[0].split('@').pop().split(':');
  if (urlParts[0]) host = urlParts[0];
  if (urlParts[1]) port = parseInt(urlParts[1], 10);
} catch (e) {
  // ignore
}

let useMock = false;
// Nếu MONGODB_URI là localhost/127.0.0.1, kiểm tra xem MongoDB có đang chạy không
if (host === '127.0.0.1' || host === 'localhost') {
  try {
    execSync(`node -e "const net = require('net'); const s = net.createConnection(${port}, '${host}', () => { s.end(); process.exit(0); }); s.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 1000);"`, { stdio: 'ignore' });
    console.log('🔌 Phát hiện MongoDB đang hoạt động cục bộ.');
  } catch (e) {
    console.log('⚠️ Không phát hiện MongoDB hoạt động cục bộ.');
    console.log('💡 Tự động kích hoạt chế độ Mock Database (Lưu dữ liệu vào db.json) để chạy thử bot lập tức!');
    useMock = true;
  }
}

export let User;
export let Product;
export let Stock;
export let Order;
export let Ticket;

if (!useMock) {
  // Sử dụng Mongoose thật
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
  })
    .then(() => console.log('🌿 Đã kết nối cơ sở dữ liệu MongoDB thành công!'))
    .catch((err) => {
      console.error('❌ Lỗi kết nối MongoDB:', err.message);
      console.error('👉 Vui lòng kiểm tra lại cấu hình MONGODB_URI trong file .env.');
    });

  const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    firstName: { type: String },
    username: { type: String },
    role: { type: String, enum: ['owner', 'admin', 'ctv', 'user'], default: 'user' },
    createdAt: { type: Date, default: Date.now }
  });

  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
  });

  const stockSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    accountData: { type: String, required: true },
    status: { type: String, enum: ['available', 'sold'], default: 'available' },
    soldTo: { type: String, default: null },
    soldAt: { type: Date, default: null }
  });

  const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    telegramId: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, default: 'Simulated QR' },
    status: { type: String, enum: ['pending', 'paid', 'canceled'], default: 'pending' },
    accountDelivered: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  });

  const ticketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    telegramId: { type: String, required: true },
    orderId: { type: String, required: true },
    issueDescription: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    reply: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  });

  User = mongoose.model('User', userSchema);
  Product = mongoose.model('Product', productSchema);
  Stock = mongoose.model('Stock', stockSchema);
  Order = mongoose.model('Order', orderSchema);
  Ticket = mongoose.model('Ticket', ticketSchema);

} else {
  // Sử dụng Mock Database lưu vào file db.json
  const DB_FILE = './db.json';
  let data = {
    users: [],
    products: [],
    stocks: [],
    orders: [],
    tickets: []
  };

  if (fs.existsSync(DB_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      // ignore
    }
  }

  const saveData = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  };

  const genId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  class MockModel {
    constructor(collectionName, itemData) {
      this._collection = collectionName;
      Object.assign(this, itemData);
      if (!this._id) {
        this._id = genId();
      }
    }

    async save() {
      const list = data[this._collection];
      const idx = list.findIndex(x => String(x._id) === String(this._id));
      const plainObj = { ...this };
      delete plainObj._collection;
      if (idx >= 0) {
        list[idx] = plainObj;
      } else {
        list.push(plainObj);
      }
      saveData();
      return this;
    }
  }

  const makeModel = (collectionName) => {
    const ModelClass = class extends MockModel {
      constructor(itemData) {
        super(collectionName, itemData);
      }

      static async find(query = {}) {
        let list = data[collectionName];
        if (query && typeof query === 'object') {
          list = list.filter(item => {
            for (let key in query) {
              if (String(item[key]) !== String(query[key])) return false;
            }
            return true;
          });
        }
        return list.map(item => new ModelClass(item));
      }

      static findOne(query = {}) {
        let list = data[collectionName];
        if (query && typeof query === 'object') {
          list = list.filter(item => {
            for (let key in query) {
              if (String(item[key]) !== String(query[key])) return false;
            }
            return true;
          });
        }
        const item = list[0];
        const doc = item ? new ModelClass(item) : null;

        const queryResult = {
          populate(pathStr) {
            if (doc && pathStr === 'productId' && collectionName === 'orders') {
              const field = doc[pathStr];
              const prod = data.products.find(p => String(p._id) === String(field));
              doc[pathStr] = prod ? new (makeModel('products'))(prod) : null;
            }
            return this;
          },
          then(onFulfilled, onRejected) {
            return Promise.resolve(doc).then(onFulfilled, onRejected);
          }
        };
        return queryResult;
      }

      static async findById(id) {
        const item = data[collectionName].find(x => String(x._id) === String(id));
        if (!item) return null;
        return new ModelClass(item);
      }

      static async countDocuments(query = {}) {
        let list = data[collectionName];
        if (query && typeof query === 'object') {
          list = list.filter(item => {
            for (let key in query) {
              if (String(item[key]) !== String(query[key])) return false;
            }
            return true;
          });
        }
        return list.length;
      }

      static async insertMany(arr) {
        const created = arr.map(item => {
          const doc = new ModelClass(item);
          const plainObj = { ...doc };
          delete plainObj._collection;
          data[collectionName].push(plainObj);
          return doc;
        });
        saveData();
        return created;
      }

      static async findOneAndUpdate(query, update, options = {}) {
        let list = data[collectionName];
        let item = null;
        if (query && typeof query === 'object') {
          item = list.find(x => {
            for (let key in query) {
              if (String(x[key]) !== String(query[key])) return false;
            }
            return true;
          });
        }
        if (!item) return null;

        if (update) {
          if (update.$set) {
            Object.assign(item, update.$set);
          } else {
            Object.assign(item, update);
          }
        }
        saveData();
        return new ModelClass(item);
      }

      static async aggregate(pipeline = []) {
        if (collectionName === 'orders') {
          const paidOrders = data.orders.filter(o => o.status === 'paid');
          const total = paidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
          return [{ _id: null, total }];
        }
        return [];
      }
    };

    return ModelClass;
  };

  User = makeModel('users');
  Product = makeModel('products');
  Stock = makeModel('stocks');
  Order = makeModel('orders');
  Ticket = makeModel('tickets');
}
