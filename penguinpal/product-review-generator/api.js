// ── OpenAI API (direct browser call) ───────────────────────

const LENGTH_WORDS = {
  short:  '100-150 words',
  medium: '200-300 words',
  long:   '400-500 words'
};

async function generateReview({ productName, category, length, style, comments, model, apiKey }) {
  const wordCount  = LENGTH_WORDS[length] || '200-300 words';
  const systemMsg  = 'You are a professional product reviewer. Write clear, honest, and helpful reviews in markdown format. Use headers, bullet points, and formatting where appropriate.';
  const userPrompt = `Generate a ${wordCount} ${style} review for "${productName}" in the ${category} category.${comments ? `\n\nAdditional context from the reviewer:\n${comments}` : ''}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens:  1000
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data.error?.message || '';
    if (response.status === 401) throw new Error('Authentication failed. Please check your API key.');
    if (response.status === 429) throw new Error('API rate limit exceeded. Please try again later.');
    throw new Error(msg || `OpenAI error ${response.status}`);
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('No review generated. Please try again.');
  return text;
}
