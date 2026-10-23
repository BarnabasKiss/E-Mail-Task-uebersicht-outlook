// Signatur für ausgehende Mails: Text und optional ein Bild (Logo). Der Text ist entweder von Hand eingestellt (Optionen → Signatur, gilt vor allem anderen,
// auch leer = keine Signatur) oder die automatisch erkannte aus deiner letzten Nachricht im Verlauf. Das Bild gibt es nur von Hand.
// Alles liegt nur lokal in state.json, nichts davon geht nach Outlook, außer beim Senden: dann hängt n8n das Bild als eingebettetes Bild an die Mail.
const MAX_CHARS = 2000;
export const MAX_IMAGE_BYTES = 400 * 1024;
const IMAGE_TYPES = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/gif': [0x47, 0x49, 0x46, 0x38] };

/** @returns {{ signature: string, manual: string|null, detected: string, image: { name: string, contentType: string, size: number }|null }} signature = der wirksame Text */
export function signatureInfo(store) {
  const manual = store.get('settings', 'signatureManual');
  const detected = store.get('settings', 'signature') || '';
  const isManual = typeof manual === 'string';
  const img = store.get('settings', 'signatureImage');
  return {
    signature: isManual ? manual : detected,
    manual: isManual ? manual : null,
    detected,
    image: img ? { name: img.name, contentType: img.contentType, size: Buffer.from(img.base64, 'base64').length } : null,
  };
}

/** Von Hand setzen (Text, '' = keine Signatur) oder auf die automatische Erkennung zurückstellen (text = null). */
export function setManualSignature(store, text) {
  if (text === null) {
    store.del('settings', 'signatureManual');
    return signatureInfo(store);
  }
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  if (clean.length > MAX_CHARS) throw new Error(`Die Signatur ist zu lang (höchstens ${MAX_CHARS} Zeichen).`);
  store.set('settings', 'signatureManual', clean);
  return signatureInfo(store);
}

/** Signaturbild speichern (PNG, JPEG oder GIF bis 400 KB; der Inhalt wird am Dateianfang geprüft, nicht nur der Typ). */
export function setSignatureImage(store, { name, contentType, base64 }) {
  const type = String(contentType || '').toLowerCase();
  const magic = IMAGE_TYPES[type];
  if (!magic) throw new Error('Nur PNG, JPEG oder GIF sind als Signaturbild möglich.');
  const data = String(base64 || '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Das Bild ist beschädigt.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Das Bild ist zu groß (höchstens ${MAX_IMAGE_BYTES / 1024} KB).`);
  if (!magic.every((b, i) => bytes[i] === b)) throw new Error('Die Datei ist kein gültiges Bild.');
  const clean = String(name || 'signatur').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'signatur';
  store.set('settings', 'signatureImage', { name: clean, contentType: type, base64: data });
  return signatureInfo(store);
}

export function removeSignatureImage(store) {
  store.del('settings', 'signatureImage');
  return signatureInfo(store);
}

/** Das gespeicherte Bild samt Daten, für den Versand an n8n und die Vorschau; null ohne Bild. */
export const signatureImage = (store) => store.get('settings', 'signatureImage') || null;

/** Zusatz für den Aufruf an n8n: { image } nur wenn die Mail das Bild verlangt (signatureImage: true) und eines gespeichert ist, sonst {}. */
export const imageFor = (store, payload) => {
  const image = payload?.signatureImage === true ? signatureImage(store) : null;
  return image ? { image } : {};
};
