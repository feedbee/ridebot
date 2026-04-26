/**
 * @jest-environment node
 */

import { migrateRideNotificationSettings } from '../../migrations/migrations/003_ride_settings.js';

function createFakeDb(initialRides) {
  const rides = initialRides.map(ride => ({ ...ride }));

  return {
    rides,
    collection(name) {
      if (name !== 'rides') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        find(query) {
          const filtered = rides
            .filter(ride => {
              const minId = query?._id?.$gt ?? null;
              if (minId !== null && !(ride._id > minId)) {
                return false;
              }

              const matchesMissingSettings = ride.settings === undefined;
              const matchesMissingNotifySetting = ride.settings?.notifyParticipation === undefined;
              const matchesLegacyField = ride.notifyOnParticipation !== undefined;

              return matchesMissingSettings || matchesMissingNotifySetting || matchesLegacyField;
            })
            .sort((a, b) => a._id - b._id);

          return {
            sort() {
              return {
                limit(limit) {
                  return {
                    async toArray() {
                      return filtered.slice(0, limit).map(ride => ({ ...ride }));
                    }
                  };
                }
              };
            }
          };
        },

        async bulkWrite(ops) {
          for (const op of ops) {
            const target = rides.find(ride => ride._id === op.updateOne.filter._id);
            if (!target) {
              continue;
            }

            Object.assign(target, op.updateOne.update.$set);

            for (const key of Object.keys(op.updateOne.update.$unset || {})) {
              delete target[key];
            }
          }
        }
      };
    }
  };
}

describe('migrateRideNotificationSettings', () => {
  it('moves explicit legacy values into ride.settings and removes the legacy field', async () => {
    const db = createFakeDb([
      { _id: 1, title: 'Ride 1', notifyOnParticipation: false }
    ]);

    await migrateRideNotificationSettings(db);

    expect(db.rides[0].settings).toEqual({
      notifyParticipation: false
    });
    expect(db.rides[0]).not.toHaveProperty('notifyOnParticipation');
  });

  it('backfills the system default when the legacy field is missing', async () => {
    const db = createFakeDb([
      { _id: 1, title: 'Ride 1' }
    ]);

    await migrateRideNotificationSettings(db);

    expect(db.rides[0].settings).toEqual({
      notifyParticipation: true
    });
  });
});
