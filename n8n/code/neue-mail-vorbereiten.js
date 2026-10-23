// Node "Neue Mail vorbereiten" (Code, Run Once for All Items): Aktion saveNewDraft.
// Prüft Empfänger, Betreff und Text und macht aus dem Text HTML-Absätze.
const req = $('Mail-App Anfrage').item.json.body || {};
const email = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const list = (v) => (Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter(Boolean);
const to = list(req.to);
const cc = list(req.cc);
const bcc = list(req.bcc);
if (!to.length) throw new Error('kein Empfänger');
if ([...to, ...cc, ...bcc].some((a) => !email.test(a)) || to.length + cc.length + bcc.length > 60) throw new Error('ungültige Empfänger');
const subject = String(req.subject || '').replace(/[\r\n]+/g, ' ').trim();
if (!subject || subject.length > 300) throw new Error('Betreff fehlt oder ist zu lang');
const text = String(req.text || '').replace(/\r\n?/g, '\n').trim();
if (!text) throw new Error('leerer Text');
if (text.length > 50000) throw new Error('Text zu lang');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
return [{ json: { subject, html, to: to.join(','), cc: cc.join(','), bcc: bcc.join(',') } }];
