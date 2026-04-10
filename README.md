# Bike Ride Organizer Bot

A Telegram bot for organizing bike rides within multiple chats. The bot allows users to create, join, and manage bike ride events with synchronized updates across different chat groups.

## Features

- Create bike ride announcements with:
  - Start date and time
  - Title
  - Category (Road Ride, Gravel Ride, Mountain Bike Ride, etc.)
  - Optional meeting point
  - Optional route links with optional labels (Strava, RideWithGPS, Komoot, Garmin, or any other URL)
  - Optional distance
  - Optional estimated riding time
  - Optional speed expectations
  - Optional additional information text
- Join/Thinking/Pass ride functionality with synchronized participant lists
- Automatic group sync: attach a Telegram group to a ride so participants are auto-added when they join and removed when they leave
- Automatic route information parsing from the first parseable route link
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

### Running Commands In VS Code Devcontainer

`./scripts/devcontainer-exec.sh` is a general helper for running any command in the active VS Code devcontainer for this repository (when it exists), without hardcoding container IDs.

```bash
./scripts/devcontainer-exec.sh <command> [args...]
```

Examples:

```bash
./scripts/devcontainer-exec.sh npm test
./scripts/devcontainer-exec.sh npm run dev
```

Detection mode (find devcontainer only, no command execution):

```bash
./scripts/devcontainer-exec.sh --find-container-id
```

Test shortcut:

```bash
./run-tests.sh
```

`./run-tests.sh` uses this order:
- If already inside a container: `npm test`
- Else if Docker is unavailable: local host `npm test`
- Else if this repo devcontainer is running: `./scripts/devcontainer-exec.sh npm test`
- Else: disposable `node:latest` container with `npm install && npm test`

Full Telegram E2E smoke tests:
- live under [`e2e/`](e2e)
- do not run automatically as part of starndard automated tests
- should be maintained when real Telegram user flows change
- are documented in [`e2e/README.md`](e2e/README.md)
- use `npm run e2e:bootstrap-session` and `npm run e2e:telegram`

## Production Deployment

You can deploy the bot using Docker, either via Docker Compose or standalone.

### Using Docker Compose (Recommended)

1. Update `.env` with production values:
   - Set `BOT_TOKEN`, and `WEBHOOK_DOMAIN` to your domain.
   - Set `MONGODB_URI` if using external MongoDB.
2. Build and start the services:
   ```bash
   docker-compose up -d
   ```

### Using Standalone Docker

1. Build the image:
   ```bash
   docker build -t feedbee/ridebot .
   ```
2. Run the container (make sure your `.env` file is ready):
   ```bash
   docker run -d --name ridebot --env-file .env feedbee/ridebot
   ```

## Usage

1. Add the bot to your Telegram chats
2. Grant admin rights to the bot
3. Use the following commands:

### Command Modes

All main commands work in two modes:
- Step-by-step wizard (interactive and beginner-friendly)
- Parametrized mode (faster for experienced users)

### Creating a New Ride with AI (dialog mode)

```
/airide
```

Start an empty AI session — the bot asks you to describe the ride. Each message you send refines the details. A live preview is shown after every message with **Confirm** and **Cancel** buttons. Up to 10 messages per session.

You can also include an initial description on the same line:

```
/airide Gravel ride this Sunday 9am, 80km, 22-25 km/h, starting at Central Station
```

To update an existing ride via AI dialog:

```
/airide #rideId
/airide #rideId move to next Saturday and add route links
```

> **Note:** `/airide` is only available in private chat with the bot. Requires `ANTHROPIC_API_KEY` to be set.

### Importing a Ride from Strava

```
/fromstrava https://www.strava.com/clubs/123/group_events/456
```

Fetches the Strava club event and creates a ride automatically. The following fields are populated from the event:

- **Title, date, meeting point, category** — directly from the event
- **Routes** — from the attached route object; if there is no attached route, all known-provider links found in the event description are imported in discovery order (Strava, RideWithGPS, Komoot, Garmin)
- **Distance and duration** — from the attached route if present; otherwise from the first found route link
- **Speed range** — derived from pace groups (speed-based only)
- **Organizer** — the Strava club name
- **Additional info** — event URL + description + pace groups detail

If you call `/fromstrava` with the same event URL again, the existing ride is updated in all chats instead of creating a new one. A different user running the same URL always creates a separate ride.

> **Note:** `/fromstrava` is only available in private chat with the bot. Requires Strava API credentials (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`) to be set.

### Creating a New Ride

```
/newride
title: Evening Ride
when: 25.03.2024 18:30
category: Road Ride
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
route: Komoot | https://www.komoot.com/tour/456789
route: Short variant | https://ridewithgps.com/routes/987654
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
- Routes: multiple route links in order; the first route is treated as primary
- Distance: 35 km (optional if route provided)
- Duration: 90 minutes (optional if route provided)
- Speed: 25-28 km/h (optional)
- Additional Info: Bring lights and a jacket (optional)

Route input rules:
- Repeat `route:` to pass multiple links.
- Use `route: URL` for an unlabeled route.
- Use `route: Label | URL` for a labeled route.
- The URL is always taken from the last `|`-separated segment, so `|` can be used inside the label.
- If a label is omitted, the bot derives one when rendering: `Strava`, `Garmin`, `Komoot`, `RideWithGPS`, otherwise localized `Link` / `Ссылка`.

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
route: Komoot | https://www.komoot.com/tour/456789
dist: 40
time: 120
speed: 26-29
info: Bring lights and a raincoat
```

Note: Only the ride creator can update the ride.

If at least one `route:` line is present in `/updateride`, it replaces the entire route list.

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

When duplicating with parameters:
- repeated `route:` lines replace the copied route list
- `route: Label | URL` sets a custom label
- `route: -` clears all copied routes

### Posting a Ride to Another Chat

To post an existing ride to another chat:
1. Go to the target chat
2. Use `/shareride` with ride ID directly: `/shareride abc123`
3. Or use `/shareride` with ride ID as a parameter

**Tip**: Ride creators see a "Share this ride: `/shareride #ID`" line in their private chat messages for easy copying.

### Listing Your Rides

Use `/listrides` to see all rides you've created with pagination support.

### Listing Ride Participants

Use `/listparticipants rideID` to see all participants for a specific ride. This command shows all participants without the truncation limit applied to regular ride messages, organized by participation state (Joined, Thinking, Not interested).

### Attaching a Group to a Ride

You can link a private Telegram group to a ride so that participants are automatically added when they join and removed when they leave.

1. Create a Telegram group and add the bot as admin with **"Add Members"** and **"Ban Users"** permissions
2. In the group chat, run `/attach #rideId` (e.g. `/attach #abc123`)
3. The bot verifies its permissions, stores the link, posts the ride message in the group, and pins it
4. From now on, joining the ride sends participants a single-use invite link to the group (valid 24 hours); leaving removes them
5. To unlink, run `/detach` in the group chat

**Note:** Telegram does not allow bots to add users directly — participants receive a private invite link instead.

### Joining the Ride Group Chat

Once a group is attached, the ride message displays a notice with instructions. Any participant who has joined the ride can request an invite link by sending the bot a private message:

```
/joinchat #rideId
```

The bot sends a single-use invite link valid for 24 hours. The command only works if you have joined the ride.

## Route Support

The bot supports route links from:
- Strava
- RideWithGPS
- Komoot
- Garmin

Multiple route links are supported in command mode, wizard mode, AI mode, and Strava import. Route information (distance and estimated time) is automatically parsed from the first route link that provides those metrics.
In the wizard, changing the route list refreshes previously auto-derived distance and duration when the new route provides those metrics.

## Ride Categories

Ride category is stored in data as a stable code and rendered with localized labels.

Canonical category codes:
- `mixed` (default)
- `road`
- `gravel`
- `mtb`
- `mtb-xc`
- `e-bike`
- `virtual`

Displayed labels (EN/RU) are localized through i18n dictionaries.

The bot accepts both canonical codes and legacy labels in command input, for example:
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
- `ANTHROPIC_API_KEY`: API key for Claude AI (required for `/airide`)
- `STRAVA_CLIENT_ID`: Strava API client ID (required for `/fromstrava`)
- `STRAVA_CLIENT_SECRET`: Strava API client secret (required for `/fromstrava`)
- `STRAVA_REFRESH_TOKEN`: Strava OAuth refresh token (required for `/fromstrava`)
- `WEBHOOK_DOMAIN`: Domain for webhook in production
- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: Set to 'development' for dev mode
- `USE_WEBHOOK`: Set to `true` to enable webhook mode (defaults to `false` for polling)
- `WEBHOOK_PATH`: Path for the webhook (e.g., `/webhook`, defaults to `/`)
- `WEBHOOK_PORT`: Port for the webhook server to listen on (defaults to `8080`)
- `MAX_PARTICIPANTS_DISPLAY`: Maximum number of participants to show before displaying "and X more" (defaults to `20`)
- `DEFAULT_LANGUAGE`: Default UI language for bot replies (defaults to `en`)
- `FALLBACK_LANGUAGE`: Fallback UI language for missing keys (defaults to `en`)
- `DEFAULT_TIMEZONE`: Default timezone for ride date/time parsing and formatting (e.g., `Europe/Warsaw`)

## Adding a New Language

1. Create a new locale file in `src/i18n/locales/` (for example `de.js`).
2. Export a locale object with the same key structure as `en`.
3. Register the locale in `src/i18n/index.js` locales map.
4. Keep category labels in `categories.*` keys (category data is stored as stable codes, not labels).
5. Run tests:
   - `./run-tests.sh --mode basic`
   - `./run-tests.sh --mode mongo` (if Mongo test environment is available)

The test `src/__tests__/i18n/locales-consistency.test.js` enforces key parity between locales.

## Database Migrations

When using MongoDB in production, run database migrations to update the schema:

```bash
# Run migrations using Docker
docker run --rm \
  -e MONGODB_URI="mongodb://username:password@host:port/database" \
  feedbee/ridebot \
  npm run migrate

# Or using Node.js directly
export MONGODB_URI="mongodb://username:password@host:port/database"
npm run migrate
```

**Migration Features:**
- Schema version tracking in `meta` collection
- Batch processing (100 rides per batch) for large datasets
- **Schema validation**: App startup fails if database schema is outdated
- Includes data migration for legacy category labels -> canonical category codes (`road`, `gravel`, etc.)

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
