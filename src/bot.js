import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from './config.js';
import { RouteParser } from './utils/route-parser.js';
import { StorageInterface } from './storage/interface.js';

export class BikeRideBot {
  /**
   * @param {StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.bot = new Bot(config.bot.token);
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.command('newride', this.handleNewRide.bind(this));
    this.bot.command('updateride', this.handleUpdateRide.bind(this));
    this.bot.command('cancelride', this.handleCancelRide.bind(this));
    this.bot.command('deleteride', this.handleDeleteRide.bind(this));
    this.bot.command('listrides', this.handleListRides.bind(this));
    this.bot.callbackQuery(/^join:(.+)$/, this.handleJoinRide.bind(this));
    this.bot.callbackQuery(/^leave:(.+)$/, this.handleLeaveRide.bind(this));
    this.bot.callbackQuery(/^delete:(\w+):(\w+)$/, this.handleDeleteConfirmation.bind(this));
    this.bot.callbackQuery(/^list:(\d+)$/, this.handleListPage.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
  }

  async handleHelp(ctx) {
    const helpText = `
*Bike Ride Bot Help*

Create a new ride with /newride command followed by parameters (one per line):
title: Ride title
when: Date and time (DD.MM.YYYY HH:MM)
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
time: Duration in minutes (optional)
speed: Speed range in km/h (optional)

Example:
/newride
title: Evening Ride
when: 25.03.2024 18:30
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28

To update a ride (only the ride creator can do this):
1. Reply to the ride message and use /updateride command with new parameters
OR
2. Use /updateride command with ride ID and new parameters

Example with ID:
/updateride
id: abc123
title: Updated Evening Ride
when: 25.03.2024 19:00
meet: City Park entrance
speed: 26-29

To cancel a ride (only the ride creator can do this):
1. Reply to the ride message and use /cancelride command
OR
2. Use /cancelride command with ride ID:
/cancelride
id: abc123

To delete a ride (only the ride creator can do this):
1. Reply to the ride message and use /deleteride command
OR
2. Use /deleteride command with ride ID:
/deleteride
id: abc123

After using /deleteride, confirm the deletion when prompted.

To list your rides:
Use /listrides command to see all rides you've created, sorted by date (newest first).
Use navigation buttons to move between pages.
`;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  }

  async start() {
    if (config.bot.useWebhook) {
      const webhookUrl = `${config.bot.webhookDomain}${config.bot.webhookPath}`;
      await this.bot.api.setWebhook(webhookUrl);
      console.log(`Bot webhook set to ${webhookUrl}`);
    } else {
      await this.bot.api.deleteWebhook();
      this.bot.start();
      console.log('Bot started in polling mode');
    }
  }

  parseCommandParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        params[key.trim().toLowerCase()] = value.trim();
      }
    }

    return params;
  }

  /**
   * Extract and validate ride from command parameters or replied message
   * @param {Context} ctx - Grammy context
   * @param {boolean} requireCreator - Whether the command requires ride creator permissions
   * @returns {Promise<{ride: Object|null, error: string|null}>}
   */
  async extractRide(ctx, requireCreator = false) {
    let rideId = null;

    // First check if ID is provided in parameters
    const params = this.parseCommandParams(ctx.message.text);
    if (params.id) {
      rideId = params.id;
    }
    // Then check replied message
    else if (ctx.message.reply_to_message) {
      const originalMessage = ctx.message.reply_to_message.text;
      const rideIdMatch = originalMessage.match(/🎫\s*Ride\s*#(\w+)/i);
      
      if (!rideIdMatch) {
        return { 
          ride: null, 
          error: 'Could not find ride ID in the message. Please make sure you are replying to a ride message or provide ID parameter.'
        };
      }
      rideId = rideIdMatch[1];
    }
    else {
      return { 
        ride: null, 
        error: 'Please reply to the ride message or provide ID parameter. Use /help for format example.'
      };
    }

    try {
      const ride = await this.storage.getRide(rideId);
      if (!ride) {
        return { ride: null, error: `Ride #${rideId} not found` };
      }

      if (requireCreator && ride.createdBy !== ctx.from.id) {
        return { ride: null, error: 'Only the ride creator can perform this action' };
      }

      return { ride, error: null };
    } catch (error) {
      return { ride: null, error: 'Error accessing ride data' };
    }
  }

  async handleNewRide(ctx) {
    const params = this.parseCommandParams(ctx.message.text);
    
    if (!params.title || !params.when) {
      await ctx.reply(
        'Please provide at least title and date/time. Use /help for format example.'
      );
      return;
    }

    try {
      const date = this.parseDateTime(params.when);
      
      // First create the ride without messageId
      const rideData = {
        title: params.title,
        date,
        chatId: ctx.chat.id,
        createdBy: ctx.from.id
      };

      if (params.meet) {
        rideData.meetingPoint = params.meet;
      }

      if (params.route) {
        if (RouteParser.isValidRouteUrl(params.route)) {
          rideData.routeLink = params.route;
          // Only try to parse details if it's a known provider
          if (RouteParser.isKnownProvider(params.route)) {
            const routeInfo = await RouteParser.parseRoute(params.route);
            if (routeInfo) {
              if (!params.dist) rideData.distance = routeInfo.distance;
              if (!params.time) rideData.duration = routeInfo.duration;
            }
          }
        } else {
          await ctx.reply('Invalid route URL format. Please provide a valid URL.');
          return;
        }
      }

      if (params.dist) {
        rideData.distance = parseFloat(params.dist);
      }

      if (params.time) {
        rideData.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      }

      const ride = await this.storage.createRide(rideData);
      
      // Create initial message
      const participants = await this.storage.getParticipants(ride.id);
      const keyboard = new InlineKeyboard();
      keyboard.text(config.buttons.join, `join:${ride.id}`);

      const message = this.formatRideMessage(ride, participants);
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Update ride with the message ID
      await this.storage.updateRide(ride.id, {
        messageId: sentMessage.message_id
      });
    } catch (error) {
      await ctx.reply('Error creating ride: ' + error.message);
    }
  }

  async handleUpdateRide(ctx) {
    const params = this.parseCommandParams(ctx.message.text);
    const { ride, error } = await this.extractRide(ctx, true);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      const updates = {};

      if (params.title) updates.title = params.title;
      if (params.when) updates.date = this.parseDateTime(params.when);
      if (params.meet) updates.meetingPoint = params.meet;

      if (params.route) {
        if (RouteParser.isValidRouteUrl(params.route)) {
          updates.routeLink = params.route;
          // Only try to parse details if it's a known provider
          if (RouteParser.isKnownProvider(params.route)) {
            const routeInfo = await RouteParser.parseRoute(params.route);
            if (routeInfo) {
              if (!params.dist) updates.distance = routeInfo.distance;
              if (!params.time) updates.duration = routeInfo.duration;
            }
          }
        } else {
          await ctx.reply('Invalid route URL format. Please provide a valid URL.');
          return;
        }
      }

      if (params.dist) {
        updates.distance = parseFloat(params.dist);
      }

      if (params.time) {
        updates.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) updates.speedMin = min;
        if (!isNaN(max)) updates.speedMax = max;
      }

      const updatedRide = await this.storage.updateRide(ride.id, updates);
      await this.updateRideMessage(updatedRide);
      await ctx.reply('Ride updated successfully');
    } catch (error) {
      await ctx.reply('Error updating ride: ' + error.message);
    }
  }

  async handleCancelRide(ctx) {
    const { ride, error } = await this.extractRide(ctx, true);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      if (ride.cancelled) {
        await ctx.reply('This ride is already cancelled');
        return;
      }

      const updatedRide = await this.storage.updateRide(ride.id, { cancelled: true });
      await this.updateRideMessage(updatedRide);
      await ctx.reply('Ride cancelled successfully');
    } catch (error) {
      await ctx.reply('Error cancelling ride: ' + error.message);
    }
  }

  async handleJoinRide(ctx) {
    const rideId = ctx.match[1];
    try {
      const ride = await this.storage.getRide(rideId);
      
      if (!ride) {
        await ctx.answerCallbackQuery(`Ride #${rideId} not found`);
        return;
      }
      
      if (ride.cancelled) {
        await ctx.answerCallbackQuery('This ride has been cancelled');
        return;
      }

      const success = await this.storage.addParticipant(rideId, {
        userId: ctx.from.id,
        username: ctx.from.username || ctx.from.first_name
      });

      if (success) {
        await this.updateRideMessage(ride);
      }

      await ctx.answerCallbackQuery('You have joined the ride!');
    } catch (error) {
      await ctx.answerCallbackQuery('Error joining the ride');
    }
  }

  async handleLeaveRide(ctx) {
    const rideId = ctx.match[1];
    try {
      const ride = await this.storage.getRide(rideId);
      
      if (!ride) {
        await ctx.answerCallbackQuery(`Ride #${rideId} not found`);
        return;
      }
      
      if (ride.cancelled) {
        await ctx.answerCallbackQuery('This ride has been cancelled');
        return;
      }

      const success = await this.storage.removeParticipant(rideId, ctx.from.id);

      if (success) {
        await this.updateRideMessage(ride);
      }

      await ctx.answerCallbackQuery('You have left the ride');
    } catch (error) {
      await ctx.answerCallbackQuery('Error leaving the ride');
    }
  }

  async updateRideMessage(ride) {
    // Skip if no messageId (shouldn't happen, but just in case)
    if (!ride.messageId) {
      console.error('No messageId for ride:', ride.id);
      return;
    }

    const participants = await this.storage.getParticipants(ride.id);
    const keyboard = new InlineKeyboard();

    // Don't show join/leave buttons for cancelled rides
    if (!ride.cancelled) {
      const participantIds = participants.map(p => p.userId);
      const buttonText = participantIds.includes(ride.createdBy) 
        ? config.buttons.leave 
        : config.buttons.join;
      const callbackData = participantIds.includes(ride.createdBy)
        ? `leave:${ride.id}`
        : `join:${ride.id}`;

      keyboard.text(buttonText, callbackData);
    }

    const message = this.formatRideMessage(ride, participants);

    try {
      await this.bot.api.editMessageText(
        ride.chatId,
        ride.messageId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error('Error updating message:', error);
    }
  }

  formatRideMessage(ride, participants) {
    const dateStr = ride.date.toLocaleDateString('en-GB');
    const timeStr = ride.date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let meetingInfo = '';
    if (ride.meetingPoint) {
      meetingInfo = `\n📍 Meeting point: ${ride.meetingPoint}`;
    }

    let routeInfo = '';
    if (ride.routeLink) {
      routeInfo = `\n🔗 Route: ${ride.routeLink}`;
    }

    let distanceInfo = '';
    if (ride.distance) {
      distanceInfo = `\n📏 Distance: ${ride.distance} km`;
    }

    let durationInfo = '';
    if (ride.duration) {
      const hours = Math.floor(ride.duration / 60);
      const minutes = ride.duration % 60;
      durationInfo = `\n⏱ Duration: ${hours}h ${minutes}m`;
    }

    let speedInfo = '';
    if (ride.speedMin || ride.speedMax) {
      speedInfo = '\n🚴 Speed: ';
      if (ride.speedMin && ride.speedMax) {
        speedInfo += `${ride.speedMin}-${ride.speedMax} km/h`;
      } else if (ride.speedMin) {
        speedInfo += `min ${ride.speedMin} km/h`;
      } else {
        speedInfo += `max ${ride.speedMax} km/h`;
      }
    }

    const participantList = participants.length > 0
      ? participants.map(p => `@${p.username}`).join('\n')
      : 'No participants yet';

    // Add ride ID in a visually pleasing way
    const rideInfo = `🎫 Ride #${ride.id}`;

    const cancelledBadge = ride.cancelled ? ` ${config.messageTemplates.cancelled}` : '';
    const joinInstructions = ride.cancelled 
      ? config.messageTemplates.cancelledInstructions
      : `${rideInfo}\nClick the button below to join or leave the ride`;

    return config.messageTemplates.ride
      .replace('{title}', ride.title)
      .replace('{cancelledBadge}', cancelledBadge)
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{meetingInfo}', meetingInfo)
      .replace('{routeInfo}', routeInfo)
      .replace('{distanceInfo}', distanceInfo)
      .replace('{durationInfo}', durationInfo)
      .replace('{speedInfo}', speedInfo)
      .replace('{participantCount}', participants.length)
      .replace('{participants}', participantList)
      .replace('{joinInstructions}', joinInstructions);
  }

  parseDateTime(dateTimeStr) {
    const [dateStr, timeStr] = dateTimeStr.split(' ');
    const [day, month, year] = dateStr.split('.').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);

    const date = new Date(year, month - 1, day, hours, minutes);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date/time format');
    }

    return date;
  }

  async handleDeleteRide(ctx) {
    const { ride, error } = await this.extractRide(ctx, true);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      // Create confirmation keyboard
      const keyboard = new InlineKeyboard()
        .text(config.buttons.confirmDelete, `delete:confirm:${ride.id}`)
        .text(config.buttons.cancelDelete, `delete:cancel:${ride.id}`);

      await ctx.reply(config.messageTemplates.deleteConfirmation, {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: keyboard
      });
    } catch (error) {
      await ctx.reply('Error preparing ride deletion: ' + error.message);
    }
  }

  async handleDeleteConfirmation(ctx) {
    const [action, rideId] = ctx.match.slice(1);
    
    try {
      if (action === 'cancel') {
        await ctx.deleteMessage();
        await ctx.answerCallbackQuery('Deletion cancelled');
        return;
      }

      const ride = await this.storage.getRide(rideId);

      if (!ride) {
        await ctx.answerCallbackQuery(`Ride #${rideId} not found`);
        return;
      }

      if (ride.createdBy !== ctx.from.id) {
        await ctx.answerCallbackQuery('Only the ride creator can delete it');
        return;
      }

      // Delete the ride from database
      const success = await this.storage.deleteRide(rideId);
      if (!success) {
        await ctx.answerCallbackQuery('Failed to delete the ride');
        return;
      }

      // Delete the confirmation message
      await ctx.deleteMessage();

      // Delete the original ride message
      try {
        await this.bot.api.deleteMessage(ride.chatId, ride.messageId);
      } catch (error) {
        console.error('Error deleting ride message:', error);
      }

      await ctx.answerCallbackQuery('Ride deleted successfully');
    } catch (error) {
      await ctx.answerCallbackQuery('Error deleting ride: ' + error.message);
    }
  }

  /**
   * Format a list of rides for display
   * @param {Array<Object>} rides - Array of ride objects
   * @returns {string} Formatted message
   */
  formatRidesList(rides) {
    if (rides.length === 0) {
      return 'No rides found';
    }

    return rides.map(ride => {
      const dateStr = ride.date.toLocaleDateString('en-GB');
      const timeStr = ride.date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const status = ride.cancelled ? ' ❌ Cancelled' : '';
      return `🎫 *Ride #${ride.id}*${status}\n${ride.title}\n📅 ${dateStr} ${timeStr}\n`;
    }).join('\n');
  }

  async handleListRides(ctx) {
    try {
      const PAGE_SIZE = 5;
      const { total, rides } = await this.storage.getRidesByCreator(
        ctx.from.id,
        0,
        PAGE_SIZE
      );

      const message = `Found ${total} ride${total !== 1 ? 's' : ''}\n\n${this.formatRidesList(rides)}`;
      
      // Only add pagination if there are more pages
      const keyboard = total > PAGE_SIZE ? new InlineKeyboard()
        .text('Next ▶️', `list:1`) : null;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      await ctx.reply('Error listing rides: ' + error.message);
    }
  }

  async handleListPage(ctx) {
    try {
      const PAGE_SIZE = 5;
      const page = parseInt(ctx.match[1]);
      
      const { total, rides } = await this.storage.getRidesByCreator(
        ctx.from.id,
        page * PAGE_SIZE,
        PAGE_SIZE
      );

      const message = `Found ${total} ride${total !== 1 ? 's' : ''}\n\n${this.formatRidesList(rides)}`;
      
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const keyboard = new InlineKeyboard();
      
      if (page > 0) {
        keyboard.text('◀️ Prev', `list:${page - 1}`);
      }
      if (page < totalPages - 1) {
        keyboard.text('Next ▶️', `list:${page + 1}`);
      }

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.length > 0 ? keyboard : undefined
      });
      await ctx.answerCallbackQuery();
    } catch (error) {
      await ctx.answerCallbackQuery('Error loading rides');
    }
  }
} 
