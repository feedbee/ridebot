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
import { PostRideCommandHandler } from '../commands/PostRideCommandHandler.js';
import { ResumeRideCommandHandler } from '../commands/ResumeRideCommandHandler.js';
import { ParticipationHandlers } from '../commands/ParticipationHandlers.js';

/**
 * Core Bot class that coordinates all components
 */
export class Bot {
  /**
   * @param {import('../storage/interface.js').StorageInterface} storage
   */
  constructor(storage) {
    // Initialize services
    this.storage = storage;
    this.rideService = new RideService(storage);
    this.rideMessagesService = new RideMessagesService(this.rideService);
    this.messageFormatter = new MessageFormatter();
    this.wizard = new RideWizard(storage, this.rideService, this.messageFormatter, this.rideMessagesService);
    
    // Initialize bot
    this.bot = new GrammyBot(config.bot.token);
    
    // Initialize command handlers
    this.helpHandler = new HelpCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.startHandler = new StartCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.newRideHandler = new NewRideCommandHandler(this.rideService, this.messageFormatter, this.wizard, this.rideMessagesService);
    this.updateRideHandler = new UpdateRideCommandHandler(this.rideService, this.messageFormatter, this.wizard, this.rideMessagesService);
    this.cancelRideHandler = new CancelRideCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.deleteRideHandler = new DeleteRideCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.listRidesHandler = new ListRidesCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.duplicateRideHandler = new DuplicateRideCommandHandler(this.rideService, this.messageFormatter, this.wizard, this.rideMessagesService);
    this.postRideHandler = new PostRideCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.resumeRideHandler = new ResumeRideCommandHandler(this.rideService, this.messageFormatter, this.rideMessagesService);
    this.participationHandlers = new ParticipationHandlers(this.rideService, this.messageFormatter, this.rideMessagesService);
    
    this.setupHandlers();
  }

  /**
   * Set up all command and callback handlers
   */
  setupHandlers() {
    // Apply middleware for handling message thread IDs in topics
    this.bot.use(threadMiddleware);
    
    // Command handlers
    if (config.bot.privateChatCommandsMode) {
      // In restricted mode, handle commands differently based on chat type
      this.setupRestrictedCommandHandlers();
    } else {
      // Standard command handling
      this.setupStandardCommandHandlers();
    }
    
    // Callback query handlers (same for both modes)
    this.bot.callbackQuery(/^join:(.+)$/, ctx => this.participationHandlers.handleJoinRide(ctx));
    this.bot.callbackQuery(/^leave:(.+)$/, ctx => this.participationHandlers.handleLeaveRide(ctx));
    this.bot.callbackQuery(/^delete:(\w+):(\w+)$/, ctx => this.deleteRideHandler.handleConfirmation(ctx));
    this.bot.callbackQuery(/^list:(\d+)$/, ctx => this.listRidesHandler.handleCallback(ctx));
    this.bot.callbackQuery(/^wizard:(\w+)(?::(.*))?$/, ctx => this.wizard.handleWizardAction(ctx));
    
    // Wizard input handler
    this.bot.on('message:text', ctx => this.wizard.handleWizardInput(ctx));
  }

  setupStandardCommandHandlers() {
    // Command handlers
    this.bot.command('start', ctx => this.startHandler.handle(ctx));
    this.bot.command('help', ctx => this.helpHandler.handle(ctx));
    this.bot.command('newride', ctx => this.newRideHandler.handle(ctx));
    this.bot.command('updateride', ctx => this.updateRideHandler.handle(ctx));
    this.bot.command('cancelride', ctx => this.cancelRideHandler.handle(ctx));
    this.bot.command('resumeride', ctx => this.resumeRideHandler.handle(ctx));
    this.bot.command('deleteride', ctx => this.deleteRideHandler.handle(ctx));
    this.bot.command('listrides', ctx => this.listRidesHandler.handle(ctx));
    this.bot.command('dupride', ctx => this.duplicateRideHandler.handle(ctx));
    this.bot.command('postride', ctx => this.postRideHandler.handle(ctx));
  }

  /**
   * Set up command handlers for restricted mode (most commands only in private chats)
   */
  setupRestrictedCommandHandlers() {
    // Helper function to check if chat is private
    const isPrivateChat = (ctx) => ctx.chat?.type === 'private';

    // Handle postride command in all chats
    this.bot.command('postride', async (ctx) => {
      // If no parameters provided in group chat, show a helpful message
      if (!isPrivateChat(ctx) && !ctx.match) {
        await ctx.reply(
          '<b>ℹ️ How to post a ride in this chat:</b>\n\n' +
          '1. Create a ride in private chat with the bot\n' +
          '2. Get the ride ID from the confirmation message or /listrides\n' +
          '3. Use <code>/postride RIDE_ID</code> in this chat\n\n' +
          'Click here to start a private chat: @' + (await ctx.api.getMe()).username,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Process the postride command normally
      this.postRideHandler.handle(ctx);
    });

    // Handle all other commands - silently ignore in non-private chats
    this.bot.command('start', (ctx) => isPrivateChat(ctx) && this.startHandler.handle(ctx));
    this.bot.command('help', (ctx) => isPrivateChat(ctx) && this.helpHandler.handle(ctx));
    this.bot.command('newride', (ctx) => isPrivateChat(ctx) && this.newRideHandler.handle(ctx));
    this.bot.command('updateride', (ctx) => isPrivateChat(ctx) && this.updateRideHandler.handle(ctx));
    this.bot.command('cancelride', (ctx) => isPrivateChat(ctx) && this.cancelRideHandler.handle(ctx));
    this.bot.command('resumeride', (ctx) => isPrivateChat(ctx) && this.resumeRideHandler.handle(ctx));
    this.bot.command('deleteride', (ctx) => isPrivateChat(ctx) && this.deleteRideHandler.handle(ctx));
    this.bot.command('listrides', (ctx) => isPrivateChat(ctx) && this.listRidesHandler.handle(ctx));
    this.bot.command('dupride', (ctx) => isPrivateChat(ctx) && this.duplicateRideHandler.handle(ctx));
  }

  /**
   * Set up bot commands in Telegram menu
   */
  async setupBotCommands() {
    try {
      const commands = [
        { command: 'start', description: 'Start the bot and get welcome information' },
        { command: 'help', description: 'Show help information about commands' },
        { command: 'newride', description: 'Create a new ride' },
        { command: 'updateride', description: 'Update an existing ride' },
        { command: 'cancelride', description: 'Cancel a ride' },
        { command: 'resumeride', description: 'Resume a cancelled ride' },
        { command: 'deleteride', description: 'Delete a ride' },
        { command: 'listrides', description: 'List all your rides' },
        { command: 'dupride', description: 'Duplicate an existing ride' },
        { command: 'postride', description: 'Post a ride in a chat' }
      ];

      if (config.bot.privateChatCommandsMode) {
        // For private chats - all commands
        await this.bot.api.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
        
        // For group chats - only postride command
        const groupCommands = [
          { command: 'postride', description: 'Post a ride in this chat' }
        ];
        await this.bot.api.setMyCommands(groupCommands, { scope: { type: 'all_group_chats' } });
        
        console.log('Bot commands have been set up in private chat commands mode');
      } else {
        // Set all commands for both private chats and group chats
        await this.bot.api.setMyCommands(commands, { scope: { type: 'default' } });
        console.log('Bot commands have been set up in standard mode');
      }
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
      await this.bot.api.deleteWebhook();
      this.bot.start();
      console.log('Bot started in polling mode');
    }
  }
}
