/* Snorri æfingalogur — vanilla SPA · kg only */
const STORAGE_KEY = "snorri-aefingar-v1";
const SEED_FLAG = "snorri-aefingar-seeded-v1";
const DRAFT_KEY = "snorri-aefingar-draft-v1";
const AUTOSAVE_MS = 400;

const EXERCISES = {
  A: [
    { id: "bekkpressa", name: "Bekkpressa", unit: "kg", sets: 3, target: "3x6-10" },
    { id: "incline-db", name: "Incline DB press", unit: "kg", sets: 3, target: "3x8-12" },
    { id: "ohp", name: "Overhead press", unit: "kg", sets: 3, target: "3x6-10" },
    { id: "lateral", name: "Lateral raises", unit: "kg", sets: 3, target: "3x10-15" },
    { id: "pushdown", name: "Triceps pushdown", unit: "kg", sets: 3, target: "3x10-15" },
    { id: "close-grip", name: "Close-grip/diamond", unit: "kg", sets: 3, target: "3x8-12" },
    { id: "total-abs", name: "Total Abdominal (Technogym)", unit: "kg", sets: 3, target: "3x8-12" }
  ],
  B: [
    { id: "lat-pulldown", name: "Lat pulldown", unit: "kg", sets: 3, target: "3x6-10" },
    { id: "seated-row", name: "Seated row", unit: "kg", sets: 3, target: "3x8-12" },
    { id: "face-pulls", name: "Face pulls", unit: "kg", sets: 3, target: "3x12-15" },
    { id: "rear-delt", name: "Rear delt fly", unit: "kg", sets: 3, target: "3x12-15" },
    { id: "bicep", name: "Bicep curls", unit: "kg", sets: 3, target: "3x8-12" },
    { id: "kickback", name: "Triceps kickback", unit: "kg", sets: 3, target: "3x12-15" },
    { id: "bird-dog", name: "Bird dog", unit: "reps", sets: 3, target: "3x8/hlið", repsOnly: true }
  ]
};

const CHART_COLORS = {
  volume: "#1A3A57",
  best: "#14654A",
  period: "#7A1B2A",
  grid: "rgba(20,32,43,.08)",
  text: "#4C5B67"
};

const state = {
  tab: "skra",
  dayType: "A",
  date: todayISO(),
  sessions: [],
  viewingId: null,
  period: "day",
  bestExName: null,
  formReady: false,
  autosaveTimer: null,
  autosaveStatus: ""
};

const charts = {
  volume: null,
  best: null,
  period: null
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function displayUnit(exOrDef) {
  if (exOrDef && (exOrDef.repsOnly || exOrDef.unit === "reps")) return "reps";
  return "kg";
}

function normalizeUnit(unit, repsOnly) {
  if (repsOnly || unit === "reps") return "reps";
  return "kg";
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.sessions = JSON.parse(raw);
    else state.sessions = [];
  } catch {
    state.sessions = [];
  }
  // Migrate any stored lbs → kg label (numbers unchanged)
  let changed = false;
  for (const s of state.sessions) {
    for (const ex of s.exercises || []) {
      const next = normalizeUnit(ex.unit, ex.repsOnly);
      if (ex.unit !== next) {
        ex.unit = next;
        changed = true;
      }
    }
  }
  if (changed) saveSessions();
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
}

function draftMapKey(date, dayType) {
  return `${date}|${dayType}`;
}

function loadDraftMap() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // migrate legacy single-draft shape
    if (parsed && parsed.date && parsed.dayType && parsed.exercises) {
      return { [draftMapKey(parsed.date, parsed.dayType)]: parsed };
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraftMap(map) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(map));
}

function clearDraft(date, dayType) {
  const map = loadDraftMap();
  const key = draftMapKey(date || state.date, dayType || state.dayType);
  if (map[key]) {
    delete map[key];
    saveDraftMap(map);
  }
}

function setAutosaveStatus(msg) {
  state.autosaveStatus = msg;
  const el = document.getElementById("autosave-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("saving", msg === "Vista…");
  el.classList.toggle("saved", msg === "Vistað");
  el.classList.toggle("hidden", !msg);
}

function sessionHasInput(session) {
  return (session.exercises || []).some((ex) =>
    (ex.sets || []).some((s) => {
      if (s.done) return true;
      if (s.reps != null) return true;
      if (!ex.repsOnly && s.weight != null) return true;
      return false;
    })
  );
}

function writeDraftNow(force) {
  if (!state.formReady) return;
  const session = collectFormSession();
  const map = loadDraftMap();
  const key = draftMapKey(session.date, session.dayType);
  const hasData = sessionHasInput(session);
  if (!hasData) {
    if (map[key]) {
      delete map[key];
      saveDraftMap(map);
    }
    setAutosaveStatus("");
    return;
  }
  const draft = {
    date: session.date,
    dayType: session.dayType,
    exercises: session.exercises,
    updatedAt: new Date().toISOString()
  };
  map[key] = draft;
  saveDraftMap(map);
  setAutosaveStatus("Vistað");
}

function scheduleDraftSave() {
  if (!state.formReady) return;
  setAutosaveStatus("Vista…");
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    writeDraftNow();
  }, AUTOSAVE_MS);
}

function draftForCurrent() {
  const map = loadDraftMap();
  return map[draftMapKey(state.date, state.dayType)] || null;
}

function draftSetsFor(name) {
  const d = draftForCurrent();
  if (!d) return null;
  const ex = (d.exercises || []).find((e) => e.name === name);
  return ex && ex.sets && ex.sets.length ? ex.sets : null;
}

function uid() {
  return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* Mon/Wed/Fri A/B alternate. Anchor: 2026-09-07 = A */
function suggestedNext() {
  const trainDays = [1, 3, 5];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let d = new Date(today);
  for (let i = 0; i < 14; i++) {
    if (trainDays.includes(d.getDay())) {
      const iso = toISO(d);
      const has = state.sessions.some((s) => s.date === iso);
      if (d.getTime() > today.getTime() || (d.getTime() === today.getTime() && !has)) {
        const dayType = dayTypeForDate(d);
        return { date: iso, dayType, label: formatIS(iso) };
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return { date: toISO(today), dayType: "A", label: formatIS(toISO(today)) };
}

function dayTypeForDate(d) {
  const anchor = new Date(2026, 8, 7);
  anchor.setHours(0, 0, 0, 0);
  const cur = new Date(d);
  cur.setHours(0, 0, 0, 0);
  let count = 0;
  const walk = new Date(anchor);
  while (walk <= cur) {
    if ([1, 3, 5].includes(walk.getDay())) {
      if (walk.getTime() === cur.getTime()) break;
      count++;
    }
    walk.setDate(walk.getDate() + 1);
  }
  return count % 2 === 0 ? "A" : "B";
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatIS(iso) {
  const [y, m, d] = iso.split("-");
  const dt = new Date(+y, +m - 1, +d);
  const days = ["sun", "mán", "þri", "mið", "fim", "fös", "lau"];
  return `${days[dt.getDay()]} ${d}.${m}.${y}`;
}

/** Most recent completed session sets for exercise on the same day type (A→A, B→B). */
function lastWeightsFor(name, dayType) {
  const type = dayType || state.dayType;
  const sorted = [...state.sessions]
    .filter((s) => s.dayType === type && s.completed !== false)
    .sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate) return byDate;
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
  for (const s of sorted) {
    const ex = (s.exercises || []).find((e) => e.name === name);
    if (!ex || !ex.sets || !ex.sets.length) continue;
    const hasData = ex.sets.some(
      (st) => st.done || st.reps != null || (!ex.repsOnly && st.weight != null)
    );
    if (hasData) return ex.sets;
  }
  return null;
}

/** Set-by-set match; if fewer historical sets, reuse the last available set. */
function prefFromHistory(sets, index) {
  if (!sets || !sets.length) return { weight: "", reps: "" };
  const src = sets[index] != null ? sets[index] : sets[sets.length - 1];
  return {
    weight: src && src.weight != null ? src.weight : "",
    reps: src && src.reps != null ? src.reps : ""
  };
}

function exVolume(ex) {
  return (ex.sets || []).reduce((sum, s) => {
    if (ex.repsOnly || s.weight == null) return sum + (Number(s.reps) || 0);
    return sum + (Number(s.weight) || 0) * (Number(s.reps) || 0);
  }, 0);
}

function sessionVolume(session) {
  return (session.exercises || []).reduce((n, e) => n + exVolume(e), 0);
}

function sessionSets(session) {
  return (session.exercises || []).reduce((n, e) => {
    return n + (e.sets || []).filter((st) => st.reps != null || st.weight != null || st.done).length;
  }, 0);
}

function bestWeight(ex) {
  let best = 0;
  for (const s of ex.sets || []) {
    const w = Number(s.weight) || 0;
    if (w > best) best = w;
  }
  return best;
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: CHART_COLORS.text, maxRotation: 45, minRotation: 0, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid }
      },
      y: {
        beginAtZero: true,
        ticks: { color: CHART_COLORS.text, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid }
      }
    }
  };
}


/* ---------- iOS-style drum pickers ---------- */
const WEIGHT_VALUES = (() => {
  const vals = [];
  for (let i = 0; i < 15; i++) vals.push(i);
  for (let i = 15; i <= 200; i += 5) vals.push(i);
  return vals;
})();

const REPS_VALUES = Array.from({ length: 31 }, (_, i) => i);

function snapWeight(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return 0;
  const v = Number(n);
  let best = WEIGHT_VALUES[0];
  let bestDist = Math.abs(best - v);
  for (const w of WEIGHT_VALUES) {
    const d = Math.abs(w - v);
    if (d < bestDist) {
      best = w;
      bestDist = d;
    }
  }
  return best;
}

function snapReps(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return 0;
  return Math.max(0, Math.min(30, Math.round(Number(n))));
}

function weightStepFor(value) {
  return value < 15 ? 1 : 5;
}

function nextWeight(value, dir) {
  const idx = WEIGHT_VALUES.indexOf(snapWeight(value));
  const next = idx + dir;
  if (next < 0) return WEIGHT_VALUES[0];
  if (next >= WEIGHT_VALUES.length) return WEIGHT_VALUES[WEIGHT_VALUES.length - 1];
  return WEIGHT_VALUES[next];
}

function nextReps(value, dir) {
  return Math.max(0, Math.min(30, snapReps(value) + dir));
}

/**
 * Mount a vertical scroll-snap drum picker.
 * opts: { values, value, unitSuffix, ariaLabel, onChange }
 * Returns { root, getValue, setValue }
 */
function createDrumPicker(opts) {
  const values = opts.values;
  const unitSuffix = opts.unitSuffix || "";
  const itemH = 36;
  const visible = 3;
  const height = itemH * visible;

  const root = document.createElement("div");
  root.className = "drum-picker";
  root.setAttribute("role", "listbox");
  root.setAttribute("aria-label", opts.ariaLabel || "Velja");

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "drum-btn";
  btnMinus.setAttribute("aria-label", "Minnka");
  btnMinus.textContent = "−";

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "drum-btn";
  btnPlus.setAttribute("aria-label", "Auka");
  btnPlus.textContent = "+";

  const viewport = document.createElement("div");
  viewport.className = "drum-viewport";
  viewport.style.height = height + "px";

  const highlight = document.createElement("div");
  highlight.className = "drum-highlight";
  highlight.setAttribute("aria-hidden", "true");

  const track = document.createElement("div");
  track.className = "drum-track";
  track.style.paddingTop = itemH + "px";
  track.style.paddingBottom = itemH + "px";

  values.forEach((v, i) => {
    const item = document.createElement("div");
    item.className = "drum-item";
    item.dataset.index = String(i);
    item.dataset.value = String(v);
    item.setAttribute("role", "option");
    item.style.height = itemH + "px";
    item.textContent = unitSuffix ? `${v}${unitSuffix}` : String(v);
    track.appendChild(item);
  });

  viewport.appendChild(highlight);
  viewport.appendChild(track);
  root.appendChild(btnMinus);
  root.appendChild(viewport);
  root.appendChild(btnPlus);

  let current = values.includes(opts.value) ? opts.value : values[0];
  let snapTimer = null;
  let syncing = false;

  function indexOf(val) {
    const i = values.indexOf(val);
    return i >= 0 ? i : 0;
  }

  function updateFades() {
    const idx = indexOf(current);
    track.querySelectorAll(".drum-item").forEach((el) => {
      const i = Number(el.dataset.index);
      const dist = Math.abs(i - idx);
      el.classList.toggle("selected", dist === 0);
      el.classList.toggle("near", dist === 1);
      el.classList.toggle("far", dist > 1);
      el.setAttribute("aria-selected", dist === 0 ? "true" : "false");
    });
  }

  function scrollToValue(val, smooth) {
    current = val;
    const idx = indexOf(val);
    syncing = true;
    viewport.scrollTo({ top: idx * itemH, behavior: smooth ? "smooth" : "auto" });
    updateFades();
    // release syncing after paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncing = false;
      });
    });
  }

  function commitFromScroll() {
    const idx = Math.round(viewport.scrollTop / itemH);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const val = values[clamped];
    if (val !== current) {
      current = val;
      if (opts.onChange) opts.onChange(val);
    }
    updateFades();
    // ensure exact snap
    if (Math.abs(viewport.scrollTop - clamped * itemH) > 0.5) {
      syncing = true;
      viewport.scrollTo({ top: clamped * itemH, behavior: "smooth" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncing = false;
        });
      });
    }
  }

  viewport.addEventListener(
    "scroll",
    () => {
      if (syncing) return;
      const idx = Math.round(viewport.scrollTop / itemH);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      const approx = values[clamped];
      if (approx !== current) {
        current = approx;
        updateFades();
        if (opts.onChange) opts.onChange(approx);
      }
      clearTimeout(snapTimer);
      snapTimer = setTimeout(commitFromScroll, 80);
    },
    { passive: true }
  );

  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const idx = indexOf(current);
      const next = Math.max(0, Math.min(values.length - 1, idx + dir));
      const val = values[next];
      scrollToValue(val, true);
      if (opts.onChange) opts.onChange(val);
    },
    { passive: false }
  );

  btnMinus.addEventListener("click", () => {
    const idx = indexOf(current);
    if (idx <= 0) return;
    const val = values[idx - 1];
    scrollToValue(val, true);
    if (opts.onChange) opts.onChange(val);
  });

  btnPlus.addEventListener("click", () => {
    const idx = indexOf(current);
    if (idx >= values.length - 1) return;
    const val = values[idx + 1];
    scrollToValue(val, true);
    if (opts.onChange) opts.onChange(val);
  });

  // initial
  scrollToValue(current, false);
  if (opts.onChange && !opts.silentInit) opts.onChange(current);

  return {
    root,
    getValue: () => current,
    setValue: (v, silent) => {
      const val = values.includes(v) ? v : values[0];
      scrollToValue(val, false);
      if (!silent && opts.onChange) opts.onChange(val);
    }
  };
}

function mountWeightPicker(container, initial, hiddenInput, onUserChange) {
  const hasPref = !(initial === "" || initial == null);
  const start = snapWeight(hasPref ? initial : 0);
  hiddenInput.value = hasPref ? String(start) : "";
  const picker = createDrumPicker({
    values: WEIGHT_VALUES,
    value: start,
    unitSuffix: "",
    ariaLabel: "Þyngd kg",
    silentInit: true,
    onChange: (v) => {
      hiddenInput.value = String(v);
      if (onUserChange) onUserChange();
    }
  });
  container.appendChild(picker.root);
  // Re-scroll after layout so the drum lands on the default value
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      picker.setValue(start, true);
      if (hasPref) hiddenInput.value = String(start);
    });
  });
  return picker;
}

function mountRepsPicker(container, initial, hiddenInput, onUserChange) {
  const hasPref = !(initial === "" || initial == null);
  const start = snapReps(hasPref ? initial : 0);
  hiddenInput.value = hasPref ? String(start) : "";
  const picker = createDrumPicker({
    values: REPS_VALUES,
    value: start,
    unitSuffix: "",
    ariaLabel: "Reps",
    silentInit: true,
    onChange: (v) => {
      hiddenInput.value = String(v);
      if (onUserChange) onUserChange();
    }
  });
  container.appendChild(picker.root);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      picker.setValue(start, true);
      if (hasPref) hiddenInput.value = String(start);
    });
  });
  return picker;
}

/* ---------- Render ---------- */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
  document.getElementById("sticky-save").classList.toggle("hidden", tab !== "skra");
  if (tab === "tolfraedi") renderStats();
  if (tab === "saga") renderHistory();
}

function updateScheduleHint() {
  const next = suggestedNext();
  document.getElementById("schedule-hint").innerHTML =
    `Áætlun: mán/mið/fös · A/B til skiptis. Næst: <strong>${next.label} → ${next.dayType}-dagur</strong>`;
}

function renderForm() {
  state.formReady = false;
  clearTimeout(state.autosaveTimer);
  const list = EXERCISES[state.dayType];
  const wrap = document.getElementById("exercise-list");
  wrap.innerHTML = "";
  document.getElementById("date-input").value = state.date;
  document.querySelectorAll(".day-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.day === state.dayType);
  });

  const draft = draftForCurrent();
  if (draft) setAutosaveStatus("Vistað");
  else setAutosaveStatus("");

  list.forEach((def) => {
    const draftSets = draftSetsFor(def.name);
    // Draft for today+dayType wins; otherwise last completed same day-type session
    const last = draftSets ? null : lastWeightsFor(def.name, state.dayType);
    const block = document.createElement("div");
    block.className = "ex-block card";
    block.dataset.exId = def.id;

    const unitLabel = displayUnit(def);
    const head = document.createElement("div");
    head.className = "ex-head";
    head.innerHTML = `
      <div>
        <div class="ex-name">${esc(def.name)}</div>
        <div class="ex-meta">${esc(def.target)}</div>
      </div>
      <span class="unit-badge">${esc(unitLabel)}</span>
    `;
    block.appendChild(head);

    for (let i = 0; i < def.sets; i++) {
      let prefW = "";
      let prefR = "";
      let prefDone = false;
      if (draftSets) {
        const d = draftSets[i] || draftSets[draftSets.length - 1];
        if (d) {
          prefW = d.weight != null ? d.weight : "";
          prefR = d.reps != null ? d.reps : "";
          prefDone = !!d.done && !!draftSets[i];
        }
      } else if (last) {
        const p = prefFromHistory(last, i);
        prefW = p.weight;
        prefR = p.reps;
      }
      const row = document.createElement("div");
      row.className = "set-row" + (def.repsOnly ? " reps-only" : "");

      const num = document.createElement("div");
      num.className = "set-num";
      num.textContent = "S" + (i + 1);
      row.appendChild(num);

      const wHidden = document.createElement("input");
      wHidden.type = "hidden";
      wHidden.className = "set-w";
      wHidden.dataset.set = String(i);

      if (def.repsOnly) {
        wHidden.value = "0";
        row.appendChild(wHidden);
      } else {
        const wWrap = document.createElement("div");
        wWrap.className = "picker-slot weight-slot";
        row.appendChild(wWrap);
        row.appendChild(wHidden);
        mountWeightPicker(wWrap, prefW, wHidden, scheduleDraftSave);
      }

      const rHidden = document.createElement("input");
      rHidden.type = "hidden";
      rHidden.className = "set-r";
      rHidden.dataset.set = String(i);
      const rWrap = document.createElement("div");
      rWrap.className = "picker-slot reps-slot";
      row.appendChild(rWrap);
      row.appendChild(rHidden);
      mountRepsPicker(rWrap, prefR, rHidden, scheduleDraftSave);

      const chk = document.createElement("button");
      chk.type = "button";
      chk.className = "set-check" + (prefDone ? " on" : "");
      chk.dataset.set = String(i);
      chk.setAttribute("aria-label", "Lokið");
      chk.textContent = "✓";
      chk.addEventListener("click", () => {
        chk.classList.toggle("on");
        scheduleDraftSave();
      });
      row.appendChild(chk);

      block.appendChild(row);
    }

    wrap.appendChild(block);
  });

  // enable autosave after pickers finish silent init + layout scroll
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        state.formReady = true;
      });
    });
  });
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function collectFormSession() {
  const date = document.getElementById("date-input").value || state.date;
  const dayType = state.dayType;
  const exercises = [];
  document.querySelectorAll("#exercise-list .ex-block").forEach((block) => {
    const def = EXERCISES[dayType].find((e) => e.id === block.dataset.exId);
    if (!def) return;
    const sets = [];
    for (let i = 0; i < def.sets; i++) {
      const wEl = block.querySelector(`.set-w[data-set="${i}"]`);
      const rEl = block.querySelector(`.set-r[data-set="${i}"]`);
      const chk = block.querySelector(`.set-check[data-set="${i}"]`);
      const weight = def.repsOnly ? 0 : parseFloat(wEl && wEl.value !== "" ? wEl.value : NaN);
      const reps = parseInt(rEl && rEl.value !== "" ? rEl.value : NaN, 10);
      sets.push({
        weight: Number.isFinite(weight) ? weight : null,
        reps: Number.isFinite(reps) ? reps : null,
        done: !!(chk && chk.classList.contains("on"))
      });
    }
    exercises.push({
      name: def.name,
      unit: normalizeUnit(def.unit, def.repsOnly),
      repsOnly: !!def.repsOnly,
      sets
    });
  });
  return { id: uid(), date, dayType, exercises, savedAt: new Date().toISOString() };
}

function saveCurrentSession() {
  clearTimeout(state.autosaveTimer);
  const session = collectFormSession();
  session.completed = true;
  const idx = state.sessions.findIndex((s) => s.date === session.date && s.dayType === session.dayType);
  if (idx >= 0) {
    session.id = state.sessions[idx].id;
    state.sessions[idx] = session;
  } else {
    state.sessions.push(session);
  }
  state.sessions.sort((a, b) => a.date.localeCompare(b.date));
  saveSessions();
  clearDraft(session.date, session.dayType);
  setAutosaveStatus("");
  toast("Æfing vistuð ✓");
  updateScheduleHint();
  // Keep form values; next A/B open uses newly saved session as defaults
  state.formReady = true;
}

function allExerciseDefs() {
  return [...EXERCISES.A, ...EXERCISES.B];
}

function shortDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday-start week key YYYY-Www */
function weekKey(iso) {
  const dt = isoToDate(iso);
  const day = (dt.getDay() + 6) % 7; // Mon=0
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - day);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNo = Math.floor((thursday - yearStart) / 86400000 / 7) + 1;
  const y = thursday.getFullYear();
  return { key: `${y}-W${String(weekNo).padStart(2, "0")}`, label: `V${weekNo} ${y}`, sort: toISO(monday) };
}

function monthKey(iso) {
  const [y, m] = iso.split("-");
  const months = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
  return { key: `${y}-${m}`, label: `${months[+m - 1]} ${y}`, sort: `${y}-${m}-01` };
}

function periodInfo(iso, period) {
  if (period === "week") return weekKey(iso);
  if (period === "month") return monthKey(iso);
  return { key: iso, label: formatIS(iso), sort: iso };
}

function aggregateByPeriod(period) {
  const map = new Map();
  for (const s of state.sessions) {
    const info = periodInfo(s.date, period);
    if (!map.has(info.key)) {
      map.set(info.key, {
        key: info.key,
        label: info.label,
        sort: info.sort,
        volume: 0,
        sets: 0,
        sessions: 0,
        byEx: {}
      });
    }
    const row = map.get(info.key);
    row.sessions += 1;
    row.sets += sessionSets(s);
    row.volume += sessionVolume(s);
    for (const ex of s.exercises || []) {
      if (ex.repsOnly) continue;
      const v = exVolume(ex);
      row.byEx[ex.name] = (row.byEx[ex.name] || 0) + v;
    }
  }
  return [...map.values()].sort((a, b) => a.sort.localeCompare(b.sort));
}

function renderVolumeChart() {
  destroyChart("volume");
  const sorted = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map((s) => shortDate(s.date));
  const data = sorted.map((s) => Math.round(sessionVolume(s)));
  const ctx = document.getElementById("chart-volume");
  if (!ctx) return;
  charts.volume = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Volume (kg·reps)",
        data,
        borderColor: CHART_COLORS.volume,
        backgroundColor: "rgba(26,58,87,.12)",
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.volume
      }]
    },
    options: chartDefaults()
  });
}

function populateBestSelect() {
  const sel = document.getElementById("best-ex-select");
  if (!sel) return;
  const weighted = allExerciseDefs().filter((e) => !e.repsOnly);
  const namesInData = new Set();
  for (const s of state.sessions) {
    for (const ex of s.exercises || []) {
      if (!ex.repsOnly) namesInData.add(ex.name);
    }
  }
  const options = weighted.filter((e) => namesInData.has(e.name));
  const list = options.length ? options : weighted;
  if (!state.bestExName || !list.some((e) => e.name === state.bestExName)) {
    state.bestExName = list[0] ? list[0].name : null;
  }
  sel.innerHTML = list.map((e) =>
    `<option value="${esc(e.name)}" ${e.name === state.bestExName ? "selected" : ""}>${esc(e.name)}</option>`
  ).join("");
}

function renderBestChart() {
  destroyChart("best");
  const name = state.bestExName;
  const ctx = document.getElementById("chart-best");
  if (!ctx || !name) return;
  const points = [];
  for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const ex = (s.exercises || []).find((e) => e.name === name);
    if (!ex || ex.repsOnly) continue;
    const w = bestWeight(ex);
    if (w > 0) points.push({ date: s.date, w });
  }
  charts.best = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => shortDate(p.date)),
      datasets: [{
        label: "Besta þyngd (kg)",
        data: points.map((p) => p.w),
        borderColor: CHART_COLORS.best,
        backgroundColor: "rgba(20,101,74,.12)",
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.best
      }]
    },
    options: chartDefaults()
  });
}

function renderPeriodSection() {
  document.querySelectorAll(".period-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.period === state.period);
  });

  const rows = aggregateByPeriod(state.period);
  const summary = document.getElementById("period-summary");
  const totalVol = rows.reduce((n, r) => n + r.volume, 0);
  const totalSets = rows.reduce((n, r) => n + r.sets, 0);
  const totalSess = rows.reduce((n, r) => n + r.sessions, 0);
  summary.innerHTML = `
    <span class="pill">Volume: <strong>${Math.round(totalVol)}</strong></span>
    <span class="pill">Sett: <strong>${totalSets}</strong></span>
    <span class="pill">Lotur: <strong>${totalSess}</strong></span>
    <span class="pill">Tímabil: <strong>${rows.length}</strong></span>
  `;

  // Combined top exercises across all periods
  const topBox = document.getElementById("period-top");
  const byEx = {};
  for (const r of rows) {
    for (const [name, v] of Object.entries(r.byEx)) {
      byEx[name] = (byEx[name] || 0) + v;
    }
  }
  const top = Object.entries(byEx).sort((a, b) => b[1] - a[1]).slice(0, 5);
  topBox.innerHTML = top.length
    ? `<h4>Topp æfingar (volume)</h4>${top.map(([n, v]) =>
        `<div class="top-ex-row"><span>${esc(n)}</span><span class="vol">${Math.round(v)}</span></div>`
      ).join("")}`
    : `<p class="muted">Engin gögn.</p>`;

  const table = document.getElementById("period-table");
  if (!rows.length) {
    table.innerHTML = "";
  } else {
    table.innerHTML = `<table>
      <thead><tr>
        <th>Tímabil</th><th class="num">Volume</th><th class="num">Sett</th><th class="num">Lotur</th>
      </tr></thead>
      <tbody>
        ${[...rows].reverse().map((r) => {
          const tops = Object.entries(r.byEx).sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([n]) => n).join(", ");
          return `<tr>
            <td>${esc(r.label)}${tops ? `<div class="session-meta">${esc(tops)}</div>` : ""}</td>
            <td class="num">${Math.round(r.volume)}</td>
            <td class="num">${r.sets}</td>
            <td class="num">${r.sessions}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  destroyChart("period");
  const ctx = document.getElementById("chart-period");
  if (!ctx) return;
  charts.period = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{
        label: "Volume",
        data: rows.map((r) => Math.round(r.volume)),
        borderColor: CHART_COLORS.period,
        backgroundColor: "rgba(122,27,42,.10)",
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.period
      }]
    },
    options: chartDefaults()
  });
}

function renderStats() {
  const box = document.getElementById("stats-content");
  const allNames = allExerciseDefs().map((e) => e.name);
  const defs = Object.fromEntries(allExerciseDefs().map((e) => [e.name, e]));

  const pills = document.getElementById("stats-summary");
  const last = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  pills.innerHTML = `
    <span class="pill">Lotur: <strong>${state.sessions.length}</strong></span>
    <span class="pill">Síðast: <strong>${last ? formatIS(last.date) + " (" + last.dayType + ")" : "—"}</strong></span>
    <span class="pill">Eining: <strong>kg</strong></span>
  `;

  populateBestSelect();
  renderVolumeChart();
  renderBestChart();
  renderPeriodSection();

  let html = "";
  for (const name of allNames) {
    const history = [];
    for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
      const ex = (s.exercises || []).find((e) => e.name === name);
      if (ex) history.push({ date: s.date, ex, dayType: s.dayType });
    }
    if (!history.length) continue;
    const def = defs[name];
    const lastH = history[history.length - 1];
    const prevH = history.length > 1 ? history[history.length - 2] : null;
    const best = Math.max(...history.map((h) => bestWeight(h.ex)));
    const lastW = bestWeight(lastH.ex);
    const lastVol = exVolume(lastH.ex);
    const prevVol = prevH ? exVolume(prevH.ex) : null;
    let trend = "—";
    let trendCls = "trend-flat";
    if (prevVol != null) {
      if (lastVol > prevVol * 1.02) { trend = "↑ upp"; trendCls = "trend-up"; }
      else if (lastVol < prevVol * 0.98) { trend = "↓ niður"; trendCls = "trend-down"; }
      else { trend = "→ jafnt"; trendCls = "trend-flat"; }
    }
    const unit = displayUnit(def);
    html += `<div class="card stat-card">
      <h3>${esc(name)} <span class="unit-badge">${esc(unit)}</span></h3>
      <div class="stat-grid">
        <div><span>Besta þyngd</span><strong>${def.repsOnly ? "—" : best + " kg"}</strong></div>
        <div><span>Síðasta þyngd</span><strong>${def.repsOnly ? "—" : lastW + " kg"}</strong></div>
        <div><span>Síðasta volume</span><strong>${lastVol}</strong></div>
        <div><span>Þróun</span><strong class="${trendCls}">${trend}</strong></div>
      </div>
      <div class="session-meta" style="margin-top:8px">${history.length} skráningar · síðast ${formatIS(lastH.date)}</div>
    </div>`;
  }
  box.innerHTML = html || `<p class="muted">Engin gögn enn.</p>`;
}

function renderHistory() {
  const box = document.getElementById("history-list");
  const detail = document.getElementById("history-detail");
  detail.classList.add("hidden");
  box.classList.remove("hidden");

  const sorted = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    box.innerHTML = `<p class="muted">Engin saga enn. Skráðu æfingu eða hlaðu inn seed.</p>`;
    return;
  }
  box.innerHTML = sorted
    .map((s) => {
      const vol = sessionVolume(s);
      return `<button type="button" class="session-item" data-id="${esc(s.id)}">
        <div>
          <div><strong>${formatIS(s.date)}</strong></div>
          <div class="session-meta">${(s.exercises || []).length} æfingar · vol ${Math.round(vol)}</div>
        </div>
        <span class="badge ${s.dayType === "A" ? "a" : "b"}">${s.dayType}</span>
      </button>`;
    })
    .join("");

  box.querySelectorAll(".session-item").forEach((btn) => {
    btn.addEventListener("click", () => showSessionDetail(btn.dataset.id));
  });
}

function showSessionDetail(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  state.viewingId = id;
  const box = document.getElementById("history-list");
  const detail = document.getElementById("history-detail");
  box.classList.add("hidden");
  detail.classList.remove("hidden");

  let body = "";
  for (const ex of s.exercises || []) {
    const unit = displayUnit(ex);
    const setsTxt = (ex.sets || [])
      .map((st, i) => {
        const mark = st.done ? "✓" : "·";
        if (ex.repsOnly || unit === "reps") return `S${i + 1}: ${st.reps ?? "—"} reps ${mark}`;
        return `S${i + 1}: ${st.weight ?? "—"} kg × ${st.reps ?? "—"} ${mark}`;
      })
      .join(" · ");
    body += `<div class="card" style="padding:10px 12px;margin-bottom:8px">
      <strong>${esc(ex.name)}</strong> <span class="unit-badge">${esc(unit)}</span>
      <div class="detail-sets">${esc(setsTxt)}</div>
    </div>`;
  }

  detail.innerHTML = `
    <button type="button" class="btn btn-secondary" id="back-history">← Til baka</button>
    <h2 style="margin:14px 0 4px;font-size:1.1rem">${formatIS(s.date)} · ${s.dayType}-dagur</h2>
    ${body}
    <button type="button" class="btn btn-danger" id="delete-session" style="margin-top:8px">Eyða lotu</button>
  `;
  document.getElementById("back-history").onclick = () => renderHistory();
  document.getElementById("delete-session").onclick = () => {
    if (!confirm("Eyða þessari lotu?")) return;
    state.sessions = state.sessions.filter((x) => x.id !== id);
    saveSessions();
    toast("Lota eytt");
    updateScheduleHint();
    renderHistory();
  };
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ sessions: state.sessions }, null, 2)], { type: "application/json" });
  downloadBlob(blob, `snorri-aefingar-${todayISO()}.json`);
}

function exportCSV() {
  const lines = ["date,dayType,exercise,set,weight,reps,done,unit"];
  for (const s of state.sessions) {
    for (const ex of s.exercises || []) {
      const unit = normalizeUnit(ex.unit, ex.repsOnly);
      (ex.sets || []).forEach((st, i) => {
        lines.push(
          [s.date, s.dayType, csvEsc(ex.name), i + 1, st.weight ?? "", st.reps ?? "", st.done ? 1 : 0, unit]
            .join(",")
        );
      });
    }
  }
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `snorri-aefingar-${todayISO()}.csv`);
}

function csvEsc(v) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const sessions = data.sessions || data;
      if (!Array.isArray(sessions)) throw new Error("Óvænt snið");
      for (const s of sessions) {
        for (const ex of s.exercises || []) {
          ex.unit = normalizeUnit(ex.unit, ex.repsOnly);
        }
      }
      const added = mergeSessions(sessions);
      saveSessions();
      localStorage.setItem(SEED_FLAG, "1");
      toast(`Flutt inn: ${added} nýjar lotur`);
      updateScheduleHint();
      renderForm();
      if (state.tab === "tolfraedi") renderStats();
      if (state.tab === "saga") renderHistory();
    } catch (e) {
      toast("Villa við innflutning");
      console.error(e);
    }
  };
  reader.readAsText(file);
}

function sessionKey(s) {
  return s.id || `${s.date}-${s.dayType}`;
}

// Bætir við lotum sem vantar (eftir id eða dagsetningu+A/B), skrifar ekki yfir neitt.
function mergeSessions(incoming) {
  const ids = new Set(state.sessions.map(sessionKey));
  const dayKeys = new Set(state.sessions.map((s) => `${s.date}|${s.dayType}`));
  let added = 0;
  for (const s of incoming) {
    if (ids.has(sessionKey(s)) || dayKeys.has(`${s.date}|${s.dayType}`)) continue;
    state.sessions.push(s);
    ids.add(sessionKey(s));
    dayKeys.add(`${s.date}|${s.dayType}`);
    added++;
  }
  state.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return added;
}

const SEED_MERGE_FLAG = "snorri-aefingar-seed-merge-v2";

async function mergeMissingSeed() {
  if (localStorage.getItem(SEED_MERGE_FLAG)) return;
  try {
    const res = await fetch("seed-data.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.sessions || []).map((s) => {
      for (const ex of s.exercises || []) ex.unit = normalizeUnit(ex.unit, ex.repsOnly);
      return s;
    });
    const added = mergeSessions(list);
    if (added) {
      saveSessions();
      toast(`Bætti við ${added} lotum sem vantaði`);
    }
    localStorage.setItem(SEED_MERGE_FLAG, "1");
  } catch (e) {
    console.warn("Seed merge failed", e);
  }
}

async function seedIfNeeded() {
  if (localStorage.getItem(SEED_FLAG) && state.sessions.length) return mergeMissingSeed();
  if (state.sessions.length) {
    localStorage.setItem(SEED_FLAG, "1");
    return mergeMissingSeed();
  }
  try {
    const res = await fetch("seed-data.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.sessions && data.sessions.length) {
      for (const s of data.sessions) {
        for (const ex of s.exercises || []) {
          ex.unit = normalizeUnit(ex.unit, ex.repsOnly);
        }
      }
      state.sessions = data.sessions;
      saveSessions();
      localStorage.setItem(SEED_FLAG, "1");
      localStorage.setItem(SEED_MERGE_FLAG, "1");
      toast(`Seed: ${data.sessions.length} lotur`);
    }
  } catch (e) {
    console.warn("Seed failed (file://?)", e);
  }
}

function bind() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  document.querySelectorAll(".day-btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (state.formReady) writeDraftNow();
      state.dayType = b.dataset.day;
      renderForm();
    })
  );
  document.getElementById("date-input").addEventListener("change", (e) => {
    if (state.formReady) writeDraftNow();
    state.date = e.target.value;
    renderForm();
  });
  document.getElementById("btn-save").addEventListener("click", saveCurrentSession);
  document.getElementById("btn-export-json").addEventListener("click", exportJSON);
  document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
  document.getElementById("import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJSONFile(f);
    e.target.value = "";
  });
  document.getElementById("btn-use-suggested").addEventListener("click", () => {
    if (state.formReady) writeDraftNow();
    const next = suggestedNext();
    state.date = next.date;
    state.dayType = next.dayType;
    renderForm();
    toast(`Stillt á ${next.dayType} · ${next.label}`);
  });
  document.getElementById("best-ex-select").addEventListener("change", (e) => {
    state.bestExName = e.target.value;
    renderBestChart();
  });
  document.querySelectorAll(".period-btn").forEach((b) => {
    b.addEventListener("click", () => {
      state.period = b.dataset.period;
      renderPeriodSection();
    });
  });
  const flush = () => {
    if (state.formReady) writeDraftNow();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

async function init() {
  loadSessions();
  await seedIfNeeded();
  const next = suggestedNext();
  const today = todayISO();
  const td = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  if ([1, 3, 5].includes(td.getDay())) {
    state.dayType = dayTypeForDate(td);
  } else {
    state.dayType = next.dayType;
  }
  state.date = today;
  bind();
  updateScheduleHint();
  renderForm();
  setTab("skra");
}

init();
