import { InlineKeyboard, Keyboard } from 'grammy';

const MAIN_MENU_BUTTON_KEYS = {
  buttons: 'buttons.mainMenuButtons',
  newride: 'buttons.mainMenuCreateWizard',
  settings: 'buttons.mainMenuSettings',
  help: 'buttons.mainMenuHelp'
};

/**
 * Build the persistent main-menu keyboard for a private chat.
 * @param {import('grammy').Context} ctx - Grammy context
 * @returns {Keyboard}
 */
export function buildMainMenuKeyboard(ctx) {
  return new Keyboard()
    .text(ctx.t(MAIN_MENU_BUTTON_KEYS.buttons))
    .text(ctx.t(MAIN_MENU_BUTTON_KEYS.newride))
    .text(ctx.t(MAIN_MENU_BUTTON_KEYS.settings))
    .text(ctx.t(MAIN_MENU_BUTTON_KEYS.help))
    .persistent()
    .resized()
    .placeholder(ctx.t('mainMenu.placeholder'));
}

/**
 * Build the expanded inline menu shown from the persistent Buttons action.
 * @param {import('grammy').Context} ctx - Grammy context
 * @returns {InlineKeyboard}
 */
export function buildExpandedMainMenuKeyboard(ctx) {
  return new InlineKeyboard()
    .text(ctx.t('buttons.mainMenuCreateWizard'), 'main:newride')
    .text(ctx.t('buttons.mainMenuCreateAi'), 'main:airide')
    .text(ctx.t('buttons.mainMenuCreatedRides'), 'main:listrides')
    .row()
    .text(ctx.t('buttons.mainMenuSettings'), 'main:settings')
    .text(ctx.t('buttons.mainMenuHelp'), 'main:help')
    .row()
    .text(ctx.t('buttons.close'), 'main:close');
}

/**
 * Resolve a localized reply-keyboard label to a main-menu action.
 * @param {import('grammy').Context} ctx - Grammy context
 * @param {string} text - Incoming message text
 * @returns {string|null}
 */
export function resolveMainMenuAction(ctx, text) {
  const entry = Object.entries(MAIN_MENU_BUTTON_KEYS)
    .find(([, translationKey]) => ctx.t(translationKey) === text);

  return entry?.[0] || null;
}
