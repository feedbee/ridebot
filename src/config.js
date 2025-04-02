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
<b>🚲 Bike Ride Bot Help</b>

<b>➕ Creating a New Ride</b>
Create a new ride:
1. Using the wizard (recommended):
Simply send <code>/newride</code> command without any parameters to start an interactive wizard that will guide you through each step.

2. Using command with parameters:
Use <code>/newride</code> command followed by parameters (one per line):
<pre>
/newride
title: Ride title
when: Date and time (e.g., "tomorrow at 6pm", "next saturday 10am", "21 Jul 14:30")
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
time: Duration in minutes (optional)
speed: Speed range in km/h (optional)
</pre>

Example:
<pre>
/newride
title: Evening Ride
when: tomorrow at 6pm
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28
</pre>

<b>Managing Rides</b>

<b>🔄 Updating a Ride</b>
Only the ride creator can update. Two ways:
1. Reply to the ride message with <code>/updateride</code> and new parameters
2. Use <code>/updateride</code> with ride ID:
<pre>
/updateride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
time: New duration (optional)
speed: New speed range (optional)
</pre>

<b>❌ Cancelling a Ride</b>
Only the ride creator can cancel:
1. Reply to the ride message with <code>/cancelride</code>
2. Use <code>/cancelride</code> with ride ID:
<pre>/cancelride id: abc123</pre>

<b>🗑 Deleting a Ride</b>
Only the ride creator can delete:
1. Reply to the ride message with <code>/deleteride</code>
2. Use <code>/deleteride</code> with ride ID:
<pre>/deleteride id: abc123</pre>

<b>🔄 Duplicating a Ride</b>
Only the ride creator can duplicate. Two ways:
1. Use the wizard (recommended):
Send <code>/dupridex</code> to start an interactive wizard.

2. Use <code>/dupride</code> with ID and optional parameters:
<pre>
/dupride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
time: New duration (optional)
speed: New speed range (optional)
</pre>
Any parameters not provided will be copied from the original ride.
By default, the new ride will be scheduled for tomorrow at the same time.

<b>📋 Listing Your Rides</b>
Use <code>/listrides</code> to see all rides you've created:
• Rides are sorted by date (newest first)
• Use navigation buttons to browse pages
    `.trim(),
    ride: `
🚲 <b>{title}</b>{cancelledBadge}

📅 Date: {date}
⏰ Time: {time}
{meetingInfo}{routeInfo}{distanceInfo}{durationInfo}{speedInfo}

👥 Participants ({participantCount}):
{participants}

🎫 Ride #{id}{cancelledInstructions}
    `.trim(),
    cancelled: '❌ CANCELLED',
    cancelledMessage: 'This ride has been cancelled.',
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
