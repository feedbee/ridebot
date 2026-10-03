import { isRideArchived } from '../services/ride-lifecycle.js';
import { buildActiveRideFilter } from './mongo-ride-lifecycle.js';
import { BOOLEAN_RIDE_SETTING_NAMES } from '../models/ride-settings.js';
import { MIN_PARTICIPANT_LIMIT, MAX_PARTICIPANT_LIMIT } from '../utils/participant-limit.js';
import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';
import { DEFAULT_CATEGORY, normalizeCategory } from '../utils/category-utils.js';
import { MigrationRunner } from '../migrations/MigrationRunner.js';
import { getRideRoutes, normalizeRoutes } from '../utils/route-links.js';
import { buildCapacityFilter, buildParticipationUpdate, createParticipantData } from './mongo-participation.js';

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
  ...Object.fromEntries(BOOLEAN_RIDE_SETTING_NAMES.map(name => [name, { type: Boolean }])),
  participantLimit: {
    type: Number,
    min: MIN_PARTICIPANT_LIMIT,
    max: MAX_PARTICIPANT_LIMIT,
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

  /** Update content and individual settings without replacing other settings.
   * @param {string} rideId
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async setRideCancelledIfActive(rideId, cancelled, userId) {
    const updates = { cancelled, updatedAt: new Date() };
    if (userId !== null) updates.updatedBy = userId;
    const ride = await Ride.findOneAndUpdate(
      { _id: rideId, ...buildActiveRideFilter(), cancelled: cancelled ? { $ne: true } : true },
      { $set: updates },
      { new: true }
    );
    if (ride) return { status: 'changed', ride: this.mapRideToInterface(ride) };
    const currentRide = await Ride.findById(rideId);
    if (!currentRide) return null;
    return { status: isRideArchived(currentRide) ? 'ride_archived' : 'already_in_state' };
  }

  async updateRide(rideId, updates) {
    const { settings, ...fields } = updates;
    if (fields.updatedBy) fields.updatedAt = new Date();
    if (fields.category !== undefined) fields.category = normalizeCategory(fields.category);
    if (fields.routes !== undefined) fields.routes = normalizeRoutes(fields.routes);
    for (const [key, value] of Object.entries(settings || {})) fields[`settings.${key}`] = value;
    const ride = Object.keys(fields).length
      ? await Ride.findByIdAndUpdate(rideId, { $set: fields }, { returnDocument: 'after', runValidators: true })
      : await Ride.findById(rideId);
    if (!ride) throw new Error('Ride not found');
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

  /** Atomically append one tracked announcement. */
  async addRideMessage(rideId, message) {
    const ride = await Ride.findByIdAndUpdate(
      rideId, { $push: { messages: message } }, { returnDocument: 'after', runValidators: true }
    );
    if (!ride) throw new Error('Ride not found');
    return this.mapRideToInterface(ride);
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

    const participantData = { _id: new mongoose.Types.ObjectId(), ...createParticipantData(participantProfile) };

    const filter = {
      _id: rideId,
      [`participation.${state}.userId`]: { $ne: participantProfile.userId }
    };
    Object.assign(filter, buildCapacityFilter(state));

    const nextParticipation = buildParticipationUpdate(state, participantData);

    const updatedRide = await Ride.findOneAndUpdate(
      filter,
      [{ $set: nextParticipation }],
      { returnDocument: 'after', updatePipeline: true }
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
    const participantData = createParticipantData(participantProfile);
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
    const nextParticipation = buildParticipationUpdate(state, participantData);
    const filter = { _id: rideId, cancelled: { $ne: true }, ...approvalFilter, ...participationFilter };
    Object.assign(filter, buildCapacityFilter(state));
    const ride = await Ride.findOneAndUpdate(
      filter,
      [{ $set: nextParticipation }],
      { returnDocument: 'after', updatePipeline: true }
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
    const participantData = createParticipantData(participantProfile);
    const filter = {
      _id: rideId,
      cancelled: { $ne: true },
      'settings.requireParticipationApproval': true,
      [`participation.${expectedState}.userId`]: userId
    };
    Object.assign(filter, buildCapacityFilter(targetState));
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

  /** Patch profile and settings atomically; initialize defaults only if absent.
   * @param {Object} userData
   * @param {{initializeRideDefaults?: Object}} options
   * @returns {Promise<Object>}
   */
  async upsertUser(userData, { initializeRideDefaults } = {}) {
    const fields = { updatedAt: new Date() };
    for (const key of ['username', 'firstName', 'lastName']) {
      if (userData[key] != null) fields[key] = userData[key];
    }
    for (const [key, value] of Object.entries(userData.settings || {})) {
      if (key === 'rideDefaults') {
        for (const [name, setting] of Object.entries(value || {})) fields[`settings.rideDefaults.${name}`] = setting;
      } else {
        fields[`settings.${key}`] = value;
      }
    }
    let user = await User.findOneAndUpdate(
      { userId: userData.userId },
      { $set: fields, $setOnInsert: { userId: userData.userId, createdAt: new Date() } },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    if (initializeRideDefaults) {
      await User.updateOne(
        { userId: userData.userId, 'settings.rideDefaults': { $exists: false } },
        { $set: { 'settings.rideDefaults': initializeRideDefaults } },
        { runValidators: true }
      );
      user = await User.findOne({ userId: userData.userId });
    }
    return this.mapUserToInterface(user);
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
