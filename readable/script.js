// ─── WCAG Luminance & Contrast ───────────────────────────────────────────────

function toLinear(channel) {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function getLuminance(r, g, b) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => v.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  bg:     { r: 10,  g: 10,  b: 15  },
  text:   { r: 255, g: 0,   b: 255 },
  size:   18,
  vision: 'normal',
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

const el = {
  bgR:    document.getElementById('bg-r'),
  bgG:    document.getElementById('bg-g'),
  bgB:    document.getElementById('bg-b'),
  bgRVal: document.getElementById('bg-r-val'),
  bgGVal: document.getElementById('bg-g-val'),
  bgBVal: document.getElementById('bg-b-val'),
  bgSwatch: document.getElementById('bg-swatch'),
  bgHex:    document.getElementById('bg-hex'),

  txR:    document.getElementById('text-r'),
  txG:    document.getElementById('text-g'),
  txB:    document.getElementById('text-b'),
  txRVal: document.getElementById('text-r-val'),
  txGVal: document.getElementById('text-g-val'),
  txBVal: document.getElementById('text-b-val'),
  txSwatch: document.getElementById('text-swatch'),
  txHex:    document.getElementById('text-hex'),

  size:    document.getElementById('text-size'),
  sizeVal: document.getElementById('text-size-val'),

  preview:       document.getElementById('preview-area'),
  contrastRatio: document.getElementById('contrast-ratio'),
  contrastBadge: document.getElementById('contrast-badge'),
  wcagIndicator: document.getElementById('wcag-indicator'),
  bgLuminance:   document.getElementById('bg-luminance'),
  txLuminance:   document.getElementById('text-luminance'),
};

// ─── Slider gradient helper ───────────────────────────────────────────────────

function styleSlider(slider, r, g, b) {
  const color = `rgb(${r},${g},${b})`;
  slider.style.setProperty('--thumb-color', color);
  slider.style.background = `linear-gradient(90deg, #000, ${color})`;
}

// ─── Color vision simulation ──────────────────────────────────────────────────

const visionMatrices = {
  protanopia:    [[0.567, 0.433, 0.0  ], [0.558, 0.442, 0.0  ], [0.0,   0.242, 0.758]],
  deuteranopia:  [[0.625, 0.375, 0.0  ], [0.7,   0.3,   0.0  ], [0.0,   0.3,   0.7  ]],
  tritanopia:    [[0.95,  0.05,  0.0  ], [0.0,   0.433, 0.567], [0.0,   0.475, 0.525]],
  achromatopsia: [[0.299, 0.587, 0.114], [0.299, 0.587, 0.114], [0.299, 0.587, 0.114]],
};

function applyVision(r, g, b, vision) {
  if (vision === 'normal') return [r, g, b];
  const m = visionMatrices[vision];
  return [
    Math.min(255, Math.round(m[0][0] * r + m[0][1] * g + m[0][2] * b)),
    Math.min(255, Math.round(m[1][0] * r + m[1][1] * g + m[1][2] * b)),
    Math.min(255, Math.round(m[2][0] * r + m[2][1] * g + m[2][2] * b)),
  ];
}

// ─── WCAG level helper ────────────────────────────────────────────────────────

function wcagLevel(ratio) {
  if (ratio >= 7)   return { cls: 'level-aaa',      badge: 'crispy',    text: '✓ super readable — chef\'s kiss' };
  if (ratio >= 4.5) return { cls: 'level-aa',       badge: 'solid',     text: '✓ pretty easy to read' };
  if (ratio >= 3)   return { cls: 'level-aa-large', badge: 'ok-ish',    text: '~ fine if the text is big enough' };
  return                   { cls: 'level-fail',     badge: 'rough',     text: '✗ hard to read — squint zone' };
}

// ─── Main update ──────────────────────────────────────────────────────────────

function updateAll() {
  const { bg, text, size, vision } = state;

  // Numeric labels
  el.bgRVal.textContent = bg.r;
  el.bgGVal.textContent = bg.g;
  el.bgBVal.textContent = bg.b;
  el.txRVal.textContent = text.r;
  el.txGVal.textContent = text.g;
  el.txBVal.textContent = text.b;
  el.sizeVal.textContent = size + 'px';

  // Swatches & hex
  const bgColor   = `rgb(${bg.r},${bg.g},${bg.b})`;
  const textColor = `rgb(${text.r},${text.g},${text.b})`;
  el.bgSwatch.style.backgroundColor   = bgColor;
  el.txSwatch.style.backgroundColor   = textColor;
  el.bgHex.textContent = toHex(bg.r, bg.g, bg.b);
  el.txHex.textContent = toHex(text.r, text.g, text.b);

  // Slider gradients (channel-specific colors)
  styleSlider(el.bgR, bg.r, 0, 0);
  styleSlider(el.bgG, 0, bg.g, 0);
  styleSlider(el.bgB, 0, 0, bg.b);
  styleSlider(el.txR, text.r, 0, 0);
  styleSlider(el.txG, 0, text.g, 0);
  styleSlider(el.txB, 0, 0, text.b);

  // Size slider — fixed cyan glow
  el.size.style.setProperty('--thumb-color', '#00FFFF');
  el.size.style.background = 'linear-gradient(90deg, #003333, #00FFFF)';

  // Preview area — apply vision simulation by transforming the colors directly
  const [bgSR, bgSG, bgSB]   = applyVision(bg.r, bg.g, bg.b, vision);
  const [txSR, txSG, txSB]   = applyVision(text.r, text.g, text.b, vision);
  el.preview.style.backgroundColor = `rgb(${bgSR},${bgSG},${bgSB})`;
  el.preview.style.color           = `rgb(${txSR},${txSG},${txSB})`;
  el.preview.style.fontSize        = size + 'px';

  // Metrics
  const bgL   = getLuminance(bg.r, bg.g, bg.b);
  const textL = getLuminance(text.r, text.g, text.b);
  const ratio = getContrastRatio(bgL, textL);
  const level = wcagLevel(ratio);

  el.contrastRatio.textContent = ratio.toFixed(2) + ':1';
  el.contrastRatio.className   = `metric-value contrast-value ${level.cls}`;

  el.contrastBadge.textContent = level.badge;
  el.contrastBadge.className   = `contrast-badge ${level.cls}`;

  el.wcagIndicator.textContent = level.text;
  el.wcagIndicator.className   = `wcag-indicator ${level.cls}`;

  el.bgLuminance.textContent = `${bgL.toFixed(3)} (${(bgL * 100).toFixed(1)}%)`;
  el.txLuminance.textContent = `${textL.toFixed(3)} (${(textL * 100).toFixed(1)}%)`;
}

// ─── Event listeners ──────────────────────────────────────────────────────────

el.bgR.addEventListener('input', () => { state.bg.r = +el.bgR.value; updateAll(); });
el.bgG.addEventListener('input', () => { state.bg.g = +el.bgG.value; updateAll(); });
el.bgB.addEventListener('input', () => { state.bg.b = +el.bgB.value; updateAll(); });

el.txR.addEventListener('input', () => { state.text.r = +el.txR.value; updateAll(); });
el.txG.addEventListener('input', () => { state.text.g = +el.txG.value; updateAll(); });
el.txB.addEventListener('input', () => { state.text.b = +el.txB.value; updateAll(); });

el.size.addEventListener('input', () => { state.size = +el.size.value; updateAll(); });

document.querySelectorAll('input[name="vision"]').forEach(radio => {
  radio.addEventListener('change', () => { state.vision = radio.value; updateAll(); });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

updateAll();
