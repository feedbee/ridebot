import { config } from '../config.js';
import { t } from '../i18n/index.js';

export class RideParamsHelper {
  /**
   * Valid ride parameters and their descriptions
   * @type {Object.<string, string>}
   */
  static VALID_PARAMS = RideParamsHelper.getValidParams();

  static getValidParams(language = config.i18n.defaultLanguage) {
    const translate = (key) => t(language, key, {}, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });

    return {
      title: translate('params.title'),
      category: translate('params.category'),
      organizer: translate('params.organizer'),
      when: translate('params.when'),
      meet: translate('params.meet'),
      route: translate('params.route'),
      dist: translate('params.dist'),
      duration: translate('params.duration'),
      speed: translate('params.speed'),
      info: translate('params.info'),
      notify: translate('params.notify'),
      id: translate('params.id')
    };
  }

  /**
   * Parse ride parameters from text
   * @param {string} text - Text to parse
   * @returns {{params: Object, unknownParams: Array<string>}} - Parsed parameters and any unknown parameters
   */
  static parseRideParams(text) {
    const lines = text.split('\n').slice(1); // Skip command line
    const params = {};
    const unknownParams = [];

    for (const line of lines) {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
      if (match) {
        const [_, key, value] = match;
        const normalizedKey = key.trim().toLowerCase();
        
        if (RideParamsHelper.VALID_PARAMS.hasOwnProperty(normalizedKey)) {
          const trimmedValue = value.trim();
          if (normalizedKey === 'route') {
            if (!params.route) {
              params.route = [];
            }
            params.route.push(trimmedValue);
          } else {
            params[normalizedKey] = trimmedValue;
          }
        } else {
          unknownParams.push(key.trim());
        }
      } else {
        unknownParams.push(line.trim());
      }
    }

    return { params, unknownParams };
  }
} 
