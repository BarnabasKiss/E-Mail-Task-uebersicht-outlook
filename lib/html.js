const ENTITIES = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

// Marke für ein eingebettetes Bild (cid:) im Anzeigetext. Nur für die Anzeige: Die KI bekommt nie Marken, sondern den
// OCR-Text der Bilder (siehe attachments.js).
export const IMAGE_MARK = /⟦bild:([^⟧]*)⟧/g;

const cidOf = (tag) => {
  const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const m = /^cid:(.+)$/i.exec((src?.[1] ?? src?.[2] ?? '').trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
};

/**
 * HTML zu Text. Standard ist kompakt (für Modelle). Mit { paragraphs: true } bleiben Leerzeilen
 * zwischen Absätzen erhalten (für die Anzeige). Mit { images: true } stehen eingebettete Bilder als Marke
 * ⟦bild:<cid>⟧ im Text.
 */
export function htmlToText(html, { paragraphs = false, images = false } = {}) {
  let s = String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const cid = images ? cidOf(tag) : null;
      return cid ? `\n⟦bild:${cid.replace(/[⟦⟧]/g, '')}⟧\n` : ' ';
    })
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
