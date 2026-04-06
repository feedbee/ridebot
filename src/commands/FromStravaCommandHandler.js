import { BaseCommandHandler } from './BaseCommandHandler.js';
import { StravaEventParser } from '../utils/strava-event-parser.js';

/**
 * Handler for the /fromstrava command.
 * Creates or updates a ride from a Strava group event URL.
 */
export class FromStravaCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../storage/interface.js').StorageInterface} storage
   * @param {typeof StravaEventParser} [parser] - Parser class (injectable for testing)
   */
  constructor(rideService, messageFormatter, rideMessagesService, storage, parser = StravaEventParser) {
    super(rideService, messageFormatter, rideMessagesService);
    this.storage = storage;
    this.parser = parser;
  }

  /**
   * Handle /fromstrava <url>
   * @param {import('grammy').Context} ctx
   */
  async handle(ctx) {
    const text = ctx.message.text || '';
    const parts = text.trim().split(/\s+/);
    const url = parts[1];

    const parsed = url ? this.parser.parseEventUrl(url) : null;
    if (!parsed) {
      await ctx.reply(this.translate(ctx, 'commands.fromStrava.invalidUrl'));
      return;
    }

    let event;
    try {
      event = await this.parser.fetchEvent(parsed.eventId);
    } catch (err) {
      console.error('[FromStravaCommandHandler] Failed to fetch Strava event:', err.message);
      await ctx.reply(this.translate(ctx, 'commands.fromStrava.fetchError'));
      return;
    }

    const rideData = this.parser.mapToRideData(event, ctx.from.id, url, parsed.eventId);

    const existing = await this.storage.getRideByStravaId(parsed.eventId, ctx.from.id);

    if (existing) {
      // Update existing ride
      const { updatedBy, ...fieldsToUpdate } = { ...rideData, updatedBy: ctx.from.id };
      const updatedRide = await this.storage.updateRide(existing.id, { ...fieldsToUpdate, updatedBy });
      await this.updateRideMessage(updatedRide, ctx);
      await ctx.reply(this.translate(ctx, 'commands.fromStrava.updated'));
    } else {
      // Create new ride
      const newRide = await this.storage.createRide(rideData);
      await this.rideMessagesService.createRideMessage(newRide, ctx);
      await ctx.reply(this.translate(ctx, 'commands.fromStrava.created'));
    }
  }
}
