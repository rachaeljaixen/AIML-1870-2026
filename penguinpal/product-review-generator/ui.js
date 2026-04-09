// ── UI State Management ─────────────────────────────────────

const el = id => document.getElementById(id);

const dom = {
  apiKeyInput:    el('apiKeyInput'),
  keyStatus:      el('keyStatus'),
  productName:    el('productName'),
  productNameErr: el('productNameErr'),
  category:       el('category'),
  categoryErr:    el('categoryErr'),
  length:         el('length'),
  style:          el('style'),
  model:          el('model'),
  comments:       el('comments'),
  generateBtn:    el('generateBtn'),
  clearBtn:       el('clearBtn'),
  outputCard:     el('outputCard'),
  outputBody:     el('outputBody'),
  outputMeta:     el('outputMeta'),
  copyBtn:        el('copyBtn'),
  newBtn:         el('newBtn'),
  errToast:       el('errToast'),
  errMsg:         el('errMsg'),
  closeErr:       el('closeErr')
};

// ── API Key ─────────────────────────────────────────────────

function initKey() {
  const saved = localStorage.getItem('prg_openai_key');
  if (saved) { dom.apiKeyInput.value = saved; setKeyStatus(true); }

  dom.apiKeyInput.addEventListener('input', () => {
    const k = dom.apiKeyInput.value.trim();
    if (k) { localStorage.setItem('prg_openai_key', k); setKeyStatus(true); }
    else   { localStorage.removeItem('prg_openai_key');  setKeyStatus(false); }
  });
}

function setKeyStatus(ok) {
  dom.keyStatus.textContent = ok ? '✓' : '';
  dom.keyStatus.style.color = ok ? 'var(--green)' : '';
}

function getApiKey() {
  return dom.apiKeyInput.value.trim();
}

// ── Loading ─────────────────────────────────────────────────

function setLoading(on) {
  dom.generateBtn.disabled    = on;
  dom.generateBtn.textContent = on ? '⟳ Generating…' : '⚡ Generate Review';
  if (on) dom.generateBtn.classList.add('btn-loading');
  else    dom.generateBtn.classList.remove('btn-loading');
}

// ── Validation ──────────────────────────────────────────────

function clearValidation() {
  [dom.productName, dom.category].forEach(i => i.classList.remove('invalid'));
  dom.productNameErr.textContent = '';
  dom.categoryErr.textContent    = '';
}

function validateForm() {
  clearValidation();
  let valid = true;

  if (!getApiKey()) {
    showError('Please enter your OpenAI API key.');
    dom.apiKeyInput.focus();
    return false;
  }

  if (!dom.productName.value.trim()) {
    dom.productName.classList.add('invalid');
    dom.productNameErr.textContent = 'Product name is required.';
    valid = false;
  }

  if (!dom.category.value.trim()) {
    dom.category.classList.add('invalid');
    dom.categoryErr.textContent = 'Category is required.';
    valid = false;
  }

  return valid;
}

// ── Output ──────────────────────────────────────────────────

async function fetchWikipediaImage(productName) {
  try {
    const res  = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(productName)}`);
    const data = await res.json();
    return data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

function makePlaceholder(productName) {
  return `<div class="product-image-placeholder"><span class="placeholder-label">${productName}</span></div>`;
}

async function showOutput(markdownText, meta, productName) {
  dom.outputCard.style.display = 'block';
  dom.outputMeta.textContent   = meta || '';
  dom.outputBody.innerHTML     = '<p class="output-placeholder">Loading image…</p>';

  const wikiUrl   = await fetchWikipediaImage(productName);
  const imageHtml = wikiUrl
    ? `<div class="product-image-wrap"><img class="product-image" src="${wikiUrl}" alt="${productName}" onerror="this.parentElement.outerHTML='${makePlaceholder(productName).replace(/'/g, "\\'")}'" ></div>`
    : makePlaceholder(productName);

  dom.outputBody.innerHTML = imageHtml + marked.parse(markdownText);
  dom.outputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showOutputLoading() {
  dom.outputCard.style.display = 'block';
  dom.outputBody.innerHTML     = '<p class="output-placeholder">Generating your review…</p>';
  dom.outputMeta.textContent   = '';
}

function hideOutput() {
  dom.outputCard.style.display = 'none';
  dom.outputBody.innerHTML     = '';
}

// ── Error Toast ─────────────────────────────────────────────

function showError(msg) {
  dom.errMsg.textContent     = msg;
  dom.errToast.style.display = 'flex';
  clearTimeout(showError._timer);
  showError._timer = setTimeout(hideError, 8000);
}

function hideError() {
  dom.errToast.style.display = 'none';
}

// ── Copy ────────────────────────────────────────────────────

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(dom.outputBody.innerText);
    const orig = dom.copyBtn.textContent;
    dom.copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { dom.copyBtn.textContent = orig; }, 2000);
  } catch {
    showError('Failed to copy — please select and copy manually.');
  }
}
