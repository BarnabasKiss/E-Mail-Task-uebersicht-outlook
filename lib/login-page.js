// Anmeldeseite (eigenständig, ohne Dateien aus public/, die erst nach der Anmeldung ausgeliefert werden).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const loginPage = ({ error }) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Anmelden – Mail-Übersicht</title>
<style>
  :root { color-scheme: light dark; --bg: #f5f5f7; --card: #fff; --text: #1c1c1e; --muted: #6b7280; --line: #d4d4d8; --accent: #4f46e5; --err: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111113; --card: #1c1c1f; --text: #f4f4f5; --muted: #a1a1aa; --line: #3f3f46; --accent: #818cf8; --err: #f87171; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.4 system-ui, sans-serif; }
  form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px 24px; display: grid; gap: 14px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  label { display: grid; gap: 4px; font-size: 14px; color: var(--muted); }
  input { font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--text); }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button { font: inherit; font-weight: 600; padding: 11px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .err { margin: 0; color: var(--err); font-size: 14px; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>Mail-Übersicht</h1>
  ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
  <label>Benutzername<input name="user" autocomplete="username" required autofocus></label>
  <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Anmelden</button>
</form>
</body>
</html>`;
