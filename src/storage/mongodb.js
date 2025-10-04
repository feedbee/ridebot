import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';
import { DEFAULT_CATEGORY } from '../utils/category-utils.js';
import { MigrationRunner } from '../migrations/MigrationRunner.js';

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
  messageThreadId: { type: Number, default: null }
});

const rideSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: DEFAULT_CATEGORY },
  date: { type: Date, required: true },
  messages: [messageSchema],
  routeLink: String,
  meetingPoint: String,
  distance: Number,
  duration: Number,
  speedMin: Number,
  speedMax: Number,
  additionalInfo: String,
  cancelled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Number, required: true },
  organizer: { type: String },
  updatedAt: { type: Date },
  updatedBy: { type: Number },
  participation: { type: participationSchema, default: () => ({ joined: [], thinking: [], skipped: [] }) }
});

// Create indexes
rideSchema.index({ 'messages.chatId': 1, 'messages.messageId': 1, 'messages.messageThreadId': 1 }, { sparse: true });
rideSchema.index({ createdBy: 1, date: -1 }); // For efficient querying of rides by creator

const Ride = mongoose.model('Ride', rideSchema);

export class MongoDBStorage extends StorageInterface {
  constructor() {
    super();
    this.connect();
  }

  async connect() {
    try {
      await mongoose.connect(config.mongodb.uri);
      console.log('Connected to MongoDB');
      
      // Skip schema validation in test environment
      if (process.env.NODE_ENV !== 'test') {
        // Validate schema version using MigrationRunner
        const migrationRunner = new MigrationRunner(config.mongodb.uri);
        await migrationRunner.validateSchemaVersion();
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
      participation: { joined: [], thinking: [], skipped: [] }
    };
    
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

  async getRidesByCreator(userId, skip, limit) {
    try {
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
    } catch (error) {
      console.error('Error getting rides by creator:', error);
      return { total: 0, rides: [] };
    }
  }


  async deleteRide(rideId) {
    const ride = await Ride.findByIdAndDelete(rideId);
    return ride !== null;
  }

  async setParticipation(rideId, userId, state, participant) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    // Ensure participation structure exists
    if (!ride.participation) {
      ride.participation = { joined: [], thinking: [], skipped: [] };
    }

    // Remove user from all states first
    ride.participation.joined = ride.participation.joined.filter(p => p.userId !== userId);
    ride.participation.thinking = ride.participation.thinking.filter(p => p.userId !== userId);
    ride.participation.skipped = ride.participation.skipped.filter(p => p.userId !== userId);

    // Add user to the specified state
    const participantData = {
      userId: participant.userId,
      username: participant.username,
      firstName: participant.firstName || '',
      lastName: participant.lastName || '',
      createdAt: new Date()
    };

    ride.participation[state].push(participantData);
    await ride.save();
    return { ride: this.mapRideToInterface(ride) };
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

  mapRideToInterface(ride) {
    if (!ride) return null;
    const rideObj = ride.toObject ? ride.toObject() : ride;
    
    // Create the ride object with the messages array
    const result = {
      id: rideObj._id.toString(),
      title: rideObj.title,
      category: rideObj.category || DEFAULT_CATEGORY,
      date: rideObj.date,
      messages: rideObj.messages || [],
      routeLink: rideObj.routeLink,
      meetingPoint: rideObj.meetingPoint,
      distance: rideObj.distance,
      duration: rideObj.duration,
      speedMin: rideObj.speedMin,
      speedMax: rideObj.speedMax,
      additionalInfo: rideObj.additionalInfo,
      cancelled: rideObj.cancelled,
      createdAt: rideObj.createdAt,
      createdBy: rideObj.createdBy,
      organizer: rideObj.organizer,
      updatedAt: rideObj.updatedAt,
      updatedBy: rideObj.updatedBy,
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
      }
    };
    
    return result;
  }
} 
