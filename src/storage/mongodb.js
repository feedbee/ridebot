import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';

const participantSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  username: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

const rideSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  messageId: { type: Number },
  chatId: { type: Number, required: true },
  routeLink: String,
  meetingPoint: String,
  distance: Number,
  duration: Number,
  speedMin: Number,
  speedMax: Number,
  cancelled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Number, required: true },
  participants: [participantSchema]
});

// Create indexes
rideSchema.index({ chatId: 1, messageId: 1 }, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { messageId: { $type: "number" } }
});
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
    const newRide = new Ride({
      ...ride,
      participants: []
    });
    await newRide.save();
    return this.mapRideToInterface(newRide);
  }

  async updateRide(rideId, updates) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    Object.assign(ride, updates);
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
    return {
      id: rideObj._id.toString(),
      title: rideObj.title,
      date: rideObj.date,
      messageId: rideObj.messageId,
      chatId: rideObj.chatId,
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
        joinedAt: p.joinedAt
      })) || []
    };
  }
} 
