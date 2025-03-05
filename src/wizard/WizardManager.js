import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { RouteParser } from '../utils/route-parser.js';
import { DateParser } from '../utils/date-parser.js';

export class WizardManager {
  constructor(storage) {
    this.storage = storage;
    this.wizardStates = new Map();
  }

  getStateKey(userId, chatId) {
    return `${userId}:${chatId}`;
  }

  async startWizard(ctx) {
    const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
    
    // Check if there's already an active wizard
    if (this.wizardStates.has(stateKey)) {
      await ctx.reply('You already have an active ride creation wizard. Please complete or cancel it first.');
      await this.sendStep(ctx);
      return;
    }

    // Initialize wizard state
    this.wizardStates.set(stateKey, {
      step: 'title',
      data: {},
      currentQuestionId: null,  // Track current question message
      currentAnswerId: null,    // Track current answer message
      errorMessageIds: []       // Track error messages
    });

    await this.sendStep(ctx);
  }

  async handleAction(ctx) {
    const [action, param] = ctx.match.slice(1);
    const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);

    if (!state) {
      await ctx.answerCallbackQuery('No active wizard found');
      return;
    }

    try {
      switch (action) {
        case 'back':
          await this.handleBack(ctx, state);
          break;
        case 'skip':
          await this.handleSkip(ctx, state);
          break;
        case 'cancel':
          await this.handleCancel(ctx);
          break;
        case 'confirm':
          await this.handleConfirm(ctx, state);
          break;
      }
    } catch (error) {
      await ctx.answerCallbackQuery('Error processing action');
      console.error('Error in wizard action:', error);
    }
  }

  async handleInput(ctx) {
    // Skip if no text message
    if (!ctx.message?.text) return;

    const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);

    // Skip if no active wizard
    if (!state) return;

    try {
      // Store the answer message ID
      state.currentAnswerId = ctx.message.message_id;
      
      await this.processStepInput(ctx, state);
    } catch (error) {
      const errorMessage = await ctx.reply('Error processing input: ' + error.message);
      state.errorMessageIds.push(errorMessage.message_id);
      console.error('Error in wizard input:', error);
    }
  }

  async processStepInput(ctx, state) {
    const input = ctx.message.text;

    switch (state.step) {
      case 'title':
        state.data.title = input;
        state.step = 'date';
        break;

      case 'date':
        const parsedDate = await this.parseDateTimeInput(input, ctx);
        if (!parsedDate) return; // Error message already sent
        state.data.date = parsedDate;
        state.step = 'route';
        break;

      case 'route':
        if (input.toLowerCase() === 'skip') {
          state.step = 'distance';
          break;
        }
        if (!RouteParser.isValidRouteUrl(input)) {
          const errorMessage = await ctx.reply('Invalid route URL format. Please provide a valid URL or type "skip" to skip.');
          state.errorMessageIds.push(errorMessage.message_id);
          return;
        }
        state.data.routeLink = input;
        // Try to parse route details if it's a known provider
        if (RouteParser.isKnownProvider(input)) {
          const routeInfo = await RouteParser.parseRoute(input);
          if (routeInfo) {
            state.data.distance = routeInfo.distance;
            state.data.duration = routeInfo.duration;
            // Skip distance and duration steps since we got them from the route
            state.step = 'speed';
            break;
          }
        }
        state.step = 'distance';
        break;

      case 'distance':
        if (input.toLowerCase() === 'skip') {
          state.step = 'duration';
          break;
        }
        const distance = parseFloat(input);
        if (isNaN(distance) || distance <= 0) {
          const errorMessage = await ctx.reply('Please enter a valid number for distance in kilometers or type "skip" to skip.');
          state.errorMessageIds.push(errorMessage.message_id);
          return;
        }
        state.data.distance = distance;
        state.step = 'duration';
        break;

      case 'duration':
        if (input.toLowerCase() === 'skip') {
          state.step = 'speed';
          break;
        }
        const duration = parseInt(input);
        if (isNaN(duration) || duration <= 0) {
          const errorMessage = await ctx.reply('Please enter ride duration in minutes or type "skip" to skip.');
          state.errorMessageIds.push(errorMessage.message_id);
          return;
        }
        state.data.duration = duration;
        state.step = 'speed';
        break;

      case 'speed':
        if (input.toLowerCase() === 'skip') {
          state.step = 'meet';
          break;
        }
        const speedMatch = input.match(/^(\d+)-(\d+)$/);
        if (!speedMatch) {
          const errorMessage = await ctx.reply('Please enter speed range in format "min-max" (e.g. "25-28") or type "skip" to skip.');
          state.errorMessageIds.push(errorMessage.message_id);
          return;
        }
        const [min, max] = speedMatch.slice(1).map(Number);
        if (min >= max) {
          const errorMessage = await ctx.reply('Minimum speed should be less than maximum speed.');
          state.errorMessageIds.push(errorMessage.message_id);
          return;
        }
        state.data.speedMin = min;
        state.data.speedMax = max;
        state.step = 'meet';
        break;

      case 'meet':
        if (input.toLowerCase() !== 'skip') {
          state.data.meetingPoint = input;
        }
        state.step = 'confirm';
        break;

      default:
        console.error('Unknown wizard step:', state.step);
        return;
    }

    await this.sendStep(ctx);
  }

  async parseDateTimeInput(text, ctx) {
    const parsedDate = DateParser.parseDateTime(text);
    if (!parsedDate) {
      const errorMessage = await ctx.reply('❌ I couldn\'t understand that date/time format. Please try something like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30');
      this.wizardStates.get(this.getStateKey(ctx.from.id, ctx.chat.id)).errorMessageIds.push(errorMessage.message_id);
      return null;
    }
    
    if (DateParser.isPast(parsedDate.date)) {
      const errorMessage = await ctx.reply('❌ The ride can\'t be scheduled in the past! Please provide a future date and time.');
      this.wizardStates.get(this.getStateKey(ctx.from.id, ctx.chat.id)).errorMessageIds.push(errorMessage.message_id);
      return null;
    }

    return parsedDate.date;
  }

  async handleBack(ctx, state) {
    const steps = ['title', 'date', 'route', 'distance', 'duration', 'speed', 'meet', 'confirm'];
    const currentIndex = steps.indexOf(state.step);
    
    if (currentIndex <= 0) {
      await ctx.answerCallbackQuery('Already at the first step');
      return;
    }

    state.step = steps[currentIndex - 1];
    await ctx.answerCallbackQuery();
    await this.sendStep(ctx);
  }

  async handleSkip(ctx, state) {
    const skipableSteps = ['route', 'distance', 'duration', 'speed', 'meet'];
    
    if (!skipableSteps.includes(state.step)) {
      await ctx.answerCallbackQuery('This step cannot be skipped');
      return;
    }

    const steps = ['title', 'date', 'route', 'distance', 'duration', 'speed', 'meet', 'confirm'];
    const currentIndex = steps.indexOf(state.step);
    state.step = steps[currentIndex + 1];
    
    await ctx.answerCallbackQuery();
    await this.sendStep(ctx);
  }

  async cleanupCurrentMessages(ctx, state) {
    // Clean up current question if exists
    if (state.currentQuestionId) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, state.currentQuestionId);
      } catch (error) {
        console.error('Error deleting question message:', error);
      }
    }

    // Clean up current answer if exists
    if (state.currentAnswerId) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, state.currentAnswerId);
      } catch (error) {
        console.error('Error deleting answer message:', error);
      }
    }

    // Clean up error messages if any
    if (state.errorMessageIds?.length > 0) {
      for (const messageId of state.errorMessageIds) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, messageId);
        } catch (error) {
          console.error('Error deleting error message:', error);
        }
      }
      state.errorMessageIds = [];
    }

    // Reset message IDs
    state.currentQuestionId = null;
    state.currentAnswerId = null;
  }

  async handleCancel(ctx) {
    const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    
    if (state) {
      await this.cleanupCurrentMessages(ctx, state);
    }
    
    this.wizardStates.delete(stateKey);
    await ctx.answerCallbackQuery();
    
    await ctx.reply('Ride creation cancelled');
  }

  async handleConfirm(ctx, state) {
    if (state.step !== 'confirm') {
      await ctx.answerCallbackQuery('Please complete all steps first');
      return;
    }

    try {
      // Clean up current wizard messages
      await this.cleanupCurrentMessages(ctx, state);

      // Prepare ride data
      const rideData = {
        ...state.data,
        chatId: ctx.chat.id,
        createdBy: ctx.from.id
      };

      // Create the ride
      const ride = await this.storage.createRide(rideData);
      
      // Create initial message
      const participants = await this.storage.getParticipants(ride.id);
      const keyboard = new InlineKeyboard();
      keyboard.text(config.buttons.join, `join:${ride.id}`);

      const message = this.buildConfirmationMessage(ride, participants);
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Update ride with the message ID
      await this.storage.updateRide(ride.id, {
        messageId: sentMessage.message_id
      });

      // Clear wizard state
      const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
      this.wizardStates.delete(stateKey);

      await ctx.answerCallbackQuery('Ride created successfully!');
    } catch (error) {
      await ctx.answerCallbackQuery('Error creating ride');
      console.error('Error in wizard confirm:', error);
    }
  }

  async sendStep(ctx) {
    const stateKey = this.getStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);

    if (!state) {
      await ctx.reply('No active wizard found');
      return;
    }

    // Clean up answer and error messages before showing new step
    if (state.currentAnswerId) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, state.currentAnswerId);
      } catch (error) {
        console.error('Error deleting answer message:', error);
      }
      state.currentAnswerId = null;
    }

    if (state.errorMessageIds?.length > 0) {
      for (const messageId of state.errorMessageIds) {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, messageId);
        } catch (error) {
          console.error('Error deleting error message:', error);
        }
      }
      state.errorMessageIds = [];
    }

    let keyboard = new InlineKeyboard();
    let message = '';

    // Add Back button for all steps except first
    if (state.step !== 'title') {
      keyboard.text(config.buttons.back, 'wizard:back');
    }

    // Add Skip button for optional steps
    if (['route', 'distance', 'duration', 'speed', 'meet'].includes(state.step)) {
      keyboard.text(config.buttons.skip, 'wizard:skip');
    }

    // Always show Cancel button
    keyboard.text(config.buttons.cancel, 'wizard:cancel');

    switch (state.step) {
      case 'title':
        message = 'What\'s the title of your ride?';
        break;

      case 'date':
        message = 'When is the ride?\nYou can use natural language like:\n• tomorrow at 6pm\n• in 2 hours\n• next saturday 10am\n• 21 Jul 14:30';
        break;

      case 'route':
        message = 'Please share the route link (Strava, Komoot, etc.) or type "skip":';
        break;

      case 'distance':
        message = 'What\'s the planned distance in kilometers? Type "skip" if unknown:';
        break;

      case 'duration':
        message = 'How long will the ride take in minutes? Type "skip" if unknown:';
        break;

      case 'speed':
        message = 'What\'s the expected speed range in km/h? Use format "min-max" (e.g. "25-28") or type "skip" to skip:';
        break;

      case 'meet':
        message = 'Where\'s the meeting point? Type "skip" if not decided yet:';
        break;

      case 'confirm':
        message = this.buildConfirmationMessage(state.data);
        keyboard = new InlineKeyboard()
          .text(config.buttons.back, 'wizard:back')
          .text(config.buttons.create, 'wizard:confirm')
          .text(config.buttons.cancel, 'wizard:cancel');
        break;
    }

    // If we have a current question message, update it
    // Otherwise, send a new one
    try {
      if (state.currentQuestionId) {
        await ctx.api.editMessageText(
          ctx.chat.id,
          state.currentQuestionId,
          message,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } else {
        const sentMessage = await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        state.currentQuestionId = sentMessage.message_id;
      }
    } catch (error) {
      console.error('Error updating wizard message:', error);
      // If editing fails (e.g., identical message), just continue
    }
  }

  buildConfirmationMessage(data, participants = []) {
    const { date: dateStr, time: timeStr } = DateParser.formatDateTime(data.date);

    let meetingInfo = '';
    if (data.meetingPoint) {
      meetingInfo = `\n📍 Meeting point: ${data.meetingPoint}`;
    }

    let routeInfo = '';
    if (data.routeLink) {
      routeInfo = `\n🔗 Route: ${data.routeLink}`;
    }

    let distanceInfo = '';
    if (data.distance) {
      distanceInfo = `\n📏 Distance: ${data.distance} km`;
    }

    let durationInfo = '';
    if (data.duration) {
      const hours = Math.floor(data.duration / 60);
      const minutes = data.duration % 60;
      durationInfo = `\n⏱ Duration: ${hours}h ${minutes}m`;
    }

    let speedInfo = '';
    if (data.speedMin || data.speedMax) {
      speedInfo = '\n🚴 Speed: ';
      if (data.speedMin && data.speedMax) {
        speedInfo += `${data.speedMin}-${data.speedMax} km/h`;
      } else if (data.speedMin) {
        speedInfo += `min ${data.speedMin} km/h`;
      } else {
        speedInfo += `max ${data.speedMax} km/h`;
      }
    }

    const participantList = participants.length > 0
      ? participants.map(p => `@${p.username}`).join('\n')
      : 'No participants yet';

    // Add ride ID if available
    const rideInfo = data.id ? `🎫 Ride #${data.id}\n` : '';

    // Use different join instructions based on whether it's a preview or final message
    const joinInstructions = data.id 
      ? `${rideInfo}Click the button below to join or leave the ride`  // Final ride message
      : 'Please review the details above and confirm or go back to make changes.';  // Preview message

    return config.messageTemplates.ride
      .replace('{title}', data.title)
      .replace('{cancelledBadge}', '')
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
} 
