// ── utils.js — Helper functions ──

/**
 * Render markdown to sanitized HTML using marked + DOMPurify.
 * Falls back to a simple pre-wrap if libraries are unavailable.
 */
function renderMarkdown(text) {
  if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
    const html = marked.parse(text, { breaks: true, gfm: true });
    return DOMPurify.sanitize(html);
  }
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { breaks: true, gfm: true });
  }
  // Bare fallback
  return `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>`;
}

/** Extract difficulty rating (1–5) from markdown text. */
function extractDifficulty(text) {
  const match = text.match(/\*{0,2}[Dd]ifficulty[:\s]*\*{0,2}\s*([1-5])/);
  if (match) return parseInt(match[1], 10);
  // Also handle star formats like ★★★
  const starMatch = text.match(/\*{0,2}[Dd]ifficulty[:\s]*\*{0,2}\s*(★+)/);
  if (starMatch) return starMatch[1].length;
  return null;
}

/** Extract experiment title (first H1 line) from markdown text. */
function extractTitle(text) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled Experiment';
}

/** Format an ISO date string for display. */
function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return '';
  }
}

/** Generate star rating HTML (filled ★ and empty ☆). */
function generateStarRating(difficulty) {
  if (!difficulty || difficulty < 1 || difficulty > 5) return '';
  const filled = '★'.repeat(difficulty);
  const empty  = '☆'.repeat(5 - difficulty);
  return `<span class="stars" aria-label="Difficulty ${difficulty} out of 5">${filled}${empty}</span>`;
}

/** Escape HTML special characters. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Debounce a function call. */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
