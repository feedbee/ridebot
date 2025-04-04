import { Bot as GrammyBot } from 'grammy';
import { config } from '../config.js';
import { RideWizard } from '../wizard/RideWizard.js';
import { RideService } from '../services/RideService.js';
import { MessageFormatter } from '../formatters/MessageFormatter.js';
import { HelpCommandHandler } from '../commands/HelpCommandHandler.js';
import { StartCommandHandler } from '../commands/StartCommandHandler.js';
import { NewRideCommandHandler } from '../commands/NewRideCommandHandler.js';
import { UpdateRideCommandHandler } from '../commands/UpdateRideCommandHandler.js';
import { CancelRideCommandHandler } from '../commands/CancelRideCommandHandler.js';
import { DeleteRideCommandHandler } from '../commands/DeleteRideCommandHandler.js';
import { ListRidesCommandHandler } from '../commands/ListRidesCommandHandler.js';
import { DuplicateRideCommandHandler } from '../commands/DuplicateRideCommandHandler.js';
import { PostRideCommandHandler } from '../commands/PostRideCommandHandler.js';
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
    this.messageFormatter = new MessageFormatter();
    this.wizard = new RideWizard(storage);
    
    // Initialize bot
    this.bot = new GrammyBot(config.bot.token);
    
    // Initialize command handlers
    this.helpHandler = new HelpCommandHandler(this.rideService, this.messageFormatter);
    this.startHandler = new StartCommandHandler(this.rideService, this.messageFormatter);
    this.newRideHandler = new NewRideCommandHandler(this.rideService, this.messageFormatter, this.wizard);
    this.updateRideHandler = new UpdateRideCommandHandler(this.rideService, this.messageFormatter, this.wizard);
    this.cancelRideHandler = new CancelRideCommandHandler(this.rideService, this.messageFormatter);
    this.deleteRideHandler = new DeleteRideCommandHandler(this.rideService, this.messageFormatter);
    this.listRidesHandler = new ListRidesCommandHandler(this.rideService, this.messageFormatter);
    this.duplicateRideHandler = new DuplicateRideCommandHandler(this.rideService, this.messageFormatter, this.wizard);
    this.postRideHandler = new PostRideCommandHandler(this.rideService, this.messageFormatter);
    this.participationHandlers = new ParticipationHandlers(this.rideService, this.messageFormatter);
    
    this.setupHandlers();
  }

  /**
   * Set up all command and callback handlers
   */
  setupHandlers() {
    // Command handlers
    this.bot.command('start', ctx => this.startHandler.handle(ctx));
    this.bot.command('help', ctx => this.helpHandler.handle(ctx));
    this.bot.command('newride', ctx => this.newRideHandler.handle(ctx));
    this.bot.command('updateride', ctx => this.updateRideHandler.handle(ctx));
    this.bot.command('cancelride', ctx => this.cancelRideHandler.handle(ctx));
    this.bot.command('deleteride', ctx => this.deleteRideHandler.handle(ctx));
    this.bot.command('listrides', ctx => this.listRidesHandler.handle(ctx));
    this.bot.command('dupride', ctx => this.duplicateRideHandler.handle(ctx));
    this.bot.command('postride', ctx => this.postRideHandler.handle(ctx));
    
    // Callback query handlers
    this.bot.callbackQuery(/^join:(.+)$/, ctx => this.participationHandlers.handleJoinRide(ctx));
    this.bot.callbackQuery(/^leave:(.+)$/, ctx => this.participationHandlers.handleLeaveRide(ctx));
    this.bot.callbackQuery(/^delete:(\w+):(\w+)$/, ctx => this.deleteRideHandler.handleConfirmation(ctx));
    this.bot.callbackQuery(/^list:(\d+)$/, ctx => this.listRidesHandler.handleCallback(ctx));
    this.bot.callbackQuery(/^wizard:(\w+)(?::(\w+))?$/, ctx => this.wizard.handleWizardAction(ctx));
    
    // Wizard input handler
    this.bot.on('message:text', ctx => this.wizard.handleWizardInput(ctx));
  }

  /**
   * Start the bot
   */
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
}
