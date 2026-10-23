// Signatur bearbeiten (Optionen → Signatur): von Hand setzen oder zur automatischen Erkennung zurückkehren. Antwort ist der neue Stand.
import { setManualSignature } from '../lib/signature-setting.js';

export const signature = {
  name: 'signature',
  async run({ store }, { op, text }) {
    if (op === 'set') return setManualSignature(store, text);
    if (op === 'reset') return setManualSignature(store, null);
    throw new Error(`Unbekannte Änderung: ${op}`);
  },
};
