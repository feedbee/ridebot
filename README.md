# Bike Ride Organizer Bot

A Telegram bot for organizing bike rides within a channel. The bot allows users to create, join, and manage bike ride events.

## Features

- Create bike ride announcements with:
  - Start date and time
  - Title
  - Optional route link (Strava, Ridewithgps, Komoot)
  - Optional distance
  - Optional estimated riding time
  - Optional speed expectations
- Join/Leave ride functionality
- Automatic route information parsing
- Update ride announcements
- Participant list management

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

1. Add the bot to your Telegram channel
2. Grant admin rights to the bot
3. Use the following commands:

### Creating a New Ride

```
/newride
Evening Ride
25.03.2024 18:30
https://www.strava.com/routes/123456
35
90
25-28
```

This creates a ride with:
- Title: Evening Ride
- Date: March 25, 2024
- Time: 18:30
- Route: Strava route link
- Distance: 35 km (optional if route provided)
- Duration: 90 minutes (optional if route provided)
- Speed: 25-28 km/h (optional)

### Updating a Ride

```
/updateride
ride_id
Updated Evening Ride
25.03.2024 19:00
https://www.strava.com/routes/123456
40
120
26-29
```

Note: Only the ride creator can update the ride.

## Route Support

The bot supports route links from:
- Strava
- Ridewithgps
- Komoot

Route information (distance and estimated time) will be automatically parsed when available.

## Development vs Production

- Development mode uses in-memory storage and polling
- Production mode uses MongoDB and webhooks

## Environment Variables

- `BOT_TOKEN`: Telegram bot token
- `WEBHOOK_DOMAIN`: Domain for webhook in production
- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: Set to 'development' for dev mode
