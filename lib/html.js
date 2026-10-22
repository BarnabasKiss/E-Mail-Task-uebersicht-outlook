const ENTITIES = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

/**
 * HTML zu Text. Standard ist kompakt (für Modelle). Mit { paragraphs: true } bleiben Leerzeilen
 * zwischen Absätzen erhalten (für die Anzeige).
 */
export function htmlToText(html, { paragraphs = false } = {}) {
  let s = String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, paragraphs ? '\n\n' : '\n')
    .replace(/<\/(tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  for (const [re, to] of ENTITIES) s = s.replace(re, to);
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  s = paragraphs ? s.replace(/\n{3,}/g, '\n\n') : s.replace(/\n\s*\n+/g, '\n');
  return s.trim();
}

// Schneidet zitierte Vorgängermails ab ("Von:", "Am ... schrieb", "-----Original").
export function stripQuotedHistory(text, minKeep = 200) {
  const cut = text.search(/\n(Von:|From:|Am [^\n]{5,80} schrieb|-----Original)/);
  return cut > minKeep ? text.slice(0, cut) : text;
}
