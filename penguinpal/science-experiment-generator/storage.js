// ── storage.js — LocalStorage management ──

const STORAGE_KEY     = 'science_experiments_history';
const MAX_EXPERIMENTS = 50;

/** Save an experiment to history. Trims to MAX_EXPERIMENTS (FIFO). */
function saveExperiment(experimentData) {
  let history = getExperimentHistory();

  history.unshift({
    id:        Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...experimentData
  });

  if (history.length > MAX_EXPERIMENTS) {
    history = history.slice(0, MAX_EXPERIMENTS);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return history[0]; // return the saved item
}

/** Load full experiment history. */
function getExperimentHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Delete a single experiment by id. */
function deleteExperiment(id) {
  const history = getExperimentHistory().filter(exp => exp.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/** Delete all experiments. */
function clearAllHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Filter history by optional criteria.
 * @param {Array}  history
 * @param {object} filters - { gradeLevel, difficulty, search }
 */
function filterHistory(history, { gradeLevel = '', difficulty = '', search = '' } = {}) {
  return history.filter(exp => {
    if (gradeLevel && exp.gradeLevel !== gradeLevel) return false;
    if (difficulty  && String(exp.difficulty) !== difficulty) return false;
    if (search) {
      const q = search.toLowerCase();
      const titleMatch     = (exp.title || '').toLowerCase().includes(q);
      const materialMatch  = (exp.materials || []).some(m => m.toLowerCase().includes(q));
      if (!titleMatch && !materialMatch) return false;
    }
    return true;
  });
}
