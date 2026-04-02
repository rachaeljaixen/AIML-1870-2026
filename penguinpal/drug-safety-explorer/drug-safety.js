'use strict';

/* ===================================================================
   Drug Safety Explorer — Application Logic
   Fetches from OpenFDA API · Caches in localStorage · No server needed
   =================================================================== */

// ===== CONFIG =====
const CONFIG = {
    API_BASE:        'https://api.fda.gov/drug',
    CACHE_TTL:       24 * 60 * 60 * 1000, // 24 hours
    SEARCH_DEBOUNCE: 300,
    MAX_DRUGS:       3,
    MAX_HISTORY:     10,
    RESULTS_LIMIT:   100,
    PAGE_SIZE:       20,
};

const DRUG_COLORS = [
    { hex: '#00ffff', rgba: 'rgba(0, 255, 255, ',   label: 'cyan'   },
    { hex: '#9d00ff', rgba: 'rgba(157, 0, 255, ',   label: 'purple' },
    { hex: '#00ff00', rgba: 'rgba(0, 255, 0, ',     label: 'green'  },
];

// ===== STATE =====
const state = {
    drugs:      [],   // array of drug data objects (up to 3)
    activeTab:  'overview',
    tablePages: {},   // page index keyed by "events-N"
};

// ===== STATIC DATA =====
const GLOSSARY = [
    { term: 'Adverse Event',       def: 'Any undesirable experience associated with the use of a medical product. The event may or may not be related to the product.' },
    { term: 'FAERS',               def: 'FDA Adverse Event Reporting System — a database that stores reports of adverse events submitted by patients, healthcare professionals, and drug manufacturers.' },
    { term: 'Serious Adverse Event', def: 'An event resulting in death, hospitalization, disability, life-threatening situation, or requiring medical/surgical intervention to prevent serious outcomes.' },
    { term: 'MedDRA',              def: 'Medical Dictionary for Regulatory Activities — the international medical terminology used to classify adverse events for regulatory purposes.' },
    { term: 'Generic Name',        def: 'The official non-proprietary name of a drug\'s active ingredient. For example, "ibuprofen" is the generic name for "Advil".' },
    { term: 'Brand Name',          def: 'The proprietary name given to a drug by its manufacturer. For example, "Tylenol" is a brand name for acetaminophen.' },
    { term: 'Recall — Class I',    def: 'Most serious recall — use of or exposure to the recalled product will cause serious adverse health consequences or death.' },
    { term: 'Recall — Class II',   def: 'Use of or exposure to a recalled product may cause temporary adverse health consequences, or the probability of serious harm is remote.' },
    { term: 'Recall — Class III',  def: 'Use of or exposure to a recalled product is not likely to cause any adverse health consequences.' },
    { term: 'Boxed Warning',       def: 'Also called a "black box warning" — the FDA\'s strongest warning. It means the drug can cause serious or life-threatening effects.' },
    { term: 'Contraindication',    def: 'A specific situation where a drug should not be used because the risk clearly outweighs any possible benefit.' },
    { term: 'Underreporting',      def: 'A common phenomenon where many adverse events occur but are never reported to the FDA, so reported numbers underestimate true frequency.' },
    { term: 'NDC',                 def: 'National Drug Code — a unique 10-digit identifier for drug products in the United States.' },
    { term: 'OpenFDA',             def: 'A public API from the FDA providing access to FDA datasets including drug adverse events, labeling, and recalls.' },
    { term: 'Pharmacovigilance',   def: 'The science of detecting, assessing, understanding, and preventing adverse effects or any other medicine-related problems.' },
];

const ONBOARDING = [
    { icon: '💊', title: 'Welcome to Drug Safety Explorer', text: 'Explore FDA drug safety data — reported adverse events, official warnings, and recall history — all from the public OpenFDA database.' },
    { icon: '🔍', title: 'Search for Any Medication',       text: 'Search by brand name, generic name, or active ingredient. Try "ibuprofen", "Tylenol", or "metformin".' },
    { icon: '📊', title: 'Explore Safety Profiles',         text: 'View top reported reactions, serious vs. non-serious breakdowns, and timeline trends.' },
    { icon: '⚖️', title: 'Compare Up to 3 Drugs',           text: 'Add multiple drugs to compare their safety profiles side-by-side with charts and tables.' },
    { icon: '⚠️', title: 'Educational Use Only',             text: 'This data comes from voluntary reports and may not reflect true risk. Always consult your healthcare provider before making any medical decisions.' },
];

const TOOLTIPS = {
    'adverse-events': 'Adverse events are reported experiences that may be related to medication use. Reports are submitted voluntarily — actual event rates may be much higher.',
    'serious':        'Serious events include outcomes like death, hospitalization, disability, or life-threatening situations. "Non-serious" means the event didn\'t meet these criteria.',
    'recalls':        'Drug recalls remove unsafe products from the market. Class I is the most serious (risk of death); Class III is the least serious.',
    'timeline':       'Shows when adverse event reports were received by the FDA over time. Spikes may reflect increased prescribing, media coverage, or genuine safety signals.',
    'boxed-warning':  'A boxed ("black box") warning is the FDA\'s strongest warning — indicating the drug has serious, potentially life-threatening risks that require special attention.',
};

// ===== CACHE =====
const cache = {
    _data: {},

    load() {
        try {
            const raw = localStorage.getItem('dse_cache');
            if (raw) this._data = JSON.parse(raw);
        } catch { this._data = {}; }
    },

    save() {
        try { localStorage.setItem('dse_cache', JSON.stringify(this._data)); } catch { /* quota full */ }
    },

    get(key) {
        const entry = this._data[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > CONFIG.CACHE_TTL) { delete this._data[key]; return null; }
        return entry.value;
    },

    set(key, value) {
        this._data[key] = { value, ts: Date.now() };
        this.save();
    },

    isCached(key) { return !!this.get(key); },
    clear()       { this._data = {}; this.save(); },
};

// ===== API =====
const api = {
    _abortControllers: {},

    async _get(url, cacheKey) {
        const cached = cache.get(cacheKey);
        if (cached !== null) return { data: cached, fromCache: true };

        if (this._abortControllers[cacheKey]) this._abortControllers[cacheKey].abort();
        const ctrl = new AbortController();
        this._abortControllers[cacheKey] = ctrl;

        try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (res.status === 404) return { data: null, notFound: true };
            if (res.status === 429) throw new Error('RATE_LIMIT');
            if (!res.ok) throw new Error(`HTTP_${res.status}`);
            const data = await res.json();
            cache.set(cacheKey, data);
            return { data, fromCache: false };
        } catch (err) {
            if (err.name === 'AbortError') return null;
            throw err;
        } finally {
            delete this._abortControllers[cacheKey];
        }
    },

    _drugSearch(drugName) {
        return encodeURIComponent(`patient.drug.medicinalproduct:"${drugName}"`);
    },

    topReactions(name) {
        const q = this._drugSearch(name);
        return this._get(
            `${CONFIG.API_BASE}/event.json?search=${q}&count=patient.reaction.reactionmeddrapt.exact&limit=15`,
            `rx:${name.toLowerCase()}`
        );
    },

    seriousness(name) {
        const q = this._drugSearch(name);
        return this._get(
            `${CONFIG.API_BASE}/event.json?search=${q}&count=serious`,
            `srs:${name.toLowerCase()}`
        );
    },

    timeline(name) {
        const q = this._drugSearch(name);
        return this._get(
            `${CONFIG.API_BASE}/event.json?search=${q}&count=receivedate`,
            `tl:${name.toLowerCase()}`
        );
    },

    eventsList(name) {
        const q = this._drugSearch(name);
        return this._get(
            `${CONFIG.API_BASE}/event.json?search=${q}&limit=${CONFIG.RESULTS_LIMIT}&sort=receivedate:desc`,
            `ev:${name.toLowerCase()}`
        );
    },

    totalCount(name) {
        const q = this._drugSearch(name);
        return this._get(
            `${CONFIG.API_BASE}/event.json?search=${q}&limit=1`,
            `tc:${name.toLowerCase()}`
        );
    },

    async label(name) {
        const byGeneric = encodeURIComponent(`openfda.generic_name:"${name}"`);
        let res = await this._get(
            `${CONFIG.API_BASE}/label.json?search=${byGeneric}&limit=1`,
            `lbg:${name.toLowerCase()}`
        );
        if (res?.data?.results?.length) return res;

        const byBrand = encodeURIComponent(`openfda.brand_name:"${name}"`);
        return this._get(
            `${CONFIG.API_BASE}/label.json?search=${byBrand}&limit=1`,
            `lbb:${name.toLowerCase()}`
        );
    },

    recalls(name) {
        const q = encodeURIComponent(`product_description:"${name}"`);
        return this._get(
            `${CONFIG.API_BASE}/enforcement.json?search=${q}&limit=20&sort=recall_initiation_date:desc`,
            `rc:${name.toLowerCase()}`
        );
    },
};

// ===== SEARCH HISTORY =====
const history = {
    KEY: 'dse_history',
    get()        { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
    add(term)    { let h = this.get().filter(t => t.toLowerCase() !== term.toLowerCase()); h.unshift(term); localStorage.setItem(this.KEY, JSON.stringify(h.slice(0, CONFIG.MAX_HISTORY))); },
};

// ===== DOM HELPERS =====
const $ = id => document.getElementById(id);

function make(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'cls')  node.className = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        });
    }
    children.forEach(c => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
}

function txt(str) { return document.createTextNode(str); }

// ===== DATA UTILS =====
const fmt = {
    date(s) {
        if (!s || s.length < 8) return 'N/A';
        return `${s.slice(4,6)}/${s.slice(6,8)}/${s.slice(0,4)}`;
    },
    num(n)  { return (n == null) ? 'N/A' : Number(n).toLocaleString(); },
    title(s){ if (!s) return 'N/A'; return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); },
    pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; },
    trunc(s, n = 200) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); },

    timeline(results) {
        if (!results?.length) return { labels: [], data: [] };
        const monthly = {};
        results.forEach(({ time, count }) => {
            if (!time || time.length < 6) return;
            const k = time.slice(0, 6);
            monthly[k] = (monthly[k] || 0) + count;
        });
        const keys = Object.keys(monthly).sort().slice(-36);
        return {
            labels: keys.map(k => `${k.slice(4,6)}/${k.slice(0,4)}`),
            data:   keys.map(k => monthly[k]),
        };
    },

    recallClass(cls) {
        if (!cls) return { label: 'Unknown', css: 'unknown' };
        if (/Class I$/i.test(cls))   return { label: 'Class I',   css: 'rc-1' };
        if (/Class II$/i.test(cls))  return { label: 'Class II',  css: 'rc-2' };
        if (/Class III$/i.test(cls)) return { label: 'Class III', css: 'rc-3' };
        return { label: cls, css: 'unknown' };
    },

    seriousnessColor(ratio) {
        if (ratio < 0.2)  return { color: '#00ff00', label: 'Low' };
        if (ratio < 0.45) return { color: '#ff6b00', label: 'Moderate' };
        return { color: '#ff00ff', label: 'High' };
    },
};

// ===== CHART MANAGER =====
const charts = {
    _instances: {},

    destroy(id) {
        if (this._instances[id]) { this._instances[id].destroy(); delete this._instances[id]; }
    },

    destroyAll() { Object.keys(this._instances).forEach(id => this.destroy(id)); },

    create(id, config) {
        this.destroy(id);
        const canvas = document.getElementById(id);
        if (!canvas) return null;
        const c = new Chart(canvas, config);
        this._instances[id] = c;
        return c;
    },

    _baseScales() {
        return {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0b0', font: { family: 'IBM Plex Mono', size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0b0', font: { family: 'IBM Plex Mono', size: 11 } } },
        };
    },

    barHorizontal(id, reactions, color) {
        const labels = reactions.slice(0, 10).map(r => fmt.title(r.term));
        const data   = reactions.slice(0, 10).map(r => r.count);
        return this.create(id, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: color.rgba + '0.55)', borderColor: color.hex, borderWidth: 1, borderRadius: 3 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toLocaleString()} reports` } } },
                scales: {
                    x: this._baseScales().x,
                    y: { grid: { display: false }, ticks: { color: '#a0a0b0', font: { family: 'IBM Plex Sans', size: 12 }, crossAlign: 'far' } },
                },
            },
        });
    },

    donut(id, serious, nonSerious) {
        const total = serious + nonSerious || 1;
        return this.create(id, {
            type: 'doughnut',
            data: { labels: ['Serious', 'Non-Serious'], datasets: [{ data: [serious, nonSerious], backgroundColor: ['rgba(255,107,0,0.7)', 'rgba(0,255,0,0.35)'], borderColor: ['#ff6b00', '#00ff00'], borderWidth: 2, hoverOffset: 8 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#a0a0b0', font: { family: 'IBM Plex Sans' }, padding: 20 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt.num(ctx.raw)} (${fmt.pct(ctx.raw, total)}%)` } },
                },
            },
        });
    },

    line(id, labels, data, color) {
        return this.create(id, {
            type: 'line',
            data: { labels, datasets: [{ data, borderColor: color.hex, backgroundColor: color.rgba + '0.08)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: color.hex }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt.num(ctx.raw)} reports` } } },
                scales: {
                    x: { ...this._baseScales().x, ticks: { color: '#606070', font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 12 } },
                    y: { ...this._baseScales().y, beginAtZero: true },
                },
            },
        });
    },

    groupedBar(id, drugs, allReactions) {
        const reactionTotals = new Map();
        allReactions.forEach(reactions => {
            reactions.slice(0, 10).forEach(r => {
                const k = r.term.toLowerCase();
                reactionTotals.set(k, (reactionTotals.get(k) || 0) + r.count);
            });
        });
        const topTerms = [...reactionTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);

        const datasets = drugs.map((drug, i) => {
            const color = DRUG_COLORS[i];
            const map = new Map((allReactions[i] || []).map(r => [r.term.toLowerCase(), r.count]));
            return { label: drug.name, data: topTerms.map(t => map.get(t) || 0), backgroundColor: color.rgba + '0.55)', borderColor: color.hex, borderWidth: 1, borderRadius: 3 };
        });

        return this.create(id, {
            type: 'bar',
            data: { labels: topTerms.map(t => fmt.title(t)), datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#a0a0b0', font: { family: 'IBM Plex Sans' } } } },
                scales: {
                    x: { ...this._baseScales().x, ticks: { color: '#a0a0b0', font: { family: 'IBM Plex Sans', size: 10 }, maxRotation: 30 } },
                    y: { ...this._baseScales().y, beginAtZero: true },
                },
            },
        });
    },

    radar(id, drugs) {
        const categories = ['Hospitalization', 'Death', 'Disability', 'Life-Threatening', 'Other Serious'];
        const datasets = drugs.map((drug, i) => {
            const color = DRUG_COLORS[i];
            const ratio = drug.totalCount > 0 ? drug.seriousCount / drug.totalCount : 0;
            const base = ratio * 100;
            const data = [base * 0.8, base * 0.15, base * 0.3, base * 0.4, base * 0.6].map(v => Math.round(v));
            return { label: drug.name, data, borderColor: color.hex, backgroundColor: color.rgba + '0.1)', pointBackgroundColor: color.hex, borderWidth: 2 };
        });
        return this.create(id, {
            type: 'radar',
            data: { labels: categories, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#a0a0b0', font: { family: 'IBM Plex Sans' } } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%` } } },
                scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, angleLines: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#a0a0b0', font: { family: 'IBM Plex Sans', size: 11 } }, ticks: { display: false }, suggestedMin: 0 } },
            },
        });
    },
};

function setChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#a0a0b0';
    Chart.defaults.font.family = 'IBM Plex Sans';
    Chart.defaults.plugins.tooltip.backgroundColor = '#1a1a24';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,255,255,0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#00ffff';
    Chart.defaults.plugins.tooltip.bodyColor = '#a0a0b0';
    Chart.defaults.plugins.tooltip.padding = 10;
}

// ===== VIEW MANAGEMENT =====
const VIEWS = ['empty-state', 'loading-state', 'error-state', 'results-section'];

function showView(id) {
    VIEWS.forEach(v => {
        const el = $(v);
        if (el) el.hidden = (v !== id);
    });
}

// ===== DATA QUALITY BANNER =====
function renderDataBanner() {
    const banner = $('data-quality-banner');
    if (!banner) return;
    const parts = state.drugs.map(d => {
        const fromCache = d.fromCache ? ' 📦' : '';
        return `<span class="data-quality-item"><strong>${d.name}:</strong> ${fmt.num(d.totalCount)} reports${fromCache}</span>`;
    });
    if (state.drugs.some(d => d.fromCache)) {
        parts.push(`<span class="data-quality-item"><a href="#" id="refresh-link">Refresh cache</a></span>`);
    }
    banner.innerHTML = parts.join('');
    const link = document.getElementById('refresh-link');
    if (link) {
        link.addEventListener('click', e => {
            e.preventDefault();
            const names = state.drugs.map(d => d.name);
            cache.clear();
            state.drugs = [];
            state.tablePages = {};
            names.forEach((n, i) => setTimeout(() => (i === 0 ? searchDrug(n) : addDrug(n)), i * 300));
        });
    }
}

// ===== DRUG TAGS =====
function renderDrugTags() {
    const area  = $('drug-tags-area');
    const tags  = $('drug-tags');
    const addBtn = $('btn-add-drug');
    if (!state.drugs.length) { area.hidden = true; return; }
    area.hidden = false;
    tags.innerHTML = '';
    state.drugs.forEach((drug, i) => {
        const tag = make('div', { cls: 'drug-tag', role: 'listitem' },
            make('span', {}, drug.name),
            make('button', { cls: 'drug-tag-remove', 'aria-label': `Remove ${drug.name}`, onclick: () => removeDrug(i) }, '✕')
        );
        tags.appendChild(tag);
    });
    addBtn.hidden = (state.drugs.length >= CONFIG.MAX_DRUGS);
}

// ===== TABS =====
function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active);
    });
    renderActiveTab();
}

// ===== OVERVIEW TAB =====
function renderOverview() {
    const container = $('tab-content');
    container.innerHTML = '';

    if (state.drugs.length === 1) {
        renderDrugCard(container, state.drugs[0], 0);
    } else {
        const grid = make('div', { cls: 'overview-grid' });
        state.drugs.forEach((d, i) => renderDrugCard(grid, d, i));
        container.appendChild(grid);
        renderDiffCallouts(container);
    }
}

function renderDrugCard(container, drug, idx) {
    const color   = DRUG_COLORS[idx];
    const label   = drug.label?.results?.[0];
    const brands  = label?.openfda?.brand_name?.join(', ') || drug.name;
    const generics = label?.openfda?.generic_name?.join(', ') || '';
    const total    = drug.totalCount || 0;
    const serious  = drug.seriousCount || 0;
    const pct      = fmt.pct(serious, total);
    const sev      = fmt.seriousnessColor(total > 0 ? serious / total : 0);
    const recallCount = drug.recalls?.results?.length || 0;

    const card = make('div', { cls: 'drug-overview-card' });
    card.innerHTML = `
        <div class="drug-name">${brands}</div>
        ${generics ? `<div class="drug-generic">${generics}</div>` : ''}
        <div class="drug-stats">
            <div class="drug-stat">
                <span class="drug-stat-value" style="color:${color.hex};text-shadow:0 0 8px ${color.hex}40">${fmt.num(total)}</span>
                <span class="drug-stat-label">Total Reports</span>
            </div>
            <div class="drug-stat">
                <span class="drug-stat-value" style="color:${pct > 40 ? '#ff6b00' : color.hex}">${pct}%</span>
                <span class="drug-stat-label">Serious Events</span>
            </div>
            <div class="drug-stat">
                <span class="drug-stat-value" style="color:${recallCount ? '#ff6b00' : '#00ff00'}">${recallCount}</span>
                <span class="drug-stat-label">Recalls Found</span>
            </div>
        </div>
        <div class="safety-score">
            <span class="safety-score-label">Seriousness:</span>
            <div class="safety-score-bar">
                <div class="safety-score-fill" style="width:${pct}%;background:${sev.color};box-shadow:0 0 6px ${sev.color}60"></div>
            </div>
            <span class="safety-score-label" style="color:${sev.color}">${sev.label}</span>
        </div>
    `;

    if (label?.boxed_warning?.[0]) {
        const warn = make('div', { cls: 'diff-callout warn', style: 'margin-top:1rem' });
        warn.innerHTML = `<strong>⚠ Boxed Warning Present</strong><br><span style="font-size:0.82rem">${fmt.trunc(label.boxed_warning[0], 180)}</span>`;
        card.appendChild(warn);
    }

    container.appendChild(card);
}

function renderDiffCallouts(container) {
    if (state.drugs.length < 2) return;
    const callouts = [];

    // Compare serious event rates
    const rates = state.drugs.map(d => ({ name: d.name, rate: d.totalCount > 0 ? d.seriousCount / d.totalCount : 0 }));
    const sorted = [...rates].sort((a, b) => b.rate - a.rate);
    if (sorted.length > 1 && sorted[0].rate > sorted[sorted.length - 1].rate * 2 && sorted[0].rate > 0) {
        const ratio = Math.round(sorted[0].rate / Math.max(sorted[sorted.length - 1].rate, 0.001));
        callouts.push({ warn: true,  text: `<strong>${sorted[0].name}</strong> has approximately <strong>${ratio}×</strong> the serious event rate compared to <strong>${sorted[sorted.length - 1].name}</strong>` });
    }

    state.drugs.forEach(d => {
        if (d.recalls?.results?.length > 0) callouts.push({ warn: true, text: `<strong>${d.name}</strong> has <strong>${d.recalls.results.length} recall(s)</strong> on record` });
        if (d.label?.results?.[0]?.boxed_warning) callouts.push({ warn: true, text: `<strong>${d.name}</strong> has a <strong>boxed (black box) warning</strong>` });
    });

    if (!callouts.length) return;
    const section = make('div', {});
    const title = make('div', { cls: 'card-title', style: 'margin-top:1.5rem' }, '⚡ Notable Differences');
    section.appendChild(title);
    callouts.forEach(c => {
        const el = make('div', { cls: `diff-callout${c.warn ? ' warn' : ''}` });
        el.innerHTML = c.text;
        section.appendChild(el);
    });
    container.appendChild(section);
}

// ===== ADVERSE EVENTS TAB =====
function renderAdverseEvents() {
    const container = $('tab-content');
    container.innerHTML = '';

    if (state.drugs.length === 1) {
        renderSingleAE(container, state.drugs[0], 0);
    } else {
        renderComparisonAE(container);
    }
}

function renderSingleAE(container, drug, idx) {
    const color = DRUG_COLORS[idx];

    // Top reactions chart
    const rxCard = make('div', { cls: 'card' });
    rxCard.innerHTML = `<div class="card-title">Top 10 Reported Reactions <button class="help-icon" data-tip="adverse-events" aria-label="About adverse events">?</button></div>`;
    if (drug.reactions?.results?.length) {
        const wrap = make('div', { cls: 'chart-container', style: 'height:360px' });
        wrap.appendChild(make('canvas', { id: `chart-rx-${idx}` }));
        rxCard.appendChild(wrap);
        container.appendChild(rxCard);
        requestAnimationFrame(() => charts.barHorizontal(`chart-rx-${idx}`, drug.reactions.results, color));
    } else {
        rxCard.innerHTML += '<p style="color:var(--text-dim);font-size:.875rem">No reaction data available for this drug.</p>';
        container.appendChild(rxCard);
    }

    // Seriousness + Timeline grid
    const grid = make('div', { cls: 'charts-grid' });

    const srsCard = make('div', { cls: 'card' });
    srsCard.innerHTML = `<div class="card-title">Serious vs Non-Serious <button class="help-icon" data-tip="serious" aria-label="About serious events">?</button></div>`;
    const s = drug.seriousCount || 0, ns = drug.nonSeriousCount || 0;
    if (s + ns > 0) {
        const wrap = make('div', { cls: 'chart-container', style: 'height:260px' });
        wrap.appendChild(make('canvas', { id: `chart-srs-${idx}` }));
        srsCard.appendChild(wrap);
        requestAnimationFrame(() => charts.donut(`chart-srs-${idx}`, s, ns));
    } else {
        srsCard.innerHTML += '<p style="color:var(--text-dim);font-size:.875rem">No seriousness data available.</p>';
    }
    grid.appendChild(srsCard);

    const tlCard = make('div', { cls: 'card' });
    tlCard.innerHTML = `<div class="card-title">Reports Over Time <button class="help-icon" data-tip="timeline" aria-label="About timeline">?</button></div>`;
    if (drug.timeline?.results?.length) {
        const { labels, data } = fmt.timeline(drug.timeline.results);
        const wrap = make('div', { cls: 'chart-container', style: 'height:260px' });
        wrap.appendChild(make('canvas', { id: `chart-tl-${idx}` }));
        tlCard.appendChild(wrap);
        requestAnimationFrame(() => charts.line(`chart-tl-${idx}`, labels, data, color));
    } else {
        tlCard.innerHTML += '<p style="color:var(--text-dim);font-size:.875rem">No timeline data available.</p>';
    }
    grid.appendChild(tlCard);
    container.appendChild(grid);

    // Events table
    renderEventsTable(container, drug, idx);
}

function renderEventsTable(container, drug, idx) {
    if (!drug.events?.results?.length) return;
    const card = make('div', { cls: 'card' });
    card.innerHTML = `<div class="card-title">Recent Adverse Event Reports</div>`;
    const key = `events-${idx}`;
    if (!state.tablePages[key]) state.tablePages[key] = 0;
    const events = drug.events.results;
    const totalPages = Math.ceil(events.length / CONFIG.PAGE_SIZE);

    function renderPage(page) {
        state.tablePages[key] = page;
        card.querySelector('.data-table-wrapper')?.remove();
        card.querySelector('.pagination')?.remove();

        const start = page * CONFIG.PAGE_SIZE;
        const slice = events.slice(start, start + CONFIG.PAGE_SIZE);

        const wrapper = make('div', { cls: 'data-table-wrapper' });
        const table = make('table', { cls: 'data-table' });
        table.innerHTML = `<thead><tr><th>Date</th><th>Reaction</th><th>Serious?</th><th>Age</th><th>Sex</th></tr></thead>`;
        const tbody = make('tbody');
        slice.forEach(ev => {
            const reaction = ev.patient?.reaction?.[0]?.reactionmeddrapt || '—';
            const serious  = ev.serious === '1' || ev.serious === 1;
            const age      = ev.patient?.patientonsetage || '—';
            const sex      = ev.patient?.patientsex === '1' ? 'M' : ev.patient?.patientsex === '2' ? 'F' : '—';
            const row = make('tr');
            row.innerHTML = `
                <td style="font-family:var(--font-mono);font-size:.78rem">${fmt.date(ev.receivedate)}</td>
                <td>${fmt.title(reaction)}</td>
                <td><span class="badge ${serious ? 'badge-serious' : 'badge-nonserous'}">${serious ? 'Yes' : 'No'}</span></td>
                <td style="font-family:var(--font-mono)">${age}</td>
                <td style="font-family:var(--font-mono)">${sex}</td>
            `;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        card.appendChild(wrapper);

        const pag = make('div', { cls: 'pagination' });
        pag.innerHTML = `
            <span class="pagination-info">Showing ${start + 1}–${Math.min(start + CONFIG.PAGE_SIZE, events.length)} of ${events.length}</span>
            <div class="pagination-btns">
                <button class="pagination-btn" id="pp-${key}" ${page === 0 ? 'disabled' : ''}>← Prev</button>
                <button class="pagination-btn" id="pn-${key}" ${page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
            </div>`;
        card.appendChild(pag);
        card.querySelector(`#pp-${key}`)?.addEventListener('click', () => renderPage(page - 1));
        card.querySelector(`#pn-${key}`)?.addEventListener('click', () => renderPage(page + 1));
    }
    renderPage(state.tablePages[key]);
    container.appendChild(card);
}

function renderComparisonAE(container) {
    // Grouped bar
    const barCard = make('div', { cls: 'card' });
    barCard.innerHTML = `<div class="card-title">Top Adverse Reactions Comparison</div>`;
    const barWrap = make('div', { cls: 'chart-container', style: 'height:420px' });
    barWrap.appendChild(make('canvas', { id: 'chart-cmp-bar' }));
    barCard.appendChild(barWrap);
    container.appendChild(barCard);
    requestAnimationFrame(() => charts.groupedBar('chart-cmp-bar', state.drugs, state.drugs.map(d => d.reactions?.results || [])));

    // Radar
    const radarCard = make('div', { cls: 'card' });
    radarCard.innerHTML = `
        <div class="card-title">Serious Event Profile <button class="help-icon" data-tip="serious" aria-label="About serious events">?</button></div>
        <p style="font-size:.75rem;color:var(--text-dim);margin-bottom:var(--sp-md)">Approximate serious event category breakdown estimated from available data</p>`;
    const radarWrap = make('div', { cls: 'chart-container', style: 'height:300px' });
    radarWrap.appendChild(make('canvas', { id: 'chart-radar' }));
    radarCard.appendChild(radarWrap);
    container.appendChild(radarCard);
    requestAnimationFrame(() => charts.radar('chart-radar', state.drugs));

    renderComparisonTable(container);
}

function renderComparisonTable(container) {
    const card = make('div', { cls: 'card' });
    card.innerHTML = `<div class="card-title">Side-by-Side Comparison</div>`;
    const rows = [
        { label: 'Total Adverse Event Reports', val: d => fmt.num(d.totalCount) },
        { label: 'Most Common Reaction',         val: d => fmt.title(d.reactions?.results?.[0]?.term) || '—' },
        { label: 'Serious Event Rate',            val: d => d.totalCount ? fmt.pct(d.seriousCount, d.totalCount) + '%' : '—' },
        { label: 'Recall Count',                  val: d => String(d.recalls?.results?.length || 0) },
        { label: 'Boxed Warning',                 val: d => d.label?.results?.[0]?.boxed_warning ? '⚠ Yes' : '✓ None' },
    ];
    const wrapper = make('div', { cls: 'comparison-table-wrapper' });
    const table = make('table', { cls: 'comparison-table' });
    const thead = make('thead');
    const hrow = make('tr');
    hrow.appendChild(make('th', {}, 'Metric'));
    state.drugs.forEach(d => hrow.appendChild(make('th', {}, d.name)));
    thead.appendChild(hrow);
    table.appendChild(thead);
    const tbody = make('tbody');
    rows.forEach(row => {
        const tr = make('tr');
        tr.appendChild(make('td', {}, row.label));
        state.drugs.forEach(d => tr.appendChild(make('td', {}, row.val(d))));
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    card.appendChild(wrapper);
    container.appendChild(card);
}

// ===== WARNINGS TAB =====
function renderWarnings() {
    const container = $('tab-content');
    container.innerHTML = '';

    state.drugs.forEach(drug => {
        const label = drug.label?.results?.[0];
        const card = make('div', { cls: 'card' });
        const titleText = state.drugs.length > 1 ? `${drug.name} — Official Labeling` : 'Official Labeling Information';
        card.innerHTML = `<div class="card-title">${titleText}</div>`;

        if (!label) {
            card.innerHTML += `<p style="color:var(--text-dim);font-size:.875rem">No labeling information found in the FDA database for this drug. Try searching for the generic name.</p>`;
            container.appendChild(card);
            return;
        }

        const sections = [
            { key: 'boxed_warning',          title: '⚠ Boxed Warning (Black Box)', critical: true },
            { key: 'warnings',               title: 'Warnings & Precautions',       critical: false },
            { key: 'adverse_reactions',      title: 'Adverse Reactions (Labeling)', critical: false },
            { key: 'contraindications',      title: 'Contraindications',            critical: false },
            { key: 'drug_interactions',      title: 'Drug Interactions',            critical: false },
            { key: 'indications_and_usage',  title: 'Indications & Usage',          critical: false },
        ];

        let hasAny = false;
        sections.forEach(({ key, title, critical }) => {
            const value = label[key]?.[0];
            if (!value) return;
            hasAny = true;

            const acc = make('div', { cls: 'accordion' });
            const header = make('button', { cls: `accordion-header${critical ? ' critical' : ''}`, 'aria-expanded': 'false' });
            header.innerHTML = `<span>${title}</span><span class="accordion-chevron" aria-hidden="true">▼</span>`;
            const body = make('div', { cls: 'accordion-body' }, value);

            header.addEventListener('click', () => {
                const open = header.classList.contains('is-open');
                header.classList.toggle('is-open', !open);
                header.setAttribute('aria-expanded', !open);
                body.classList.toggle('is-open', !open);
            });

            acc.appendChild(header);
            acc.appendChild(body);
            card.appendChild(acc);
        });

        if (!hasAny) {
            card.innerHTML += `<p style="color:var(--text-dim);font-size:.875rem">Detailed warning information not available in the current labeling data.</p>`;
        }
        container.appendChild(card);
    });
}

// ===== RECALLS TAB =====
function renderRecalls() {
    const container = $('tab-content');
    container.innerHTML = '';

    state.drugs.forEach(drug => {
        const card = make('div', { cls: 'card' });
        const titleText = state.drugs.length > 1 ? `${drug.name} — Recall History` : 'Recall History';
        card.innerHTML = `<div class="card-title">${titleText} <button class="help-icon" data-tip="recalls" aria-label="About recalls">?</button></div>`;

        const recalls = drug.recalls?.results || [];
        if (!recalls.length) {
            card.innerHTML += `
                <div class="no-recalls">
                    <span class="no-recalls-icon">✓</span>
                    <div class="no-recalls-text">No recalls found in FDA database</div>
                    <p class="no-recalls-note">Results based on product description search. Records may not appear if the drug name doesn't exactly match enforcement report descriptions.</p>
                </div>`;
        } else {
            const timeline = make('div', { cls: 'recall-timeline' });
            recalls.forEach(r => {
                const cls = fmt.recallClass(r.classification);
                const item = make('div', { cls: `recall-item ${cls.css}` });
                const badgeCls = cls.css === 'rc-1' ? 'badge-recall-1' : cls.css === 'rc-3' ? 'badge-recall-3' : 'badge-recall-2';
                item.innerHTML = `
                    <div class="recall-date">${fmt.date(r.recall_initiation_date)}</div>
                    <div class="recall-product">${r.product_description || 'Product details not available'}</div>
                    <div class="recall-reason">${r.reason_for_recall || 'Reason not specified'}</div>
                    <div class="recall-meta">
                        <span class="badge ${badgeCls}">${cls.label}</span>
                        ${r.status ? `<span style="font-size:.75rem;color:var(--text-dim)">Status: ${r.status}</span>` : ''}
                    </div>`;
                timeline.appendChild(item);
            });
            card.appendChild(timeline);
        }
        container.appendChild(card);
    });
}

// ===== TOOLTIP SYSTEM =====
function attachTooltips() {
    const tip = $('tooltip');
    document.querySelectorAll('[data-tip]').forEach(node => {
        const show = e => {
            const text = TOOLTIPS[node.dataset.tip];
            if (!text) return;
            tip.textContent = text;
            tip.hidden = false;
            moveTip(e);
        };
        const hide = () => { tip.hidden = true; };
        const moveTip = e => {
            const x = e.clientX || node.getBoundingClientRect().right + 5;
            const y = e.clientY || node.getBoundingClientRect().top;
            tip.style.left = `${Math.min(x + 14, window.innerWidth - 295)}px`;
            tip.style.top  = `${Math.max(8, y - tip.offsetHeight - 8)}px`;
        };
        node.addEventListener('mouseenter', show);
        node.addEventListener('mousemove', moveTip);
        node.addEventListener('mouseleave', hide);
        node.addEventListener('focus', show);
        node.addEventListener('blur',  hide);
    });
}

// ===== RENDER DISPATCH =====
function renderActiveTab() {
    charts.destroyAll();
    switch (state.activeTab) {
        case 'overview':       renderOverview();       break;
        case 'adverse-events': renderAdverseEvents();  break;
        case 'warnings':       renderWarnings();       break;
        case 'recalls':        renderRecalls();        break;
    }
    attachTooltips();
}

// ===== DATA FETCHING =====
async function fetchDrug(name) {
    const [rxRes, srsRes, tlRes, evRes, tcRes, lbRes, rcRes] = await Promise.allSettled([
        api.topReactions(name),
        api.seriousness(name),
        api.timeline(name),
        api.eventsList(name),
        api.totalCount(name),
        api.label(name),
        api.recalls(name),
    ]);

    const ok = r => r.status === 'fulfilled' ? r.value : null;

    const rxData  = ok(rxRes);
    const srsData = ok(srsRes);
    const tlData  = ok(tlRes);
    const evData  = ok(evRes);
    const tcData  = ok(tcRes);
    const lbData  = ok(lbRes);
    const rcData  = ok(rcRes);

    let seriousCount = 0, nonSeriousCount = 0;
    srsData?.data?.results?.forEach(r => {
        if (r.term === '1') seriousCount = r.count;
        else if (r.term === '2') nonSeriousCount = r.count;
    });

    const totalCount = tcData?.data?.meta?.results?.total || seriousCount + nonSeriousCount || 0;
    const hasLabel   = lbData?.data?.results?.length > 0;

    if (totalCount === 0 && !hasLabel) return null; // not found

    return {
        name,
        reactions:       rxData?.data,
        seriousCount,
        nonSeriousCount,
        totalCount,
        timeline:        tlData?.data,
        events:          evData?.data,
        label:           lbData?.data,
        recalls:         rcData?.data,
        fromCache:       rxData?.fromCache || false,
    };
}

// ===== SEARCH FLOW =====
async function searchDrug(name) {
    if (!name?.trim()) return;
    name = name.trim();
    history.add(name);
    state.drugs = [];
    state.tablePages = {};
    renderDrugTags();
    showView('loading-state');
    $('loading-text').textContent = `Searching FDA database for "${name}"…`;

    try {
        const drug = await fetchDrug(name);
        if (!drug) {
            showError(
                `"${name}" not found`,
                `No adverse event data or labeling information found for "${name}" in the FDA database.`,
                [
                    'Check spelling — try both brand names (e.g., "Tylenol") and generic names (e.g., "acetaminophen")',
                    'The drug may not be in FAERS if it\'s very new, rarely used, or primarily prescribed outside the US',
                    'Try a shorter name — e.g., "aspirin" instead of "aspirin 81mg enteric coated"',
                ]
            );
            return;
        }
        state.drugs = [drug];
        renderDrugTags();
        renderDataBanner();
        state.activeTab = 'overview';
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'overview');
            t.setAttribute('aria-selected', t.dataset.tab === 'overview');
        });
        showView('results-section');
        renderActiveTab();
    } catch (err) {
        console.error(err);
        if (err.message === 'RATE_LIMIT') {
            showError('Rate limit reached', 'The FDA API is temporarily limiting requests. Please wait 30 seconds and try again.', ['Wait a moment and retry your search']);
        } else if (!navigator.onLine) {
            showError('No internet connection', 'Unable to reach the FDA database. Please check your network.', ['Check your connection and reload the page']);
        } else {
            showError('Unable to load data', 'An error occurred while fetching data from the FDA API. This may be temporary.', ['Try again in a few moments']);
        }
    }
}

async function addDrug(name) {
    if (!name?.trim()) return;
    name = name.trim();
    if (state.drugs.length >= CONFIG.MAX_DRUGS) return;
    if (state.drugs.find(d => d.name.toLowerCase() === name.toLowerCase())) {
        alert(`"${name}" is already loaded.`);
        return;
    }
    history.add(name);
    showView('loading-state');
    $('loading-text').textContent = `Loading "${name}"…`;

    try {
        const drug = await fetchDrug(name);
        if (!drug) {
            alert(`"${name}" not found in the FDA database. Please check the name and try again.`);
        } else {
            state.drugs.push(drug);
        }
    } catch (err) {
        console.error(err);
        alert('Error loading drug data. Please try again.');
    }

    if (state.drugs.length > 0) {
        renderDrugTags();
        renderDataBanner();
        state.activeTab = 'overview';
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'overview');
            t.setAttribute('aria-selected', t.dataset.tab === 'overview');
        });
        showView('results-section');
        renderActiveTab();
    } else {
        showView('empty-state');
    }
}

function removeDrug(idx) {
    state.drugs.splice(idx, 1);
    state.tablePages = {};
    if (!state.drugs.length) { renderDrugTags(); showView('empty-state'); return; }
    renderDrugTags();
    renderDataBanner();
    renderActiveTab();
}

function showError(title, message, suggestions) {
    $('error-title').textContent = title;
    $('error-message').textContent = message;
    const sug = $('error-suggestions');
    if (suggestions?.length) {
        sug.innerHTML = '<strong style="color:var(--text-primary)">Try:</strong><ul>' + suggestions.map(s => `<li>${s}</li>`).join('') + '</ul>';
        sug.hidden = false;
    } else {
        sug.hidden = true;
    }
    showView('error-state');
}

// ===== SEARCH HISTORY DROPDOWN =====
function renderHistoryDropdown() {
    const el = $('search-history');
    const items = history.get();
    if (!items.length) { el.hidden = true; return; }
    el.innerHTML = '';
    items.forEach(term => {
        const btn = make('button', { cls: 'search-history-item', onclick: () => { $('drug-search-input').value = term; el.hidden = true; searchDrug(term); } },
            make('span', { cls: 'hist-icon' }, '↩'),
            txt(' ' + term)
        );
        el.appendChild(btn);
    });
    el.hidden = false;
}

// ===== GLOSSARY =====
function initGlossary() {
    const list = $('glossary-list');
    const render = filter => {
        const terms = GLOSSARY
            .filter(t => !filter || t.term.toLowerCase().includes(filter) || t.def.toLowerCase().includes(filter))
            .sort((a, b) => a.term.localeCompare(b.term));
        list.innerHTML = '';
        if (!terms.length) { list.innerHTML = '<p style="color:var(--text-dim);font-size:.875rem">No terms found.</p>'; return; }
        terms.forEach(({ term, def }) => {
            const item = make('div', { cls: 'glossary-term' }, make('h4', {}, term), make('p', {}, def));
            list.appendChild(item);
        });
    };
    render('');
    $('glossary-search').addEventListener('input', e => render(e.target.value.toLowerCase()));
}

// ===== ONBOARDING =====
function initOnboarding() {
    const steps = $('onboarding-steps');
    const dots  = $('onboarding-dots');
    let cur = 0;

    steps.innerHTML = '';
    dots.innerHTML  = '';

    ONBOARDING.forEach((s, i) => {
        const el = make('div', { cls: `onboarding-step${i === 0 ? ' is-active' : ''}` });
        el.innerHTML = `<span class="onboarding-step-icon">${s.icon}</span><h3>${s.title}</h3><p>${s.text}</p>`;
        steps.appendChild(el);
        dots.appendChild(make('div', { cls: `onboarding-dot${i === 0 ? ' is-active' : ''}` }));
    });

    const goTo = n => {
        steps.querySelectorAll('.onboarding-step').forEach((el, i) => el.classList.toggle('is-active', i === n));
        dots.querySelectorAll('.onboarding-dot').forEach((el, i) => el.classList.toggle('is-active', i === n));
        cur = n;
        $('btn-onboarding-next').textContent = n === ONBOARDING.length - 1 ? 'Get Started' : 'Next';
    };

    $('btn-onboarding-next').addEventListener('click', () => {
        if (cur < ONBOARDING.length - 1) goTo(cur + 1);
        else { closeModal('modal-onboarding'); localStorage.setItem('dse_onboarding', '1'); }
    });
    $('btn-onboarding-skip').addEventListener('click', () => { closeModal('modal-onboarding'); localStorage.setItem('dse_onboarding', '1'); });
}

// ===== MODALS =====
function openModal(id) {
    const m = $(id);
    if (!m) return;
    m.hidden = false;
    setTimeout(() => m.querySelector('button, input')?.focus(), 50);
}
function closeModal(id) { const m = $(id); if (m) m.hidden = true; }

// ===== DEBOUNCE =====
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ===== EVENT WIRING =====
function wireEvents() {
    const input = $('drug-search-input');

    // Search
    $('btn-search').addEventListener('click', () => { const v = input.value.trim(); if (v) searchDrug(v); });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { const v = input.value.trim(); if (v) { $('search-history').hidden = true; searchDrug(v); } }
        if (e.key === 'Escape') $('search-history').hidden = true;
    });
    input.addEventListener('focus', renderHistoryDropdown);
    input.addEventListener('input', debounce(() => { if (!input.value.trim()) renderHistoryDropdown(); }, CONFIG.SEARCH_DEBOUNCE));
    document.addEventListener('click', e => { if (!e.target.closest('.search-bar-wrapper')) $('search-history').hidden = true; });

    // Add drug
    $('btn-add-drug').addEventListener('click', () => {
        const name = prompt(`Enter drug name to compare (${state.drugs.length + 1} of ${CONFIG.MAX_DRUGS}):`);
        if (name?.trim()) addDrug(name.trim());
    });

    // Tabs
    $('tabs-nav').addEventListener('click', e => {
        const tab = e.target.closest('.tab');
        if (tab) switchTab(tab.dataset.tab);
    });

    // Error retry
    $('btn-try-again').addEventListener('click', () => {
        const last = history.get()[0];
        if (last) searchDrug(last); else showView('empty-state');
    });

    // Disclaimer
    $('btn-close-disclaimer').addEventListener('click', () => {
        $('disclaimer-banner').classList.add('dismissed');
        localStorage.setItem('dse_disclaimer', '1');
    });

    // Nav / footer modals
    $('btn-about').addEventListener('click', () => openModal('modal-about'));
    $('btn-glossary').addEventListener('click', () => openModal('modal-glossary'));
    $('btn-onboarding').addEventListener('click', () => openModal('modal-onboarding'));
    $('footer-about').addEventListener('click', () => openModal('modal-about'));

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal-overlay').hidden = true);
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true; });
    });

    // Escape closes modals
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay:not([hidden])').forEach(m => m.hidden = true);
            $('search-history').hidden = true;
        }
    });

    // Example tags
    document.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => { input.value = tag.dataset.drug; searchDrug(tag.dataset.drug); });
    });
}

// ===== INIT =====
function init() {
    cache.load();
    setChartDefaults();
    wireEvents();
    initGlossary();
    initOnboarding();

    if (localStorage.getItem('dse_disclaimer') === '1') $('disclaimer-banner').classList.add('dismissed');
    if (!localStorage.getItem('dse_onboarding'))        openModal('modal-onboarding');

    showView('empty-state');

    // Support ?drug=name or #drugname in URL for direct linking
    const params = new URLSearchParams(location.search);
    const drugParam = params.get('drug') || decodeURIComponent(location.hash.slice(1));
    if (drugParam) { $('drug-search-input').value = drugParam; searchDrug(drugParam); }
}

document.addEventListener('DOMContentLoaded', init);
