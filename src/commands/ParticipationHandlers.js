import { selectionPromptKey } from '../utils/start-points.js';
import { BaseCommandHandler } from './BaseCommandHandler.js';
import { UserProfile } from '../models/UserProfile.js';
import { RIDE_ARCHIVE_AFTER_HOURS } from '../services/ride-lifecycle.js';

const SUCCESS_MESSAGE_KEYS = {
  joined: 'commands.participation.joinedSuccess',
  thinking: 'commands.participation.thinkingSuccess',
  skipped: 'commands.participation.skippedSuccess'
};

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
    await this.handleJoinRide(ctx);
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

      if (result.status === 'ride_archived') {
        await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.rideArchived', {
          hours: RIDE_ARCHIVE_AFTER_HOURS
        }));
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

      if (result.status === 'participant_limit_reached') {
        await ctx.answerCallbackQuery(
          this.translate(ctx, 'commands.participation.participantLimitReached')
        );
        return;
      }

      if (result.status === 'changed') {
        const result2 = await this.updateRideMessage(result.ride, ctx);
        
        if (result2.success) {
          const outcomeMessages = {
            application_submitted: 'commands.participation.applicationSubmitted',
            not_participating: 'commands.participation.notParticipating'
          };
          let text = result.moderationOutcome
            ? this.translate(ctx, outcomeMessages[result.moderationOutcome])
            : result.targetState
              ? this.translate(ctx, SUCCESS_MESSAGE_KEYS[result.targetState])
              : successMessage;
          const person = result.ride.participation?.[result.targetState]?.find(p => p.userId === ctx.from.id);
          const promptKey = result.targetState !== 'skipped' && selectionPromptKey(result.ride, person);
          if (promptKey) text += `\n${this.translate(ctx, promptKey)}`;
          await ctx.answerCallbackQuery(text);
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

  /** Handle a group choice for the authenticated Telegram user.
   * @param {import('grammy').Context} ctx
   */
  async handlePaceGroup(ctx) {
    try {
      const result = await this.rideParticipationService.selectPaceGroup({
        rideId: ctx.match[1], group: ctx.match[2], userId: ctx.from.id
      });
      if (result.status === 'changed') {
        const update = await this.updateRideMessage(result.ride, ctx);
        await ctx.answerCallbackQuery(this.translate(ctx, update.success
          ? 'paceGroups.selected' : 'commands.participation.updatedButMessageFailed', { group: ctx.match[2] }));
        return;
      }
      const keys = {
        already_in_group: 'paceGroups.alreadySelected', group_not_found: 'paceGroups.unavailable',
        not_participating: result.ride?.settings?.requireParticipationApproval ? 'paceGroups.applyFirst' : 'paceGroups.joinFirst',
        ride_not_found: 'commands.participation.rideNotFound', ride_archived: 'commands.participation.rideArchived',
        ride_cancelled: 'commands.participation.rideCancelled', ride_changed: 'commands.participation.rideChangedRetry'
      };
      await ctx.answerCallbackQuery(this.translate(ctx, keys[result.status] || 'commands.participation.genericError', {
        group: ctx.match[2], hours: RIDE_ARCHIVE_AFTER_HOURS
      }));
    } catch (error) {
      console.error('Error selecting pace group:', error);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.genericError'));
    }
  }

  /** Handle the authenticated user’s optional start-point selection.
   * @param {import('grammy').Context} ctx
   */
  async handleStartPoint(ctx) {
    try {
      const result = await this.rideParticipationService.selectStartPoint({
        rideId: ctx.match[1], group: ctx.match[2], userId: ctx.from.id
      });
      if (result.status === 'changed') {
        const update = await this.updateRideMessage(result.ride, ctx);
        await ctx.answerCallbackQuery(this.translate(ctx, update.success
          ? 'startPoints.selected' : 'commands.participation.updatedButMessageFailed', { group: ctx.match[2] }));
        return;
      }
      const keys = {
        already_in_group: 'startPoints.alreadySelected', group_not_found: 'startPoints.unavailable',
        not_participating: result.ride?.settings?.requireParticipationApproval ? 'startPoints.applyFirst' : 'startPoints.joinFirst',
        ride_not_found: 'commands.participation.rideNotFound', ride_archived: 'commands.participation.rideArchived',
        ride_cancelled: 'commands.participation.rideCancelled', ride_changed: 'commands.participation.rideChangedRetry'
      };
      await ctx.answerCallbackQuery(this.translate(ctx, keys[result.status] || 'commands.participation.genericError', {
        group: ctx.match[2], hours: RIDE_ARCHIVE_AFTER_HOURS
      }));
    } catch (error) {
      console.error('Error selecting start point:', error);
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
        : result.status === 'participant_limit_reached'
          ? 'commands.participation.participantLimitReached'
        : result.status === 'ride_not_found'
          ? 'commands.participation.rideNotFound'
          : result.status === 'ride_archived'
            ? 'commands.participation.rideArchived'
          : result.status === 'ride_cancelled'
            ? 'commands.participation.rideCancelled'
            : 'commands.participation.applicationStale';
      await ctx.answerCallbackQuery(this.translate(ctx, key, result.status === 'ride_archived'
        ? { hours: RIDE_ARCHIVE_AFTER_HOURS }
        : {}));
    } catch (error) {
      console.error('Error deciding participation application:', error);
      await ctx.answerCallbackQuery(this.translate(ctx, 'commands.participation.genericError'));
    }
  }
}
