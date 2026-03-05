import { config } from '../config.js';
import { createTranslator, resolveLanguage } from '../i18n/index.js';

export async function i18nMiddleware(ctx, next) {
  const language = resolveLanguage(
    config.i18n.defaultLanguage,
    config.i18n.fallbackLanguage
  );

  ctx.lang = language;
  ctx.t = createTranslator(language, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });

  await next();
}

