const $ = (id) => document.getElementById(id);

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"' && field.length === 0) {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            row.push(field);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            field = "";
            if (char === "\r" && text[i + 1] === "\n") i++;
        } else {
            field += char;
        }
    }
    if (quoted) throw new Error("CSV has an unterminated quoted field.");
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);

    if (!rows.length) throw new Error("CSV file is empty.");
    const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
    const titleIndex = headers.indexOf("title");
    const urlIndex = headers.indexOf("url");
    if (titleIndex < 0 || urlIndex < 0) throw new Error('CSV must have "Title" and "URL" columns.');

    return rows
        .map((values) => ({
            name: (values[titleIndex] || "").trim(),
            url: (values[urlIndex] || "").trim(),
        }))
        .filter((place) => place.name && /^https?:\/\//i.test(place.url));
}

function parsePlaces(text, fileName) {
    const trimmed = text.trimStart();
    const isJson = /\.json$/i.test(fileName) || trimmed.startsWith("{") || trimmed.startsWith("[");
    if (!isJson) return parseCsv(text);

    const json = JSON.parse(text);
    if (!Array.isArray(json.features)) throw new Error("JSON must contain a features array.");
    return json.features
        .map((feature) => {
            const url = feature.properties?.google_maps_url || "";
            const location = feature.properties?.location || {};
            let queryName = "";
            try {
                queryName = new URL(url).searchParams.get("q") || "";
            } catch {
                // Invalid URLs are filtered out below.
            }
            return {
                name: location.name || location.address || queryName || url,
                url: url.replace(/^http:/i, "https:"),
            };
        })
        .filter((place) => place.name && /^https?:\/\//i.test(place.url));
}

async function activeMapsTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function refresh() {
    const { state } = await chrome.storage.local.get("state");
    $("status").textContent = state
        ? `${state.index}/${state.places.length} processed, ${state.failed.length} failed, ${state.running ? "running" : "stopped"}` +
          (state.failed.length
              ? `\n\nFailed places:\n${state.failed.map((failure) => `• ${failure.name || "(unnamed place)"} — ${failure.error}`).join("\n")}`
              : "")
        : "No import loaded";
}

async function kick() {
    const tab = await activeMapsTab();
    // Navigating triggers the content script, which resumes from stored state.
    await chrome.tabs.update(tab.id, { url: "https://www.google.com/maps" });
}

$("start").onclick = async () => {
    $("error").textContent = "";
    try {
        const file = $("file").files[0];
        if (!file) throw new Error("Choose a JSON or CSV file first.");
        const places = parsePlaces(await file.text(), file.name).reverse();
        if (!places.length) throw new Error("No places with a name and valid URL were found.");
        await chrome.storage.local.set({
            state: {
                places,
                index: 0,
                stage: "idle",
                running: true,
                failed: [],
                list: $("list").value.trim(),
                startedAt: Date.now(),
                completedDurations: [],
            },
        });
        await kick();
        await refresh();
    } catch (error) {
        $("error").textContent = error.message || String(error);
    }
};

$("stop").onclick = async () => {
    const { state } = await chrome.storage.local.get("state");
    if (state) {
        state.running = false;
        await chrome.storage.local.set({ state });
    }
    refresh();
};

$("resume").onclick = async () => {
    const { state } = await chrome.storage.local.get("state");
    if (!state) return;
    state.running = true;
    state.stage = "idle";
    state.currentPlaceStartedAt = null;
    state.list = $("list").value.trim() || state.list;
    await chrome.storage.local.set({ state });
    await kick();
    refresh();
};

refresh();
setInterval(refresh, 1000);
