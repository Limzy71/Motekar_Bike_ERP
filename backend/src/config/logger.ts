import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Buat format log kustom
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// Konfigurasi transport untuk error log
const errorTransport = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
});

// Konfigurasi transport untuk access log (semua trafik)
const accessTransport = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
});

// Buat instance logger
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    errorTransport,
    accessTransport,
  ],
});

// Tambahkan console log jika di environment development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Format khusus Morgan untuk meneruskan HTTP request ke Winston
export const stream = {
  write: (message: string) => {
    // Morgan menambahkan newline di akhir string, kita trim agar rapi
    logger.info(message.trim());
  },
};
