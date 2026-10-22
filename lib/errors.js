// Übersetzt technische Fehlertexte in verständliche Sätze für die Oberfläche.
export function friendlyError(message = '') {
  const m = String(message);
  if (/HTTP 502/.test(m) && /outlook/i.test(m)) return 'Outlook hat die Mail nicht geliefert. Sie wurde vielleicht gelöscht oder verschoben.';
  if (/HTTP 401/.test(m)) return 'n8n hat den Token abgelehnt. Bitte den Token in config.json prüfen.';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|ETIMEDOUT|network/i.test(m)) return 'n8n ist gerade nicht erreichbar.';
  if (/Zeitlimit|TimeoutError|aborted/i.test(m)) return 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.';
  if (/spawn .*ENOENT|ENOENT.*claude/i.test(m)) return 'Claude wurde nicht gefunden. Bitte den Pfad in config.json prüfen.';
  if (/Claude beendet mit Code/.test(m)) return 'Claude hat den Auftrag nicht abgeschlossen. Bitte erneut versuchen.';
  return m;
}
