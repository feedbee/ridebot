/**
 * Migration 003: Move legacy ride notification data into ride.settings
 */

import { SettingsService } from '../../services/SettingsService.js';

export async function migrateRideNotificationSettings(db) {
  console.log('Starting migration: Move legacy ride notification field into ride.settings');

  const batchSize = 100;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let lastId = null;

  while (true) {
    const query = lastId
      ? {
          _id: { $gt: lastId },
          $or: [
            { settings: { $exists: false } },
            { 'settings.notifyParticipation': { $exists: false } },
            { notifyOnParticipation: { $exists: true } }
          ]
        }
      : {
          $or: [
            { settings: { $exists: false } },
            { 'settings.notifyParticipation': { $exists: false } },
            { notifyOnParticipation: { $exists: true } }
          ]
        };

    const rides = await db
      .collection('rides')
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();

    if (rides.length === 0) {
      break;
    }

    const bulkOps = [];

    for (const ride of rides) {
      const resolvedNotify = typeof ride.notifyOnParticipation === 'boolean'
        ? ride.notifyOnParticipation
        : true;
      const settings = SettingsService.buildRideSettingsSnapshot(ride.settings, {
        notifyParticipation: resolvedNotify
      });

      bulkOps.push({
        updateOne: {
          filter: { _id: ride._id },
          update: {
            $set: { settings },
            $unset: { notifyOnParticipation: '' }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      await db.collection('rides').bulkWrite(bulkOps);
      totalUpdated += bulkOps.length;
    }

    totalProcessed += rides.length;
    lastId = rides[rides.length - 1]._id;
  }

  console.log('Ride settings migration completed:');
  console.log(`- Total rides processed: ${totalProcessed}`);
  console.log(`- Total rides updated: ${totalUpdated}`);
}
