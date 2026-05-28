// utils/logger.js
// Hệ thống logging có timestamp và level

const LEVELS = { info: '🟢', warn: '🟡', error: '🔴', debug: '🔵' };

const log = (level, ...args) => {
  const time = new Date().toLocaleString('vi-VN');
  console[level === 'error' ? 'error' : 'log'](
    `[${time}] ${LEVELS[level] || ''} [${level.toUpperCase()}]`,
    ...args
  );
};

export const logger = {
  info:  (...args) => log('info',  ...args),
  warn:  (...args) => log('warn',  ...args),
  error: (...args) => log('error', ...args),
  debug: (...args) => log('debug', ...args),
};
