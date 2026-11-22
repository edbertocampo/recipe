import { formatIngredient, formatMinutes, formatClock } from "./units.js";

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

// ---------- storage ----------
const STORE_KEY = "savr.recipes.v1";
const CODE_KEY = "savr.accessCode";

function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast("Couldn't save – storage is full or blocked.");
  }
}
const loadRecipes = () => safeGet(STORE_KEY, []);
const saveRecipes = (list) => safeSet(STORE_KEY, list);
const getRecipe = (id) => loadRecipes().find((r) => r.id === id);
function updateRecipe(id, patch) {
  const list = loadRecipes();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  saveRecipes(list);
  return list[i];
}

// ---------- utils ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

const TIKTOK_RE = /https?:\/\/(?:[\w-]+\.)*tiktok\.com\/[^\s"'<>]+/i;
const findTikTok = (t) => (String(t || "").match(TIKTOK_RE) || [null])[0];

// ---------- routing ----------
function route() {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/recipe\/([\w-]+)(\/cook)?/);
  $("#backBtn").hidden = !m;
  stopWakeLock();
  if (m) {
    const r = getRecipe(m[1]);
    if (!r) return (location.hash = "#/");
    return m[2] ? renderCook(r) : renderRecipe(r);
  }
  renderHome();
}
window.addEventListener("hashchange", route);
$("#backBtn").addEventListener("click", () => {
  if (/\/cook$/.test(location.hash)) location.hash = location.hash.replace(/\/cook$/, "");
  else location.hash = "#/";
});

// ---------- home ----------
let pending = null; // { url, text } while extracting

function renderHome(prefill = {}) {
  const recipes = loadRecipes();
  app.innerHTML = `
    <section class="hero card">
      <h1>Never lose a TikTok recipe again</h1>
      <p class="muted">Share a cooking video to Savr, or paste the link here.</p>
      <form id="extractForm" class="extract-form">
        <div class="input-row">
          <input id="urlInput" type="url" inputmode="url" autocomplete="off"
            placeholder="https://www.tiktok.com/@…/video/…" value="${esc(prefill.url || "")}" aria-label="TikTok link" />
          <button type="button" class="btn ghost" id="pasteBtn" title="Paste from clipboard">Paste</button>
        </div>
        <details id="textDetails" ${prefill.text || prefill.openText ? "open" : ""}>
          <summary>Recipe in the comments or a screenshot? Add the text</summary>
          <textarea id="textInput" rows="5" placeholder="Paste the caption, a comment with the recipe, or text from your screenshot…">${esc(prefill.text || "")}</textarea>
        </details>
        <button class="btn primary big" id="goBtn" type="submit">Get recipe</button>
        <p id="formError" class="error" hidden></p>
      </form>
    </section>

    <section class="library">
      <div class="library-head">
        <h2>My recipes <span class="count">${recipes.length || ""}</span></h2>
        ${recipes.length > 3 ? `<input id="search" type="search" placeholder="Search" aria-label="Search recipes" />` : ""}
      </div>
      <div id="libraryList" class="grid">${libraryCards(recipes)}</div>
    </section>`;

  const form = $("#extractForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    startExtract($("#urlInput").value.trim(), $("#textInput").value.trim());
  });
  $("#pasteBtn").addEventListener("click", async () => {
    try {
      const t = await navigator.clipboard.readText();
      const url = findTikTok(t);
      if (url) $("#urlInput").value = url;
      else if (t) {
        $("#textDetails").open = true;
        $("#textInput").value = t;
      }
    } catch {
      toast("Long-press the box and choose Paste.");
    }
  });
  $("#search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = loadRecipes().filter((r) =>
      [r.recipe.title, r.recipe.cuisine, r.video?.author, ...(r.recipe.tags || []), ...r.recipe.ingredients.map((i) => i.name)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
    $("#libraryList").innerHTML = libraryCards(filtered, q);
  });
  if (prefill.error) showFormError(prefill.error);
  if (pending) showLoading();
}

function libraryCards(recipes, query) {
  if (!recipes.length) {
    return query
      ? `<p class="muted">No recipes match “${esc(query)}”.</p>`
      : `<div class="empty card"><p>🍳 Your saved recipes will show up here, even offline.</p>
         <p class="muted small">Tip: install Savr, then use TikTok's <b>Share → Savr</b> (Android) or copy the link and tap Paste.</p></div>`;
  }
  return recipes
    .map((r) => {
      const t = r.recipe.total_minutes || (r.recipe.prep_minutes || 0) + (r.recipe.cook_minutes || 0);
      return `<a class="recipe-card card" href="#/recipe/${r.id}">
        <div class="thumb">${r.video?.thumbnail ? `<img src="${esc(r.video.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}<span>🍽️</span></div>
        <div class="body">
          <h3>${esc(r.recipe.title)}</h3>
          <p class="muted small">${[formatMinutes(t), `${r.recipe.servings} servings`, r.video?.author ? "@" + esc(r.video.author) : ""].filter(Boolean).join(" · ")}</p>
        </div>
      </a>`;
    })
    .join("");
}

function showFormError(msg) {
  const el = $("#formError");
  if (!el) return toast(msg);
  el.textContent = msg;
  el.hidden = false;
}

function showLoading() {
  const btn = $("#goBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Reading the video…`;
  const msgs = ["Reading the video…", "Finding ingredients…", "Converting to grams…", "Writing the steps…"];
  let i = 0;
  clearInterval(showLoading.t);
  showLoading.t = setInterval(() => {
    if (!pending || !document.body.contains(btn)) return clearInterval(showLoading.t);
    i = (i + 1) % msgs.length;
    btn.innerHTML = `<span class="spinner"></span> ${msgs[i]}`;
  }, 3500);
}

async function startExtract(url, text) {
  if (pending) return;
  const found = findTikTok(url) || findTikTok(text);
  if (!found && !text) return showFormError("Paste a TikTok link first.");
  pending = { url: found || url, text };
  showLoading();
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json", "x-access-code": safeGet(CODE_KEY, "") },
      body: JSON.stringify({ url: pending.url, text }),
    });
    const data = await res.json().catch(() => ({}));
    pending = null;
    if (res.status === 401 && data.needsCode) {
      const code = prompt("This app needs an access code. Ask the person who set it up:");
      if (code) {
        safeSet(CODE_KEY, code.trim());
        return startExtract(url, text);
      }
      return renderHome({ url, text, error: "Access code required." });
    }
    if (!res.ok) {
      return renderHome({ url, text, openText: data.needsText, error: data.error || "Something went wrong." });
    }
    const existing = loadRecipes().find((r) => r.video?.url && r.video.url === data.video.url);
    const entry = {
      id: existing?.id || crypto.randomUUID().slice(0, 8),
      savedAt: Date.now(),
      video: data.video,
      recipe: data.recipe,
      servings: data.recipe.servings,
      unitMode: "original",
      checked: {},
      done: {},
      notes: existing?.notes || "",
    };
    saveRecipes([entry, ...loadRecipes().filter((r) => r.id !== entry.id)]);
    location.hash = `#/recipe/${entry.id}`;
  } catch {
    pending = null;
    renderHome({ url, text, error: navigator.onLine ? "Couldn't reach the server. Try again." : "You're offline. Connect to get new recipes – saved ones still work." });
  }
}

// ---------- recipe view ----------
const QUALITY = {
  from_video: ["From the video", "ok"],
  partially_estimated: ["Some amounts estimated", "warn"],
  estimated: ["Estimated recipe", "warn"],
};

function renderRecipe(entry, { keepScroll = false } = {}) {
  const r = entry.recipe;
  const factor = entry.servings / r.servings;
  const quality = QUALITY[r.source_quality] || QUALITY.estimated;
  const n = r.nutrition_per_serving || {};
  const times = [
    ["Prep", r.prep_minutes],
    ["Cook", r.cook_minutes],
    ["Total", r.total_minutes || (r.prep_minutes || 0) + (r.cook_minutes || 0)],
  ].filter(([, v]) => v);

  // group ingredients by section, keeping their index for check state
  const sections = [];
  r.ingredients.forEach((ing, idx) => {
    const name = ing.section || "";
    let s = sections.find((x) => x.name === name);
    if (!s) sections.push((s = { name, items: [] }));
    s.items.push({ ing, idx });
  });

  app.innerHTML = `
    <article class="recipe">
      <div class="recipe-hero">
        ${entry.video?.thumbnail ? `<img src="${esc(entry.video.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}
        <div class="hero-text">
          <h1>${esc(r.title)}</h1>
          ${entry.video?.author ? `<a class="author" href="${esc(entry.video.url)}" target="_blank" rel="noopener">@${esc(entry.video.author)} · Watch on TikTok ↗</a>` : entry.video?.url ? `<a class="author" href="${esc(entry.video.url)}" target="_blank" rel="noopener">Watch on TikTok ↗</a>` : ""}
        </div>
      </div>

      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ""}

      <div class="chips">
        ${times.map(([l, v]) => `<span class="chip"><b>${l}</b> ${formatMinutes(v)}</span>`).join("")}
        <span class="chip cap">${esc(r.difficulty)}</span>
        ${r.cuisine ? `<span class="chip">${esc(r.cuisine)}</span>` : ""}
        <span class="chip ${quality[1]}" title="${esc(r.source_note)}">${quality[0]}</span>
      </div>
      ${r.source_quality !== "from_video" && r.source_note ? `<p class="note small">ℹ️ ${esc(r.source_note)}</p>` : ""}

      <div class="actions">
        <a class="btn primary" href="#/recipe/${entry.id}/cook">👩‍🍳 Start cooking</a>
        <button class="btn ghost" id="shareList">🛒 Shopping list</button>
      </div>

      <section class="card">
        <div class="section-head">
          <h2>Ingredients</h2>
          <div class="seg" role="group" aria-label="Units">
            <button data-unit="original" class="${entry.unitMode !== "metric" ? "on" : ""}">Cups/spoons</button>
            <button data-unit="metric" class="${entry.unitMode === "metric" ? "on" : ""}">Grams</button>
          </div>
        </div>
        <div class="servings">
          <span>Servings</span>
          <div class="stepper">
            <button id="servMinus" aria-label="Fewer servings">−</button>
            <output id="servVal">${entry.servings}</output>
            <button id="servPlus" aria-label="More servings">+</button>
          </div>
          ${entry.servings !== r.servings ? `<button class="link small" id="servReset">reset to ${r.servings}</button>` : ""}
        </div>
        ${sections
          .map(
            (s) => `
          ${s.name ? `<h3 class="sub">${esc(s.name)}</h3>` : ""}
          <ul class="ingredients">
            ${s.items
              .map(({ ing, idx }) => {
                const f = formatIngredient(ing, factor, entry.unitMode);
                return `<li class="${entry.checked[idx] ? "checked" : ""}">
                  <label>
                    <input type="checkbox" data-ing="${idx}" ${entry.checked[idx] ? "checked" : ""} />
                    <span class="amt">${esc(f.amount)}</span>
                    <span class="name">${esc(f.name)}${ing.notes ? `<span class="muted">, ${esc(ing.notes)}</span>` : ""}${ing.optional ? ` <em class="muted">(optional)</em>` : ""}${ing.estimated ? ` <span class="est" title="Amount estimated – not stated in the video">≈</span>` : ""}
                      ${f.secondary ? `<span class="secondary">${esc(f.secondary)}</span>` : ""}</span>
                  </label>
                </li>`;
              })
              .join("")}
          </ul>`
          )
          .join("")}
        ${r.ingredients.some((i) => i.estimated) ? `<p class="muted small">≈ amount estimated (not said in the video)</p>` : ""}
      </section>

      ${r.equipment?.length ? `<section class="card"><h2>Equipment</h2><p>${r.equipment.map(esc).join(" · ")}</p></section>` : ""}

      <section class="card">
        <h2>Steps</h2>
        <ol class="steps">
          ${r.steps
            .map(
              (s, i) => `<li class="${entry.done[i] ? "done" : ""}" data-step="${i}">
              <p>${esc(s.text)}</p>
              <div class="step-meta">
                ${s.temperature ? `<span class="chip small">🔥 ${esc(s.temperature)}</span>` : ""}
                ${s.timer_minutes ? `<button class="chip small timer-btn" data-timer="${i}">⏱ ${formatMinutes(s.timer_minutes)}</button>` : ""}
              </div>
            </li>`
            )
            .join("")}
        </ol>
        <p class="muted small">Tap a step to mark it done.</p>
      </section>

      ${r.tips?.length ? `<section class="card"><h2>Tips</h2><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""}

      ${n.calories ? `<section class="card"><h2>Per serving <span class="muted small">(estimate)</span></h2>
        <div class="nutrition">
          <div><b>${Math.round(n.calories)}</b><span>kcal</span></div>
          ${n.protein_g != null ? `<div><b>${Math.round(n.protein_g)} g</b><span>protein</span></div>` : ""}
          ${n.carbs_g != null ? `<div><b>${Math.round(n.carbs_g)} g</b><span>carbs</span></div>` : ""}
          ${n.fat_g != null ? `<div><b>${Math.round(n.fat_g)} g</b><span>fat</span></div>` : ""}
        </div></section>` : ""}

      <section class="card">
        <h2>My notes</h2>
        <textarea id="notes" rows="3" placeholder="e.g. used less sugar, double the garlic next time">${esc(entry.notes)}</textarea>
      </section>

      <div class="actions end">
        <button class="btn ghost" id="redoBtn">↻ Re-extract</button>
        <button class="btn danger" id="deleteBtn">Delete</button>
      </div>
    </article>`;

  const rerender = (patch) => renderRecipe(updateRecipe(entry.id, patch), { keepScroll: true });

  $("#servMinus").onclick = () => entry.servings > 1 && rerender({ servings: entry.servings - 1 });
  $("#servPlus").onclick = () => entry.servings < 99 && rerender({ servings: entry.servings + 1 });
  $("#servReset")?.addEventListener("click", () => rerender({ servings: r.servings }));
  app.querySelectorAll("[data-unit]").forEach((b) => (b.onclick = () => rerender({ unitMode: b.dataset.unit })));

  app.querySelectorAll("[data-ing]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const checked = { ...getRecipe(entry.id).checked, [cb.dataset.ing]: cb.checked };
      updateRecipe(entry.id, { checked });
      cb.closest("li").classList.toggle("checked", cb.checked);
    })
  );
  app.querySelectorAll(".steps li").forEach((li) =>
    li.addEventListener("click", (e) => {
      if (e.target.closest(".timer-btn")) return;
      const i = li.dataset.step;
      const done = { ...getRecipe(entry.id).done, [i]: !li.classList.contains("done") };
      updateRecipe(entry.id, { done });
      li.classList.toggle("done");
    })
  );
  app.querySelectorAll(".timer-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const s = r.steps[b.dataset.timer];
      startTimer(`Step ${Number(b.dataset.timer) + 1}`, s.timer_minutes);
    })
  );

  let notesT;
  $("#notes").addEventListener("input", (e) => {
    clearTimeout(notesT);
    notesT = setTimeout(() => updateRecipe(entry.id, { notes: e.target.value }), 400);
  });

  $("#shareList").onclick = () => shareShoppingList(entry);
  $("#deleteBtn").onclick = () => {
    if (!confirm(`Delete “${r.title}”?`)) return;
    saveRecipes(loadRecipes().filter((x) => x.id !== entry.id));
    location.hash = "#/";
  };
  $("#redoBtn").onclick = () => {
    location.hash = "#/";
    setTimeout(() => startExtract(entry.video?.url || "", ""), 0);
  };
  if (!keepScroll) window.scrollTo(0, 0);
}

async function shareShoppingList(entry) {
  const r = entry.recipe;
  const factor = entry.servings / r.servings;
  const lines = r.ingredients
    .filter((_, i) => !entry.checked[i])
    .map((ing) => {
      const f = formatIngredient(ing, factor, entry.unitMode);
      return `☐ ${[f.amount, f.name].filter(Boolean).join(" ")}`;
    });
  const text = `${r.title} (${entry.servings} servings)\n\n${lines.join("\n")}`;
  try {
    if (navigator.share) await navigator.share({ title: r.title, text });
    else {
      await navigator.clipboard.writeText(text);
      toast("Shopping list copied");
    }
  } catch {
    /* user cancelled */
  }
}

// ---------- cook mode ----------
let wakeLock = null;
async function startWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    wakeLock = null;
  }
}
function stopWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && /\/cook$/.test(location.hash)) startWakeLock();
});

function renderCook(entry, stepIndex = 0) {
  const r = entry.recipe;
  const factor = entry.servings / r.servings;
  const total = r.steps.length;
  const i = Math.min(Math.max(stepIndex, 0), total - 1);
  const s = r.steps[i];

  // ingredients named in this step, so you don't have to scroll back
  const lower = s.text.toLowerCase();
  const used = r.ingredients.filter((ing) => {
    const words = ing.name.toLowerCase().split(/[\s,()]+/).filter((w) => w.length > 3);
    return lower.includes(ing.name.toLowerCase()) || words.some((w) => lower.includes(w));
  });

  app.innerHTML = `
    <section class="cook">
      <div class="progress"><div style="width:${((i + 1) / total) * 100}%"></div></div>
      <p class="muted">Step ${i + 1} of ${total} · ${esc(r.title)}</p>
      <p class="cook-step">${esc(s.text)}</p>
      <div class="step-meta">
        ${s.temperature ? `<span class="chip">🔥 ${esc(s.temperature)}</span>` : ""}
        ${s.timer_minutes ? `<button class="btn primary" id="cookTimer">⏱ Start ${formatMinutes(s.timer_minutes)} timer</button>` : ""}
      </div>
      ${used.length ? `<div class="card cook-ings"><h3>For this step</h3><ul>${used
        .map((ing) => {
          const f = formatIngredient(ing, factor, entry.unitMode);
          return `<li><b>${esc(f.amount)}</b> ${esc(f.name)}</li>`;
        })
        .join("")}</ul></div>` : ""}
      <div class="cook-nav">
        <button class="btn ghost big" id="prevStep" ${i === 0 ? "disabled" : ""}>← Back</button>
        ${i < total - 1
          ? `<button class="btn primary big" id="nextStep">Next →</button>`
          : `<a class="btn primary big" href="#/recipe/${entry.id}">Done 🎉</a>`}
      </div>
      <p class="muted small center">${navigator.wakeLock ? "Screen stays on while cooking." : ""}</p>
    </section>`;

  $("#prevStep").onclick = () => renderCook(entry, i - 1);
  $("#nextStep")?.addEventListener("click", () => renderCook(entry, i + 1));
  $("#cookTimer")?.addEventListener("click", () => startTimer(`Step ${i + 1}`, s.timer_minutes));

  // swipe left/right
  let x0 = null;
  const el = $(".cook");
  el.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) renderCook(entry, i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  if (!wakeLock) startWakeLock();
  window.scrollTo(0, 0);
}

// ---------- timers ----------
const TIMER_KEY = "savr.timers";
let timers = safeGet(TIMER_KEY, []).filter((t) => t.endAt > Date.now() - 60_000);

function startTimer(label, minutes) {
  if (!minutes) return;
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  primeAudio();
  timers.push({ id: Date.now(), label, endAt: Date.now() + minutes * 60_000, rang: false });
  safeSet(TIMER_KEY, timers);
  renderTimers();
  toast(`Timer started: ${formatMinutes(minutes)}`);
}

let audioCtx;
function primeAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
  } catch {}
}
function beep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (let k = 0; k < 3; k++) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, now + k * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, now + k * 0.4 + 0.3);
    o.connect(g).connect(audioCtx.destination);
    o.start(now + k * 0.4);
    o.stop(now + k * 0.4 + 0.3);
  }
}
async function ring(t) {
  beep();
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if ("Notification" in window && Notification.permission === "granted") {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: `${t.label} is done`, icon: "/icons/icon-192.png", tag: `timer-${t.id}` };
    if (reg) reg.showNotification("⏱ Timer done", opts);
    else new Notification("⏱ Timer done", opts);
  }
}

function renderTimers() {
  const tray = $("#timerTray");
  if (!timers.length) {
    tray.innerHTML = "";
    return;
  }
  tray.innerHTML = timers
    .map((t) => {
      const left = (t.endAt - Date.now()) / 1000;
      return `<div class="timer ${left <= 0 ? "ringing" : ""}">
        <span>${esc(t.label)}</span><b>${left > 0 ? formatClock(left) : "Done!"}</b>
        <button aria-label="Dismiss timer" data-dismiss="${t.id}">✕</button></div>`;
    })
    .join("");
  tray.querySelectorAll("[data-dismiss]").forEach(
    (b) =>
      (b.onclick = () => {
        timers = timers.filter((t) => String(t.id) !== b.dataset.dismiss);
        safeSet(TIMER_KEY, timers);
        renderTimers();
      })
  );
}
setInterval(() => {
  if (!timers.length) return;
  for (const t of timers) {
    if (!t.rang && t.endAt <= Date.now()) {
      t.rang = true;
      safeSet(TIMER_KEY, timers);
      ring(t);
    }
  }
  renderTimers();
}, 1000);

// ---------- install + service worker ----------
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#installBtn").hidden = false;
});
$("#installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#installBtn").hidden = true;
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// ---------- boot (handles Web Share Target: /?title=&text=&url=) ----------
const params = new URLSearchParams(location.search);
const shared = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" ");
if (shared) {
  history.replaceState(null, "", "/#/");
  route();
  const url = findTikTok(shared);
  if (url) {
    $("#urlInput").value = url;
    startExtract(url, "");
  } else {
    renderHome({ text: shared, openText: true });
  }
} else {
  route();
}
renderTimers();
