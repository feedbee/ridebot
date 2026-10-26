import { load } from 'cheerio';

/** Flatten rich inline text without collecting transport metadata.
 * @param {unknown} value
 * @returns {string}
 */
function inlineText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(inlineText).join('');
  if (!value || typeof value !== 'object') return '';
  const text = inlineText(value.text ?? value.alternative_text ?? value.expression ?? value.button?.text);
  return value.type === 'url' && value.url && value.url !== text ? `${text} (${value.url})` : text;
}

/** Render block boundaries, lists and table rows as readable log text.
 * @param {Object} block
 * @returns {string}
 */
function blockText(block) {
  if (!block || typeof block !== 'object') return '';
  const parts = [];
  if (block.summary) parts.push(inlineText(block.summary));
  if (block.text) parts.push(inlineText(block.text));
  if (block.expression) parts.push(block.expression);
  if (block.blocks) parts.push(block.blocks.map(blockText).join('\n'));
  if (block.items) parts.push(block.items.map(item =>
    `${item.label || '-'} ${item.blocks.map(blockText).join('\n')}`).join('\n'));
  if (block.cells) parts.push(block.cells.map(row => row.map(cell => inlineText(cell.text)).join(' | ')).join('\n'));
  if (block.caption) parts.push(typeof block.caption === 'object' && !Array.isArray(block.caption) && 'credit' in block.caption
    ? [inlineText(block.caption.text), inlineText(block.caption.credit)].filter(Boolean).join('\n')
    : inlineText(block.caption));
  if (block.buttons) parts.push(block.buttons.map(inlineText).join(' | '));
  if (!parts.length && ['photo', 'video', 'audio', 'document', 'animation', 'voice_note', 'map'].includes(block.type)) {
    parts.push(`[${block.type}]`);
  }
  return parts.filter(Boolean).join('\n');
}

/** Strip Rich HTML while keeping visible text, links and structural separators.
 * @param {string} html
 * @returns {string}
 */
function htmlText(html) {
  const $ = load(html, {}, false);
  const render = node => {
    if (node.type === 'text') return node.data;
    const tag = node.name;
    if (['script', 'style'].includes(tag)) return '';
    const content = (node.children || []).map(render).join('');
    if (tag === 'br' || tag === 'hr') return '\n';
    if (tag === 'img') return node.attribs?.alt || '[image]';
    if (['video', 'audio', 'tg-document', 'tg-map'].includes(tag)) return content || `[${tag.replace('tg-', '')}]`;
    if (tag === 'a' && node.attribs?.href && content && content !== node.attribs.href) return `${content} (${node.attribs.href})`;
    if (tag === 'li') return `\n- ${content}\n`;
    if (tag === 'td' || tag === 'th') return `${content} | `;
    if (/^(p|h[1-6]|ul|ol|tr|table|blockquote|details|summary|pre|footer|figcaption|div)$/.test(tag)) return `\n${content}\n`;
    return content;
  };
  return render($.root()[0]).replace(/ \|\s*\n/g, '\n');
}

/** Extract readable conversation content, preserving ordinary text verbatim.
 * @param {{text?: string, rich_message?: Object}} message
 * @returns {string|null}
 */
export function conversationText(message) {
  try {
    return extractConversationText(message);
  } catch {
    // A malformed diagnostic payload must not prevent Telegram delivery.
    return null;
  }
}

/** Extract supported text representations before the diagnostic safety boundary.
 * @param {Object} message
 * @returns {string|null}
 */
function extractConversationText(message) {
  if (typeof message?.text === 'string') return message.text;
  const rich = message?.rich_message;
  if (!rich) return null;
  let text = '';
  if (typeof rich.html === 'string') text = htmlText(rich.html);
  else if (typeof rich.markdown === 'string') {
    text = rich.markdown.replace(/^#{1,6}\s+/gm, '')
      .replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/(\*\*|__|~~|\|\|)([\s\S]*?)\1/g, '$2')
      .replace(/^```[^\n]*\n|^```\s*$/gm, '');
  } else if (Array.isArray(rich.blocks)) text = rich.blocks.map(blockText).join('\n');
  return text.replace(/\r\n?/g, '\n').replace(/[\u2060\u00a0]/g, ' ')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n') || null;
}
