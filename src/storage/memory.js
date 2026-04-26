import { StorageInterface } from './interface.js';
import { randomUUID } from 'crypto';
import { normalizeCategory } from '../utils/category-utils.js';
import { getRideRoutes, normalizeRoutes } from '../utils/route-links.js';

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export class MemoryStorage extends StorageInterface {
  constructor() {
    super();
    this.rides = new Map();
    this.users = new Map();
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
      category: normalizeCategory(rideData.category),
      id,
      createdAt: new Date(),
      participation: { joined: [], thinking: [], skipped: [] }
    };
    if (rideData.routes !== undefined) {
      newRide.routes = normalizeRoutes(rideData.routes);
    }
    
    this.rides.set(id, newRide);
    return this.mapRideToInterface(newRide);
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

    if (updatesToApply.category !== undefined) {
      updatesToApply.category = normalizeCategory(updatesToApply.category);
    }
    if (updatesToApply.routes !== undefined) {
      updatesToApply.routes = normalizeRoutes(updatesToApply.routes);
    }
    const updatedRide = {
      ...ride,
      ...updatesToApply
    };
    
    this.rides.set(rideId, updatedRide);
    return this.mapRideToInterface(updatedRide);
  }

  async getRide(rideId) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      return null;
    }

    return this.mapRideToInterface(ride);
  }

  async getRidesByCreator(userId, skip, limit) {
    const userRides = Array.from(this.rides.values())
      .filter(ride => ride.createdBy === userId)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      total: userRides.length,
      rides: userRides.slice(skip, skip + limit).map(ride => this.mapRideToInterface(ride))
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

  async setParticipation(rideId, state, participantProfile) {
    const ride = this.rides.get(rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    // Ensure participation structure exists
    if (!ride.participation) {
      ride.participation = { joined: [], thinking: [], skipped: [] };
    }

    // Remove user from all states first
    ride.participation.joined = ride.participation.joined.filter(p => p.userId !== participantProfile.userId);
    ride.participation.thinking = ride.participation.thinking.filter(p => p.userId !== participantProfile.userId);
    ride.participation.skipped = ride.participation.skipped.filter(p => p.userId !== participantProfile.userId);

    // Add user to the specified state
    const participantData = {
      userId: participantProfile.userId,
      username: participantProfile.username,
      firstName: participantProfile.firstName || '',
      lastName: participantProfile.lastName || '',
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

  async getRideByGroupId(groupId) {
    for (const ride of this.rides.values()) {
      if (ride.groupId === groupId) {
        return this.mapRideToInterface(ride);
      }
    }
    return null;
  }

  async getRideByStravaId(stravaId, createdBy) {
    for (const ride of this.rides.values()) {
      if (ride.metadata?.stravaId === stravaId && ride.createdBy === createdBy) {
        return this.mapRideToInterface(ride);
      }
    }
    return null;
  }

  async getUser(userId) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    return this.mapUserToInterface(user);
  }

  async upsertUser(userData) {
    const existing = this.users.get(userData.userId);
    const now = new Date();
    const nextUser = {
      userId: userData.userId,
      username: userData.username ?? existing?.username ?? '',
      firstName: userData.firstName ?? existing?.firstName ?? '',
      lastName: userData.lastName ?? existing?.lastName ?? '',
      settings: userData.settings !== undefined
        ? { ...(existing?.settings || {}), ...userData.settings }
        : existing?.settings,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.users.set(userData.userId, nextUser);
    return this.mapUserToInterface(nextUser);
  }

  /**
   * @param {Object} ride
   * @returns {import('./interface.js').Ride}
   */
  mapRideToInterface(ride) {
    return {
      ...ride,
      routes: getRideRoutes(ride),
      category: normalizeCategory(ride.category)
    };
  }

  /**
   * @param {Object} user
   * @returns {import('./interface.js').UserEntity}
   */
  mapUserToInterface(user) {
    return { ...user };
  }
} 
