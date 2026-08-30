// Local browser for the Cline Marketplace.
// Vanilla ES module — talks to the local Express server.

const state = {
  catalog: null,
  installed: null,
  watchlist: null,
  context: null,
  activeTab: "catalog",
  bulkMode: false,
  selectedKeys: new Set(),
  filter: {
    type: "all",
    tags: new Set(),
    search: "",
    onlyVerified: false,
    onlyFeatured: false,
    onlyInstalled: false,
    onlyLocal: false,
    onlyNew: false,
    onlyWatchlist: false,
    hideDrift: false,
    sortBy: "updated",
  },
  contextCwd: localStorage.getItem("clineMarketplace.contextCwd") || "",
};

let lastActiveElement = null;

// ---- API Helpers -----------------------------------------------------------

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { error: txt }; }
  if (!r.ok) throw new Error(data.error || `POST ${url} -> ${r.status}`);
  return data;
}

async function delJson(url) {
  const r = await fetch(url, { method: "DELETE" });
  return r.json();
}

const $ = (sel) => document.querySelector(sel);
const resultsEl = () => $("#results");
const emptyEl = () => $("#emptyState");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "—";
}

function isInstalled(entry) {
  const it = state.installed?.items?.[entry.key];
  return Boolean(it && it.detected);
}

function isDrift(entry) {
  const it = state.installed?.items?.[entry.key];
  return Boolean(it && !it.detected);
}

function installedMeta(entry) {
  return state.installed?.items?.[entry.key] || null;
}

function isWatched(entry) {
  return Boolean(state.watchlist?.items?.find((w) => w.key === entry.key));
}

// ---- Modal Management & Focus Traps ----------------------------------------

function openModal(modalEl) {
  if (!modalEl) return;
  lastActiveElement = document.activeElement;
  modalEl.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  const focusable = modalEl.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  if (focusable) focusable.focus();
}

function closeModal(modalEl) {
  if (!modalEl || modalEl.classList.contains("hidden")) return;
  modalEl.classList.add("hidden");
  const anyModalOpen = document.querySelectorAll(".modal:not(.hidden)").length > 0;
  if (!anyModalOpen) {
    document.body.style.overflow = "";
  }
  if (lastActiveElement && typeof lastActiveElement.focus === "function") {
    lastActiveElement.focus();
    lastActiveElement = null;
  }
}

function openHelp() { openModal($("#helpModal")); }
function closeHelp() { closeModal($("#helpModal")); }
function openDetailModal() { openModal($("#detailModal")); }
function closeDetail() { closeModal($("#detailModal")); }

function handleModalTabTrap(e, modalEl) {
  if (e.key !== "Tab") return;
  const focusableEls = modalEl.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
  if (!focusableEls.length) return;
  const firstEl = focusableEls[0];
  const lastEl = focusableEls[focusableEls.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstEl) {
      lastEl.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === lastEl) {
      firstEl.focus();
      e.preventDefault();
    }
  }
}

// ---- Card Rendering -------------------------------------------------------

function renderCard(entry, { reasons = null, score = null, matchPercent = null } = {}) {
  const installed = isInstalled(entry);
  const drift = isDrift(entry);
  const watched = isWatched(entry);
  const inst = installedMeta(entry);
  const isSelected = state.selectedKeys.has(entry.key);

  const tags = (entry.tags || []).map((t) =>
    `<span class="tag" data-tag="${escapeHtml(t)}" role="button" title="Filter by tag: ${escapeHtml(t)}">${escapeHtml(t)}</span>`
  ).join("");

  const badges = [];
  if (entry.verified) badges.push(`<span class="badge verified">verified</span>`);
  if (entry.featured) badges.push(`<span class="badge featured">featured</span>`);
  if (entry.isNew) badges.push(`<span class="badge new">new</span>`);
  if (entry.isLocal) badges.push(`<span class="badge local">local</span>`);
  if (installed) badges.push(`<span class="badge installed">installed</span>`);
  if (drift) badges.push(`<span class="badge drift">drift</span>`);
  if (watched) badges.push(`<span class="badge watchlist">watchlist</span>`);

  const iconHtml = entry.icon
    ? `<img src="${escapeHtml(entry.icon)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'${escapeHtml((entry.name || '?')[0])}'}))" />`
    : `<span class="placeholder">${escapeHtml((entry.name || "?")[0])}</span>`;

  const updatedAt = entry.updatedAt;
  const installedAt = inst?.installedAt;

  const reasonHtml = (reasons && reasons.length) || matchPercent
    ? `<div style="padding:4px 0 6px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${matchPercent ? `<span class="badge" style="background:var(--cline-blue-glow);color:var(--cline-cyan);border:1px solid var(--border-glow);font-weight:700">${escapeHtml(String(matchPercent))}% Match</span>` : ""}
        ${(reasons || []).map((r) => `<span class="badge verified" style="font-size:9px">${escapeHtml(r)}</span>`).join(" ")}
       </div>`
    : "";

  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${entry.name}, ${entry.type}. Click to view details.`);

  if (installed) card.classList.add("is-installed");
  if (drift) card.classList.add("is-drift");
  if (entry.isNew) card.classList.add("is-new");
  if (entry.isLocal) card.classList.add("is-local");
  if (watched) card.classList.add("is-watchlist");
  if (isSelected) card.classList.add("is-selected");
  if (state.bulkMode) card.classList.add("has-checkbox");

  const typeCls = entry.type === "plugin" ? "plugin" : entry.type === "skill" ? "skill" : "mcp";

  const checkboxHtml = state.bulkMode
    ? `<input type="checkbox" class="card-select-checkbox" data-key="${escapeHtml(entry.key)}" ${isSelected ? "checked" : ""} aria-label="Select ${escapeHtml(entry.name)}" />`
    : "";

  const quickActionHtml = installed
    ? `<div class="card-quick-actions">
        <button class="ghost small btn-quick-reinstall" data-key="${escapeHtml(entry.key)}" title="Reinstall with CLI">Reinstall</button>
        <button class="danger small btn-quick-uninstall" data-key="${escapeHtml(entry.key)}" title="Uninstall with CLI">Uninstall</button>
       </div>`
    : `<div class="card-quick-actions">
        <button class="primary small btn-quick-install" data-key="${escapeHtml(entry.key)}" title="Install with CLI">Install</button>
       </div>`;

  card.innerHTML = `
    ${checkboxHtml}
    <button class="card-watch ${watched ? "active" : ""}" data-watch="${entry.key}" title="${watched ? "Remove from watchlist" : "Add to watchlist"}" aria-label="${watched ? "Remove from watchlist" : "Add to watchlist"}">
      <svg class="ui-icon" aria-hidden="true"><use href="#${watched ? "icon-star-filled" : "icon-star-outline"}"></use></svg>
    </button>
    <div class="card-head">
      <div class="card-icon">${iconHtml}</div>
      <div class="card-title">
        <h2>${escapeHtml(entry.name)} <span class="type-tag ${typeCls}">${escapeHtml(entry.type)}</span></h2>
        <p class="card-tagline" title="${escapeHtml(entry.tagline || "")}">${escapeHtml(entry.tagline || "")}</p>
      </div>
    </div>
    ${reasonHtml}
    <div class="card-meta">
      <span class="author" data-author="${escapeHtml(entry.author?.name || "Unknown")}" role="button" title="Filter by author">${escapeHtml(entry.author?.name || "Unknown")}</span>
      ${entry.license ? `<span class="muted">·</span><span>${escapeHtml(entry.license)}</span>` : ""}
    </div>
    <div class="tags">${tags}</div>
    <div class="badges">${badges.join("")}</div>
    <div class="card-foot">
      <div>
        <div class="updated" title="${escapeHtml(updatedAt || "")}">
          ${updatedAt ? `Updated ${relativeTime(updatedAt)}` : "Updated —"}
        </div>
        <div class="muted small">
          ${installedAt ? `Installed ${relativeTime(installedAt)}` : ""}
        </div>
      </div>
      ${quickActionHtml}
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.closest(".card-watch") || e.target.closest(".card-select-checkbox") || e.target.closest(".card-quick-actions")) return;
    const tagEl = e.target.closest(".tag");
    if (tagEl && tagEl.dataset.tag) {
      e.stopPropagation();
      filterByTag(tagEl.dataset.tag);
      return;
    }
    const authorEl = e.target.closest(".author");
    if (authorEl && authorEl.dataset.author) {
      e.stopPropagation();
      filterBySearch(authorEl.dataset.author);
      return;
    }
    openDetail(entry);
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".card-watch") || e.target.closest(".card-select-checkbox") || e.target.closest(".card-quick-actions")) return;
      e.preventDefault();
      openDetail(entry);
    }
  });

  // Watch button
  card.querySelector(".card-watch")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleWatch(entry, !watched);
  });

  // Checkbox for bulk mode
  card.querySelector(".card-select-checkbox")?.addEventListener("change", (e) => {
    e.stopPropagation();
    if (e.target.checked) state.selectedKeys.add(entry.key);
    else state.selectedKeys.delete(entry.key);
    card.classList.toggle("is-selected", e.target.checked);
    updateBulkBar();
  });

  // Quick Action Buttons
  card.querySelector(".btn-quick-install")?.addEventListener("click", (e) => {
    e.stopPropagation();
    runInstall(entry, false);
  });
  card.querySelector(".btn-quick-reinstall")?.addEventListener("click", (e) => {
    e.stopPropagation();
    runInstall(entry, true);
  });
  card.querySelector(".btn-quick-uninstall")?.addEventListener("click", (e) => {
    e.stopPropagation();
    runUninstall(entry);
  });

  return card;
}

function filterByTag(tag) {
  if (!tag) return;
  state.filter.tags.add(tag);
  switchTab("catalog");
  renderTagFilter();
  render();
}

function filterBySearch(query) {
  if (!query) return;
  state.filter.search = query;
  const sInput = $("#search");
  if (sInput) sInput.value = query;
  updateSearchClearBtn();
  switchTab("catalog");
  render();
}

// ---- Filtering & Sorting --------------------------------------------------

function applyFilters() {
  if (!state.catalog) return [];
  const f = state.filter;
  const q = f.search.trim().toLowerCase();
  let entries = state.catalog.entries.slice();

  if (f.type !== "all") entries = entries.filter((e) => e.type === f.type);
  if (f.tags.size) entries = entries.filter((e) => (e.tags || []).some((t) => f.tags.has(t)));
  if (f.onlyVerified) entries = entries.filter((e) => e.verified);
  if (f.onlyFeatured) entries = entries.filter((e) => e.featured);
  if (f.onlyInstalled) entries = entries.filter(isInstalled);
  if (f.onlyLocal) entries = entries.filter((e) => e.isLocal);
  if (f.onlyNew) entries = entries.filter((e) => e.isNew);
  if (f.onlyWatchlist) entries = entries.filter(isWatched);
  if (f.hideDrift) entries = entries.filter((e) => !isDrift(e));

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    entries = entries.filter((e) => {
      const haystack = [
        e.name,
        e.tagline,
        e.description,
        e.author?.name,
        e.id,
        e.type,
        ...(e.tags || []),
      ].join(" ").toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  switch (f.sortBy) {
    case "name": entries.sort((a, b) => (a.name || "").localeCompare(b.name || "")); break;
    case "name-desc": entries.sort((a, b) => (b.name || "").localeCompare(a.name || "")); break;
    case "author": entries.sort((a, b) => (a.author?.name || "").localeCompare(b.author?.name || "")); break;
    case "type": entries.sort((a, b) => (a.type || "").localeCompare(b.type || "") || (a.name || "").localeCompare(b.name || "")); break;
    default:
      entries.sort((a, b) => (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
                             (a.updatedAt ? new Date(a.updatedAt).getTime() : 0));
  }
  return entries;
}

function updateActiveFiltersBar() {
  const bar = $("#activeFiltersBar");
  const list = $("#activeFiltersList");
  if (!bar || !list) return;

  const f = state.filter;
  const pills = [];

  if (f.search && f.search.trim()) {
    pills.push(`
      <span class="active-pill" data-clear="search" title="Click to remove search filter: &quot;${escapeHtml(f.search.trim())}&quot;">
        search: "${escapeHtml(f.search.trim())}"
        <button type="button" data-clear="search" aria-label="Clear search">×</button>
      </span>`);
  }
  if (f.type !== "all") {
    pills.push(`
      <span class="active-pill" data-clear="type" title="Click to clear type filter">
        type: ${escapeHtml(f.type)}
        <button type="button" data-clear="type" aria-label="Clear type filter">×</button>
      </span>`);
  }
  for (const tag of f.tags) {
    pills.push(`
      <span class="active-pill" data-clear-tag="${escapeHtml(tag)}" title="Click to remove tag: ${escapeHtml(tag)}">
        tag: ${escapeHtml(tag)}
        <button type="button" data-clear-tag="${escapeHtml(tag)}" aria-label="Remove tag">×</button>
      </span>`);
  }
  if (f.onlyInstalled) pills.push(`<span class="active-pill" data-clear="onlyInstalled" title="Click to clear installed filter">installed only <button type="button" data-clear="onlyInstalled">×</button></span>`);
  if (f.onlyLocal) pills.push(`<span class="active-pill" data-clear="onlyLocal" title="Click to clear local filter">local only <button type="button" data-clear="onlyLocal">×</button></span>`);
  if (f.onlyVerified) pills.push(`<span class="active-pill" data-clear="onlyVerified" title="Click to clear verified filter">verified only <button type="button" data-clear="onlyVerified">×</button></span>`);
  if (f.onlyFeatured) pills.push(`<span class="active-pill" data-clear="onlyFeatured" title="Click to clear featured filter">featured only <button type="button" data-clear="onlyFeatured">×</button></span>`);
  if (f.onlyNew) pills.push(`<span class="active-pill" data-clear="onlyNew" title="Click to clear new filter">new only <button type="button" data-clear="onlyNew">×</button></span>`);
  if (f.onlyWatchlist) pills.push(`<span class="active-pill" data-clear="onlyWatchlist" title="Click to clear watchlist filter">watchlist only <button type="button" data-clear="onlyWatchlist">×</button></span>`);
  if (f.hideDrift) pills.push(`<span class="active-pill" data-clear="hideDrift" title="Click to clear drift filter">hide drift <button type="button" data-clear="hideDrift">×</button></span>`);

  if (pills.length === 0) {
    bar.classList.add("hidden");
    list.innerHTML = "";
  } else {
    bar.classList.remove("hidden");
    list.innerHTML = pills.join("");
  }
}

function resetAllFilters() {
  state.filter.search = "";
  state.filter.type = "all";
  state.filter.tags.clear();
  state.filter.onlyVerified = false;
  state.filter.onlyFeatured = false;
  state.filter.onlyInstalled = false;
  state.filter.onlyLocal = false;
  state.filter.onlyNew = false;
  state.filter.onlyWatchlist = false;
  state.filter.hideDrift = false;

  const searchInp = $("#search");
  if (searchInp) searchInp.value = "";
  updateSearchClearBtn();

  for (const b of document.querySelectorAll("#typeFilter button")) {
    b.classList.toggle("active", b.dataset.type === "all");
  }

  const ver = $("#onlyVerified"); if (ver) ver.checked = false;
  const feat = $("#onlyFeatured"); if (feat) feat.checked = false;
  const inst = $("#onlyInstalled"); if (inst) inst.checked = false;
  const loc = $("#onlyLocal"); if (loc) loc.checked = false;
  const nw = $("#onlyNew"); if (nw) nw.checked = false;
  const wt = $("#onlyWatchlist"); if (wt) wt.checked = false;
  const hd = $("#hideDrift"); if (hd) hd.checked = false;

  renderTagFilter();
  render();
}

function updateSearchClearBtn() {
  const input = $("#search");
  const clearBtn = $("#searchClear");
  if (!input || !clearBtn) return;
  clearBtn.classList.toggle("hidden", !input.value.trim());
}

// ---- Bulk Mode Management -------------------------------------------------

function toggleBulkMode(forceState = null) {
  state.bulkMode = forceState !== null ? forceState : !state.bulkMode;
  const btn = $("#btnBulkMode");
  if (btn) btn.classList.toggle("active", state.bulkMode);
  if (!state.bulkMode) {
    state.selectedKeys.clear();
  }
  updateBulkBar();
  render();
}

function updateBulkBar() {
  const bulkBar = $("#bulkBar");
  const countBadge = $("#bulkCountBadge");
  const selectAll = $("#bulkSelectAll");
  if (!bulkBar || !countBadge) return;

  const count = state.selectedKeys.size;
  countBadge.textContent = `${count} selected`;

  if (state.bulkMode || count > 0) {
    bulkBar.classList.remove("hidden");
  } else {
    bulkBar.classList.add("hidden");
  }

  const visibleEntries = applyFilters();
  if (selectAll && visibleEntries.length > 0) {
    const allSelected = visibleEntries.every((e) => state.selectedKeys.has(e.key));
    selectAll.checked = allSelected;
  }
}

async function runBulkAction(action) {
  if (state.selectedKeys.size === 0) {
    toast("No items selected", "Select one or more items first", "warn");
    return;
  }

  const catalog = state.catalog?.entries || [];
  const map = new Map(catalog.map((e) => [e.key, e]));
  const items = [];
  for (const key of state.selectedKeys) {
    const [type, id] = key.split(":");
    items.push({ type, id });
  }

  const btnMap = {
    install: $("#btnBulkInstall"),
    uninstall: $("#btnBulkUninstall"),
    watch: $("#btnBulkWatch"),
  };

  const currentBtn = btnMap[action];
  if (currentBtn) currentBtn.disabled = true;

  try {
    toast("Bulk operation running", `Executing ${action} on ${items.length} items…`, "info");
    const res = await postJson("/api/bulk", { action, items });
    toast("Bulk action finished", `Completed ${action} on ${items.length} items`, "success");
    state.selectedKeys.clear();
    await refreshInstalled();
    await refreshWatchlist();
    render();
    updateStatusPills();
    updateBulkBar();
  } catch (err) {
    toast("Bulk action failed", String(err.message || err), "error");
  } finally {
    if (currentBtn) currentBtn.disabled = false;
  }
}

// ---- Tab Renderers --------------------------------------------------------

function renderCatalogTab() {
  const grid = resultsEl();
  grid.innerHTML = "";
  const entries = applyFilters();
  emptyEl().classList.toggle("hidden", entries.length > 0);
  for (const e of entries) grid.appendChild(renderCard(e));
  updateActiveFiltersBar();
  updateBulkBar();
}

function renderWatchlistTab() {
  const grid = $("#watchGrid");
  grid.innerHTML = "";
  const items = state.watchlist?.items || [];
  const cat = state.catalog?.entries || [];
  const map = new Map(cat.map((e) => [e.key, e]));

  $("#watchIntro").innerHTML = items.length
    ? `<span class="pill ok"><span class="dot"></span> ${items.length} ${items.length === 1 ? 'primitive' : 'primitives'} tracked</span>`
    : "";

  if (!items.length) {
    $("#watchEmpty").classList.remove("hidden");
    return;
  }
  $("#watchEmpty").classList.add("hidden");

  for (const w of items) {
    const e = map.get(w.key);
    grid.appendChild(e ? renderCard(e) : renderCard({
      key: w.key, type: w.type, id: w.id, name: w.id, tagline: "No longer in catalog",
      description: "This entry was removed upstream or renamed.", tags: [],
    }));
  }
}

function renderRecommendedTab() {
  const grid = $("#recGrid");
  const bundlesContainer = $("#recBundles");
  const titleEl = $("#recIndividualTitle");
  grid.innerHTML = "";
  if (bundlesContainer) bundlesContainer.innerHTML = "";

  const ctx = state.context;
  if (!ctx || (!ctx.recommendations?.length && !ctx.bundles?.length)) {
    $("#recIntro").innerHTML = "";
    $("#recEmpty").classList.remove("hidden");
    if (titleEl) titleEl.classList.add("hidden");
    return;
  }
  $("#recEmpty").classList.add("hidden");
  if (titleEl) titleEl.classList.remove("hidden");

  const intro = [];
  if (ctx.cwd) intro.push(`<span class="pill"><span class="dot"></span> CWD: ${escapeHtml(ctx.cwd)}</span>`);
  if (ctx.repo) intro.push(`<span class="pill ok"><span class="dot"></span> Repo: ${escapeHtml(ctx.repo.owner)}/${escapeHtml(ctx.repo.name)}</span>`);
  for (const l of ctx.languages || []) intro.push(`<span class="pill ok"><span class="dot"></span> ${escapeHtml(l)}</span>`);
  for (const f of ctx.frameworks || []) intro.push(`<span class="pill ok"><span class="dot"></span> ${escapeHtml(f)}</span>`);
  $("#recIntro").innerHTML = intro.join(" ");

  // Curated Stack Bundles
  if (bundlesContainer && ctx.bundles && ctx.bundles.length) {
    for (const b of ctx.bundles) {
      const card = document.createElement("div");
      card.className = "bundle-card";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <h3>${escapeHtml(b.title)}</h3>
            <p>${escapeHtml(b.description)}</p>
          </div>
          <span class="badge featured" style="white-space:nowrap">${b.items.length} Primitives</span>
        </div>
        <div class="bundle-items-list">
          ${b.items.map((it) => `<span class="bundle-item-chip">${escapeHtml(it.name)} <span class="type-tag ${it.type}" style="font-size:9px;padding:1px 4px">${escapeHtml(it.type)}</span></span>`).join("")}
        </div>
        <div style="margin-top:auto;padding-top:10px;display:flex;gap:8px;align-items:center">
          <button class="primary small btn-install-bundle" data-bundle-id="${escapeHtml(b.id)}">
            <svg class="ui-icon" aria-hidden="true"><use href="#icon-package"></use></svg>
            <span>Install Bundle</span>
          </button>
        </div>
      `;

      card.querySelector(".btn-install-bundle")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "Installing bundle…";
        try {
          toast("Installing Bundle", `Installing ${b.items.length} primitives from ${b.title}…`, "info");
          const itemsToInstall = b.items.map((it) => ({ type: it.type, id: it.id }));
          await postJson("/api/bulk", { action: "install", items: itemsToInstall });
          toast("Bundle Installed", `Installed ${b.title} successfully!`, "success");
          await refreshInstalled();
          render();
          updateStatusPills();
        } catch (err) {
          toast("Bundle install failed", String(err.message || err), "error");
        } finally {
          btn.disabled = false;
          btn.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-package"></use></svg> <span>Install Bundle</span>`;
        }
      });

      bundlesContainer.appendChild(card);
    }
  }

  for (const rec of ctx.recommendations || []) {
    grid.appendChild(renderCard(rec.entry, {
      reasons: rec.reasons,
      score: rec.score,
      matchPercent: rec.matchPercent,
    }));
  }
}

async function renderStatsTab() {
  try {
    const s = await getJson("/api/stats");
    const byType = s.byType || {};
    const total = s.total || 1;

    $("#statByType").innerHTML = `
      <div class="bar-row"><span class="label">Plugins</span><span class="bar"><span style="width:${pct(byType.plugins, total)}%;background:var(--type-plugin)"></span></span><span class="value">${byType.plugins ?? 0}</span></div>
      <div class="bar-row"><span class="label">Skills</span><span class="bar"><span style="width:${pct(byType.skills, total)}%;background:var(--type-skill)"></span></span><span class="value">${byType.skills ?? 0}</span></div>
      <div class="bar-row"><span class="label">MCPs</span><span class="bar"><span style="width:${pct(byType.mcps, total)}%;background:var(--type-mcp)"></span></span><span class="value">${byType.mcps ?? 0}</span></div>`;

    const topAuthorsEl = $("#statAuthors");
    topAuthorsEl.innerHTML = (s.topAuthors || []).map((a) =>
      `<li data-author="${escapeHtml(a.name)}" title="Click to filter by ${escapeHtml(a.name)}">${escapeHtml(a.name)}<span class="count">${a.count}</span></li>`
    ).join("") || `<li class="muted">no data</li>`;

    topAuthorsEl.querySelectorAll("li[data-author]").forEach((li) => {
      li.addEventListener("click", () => filterBySearch(li.dataset.author));
    });

    const f = s.freshness || {};
    const fTotal = Math.max(1, Object.values(f).reduce((a, b) => a + b, 0));
    $("#statFreshness").innerHTML = Object.entries(f).map(([k, v]) =>
      `<div class="bar-row"><span class="label">${escapeHtml(k)}</span><span class="bar"><span style="width:${pct(v, fTotal)}%"></span></span><span class="value">${v}</span></div>`
    ).join("");

    const tagsEl = $("#statTags");
    tagsEl.innerHTML = (s.byTag || []).slice(0, 15).map((t) =>
      `<div class="bar-row clickable" data-tag="${escapeHtml(t.id)}" title="Click to filter catalog by tag: ${escapeHtml(t.label)}">
        <span class="label">${escapeHtml(t.label)}</span>
        <span class="bar"><span style="width:${pct(t.count, total)}%"></span></span>
        <span class="value">${t.count}</span>
      </div>`
    ).join("");

    tagsEl.querySelectorAll(".bar-row.clickable").forEach((row) => {
      row.addEventListener("click", () => filterByTag(row.dataset.tag));
    });

    const ic = s.installed || { total: 0, byType: {} };
    $("#statInstalled").innerHTML = `
      <div style="margin-bottom:12px;font-size:13px">You have <strong>${ic.total}</strong> of ${total} primitives installed locally.</div>
      <div class="bar-row"><span class="label">Total Coverage</span><span class="bar"><span style="width:${pct(ic.total, total)}%"></span></span><span class="value">${pct(ic.total, total).toFixed(1)}%</span></div>
      <div class="bar-row"><span class="label">Plugins</span><span class="bar"><span style="width:${pct(ic.byType.plugin, byType.plugins || 1)}%;background:var(--type-plugin)"></span></span><span class="value">${ic.byType.plugin || 0} / ${byType.plugins || 0}</span></div>
      <div class="bar-row"><span class="label">Skills</span><span class="bar"><span style="width:${pct(ic.byType.skill, byType.skills || 1)}%;background:var(--type-skill)"></span></span><span class="value">${ic.byType.skill || 0} / ${byType.skills || 0}</span></div>
      <div class="bar-row"><span class="label">MCPs</span><span class="bar"><span style="width:${pct(ic.byType.mcp, byType.mcps || 1)}%;background:var(--type-mcp)"></span></span><span class="value">${ic.byType.mcp || 0} / ${byType.mcps || 0}</span></div>`;
  } catch (err) {
    $("#statByType").textContent = "Failed to load stats: " + err.message;
  }
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.min(100, (part / whole) * 100);
}

async function renderChangelogTab() {
  try {
    const cl = await getJson("/api/changelog");
    $("#chlogAddedCount").textContent = cl.added.length;
    $("#chlogRemovedCount").textContent = cl.removed.length;
    $("#chlogUpdatedCount").textContent = cl.updated.length;

    $("#chlogAdded").innerHTML = cl.added.length
      ? cl.added.map((e) => `<div class="changelog-item"><strong>${escapeHtml(e.name)}</strong> <span class="type-tag ${e.type}">${escapeHtml(e.type)}</span><div class="meta">${escapeHtml(e.tagline || "")}</div></div>`).join("")
      : `<div class="muted small" style="padding:10px">No new entries since last refresh.</div>`;

    $("#chlogRemoved").innerHTML = cl.removed.length
      ? cl.removed.map((e) => `<div class="changelog-item"><strong>${escapeHtml(e.name)}</strong> <span class="type-tag">${escapeHtml(e.type)}</span></div>`).join("")
      : `<div class="muted small" style="padding:10px">Nothing removed.</div>`;

    $("#chlogUpdated").innerHTML = cl.updated.length
      ? cl.updated.map((u) => `<div class="changelog-item"><strong>${escapeHtml(u.after.name)}</strong> <span class="type-tag ${u.after.type}">${escapeHtml(u.after.type)}</span><div class="meta">Tagline: "${escapeHtml(u.before.tagline || "")}" → "${escapeHtml(u.after.tagline || "")}"</div></div>`).join("")
      : `<div class="muted small" style="padding:10px">No content changes detected.</div>`;
  } catch (err) {
    $("#chlogAdded").textContent = "Failed to load changelog: " + err.message;
  }
}

const PROBE_TITLES = {
  node: "Node.js Runtime",
  cline: "Cline CLI Tool",
  gh: "GitHub CLI Tool",
  "cline-storage": "Local Primitive Storage",
  catalog: "Marketplace Catalog",
  metadata: "Commit Metadata Cache",
};

async function renderHealthTab() {
  try {
    const h = await getJson("/api/health");
    $("#healthList").innerHTML = h.checks.map((c) => {
      const cls = c.ok ? "ok" : "bad";
      const iconSvg = c.ok
        ? `<svg class="ui-icon" style="width:16px;height:16px" aria-hidden="true"><use href="#icon-check"></use></svg>`
        : `<svg class="ui-icon" style="width:16px;height:16px" aria-hidden="true"><use href="#icon-close"></use></svg>`;
      const title = PROBE_TITLES[c.name] || c.name;
      
      let detailText = escapeHtml(String(c.detail || c.error || ""));
      if (c.counts) {
        detailText += ` · ${c.counts.plugins} plugins, ${c.counts.skills} skills, ${c.counts.mcps} mcps`;
      }
      
      const badgeText = c.ok ? "VERIFIED" : "ISSUE";
      const badgeClass = c.ok ? "verified" : "drift";

      return `<div class="health-item ${cls}">
        <div class="health-item-head">
          <div class="health-item-title">
            <div class="health-icon-box">${iconSvg}</div>
            <div>
              <div class="name">${escapeHtml(title)}</div>
              ${c.path ? `<code style="font-size:10px;color:#777">${escapeHtml(c.path)}</code>` : ""}
            </div>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="detail">${detailText}</div>
      </div>`;
    }).join("");

    const hpill = $("#pillHealth");
    if (hpill) {
      hpill.innerHTML = `<span class="dot"></span> health: ${h.ok ? "ok" : "issue"}`;
      hpill.className = "pill " + (h.ok ? "ok" : "bad");
    }
  } catch (err) {
    $("#healthList").innerHTML = `<div class="health-item bad"><div class="name">Diagnostics Probe Failed</div><div class="detail">${escapeHtml(err.message)}</div></div>`;
  }
}

async function refreshHealthStatus() {
  try {
    const h = await getJson("/api/health");
    const hpill = $("#pillHealth");
    if (hpill) {
      hpill.innerHTML = `<span class="dot"></span> health: ${h.ok ? "ok" : "issue"}`;
      hpill.className = "pill " + (h.ok ? "ok" : "bad");
    }
  } catch {
    const hpill = $("#pillHealth");
    if (hpill) {
      hpill.innerHTML = `<span class="dot"></span> health: issue`;
      hpill.className = "pill bad";
    }
  }
}

function render() {
  if (state.activeTab === "catalog") renderCatalogTab();
  else if (state.activeTab === "watchlist") renderWatchlistTab();
  else if (state.activeTab === "recommended") renderRecommendedTab();
  else if (state.activeTab === "stats") renderStatsTab();
  else if (state.activeTab === "changelog") renderChangelogTab();
  else if (state.activeTab === "health") renderHealthTab();
}

function renderTagFilter() {
  const host = $("#tagFilter");
  const clearBtn = $("#btnClearTags");
  if (!host) return;
  host.innerHTML = "";

  const tags = state.catalog?.tags || [];
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", state.filter.tags.size === 0);
  }

  for (const t of tags.slice(0, 40)) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.tag = t.id;
    btn.innerHTML = `${escapeHtml(t.label)} <span class="count">${t.count || 0}</span>`;
    if (state.filter.tags.has(t.id)) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (state.filter.tags.has(t.id)) state.filter.tags.delete(t.id);
      else state.filter.tags.add(t.id);
      renderTagFilter();
      render();
    });
    host.appendChild(btn);
  }
}

function updateCounts() {
  const entries = state.catalog?.entries || [];
  $("#cntAll").textContent = entries.length;
  $("#cntPlugin").textContent = entries.filter((e) => e.type === "plugin").length;
  $("#cntSkill").textContent = entries.filter((e) => e.type === "skill").length;
  $("#cntMcp").textContent = entries.filter((e) => e.type === "mcp").length;
}

function updateStatusPills() {
  const total = state.catalog?.counts?.total || 0;
  const installedCount = Object.values(state.installed?.items || {}).filter((it) => it.detected).length;
  const localCount = state.catalog?.counts?.local || 0;
  const newCount = state.catalog?.counts?.new || 0;

  $("#pillTotal").innerHTML = `<span class="dot"></span> catalog: ${total}`;
  $("#pillTotal").className = "pill";

  $("#pillInstalled").innerHTML = `<span class="dot"></span> installed: ${installedCount}`;
  $("#pillInstalled").className = "pill" + (installedCount ? " ok" : "");

  $("#pillLocal").innerHTML = `<span class="dot"></span> local: ${localCount}`;
  $("#pillLocal").className = "pill" + (localCount ? " ok" : "");

  $("#pillNew").innerHTML = `<span class="dot"></span> new: ${newCount}`;
  $("#pillNew").className = "pill" + (newCount ? " warn" : "");

  const wcount = state.watchlist?.items?.length || 0;
  $("#watchBadge").textContent = wcount;
  $("#watchBadge").hidden = wcount === 0;
}

function renderContextSummary() {
  const ctx = state.context;
  const host = $("#contextSummary");
  if (!ctx) { host.textContent = "detecting stack…"; return; }
  if (ctx.error) { host.innerHTML = `<span class="muted small">error: ${escapeHtml(ctx.error)}</span>`; return; }

  const chips = [];
  if (ctx.repo) chips.push(`<span class="chip" style="font-size:10px;padding:2px 8px">${escapeHtml(ctx.repo.owner)}/${escapeHtml(ctx.repo.name)}</span>`);
  for (const l of ctx.languages || []) chips.push(`<span class="chip" style="font-size:10px;padding:2px 8px">${escapeHtml(l)}</span>`);
  for (const f of (ctx.frameworks || []).slice(0, 6)) chips.push(`<span class="chip" style="font-size:10px;padding:2px 8px">${escapeHtml(f)}</span>`);
  if (!chips.length) chips.push(`<span class="muted small">no stack detected</span>`);

  host.innerHTML = chips.join(" ");
  const rec = (ctx.recommendations || []).length;
  $("#recBadge").textContent = rec;
  $("#recBadge").hidden = rec === 0;
}

// ---- Detail Modal ---------------------------------------------------------

function openDetail(entry) {
  const inst = installedMeta(entry);
  const installed = isInstalled(entry);
  const drift = isDrift(entry);
  const watched = isWatched(entry);

  const envRows = (entry.install?.env || []).map((e) => `
    <tr>
      <td><code>${escapeHtml(e.name)}</code></td>
      <td>${e.required ? "<span class='badge drift' style='font-size:9px'>required</span>" : "<span class='muted small'>optional</span>"}</td>
      <td>${escapeHtml(e.description || "—")}</td>
      <td>${e.url ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noreferrer">docs ↗</a>` : "—"}</td>
    </tr>`).join("");

  const metaRows = [];
  if (entry.homepage) metaRows.push(`<div class="detail-meta-item"><strong>Homepage:</strong> <a href="${escapeHtml(entry.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(entry.homepage)} ↗</a></div>`);
  if (entry.repo) metaRows.push(`<div class="detail-meta-item"><strong>Repository:</strong> <a href="${escapeHtml(entry.repo)}" target="_blank" rel="noreferrer">${escapeHtml(entry.repo)} ↗</a></div>`);
  if (entry.license) metaRows.push(`<div class="detail-meta-item"><strong>License:</strong> ${escapeHtml(entry.license)}</div>`);
  if (entry.updatedAt) metaRows.push(`<div class="detail-meta-item"><strong>Last Upstream Commit:</strong> ${formatDate(entry.updatedAt)} <span class="muted">(${relativeTime(entry.updatedAt)})</span></div>`);
  if (entry.lastCommit?.sha) metaRows.push(`<div class="detail-meta-item"><strong>Commit:</strong> <code>${escapeHtml(entry.lastCommit.sha.slice(0, 7))}</code> ${escapeHtml(entry.lastCommit.message || "")}</div>`);
  if (inst) {
    metaRows.push(`<div class="detail-meta-item"><strong>Installed Locally:</strong> ${formatDate(inst.installedAt)} <span class="muted">(${relativeTime(inst.installedAt)})</span></div>`);
    metaRows.push(`<div class="detail-meta-item"><strong>Last Detected:</strong> ${formatDate(inst.lastSeenAt)} <span class="muted">(${relativeTime(inst.lastSeenAt)})</span></div>`);
    metaRows.push(`<div class="detail-meta-item"><strong>Source:</strong> <code>${escapeHtml(inst.source)}</code></div>`);
  }

  const tags = (entry.tags || []).map((t) =>
    `<span class="tag" data-tag="${escapeHtml(t)}" role="button">${escapeHtml(t)}</span>`).join(" ");

  const badges = [];
  if (entry.verified) badges.push(`<span class="badge verified">verified</span>`);
  if (entry.featured) badges.push(`<span class="badge featured">featured</span>`);
  if (entry.isNew) badges.push(`<span class="badge new">new since refresh</span>`);
  if (entry.isLocal) badges.push(`<span class="badge local">local</span>`);
  if (installed) badges.push(`<span class="badge installed">installed</span>`);
  if (drift) badges.push(`<span class="badge drift">drift</span>`);
  if (watched) badges.push(`<span class="badge watchlist">watchlist</span>`);

  const typeCls = entry.type === "plugin" ? "plugin" : entry.type === "skill" ? "skill" : "mcp";

  $("#detailBody").innerHTML = `
    <div class="detail">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <h2 id="detailTitle" style="margin:0">${escapeHtml(entry.name)}</h2>
        <span class="type-tag ${typeCls}">${escapeHtml(entry.type)}</span>
      </div>
      <p class="sub">${escapeHtml(entry.tagline || "")}</p>
      <div class="badges" style="margin-bottom:12px">${badges.join(" ")}</div>
      <p style="color:var(--fg-muted);line-height:1.6">${escapeHtml(entry.description || entry.tagline || "No description provided.")}</p>

      <div class="section-label">Install Command</div>
      <div class="cmd-box-wrap">
        <pre class="cmd" id="cmdBox">${escapeHtml(entry.install?.command || "")}</pre>
        <button id="btnCopyInline" class="btn-copy-inline primary" aria-label="Copy install command">Copy</button>
      </div>

      <div class="actions-row">
        <button id="btnInstall" class="primary">${installed ? "Reinstall" : "Install"}</button>
        <button id="btnUninstall" class="danger" ${installed || drift ? "" : "disabled"}>Uninstall</button>
        <button id="btnWatch" class="ghost">
          <svg class="ui-icon" aria-hidden="true"><use href="#${watched ? "icon-star-filled" : "icon-star-outline"}"></use></svg>
          <span>${watched ? "Remove from Watchlist" : "Add to Watchlist"}</span>
        </button>
        <button id="btnMarkManual" class="ghost">Mark Installed</button>
        <button id="btnForget" class="ghost">Forget Local Record</button>
      </div>

      <div id="installOutput"></div>

      ${entry.install?.env?.length ? `
        <div class="section-label">Environment Variables</div>
        <table class="env-table">
          <thead><tr><th>Name</th><th>Requirement</th><th>Description</th><th>Documentation</th></tr></thead>
          <tbody>${envRows}</tbody>
        </table>` : ""}

      <div class="section-label">Package Metadata</div>
      <div class="detail-meta-grid">${metaRows.join("")}</div>

      <div class="section-label">Tags</div>
      <div class="tags" style="margin-top:6px">${tags}</div>
    </div>`;

  $("#btnCopyInline")?.addEventListener("click", () => copyToClipboard(entry.install?.command || "", $("#btnCopyInline")));
  $("#btnInstall")?.addEventListener("click", () => runInstall(entry, installed));
  $("#btnUninstall")?.addEventListener("click", () => runUninstall(entry));
  $("#btnWatch")?.addEventListener("click", () => toggleWatch(entry, !watched));
  $("#btnMarkManual")?.addEventListener("click", () => runMarkManual(entry));
  $("#btnForget")?.addEventListener("click", () => runForget(entry));

  $("#detailBody").querySelectorAll(".tag[data-tag]").forEach((tagEl) => {
    tagEl.addEventListener("click", () => {
      closeDetail();
      filterByTag(tagEl.dataset.tag);
    });
  });

  openDetailModal();
}

async function copyToClipboard(text, btnElement = null) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnElement) {
      const origHtml = btnElement.innerHTML;
      btnElement.textContent = "Copied!";
      setTimeout(() => { btnElement.innerHTML = origHtml; }, 2000);
    }
    toast("Copied", "Text copied to clipboard", "success");
  } catch {
    toast("Copy failed", "Browser blocked clipboard write", "error");
  }
}

function showInstallOutput(out, isError) {
  const host = $("#installOutput");
  if (!host) return;
  host.innerHTML = "";
  if (!out) return;

  const wrap = document.createElement("div");
  wrap.style.marginTop = "14px";
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span class="section-label" style="margin:0">Execution Output</span>
      <button id="btnCopyOutput" class="ghost small" style="font-size:10px;padding:2px 8px">Copy logs</button>
    </div>
    <pre class="install-output ${isError ? "error" : ""}"></pre>
  `;
  wrap.querySelector("pre").textContent = out;
  wrap.querySelector("#btnCopyOutput").addEventListener("click", () => {
    copyToClipboard(out, wrap.querySelector("#btnCopyOutput"));
  });
  host.appendChild(wrap);
}

async function runInstall(entry, force = false) {
  const btn = $("#btnInstall");
  if (btn) { btn.disabled = true; btn.textContent = "Installing…"; }
  const isForce = force || isInstalled(entry);
  try {
    const res = await postJson("/api/install", {
      type: entry.type,
      id: entry.id,
      scope: state.installScope || "global",
      cwd: state.contextCwd || "",
      force: isForce,
    });
    showInstallOutput(
      `$ ${res.command}\n[exit ${res.exitCode}]\n` +
      (res.stdout || "") + (res.stderr ? `\n--- stderr ---\n${res.stderr}` : ""),
      !res.ok);
    toast(res.ok ? "Installed" : "Install finished with errors",
      `${entry.name} · exit ${res.exitCode} (${state.installScope === "workspace" ? "project" : "global"})`,
      res.ok ? "success" : "error");
    await refreshInstalled();
    if (!$("#detailModal").classList.contains("hidden")) {
      openDetail({ ...entry });
    }
  } catch (err) {
    showInstallOutput(String(err.message || err), true);
    toast("Install failed", String(err.message || err), "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = isInstalled(entry) ? "Reinstall" : "Install"; }
    render();
    updateStatusPills();
  }
}

async function runUninstall(entry) {
  const btn = $("#btnUninstall");
  if (btn) { btn.disabled = true; btn.textContent = "Uninstalling…"; }
  try {
    const res = await postJson("/api/uninstall", {
      type: entry.type,
      id: entry.id,
      scope: state.installScope || "global",
      cwd: state.contextCwd || "",
    });
    showInstallOutput(
      `$ ${res.command}\n[exit ${res.exitCode}]\n` +
      (res.stdout || "") + (res.stderr ? `\n--- stderr ---\n${res.stderr}` : ""),
      !res.ok);
    toast(res.ok ? "Uninstalled" : "Uninstall finished with errors",
      `${entry.name} · exit ${res.exitCode}`,
      res.ok ? "success" : "error");
    await refreshInstalled();
    if (!$("#detailModal").classList.contains("hidden")) {
      openDetail({ ...entry });
    }
  } catch (err) {
    showInstallOutput(String(err.message || err), true);
    toast("Uninstall failed", String(err.message || err), "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Uninstall"; }
    render();
    updateStatusPills();
  }
}

async function runMarkManual(entry) {
  try {
    await postJson("/api/mark", { type: entry.type, id: entry.id, source: "manual" });
    toast("Marked", `${entry.name} marked as installed manually`, "success");
    await refreshInstalled();
    openDetail({ ...entry });
    render();
    updateStatusPills();
  } catch (err) {
    toast("Mark failed", String(err.message || err), "error");
  }
}

async function runForget(entry) {
  try {
    await delJson(`/api/mark/${entry.type}/${entry.id}`);
    toast("Forgotten", `${entry.name} removed from local records`, "success");
    await refreshInstalled();
    openDetail({ ...entry });
    render();
    updateStatusPills();
  } catch (err) {
    toast("Forget failed", String(err.message || err), "error");
  }
}

async function toggleWatch(entry, wantWatch) {
  try {
    if (wantWatch) {
      await postJson("/api/watchlist", { type: entry.type, id: entry.id });
      toast("Watched", `${entry.name} added to watchlist`, "success");
    } else {
      await delJson(`/api/watchlist/${entry.type}/${entry.id}`);
      toast("Unwatched", `${entry.name} removed from watchlist`, "success");
    }
    await refreshWatchlist();
    if (!$("#detailModal").classList.contains("hidden")) {
      const btnWatch = $("#btnWatch");
      if (btnWatch) {
        btnWatch.innerHTML = `
          <svg class="ui-icon" aria-hidden="true"><use href="#${wantWatch ? "icon-star-filled" : "icon-star-outline"}"></use></svg>
          <span>${wantWatch ? "Remove from Watchlist" : "Add to Watchlist"}</span>
        `;
      }
    }
    render();
    updateStatusPills();
  } catch (err) {
    toast("Watch toggle failed", String(err.message || err), "error");
  }
}

// ---- Toasts ---------------------------------------------------------------

function toast(title, body, kind = "info") {
  const host = $("#toastHost");
  if (!host) return;

  const el = document.createElement("div");
  el.className = `toast ${kind}`;

  const iconSvg = kind === "success"
    ? `<svg class="ui-icon" style="color:var(--success);width:16px;height:16px" aria-hidden="true"><use href="#icon-check"></use></svg>`
    : kind === "error"
    ? `<svg class="ui-icon" style="color:var(--danger);width:16px;height:16px" aria-hidden="true"><use href="#icon-close"></use></svg>`
    : kind === "warn"
    ? `<svg class="ui-icon" style="color:var(--warn);width:16px;height:16px" aria-hidden="true"><use href="#icon-power"></use></svg>`
    : `<svg class="ui-icon" style="color:var(--cline-cyan);width:16px;height:16px" aria-hidden="true"><use href="#icon-sparkle"></use></svg>`;

  el.innerHTML = `
    <div style="flex-shrink:0;display:grid;place-items:center;padding-top:2px">${iconSvg}</div>
    <div class="toast-body">
      <div class="title">${escapeHtml(title)}</div>
      ${body ? `<div class="body">${escapeHtml(body)}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss notification">
      <svg class="ui-icon" aria-hidden="true"><use href="#icon-close"></use></svg>
    </button>
  `;

  el.querySelector(".toast-close").addEventListener("click", () => el.remove());
  host.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 250);
  }, 4500);
}

// ---- Refresh + Data Loaders ------------------------------------------------

function renderSkeletons() {
  const grid = resultsEl();
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center;">
        <div class="skeleton-box skeleton-icon"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div class="skeleton-box skeleton-title"></div>
          <div class="skeleton-box skeleton-line short"></div>
        </div>
      </div>
      <div class="skeleton-box skeleton-line"></div>
      <div class="skeleton-box skeleton-line short"></div>
      <div class="skeleton-box skeleton-tags"></div>
    `;
    grid.appendChild(card);
  }
}

async function loadCatalog() {
  if (!state.catalog || !state.catalog.entries?.length) {
    renderSkeletons();
  }
  const cat = await getJson("/api/catalog");
  state.catalog = cat;
  updateCounts();
  updateStatusPills();
  renderTagFilter();
  render();
}

async function refreshInstalled() {
  state.installed = await getJson("/api/installed");
  updateStatusPills();
}

async function refreshWatchlist() {
  state.watchlist = await getJson("/api/watchlist");
}

async function refreshContext() {
  const cwd = state.contextCwd || undefined;
  const url = cwd ? `/api/context?cwd=${encodeURIComponent(cwd)}` : "/api/context";
  try {
    state.context = await getJson(url);
  } catch {
    state.context = null;
  }
  renderContextSummary();
}

async function refreshStatus() {
  try {
    const s = await getJson("/api/status");
    const cliPill = $("#pillCli");
    if (cliPill) {
      if (s.clinePath) {
        cliPill.innerHTML = `<span class="dot"></span> cline: CLI ready`;
        cliPill.className = "pill ok";
      } else if (s.clineRoots && s.clineRoots.length) {
        cliPill.innerHTML = `<span class="dot"></span> cline: ${s.clineRoots.length} root${s.clineRoots.length > 1 ? "s" : ""}`;
        cliPill.className = "pill ok";
      } else {
        cliPill.innerHTML = `<span class="dot"></span> cline CLI: not found`;
        cliPill.className = "pill warn";
      }
    }
  } catch {}
}

async function reloadAll() {
  await refreshInstalled();
  await loadCatalog();
  await refreshWatchlist();
  await refreshContext();
  await refreshStatus();
  await refreshHealthStatus();
}

// ---- Navigation & Mobile Drawer --------------------------------------------

function switchTab(name) {
  state.activeTab = name;
  for (const t of document.querySelectorAll(".tab")) {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const p of document.querySelectorAll(".tab-pane")) {
    p.classList.toggle("active", p.id === `tab-${name}`);
  }
  document.querySelector("main").classList.toggle("no-sidebar",
    !["catalog", "watchlist"].includes(name));

  toggleMobileSidebar(false);
  render();
}

function toggleMobileSidebar(show) {
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebarBackdrop");
  if (!sidebar || !backdrop) return;
  const isOpen = show ?? !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  backdrop.classList.toggle("hidden", !isOpen);
}

// ---- Event Wiring ---------------------------------------------------------

function wireFilters() {
  const searchInp = $("#search");
  const searchClear = $("#searchClear");

  searchInp.addEventListener("input", (e) => {
    state.filter.search = e.target.value;
    updateSearchClearBtn();
    render();
  });

  searchClear.addEventListener("click", () => {
    searchInp.value = "";
    state.filter.search = "";
    updateSearchClearBtn();
    searchInp.focus();
    render();
  });

  $("#typeFilter").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-type]");
    if (!btn) return;
    state.filter.type = btn.dataset.type;
    for (const b of document.querySelectorAll("#typeFilter button")) {
      b.classList.toggle("active", b === btn);
    }
    render();
  });

  const bindCheck = (id, prop) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
      state.filter[prop] = e.target.checked;
      render();
    });
  };

  bindCheck("#onlyVerified", "onlyVerified");
  bindCheck("#onlyFeatured", "onlyFeatured");
  bindCheck("#onlyInstalled", "onlyInstalled");
  bindCheck("#onlyLocal", "onlyLocal");
  bindCheck("#onlyNew", "onlyNew");
  bindCheck("#onlyWatchlist", "onlyWatchlist");
  bindCheck("#hideDrift", "hideDrift");

  $("#sortBy").addEventListener("change", (e) => {
    state.filter.sortBy = e.target.value;
    render();
  });

  $("#btnClearTags")?.addEventListener("click", () => {
    state.filter.tags.clear();
    renderTagFilter();
    render();
  });

  $("#contextCwd").value = state.contextCwd;
  $("#contextCwd").addEventListener("change", async (e) => {
    state.contextCwd = e.target.value.trim();
    localStorage.setItem("clineMarketplace.contextCwd", state.contextCwd);
    if (state.contextCwd) {
      try {
        await postJson("/api/workspaces/recent", { path: state.contextCwd });
      } catch {}
    }
    refreshContext();
    refreshInstalled();
  });

  wireWorkspaceScope();

  $("#activeFiltersBar")?.addEventListener("click", (e) => {
    const clearTarget = e.target.closest("[data-clear]");
    if (clearTarget) {
      const prop = clearTarget.dataset.clear;
      if (prop === "search") {
        state.filter.search = "";
        const searchInput = $("#search");
        if (searchInput) searchInput.value = "";
        updateSearchClearBtn();
      } else if (prop === "type") {
        state.filter.type = "all";
        for (const b of document.querySelectorAll("#typeFilter button")) {
          b.classList.toggle("active", b.dataset.type === "all");
        }
      } else if (state.filter[prop] !== undefined) {
        state.filter[prop] = false;
        const el = $(`#${prop}`);
        if (el) el.checked = false;
      }
      render();
      return;
    }

    const clearTagTarget = e.target.closest("[data-clear-tag]");
    if (clearTagTarget) {
      state.filter.tags.delete(clearTagTarget.dataset.clearTag);
      renderTagFilter();
      render();
      return;
    }
  });

  $("#btnClearAllFilters")?.addEventListener("click", resetAllFilters);
  $("#btnEmptyClearFilters")?.addEventListener("click", resetAllFilters);
  $("#btnGoToCatalog")?.addEventListener("click", () => switchTab("catalog"));
}

async function wireWorkspaceScope() {
  const scopeGlobal = $("#scopeGlobalBtn");
  const scopeWorkspace = $("#scopeWorkspaceBtn");
  const wsSelect = $("#recentWorkspacesSelect");
  const contextCwdInput = $("#contextCwd");

  state.installScope = localStorage.getItem("clineMarketplace.installScope") || "global";
  updateScopeButtons();

  function updateScopeButtons() {
    if (scopeGlobal) scopeGlobal.classList.toggle("active", state.installScope === "global");
    if (scopeWorkspace) scopeWorkspace.classList.toggle("active", state.installScope === "workspace");
  }

  scopeGlobal?.addEventListener("click", () => {
    state.installScope = "global";
    localStorage.setItem("clineMarketplace.installScope", "global");
    updateScopeButtons();
    toast("Scope changed", "Primitives will install globally into your home storage", "info");
  });

  scopeWorkspace?.addEventListener("click", () => {
    state.installScope = "workspace";
    localStorage.setItem("clineMarketplace.installScope", "workspace");
    updateScopeButtons();
    const ws = state.contextCwd || state.context?.cwd || "current project";
    toast("Scope changed", `Primitives will install for project workspace: ${ws}`, "info");
  });

  try {
    const s = await getJson("/api/settings");
    if (s && Array.isArray(s.recentWorkspaces)) {
      renderRecentWorkspaces(s.recentWorkspaces);
    }
  } catch {}

  function renderRecentWorkspaces(workspaces) {
    if (!wsSelect) return;
    wsSelect.innerHTML = '<option value="">Recent Workspaces (Select to Switch)</option>';
    for (const w of workspaces) {
      const opt = document.createElement("option");
      opt.value = w.path;
      opt.textContent = `${w.name} (${w.path})`;
      if (w.path === state.contextCwd) opt.selected = true;
      wsSelect.appendChild(opt);
    }
  }

  wsSelect?.addEventListener("change", async (e) => {
    const p = e.target.value;
    if (!p) return;
    state.contextCwd = p;
    if (contextCwdInput) contextCwdInput.value = p;
    localStorage.setItem("clineMarketplace.contextCwd", p);
    try {
      await postJson("/api/workspaces/recent", { path: p });
    } catch {}
    refreshContext();
    refreshInstalled();
    toast("Workspace switched", p, "success");
  });
}

function wireTabs() {
  for (const t of document.querySelectorAll(".tab")) {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const helpOpen = !$("#helpModal").classList.contains("hidden");
      const detailOpen = !$("#detailModal").classList.contains("hidden");
      const shutdownOpen = !$("#shutdownModal")?.classList.contains("hidden");
      const sidebarOpen = $("#sidebar").classList.contains("open");

      if (helpOpen) { closeHelp(); e.preventDefault(); return; }
      if (detailOpen) { closeDetail(); e.preventDefault(); return; }
      if (shutdownOpen) { closeModal($("#shutdownModal")); e.preventDefault(); return; }
      if (sidebarOpen) { toggleMobileSidebar(false); e.preventDefault(); return; }

      if (state.bulkMode) {
        toggleBulkMode(false);
        e.preventDefault();
        return;
      }

      if (document.activeElement && document.activeElement.matches("input, textarea")) {
        if (document.activeElement === $("#search") && $("#search").value) {
          $("#search").value = "";
          state.filter.search = "";
          updateSearchClearBtn();
          render();
        }
        document.activeElement.blur();
        e.preventDefault();
        return;
      }
      return;
    }

    if (!$("#helpModal").classList.contains("hidden")) {
      handleModalTabTrap(e, $("#helpModal"));
      return;
    }
    if (!$("#detailModal").classList.contains("hidden")) {
      handleModalTabTrap(e, $("#detailModal"));
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target.matches("input, textarea, select")) return;

    if (e.key === "/") {
      e.preventDefault();
      $("#search")?.focus();
      return;
    }
    if (e.key === "b") {
      e.preventDefault();
      toggleBulkMode();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      openHelp();
      return;
    }

    const tabMap = { g: "catalog", r: "recommended", w: "watchlist", s: "stats", c: "changelog", h: "health" };
    if (tabMap[e.key]) {
      e.preventDefault();
      switchTab(tabMap[e.key]);
    }
  });
}

function wireActions() {
  $("#btnToggleSidebar")?.addEventListener("click", () => toggleMobileSidebar());
  $("#sidebarBackdrop")?.addEventListener("click", () => toggleMobileSidebar(false));

  $("#btnHelp")?.addEventListener("click", openHelp);
  $("#btnBulkMode")?.addEventListener("click", () => toggleBulkMode());

  // Bulk bar actions
  $("#bulkSelectAll")?.addEventListener("change", (e) => {
    const visibleEntries = applyFilters();
    if (e.target.checked) {
      for (const entry of visibleEntries) state.selectedKeys.add(entry.key);
    } else {
      for (const entry of visibleEntries) state.selectedKeys.delete(entry.key);
    }
    updateBulkBar();
    render();
  });

  $("#btnBulkInstall")?.addEventListener("click", () => runBulkAction("install"));
  $("#btnBulkUninstall")?.addEventListener("click", () => runBulkAction("uninstall"));
  $("#btnBulkWatch")?.addEventListener("click", () => runBulkAction("watch"));
  $("#btnBulkClear")?.addEventListener("click", () => {
    state.selectedKeys.clear();
    updateBulkBar();
    render();
  });

  $("#btnCopySysInfo")?.addEventListener("click", async () => {
    try {
      const h = await getJson("/api/health");
      const text = JSON.stringify(h, null, 2);
      await copyToClipboard(text, $("#btnCopySysInfo"));
    } catch (err) {
      toast("Copy failed", String(err.message || err), "error");
    }
  });

  $("#btnHealthRefresh")?.addEventListener("click", async () => {
    const btn = $("#btnHealthRefresh");
    btn.disabled = true;
    btn.textContent = "Running…";
    try {
      await renderHealthTab();
      toast("Diagnostics Completed", "Health checks refreshed successfully", "success");
    } finally {
      btn.disabled = false;
      btn.textContent = "Run Diagnostics";
    }
  });

  $("#btnRescan")?.addEventListener("click", async () => {
    const btn = $("#btnRescan");
    if (btn) btn.disabled = true;
    try {
      await refreshInstalled();
      await loadCatalog();
      render();
      updateStatusPills();
      toast("Rescanned", "Local install state refreshed", "success");
    } catch (err) {
      toast("Rescan failed", String(err.message || err), "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("#btnRefresh")?.addEventListener("click", async () => {
    const btn = $("#btnRefresh");
    if (btn) btn.disabled = true;
    const oldLabel = btn ? btn.textContent : "Refresh";
    if (btn) btn.textContent = "Refreshing…";
    try {
      const res = await postJson("/api/refresh", {});
      toast("Catalog refreshed", `${res.entries} entries · meta for ${res.metaCount}`, "success");
      await reloadAll();
    } catch (err) {
      toast("Refresh failed", String(err.message || err) + "\n\nRun `cline-marketplace refresh` from a terminal.", "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldLabel;
      }
    }
  });

  $("#btnExport")?.addEventListener("click", () => {
    window.location.href = "/api/export";
  });

  $("#fileImport")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const res = await postJson("/api/import", { installed: data.installed || [] });
      toast("Imported", `Added ${res.added} entries (total ${res.total})`, "success");
      await refreshInstalled();
      await loadCatalog();
      render();
      updateStatusPills();
    } catch (err) {
      toast("Import failed", String(err.message || err), "error");
    } finally {
      e.target.value = "";
    }
  });

  // Shutdown handlers
  $("#btnShutdown")?.addEventListener("click", () => {
    openModal($("#shutdownModal"));
  });

  $("#btnCancelShutdown")?.addEventListener("click", () => {
    closeModal($("#shutdownModal"));
  });

  $("#btnConfirmShutdown")?.addEventListener("click", async () => {
    const btn = $("#btnConfirmShutdown");
    btn.disabled = true;
    btn.textContent = "Stopping…";
    try {
      await postJson("/api/shutdown", {});
      closeModal($("#shutdownModal"));
      openModal($("#serverStoppedOverlay"));
      toast("Server Stopped", "The local server has been shut down.", "warn");
    } catch {
      // Even if network drops because server exited immediately
      closeModal($("#shutdownModal"));
      openModal($("#serverStoppedOverlay"));
    }
  });

  // Feedback handlers
  $("#btnFeedback")?.addEventListener("click", () => {
    openModal($("#feedbackModal"));
  });
  $("#feedbackClose")?.addEventListener("click", () => {
    closeModal($("#feedbackModal"));
  });
  $("#btnFeedbackDone")?.addEventListener("click", () => {
    closeModal($("#feedbackModal"));
  });
  $("#feedbackModal")?.addEventListener("click", (e) => {
    if (e.target.id === "feedbackModal") closeModal($("#feedbackModal"));
  });

  // Diagnostics copy button
  $("#btnCopySysInfo")?.addEventListener("click", async () => {
    try {
      const h = await getJson("/api/health");
      const text = JSON.stringify(h, null, 2);
      await navigator.clipboard.writeText(text);
      toast("Diagnostics Copied", "System diagnostics JSON copied to clipboard.", "success");
    } catch (err) {
      toast("Copy Failed", err.message, "error");
    }
  });

  // Health refresh button
  $("#btnHealthRefresh")?.addEventListener("click", async () => {
    toast("Running Probes", "Re-evaluating system health...", "info");
    await renderHealthTab();
    toast("Probes Finished", "Diagnostics up to date.", "success");
  });

  // Update banner actions
  $("#btnDismissUpdate")?.addEventListener("click", () => {
    $("#updateBanner")?.classList.add("hidden");
  });
  $("#btnRunUpdate")?.addEventListener("click", async () => {
    const btn = $("#btnRunUpdate");
    btn.disabled = true;
    btn.textContent = "Updating…";
    toast("Updating", "Pulling latest release and running npm install...", "info");
    try {
      const res = await postJson("/api/update/run", {});
      toast("Updated Successfully", res.message || "Update finished! Please restart server.", "success");
      $("#updateBanner")?.classList.add("hidden");
    } catch (err) {
      toast("Update Error", err.message || "Failed to update automatically. Try running git pull.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Update Now";
    }
  });

  // Modal close handlers
  $("#detailClose")?.addEventListener("click", closeDetail);
  $("#detailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "detailModal") closeDetail();
  });

  $("#helpClose")?.addEventListener("click", closeHelp);
  $("#helpCloseFooter")?.addEventListener("click", closeHelp);
  $("#helpModal")?.addEventListener("click", (e) => {
    if (e.target.id === "helpModal") closeHelp();
  });
  $("#shutdownModal")?.addEventListener("click", (e) => {
    if (e.target.id === "shutdownModal") closeModal($("#shutdownModal"));
  });
}

// ---- Initialization --------------------------------------------------------

async function checkUpdate() {
  try {
    const res = await getJson("/api/update/check");
    if (res.hasUpdate) {
      const banner = $("#updateBanner");
      const bannerText = $("#updateBannerText");
      if (banner && bannerText) {
        bannerText.textContent = `A new version (v${res.remoteVersion}) is available on GitHub (current: v${res.currentVersion}).`;
        banner.classList.remove("hidden");
      }
      toast(`Update Available: v${res.remoteVersion}`, "Click 'Update Now' in the top banner or run `cline-marketplace update`.", "warn");
    }
  } catch {}
}

(async function init() {
  wireFilters();
  wireTabs();
  wireActions();
  try {
    await reloadAll();
    checkUpdate();
  } catch (err) {
    toast("Failed to load catalog", String(err.message || err), "error");
  }
})();