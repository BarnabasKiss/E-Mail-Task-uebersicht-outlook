// Kleiner lokaler Speicher (JSON-Datei, atomar geschrieben). Liegt in %LOCALAPPDATA%, nicht in OneDrive,
// weil Entwürfe echte Namen und Mailinhalte enthalten.
import fs from 'node:fs';

const SECTIONS = ['drafts', 'matches', 'snoozed', 'replyChecks', 'replies', 'learned', 'draftErrors', 'attReviews'];

export function createStore(file) {
  const state = Object.fromEntries(SECTIONS.map((s) => [s, {}]));
  try {
    Object.assign(state, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    // erster Start
  }

  const save = () => {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };

  return {
    get: (section, key) => state[section]?.[key],
    all: (section) => ({ ...(state[section] || {}) }),
    set(section, key, value) {
      (state[section] ??= {})[key] = value;
      save();
    },
    del(section, key) {
      if (state[section] && key in state[section]) {
        delete state[section][key];
        save();
      }
    },
    /** Entfernt alles, was lokal zu einer Mail gespeichert ist (Entwurf, Zuordnung, Zurückstellung, ...). */
    purge(key) {
      let changed = false;
      for (const section of SECTIONS) {
        if (state[section] && key in state[section]) {
          delete state[section][key];
          changed = true;
        }
      }
      if (changed) save();
    },
  };
}
