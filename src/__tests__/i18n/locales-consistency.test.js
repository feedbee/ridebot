/**
 * @jest-environment node
 */

import { en } from '../../i18n/locales/en.js';
import { ru } from '../../i18n/locales/ru.js';

function collectLeafKeys(node, prefix = '') {
  const keys = [];
  const entries = Object.entries(node || {});

  for (const [key, value] of entries) {
    const current = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value, current));
    } else {
      keys.push(current);
    }
  }

  return keys;
}

describe('locale consistency', () => {
  it('ru locale should contain all en keys', () => {
    const enKeys = collectLeafKeys(en);
    const ruKeys = collectLeafKeys(ru);
    const missingInRu = enKeys.filter(key => !ruKeys.includes(key));

    expect(missingInRu).toEqual([]);
  });

  it('ru locale should not contain unexpected extra keys', () => {
    const enKeys = collectLeafKeys(en);
    const ruKeys = collectLeafKeys(ru);
    const extraInRu = ruKeys.filter(key => !enKeys.includes(key));

    expect(extraInRu).toEqual([]);
  });
});
