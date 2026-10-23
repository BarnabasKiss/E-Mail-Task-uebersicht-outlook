// Signaturbild aus einer Datei vorbereiten: PNG, JPEG oder GIF. Kleine Dateien bleiben unverändert; größere (über 300 KB oder breiter als 600 Pixel)
// werden verkleinert (PNG bleibt PNG, sonst JPEG), damit die Mail nicht unnötig groß wird. Ergebnis: { name, contentType, base64 }.
const TYPES = ['image/png', 'image/jpeg', 'image/gif'];
const SMALL_BYTES = 300 * 1024;
const MAX_WIDTH = 600;

const readDataUrl = (blob, win) =>
  new Promise((resolve, reject) => {
    const r = new win.FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    r.readAsDataURL(blob);
  });
const base64Of = (dataUrl) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function prepareSignatureImage(file, win = globalThis.window) {
  if (!file || !TYPES.includes(file.type)) throw new Error('Nur PNG, JPEG oder GIF sind als Signaturbild möglich.');
  const original = await readDataUrl(file, win);
  if (file.size <= SMALL_BYTES) return { name: file.name, contentType: file.type, base64: base64Of(original) };
  if (file.type === 'image/gif') throw new Error('Das GIF ist zu groß (höchstens 300 KB). Bitte ein kleineres Bild wählen.');
  const img = await new Promise((resolve, reject) => {
    const i = new win.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Das Bild konnte nicht geöffnet werden.'));
    i.src = original;
  });
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
  const canvas = win.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return { name: file.name, contentType: type, base64: base64Of(canvas.toDataURL(type, 0.88)) };
}
