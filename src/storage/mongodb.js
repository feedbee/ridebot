import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';

const rideSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  messageId: { type: Number, required: true },
  chatId: { type: Number, required: true },
  routeLink: String,
  meetingPoint: String,
  distance: Number,
  duration: Number,
  speedMin: Number,
  speedMax: Number,
  cancelled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Number, required: true }
});

const participantSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  userId: { type: Number, required: true },
  username: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

// Create indexes
rideSchema.index({ chatId: 1, messageId: 1 }, { unique: true });
participantSchema.index({ rideId: 1, userId: 1 }, { unique: true });

const Ride = mongoose.model('Ride', rideSchema);
const Participant = mongoose.model('Participant', participantSchema);

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
    await mongoose.disconnect();
  }

  async createRide(ride) {
    const newRide = new Ride(ride);
    await newRide.save();
    return {
      ...ride,
      id: newRide._id.toString(),
      createdAt: newRide.createdAt
    };
  }

  async updateRide(rideId, updates) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    Object.assign(ride, updates);
    await ride.save();

    return {
      ...ride.toObject(),
      id: ride._id.toString()
    };
  }

  async getRide(rideId) {
    try {
      const ride = await Ride.findById(rideId);
      return ride ? this.mapRideToInterface(ride) : null;
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
    const existingParticipant = await Participant.findOne({
      rideId: new mongoose.Types.ObjectId(rideId),
      userId: participant.userId
    });

    if (existingParticipant) {
      return false;
    }

    const newParticipant = new Participant({
      rideId: new mongoose.Types.ObjectId(rideId),
      ...participant
    });
    await newParticipant.save();
    return true;
  }

  async removeParticipant(rideId, userId) {
    const result = await Participant.deleteOne({
      rideId: new mongoose.Types.ObjectId(rideId),
      userId
    });
    return result.deletedCount > 0;
  }

  async getParticipants(rideId) {
    const participants = await Participant.find({
      rideId: new mongoose.Types.ObjectId(rideId)
    });
    return participants.map(p => ({
      userId: p.userId,
      username: p.username,
      joinedAt: p.joinedAt
    }));
  }

  async deleteRide(rideId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Delete the ride
      const ride = await Ride.findByIdAndDelete(rideId).session(session);
      if (!ride) {
        await session.abortTransaction();
        return false;
      }

      // Delete all participants
      await Participant.deleteMany({
        rideId: new mongoose.Types.ObjectId(rideId)
      }).session(session);

      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
} 
