import type { BlockObjectResponse, RichTextItemResponse } from '@notionhq/client';
import { isFullBlock } from '@notionhq/client';

/** Subset of Notion ApiColor; only default vs non-default matters for us. */
export type ApiColor = string;

/** A block with its already-fetched children (recursive). */
export interface BlockNode {
  block: BlockObjectResponse;
  children: BlockNode[];
}

/** Context threaded through conversion. */
export interface ConvertContext {
  /** blockId (or 'cover') -> markdown-ready relative asset path. Missing => unavailable. */
  media: Map<string, string>;
  /** Emits a deduplicated warning without leaking content/URLs. */
  warn: (msg: string) => void;
}

const SAFE_LINK_SCHEMES = ['https:', 'http:', 'mailto:'];

function isSafeLink(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return SAFE_LINK_SCHEMES.includes(u.protocol);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Equation serializer (never routed through plain-text escaping)
// ---------------------------------------------------------------------------


/** Count consecutive backslashes immediately before index i. */
function precedingBackslashes(s: string, i: number): number {
  let n = 0;
  let j = i - 1;
  while (j >= 0 && s[j] === '\\') {
    n++;
    j--;
  }
  return n;
}

/** Escape `$` not already escaped by an odd run of backslashes. */
function escapeDollar(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$') {
      if (precedingBackslashes(s, i) % 2 === 0) out += '\\';
      out += '$';
    } else {
      out += s[i];
    }
  }
  return out;
}

function hasForbiddenC0(s: string, allowNewline: boolean): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return true; // NUL always forbidden
    if (c <= 0x1f) {
      if (allowNewline && c === 0x0a) continue; // LF allowed in block mode
      if (!allowNewline && (c === 0x0d || c === 0x0a || c === 0x2028 || c === 0x2029))
        continue;
      return true;
    }
  }
  return false;
}

/**
 * Inline equation. Collapses CR/LF/Unicode separators to spaces, rejects NUL
 * and other C0 controls, escapes unescaped `$`, emits `$<expr>$`.
 * Returns '' (and warns) for an empty expression.
 */
export function serializeInlineEquation(expr: string, warn: (m: string) => void): string {
  let s = expr.replace(/[\r\n\u2028\u2029]+/g, ' ');
  if (hasForbiddenC0(s, false)) {
    warn('equation: rejected control character in inline equation; omitted');
    return '';
  }
  if (s.trim() === '') {
    warn('equation: empty inline equation omitted');
    return '';
  }
  return `$${escapeDollar(s)}$`;
}

/**
 * Block equation. Keeps newlines, rejects NUL/other C0, escapes unescaped `$`,
 * emits a standalone `$$ ... $$` block. Returns '' (and warns) for empty expr.
 */
export function serializeBlockEquation(expr: string, warn: (m: string) => void): string {
  if (hasForbiddenC0(expr, true)) {
    warn('equation: rejected control character in block equation; omitted');
    return '';
  }
  let s = expr.replace(/[\r\n\u2028\u2029]+/g, '\n');
  if (s.trim() === '') {
    warn('equation: empty block equation omitted');
    return '';
  }
  return `$$\n${escapeDollar(s)}\n$$`;
}

// ---------------------------------------------------------------------------
// Plain text / rich text escaping
// ---------------------------------------------------------------------------

/** Step 1: HTML-meaningful and MDX-expression chars to entities. */
function escapeHtmlEntity(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}

/** Step 2: remaining Markdown special chars (after entities applied).
 *  `#` is intentionally excluded: mid-line `#` is harmless in MDX and escaping
 *  it would corrupt HTML entities like `&#123;`. */
function escapeMarkdown(s: string): string {
  return s.replace(/([\\`*_[\]()+\-!|~^$])/g, '\\$1');
}

function isDefaultColor(color: ApiColor | undefined): boolean {
  return !color || color === 'default';
}

function renderAnnotation(
  htmlEscaped: string,
  ann: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean; color?: ApiColor },
  ctx: ConvertContext,
): string {
  if (!isDefaultColor(ann.color)) {
    ctx.warn(`rich text color "${ann.color}" ignored (not representable in MDX)`);
  }
  // Inline code keeps HTML-entity escaping but skips Markdown escaping.
  const out = ann.code ? htmlEscaped : escapeMarkdown(htmlEscaped);
  if (ann.code) {
    const tick = out.includes('`') ? '``' : '`';
    return `${tick}${out}${tick}`;
  }
  let wrapped = out;
  if (ann.bold) wrapped = `**${wrapped}**`;
  if (ann.italic) wrapped = `*${wrapped}*`;
  if (ann.strikethrough) wrapped = `~~${wrapped}~~`;
  if (ann.underline) wrapped = `<u>${wrapped}</u>`;
  return wrapped;
}

function plainText(rich: RichTextItemResponse[] | undefined): string {
  if (!rich) return '';
  return rich.map((r) => ('text' in r ? r.text.content : '')).join('');
}


function renderRichText(rich: RichTextItemResponse[], ctx: ConvertContext): string {
  const parts: string[] = [];
  for (const item of rich) {
    if (item.type === 'text') {
      const content = escapeHtmlEntity(item.text.content);
      const linked = isSafeLink(item.text.link?.url);
      let seg = renderAnnotation(content, item.annotations, ctx);
      if (linked && item.text.link) {
        seg = `[${seg}](${item.text.link.url})`;
      }
      parts.push(seg);
    } else if (item.type === 'equation') {
      parts.push(serializeInlineEquation(item.equation.expression, ctx.warn));
    } else if (item.type === 'mention') {
      parts.push(renderMention(item, ctx));
    }
  }
  return parts.join('');
}

function renderMention(
  item: Extract<RichTextItemResponse, { type: 'mention' }>,
  ctx: ConvertContext,
): string {
  const m = item.mention;
  switch (m.type) {
    case 'user':
      return m.user && 'name' in m.user && m.user.name ? escapeHtmlEntity(m.user.name) : '@user';
    case 'date':
      return m.date?.start ?? '';
    case 'link_preview':
      return isSafeLink(m.link_preview.url) ? `[${m.link_preview.url}](${m.link_preview.url})` : '';
    case 'link_mention': {
      const href = m.link_mention.href;
      if (!isSafeLink(href)) return '';
      const label = m.link_mention.title ? escapeHtmlEntity(m.link_mention.title) : href;
      return `[${label}](${href})`;
    }
    case 'page':
      return '@page';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function headingMarker(level: number): string {
  return '#'.repeat(Math.min(Math.max(level, 1), 4));
}

function getListItemRichText(b: BlockObjectResponse): RichTextItemResponse[] {
  switch (b.type) {
    case 'bulleted_list_item':
      return b.bulleted_list_item.rich_text;
    case 'numbered_list_item':
      return b.numbered_list_item.rich_text;
    case 'to_do':
      return b.to_do.rich_text;
    default:
      return [];
  }
}

function isListType(t: string): boolean {
  return t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do';
}

function renderListGroup(nodes: BlockNode[], ordered: boolean, ctx: ConvertContext): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const b = node.block;
    const rich = getListItemRichText(b);
    const text = renderRichText(rich, ctx);
    let marker: string;
    if (b.type === 'to_do') {
      marker = b.to_do.checked ? '- [x]' : '- [ ]';
    } else {
      marker = ordered ? '1.' : '-';
    }
    lines.push(`${marker} ${text}`);
    const nested = node.children.filter((c) => isListType(c.block.type));
    if (nested.length > 0) {
      const nestedOrdered = nested[0].block.type === 'numbered_list_item';
      const nestedStr = renderListGroup(nested, nestedOrdered, ctx);
      for (const nl of nestedStr.split('\n')) lines.push(`  ${nl}`);
    }
  }
  return lines.join('\n');
}

function renderTable(node: BlockNode, ctx: ConvertContext): string {
  const b = node.block;
  if (b.type !== 'table') return '';
  const rows = node.children;
  if (rows.length === 0) return '';
  const hasHeader = b.table.has_column_header;
  const out: string[] = ['<table>'];
  rows.forEach((rowNode, ri) => {
    const row = rowNode.block;
    if (row.type !== 'table_row') return;
    const tag = hasHeader && ri === 0 ? 'th' : 'td';
    const cells = row.table_row.cells
      .map((cell) => `    <${tag}>${renderRichText(cell, ctx)}</${tag}>`)
      .join('\n');
    out.push(`  <tr>\n${cells}\n  </tr>`);
  });
  out.push('</table>');
  return out.join('\n');
}

function renderColumns(node: BlockNode, ctx: ConvertContext): string {
  const b = node.block;
  if (b.type !== 'column_list') return '';
  const parts: string[] = [];
  node.children.forEach((colNode, i) => {
    if (colNode.block.type !== 'column') return;
    parts.push(renderBlocks(colNode.children, ctx).trimEnd());
    if (i < node.children.length - 1) parts.push('<hr/>');
  });
  return parts.join('\n\n');
}

function renderCode(b: BlockObjectResponse, ctx: ConvertContext): string {
  if (b.type !== 'code') return '';
  const langMap: Record<string, string> = {
    'plain text': 'text',
    plain: 'text',
    'c++': 'cpp',
    'c#': 'csharp',
    objective: 'objc',
    shell: 'bash',
    applescript: 'applescript',
  };
  const raw = b.code.language.toLowerCase();
  const lang = langMap[raw] ?? raw;
  const content = b.code.rich_text.map((r) => ('text' in r ? r.text.content : '')).join('');
  const fence = content.includes('```') ? '````' : '```';
  return `${fence}${lang}\n${content}\n${fence}`;
}

function renderImage(b: BlockObjectResponse, ctx: ConvertContext): string {
  if (b.type !== 'image') return '';
const ref = ctx.media.get(b.id) ?? null;
  if (!ref) {
    ctx.warn(`image block ${b.id} omitted (media unavailable or failed validation)`);
    return '';
  }
  const alt = plainText(b.image.caption);
  return `![${alt}](${ref})`;
}

function renderToggle(node: BlockNode, ctx: ConvertContext): string {
  const b = node.block;
  if (b.type !== 'toggle') return '';
  const summary = renderRichText(b.toggle.rich_text, ctx);
  const body = renderBlocks(node.children, ctx).trimEnd();
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n</details>`;
}

function renderCallout(node: BlockNode, ctx: ConvertContext): string {
  const b = node.block;
  if (b.type !== 'callout') return '';
  let emoji = '';
  if (b.callout.icon && b.callout.icon.type === 'emoji') {
    emoji = `${b.callout.icon.emoji} `;
  }
  const text = renderRichText(b.callout.rich_text, ctx);
  const body = renderBlocks(node.children, ctx).trimEnd();
  const quoted = `> ${emoji}${text}`.replace(/\n/g, '\n> ');
  return body ? `${quoted}\n\n${body}` : quoted;
}

function renderQuote(b: BlockObjectResponse, ctx: ConvertContext): string {
  if (b.type !== 'quote') return '';
  const text = renderRichText(b.quote.rich_text, ctx);
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function renderBookmark(b: BlockObjectResponse, ctx: ConvertContext): string {
  if (b.type !== 'bookmark') return '';
  const url = b.bookmark.url;
  const label = plainText(b.bookmark.caption) || (isSafeLink(url) ? url : 'link');
  if (!isSafeLink(url)) {
    ctx.warn('bookmark URL omitted (unsafe scheme)');
    return '';
  }
  return `[${label}](${url})`;
}

function renderUnsupportedMediaLink(b: BlockObjectResponse, ctx: ConvertContext): string {
  const url =
    b.type === 'video'
      ? b.video.type === 'external'
        ? b.video.external.url
        : b.video.file.url
      : b.type === 'file'
        ? b.file.type === 'external'
          ? b.file.external.url
          : b.file.file.url
        : b.type === 'pdf'
          ? b.pdf.type === 'external'
            ? b.pdf.external.url
            : b.pdf.file.url
          : b.type === 'audio'
            ? b.audio.type === 'external'
              ? b.audio.external.url
              : b.audio.file.url
            : b.type === 'embed'
              ? b.embed.url
              : null;
  if (!isSafeLink(url)) {
    ctx.warn(`unsupported media block "${b.type}" omitted (no safe URL)`);
    return '';
  }
  return `[${url}](${url})`;
}

function renderBlock(node: BlockNode, ctx: ConvertContext): string {
  const b = node.block;
  switch (b.type) {
    case 'paragraph':
      return renderRichText(b.paragraph.rich_text, ctx);
    case 'heading_1':
      return `${headingMarker(1)} ${renderRichText(b.heading_1.rich_text, ctx)}`;
    case 'heading_2':
      return `${headingMarker(2)} ${renderRichText(b.heading_2.rich_text, ctx)}`;
    case 'heading_3':
      return `${headingMarker(3)} ${renderRichText(b.heading_3.rich_text, ctx)}`;
    case 'heading_4':
      return `${headingMarker(4)} ${renderRichText(b.heading_4.rich_text, ctx)}`;
    case 'quote':
      return renderQuote(b, ctx);
    case 'callout':
      return renderCallout(node, ctx);
    case 'toggle':
      return renderToggle(node, ctx);
    case 'divider':
      return '---';
    case 'code':
      return renderCode(b, ctx);
    case 'equation':
      return serializeBlockEquation(b.equation.expression, ctx.warn);
    case 'image':
      return renderImage(b, ctx);
    case 'bookmark':
      return renderBookmark(b, ctx);
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
      return renderListGroup([node], b.type === 'numbered_list_item', ctx);
    case 'table':
      return renderTable(node, ctx);
    case 'column_list':
      return renderColumns(node, ctx);
    case 'synced_block':
      return renderBlocks(node.children, ctx).trimEnd();
    case 'table_of_contents':
      ctx.warn('table_of_contents omitted (static MDX cannot replicate)');
      return '';
    case 'video':
    case 'file':
    case 'pdf':
    case 'audio':
    case 'embed':
      return renderUnsupportedMediaLink(b, ctx);
    case 'link_preview':
      return isSafeLink(b.link_preview.url) ? `[${b.link_preview.url}](${b.link_preview.url})` : '';
    case 'link_to_page':
      ctx.warn('link_to_page omitted (cannot dereference safely)');
      return '';
    case 'breadcrumb':
      return '';
    case 'template':
      return renderRichText(b.template.rich_text, ctx);
    default:
      ctx.warn(`unsupported block type "${b.type}" omitted`);
      return '';
  }
}

/** Render a list of sibling blocks, merging adjacent same-type list runs. */
export function renderBlocks(nodes: BlockNode[], ctx: ConvertContext): string {
  const out: string[] = [];
  let i = 0;
  while (i < nodes.length) {
    const b = nodes[i].block;
    if (isListType(b.type)) {
      const run: BlockNode[] = [];
      const type = b.type;
      while (i < nodes.length && nodes[i].block.type === type) {
        run.push(nodes[i]);
        i++;
      }
      const ordered = type === 'numbered_list_item';
      out.push(renderListGroup(run, ordered, ctx));
      continue;
    }
    out.push(renderBlock(nodes[i], ctx));
    i++;
  }
  return out.filter((s) => s !== '').join('\n\n');
}

/** Convenience: convert a full page body (already a block tree) to MDX body. */
export function convertPageBody(
  nodes: BlockNode[],
  ctx: ConvertContext,
): string {
  return renderBlocks(nodes, ctx).trim();
}

export { isFullBlock };
