import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { RouteParser } from '../utils/route-parser.js';
import { DateParser } from '../utils/date-parser.js';
import { parseDateTimeInput } from '../utils/date-input-parser.js';

export class RideWizard {
  constructor(storage) {
    this.storage = storage;
    this.wizardStates = new Map();
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

    // Initialize wizard state with prefilled data if provided
    const state = {
      step: 'title',
      data: {
        chatId: ctx.chat.id,
        createdBy: ctx.from.id,
        ...(prefillData || {})  // Merge prefilled data if provided
      },
      lastMessageId: null,
      isUpdate: prefillData?.isUpdate || false,  // Flag to indicate if this is an update
      originalRideId: prefillData?.originalRideId // Store original ride ID for updates
    };
    this.wizardStates.set(stateKey, state);

    await this.sendWizardStep(ctx);
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

        case 'keep':
          // Move to the next step based on current step
          switch (state.step) {
            case 'title': state.step = 'date'; break;
            case 'date': state.step = 'route'; break;
            case 'route': state.step = 'distance'; break;
            case 'distance': state.step = 'duration'; break;
            case 'duration': state.step = 'speed'; break;
            case 'speed': state.step = 'meet'; break;
            case 'meet': state.step = 'confirm'; break;
          }
          await this.sendWizardStep(ctx, true);
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
          if (state.isUpdate) {
            // Update existing ride
            const updates = {
              title: state.data.title,
              date: state.data.datetime,
              meetingPoint: state.data.meetingPoint,
              routeLink: state.data.routeLink,
              distance: state.data.distance,
              duration: state.data.duration,
              speedMin: state.data.speedMin,
              speedMax: state.data.speedMax
            };

            const updatedRide = await this.storage.updateRide(state.data.originalRideId, updates);
            await this.updateRideMessage(updatedRide);
            await ctx.deleteMessage();
            this.wizardStates.delete(stateKey);
            await ctx.answerCallbackQuery('Ride updated successfully!');
          } else {
            // Create new ride
            const ride = await this.storage.createRide({
              title: state.data.title,
              date: state.data.datetime,
              chatId: state.data.chatId,
              createdBy: state.data.createdBy,
              meetingPoint: state.data.meetingPoint,
              routeLink: state.data.routeLink,
              distance: state.data.distance,
              duration: state.data.duration,
              speedMin: state.data.speedMin,
              speedMax: state.data.speedMax
            });

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
            await ctx.answerCallbackQuery(state.data.originalRideId ? 'Ride duplicated successfully!' : 'Ride created successfully!');
          }
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
          const date = await parseDateTimeInput(ctx.message.text, ctx);
          if (!date) return;

          state.data.datetime = date;
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

    // Helper to get current value display
    const getCurrentValue = (field, formatter = null) => {
      const value = state.data[field];
      if (value === undefined || value === null) return '';
      return `\n\nCurrent value: ${formatter ? formatter(value) : value}`;
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
        keyboard.text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'date':
        const dateFormatter = (date) => date.toLocaleString(config.dateFormat.locale);
        message = '📅 When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30' + 
          getCurrentValue('datetime', dateFormatter);
        addKeepButton('datetime');
        keyboard
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'route':
        message = '🔗 Please enter the route link (or skip):' + getCurrentValue('routeLink');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('routeLink');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'distance':
        message = '📏 Please enter the distance in kilometers (or skip):' + 
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
          const hours = Math.floor(mins / 60);
          const minutes = mins % 60;
          return `${hours}h ${minutes}m`;
        };
        message = '⏱ Please enter the duration in minutes (or skip):' + 
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
          return '';
        };
        message = '🚴 Please enter the speed range in km/h (e.g., 25-28) or skip:' + 
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
        message = '📍 Please enter the meeting point (or skip):' + getCurrentValue('meetingPoint');
        keyboard
          .text(config.buttons.back, 'wizard:back');
        addKeepButton('meetingPoint');
        keyboard
          .text(config.buttons.skip, 'wizard:skip')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;

      case 'confirm':
        const { title, datetime, routeLink, distance, duration, speedMin, speedMax, meetingPoint } = state.data;
        message = `*Please confirm the ${state.isUpdate ? 'update' : 'ride'} details:*\n\n`;
        message += `📝 Title: ${title}\n`;
        message += `📅 Date: ${datetime.toLocaleDateString(config.dateFormat.locale)} ${datetime.toLocaleTimeString(config.dateFormat.locale, config.dateFormat.time)}\n`;
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
          .text(state.isUpdate ? config.buttons.update : config.buttons.create, 'wizard:confirm')
          .row()
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
    }

    try {
      let sentMessage;
      if (edit && ctx.callbackQuery) {
        // Get current message content and keyboard
        const currentMessage = ctx.callbackQuery.message;
        const currentText = currentMessage.text;
        const currentMarkup = JSON.stringify(currentMessage.reply_markup);
        const newMarkup = JSON.stringify(keyboard);

        // Only update if content or keyboard changed
        if (currentText !== message || currentMarkup !== newMarkup) {
          sentMessage = await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } else {
          // No changes, use current message
          sentMessage = currentMessage;
        }
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
      ? config.messageTemplates.cancelledInstructions.replace('{id}', ride.id)
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
} 
