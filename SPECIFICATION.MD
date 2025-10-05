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
- **Ride**: Core entity with title, date, category, route, participation states, messages
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
- **ParticipationHandlers**: Join/thinking/pass ride functionality
- **StartCommandHandler**: Welcome message
- **HelpCommandHandler**: Multi-page help system

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
- Groups ride details logically

### **8. Utilities ([/src/utils/](cci:7://file:///workspace/src/utils:0:0-0:0))**

- **[FieldProcessor.js](cci:7://file:///workspace/src/utils/FieldProcessor.js:0:0-0:0)**: Centralized field processing and validation for ride parameters
- **[RideParamsHelper.js](cci:7://file:///workspace/src/utils/RideParamsHelper.js:0:0-0:0)**: Parse multi-line command parameters
- **[route-parser.js](cci:7://file:///workspace/src/utils/workspace/src/utils/route-parser.js:0:0-0:0)**: Parse routes from Strava, RideWithGPS, Komoot
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

Comprehensive test suite covering:
- All command handlers
- Services (RideService, RideMessagesService)
- Storage implementations (MongoDB, Memory)
- Utilities (parsers, formatters)
- Wizard flows
- Integration tests for main flows

**Test Framework:** Jest with MongoDB Memory Server

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
- [x] Commands: Rename /postride to /shareride.
- [x] Documentation: Improve /start message to simplify onboarding
- [ ] Translations: Add Russian language support and set the bot's default language through environment variables.
- [x] Ride participation: List participants on the same line after the label, separated by commas.
- [ ] Ride participation: Add an "I am thinking" option to indicate who might join the chat.
- [ ] Ride participation: Add an "Not interested" option to gather responses from those who will not join the ride.
- [x] Ride participation: Limit the ride message to display only the first N registered participants (configurable via MAX_PARTICIPANTS_DISPLAY), and if there are more, show a label like "and X more".

### Medium Priority
- [ ] Rides management: Add management buttons below the ride button in private chat with the bot for ride creator
- [ ] Notifications: Send a private notification to the ride creator when a participant joins or leaves. There is a 30-second delay to prevent spamming from frequent toggling; if the participant's status changes again within this period, cancel the pending notification.
- [ ] Notifications: Remind the joined users about upcoming ride 24 hours and 1 hour before the ride (send a private message; give each user an option to unsubscribe from all notifications).
- [ ] Ride sharing: Optionally enable everyone to repost the ride via an additional field during ride creation or update.

### Low Priority
- [ ] Translations: Override the bot's default language based on the user's preference (the bot communicates with the user in their chosen language; it also announces the user's rides, created by them, in the preferred language).
- [ ] Ride participation: Add a comand to list joined rides for the current user
- [ ] Quality: Better testing and fixes of setting nummeric ride attributes, like setting interval 22-25 and updating with a single value (29) gives 29-25

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
