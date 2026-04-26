import express from 'express';
import { config } from '../config.js';
import { TelegramGateway } from '../telegram/TelegramGateway.js';
import { RideWizard } from '../wizard/RideWizard.js';
import { RideService } from '../services/RideService.js';
import { RideMessagesService } from '../services/RideMessagesService.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { threadMiddleware } from '../middleware/threadMiddleware.js';
import { i18nMiddleware } from '../middleware/i18nMiddleware.js';
import { HelpCommandHandler } from '../commands/HelpCommandHandler.js';
import { StartCommandHandler } from '../commands/StartCommandHandler.js';
import { NewRideCommandHandler } from '../commands/NewRideCommandHandler.js';
import { UpdateRideCommandHandler } from '../commands/UpdateRideCommandHandler.js';
import { CancelRideCommandHandler } from '../commands/CancelRideCommandHandler.js';
import { DeleteRideCommandHandler } from '../commands/DeleteRideCommandHandler.js';
import { ListRidesCommandHandler } from '../commands/ListRidesCommandHandler.js';
import { ListParticipantsCommandHandler } from '../commands/ListParticipantsCommandHandler.js';
import { DuplicateRideCommandHandler } from '../commands/DuplicateRideCommandHandler.js';
import { ShareRideCommandHandler } from '../commands/ShareRideCommandHandler.js';
import { ResumeRideCommandHandler } from '../commands/ResumeRideCommandHandler.js';
import { RideSettingsCommandHandler } from '../commands/RideSettingsCommandHandler.js';
import { ParticipationHandlers } from '../commands/ParticipationHandlers.js';
import { NotificationService } from '../services/NotificationService.js';
import { GroupCommandHandler } from '../commands/GroupCommandHandler.js';
import { GroupManagementService } from '../services/GroupManagementService.js';
import { AiRideCommandHandler } from '../commands/AiRideCommandHandler.js';
import { AiRideService } from '../services/AiRideService.js';
import { FromStravaCommandHandler } from '../commands/FromStravaCommandHandler.js';
import { replaceBotUsername } from '../utils/botUtils.js';
import { t } from '../i18n/index.js';
import { RideParticipationService } from '../services/RideParticipationService.js';
import { SettingsService } from '../services/SettingsService.js';

/**
 * Core Bot class that coordinates all components
 */
export class Bot {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage, options = {}) {
    // Initialize services
    const settingsService = new SettingsService(storage);
    const rideService = new RideService(storage, settingsService);
    const messageFormatter = new MessageFormatter();
    const rideMessagesService = new RideMessagesService(rideService, messageFormatter);
    const notificationService = new NotificationService();
    this.wizard = new RideWizard(storage, rideService, messageFormatter, rideMessagesService);
    const aiRideService = new AiRideService();
    this.aiRideHandler = new AiRideCommandHandler(rideService, messageFormatter, rideMessagesService, aiRideService);
    this.fromStravaHandler = new FromStravaCommandHandler(rideService, messageFormatter, rideMessagesService, storage);
    this.botConfig = this.getBotConfig(
      rideService,
      settingsService,
      messageFormatter,
      rideMessagesService,
      notificationService
    );
    
    // Initialize Telegram boundary
    this.bot = options.telegramGateway || new TelegramGateway(config.bot.token);
    
    this.configureBot();
  }

  getBotConfig(rideService, settingsService, messageFormatter, rideMessagesService, notificationService) {
    const startHandler = new StartCommandHandler(rideService, messageFormatter, rideMessagesService);
    const helpHandler = new HelpCommandHandler(rideService, messageFormatter, rideMessagesService);
    const newRideHandler = new NewRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const updateRideHandler = new UpdateRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const cancelRideHandler = new CancelRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const deleteRideHandler = new DeleteRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const listRidesHandler = new ListRidesCommandHandler(rideService, messageFormatter, rideMessagesService);
    const listParticipantsHandler = new ListParticipantsCommandHandler(rideService, messageFormatter, rideMessagesService);
    const duplicateRideHandler = new DuplicateRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const resumeRideHandler = new ResumeRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const rideSettingsHandler = new RideSettingsCommandHandler(rideService, messageFormatter, rideMessagesService, settingsService);
    const groupManagementService = new GroupManagementService();
    const rideParticipationService = new RideParticipationService(rideService, notificationService, groupManagementService);
    const participationHandler = new ParticipationHandlers(rideService, messageFormatter, rideMessagesService, rideParticipationService);
    const shareRideHandler = new ShareRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const groupHandler = new GroupCommandHandler(rideService, messageFormatter, rideMessagesService, groupManagementService);
    
    return {
      commands: {
        privateOnly: [
          { command: 'start', descriptionKey: 'bot.commandDescriptions.start', handler: (ctx) => startHandler.handle(ctx) },
          { command: 'help', descriptionKey: 'bot.commandDescriptions.help', handler: (ctx) => helpHandler.handle(ctx) },
          { command: 'newride', descriptionKey: 'bot.commandDescriptions.newride', handler: (ctx) => newRideHandler.handle(ctx) },
          { command: 'updateride', descriptionKey: 'bot.commandDescriptions.updateride', handler: (ctx) => updateRideHandler.handle(ctx) },
          { command: 'cancelride', descriptionKey: 'bot.commandDescriptions.cancelride', handler: (ctx) => cancelRideHandler.handle(ctx) },
          { command: 'deleteride', descriptionKey: 'bot.commandDescriptions.deleteride', handler: (ctx) => deleteRideHandler.handle(ctx) },
          { command: 'listrides', descriptionKey: 'bot.commandDescriptions.listrides', handler: (ctx) => listRidesHandler.handle(ctx) },
          { command: 'listparticipants', descriptionKey: 'bot.commandDescriptions.listparticipants', handler: (ctx) => listParticipantsHandler.handle(ctx) },
          { command: 'dupride', descriptionKey: 'bot.commandDescriptions.dupride', handler: (ctx) => duplicateRideHandler.handle(ctx) },
          { command: 'resumeride', descriptionKey: 'bot.commandDescriptions.resumeride', handler: (ctx) => resumeRideHandler.handle(ctx) },
          { command: 'settings', descriptionKey: 'bot.commandDescriptions.settings', handler: (ctx) => rideSettingsHandler.handle(ctx) },
          { command: 'airide', descriptionKey: 'bot.commandDescriptions.airide', handler: (ctx) => this.aiRideHandler.handle(ctx) },
          { command: 'joinchat', descriptionKey: 'bot.commandDescriptions.joinchat', handler: (ctx) => groupHandler.handleJoinChat(ctx) },
          { command: 'fromstrava', descriptionKey: 'bot.commandDescriptions.fromstrava', handler: (ctx) => this.fromStravaHandler.handle(ctx) },
        ],
        publicOnly: [
          { command: 'attach', descriptionKey: 'bot.commandDescriptions.attach', handler: (ctx) => groupHandler.handleAttach(ctx) },
          { command: 'detach', descriptionKey: 'bot.commandDescriptions.detach', handler: (ctx) => groupHandler.handleDetach(ctx) },
        ],
        mixed: [
          { command: 'shareride', descriptionKey: 'bot.commandDescriptions.shareride', handler: async (ctx) => {
            // If no parameters provided in group chat, show a helpful message
            if (ctx.chat?.type !== 'private' && !ctx.match) {
              const message = await replaceBotUsername(ctx.t('templates.shareRideHelp'), ctx);
              await ctx.reply(message, { parse_mode: 'HTML' });
              return;
            }
            
            // Process the shareride command normally
            shareRideHandler.handle(ctx);
          }},
        ],
      },
      callbacks: [
        { pattern: /^join:(\w+)$/, handler: (ctx) => participationHandler.handleJoinRide(ctx) },
        { pattern: /^thinking:(\w+)$/, handler: (ctx) => participationHandler.handleThinkingRide(ctx) },
        { pattern: /^skip:(\w+)$/, handler: (ctx) => participationHandler.handleSkipRide(ctx) },
        { pattern: /^delete:(\w+):(\w+)(?::(message|callback))?$/, handler: (ctx) => deleteRideHandler.handleConfirmation(ctx) },
        { pattern: /^list:(\d+)$/, handler: (ctx) => listRidesHandler.handleCallback(ctx) },
        { pattern: /^rideowner:update:(\w+)$/, handler: (ctx) => updateRideHandler.handleCallback(ctx) },
        { pattern: /^rideowner:duplicate:(\w+)$/, handler: (ctx) => duplicateRideHandler.handleCallback(ctx) },
        { pattern: /^rideowner:delete:(\w+)$/, handler: (ctx) => deleteRideHandler.handleCallback(ctx) },
        { pattern: /^rideowner:cancel:(\w+)$/, handler: (ctx) => cancelRideHandler.handleCallback(ctx) },
        { pattern: /^rideowner:resume:(\w+)$/, handler: (ctx) => resumeRideHandler.handleCallback(ctx) },
        { pattern: /^rideowner:participants:(\w+)$/, handler: (ctx) => listParticipantsHandler.handleCallback(ctx) },
        { pattern: /^rideowner:settings:(\w+)$/, handler: (ctx) => rideSettingsHandler.handleCallback(ctx) },
        { pattern: /^settings:user:np:(on|off)$/, handler: (ctx) => rideSettingsHandler.handleUserCallback(ctx) },
        { pattern: /^settings:ride:np:(on|off):(\w+)$/, handler: (ctx) => rideSettingsHandler.handleRideCallback(ctx) },
        { pattern: /^wizard:(\w+)(?::(.*))?$/, handler: (ctx) => this.wizard.handleWizardAction(ctx) },
        { pattern: /^airide:(confirm|cancel):(\d+:\d+)$/, handler: (ctx) => this.aiRideHandler.handleCallback(ctx) },
      ],
    };
  }

  /**
   * Set up all command and callback handlers
   */
  configureBot() {
    // Apply middleware for localization context
    this.bot.use(i18nMiddleware);

    // Apply middleware for handling message thread IDs in topics
    this.bot.use(threadMiddleware);
    
    // Command handlers (private chat only, except /shareride)
    this.setupCommandHandlers();
    
    // Callback query handlers
    this.setupCallbackQueryHandlers();
    
    // Text input handlers: wizard first, then AI ride follow-up
    this.bot.on('message:text', async (ctx) => {
      await this.wizard.handleWizardInput(ctx);
      await this.aiRideHandler.handleTextInput(ctx);
    });
  }

  translateCallbackError(ctx) {
    if (ctx?.t) {
      return ctx.t('errors.generic');
    }

    const language = ctx?.lang || config.i18n.defaultLanguage;
    return t(language, 'errors.generic', {}, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
  }

  wrapCallbackHandler(handler) {
    return async (ctx) => {
      try {
        await handler(ctx);
      } catch (error) {
        console.error('Error handling callback query:', error);

        try {
          if (typeof ctx.answerCallbackQuery === 'function') {
            await ctx.answerCallbackQuery(this.translateCallbackError(ctx));
          }
        } catch (callbackError) {
          console.error('Error answering callback query:', callbackError);
        }
      }
    };
  }

  /**
   * Set up command handlers (most commands only in private chats)
   */
  setupCommandHandlers() {
    // Handle private commands - silently ignore in non-private chats
    const privateHandlerWrapper = (handler) => {
      return (ctx) => ctx.chat?.type === 'private' && handler(ctx);
    }
    this.botConfig.commands.privateOnly.forEach(({ command, description, handler }) => {
      this.bot.command(command, privateHandlerWrapper(handler));
    });

    // Handle mixed commands - work in both private and public chats
    this.botConfig.commands.mixed.forEach(({ command, description, handler }) => {
      this.bot.command(command, handler);
    });

    // Handle public commands - silently ignore in private chats
    const publicHandlerWrapper = (handler) => {
      return (ctx) => ctx.chat?.type !== 'private' && handler(ctx);
    }
    this.botConfig.commands.publicOnly.forEach(({ command, description, handler }) => {
      this.bot.command(command, publicHandlerWrapper(handler));
    });
  }

  /**
   * Set up callback query handlers
   */
  setupCallbackQueryHandlers() {
    this.botConfig.callbacks.forEach(({ pattern, handler }) => {
      this.bot.callbackQuery(pattern, this.wrapCallbackHandler(handler));
    });
  }

  /**
   * Set up bot commands in Telegram menu
   */
  async setupBotCommands() {
    try {
      const language = config.i18n.defaultLanguage;
      const translateMenuDescription = (descriptionKey) => t(language, descriptionKey, {}, {
        fallbackLanguage: config.i18n.fallbackLanguage,
        withMissingMarker: config.isDev
      });

      // Merge private and mixed commands for private chats
      const privateCommands = [
        ...this.botConfig.commands.privateOnly,
        ...this.botConfig.commands.mixed
      ].map(({ command, descriptionKey }) => ({
        command,
        description: translateMenuDescription(descriptionKey)
      }));
      await this.bot.api.setMyCommands(privateCommands, { scope: { type: 'all_private_chats' } });

      // Mixed commands for group chats
      const groupCommands = [
        ...this.botConfig.commands.publicOnly,
        ...this.botConfig.commands.mixed
      ].map(({ command, descriptionKey }) => ({ 
        command, 
        description: translateMenuDescription(descriptionKey)
      }));
      await this.bot.api.setMyCommands(groupCommands, { scope: { type: 'all_group_chats' } });
      
      console.log('Bot commands have been set up (private chat mode)');
    } catch (error) {
      console.error('Error setting up bot commands:', error);
    }
  }

  /**
   * Start the bot
   */
  async start() {
    // Set up bot commands
    await this.setupBotCommands();
    
    if (config.bot.useWebhook) {
      const app = express();
      app.use(express.json());

      const webhookPath = config.bot.webhookPath || '/';
      app.use(webhookPath, this.bot.createWebhookMiddleware());

      app.listen(config.bot.webhookPort, async () => {
        console.log(`Webhook server listening on port ${config.bot.webhookPort}`);
        const webhookUrl = `${config.bot.webhookDomain}${webhookPath}`;
        await this.bot.api.setWebhook(webhookUrl);
        console.log(`Bot webhook set to ${webhookUrl}`);
      });
    } else {
      console.log('Polling mode is enabled');
      await this.bot.api.deleteWebhook();
      this.bot.startPolling();
    }
  }
}
