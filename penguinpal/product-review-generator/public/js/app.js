// ── Main Application Logic ──────────────────────────────────

const STYLE_LABELS = {
  short:  'Short (100-150 words)',
  medium: 'Medium (200-300 words)',
  long:   'Long (400-500 words)'
};

async function handleGenerate() {
  if (!validateForm()) return;

  const productName = dom.productName.value.trim();
  const category    = dom.category.value.trim();
  const length      = dom.length.value;
  const style       = dom.style.value;
  const model       = dom.model.value;
  const comments    = dom.comments.value.trim();

  hideError();
  setLoading(true);
  showOutputLoading();

  try {
    const review = await generateReview({ productName, category, length, style, comments, model });
    const meta   = `${productName} · ${style} · ${STYLE_LABELS[length]} · ${model}`;
    showOutput(review, meta, productName);
  } catch (err) {
    hideOutput();
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

function handleClear() {
  dom.productName.value = '';
  dom.category.value    = '';
  dom.comments.value    = '';
  dom.length.value      = 'medium';
  dom.style.value       = 'Casual';
  dom.model.value       = 'gpt-4o-mini';
  clearValidation();
  hideOutput();
  hideError();
}

// ── Event Bindings ──────────────────────────────────────────

dom.generateBtn.addEventListener('click', handleGenerate);
dom.clearBtn.addEventListener('click', handleClear);
dom.copyBtn.addEventListener('click', copyOutput);
dom.newBtn.addEventListener('click', handleClear);
dom.closeErr.addEventListener('click', hideError);

// Allow Enter in text inputs to trigger generation
[dom.productName, dom.category].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleGenerate();
  });
});
