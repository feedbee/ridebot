import mongoose from 'mongoose';
import { StorageInterface } from './interface.js';
import { config } from '../config.js';

const rideSchema = new mongoose.Schema({
  messageId: { type: Number, required: true },
  chatId: { type: Number, required: true },
  title: { type: String, required: true },
  date: { type: Date, required: true },
  routeLink: String,
  distance: Number,
  duration: Number,
  speedMin: Number,
  speedMax: Number,
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Number, required: true }
});

const participantSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  userId: { type: Number, required: true },
  username: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

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
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      updates,
      { new: true }
    );
    
    if (!ride) {
      throw new Error('Ride not found');
    }

    return {
      ...ride.toObject(),
      id: ride._id.toString()
    };
  }

  async getRide(rideId) {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    return {
      ...ride.toObject(),
      id: ride._id.toString()
    };
  }

  async addParticipant(rideId, participant) {
    const existingParticipant = await Participant.findOne({
      rideId,
      userId: participant.userId
    });

    if (existingParticipant) {
      return false;
    }

    const newParticipant = new Participant({
      rideId,
      ...participant
    });
    await newParticipant.save();
    return true;
  }

  async removeParticipant(rideId, userId) {
    const result = await Participant.deleteOne({
      rideId,
      userId
    });
    return result.deletedCount > 0;
  }

  async getParticipants(rideId) {
    const participants = await Participant.find({ rideId });
    return participants.map(p => ({
      userId: p.userId,
      username: p.username,
      joinedAt: p.joinedAt
    }));
  }
} 
