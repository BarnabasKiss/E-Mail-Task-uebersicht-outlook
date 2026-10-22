// Reine Berechnung der "Später erinnern"-Zeitpunkte (ohne Browser-Abhängigkeit, damit testbar).
// Alles wird aus dem übergebenen `now` abgeleitet, nie aus der Systemuhr.
function at(now, daysFromNow, hour) {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function snoozeOptions(now = new Date()) {
  const opts = [{ label: 'In 1 Stunde', date: new Date(now.getTime() + 3600_000) }];
  const today16 = at(now, 0, 16);
  if (today16 > now) opts.push({ label: 'Heute 16:00', date: today16 });
  opts.push({ label: 'Morgen 08:00', date: at(now, 1, 8) });
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  opts.push({ label: 'Nächste Woche (Mo 08:00)', date: at(now, toMonday, 8) });
  return opts;
}
