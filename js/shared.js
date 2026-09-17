/**
 * EduMatch — Shared Utilities, Data Manager & UI Components
 */

// Mapping of EGE subject identifiers to human-readable Russian names
window.EGE_SUBJECTS = {
  russian: 'Русский язык',
  math: 'Профильная математика',
  informatics: 'Информатика и ИКТ',
  physics: 'Физика',
  chemistry: 'Химия',
  biology: 'Биология',
  social_studies: 'Обществознание',
  history: 'История',
  foreign_language: 'Иностранный язык',
  literature: 'Литература',
  geography: 'География'
};

// Backwards compatibility shorthand mapping
window.EGE_SHORT_MAP = {
  rus: 'russian',
  math: 'math',
  cs: 'informatics',
  physics: 'physics',
  chem: 'chemistry',
  bio: 'biology',
  soc: 'social_studies',
  history: 'history',
  foreign: 'foreign_language',
  literature: 'literature',
  geo: 'geography'
};

// Direction category translations
window.DIRECTIONS_MAP = {
  it: 'Информационные технологии',
  engineering: 'Инженерия и физика',
  math: 'Математика и механика',
  science: 'Естественные науки',
  economics: 'Экономика',
  management: 'Менеджмент и управление',
  humanities: 'Гуманитарные науки',
  medicine: 'Медицина и фармация',
  education: 'Педагогика и образование',
  psychology: 'Психология',
  law: 'Юриспруденция',
  design: 'Дизайн'
};

// University full names
window.UNIVERSITIES_MAP = {
  'НИУ ВШЭ': 'НИУ ВШЭ (Нижний Новгород)',
  'МФТИ': 'МФТИ (Физтех, Москва)',
  'МГТУ им. Н.Э. Баумана': 'МГТУ им. Н.Э. Баумана (Москва)',
  'ННГУ им. Лобачевского': 'ННГУ им. Н.И. Лобачевского (Нижний Новгород)',
  'НГТУ им. Р.Е. Алексеева': 'НГТУ им. Р.Е. Алексеева (Политех, Нижний Новгород)',
  'НГЛУ им. Н.А. Добролюбова': 'НГЛУ им. Н.А. Добролюбова (Лингвистический, Нижний Новгород)',
  'ПИМУ': 'ПИМУ Минздрава России (Медицинский, Нижний Новгород)'
};

/**
 * Load programs data
 * Checks window.PROGRAMS_DATA first, then falls back to fetch('universities_programs.json')
 */
window.getProgramsData = async function() {
  if (window.PROGRAMS_DATA && Array.isArray(window.PROGRAMS_DATA) && window.PROGRAMS_DATA.length > 0) {
    return window.PROGRAMS_DATA;
  }
  try {
    const res = await fetch('universities_programs.json');
    if (res.ok) {
      const data = await res.json();
      window.PROGRAMS_DATA = data;
      return data;
    }
  } catch (e) {
    console.warn('Could not fetch universities_programs.json, using fallback data if available.', e);
  }
  return window.PROGRAMS_DATA || [];
};

/**
 * Theme Manager — unified with assistant
 * Reads edumatch_theme OR theme, falls back to prefers-color-scheme, persists immediately
 */
(function initTheme() {
  function getPreferredTheme() {
    try {
      return (
        localStorage.getItem('edumatch_theme') ||
        localStorage.getItem('theme') ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      );
    } catch {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  const savedTheme = getPreferredTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  try {
    localStorage.setItem('edumatch_theme', savedTheme);
    localStorage.setItem('theme', savedTheme);
  } catch {}

  document.addEventListener('DOMContentLoaded', () => {
    const toggleBtns = document.querySelectorAll('#themeToggle, .theme-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem('edumatch_theme', next);
          localStorage.setItem('theme', next);
        } catch {}
      });
    });

    // Mobile nav toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mobileDrawer = document.querySelector('.mobile-nav-drawer');
    if (mobileBtn && mobileDrawer) {
      mobileBtn.addEventListener('click', () => {
        mobileDrawer.classList.toggle('open');
      });
    }

    // Dynamic program counts
    window.getProgramsData().then(programs => {
      document.querySelectorAll('#programCount, .js-program-count').forEach(el => {
        el.textContent = programs.length;
      });
    });

    // Init Modal Listeners
    initModalEvents();
  });
})();

/**
 * Favorites Manager
 */
window.Favorites = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem('edumatch_favs') || '[]');
    } catch {
      return [];
    }
  },
  has(id) {
    return this.getAll().includes(Number(id));
  },
  toggle(id) {
    id = Number(id);
    let favs = this.getAll();
    const index = favs.indexOf(id);
    let isAdded = false;
    if (index > -1) {
      favs.splice(index, 1);
    } else {
      favs.push(id);
      isAdded = true;
    }
    localStorage.setItem('edumatch_favs', JSON.stringify(favs));
    window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { id, isAdded } }));
    showToast(isAdded ? 'Программа сохранена в избранное' : 'Программа удалена из избранного');
    return isAdded;
  }
};

/**
 * Toast notifications
 */
window.showToast = function(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
};

/**
 * Global Program Modal Window
 */
function initModalEvents() {
  const modal = document.getElementById('program-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
}

window.openProgramModal = async function(programId) {
  const data = await window.getProgramsData();
  const prog = data.find(p => p.id === Number(programId));
  if (!prog) return;

  let modal = document.getElementById('program-modal');
  if (!modal) {
    console.error('Modal template not found');
    return;
  }

  const modalBadges = document.getElementById('modal-badges');
  const modalCode = document.getElementById('modal-code');
  const modalTitle = document.getElementById('modal-title');
  const modalProfile = document.getElementById('modal-profile');
  const modalCity = document.getElementById('modal-city');
  const modalUni = document.getElementById('modal-university');
  const modalScore = document.getElementById('modal-score');
  const modalPlaces = document.getElementById('modal-places');
  const modalDirection = document.getElementById('modal-direction');
  const modalDescription = document.getElementById('modal-description');
  const modalRequiredEge = document.getElementById('modal-required-ege');
  const modalOptionalEge = document.getElementById('modal-optional-ege');
  const modalEgeCount = document.getElementById('modal-ege-count');
  const modalSource = document.getElementById('modal-source');
  const modalFavBtn = document.getElementById('modal-fav-btn');

  if (modalCode) modalCode.textContent = prog.code || '';
  if (modalTitle) modalTitle.textContent = prog.title || '';
  if (modalProfile) modalProfile.textContent = prog.profile ? `Профиль: ${prog.profile}` : '';
  if (modalCity) modalCity.textContent = prog.city || '';
  if (modalUni) modalUni.textContent = prog.university || '';
  if (modalScore) modalScore.textContent = prog.minScore ? `${prog.minScore} баллов` : 'Конкурс';
  if (modalPlaces) modalPlaces.textContent = prog.budgetPlaces ? `${prog.budgetPlaces} мест` : '0 мест';
  if (modalDirection) modalDirection.textContent = window.DIRECTIONS_MAP[prog.direction] || prog.direction;
  if (modalDescription) modalDescription.textContent = prog.description || 'Описание уточняется.';

  if (modalEgeCount) {
    modalEgeCount.textContent = `Требуется сдать предметов: ${prog.egeCount || (prog.requiredEge?.length + 1) || 3}`;
  }

  // Required EGE
  if (modalRequiredEge) {
    modalRequiredEge.innerHTML = '';
    const req = prog.requiredEge || [];
    if (req.length > 0) {
      req.forEach(subjectKey => {
        const span = document.createElement('span');
        span.className = 'ege-tag required';
        span.textContent = window.EGE_SUBJECTS[subjectKey] || subjectKey;
        modalRequiredEge.appendChild(span);
      });
    } else {
      modalRequiredEge.innerHTML = '<span style="color: var(--muted); font-size: 13px;">—</span>';
    }
  }

  // Optional EGE
  if (modalOptionalEge) {
    modalOptionalEge.innerHTML = '';
    const opt = prog.optionalEge || [];
    if (opt.length > 0) {
      opt.forEach(subjectKey => {
        const span = document.createElement('span');
        span.className = 'ege-tag';
        span.textContent = window.EGE_SUBJECTS[subjectKey] || subjectKey;
        modalOptionalEge.appendChild(span);
      });
    } else {
      modalOptionalEge.innerHTML = '<span style="color: var(--muted); font-size: 13px;">Все предметы обязательные</span>';
    }
  }

  // Source info
  if (modalSource) {
    modalSource.innerHTML = '';
    if (prog.source) {
      const sources = prog.source.split(',').map(s => s.trim());
      const linksHtml = sources.map(s => {
        let url = s.startsWith('http') ? s : `https://${s}`;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline; margin-right: 12px; display: inline-flex; align-items: center; gap: 4px;">
          <span>${s}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>`;
      }).join('');
      modalSource.innerHTML = linksHtml;
    } else {
      modalSource.textContent = 'Официальный сайт приёмной комиссии университета';
    }
  }

  // Favorite button
  if (modalFavBtn) {
    const updateFavIcon = () => {
      const isFav = window.Favorites.has(prog.id);
      modalFavBtn.classList.toggle('active', isFav);
      modalFavBtn.innerHTML = isFav
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> В избранном`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> В избранное`;
    };
    updateFavIcon();
    modalFavBtn.onclick = () => {
      window.Favorites.toggle(prog.id);
      updateFavIcon();
    };
  }

  modal.classList.add('active');
};
