/*
Telegram E2E wizard test cases

1. Create a ride through the private /newride wizard.
- Start /newride without inline params in private chat.
- Complete the wizard with a compact but high-coverage field mix:
  category selection via callback, organizer text, parsed date, numeric distance,
  parsed duration, speed range, meeting point, and additional info.
- Confirm the preview and verify that the resulting ride message contains the created ride ID
  and the wizard-entered values.
- Verify wizard cleanup after success by sending an ordinary private message and ensuring
  it is not consumed as another wizard step.

2. Cancel ride creation from the wizard.
- Start /newride in private chat and advance at least one step.
- Cancel the wizard through the callback button.
- Verify that the bot confirms cancellation.
- Verify wizard cleanup after cancellation by sending an ordinary private message and ensuring
  it is not consumed as a leftover wizard step.

3. Update a ride through the private /updateride wizard.
- Seed a ride first, then start /updateride for that ride in private chat.
- Cover a compact update mix with different field behaviors:
  change title, change category via callback, clear organizer with "-", keep the existing date,
  skip route, change distance, keep duration, change speed, clear meeting point, change info,
  and confirm the content-only wizard.
- Confirm the update and verify that the existing ride message is edited in place with the new values
  and without the cleared values.
- Verify wizard cleanup after success by sending an ordinary private message and ensuring
  it is not consumed as another wizard step.

All wizard tests must leave no Telegram clutter behind:
- the created ride message must be deleted during cleanup
- private command messages and probe messages sent by the real test user must be deleted
- temporary delete-confirmation bot messages must be deleted after cleanup
*/

import assert from 'node:assert/strict';
import {
  buildWizardCreateFixture,
  buildWizardUpdateFixture,
  extractRideIdFromText
} from '../fixtures/ride-fixtures.js';

const CREATION_CANCELLED_MARKER = /(?:Ride creation cancelled|Создание поездки отменено)/i;
const CONFIRM_PROMPT_MARKER = /(?:Review the preview above and confirm|Проверьте предварительный просмотр выше и подтвердите)/i;
const TITLE_PROMPT_MARKER = /(?:Please enter the ride title|Введите название поездки)/i;
const CATEGORY_PROMPT_MARKER = /(?:Please select the ride category|Выберите категорию поездки)/i;
const ORGANIZER_PROMPT_MARKER = /(?:Who is organizing this ride|Кто организует эту поездку)/i;
const DATE_PROMPT_MARKER = /(?:When is the ride|Когда состоится поездка)/i;
const ROUTE_PROMPT_MARKER = /(?:Please enter the route link|Введите ссылку на маршрут)/i;
const DISTANCE_PROMPT_MARKER = /(?:Please enter the distance|Введите дистанцию)/i;
const DURATION_PROMPT_MARKER = /(?:Please enter the duration|Введите длительность)/i;
const SPEED_PROMPT_MARKER = /(?:Avg speed in km\/h|Ср\. скорость в км\/ч)/i;
const MEET_PROMPT_MARKER = /(?:Please enter the meeting point|Введите место встречи)/i;
const INFO_PROMPT_MARKER = /(?:Please enter any additional information|Введите дополнительную информацию)/i;

async function deletePrivateMessages(driver, messageIds) {
  const uniqueMessageIds = [...new Set(messageIds.filter(Boolean))];

  for (const messageId of uniqueMessageIds) {
    try {
      await driver.deletePrivateMessage({ messageId });
    } catch (error) {
      // Ignore messages that were already removed during the scenario.
    }
  }
}

async function assertWizardCleanup(driver, probeText, cleanupMessageIds) {
  const checkpoint = await driver.capturePrivateCheckpoint();
  const probeMessage = await driver.sendPrivateText(probeText);
  cleanupMessageIds.push(probeMessage.id);

  await driver.assertNoBotPrivateMessage({
    afterMessageId: checkpoint,
    timeoutMs: 2500
  });

  const persistedProbe = await driver.getPrivateMessageById(probeMessage.id);
  assert.ok(persistedProbe, 'Expected the post-wizard probe message to remain in chat');
}

async function waitForWizardPrompt(driver, afterMessageId) {
  return driver.waitForBotPrivateMessage({
    afterMessageId,
    predicate: message => Boolean(message.replyMarkup) && TITLE_PROMPT_MARKER.test(message.message || '')
  });
}

async function advanceWizardWithText(driver, wizardMessage, text, nextPromptMarker) {
  const userMessage = await driver.sendPrivateText(text);

  await driver.waitForPrivateMessageDeleted({
    messageId: userMessage.id
  });

  return driver.waitForBotPrivateMessageState({
    messageId: wizardMessage.id,
    predicate: message => nextPromptMarker.test(message.message || '')
  });
}

async function advanceWizardWithCallback(driver, wizardMessage, callbackDataPattern, nextPromptMarker) {
  await driver.clickButtonInPrivateMessage({
    messageId: wizardMessage.id,
    callbackDataPattern
  });

  return driver.waitForBotPrivateMessageState({
    messageId: wizardMessage.id,
    predicate: message => nextPromptMarker.test(message.message || '')
  });
}

async function cleanupRideInPrivate(driver, rideId, rideMessageId, cleanupMessageIds) {
  const checkpoint = await driver.capturePrivateCheckpoint();
  const deleteCommand = await driver.sendPrivateCommand(`/deleteride #${rideId}`);
  cleanupMessageIds.push(deleteCommand.id);

  const confirmationMessage = await driver.waitForBotPrivateMessage({
    afterMessageId: checkpoint,
    predicate: message => Boolean(message.replyMarkup)
  });

  await driver.clickButtonInPrivateMessage({
    messageId: confirmationMessage.id,
    callbackDataPattern: new RegExp(`^delete:confirm:${rideId}:message$`)
  });

  await driver.waitForPrivateMessageDeleted({
    messageId: rideMessageId
  });

  await driver.waitForPrivateMessageDeleted({
    messageId: confirmationMessage.id
  });

  cleanupMessageIds.push(confirmationMessage.id);
}

export async function runRideWizardCreateE2ETest(driver) {
  const fixture = buildWizardCreateFixture();
  const cleanupMessageIds = [];
  let rideId = null;
  let createdRideMessageId = null;

  try {
    const checkpoint = await driver.capturePrivateCheckpoint();
    const commandMessage = await driver.sendPrivateCommand('/newride');
    cleanupMessageIds.push(commandMessage.id);

    let wizardMessage = await waitForWizardPrompt(driver, checkpoint);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.title, CATEGORY_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:category:road$/, ORGANIZER_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.organizer, DATE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, 'tomorrow 11:15', ROUTE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:skip$/, DISTANCE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.distance, DURATION_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.duration, SPEED_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.speed, MEET_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.meetingPoint, INFO_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.info, CONFIRM_PROMPT_MARKER);

    assert.match(wizardMessage.message || '', CONFIRM_PROMPT_MARKER);

    const rideMessageCheckpoint = await driver.capturePrivateCheckpoint();
    await driver.clickButtonInPrivateMessage({
      messageId: wizardMessage.id,
      callbackDataPattern: /^wizard:confirm$/
    });

    const createdRideMessage = await driver.waitForBotPrivateMessage({
      afterMessageId: rideMessageCheckpoint,
      contains: fixture.title
    });

    createdRideMessageId = createdRideMessage.id;
    rideId = extractRideIdFromText(createdRideMessage.message || '');

    assert.ok(rideId, 'Expected to extract a ride ID from the wizard-created ride message');
    assert.match(createdRideMessage.message || '', new RegExp(fixture.organizer));
    assert.match(createdRideMessage.message || '', /47\.5/);
    assert.match(createdRideMessage.message || '', /26-28/);
    assert.match(createdRideMessage.message || '', new RegExp(fixture.meetingPoint));
    assert.match(createdRideMessage.message || '', new RegExp(fixture.info));

    await assertWizardCleanup(driver, fixture.probeText, cleanupMessageIds);

    return {
      name: 'wizard create',
      rideId,
      title: fixture.title
    };
  } finally {
    if (rideId && createdRideMessageId) {
      await cleanupRideInPrivate(driver, rideId, createdRideMessageId, cleanupMessageIds);
    }

    await deletePrivateMessages(driver, cleanupMessageIds);
  }
}

export async function runRideWizardCancelE2ETest(driver) {
  const fixture = buildWizardCreateFixture();
  const cleanupMessageIds = [];

  try {
    const checkpoint = await driver.capturePrivateCheckpoint();
    const commandMessage = await driver.sendPrivateCommand('/newride');
    cleanupMessageIds.push(commandMessage.id);

    let wizardMessage = await waitForWizardPrompt(driver, checkpoint);
    wizardMessage = await advanceWizardWithText(
      driver,
      wizardMessage,
      `${fixture.title} Cancelled`,
      CATEGORY_PROMPT_MARKER
    );

    const cancelCheckpoint = await driver.capturePrivateCheckpoint();
    await driver.clickButtonInPrivateMessage({
      messageId: wizardMessage.id,
      callbackDataPattern: /^wizard:cancel$/
    });

    await driver.waitForPrivateMessageDeleted({
      messageId: wizardMessage.id
    });

    const cancellationReply = await driver.waitForBotPrivateMessage({
      afterMessageId: cancelCheckpoint,
      predicate: message => CREATION_CANCELLED_MARKER.test(message.message || '')
    });
    cleanupMessageIds.push(cancellationReply.id);

    await assertWizardCleanup(driver, `${fixture.probeText}-cancel`, cleanupMessageIds);

    return {
      name: 'wizard cancel create'
    };
  } finally {
    await deletePrivateMessages(driver, cleanupMessageIds);
  }
}

export async function runRideWizardUpdateE2ETest(driver) {
  const fixture = buildWizardUpdateFixture();
  const cleanupMessageIds = [];
  let rideId = null;
  let rideMessageId = null;

  try {
    const seedCheckpoint = await driver.capturePrivateCheckpoint();
    const seedCommand = await driver.sendPrivateCommand(
      `/newride\ntitle: ${fixture.seedTitle}\ncategory: road\norganizer: Seed Organizer\nwhen: tomorrow 10:30\nmeet: ${fixture.seedMeetingPoint}\ndist: 40\nduration: 90\nspeed: 24-26\ninfo: ${fixture.seedInfo}`
    );
    cleanupMessageIds.push(seedCommand.id);

    const seedRideMessage = await driver.waitForBotPrivateMessage({
      afterMessageId: seedCheckpoint,
      contains: fixture.seedTitle
    });

    rideId = extractRideIdFromText(seedRideMessage.message || '');
    rideMessageId = seedRideMessage.id;
    assert.ok(rideId, 'Expected to extract a ride ID from the seeded ride message');

    const wizardCheckpoint = await driver.capturePrivateCheckpoint();
    const updateCommand = await driver.sendPrivateCommand(`/updateride #${rideId}`);
    cleanupMessageIds.push(updateCommand.id);

    let wizardMessage = await waitForWizardPrompt(driver, wizardCheckpoint);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.updatedTitle, CATEGORY_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:category:gravel$/, ORGANIZER_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, '-', DATE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:keep$/, ROUTE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:skip$/, DISTANCE_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.updatedDistance, DURATION_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithCallback(driver, wizardMessage, /^wizard:keep$/, SPEED_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.updatedSpeed, MEET_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, '-', INFO_PROMPT_MARKER);
    wizardMessage = await advanceWizardWithText(driver, wizardMessage, fixture.updatedInfo, CONFIRM_PROMPT_MARKER);

    assert.match(wizardMessage.message || '', CONFIRM_PROMPT_MARKER);

    await driver.clickButtonInPrivateMessage({
      messageId: wizardMessage.id,
      callbackDataPattern: /^wizard:confirm$/
    });

    const updatedRideMessage = await driver.waitForBotPrivateMessageState({
      messageId: seedRideMessage.id,
      contains: fixture.updatedTitle
    });

    assert.match(updatedRideMessage.message || '', new RegExp(fixture.updatedInfo));
    assert.match(updatedRideMessage.message || '', /55/);
    assert.match(updatedRideMessage.message || '', /28-30/);
    assert.doesNotMatch(updatedRideMessage.message || '', /Seed Organizer/);
    assert.doesNotMatch(updatedRideMessage.message || '', new RegExp(fixture.seedMeetingPoint));

    await assertWizardCleanup(driver, fixture.probeText, cleanupMessageIds);

    return {
      name: 'wizard update',
      rideId,
      title: fixture.updatedTitle
    };
  } finally {
    if (rideId && rideMessageId) {
      await cleanupRideInPrivate(driver, rideId, rideMessageId, cleanupMessageIds);
    }

    await deletePrivateMessages(driver, cleanupMessageIds);
  }
}

export async function runRideWizardE2ETests(driver) {
  const results = [];

  results.push(await runRideWizardCreateE2ETest(driver));
  results.push(await runRideWizardCancelE2ETest(driver));
  results.push(await runRideWizardUpdateE2ETest(driver));

  return results;
}
