// Darstellung der Mailliste für die Oberfläche: aus den Zeilen der Tabelle (n8n) und allem Lokalen (Rolle, Anhänge, Wichtig,
// Entwurf, Zurückgestelltes ...) wird je Mail ein Eintrag. Die Oberfläche sieht nur diese Einträge, nie die rohen Zeilen.
import { applyUrgencyRules } from './rules.js';
import { needsReply, ARCHIVE_STATUSES } from './scheduler.js';
import { friendlyError } from './errors.js';
import { isTestMail } from './test-mail.js';
import { importanceReasons } from './importance.js';

const URGENCY_ORDER = { jetzt: 0, heute: 1, woche: 2, egal: 3 };

/** roles, attInfo, docIndex sind optional (Module); fehlen sie, bleiben die Felder leer. */
export function createProposalView({ rules, store, scheduler, ownAddress, roles, attInfo, docIndex }) {
  /** @returns {{hidden: boolean, item: object}} hidden = per Regel ausgeblendet ("Absender ignorieren") */
  function view(p, urgencyRules) {
    const rule = applyUrgencyRules(p, urgencyRules);
    const urgency = rule.urgency || p.dringlichkeit;
    const archived = ARCHIVE_STATUSES.includes(p.status);
    const snoozedUntil = store.get('snoozed', p.mail_id);
    const draftError = store.get('draftErrors', p.mail_id);
    return {
      hidden: rule.hidden,
      item: {
        id: p.id,
        mail_id: p.mail_id,
        is_test: isTestMail(p),
        betreff: p.betreff,
        absender: p.absender,
        absender_mail: p.absender_mail,
        received_at: p.received_at,
        dringlichkeit: urgency,
        dringlichkeit_original: p.dringlichkeit,
        durch_regel: !!rule.urgency,
        kategorie: p.kategorie,
        zusammenfassung: p.zusammenfassung,
        antwort_noetig: needsReply(p),
        aufgabe_text: p.aufgabe_text,
        aufgabe_thema: p.aufgabe_thema,
        frist: p.frist,
        begruendung: p.begruendung,
        web_link: p.web_link,
        anhang_bewertung: p.anhang_bewertung || null,
        rolle: roles?.get(p.mail_id) || null, // direkt | cc | shared
        empfaenger: docIndex?.recipients(p.mail_id) || null, // { an, cc } sobald der Index die Mail gelesen hat
        wichtig: importanceReasons({ ...p, dringlichkeit: urgency, archiviert: archived }), // Gründe, leer = nicht wichtig
        anhaenge: attInfo?.get(p.mail_id) ?? null, // Dateinamen, null = noch nicht abgefragt
        aufgabe_uebernommen: store.get('tasks', p.mail_id) || null,
        hat_entwurf: !!store.get('drafts', p.mail_id),
        entwurf_fehler: draftError ? friendlyError(draftError.message) : null,
        snoozed_until: snoozedUntil && Date.parse(snoozedUntil) > Date.now() ? snoozedUntil : null,
        status: p.status,
        archiviert: archived,
        abgelegt_am: p.updatedAt || null,
      },
    };
  }

  /** Offene Mails nach Dringlichkeit und Eingang sortiert, Done in der Reihenfolge des Schedulers (zuletzt abgelegt zuerst). */
  function list() {
    const urgencyRules = rules.urgencyRules();
    const items = [];
    let hidden = 0;
    for (const p of scheduler.state.items) {
      const v = view(p, urgencyRules);
      if (v.hidden) hidden += 1;
      else items.push(v.item);
    }
    items.sort((a, b) => (URGENCY_ORDER[a.dringlichkeit] ?? 9) - (URGENCY_ORDER[b.dringlichkeit] ?? 9) || String(b.received_at).localeCompare(String(a.received_at)));
    const archive = scheduler.state.archive.map((p) => view(p, urgencyRules).item);
    return { items, archive, hidden, ownAddress };
  }

  return { view, list };
}
