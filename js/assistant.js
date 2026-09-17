/**
 * EduMatch — Assistant Engine: Calculator, Program Matcher & AI Chat
 */

(function() {
  let allPrograms = [];
  let userSubjects = {}; // { math: 80, russian: 85, ... }
  let userAchievements = 0;
  let activeChanceFilter = 'all';
  let lastMatchedResults = [];

  const PRESETS = {
    it: {
      label: 'IT / Программирование',
      subjects: { math: 82, informatics: 85, russian: 80 },
      direction: 'it'
    },
    math: {
      label: 'Математика / ML',
      subjects: { math: 88, informatics: 80, physics: 78, russian: 76 },
      direction: 'math'
    },
    econ: {
      label: 'Экономика и бизнес',
      subjects: { math: 78, social_studies: 82, russian: 84, foreign_language: 78 },
      direction: 'economics'
    },
    eng: {
      label: 'Инженерия и робототехника',
      subjects: { math: 76, physics: 78, informatics: 74, russian: 72 },
      direction: 'engineering'
    },
    hum: {
      label: 'Лингвистика и гуманитарные',
      subjects: { foreign_language: 86, russian: 88, social_studies: 80, history: 76 },
      direction: 'humanities'
    },
    med: {
      label: 'Медицина и фармация',
      subjects: { chemistry: 82, biology: 80, russian: 80 },
      direction: 'medicine'
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    allPrograms = await window.getProgramsData();

    initPresets();
    initSubjectInputs();
    initAchievements();
    initDynamicSelects();
    initMatchingForm();
    initChanceFilterTabs();
    initViewTabs();
    initChatEngine();

    // Default: activate IT preset for instant live results
    applyPreset('it');
  });

  function initDynamicSelects() {
    const citySelect = document.getElementById('calc-city');
    const uniSelect = document.getElementById('calc-uni');

    if (citySelect && citySelect.options.length <= 1) {
      const cities = Array.from(new Set(allPrograms.map(p => p.city).filter(Boolean))).sort();
      cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
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

  function initPresets() {
    const presetBtns = document.querySelectorAll('.preset');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const key = btn.getAttribute('data-preset');
        if (key && PRESETS[key]) {
          applyPreset(key);
        }
      });
    });
  }

  function applyPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;

    // Reset all checkboxes & inputs
    document.querySelectorAll('.ege-input-row').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]');
      const num = row.querySelector('.ege-score-input');
      const subject = cb.value;

      if (preset.subjects[subject] !== undefined) {
        cb.checked = true;
        num.disabled = false;
        num.value = preset.subjects[subject];
        row.classList.add('active');
        userSubjects[subject] = preset.subjects[subject];
      } else {
        cb.checked = false;
        num.disabled = true;
        num.value = '';
        row.classList.remove('active');
        delete userSubjects[subject];
      }
    });

    const dirSelect = document.getElementById('calc-direction');
    if (dirSelect && preset.direction) {
      dirSelect.value = preset.direction;
    }

    updateTotalScore();
    runProgramMatching();
  }

  function initSubjectInputs() {
    document.querySelectorAll('.ege-input-row').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]');
      const num = row.querySelector('.ege-score-input');
      const subject = cb.value;

      cb.addEventListener('change', () => {
        if (cb.checked) {
          num.disabled = false;
          if (!num.value) num.value = 75;
          userSubjects[subject] = parseInt(num.value, 10) || 0;
          row.classList.add('active');
        } else {
          num.disabled = true;
          row.classList.remove('active');
          delete userSubjects[subject];
        }
        updateTotalScore();
      });

      num.addEventListener('input', () => {
        let val = parseInt(num.value, 10);
        if (isNaN(val)) val = 0;
        if (val > 100) { val = 100; num.value = 100; }
        if (val < 0) { val = 0; num.value = 0; }
        userSubjects[subject] = val;
        updateTotalScore();
      });
    });
  }

  function initAchievements() {
    const achCheckboxes = document.querySelectorAll('.achievement-item input');
    achCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        let pts = 0;
        achCheckboxes.forEach(c => {
          if (c.checked) {
            pts += parseInt(c.getAttribute('data-points') || '0', 10);
          }
        });
        // Max 10 points per Russian legislation
        userAchievements = Math.min(pts, 10);
        updateTotalScore();
      });
    });
  }

  function updateTotalScore() {
    const scores = Object.values(userSubjects);
    const sumEge = scores.reduce((a, b) => a + b, 0);
    const totalWithAch = sumEge + userAchievements;

    const displayEl = document.getElementById('totalScoreDisplay');
    if (displayEl) {
      displayEl.textContent = totalWithAch;
    }
  }

  function initMatchingForm() {
    const form = document.getElementById('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        runProgramMatching();

        // Switch to programs tab if on chat
        switchViewTab('programs');

        // Scroll to results on mobile
        if (window.innerWidth <= 1000) {
          document.getElementById('resultsContainer')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  function initChanceFilterTabs() {
    const tabs = document.querySelectorAll('.chance-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeChanceFilter = tab.getAttribute('data-chance');
        renderMatchedResults();
      });
    });
  }

  function initViewTabs() {
    const tabBtns = document.querySelectorAll('.view-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewName = btn.getAttribute('data-view');
        switchViewTab(viewName);
      });
    });
  }

  function switchViewTab(viewName) {
    const tabBtns = document.querySelectorAll('.view-tab-btn');
    tabBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === viewName));

    const resultsArea = document.getElementById('resultsContainer');
    const chatArea = document.getElementById('chatContainer');

    if (viewName === 'programs') {
      if (resultsArea) resultsArea.style.display = 'block';
      if (chatArea) chatArea.style.display = 'none';
    } else {
      if (resultsArea) resultsArea.style.display = 'none';
      if (chatArea) chatArea.style.display = 'flex';
    }
  }

  /**
   * Program Matching Algorithm
   */
  function runProgramMatching() {
    const chosenSubs = Object.keys(userSubjects);
    if (chosenSubs.length === 0) {
      const listEl = document.getElementById('resultsList');
      if (listEl) {
        listEl.innerHTML = `
          <div class="empty-state">
            <h3 class="empty-title">Выберите сданные предметы ЕГЭ</h3>
            <p class="empty-desc">Отметьте хотя бы 3 предмета и укажите баллы в форме слева.</p>
          </div>
        `;
      }
      return;
    }

    const filterCity = document.getElementById('calc-city')?.value || '';
    const filterUni = document.getElementById('calc-uni')?.value || '';
    const filterDir = document.getElementById('calc-direction')?.value || '';

    const matched = [];

    allPrograms.forEach(prog => {
      // 1. Filter City & Uni & Direction if selected
      if (filterCity && prog.city !== filterCity) return;
      if (filterUni && prog.university !== filterUni) return;
      if (filterDir && prog.direction !== filterDir) return;

      // 2. Check Required Subjects
      const req = prog.requiredEge || [];
      const hasAllRequired = req.every(s => userSubjects[s] !== undefined);
      if (!hasAllRequired) return;

      // 3. Check Optional Subjects
      const opt = prog.optionalEge || [];
      let bestOptionalSubject = null;
      let bestOptionalScore = 0;

      if (opt.length > 0) {
        opt.forEach(s => {
          if (userSubjects[s] !== undefined && userSubjects[s] > bestOptionalScore) {
            bestOptionalScore = userSubjects[s];
            bestOptionalSubject = s;
          }
        });
        if (!bestOptionalSubject) return; // User has none of the optional choices
      }

      // 4. Calculate total composite score for this specific program
      let compositeScore = 0;
      const matchedSubjectBreakdown = [];

      req.forEach(s => {
        const sc = userSubjects[s] || 0;
        compositeScore += sc;
        matchedSubjectBreakdown.push({ subject: s, score: sc, isRequired: true });
      });

      if (bestOptionalSubject) {
        compositeScore += bestOptionalScore;
        matchedSubjectBreakdown.push({ subject: bestOptionalSubject, score: bestOptionalScore, isRequired: false });
      }

      // If program requires 4 subjects (e.g. MIPT, HSE wide programs), check for a 4th valid subject
      const neededCount = prog.egeCount || 3;
      if (matchedSubjectBreakdown.length < neededCount) {
        // Find remaining user subjects that are allowed in prog.ege
        const usedSubs = new Set(matchedSubjectBreakdown.map(m => m.subject));
        const allowedSubs = (prog.ege || []).filter(s => !usedSubs.has(s) && userSubjects[s] !== undefined);

        if (allowedSubs.length > 0) {
          // Sort by highest score
          allowedSubs.sort((a, b) => userSubjects[b] - userSubjects[a]);
          const fourth = allowedSubs[0];
          compositeScore += userSubjects[fourth];
          matchedSubjectBreakdown.push({ subject: fourth, score: userSubjects[fourth], isRequired: false });
        } else {
          // Not enough valid exams for this 4-exam program
          return;
        }
      }

      // Add individual achievements
      const finalUserScore = compositeScore + userAchievements;
      const passScore = prog.minScore || 0;
      const diff = finalUserScore - passScore;

      let chanceCategory = 'high';
      let chanceLabel = '';
      let chanceClass = '';

      if (diff >= 10) {
        chanceCategory = 'high';
        chanceLabel = `Высокий шанс (+${diff} б.)`;
        chanceClass = 'chance-high';
      } else if (diff >= -10) {
        chanceCategory = 'mid';
        chanceLabel = `Хороший шанс (${diff >= 0 ? '+' : ''}${diff} б.)`;
        chanceClass = 'chance-mid';
      } else {
        chanceCategory = 'low';
        chanceLabel = `Зона риска (${diff} б.)`;
        chanceClass = 'chance-low';
      }

      matched.push({
        program: prog,
        userScore: finalUserScore,
        minScore: passScore,
        diff,
        chanceCategory,
        chanceLabel,
        chanceClass,
        subjectsBreakdown: matchedSubjectBreakdown
      });
    });

    // Сначала направления с проходным баллом, ближайшим к баллу пользователя.
    matched.sort((a, b) => {
      const aHasScore = Number.isFinite(a.minScore) && a.minScore > 0;
      const bHasScore = Number.isFinite(b.minScore) && b.minScore > 0;

      // Без известного проходного балла близость оценить нельзя.
      if (aHasScore !== bHasScore) return aHasScore ? -1 : 1;
      if (!aHasScore) return 0;

      const distance = Math.abs(a.diff) - Math.abs(b.diff);
      if (distance !== 0) return distance;

      // При одинаковом расстоянии предпочитаем вариант без недобора.
      return b.diff - a.diff;
    });

    lastMatchedResults = matched;
    renderMatchedResults();
  }

  function renderMatchedResults() {
    const listEl = document.getElementById('resultsList');
    const countBadge = document.getElementById('resultsCount');
    if (!listEl) return;

    let filtered = lastMatchedResults;
    if (activeChanceFilter !== 'all') {
      filtered = lastMatchedResults.filter(r => r.chanceCategory === activeChanceFilter);
    }

    if (countBadge) {
      countBadge.innerHTML = `Найдено подходящих: <strong>${lastMatchedResults.length}</strong>`;
    }

    // Update count labels on tabs
    const highCount = lastMatchedResults.filter(r => r.chanceCategory === 'high').length;
    const midCount = lastMatchedResults.filter(r => r.chanceCategory === 'mid').length;
    const lowCount = lastMatchedResults.filter(r => r.chanceCategory === 'low').length;

    const tabAll = document.querySelector('.chance-tab[data-chance="all"]');
    const tabHigh = document.querySelector('.chance-tab[data-chance="high"]');
    const tabMid = document.querySelector('.chance-tab[data-chance="mid"]');
    const tabLow = document.querySelector('.chance-tab[data-chance="low"]');

    if (tabAll) tabAll.textContent = `Все (${lastMatchedResults.length})`;
    if (tabHigh) tabHigh.textContent = `Высокий шанс (${highCount})`;
    if (tabMid) tabMid.textContent = `Хороший шанс (${midCount})`;
    if (tabLow) tabLow.textContent = `Зона риска (${lowCount})`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-title">В этой категории программ не найдено</h3>
          <p class="empty-desc">Попробуйте переключить категорию на «Все» или изменить параметры подбора слева.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const p = item.program;
      const isFav = window.Favorites.has(p.id);

      const subjectsHtml = item.subjectsBreakdown.map(sb => `
        <span class="ege-tag ${sb.isRequired ? 'required' : ''}">
          ${window.EGE_SUBJECTS[sb.subject] || sb.subject}: <strong>${sb.score} б.</strong>
        </span>
      `).join('');

      return `
        <div class="matched-card" onclick="openProgramModal(${p.id})">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
            <div class="program-badges">
              <span class="badge badge-code">${p.code}</span>
              <span class="badge badge-uni">${p.university}</span>
              <span class="badge badge-city">${p.city}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="chance-banner ${item.chanceClass}">
                ${item.chanceLabel}
              </span>
              <button class="fav-btn ${isFav ? 'active' : ''}"
                      onclick="event.stopPropagation(); window.Favorites.toggle(${p.id}); this.classList.toggle('active', window.Favorites.has(${p.id}));"
                      aria-label="В избранное">
                <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
              </button>
            </div>
          </div>

          <div>
            <h3 class="program-title">${p.title}</h3>
            ${p.profile ? `<div class="program-profile">${p.profile}</div>` : ''}
          </div>

          <p class="program-desc">${p.description}</p>

          <!-- Сравнение баллов -->
          <div class="score-comparison-row">
            <div class="score-col">
              <span class="score-col-label">Ваш расчетный балл</span>
              <span class="score-col-val" style="color: var(--accent);">${item.userScore} б.</span>
            </div>
            <div class="score-col">
              <span class="score-col-label">Проходной балл 2025</span>
              <span class="score-col-val">${item.minScore ? item.minScore + ' б.' : 'Конкурс'}</span>
            </div>
            <div class="score-col">
              <span class="score-col-label">Бюджетных мест</span>
              <span class="score-col-val">${p.budgetPlaces} мест</span>
            </div>
            <div class="score-col">
              <span class="score-col-label">Форма обучения</span>
              <span class="score-col-val">Очная</span>
            </div>
          </div>

          <!-- Предметы в зачет -->
          <div>
            <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 6px;">Учтённые экзамены:</div>
            <div class="program-ege-tags" style="margin-bottom: 0;">
              ${subjectsHtml}
              ${userAchievements > 0 ? `<span class="ege-tag required" style="background: rgba(252,63,29,0.15);">ИД: +${userAchievements} б.</span>` : ''}
            </div>
          </div>

          <div class="program-footer">
            <span style="font-size: 12.5px; color: var(--muted);">Источник: ${p.source?.split(',')[0] || 'Приёмная комиссия'}</span>
            <span class="card-link" style="font-size: 13.5px;">Подробнее о программе →</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     AI CONSULTANT CHAT LOGIC (Incorporated from запас.html)
     ============================================================ */
  function initChatEngine() {
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('chatInput');
    const chatWindow = document.getElementById('chatWindow');

    if (!chatForm || !userInput || !chatWindow) return;

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = userInput.value.trim();
      if (!text) return;

      appendChatMessage('user', text);
      userInput.value = '';

      // Simulate thoughtful AI consultation
      setTimeout(() => {
        const botReply = generateSmartConsultationReply(text);
        appendChatMessage('bot', botReply);
      }, 400);
    });

    // Suggestion chips click
    document.querySelectorAll('.chat-suggest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.trim();
        userInput.value = text;
        chatForm.dispatchEvent(new Event('submit'));
      });
    });
  }

  function appendChatMessage(sender, text) {
    const chatWindow = document.getElementById('chatWindow');
    if (!chatWindow) return;

    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;

    if (sender === 'bot') {
      msg.innerHTML = `
        <div class="chat-avatar">AI</div>
        <div class="msg-bubble">${text}</div>
      `;
    } else {
      msg.innerHTML = `
        <div class="msg-bubble">${escapeHtml(text)}</div>
      `;
    }

    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function generateSmartConsultationReply(query) {
    const q = query.toLowerCase();

    // 1. Direct university query
    if (q.includes('вшэ') || q.includes('hse')) {
      const hseProgs = allPrograms.filter(p => p.university.includes('ВШЭ'));
      return `В <strong>НИУ ВШЭ</strong> в нашей базе представлено <strong>${hseProgs.length} программ</strong> бакалавриата (Нижний Новгород).
      <br><br>Среди них:
      <ul>
        <li><strong>01.03.02 ПМИ (Компьютерные науки):</strong> проходной ~271 б., 55 бюджетных мест.</li>
        <li><strong>01.03.04 Прикладная математика:</strong> проходной ~252 б., 20 бюджетных мест.</li>
        <li><strong>38.03.05 Бизнес-информатика:</strong> востребованный микс IT и менеджмента.</li>
      </ul>
      ВШЭ также предлагает широкую систему университетских скидок до 70% для тех, кому немного не хватило до бюджета.`;
    }

    if (q.includes('мфти') || q.includes('физтех')) {
      const mftiProgs = allPrograms.filter(p => p.university.includes('МФТИ'));
      return `<strong>МФТИ (Физтех)</strong> — один из ведущих научно-технологических вузов страны (Москва / Долгопрудный). В базе EduMatch <strong>${mftiProgs.length} программ</strong>.
      <br><br>Ключевые особенности:
      <ul>
        <li>Традиционно высокие конкурсы (проходные баллы от 290 до 310+ с учетом ИД).</li>
        <li>Большинство программ требуют 4 экзамена ЕГЭ (Русский, Математика, Физика/Информатика, Химия).</li>
        <li>Огромная доля зачисления по БВИ (победители Всероса и перечневых олимпиад I уровня).</li>
      </ul>`;
    }

    if (q.includes('бауман') || q.includes('мгту')) {
      const bmstuProgs = allPrograms.filter(p => p.university.includes('Баумана'));
      return `В <strong>МГТУ им. Н.Э. Баумана</strong> (Москва) в нашей базе представлено <strong>${bmstuProgs.length} программ</strong> инженерного и IT профиля.
      <br><br>Популярные программы:
      <ul>
        <li><strong>09.03.01 Информатика и ВТ:</strong> мощная подготовка разработчиков системного ПО и архитектуры.</li>
        <li><strong>01.03.02 Прикладная математика и информатика</strong> (ФН-12).</li>
        <li><strong>Инженерия и робототехника:</strong> тесные связи с корпорациями Росатом, Ростех и космической отраслью.</li>
      </ul>`;
    }

    if (q.includes('ннгу') || q.includes('лобачевск')) {
      const nnguProgs = allPrograms.filter(p => p.university.includes('ННГУ'));
      return `<strong>ННГУ им. Н.И. Лобачевского</strong> (Нижний Новгород) представлен <strong>${nnguProgs.length} программами</strong> в самых разных областях: от ИИТММ (IT, математика, кибербезопасность) до радиофизики, биологии и юриспруденции. Проходные баллы варьируются от 195 до 260+.`;
    }

    if (q.includes('нгту') || q.includes('политех')) {
      const ngtuProgs = allPrograms.filter(p => p.university.includes('НГТУ'));
      return `<strong>НГТУ им. Р.Е. Алексеева</strong> (Нижегородский Политех) — крупнейший технический вуз Поволжья. В нашей базе <strong>${ngtuProgs.length} программ</strong> по машиностроению, ядерной энергетике, автоматизации и IT. Большое количество бюджетных мест (в сумме более 1500+).`;
    }

    // 2. Query with score number
    const scoreMatch = q.match(/(\d{3})/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (score >= 150 && score <= 310) {
        const fitting = allPrograms.filter(p => p.minScore && p.minScore <= score).sort((a, b) => b.minScore - a.minScore);
        const top3 = fitting.slice(0, 3).map(p => `• <strong>${p.title}</strong> (${p.university}, проходной: ${p.minScore} б., ${p.budgetPlaces} мест)`).join('<br>');
        return `С вашим баллом <strong>${score}</strong> вы проходите на <strong>${fitting.length} из 104 программ</strong> в нашей базе!
        <br><br>Вот отличные варианты на уровне вашего балла:<br>${top3}<br><br>Вы можете воспользоваться калькулятором на этой странице слева, чтобы получить полный список с разбивкой по предметам!`;
      }
    }

    // 3. Questions about Individual Achievements / Medal / TRP
    if (q.includes('медал') || q.includes('гто') || q.includes('достижен') || q.includes('ид')) {
      return `По правилам приёма 2027 года индивидуальные достижения могут добавить <strong>до 10 баллов</strong> к сумме ЕГЭ:
      <ul>
        <li><strong>Аттестат с отличием / Золотая медаль:</strong> обычно +5–10 баллов в зависимости от вуза.</li>
        <li><strong>Серебряная медаль (с отличием 2 степени):</strong> от +2 до +5 баллов.</li>
        <li><strong>Золотой / серебряный знак ГТО:</strong> от +2 до +5 баллов.</li>
        <li><strong>Электронная книжка волонтёра:</strong> от +1 до +3 баллов (при наличии верифицированных часов).</li>
      </ul>
      В форме слева в шаге «Индивидуальные достижения» вы можете отметить ваши награды!`;
    }

    // 4. Questions about BVI / Olympiads
    if (q.includes('бви') || q.includes('олимпиад')) {
      return `<strong>Право БВИ (Без Вступительных Испытаний)</strong> даёт возможность поступить на бюджет вне общего конкурса:
      <ul>
        <li><strong>Всероссийская олимпиада (ВсОШ):</strong> победители и призёры заключительного этапа поступают без подтверждения баллами ЕГЭ!</li>
        <li><strong>Олимпиады РСОШ (I, II, III уровней):</strong> требуют подтверждения результатом ЕГЭ не менее 75 баллов по профильному предмету.</li>
        <li><strong>Важное правило:</strong> право БВИ можно использовать <em>только в один университет</em> на одно направление. В остальные 4 вуза подаются документы по общему конкурсу.</li>
      </ul>
      Подробнее смотрите в разделе <strong><a href="roadmap.html" style="color: var(--accent);">Roadmap → Олимпиадный трек</a></strong>.`;
    }

    // 5. IT / Artificial Intelligence / Data Science
    if (q.includes('it') || q.includes('программир') || q.includes('ии') || q.includes('ai') || q.includes('компьютер')) {
      const itProgs = allPrograms.filter(p => p.direction === 'it');
      return `В нашей базе найдено <strong>${itProgs.length} IT-специальностей</strong>!
      <br><br>Среди флагманских программ:
      <ul>
        <li><strong>09.03.04 Программная инженерия</strong> (НИУ ВШЭ, ННГУ)</li>
        <li><strong>01.03.02 Компьютерные науки и технологии</strong> (ВШЭ, МФТИ)</li>
        <li><strong>09.03.01 Информатика и вычислительная техника</strong> (МГТУ им. Баумана, НГТУ)</li>
      </ul>
      Для большинства IT-программ требуются Профильная математика, Русский язык и Информатика либо Физика.`;
    }

    // Default friendly response
    return `Я проанализировал ваш вопрос по базе данных EduMatch.
    <br><br>В нашей системе собрана актуальная информация по <strong>104 программам</strong> бакалавриата с официальными проходными баллами и бюджетными местами 2027 года.
    <br><br>💡 <strong>Совет:</strong> Вы можете выбрать предметы ЕГЭ в форме слева, нажать «Подобрать программы», и алгоритм моментально выведет специальности с расчётом ваших шансов на поступление!`;
  }
})();
