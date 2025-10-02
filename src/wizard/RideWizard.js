import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { DEFAULT_CATEGORY, VALID_CATEGORIES } from '../utils/category-utils.js';
import { escapeHtml } from '../utils/html-escape.js';
import { DateParser } from '../utils/date-parser.js';
import { getFieldConfig, FieldType, buildRideDataFromWizard, buildConfirmationMessage } from './wizardFieldConfig.js';

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

    // Wizards are only allowed in private chats
    if (ctx.chat.type !== 'private') {
      await ctx.reply('⚠️ Wizard commands are only available in private chats with the bot. Please use the command with parameters instead.');
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
    
    // Wizards are only allowed in private chats
    if (ctx.chat.type !== 'private') {
      await ctx.answerCallbackQuery('⚠️ Wizard commands are only available in private chats with the bot');
      this.wizardStates.delete(stateKey);
      return;
    }
    try {
      switch (action) {
        case 'category':
          if (VALID_CATEGORIES.includes(param)) {
            state.data.category = param;
            const categoryConfig = getFieldConfig('category');
            state.step = categoryConfig.nextStep;
            await this.sendWizardStep(ctx, true);
          } else {
            await ctx.answerCallbackQuery('Invalid category selected');
          }
          break;

        case 'back':
          // Navigate to previous step using field configuration
          const currentFieldConfig = getFieldConfig(state.step);
          if (currentFieldConfig && currentFieldConfig.previousStep) {
            state.step = currentFieldConfig.previousStep;
            await this.sendWizardStep(ctx, true);
          } else if (state.step === 'confirm') {
            // Special case: confirm step goes back to info
            state.step = 'info';
            await this.sendWizardStep(ctx, true);
          }
          break;

        case 'keep':
          // Move to the next step using field configuration
          const keepFieldConfig = getFieldConfig(state.step);
          if (keepFieldConfig && keepFieldConfig.nextStep) {
            state.step = keepFieldConfig.nextStep;
            await this.sendWizardStep(ctx, true);
          }
          break;

        case 'skip':
          // Clear the current field value and move to next step using configuration
          const skipFieldConfig = getFieldConfig(state.step);
          if (skipFieldConfig) {
            // Clear the field value(s)
            this.clearFieldValue(state, skipFieldConfig);
            // Move to next step
            if (skipFieldConfig.nextStep) {
              state.step = skipFieldConfig.nextStep;
              await this.sendWizardStep(ctx, true);
            }
          }
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
          // Build ride data from wizard state using configuration helper
          const rideData = buildRideDataFromWizard(state.data, {
            currentUser: state.data.currentUser,
            originalRideId: state.data.originalRideId,
            isUpdate: state.isUpdate
          });
          
          // Apply default category if not set
          if (!rideData.category) {
            rideData.category = DEFAULT_CATEGORY;
          }
          
          if (state.isUpdate) {
            // Update existing ride
            const updatedRide = await this.storage.updateRide(state.data.originalRideId, rideData);
            await this.updateRideMessage(updatedRide, ctx);
            await ctx.deleteMessage();
            this.wizardStates.delete(stateKey);
            await ctx.answerCallbackQuery('Ride updated successfully!');
          } else {
            // Create new ride
            const ride = await this.storage.createRide(rideData);

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
    
    // Wizards are only allowed in private chats
    if (ctx.chat.type !== 'private') {
      await ctx.reply('⚠️ Wizard commands are only available in private chats with the bot. Please use the command with parameters instead.');
      this.wizardStates.delete(stateKey);
      return;
    }

    try {
      let shouldProceed = true;
      state.errorMessageIds.push(ctx.message.message_id); // Always delete user's input

      // Get field configuration for current step
      const fieldConfig = getFieldConfig(state.step);
      
      if (!fieldConfig) {
        console.error(`No field configuration found for step: ${state.step}`);
        return;
      }

      // Handle dash (-) for clearable fields
      if (fieldConfig.clearable && ctx.message.text === '-') {
        this.clearFieldValue(state, fieldConfig);
        state.step = fieldConfig.nextStep;
      } else {
        // Validate input
        const validationResult = fieldConfig.validator(ctx.message.text);
        
        if (!validationResult.valid) {
          shouldProceed = false;
          const errorMsg = await ctx.reply(validationResult.error);
          state.errorMessageIds.push(errorMsg.message_id);
          return;
        }
        
        // Set the value(s)
        this.setFieldValue(state, fieldConfig, validationResult.value);
        
        // Handle post-processing (e.g., route parsing)
        if (fieldConfig.postProcess) {
          state.step = await fieldConfig.postProcess(ctx.message.text, state);
        } else {
          state.step = fieldConfig.nextStep;
        }
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

  /**
   * Clear field value(s) based on configuration
   * @param {Object} state - Wizard state
   * @param {Object} fieldConfig - Field configuration
   */
  clearFieldValue(state, fieldConfig) {
    if (Array.isArray(fieldConfig.dataKey)) {
      // Multiple keys (e.g., speedMin, speedMax)
      fieldConfig.dataKey.forEach(key => {
        state.data[key] = undefined;
      });
    } else {
      // Single key - always use undefined for consistency
      state.data[fieldConfig.dataKey] = undefined;
    }
  }

  /**
   * Set field value(s) based on configuration
   * @param {Object} state - Wizard state
   * @param {Object} fieldConfig - Field configuration
   * @param {*} value - Value to set
   */
  setFieldValue(state, fieldConfig, value) {
    if (Array.isArray(fieldConfig.dataKey)) {
      // Multiple keys (e.g., speedMin, speedMax)
      Object.keys(value).forEach(key => {
        state.data[key] = value[key];
      });
    } else {
      // Single key
      state.data[fieldConfig.dataKey] = value;
    }
  }

  async sendWizardStep(ctx, edit = false) {
    const stateKey = this.getWizardStateKey(ctx.from.id, ctx.chat.id);
    const state = this.wizardStates.get(stateKey);
    if (!state) return;

    let message = '';
    let keyboard = new InlineKeyboard();

    // Get field configuration
    const fieldConfig = getFieldConfig(state.step);
    
    if (fieldConfig) {
      // Build message with current value
      message = fieldConfig.prompt;
      
      // Add current value if exists
      const currentValue = this.getCurrentValueDisplay(state, fieldConfig);
      if (currentValue) {
        message += `\n\nCurrent value: ${currentValue}`;
      }
      
      // Build keyboard based on field type
      keyboard = this.buildFieldKeyboard(state, fieldConfig);
    } else if (state.step === 'confirm') {
      // Handle confirm step separately (special case)
      return this.sendConfirmStep(ctx, state, edit);
    } else {
      console.error(`Unknown wizard step: ${state.step}`);
      return;
    }

    // Send or edit the message
    await this.sendOrEditMessage(ctx, state, message, keyboard, edit);
  }

  /**
   * Get current value display for a field
   * @param {Object} state - Wizard state
   * @param {Object} fieldConfig - Field configuration
   * @returns {string} Formatted current value or empty string
   */
  getCurrentValueDisplay(state, fieldConfig) {
    // Use custom hasValue function if provided (e.g., for speed)
    const hasValue = fieldConfig.hasValue 
      ? fieldConfig.hasValue(state)
      : this.hasFieldValue(state, fieldConfig);
    
    if (!hasValue) return '';
    
    // Use custom formatter if provided
    if (fieldConfig.formatter) {
      const formatted = fieldConfig.formatter(state.data[fieldConfig.dataKey], state);
      return escapeHtml(formatted.toString());
    }
    
    // Default formatting
    const value = state.data[fieldConfig.dataKey];
    return escapeHtml(value.toString());
  }

  /**
   * Check if field has a value
   * @param {Object} state - Wizard state
   * @param {Object} fieldConfig - Field configuration
   * @returns {boolean} True if field has a value
   */
  hasFieldValue(state, fieldConfig) {
    if (Array.isArray(fieldConfig.dataKey)) {
      return fieldConfig.dataKey.some(key => {
        const value = state.data[key];
        return value !== undefined && value !== null;
      });
    }
    const value = state.data[fieldConfig.dataKey];
    return value !== undefined && value !== null;
  }

  /**
   * Build keyboard for a field
   * @param {Object} state - Wizard state
   * @param {Object} fieldConfig - Field configuration
   * @returns {InlineKeyboard} Keyboard for the field
   */
  buildFieldKeyboard(state, fieldConfig) {
    const keyboard = new InlineKeyboard();
    
    // Add field-specific buttons (e.g., category options)
    if (fieldConfig.type === FieldType.CATEGORY && fieldConfig.options) {
      fieldConfig.options.forEach((option, index) => {
        keyboard.text(option.label, `wizard:category:${option.value}`);
        // Add row break after every 2 options
        if (index % 2 === 1) keyboard.row();
      });
      // Add back button on a new row
      keyboard.text(config.buttons.back, 'wizard:back');
      
      // Add keep button if field has current value
      if (this.hasFieldValue(state, fieldConfig)) {
        keyboard.text(config.buttons.keep, 'wizard:keep');
      }
      
      // Add skip button if field is skippable
      if (fieldConfig.skippable) {
        keyboard.text(config.buttons.skip, 'wizard:skip');
      }
    } else {
      // Standard back button for text input fields
      if (state.step !== 'title') { // No back button on first step
        keyboard.text(config.buttons.back, 'wizard:back');
      }
      
      // Add keep button if field has current value
      if (this.hasFieldValue(state, fieldConfig)) {
        keyboard.text(config.buttons.keep, 'wizard:keep');
      }
      
      // Add skip button if field is skippable
      if (fieldConfig.skippable) {
        keyboard.text(config.buttons.skip, 'wizard:skip');
      }
    }
    
    // Add cancel button (always present)
    keyboard.row().text(config.buttons.cancel, 'wizard:cancel');
    
    return keyboard;
  }

  /**
   * Send confirm step
   * @param {Object} ctx - Grammy context
   * @param {Object} state - Wizard state
   * @param {boolean} edit - Whether to edit existing message
   */
  async sendConfirmStep(ctx, state, edit) {
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
    
    // Build confirmation message using configuration
    const message = buildConfirmationMessage(state.data, state.isUpdate, escapeHtml, DateParser);
    
    // Build keyboard
    const keyboard = new InlineKeyboard()
      .text(config.buttons.back, 'wizard:back')
      .text(state.isUpdate ? config.buttons.update : config.buttons.create, 'wizard:confirm')
      .row()
      .text(config.buttons.cancel, 'wizard:cancel');
    
    // Send or edit the message
    await this.sendOrEditMessage(ctx, state, message, keyboard, edit);
  }

  /**
   * Send or edit wizard message
   * @param {Object} ctx - Grammy context
   * @param {Object} state - Wizard state
   * @param {string} message - Message text
   * @param {InlineKeyboard} keyboard - Keyboard
   * @param {boolean} edit - Whether to edit existing message
   */
  async sendOrEditMessage(ctx, state, message, keyboard, edit) {
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
          
          // If update fails (e.g., message too old), send a new message
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
