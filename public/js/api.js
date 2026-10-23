// Alle Aufrufe an den lokalen Server (/api/...). Schreibende Aufrufe senden den Header x-mail-app, den der Server verlangt.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-mail-app': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
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
  composeInfo: () => request('GET', '/api/compose-info'),
  contact: (address) => request('GET', `/api/contacts/${encodeURIComponent(address)}`),
  historyLearn: () => request('GET', '/api/history-learn'),
  aiView: (id) => request('GET', `/api/proposals/${id}/ai-view`),
  attachments: (id) => request('GET', `/api/proposals/${id}/attachments`),
  match: (id, force = false) => request('POST', `/api/proposals/${id}/match${force ? '?force=1' : ''}`, {}),
  action: (name, payload) => request('POST', `/api/actions/${name}`, payload),
  status: () => request('GET', '/api/status'),
  openRules: () => request('POST', '/api/open-rules', {}),
};
