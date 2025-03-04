import { StorageInterface } from './interface.js';

export class MemoryStorage extends StorageInterface {
  constructor() {
    super();
    this.rides = new Map();
    this.participants = new Map();
    this.lastId = 0;
  }

  async createRide(ride) {
    const id = (++this.lastId).toString();
    const newRide = {
      ...ride,
      id,
      createdAt: new Date()
    };
    this.rides.set(id, newRide);
    this.participants.set(id, []);
    return newRide;
  }

  async updateRide(rideId, updates) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    const updatedRide = {
      ...ride,
      ...updates
    };
    this.rides.set(rideId, updatedRide);
    return updatedRide;
  }

  async getRide(rideId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }
    return ride;
  }

  async addParticipant(rideId, participant) {
    const participants = this.participants.get(rideId);
    if (!participants) {
      throw new Error('Ride not found');
    }

    if (participants.some(p => p.userId === participant.userId)) {
      return false;
    }

    participants.push({
      ...participant,
      joinedAt: new Date()
    });
    return true;
  }

  async removeParticipant(rideId, userId) {
    const participants = this.participants.get(rideId);
    if (!participants) {
      throw new Error('Ride not found');
    }

    const initialLength = participants.length;
    const filteredParticipants = participants.filter(p => p.userId !== userId);
    this.participants.set(rideId, filteredParticipants);
    
    return filteredParticipants.length < initialLength;
  }

  async getParticipants(rideId) {
    const participants = this.participants.get(rideId);
    if (!participants) {
      throw new Error('Ride not found');
    }
    return participants;
  }
} 
