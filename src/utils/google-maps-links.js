import { escapeHtml } from './html-escape.js';

/** Render user text with compact Google Maps links, preserving URL contents.
 * @param {string} text
 * @returns {string}
 */
export function formatGoogleMapsLinks(text) {
  const mapsUrl = /\bhttps?:\/\/(?:maps\.app\.goo\.gl\/|(?:www\.)?google\.com\/maps(?:\/|[?#]))[^\s<>"]*/gi;
  let result = '';
  let offset = 0;
  for (const match of text.matchAll(mapsUrl)) {
    result += escapeHtml(text.slice(offset, match.index));
    result += `<a href="${escapeHtml(match[0])}">[Google Maps]</a>`;
    offset = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(offset));
}

