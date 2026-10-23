import { faviconSvg, svgUrl, titleFor } from './attention.js';

const PULSE_MS = 450;
const PULSE_STEPS = 12; // etwa 5 Sekunden

/**
 * Zeigt den Stand im Browser-Tab: Symbol (auch im angepinnten Tab, der keinen Titel zeigt) und Titel.
 * update({ open, important, pulse }): pulse = es ist neu etwas Wichtiges dazugekommen (Symbol pocht kurz).
 */
export function createTabSignal() {
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.removeAttribute('type');
  let timer = null;

  const draw = (level, big = false) => {
    link.href = svgUrl(faviconSvg({ level, big }));
  };

  return {
    update({ open, important, pulse = false }) {
      clearInterval(timer);
      const level = important ? 'important' : open ? 'open' : null;
      document.title = titleFor({ open, important });
      draw(level);
      if (pulse && level === 'important') {
        let step = 0;
        timer = setInterval(() => {
          step += 1;
          draw(level, step % 2 === 1);
          if (step >= PULSE_STEPS) clearInterval(timer);
        }, PULSE_MS);
      }
    },
  };
}
