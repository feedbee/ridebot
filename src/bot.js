import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from './config.js';
import { RouteParser } from './utils/route-parser.js';
import { StorageInterface } from './storage/interface.js';
import { DateParser } from './utils/date-parser.js';

export class BikeRideBot {
  /**
   * @param {StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.bot = new Bot(config.bot.token);
    this.wizardStates = new Map();
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
    this.bot.callbackQuery(/^join:(.+)$/, this.handleJoinRide.bind(this));
    this.bot.callbackQuery(/^leave:(.+)$/, this.handleLeaveRide.bind(this));
    this.bot.callbackQuery(/^delete:(\w+):(\w+)$/, this.handleDeleteConfirmation.bind(this));
    this.bot.callbackQuery(/^list:(\d+)$/, this.handleListRides.bind(this));
    this.bot.callbackQuery(/^wizard:(\w+)(?::(\w+))?$/, this.handleWizardAction.bind(this));
    this.bot.on('message:text', this.handleWizardInput.bind(this));
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

  /**
   * Generate a unique key for wizard state based on user ID and chat ID
   * @param {number} userId - Telegram user ID
   * @param {number} chatId - Telegram chat ID
   * @returns {string} Composite key for wizard state
   */
  getWizardStateKey(userId, chatId) {
    return `${userId}:${chatId}`;
  }

  async handleNewRide(ctx) {
    // If parameters are provided, use the old behavior
    if (ctx.message.text.includes('\n')) {
      const params = this.parseCommandParams(ctx.message.text);
      return this.handleNewRideWithParams(ctx, params);
    }

    // Check if there's already an active wizard in this chat
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    if (this.wizardStates.has(stateKey)) {
      await ctx.reply('Please complete or cancel the current ride creation wizard before starting a new one.');
      return;
    }

    // Otherwise, start the wizard
    const state = {
      step: 'title',
      data: {
        chatId: ctx.chat.id,
        createdBy: ctx.from.id
      },
      lastMessageId: null // Track the last wizard message
    };
    this.wizardStates.set(stateKey, state);

    await this.sendWizardStep(ctx);
  }

  /**
   * Parse and validate date/time input
   * @param {string} text - Date/time text to parse
   * @param {Context} ctx - Grammy context for sending error messages
   * @returns {Date|null} Parsed date or null if invalid
   */
  async parseDateTimeInput(text, ctx) {
    const parsedDate = DateParser.parseDateTime(text);
    if (!parsedDate) {
      await ctx.reply('❌ I couldn\'t understand that date/time format. Please try something like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30');
      return null;
    }
    
    if (DateParser.isPast(parsedDate.date)) {
      await ctx.reply('❌ The ride can\'t be scheduled in the past! Please provide a future date and time.');
      return null;
    }

    return parsedDate.date;
  }

  async handleNewRideWithParams(ctx, params) {
    if (!params.title || !params.when) {
      await ctx.reply(
        'Please provide at least title and date/time. Use /help for format example.'
      );
      return;
    }

    try {
      const date = await this.parseDateTimeInput(params.when, ctx);
      if (!date) return;
      
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
      
      if (params.when) {
        const date = await this.parseDateTimeInput(params.when, ctx);
        if (!date) return;
        updates.date = date;
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
    const { date: dateStr, time: timeStr } = DateParser.formatDateTime(ride.date);

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
      return `🎫 *Ride #${ride.id}*${status}\n🚲 ${ride.title}\n📅 ${dateStr} ${timeStr}\n`;
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

  async handleWizardAction(ctx) {
    const [action, param] = ctx.match.slice(1);
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);

    if (!state) {
      await ctx.answerCallbackQuery('Wizard session expired');
      return;
    }

    try {
      switch (action) {
        case 'back':
          switch (state.step) {
            case 'date': state.step = 'title'; break;
            case 'route': state.step = 'date'; break;
            case 'distance': state.step = 'route'; break;
            case 'duration': state.step = 'distance'; break;
            case 'speed': state.step = 'duration'; break;
            case 'meet': state.step = 'speed'; break;
            case 'confirm': state.step = 'meet'; break;
          }
          // Delete the current message since we're going back
          await ctx.deleteMessage();
          await this.sendWizardStep(ctx);
          break;

        case 'skip':
          switch (state.step) {
            case 'route': state.step = 'distance'; break;
            case 'distance': state.step = 'duration'; break;
            case 'duration': state.step = 'speed'; break;
            case 'speed': state.step = 'meet'; break;
            case 'meet': state.step = 'confirm'; break;
          }
          // Update the current message with new step
          await this.sendWizardStep(ctx, true);
          break;

        case 'cancel':
          await ctx.deleteMessage();
          this.wizardStates.delete(stateKey);
          await ctx.reply('Ride creation cancelled');
          await ctx.answerCallbackQuery();
          return;

        case 'confirm':
          const ride = await this.storage.createRide(state.data);
          const participants = await this.storage.getParticipants(ride.id);
          const keyboard = new InlineKeyboard()
            .text(config.buttons.join, `join:${ride.id}`);

          const message = this.formatRideMessage(ride, participants);
          await ctx.deleteMessage();
          const sentMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });

          await this.storage.updateRide(ride.id, {
            messageId: sentMessage.message_id
          });

          this.wizardStates.delete(stateKey);
          await ctx.answerCallbackQuery('Ride created successfully!');
          return;
      }

      await ctx.answerCallbackQuery();
    } catch (error) {
      await ctx.answerCallbackQuery('Error: ' + error.message);
    }
  }

  async handleWizardInput(ctx) {
    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) return;

    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    if (!state) return;

    try {
      switch (state.step) {
        case 'title':
          state.data.title = ctx.message.text;
          state.step = 'date';
          break;

        case 'date':
          const date = await this.parseDateTimeInput(ctx.message.text, ctx);
          if (!date) return;

          state.data.datetime = date;
          const { date: dateStr, time: timeStr } = DateParser.formatDateTime(date);
          state.data.date = dateStr;
          state.data.time = timeStr;
          state.step = 'route';
          break;

        case 'route':
          if (RouteParser.isValidRouteUrl(ctx.message.text)) {
            state.data.routeLink = ctx.message.text;
            if (RouteParser.isKnownProvider(ctx.message.text)) {
              const routeInfo = await RouteParser.parseRoute(ctx.message.text);
              if (routeInfo) {
                state.data.distance = routeInfo.distance;
                state.data.duration = routeInfo.duration;
                state.step = 'speed';
              }
            } else {
              state.step = 'distance';
            }
          } else {
            await ctx.reply('Invalid route URL format. Please provide a valid URL or click Skip.');
            return;
          }
          break;

        case 'distance':
          state.data.distance = parseFloat(ctx.message.text);
          state.step = 'duration';
          break;

        case 'duration':
          state.data.duration = parseInt(ctx.message.text);
          state.step = 'speed';
          break;

        case 'speed':
          const [min, max] = ctx.message.text.split('-').map(s => parseFloat(s.trim()));
          if (!isNaN(min)) state.data.speedMin = min;
          if (!isNaN(max)) state.data.speedMax = max;
          state.step = 'meet';
          break;

        case 'meet':
          state.data.meetingPoint = ctx.message.text;
          state.step = 'confirm';
          break;
      }

      // Delete user's input message
      await ctx.deleteMessage();
      
      // Delete previous wizard message if it exists
      if (state.lastMessageId) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, state.lastMessageId);
        } catch (error) {
          console.error('Error deleting previous wizard message:', error);
        }
      }

      await this.sendWizardStep(ctx);
    } catch (error) {
      await ctx.reply('Error: ' + error.message);
    }
  }

  async sendWizardStep(ctx, edit = false) {
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    if (!state) return;

    const keyboard = new InlineKeyboard();
    let message = '';

    switch (state.step) {
      case 'title':
        message = '📝 Please enter the ride title:';
        keyboard.text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'date':
        message = '📅 Please enter the date and time (DD.MM.YYYY HH:MM):';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'route':
        message = '🔗 Please enter the route link (or skip):';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'distance':
        message = '📏 Please enter the distance in kilometers (or skip):';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'duration':
        message = '⏱ Please enter the duration in minutes (or skip):';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'speed':
        message = '🚴 Please enter the speed range in km/h (e.g., 25-28) or skip:';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'meet':
        message = '📍 Please enter the meeting point (or skip):';
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'confirm':
        const { title, date, routeLink, distance, duration, speedMin, speedMax, meetingPoint } = state.data;
        message = '*Please confirm the ride details:*\n\n';
        message += `📝 Title: ${title}\n`;
        message += `📅 Date: ${date.toLocaleDateString(config.dateFormat.locale)} ${date.toLocaleTimeString(config.dateFormat.locale, config.dateFormat.time)}\n`;
        if (routeLink) message += `🔗 Route: ${routeLink}\n`;
        if (distance) message += `📏 Distance: ${distance} km\n`;
        if (duration) {
          const hours = Math.floor(duration / 60);
          const minutes = duration % 60;
          message += `⏱ Duration: ${hours}h ${minutes}m\n`;
        }
        if (speedMin || speedMax) {
          message += '🚴 Speed: ';
          if (speedMin && speedMax) message += `${speedMin}-${speedMax} km/h\n`;
          else if (speedMin) message += `min ${speedMin} km/h\n`;
          else message += `max ${speedMax} km/h\n`;
        }
        if (meetingPoint) message += `📍 Meeting Point: ${meetingPoint}\n`;

        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.create, 'wizard:confirm')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
    }

    try {
      let sentMessage;
      if (edit && ctx.callbackQuery) {
        sentMessage = await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        sentMessage = await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
      state.lastMessageId = sentMessage.message_id;
    } catch (error) {
      console.error('Error sending wizard step:', error);
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
        const date = await this.parseDateTimeInput(params.when, ctx);
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
} 
