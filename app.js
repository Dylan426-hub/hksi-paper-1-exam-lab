(function () {
  "use strict";

  const data = window.HKSI_DATA || { topics: [], lens: [], updates: [], terms: [], sources: [] };
  const questions = Array.isArray(window.HKSI_QUESTIONS) ? window.HKSI_QUESTIONS : [];
  const STORAGE_KEY = "hksi-p1-exam-desk-v1";
  const ERROR_TYPES = ["概念混淆", "数字门槛", "角色边界", "反向题干", "组合题", "时间不足", "过度推理"];
  const LETTERS = ["A", "B", "C", "D"];

  const defaultState = {
    completedTopics: [],
    attempts: [],
    wrongIds: [],
    examDate: "",
    weekdayMinutes: 45,
    weekendMinutes: 90,
    lastMock: null,
    mockHistory: [],
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let state = loadState();
  let activeTopicId = 4;
  let topicFilter = "all";
  let confidence = 2;
  let practiceSet = [];
  let practiceIndex = 0;
  let practiceSelected = null;
  let practiceAnswered = false;
  let practiceRound = { answered: 0, correct: 0, wrong: 0 };
  let mockSession = null;
  let mockTimer = null;
  let toastTimer = null;
  let lastFocusedElement = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return structuredClone(defaultState);
      return {
        ...structuredClone(defaultState),
        ...saved,
        completedTopics: Array.isArray(saved.completedTopics) ? saved.completedTopics : [],
        attempts: Array.isArray(saved.attempts) ? saved.attempts.slice(-800) : [],
        wrongIds: Array.isArray(saved.wrongIds) ? [...new Set(saved.wrongIds)] : [],
        mockHistory: Array.isArray(saved.mockHistory) ? saved.mockHistory.slice(-12) : [],
      };
    } catch (_error) {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateReadiness();
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function highlightStem(value) {
    return escapeHtml(value).replace(
      /(不正确|不可能|错误|正确|最可能|最不可能|INCORRECT|CORRECT|MOST LIKELY|LEAST LIKELY|NOT)/gi,
      "<em>$1</em>",
    );
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function attemptsForTopic(topicId) {
    return state.attempts.filter((attempt) => Number(attempt.topic) === Number(topicId));
  }

  function topicAccuracy(topicId) {
    const attempts = attemptsForTopic(topicId);
    if (!attempts.length) return null;
    return attempts.filter((attempt) => attempt.correct).length / attempts.length;
  }

  function weakestTopicIds() {
    return data.topics
      .map((topic) => ({ id: topic.id, accuracy: topicAccuracy(topic.id), attempts: attemptsForTopic(topic.id).length }))
      .sort((a, b) => {
        const aScore = a.accuracy === null ? -1 : a.accuracy;
        const bScore = b.accuracy === null ? -1 : b.accuracy;
        if (aScore !== bScore) return aScore - bScore;
        return a.attempts - b.attempts;
      })
      .slice(0, 3)
      .map((item) => item.id);
  }

  function updateReadiness() {
    const completed = state.completedTopics.length;
    const attempts = state.attempts;
    const correct = attempts.filter((attempt) => attempt.correct).length;
    const accuracy = attempts.length ? correct / attempts.length : 0;
    const fullMocks = state.mockHistory.filter((mock) => mock.size === 60).slice(-3);
    const mockAverage = fullMocks.length ? fullMocks.reduce((sum, mock) => sum + mock.percent, 0) / fullMocks.length : 0;
    const topicComponent = (completed / 9) * 25;
    const accuracyComponent = attempts.length ? accuracy * 30 : 0;
    const volumeComponent = Math.min(attempts.length / 60, 1) * 20;
    const mockComponent = (mockAverage / 100) * 25;
    const score = Math.round(topicComponent + accuracyComponent + volumeComponent + mockComponent);

    $("#readinessScore").textContent = String(score);
    $("#scoreRing").style.setProperty("--score", String(score));
    $("#completedTopics").textContent = `${completed} / 9`;
    $("#practiceAccuracy").textContent = attempts.length ? `${Math.round(accuracy * 100)}% · ${attempts.length}题` : "尚未作答";
    $("#wrongCount").textContent = String(state.wrongIds.length);
    $("#mockReadiness").textContent = fullMocks.length ? `${Math.round(mockAverage)}% · ${fullMocks.length}/3套` : "未完成";

    const coreReady = [4, 5, 6].every((topicId) => {
      if (!fullMocks.length) return false;
      const scores = fullMocks.map((mock) => Number(mock.topicPercents?.[topicId])).filter(Number.isFinite);
      return scores.length === fullMocks.length && scores.reduce((sum, value) => sum + value, 0) / scores.length >= 80;
    });
    const noTopicBelow70 = data.topics.every((topic) => {
      if (!fullMocks.length) return false;
      const scores = fullMocks.map((mock) => Number(mock.topicPercents?.[topic.id])).filter(Number.isFinite);
      return scores.length === fullMocks.length && scores.reduce((sum, value) => sum + value, 0) / scores.length >= 70;
    });
    const gateReady = fullMocks.length === 3 && fullMocks.every((mock) => mock.percent >= 80) && coreReady && noTopicBelow70;

    const weak = data.topics.find((topic) => topic.id === weakestTopicIds()[0]);
    const next = $("#nextAction p");
    if (!attempts.length) {
      next.textContent = "先完成 9 题诊断，建立你的薄弱章节排序。";
    } else if (state.wrongIds.length >= 5) {
      next.textContent = `先回炉 ${Math.min(state.wrongIds.length, 10)} 道错题，再继续扩题。`;
    } else if (gateReady) {
      next.textContent = "已达到训练放行线：最近三套 ≥80%，T4–T6 ≥80%，无章节低于 70%。";
    } else if (fullMocks.length < 3) {
      next.textContent = `完成 ${3 - fullMocks.length} 套 60 题全真模考，建立稳定性样本。`;
    } else if (weak) {
      next.textContent = `下一步优先：${weak.code} ${weak.title}。`;
    } else {
      next.textContent = "开始一套 20 题节奏测，检查每题 90 秒纪律。";
    }
  }

  function renderTopics() {
    const weakIds = weakestTopicIds();
    const visible = data.topics.filter((topic) => {
      if (topicFilter === "sales") return topic.sales;
      if (topicFilter === "weak") return weakIds.includes(topic.id);
      return true;
    });

    $("#topicGrid").innerHTML = visible
      .map((topic) => {
        const accuracy = topicAccuracy(topic.id);
        const completed = state.completedTopics.includes(topic.id);
        return `
          <article
            class="topic-card ${topic.id === activeTopicId ? "active" : ""} ${completed ? "completed" : ""}"
            tabindex="0"
            role="button"
            aria-pressed="${topic.id === activeTopicId}"
            data-topic-id="${topic.id}"
          >
            <span class="topic-code">${topic.code} · 官方比重 ${topic.weight}</span>
            <h3>${topic.title}</h3>
            <p class="topic-en">${topic.en}</p>
            <span class="topic-verb">${topic.verb}</span>
            <footer><span>${topic.level}</span><span>${accuracy === null ? "未诊断" : `正确率 ${Math.round(accuracy * 100)}%`}</span></footer>
          </article>`;
      })
      .join("");

    $$(".topic-card").forEach((card) => {
      const activate = () => {
        activeTopicId = Number(card.dataset.topicId);
        renderTopics();
        renderTopicDetail();
      };
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function renderTopicDetail() {
    const topic = data.topics.find((item) => item.id === activeTopicId) || data.topics[0];
    if (!topic) return;
    const completed = state.completedTopics.includes(topic.id);
    const accuracy = topicAccuracy(topic.id);
    const questionCount = questions.filter((question) => Number(question.topic) === topic.id).length;

    $("#topicDetail").innerHTML = `
      <div class="detail-number">${String(topic.id).padStart(2, "0")}</div>
      <p class="kicker">${topic.en}</p>
      <h3>${topic.title}</h3>
      <p>${topic.salesHook}</p>
      <ul>${topic.focus.map((item) => `<li>${item}</li>`).join("")}</ul>
      <div class="detail-callout"><strong>易错点：</strong>${topic.trap}</div>
      <div class="health-row"><span>v3.5 官方比重</span><strong>${topic.weight}</strong></div>
      <div class="health-row"><span>全真蓝图题数</span><strong>${topic.mockCount} / 60</strong></div>
      <div class="health-row"><span>本站原创题</span><strong>${questionCount}</strong></div>
      <div class="health-row"><span>当前正确率</span><strong>${accuracy === null ? "未诊断" : `${Math.round(accuracy * 100)}%`}</strong></div>
      <button class="button ${completed ? "secondary" : "primary"} mastery-button" type="button" data-toggle-topic="${topic.id}">
        ${completed ? "撤销已完成" : "标记本章已完成"}
      </button>`;

    $("[data-toggle-topic]").addEventListener("click", () => {
      if (completed) {
        state.completedTopics = state.completedTopics.filter((id) => id !== topic.id);
      } else {
        state.completedTopics = [...new Set([...state.completedTopics, topic.id])];
      }
      saveState();
      renderTopics();
      renderTopicDetail();
    });
  }

  function renderLens() {
    $("#lensGrid").innerHTML = data.lens
      .map(
        (item) => `
          <article class="lens-card">
            <span class="lens-label">${item.label}</span>
            <h3>${item.title}</h3>
            <span class="lens-topic">${item.topic}</span>
            <p>${item.body}</p>
            <span class="lens-trap">⚠ ${item.trap}</span>
          </article>`,
      )
      .join("");
  }

  function renderUpdates() {
    $("#updateGrid").innerHTML = data.updates
      .map(
        (item) => `
          <article class="update-card">
            <span class="update-topic">${escapeHtml(item.topic)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.body)}</p>
            <strong>${escapeHtml(item.action)} →</strong>
          </article>`,
      )
      .join("");
  }

  function planPhases(days) {
    if (days < 10) {
      const first = Math.max(1, Math.ceil(days * 0.55));
      return [
        ["高权重急救", first, "T4–T6 + 每日错题"],
        ["限时与回炉", Math.max(1, days - first), "20/60题模考 + 反向题干"],
      ];
    }
    if (days < 21) {
      const first = Math.max(3, Math.floor(days * 0.4));
      const second = Math.max(3, Math.floor(days * 0.35));
      return [
        ["建立骨架", first, "九章地图 + T4–T6"],
        ["混合训练", second, "场景题 + 数字/角色错因"],
        ["全真回炉", Math.max(2, days - first - second), "60题模考 + v3.5 更新"],
      ];
    }
    const p1 = Math.floor(days * 0.35);
    const p2 = Math.floor(days * 0.3);
    const p3 = Math.floor(days * 0.2);
    return [
      ["基础学习", p1, "T1–T9 骨架，T4–T6 加倍"],
      ["章节专项", p2, "认知 Level 1→2→3"],
      ["混合模考", p3, "20题节奏 + 60题全真"],
      ["最后回炉", Math.max(1, days - p1 - p2 - p3), "错题、繁体术语、v3.5 更新"],
    ];
  }

  function renderPlan() {
    const examDate = $("#examDate").value;
    if (!examDate) return;
    const target = new Date(`${examDate}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.max(1, Math.ceil((target - today) / 86400000));
    let availableMinutes = 0;
    for (let cursor = new Date(today); cursor < target; cursor.setDate(cursor.getDate() + 1)) {
      const day = cursor.getDay();
      availableMinutes += day === 0 || day === 6 ? Number($("#weekendMinutes").value) : Number($("#weekdayMinutes").value);
    }
    const targetMinutes = 95 * 60;
    const gapMinutes = availableMinutes - targetMinutes;
    const phases = planPhases(days);
    const dailyAverage = Math.round(availableMinutes / days);

    $("#planOutput").innerHTML = `
      <div class="plan-meta">
        <span>距考试 <strong>${days} 天</strong></span>
        <span>可用 <strong>${Math.round(availableMinutes / 60)} 小时</strong></span>
        <span>日均 <strong>${dailyAverage} 分钟</strong></span>
        <span class="${gapMinutes >= 0 ? "status-green" : "status-red"}">
          ${gapMinutes >= 0 ? `相对 95 小时有 ${Math.round(gapMinutes / 60)} 小时缓冲` : `相对 95 小时缺口 ${Math.round(Math.abs(gapMinutes) / 60)} 小时`}
        </span>
      </div>
      <div class="plan-phases">
        ${phases
          .map(
            ([title, phaseDays, body], index) => `
              <article class="plan-phase">
                <strong>${String(index + 1).padStart(2, "0")} · ${title}</strong>
                <span>${phaseDays} 天</span>
                <p>${body}</p>
              </article>`,
          )
          .join("")}
      </div>`;

    state.examDate = examDate;
    state.weekdayMinutes = Number($("#weekdayMinutes").value);
    state.weekendMinutes = Number($("#weekendMinutes").value);
    saveState();
  }

  function initialisePlan() {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    $("#examDate").min = new Date().toISOString().slice(0, 10);
    $("#examDate").value = state.examDate || defaultDate.toISOString().slice(0, 10);
    $("#weekdayMinutes").value = String(state.weekdayMinutes);
    $("#weekendMinutes").value = String(state.weekendMinutes);
    renderPlan();
  }

  function populatePracticeTopics() {
    $("#practiceTopic").innerHTML = data.topics
      .map((topic) => `<option value="${topic.id}">${topic.code} · ${topic.title}</option>`)
      .join("");
    $("#practiceTopic").value = String(activeTopicId);
  }

  function buildPracticeSet() {
    const mode = $("#practiceMode").value;
    $("#practiceTopicWrap").hidden = mode !== "topic";
    let pool = [];
    if (!questions.length) {
      practiceSet = [];
      renderPracticeQuestion();
      return;
    }
    if (mode === "diagnostic") {
      pool = data.topics
        .map((topic) => shuffle(questions.filter((question) => Number(question.topic) === topic.id))[0])
        .filter(Boolean);
    } else if (mode === "meeting") {
      const salesTopicIds = new Set(data.topics.filter((topic) => topic.sales).map((topic) => topic.id));
      pool = questions.filter((question) => salesTopicIds.has(Number(question.topic)));
    } else if (mode === "topic") {
      pool = questions.filter((question) => Number(question.topic) === Number($("#practiceTopic").value));
    } else if (mode === "wrong") {
      pool = questions.filter((question) => state.wrongIds.includes(question.id));
    } else {
      pool = questions;
    }
    practiceSet = shuffle(pool).slice(0, mode === "diagnostic" ? 9 : mode === "meeting" ? 5 : mode === "topic" ? 12 : mode === "wrong" ? 20 : 12);
    practiceIndex = 0;
    practiceSelected = null;
    practiceAnswered = false;
    practiceRound = { answered: 0, correct: 0, wrong: 0 };
    renderPracticeQuestion();
    renderErrorLedger();
    updatePracticeSummary();
  }

  function questionTypeLabel(type) {
    const labels = {
      single: "ONE correct",
      incorrect: "INCORRECT",
      most_likely: "MOST likely",
      combination: "I–IV 组合",
    };
    return labels[type] || "MCQ";
  }

  function renderPracticeQuestion() {
    const panel = $("#questionPanel");
    if (!practiceSet.length) {
      const mode = $("#practiceMode").value;
      const message = mode === "wrong" ? "错题本现在是空的。先完成一轮诊断或混合训练。" : "原创题库正在载入，请刷新页面后重试。";
      panel.innerHTML = `<div class="question-loading">${message}</div>`;
      return;
    }
    const question = practiceSet[practiceIndex];
    const topic = data.topics.find((item) => item.id === Number(question.topic));
    panel.innerHTML = `
      <div class="question-meta">
        <span class="meta-chip">${topic ? topic.code : `T${question.topic}`}</span>
        <span class="meta-chip">Level ${question.cognitiveLevel || 2}</span>
        <span class="meta-chip red">${questionTypeLabel(question.type)}</span>
        <span class="question-counter">${practiceIndex + 1} / ${practiceSet.length}</span>
      </div>
      <div class="question-stem">${highlightStem(question.stem)}</div>
      <div class="option-list">
        ${question.options
          .map(
            (option, index) => `
              <button class="option-button" type="button" data-option="${index}">
                <span class="option-letter">${LETTERS[index]}</span>
                <span>${escapeHtml(option)}</span>
              </button>`,
          )
          .join("")}
      </div>
      <div id="practiceFeedback"></div>
      <div class="question-actions">
        <button class="button secondary" type="button" id="skipQuestion">跳过 / 下一题</button>
        <button class="button primary" type="button" id="submitPractice" disabled>提交答案</button>
      </div>`;

    $$(".option-button", panel).forEach((button) => {
      button.addEventListener("click", () => {
        if (practiceAnswered) return;
        practiceSelected = Number(button.dataset.option);
        $$(".option-button", panel).forEach((item) => item.classList.toggle("selected", item === button));
        $("#submitPractice").disabled = false;
      });
    });
    $("#submitPractice").addEventListener("click", submitPracticeAnswer);
    $("#skipQuestion").addEventListener("click", nextPracticeQuestion);
  }

  function submitPracticeAnswer() {
    if (practiceAnswered || practiceSelected === null) return;
    practiceAnswered = true;
    const question = practiceSet[practiceIndex];
    const correct = practiceSelected === question.answer;
    practiceRound.answered += 1;
    practiceRound.correct += correct ? 1 : 0;
    practiceRound.wrong += correct ? 0 : 1;

    $$(".option-button", $("#questionPanel")).forEach((button) => {
      const index = Number(button.dataset.option);
      button.disabled = true;
      if (index === question.answer) button.classList.add("correct");
      if (index === practiceSelected && !correct) button.classList.add("wrong");
    });

    const attempt = {
      id: question.id,
      topic: Number(question.topic),
      selected: practiceSelected,
      correct,
      confidence,
      mode: $("#practiceMode").value,
      mistakeTag: "",
      at: new Date().toISOString(),
    };
    state.attempts.push(attempt);
    if (correct) {
      state.wrongIds = state.wrongIds.filter((id) => id !== question.id);
    } else {
      state.wrongIds = [...new Set([...state.wrongIds, question.id])];
    }
    saveState();

    const feedback = $("#practiceFeedback");
    feedback.innerHTML = `
      <div class="feedback-panel ${correct ? "" : "wrong"}">
        <strong>${correct ? "判断正确" : `正确答案：${LETTERS[question.answer]}`}</strong>
        <p>${escapeHtml(question.explanation)}</p>
        ${question.trap ? `<span class="feedback-trap">易错点：${escapeHtml(question.trap)}</span>` : ""}
        ${question.salesHook ? `<span class="feedback-trap">Sales 记忆钩子：${escapeHtml(question.salesHook)}</span>` : ""}
        ${
          correct
            ? ""
            : `<div class="error-tags" aria-label="错因标记">${ERROR_TYPES.map((type) => `<button class="error-chip" type="button" data-error-type="${type}">${type}</button>`).join("")}</div>`
        }
      </div>`;

    if (!correct) {
      $$(".error-chip", feedback).forEach((chip) => {
        chip.addEventListener("click", () => {
          $$(".error-chip", feedback).forEach((item) => item.classList.toggle("active", item === chip));
          attempt.mistakeTag = chip.dataset.errorType;
          state.attempts[state.attempts.length - 1] = attempt;
          saveState();
          renderErrorLedger();
        });
      });
    }

    $("#submitPractice").textContent = "已提交";
    $("#submitPractice").disabled = true;
    $("#skipQuestion").textContent = practiceIndex === practiceSet.length - 1 ? "完成本轮" : "下一题";
    updatePracticeSummary();
    renderErrorLedger();
    renderTopics();
    renderTopicDetail();
  }

  function nextPracticeQuestion() {
    if (practiceIndex >= practiceSet.length - 1) {
      showToast(`本轮完成：${practiceRound.correct}/${practiceRound.answered} 正确。`);
      buildPracticeSet();
      return;
    }
    practiceIndex += 1;
    practiceSelected = null;
    practiceAnswered = false;
    renderPracticeQuestion();
  }

  function updatePracticeSummary() {
    $("#practiceSummary").textContent = `本轮 ${practiceRound.answered} 题 · 正确 ${practiceRound.correct}`;
  }

  function renderErrorLedger() {
    const counts = Object.fromEntries(ERROR_TYPES.map((type) => [type, 0]));
    state.attempts.forEach((attempt) => {
      if (attempt.mistakeTag && counts[attempt.mistakeTag] !== undefined) counts[attempt.mistakeTag] += 1;
    });
    const max = Math.max(1, ...Object.values(counts));
    $("#roundWrongCount").textContent = String(practiceRound.wrong);
    $("#errorBars").innerHTML = ERROR_TYPES.map(
      (type) => `
        <div class="error-bar">
          <span>${type}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(counts[type] / max) * 100}%"></div></div>
          <strong>${counts[type]}</strong>
        </div>`,
    ).join("");
  }

  function selectMockQuestions(size) {
    const counts = size === 60 ? [3, 3, 8, 14, 11, 9, 6, 3, 3] : [1, 1, 3, 5, 4, 3, 1, 1, 1];
    const selected = [];
    data.topics.forEach((topic, index) => {
      selected.push(...shuffle(questions.filter((question) => Number(question.topic) === topic.id)).slice(0, counts[index]));
    });
    if (selected.length < size) {
      const used = new Set(selected.map((question) => question.id));
      selected.push(...shuffle(questions.filter((question) => !used.has(question.id))).slice(0, size - selected.length));
    }
    return shuffle(selected).slice(0, size);
  }

  function startMock(size) {
    if (questions.length < size) {
      showToast(`题库当前只有 ${questions.length} 题，暂不能启动 ${size} 题模式。`);
      return;
    }
    window.clearInterval(mockTimer);
    mockSession = {
      size,
      questions: selectMockQuestions(size),
      answers: {},
      flagged: [],
      current: 0,
      remaining: size === 60 ? 90 * 60 : 30 * 60,
      startedAt: new Date().toISOString(),
    };
    $("#mockCards").hidden = true;
    $("#mockConsole").hidden = false;
    renderMock();
    mockTimer = window.setInterval(() => {
      if (!mockSession) return;
      mockSession.remaining -= 1;
      updateMockTimer();
      if (mockSession.remaining <= 0) submitMock(true);
    }, 1000);
    $("#mockConsole").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatSeconds(total) {
    const minutes = Math.floor(Math.max(0, total) / 60);
    const seconds = Math.max(0, total) % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateMockTimer() {
    const timer = $("#mockTimer");
    if (!timer || !mockSession) return;
    timer.textContent = formatSeconds(mockSession.remaining);
    timer.classList.toggle("urgent", mockSession.remaining <= 300);
  }

  function renderMock() {
    if (!mockSession) return;
    const question = mockSession.questions[mockSession.current];
    const selected = mockSession.answers[question.id];
    const topic = data.topics.find((item) => item.id === Number(question.topic));
    $("#mockConsole").innerHTML = `
      <div class="mock-header">
        <div>
          <p class="kicker">${mockSession.size} QUESTION SIMULATION</p>
          <h3>第 ${mockSession.current + 1} / ${mockSession.size} 题</h3>
        </div>
        <div class="mock-timer" id="mockTimer">${formatSeconds(mockSession.remaining)}</div>
        <button class="button secondary" id="submitMock" type="button">提交整卷</button>
      </div>
      <div class="mock-body">
        <nav class="mock-navigator" aria-label="模考题号">
          ${mockSession.questions
            .map(
              (item, index) => `
                <button class="question-nav-button ${mockSession.answers[item.id] !== undefined ? "answered" : ""} ${index === mockSession.current ? "current" : ""}" type="button" data-mock-index="${index}">${index + 1}</button>`,
            )
            .join("")}
        </nav>
        <article>
          <div class="question-meta">
            <span class="meta-chip">${topic ? topic.code : `T${question.topic}`}</span>
            <span class="meta-chip">Level ${question.cognitiveLevel || 2}</span>
            <span class="meta-chip red">${questionTypeLabel(question.type)}</span>
            ${mockSession.flagged.includes(question.id) ? '<span class="meta-chip red">已标记复查</span>' : ""}
          </div>
          <div class="question-stem">${highlightStem(question.stem)}</div>
          <div class="option-list">
            ${question.options
              .map(
                (option, index) => `
                  <button class="option-button ${selected === index ? "selected" : ""}" type="button" data-mock-option="${index}">
                    <span class="option-letter">${LETTERS[index]}</span><span>${escapeHtml(option)}</span>
                  </button>`,
              )
              .join("")}
          </div>
          <div class="question-actions">
            <button class="button secondary" id="flagMock" type="button">${mockSession.flagged.includes(question.id) ? "取消标记" : "标记复查"}</button>
            <div>
              <button class="button secondary" id="prevMock" type="button" ${mockSession.current === 0 ? "disabled" : ""}>上一题</button>
              <button class="button primary" id="nextMock" type="button" ${mockSession.current === mockSession.size - 1 ? "disabled" : ""}>下一题</button>
            </div>
          </div>
        </article>
      </div>`;
    updateMockTimer();

    $$("[data-mock-index]").forEach((button) => {
      button.addEventListener("click", () => {
        mockSession.current = Number(button.dataset.mockIndex);
        renderMock();
      });
    });
    $$("[data-mock-option]").forEach((button) => {
      button.addEventListener("click", () => {
        mockSession.answers[question.id] = Number(button.dataset.mockOption);
        renderMock();
      });
    });
    $("#flagMock").addEventListener("click", () => {
      mockSession.flagged = mockSession.flagged.includes(question.id)
        ? mockSession.flagged.filter((id) => id !== question.id)
        : [...mockSession.flagged, question.id];
      renderMock();
    });
    $("#prevMock").addEventListener("click", () => {
      mockSession.current = Math.max(0, mockSession.current - 1);
      renderMock();
    });
    $("#nextMock").addEventListener("click", () => {
      mockSession.current = Math.min(mockSession.size - 1, mockSession.current + 1);
      renderMock();
    });
    $("#submitMock").addEventListener("click", () => submitMock(false));
  }

  function submitMock(autoSubmit) {
    if (!mockSession) return;
    const answered = Object.keys(mockSession.answers).length;
    if (!autoSubmit && answered < mockSession.size) {
      const proceed = window.confirm(`还有 ${mockSession.size - answered} 题未作答，确认提交吗？`);
      if (!proceed) return;
    }
    window.clearInterval(mockTimer);
    const results = mockSession.questions.map((question) => {
      const selected = mockSession.answers[question.id];
      const correct = selected === question.answer;
      return { question, selected, correct };
    });
    const score = results.filter((item) => item.correct).length;
    const percent = Math.round((score / mockSession.size) * 100);

    results.forEach(({ question, selected, correct }) => {
      state.attempts.push({
        id: question.id,
        topic: Number(question.topic),
        selected: selected ?? null,
        correct,
        confidence: 0,
        mode: `mock-${mockSession.size}`,
        mistakeTag: "",
        at: new Date().toISOString(),
      });
      if (correct) {
        state.wrongIds = state.wrongIds.filter((id) => id !== question.id);
      } else {
        state.wrongIds = [...new Set([...state.wrongIds, question.id])];
      }
    });

    const topicResults = data.topics.map((topic) => {
      const items = results.filter((item) => Number(item.question.topic) === topic.id);
      const correct = items.filter((item) => item.correct).length;
      return { topic, total: items.length, correct, percent: items.length ? Math.round((correct / items.length) * 100) : 0 };
    });
    const mockRecord = {
      size: mockSession.size,
      score,
      percent,
      topicPercents: Object.fromEntries(topicResults.map(({ topic, percent: topicPercent }) => [topic.id, topicPercent])),
      at: new Date().toISOString(),
    };
    state.lastMock = mockRecord;
    state.mockHistory = [...state.mockHistory, mockRecord].slice(-12);
    saveState();

    $("#mockConsole").innerHTML = `
      <div class="mock-header">
        <div><p class="kicker">RESULT</p><h3>${autoSubmit ? "时间到，系统已交卷" : "模考结果"}</h3></div>
        <button class="button secondary" id="closeMock" type="button">返回模考选择</button>
      </div>
      <div class="mock-result-grid">
        <div class="result-score">
          <div><strong>${score}/${mockSession.size}</strong><span>${percent}% · ${percent >= 70 ? "达到及格线" : "未达及格线"}${percent >= 80 ? " · 达到训练缓冲线" : ""}</span></div>
        </div>
        <div class="topic-results">
          ${topicResults
            .map(
              ({ topic, total, percent: topicPercent }) => `
                <div class="topic-result">
                  <span>${topic.code} ${topic.title}</span>
                  <div class="bar-track"><div class="bar-fill" style="width:${topicPercent}%;background:${topicPercent >= 70 ? "var(--green)" : "var(--red)"}"></div></div>
                  <strong>${topicPercent}%</strong>
                </div>`,
            )
            .join("")}
        </div>
      </div>`;

    mockSession = null;
    $("#closeMock").addEventListener("click", closeMock);
    renderTopics();
    renderTopicDetail();
  }

  function closeMock() {
    window.clearInterval(mockTimer);
    mockSession = null;
    $("#mockConsole").hidden = true;
    $("#mockCards").hidden = false;
  }

  function renderTerms(filter = "") {
    const query = filter.trim().toLowerCase();
    const filtered = data.terms.filter((row) => row.join(" ").toLowerCase().includes(query));
    $("#termRows").innerHTML = filtered
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
  }

  function renderSources(filter = "") {
    const query = filter.trim().toLowerCase();
    const filtered = data.sources.filter((source) => `${source.id} ${source.title} ${source.kind} ${source.detail} ${source.tags}`.toLowerCase().includes(query));
    $("#sourceList").innerHTML = filtered
      .map(
        (source) => `
          <article class="source-item ${source.status}">
            <div class="source-item-head"><strong>[${source.id}] ${source.title}</strong><span class="source-kind">${source.kind}</span></div>
            <p>${source.detail}</p>
            ${source.url ? `<a href="${source.url}" target="_blank" rel="noreferrer">打开官方来源 ↗</a>` : ""}
          </article>`,
      )
      .join("");
  }

  function openSources() {
    lastFocusedElement = document.activeElement;
    $("#sourceDrawer").classList.add("open");
    $("#sourceDrawer").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#sourceSearch").focus();
  }

  function closeSources() {
    $("#sourceDrawer").classList.remove("open");
    $("#sourceDrawer").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") lastFocusedElement.focus();
  }

  function exportProgress() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "HKSI P1 Institutional Sales Exam Desk",
      version: 1,
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hksi-p1-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("学习记录已导出。仅包含本浏览器进度，不含任何原始教材。 ");
  }

  function resetProgress() {
    const proceed = window.confirm("确认清空本浏览器中的章节、练习、错题和模考记录吗？");
    if (!proceed) return;
    const examDate = state.examDate;
    const weekdayMinutes = state.weekdayMinutes;
    const weekendMinutes = state.weekendMinutes;
    state = { ...structuredClone(defaultState), examDate, weekdayMinutes, weekendMinutes };
    saveState();
    renderTopics();
    renderTopicDetail();
    buildPracticeSet();
    renderErrorLedger();
    showToast("学习记录已清空。考试日期与时间设置已保留。 ");
  }

  function wireNavigation() {
    $$('[data-jump]').forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.practiceMode) {
          $("#practiceMode").value = button.dataset.practiceMode;
          buildPracticeSet();
        }
        $(button.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    const sections = ["desk", "syllabus", "practice", "mock", "terms"].map((id) => $(`#${id}`)).filter(Boolean);
    const navLinks = $$(".nav-link");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
      },
      { rootMargin: "-20% 0px -68% 0px", threshold: [0.05, 0.2, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
  }

  function wireEvents() {
    $("#planForm").addEventListener("submit", (event) => {
      event.preventDefault();
      renderPlan();
      showToast("冲刺计划已更新。 ");
    });
    $$("[data-topic-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        topicFilter = button.dataset.topicFilter;
        $$("[data-topic-filter]").forEach((item) => item.classList.toggle("active", item === button));
        renderTopics();
      });
    });
    $("#practiceMode").addEventListener("change", buildPracticeSet);
    $("#practiceTopic").addEventListener("change", buildPracticeSet);
    $("#newPracticeSet").addEventListener("click", buildPracticeSet);
    $$("[data-confidence]").forEach((button) => {
      button.addEventListener("click", () => {
        confidence = Number(button.dataset.confidence);
        $$("[data-confidence]").forEach((item) => item.classList.toggle("active", item === button));
      });
    });
    $$("[data-start-mock]").forEach((button) => button.addEventListener("click", () => startMock(Number(button.dataset.startMock))));
    $("#termSearch").addEventListener("input", (event) => renderTerms(event.target.value));
    $("#sourceSearch").addEventListener("input", (event) => renderSources(event.target.value));
    $("#openSources").addEventListener("click", openSources);
    $("#openSourcesInline").addEventListener("click", openSources);
    $("#closeSources").addEventListener("click", closeSources);
    $("#sourceDrawer").addEventListener("click", (event) => {
      if (event.target === $("#sourceDrawer")) closeSources();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("#sourceDrawer").classList.contains("open")) closeSources();
    });
    $("#exportProgress").addEventListener("click", exportProgress);
    $("#resetProgress").addEventListener("click", resetProgress);
  }

  function init() {
    populatePracticeTopics();
    renderTopics();
    renderTopicDetail();
    renderLens();
    renderUpdates();
    initialisePlan();
    renderTerms();
    renderSources();
    buildPracticeSet();
    renderErrorLedger();
    updateReadiness();
    wireNavigation();
    wireEvents();
  }

  init();
})();
