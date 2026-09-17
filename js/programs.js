/**
 * EduMatch — Programs Catalog Engine
 */

(function() {
  let allPrograms = [];
  let currentFilters = {
    search: '',
    subjects: new Set(),
    direction: '',
    city: '',
    university: '',
    score: null,
    onlyFavorites: false,
    sortBy: 'default'
  };

  document.addEventListener('DOMContentLoaded', async () => {
    allPrograms = await window.getProgramsData();

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('q')) {
      currentFilters.search = urlParams.get('q');
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = currentFilters.search;
    }
    if (urlParams.has('direction')) {
      currentFilters.direction = urlParams.get('direction');
      const dirSelect = document.getElementById('direction-filter');
      if (dirSelect) dirSelect.value = currentFilters.direction;
    }
    if (urlParams.has('city')) {
      currentFilters.city = urlParams.get('city');
      const citySelect = document.getElementById('city-filter');
      if (citySelect) citySelect.value = currentFilters.city;
    }

    // Populate City & University dynamic selects if present
    populateFilterOptions();

    // Setup Event Listeners
    initFilterListeners();

    // Initial render
    renderCatalog();

    // Listen to favorites updates from modal or cards
    window.addEventListener('favoritesUpdated', () => {
      renderCatalog();
    });
  });

  function populateFilterOptions() {
    const citySelect = document.getElementById('city-filter');
    const uniSelect = document.getElementById('university-filter');

    if (citySelect && citySelect.options.length <= 1) {
      const cities = Array.from(new Set(allPrograms.map(p => p.city).filter(Boolean))).sort();
      cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (currentFilters.city === c) opt.selected = true;
        citySelect.appendChild(opt);
      });
    }

    if (uniSelect && uniSelect.options.length <= 1) {
      const unis = Array.from(new Set(allPrograms.map(p => p.university).filter(Boolean))).sort();
      unis.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        uniSelect.appendChild(opt);
      });
    }
  }

  function initFilterListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentFilters.search = e.target.value.trim().toLowerCase();
        renderCatalog();
      });
    }

    // Subject checkboxes
    const subjectCheckboxes = document.querySelectorAll('.subject-chip input');
    subjectCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked) {
          currentFilters.subjects.add(val);
        } else {
          currentFilters.subjects.delete(val);
        }
        updateSubjectCounter();
        renderCatalog();
      });
    });

    // Direction filter
    const dirSelect = document.getElementById('direction-filter');
    if (dirSelect) {
      dirSelect.addEventListener('change', (e) => {
        currentFilters.direction = e.target.value;
        renderCatalog();
      });
    }

    // City filter
    const citySelect = document.getElementById('city-filter');
    if (citySelect) {
      citySelect.addEventListener('change', (e) => {
        currentFilters.city = e.target.value;
        renderCatalog();
      });
    }

    // University filter
    const uniSelect = document.getElementById('university-filter');
    if (uniSelect) {
      uniSelect.addEventListener('change', (e) => {
        currentFilters.university = e.target.value;
        renderCatalog();
      });
    }

    // Score filter
    const scoreInput = document.getElementById('score-filter');
    if (scoreInput) {
      scoreInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        currentFilters.score = isNaN(val) ? null : val;
        renderCatalog();
      });
    }

    // Sort select
    const sortSelect = document.getElementById('sort-filter');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentFilters.sortBy = e.target.value;
        renderCatalog();
      });
    }

    // Favorites only toggle
    const favToggleBtn = document.getElementById('fav-toggle-btn');
    if (favToggleBtn) {
      favToggleBtn.addEventListener('click', () => {
        currentFilters.onlyFavorites = !currentFilters.onlyFavorites;
        favToggleBtn.classList.toggle('active', currentFilters.onlyFavorites);
        renderCatalog();
      });
    }

    // Reset button
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetFilters);
    }
  }

  function updateSubjectCounter() {
    const counter = document.getElementById('selected-subjects-count');
    if (counter) {
      counter.textContent = currentFilters.subjects.size > 0 ? `(${currentFilters.subjects.size})` : '';
    }
  }

  function resetFilters() {
    currentFilters = {
      search: '',
      subjects: new Set(),
      direction: '',
      city: '',
      university: '',
      score: null,
      onlyFavorites: false,
      sortBy: 'default'
    };

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const scoreInput = document.getElementById('score-filter');
    if (scoreInput) scoreInput.value = '';

    const dirSelect = document.getElementById('direction-filter');
    if (dirSelect) dirSelect.value = '';

    const citySelect = document.getElementById('city-filter');
    if (citySelect) citySelect.value = '';

    const uniSelect = document.getElementById('university-filter');
    if (uniSelect) uniSelect.value = '';

    const sortSelect = document.getElementById('sort-filter');
    if (sortSelect) sortSelect.value = 'default';

    const favToggleBtn = document.getElementById('fav-toggle-btn');
    if (favToggleBtn) favToggleBtn.classList.remove('active');

    document.querySelectorAll('.subject-chip input').forEach(cb => {
      cb.checked = false;
    });

    updateSubjectCounter();
    renderCatalog();
  }

  function filterPrograms() {
    return allPrograms.filter(prog => {
      // 1. Text search
      if (currentFilters.search) {
        const q = currentFilters.search;
        const matchTitle = (prog.title || '').toLowerCase().includes(q);
        const matchCode = (prog.code || '').toLowerCase().includes(q);
        const matchUni = (prog.university || '').toLowerCase().includes(q);
        const matchProfile = (prog.profile || '').toLowerCase().includes(q);
        const matchCity = (prog.city || '').toLowerCase().includes(q);
        const matchDesc = (prog.description || '').toLowerCase().includes(q);

        if (!matchTitle && !matchCode && !matchUni && !matchProfile && !matchCity && !matchDesc) {
          return false;
        }
      }

      // 2. Direction filter
      if (currentFilters.direction && prog.direction !== currentFilters.direction) {
        return false;
      }

      // 3. City filter
      if (currentFilters.city && prog.city !== currentFilters.city) {
        return false;
      }

      // 4. University filter
      if (currentFilters.university && prog.university !== currentFilters.university) {
        return false;
      }

      // 5. Score filter (if user specified their score, program's minScore should be <= userScore)
      if (currentFilters.score !== null) {
        if (prog.minScore && prog.minScore > currentFilters.score) {
          return false;
        }
      }

      // 6. Favorites only
      if (currentFilters.onlyFavorites) {
        if (!window.Favorites.has(prog.id)) {
          return false;
        }
      }

      // 7. Subjects filter
      // If user selected subjects, check whether user's selected subjects can satisfy the program requirements
      if (currentFilters.subjects.size > 0) {
        const userSubs = currentFilters.subjects;

        // Check required subjects: all required subjects must be selected by user
        const req = prog.requiredEge || [];
        const hasAllRequired = req.every(s => userSubs.has(s));
        if (!hasAllRequired) {
          return false;
        }

        // Check optional subjects: if program has optional subjects, user must have at least one of them
        const opt = prog.optionalEge || [];
        if (opt.length > 0) {
          const hasAnyOptional = opt.some(s => userSubs.has(s));
          if (!hasAnyOptional) {
            return false;
          }
        }
      }

      return true;
    });
  }

  function sortPrograms(list) {
    const sorted = [...list];
    switch (currentFilters.sortBy) {
      case 'score-asc':
        return sorted.sort((a, b) => (a.minScore || 999) - (b.minScore || 999));
      case 'score-desc':
        return sorted.sort((a, b) => (b.minScore || 0) - (a.minScore || 0));
      case 'places-desc':
        return sorted.sort((a, b) => (b.budgetPlaces || 0) - (a.budgetPlaces || 0));
      case 'title-asc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
      case 'code-asc':
        return sorted.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      default:
        return sorted;
    }
  }

  function renderCatalog() {
    const container = document.getElementById('programsList');
    const countDisplay = document.getElementById('catalogCount');
    if (!container) return;

    const filtered = filterPrograms();
    const sorted = sortPrograms(filtered);

    if (countDisplay) {
      countDisplay.textContent = sorted.length;
    }

    if (sorted.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <h3 class="empty-title">Программы не найдены</h3>
          <p class="empty-desc">Попробуйте изменить комбинацию предметов ЕГЭ, снизить проходной балл или очистить поисковый запрос.</p>
          <button class="btn btn-secondary btn-sm" onclick="window.resetCatalogFilters()">Сбросить фильтры</button>
        </div>
      `;
      return;
    }

    container.innerHTML = sorted.map(prog => {
      const isFav = window.Favorites.has(prog.id);
      const reqTags = (prog.requiredEge || []).map(s => `
        <span class="ege-tag required" title="Обязательный предмет">${window.EGE_SUBJECTS[s] || s}</span>
      `).join('');
      const optTags = (prog.optionalEge || []).map(s => `
        <span class="ege-tag" title="Предмет по выбору">${window.EGE_SUBJECTS[s] || s}</span>
      `).join('');

      return `
        <div class="program-card" onclick="openProgramModal(${prog.id})">
          <div class="program-card-header">
            <div class="program-badges">
              <span class="badge badge-code">${prog.code}</span>
              <span class="badge badge-uni">${prog.university}</span>
              <span class="badge badge-city">${prog.city}</span>
            </div>
            <button class="fav-btn ${isFav ? 'active' : ''}"
                    onclick="event.stopPropagation(); window.Favorites.toggle(${prog.id});"
                    aria-label="В избранное">
              <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>

          <h3 class="program-title">${prog.title}</h3>
          ${prog.profile ? `<div class="program-profile">${prog.profile}</div>` : ''}

          <p class="program-desc">${prog.description}</p>

          <div class="program-ege-tags">
            ${reqTags}
            ${optTags}
          </div>

          <div class="program-footer">
            <div class="program-stats">
              <div class="stat-item">
                <span class="stat-label">Проходной балл</span>
                <span class="stat-value highlight">${prog.minScore ? prog.minScore + ' б.' : 'Конкурс'}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Бюджет</span>
                <span class="stat-value">${prog.budgetPlaces} мест</span>
              </div>
            </div>
            <span class="card-link" style="font-size: 13px;">Подробнее →</span>
          </div>
        </div>
      `;
    }).join('');
  }

  window.resetCatalogFilters = resetFilters;
})();
