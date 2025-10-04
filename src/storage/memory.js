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
      participation: { joined: [], thinking: [], skipped: [] }
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
    
    // Set updatedAt to current time only if updatedBy is set
    let updatesToApply = { ...updates };
    if (updatesToApply.updatedBy) {
      updatesToApply.updatedAt = new Date();
    }
    
    const updatedRide = {
      ...ride,
      ...updatesToApply
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

  async deleteRide(rideId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      return false;
    }

    this.rides.delete(rideId);
    return true;
  }

  async setParticipation(rideId, userId, state, participant) {
    const ride = this.rides.get(rideId);
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
    
    // Update the ride in storage
    this.rides.set(rideId, ride);
    return { ride: ride };
  }

  async getParticipation(rideId, userId) {
    const ride = this.rides.get(rideId);
    if (!ride || !ride.participation) {
      return null;
    }

    if (ride.participation.joined.some(p => p.userId === userId)) return 'joined';
    if (ride.participation.thinking.some(p => p.userId === userId)) return 'thinking';
    if (ride.participation.skipped.some(p => p.userId === userId)) return 'skipped';
    return null;
  }

  async getAllParticipants(rideId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    return ride.participation || { joined: [], thinking: [], skipped: [] };
  }
} 
