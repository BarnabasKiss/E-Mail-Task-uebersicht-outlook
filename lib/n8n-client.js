// Spricht ausschließlich mit der n8n-Schnittstelle "Mail-App Schnittstelle" (Webhook mail-app).

export function createN8nClient({ url, token, timeoutMs = 60000 }) {
  async function call(action, body = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-token': token },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`n8n ${action}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    async listProposals(status = 'neu') {
      const out = await call('list', { status });
      return out?.items ?? [];
    },
    setStatus: (id, newStatus) => call('setStatus', { id, newStatus }),
    deleteRow: (id) => call('delete', { id }),
    getMail: (mailId) => call('getMail', { id: mailId }),
    hasReply: (p) => call('hasReply', { id: p.mail_id, conversationId: p.conversation_id, after: p.received_at }),
  };
}
