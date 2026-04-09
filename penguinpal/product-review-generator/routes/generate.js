const express = require('express');
const router  = express.Router();

const LENGTH_WORDS = {
  short:  '100-150 words',
  medium: '200-300 words',
  long:   '400-500 words'
};

router.post('/', async (req, res) => {
  const { productName, category, length, style, comments, model } = req.body;

  if (!productName || !category || !length || !style || !model) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY.' });
  }

  const wordCount  = LENGTH_WORDS[length] || '200-300 words';
  const systemMsg  = `You are a professional product reviewer. Write clear, honest, and helpful reviews in markdown format. Use headers, bullet points, and formatting where appropriate.`;
  const userPrompt = `Generate a ${wordCount} ${style} review for "${productName}" in the ${category} category.${comments ? `\n\nAdditional context from the reviewer:\n${comments}` : ''}`;

  try {
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
      const msg = data.error?.message || `OpenAI error ${response.status}`;

      if (response.status === 401) return res.status(401).json({ error: 'Authentication failed. Please check your API key.' });
      if (response.status === 429) return res.status(429).json({ error: 'API rate limit exceeded. Please try again later.' });
      if (response.status === 400 && msg.includes('model')) return res.status(400).json({ error: 'Selected model is not available. Please choose another.' });

      return res.status(response.status).json({ error: msg });
    }

    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) return res.status(500).json({ error: 'No review generated. Please try again with different inputs.' });

    res.json({ review: text });
  } catch (err) {
    res.status(500).json({ error: 'Connection failed. Please check your internet connection.' });
  }
});

module.exports = router;
