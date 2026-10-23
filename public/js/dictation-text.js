// Reine Textlogik für die Spracheingabe (ohne Browser): Sprachbefehle wie "Komma" oder "neuer Absatz" und das saubere Anfügen an den Text.

const COMMANDS = [
  [/\bneuer absatz\b/gi, '\n\n'],
  [/\bneue zeile\b/gi, '\n'],
  [/\bfragezeichen\b/gi, '?'],
  [/\bausrufezeichen\b/gi, '!'],
  [/\bdoppelpunkt\b/gi, ':'],
  [/\bsemikolon\b/gi, ';'],
  [/\bklammer auf\b/gi, '('],
  [/\bklammer zu\b/gi, ')'],
  [/\bgedankenstrich\b/gi, ' – '],
  [/\bkomma\b/gi, ','],
  [/\bpunkt\b/gi, '.'],
];

/** "Hallo Anna komma neuer Absatz ich melde mich punkt" -> "Hallo Anna,\n\nich melde mich." */
export function applyVoiceCommands(text) {
  let s = String(text || '');
  for (const [re, to] of COMMANDS) s = s.replace(re, to);
  return s
    .replace(/[ \t]+([,.;:!?)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/g, ''); // Zeilenumbrüche am Anfang oder Ende bleiben ("neuer Absatz" als erstes Wort)
}

const SENTENCE_END = /(^|[.!?]\s*|\n\s*)$/;

/** Was an `existing` anzuhängen ist, wenn `chunk` diktiert wurde: richtiger Abstand, Großschreibung am Satzanfang. */
export function joinDictation(existing, chunk) {
  const piece = applyVoiceCommands(chunk);
  if (!piece) return '';
  const before = String(existing || '');
  const startsWithMark = /^[,.;:!?)]/.test(piece);
  const startsWithBreak = /^\n/.test(piece);
  const needsSpace = before && !/[\s(]$/.test(before) && !startsWithMark && !startsWithBreak;
  const capital = !startsWithMark && !startsWithBreak && SENTENCE_END.test(before);
  const text = capital ? piece.replace(/^(\S)/u, (c) => c.toUpperCase()) : piece;
  return `${needsSpace ? ' ' : ''}${text}`;
}
