// Absender-Profil: was die App über eine Person und ihre Firma weiß. Die Zahlen werden aus den Mails in Liste und Done gerechnet,
// das Gedächtnis (Ansprache, Anrede, Gruß, Notizen) kommt aus contacts.js, die Regeln aus der Regeldatei.
import { needsReply } from './scheduler.js';
import { matchingUrgencyRules } from './rules.js';

const low = (s) => String(s || '').trim().toLowerCase();
const RECENT = 15;

// proposalView liefert je Mail dieselben Angaben wie die Liste (Tags, Anhänge, Aufgabe ...)
export function createContactProfile({ scheduler, store, contacts, rules, roles, proposalView }) {
  const everything = () => {
    const s = scheduler.state;
    const seen = new Set();
    return [...s.items, ...s.archive].filter((p) => !seen.has(p.mail_id) && seen.add(p.mail_id));
  };

  function statsOf(mails) {
    const times = mails.map((p) => Date.parse(p.received_at)).filter((t) => !Number.isNaN(t));
    const iso = (t) => new Date(t).toISOString();
    const asked = mails.filter(needsReply);
    return {
      total: mails.length,
      open: mails.filter((p) => !['done', 'angenommen', 'beantwortet'].includes(p.status)).length,
      first: times.length ? iso(Math.min(...times)) : null,
      last: times.length ? iso(Math.max(...times)) : null,
      roles: ['direkt', 'cc', 'shared'].reduce((o, r) => ({ ...o, [r]: mails.filter((p) => roles?.get(p.mail_id) === r).length }), {}),
      tasksTaken: mails.filter((p) => store.get('tasks', p.mail_id)).length,
      tasksOpen: mails.filter((p) => p.aufgabe_text && !store.get('tasks', p.mail_id) && !['done', 'angenommen', 'beantwortet'].includes(p.status)).length,
      replyAsked: asked.length,
      replied: asked.filter((p) => p.status === 'beantwortet').length,
    };
  }

  /** @param {string} address Adresse des Absenders (beliebige Schreibweise) */
  function build(address) {
    const addr = low(address);
    if (!/^[^\s@]+@[^\s@]+$/.test(addr)) throw new Error('Ungültige Adresse');
    const all = everything();
    const mine = all.filter((p) => low(p.absender_mail) === addr);
    const dk = contacts.domainKey(addr);
    const inDomain = dk ? all.filter((p) => low(p.absender_mail).endsWith(dk)) : [];
    const names = {};
    for (const p of mine) if (p.absender) names[p.absender] = (names[p.absender] || 0) + 1;
    const name = Object.entries(names).sort((a, b) => b[1] - a[1])[0]?.[0] || contacts.read(addr).name || '';
    const memory = contacts.profile(addr);
    const urgencyRules = rules.urgencyRules();
    return {
      address: addr,
      name,
      stats: statsOf(mine),
      recent: [...mine]
        .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
        .slice(0, RECENT)
        .map((p) => proposalView.view(p, urgencyRules).item),
      domain: dk ? { key: dk, mails: inDomain.length, persons: new Set(inDomain.map((p) => low(p.absender_mail))).size } : null,
      rules: matchingUrgencyRules(addr, urgencyRules),
      memory,
    };
  }

  return { build };
}
