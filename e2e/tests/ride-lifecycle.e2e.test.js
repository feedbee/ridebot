import assert from 'node:assert/strict';
import { buildLifecycleRideFixture, extractRideIdFromText } from '../fixtures/ride-fixtures.js';

const JOINED_MARKER = /(?:Joined|Участвуют) \(1\):/;
const THINKING_MARKER = /(?:Thinking|Думают) \(1\):/;
const SKIPPED_MARKER = /(?:Not interested|Не интересно): 1/;
const DELETE_CONFIRMATION_MARKER = /(?:Are you sure you want to delete this ride|Вы уверены, что хотите удалить эту поездку)/i;

export async function runRideLifecycleE2ETest(driver) {
  const fixture = buildLifecycleRideFixture();
  const privateCheckpoint = await driver.capturePrivateCheckpoint();
  let shareCommandMessageId = null;

  await driver.sendPrivateCommand(
    `/newride\ntitle: ${fixture.title}\nwhen: tomorrow 11:00\nmeet: ${fixture.meetingPoint}`
  );

  const privateRideMessage = await driver.waitForBotPrivateMessage({
    afterMessageId: privateCheckpoint,
    contains: fixture.title
  });

  const rideId = extractRideIdFromText(privateRideMessage.message || '');
  assert.ok(rideId, 'Expected to extract ride ID from the private ride message');

  const groupCheckpoint = await driver.captureChatCheckpoint({
    chatId: driver.primaryGroupId
  });

  const shareCommandMessage = await driver.sendMessageToChat({
    chatId: driver.primaryGroupId,
    text: `/shareride #${rideId}`
  });
  shareCommandMessageId = shareCommandMessage?.id || null;

  try {
    const groupRideMessage = await driver.waitForBotMessageInChat({
      chatId: driver.primaryGroupId,
      afterMessageId: groupCheckpoint,
      contains: fixture.title
    });

    await driver.sendPrivateCommand(
      `/updateride #${rideId}\ntitle: ${fixture.updatedTitle}\nmeet: ${fixture.updatedMeetingPoint}`
    );

    const updatedGroupMessage = await driver.waitForEditedBotMessageInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      contains: fixture.updatedTitle
    });

    assert.match(updatedGroupMessage.message || '', new RegExp(fixture.updatedMeetingPoint));

    const joinResult = await driver.clickButtonInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      callbackDataPattern: new RegExp(`^join:${rideId}$`)
    });
    assert.ok(joinResult === null || joinResult, 'Expected join callback to complete');

    const joinedMessage = await driver.waitForEditedBotMessageInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      predicate: message => JOINED_MARKER.test(message.message || '')
    });
    assert.match(joinedMessage.message || '', JOINED_MARKER);

    const thinkingResult = await driver.clickButtonInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      callbackDataPattern: new RegExp(`^thinking:${rideId}$`)
    });
    assert.ok(thinkingResult === null || thinkingResult, 'Expected thinking callback to complete');

    const thinkingMessage = await driver.waitForEditedBotMessageInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      predicate: message => THINKING_MARKER.test(message.message || '')
    });
    assert.match(thinkingMessage.message || '', THINKING_MARKER);

    const skipResult = await driver.clickButtonInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      callbackDataPattern: new RegExp(`^skip:${rideId}$`)
    });
    assert.ok(skipResult === null || skipResult, 'Expected skip callback to complete');

    const skippedMessage = await driver.waitForEditedBotMessageInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id,
      predicate: message => SKIPPED_MARKER.test(message.message || '')
    });
    assert.match(skippedMessage.message || '', SKIPPED_MARKER);

    const deleteCheckpoint = await driver.capturePrivateCheckpoint();
    await driver.sendPrivateCommand(`/deleteride #${rideId}`);

    const deleteConfirmationMessage = await driver.waitForBotPrivateMessage({
      afterMessageId: deleteCheckpoint,
      predicate: message => DELETE_CONFIRMATION_MARKER.test(message.message || '')
    });

    await driver.clickButtonInChat({
      chatId: deleteConfirmationMessage.chatId,
      messageId: deleteConfirmationMessage.id,
      callbackDataPattern: new RegExp(`^delete:confirm:${rideId}:message$`)
    });

    await driver.waitForMessageDeletedInChat({
      chatId: driver.primaryGroupId,
      messageId: groupRideMessage.id
    });

    return {
      name: 'ride lifecycle',
      rideId,
      title: fixture.updatedTitle
    };
  } finally {
    if (shareCommandMessageId) {
      await driver.deleteMessageInChat({
        chatId: driver.primaryGroupId,
        messageId: shareCommandMessageId
      });
    }
  }
}
