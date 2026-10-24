// Alle Aufrufe an den lokalen Server (/api/...). Schreibende Aufrufe senden den Header x-mail-app, den der Server verlangt.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-mail-app': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.login) location.href = '/login';
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

export const api = {
  proposals: () => request('GET', '/api/proposals'),
  refresh: () => request('POST', '/api/refresh', {}),
  detail: (id) => request('GET', `/api/proposals/${id}`),
  search: (q, { content = true, names = true, text = true } = {}) => request('GET', `/api/search?q=${encodeURIComponent(q)}${content ? '' : '&content=0'}${names ? '' : '&names=0'}${text ? '' : '&text=0'}`),
  thread: (id, { before = '', limit = 10 } = {}) => request('GET', `/api/proposals/${id}/thread?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  suggest: (q, exclude = []) => request('GET', `/api/address-book/suggest?q=${encodeURIComponent(q)}${exclude.length ? `&exclude=${encodeURIComponent(exclude.join(','))}` : ''}`).then((r) => r.items),
  addressBook: ({ q = '', source = '', limit = 200 } = {}) => request('GET', `/api/address-book?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&limit=${limit}`),
  speech: () => request('GET', '/api/speech'),
  /** Aufnahme (Blob) lokal erkennen lassen -> Text */
  async transcribe(blob) {
    const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm', 'x-mail-app': '1' }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
    return data.text;
  },
  outbox: () => request('GET', '/api/outbox'),
  tasksFile: () => request('GET', '/api/tasks-file'),
  browse: (dir = '') => request('GET', `/api/browse${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  composeInfo: () => request('GET', '/api/compose-info'),
  contact: (address) => request('GET', `/api/contacts/${encodeURIComponent(address)}`),
  historyLearn: () => request('GET', '/api/history-learn'),
  aiView: (id) => request('GET', `/api/proposals/${id}/ai-view`),
  attachments: (id) => request('GET', `/api/proposals/${id}/attachments`),
  match: (id, force = false) => request('POST', `/api/proposals/${id}/match${force ? '?force=1' : ''}`, {}),
  action: (name, payload) => request('POST', `/api/actions/${name}`, payload),
  status: () => request('GET', '/api/status'),
  rules: () => request('GET', '/api/rules'),
  /** Regeln ändern; Antwort ist das aktuelle Dokument. op: add | edit | delete | save-text */
  editRules: (payload) => request('POST', '/api/actions/rules', payload),
  openRules: () => request('POST', '/api/open-rules', {}),
};
