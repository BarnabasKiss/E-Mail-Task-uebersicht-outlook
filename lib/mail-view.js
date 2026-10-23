// Ansichten einer einzelnen Mail: die Detailansicht und "Was bekäme Claude?" (anonymisiert, nur zur Anzeige, es wird nichts gesendet).
import { friendlyError } from './errors.js';
import { maskTexts, findLeaks } from './mask-strict.js';
import { mailMeta } from './drafts.js';
import { IMAGE_MARK } from './html.js';

const person = (r) => ({ name: r?.emailAddress?.name || '', address: r?.emailAddress?.address || '' });
const MAX_TEXT = 20000;

// Empfänger für "Antworten" und "Allen antworten": ohne die eigenen Adressen, ohne Doppelte
export function replyRecipients(mail, own) {
  const addr = (r) => String(r?.emailAddress?.address || '').toLowerCase();
  const mine = new Set(own.filter(Boolean).map((a) => a.toLowerCase()));
  const sender = addr(mail.from);
  const to = [...new Set([sender, ...(mail.toRecipients || []).map(addr)])].filter((a) => a && !mine.has(a));
  const cc = [...new Set((mail.ccRecipients || []).map(addr))].filter((a) => a && !mine.has(a) && !to.includes(a));
  // Namen zu den Adressen, damit die Empfängerfelder mehr als Adressen zeigen können
  const names = {};
  for (const r of [mail.from, ...(mail.toRecipients || []), ...(mail.ccRecipients || [])]) if (r?.emailAddress?.name) names[addr(r)] = r.emailAddress.name;
  return { sender, names, only: { to: sender && !mine.has(sender) ? [sender] : [], cc: [] }, all: { to, cc } };
}

export function createMailView({ cfg, drafts, attachments, store, vault, roles, proposalView, rules }) {
  const maskOptions = { ownNames: cfg.ownNames, ownAddress: cfg.ownAddress };

  /** Detailansicht. Fällt Outlook aus, bleibt die gespeicherte Vorschau (mail.source 'vorschau', mailError gesetzt). */
  async function detail(p) {
    const item = proposalView.view(p, rules.urgencyRules()).item;
    let mail;
    let reply = null;
    let mailError = null;
    try {
      const m = await drafts.getMail(p);
      item.rolle = roles?.remember(p.mail_id, m) || item.rolle;
      reply = { ...replyRecipients(m, [cfg.ownAddress, ...(cfg.ownAliases || [])]), draft: store.get('outlookDrafts', p.mail_id) || null };
      mail = {
        source: item.is_test ? 'test' : 'outlook',
        subject: m.subject,
        from: person(m.from),
        to: (m.toRecipients || []).map(person),
        cc: (m.ccRecipients || []).map(person),
        receivedDateTime: m.receivedDateTime,
        text: drafts.mailText(m, { paragraphs: true }).slice(0, MAX_TEXT),
      };
      // Bilder im Text: nur zur Anzeige. Die Marken tragen die Anhang-ID, die Oberfläche lädt das Bild darüber.
      const withImages = drafts.mailText(m, { paragraphs: true, images: true }).slice(0, MAX_TEXT);
      if (withImages !== mail.text) mail.imageText = (await attachments.resolveImages(p, withImages, IMAGE_MARK)).text;
      // "Was wird anonymisiert?": dieselbe Maskierung wie für Claude, aber ohne Prüfung, damit die Ansicht nie leer bleibt.
      if (cfg.pseudonymize) {
        try {
          const out = maskTexts(mailMeta(m), [mail.text], { ...maskOptions, check: false });
          mail.masked = { text: out.texts[0], map: out.map };
        } catch {
          mail.masked = null;
        }
      }
    } catch (e) {
      mailError = friendlyError(e.message);
      mail = {
        source: 'vorschau',
        subject: p.betreff,
        from: { name: p.absender || '', address: p.absender_mail || '' },
        to: [],
        cc: [],
        receivedDateTime: p.received_at,
        text: p.vorschau || '',
      };
    }
    const archived = item.archiviert;
    return {
      proposal: item,
      mail,
      mailError,
      reply: archived ? null : reply,
      draft: archived ? null : store.get('drafts', p.mail_id) || null,
      headings: archived ? [] : vault.headings(),
    };
  }

  /**
   * Was Claude aus Mail, Bildern und Anhängen bekäme: Text je Anhang im Original und maskiert (gemeinsame Platzhalter),
   * dazu das Ergebnis der Prüfung. Bilder im Text bekommen vor dem Maskieren eine Nummer (⟦bild:1⟧), damit die Oberfläche sie
   * an ihrer Stelle wieder einsetzen kann.
   */
  async function aiView(p) {
    const m = await drafts.getMail(p);
    const resolved = await attachments.resolveImages(p, drafts.mailText(m, { paragraphs: true, images: true }).slice(0, MAX_TEXT), IMAGE_MARK);
    const imageIds = [];
    const text = resolved.text.replace(IMAGE_MARK, (all, id) => `⟦bild:${imageIds.push(id)}⟧`);
    const read = cfg.attachments?.readByAi !== false ? (await attachments.readAll(p)).filter((a) => a.text) : [];
    const items = read.map((a) => ({ name: a.name, original: a.text, attId: a.attId || null }));
    if (!cfg.pseudonymize) return { items: items.map((a) => ({ ...a, masked: null })), imageIds, text: null, map: null, problems: [] };
    const out = maskTexts(mailMeta(m), [text, ...read.flatMap((a) => [a.name, a.text])], { ...maskOptions, check: false });
    const problems = findLeaks(out.texts, out.map, maskOptions);
    return {
      text: out.texts[0],
      imageIds,
      map: out.map,
      problems: [...new Set(problems)],
      items: items.map((a, i) => ({ ...a, maskedName: out.texts[1 + i * 2], masked: out.texts[2 + i * 2] })),
    };
  }

  return { detail, aiView };
}
