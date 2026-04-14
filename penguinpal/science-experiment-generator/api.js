// ── api.js — OpenAI API integration ──

// API key stored in memory only — never written to localStorage
let _apiConfig = null;

// ── Key management ──

/** Parse a .env file string into a key-value map. */
function parseEnvFile(content) {
  const config = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key   = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && value) config[key] = value;
  });
  return config;
}

/** Set API key from a raw .env file string. */
function setAPIKeyFromEnv(envContent) {
  _apiConfig = parseEnvFile(envContent);
}

/** Set API key directly (pasted/typed). */
function setAPIKeyDirect(key) {
  _apiConfig = { OPENAI_API_KEY: key.trim() };
}

/** Return the stored API key, or null. */
function getAPIKey() {
  return _apiConfig?.OPENAI_API_KEY || null;
}

/** True if an API key is currently set in memory. */
function hasAPIKey() {
  const key = getAPIKey();
  return Boolean(key && key.startsWith('sk-'));
}

// ── Experiment generation ──

/**
 * Build the system prompt for the LLM.
 */
function buildSystemPrompt(gradeLevel, materials, topic) {
  const gradeLabel = gradeLevel === 'K' ? 'Kindergarten' : `Grade ${gradeLevel}`;
  return `You are an expert science educator creating safe, engaging experiments for ${gradeLabel} students.
Generate a complete experiment using ONLY these materials: ${materials.join(', ')}.
${topic ? `Focus on the science topic: ${topic}.` : ''}

Format your response in markdown with these exact sections:

# [Experiment Title]
**Difficulty:** [1-5 number only]
**Time:** [estimated duration]

## Materials Needed
[bulleted list of only the materials from the provided list that are needed]

## Instructions
[numbered steps, clear and age-appropriate for ${gradeLabel}]

## What's Happening?
[age-appropriate scientific explanation of the science behind the experiment]

## Safety Notes
[any important safety precautions, or "No special precautions needed" if safe]

## Discussion Questions
[3-5 questions to deepen understanding, appropriate for ${gradeLabel}]

Keep all language, complexity, and explanations appropriate for ${gradeLabel} students.`;
}

/**
 * Call the OpenAI chat completions API to generate an experiment.
 * @param {string}   gradeLevel
 * @param {string[]} materials
 * @param {string}   model
 * @param {string}   [topic='']
 * @returns {Promise<string>} Markdown-formatted experiment text
 */
async function generateExperiment(gradeLevel, materials, model, topic = '') {
  const apiKey = getAPIKey();
  if (!apiKey) throw new Error('No API key set. Please enter your OpenAI API key.');

  const systemPrompt = buildSystemPrompt(gradeLevel, materials, topic);

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model:      model,
      messages: [
        { role: 'system',  content: systemPrompt },
        { role: 'user',    content: 'Generate the experiment now.' }
      ],
      temperature: 0.8,
      max_tokens:  2000
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    handleAPIError(response.status, errorBody);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── Error handling ──

/** Throw a user-friendly error for known API error codes. */
function handleAPIError(status, body) {
  const msg = body?.error?.message || '';
  switch (status) {
    case 401:
      throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
    case 429:
      throw new Error('Rate limit reached. Please wait a moment and try again.');
    case 500:
    case 503:
      throw new Error('OpenAI service is temporarily unavailable. Please try again shortly.');
    default:
      throw new Error(msg || `API error (${status}). Please try again.`);
  }
}

/** Fetch with simple exponential backoff retry for 429 errors. */
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status !== 429 || attempt === retries) return resp;
    const delay = Math.pow(2, attempt) * 1000;
    await new Promise(r => setTimeout(r, delay));
  }
}
