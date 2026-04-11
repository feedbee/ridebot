import { createTelegramE2EDriverFromEnv } from './client/telegram-e2e-driver.js';
import { runRideLifecycleE2ETest } from './tests/ride-lifecycle.e2e.test.js';
import { runRideWizardE2ETests } from './tests/ride-wizard.e2e.test.js';

export async function runTelegramE2E({
  log = console.log,
  errorLog = console.error
} = {}) {
  const driver = await createTelegramE2EDriverFromEnv();
  let cleanupMarkerId = null;

  try {
    const markerMessage = await driver.sendPrivateText(`__E2E_RUN_MARKER__ ${Date.now()}`);
    cleanupMarkerId = markerMessage.id;

    const lifecycleResult = await runRideLifecycleE2ETest(driver);
    log(`PASS ${lifecycleResult.name}: ${lifecycleResult.rideId} (${lifecycleResult.title})`);

    const wizardResults = await runRideWizardE2ETests(driver);
    for (const result of wizardResults) {
      const suffix = result.rideId ? `: ${result.rideId}${result.title ? ` (${result.title})` : ''}` : '';
      log(`PASS ${result.name}${suffix}`);
    }
  } finally {
    if (cleanupMarkerId) {
      try {
        const deletedCount = await driver.deletePrivateMessagesSince({
          afterMessageId: cleanupMarkerId,
          includeBoundary: true
        });
        log(`CLEANUP private chat messages removed: ${deletedCount}`);
      } catch (error) {
        errorLog(`Private chat cleanup failed: ${error.message}`);
      }
    }

    await driver.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTelegramE2E().catch(error => {
    console.error('Telegram E2E run failed:', error);
    process.exitCode = 1;
  });
}
