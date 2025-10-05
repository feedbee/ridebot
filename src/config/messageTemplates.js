/**
 * Message templates for the bot
 * Separated from main config for better maintainability
 */

export const messageTemplates = {
  start: `
<b>🚲 Welcome to Ride Announcement Bot!</b>

I am a <b>Telegram bot for organizing bike rides</b>. I will help you organize bike rides with your friends and community across multiple chats.

<b>Key Features:</b>
• Create and schedule rides
• Share rides across multiple chats
• Track participants with join/leave buttons
• Keep everyone updated automatically

<b>Quick Start:</b>
1. Use /newride in this chat to create your first ride with the wizard
2. Join your ride with the join button
3. Share it to other chats with /shareride (bot needs to be added to the other chat before sharing; /shareride@botname to share a ride in a chat where the bot is not an admin)
4. All participants and updates sync automatically!

<b>More details:</b>
• Type /help for more detailed instructions with examples
• Use /listrides command to view the rides you created
• Use ride management commands to manage your ride by ID

Happy cycling! 🚴‍♀️💨
  `.trim(),

  help1: `
<b>🚲 Ride Announcement Bot Help</b>

<i>For an overview of features and how to use the bot, use the /start command.</i>

<b>➕ Creating a New Ride</b>
Create a new ride:
1. Using the wizard (recommended):
Simply send /newride command without any parameters to start an interactive wizard that will guide you through each step. <i>(Note: Wizard mode is only available in private chats with the bot)</i>

2. Using command with parameters:
Use /newride command followed by parameters (one per line):
<pre>
/newride
title: Ride title
when: Date and time (e.g., "tomorrow at 6pm", "next saturday 10am", "21 Jul 14:30")
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
duration: Duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: Speed range in km/h (optional)
info: Additional information (optional)
</pre>

Example:
<pre>
/newride
title: Evening Ride
when: tomorrow at 6pm
category: Road Ride
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
duration: 2h 30m
speed: 25-28
info: Bring lights and a rain jacket
</pre>

<b>Managing Rides</b>

<b>🔄 Updating a Ride</b>
Only the ride creator can update. Four ways:
1. Reply to the ride message with /updateride without any parameters to start an interactive wizard. <i>(Note: Wizard mode is only available in private chats with the bot)</i>
2. Reply to the ride message with /updateride and new parameters
3. Use /updateride with ride ID directly after the command: <code>/updateride abc123</code>
4. Use /updateride with ride ID as a parameter:
<pre>
/updateride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New speed range (optional)
info: Additional information (optional)
</pre>
  `.trim(),

  help2: `
<b>❌ Cancelling a Ride</b>
Only the ride creator can cancel:
1. Reply to the ride message with /cancelride
2. Use /cancelride with ride ID directly after the command: <code>/cancelride abc123</code>
3. Use /cancelride with ride ID as a parameter:
<pre>
/cancelride
id: abc123
</pre>

<b>↩️ Resuming a Cancelled Ride</b>
Only the ride creator can resume a cancelled ride:
1. Reply to the ride message with /resumeride
2. Use /resumeride with ride ID directly after the command: <code>/resumeride abc123</code>
3. Use /resumeride with ride ID as a parameter:
<pre>
/resumeride
id: abc123
</pre>

<b>🗑 Deleting a Ride</b>
Only the ride creator can delete:
1. Reply to the ride message with /deleteride
2. Use /deleteride with ride ID directly after the command: <code>/deleteride abc123</code>
3. Use /deleteride with ride ID as a parameter:
<pre>
/deleteride
id: abc123
</pre>

<b>🔄 Duplicating a Ride</b>
Only the ride creator can duplicate. Four ways:
1. Reply to the ride message with /dupride without any parameters to start an interactive wizard. <i>(Note: Wizard mode is only available in private chats with the bot)</i>
2. Reply to the ride message with /dupride and new parameters
3. Use /dupride with ride ID directly after the command: <code>/dupride abc123</code>
4. Use /dupride with ride ID and optional parameters:
<pre>
/dupride
id: abc123
title: New title (optional)
when: New date/time (optional)
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New speed range (optional)
info: Additional information (optional)
</pre>
Any parameters not provided will be copied from the original ride.
By default, the new ride will be scheduled for tomorrow at the same time.

<b>📋 Listing Your Rides</b>
Use /listrides command to see all rides you've created:
• Rides are sorted by date (newest first)
• Use navigation buttons to browse pages

<b>📢 Sharing a Ride</b>
Only the ride creator can repost a ride to another chat:
1. Go to the target chat where you want to post the ride
2. Use /shareride (or /shareride@botname) with the ride ID directly after the command: <code>/shareride@botname abc123</code>
3. Or use /shareride (or /shareride@botname) with ride ID as a parameter:
<pre>
/shareride@botname
id: abc123 (or #abc123)
</pre>
The ride will be posted to the current chat and all instances will be synchronized when details change or participants join/leave.

<b>Important:</b> The bot needs to be added to the other chat before sharing. Bot needs to be chat admin in the other chat to use the short form of /shareride, but you can always use the full form /shareride@botname.

  `.trim(),

  ride: `
🚲 <b>{title}</b>{cancelledBadge}

{rideDetails}
🚴 Joined ({participantCount}): {participants}
🤔 Thinking ({thinkingCount}): {thinking}
🙅 Not interested: {notInterestedCount}

🎫 #Ride #{id}{cancelledInstructions}
  `.trim(),

  cancelled: '❌ CANCELLED',
  cancelledMessage: 'This ride has been cancelled.',
  deleteConfirmation: '⚠️ Are you sure you want to delete this ride? This action cannot be undone.',
  
  shareRideHelp: `
<b>ℹ️ How to share a ride in this chat:</b>

1. Create a ride in private chat with the bot
2. Get the ride ID from the confirmation message or /listrides
3. Use <code>/shareride@botname RIDE_ID</code> in this chat

Click here to start a private chat: @botname
  `.trim()
};

export const buttons = {
  join: "I'm in! 🚴",
  thinking: "Maybe 🤔",
  pass: "Pass 🙅",
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
};
