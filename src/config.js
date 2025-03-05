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
    help: `
*🚲 Bike Ride Bot Help*

*➕ Creating a New Ride*
Create a new ride:
1. Using the wizard (recommended):
Simply send \`/newride\` command without any parameters to start an interactive wizard that will guide you through each step.

2. Using command with parameters:
Use \`/newride\` command followed by parameters (one per line):
\`\`\`
/newride
title: Ride title
when: Date and time (e.g., "tomorrow at 6pm", "next saturday 10am", "21 Jul 14:30")
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
time: Duration in minutes (optional)
speed: Speed range in km/h (optional)
\`\`\`

Example:
\`\`\`
/newride
title: Evening Ride
when: tomorrow at 6pm
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28
\`\`\`

*Managing Rides*

*🔄 Updating a Ride*
Only the ride creator can update. Two ways:
1. Reply to the ride message with \`/updateride\` and new parameters
2. Use \`/updateride\` with ride ID:
\`\`\`
/updateride
id: abc123
title: Updated Evening Ride
when: 25.03.2024 19:00
meet: City Park entrance
speed: 26-29
\`\`\`

*❌ Cancelling a Ride*
Only the ride creator can cancel. Two ways:
1. Reply to the ride message with \`/cancelride\`
2. Use \`/cancelride\` with ID:
\`\`\`
/cancelride
id: abc123
\`\`\`

*🗑 Deleting a Ride*
Only the ride creator can delete. Two ways:
1. Reply to the ride message with \`/deleteride\`
2. Use \`/deleteride\` with ID:
\`\`\`
/deleteride
id: abc123
\`\`\`
You'll need to confirm deletion when prompted.

*🔁 Duplicating a Ride*
Create a copy of an existing ride. Two ways:
1. Reply to the ride message with \`/dupride\` and optional parameters
2. Use \`/dupride\` with ID and optional parameters:
\`\`\`
/dupride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
time: New duration (optional)
speed: New speed range (optional)
\`\`\`
Any parameters not provided will be copied from the original ride.
By default, the new ride will be scheduled for tomorrow at the same time.

*📋 Listing Your Rides*
Use \`/listrides\` to see all rides you've created:
• Rides are sorted by date (newest first)
• Use navigation buttons to browse pages
    `.trim(),
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
    cancelledInstructions: '🎫 Ride #{id}\nThis ride has been cancelled',
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
    update: "✅ Update",
    keep: "↩️ Keep current",
    previous: "◀️ Previous",
    next: "Next ▶️"
  }
}; 
