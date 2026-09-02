import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:8080',
  jwt: {
    secret: process.env.JWT_SECRET || 'supersecretkey123',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'superrefreshsecret456',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  email: {
    webhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
    from: process.env.EMAIL_FROM || 'sales@ceylonautomobile.co.nz',
  },
  quotationExpiryDays: parseInt(process.env.VENDOR_QUOTATION_EXPIRY_DAYS || '7', 10),
  workshop: {
    latitude: parseFloat(process.env.WORKSHOP_LATITUDE || '-36.9016265'),
    longitude: parseFloat(process.env.WORKSHOP_LONGITUDE || '174.6574946'),
    radiusMeters: parseFloat(process.env.WORKSHOP_RADIUS_METERS || '50'),
    name: process.env.WORKSHOP_NAME || 'Workshop',
  },
  whatsapp: {
    enabled: (process.env.WHATSAPP_ENABLED || 'true').toLowerCase() !== 'false',
    apiUrl: process.env.WHATSAPP_API_URL || 'http://waha:3000',
    apiKey: process.env.WHATSAPP_API_KEY || process.env.WAHA_API_KEY || '',
    session: process.env.WHATSAPP_SESSION || 'default',
    groupName: process.env.WHATSAPP_GROUP_NAME || 'CA Management',
    groupId: process.env.WHATSAPP_GROUP_ID || '',
    senderHint: process.env.WHATSAPP_SENDER_HINT || '0212147160',
  },
  backup: {
    /** Inside container path — mounted from host in production */
    dir: process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'),
    /** Human-readable host path shown in the admin UI */
    hostHint: process.env.BACKUP_HOST_HINT || '/opt/ceylon-crm/backups',
  },
};
