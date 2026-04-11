import { createTelegramE2EDriverFromEnv } from './client/telegram-e2e-driver.js';
import { runRideLifecycleE2ETest } from './tests/ride-lifecycle.e2e.test.js';

export async function runTelegramE2E({
  log = console.log,
  errorLog = console.error
} = {}) {
  const driver = await createTelegramE2EDriverFromEnv();

  try {
    const result = await runRideLifecycleE2ETest(driver);
    log(`PASS ${result.name}: ${result.rideId} (${result.title})`);
  } finally {
    await driver.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTelegramE2E().catch(error => {
    console.error('Telegram E2E run failed:', error);
    process.exitCode = 1;
  });
}
