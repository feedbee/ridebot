import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from './config.js';
import { RouteParser } from './utils/route-parser.js';
import { StorageInterface } from './storage/interface.js';

export class BikeRideBot {
  /**
   * @param {StorageInterface} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.bot = new Bot(config.bot.token);
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.command('newride', this.handleNewRide.bind(this));
    this.bot.command('updateride', this.handleUpdateRide.bind(this));
    this.bot.callbackQuery(/^join:(.+)$/, this.handleJoinRide.bind(this));
    this.bot.callbackQuery(/^leave:(.+)$/, this.handleLeaveRide.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
  }

  async handleHelp(ctx) {
    const helpText = `
*Bike Ride Bot Help*

Create a new ride with /newride command followed by parameters (one per line):
title: Ride title
when: Date and time (DD.MM.YYYY HH:MM)
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
time: Duration in minutes (optional)
speed: Speed range in km/h (optional)

Example:
/newride
title: Evening Ride
when: 25.03.2024 18:30
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
time: 90
speed: 25-28

To update a ride:
1. Reply to the ride message
2. Use /updateride command with new parameters
3. Only the ride creator can update it

Example:
/updateride
title: Updated Evening Ride
when: 25.03.2024 19:00
meet: City Park entrance
speed: 26-29
`;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  }

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

  parseCommandParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        params[key.trim().toLowerCase()] = value.trim();
      }
    }

    return params;
  }

  async handleNewRide(ctx) {
    const params = this.parseCommandParams(ctx.message.text);
    
    if (!params.title || !params.when) {
      await ctx.reply(
        'Please provide at least title and date/time. Use /help for format example.'
      );
      return;
    }

    try {
      const date = this.parseDateTime(params.when);
      
      // First create the ride without messageId
      const rideData = {
        title: params.title,
        date,
        chatId: ctx.chat.id,
        createdBy: ctx.from.id
      };

      if (params.meet) {
        rideData.meetingPoint = params.meet;
      }

      if (params.route) {
        if (RouteParser.isValidRouteUrl(params.route)) {
          rideData.routeLink = params.route;
          const routeInfo = await RouteParser.parseRoute(params.route);
          if (routeInfo) {
            if (!params.dist) rideData.distance = routeInfo.distance;
            if (!params.time) rideData.duration = routeInfo.duration;
          }
        }
      }

      if (params.dist) {
        rideData.distance = parseFloat(params.dist);
      }

      if (params.time) {
        rideData.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) rideData.speedMin = min;
        if (!isNaN(max)) rideData.speedMax = max;
      }

      const ride = await this.storage.createRide(rideData);
      
      // Create initial message
      const participants = await this.storage.getParticipants(ride.id);
      const keyboard = new InlineKeyboard();
      keyboard.text(config.buttons.join, `join:${ride.id}`);

      const message = this.formatRideMessage(ride, participants);
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Update ride with the message ID
      await this.storage.updateRide(ride.id, {
        messageId: sentMessage.message_id
      });
    } catch (error) {
      await ctx.reply('Error creating ride: ' + error.message);
    }
  }

  async handleUpdateRide(ctx) {
    const params = this.parseCommandParams(ctx.message.text);
    
    // Check if this is a reply to a message
    if (!ctx.message.reply_to_message) {
      await ctx.reply('Please reply to the ride message you want to update.');
      return;
    }

    try {
      // Extract ride ID from the original message
      const originalMessage = ctx.message.reply_to_message.text;
      const rideIdMatch = originalMessage.match(/🎫\s*Ride\s*#(\w+)/i);
      
      if (!rideIdMatch) {
        await ctx.reply('Could not find ride ID in the message. Please make sure you are replying to a ride message.');
        return;
      }

      const rideId = rideIdMatch[1];
      const ride = await this.storage.getRide(rideId);

      if (ride.createdBy !== ctx.from.id) {
        await ctx.reply('Only the ride creator can update it');
        return;
      }

      const updates = {};

      if (params.title) updates.title = params.title;
      if (params.when) updates.date = this.parseDateTime(params.when);
      if (params.meet) updates.meetingPoint = params.meet;

      if (params.route) {
        if (RouteParser.isValidRouteUrl(params.route)) {
          updates.routeLink = params.route;
          const routeInfo = await RouteParser.parseRoute(params.route);
          if (routeInfo) {
            if (!params.dist) updates.distance = routeInfo.distance;
            if (!params.time) updates.duration = routeInfo.duration;
          }
        }
      }

      if (params.dist) {
        updates.distance = parseFloat(params.dist);
      }

      if (params.time) {
        updates.duration = parseInt(params.time);
      }

      if (params.speed) {
        const [min, max] = params.speed.split('-').map(s => parseFloat(s.trim()));
        if (!isNaN(min)) updates.speedMin = min;
        if (!isNaN(max)) updates.speedMax = max;
      }

      const updatedRide = await this.storage.updateRide(rideId, updates);
      await this.updateRideMessage(updatedRide);
      await ctx.reply('Ride updated successfully');
    } catch (error) {
      await ctx.reply('Error updating ride: ' + error.message);
    }
  }

  async handleJoinRide(ctx) {
    const rideId = ctx.match[1];
    try {
      const success = await this.storage.addParticipant(rideId, {
        userId: ctx.from.id,
        username: ctx.from.username || ctx.from.first_name
      });

      if (success) {
        const ride = await this.storage.getRide(rideId);
        await this.updateRideMessage(ride);
      }

      await ctx.answerCallbackQuery('You have joined the ride!');
    } catch (error) {
      await ctx.answerCallbackQuery('Error joining the ride');
    }
  }

  async handleLeaveRide(ctx) {
    const rideId = ctx.match[1];
    try {
      const success = await this.storage.removeParticipant(rideId, ctx.from.id);

      if (success) {
        const ride = await this.storage.getRide(rideId);
        await this.updateRideMessage(ride);
      }

      await ctx.answerCallbackQuery('You have left the ride');
    } catch (error) {
      await ctx.answerCallbackQuery('Error leaving the ride');
    }
  }

  async updateRideMessage(ride) {
    // Skip if no messageId (shouldn't happen, but just in case)
    if (!ride.messageId) {
      console.error('No messageId for ride:', ride.id);
      return;
    }

    const participants = await this.storage.getParticipants(ride.id);
    const keyboard = new InlineKeyboard();

    const participantIds = participants.map(p => p.userId);
    const buttonText = participantIds.includes(ride.createdBy) 
      ? config.buttons.leave 
      : config.buttons.join;
    const callbackData = participantIds.includes(ride.createdBy)
      ? `leave:${ride.id}`
      : `join:${ride.id}`;

    keyboard.text(buttonText, callbackData);

    const message = this.formatRideMessage(ride, participants);

    try {
      await this.bot.api.editMessageText(
        ride.chatId,
        ride.messageId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error('Error updating message:', error);
    }
  }

  formatRideMessage(ride, participants) {
    const dateStr = ride.date.toLocaleDateString('en-GB');
    const timeStr = ride.date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let meetingInfo = '';
    if (ride.meetingPoint) {
      meetingInfo = `\n📍 Meeting point: ${ride.meetingPoint}`;
    }

    let routeInfo = '';
    if (ride.routeLink) {
      routeInfo = `\n🔗 Route: ${ride.routeLink}`;
    }

    let distanceInfo = '';
    if (ride.distance) {
      distanceInfo = `\n📏 Distance: ${ride.distance} km`;
    }

    let durationInfo = '';
    if (ride.duration) {
      const hours = Math.floor(ride.duration / 60);
      const minutes = ride.duration % 60;
      durationInfo = `\n⏱ Duration: ${hours}h ${minutes}m`;
    }

    let speedInfo = '';
    if (ride.speedMin || ride.speedMax) {
      speedInfo = '\n🚴 Speed: ';
      if (ride.speedMin && ride.speedMax) {
        speedInfo += `${ride.speedMin}-${ride.speedMax} km/h`;
      } else if (ride.speedMin) {
        speedInfo += `min ${ride.speedMin} km/h`;
      } else {
        speedInfo += `max ${ride.speedMax} km/h`;
      }
    }

    const participantList = participants.length > 0
      ? participants.map(p => `@${p.username}`).join('\n')
      : 'No participants yet';

    // Add ride ID in a visually pleasing way
    const rideInfo = `🎫 Ride #${ride.id}`;

    return config.messageTemplates.ride
      .replace('{title}', ride.title)
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{meetingInfo}', meetingInfo)
      .replace('{routeInfo}', routeInfo)
      .replace('{distanceInfo}', distanceInfo)
      .replace('{durationInfo}', durationInfo)
      .replace('{speedInfo}', speedInfo)
      .replace('{participantCount}', participants.length)
      .replace('{participants}', participantList)
      .replace('{joinInstructions}', `${rideInfo}\nClick the button below to join or leave the ride`);
  }

  parseDateTime(dateTimeStr) {
    const [dateStr, timeStr] = dateTimeStr.split(' ');
    const [day, month, year] = dateStr.split('.').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);

    const date = new Date(year, month - 1, day, hours, minutes);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date/time format');
    }

    return date;
  }
} 
