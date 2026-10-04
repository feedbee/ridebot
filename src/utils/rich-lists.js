/** Move generated lists outside paragraphs, retaining compact surrounding text.
 * @param {string} html - Already escaped HTML
 * @returns {string}
 */
export function normalizeRichLists(html) {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (paragraph, content) => {
    if (!content.includes('<ul>')) return paragraph;
    const parts = content.split(/(<ul>[\s\S]*?<\/ul>)/g);
    return parts.map((part, index) => {
      if (part.startsWith('<ul>')) return part;
      const text = part.replace(/^(?:<br>|\n)+|(?:<br>|\n)+$/g, '');
      // Telegram trims leading line breaks in paragraphs. Anchor the blank line
      // with an invisible WORD JOINER so the section gap survives Rich HTML parsing.
      const hasSectionGap = parts[index - 1]?.startsWith('<ul>') && /^(?:<br>|\n){2}/.test(part);
      return text ? `<p>${hasSectionGap ? '&#8288;<br>' : ''}${text}</p>` : '';
    }).join('');
  });
}

/** Convert existing line-oriented HTML to a Rich Message containing native lists.
 * @param {string} text - Already escaped HTML
 * @returns {{html: string}}
 */
export function richListMessage(text) {
  return { html: normalizeRichLists(text.replace(/\n(?=<ul>)/g, '')
    .replace(/<\/ul>\n\n/g, '</ul>&#8288;<br>')
    .replace(/<\/ul>\n/g, '</ul>').replace(/\n/g, '<br>')) };
}
