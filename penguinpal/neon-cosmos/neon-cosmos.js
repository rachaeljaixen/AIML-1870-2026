'use strict';

// ===== CONFIG =====
const API_KEY    = 'E65f49nAvWDamimQT1hBA6fa6NhpJnvWrhraCb1j';
const SENTRY_URL = 'https://ssd-api.jpl.nasa.gov/sentry.api';
const CAD_URL    = 'https://ssd-api.jpl.nasa.gov/cad.api';
const APOD_URL   = 'https://api.nasa.gov/planetary/apod';
const LD_IN_AU   = 0.002569555; // 1 lunar distance in AU

// ssd-api.jpl.nasa.gov returns no CORS headers, so browser cross-origin
// requests are blocked. Route those URLs through allorigins proxy.
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// ===== STATE =====
let raveModeOn    = false;
let soundOn       = false;
let audioCtx      = null;
let countdownTmr  = null;
let sentryData    = [];
let cadData       = [];
let currentDate   = null;
let refreshTimers = {};

// ===== UTILS =====
function auToLd(au) {
  return (parseFloat(au) / LD_IN_AU).toFixed(2);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function futureDateStr(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function formatCountdown(ms) {
  if (ms <= 0) return 'NOW!';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateTimestamp() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = new Date().toUTCString().replace(' GMT', ' UTC');
}

function setApiStatus(msg, state = 'ok') {
  const el = document.getElementById('api-status');
  if (!el) return;
  el.textContent = `● API STATUS: ${msg}`;
  el.className = 'api-status';
  if (state === 'error')   el.classList.add('error');
  if (state === 'warning') el.classList.add('warning');
}

// ===== AUDIO =====
function playBeep(freq = 440, duration = 0.1, type = 'sine') {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* audio not available */ }
}

function playAlertTone() {
  playBeep(800, 0.08);
  setTimeout(() => playBeep(800, 0.08), 150);
  setTimeout(() => playBeep(800, 0.08), 300);
}

// ===== FETCH WITH RETRY =====
async function fetchWithRetry(url, retries = 3) {
  // JPL SSD APIs have no CORS headers — proxy them so browsers allow the request
  const fetchUrl = url.includes('ssd-api.jpl.nasa.gov')
    ? CORS_PROXY + encodeURIComponent(url)
    : url;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 800));
    }
  }
}

// ===== TAB SWITCHING =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.remove('active');
        panel.hidden = true;
      });
      const target = document.getElementById(`tab-${tabId}`);
      if (target) { target.classList.add('active'); target.hidden = false; }

      playBeep(440, 0.08);
    });
  });
}

// ===== RAVE MODE =====
function initRaveMode() {
  const raveBtn  = document.getElementById('rave-toggle');
  const soundBtn = document.getElementById('sound-toggle');

  raveBtn.addEventListener('click', () => {
    raveModeOn = !raveModeOn;
    document.body.classList.toggle('rave-mode', raveModeOn);
    raveBtn.textContent = raveModeOn ? '■ RAVE: ON ■' : 'RAVE MODE';
    raveBtn.setAttribute('aria-pressed', String(raveModeOn));
    playBeep(raveModeOn ? 880 : 440, 0.2);
  });

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) playBeep(550, 0.1);
  });
}

// ===== SENTRY API (THREAT MATRIX) =====
async function fetchSentry() {
  setApiStatus('FETCHING THREAT DATA...', 'warning');
  try {
    // Request all objects with Palermo Scale >= -10 (gets all meaningful objects)
    const data = await fetchWithRetry(`${SENTRY_URL}?ps-min=-10`);
    sentryData = data.data || [];

    document.getElementById('threat-total').textContent = sentryData.length || '--';

    const maxPalermo = sentryData.reduce((max, d) => Math.max(max, parseFloat(d.ps || -999)), -999);
    document.getElementById('threat-highest').textContent =
      isFinite(maxPalermo) ? maxPalermo.toFixed(2) : '--';

    renderThreatMatrix(sentryData);
    setApiStatus('ONLINE');
    updateTimestamp();
  } catch (err) {
    console.error('Sentry API error:', err);
    setApiStatus('SIGNAL LOST', 'error');
    document.getElementById('threat-tbody').innerHTML =
      `<tr><td colspan="7" class="loading-cell">
         <div class="neon-error">⚠ SIGNAL LOST — ${err.message}</div>
       </td></tr>`;
  }
}

function renderThreatMatrix(data) {
  const maxYear = parseInt(document.getElementById('timeline-slider').value, 10);

  const filtered = data.filter(obj => {
    const range = obj.range || '';
    const endYear = parseInt(range.split('-').pop(), 10);
    return !endYear || endYear <= maxYear;
  });

  const sorted = [...filtered]
    .sort((a, b) => parseFloat(b.ps || -999) - parseFloat(a.ps || -999))
    .slice(0, 10);

  const maxTorino = data.reduce((max, d) => Math.max(max, parseInt(d.ts || 0, 10)), 0);
  const torinoEl = document.getElementById('threat-torino');
  if (torinoEl) torinoEl.textContent = `Highest Torino Scale: ${maxTorino}`;

  const countEl = document.getElementById('threat-count');
  countEl.textContent = filtered.length;
  if (maxTorino >= 1) {
    countEl.style.color = 'var(--red)';
    playAlertTone();
  }

  if (sorted.length === 0) {
    document.getElementById('threat-tbody').innerHTML =
      '<tr><td colspan="7" class="loading-cell">NO DATA FOR SELECTED RANGE</td></tr>';
    return;
  }

  const maxProbInSet = Math.max(...sorted.map(d => parseFloat(d.ip || 0)));

  const rows = sorted.map(obj => {
    const prob    = parseFloat(obj.ip) || 0;
    const torino  = parseInt(obj.ts, 10) || 0;
    const palermo = parseFloat(obj.ps) || 0;
    const probPct = (prob * 100).toExponential(2);
    const glowPct = maxProbInSet > 0 ? Math.min(100, (prob / maxProbInSet) * 100) : 0;
    const hue     = Math.round(120 - (glowPct / 100) * 120); // green → red
    const rowClass = torino >= 4 ? 'row-danger' : torino >= 1 ? 'row-warning' : '';
    const diam    = obj.diameter ? `${parseFloat(obj.diameter).toFixed(0)}` : 'N/A';

    return `<tr class="${rowClass}">
      <td class="obj-name">${obj.des || 'Unknown'}</td>
      <td style="color:hsl(${hue},100%,60%);text-shadow:0 0 6px hsl(${hue},100%,60%)">${probPct}%</td>
      <td>${palermo.toFixed(2)}</td>
      <td class="${torino >= 4 ? 'danger' : torino >= 1 ? 'warning' : ''}">${torino}</td>
      <td>${obj.range || 'N/A'}</td>
      <td>${diam}</td>
      <td>
        <div class="risk-bar">
          <div class="risk-fill" style="width:${glowPct.toFixed(0)}%;background:hsl(${hue},100%,50%)"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('threat-tbody').innerHTML = rows;
}

function initTimeline() {
  const slider      = document.getElementById('timeline-slider');
  const yearDisplay = document.getElementById('timeline-year');
  const endLabel    = document.getElementById('timeline-end');

  slider.addEventListener('input', () => {
    yearDisplay.textContent = slider.value;
    endLabel.textContent    = slider.value;
    if (sentryData.length) renderThreatMatrix(sentryData);
  });
}

// ===== CAD API (CLOSE ENCOUNTERS) =====
async function fetchCAD() {
  try {
    const url = `${CAD_URL}?date-min=${todayStr()}&date-max=${futureDateStr(60)}&dist-max=0.05&sort=date&fullname=true`;
    const data = await fetchWithRetry(url);

    // Map array rows to objects using the fields array
    const fields = data.fields || [];
    cadData = (data.data || []).map(row => {
      if (!Array.isArray(row)) return row;
      const obj = {};
      fields.forEach((f, i) => { obj[f] = row[i]; });
      return obj;
    });

    document.getElementById('encounter-count').textContent = cadData.length;

    if (cadData.length > 0) {
      const closest = [...cadData].sort((a, b) => parseFloat(a.dist) - parseFloat(b.dist))[0];
      document.getElementById('closest-dist').textContent = `${auToLd(closest.dist)} LD`;
      document.getElementById('closest-name').textContent = closest.des || '--';
      startCountdown(cadData[0]);
    }

    renderEncounters(cadData);
    renderSpeedLeaderboard(cadData);
    renderDistanceViz(cadData);
    updateTimestamp();
  } catch (err) {
    console.error('CAD API error:', err);
    document.getElementById('encounters-list').innerHTML =
      `<div class="neon-error">⚠ SIGNAL LOST — ${err.message}</div>`;
  }
}

function renderEncounters(data) {
  if (!data.length) {
    document.getElementById('encounters-list').innerHTML =
      '<div class="no-data">NO ENCOUNTERS IN 60-DAY WINDOW</div>';
    return;
  }

  const now = Date.now();
  const html = data.slice(0, 40).map(obj => {
    const ld      = auToLd(obj.dist);
    const isClose = parseFloat(ld) < 1;
    const vRel    = parseFloat(obj.v_rel || 0).toFixed(2);
    const vPct    = Math.min(100, parseFloat(obj.v_rel || 0) * 2).toFixed(0);
    const ms      = new Date(obj.cd) - now;
    const dDays   = Math.max(0, Math.floor(ms / 86400000));
    const dHrs    = Math.max(0, Math.floor((ms % 86400000) / 3600000));
    const badge   = isClose
      ? '<span class="badge danger-badge">CLOSE SHAVE</span>'
      : '<span class="badge safe-badge">SAFE PASS</span>';

    return `<div class="encounter-item ${isClose ? 'encounter-close' : ''}" role="listitem">
      <div class="encounter-header">
        <span class="encounter-name">${obj.des}</span>
        ${badge}
      </div>
      <div class="encounter-details">
        <span>📅 ${obj.cd}</span>
        <span>↔ ${ld} LD</span>
        <span>⚡ ${vRel} km/s</span>
        <span>⏱ ${dDays}d ${dHrs}h</span>
      </div>
      <div class="velocity-bar"><div class="velocity-fill" style="width:${vPct}%"></div></div>
    </div>`;
  }).join('');

  document.getElementById('encounters-list').innerHTML = html;
}

function startCountdown(firstObj) {
  if (countdownTmr) clearInterval(countdownTmr);
  const target = new Date(firstObj.cd);
  const nameEl  = document.getElementById('next-object');
  const countEl = document.getElementById('next-countdown');
  if (nameEl) nameEl.textContent = firstObj.des || '--';

  function tick() {
    countEl.textContent = formatCountdown(target - Date.now());
  }
  tick();
  countdownTmr = setInterval(tick, 1000);
}

function renderSpeedLeaderboard(data) {
  const sorted  = [...data].sort((a, b) => parseFloat(b.v_rel) - parseFloat(a.v_rel)).slice(0, 5);
  const maxV    = parseFloat(sorted[0]?.v_rel || 1);

  const html = sorted.map((obj, i) => {
    const v   = parseFloat(obj.v_rel || 0).toFixed(1);
    const pct = ((parseFloat(obj.v_rel) / maxV) * 100).toFixed(0);
    return `<div class="speed-item">
      <span class="speed-rank">${i + 1}</span>
      <span class="speed-name" title="${obj.des}">${obj.des}</span>
      <div class="speed-bar-wrap"><div class="speed-bar-fill" style="width:${pct}%"></div></div>
      <span class="speed-val">${v} km/s</span>
    </div>`;
  }).join('');

  document.getElementById('speed-board').innerHTML = html || '<div class="no-data">NO DATA</div>';
}

function renderDistanceViz(data) {
  const dotsGroup = document.getElementById('approach-dots');
  if (!dotsGroup) return;
  dotsGroup.innerHTML = '';

  data.slice(0, 25).forEach((obj, i) => {
    const ld    = parseFloat(auToLd(obj.dist));
    const r     = Math.min(112, ld * 38);
    const angle = (i / Math.min(25, data.length)) * 2 * Math.PI - Math.PI / 2;
    const x     = (150 + r * Math.cos(angle)).toFixed(1);
    const y     = (150 + r * Math.sin(angle)).toFixed(1);
    const color = ld < 1 ? '#ff00ff' : ld < 2 ? '#ffff00' : '#39ff14';

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', color);
    circle.style.filter = `drop-shadow(0 0 3px ${color})`;

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${obj.des}: ${ld} LD`;
    circle.appendChild(title);

    dotsGroup.appendChild(circle);
  });
}

// ===== APOD API (COSMIC EYE) =====
async function fetchAPOD(date) {
  const container = document.getElementById('apod-media-container');
  container.innerHTML = '<div class="signal-lost">INCOMING TRANSMISSION...</div>';

  try {
    let url = `${APOD_URL}?api_key=${API_KEY}`;
    if (date) url += `&date=${date}`;

    const data = await fetchWithRetry(url);
    renderAPOD(data);
    currentDate = data.date;
    document.getElementById('apod-date').value = data.date;
    updateTimestamp();
  } catch (err) {
    console.error('APOD API error:', err);
    container.innerHTML =
      `<div class="neon-error">⚠ TRANSMISSION FAILED — ${err.message}</div>`;
  }
}

function renderAPOD(data) {
  const container = document.getElementById('apod-media-container');

  if (data.media_type === 'video') {
    container.innerHTML =
      `<iframe src="${data.url}" class="apod-video" allowfullscreen
               title="${data.title}" loading="lazy"></iframe>`;
  } else {
    const img = document.createElement('img');
    img.src       = data.url;
    img.alt       = data.title || 'Astronomy Picture of the Day';
    img.className = 'apod-image';
    img.loading   = 'lazy';
    container.innerHTML = '';
    container.appendChild(img);
  }

  const titleEl = document.getElementById('apod-title');
  titleEl.textContent = data.title || 'UNKNOWN';
  titleEl.setAttribute('data-text', data.title || 'UNKNOWN');

  document.getElementById('apod-date-display').textContent = data.date || '--';
  document.getElementById('apod-copyright').textContent =
    data.copyright ? `© ${data.copyright.trim()}` : '';
  document.getElementById('apod-type').textContent =
    data.media_type ? data.media_type.toUpperCase() : '';
  document.getElementById('apod-explanation').textContent =
    data.explanation || 'No description available.';

  const hdLink = document.getElementById('apod-hd-link');
  if (data.hdurl && data.media_type !== 'video') {
    hdLink.href  = data.hdurl;
    hdLink.style.display = 'block';
  } else {
    hdLink.style.display = 'none';
  }
}

function initAPOD() {
  const today = todayStr();
  const dateInput = document.getElementById('apod-date');
  dateInput.max   = today;
  dateInput.value = today;

  document.getElementById('apod-today').addEventListener('click', () => {
    fetchAPOD(todayStr());
    playBeep(440, 0.1);
  });

  document.getElementById('apod-random').addEventListener('click', () => {
    const start = new Date('1995-06-16').getTime();
    const end   = new Date().getTime();
    const rand  = new Date(start + Math.random() * (end - start)).toISOString().slice(0, 10);
    fetchAPOD(rand);
    playBeep(660, 0.1);
  });

  document.getElementById('apod-prev').addEventListener('click', () => {
    if (!currentDate) return;
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    if (d < new Date('1995-06-16')) return;
    fetchAPOD(d.toISOString().slice(0, 10));
    playBeep(330, 0.08);
  });

  document.getElementById('apod-next').addEventListener('click', () => {
    if (!currentDate) return;
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    if (d > new Date()) return;
    fetchAPOD(d.toISOString().slice(0, 10));
    playBeep(550, 0.08);
  });

  document.getElementById('apod-date').addEventListener('change', e => {
    if (e.target.value) fetchAPOD(e.target.value);
  });
}

// ===== 3D EARTH VISUALIZATION =====
let earthScene, earthCamera, earthRenderer, earthGroup, earthAtmo;
let asteroidDots   = [];   // animated asteroid mesh objects
let earthAnimId    = null;
let earthPaused    = false;
let earthInited    = false;
let isDragging     = false;
let prevMouse      = { x: 0, y: 0 };
let earthRotSpeed  = 0.003;

function buildEarth() {
  const canvas = document.getElementById('earth-canvas');
  if (!canvas || !window.THREE) return;

  const w = canvas.parentElement.clientWidth  || 800;
  const h = canvas.parentElement.clientHeight || 520;

  // Scene & camera
  earthScene  = new THREE.Scene();
  earthCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
  earthCamera.position.z = 3.2;

  // Renderer
  earthRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  earthRenderer.setSize(w, h);
  earthRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  earthRenderer.setClearColor(0x000000, 0);

  // ---- Starfield ----
  const starPos = new Float32Array(3000 * 3);
  for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 300;
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  earthScene.add(new THREE.Points(starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.7 })));

  // ---- Earth group (rotates together) ----
  earthGroup = new THREE.Group();
  earthScene.add(earthGroup);

  // Earth sphere — solid dark ocean base
  const geo = new THREE.SphereGeometry(1, 64, 64);
  earthGroup.add(new THREE.Mesh(geo,
    new THREE.MeshPhongMaterial({
      color: 0x001830, emissive: 0x000a18,
      specular: 0x00f3ff, shininess: 80,
    })));

  // Lat/lon neon grid
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.12 });
  earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.002, 24, 16), gridMat));

  // Equator highlight ring
  const eqMesh = new THREE.Mesh(
    new THREE.TorusGeometry(1.003, 0.0025, 6, 120),
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.6 })
  );
  earthGroup.add(eqMesh);

  // Tropic rings (±23.5°)
  [-23.5, 23.5].forEach(deg => {
    const r   = Math.cos(deg * Math.PI / 180);
    const y   = Math.sin(deg * Math.PI / 180);
    const t   = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.003, 0.0015, 6, 100),
      new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.3 })
    );
    t.position.y = y * 1.003;
    earthGroup.add(t);
  });

  // Axial tilt indicator
  earthGroup.rotation.z = 23.5 * Math.PI / 180;

  // ---- Atmosphere glow (outer halo, seen from inside) ----
  earthAtmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0xff00ff, transparent: true, opacity: 0.055, side: THREE.BackSide })
  );
  earthScene.add(earthAtmo);

  // Thinner inner atmosphere
  earthScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.06, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.04, side: THREE.BackSide })
  ));

  // ---- Lighting ----
  earthScene.add(new THREE.AmbientLight(0x112233, 3));
  const sun = new THREE.DirectionalLight(0x00f3ff, 2.5);
  sun.position.set(5, 3, 5);
  earthScene.add(sun);
  const rim = new THREE.DirectionalLight(0xff00ff, 0.8);
  rim.position.set(-4, -2, -4);
  earthScene.add(rim);

  // ---- Asteroid markers (populated once cadData is available) ----
  populateAsteroidMarkers();

  // ---- Mouse / touch / wheel controls ----
  canvas.addEventListener('mousedown',  e => { isDragging = true;  prevMouse = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup',   () => { isDragging = false; });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    earthGroup.rotation.y += (e.clientX - prevMouse.x) * 0.005;
    earthGroup.rotation.x += (e.clientY - prevMouse.y) * 0.005;
    prevMouse = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('touchstart', e => {
    isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  window.addEventListener('touchend', () => { isDragging = false; }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging) return;
    earthGroup.rotation.y += (e.touches[0].clientX - prevMouse.x) * 0.005;
    earthGroup.rotation.x += (e.touches[0].clientY - prevMouse.y) * 0.005;
    prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('wheel', e => {
    earthCamera.position.z = Math.max(1.6, Math.min(8, earthCamera.position.z + e.deltaY * 0.004));
  }, { passive: true });

  // Resize
  new ResizeObserver(resizeEarth).observe(canvas.parentElement);

  // Controls panel
  document.getElementById('rot-speed').addEventListener('input', e => {
    earthRotSpeed = parseFloat(e.target.value) / 1000;
  });
  document.getElementById('earth-pause').addEventListener('click', () => {
    earthPaused = !earthPaused;
    document.getElementById('earth-pause').textContent = earthPaused ? '▶ RESUME' : '⏸ PAUSE';
  });
  document.getElementById('earth-reset').addEventListener('click', () => {
    earthGroup.rotation.set(0, 0, 23.5 * Math.PI / 180);
    earthCamera.position.z = 3.2;
  });

  earthInited = true;
  animateEarth();
}

function populateAsteroidMarkers() {
  if (!earthScene) return;

  // Remove old markers
  asteroidDots.forEach(({ dot, ring }) => {
    earthScene.remove(dot);
    earthScene.remove(ring);
  });
  asteroidDots = [];

  const source = cadData.length ? cadData : [];
  const sorted = [...source].sort((a, b) => parseFloat(a.dist) - parseFloat(b.dist)).slice(0, 25);

  sorted.forEach((obj, i) => {
    const ld    = parseFloat(auToLd(obj.dist));
    // Map lunar distance to orbit radius: 1 LD → r=1.3, 3 LD → r=2.4
    const r     = Math.min(2.8, 1.15 + ld * 0.35);
    const color = ld < 1 ? 0xff00ff : ld < 2 ? 0xffff00 : 0x39ff14;

    // Orbit ring (inclined randomly for visual variety)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.004, 6, 100),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0.08, 0.35 - ld * 0.06) })
    );
    ring.rotation.x = (Math.random() - 0.5) * Math.PI * 0.8;
    ring.rotation.y = (Math.random() - 0.5) * Math.PI * 0.8;
    earthScene.add(ring);

    // Glowing asteroid dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(ld < 1 ? 0.022 : 0.016, 8, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    const baseAngle = (i / sorted.length) * Math.PI * 2;
    const tilt      = ring.rotation.x;
    const orbitY    = ring.rotation.y;
    dot.position.set(
      r * Math.cos(baseAngle),
      r * Math.sin(tilt) * Math.sin(baseAngle),
      r * Math.sin(baseAngle) * Math.cos(tilt)
    );
    dot.userData = { r, baseAngle, tilt, orbitY, speed: 0.004 + Math.random() * 0.008 };
    earthScene.add(dot);

    asteroidDots.push({ dot, ring, obj });
  });

  // Sidebar list
  renderOrbitalList(sorted);
}

function renderOrbitalList(sorted) {
  const el = document.getElementById('orbital-list');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = '<div class="no-data">NO DATA LOADED</div>'; return; }

  el.innerHTML = sorted.slice(0, 12).map(obj => {
    const ld      = parseFloat(auToLd(obj.dist));
    const color   = ld < 1 ? '#ff00ff' : ld < 2 ? '#ffff00' : '#39ff14';
    const shadow  = `0 0 6px ${color}`;
    return `<div class="orbital-object-item">
      <span class="orbital-obj-name">${obj.des}</span>
      <span class="orbital-obj-dist" style="color:${color};text-shadow:${shadow}">${ld} LD</span>
      <span class="orbital-obj-date">${obj.cd}</span>
    </div>`;
  }).join('');
}

function animateEarth() {
  earthAnimId = requestAnimationFrame(animateEarth);
  if (!earthRenderer) return;

  if (!earthPaused && !isDragging) {
    earthGroup.rotation.y += earthRotSpeed;
  }

  // Move each asteroid dot along its orbit
  const t = Date.now() * 0.001;
  asteroidDots.forEach(({ dot }) => {
    const { r, tilt, orbitY, speed } = dot.userData;
    const angle = dot.userData.baseAngle + t * speed;
    dot.position.set(
      r * Math.cos(angle) * Math.cos(orbitY) - r * Math.sin(angle) * Math.sin(orbitY) * Math.sin(tilt),
      r * Math.sin(angle) * Math.cos(tilt),
      r * Math.cos(angle) * Math.sin(orbitY) + r * Math.sin(angle) * Math.cos(orbitY) * Math.sin(tilt)
    );
  });

  // Rave mode: pulse atmosphere color
  if (raveModeOn && earthAtmo) {
    earthAtmo.material.color.setHSL((t * 0.15) % 1, 1, 0.5);
    earthAtmo.material.opacity = 0.08 + Math.sin(t * 3) * 0.04;
  }

  earthRenderer.render(earthScene, earthCamera);
}

function resizeEarth() {
  const canvas = document.getElementById('earth-canvas');
  if (!canvas || !earthRenderer) return;
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight || 520;
  earthCamera.aspect = w / h;
  earthCamera.updateProjectionMatrix();
  earthRenderer.setSize(w, h);
}

// ===== INIT =====
async function init() {
  initTabs();
  initRaveMode();
  initTimeline();
  initAPOD();

  // Build Earth when orbital tab is first opened
  document.querySelector('[data-tab="orbital"]').addEventListener('click', () => {
    if (!earthInited) buildEarth();
  }, { once: true });

  setApiStatus('CONNECTING...', 'warning');

  // Load all data in parallel; surface individual failures gracefully
  await Promise.allSettled([
    fetchSentry(),
    fetchCAD(),
    fetchAPOD(todayStr()),
  ]);

  // After CAD data loads, refresh asteroid markers if Earth is already open
  if (earthInited) populateAsteroidMarkers();

  // Auto-refresh
  refreshTimers.sentry = setInterval(fetchSentry, 30_000);
  refreshTimers.cad    = setInterval(async () => { await fetchCAD(); if (earthInited) populateAsteroidMarkers(); }, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
