/**
 * Migration 001: Add participation states (join/thinking/skip)
 * 
 * This migration converts the old participants array to the new participation structure
 * with three states: joined, thinking, skipped
 */

export async function migrateToParticipationStates(db) {
  console.log('Starting migration: Add participation states');
  
  const batchSize = 100;
  let skip = 0;
  let totalProcessed = 0;
  let totalMigrated = 0;
  
  while (true) {
    // Get rides in batches that need migration
    const rides = await db.collection('rides').find({
      participation: { $exists: false }
    }).skip(skip).limit(batchSize).toArray();
    
    if (rides.length === 0) {
      break; // No more rides to process
    }
    
    console.log(`Processing batch ${Math.floor(skip / batchSize) + 1}: ${rides.length} rides`);
    
    const bulkOps = [];
    
    for (const ride of rides) {
      // Convert old participants array to new participation structure
      const participation = {
        joined: (ride.participants || []).map(p => ({
          ...p,
          createdAt: p.joinedAt || p.createdAt || new Date()
        })),
        thinking: [],
        skipped: []
      };
      
      // Prepare bulk operation
      const updateOp = {
        updateOne: {
          filter: { _id: ride._id },
          update: {
            $set: {
              participation: participation
            }
          }
        }
      };
      
      // Only unset participants if it exists
      if (ride.participants) {
        updateOp.updateOne.update.$unset = { participants: "" };
      }
      
      bulkOps.push(updateOp);
      
      if (ride.participants && ride.participants.length > 0) {
        totalMigrated += ride.participants.length;
      }
    }
    
    // Execute bulk operations
    if (bulkOps.length > 0) {
      await db.collection('rides').bulkWrite(bulkOps);
      console.log(`✓ Processed ${rides.length} rides in this batch`);
    }
    
    totalProcessed += rides.length;
    skip += batchSize;
  }
  
  console.log(`Migration completed:`);
  console.log(`- Total rides processed: ${totalProcessed}`);
  console.log(`- Total participants migrated: ${totalMigrated}`);
  console.log(`- All rides now have participation structure`);
}
