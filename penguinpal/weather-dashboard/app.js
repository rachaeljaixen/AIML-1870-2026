/* ===================================================
   Weather Dashboard – app.js
   Requires: OpenWeatherMap API key + Unsplash Access Key
   =================================================== */

'use strict';

// ── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  OWM_KEY:      '33c05850a4f5be8d1ae31f9e4f5c7ea3',
  UNSPLASH_KEY: 'YOUR_UNSPLASH_ACCESS_KEY',
  CACHE_TTL:    10 * 60 * 1000, // 10 minutes
  DEBOUNCE_MS:  300,
  MAX_RECENT:   5,
};

const OWM = {
  CURRENT:    'https://api.openweathermap.org/data/2.5/weather',
  ONECALL:    'https://api.openweathermap.org/data/3.0/onecall',
  FORECAST:   'https://api.openweathermap.org/data/2.5/forecast',
  GEO:        'https://api.openweathermap.org/geo/1.0/direct',
  AIR:        'https://api.openweathermap.org/data/2.5/air_pollution',
  ICON:       (code) => `https://openweathermap.org/img/wn/${code}@2x.png`,
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  units: 'metric',
  lat: null,
  lon: null,
  currentData: null,
  oneCallData: null,
  forecastData: null,
  aqiData: null,
  uvClouds: { uvi: 0, clouds: 0 }, // tracked for skin-type recalc
};

// ── Cache ─────────────────────────────────────────────────────────────────────
const cache = new Map(); // key → { ts, data }

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CONFIG.CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) { cache.set(key, { ts: Date.now(), data }); }

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
  bgImage:       $('bg-image'),
  cityInput:     $('city-input'),
  searchBtn:     $('search-btn'),
  recentList:    $('recent-searches'),
  unitC:         $('unit-c'),
  unitF:         $('unit-f'),
  loading:       $('loading'),
  errorBanner:   $('error-banner'),
  mainContent:   $('main-content'),
  cityName:      $('city-name'),
  datetime:      $('current-datetime'),
  weatherDesc:   $('weather-desc'),
  weatherIcon:   $('weather-icon'),
  temperature:   $('temperature'),
  feelsLike:     $('feels-like'),
  humidity:      $('humidity'),
  pressure:      $('pressure'),
  visibility:    $('visibility'),
  clouds:        $('clouds'),
  sunriseSunset: $('sunrise-sunset'),
  dewPoint:      $('dew-point'),
  compassNeedle: $('compass-needle'),
  windSpeed:     $('wind-speed'),
  windDir:       $('wind-dir'),
  windGust:      $('wind-gust'),
  windBeaufort:  $('wind-beaufort'),
  uvValue:       $('uv-value'),
  uvCategory:    $('uv-category'),
  uvBar:         $('uv-bar'),
  uvAdvice:      $('uv-advice'),
  aqiValue:      $('aqi-value'),
  aqiCategory:   $('aqi-category'),
  aqiPollutants: $('aqi-pollutants'),
  aqiAdvice:     $('aqi-advice'),
  skinType:      $('skin-type'),
  burnTime:      $('burn-time'),
  spf:           $('spf'),
  burnRisk:      $('burn-risk'),
  alertsSection: $('alerts-section'),
  alertsList:    $('alerts-list'),
  hourlyForecast:$('hourly-forecast'),
  dailyForecast: $('daily-forecast'),
  rain1h:        $('rain-1h'),
  snow1h:        $('snow-1h'),
  precipPop:     $('precip-pop'),
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const sanitize = (str) =>
  String(str).replace(/[<>"'&]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;", '&':'&amp;' }[c]));

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function formatTime(unix, tz) {
  return new Date(unix * 1000).toLocaleTimeString('en-US', {
    timeZone: tzOffset(tz), hour: '2-digit', minute: '2-digit',
  });
}

// OWM gives timezone offset in seconds; convert to IANA-style string not available, use offset trick
function formatTimeFromOffset(unix, offsetSec) {
  const d = new Date((unix + offsetSec) * 1000);
  const h = String(d.getUTCHours()).padStart(2,'0');
  const m = String(d.getUTCMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}

function formatDay(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { weekday: 'short' });
}

function tzOffset() { return undefined; } // placeholder; real tz handled via offset

function tempStr(k, units) {
  if (units === 'metric') return `${Math.round(k)}°C`;
  return `${Math.round(k * 9 / 5 + 32)}°F`;
}

function windStr(mps, units) {
  if (units === 'metric') return `${(mps * 3.6).toFixed(1)} km/h`;
  return `${(mps * 2.237).toFixed(1)} mph`;
}

function degToCardinal(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function beaufort(mps) {
  const scales = [0,0.3,1.6,3.4,5.5,8.0,10.8,13.9,17.2,20.8,24.5,28.5,32.7];
  for (let i = scales.length - 1; i >= 0; i--) {
    if (mps >= scales[i]) return i;
  }
  return 0;
}

function beaufortLabel(b) {
  const labels = ['Calm','Light air','Light breeze','Gentle breeze','Moderate breeze',
    'Fresh breeze','Strong breeze','Near gale','Gale','Strong gale','Storm','Violent storm','Hurricane'];
  return labels[b] ?? 'Unknown';
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const ls = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function loadPrefs() {
  state.units = ls.get('weatherUnits', 'metric');
  if (state.units === 'imperial') {
    el.unitC.classList.remove('active'); el.unitC.setAttribute('aria-pressed','false');
    el.unitF.classList.add('active');    el.unitF.setAttribute('aria-pressed','true');
  }
}

function saveUnits(u) { state.units = u; ls.set('weatherUnits', u); }

function getRecentCities() { return ls.get('recentCities', []); }

function addRecentCity(name) {
  let cities = getRecentCities().filter(c => c.toLowerCase() !== name.toLowerCase());
  cities.unshift(name);
  if (cities.length > CONFIG.MAX_RECENT) cities = cities.slice(0, CONFIG.MAX_RECENT);
  ls.set('recentCities', cities);
}

function renderRecentCities() {
  const cities = getRecentCities();
  if (!cities.length) { el.recentList.classList.add('hidden'); return; }
  el.recentList.innerHTML = cities.map(c => `<li role="option">${sanitize(c)}</li>`).join('');
  el.recentList.classList.remove('hidden');
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showLoading() { el.loading.classList.remove('hidden'); }
function hideLoading() { el.loading.classList.add('hidden'); }

function showError(msg) {
  el.errorBanner.textContent = msg;
  el.errorBanner.classList.remove('hidden');
  clearTimeout(showError._t);
  showError._t = setTimeout(() => el.errorBanner.classList.add('hidden'), 5000);
}

function showMain() { el.mainContent.classList.remove('hidden'); }

// ── API fetch ─────────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const cached = cacheGet(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  cacheSet(url, data);
  return data;
}

// Geocode city name → { lat, lon, name, country }
async function geocode(city) {
  const url = `${OWM.GEO}?q=${encodeURIComponent(city)}&limit=1&appid=${CONFIG.OWM_KEY}`;
  const data = await apiFetch(url);
  if (!data.length) throw new Error(`City "${sanitize(city)}" not found. Try another search!`);
  return { lat: data[0].lat, lon: data[0].lon, name: data[0].name, country: data[0].country };
}

// Fetch all weather data; falls back to free /forecast if One Call 3.0 is not subscribed
async function fetchAll(lat, lon) {
  const unitParam = state.units;
  const [current, aqi] = await Promise.all([
    apiFetch(`${OWM.CURRENT}?lat=${lat}&lon=${lon}&units=${unitParam}&appid=${CONFIG.OWM_KEY}`),
    apiFetch(`${OWM.AIR}?lat=${lat}&lon=${lon}&appid=${CONFIG.OWM_KEY}`),
  ]);

  // Try One Call 3.0; fall back to free 5-day forecast on auth error
  let onecall = null, forecast = null;
  try {
    onecall = await apiFetch(`${OWM.ONECALL}?lat=${lat}&lon=${lon}&units=${unitParam}&appid=${CONFIG.OWM_KEY}`);
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('403')) {
      forecast = await apiFetch(`${OWM.FORECAST}?lat=${lat}&lon=${lon}&units=${unitParam}&cnt=40&appid=${CONFIG.OWM_KEY}`);
    } else {
      throw err;
    }
  }

  return { current, onecall, forecast, aqi };
}

// ── Background image ──────────────────────────────────────────────────────────
const GRADIENT_FALLBACK = 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)';

async function setBackground(cityName) {
  // Try Unsplash first if key is configured
  if (CONFIG.UNSPLASH_KEY && CONFIG.UNSPLASH_KEY !== 'YOUR_UNSPLASH_ACCESS_KEY') {
    try {
      const query = encodeURIComponent(`${cityName} skyline`);
      const url = `https://api.unsplash.com/search/photos?query=${query}&orientation=landscape&per_page=1&client_id=${CONFIG.UNSPLASH_KEY}`;
      const data = await apiFetch(url);
      if (data.results?.length) {
        applyBgImage(data.results[0].urls.regular);
        return;
      }
    } catch { /* fall through */ }
  }

  // Wikipedia REST API – no key needed, returns city landmark/skyline photo
  const candidates = [
    `${cityName} skyline`,
    `${cityName}`,
  ];

  for (const term of candidates) {
    try {
      const slug = encodeURIComponent(term.replace(/ /g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
      const data = await apiFetch(url);
      const img = data.originalimage?.source || data.thumbnail?.source;
      if (img) {
        applyBgImage(img);
        return;
      }
    } catch { /* try next candidate */ }
  }

  // Final fallback: neon gradient
  el.bgImage.style.backgroundImage = GRADIENT_FALLBACK;
}

function applyBgImage(url) {
  // Preload so the transition is smooth
  const img = new Image();
  img.onload = () => { el.bgImage.style.backgroundImage = `url('${url}')`; };
  img.onerror = () => { el.bgImage.style.backgroundImage = GRADIENT_FALLBACK; };
  img.src = url;
}

// ── Render functions ──────────────────────────────────────────────────────────

function renderCurrent(current, cityOverride) {
  const w = current;
  el.cityName.textContent = cityOverride
    ? `${sanitize(cityOverride.name)}, ${sanitize(cityOverride.country)}`
    : `${sanitize(w.name)}, ${sanitize(w.sys.country)}`;

  el.datetime.textContent = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  el.weatherDesc.textContent = w.weather[0].description;

  el.weatherIcon.src = OWM.ICON(w.weather[0].icon);
  el.weatherIcon.alt = w.weather[0].description;

  el.temperature.textContent = `${Math.round(w.main.temp)}°${state.units === 'metric' ? 'C' : 'F'}`;
  el.feelsLike.textContent = `Feels like ${Math.round(w.main.feels_like)}°${state.units === 'metric' ? 'C' : 'F'}`;

  el.humidity.textContent     = `${w.main.humidity}%`;
  el.pressure.textContent     = `${w.main.pressure} hPa`;
  el.visibility.textContent   = w.visibility != null ? `${(w.visibility / 1000).toFixed(1)} km` : '--';
  el.clouds.textContent       = `${w.clouds.all}%`;

  const sr = formatTimeFromOffset(w.sys.sunrise, w.timezone);
  const ss = formatTimeFromOffset(w.sys.sunset,  w.timezone);
  el.sunriseSunset.innerHTML  = `&#127774; ${sr} / &#127762; ${ss}`;

  // Wind
  const ws = w.wind.speed;
  el.windSpeed.textContent    = windStr(ws, state.units);
  el.windDir.textContent      = `${w.wind.deg}° ${degToCardinal(w.wind.deg)}`;
  el.windGust.textContent     = w.wind.gust != null ? windStr(w.wind.gust, state.units) : 'N/A';
  const bf = beaufort(ws);
  el.windBeaufort.textContent = `${bf} – ${beaufortLabel(bf)}`;
  el.compassNeedle.style.transform = `rotate(${w.wind.deg}deg)`;

  // Precipitation
  el.rain1h.textContent    = w.rain?.['1h']  != null ? `${w.rain['1h']} mm`  : '0 mm';
  el.snow1h.textContent    = w.snow?.['1h']  != null ? `${w.snow['1h']} mm`  : '0 mm';
  el.precipPop.textContent = '--'; // onecall will fill this
}

function renderOneCall(oc) {
  if (oc.current?.dew_point != null) {
    el.dewPoint.textContent = `${Math.round(oc.current.dew_point)}°${state.units === 'metric' ? 'C' : 'F'}`;
  }

  const uv = oc.current?.uvi ?? 0;
  const clouds = oc.current?.clouds ?? 0;
  state.uvClouds = { uvi: uv, clouds };
  renderUV(uv);

  if (oc.hourly?.length) {
    el.precipPop.textContent = `${Math.round((oc.hourly[0].pop ?? 0) * 100)}%`;
  }

  renderAlerts(oc.alerts);
  renderHourly(oc.hourly?.slice(0, 24) ?? [], oc.timezone_offset);
  renderDaily(oc.daily?.slice(0, 7) ?? []);
  updateSunburn(uv, clouds);
}

// Fallback renderer using free /forecast endpoint (3-hour steps, 5 days)
function renderForecastFallback(fc) {
  const list = fc.list ?? [];
  const tzOffsetSec = fc.city?.timezone ?? 0;

  // Hourly: first 8 entries = next 24 hours
  const hourlyItems = list.slice(0, 8).map(h => ({
    dt: h.dt,
    temp: h.main.temp,
    pop: h.pop ?? 0,
    weather: h.weather,
  }));
  renderHourly(hourlyItems, tzOffsetSec);

  // Daily: group remaining entries by calendar day
  const dayMap = new Map();
  list.forEach(h => {
    const day = new Date((h.dt + tzOffsetSec) * 1000).toUTCDateString
      ? new Date((h.dt + tzOffsetSec) * 1000).toISOString().slice(0, 10)
      : new Date(h.dt * 1000).toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day).push(h);
  });

  const dailyItems = [...dayMap.entries()].slice(0, 7).map(([, entries]) => {
    const temps = entries.map(e => e.main.temp);
    const midEntry = entries[Math.floor(entries.length / 2)];
    return {
      dt: midEntry.dt,
      temp: { max: Math.max(...temps), min: Math.min(...temps) },
      pop: Math.max(...entries.map(e => e.pop ?? 0)),
      weather: midEntry.weather,
    };
  });
  renderDaily(dailyItems);

  // POP from next entry
  if (list.length) el.precipPop.textContent = `${Math.round((list[0].pop ?? 0) * 100)}%`;

  // UV not available on free tier
  state.uvClouds = { uvi: 0, clouds: 0 };
  renderUV(0);
  el.dewPoint.textContent = 'N/A';
  renderAlerts(null);
  updateSunburn(0, 0);
}

function renderUV(uvi) {
  const rounded = Math.round(uvi);
  el.uvValue.textContent = rounded;

  let cat, color, advice;
  if      (uvi < 3)  { cat = 'Low';       color = '#00e400'; advice = 'No protection required. Safe to be outside.'; }
  else if (uvi < 6)  { cat = 'Moderate';  color = '#f7e400'; advice = 'Wear sunscreen SPF 30+, seek shade near midday.'; }
  else if (uvi < 8)  { cat = 'High';      color = '#f85900'; advice = 'SPF 30-50+, protective clothing, avoid midday sun.'; }
  else if (uvi < 11) { cat = 'Very High'; color = '#e80000'; advice = 'Take full precautions. SPF 50+, hat, sunglasses.'; }
  else               { cat = 'Extreme';   color = '#8f3f97'; advice = 'Stay indoors if possible. Full protection essential.'; }

  el.uvCategory.textContent = cat;
  el.uvCategory.style.color = color;
  el.uvValue.style.color    = color;
  el.uvValue.style.textShadow = `0 0 14px ${color}`;
  el.uvBar.style.width      = `${Math.min(uvi / 11 * 100, 100)}%`;
  el.uvBar.style.background = color;
  el.uvAdvice.textContent   = advice;
}

function renderAQI(aqi) {
  if (!aqi?.list?.length) return;
  const { main, components } = aqi.list[0];
  const idx = main.aqi;

  const cats  = ['','Good','Fair','Moderate','Poor','Very Poor'];
  const colors = ['','#00e400','#92d050','#f7e400','#f85900','#e80000'];
  const advices = ['',
    'Air quality is satisfactory.',
    'Air quality is acceptable, but some pollutants may be a concern.',
    'Sensitive groups may experience health effects.',
    'Everyone may experience health effects.',
    'Health alert: everyone may experience serious health effects.',
  ];

  el.aqiValue.textContent      = idx;
  el.aqiCategory.textContent   = cats[idx] ?? '--';
  el.aqiValue.style.color      = colors[idx] ?? '#fff';
  el.aqiValue.style.textShadow = `0 0 14px ${colors[idx] ?? '#fff'}`;
  el.aqiCategory.style.color   = colors[idx] ?? '#fff';
  el.aqiAdvice.textContent     = advices[idx] ?? '';

  const pollutantKeys = ['pm2_5','pm10','o3','no2','so2','co'];
  el.aqiPollutants.innerHTML = pollutantKeys
    .map(k => components[k] != null
      ? `<span class="pollutant-chip">${k.toUpperCase().replace('_','.')} ${components[k].toFixed(1)}</span>`
      : '')
    .join('');
}

function renderAlerts(alerts) {
  if (!alerts?.length) { el.alertsSection.classList.add('hidden'); return; }
  el.alertsSection.classList.remove('hidden');
  el.alertsList.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <div class="alert-event">${sanitize(a.event)}</div>
      <div class="alert-desc">${sanitize(a.description?.slice(0, 200) ?? '')}${(a.description?.length ?? 0) > 200 ? '…' : ''}</div>
    </div>
  `).join('');
}

function renderHourly(hourly, tzOffsetSec) {
  el.hourlyForecast.innerHTML = hourly.map(h => `
    <div class="hourly-card" role="listitem">
      <span class="hourly-time">${formatTimeFromOffset(h.dt, tzOffsetSec)}</span>
      <img class="hourly-icon" src="${OWM.ICON(h.weather[0].icon)}" alt="${sanitize(h.weather[0].description)}" loading="lazy"/>
      <span class="hourly-temp">${Math.round(h.temp)}°</span>
      <span class="hourly-pop">&#9748; ${Math.round((h.pop ?? 0) * 100)}%</span>
    </div>
  `).join('');
}

function renderDaily(daily) {
  el.dailyForecast.innerHTML = daily.map(d => `
    <div class="daily-card" role="listitem">
      <span class="daily-day">${formatDay(d.dt)}</span>
      <img class="daily-icon" src="${OWM.ICON(d.weather[0].icon)}" alt="${sanitize(d.weather[0].description)}" loading="lazy"/>
      <span class="daily-hi">${Math.round(d.temp.max)}°</span>
      <span class="daily-lo">${Math.round(d.temp.min)}°</span>
      <span class="daily-pop">&#9748; ${Math.round((d.pop ?? 0) * 100)}%</span>
    </div>
  `).join('');
}

// ── Sunburn Calculator ────────────────────────────────────────────────────────
// Skin type multipliers relative to Type II (base)
const SKIN_MULTIPLIERS = { 1: 0.7, 2: 1, 3: 1.5, 4: 2.5, 5: 4, 6: 6 };

function calcSunburn(uvi, clouds, skinType) {
  if (uvi <= 0) return { time: null, spf: 0, risk: 'Low' };
  const cloudFactor = 1 + (clouds / 100) * 0.5; // clouds reduce UV
  const effectiveUVI = uvi / cloudFactor;
  const baseMinutes  = 200 / effectiveUVI;
  const burnTime     = Math.round(baseMinutes * (SKIN_MULTIPLIERS[skinType] ?? 1));

  let spf, risk;
  if (effectiveUVI < 3)       { spf = 15;  risk = 'Low'; }
  else if (effectiveUVI < 6)  { spf = 30;  risk = 'Moderate'; }
  else if (effectiveUVI < 8)  { spf = 50;  risk = 'High'; }
  else if (effectiveUVI < 11) { spf = 50;  risk = 'Very High'; }
  else                        { spf = 50;  risk = 'Extreme'; }

  return { time: burnTime, spf, risk };
}

function updateSunburn(uvi, clouds) {
  const skinType = parseInt(el.skinType.value, 10);
  const { time, spf, risk } = calcSunburn(uvi, clouds, skinType);

  el.burnTime.textContent = time != null ? `~${time} min` : 'Safe';
  el.spf.textContent      = spf > 0 ? `SPF ${spf}+` : 'None needed';
  el.burnRisk.textContent = risk;

  const riskColors = { Low:'#00e400', Moderate:'#f7e400', High:'#f85900', 'Very High':'#e80000', Extreme:'#8f3f97' };
  el.burnRisk.style.color = riskColors[risk] ?? '#fff';
}

// ── Main search flow ──────────────────────────────────────────────────────────
async function searchCity(cityQuery) {
  const city = cityQuery.trim();
  if (!city) return;
  if (CONFIG.OWM_KEY === 'YOUR_OPENWEATHERMAP_API_KEY') {
    showError('Please set your OpenWeatherMap API key in app.js (CONFIG.OWM_KEY).');
    return;
  }

  el.recentList.classList.add('hidden');
  showLoading();
  el.errorBanner.classList.add('hidden');

  try {
    const geo = await geocode(city);
    state.lat = geo.lat;
    state.lon = geo.lon;

    // Start background load in parallel (non-blocking)
    setBackground(geo.name);

    const { current, onecall, forecast, aqi } = await fetchAll(geo.lat, geo.lon);
    state.currentData = current;
    state.oneCallData = onecall;
    state.forecastData = forecast;
    state.aqiData     = aqi;

    renderCurrent(current, geo);
    if (onecall) renderOneCall(onecall); else renderForecastFallback(forecast);
    renderAQI(aqi);

    addRecentCity(geo.name);
    ls.set('lastCity', { name: geo.name, lat: geo.lat, lon: geo.lon });

    showMain();
    el.cityInput.value = '';
  } catch (err) {
    const msg = err.message?.includes('not found')
      ? `Oops! We couldn't find "${sanitize(city)}". Try another search!`
      : err.message?.includes('401')
      ? 'Invalid API key. Check your OpenWeatherMap key.'
      : err.message?.includes('429')
      ? 'Daily weather check limit reached. Try again later!'
      : !navigator.onLine
      ? 'No internet connection. Please check your network.'
      : 'Weather data temporarily unavailable. Please try again.';
    showError(msg);
  } finally {
    hideLoading();
  }
}

// Re-fetch with new units (no geocode needed)
async function refreshWithUnits() {
  if (state.lat == null) return;
  showLoading();
  try {
    cache.clear(); // force fresh fetch with new units param
    const { current, onecall, forecast, aqi } = await fetchAll(state.lat, state.lon);
    state.currentData = current;
    state.oneCallData = onecall;
    state.forecastData = forecast;
    state.aqiData     = aqi;

    const lastCity = ls.get('lastCity');
    renderCurrent(current, lastCity ? { name: lastCity.name, country: current.sys.country } : null);
    if (onecall) renderOneCall(onecall); else renderForecastFallback(forecast);
    renderAQI(aqi);
  } catch { /* silently ignore unit refresh errors */ }
  finally { hideLoading(); }
}

// ── Geolocation ───────────────────────────────────────────────────────────────
function tryGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      if (CONFIG.OWM_KEY === 'YOUR_OPENWEATHERMAP_API_KEY') return;
      showLoading();
      try {
        const { current, onecall, forecast, aqi } = await fetchAll(state.lat, state.lon);
        state.currentData = current;
        state.oneCallData = onecall;
        state.forecastData = forecast;
        state.aqiData     = aqi;
        setBackground(current.name);
        renderCurrent(current);
        if (onecall) renderOneCall(onecall); else renderForecastFallback(forecast);
        renderAQI(aqi);
        ls.set('lastCity', { name: current.name, lat: state.lat, lon: state.lon });
        showMain();
      } catch { /* fall back gracefully */ }
      finally { hideLoading(); }
    },
    () => {
      // Permission denied or error; load last searched city if available
      const last = ls.get('lastCity');
      if (last) searchCity(last.name);
    }
  );
}

// ── Event listeners ───────────────────────────────────────────────────────────
el.searchBtn.addEventListener('click', () => searchCity(el.cityInput.value));

el.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchCity(el.cityInput.value);
});

el.cityInput.addEventListener('focus', renderRecentCities);
el.cityInput.addEventListener('blur', () => {
  setTimeout(() => el.recentList.classList.add('hidden'), 200);
});

el.recentList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) searchCity(li.textContent);
});

el.unitC.addEventListener('click', () => {
  if (state.units === 'metric') return;
  saveUnits('metric');
  el.unitC.classList.add('active');    el.unitC.setAttribute('aria-pressed','true');
  el.unitF.classList.remove('active'); el.unitF.setAttribute('aria-pressed','false');
  refreshWithUnits();
});

el.unitF.addEventListener('click', () => {
  if (state.units === 'imperial') return;
  saveUnits('imperial');
  el.unitF.classList.add('active');    el.unitF.setAttribute('aria-pressed','true');
  el.unitC.classList.remove('active'); el.unitC.setAttribute('aria-pressed','false');
  refreshWithUnits();
});

el.skinType.addEventListener('change', () => {
  updateSunburn(state.uvClouds.uvi, state.uvClouds.clouds);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadPrefs();
tryGeolocation();
