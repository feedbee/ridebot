import { config } from '../config.js';
import { t } from '../i18n/index.js';

const PROVIDER_LABELS = {
  strava: 'Strava',
  garmin: 'Garmin',
  komoot: 'Komoot',
  ridewithgps: 'RideWithGPS'
};

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getRouteProvider(url) {
  for (const [name, provider] of Object.entries(config.routeProviders)) {
    if (provider.patterns.some(pattern => pattern.test(url))) {
      return name;
    }
  }
  return null;
}

export function getDerivedRouteLabel(url, language = config.i18n.defaultLanguage) {
  const provider = getRouteProvider(url);
  if (provider && PROVIDER_LABELS[provider]) {
    return PROVIDER_LABELS[provider];
  }

  return t(language, 'formatter.routeLinkLabel', {}, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });
}

export function normalizeRoute(route) {
  if (!route || typeof route.url !== 'string') {
    return null;
  }

  const url = route.url.trim();
  if (!url) {
    return null;
  }

  const normalized = { url };
  const label = typeof route.label === 'string' ? route.label.trim() : '';
  if (label) {
    normalized.label = label;
  }

  return normalized;
}

export function normalizeRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes
    .map(normalizeRoute)
    .filter(Boolean);
}

export function getRideRoutes(ride) {
  if (!ride) {
    return [];
  }

  if (Array.isArray(ride.routes)) {
    const normalizedRoutes = normalizeRoutes(ride.routes);
    return normalizedRoutes;
  }

  if (typeof ride.routeLink === 'string' && ride.routeLink.trim()) {
    return [{ url: ride.routeLink.trim() }];
  }

  return [];
}

export function parseRouteEntry(input, options = {}) {
  const { validateUrl = true } = options;
  const raw = String(input ?? '').trim();
  if (!raw) {
    return { route: null, error: 'empty' };
  }

  const parts = raw.split('|');
  const url = (parts.pop() || '').trim();
  const label = parts.join('|').trim();

  if (validateUrl && !isValidUrl(url)) {
    return { route: null, error: 'invalid_url' };
  }

  return {
    route: label ? { url, label } : { url },
    error: null
  };
}

export function parseRouteEntries(inputs, options = {}) {
  const values = Array.isArray(inputs) ? inputs : [inputs];
  const routes = [];

  for (const input of values) {
    if (typeof input !== 'string') {
      return { routes: null, error: 'invalid_url' };
    }

    const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const { route, error } = parseRouteEntry(line, options);
      if (error) {
        return { routes: null, error };
      }
      routes.push(route);
    }
  }

  return { routes, error: null };
}
