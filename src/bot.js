import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from './config.js';
import { RouteParser } from './utils/route-parser.js';
import { StorageInterface } from './storage/interface.js';
import { DateParser } from './utils/date-parser.js';
import { RideWizard } from './wizard/RideWizard.js';
import { parseDateTimeInput } from './utils/date-input-parser.js';
import { escapeRideMarkdown, escapeMarkdown } from './utils/markdown-escape.js';

export class BikeRideBot {
  /**
   * @param {StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.bot = new Bot(config.bot.token);
    this.wizard = new RideWizard(storage);
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('newride', this.handleNewRide.bind(this));
    this.bot.command('updateride', this.handleUpdateRide.bind(this));
    this.bot.command('cancelride', this.handleCancelRide.bind(this));
    this.bot.command('deleteride', this.handleDeleteRide.bind(this));
    this.bot.command('listrides', this.handleListRides.bind(this));
    this.bot.command('dupride', this.handleDuplicateRide.bind(this));
    this.bot.command('dupridex', this.handleDuplicateRideWizard.bind(this));
    this.bot.command('updateridex', this.handleUpdateRideWizard.bind(this));
    this.bot.callbackQuery(/^join:(.+)$/, this.handleJoinRide.bind(this));
    this.bot.callbackQuery(/^leave:(.+)$/, this.handleLeaveRide.bind(this));
    this.bot.callbackQuery(/^delete:(\w+):(\w+)$/, this.handleDeleteConfirmation.bind(this));
    this.bot.callbackQuery(/^list:(\d+)$/, this.handleListRides.bind(this));
    this.bot.callbackQuery(/^wizard:(\w+)(?::(\w+))?$/, this.wizard.handleWizardAction.bind(this.wizard));
    this.bot.on('message:text', this.wizard.handleWizardInput.bind(this.wizard));
  }

  async handleHelp(ctx) {
    await ctx.reply(config.messageTemplates.help, { parse_mode: 'Markdown' });
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

  async handleNewRide(ctx, prefillData = null) {
    // If parameters are provided, use the old behavior
    if (ctx.message.text.includes('\n')) {
      const params = this.parseCommandParams(ctx.message.text);
      return this.handleNewRideWithParams(ctx, params);
    }

    // Start the wizard
    await this.wizard.startWizard(ctx, prefillData);
  }

  async handleNewRideWithParams(ctx, params) {
    if (!params.title || !params.when) {
      await ctx.reply(
        'Please provide at least title and date/time. Use /help for format example.'
      );
      return;
    }

    try {
      const result = parseDateTimeInput(params.when);
      if (!result.date) {
        await ctx.reply(result.error);
        return;
      }
      
      // First create the ride without messageId
      const rideData = {
        title: params.title,
        date: result.date,
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
      
      if (params.when) {
        const result = parseDateTimeInput(params.when);
        if (!result.date) {
          await ctx.reply(result.error);
          return;
        }
        updates.date = result.date;
      }

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
      await ctx.reply('Ride updated successfully!');
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
    // Escape Markdown in ride data
    const escapedRide = escapeRideMarkdown(ride);
    const { date: dateStr, time: timeStr } = DateParser.formatDateTime(escapedRide.date);

    let meetingInfo = '';
    if (escapedRide.meetingPoint) {
      meetingInfo = `\n📍 Meeting point: ${escapedRide.meetingPoint}`;
    }

    let routeInfo = '';
    if (escapedRide.routeLink) {
      routeInfo = `\n🔗 Route: ${escapedRide.routeLink}`;
    }

    let distanceInfo = '';
    if (escapedRide.distance) {
      distanceInfo = `\n📏 Distance: ${escapedRide.distance} km`;
    }

    let durationInfo = '';
    if (escapedRide.duration) {
      const hours = Math.floor(escapedRide.duration / 60);
      const minutes = escapedRide.duration % 60;
      durationInfo = `\n⏱ Duration: ${hours}h ${minutes}m`;
    }

    let speedInfo = '';
    if (escapedRide.speedMin || escapedRide.speedMax) {
      speedInfo = '\n🚴 Speed: ';
      if (escapedRide.speedMin && escapedRide.speedMax) {
        speedInfo += `${escapedRide.speedMin}-${escapedRide.speedMax} km/h`;
      } else if (escapedRide.speedMin) {
        speedInfo += `min ${escapedRide.speedMin} km/h`;
      } else {
        speedInfo += `max ${escapedRide.speedMax} km/h`;
      }
    }

    const participantList = participants.length > 0
      ? participants.map(p => `@${p.username}`).join('\n')
      : 'No participants yet';

    // Add ride ID in a visually pleasing way
    const rideInfo = `🎫 Ride #${escapedRide.id}`;

    const cancelledBadge = escapedRide.cancelled ? ` ${config.messageTemplates.cancelled}` : '';
    const joinInstructions = escapedRide.cancelled 
      ? config.messageTemplates.cancelledInstructions.replace('{id}', escapedRide.id)
      : `${rideInfo}\nClick the button below to join or leave the ride`;

    return config.messageTemplates.ride
      .replace('{title}', escapedRide.title)
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
      const dateStr = ride.date.toLocaleDateString(config.dateFormat.locale);
      const timeStr = ride.date.toLocaleTimeString(config.dateFormat.locale, config.dateFormat.time);
      const status = ride.cancelled ? ' ❌ Cancelled' : '';
      return `🎫 *Ride #${ride.id}*${status}\n🚲 ${escapeMarkdown(ride.title)}\n📅 ${dateStr} ${timeStr}\n`;
    }).join('\n');
  }

  async handleListRides(ctx) {
    try {
      const PAGE_SIZE = 5;
      // If it's a callback query, get page from match, otherwise start from 0
      const page = ctx.callbackQuery ? parseInt(ctx.match[1]) : 0;
      
      const { total, rides } = await this.storage.getRidesByCreator(
        ctx.from.id,
        page * PAGE_SIZE,
        PAGE_SIZE
      );

      const totalPages = Math.ceil(total / PAGE_SIZE);
      const keyboard = new InlineKeyboard();
      
      // Add Prev/Next navigation buttons if needed
      if (page > 0) {
        keyboard.text(config.buttons.previous, `list:${page - 1}`);
      }
      if (page < totalPages - 1) {
        keyboard.text(config.buttons.next, `list:${page + 1}`);
      }

      const message = `Found ${total} ride${total !== 1 ? 's' : ''}\n\n${this.formatRidesList(rides)}`;
      const pageInfo = totalPages > 1 ? `\nPage ${page + 1} of ${totalPages}` : '';

      if (ctx.callbackQuery) {
        // Update existing message
        await ctx.editMessageText(message + pageInfo, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        await ctx.answerCallbackQuery();
      } else {
        // Send new message
        await ctx.reply(message + pageInfo, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
    } catch (error) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery('Error loading rides');
      } else {
        await ctx.reply('Error listing rides: ' + error.message);
      }
    }
  }

  async handleDuplicateRide(ctx) {
    const { ride, error } = await this.extractRide(ctx);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      // Parse optional override parameters
      const params = this.parseCommandParams(ctx.message.text);
      
      // Create a new ride object with the same properties
      const newRideData = {
        title: params.title || `Copy of ${ride.title}`,
        chatId: ctx.chat.id,
        createdBy: ctx.from.id,
        meetingPoint: ride.meetingPoint,
        routeLink: ride.routeLink,
        distance: ride.distance,
        duration: ride.duration,
        speedMin: ride.speedMin,
        speedMax: ride.speedMax,
        // Default to tomorrow if no date provided
        date: new Date(ride.date.getTime() + 24 * 60 * 60 * 1000)
      };

      // Override properties with provided parameters
      if (params.when) {
        const date = await parseDateTimeInput(params.when, ctx);
        if (!date) return;
        newRideData.date = date;
      }

      if (params.meet) {
        newRideData.meetingPoint = params.meet;
      }

      if (params.route) {
        if (RouteParser.isValidRouteUrl(params.route)) {
          newRideData.routeLink = params.route;
          // Only try to parse details if it's a known provider
          if (RouteParser.isKnownProvider(params.route)) {
            const routeInfo = await RouteParser.parseRoute(params.route);
            if (routeInfo) {
              if (!params.dist) newRideData.distance = routeInfo.distance;
              if (!params.time) newRideData.duration = routeInfo.duration;
            }
          }
        } else {
          await ctx.reply('Invalid route URL format. Please provide a valid URL.');
          return;
        }
      }

      if (params.dist) {
        newRideData.distance = parseFloat(params.dist);
      }

      if (params.time) {
        newRideData.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) newRideData.speedMin = min;
        if (!isNaN(max)) newRideData.speedMax = max;
      }

      const newRide = await this.storage.createRide(newRideData);
      const participants = await this.storage.getParticipants(newRide.id);
      const keyboard = new InlineKeyboard()
        .text(config.buttons.join, `join:${newRide.id}`);

      const message = this.formatRideMessage(newRide, participants);
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      await this.storage.updateRide(newRide.id, {
        messageId: sentMessage.message_id
      });

      await ctx.reply('Ride duplicated successfully!' + (params.when ? '' : ' The new ride is scheduled for tomorrow at the same time.'));
    } catch (error) {
      await ctx.reply('Error duplicating ride: ' + error.message);
    }
  }

  async handleDuplicateRideWizard(ctx) {
    const { ride, error } = await this.extractRide(ctx);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      // Prefill data from the existing ride
      const prefillData = {
        title: `Copy of ${ride.title}`,
        datetime: new Date(ride.date.getTime() + 24 * 60 * 60 * 1000), // Tomorrow by default
        meetingPoint: ride.meetingPoint,
        routeLink: ride.routeLink,
        distance: ride.distance,
        duration: ride.duration,
        speedMin: ride.speedMin,
        speedMax: ride.speedMax,
        originalRideId: ride.id
      };

      // Start the wizard with prefilled data
      await this.wizard.startWizard(ctx, prefillData);
    } catch (error) {
      await ctx.reply('Error starting duplicate wizard: ' + error.message);
    }
  }

  async handleUpdateRideWizard(ctx) {
    const { ride, error } = await this.extractRide(ctx, true);
    
    if (error) {
      await ctx.reply(error);
      return;
    }

    try {
      // Prefill data from the existing ride
      const prefillData = {
        title: ride.title,
        datetime: ride.date,
        meetingPoint: ride.meetingPoint,
        routeLink: ride.routeLink,
        distance: ride.distance,
        duration: ride.duration,
        speedMin: ride.speedMin,
        speedMax: ride.speedMax,
        isUpdate: true,
        originalRideId: ride.id
      };

      // Start the wizard with prefilled data
      await this.wizard.startWizard(ctx, prefillData);
    } catch (error) {
      await ctx.reply('Error starting update wizard: ' + error.message);
    }
  }
} 
