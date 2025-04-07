import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';
import { DEFAULT_CATEGORY } from '../utils/category-utils.js';

const participantSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  username: { type: String, default: '' }, // Optional as Telegram usernames are optional
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  joinedAt: { type: Date, default: Date.now }
});

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
  participants: [participantSchema]
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
    let rideData = { ...ride, participants: [] };
    
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

  async addParticipant(rideId, participant) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return false;
    }

    // Check if participant already exists
    const exists = ride.participants.some(p => p.userId === participant.userId);
    if (exists) {
      return false;
    }

    ride.participants.push({
      userId: participant.userId,
      username: participant.username,
      firstName: participant.firstName || '',
      lastName: participant.lastName || '',
      joinedAt: new Date()
    });

    await ride.save();
    return true;
  }

  async removeParticipant(rideId, userId) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return false;
    }

    const initialLength = ride.participants.length;
    ride.participants = ride.participants.filter(p => p.userId !== userId);

    if (ride.participants.length === initialLength) {
      return false;
    }

    await ride.save();
    return true;
  }

  async getParticipants(rideId) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return [];
    }

    return ride.participants.map(p => ({
      userId: p.userId,
      username: p.username,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      joinedAt: p.joinedAt
    }));
  }

  async deleteRide(rideId) {
    const ride = await Ride.findByIdAndDelete(rideId);
    return ride !== null;
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
      cancelled: rideObj.cancelled,
      createdAt: rideObj.createdAt,
      createdBy: rideObj.createdBy,
      participants: rideObj.participants?.map(p => ({
        userId: p.userId,
        username: p.username,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        joinedAt: p.joinedAt
      })) || []
    };
    
    return result;
  }
} 
