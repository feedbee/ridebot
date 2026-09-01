/**
 * @jest-environment node
 */

import { t } from '../../i18n/index.js';
import { resolveMainMenuAction } from '../../telegram/MainMenuKeyboard.js';

describe.each(['en', 'ru'])('resolveMainMenuAction (%s)', (language) => {
  const ctx = {
    t: (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' })
  };

  it.each([
    ['buttons.mainMenuButtons', 'buttons'],
    ['buttons.mainMenuCreateWizard', 'newride'],
    ['buttons.mainMenuSettings', 'settings'],
    ['buttons.mainMenuHelp', 'help']
  ])('maps %s to %s', (translationKey, action) => {
    expect(resolveMainMenuAction(ctx, ctx.t(translationKey))).toBe(action);
  });

  it('ignores regular text', () => {
    expect(resolveMainMenuAction(ctx, 'Morning ride')).toBeNull();
  });
});
