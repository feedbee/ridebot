# Bike Ride Organizer Bot

A Telegram bot for organizing bike rides within multiple chats. The bot allows users to create, join, and manage bike ride events with synchronized updates across different chat groups.

## Features

- Create bike ride announcements with:
  - Start date and time
  - Title
  - Category (Road Ride, Gravel Ride, Mountain Bike Ride, etc.)
  - Optional meeting point
  - Optional route link (Strava, Ridewithgps, Komoot)
  - Optional distance
  - Optional estimated riding time
  - Optional speed expectations
  - Optional additional information text
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
category: Road Ride
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28
info: Bring lights and a jacket
```

This creates a ride with:
- Title: Evening Ride
- Date: March 25, 2024
- Time: 18:30
- Category: Road Ride (optional, defaults to "Regular/Mixed Ride")
- Meeting point: Bike Shop on Main St
- Route: Strava route link
- Distance: 35 km (optional if route provided)
- Duration: 90 minutes (optional if route provided)
- Speed: 25-28 km/h (optional)
- Additional Info: Bring lights and a jacket (optional)

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
category: Gravel Ride
meet: New Meeting Point
route: https://www.strava.com/routes/123456
dist: 40
time: 120
speed: 26-29
info: Bring lights and a raincoat
```

Note: Only the ride creator can update the ride.

### Removing Field Values

To remove (clear) any optional field's value, use a dash (`-`) as the value:

```
/updateride
id: abc123
info: -
```

This will clear the additional information field.

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
2. Use `/shareride` with ride ID directly: `/shareride abc123`
3. Or use `/shareride` with ride ID as a parameter

### Listing Your Rides

Use `/listrides` to see all rides you've created with pagination support.

### Listing Ride Participants

Use `/listparticipants rideID` to see all participants for a specific ride. This command shows all participants without the truncation limit applied to regular ride messages.

## Route Support

The bot supports route links from:
- Strava
- Ridewithgps
- Komoot

Route information (distance and estimated time) will be automatically parsed when available.

## Ride Categories

The bot supports the following ride categories:
- Regular/Mixed Ride (default)
- Road Ride
- Gravel Ride
- Mountain/Enduro/Downhill Ride
- MTB-XC Ride
- E-Bike Ride
- Virtual/Indoor Ride

The category helps participants understand what type of bike and equipment to bring.

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
- `USE_WEBHOOK`: Set to `true` to enable webhook mode (defaults to `false` for polling)
- `WEBHOOK_PATH`: Path for the webhook (e.g., `/webhook`, defaults to `/`)
- `WEBHOOK_PORT`: Port for the webhook server to listen on (defaults to `8080`)
- `MAX_PARTICIPANTS_DISPLAY`: Maximum number of participants to show before displaying "and X more" (defaults to `20`)

## Webhook Setup

When running the bot in production or any environment where you want to use webhooks instead of polling, follow these steps:

1.  **Environment Configuration:**
    *   Set `USE_WEBHOOK=true` in your `.env` file or environment variables.
    *   Ensure `WEBHOOK_DOMAIN` is set to your publicly accessible domain name (e.g., `yourbot.example.com`).
    *   Optionally, set `WEBHOOK_PATH` if you want the webhook to be served on a specific path (e.g., `/your-secret-webhook-path`). If not set, it defaults to `/`.
    *   Optionally, set `WEBHOOK_PORT` if your bot needs to listen on a specific port for webhook requests (defaults to `8080`). This is the port your application server (Node.js) will bind to.

2.  **Server Setup (Reverse Proxy Recommended):**
    *   Your bot needs to be accessible from the internet via HTTPS. Telegram requires HTTPS for webhooks.
    *   It's highly recommended to use a reverse proxy like Nginx or Caddy in front of your Node.js application.
    *   The reverse proxy will handle SSL termination (HTTPS) and forward requests to your bot's HTTP server running on `WEBHOOK_PORT`.
    *   **Example Nginx Configuration Snippet:**
        ```nginx
        server {
            listen 443 ssl;
            server_name yourbot.example.com;

            ssl_certificate /path/to/your/fullchain.pem;
            ssl_certificate_key /path/to/your/privkey.pem;

            location /your-secret-webhook-path { # Or just / if WEBHOOK_PATH is not set
                proxy_pass http://localhost:8080; # Assuming WEBHOOK_PORT is 8080
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto https;
            }
        }
        ```
    *   Ensure your firewall allows traffic to the port your reverse proxy is listening on (usually 443 for HTTPS).

3.  **Set the Webhook with Telegram:**
    *   Once your bot is running and accessible via the HTTPS URL, you need to tell Telegram where to send updates.
    *   The bot attempts to set the webhook automatically on startup if `USE_WEBHOOK=true`. The URL it registers is `https://<WEBHOOK_DOMAIN><WEBHOOK_PATH>`.
    *   You can also manually set or check the webhook URL using a `curl` command or by visiting the URL in your browser:
        ```bash
        curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<WEBHOOK_DOMAIN><WEBHOOK_PATH>"
        ```
        Replace `<YOUR_BOT_TOKEN>`, `<WEBHOOK_DOMAIN>`, and `<WEBHOOK_PATH>` (if you configured a custom one) with your actual values.
    *   You should receive a JSON response like `{"ok":true,"result":true,"description":"Webhook was set"}`.
    *   To check current webhook info:
        ```bash
        curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
        ```

4.  **Testing:**
    *   Send a command to your bot in a chat.
    *   Check your bot's logs and your reverse proxy logs to see if the request is being received and processed.

**Important Considerations:**

*   **Polling vs. Webhook:** The bot can run in either polling mode (default, good for development) or webhook mode. It cannot use both simultaneously. If `USE_WEBHOOK` is `true`, polling is disabled.
*   **Webhook Path:** Using a non-obvious `WEBHOOK_PATH` can add a small layer of security.
*   **Self-signed certificates:** Telegram does not support self-signed certificates for webhooks. You need a valid SSL certificate (e.g., from Let's Encrypt).
*   **Docker:** If using Docker, ensure `WEBHOOK_PORT` is exposed and mapped correctly in your `docker-compose.yml` or Docker run command. The reverse proxy would typically run on the host or as another container.
