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
// Optionales Signaturbild { name, contentType, base64 }: wird nach dem Anlegen des Entwurfs als eingebettetes Bild angehängt (cid:signatur-bild)
let image = null;
if (req.image) {
  const type = String(req.image.contentType || '').toLowerCase();
  const data = String(req.image.base64 || '');
  if (!['image/png', 'image/jpeg', 'image/gif'].includes(type) || !/^[A-Za-z0-9+\/]+={0,2}$/.test(data) || data.length > 700000) throw new Error('ungültiges Signaturbild');
  image = { name: String(req.image.name || 'signatur').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'signatur', contentType: type, base64: data };
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') + (image ? '<p><img src="cid:signatur-bild" alt="" style="max-width:100%"></p>' : '');
return [{ json: { subject, html, image, to: to.join(','), cc: cc.join(','), bcc: bcc.join(',') } }];
