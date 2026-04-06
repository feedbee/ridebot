import { BaseCommandHandler } from './BaseCommandHandler.js';
import { DateParser } from '../utils/date-parser.js';

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

    if (ctx.chat?.type !== 'supergroup') {
      const command = rideId ? `/attach #${rideId}` : '/attach';
      await ctx.reply(this.translate(ctx, 'commands.group.notSupergroup', { command }), { parse_mode: 'HTML' });
      return;
    }
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
    const rideWithGroupId = { ...ride, groupId };

    // Rename the group (best-effort)
    try {
      const dateStr = DateParser.formatDateForChatTitle(ride.date, ctx.lang);
      const chatTitle = this.translate(ctx, 'commands.group.chatTitle', { title: ride.title, date: dateStr })
        .slice(0, 255);
      await ctx.api.setChatTitle(groupId, chatTitle);
    } catch (titleError) {
      console.error('GroupCommandHandler: failed to set chat title:', titleError);
    }

    // Post and pin the ride message in the group
    try {
      const { sentMessage } = await this.rideMessagesService.createRideMessage(rideWithGroupId, ctx, ctx.message?.message_thread_id);
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
      await this.groupManagementService.addParticipant(ctx.api, groupId, participant.userId, ctx.lang, ride.createdBy);
    }

    // Update all pre-existing ride messages to show the group chat line (best-effort)
    try {
      const latestRide = await this.rideService.getRide(rideId);
      if (latestRide) await this.rideMessagesService.updateRideMessages(latestRide, ctx);
    } catch (updateError) {
      console.error('GroupCommandHandler: failed to update ride messages after attach:', updateError);
    }

    await ctx.reply(this.translate(ctx, 'commands.group.attachSuccess'));
  }

  /**
   * Handle /joinchat #rideId — sends an invite link to join the ride's group chat
   * @param {import('grammy').Context} ctx
   */
  async handleJoinChat(ctx) {
    const { rideId, error } = this.rideMessagesService.extractRideId(ctx.message, ctx.lang ? { language: ctx.lang } : {});
    if (!rideId) {
      await ctx.reply(error || this.translate(ctx, 'commands.group.invalidRideIdUsage'));
      return;
    }

    let ride;
    try {
      ride = await this.rideService.getRide(rideId);
    } catch (e) {
      ride = null;
    }
    if (!ride) {
      await ctx.reply(this.translate(ctx, 'commands.group.rideNotFound'));
      return;
    }
    if (!ride.groupId) {
      await ctx.reply(this.translate(ctx, 'commands.group.joinchatNoGroup'));
      return;
    }

    const isParticipant = (ride.participation?.joined || []).some(p => p.userId === ctx.from.id);
    if (!isParticipant) {
      await ctx.reply(this.translate(ctx, 'commands.group.joinchatNotParticipant'));
      return;
    }

    await this.groupManagementService.addParticipant(ctx.api, ride.groupId, ctx.from.id, ctx.lang, ride.createdBy);
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
    try {
      await this.rideMessagesService.updateRideMessages({ ...ride, groupId: null }, ctx);
    } catch (updateError) {
      console.error('GroupCommandHandler: failed to update ride messages after detach:', updateError);
    }
    await ctx.reply(this.translate(ctx, 'commands.group.detachSuccess'));
  }
}
