// ── OpenAI API Integration (via server proxy) ───────────────

async function generateReview({ productName, category, length, style, comments, model }) {
  const response = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName, category, length, style, comments, model })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Server error ${response.status}`);
  }

  return data.review;
}
