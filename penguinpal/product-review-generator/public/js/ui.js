// ── UI State Management ─────────────────────────────────────

const el = id => document.getElementById(id);

const dom = {
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

// ── Loading ─────────────────────────────────────────────────

function setLoading(on) {
  if (on) {
    dom.generateBtn.disabled  = true;
    dom.generateBtn.textContent = '⟳ Generating…';
    dom.generateBtn.classList.add('btn-loading');
  } else {
    dom.generateBtn.disabled  = false;
    dom.generateBtn.textContent = '⚡ Generate Review';
    dom.generateBtn.classList.remove('btn-loading');
  }
}

// ── Validation ──────────────────────────────────────────────

function clearValidation() {
  [dom.productName, dom.category].forEach(input => input.classList.remove('invalid'));
  dom.productNameErr.textContent = '';
  dom.categoryErr.textContent    = '';
}

function validateForm() {
  clearValidation();
  let valid = true;

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
  return `<div class="product-image-placeholder">
    <span class="placeholder-label">${productName}</span>
  </div>`;
}

async function showOutput(markdownText, meta, productName) {
  dom.outputCard.style.display = 'block';
  dom.outputMeta.textContent   = meta || '';

  // Show loading state while fetching image
  dom.outputBody.innerHTML = '<p class="output-placeholder">Generating your review…</p>';

  const wikiUrl = await fetchWikipediaImage(productName);

  const imageHtml = wikiUrl
    ? `<div class="product-image-wrap"><img class="product-image" src="${wikiUrl}" alt="${productName}" onerror="this.parentElement.outerHTML='${makePlaceholder(productName).replace(/'/g, "\\'")}'" ></div>`
    : makePlaceholder(productName);

  dom.outputBody.innerHTML = imageHtml + marked.parse(markdownText);
  dom.outputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showOutputLoading() {
  dom.outputCard.style.display = 'block';
  dom.outputBody.innerHTML = '<p class="output-placeholder">Generating your review…</p>';
  dom.outputMeta.textContent = '';
}

function hideOutput() {
  dom.outputCard.style.display = 'none';
  dom.outputBody.innerHTML = '';
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

// ── Copy to Clipboard ────────────────────────────────────────

async function copyOutput() {
  const text = dom.outputBody.innerText;
  try {
    await navigator.clipboard.writeText(text);
    const orig = dom.copyBtn.textContent;
    dom.copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { dom.copyBtn.textContent = orig; }, 2000);
  } catch {
    showError('Failed to copy — please select and copy manually.');
  }
}
