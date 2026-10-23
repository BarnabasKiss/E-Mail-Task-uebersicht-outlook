// Node "Entwurf vorbereiten" (Code, Run Once for All Items): Aktion saveDraft.
// Prüft Mail-ID, Empfänger und Text und macht aus dem Text HTML-Absätze. Antwortet immer "nur an den Absender" und setzt An und CC danach
// ausdrücklich: so ist genau das drin, was die App zeigt.
const req = $('Mail-App Anfrage').item.json.body || {};
if (!/^[A-Za-z0-9_\-=+\/]{20,}$/.test(String(req.id || ''))) throw new Error('ungültige Mail-ID');
const email = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const list = (v) => (Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter(Boolean);
const to = list(req.to);
const cc = list(req.cc);
if (!to.length) throw new Error('kein Empfänger');
if ([...to, ...cc].some((a) => !email.test(a)) || to.length + cc.length > 30) throw new Error('ungültige Empfänger');
const text = String(req.text || '').replace(/\r\n?/g, '\n').trim();
if (!text) throw new Error('leerer Text');
if (text.length > 50000) throw new Error('Text zu lang');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
return [{ json: { id: req.id, comment: html, to: to.join(','), cc: cc.join(',') } }];
