export const en = {
  templates: {
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
when: Date and time (e.g., "tomorrow at 6pm", "this saturday 10am", "21 Jul 14:30")
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
duration: Duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: Speed in km/h: range (25-28), min (25+ or 25-), max (-28), avg (25 or ~25) (optional)
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
speed: New speed (optional)
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
speed: New speed (optional)
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
🚴 {joinedLabel} ({participantCount}): {participants}
🤔 {thinkingLabel} ({thinkingCount}): {thinking}
🙅 {notInterestedLabel}: {notInterestedCount}

{shareLine}🎫 #Ride #{id}{cancelledInstructions}
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
    join: "I'm in! 🚴",
    thinking: 'Maybe 🤔',
    pass: 'Pass 🙅',
    confirmDelete: 'Yes, delete ❌',
    cancelDelete: 'No, keep it ✅',
    back: '⬅️ Back',
    skip: '⏩ Skip',
    cancel: '❌ Cancel',
    create: '✅ Create',
    update: '✅ Update',
    keep: '↩️ Keep current',
    previous: '◀️ Previous',
    next: 'Next ▶️'
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
    stateChange: {
      onlyCreator: 'Only the ride creator can {action} this ride.',
      messageUpdateError: 'Ride has been {action}, but there was an error updating the ride message. You may need to create a new ride message.'
    },
    delete: {
      onlyCreator: 'Only the ride creator can delete this ride.',
      cancelledMessage: 'Deletion cancelled.',
      cancelledCallback: 'Deletion cancelled',
      notFoundMessage: 'Ride not found.',
      notFoundCallback: 'Ride not found',
      successMessage: 'Ride deleted successfully.',
      successCallback: 'Ride deleted successfully',
      failedMessage: 'Failed to delete ride.',
      failedCallback: 'Failed to delete ride',
      deletedMessages: 'Deleted {count} message(s).',
      removedMessages: 'Removed {count} unavailable message(s).'
    }
  },
  formatter: {
    truncateMarker: '\n\n... (message truncated due to length)',
    noParticipantsYet: 'No participants yet',
    noOneJoinedYet: 'No one joined yet',
    atWord: 'at',
    routeLinkLabel: 'Link',
    noCreatedRides: 'You have not created any rides yet.',
    yourRidesTitle: 'Your Rides',
    postedInSingleChat: 'Posted in {count} chat',
    postedInMultipleChats: 'Posted in {count} chats',
    notPostedInAnyChats: 'Not posted in any chats',
    pageLabel: 'Page {page}/{totalPages}',
    andMoreParticipants: '{displayedList} and {count} more',
    upToSpeed: 'up to {max} km/h',
    shareLine: 'Share this ride: <code>/shareride #{id}</code>',
    labels: {
      when: 'When',
      category: 'Category',
      organizer: 'Organizer',
      meetingPoint: 'Meeting point',
      route: 'Route',
      distance: 'Distance',
      duration: 'Duration',
      speed: 'Avg speed',
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
      updatedSuccessfully: 'Ride updated successfully!',
      duplicatedSuccessfully: 'Ride duplicated successfully!',
      createdSuccessfully: 'Ride created successfully!',
      errorWithMessage: 'Error: {message}',
      currentValue: 'Current value'
    },
    prompts: {
      title: '📝 Please enter the ride title:',
      category: '🚲 Please select the ride category:',
      organizer: '👤 Who is organizing this ride?\n<i>Enter a dash (-) to clear/skip this field</i>',
      date: '📅 When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• this saturday 10am\n• 21 Jul 14:30',
      route: '🔗 Please enter the route link (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      distance: '📏 Please enter the distance in kilometers (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      duration: '⏱ Please enter the duration (e.g., \"2h 30m\", \"90m\", \"1.5h\"):\n<i>Enter a dash (-) to clear/skip this field</i>',
      speed: '🚴 Avg speed in km/h or skip:\n• 25-28 — range\n• 25+ or 25- — minimum\n• -28 — maximum\n• 25 or ~25 — average\n<i>Enter a dash (-) to clear/skip this field</i>',
      meet: '📍 Please enter the meeting point (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>',
      info: 'ℹ️ Please enter any additional information (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>'
    },
    validation: {
      titleRequired: 'Title cannot be empty',
      routeInvalid: 'Invalid route URL format. Please provide a valid URL, use a dash (-) to clear the field, or click Skip.',
      distanceInvalid: 'Please enter a valid number for distance, or use a dash (-) to clear the field.'
    },
    confirm: {
      header: 'Please confirm the {action} details:',
      updateAction: 'update',
      rideAction: 'ride',
      labels: {
        title: '📝 Title',
        category: '🚲 Category',
        organizer: '👤 Organizer',
        when: '📅 When',
        route: '🔗 Route',
        distance: '📏 Distance',
        duration: '⏱ Duration',
        speed: '🚴 Avg speed',
        meetingPoint: '📍 Meeting Point',
        additionalInfo: 'ℹ️ Additional Info'
      }
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
    speed: 'Speed: range (25-28), min (25+), max (-28), avg (25)',
    info: 'Additional information',
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
      listparticipants: 'List all participants for a ride',
      dupride: 'Duplicate an existing ride',
      resumeride: 'Resume a cancelled ride',
      shareride: 'Share a ride in a chat'
    }
  }
};
