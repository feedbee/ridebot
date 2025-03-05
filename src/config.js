import dotenv from 'dotenv';

dotenv.config();

export const config = {
  isDev: process.env.NODE_ENV === 'development',
  bot: {
    token: process.env.BOT_TOKEN,
    webhookDomain: process.env.WEBHOOK_DOMAIN,
    webhookPath: '/webhook',
    useWebhook: process.env.NODE_ENV === 'production'
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
    }
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
  messageTemplates: {
    ride: `
🚲 *{title}*{cancelledBadge}

📅 Date: {date}
⏰ Time: {time}
{meetingInfo}{routeInfo}{distanceInfo}{durationInfo}{speedInfo}

👥 Participants ({participantCount}):
{participants}

{joinInstructions}
    `.trim(),
    cancelled: '❌ CANCELLED',
    cancelledInstructions: 'This ride has been cancelled',
    deleteConfirmation: '⚠️ Are you sure you want to delete this ride? This action cannot be undone.'
  },
  buttons: {
    join: "I'm in! 🚴",
    leave: "Leave 👋",
    confirmDelete: "Yes, delete ❌",
    cancelDelete: "No, keep it ✅",
    back: "⬅️ Back",
    skip: "⏩ Skip",
    cancel: "❌ Cancel",
    create: "✅ Create",
    previous: "◀️ Previous",
    next: "Next ▶️"
  }
}; 
