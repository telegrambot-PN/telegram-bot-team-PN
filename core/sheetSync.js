// core/sheetSync.js
// Hệ thống đồng bộ thời gian thực bảo mật cao từ Google Trang tính (Google Sheets) v4.0
// Tự động kéo sản phẩm, nạp kho mã hóa AES-256, loại bỏ trùng lặp và bảo vệ OpSec tối đa.

import { Product, Stock } from '../db.js';
import { encrypt } from '../security/crypto.js';
import { logAction, AUDIT_ACTIONS } from '../security/audit.js';
import { eventBus, EVENTS } from './eventBus.js';
import { FEATURES } from '../config/features.js';
import { logger } from '../utils/logger.js';

/**
 * Thực hiện đồng bộ hóa dữ liệu từ Google Sheets qua Apps Script Web App
 * @returns {Promise<{ success: boolean, message: string, stats?: object }>}
 */
export const syncWithGoogleSheets = async () => {
  const apiUrl = process.env.GOOGLE_SHEET_API_URL;
  const syncToken = process.env.GOOGLE_SHEET_SYNC_TOKEN;

  if (!apiUrl || !syncToken) {
    return {
      success: false,
      message: 'Chưa cấu hình GOOGLE_SHEET_API_URL hoặc GOOGLE_SHEET_SYNC_TOKEN trong file .env!',
    };
  }

  try {
    // 1. Gửi request lấy dữ liệu thời gian thực qua giao thức HTTPS được mã hóa bảo mật
    const url = `${apiUrl}?token=${encodeURIComponent(syncToken)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return { success: false, message: `Lỗi kết nối API Google Apps Script: ${response.statusText}` };
    }

    const data = await response.json();
    
    if (data.error) {
      return { success: false, message: `Lỗi phân quyền từ Apps Script: ${data.error}` };
    }

    const sheetProducts = data.products || [];
    const sheetStocks = data.stocks || [];

    // --- A. ĐỒNG BỘ SẢN PHẨM ---
    let productsAdded = 0;
    const productCache = new Map(); // Cache để tăng tốc truy vấn

    for (const row of sheetProducts) {
      const { name, price, category, description } = row;
      const parsedPrice = parseInt(price, 10);

      if (!name || isNaN(parsedPrice) || parsedPrice <= 0) continue;

      // Tìm sản phẩm trùng lặp
      let product = await Product.findOne({ name });
      if (!product) {
        product = new Product({
          name,
          price: parsedPrice,
          category: category || 'Tài khoản số',
          description: description || '',
        });
        await product.save();
        productsAdded++;
      }
      productCache.set(name, product);
    }

    // --- B. ĐỒNG BỘ TỒN KHO ---
    let stocksAdded = 0;
    let stocksSkipped = 0;
    const missingProducts = new Set();

    for (const row of sheetStocks) {
      const { productName, accountData, status } = row;

      // Bỏ qua nếu dòng trống hoặc tài khoản đã đánh dấu là bán (sold) trên Sheet
      if (!productName || !accountData || String(status).toLowerCase() === 'sold') {
        continue;
      }

      // Tìm sản phẩm trong DB (sử dụng cache trước để giảm tải truy vấn DB)
      let product = productCache.get(productName);
      if (!product) {
        product = await Product.findOne({ name: productName });
        if (product) {
          productCache.set(productName, product);
        } else {
          missingProducts.add(productName);
          stocksSkipped++;
          continue;
        }
      }

      // Mã hóa accountData trước khi kiểm tra trùng lặp và lưu trữ
      const secureAccount = FEATURES.ENCRYPT_ACCOUNTS ? encrypt(accountData) : accountData;

      // Kiểm tra xem tài khoản này đã tồn tại trong kho chưa (tránh trùng lặp)
      const existingStock = await Stock.findOne({ accountData: secureAccount });
      if (existingStock) {
        stocksSkipped++;
        continue;
      }

      // Lưu trữ tài khoản mới
      const stock = new Stock({
        productId: product._id,
        accountData: secureAccount,
        status: 'available',
      });
      await stock.save();
      stocksAdded++;

      // Phát sự kiện thêm kho
      await eventBus.emit(EVENTS.STOCK_ADDED, {
        productId: String(product._id),
        productName: product.name,
        count: 1,
      });
    }

    // Ghi audit logs hành động đồng bộ
    if (FEATURES.AUDIT_LOG && (productsAdded > 0 || stocksAdded > 0)) {
      logAction(AUDIT_ACTIONS.STOCK_ADDED, 'system', {
        method: 'google_sheets_sync',
        productsAdded,
        stocksAdded,
      });
    }

    return {
      success: true,
      message: 'Đồng bộ hóa dữ liệu từ Google Sheets thành công!',
      stats: {
        productsAdded,
        stocksAdded,
        stocksSkipped,
        missingProductsCount: missingProducts.size,
        missingProducts: Array.from(missingProducts),
      },
    };

  } catch (e) {
    logger.error('[SheetSync] Lỗi đồng bộ dữ liệu:', e.message);
    return { success: false, message: `Lỗi kết nối hoặc định dạng API Sheets: ${e.message}` };
  }
};
