/** @jest-environment node */

import { migrateParticipationApprovalSettings } from '../../migrations/migrations/005_participation_approval_settings.js';

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
  current[parts.at(-1)] = value;
}

function createFakeDb(rides, users) {
  const collections = { rides, users };
  return {
    rides,
    users,
    collection(name) {
      return {
        async updateMany(filter, update) {
          let modifiedCount = 0;
          for (const document of collections[name]) {
            const matches = Object.entries(filter).every(([path, condition]) =>
              hasPath(document, path) === condition.$exists
            );
            if (!matches) continue;
            Object.entries(update.$set).forEach(([path, value]) => setPath(document, path, value));
            modifiedCount += 1;
          }
          return { modifiedCount };
        }
      };
    }
  };
}

it('backfills approval=false without overwriting explicit values', async () => {
  const db = createFakeDb(
    [{ settings: {} }, { settings: { requireParticipationApproval: true } }],
    [{ settings: { rideDefaults: {} } }, { settings: { rideDefaults: { requireParticipationApproval: true } } }]
  );

  await migrateParticipationApprovalSettings(db);

  expect(db.rides.map(ride => ride.settings.requireParticipationApproval)).toEqual([false, true]);
  expect(db.users.map(user => user.settings.rideDefaults.requireParticipationApproval)).toEqual([false, true]);
});
