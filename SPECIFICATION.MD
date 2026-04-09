# Codebase Analysis: Bike Ride Organizer Bot (Chantbot)

## Overview

This is a **Telegram bot for organizing bike rides** across multiple chats. The bot allows users to create, manage, and participate in bike ride events with synchronized updates across different chat groups.

---

## Architecture

### **High-Level Structure**

The codebase follows a clean, layered architecture:

```
┌─────────────────────────────────────────┐
│         Telegram Bot (Grammy)           │
│         /src/core/Bot.js                │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│  Commands   │  │   Wizard    │
│  Handlers   │  │  (UI Flow)  │
└──────┬──────┘  └──────┬──────┘
       │                │
       └───────┬────────┘
               │
    ┌──────────▼───────────┐
    │      Services        │
    │  - RideService       │
    │  - RideMessagesService│
    └──────────┬───────────┘
               │
    ┌──────────▼───────────┐
    │   Storage Layer      │
    │  - MongoDB (prod)    │
    │  - Memory (dev)      │
    └──────────────────────┘
```

---

## Core Components

### **1. Entry Point ([/src/index.js](cci:7://file:///workspace/src/index.js:0:0-0:0))**
- Initializes storage (MongoDB for production, in-memory for development)
- Creates and starts the Bot instance
- Simple and clean entry point

### **2. Bot Core ([/src/core/Bot.js](cci:7://file:///workspace/src/core/Bot.js:0:0-0:0))**
- **Responsibilities:**
  - Initializes Grammy bot with token
  - Sets up all command handlers and middleware using centralized configuration
  - Manages webhook vs polling modes
  - Coordinates all components (services, handlers, wizard)
  
- **Key Features:**
  - **Configuration-driven architecture**: Commands and handlers defined declaratively in `botConfig`
  - **Command categorization**: Commands organized into `privateOnly`, `publicOnly`, and `mixed` categories
  - **Declarative callback setup**: Callback handlers configured with pattern matching
  - Webhook support for production deployment
  - Thread/topic support via middleware
  - Private chat mode enforcement (except `/shareride` in groups)

### **3. Storage Layer ([/src/storage/](cci:7://file:///workspace/src/storage:0:0-0:0))**

**Interface-based design** with two implementations:

- **[interface.js](cci:7://file:///workspace/src/storage/interface.js:0:0-0:0)**: Defines the contract for storage operations
- **[mongodb.js](cci:7://file:///workspace/src/storage/mongodb.js:0:0-0:0)**: Production storage using MongoDB/Mongoose
- **[memory.js](cci:7://file:///workspace/src/storage/workspace/src/storage/memory.js:0:0-0:0)**: Development storage using in-memory Map

**Data Models:**
- **Ride**: Core entity with title, date, category, route, participation states, messages, and optional `groupId` (Telegram chat ID of an attached group)
- **Participant**: User info (userId, username, firstName, lastName, createdAt)
- **Participation**: User participation states (joined, thinking, skipped) for each ride with three participation options: "I'm in", "Thinking", "Pass"
- **Message**: Tracks where ride announcements are posted (chatId, messageId, messageThreadId)

**Schema Versioning:**
- Database migrations supported for MongoDB
- Schema version tracking in `meta` collection as `{schemaVersion: X}`
- Migration system with versioned updates and batch processing

### **4. Services ([/src/services/](cci:7://file:///workspace/src/services:0:0-0:0))**

#### **RideService** ([RideService.js](cci:7://file:///workspace/src/services/RideService.js:0:0-0:0))
- **Core business logic** for rides
- CRUD operations: create, update, delete, get rides
- Participant management: join/leave rides
- Cancel/resume rides
- Parse parameters and create rides from user input
- Handles route parsing, date parsing, duration parsing

#### **GroupManagementService** ([GroupManagementService.js](cci:7://file:///workspace/src/services/GroupManagementService.js:0:0-0:0))
- **Group membership sync** for attached Telegram groups
- `addParticipant(api, groupId, userId, language)`: unbans the user (so previously-kicked users can re-join), then creates a single-use 24-hour invite link and DMs it to the user; silently skips for group owner; logs and swallows other errors
- `removeParticipant(api, groupId, userId)`: bans the user so they cannot re-enter until they re-join the ride; logs and swallows errors

#### **RideMessagesService** ([RideMessagesService.js](cci:7://file:///workspace/src/services/RideMessagesService.js:0:0-0:0))
- **Message synchronization** across multiple chats
- Extract ride ID from messages (reply, inline, parameter)
- Create ride messages with keyboards
- Update all instances of a ride message across chats
- Clean up unavailable messages (deleted, bot kicked)

### **5. Command Handlers ([/src/commands/](cci:7://file:///workspace/src/commands:0:0-0:0))**

All handlers extend **[BaseCommandHandler](cci:2://file:///workspace/src/commands/BaseCommandHandler.js:5:0-102:1)** which provides:
- Ride extraction and validation
- Creator permission checking
- Parameter parsing with validation
- Message update coordination

**Command Handlers:**
- **NewRideCommandHandler**: Create new rides (wizard or parameters)
- **UpdateRideCommandHandler**: Update existing rides
- **CancelRideCommandHandler**: Cancel rides
- **ResumeRideCommandHandler**: Resume cancelled rides
- **DeleteRideCommandHandler**: Delete rides with confirmation
- **DuplicateRideCommandHandler**: Duplicate rides with modifications
- **ShareRideCommandHandler**: Share rides to other chats
- **ListRidesCommandHandler**: Paginated list of user's rides
- **ListParticipantsCommandHandler**: List all participants for a specific ride (shows all without truncation, organized by participation state)
- **ParticipationHandlers**: Join/thinking/pass ride functionality; triggers group membership sync via `GroupManagementService` when a group is attached to the ride
- **GroupCommandHandler**: `/attach #rideId` (links a group to a ride, posts and pins the ride message, adds existing participants, updates all existing ride messages), `/detach` (unlinks the group, updates all existing ride messages), and `/joinchat #rideId` (private-only: sends an invite link to the ride's group chat if the user has joined the ride); attach/detach are group-chat-only
- **StartCommandHandler**: Welcome message
- **HelpCommandHandler**: Multi-page help system
- **FromStravaCommandHandler**: Import or update a ride from a Strava club event URL; uses `StravaEventParser` to fetch event data and maps it to ride fields; repeated calls with the same URL by the same user update the existing ride

### **6. Wizard ([/src/wizard/RideWizard.js](cci:7://file:///workspace/src/wizard/RideWizard.js:0:0-0:0))**

**Interactive step-by-step UI** for creating/updating rides:
- State management per user+chat
- Steps: title → category → organizer → date → route → distance → duration → speed → meeting point → info → confirm
- Features:
  - Back/Skip/Keep/Cancel buttons
  - Current value display
  - Auto-parsing route info (distance/duration)
  - Admin permission checks
  - Error message cleanup
  - Can be restricted to private chats only

### **7. Formatters ([/src/formatters/MessageFormatter.js](cci:7://file:///workspace/src/formatters/MessageFormatter.js:0:0-0:0))**

- **Formats ride messages** with proper HTML escaping
- Creates inline keyboards (Join/Thinking/Pass buttons)
- Formats ride lists with pagination
- Handles date/time formatting with timezone support
- **Share line for creators**: Shows "Share this ride: `/shareride #ID`" for ride creators in private chats
- **Group chat line**: When a group is attached to a ride (`ride.groupId` is set), shows a notice with `/joinchat #ID` instructions in all ride messages; line is absent (no extra whitespace) when no group is attached
- Groups ride details logically

### **8. Utilities ([/src/utils/](cci:7://file:///workspace/src/utils:0:0-0:0))**

- **[FieldProcessor.js](cci:7://file:///workspace/src/utils/FieldProcessor.js:0:0-0:0)**: Centralized field processing and validation for ride parameters
- **[RideParamsHelper.js](cci:7://file:///workspace/src/utils/RideParamsHelper.js:0:0-0:0)**: Parse multi-line command parameters
- **[route-parser.js](cci:7://file:///workspace/src/utils/workspace/src/utils/route-parser.js:0:0-0:0)**: Parse routes from Strava, RideWithGPS, Komoot
- **[strava-event-parser.js](cci:7://file:///workspace/src/utils/strava-event-parser.js:0:0-0:0)**: Fetch and map Strava group events to ride fields; handles URL parsing, API calls, pace groups, and route enrichment
- **[date-input-parser.js](cci:7://file:///workspace/src/utils/workspace/src/utils/date-input-parser.js:0:0-0:0)**: Natural language date parsing (chrono-node)
- **[date-parser.js](cci:7://file:///workspace/src/utils/workspace/src/utils/date-parser.js:0:0-0:0)**: Format dates with timezone support
- **[duration-parser.js](cci:7://file:///workspace/src/utils/workspace/src/utils/duration-parser.js:0:0-0:0)**: Parse human-readable durations (2h 30m, 90m, 1.5h)
- **[category-utils.js](cci:7://file:///workspace/src/utils/workspace/src/utils/category-utils.js:0:0-0:0)**: Normalize ride categories
- **[html-escape.js](cci:7://file:///workspace/src/utils/workspace/src/utils/html-escape.js:0:0-0:0)**: Escape HTML for Telegram messages

---

## Key Features

### **Multi-Chat Synchronization**
- Create a ride in one chat, post to multiple chats
- All instances stay synchronized
- Join/leave updates appear everywhere
- Changes and cancellations sync automatically

### **Flexible Command Interface**
1. **Wizard Mode**: Interactive step-by-step (beginner-friendly)
2. **Parameter Mode**: Multi-line commands (power users)

Example parameter mode:
```
/newride
title: Evening Ride
when: tomorrow at 6pm
category: Road Ride
meet: Bike Shop
route: https://strava.com/routes/123
dist: 35
duration: 2h 30m
speed: 25-28
info: Bring lights
```

### **Ride ID Reference Methods**
- Reply to ride message
- Pass ID after command: `/updateride abc123`
- Pass ID with #: `/updateride #abc123`
- Use `id:` parameter in multi-line commands

### **Route Parsing**
- Supports Strava, RideWithGPS, Komoot
- Auto-extracts distance and duration when available

### **Natural Language Date Input**
- "tomorrow at 6pm"
- "next saturday 10am"
- "in 2 hours"
- "21 Jul 14:30"

### **Ride Categories**
- Regular/Mixed Ride (default)
- Road Ride
- Gravel Ride
- Mountain/Enduro/Downhill Ride
- MTB-XC Ride
- E-Bike Ride
- Virtual/Indoor Ride

---

## Configuration ([/src/config.js](cci:7://file:///workspace/src/config.js:0:0-0:0))

**Environment Variables:**
- `BOT_TOKEN`: Telegram bot token
- `NODE_ENV`: development/production
- `USE_WEBHOOK`: Enable webhook mode (vs polling)
- `WEBHOOK_DOMAIN`: Public domain for webhooks
- `WEBHOOK_PORT`: Port for webhook server (default: 8080)
- `MONGODB_URI`: MongoDB connection string
- `DEFAULT_TIMEZONE`: Timezone for date/time display
- `MAX_PARTICIPANTS_DISPLAY`: Maximum number of participants to show before displaying "and X more" (default: 20)

**Message Templates:**
- Start message
- Help messages (multi-page)
- Ride announcement template
- Button labels

---

## Data Flow Examples

### **Creating a Ride**
1. User sends `/newride` → [NewRideCommandHandler](cci:2://file:///workspace/src/commands/NewRideCommandHandler.js:5:0-55:1)
2. Handler checks for parameters or starts wizard
3. Wizard collects data step-by-step
4. On confirm: [RideService.createRide()](cci:1://file:///workspace/src/services/RideService.js:18:2-25:3) → Storage
5. [RideMessagesService.createRideMessage()](cci:1://file:///workspace/src/services/RideMessagesService.js:60:2-114:3) posts to chat
6. Message info stored in ride's `messages` array

### **Joining a Ride**
1. User clicks "I'm in!" button → `ParticipationHandlers.handleJoinRide()`
2. Extract ride ID from callback data
3. [RideService.setParticipation()](cci:1://file:///workspace/src/services/RideService.js:71:2-80:3) adds participant to storage
4. [RideMessagesService.updateRideMessages()](cci:1://file:///workspace/src/services/RideMessagesService.js:116:2-204:3) updates ALL instances
5. All chats see updated participant list

### **Updating a Ride**
1. User replies to ride with `/updateride` → `UpdateRideCommandHandler`
2. Extract ride ID from replied message
3. Validate user is creator
4. Start wizard or parse parameters
5. [RideService.updateRide()](cci:1://file:///workspace/src/services/RideService.js:27:2-40:3) updates storage
6. [RideMessagesService.updateRideMessages()](cci:1://file:///workspace/src/services/RideMessagesService.js:116:2-204:3) syncs all chats

---

## Testing

The project uses a layered Jest strategy with clear local/CI execution modes.

Coverage includes:
- Command handlers
- Core bot setup and webhook/polling flows
- Services (`RideService`, `RideMessagesService`)
- Storage (`memory`, `mongodb`)
- Wizard flows and field configuration
- Utilities (date/route/params/duration/html/category)
- Integration tests for main user flows
- Separate full Telegram E2E smoke coverage for real-platform verification

Test scripts:
- `npm test`: run full suite in a single pass
- `npm run test:basic`: run full suite except MongoMemoryServer tests
- `npm run test:mongo`: run MongoMemoryServer suite only
- `npm run test:coverage`: full-suite coverage with thresholds
- `npm run test:coverage:basic`: coverage for non-Mongo suite
- `npm run e2e:bootstrap-session`: create or refresh the real Telegram user session for E2E
- `npm run e2e:telegram`: run the manual real Telegram smoke test

Runner helper:
- `./run-tests.sh --mode all|basic|mongo [--coverage]`
- Default mode is `all`

Quality gates:
- Jest global coverage thresholds are enforced (`statements/lines/functions/branches`).
- CI runs the full suite on pull requests and pushes to `main`.
- No nightly-only test dependency; regression coverage is part of standard CI signal.
- Full Telegram E2E smoke tests are intentionally excluded from the default CI signal and are run manually.
- Even though they are manual, they are part of the maintained testing strategy and should be updated when real Telegram behavior changes.

Testing approach:
- Recent refactor reduced implementation-coupled assertions and favors behavior checks:
  - user-visible replies and outcomes
  - state transitions and persistence effects
  - multi-chat propagation side effects
- Test taxonomy and conventions are documented in [`docs/testing-conventions.md`](docs/testing-conventions.md).
- Real Telegram E2E setup and usage are documented in [`e2e/README.md`](e2e/README.md).

---

## Deployment

### **Development**
```bash
npm run dev  # Uses polling + in-memory storage
```

### **Production**
```bash
docker-compose up -d -e USE_WEBHOOK='true'  # Uses webhooks + MongoDB
```

**Requirements:**
- HTTPS domain for webhooks
- Reverse proxy (Nginx/Caddy) for SSL termination
- MongoDB instance

---

## Code Quality Observations

### **Strengths:**
✅ Clean separation of concerns (commands, services, storage)  
✅ Interface-based storage design (easy to swap implementations)  
✅ Comprehensive error handling  
✅ Well-tested with good coverage  
✅ Consistent code style  
✅ Good use of async/await  
✅ Proper HTML escaping for security  
✅ Multi-chat synchronization is robust  

### **Potential Refactoring Areas:**
_No major refactoring areas identified at this time. The codebase is well-organized and maintainable._

## Future Enhancements

### High Priority
- [x] Feature: (Translations) Add Russian language support and set the bot's default language through environment variables.
- [x] Feature: (Commands) Rename /postride to /shareride.
- [x] Documentation: Improve /start message to simplify onboarding
- [x] Feature: (Ride participation) List participants on the same line after the label, separated by commas.
- [x] Feature: (Ride participation) Add an "I am thinking" option to indicate who might join the chat.
- [x] Feature: (Ride participation) Add an "Not interested" option to gather responses from those who will not join the ride.
- [x] Feature: (Ride participation) Limit the ride message to display only the first N registered participants (configurable via MAX_PARTICIPANTS_DISPLAY), and if there are more, show a label like "and X more".
- [x] Bug: Correct dates recognition in differfent languages
- [x] Enhancement: Clarify average speed vs minspeed vs pace
- [x] Feature: Creating a dedicated ride chat (attach/detach an existing group via `/attach #rideId` / `/detach`; participants auto-added via invite link, auto-removed on leave)
- [X] Feature: Creating rides with AI
- [x] Feature: Creating ride from Strava event
- [x] Enhancement: Show preview in wizard starting from the first step and update it along with each next step

### Medium Priority
- [x] Bug/Enhancement: Fixed routes parsing from known providers and add Garmin
- [ ] Feature: (Rides management) Add management buttons below the ride button in private chat with the bot for ride creator
- [ ] Feature: (Notifications) Send a private notification to the ride creator when a participant joins or leaves. There is a 30-second delay to prevent spamming from frequent toggling: one final notification for all changes per user with <=30 sec between the last and previous ones; if the participant's status changes again within this period, cancel the pending notification
- [ ] Feature: (Notifications) Remind the joined users about upcoming ride 24 hours and 1 hour before the ride (send a private message; give each user an option to unsubscribe from all notifications). Remind thinking that they must finilize their decision 1 hour before the ride
- [ ] Feature: (Ride sharing) Optionally enable everyone to repost the ride via an additional field during ride creation or update
- [ ] Enhancement: Allow attaching multiple track links to different services (explicitely labeling Komoot, Strava, Garmin, RideWithGPS)
- [ ] Feature: (Notifications) Sending messages to all participants who joined the ride or thinking (either one category or both together) via bot command

### Low Priority
- [x] Bug: Better testing and fixes of setting nummeric ride attributes, like setting interval 22-25 and updating with a single value (29) gives 29-25
- [x] Documentation: Update readme for installation via Docker
- [x] Bug: Resolve multiple mongoDB instances/connections
- [ ] Feature: (Translations) Override the bot's default language based on the user's preference (the bot communicates with the user in their chosen language; it also announces the user's rides, created by them, in the preferred language).
- [ ] Feature: (Ride participation) Add a comand to list joined rides for the current user
- [ ] Feature: Add keyboard shortcut to keep the current value

### Under Considiration
- [ ] Enhancement: show the list of declined people in the main messages
- [ ] Ride web-page for sharing by link

---

## Summary

This is a **well-architected Telegram bot** with:
- Clean layered architecture following service/repository patterns
- Flexible command interface (wizard + parameters)
- Robust multi-chat synchronization
- Comprehensive feature set for bike ride organization
- Good test coverage
- Production-ready deployment options

The codebase is **maintainable and extensible**, making it suitable for adding new features or refactoring specific components.
