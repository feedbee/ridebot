import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';
import { DEFAULT_CATEGORY, normalizeCategory } from '../utils/category-utils.js';
import { MigrationRunner } from '../migrations/MigrationRunner.js';
import { getRideRoutes, normalizeRoutes } from '../utils/route-links.js';

const participantSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  username: { type: String, default: '' }, // Optional as Telegram usernames are optional
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const participationSchema = new mongoose.Schema({
  joined: [participantSchema],
  thinking: [participantSchema],
  skipped: [participantSchema]
}, { _id: false });

const messageSchema = new mongoose.Schema({
  messageId: { type: Number, required: true },
  chatId: { type: Number, required: true },
  messageThreadId: { type: Number, default: null },
  language: { type: String, default: null },
  isForCreator: { type: Boolean, default: null },
  chatTitle: String,
  chatUsername: String,
  publishedBy: Number,
  publishedAt: Date
});

const routeSchema = new mongoose.Schema({
  url: { type: String, required: true },
  label: { type: String, default: undefined }
}, { _id: false });

const rideSettingsSchema = new mongoose.Schema({
  notifyParticipation: { type: Boolean },
  allowReposts: { type: Boolean },
  requireParticipationApproval: { type: Boolean },
  participantLimit: {
    type: Number,
    min: 0,
    max: 1000,
    validate: Number.isInteger
  }
}, { _id: false });

const rideSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: DEFAULT_CATEGORY },
  date: { type: Date, required: true },
  messages: [messageSchema],
  routes: [routeSchema],
  routeLink: String,
  meetingPoint: String,
  distance: Number,
  duration: Number,
  speedMin: Number,
  speedMax: Number,
  cruisingSpeedMin: Number,
  cruisingSpeedMax: Number,
  chat: String,
  additionalInfo: String,
  settings: { type: rideSettingsSchema, default: undefined },
  cancelled: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  groupId: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Number, required: true },
  organizer: { type: String },
  updatedAt: { type: Date },
  updatedBy: { type: Number },
  participation: { type: participationSchema, default: () => ({ joined: [], thinking: [], skipped: [] }) }
});

// Supports getRidesByCreator() query pattern: filter by createdBy + sort by date desc.
rideSchema.index({ createdBy: 1, date: -1 });
rideSchema.index({ 'participation.joined.userId': 1, date: 1 });
rideSchema.index({ 'participation.thinking.userId': 1, date: 1 });
rideSchema.index(
  { groupId: 1 },
  { unique: true, partialFilterExpression: { groupId: { $type: 'number' } } }
);
rideSchema.index(
  { 'metadata.stravaId': 1, createdBy: 1 },
  { partialFilterExpression: { 'metadata.stravaId': { $exists: true } } }
);

const Ride = mongoose.model('Ride', rideSchema);

const userSettingsSchema = new mongoose.Schema({
  rideDefaults: { type: rideSettingsSchema, default: undefined },
  participationNotificationLevel: { type: String, enum: ['all', 'membership'], default: undefined }
}, { _id: false });

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  settings: { type: userSettingsSchema, default: undefined },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export class MongoDBStorage extends StorageInterface {
  constructor() {
    super();
    this.ready = this.connect();
  }

  async connect() {
    try {
      await mongoose.connect(config.mongodb.uri);
      console.log('Connected to MongoDB');
      await Ride.createIndexes();
      console.log('Ride indexes ensured');
      await User.createIndexes();
      console.log('User indexes ensured');

      // Skip schema validation in test environment
      if (process.env.NODE_ENV !== 'test') {
        const db = mongoose.connection.db;
        const metaDoc = await db.collection('meta').findOne({});
        const currentVersion = metaDoc ? metaDoc.schemaVersion : 0;
        MigrationRunner.validateVersion(currentVersion);
      }
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  async createRide(ride) {
    let rideData = {
      ...ride,
      category: normalizeCategory(ride.category),
      participation: { joined: [], thinking: [], skipped: [] }
    };
    if (ride.routes !== undefined) {
      rideData.routes = normalizeRoutes(ride.routes);
    }

    // Ensure messages array exists
    if (!rideData.messages) {
      rideData.messages = [];
    }

    const newRide = new Ride(rideData);
    await newRide.save();
    return this.mapRideToInterface(newRide);
  }

  async updateRide(rideId, updates) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    // Preserve the messages array if it's not being updated
    // This is critical to ensure message tracking works properly
    let updatesToApply = { ...updates };

    // Set updatedAt to current time only if updatedBy is set
    if (updatesToApply.updatedBy) {
      updatesToApply.updatedAt = new Date();
    }

    if (updatesToApply.category !== undefined) {
      updatesToApply.category = normalizeCategory(updatesToApply.category);
    }
    if (updatesToApply.routes !== undefined) {
      updatesToApply.routes = normalizeRoutes(updatesToApply.routes);
    }
    // Apply updates
    Object.assign(ride, updatesToApply);
    await ride.save();
    return this.mapRideToInterface(ride);
  }

  async getRide(rideId) {
    try {
      const ride = await Ride.findById(rideId);
      return this.mapRideToInterface(ride);
    } catch (error) {
      console.error('Error getting ride:', error);
      return null;
    }
  }

  async removeRideMessages(rideId, messages) {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      { $pull: { messages: { $or: messages.map(({ chatId, messageId }) => ({ chatId, messageId })) } } },
      { new: true }
    );
    if (!ride) throw new Error('Ride not found');
    return this.mapRideToInterface(ride);
  }

  async getRidesByCreator(userId, skip, limit) {
    const [rides, total] = await Promise.all([
      Ride.find({ createdBy: userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Ride.countDocuments({ createdBy: userId })
    ]);

    return {
      total,
      rides: rides.map(ride => this.mapRideToInterface(ride))
    };
  }

  async getRecentPublicationDestinations(userId, limit) {
    const rides = await Ride.find({ createdBy: userId }, { messages: 1, createdAt: 1 }).lean();
    const publications = rides
      .flatMap(ride => (ride.messages || []).map((message, index) => ({
        ...message,
        publishedAt: message.publishedAt || ride.createdAt,
        _fallbackOrder: index
      })))
      .filter(message => !message.isForCreator)
      .filter(message => message.publishedBy == null || message.publishedBy === userId)
      .sort((left, right) => {
        const dateDifference = new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
        return dateDifference || right._fallbackOrder - left._fallbackOrder;
      });

    const destinations = [];
    const seen = new Set();
    for (const { _fallbackOrder, _id, ...message } of publications) {
      const key = `${message.chatId}:${message.messageThreadId ?? 'main'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      destinations.push(message);
      if (destinations.length === limit) break;
    }

    return destinations;
  }

  /**
   * Get current and future rides where a user is joined or thinking.
   * @param {number} userId - Participant's user ID
   * @param {Date} startOfToday - Inclusive date boundary
   * @param {number} skip - Number of items to skip
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<RidesList>}
   */
  async getPlannedRides(userId, startOfToday, skip, limit) {
    const query = {
      date: { $gte: startOfToday },
      $or: [
        { 'participation.joined.userId': userId },
        { 'participation.thinking.userId': userId }
      ]
    };

    const [rides, total] = await Promise.all([
      Ride.find(query)
        .sort({ date: 1 })
        .skip(skip)
        .limit(limit),
      Ride.countDocuments(query)
    ]);

    return {
      total,
      rides: rides.map(ride => this.mapRideToInterface(ride))
    };
  }


  async deleteRide(rideId) {
    const ride = await Ride.findByIdAndDelete(rideId);
    return ride !== null;
  }

  async getRideByGroupId(groupId) {
    try {
      const ride = await Ride.findOne({ groupId });
      return this.mapRideToInterface(ride);
    } catch (error) {
      console.error('Error getting ride by groupId:', error);
      return null;
    }
  }

  async getRideByStravaId(stravaId, createdBy) {
    try {
      const ride = await Ride.findOne({ 'metadata.stravaId': stravaId, createdBy });
      return this.mapRideToInterface(ride);
    } catch (error) {
      console.error('Error getting ride by stravaId:', error);
      return null;
    }
  }

  async setParticipation(rideId, state, participantProfile) {
    const currentRide = await Ride.findById(rideId);
    if (!currentRide) {
      throw new Error('Ride not found');
    }

    const participation = currentRide.participation || { joined: [], thinking: [], skipped: [] };
    const previousState = ['joined', 'thinking', 'skipped']
      .find(candidate => participation[candidate].some(
        participant => participant.userId === participantProfile.userId
      )) || null;
    if (previousState === state) {
      return {
        status: 'already_in_state',
        ride: this.mapRideToInterface(currentRide),
        previousState
      };
    }

    const participantData = {
      _id: new mongoose.Types.ObjectId(),
      userId: participantProfile.userId,
      username: participantProfile.username,
      firstName: participantProfile.firstName || '',
      lastName: participantProfile.lastName || '',
      createdAt: new Date()
    };

    const filter = {
      _id: rideId,
      [`participation.${state}.userId`]: { $ne: participantProfile.userId }
    };
    if (state === 'joined') {
      filter.$expr = {
        $or: [
          { $lte: [{ $ifNull: ['$settings.participantLimit', 0] }, 0] },
          {
            $lt: [
              { $size: { $ifNull: ['$participation.joined', []] } },
              { $ifNull: ['$settings.participantLimit', 0] }
            ]
          }
        ]
      };
    }

    const filteredParticipants = candidate => ({
      $filter: {
        input: { $ifNull: [`$participation.${candidate}`, []] },
        as: 'participant',
        cond: { $ne: ['$$participant.userId', participantProfile.userId] }
      }
    });
    const nextParticipation = Object.fromEntries(
      ['joined', 'thinking', 'skipped'].map(candidate => [
        `participation.${candidate}`,
        candidate === state
          ? { $concatArrays: [filteredParticipants(candidate), { $literal: [participantData] }] }
          : filteredParticipants(candidate)
      ])
    );

    const updatedRide = await Ride.findOneAndUpdate(
      filter,
      [{ $set: nextParticipation }],
      { new: true, updatePipeline: true }
    );
    if (updatedRide) {
      return {
        status: 'changed',
        ride: this.mapRideToInterface(updatedRide),
        previousState
      };
    }

    const unchangedRide = await Ride.findById(rideId);
    if (!unchangedRide) throw new Error('Ride not found');
    const currentState = ['joined', 'thinking', 'skipped']
      .find(candidate => unchangedRide.participation?.[candidate]?.some(
        participant => participant.userId === participantProfile.userId
      )) || null;
    return {
      status: currentState === state ? 'already_in_state' : 'participant_limit_reached',
      ride: this.mapRideToInterface(unchangedRide),
      previousState: currentState
    };
  }

  async setParticipationForRideMode(rideId, state, participantProfile, requireParticipationApproval, expectedState) {
    const participantData = {
      userId: participantProfile.userId,
      username: participantProfile.username,
      firstName: participantProfile.firstName || '',
      lastName: participantProfile.lastName || '',
      createdAt: new Date()
    };
    const approvalFilter = requireParticipationApproval
      ? { 'settings.requireParticipationApproval': true }
      : { 'settings.requireParticipationApproval': { $ne: true } };
    const participationFilter = expectedState
      ? { [`participation.${expectedState}.userId`]: participantProfile.userId }
      : {
          'participation.joined.userId': { $ne: participantProfile.userId },
          'participation.thinking.userId': { $ne: participantProfile.userId },
          'participation.skipped.userId': { $ne: participantProfile.userId }
        };
    const withoutUser = participationState => ({
      $filter: {
        input: { $ifNull: [`$participation.${participationState}`, []] },
        as: 'participant',
        cond: { $ne: ['$$participant.userId', participantProfile.userId] }
      }
    });
    const nextParticipation = Object.fromEntries(
      ['joined', 'thinking', 'skipped'].map(participationState => [
        participationState,
        participationState === state
          ? { $concatArrays: [withoutUser(participationState), { $literal: [participantData] }] }
          : withoutUser(participationState)
      ])
    );
    const filter = { _id: rideId, cancelled: { $ne: true }, ...approvalFilter, ...participationFilter };
    if (state === 'joined') {
      filter.$expr = {
        $or: [
          { $lte: [{ $ifNull: ['$settings.participantLimit', 0] }, 0] },
          {
            $lt: [
              { $size: { $ifNull: ['$participation.joined', []] } },
              { $ifNull: ['$settings.participantLimit', 0] }
            ]
          }
        ]
      };
    }
    const ride = await Ride.findOneAndUpdate(
      filter,
      [{ $set: { participation: nextParticipation } }],
      { new: true, updatePipeline: true }
    );
    if (ride) {
      return { status: 'changed', ride: this.mapRideToInterface(ride), previousState: expectedState };
    }

    const unchangedRide = await Ride.findById(rideId);
    const actualState = ['joined', 'thinking', 'skipped'].find(participationState =>
      unchangedRide?.participation?.[participationState]?.some(
        participant => participant.userId === participantProfile.userId
      )
    ) || null;
    const sameMode = (unchangedRide?.settings?.requireParticipationApproval === true)
      === requireParticipationApproval;
    const participantLimit = unchangedRide?.settings?.participantLimit ?? 0;
    if (unchangedRide && !unchangedRide.cancelled && sameMode && actualState === expectedState
      && state === 'joined' && participantLimit > 0
      && (unchangedRide.participation?.joined?.length || 0) >= participantLimit) {
      return {
        status: 'participant_limit_reached',
        ride: this.mapRideToInterface(unchangedRide),
        previousState: actualState
      };
    }
    return null;
  }

  async setParticipationIfCurrent(rideId, userId, expectedState, targetState, participantProfile) {
    const participantData = {
      userId: participantProfile.userId,
      username: participantProfile.username,
      firstName: participantProfile.firstName || '',
      lastName: participantProfile.lastName || '',
      createdAt: new Date()
    };
    const filter = {
      _id: rideId,
      cancelled: { $ne: true },
      'settings.requireParticipationApproval': true,
      [`participation.${expectedState}.userId`]: userId
    };
    if (targetState === 'joined') {
      filter.$expr = {
        $or: [
          { $lte: [{ $ifNull: ['$settings.participantLimit', 0] }, 0] },
          {
            $lt: [
              { $size: { $ifNull: ['$participation.joined', []] } },
              { $ifNull: ['$settings.participantLimit', 0] }
            ]
          }
        ]
      };
    }
    const ride = await Ride.findOneAndUpdate(
      filter,
      {
        $pull: { [`participation.${expectedState}`]: { userId } },
        $push: { [`participation.${targetState}`]: participantData }
      },
      { new: true }
    );
    if (ride) {
      return { status: 'changed', ride: this.mapRideToInterface(ride), previousState: expectedState };
    }

    const unchangedRide = await Ride.findById(rideId);
    const stillPending = unchangedRide?.participation?.[expectedState]?.some(
      participant => participant.userId === userId
    );
    const participantLimit = unchangedRide?.settings?.participantLimit ?? 0;
    if (unchangedRide && !unchangedRide.cancelled
      && unchangedRide.settings?.requireParticipationApproval === true
      && stillPending && targetState === 'joined' && participantLimit > 0
      && (unchangedRide.participation?.joined?.length || 0) >= participantLimit) {
      return {
        status: 'participant_limit_reached',
        ride: this.mapRideToInterface(unchangedRide),
        previousState: expectedState
      };
    }
    return null;
  }

  async getParticipation(rideId, userId) {
    const ride = await Ride.findById(rideId);
    if (!ride || !ride.participation) {
      return null;
    }

    if (ride.participation.joined.some(p => p.userId === userId)) return 'joined';
    if (ride.participation.thinking.some(p => p.userId === userId)) return 'thinking';
    if (ride.participation.skipped.some(p => p.userId === userId)) return 'skipped';
    return null;
  }

  async getAllParticipants(rideId) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    return ride.participation || { joined: [], thinking: [], skipped: [] };
  }

  async getUser(userId) {
    try {
      const user = await User.findOne({ userId });
      return this.mapUserToInterface(user);
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async upsertUser(userData) {
    const existingUser = await User.findOne({ userId: userData.userId });
    const now = new Date();
    const nextUser = existingUser || new User({
      userId: userData.userId,
      createdAt: now
    });

    nextUser.username = userData.username ?? nextUser.username ?? '';
    nextUser.firstName = userData.firstName ?? nextUser.firstName ?? '';
    nextUser.lastName = userData.lastName ?? nextUser.lastName ?? '';
    nextUser.settings = userData.settings !== undefined
      ? { ...(nextUser.settings || {}), ...userData.settings }
      : nextUser.settings;
    nextUser.updatedAt = now;

    await nextUser.save();
    return this.mapUserToInterface(nextUser);
  }

  mapRideToInterface(ride) {
    if (!ride) return null;
    const rideObj = ride.toObject ? ride.toObject() : ride;

    // Create the ride object with the messages array
    const result = {
      id: rideObj._id.toString(),
      title: rideObj.title,
      category: normalizeCategory(rideObj.category || DEFAULT_CATEGORY),
      date: rideObj.date,
      messages: rideObj.messages || [],
      routes: getRideRoutes(rideObj),
      routeLink: rideObj.routeLink,
      meetingPoint: rideObj.meetingPoint,
      distance: rideObj.distance,
      duration: rideObj.duration,
      speedMin: rideObj.speedMin,
      speedMax: rideObj.speedMax,
      cruisingSpeedMin: rideObj.cruisingSpeedMin,
      cruisingSpeedMax: rideObj.cruisingSpeedMax,
      chat: rideObj.chat,
      additionalInfo: rideObj.additionalInfo,
      settings: rideObj.settings,
      cancelled: rideObj.cancelled,
      groupId: rideObj.groupId || null,
      createdAt: rideObj.createdAt,
      createdBy: rideObj.createdBy,
      organizer: rideObj.organizer,
      updatedAt: rideObj.updatedAt,
      updatedBy: rideObj.updatedBy,
      metadata: rideObj.metadata ?? {},
      participation: {
        joined: (rideObj.participation?.joined || []).map(p => ({
          userId: p.userId,
          username: p.username,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          createdAt: p.createdAt
        })),
        thinking: (rideObj.participation?.thinking || []).map(p => ({
          userId: p.userId,
          username: p.username,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          createdAt: p.createdAt
        })),
        skipped: (rideObj.participation?.skipped || []).map(p => ({
          userId: p.userId,
          username: p.username,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          createdAt: p.createdAt
        }))
      },
      messages: (rideObj.messages || []).map(msg => ({
        chatId: msg.chatId,
        messageId: msg.messageId,
        messageThreadId: msg.messageThreadId ?? null,
        language: msg.language ?? undefined,
        isForCreator: msg.isForCreator ?? undefined,
        chatTitle: msg.chatTitle ?? undefined,
        chatUsername: msg.chatUsername ?? undefined,
        publishedBy: msg.publishedBy ?? undefined,
        publishedAt: msg.publishedAt ?? undefined
      }))
    };

    return result;
  }

  mapUserToInterface(user) {
    if (!user) return null;
    const userObj = user.toObject ? user.toObject() : user;

    return {
      userId: userObj.userId,
      username: userObj.username ?? '',
      firstName: userObj.firstName ?? '',
      lastName: userObj.lastName ?? '',
      settings: userObj.settings,
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt
    };
  }
} 
