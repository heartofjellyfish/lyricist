const STORAGE_KEY = "line-craft-state";

const DEFAULT_STATE = {
  seed: "",
  subject: "",
  spectrums: { orientation: 0, stability: 0, distance: 0, register: 0, vision: 0 },  // each -1, 0, or 1
  micros: [],
  results: [],       // Array of { id, line, craft_notes, parentId?, action? }
  idCounter: 0,
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...saved, spectrums: { ...DEFAULT_STATE.spectrums, ...saved?.spectrums } };
    }
  } catch {}
  return { ...DEFAULT_STATE };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ── Listeners ───────────────────────────────────────────────────────

const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Getters ─────────────────────────────────────────────────────────

export function getState() {
  return state;
}

// ── Mutations ───────────────────────────────────────────────────────

export function setSeed(seed) {
  state.seed = seed;
  persist();
}

export function setSubject(subject) {
  state.subject = subject;
  persist();
}

export function setSpectrum(key, value) {
  state.spectrums[key] = value;
  persist();
  notify();
}

export function setMicros(micros) {
  state.micros = micros;
  persist();
}

export function toggleMicro(key) {
  const idx = state.micros.indexOf(key);
  if (idx >= 0) {
    state.micros.splice(idx, 1);
  } else {
    state.micros.push(key);
  }
  persist();
  notify();
}

/**
 * Add generated lines to results.
 */
export function addResults(lines, parentId = null, action = "generate") {
  for (const item of lines) {
    state.idCounter += 1;
    state.results.push({
      id: String(state.idCounter),
      line: item.line,
      craft_notes: item.craft_notes,
      parentId,
      action,
    });
  }
  persist();
  notify();
}

/**
 * Store a critique result on an existing line.
 */
export function setCritique(lineId, critique) {
  const entry = state.results.find((r) => r.id === lineId);
  if (entry) {
    entry.critique = critique;
    persist();
    notify();
  }
}

export function clearResults() {
  state.results = [];
  state.idCounter = 0;
  persist();
  notify();
}

export function resetState() {
  state = { ...DEFAULT_STATE, spectrums: { ...DEFAULT_STATE.spectrums } };
  persist();
  notify();
}
