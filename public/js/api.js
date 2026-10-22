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
  attachments: (id) => request('GET', `/api/proposals/${id}/attachments`),
  match: (id, force = false) => request('POST', `/api/proposals/${id}/match${force ? '?force=1' : ''}`, {}),
  action: (name, payload) => request('POST', `/api/actions/${name}`, payload),
  status: () => request('GET', '/api/status'),
  openRules: () => request('POST', '/api/open-rules', {}),
};
