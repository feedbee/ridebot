import { BaseCommandHandler } from './BaseCommandHandler.js';
import { UserProfile } from '../models/UserProfile.js';

/**
 * Handler for join/thinking/skip ride callbacks
 */
export class ParticipationHandlers extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/RideParticipationService.js').RideParticipationService} rideParticipationService
   */
  constructor(rideService, messageFormatter, rideMessagesService, rideParticipationService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.rideParticipationService = rideParticipationService;
  }
  /**
   * Handle join ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleJoinRide(ctx) {
    await this.handleParticipationChange(ctx, 'joined', this.translate(ctx, 'commands.participation.joinedSuccess'));
  }

  /** Handle an application intent for a moderated ride. */
  async handleApply(ctx) {
    await this.handleParticipationChange(ctx, 'joined', this.translate(ctx, 'commands.participation.applicationSubmitted'));
  }

  /**
   * Handle thinking ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleThinkingRide(ctx) {
    await this.handleParticipationChange(ctx, 'thinking', this.translate(ctx, 'commands.participation.thinkingSuccess'));
  }

  /**
   * Handle skip ride callback
   * @param {import('grammy').Context} ctx - Grammy context
   */
  async handleSkipRide(ctx) {
    await this.handleParticipationChange(ctx, 'skipped', this.translate(ctx, 'commands.participation.skippedSuccess'));
  }

  /**
   * Handle participation state change
   * @param {import('grammy').Context} ctx - Grammy context
   * @param {string} state - The participation state (joined, thinking, skipped)
   * @param {string} successMessage - Message to show on success
   */
  async handleParticipationChange(ctx, state, successMessage) {
    const rideId = ctx.match[1];
    
    try {
      const participantProfile = UserProfile.fromTelegramUser(ctx.from);
      const result = await this.rideParticipationService.changeParticipation({
        rideId,
        participantProfile,
        targetState: state,
        language: ctx.lang,
        api: ctx.api
      });

      if (result.status === 'ride_not_found') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideNotFound'));
        return;
      }

      if (result.status === 'ride_cancelled') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideCancelled'));
        return;
      }

      if (result.status === 'ride_changed') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideChangedRetry'));
        return;
      }

      if (result.status === 'changed') {
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          const outcomeMessages = {
            application_submitted: 'commands.participation.applicationSubmitted',
            not_participating: 'commands.participation.notParticipating'
          };
          await ctx.answerCallbackQuery(result.moderationOutcome
            ? this.translate(ctx, outcomeMessages[result.moderationOutcome])
            : successMessage);
        } else {
          await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.updatedButMessageFailed'));
        }
      } else {
        const noOpMessages = {
          application_pending: 'commands.participation.applicationPending',
          already_accepted: 'commands.participation.alreadyAccepted',
          already_not_participating: 'commands.participation.alreadyNotParticipating'
        };
        if (result.moderationOutcome) {
          await ctx.answerCallbackQuery(this.translate(ctx, noOpMessages[result.moderationOutcome]));
        } else {
          const stateLabel = this.translate(ctx, `commands.participation.states.${state}`);
          await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.alreadyInState', { state: stateLabel }));
        }
      }
    } catch (error) {
      console.error(`Error updating participation to ${state}:`, error);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.genericError'));
    }
  }

  /** Handle a creator's decision on a pending application. */
  async handleApplicationDecision(ctx) {
    const decision = ctx.match[1];
    const rideId = ctx.match[2];
    const applicantUserId = Number(ctx.match[3]);
    try {
      const result = await this.rideParticipationService.decideApplication({
        rideId,
        applicantUserId,
        actorUserId: ctx.from.id,
        decision,
        language: ctx.lang,
        api: ctx.api
      });
      if (result.status === 'changed') {
        const updateResult = await this.updateRideMessage(result.ride, ctx);
        await ctx.answerCallbackQuery(this.translate(ctx, updateResult.success
          ? `commands.participation.application${decision === 'accept' ? 'Accepted' : 'Rejected'}`
          : 'commands.participation.updatedButMessageFailed'));
        return;
      }
      const key = result.status === 'forbidden'
        ? 'commands.common.onlyCreatorAction'
        : result.status === 'invalid_decision'
          ? 'commands.participation.genericError'
        : result.status === 'ride_not_found'
          ? 'commands.participation.rideNotFound'
          : result.status === 'ride_cancelled'
            ? 'commands.participation.rideCancelled'
            : 'commands.participation.applicationStale';
      await ctx.answerCallbackQuery(this.translate(ctx, key));
    } catch (error) {
      console.error('Error deciding participation application:', error);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.genericError'));
    }
  }
}
