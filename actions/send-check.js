// Warnungen vor dem Senden (siehe lib/send-check.js). Ändert nichts und sendet nichts.
import { checkBeforeSend } from '../lib/send-check.js';

export const sendCheck = {
  name: 'send-check',
  async run({ contacts, ownAddress }, { text, to, cc, bcc }) {
    const formOf = (a) => contacts.effective(a)?.form?.value || '';
    return { warnings: checkBeforeSend({ text: String(text || ''), to: to || [], cc: cc || [], bcc: bcc || [], ownAddress, formOf }) };
  },
};
