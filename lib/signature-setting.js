// Signatur für ausgehende Mails: entweder von Hand eingestellt (Optionen → Signatur, gilt vor allem anderen, auch leer = keine Signatur)
// oder die automatisch erkannte aus deiner letzten Nachricht im Verlauf. Beides liegt nur lokal in state.json, nichts davon geht nach Outlook.
const MAX_CHARS = 2000;

/** @returns {{ signature: string, manual: string|null, detected: string }} signature = die wirksame Signatur */
export function signatureInfo(store) {
  const manual = store.get('settings', 'signatureManual');
  const detected = store.get('settings', 'signature') || '';
  const isManual = typeof manual === 'string';
  return { signature: isManual ? manual : detected, manual: isManual ? manual : null, detected };
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
