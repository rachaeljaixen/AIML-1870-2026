// ── app.js — Main application logic ──

// ── State ──
const state = {
  selectedMaterials: new Set(),  // tracks currently selected materials
  currentExperiment: null,       // { gradeLevel, model, materials, title, difficulty, content }
  historyFilters:    { gradeLevel: '', difficulty: '', search: '' }
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  setupAPIKeyUI();
  setupMaterialsUI();
  setupGenerateButton();
  setupOutputButtons();
  setupHistoryUI();
  renderHistory();
});

// ── API Key UI ──
function setupAPIKeyUI() {
  const setKeyBtn    = document.getElementById('setKeyBtn');
  const apiKeyInput  = document.getElementById('apiKeyInput');
  const envFileInput = document.getElementById('envFileInput');
  const keyStatus    = document.getElementById('keyStatus');
  const banner       = document.getElementById('apiKeyBanner');

  setKeyBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    if (!val) return showError('Please enter an API key.');
    if (!val.startsWith('sk-')) return showError('API key should start with "sk-".');
    setAPIKeyDirect(val);
    keyStatus.textContent = '✓ Key set (session only)';
    apiKeyInput.value = '';
  });

  apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') setKeyBtn.click();
  });

  envFileInput.addEventListener('change', () => {
    const file = envFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        setAPIKeyFromEnv(e.target.result);
        if (hasAPIKey()) {
          keyStatus.textContent = '✓ Key loaded from .env (session only)';
        } else {
          showError('No OPENAI_API_KEY found in .env file.');
        }
      } catch {
        showError('Failed to read .env file.');
      }
    };
    reader.readAsText(file);
    envFileInput.value = '';
  });
}

// ── Materials UI ──
function setupMaterialsUI() {
  // Category toggles
  document.querySelectorAll('.category-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const target   = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', String(!expanded));
      target.hidden = expanded;
    });
  });

  // Checkbox changes
  document.querySelectorAll('.category-items input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.selectedMaterials.add(cb.value);
      } else {
        state.selectedMaterials.delete(cb.value);
      }
      renderTags();
    });
  });

  // Custom material add button
  const customInput  = document.getElementById('customMaterial');
  const addMaterialBtn = document.getElementById('addMaterialBtn');

  addMaterialBtn.addEventListener('click', () => addCustomMaterial());
  customInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomMaterial();
  });
}

function addCustomMaterial() {
  const input = document.getElementById('customMaterial');
  const val   = input.value.trim().toLowerCase();
  if (!val) return;
  state.selectedMaterials.add(val);
  input.value = '';
  renderTags();
}

function renderTags() {
  const container = document.getElementById('selectedTags');
  const materials = [...state.selectedMaterials];

  if (materials.length === 0) {
    container.innerHTML = '<span class="tags-placeholder">No materials selected yet</span>';
    return;
  }

  container.innerHTML = materials.map(m =>
    `<span class="tag">
       ${escapeHtml(m)}
       <button class="tag-remove" data-material="${escapeHtml(m)}" aria-label="Remove ${escapeHtml(m)}">×</button>
     </span>`
  ).join('');

  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const mat = btn.dataset.material;
      state.selectedMaterials.delete(mat);
      // Uncheck the checkbox if it exists
      const cb = document.querySelector(`.category-items input[value="${CSS.escape(mat)}"]`);
      if (cb) cb.checked = false;
      renderTags();
    });
  });
}

// ── Generate ──
function setupGenerateButton() {
  document.getElementById('generateBtn').addEventListener('click', handleGenerate);
}

async function handleGenerate() {
  if (!hasAPIKey()) {
    showError('Please set your OpenAI API key first.');
    return;
  }

  const materials = [...state.selectedMaterials];
  if (materials.length === 0) {
    showError('Please select at least one material.');
    return;
  }

  const gradeLevel = document.getElementById('gradeSelect').value;
  const model      = document.getElementById('modelSelect').value;
  const topic      = document.getElementById('topicInput').value.trim();

  setLoading(true);
  hideOutput();

  try {
    const content    = await generateExperiment(gradeLevel, materials, model, topic);
    const title      = extractTitle(content);
    const difficulty = extractDifficulty(content);

    state.currentExperiment = { gradeLevel, model, materials, title, difficulty, content };
    displayExperiment(content);
  } catch (err) {
    showError(err.message || 'Failed to generate experiment. Please try again.');
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  const overlay = document.getElementById('loadingOverlay');
  const btn     = document.getElementById('generateBtn');
  overlay.hidden = !on;
  btn.disabled   = on;
  btn.textContent = on ? 'Generating…' : 'Generate Experiment';
}

function displayExperiment(content) {
  const section = document.getElementById('outputSection');
  const el      = document.getElementById('experimentContent');
  el.innerHTML  = renderMarkdown(content);
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideOutput() {
  document.getElementById('outputSection').hidden = true;
  document.getElementById('experimentContent').innerHTML = '';
}

// ── Output Buttons (Save / Print) ──
function setupOutputButtons() {
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  document.getElementById('printBtn').addEventListener('click', handlePrint);
}

function handleSave() {
  if (!state.currentExperiment) return;
  saveExperiment(state.currentExperiment);
  renderHistory();

  const btn = document.getElementById('saveBtn');
  btn.textContent = '✓ Saved!';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Save to History';
    btn.disabled = false;
  }, 2000);
}

function handlePrint() {
  if (!state.currentExperiment) return;
  const { title, gradeLevel, difficulty, content } = state.currentExperiment;

  // Populate print worksheet
  document.getElementById('printTitle').textContent = title || 'Science Experiment';
  document.getElementById('printGrade').textContent =
    gradeLevel === 'K' ? 'Kindergarten' : `Grade ${gradeLevel}`;
  document.getElementById('printDifficulty').textContent =
    difficulty ? `${difficulty}/5` : 'N/A';
  document.getElementById('printDate').textContent =
    new Date().toLocaleDateString();

  // Add observation lines after Instructions section
  const withObs = content.replace(
    /(## Instructions[\s\S]+?)(## )/,
    (_, instructions, next) =>
      instructions +
      '\n\n**My Observations:**\n' +
      '<div class="obs-line"></div>'.repeat(6) + '\n\n' + next
  );
  document.getElementById('printContent').innerHTML = renderMarkdown(withObs);

  window.print();
}

// ── History UI ──
function setupHistoryUI() {
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (!confirm('Clear all saved experiments?')) return;
    clearAllHistory();
    renderHistory();
  });

  const search  = document.getElementById('historySearch');
  const grade   = document.getElementById('filterGrade');
  const diff    = document.getElementById('filterDifficulty');

  const onFilter = debounce(() => {
    state.historyFilters.search      = search.value;
    state.historyFilters.gradeLevel  = grade.value;
    state.historyFilters.difficulty  = diff.value;
    renderHistory();
  }, 200);

  search.addEventListener('input', onFilter);
  grade.addEventListener('change', onFilter);
  diff.addEventListener('change', onFilter);
}

function renderHistory() {
  const list    = document.getElementById('historyList');
  const history = getExperimentHistory();
  const filtered = filterHistory(history, state.historyFilters);

  if (filtered.length === 0) {
    list.innerHTML = `<p class="history-empty">${
      history.length === 0 ? 'No experiments saved yet.' : 'No results match your filters.'
    }</p>`;
    return;
  }

  list.innerHTML = filtered.map(exp => `
    <div class="history-item" data-id="${exp.id}" role="button" tabindex="0"
         aria-label="View ${escapeHtml(exp.title || 'experiment')}">
      <button class="history-item-delete" data-id="${exp.id}" aria-label="Delete experiment">✕</button>
      <div class="history-item-title">${escapeHtml(exp.title || 'Untitled')}</div>
      <div class="history-item-meta">
        <span>Grade ${escapeHtml(exp.gradeLevel)}</span>
        ${exp.difficulty ? `<span>${generateStarRating(exp.difficulty)}</span>` : ''}
        <span>${formatDate(exp.timestamp)}</span>
      </div>
    </div>
  `).join('');

  // Click to view
  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.history-item-delete')) return;
      const id  = item.dataset.id;
      const exp = getExperimentHistory().find(e => e.id === id);
      if (!exp) return;
      state.currentExperiment = exp;
      displayExperiment(exp.content);

      // Update grade/model selectors to match
      document.getElementById('gradeSelect').value = exp.gradeLevel || '5';
      document.getElementById('modelSelect').value  = exp.model     || 'gpt-4o';
    });

    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') item.click();
    });
  });

  // Delete buttons
  list.querySelectorAll('.history-item-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteExperiment(btn.dataset.id);
      renderHistory();
    });
  });
}

// ── Error Toast ──
let errorTimeout;
function showError(message) {
  const toast = document.getElementById('errorToast');
  document.getElementById('errorMsg').textContent = message;
  toast.hidden = false;
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => { toast.hidden = true; }, 6000);
}

document.getElementById('closeError').addEventListener('click', () => {
  document.getElementById('errorToast').hidden = true;
});
