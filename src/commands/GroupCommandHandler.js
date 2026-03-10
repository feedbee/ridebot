import { BaseCommandHandler } from './BaseCommandHandler.js';

/**
 * Handler for /attach and /detach commands.
 * Links or unlinks a Telegram group to a ride, enabling automatic
 * group membership sync with ride participation.
 */
export class GroupCommandHandler extends BaseCommandHandler {
  /**
   * @param {import('../services/RideService.js').RideService} rideService
   * @param {import('../formatters/MessageFormatter.js').MessageFormatter} messageFormatter
   * @param {import('../services/RideMessagesService.js').RideMessagesService} rideMessagesService
   * @param {import('../services/GroupManagementService.js').GroupManagementService} groupManagementService
   */
  constructor(rideService, messageFormatter, rideMessagesService, groupManagementService) {
    super(rideService, messageFormatter, rideMessagesService);
    this.groupManagementService = groupManagementService;
  }

  /**
   * Handle /attach #rideId — links the current group to a ride
   * @param {import('grammy').Context} ctx
   */
  async handleAttach(ctx) {
    if (ctx.chat?.type === 'private') {
      await ctx.reply(this.translate(ctx, 'commands.group.notInGroup'));
      return;
    }

    const { rideId, error } = this.rideMessagesService.extractRideId(ctx.message, ctx.lang ? { language: ctx.lang } : {});
    if (!rideId) {
      await ctx.reply(error || this.translate(ctx, 'commands.group.invalidRideIdUsage'));
      return;
    }

    let ride;
    try {
      ride = await this.rideService.getRide(rideId);
    } catch (e) {
      await ctx.reply(this.translate(ctx, 'commands.group.rideNotFound'));
      return;
    }

    if (!ride) {
      await ctx.reply(this.translate(ctx, 'commands.group.rideNotFound'));
      return;
    }

    if (!this.isRideCreator(ride, ctx.from.id)) {
      await ctx.reply(this.translate(ctx, 'commands.group.notCreator'));
      return;
    }

    if (ride.groupId) {
      await ctx.reply(this.translate(ctx, 'commands.group.alreadyAttached'));
      return;
    }

    // Verify bot is admin with invite permission
    const botInfo = await ctx.api.getMe();
    let botMember;
    try {
      botMember = await ctx.api.getChatMember(ctx.chat.id, botInfo.id);
    } catch (e) {
      await ctx.reply(this.translate(ctx, 'commands.group.botNotAdmin'));
      return;
    }

    if (botMember.status !== 'administrator') {
      await ctx.reply(this.translate(ctx, 'commands.group.botNotAdmin'));
      return;
    }

    if (!botMember.can_invite_users) {
      await ctx.reply(this.translate(ctx, 'commands.group.botNeedsAddMembersPermission'));
      return;
    }

    const groupId = ctx.chat.id;

    // Save groupId to ride
    await this.rideService.updateRide(rideId, { groupId });

    // Post and pin the ride message in the group
    try {
      const { sentMessage } = await this.rideMessagesService.createRideMessage(ride, ctx, ctx.message?.message_thread_id);
      if (sentMessage?.message_id) {
        try {
          await ctx.api.pinChatMessage(groupId, sentMessage.message_id, { disable_notification: true });
        } catch (pinError) {
          console.error('GroupCommandHandler: failed to pin message:', pinError);
        }
      }
    } catch (postError) {
      console.error('GroupCommandHandler: failed to post ride message:', postError);
    }

    // Add all currently joined participants (best-effort)
    const joined = ride.participation?.joined || [];
    for (const participant of joined) {
      await this.groupManagementService.addParticipant(ctx.api, groupId, participant.userId, ctx.lang);
    }

    await ctx.reply(this.translate(ctx, 'commands.group.attachSuccess'));
  }

  /**
   * Handle /detach — unlinks the current group from its ride
   * @param {import('grammy').Context} ctx
   */
  async handleDetach(ctx) {
    if (ctx.chat?.type === 'private') {
      await ctx.reply(this.translate(ctx, 'commands.group.notInGroup'));
      return;
    }

    const groupId = ctx.chat.id;

    let ride;
    try {
      ride = await this.rideService.getRideByGroupId(groupId);
    } catch (e) {
      ride = null;
    }

    if (!ride) {
      await ctx.reply(this.translate(ctx, 'commands.group.noGroupAttached'));
      return;
    }

    // Allow ride creator or a group admin to detach
    const isCreator = this.isRideCreator(ride, ctx.from.id);
    if (!isCreator) {
      let callerMember;
      try {
        callerMember = await ctx.api.getChatMember(groupId, ctx.from.id);
      } catch (e) {
        callerMember = null;
      }
      const isGroupAdmin = callerMember?.status === 'administrator' || callerMember?.status === 'creator';
      if (!isGroupAdmin) {
        await ctx.reply(this.translate(ctx, 'commands.group.notCreator'));
        return;
      }
    }

    await this.rideService.updateRide(ride.id, { groupId: null });
    await ctx.reply(this.translate(ctx, 'commands.group.detachSuccess'));
  }
}
