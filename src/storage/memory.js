import { StorageInterface } from './interface.js';
import { randomUUID } from 'crypto';

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export class MemoryStorage extends StorageInterface {
  constructor() {
    super();
    this.rides = new Map();
  }

  /**
   * Convert a hex string to base62 string
   * @param {string} hex
   * @returns {string}
   */
  hexToBase62(hex) {
    let decimal = BigInt('0x' + hex);
    let result = '';
    while (decimal > 0) {
      result = BASE62_CHARS[decimal % BigInt(62)] + result;
      decimal = decimal / BigInt(62);
    }
    return result;
  }

  /**
   * Generate a short unique ID (11 characters)
   * Base62 encoding of first 16 characters of UUID (64 bits)
   * @returns {string}
   */
  generateShortId() {
    const uuid = randomUUID().replace(/-/g, '');
    const first16Chars = uuid.substring(0, 16); // Take first 64 bits
    return this.hexToBase62(first16Chars).padStart(11, '0');
  }

  async createRide(ride) {
    const id = this.generateShortId();
    
    let rideData = { ...ride };
    
    // Ensure messages array exists
    if (!rideData.messages) {
      rideData.messages = [];
    }
    
    const newRide = {
      ...rideData,
      id,
      createdAt: new Date(),
      participants: []
    };
    
    this.rides.set(id, newRide);
    return newRide;
  }

  async updateRide(rideId, updates) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }
    
    // Preserve the messages array if it's not being updated
    // This is critical to ensure message tracking works properly
    if (!updates.messages && ride.messages) {
      updates = {
        ...updates,
        messages: ride.messages
      };
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
      return null;
    }
    
    return ride;
  }

  async getRidesByCreator(userId, skip, limit) {
    const userRides = Array.from(this.rides.values())
      .filter(ride => ride.createdBy === userId)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      total: userRides.length,
      rides: userRides.slice(skip, skip + limit)
    };
  }

  async addParticipant(rideId, participant) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    if (!ride.participants) {
      ride.participants = [];
    }

    if (ride.participants.some(p => p.userId === participant.userId)) {
      return false;
    }

    ride.participants.push({
      ...participant,
      joinedAt: new Date()
    });
    return true;
  }

  async removeParticipant(rideId, userId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    if (!ride.participants) {
      ride.participants = [];
      return false;
    }

    const initialLength = ride.participants.length;
    ride.participants = ride.participants.filter(p => p.userId !== userId);
    
    return ride.participants.length < initialLength;
  }

  async deleteRide(rideId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      return false;
    }

    this.rides.delete(rideId);
    return true;
  }
} 
