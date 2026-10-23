// Warnungen vor dem Senden, rein lokal und ohne KI: falscher Du/Sie-Ton, Empfänger aus verschiedenen Firmen sichtbar in einer Mail,
// ein Empfänger in BCC und zugleich in An/CC, "Anhang" im Text, aber die App hängt nichts an. Sie verbieten das Senden nicht, du bestätigst sie.
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'outlook.at', 'hotmail.com', 'hotmail.at', 'live.com', 'live.at', 'yahoo.com', 'yahoo.de', 'gmx.at', 'gmx.de', 'gmx.net', 'web.de', 'icloud.com', 'me.com', 'aon.at', 'chello.at', 'a1.net', 'bluewin.ch', 't-online.de', 'proton.me', 'protonmail.com']);
const ATTACH = /\b(anbei|im anhang|anhang|angeh[äa]ngt|beigef[üu]gt|beiliegend\w*|attached|attachment|enclosed)\b/i;
const DU = /\b(du|dir|dich|dein|deine|deinem|deinen|deiner|deines|euch|euer|eure|eurem|euren|eurer)\b/i;
// "Sie" und "Ihr" am Satzanfang sind mehrdeutig (sie = they, "Ihr könnt" = Du-Mehrzahl), deshalb nur mitten im Satz
const SIE = /\bIhnen\b|\b(Ihre|Ihrem|Ihren|Ihrer|Ihres)\b|[a-zäöüß,;:]\s+(Ihr|Sie)\b/;

const domainOf = (a) => String(a).split('@')[1]?.toLowerCase() || '';
const low = (l) => (l || []).map((a) => String(a).toLowerCase());

/** formOf(address) -> 'du' | 'sie' | '' (aus dem Absender-Gedächtnis). @returns {Array<{ id: string, title: string, hint: string }>} */
export function checkBeforeSend({ text = '', to = [], cc = [], bcc = [], ownAddress = '', formOf = () => '' }) {
  const out = [];
  const T = low(to);
  const C = low(cc);
  const B = low(bcc);

  const twice = B.filter((a) => T.includes(a) || C.includes(a));
  if (twice.length) out.push({ id: 'bcc-doppelt', title: `${twice.join(', ')} steht in BCC und auch in An/CC`, hint: 'Dann ist die Person nicht verdeckt. Entferne sie aus einem der Felder.' });

  const own = domainOf(ownAddress);
  const firms = [...new Set([...T, ...C].map(domainOf).filter((d) => d && d !== own && !FREEMAIL.has(d)))];
  if (firms.length > 1) out.push({ id: 'firmen', title: `Empfänger aus verschiedenen Firmen sehen einander (${firms.join(', ')})`, hint: 'Alle in An und CC sehen die Adressen aller anderen. Für getrennte Firmen besser BCC oder einzelne Mails.' });

  const duzt = DU.test(text);
  const siezt = SIE.test(text);
  for (const a of T) {
    const form = formOf(a);
    if (form === 'du' && siezt && !duzt) out.push({ id: 'form', title: `Im Text wird gesiezt, aber ${a} wird sonst geduzt`, hint: 'Prüfe Anrede und Ansprache im Text.' });
    else if (form === 'sie' && duzt && !siezt) out.push({ id: 'form', title: `Im Text wird geduzt, aber ${a} wird sonst gesiezt`, hint: 'Prüfe Anrede und Ansprache im Text.' });
  }

  if (ATTACH.test(text)) out.push({ id: 'anhang', title: 'Im Text ist von einem Anhang die Rede', hint: 'Die App hängt nichts an. Lege die Mail in Outlook ab und füge den Anhang dort hinzu, oder ändere den Text.' });
  return out.filter((w, i) => out.findIndex((x) => x.id === w.id && x.title === w.title) === i);
}
