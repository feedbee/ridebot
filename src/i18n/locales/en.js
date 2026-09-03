export const en = {
  templates: {
    start: `
<img src="https://static.ridebot.valera.ws/ridebot/ride-announcement-teaser.jpg"/>
<h2>Welcome to Ride Announcement Bot!</h2>
<p>I am a <b>Telegram bot for organizing bike rides</b>. I will help you organize bike rides with your friends and community across multiple chats.</p>
<h3>Key Features:</h3>
<ul><li>Create and schedule rides</li><li>Share rides across multiple chats</li><li>Track participants with join/leave buttons</li><li>Manage ride defaults and per-ride settings</li><li>Attach private group chats to rides</li><li>Keep everyone updated automatically</li></ul>
<h3>Quick Start:</h3>
<ol><li>Use /newride in this chat to create your first ride with the wizard</li><li>Or use /airide to describe a ride in plain language and let AI fill in the details</li><li>Or use /fromstrava with a Strava club event URL to import a ride automatically</li><li>Join your ride with the join button</li><li>Tune defaults with /settings when you want different behavior for future rides</li><li>Share it to other chats with /shareride (bot needs to be added to the other chat before sharing; /shareride@botname works when short commands are not available)</li><li>All participants and updates sync automatically!</li></ol>
<h3>More details:</h3>
<ul><li>Type /help for more detailed instructions with examples</li><li>Use /listrides command to view the rides you created</li><li>Use ride management commands to manage your ride by ID</li></ul>
<p>Happy cycling! 🚴‍♀️💨</p>
    `.trim(),

    help1: `
<h2>Ride Announcement Bot Help</h2>
<p>Ride Announcement Bot helps you create and schedule rides, share them across chats, track participants, manage ride settings, attach private groups, and keep published announcements in sync. For a brief overview of the main features and how to use the bot, see /start.</p>

<h3>➕ Creating a New Ride</h3>
<p>Create a new ride:<br>1. Using the wizard (recommended):<br>Simply send /newride command without any parameters to start an interactive wizard that will guide you through each step. <i>(Note: Wizard mode is only available in private chats with the bot)</i></p>
<br>

<p>2. Using command with parameters:<br>Use /newride command followed by parameters (one per line):</p>
<pre>
/newride
title: Ride title
when: Date and time (e.g., "tomorrow at 6pm", "this saturday 10am", "21 Jul 14:30")
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: Meeting point (optional)
route: Route link or "Label | URL" (repeat to add multiple routes) (optional)
dist: Distance in km (optional)
duration: Duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: Average moving speed in km/h: range (25-28), min (25+ or 25-), max (-28), average (25 or ~25) (optional)
cruisingSpeed: Cruising speed in km/h, normally held on flat, fast sections (same forms; optional)
info: Additional information (optional)
settings.notifyParticipation: yes/no — notify the creator when participants change status (optional)
settings.allowReposts: yes/no — allow other users to repost this ride with /shareride (optional)
</pre>

<p>Example:</p>
<pre>
/newride
title: Evening Ride
when: tomorrow at 6pm
category: Road Ride
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
route: Komoot | https://www.komoot.com/tour/456789
dist: 35
duration: 2h 30m
speed: 24-25
cruisingSpeed: 28-30
info: Bring lights and a rain jacket
</pre>

<p>Route notes:</p>
<ul><li>Repeat <code>route:</code> to add multiple links</li><li>Use <code>route: Label | URL</code> to set a custom label</li><li>The URL is always taken from the last <code>|</code>-separated segment, so <code>|</code> may be used inside the label</li><li>If a label is omitted, the bot shows <code>Strava</code>, <code>Garmin</code>, <code>Komoot</code>, <code>RideWithGPS</code>, or localized <code>Link</code></li></ul>
<br>

<p>3. Using AI in dialog mode (private chat only):<br>Send /airide and describe the ride in plain language. The bot will parse the details with AI, show a live preview, and let you refine it across multiple messages before confirming. AI can extract multiple route links too.</p>

<pre>
/airide
</pre>
<p>Or start with an initial description:</p>

<pre>
/airide Gravel ride this Sunday 9am, 80km, starting at Central Station
</pre>

<p>Each follow-up message updates the preview. Confirm or cancel anytime using the buttons.</p>
<br>

<p>4. From a Strava group event (private chat only):<br>Send /fromstrava with a Strava club event URL. The bot fetches the event details from Strava and creates a ride automatically. If you already created a ride from the same event, it will be updated instead.</p>
<pre>
/fromstrava https://www.strava.com/clubs/123/group_events/456
</pre>
<p>Fields populated automatically: title, date, meeting point, category, route links, distance, duration, cruising speed (from speed-based pace groups), organizer (club name), and additional info (event link + description + pace groups).</p>
<br>
<p>If the Strava event has an attached route, only that route is imported. Otherwise the bot imports all known route-provider links from the description in discovery order.</p>
    `.trim(),

    help2: `
<h2>Managing Rides</h2>

<h3>🔄 Updating a Ride</h3>

<p>Only the ride creator can update. Five ways:<br>1. Reply to the ride message with /updateride without any parameters to start an interactive wizard. <i>(Note: Wizard mode is only available in private chats with the bot)</i><br>2. Reply to the ride message with /updateride and new parameters<br>3. Use /updateride with ride ID directly after the command: <code>/updateride abc123</code><br>4. Use /updateride with ride ID as a parameter:<br>5. Use /airide with the ride ID to update via AI dialog (private chat only): <code>/airide #abc123</code></p>

<pre>
/updateride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link or "Label | URL" (repeat to replace the full route list) (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New average moving speed (optional)
cruisingSpeed: New cruising speed (optional)
info: Additional information (optional)
settings.notifyParticipation: yes/no (optional)
settings.allowReposts: yes/no (optional)
</pre>

<p>If you provide at least one <code>route:</code> line, it replaces the full route list. Use <code>route: -</code> to clear all routes.<br>Ride settings passed here are merged into the existing ride settings.</p>

<h3>❌ Cancelling a Ride</h3>

<p>Only the ride creator can cancel:<br>1. Reply to the ride message with /cancelride<br>2. Use /cancelride with ride ID directly after the command: <code>/cancelride abc123</code><br>3. Use /cancelride with ride ID as a parameter:</p>

<pre>
/cancelride
id: abc123
</pre>

<h3>↩️ Resuming a Cancelled Ride</h3>

<p>Only the ride creator can resume a cancelled ride:<br>1. Reply to the ride message with /resumeride<br>2. Use /resumeride with ride ID directly after the command: <code>/resumeride abc123</code><br>3. Use /resumeride with ride ID as a parameter:</p>

<pre>
/resumeride
id: abc123
</pre>

<h3>🗑 Deleting a Ride</h3>

<p>Only the ride creator can delete:<br>1. Reply to the ride message with /deleteride<br>2. Use /deleteride with ride ID directly after the command: <code>/deleteride abc123</code><br>3. Use /deleteride with ride ID as a parameter:</p>

<pre>
/deleteride
id: abc123
</pre>

<h3>🔄 Duplicating a Ride</h3>

<p>You can duplicate an existing ride in four ways:<br>1. Reply to the ride message with /dupride without any parameters to start an interactive wizard. <i>(Note: Wizard mode is only available in private chats with the bot)</i><br>2. Reply to the ride message with /dupride and new parameters<br>3. Use /dupride with ride ID directly after the command: <code>/dupride abc123</code><br>4. Use /dupride with ride ID and optional parameters:</p>

<pre>
/dupride
id: abc123
title: New title (optional)
when: New date/time (optional)
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: New meeting point (optional)
route: New route link or "Label | URL" (repeat to replace the copied route list) (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New average moving speed (optional)
cruisingSpeed: New cruising speed (optional)
info: Additional information (optional)
settings.notifyParticipation: yes/no (optional)
settings.allowReposts: yes/no (optional)
</pre>

<p>Any parameters not provided will be copied from the original ride.<br>By default, the new ride will be scheduled for tomorrow at the same time.<br>If you provide at least one <code>route:</code> line, it replaces the copied route list. Use <code>route: -</code> to clear all copied routes.<br>When duplicating your own ride, its ride settings are copied. When duplicating someone else's ride, your current defaults are used.</p>

<h3>📋 Listing Your Rides</h3>

<p>Use /listrides command to see all rides you've created:</p>

<ul><li>Rides are sorted by date (newest first)</li><li>Use navigation buttons to browse pages</li></ul>

<h3>🗓 Listing Your Planned Rides</h3>

<p>Use /planned in private chat to see rides where you are joined or thinking, starting with today:</p>

<ul><li>Rides are sorted by date (nearest first)</li><li>Today's rides remain visible after their start time</li><li>Each item shows your current participation status</li></ul>
    `.trim(),

    help3: `
<h2>⚙️ Ride Settings</h2>

<p>Use /settings in private chat to manage defaults for rides you create in the future.<br>Use /settings #rideId, reply to a ride message with /settings, or press the Settings button on your private creator copy to manage one ride.<br>Available settings:</p>

<ul><li>Participation notifications — whether the creator gets private notifications when people join, think, or pass.</li><li>Repost permission — whether users other than the creator can repost the ride with /shareride.</li></ul>

<p>Defaults apply only to newly created rides. Ride-specific settings affect only that ride.</p>

<h3>🧭 Private Creator Buttons</h3>

<p>In your private ride message, owner-only buttons let you edit, duplicate, delete, cancel/resume, list participants, and open settings without typing the full commands.</p>

<h3>📢 Sharing a Ride</h3>

<p>By default, only the ride creator can repost a ride to another chat. The creator can allow reposts by other users in /settings.<br>1. Go to the target chat where you want to post the ride<br>2. Use /shareride (or /shareride@botname) with the ride ID directly after the command: <code>/shareride@botname abc123</code><br>3. Or use /shareride (or /shareride@botname) with ride ID as a parameter:</p>

<pre>
/shareride@botname
id: abc123 (or #abc123)
</pre>

<p>The ride will be posted to the current chat and all instances will be synchronized when details change or participants join/leave.</p>

<p><b>Important:</b> The bot needs to be added to the other chat before sharing. Bot needs to be chat admin in the other chat to use the short form of /shareride, but you can always use the full form /shareride@botname.</p>

<h3>📎 Attaching a Group to a Ride</h3>

<p>Only the ride creator can attach a group:<br>1. Create a Telegram group and add the bot as admin (needs "Add Members" and "Ban Users" permissions)<br>2. Use /attach with the ride ID in the group chat: <code>/attach #abc123</code><br>The bot will rename the group to the ride title and date, post and pin the ride info, and automatically add/remove members as participants join or leave the ride.<br>One group can be attached to only one ride at a time.<br>To unlink the group, use /detach in the group chat.</p>

<h3>💬 Joining the Ride Group Chat</h3>

<p>Once a group is attached to a ride, the ride message shows a notice with instructions.<br>Any participant who has joined the ride can request an invite link by sending the bot a private message:<br><code>/joinchat #rideId</code><br>The bot will send you a single-use invite link (valid 24 hours). The command only works if you have joined the ride.</p>
    `.trim(),

    ride: `
<h3>🚲 {title}{cancelledBadge}</h3>
{rideDetails}
<p>🚴 {joinedLabel} ({participantCount}): {participants}{thinkingLine}{notInterestedLine}</p>
{groupChatBlock}{shareBlock}{footerBlock}{cancelledInstructions}
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
  },
  buttons: {
    mainMenuButtons: '☰ Buttons',
    mainMenuCreateWizard: '➕ Create with wizard',
    mainMenuCreateAi: '🤖 Create with AI',
    mainMenuCreatedRides: '📋 Created rides',
    mainMenuPlannedRides: '🗓 Planned rides',
    mainMenuSettings: '⚙️ Settings',
    mainMenuHelp: '❓ Help',
    join: "I'm in! 🚴",
    thinking: 'Maybe 🤔',
    pass: 'Pass 🙅',
    edit: 'Edit',
    duplicate: 'Duplicate',
    delete: 'Delete',
    cancelRide: 'Cancel',
    resumeRide: 'Resume',
    participants: 'Participants',
    settings: 'Settings',
    publish: 'Publication',
    confirmDelete: 'Yes, delete ❌',
    cancelDelete: 'No, keep it ✅',
    back: '⬅️ Back',
    skip: '⏩ Skip',
    cancel: '❌ Cancel',
    create: '✅ Create',
    update: '✅ Update',
    keep: '↩️ Keep current',
    close: '✖️ Close',
    previous: '◀️ Previous',
    next: 'Next ▶️',
    addToCalendar: '📅 Add to calendar',
    googleCalendar: 'Google Calendar',
    outlookCalendar: 'Outlook Calendar',
    downloadIcs: 'Apple / download .ics'
  },
  mainMenu: {
    placeholder: 'Choose an action',
    expandedPrompt: 'Choose an action:'
  },
  common: {
    greeting: 'Hello, {name}!',
    yes: 'Yes',
    no: 'No',
    onlyEn: 'Only English key'
  },
  errors: {
    generic: 'An error occurred.'
  },
  commands: {
    ownerActions: {
      settingsComingSoon: 'Ride settings are not available yet.'
    },
    publish: {
      introTitle: 'Publishing an announcement',
      introText: 'You can publish the announcement in any chat where the bot is present using <code>{command}</code>',
      publishedTitle: 'Announcement published in chats:',
      chooseDestination: 'Publish announcement to chats (last 5 publications):',
      publicationHint: 'Press a button below to publish the announcement in the selected chat. If the announcement is already there, the message will be duplicated.',
      notPublishedYet: 'This announcement has not been published anywhere yet.',
      noRecentPublications: 'You have not published any announcements yet.',
      threadLabel: 'Thread',
      destinationExpired: 'This destination is no longer available in your recent list.',
      unknownChat: 'Unknown chat',
      privateOnly: 'This menu is available only in a private chat with the bot.'
    },
    settings: {
      userTitle: 'Default settings for new rides',
      userHint: 'These defaults will be copied into each new ride you create.',
      notificationPreferencesTitle: 'Notification preferences',
      participationNotificationLevelLabel: 'Participation notifications',
      notificationPreferencesHint: 'This live preference applies to all your rides. Notifications can still be disabled for an individual ride.',
      notificationLevel: {
        all: 'All participation changes',
        membership: 'Joins and leaves only'
      },
      rideTitle: 'Ride settings',
      rideHint: 'These settings affect only this ride.',
      notifyParticipationLabel: 'Notify me when participation changes',
      allowRepostsLabel: 'Allow other users to repost with <code>/shareride</code>',
      enableNotifyOnParticipationChange: 'Enable participation notifications',
      disableNotifyOnParticipationChange: 'Disable participation notifications',
      enableReposts: 'Allow reposts',
      disableReposts: 'Forbid reposts',
      updated: 'Default settings updated.',
      rideUpdated: 'Ride settings updated.'
    },
    common: {
      rideNotFoundById: 'Ride #{id} not found',
      rideNotFoundByIdWithDot: 'Ride #{id} not found.',
      errorAccessingRideData: 'Error accessing ride data',
      unknownParameters: 'Unknown parameter(s): {params}',
      validParameters: 'Valid parameters are:',
      onlyCreatorAction: 'Only the ride creator can perform this action.',
      rideActionUpdatedMessages: 'Ride {action} successfully. Updated {count} message(s).',
      rideActionNoMessagesUpdated: 'Ride has been {action}, but no messages were updated. You may want to /shareride the ride in the chats of your choice again, they could have been removed.',
      removedUnavailableMessages: 'Removed {count} unavailable message(s).',
      actions: {
        cancelled: 'cancelled',
        resumed: 'resumed',
        updated: 'updated'
      },
      verbs: {
        cancel: 'cancel',
        resume: 'resume'
      }
    },
    update: {
      onlyCreator: 'Only the ride creator can update this ride.',
      messageUpdateError: 'Ride has been updated, but there was an error updating the ride message. You may need to create a new ride message.'
    },
    cancel: {
      alreadyCancelled: 'This ride is already cancelled.'
    },
    resume: {
      notCancelled: 'This ride is not cancelled.'
    },
    duplicate: {
      success: 'Ride duplicated successfully!'
    },
    listParticipants: {
      invalidRideIdUsage: 'Please provide a valid ride ID. Usage: /listparticipants rideID',
      allParticipantsTitle: 'All Participants for "{title}" ({total})',
      joinedLabel: 'Joined ({count})',
      thinkingLabel: 'Thinking ({count})',
      notInterestedLabel: 'Not interested ({count})',
      noOneJoinedYet: 'No one joined yet.',
      retrieveError: 'An error occurred while retrieving participants.'
    },
    share: {
      invalidRideIdUsage: 'Please provide a valid ride ID. Usage: /shareride rideID',
      onlyCreatorRepost: 'Only the ride creator can repost this ride.',
      cannotRepostCancelled: 'Cannot repost a cancelled ride.',
      alreadyPostedInChat: 'This ride is already posted in this chat{topicSuffix}.',
      announcementLimitCleanupFailed: 'The announcement limit for this chat or topic has been reached, and the oldest announcement could not be removed. The new announcement was not published.',
      topicSuffix: ' topic',
      failedToPostWithError: 'Failed to post ride: {error}',
      postingError: 'An error occurred while posting the ride.',
      botNotMemberOrBlocked: 'The bot is not a member of this chat or was blocked.',
      botNoPermission: 'The bot does not have permission to send messages in this chat.',
      failedToPost: 'Failed to post ride'
    },
    participation: {
      joinedSuccess: 'You have joined the ride!',
      thinkingSuccess: 'You are thinking about this ride',
      skippedSuccess: 'You have passed on this ride',
      rideNotFound: 'Ride not found',
      rideCancelled: 'This ride has been cancelled',
      updatedButMessageFailed: 'Your participation was updated, but message updates failed',
      genericError: 'An error occurred',
      alreadyInState: 'You are already {state} for this ride',
      states: {
        joined: 'joined',
        thinking: 'thinking',
        skipped: 'skipped'
      }
    },
    notifications: {
      joined: '🚴 <b>{name}</b> joined your ride "<b>{title}</b>"\n\n🔕 To stop notifications:\n<pre>/updateride #{rideId}\nsettings.notifyParticipation: no</pre>',
      thinking: '🤔 <b>{name}</b> is thinking about your ride "<b>{title}</b>"\n\n🔕 To stop notifications:\n<pre>/updateride #{rideId}\nsettings.notifyParticipation: no</pre>',
      skipped: '🙅 <b>{name}</b> declined your ride "<b>{title}</b>"\n\n🔕 To stop notifications:\n<pre>/updateride #{rideId}\nsettings.notifyParticipation: no</pre>'
    },
    stateChange: {
      onlyCreator: 'Only the ride creator can {action} this ride.',
      messageUpdateError: 'Ride has been {action}, but there was an error updating the ride message. You may need to create a new ride message.'
    },
    group: {
      notInGroup: 'This command must be used in a group chat.',
      notSupergroup: 'This command requires a supergroup. To convert this group, enable "Chat history for new members" in the group settings — Telegram will upgrade it to a supergroup automatically. Then retry: <code>{command}</code>',
      rideNotFound: 'Ride not found.',
      notCreator: 'Only the ride creator can perform this action.',
      alreadyAttached: 'This ride already has a group attached. Use /detach first.',
      groupAlreadyAttachedToAnotherRide: 'This group is already attached to another ride. Use /detach first.',
      botNotAdmin: 'The bot is not an admin in this group. Please make it an admin and try again.',
      botNeedsAddMembersPermission: 'The bot needs the "Add Members" admin permission. Please update the bot\'s permissions and try again.',
      attachSuccess: 'Group attached successfully! Participants will be automatically added when they join the ride.',
      detachSuccess: 'Group detached. Participants will no longer be auto-added.',
      noGroupAttached: 'No ride is attached to this group.',
      inviteLinkSent: 'You\'ve been invited to the ride group: {link}\n\nThis group is for ride coordination, pre- and post-ride discussion, and sharing photos. The link is valid for 24 hours.',
      inviteLinkForCreator: 'A participant couldn\'t receive the group invite link automatically — they haven\'t started a conversation with the bot. Please forward this link to them manually: {link}',
      invalidRideIdUsage: 'Please provide a valid ride ID. Usage: {command}',
      joinchatNoGroup: 'This ride doesn\'t have an attached group chat.',
      joinchatNotParticipant: 'You need to join the ride first.',
      chatTitle: 'Ride: {title} @ {date}'
    },
    delete: {
      onlyCreator: 'Only the ride creator can delete this ride.',
      cancelled: 'Deletion cancelled.',
      notFound: 'Ride not found.',
      success: 'Ride deleted successfully.',
      failed: 'Failed to delete ride.',
      deletedMessages: 'Deleted {count} message(s).',
      removedMessages: 'Removed {count} unavailable message(s).'
    },
    airide: {
      usageHint: 'Use /airide to create a ride in dialog mode.\nTo update an existing ride: /airide #rideId',
      sessionAlreadyActive: 'You already have an active AI ride session. Please confirm or cancel it first.',
      sessionExpired: 'Session expired. Please use /airide again.',
      parseError: '❌ Could not parse ride details. Please try again with a clearer description.',
      cancelled: 'Ride creation cancelled.',
      confirmButton: '✅ Confirm',
      dialogPrompt: '🗒 Describe the ride: title, date and time, route link(s), distance and expected duration, average speed, meeting point, and any other details.',
      dialogUpdatePrompt: '🗒 What would you like to change?',
      dialogLimitReached: '⚠️ Message limit reached. Please confirm or cancel.',
      missingFieldsError: 'Missing required fields: {fields}. Please add them in a message.'
    },
    fromStrava: {
      invalidUrl: 'Please provide a valid Strava group event URL.\nExample: /fromstrava https://www.strava.com/clubs/123/group_events/456',
      fetchError: 'Could not fetch the Strava event. Make sure the event is public and the URL is correct.',
      created: 'Ride created from Strava event.',
      updated: 'Ride updated from Strava event.'
    },
    calendar: {
      menuPrompt: '📅 Add “{title}” to your calendar:',
      sentPrivately: 'Calendar options sent in a private message.',
      openPrivateChat: 'Open the bot to get calendar options.',
      fileCaption: 'Calendar event for “{title}”',
      fileSent: 'Calendar file sent privately.',
      privateOnly: 'This calendar menu can only be closed in a private chat.',
      rideNotFound: 'This ride no longer exists.',
      invalidRide: 'This calendar request is invalid.',
      cancelled: 'A cancelled ride cannot be added to a calendar.',
      missingDuration: 'The ride duration is invalid and cannot be exported to a calendar.',
      past: 'A past ride cannot be added to a calendar.'
    }
  },
  formatter: {
    truncateMarker: '\n\n... (message truncated due to length)',
    noParticipantsYet: 'No participants yet',
    noOneJoinedYet: 'No one joined yet',
    atWord: 'at',
    routeLinkLabel: 'Link',
    noCreatedRides: 'You have not created any rides yet.',
    yourRidesTitle: 'The Rides You Created',
    noPlannedRides: 'You have no planned rides.',
    plannedRidesTitle: 'Your Planned Rides',
    participationStatus: {
      joined: '🙋 Joined',
      thinking: '🤔 Thinking'
    },
    postedInSingleChat: 'Posted in {count} chat',
    postedInMultipleChats: 'Posted in {count} chats',
    notPostedInAnyChats: 'Not posted in any chats',
    pageLabel: 'Page {page}/{totalPages}',
    andMoreParticipants: '{displayedList} and {count} more',
    upToSpeed: 'up to {max} km/h',
    shareLine: 'Share this ride: <code>/shareride #{id}</code>',
    groupChatLine: '<blockquote>Join the ride\'s private group chat: send <code>/joinchat #{id}</code> to the bot in private messages (only works if you have joined the ride).</blockquote>',
    labels: {
      when: 'When',
      category: 'Category',
      organizer: 'Organizer',
      meetingPoint: 'Meeting point',
      route: 'Route',
      distance: 'Distance',
      duration: 'Duration',
      speed: 'Average moving speed',
      cruisingSpeed: 'Cruising speed',
      additionalInfo: 'Additional info'
    },
    participation: {
      joined: 'Joined',
      thinking: 'Thinking',
      notInterested: 'Not interested'
    },
    units: {
      km: 'km',
      min: 'min',
      hour: 'h',
      kmh: 'km/h'
    }
  },
  categories: {
    regularMixed: 'Regular/Mixed Ride',
    road: 'Road Ride',
    gravel: 'Gravel Ride',
    mountainEnduroDownhill: 'Mountain/Enduro/Downhill Ride',
    mtbXc: 'MTB-XC Ride',
    eBike: 'E-Bike Ride',
    virtualIndoor: 'Virtual/Indoor Ride'
  },
  parsers: {
    date: {
      invalidFormat: "❌ I couldn't understand that date/time format. Please try something like:\n• tomorrow at 6pm\n• in 2 hours\n• this saturday 10am\n• 21 Jul 14:30",
      timezoneNote: 'Note: Times are interpreted in the {timezone} timezone.',
      pastDate: "❌ The ride can't be scheduled in the past! Please provide a future date and time."
    },
    duration: {
      invalidFormat: "❌ I couldn't understand that duration format. Please try something like:\n• 90 (for 90 minutes)\n• 2h (for 2 hours)\n• 2h 30m (for 2 hours and 30 minutes)\n• 1.5h (for 1 hour and 30 minutes)"
    }
  },
  wizard: {
    messages: {
      completeOrCancelCurrent: 'Please complete or cancel the current ride creation wizard before starting a new one.',
      privateChatOnlyReply: '⚠️ Wizard commands are only available in private chats with the bot. Please use the command with parameters instead.',
      privateChatOnlyCallback: '⚠️ Wizard commands are only available in private chats with the bot',
      sessionExpired: 'Wizard session expired',
      invalidCategory: 'Invalid category selected',
      creationCancelled: 'Ride creation cancelled',
      updateCancelled: 'Ride editing cancelled',
      duplicationCancelled: 'Ride duplication cancelled',
      updatedSuccessfully: 'Ride updated successfully!',
      duplicatedSuccessfully: 'Ride duplicated successfully!',
      createdSuccessfully: 'Ride created successfully!',
      errorWithMessage: 'Error: {message}',
      currentValue: 'Current value'
    },
    prompts: {
      title: '🚲 Please enter the ride title:',
      category: '🚵 Please select the ride category:',
      organizer: '👤 Who is organizing this ride?\n<i>Enter a dash (-) to clear/skip this field</i>',
      date: '📅 When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• this saturday 10am\n• 21 Jul 14:30',
      route: '🗺️ Please enter the route link (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      distance: '📏 Please enter the distance in kilometers (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      duration: '⏱ Please enter the duration (e.g., \"2h 30m\", \"90m\", \"1.5h\"):\n<i>Enter a dash (-) to clear/skip this field</i>',
      speed: '⚡ Average moving speed in km/h or skip:\nThe average over the full route while moving, excluding stops; it includes climbs, descents, turns, and slow sections.\n• 25-28 — range\n• 25+ or 25- — minimum\n• -28 — maximum\n• 25 or ~25 — average\n<i>Enter a dash (-) to clear/skip this field</i>',
      cruisingSpeed: '🛣️ Cruising speed in km/h or skip:\nThe speed the group normally holds while riding on flat, fast sections.\n• 25-28 — range\n• 25+ or 25- — minimum\n• -28 — maximum\n• 25 or ~25 — average\n<i>Enter a dash (-) to clear/skip this field</i>',
      meet: '📍 Please enter the meeting point (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      info: 'ℹ️ Please enter any additional information (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      notify: '🔔 Notify you when participants join or leave?\n<i>You can change this later by updating the ride.</i>'
    },
    validation: {
      titleRequired: 'Title cannot be empty',
      routeInvalid: 'Invalid route URL format. Please provide a valid URL, use a dash (-) to clear the field, or click Skip.',
      distanceInvalid: 'Please enter a valid number for distance, or use a dash (-) to clear the field.',
      speedInvalid: 'Please enter a valid average moving speed (for example 25-28, 25+, -28, or ~25).',
      cruisingSpeedInvalid: 'Please enter a valid cruising speed (for example 25-28, 25+, -28, or ~25).'
    },
    confirm: {
      confirmPrompt: '👆 Review the preview above and confirm'
    },
    preview: {
      placeholder: '🚲 <b>Ride preview</b>\n\n<i>Fill in the details and the preview will appear here.</i>'
    }
  },
  services: {
    ride: {
      pleaseProvideTitleAndDate: 'Please provide at least title and date/time.',
      errorCreatingRide: 'An error occurred while creating the ride.',
      errorUpdatingRide: 'An error occurred while updating the ride.',
      originalRideNotFound: 'Original ride not found'
    },
    rideMessages: {
      couldNotFindRideIdInMessage: 'Could not find ride ID in the message. Please make sure you are replying to a ride message or provide a ride ID.',
      provideRideIdAfterCommand: 'Please provide a ride ID after the command (e.g., /{commandName} rideID) or reply to a ride message.'
    }
  },
  params: {
    title: 'Title of the ride',
    category: 'Ride category',
    organizer: 'Ride organizer name',
    when: 'Date and time of the ride',
    meet: 'Meeting point',
    route: 'Route URL',
    dist: 'Distance in kilometers',
    duration: 'Duration in minutes',
    speed: 'Average moving speed: range (25-28), min (25+), max (-28), average (25)',
    cruisingSpeed: 'Cruising speed: range (25-28), min (25+), max (-28), average (25)',
    validation: {
      speedInvalid: 'Invalid average moving speed. Use 25-28, 25+, -28, or ~25.',
      cruisingSpeedInvalid: 'Invalid cruising speed. Use 25-28, 25+, -28, or ~25.'
    },
    info: 'Additional information',
    settingsNotifyParticipation: 'Ride setting: notify on participation changes (yes/no)',
    settingsAllowReposts: 'Ride setting: allow other users to repost with /shareride (yes/no)',
    id: 'Ride ID (for commands that need it)'
  },
  utils: {
    routeParser: {
      invalidUrl: 'Invalid URL format. Please provide a valid URL.'
    }
  },
  bot: {
    commandDescriptions: {
      start: 'Start the bot and get welcome information',
      help: 'Show help information about commands',
      newride: 'Create a new ride',
      updateride: 'Update an existing ride',
      cancelride: 'Cancel a ride',
      deleteride: 'Delete a ride',
      listrides: 'List all your rides',
      planned: 'List rides you plan to attend',
      listparticipants: 'List all participants for a ride',
      dupride: 'Duplicate an existing ride',
      resumeride: 'Resume a cancelled ride',
      shareride: 'Share a ride in a chat',
      attach: 'Attach a Telegram group to a ride',
      detach: 'Detach the Telegram group from its ride',
      airide: 'Create or update a ride using AI',
      joinchat: 'Join the private group chat for a ride',
      fromstrava: 'Create or update a ride from a Strava event',
      settings: 'Manage ride settings and defaults'
    }
  }
};
