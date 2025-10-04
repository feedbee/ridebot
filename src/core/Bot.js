import { Bot as GrammyBot, webhookCallback } from 'grammy';
import express from 'express';
import { config } from '../config.js';
import { RideWizard } from '../wizard/RideWizard.js';
import { RideService } from '../services/RideService.js';
import { RideMessagesService } from '../services/RideMessagesService.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { threadMiddleware } from '../middleware/threadMiddleware.js';
import { HelpCommandHandler } from '../commands/HelpCommandHandler.js';
import { StartCommandHandler } from '../commands/StartCommandHandler.js';
import { NewRideCommandHandler } from '../commands/NewRideCommandHandler.js';
import { UpdateRideCommandHandler } from '../commands/UpdateRideCommandHandler.js';
import { CancelRideCommandHandler } from '../commands/CancelRideCommandHandler.js';
import { DeleteRideCommandHandler } from '../commands/DeleteRideCommandHandler.js';
import { ListRidesCommandHandler } from '../commands/ListRidesCommandHandler.js';
import { DuplicateRideCommandHandler } from '../commands/DuplicateRideCommandHandler.js';
import { ShareRideCommandHandler } from '../commands/ShareRideCommandHandler.js';
import { ResumeRideCommandHandler } from '../commands/ResumeRideCommandHandler.js';
import { ParticipationHandlers } from '../commands/ParticipationHandlers.js';
import { messageTemplates } from '../config/messageTemplates.js';
import { replaceBotUsername } from '../utils/botUtils.js';

/**
 * Core Bot class that coordinates all components
 */
export class Bot {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    // Initialize services
    const rideService = new RideService(storage);
    const messageFormatter = new MessageFormatter();
    const rideMessagesService = new RideMessagesService(rideService, messageFormatter);
    this.wizard = new RideWizard(storage, rideService, messageFormatter, rideMessagesService);
    this.botConfig = this.getBotConfig(rideService, messageFormatter, rideMessagesService);
    
    // Initialize bot
    this.bot = new GrammyBot(config.bot.token);
    
    this.configureBot();
  }

  getBotConfig(rideService, messageFormatter, rideMessagesService) {
    const startHandler = new StartCommandHandler(rideService, messageFormatter, rideMessagesService);
    const helpHandler = new HelpCommandHandler(rideService, messageFormatter, rideMessagesService);
    const newRideHandler = new NewRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const updateRideHandler = new UpdateRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const cancelRideHandler = new CancelRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const deleteRideHandler = new DeleteRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const listRidesHandler = new ListRidesCommandHandler(rideService, messageFormatter, rideMessagesService);
    const duplicateRideHandler = new DuplicateRideCommandHandler(rideService, messageFormatter, this.wizard, rideMessagesService);
    const resumeRideHandler = new ResumeRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    const participationHandler = new ParticipationHandlers(rideService, messageFormatter, rideMessagesService);
    const shareRideHandler = new ShareRideCommandHandler(rideService, messageFormatter, rideMessagesService);
    
    
    return {
      commands: {
        privateOnly: [
          { command: 'start', description: 'Start the bot and get welcome information', handler: (ctx) => startHandler.handle(ctx) },
          { command: 'help', description: 'Show help information about commands', handler: (ctx) => helpHandler.handle(ctx) },
          { command: 'newride', description: 'Create a new ride', handler: (ctx) => newRideHandler.handle(ctx) },
          { command: 'updateride', description: 'Update an existing ride', handler: (ctx) => updateRideHandler.handle(ctx) },
          { command: 'cancelride', description: 'Cancel a ride', handler: (ctx) => cancelRideHandler.handle(ctx) },
          { command: 'deleteride', description: 'Delete a ride', handler: (ctx) => deleteRideHandler.handle(ctx) },
          { command: 'listrides', description: 'List all your rides', handler: (ctx) => listRidesHandler.handle(ctx) },
          { command: 'dupride', description: 'Duplicate an existing ride', handler: (ctx) => duplicateRideHandler.handle(ctx) },
          { command: 'resumeride', description: 'Resume a cancelled ride', handler: (ctx) => resumeRideHandler.handle(ctx) },  
        ],
        publicOnly: [],
        mixed: [
          { command: 'shareride', description: 'Share a ride in a chat', handler: async (ctx) => {
            // If no parameters provided in group chat, show a helpful message
            if (ctx.chat?.type !== 'private' && !ctx.match) {
              const message = await replaceBotUsername(messageTemplates.shareRideHelp, ctx);
              await ctx.reply(message, { parse_mode: 'HTML' });
              return;
            }
            
            // Process the shareride command normally
            shareRideHandler.handle(ctx);
          }},
        ],
      },
      callbacks: [
        { pattern: /^join:(.+)$/, handler: (ctx) => participationHandler.handleJoinRide(ctx) },
        { pattern: /^leave:(.+)$/, handler: (ctx) => participationHandler.handleLeaveRide(ctx) },
        { pattern: /^delete:(\w+):(\w+)$/, handler: (ctx) => deleteRideHandler.handleConfirmation(ctx) },
        { pattern: /^list:(\d+)$/, handler: (ctx) => listRidesHandler.handleCallback(ctx) },
        { pattern: /^wizard:(\w+)(?::(.*))?$/, handler: (ctx) => this.wizard.handleWizardAction(ctx) },
      ],
    };
  }

  /**
   * Set up all command and callback handlers
   */
  configureBot() {
    // Apply middleware for handling message thread IDs in topics
    this.bot.use(threadMiddleware);
    
    // Command handlers (private chat only, except /shareride)
    this.setupCommandHandlers();
    
    // Callback query handlers
    this.setupCallbackQueryHandlers();
    
    // Wizard input handler
    this.bot.on('message:text', ctx => this.wizard.handleWizardInput(ctx));
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
      this.bot.callbackQuery(pattern, handler);
    });
  }

  /**
   * Set up bot commands in Telegram menu
   */
  async setupBotCommands() {
    try {
      // Merge private and mixed commands for private chats
      const privateCommands = [
        ...this.botConfig.commands.privateOnly,
        ...this.botConfig.commands.mixed
      ].map(({ command, description }) => ({ command, description }));
      await this.bot.api.setMyCommands(privateCommands, { scope: { type: 'all_private_chats' } });

      // Mixed commands for group chats
      const groupCommands = [
        ...this.botConfig.commands.publicOnly,
        ...this.botConfig.commands.mixed
      ].map(({ command, description }) => ({ 
        command, 
        description 
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
      app.use(webhookPath, webhookCallback(this.bot, 'express'));

      app.listen(config.bot.webhookPort, async () => {
        console.log(`Webhook server listening on port ${config.bot.webhookPort}`);
        const webhookUrl = `${config.bot.webhookDomain}${webhookPath}`;
        await this.bot.api.setWebhook(webhookUrl);
        console.log(`Bot webhook set to ${webhookUrl}`);
      });
    } else {
      console.log('Polling mode is enabled');
      await this.bot.api.deleteWebhook();
      this.bot.start();
    }
  }
}
