/* Commander’s Dilemma — Prairie Grove (Blunt’s Army, deterministic)
   - “Victory/Tactical Victory” shown when most or all historic choices are taken.
   - Worst outcome capped at “Stalemate” (no “Repulse”).
   - Morale never below “Fair” (floor = 40); Cohesion never below “Together” (floor = 50).
   - Union casualties (Blunt’s command) finish between 400–600; Casualty bar scaled to 600.
   - JPG map loaded inside script via DEFAULT_MAP_SRC or URL ?map= parameter.
   - Two choices per decision; historic choices highlighted.
   - Troop geometry updated: Blunt approaches from the NORTHWEST of the Confederate ridge (lower X, lower Y)
     and strikes the Confederate LEFT; no orchard references in Blunt’s narrative. */

const DEFAULT_MAP_SRC = "./assets/prairie-grove-historic-base.jpg";

/* --- State (same condition settings approved for Herron) --- */
const state = {
  time: 6,      // tempo baseline
  supply: 75,   // High
  morale: 50,   // Fair
  cohesion: 60, // Together
  casualties: 0,
  step: 1,
  path: [],
  phases: [],
  historicCount: 0
};
const STEP_MAX = 7;

/* --- DOM refs --- */
const dilemmaCard  = document.getElementById("dilemmaCard");
const sceneTitle   = document.getElementById("sceneTitle");
const sceneBody    = document.getElementById("sceneBody");
const choiceList   = document.getElementById("choiceList");
const confirmBtn   = document.getElementById("confirmBtn");
const resetBtn     = document.getElementById("resetBtn");
const shareBtn     = document.getElementById("shareBtn");

const timeBar      = document.getElementById("timeBar");
const supplyBar    = document.getElementById("supplyBar");
const moraleBar    = document.getElementById("moraleBar");
const casualtyBar  = document.getElementById("casualtyBar");
const cohesionBar  = document.getElementById("cohesionBar");

const timeVal      = document.getElementById("timeVal");
const supplyVal    = document.getElementById("supplyVal");
const moraleVal    = document.getElementById("moraleVal");
const casualtyVal  = document.getElementById("casualtyVal");
const cohesionVal  = document.getElementById("cohesionVal");

const stepVal      = document.getElementById("stepVal");
const stepMaxEl    = document.getElementById("stepMax");
const phaseTag     = document.getElementById("phaseTag");
const routeTag     = document.getElementById("routeTag");

const outcomeBox     = document.getElementById("outcomeBox");
const outcomeTitle   = document.getElementById("outcomeTitle");
const outcomeSummary = document.getElementById("outcomeSummary");
const finalMorale    = document.getElementById("finalMorale");
const finalMoraleNum = document.getElementById("finalMoraleNum");
const finalSupply    = document.getElementById("finalSupply");
const finalCohesion  = document.getElementById("finalCohesion");
const finalCohesionNum = document.getElementById("finalCohesionNum");
const finalTime      = document.getElementById("finalTime");
const finalCasualties= document.getElementById("finalCasualties");
const finalPhases    = document.getElementById("finalPhases");
const finalPath      = document.getElementById("finalPath");
const historicCount  = document.getElementById("historicCount");

/* Map elements */
const mapBase        = document.getElementById("mapBase");
const unionLinesGroup= document.getElementById("unionLines");
const confLinesGroup = document.getElementById("confLines");

stepMaxEl.textContent = String(STEP_MAX);

/* --- Helpers (labels during play; numbers only in Outcome) --- */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function labelTime(val) {
  const pct = (clamp(val,0,12)/12)*100;
  if (pct >= 80) return "Very High";
  if (pct >= 60) return "High";
  if (pct >= 40) return "Moderate";
  if (pct >= 20) return "Low";
  return "Very Low";
}
function labelSupply(val) {
  const pct = clamp(val,0,100);
  if (pct >= 80) return "Very High";
  if (pct >= 60) return "High";
  if (pct >= 40) return "Moderate";
  if (pct >= 20) return "Low";
  return "Very Low";
}
function labelCasualties(val) {
  const pct = (clamp(val,0,600)/600)*100;
  if (pct < 20) return "Very Low";
  if (pct < 40) return "Low";
  if (pct < 60) return "Moderate";
  if (pct < 80) return "High";
  return "Very High";
}

/* Floors: Morale ≥ 40 (Fair), Cohesion ≥ 50 (Together) */
function effectiveMorale() {
  const base = clamp(state.morale, 40, 100);
  const casualtyPenalty = Math.floor(state.casualties / 80);
  const supplyPenalty   = Math.max(0, Math.floor((50 - state.supply) / 8));
  return clamp(base - casualtyPenalty - supplyPenalty, 40, 100);
}
function labelMorale() {
  const m = effectiveMorale();
  if (m >= 80) return "Excellent";
  if (m >= 60) return "Good";
  return "Fair";
}
function effectiveCohesion() {
  const base = clamp(state.cohesion, 50, 100);
  const casualtyPenalty = Math.floor(state.casualties / 60);
  const supplyPenalty   = Math.max(0, Math.floor((40 - state.supply) / 6));
  return clamp(base - casualtyPenalty - supplyPenalty, 50, 100);
}
function labelCohesion() {
  const c = effectiveCohesion();
  if (c >= 75) return "Brothers-in-Arms";
  return "Together";
}

/* During play: bars + labels only */
function updateBars() {
  supplyBar.style.width   = `${clamp(state.supply,0,100)}%`;
  moraleBar.style.width   = `${effectiveMorale()}%`;
  timeBar.style.width     = `${(clamp(state.time,0,12)/12)*100}%`;
  cohesionBar.style.width = `${effectiveCohesion()}%`;
  casualtyBar.style.width = `${(clamp(state.casualties,0,600)/600)*100}%`;

  supplyVal.textContent   = labelSupply(state.supply);
  moraleVal.textContent   = labelMorale();
  timeVal.textContent     = labelTime(state.time);
  cohesionVal.textContent = labelCohesion();
  casualtyVal.textContent = labelCasualties(state.casualties);

  stepVal.textContent     = `${state.step}`;
}
function setPhase(label) {
  phaseTag.textContent = `Phase: ${label}`;
  state.phases.push(label);
}

/* --- Historic choice mapping (Blunt’s likely course) --- */
const HISTORIC_CHOICES = {
  "1": "1A",  // steady approach NW
  "2": "2A",  // broad deployment
  "3": "3A",  // controlled probe
  "4": "4B",  // decisive push
  "5": "5A",  // attack left promptly
  "6": "6A",  // husband ammo late
  "7": "7B"   // hold positions overnight
};

/* --- Decisions (two choices per phase) — same mechanics --- */
const NODES = {
  "1": {
    id: "1",
    title: "Early Afternoon • Approach from the Northwest",
    body: "Form up on the northwest approaches opposite the Confederate ridge.",
    phase: "Early Afternoon • NW Approach & Alignment",
    choices: [
      { id: "1A", label: "Steady approach; align brigades",
        desc: "Cohesion steadies; tempo preserved.",
        effects: s => { s.time -= 0; s.cohesion += 3; s.morale += 1; s.supply -= 2; s.casualties += 40; } },
      { id: "1B", label: "Push hard to contact",
        desc: "Faster contact; cohesion risk.",
        effects: s => { s.time -= 1; s.cohesion -= 3; s.morale += 1; s.supply -= 4; s.casualties += 60; } }
    ],
    next: "2"
  },
  "2": {
    id: "2",
    title: "Deploy Artillery on the NW Front",
    body: "Emplace guns facing the ridge; choose deployment pattern.",
    phase: "Artillery Deployment • NW Front",
    choices: [
      { id: "2A", label: "Broad deployment along the front",
        desc: "Coverage improves; massed fire limited.",
        effects: s => { s.morale += 2; s.time -= 1; s.casualties += 60; s.supply -= 6; } },
      { id: "2B", label: "Concentrate for counterbattery",
        desc: "Heavier fire; higher per-unit exposure.",
        effects: s => { s.morale += 3; s.time -= 1; s.casualties += 80; s.supply -= 8; } }
    ],
    next: "3"
  },
  "3": {
    id: "3",
    title: "Probe the Ridge from the NW",
    body: "Advance skirmishers and test the Confederate crest.",
    phase: "Skirmish & Probe • NW Sector",
    choices: [
      { id: "3A", label: "Commit a controlled probe",
        desc: "Contact maintained; losses moderate.",
        effects: s => { s.cohesion += 4; s.time -= 1; s.casualties += 70; s.morale += 2; s.supply -= 5; } },
      { id: "3B", label: "Hold skirmish line; conserve ammunition",
        desc: "Lower immediate losses; cohesion drifts.",
        effects: s => { s.casualties += 90; s.cohesion -= 3; s.morale += 1; s.supply -= 3; } }
    ],
    next: "4"
  },
  "4": {
    id: "4",
    title: "Decisive Push on the Confederate Left",
    body: "Press the attack against the enemy’s left; counterfire is heavy.",
    phase: "Renewed Push & Counterfire • Enemy Left",
    choices: [
      { id: "4A", label: "Stabilize line; limited counter",
        desc: "Cohesion steadies; fewer losses.",
        effects: s => { s.cohesion += 4; s.casualties += 70; s.morale += 2; s.time -= 0; s.supply -= 5; } },
      { id: "4B", label: "Drive harder to exploit openings",
        desc: "Greater shock; higher casualties; tempo cost.",
        effects: s => { s.cohesion -= 2; s.casualties += 100; s.morale += 3; s.time -= 1; s.supply -= 8; } }
    ],
    next: "5"
  },
  "5": {
    id: "5",
    title: "~15:00–16:00 • Strike the Left & Coordinate with Center",
    body: "Attack the Confederate left from the northwest; coordinate with Herron in the center.",
    phase: "~15:00–16:00 • NW Attack & Coordination",
    choices: [
      { id: "5A", label: "Attack promptly; hold NW arc",
        desc: "Check enemy left; center thins slightly.",
        effects: s => { s.cohesion += 2; s.casualties += 60; s.morale += 1; s.time -= 0; s.supply -= 7; } },
      { id: "5B", label: "Hold center; prepare then push",
        desc: "Center steady; losses rise on the flank.",
        effects: s => { s.cohesion += 1; s.casualties += 90; s.morale += 0; s.time -= 0; s.supply -= 5; } }
    ],
    next: "6"
  },
  "6": {
    id: "6",
    title: "Late Afternoon • Ammunition Running Low",
    body: "Decide whether to husband ammunition or press locally near sunset.",
    phase: "Late Afternoon • Ammunition Low",
    choices: [
      { id: "6A", label: "Husband ammunition; shorten line",
        desc: "Lower immediate losses; cohesion improves; tempo slows.",
        effects: s => { s.casualties += 50; s.cohesion += 4; s.time -= 1; s.morale += 1; s.supply -= 10; } },
      { id: "6B", label: "Press with bayonet locally",
        desc: "Higher losses; morale uptick; cohesion variable.",
        effects: s => { s.casualties += 80; s.morale += 3; s.cohesion -= 1; s.time -= 0; s.supply -= 12; } }
    ],
    next: "7"
  },
  "7": {
    id: "7",
    title: "After Dusk • Hold the Field",
    body: "Night settles. Hold positions or adjust for overnight risk.",
    phase: "After Dusk • Night Positions",
    choices: [
      { id: "7A", label: "Consolidate & step back to stronger posts",
        desc: "Concedes ground; preserves force.",
        effects: s => { s.time -= 0; s.morale -= 1; s.cohesion += 2; s.casualties += 40; s.supply -= 5; } },
      { id: "7B", label: "Hold positions overnight",
        desc: "Maintain field; supply remains critical.",
        effects: s => { s.time -= 0; s.morale += 1; s.supply -= 8; s.casualties += 60; } }
    ],
    next: "END"
  }
};

/* --- Outcome (Victory/Tactical Victory for historic path; floor = Stalemate) --- */
function labelSupplyScore(val){ return clamp(val,0,100); }
function computeOutcome(s) {
  const tempo = Math.max(0, s.time) * 2;
  const score = effectiveMorale() + labelSupplyScore(s.supply) + effectiveCohesion() + tempo
              - Math.min(s.casualties / 6, 100); // scaled to 600

  if (s.historicCount >= 6) {
    return { score, title: "Victory", summary: "Your historic course seized the initiative; the enemy left the field." };
  }
  if (s.historicCount >= 5) {
    return { score, title: "Tactical Victory", summary: "Coordinated attacks achieved tactical success as the enemy yielded ground." };
  }
  if (score >= 140) {
    return { score, title: "Tactical Victory", summary: "You pressed with coordination and held the field at a cost." };
  } else if (score >= 110) {
    return { score, title: "Marginal Success", summary: "Progress with trade-offs; steady positions preserved the line." };
  } else {
    return { score, title: "Stalemate", summary: "Positions held; losses and fatigue prevented a clearer result." };
  }
}
function showOutcome() {
  updateBars();
  confirmBtn.disabled = true;

  const result = computeOutcome(state);
  outcomeTitle.textContent   = result.title;
  outcomeSummary.textContent = result.summary;

  finalMorale.textContent     = labelMorale();
  finalMoraleNum.textContent  = `${effectiveMorale()}`;
  finalSupply.textContent     = `${state.supply}`;
  finalCohesion.textContent   = labelCohesion();
  finalCohesionNum.textContent= `${effectiveCohesion()}`;
  finalTime.textContent       = `${Math.max(0, state.time)}`;
  finalCasualties.textContent = `${state.casualties}`;
  historicCount.textContent   = `${state.historicCount}`;
  finalPhases.textContent     = state.phases.join(" → ");
  finalPath.textContent       = state.path.join(" → ");

  outcomeBox.classList.remove("hidden");
}

/* --- Troop lines (SVG overlay on JPG base map) ---
   Normalized 0–100 coordinates; NW = lower X and lower Y than ridge anchors.
   Ridge arc remains ~x:20–78, y:57–62; Blunt NW lines stay ~x:18–36, y:46–54 across phases. */
const TROOP_LINES = {
  "1": { // Blunt forming NW; Confederate ridge arc
    union: [ [[18,48],[26,50]] ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "2": { // artillery deployment NW
    union: [ [[20,49],[28,51]] ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "3": { // NW probe
    union: [ [[22,50],[30,52]] ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "4": { // push on Confederate left (still NW sector)
    union: [ [[24,51],[34,53]] ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "5": { // strike left; Herron supportive line in center (no orchard label here)
    union: [
      [[26,52],[36,54]],              // Blunt NW arc advancing
      [[55,60],[62,59],[70,58]]       // Herron center/right line (reference only)
    ],
    conf:  [ [[20,60],[34,58],[48,57],[62,58],[78,62]] ]
  },
  "6": { // shorten NW line near dusk
    union: [
      [[24,52],[32,53]],              // Blunt holds NW flank
      [[56,62],[63,61],[69,60]]       // Herron line
    ],
    conf:  [ [[24,61],[46,59],[68,61]] ]
  },
  "7": { // overnight positions
    union: [
      [[24,52],[32,53]],              // Blunt NW flank
      [[55,60],[62,59],[70,58]]       // Herron center/right
    ],
    conf:  [ [[16,78],[12,88]] ]      // Confederate withdrawal axis
  }
};

/* Choice-based nudges (visual variation only) */
function adjustForChoice(phaseId, choiceId) {
  const lines = JSON.parse(JSON.stringify(TROOP_LINES[phaseId]));
  if (!choiceId) return lines;

  if (phaseId === "5") {
    if (choiceId === "5A") { // attack promptly
      lines.union[0] = [[25,51],[35,53]];
      lines.union[1] = [[56,60],[64,59],[72,58]];
    } else if (choiceId === "5B") { // hold then push
      lines.union[0] = [[27,53],[37,55]];
    }
  }
  if (phaseId === "6") {
    if (choiceId === "6A") { // shorten further
      lines.union[0] = [[23,52],[31,53]];
      lines.union[1] = [[56,62],[63,61],[69,60]];
    } else if (choiceId === "6B") { // press locally
      lines.union[0] = [[25,52],[35,54]];
      lines.union[1] = [[57,61],[65,60],[73,59]];
    }
  }
  return lines;
}

/* SVG drawing */
function drawTroopLines(phaseId, choiceId = null) {
  const { union, conf } = adjustForChoice(phaseId, choiceId);
  unionLinesGroup.replaceChildren();
  confLinesGroup.replaceChildren();

  union.forEach(points => {
    const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
    pl.setAttribute("points", points.map(p => `${p[0]},${p[1]}`).join(" "));
    unionLinesGroup.appendChild(pl);
  });
  conf.forEach(points => {
    const pl = document.createElementNS("http://www.w3.org/2000/svg","polyline");
    pl.setAttribute("points", points.map(p => `${p[0]},${p[1]}`).join(" "));
    confLinesGroup.appendChild(pl);
  });
}

/* --- Rendering & flow --- */
function focusSceneTitle() { sceneTitle.setAttribute("tabindex","-1"); sceneTitle.focus(); }
function renderNode(nodeId) {
  const node = NODES[nodeId];
  if (!node) return;

  outcomeBox.classList.add("hidden");
  confirmBtn.disabled = false;

  sceneTitle.innerHTML = node.title;
  sceneBody.innerHTML  = node.body;
  setPhase(node.phase);

  // Build two choices with Historic badge
  choiceList.replaceChildren();
  node.choices.forEach(ch => {
    const isDefault = HISTORIC_CHOICES[nodeId] === ch.id;
    const wrap = document.createElement("div");
    wrap.className = isDefault ? "choice selected" : "choice";
    wrap.dataset.choiceId = ch.id;

    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "choice"; radio.id = ch.id; radio.value = ch.id;
    radio.setAttribute("aria-label", ch.label);
    if (isDefault) radio.checked = true;

    const title = document.createElement("h4");
    title.textContent = ch.label;

    if (HISTORIC_CHOICES[nodeId] === ch.id) {
      const badge = document.createElement("span");
      badge.className = "badge historic";
      badge.textContent = "Historic Choice";
      title.appendChild(badge);
    }

    const desc = document.createElement("p"); desc.textContent = ch.desc;

    wrap.addEventListener("click", () => {
      radio.checked = true;
      choiceList.querySelectorAll(".choice").forEach(c => c.classList.remove("selected"));
      wrap.classList.add("selected");
    });

    wrap.appendChild(radio);
    wrap.appendChild(title);
    wrap.appendChild(desc);
    choiceList.appendChild(wrap);
  });

  drawTroopLines(nodeId);

  updateBars();
  focusSceneTitle();
  routeTag.classList.add("hidden");
}
function getCheckedChoiceId() {
  const checked = choiceList.querySelector('input[type="radio"]:checked');
  return checked?.value || null;
}
function applyChoice(choiceId) {
  const nodeId = currentNodeId();
  const node   = NODES[nodeId];
  const choice = node.choices.find(c => c.id === choiceId);
  if (!choice) return;

  choice.effects(state);

  // Clamp & floors
  state.supply     = clamp(state.supply, 0, 100);
  state.morale     = clamp(state.morale, 40, 100);
  state.cohesion   = clamp(state.cohesion, 50, 100);
  state.casualties = clamp(state.casualties, 0, 600);
  state.time       = clamp(state.time, 0, 12);

  const isHistoric = HISTORIC_CHOICES[nodeId] === choiceId;
  if (isHistoric) {
    state.historicCount++;
    routeTag.textContent = "Historic Route";
    routeTag.classList.remove("alt","hidden"); routeTag.classList.add("historic");
  } else {
    routeTag.textContent = "Alternate Route";
    routeTag.classList.remove("historic","hidden"); routeTag.classList.add("alt");
  }

  drawTroopLines(nodeId, choiceId);

  state.path.push(choiceId);
  const nextId = node.next;
  if (nextId === "END") {
    updateBars();
    showOutcome();
  } else {
    state.step++;
    setCurrentNode(nextId);
    renderNode(nextId);
  }
}

/* --- Navigation & sharing --- */
let _currentNode = "1";
function currentNodeId() { return _currentNode; }
function setCurrentNode(id) { _currentNode = id; }

function confirmSelection() {
  const choiceId = getCheckedChoiceId();
  if (!choiceId) return;
  applyChoice(choiceId);
}
function resetScenario() {
  Object.assign(state, {
    time: 6, supply: 75, morale: 50, cohesion: 60,
    casualties: 0, step: 1, path: [], phases: [], historicCount: 0
  });
  setCurrentNode("1");
  outcomeBox.classList.add("hidden");
  renderNode("1");
  history.replaceState(null, "", location.pathname);
}
function copyShareLink() {
  const params = new URLSearchParams();
  if (state.path.length) params.set("path", state.path.join(","));
  if (state.phases.length) params.set("ph", state.phases.map(p => p.replace(/\s+/g, "_")).join(","));
  params.set("hc", String(state.historicCount));
  const url = `${location.origin}${location.pathname}?${params.toString()}`;
  navigator.clipboard?.writeText(url).then(() => toast("Share link copied to clipboard."))
    .catch(() => toast("Unable to copy. You can share the URL in your address bar."));
}
function toast(msg) {
  const box = document.createElement("div");
  box.className = "result-message";
  box.style.position = "fixed"; box.style.bottom = "16px"; box.style.left = "16px"; box.style.right = "16px";
  box.style.zIndex = "1000"; box.style.background = "#fff"; box.style.border = "1px solid var(--border-color)";
  box.style.borderRadius = "10px"; box.style.padding = "10px 12px";
  box.textContent = msg;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}

/* --- Touch & keyboard UX --- */
function pressHandlerDown(e) {
  const btn = e.target.closest('button.primary-btn, button.secondary-btn, a.text-btn');
  if (btn) btn.classList.add('is-pressed');
}
function pressHandlerUp() { document.querySelectorAll('.is-pressed').forEach(b => b.classList.remove('is-pressed')); }
document.addEventListener('pointerdown', pressHandlerDown);
document.addEventListener('pointerup', pressHandlerUp);
document.addEventListener('pointercancel', pressHandlerUp);
window.addEventListener('blur', pressHandlerUp);

function selectChoiceByOffset(offset) {
  const radios = Array.from(choiceList.querySelectorAll('input[type="radio"]'));
  if (!radios.length) return;
  const currentIdx = radios.findIndex(r => r.checked);
  const idx = currentIdx >= 0 ? currentIdx : 0;
  const nextIdx = Math.max(0, Math.min(radios.length - 1, idx + offset));
  radios[nextIdx].checked = true;
  radios[nextIdx].focus();
  choiceList.querySelectorAll(".choice").forEach(c => c.classList.remove("selected"));
  radios[nextIdx].closest(".choice")?.classList.add("selected");
}
function handleKeydown(e) {
  if (!document.activeElement || !dilemmaCard.contains(document.activeElement)) return;
  // Let native activation handle Enter and Space on buttons and links.
  if (e.target.closest("button, a")) return;
  const key = e.key.toLowerCase();
  if (key === "arrowdown") { e.preventDefault(); selectChoiceByOffset(+1); }
  else if (key === "arrowup") { e.preventDefault(); selectChoiceByOffset(-1); }
  else if (key === "enter" || key === " ") { e.preventDefault(); confirmSelection(); }
  else if (key === "escape") { choiceList.querySelector('input[type="radio"]')?.focus(); }
}
document.addEventListener("keydown", handleKeydown);

/* --- Map loader (JPG) --- */
function loadMapImage() {
  const p = new URLSearchParams(location.search);
  const MAP_SRC = p.get("map") ? `./assets/${p.get("map")}` : DEFAULT_MAP_SRC;
  mapBase.src = MAP_SRC;
  mapBase.addEventListener("error", () => {
    toast("Map JPG not found. Place your file in ./assets/ and set DEFAULT_MAP_SRC or use ?map=filename.jpg");
  });
}

/* --- Init & deep-link hydration --- */
confirmBtn.addEventListener("click", confirmSelection);
resetBtn.addEventListener("click", resetScenario);
shareBtn.addEventListener("click", copyShareLink);

function init() {
  loadMapImage();
  renderNode("1");
  hydrateFromURL();
}
document.addEventListener("DOMContentLoaded", init);

function hydrateFromURL() {
  const p = new URLSearchParams(location.search);
  const path = p.get("path")?.split(",").filter(Boolean) || [];
  if (path.length) {
    resetScenario();
    for (const choiceId of path) {
      const nodeId = currentNodeId();
      const node = NODES[nodeId];
      const choice = node?.choices.find(c => c.id === choiceId);
      if (!choice) break;
      applyChoice(choiceId);
    }
  }
}

