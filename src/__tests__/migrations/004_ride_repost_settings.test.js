/**
 * @jest-environment node
 */

import { migrateRideRepostSettings } from '../../migrations/migrations/004_ride_repost_settings.js';

function hasPath(document, path) {
  return path.split('.').reduce(
    (current, part) => current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined,
    document
  ) !== undefined;
}

function setPath(document, path, value) {
  const parts = path.split('.');
  let current = document;
  parts.slice(0, -1).forEach(part => {
    current[part] = current[part] || {};
    current = current[part];
  });
  current[parts[parts.length - 1]] = value;
}

function matchesExistsFilter(document, filter) {
  return Object.entries(filter).every(([path, condition]) => {
    if (condition && typeof condition === 'object' && '$exists' in condition) {
      return hasPath(document, path) === condition.$exists;
    }
    return false;
  });
}

function createFakeDb({ rides = [], users = [] } = {}) {
  const collections = {
    rides: rides.map(item => ({ ...item })),
    users: users.map(item => ({ ...item }))
  };

  return {
    ...collections,
    collection(name) {
      const collection = collections[name];
      if (!collection) {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        async updateMany(filter, update) {
          let modifiedCount = 0;

          collection.forEach(document => {
            if (!matchesExistsFilter(document, filter)) {
              return;
            }

            Object.entries(update.$set || {}).forEach(([path, value]) => {
              setPath(document, path, value);
            });
            modifiedCount += 1;
          });

          return { modifiedCount };
        }
      };
    }
  };
}

describe('migrateRideRepostSettings', () => {
  it('backfills allowReposts=false for rides missing the setting', async () => {
    const db = createFakeDb({
      rides: [
        { _id: 1, settings: { notifyParticipation: true } },
        { _id: 2, settings: { notifyParticipation: false, allowReposts: true } }
      ]
    });

    await migrateRideRepostSettings(db);

    expect(db.rides[0].settings).toEqual({
      notifyParticipation: true,
      allowReposts: false
    });
    expect(db.rides[1].settings).toEqual({
      notifyParticipation: false,
      allowReposts: true
    });
  });

  it('backfills allowReposts=false only for existing user ride defaults', async () => {
    const db = createFakeDb({
      users: [
        { userId: 1, settings: { rideDefaults: { notifyParticipation: false } } },
        { userId: 2 },
        { userId: 3, settings: { rideDefaults: { notifyParticipation: true, allowReposts: true } } }
      ]
    });

    await migrateRideRepostSettings(db);

    expect(db.users[0].settings.rideDefaults).toEqual({
      notifyParticipation: false,
      allowReposts: false
    });
    expect(db.users[1]).not.toHaveProperty('settings');
    expect(db.users[2].settings.rideDefaults).toEqual({
      notifyParticipation: true,
      allowReposts: true
    });
  });
});
