import dotenv from 'dotenv';
import { messageTemplates, buttons } from './config/messageTemplates.js';

dotenv.config();

export const config = {
  isDev: process.env.NODE_ENV === 'development',
  bot: {
    token: process.env.BOT_TOKEN,
    webhookDomain: process.env.WEBHOOK_DOMAIN,
    webhookPath: '/webhook',
    useWebhook: process.env.USE_WEBHOOK === 'true' || false,
    // Port for the webhook server to listen on
    webhookPort: parseInt(process.env.WEBHOOK_PORT, 10) || 8080,
    privateChatCommandsMode: process.env.PRIVATE_CHAT_COMMANDS_MODE === 'true' || false
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bikebot'
  },
  dateFormat: {
    locale: 'en-GB',
    date: {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    },
    time: {
      hour: '2-digit',
      minute: '2-digit'
    },
    // Default timezone for date/time conversions (e.g., 'Europe/London', 'America/New_York')
    // If not set, the server's local timezone will be used
    defaultTimezone: process.env.DEFAULT_TIMEZONE || null
  },
  routeProviders: {
    strava: {
      domain: 'strava.com',
      patterns: [
        /https?:\/\/(?:www\.)?strava\.com\/routes\/\d+/,
        /https?:\/\/(?:www\.)?strava\.com\/activities\/\d+/
      ]
    },
    ridewithgps: {
      domain: 'ridewithgps.com',
      patterns: [
        /https?:\/\/(?:www\.)?ridewithgps\.com\/routes\/\d+/
      ]
    },
    komoot: {
      domain: 'komoot.com',
      patterns: [
        /https?:\/\/(?:www\.)?komoot\.com\/tour\/\d+/
      ]
    }
  },
  messageTemplates,
  buttons
}; 
