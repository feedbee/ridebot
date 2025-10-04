/**
 * Message templates for the bot
 * Separated from main config for better maintainability
 */

export const messageTemplates = {
  start: `
<b>🚲 Welcome to Ride Announcement Bot!</b>

I help you organize bike rides with your friends and community.

<b>Key Features:</b>
• Create and schedule rides
• Track participants
• Share route details
• Post rides in multiple chats
• Keep everyone updated

<b>Create Rides and Sync Them Across Chats:</b>
1. Create a ride with /newride in private chat
2. Share to other chats with /shareride
3. All instances stay synchronized
4. Join/leave updates appear everywhere
5. Changes and cancellations sync automatically

<b>Important:</b> Never forward the ride announcements manually - they won't have join buttons and won't stay in sync.

<b>Command Modes:</b>
All main commands (/newride, /updateride, /dupride, /cancelride, /deleteride) work in two modes:
• Step-by-step wizard - interactive and beginner-friendly <b>available in private chats with the bot only.</b>
• Parametrized mode - faster for experienced users
See /help for detailed examples of both modes.
To create less noise for others, it is recommended to create the rides in private chat with the bot and repost them in other chats after.

<b>Easy Ride Reference:</b>
• When working with existing ride, reply to the ride message with /updateride, /cancelride, /deleteride, /dupride, /shareride to identify the ride to modify
• Alternatively, pass the ride ID directly after the command (e.g., /updateride abc123)
• You can also use the id: parameter in multi-line commands

<b>Manage Your Rides:</b>
• Use /listrides to see all rides you've created
• Navigate through pages with buttons
• Easily access ride IDs for management

Get started with /newride or type /help for a full guide.

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
Use /listrides to see all rides you've created:
• Rides are sorted by date (newest first)
• Use navigation buttons to browse pages

<b>📢 Reposting a Ride</b>
Only the ride creator can repost a ride to another chat:
1. Go to the target chat where you want to post the ride
2. Use /shareride with the ride ID directly after the command: <code>/shareride abc123</code>
3. Or use /shareride with ride ID as a parameter:
<pre>
/shareride
id: abc123
</pre>
The ride will be posted to the current chat and all instances will be synchronized when details change or participants join/leave.
  `.trim(),

  ride: `
🚲 <b>{title}</b>{cancelledBadge}

{rideDetails}
👥 Participants ({participantCount}):
{participants}

🎫 #Ride #{id}{cancelledInstructions}
  `.trim(),

  cancelled: '❌ CANCELLED',
  cancelledMessage: 'This ride has been cancelled.',
  deleteConfirmation: '⚠️ Are you sure you want to delete this ride? This action cannot be undone.'
};

export const buttons = {
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
};
