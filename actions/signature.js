// Signatur bearbeiten (Optionen → Signatur): Text von Hand setzen oder zur automatischen Erkennung zurückkehren, Bild setzen oder entfernen. Antwort ist der neue Stand.
import { setManualSignature, setSignatureImage, removeSignatureImage } from '../lib/signature-setting.js';

export const signature = {
  name: 'signature',
  async run({ store }, { op, text, name, contentType, base64 }) {
    if (op === 'set') return setManualSignature(store, text);
    if (op === 'reset') return setManualSignature(store, null);
    if (op === 'set-image') return setSignatureImage(store, { name, contentType, base64 });
    if (op === 'remove-image') return removeSignatureImage(store);
    throw new Error(`Unbekannte Änderung: ${op}`);
  },
};
