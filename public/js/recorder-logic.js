// Reine Logik für die Aufnahme in Abschnitten (ohne Browser): wann wird geschnitten, wie laut ist das Signal.

/** Lautstärke (Effektivwert) von Abtastwerten zwischen -1 und 1. */
export function rmsOf(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

/**
 * Schneiden, wenn nach genug Sprache eine Pause kommt (der Abschnitt wird erkannt, während du weitersprichst) oder der Abschnitt zu lang wird.
 * Abschnitte ganz ohne Sprache werden nach einer Weile still verworfen, damit nichts Leeres erkannt wird.
 * @returns {'cut' | 'drop' | null}
 */
export function nextAction({ elapsedMs, speechMs, silentMs }, { minSpeechMs = 500, pauseMs = 900, maxMs = 28000, dropMs = 5000 } = {}) {
  if (speechMs >= minSpeechMs && silentMs >= pauseMs) return 'cut';
  if (elapsedMs >= maxMs) return speechMs >= minSpeechMs ? 'cut' : 'drop';
  if (speechMs === 0 && elapsedMs >= dropMs) return 'drop';
  return null;
}

/** Schwelle für "es wird gesprochen": ein Vielfaches des Grundrauschens, nie unter einem Mindestwert. Das Grundrauschen sinkt schnell und steigt langsam. */
export function updateNoiseFloor(floor, level) {
  return level < floor ? floor * 0.8 + level * 0.2 : floor * 1.002 + level * 0.001;
}
export const speechThreshold = (floor, min = 0.015) => Math.max(min, floor * 3);
