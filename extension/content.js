// Drives the Google Maps UI: open place -> Save -> tick the target list.
// State lives in chrome.storage.local so it survives page navigations.
// Selectors/labels are UI-dependent; adjust SAVE_RE if your Maps language differs.
const SAVE_RE = /^(save|tallenna)\b/i;
const SAVED_RE = /^(saved|tallennettu)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const el = fn();
        if (el) return el;
        await sleep(250);
    }
    return null;
}

function banner(text) {
    let el = document.getElementById("__importer_banner");
    if (!el) {
        el = document.createElement("div");
        el.id = "__importer_banner";
        el.style.cssText =
            "position:fixed;bottom:10px;left:10px;z-index:99999;background:#000c;color:#fff;padding:8px 12px;font:12px/1.5 sans-serif;border-radius:4px;white-space:pre-line;max-width:420px";
        document.body.appendChild(el);
    }
    el.textContent = text;
}

function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "estimating...";
    const seconds = Math.round(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    if (minutes) return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
    return `${remainder}s`;
}

function updateProgressBanner(state, activity) {
    const elapsed = Date.now() - (state.startedAt || Date.now());
    const durations = state.completedDurations || [];
    const average = durations.length
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : state.index > 0
          ? elapsed / state.index
          : null;
    const remaining = average === null ? null : average * Math.max(0, state.places.length - state.index);
    banner(`${activity}\nElapsed: ${formatDuration(elapsed)} · Remaining: ${formatDuration(remaining)}`);
}

const label = (b) => (b.getAttribute("aria-label") || b.textContent || "").trim();

function findSaveButton() {
    return [...document.querySelectorAll("button")].find((b) => {
        const l = label(b);
        return b.getAttribute("data-value") === "Save" || SAVE_RE.test(l) || SAVED_RE.test(l);
    });
}

async function savePlace(listName) {
    const btn = await waitFor(findSaveButton);
    if (!btn) throw new Error("Save button not found");
    btn.click();
    // The list dropdown is a role=menu whose entries are role=menuitemradio.
    const menu = await waitFor(() => {
        const m = [...document.querySelectorAll('[role="menu"]')].find((x) =>
            x.querySelector('[role="menuitemradio"]'),
        );
        return m || null;
    });
    if (!menu) throw new Error("List menu did not open");
    const items = [...menu.querySelectorAll('[role="menuitemradio"]')];
    const wanted = listName.toLowerCase();
    const nameOf = (i) => (i.querySelector(".mLuXec")?.textContent || label(i)).trim().toLowerCase();
    const target = items.find((i) => nameOf(i) === wanted) || items.find((i) => nameOf(i).includes(wanted));
    if (!target) throw new Error(`List "${listName}" not found among: ${items.map(nameOf).join(", ")}`);
    if (target.getAttribute("aria-checked") !== "true") {
        target.click();
        // Maps may close or re-render the menu on click, so re-query instead of trusting `target`.
        const ok = await waitFor(() => {
            const m = [...document.querySelectorAll('[role="menu"]')].find((x) =>
                x.querySelector('[role="menuitemradio"]'),
            );
            if (!m) return true;
            const t = [...m.querySelectorAll('[role="menuitemradio"]')].find((i) => nameOf(i) === nameOf(target));
            return !t || t.getAttribute("aria-checked") === "true";
        }, 4000);
        if (!ok) throw new Error("List item click did not toggle");
    }
    await sleep(500);
    for (const t of [document.activeElement, document.body, document]) {
        t?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    }
}

async function run() {
    const { state } = await chrome.storage.local.get("state");
    if (!state || !state.running) return;
    const save = () => chrome.storage.local.set({ state });

    if (state.index >= state.places.length) {
        state.running = false;
        await save();
        updateProgressBanner(state, `Done. ${state.failed.length} failed.`);
        console.log("Failed places:", state.failed);
        return;
    }

    const place = state.places[state.index];
    if (state.stage === "idle") {
        state.stage = "opened";
        state.currentPlaceStartedAt = Date.now();
        await save();
        updateProgressBanner(state, `Opening ${state.index + 1}/${state.places.length}: ${place.name}`);
        location.href = place.url;
        return;
    }

    updateProgressBanner(state, `Saving ${state.index + 1}/${state.places.length}: ${place.name}`);
    const ticker = setInterval(() => updateProgressBanner(state, `Saving ${state.index + 1}/${state.places.length}: ${place.name}`), 1000);
    await sleep(2000);
    try {
        await savePlace(state.list);
    } catch (e) {
        state.failed.push({ name: place.name, url: place.url, error: String(e.message || e) });
    } finally {
        clearInterval(ticker);
    }
    const placeStartedAt = state.currentPlaceStartedAt || Date.now();
    state.completedDurations = state.completedDurations || [];
    state.completedDurations.push(Date.now() - placeStartedAt);
    state.index++;
    state.stage = "idle";
    state.currentPlaceStartedAt = null;
    await save();
    await sleep(1500 + Math.random() * 2000);
    run();
}

run();
