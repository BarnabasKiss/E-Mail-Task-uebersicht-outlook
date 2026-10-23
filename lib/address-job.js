// Hintergrundjob: füllt das Adressbuch aus den Mails der Übersicht (Absender, und sobald der Suchindex sie kennt, An und CC). Jede Mail zählt einmal.
import { parsePerson } from './address-book.js';

export function createAddressJob({ book, getScheduler, docIndex }) {
  function run() {
    const s = getScheduler().state;
    for (const p of [...s.items, ...s.archive]) {
      if (String(p.mail_id).startsWith('TEST-')) continue;
      book.rememberOnce(`sender:${p.mail_id}`, [{ name: p.absender, address: p.absender_mail }]);
      const r = docIndex?.recipients(p.mail_id);
      if (r) book.rememberOnce(`rcpt:${p.mail_id}`, [...r.an, ...r.cc].map(parsePerson).filter(Boolean));
    }
  }
  return { run };
}
