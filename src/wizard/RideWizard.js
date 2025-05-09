import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { RouteParser } from '../utils/route-parser.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';
import { normalizeCategory, DEFAULT_CATEGORY, VALID_CATEGORIES } from '../utils/category-utils.js';
import { escapeHtml } from '../utils/html-escape.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { RideService } from '../services/RideService.js';
import { checkBotAdminPermissions } from '../utils/permission-checker.js';
import { parseDuration } from '../utils/duration-parser.js';
import { RideMessagesService } from '../services/RideMessagesService.js';
import { DateParser } from '../utils/date-parser.js';

export class RideWizard {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   */
  constructor(storage, rideService, messageFormatter, rideMessagesService) {
    this.storage = storage;
    this.rideService = rideService;
    this.messageFormatter = messageFormatter;
    this.rideMessagesService = rideMessagesService;
    this.wizardStates = new Map();
  }
  
  /**
   * Check if the bot has admin permissions and notify the user if not
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {boolean} cleanupState - Whether to clean up the wizard state if permissions are missing
   * @returns {Promise<boolean>} - True if the bot has admin permissions, false otherwise
   */
  async checkAdminPermissions(ctx, cleanupState = false) {
    // Skip permission check for private chats (type 'private')
    if (ctx.chat.type === 'private') {
      return true;
    }
    
    const hasAdminPermissions = await checkBotAdminPermissions(ctx);
    if (!hasAdminPermissions) {
      if (cleanupState) {
        const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
        this.wizardStates.delete(stateKey);
      }
      
      await ctx.reply('⚠️ I need administrator permissions in group chats to use the wizard mode. Please add me as an administrator or use the non-wizard commands instead.');
      return false;
    }
    return true;
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

  async startWizard(ctx, prefillData = null) {
    // Check if there's already an active wizard in this chat
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    if (this.wizardStates.has(stateKey)) {
      await ctx.reply('Please complete or cancel the current ride creation wizard before starting a new one.');
      return;
    }

    // Check if wizards are only allowed in private chats
    if (config.bot.wizardOnlyInPrivateChats && ctx.chat.type !== 'private') {
      await ctx.reply('⚠️ Wizard commands are only available in private chats with the bot. Please use the command with parameters instead.');
      return;
    }

    // Check if the bot has admin permissions in the chat
    if (!await this.checkAdminPermissions(ctx)) {
      return;
    }

    // Initialize wizard state with prefilled data if provided
    const state = {
      step: 'title',
      data: {
        chatId: ctx.chat.id,
        currentUser: ctx.from.id,
        // Store message thread ID if present
        messageThreadId: ctx.message?.message_thread_id,
        ...(prefillData || {})  // Merge prefilled data if provided
      },
      isUpdate: prefillData?.isUpdate || false,  // Flag to indicate if this is an update
      originalRideId: prefillData?.originalRideId, // Store original ride ID for updates
      errorMessageIds: [], // Track error message IDs
      primaryMessageId: null // Track the primary wizard message ID
    };
    this.wizardStates.set(stateKey, state);

    // Send initial wizard message and store its ID
    const message = await this.sendWizardStep(ctx);
    if (message) {
      state.primaryMessageId = message.message_id;
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
    
    // Check if wizards are only allowed in private chats
    if (config.bot.wizardOnlyInPrivateChats && ctx.chat.type !== 'private') {
      await ctx.answerCallbackQuery('⚠️ Wizard commands are only available in private chats with the bot');
      this.wizardStates.delete(stateKey);
      return;
    }
    
    // Check if the bot has admin permissions in the chat
    // This will automatically pass for private chats
    if (!await this.checkAdminPermissions(ctx, true)) {
      await ctx.answerCallbackQuery('⚠️ I need administrator permissions in group chats to use the wizard mode');
      return;
    }

    try {
      switch (action) {
        case 'category':
          if (VALID_CATEGORIES.includes(param)) {
            state.data.category = param;
            state.step = 'organizer';
            await this.sendWizardStep(ctx, true);
          } else {
            await ctx.answerCallbackQuery('Invalid category selected');
          }
          break;

        case 'back':
          switch (state.step) {
            case 'category': state.step = 'title'; break;
            case 'organizer': state.step = 'category'; break;
            case 'date': state.step = 'organizer'; break;
            case 'route': state.step = 'date'; break;
            case 'distance': state.step = 'route'; break;
            case 'duration': state.step = 'distance'; break;
            case 'speed': state.step = 'duration'; break;
            case 'meet': state.step = 'speed'; break;
            case 'info': state.step = 'meet'; break;
            case 'confirm': state.step = 'info'; break;
          }
          await this.sendWizardStep(ctx, true);
          break;

        case 'keep':
          // Move to the next step based on current step
          switch (state.step) {
            case 'title': state.step = 'category'; break;
            case 'category': state.step = 'organizer'; break;
            case 'organizer': state.step = 'date'; break;
            case 'date': state.step = 'route'; break;
            case 'route': state.step = 'distance'; break;
            case 'distance': state.step = 'duration'; break;
            case 'duration': state.step = 'speed'; break;
            case 'speed': state.step = 'meet'; break;
            case 'meet': state.step = 'info'; break;
            case 'info': state.step = 'confirm'; break;
          }
          await this.sendWizardStep(ctx, true);
          break;

        case 'skip':
          // Clear the current field value when skipped
          switch (state.step) {
            case 'category': 
              state.data.category = undefined;
              state.step = 'organizer'; 
              break;
            case 'organizer': 
              state.data.organizer = '';
              state.step = 'date'; 
              break;
            case 'route': 
              state.data.routeLink = undefined;
              state.step = 'distance'; 
              break;
            case 'distance': 
              state.data.distance = undefined;
              state.step = 'duration'; 
              break;
            case 'duration': 
              state.data.duration = undefined;
              state.step = 'speed'; 
              break;
            case 'speed': 
              state.data.speedMin = undefined;
              state.data.speedMax = undefined;
              state.step = 'meet'; 
              break;
            case 'meet': 
              state.data.meetingPoint = undefined;
              state.step = 'info'; 
              break;
            case 'info': 
              state.data.additionalInfo = undefined;
              state.step = 'confirm'; 
              break;
          }
          // Update the current message with new step
          await this.sendWizardStep(ctx, true);
          break;

        case 'cancel':
          // Delete error messages first
          for (const messageId of state.errorMessageIds.reverse()) {
            try {
              await ctx.api.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
              console.error('Error deleting error message:', error);
            }
          }
          await ctx.deleteMessage();
          this.wizardStates.delete(stateKey);
          await ctx.reply('Ride creation cancelled');
          await ctx.answerCallbackQuery();
          return;

        case 'confirm':
          if (state.isUpdate) {
            // Update existing ride
            const updates = {
              title: state.data.title,
              category: state.data.category || DEFAULT_CATEGORY,
              date: state.data.datetime,
              organizer: state.data.organizer,
              meetingPoint: state.data.meetingPoint,
              routeLink: state.data.routeLink,
              distance: state.data.distance,
              duration: state.data.duration,
              speedMin: state.data.speedMin,
              speedMax: state.data.speedMax,
              additionalInfo: state.data.additionalInfo,
              updatedBy: state.data.currentUser // Set updatedBy to the current user
            };

            const updatedRide = await this.storage.updateRide(state.data.originalRideId, updates);
            await this.updateRideMessage(updatedRide, ctx);
            await ctx.deleteMessage();
            this.wizardStates.delete(stateKey);
            await ctx.answerCallbackQuery('Ride updated successfully!');
          } else {
            // Create new ride
            const ride = await this.storage.createRide({
              title: state.data.title,
              category: state.data.category || DEFAULT_CATEGORY,
              date: state.data.datetime,
              messages: [], // Initialize with empty array instead of null messageId
              createdBy: state.data.currentUser,
              organizer: state.data.organizer,
              meetingPoint: state.data.meetingPoint,
              routeLink: state.data.routeLink,
              distance: state.data.distance,
              duration: state.data.duration,
              speedMin: state.data.speedMin,
              speedMax: state.data.speedMax,
              additionalInfo: state.data.additionalInfo
            });

            // Delete the wizard message before creating the ride message
            await ctx.deleteMessage();
            
            // Create the ride message
            await this.rideMessagesService.createRideMessage(ride, ctx, state.data.messageThreadId);

            this.wizardStates.delete(stateKey);
            await ctx.answerCallbackQuery(state.data.originalRideId ? 'Ride duplicated successfully!' : 'Ride created successfully!');
          }
          return;
      }

      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error('Error in handleWizardAction:', error);
      await ctx.answerCallbackQuery('Error: ' + error.message);
    }
  }

  async handleWizardInput(ctx) {
    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) return;

    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    if (!state) return;
    
    // Check if wizards are only allowed in private chats
    if (config.bot.wizardOnlyInPrivateChats && ctx.chat.type !== 'private') {
      await ctx.reply('⚠️ Wizard commands are only available in private chats with the bot. Please use the command with parameters instead.');
      this.wizardStates.delete(stateKey);
      return;
    }
    
    // Check if the bot has admin permissions in the chat
    if (!await this.checkAdminPermissions(ctx, true)) {
      return;
    }

    try {
      let shouldProceed = true;
      state.errorMessageIds.push(ctx.message.message_id); // Always delete user's input

      switch (state.step) {
        case 'title':
          state.data.title = ctx.message.text;
          state.step = 'category';
          break;

        case 'category':
          // Validate and normalize the ride category
          state.data.category = normalizeCategory(ctx.message.text);
          state.step = 'organizer';
          break;
          
        case 'organizer':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.organizer = '';
          } else {
            state.data.organizer = ctx.message.text;
          }
          state.step = 'date';
          break;

        case 'date':
          const result = parseDateTimeInput(ctx.message.text);
          if (!result.date) {
            shouldProceed = false;
            const errorMsg = await ctx.reply(result.error);
            state.errorMessageIds.push(errorMsg.message_id);
            return;
          }
          state.data.datetime = result.date;
          state.step = 'route';
          break;

        case 'route':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.routeLink = '';
            state.step = 'distance';
          } else if (RouteParser.isValidRouteUrl(ctx.message.text)) {
            state.data.routeLink = ctx.message.text;
            if (RouteParser.isKnownProvider(ctx.message.text)) {
              const routeInfo = await RouteParser.parseRoute(ctx.message.text);
              
              // Set any data that was successfully parsed
              if (routeInfo) {
                if (routeInfo.distance) state.data.distance = routeInfo.distance;
                if (routeInfo.duration) state.data.duration = routeInfo.duration;
              }
              
              // Determine next step based on what data we have
              if (state.data.distance && state.data.duration) {
                // If we have both distance and duration, skip to speed
                state.step = 'speed';
              } else if (state.data.distance) {
                // If we only have distance, go to duration
                state.step = 'duration';
              } else {
                // If we have neither, start with distance
                state.step = 'distance';
              }
            } else {
              state.step = 'distance';
            }
          } else {
            shouldProceed = false;
            const errorMsg = await ctx.reply('Invalid route URL format. Please provide a valid URL, use a dash (-) to clear the field, or click Skip.');
            state.errorMessageIds.push(errorMsg.message_id);
            return;
          }
          break;

        case 'distance':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.distance = null;
            state.step = 'duration';
          } else {
            const distance = parseFloat(ctx.message.text);
            if (isNaN(distance)) {
              shouldProceed = false;
              const errorMsg = await ctx.reply('Please enter a valid number for distance, or use a dash (-) to clear the field.');
              state.errorMessageIds.push(errorMsg.message_id);
              return;
            }
            state.data.distance = distance;
            state.step = 'duration';
          }
          break;

        case 'duration':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.duration = null;
            state.step = 'speed';
          } else {
            const result = parseDuration(ctx.message.text);
            if (result.error) {
              shouldProceed = false;
              const errorMsg = await ctx.reply(result.error);
              state.errorMessageIds.push(errorMsg.message_id);
              return;
            }
            state.data.duration = result.duration;
            state.step = 'speed';
          }
          break;

        case 'speed':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.speedMin = null;
            state.data.speedMax = null;
            state.step = 'meet';
          } else {
            const [min, max] = ctx.message.text.split('-').map(s => parseFloat(s.trim()));
            if (!isNaN(min)) state.data.speedMin = min;
            if (!isNaN(max)) state.data.speedMax = max;
            state.step = 'meet';
          }
          break;

        case 'meet':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.meetingPoint = '';
          } else {
            state.data.meetingPoint = ctx.message.text;
          }
          state.step = 'info';
          break;

        case 'info':
          // Check if user wants to clear the field with a dash
          if (ctx.message.text === '-') {
            state.data.additionalInfo = '';
          } else {
            state.data.additionalInfo = ctx.message.text;
          }
          state.step = 'confirm';
          break;
      }

      // Delete error messages and user inputs in reverse order (newest first)
      for (const messageId of state.errorMessageIds.reverse()) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, messageId);
        } catch (error) {
          console.error('Error deleting message:', error);
        }
      }

      if (shouldProceed) {
        // Clear error message IDs when proceeding to next step
        state.errorMessageIds = [];
        await this.sendWizardStep(ctx, true);
      }
    } catch (error) {
      console.error('Error in handleWizardInput:', error);
    }
  }

  async sendWizardStep(ctx, edit = false) {
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    if (!state) return;

    const keyboard = new InlineKeyboard();
    let message = '';

    // Helper to get current value display
    const getCurrentValue = (field, formatter = null) => {
      const value = state.data[field];
      if (value === undefined || value === null) return '';
      const formattedValue = formatter ? formatter(value) : value;
      return `\n\nCurrent value: ${escapeHtml(formattedValue.toString())}`;
    };

    // Helper to check if there's a current value
    const hasCurrentValue = (field) => {
      const value = state.data[field];
      return value !== undefined && value !== null;
    };

    // Helper to add keep button if there's a current value
    const addKeepButton = (field) => {
      if (hasCurrentValue(field)) {
        keyboard.text(config.buttons.keep, 'wizard:keep');
      }
    };

    switch (state.step) {
      case 'title':
        message = '📝 Please enter the ride title:' + getCurrentValue('title');
        addKeepButton('title');
        keyboard
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
        
      case 'category':
        message = '🚲 Please select the ride category:' + getCurrentValue('category');
        
        keyboard
          .text('Road Ride', 'wizard:category:Road Ride')
          .text('Gravel Ride', 'wizard:category:Gravel Ride')
          .row()
          .text('Mountain/Enduro/Downhill Ride', 'wizard:category:Mountain/Enduro/Downhill Ride')
          .text('MTB-XC Ride', 'wizard:category:MTB-XC Ride')
          .row()
          .text('E-Bike Ride', 'wizard:category:E-Bike Ride')
          .text('Virtual/Indoor Ride', 'wizard:category:Virtual/Indoor Ride')
          .row()
          .text(config.buttons.back, 'wizard:back');
        
        addKeepButton('category');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
        
      case 'organizer':
        message = '👤 Who is organizing this ride?\n<i>Enter a dash (-) to clear/skip this field</i>' + 
          getCurrentValue('organizer');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('organizer');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'date':
        const dateFormatter = (date) => {
          if (!(date instanceof Date) || isNaN(date)) return '';
          const formattedDateTime = DateParser.formatDateTime(date);
          return `${formattedDateTime.date} at ${formattedDateTime.time}`;
        };
        message = '📅 When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30' + 
          getCurrentValue('datetime', dateFormatter);
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('datetime');
        keyboard
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'route':
        message = '🔗 Please enter the route link (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>' + getCurrentValue('routeLink');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('routeLink');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'distance':
        message = '📏 Please enter the distance in kilometers (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>' + 
          getCurrentValue('distance', v => `${v} km`);
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('distance');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'duration':
        const durationFormatter = (mins) => {
          if (!mins && mins !== 0) return '';
          const hours = Math.floor(mins / 60);
          const minutes = mins % 60;
          return `${hours}h ${minutes}m`;
        };
        message = '⏱ Please enter the duration (e.g., "2h 30m", "90m", "1.5h"):\n<i>Enter a dash (-) to clear/skip this field</i>' + 
          getCurrentValue('duration', durationFormatter);
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('duration');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'speed':
        const speedFormatter = (speed) => {
          if (state.data.speedMin && state.data.speedMax) {
            return `${state.data.speedMin}-${state.data.speedMax} km/h`;
          } else if (state.data.speedMin) {
            return `min ${state.data.speedMin} km/h`;
          } else if (state.data.speedMax) {
            return `max ${state.data.speedMax} km/h`;
          }
          return speed || '';
        };
        message = '🚴 Please enter the speed range in km/h (e.g., 25-28) or skip:\n<i>Enter a dash (-) to clear/skip this field</i>' + 
          getCurrentValue('speedMin', speedFormatter);
        keyboard
          .text(config.buttons.back, 'wizard:back');
        if (state.data.speedMin || state.data.speedMax) {
          keyboard.text(config.buttons.keep, 'wizard:keep');
        }
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'meet':
        message = '📍 Please enter the meeting point (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>' + getCurrentValue('meetingPoint');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('meetingPoint');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'info':
        message = 'ℹ️ Please enter any additional information (or skip):\n<i>Enter a dash (-) to clear/skip this field</i>' + getCurrentValue('additionalInfo');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('additionalInfo');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'confirm':
        // Set default organizer name if not provided
        if (!state.data.organizer) {
          // Format organizer name in the same format as participant names but without the link
          let organizerName = '';
          if (ctx.from.first_name || ctx.from.last_name) {
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            if (ctx.from.username) {
              organizerName = `${fullName} (@${ctx.from.username})`;
            } else {
              organizerName = fullName;
            }
          } else if (ctx.from.username) {
            organizerName = ctx.from.username.includes(' ') ? ctx.from.username : `@${ctx.from.username}`;
          }
          state.data.organizer = organizerName;
        }
        
        const { title, category, datetime, routeLink, distance, duration, speedMin, speedMax, meetingPoint, additionalInfo, organizer } = state.data;
        message = `<b>Please confirm the ${state.isUpdate ? 'update' : 'ride'} details:</b>\n\n`;
        message += `📝 Title: ${escapeHtml(title)}\n`;
        message += `🚲 Category: ${category || DEFAULT_CATEGORY}\n`;
        message += `👤 Organizer: ${escapeHtml(organizer)}\n`;
        // Use DateParser for consistent timezone handling
        const formattedDateTime = DateParser.formatDateTime(datetime);
        message += `📅 When: ${formattedDateTime.date} at ${formattedDateTime.time}\n`;
        if (routeLink) message += `🔗 Route: ${escapeHtml(routeLink)}\n`;
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
        if (meetingPoint) message += `📍 Meeting Point: ${escapeHtml(meetingPoint)}\n`;
        if (additionalInfo) message += `ℹ️ Additional Info: ${escapeHtml(additionalInfo)}\n`;

        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(state.isUpdate ? config.buttons.update : config.buttons.create, 'wizard:confirm')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
    }

    try {
      let sentMessage;
      if (edit && state.primaryMessageId) {
        // Update existing message
        try {
          sentMessage = await ctx.api.editMessageText(ctx.chat.id, state.primaryMessageId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
        } catch (error) {
          console.error('Error updating wizard message:', error);
          
          // Check if this is a permission error
          if (error.description && (error.description.includes('not enough rights') || 
              error.description.includes('bot was kicked') || 
              error.description.includes('bot is not a member'))) {
            // Use our utility method to handle the permission error
            await this.checkAdminPermissions(ctx, true);
            return null;
          }
          
          // If update fails for other reasons (e.g., message too old), send a new message
          sentMessage = await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
          state.primaryMessageId = sentMessage.message_id;
        }
      } else {
        // Send new message
        sentMessage = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        state.primaryMessageId = sentMessage.message_id;
      }
      return sentMessage;
    } catch (error) {
      console.error('Error sending wizard step:', error);
      
      // Check if this is a permission error
      if (error.description && (error.description.includes('not enough rights') || 
          error.description.includes('bot was kicked') || 
          error.description.includes('bot is not a member'))) {
        // Use our utility method to handle the permission error
        await this.checkAdminPermissions(ctx, true);
      }
      return null;
    }
  }

  async updateRideMessage(ride, ctx) {
    // Use the centralized method in RideService
    const result = await this.rideMessagesService.updateRideMessages(ride, ctx);
    
    if (!result.success) {
      console.error('Error updating ride messages:', result.error);
    } else if (result.removedCount > 0) {
      console.info(`Removed ${result.removedCount} unavailable messages from tracking for ride ${ride.id}`);
    }
  }
  

} 
