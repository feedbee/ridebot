# Bike Ride Organizer Bot

A Telegram bot for organizing bike rides within multiple chats. The bot allows users to create, join, and manage bike ride events with synchronized updates across different chat groups.

## Features

- Create bike ride announcements with:
  - Start date and time
  - Title
  - Optional meeting point
  - Optional route link (Strava, Ridewithgps, Komoot)
  - Optional distance
  - Optional estimated riding time
  - Optional speed expectations
- Join/Leave ride functionality with synchronized participant lists
- Automatic route information parsing
- Update ride announcements
- Participant list management
- Multi-chat support: post the same ride to multiple chats
- Synchronized updates across all chats
- Flexible command syntax with multiple ways to reference rides

## Development Setup

1. Create a new bot using [@BotFather](https://t.me/botfather) on Telegram
2. Copy the bot token
3. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run in development mode:
   ```bash
   npm run dev
   ```

## Production Deployment

1. Update `.env` with production values:
   - Set `WEBHOOK_DOMAIN` to your domain
   - Set `MONGODB_URI` if using external MongoDB
2. Build and run with Docker Compose:
   ```bash
   docker-compose up -d
   ```

## Usage

1. Add the bot to your Telegram chats
2. Grant admin rights to the bot
3. Use the following commands:

### Command Modes

All main commands work in two modes:
- Step-by-step wizard (interactive and beginner-friendly)
- Parametrized mode (faster for experienced users)

### Creating a New Ride

```
/newride
title: Evening Ride
when: 25.03.2024 18:30
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28
```

This creates a ride with:
- Title: Evening Ride
- Date: March 25, 2024
- Time: 18:30
- Meeting point: Bike Shop on Main St
- Route: Strava route link
- Distance: 35 km (optional if route provided)
- Duration: 90 minutes (optional if route provided)
- Speed: 25-28 km/h (optional)

### Updating a Ride

Four ways to update a ride:
1. Reply to the ride message with `/updateride` to start an interactive wizard
2. Reply to the ride message with `/updateride` and new parameters
3. Use `/updateride` with ride ID directly: `/updateride abc123`
4. Use `/updateride` with ride ID as a parameter:

```
/updateride
id: abc123
title: Updated Evening Ride
when: 25.03.2024 19:00
meet: New Meeting Point
route: https://www.strava.com/routes/123456
dist: 40
time: 120
speed: 26-29
```

Note: Only the ride creator can update the ride.

### Cancelling a Ride

Three ways to cancel a ride:
1. Reply to the ride message with `/cancelride`
2. Use `/cancelride` with ride ID directly: `/cancelride abc123`
3. Use `/cancelride` with ride ID as a parameter

### Resuming a Cancelled Ride

Three ways to resume a cancelled ride:
1. Reply to the ride message with `/resumeride`
2. Use `/resumeride` with ride ID directly: `/resumeride abc123`
3. Use `/resumeride` with ride ID as a parameter

Note: Only the ride creator can resume a cancelled ride.

### Duplicating a Ride

Four ways to duplicate a ride:
1. Reply to the ride message with `/dupride` to start an interactive wizard
2. Reply to the ride message with `/dupride` and new parameters
3. Use `/dupride` with ride ID directly: `/dupride abc123`
4. Use `/dupride` with ride ID and optional parameters

### Posting a Ride to Another Chat

To post an existing ride to another chat:
1. Go to the target chat
2. Use `/postride` with ride ID directly: `/postride abc123`
3. Or use `/postride` with ride ID as a parameter

### Listing Your Rides

Use `/listrides` to see all rides you've created with pagination support.

## Route Support

The bot supports route links from:
- Strava
- Ridewithgps
- Komoot

Route information (distance and estimated time) will be automatically parsed when available.

## Multi-Chat Support

The bot supports posting rides across different chats:
- Create a ride in one chat and post it to other chats
- All instances of the ride stay synchronized
- Join/leave updates appear in all chats
- Changes and cancellations sync automatically

## Ride ID References

The bot supports multiple ways to reference a ride:
- Reply to a ride message
- Pass the ride ID directly after the command (e.g., `/updateride abc123`)
- Pass the ride ID with a leading # symbol (e.g., `/updateride #abc123`)
- Use the ID parameter in multi-line commands

## Development vs Production

- Development mode uses in-memory storage and polling
- Production mode uses MongoDB and webhooks

## Environment Variables

- `BOT_TOKEN`: Telegram bot token
- `WEBHOOK_DOMAIN`: Domain for webhook in production
- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: Set to 'development' for dev mode
