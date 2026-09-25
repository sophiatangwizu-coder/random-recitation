(() => {
  "use strict";

  const STORAGE_KEY = "lucky-recitation-v2";
  const LEGACY_KEY = "lucky-recitation-v1";
  const DEFAULT_TIMER_SECONDS = 5;
  const TIMER_CHOICES = [3, 5, 8, 10];
  const ROLL_SPEEDS = { slow: 220, normal: 85, fast: 42 };
  const $ = (id) => document.getElementById(id);
  const el = {
    headerProgress: $("headerProgress"), soundButton: $("soundButton"), classSelect: $("classSelect"), settingsClassSelect: $("settingsClassSelect"), classNameInput: $("classNameInput"), classRosterNote: $("classRosterNote"), activeClassCaption: $("activeClassCaption"),
    questionCard: $("questionCard"), questionCount: $("questionCount"), questionHint: $("questionHint"), questionValue: $("questionValue"), audioQuestionButton: $("audioQuestionButton"), answerLine: $("answerLine"), answerValue: $("answerValue"), directionTag: $("directionTag"),
    studentCard: $("studentCard"), studentCount: $("studentCount"), studentHint: $("studentHint"), studentValue: $("studentValue"), remainingText: $("remainingText"),
    startButton: $("startButton"), startButtonLabel: $("startButtonLabel"), stopButton: $("stopButton"), checkButton: $("checkButton"), stageNote: $("stageNote"),
    timerFace: $("timerFace"), timerValue: $("timerValue"), timerStatus: $("timerStatus"), timerCard: document.querySelector(".timer-card"),
    recordCount: $("recordCount"), recordList: $("recordList"), recordOverviewDialog: $("recordOverviewDialog"), overviewTitle: $("overviewTitle"), overviewSummary: $("overviewSummary"), overviewStats: $("overviewStats"), overviewGrid: $("overviewGrid"), wrongNamesTitle: $("wrongNamesTitle"), wrongNames: $("wrongNames"), copyWrongNames: $("copyWrongNames"),
    settingsDialog: $("settingsDialog"), studentFile: $("studentFile"), questionFile: $("questionFile"), studentFileLabel: $("studentFileLabel"), questionFileLabel: $("questionFileLabel"),
    importPreview: $("importPreview"), previewTitle: $("previewTitle"), previewSummary: $("previewSummary"), previewExamples: $("previewExamples"), previewWarning: $("previewWarning"), applyImport: $("applyImport"), toast: $("toast")
  };

  const newClass = (index) => ({
    id: `class-${index + 1}`, name: `班级 ${index + 1}`, students: [], studentDeck: [], questionDeck: [],
    usedStudentIds: [], retryIds: null, retryUsedIds: [], records: [], currentId: null, pendingStudentId: null, phase: "idle", timerEndsAt: null, questionCycle: 1, fileName: ""
  });

  const newState = () => ({
    version: 2, classes: Array.from({ length: 5 }, (_, index) => newClass(index)), activeClassId: "class-1",
    questionBanks: [], activeBankId: null, students: [], questions: [], studentDeck: [], questionDeck: [], usedStudentIds: [], retryIds: null, retryUsedIds: [], records: [],
    currentId: null, pendingStudentId: null, mode: "mixed", questionType: "text", timerSeconds: DEFAULT_TIMER_SECONDS, rollSpeed: "normal", sound: true, phase: "idle", timerEndsAt: null, questionCycle: 1,
    files: { students: "", questions: "" }
  });

  function snapshotActive(s) {
    const selected = s.classes.find((item) => item.id === s.activeClassId);
    if (!selected) return;
    for (const key of ["students", "studentDeck", "questionDeck", "usedStudentIds", "retryIds", "retryUsedIds", "records", "currentId", "pendingStudentId", "phase", "timerEndsAt", "questionCycle"]) selected[key] = s[key];
    selected.fileName = s.files.students || "";
  }

  function activateClass(s, id) {
    const selected = s.classes.find((item) => item.id === id);
    if (!selected) return;
    s.activeClassId = id;
    for (const key of ["students", "studentDeck", "questionDeck", "usedStudentIds", "retryIds", "retryUsedIds", "records", "currentId", "pendingStudentId", "phase", "timerEndsAt", "questionCycle"]) s[key] = selected[key];
    s.files.students = selected.fileName || "";
    if (["rolling", "student-rolling"].includes(s.phase)) { s.phase = "idle"; s.pendingStudentId = null; }
    if (s.phase === "question-rolling") s.phase = "student-ready";
    if (s.phase === "student-ready" && !s.students.some((student) => student.id === s.pendingStudentId)) { s.phase = "idle"; s.pendingStudentId = null; }
    if (s.phase === "counting" && (!s.currentId || !s.timerEndsAt || Date.now() >= s.timerEndsAt)) s.phase = s.currentId ? "await-check" : "idle";
    if (!s.currentId && ["await-check", "answer"].includes(s.phase)) s.phase = "idle";
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.version === 2 && Array.isArray(saved.classes) && Array.isArray(saved.questions)) {
        const s = { ...newState(), ...saved };
        s.files = { students: "", questions: "", ...(saved.files || {}) };
        s.classes = Array.from({ length: 5 }, (_, index) => {
          const previous = saved.classes.find((item) => item?.id === `class-${index + 1}`) || {};
          const item = { ...newClass(index), ...previous };
          for (const key of ["students", "studentDeck", "questionDeck", "usedStudentIds", "retryUsedIds", "records"]) if (!Array.isArray(item[key])) item[key] = [];
          return item;
        });
        if (!["en-zh", "zh-en", "mixed"].includes(s.mode)) s.mode = "mixed";
        if (!["text", "audio"].includes(s.questionType)) s.questionType = "text";
        if (!TIMER_CHOICES.includes(s.timerSeconds)) s.timerSeconds = DEFAULT_TIMER_SECONDS;
        if (!Object.prototype.hasOwnProperty.call(ROLL_SPEEDS, s.rollSpeed)) s.rollSpeed = "normal";
        if (!s.classes.some((item) => item.id === s.activeClassId)) s.activeClassId = "class-1";
        migrateBanks(s);
        activateClass(s, s.activeClassId || "class-1");
        return s;
      }
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (old?.version === 1 && Array.isArray(old.students) && Array.isArray(old.questions) && Array.isArray(old.records)) {
        const s = newState();
        s.questions = old.questions;
        s.mode = ["en-zh", "zh-en", "mixed"].includes(old.mode) ? old.mode : "mixed";
        s.sound = old.sound !== false;
        s.files = { students: old.files?.students || "", questions: old.files?.questions || "" };
        for (const key of ["students", "studentDeck", "questionDeck", "usedStudentIds", "retryUsedIds", "records"]) s[key] = Array.isArray(old[key]) ? old[key] : [];
        for (const key of ["currentId", "phase", "timerEndsAt", "questionCycle"]) if (old[key] !== undefined) s[key] = old[key];
        migrateBanks(s);
        snapshotActive(s);
        activateClass(s, "class-1");
        return s;
      }
      return newState();
    } catch (_) { return newState(); }
  }

  function migrateBanks(s) {
    if (!Array.isArray(s.questionBanks)) s.questionBanks = [];
    if (!s.questionBanks.length && s.questions.length) {
      s.questionBanks = [{ id: "bank-legacy", name: s.files.questions || "原有题库", fileName: s.files.questions, entries: s.questions }];
    }
    const bank = s.questionBanks.find((bank) => bank.id === s.activeBankId) || s.questionBanks[0];
    s.activeBankId = bank?.id || null;
    s.questions = bank?.entries || [];
    s.files.questions = bank?.fileName || "";
  }

  let state = loadState();
  let preview = null;
  let pendingImport = null;
  let rollInterval = null;
  let timerInterval = null;
  let toastTimeout = null;
  let audioContext = null;

  function save() {
    snapshotActive(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (_) { showToast("浏览器存储空间不足，刷新后可能无法保留进度。"); return false; }
  }

  function shuffled(values) {
    const output = [...values];
    for (let i = output.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [output[i], output[j]] = [output[j], output[i]];
    }
    return output;
  }

  function makeId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
  function currentRecord() { return state.records.find((record) => record.id === state.currentId) || null; }
  function directionForMode() { return state.mode === "mixed" ? (Math.random() < .5 ? "en-zh" : "zh-en") : state.mode; }
  function directionName(direction) { return direction === "en-zh" ? "英 → 中" : "中 → 英"; }
  function studentById(id) { return state.students.find((student) => student.id === id); }
  function questionById(id) { return state.questions.find((question) => question.id === id); }
  function drawIds() { return state.retryIds ?? state.students.map((student) => student.id); }
  function drawnIds() { return state.retryIds === null ? state.usedStudentIds : state.retryUsedIds; }
  function remainingCount() { return drawIds().filter((id) => !drawnIds().includes(id)).length; }
  function passName() { return state.retryIds === null ? "第一轮" : "二次抽背"; }
  function passComplete() {
    const attempt = state.retryIds === null ? 1 : 2;
    return drawIds().length > 0 && drawIds().every((id) => state.records.some((record) =>
      record.studentId === id && (record.attempt || 1) === attempt && ["correct", "wrong", "absent"].includes(record.status))) &&
      !["student-rolling", "student-ready", "question-rolling", "counting"].includes(state.phase);
  }
  function startRetry() {
    if (state.retryIds !== null || !passComplete()) return;
    const ids = state.records.filter((record) => record.status === "wrong").map((record) => record.studentId);
    if (!ids.length) return;
    stopTimerInterval(); clearRollInterval();
    window.speechSynthesis?.cancel();
    state.retryIds = [...new Set(ids)];
    state.retryUsedIds = [];
    state.studentDeck = shuffled(state.retryIds);
    state.currentId = null; state.pendingStudentId = null; state.timerEndsAt = null;
    state.phase = "idle"; preview = null;
    save(); renderAll();
    showToast(`开始二次抽背：${ids.length} 位同学，每人仅一次机会，继续随机抽题。`);
  }
  function reviewQuestions() {
    const groups = new Map();
    for (const record of state.records) {
      if (!["correct", "wrong"].includes(record.status)) continue;
      const en = record.direction === "en-zh" ? record.prompt : record.answer;
      const zh = record.direction === "en-zh" ? record.answer : record.prompt;
      const key = JSON.stringify([en.trim(), zh.trim()]);
      const item = groups.get(key) || { en, zh, total: 0, wrong: 0 };
      item.total++; if (record.status === "wrong") item.wrong++;
      groups.set(key, item);
    }
    return [...groups.values()].filter((item) => item.wrong).sort((a, b) =>
      b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong || a.en.localeCompare(b.en)).slice(0, 5);
  }
  function renderRoundSummary() {
    const complete = passComplete();
    const wrongCount = overviewData().wrongNames.length;
    const summary = $("roundSummary");
    summary.hidden = !state.students.length;
    $("retryButton").hidden = state.retryIds !== null || !complete || !wrongCount;
    const finished = complete && (state.retryIds !== null || !wrongCount);
    $("roundSummaryTitle").textContent = finished ? "本次抽背已结束" : `${passName()}进度`;
    $("roundSummaryText").textContent = finished
      ? `最终答错 ${wrongCount} 人 · 可在全班概览中查看和复制名单。${state.retryIds !== null ? "二次结果为最终判定，不再追加抽背。" : "已作答同学无答错，无需二次抽背；缺席人数见全班概览。"}`
      : complete ? `第一轮全部判定完毕，${wrongCount} 位答错同学可获得一次二次抽背机会。`
      : remainingCount() === 0 ? "本轮学生已抽完，请完成剩余题目和所有待判定记录。"
      : `${passName()}：已抽 ${drawnIds().length} / ${drawIds().length} 人。${state.retryIds !== null ? "仅抽第一轮答错同学，以第二次结果为准。" : "全班完成并判定后，可开始答错同学二次抽背。"}`;
    $("reviewPanel").hidden = !finished;
    const list = $("reviewList"); list.replaceChildren();
    if (!finished) return;
    const questions = reviewQuestions();
    if (!questions.length) list.append(makeText("p", "", "本次没有已判定的错题。"));
    questions.forEach((item, index) => {
      const card = makeText("article", "review-item", "");
      card.append(makeText("strong", "", `${index + 1}. ${item.en}`), makeText("p", "", item.zh),
        makeText("span", "", `答错率 ${Math.round(item.wrong / item.total * 100)}% · 答错 ${item.wrong} / 作答 ${item.total} 次`));
      list.append(card);
    });
  }
  function activeClass() { return state.classes.find((item) => item.id === state.activeClassId); }

  function renderClassSelect() {
    for (const select of [el.classSelect, el.settingsClassSelect]) {
      const options = state.classes.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name}${item.students.length ? ` · ${item.students.length} 人` : " · 未导入"}`;
        return option;
      });
      select.replaceChildren(...options);
      select.value = state.activeClassId;
    }
    if (document.activeElement !== el.classNameInput) el.classNameInput.value = activeClass().name;
    el.classRosterNote.textContent = state.students.length ? `已固定 ${state.students.length} 位同学 · ${activeClass().name}` : `${activeClass().name}尚未导入名单`;
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.toast.classList.remove("is-visible"), 4200);
  }

  function makeText(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  function renderDraw() {
    const record = currentRecord();
    const studentRolling = state.phase === "student-rolling";
    const questionRolling = state.phase === "question-rolling";
    const pendingStudent = ["student-ready", "question-rolling"].includes(state.phase) ? studentById(state.pendingStudentId) : null;
    el.questionCard.classList.toggle("is-rolling", questionRolling);
    const audioQuestion = state.questionType === "audio";
    el.questionCard.classList.toggle("is-audio-question", audioQuestion);
    el.studentCard.classList.toggle("is-rolling", studentRolling);
    el.questionCount.textContent = `题库 ${state.questions.length} 题`;
    el.studentCount.textContent = `${passName()} ${drawnIds().length} / ${drawIds().length}`;
    el.headerProgress.textContent = `${passName()} ${drawnIds().length} / ${drawIds().length}`;
    el.activeClassCaption.textContent = `正在抽背：${activeClass().name} · ${state.students.length ? `${state.students.length} 位同学` : "请先导入名单"}`;
    el.remainingText.textContent = `还有 ${remainingCount()} 位同学待抽`;
    if (studentRolling && preview) {
      el.questionHint.textContent = "先确定回答的学生";
      el.questionValue.textContent = "题目暂未显示";
      el.studentHint.textContent = "学生姓名滚动中 · 点击 STOP 定格";
      el.studentValue.textContent = preview.studentName;
      el.directionTag.textContent = state.mode === "mixed" ? "互相转化 · 随机方向" : directionName(state.mode);
      el.answerLine.hidden = true;
      el.answerValue.textContent = "";
    } else if (questionRolling && pendingStudent && preview) {
      el.questionHint.textContent = "题目滚动中 · 点击 STOP 定格";
      el.questionValue.textContent = audioQuestion ? "听音题 · 点击喇叭" : preview.prompt;
      el.studentHint.textContent = "这一次，轮到你啦！";
      el.studentValue.textContent = pendingStudent.name;
      el.directionTag.textContent = directionName(preview.direction);
      el.answerLine.hidden = true;
      el.answerValue.textContent = "";
    } else if (state.phase === "student-ready" && pendingStudent) {
      el.questionHint.textContent = "学生已经抽出 · 点击开始抽题";
      el.questionValue.textContent = "题目暂未显示";
      el.studentHint.textContent = "这一次，轮到你啦！";
      el.studentValue.textContent = pendingStudent.name;
      el.directionTag.textContent = state.mode === "mixed" ? "互相转化 · 随机方向" : directionName(state.mode);
      el.answerLine.hidden = true;
      el.answerValue.textContent = "";
    } else if (record) {
      el.questionHint.textContent = `请回答 · ${directionName(record.direction)}`;
      el.questionValue.textContent = audioQuestion ? "听音题 · 点击喇叭重播" : record.prompt;
      el.studentHint.textContent = "这一次，轮到你啦！";
      el.studentValue.textContent = record.studentName;
      el.directionTag.textContent = directionName(record.direction);
      el.answerLine.hidden = !record.revealed;
      el.answerValue.textContent = record.revealed ? record.answer : "";
    } else {
      el.questionHint.textContent = state.questions.length ? "题库已经准备就绪" : "先导入 Word 题库";
      el.questionValue.textContent = state.questions.length ? "点击抽取学生" : "准备好开始了吗？";
      el.studentHint.textContent = state.students.length ? "名单已经准备就绪" : "先导入 Excel 名单";
      el.studentValue.textContent = state.students.length ? "幸运同学是谁？" : "等待名单导入";
      el.directionTag.textContent = state.mode === "mixed" ? "互相转化 · 随机方向" : directionName(state.mode);
      el.answerLine.hidden = true;
    }
    const playable = audioQuestion && (record || (questionRolling && preview));
    el.audioQuestionButton.hidden = !playable;
    if (!state.students.length || !state.questions.length) el.stageNote.textContent = "导入名单与题库后，就可以开始抽背啦。";
    else if (studentRolling) el.stageNote.textContent = "学生姓名正在滚动，点击 STOP 定格学生。";
    else if (state.phase === "student-ready") el.stageNote.textContent = "学生已确定；点击“开始抽题”，再用 STOP 定格题目。";
    else if (questionRolling) el.stageNote.textContent = "题目正在滚动；点击 STOP 后，题目定格并立即开始倒计时。";
    else if (state.phase === "counting") el.stageNote.textContent = "回答倒计时正在进行，时间到后可查看答案。";
    else if (state.phase === "await-check") el.stageNote.textContent = "时间到！点击 CHECK 查看答案，也可以稍后在 Record 中判定。";
    else if (state.phase === "answer") el.stageNote.textContent = "请在 Record 中标记答对或答错，或开始下一轮。";
    else if (remainingCount() === 0) el.stageNote.textContent = "本轮同学已全部抽完，请完成判定并查看下方二次抽背与复习区。";
    else el.stageNote.textContent = "点击“开始抽取”滚动学生姓名，再用 STOP 定格。";
  }

  function renderControls() {
    const filesReady = !!state.students.length && !!state.questions.length;
    const canDrawStudent = filesReady && remainingCount() > 0;
    const canShowQuestion = filesReady && state.phase === "student-ready" && !!studentById(state.pendingStudentId);
    const rolling = ["student-rolling", "question-rolling"].includes(state.phase);
    el.startButton.disabled = rolling || state.phase === "counting" || (!canDrawStudent && !canShowQuestion);
    el.startButtonLabel.textContent = state.phase === "student-ready" ? "开始抽题" : state.usedStudentIds.length ? "抽取下一位" : "开始抽取";
    $("absentButton").disabled = !canShowQuestion;
    el.stopButton.disabled = !rolling;
    const current = currentRecord();
    el.checkButton.disabled = !current || state.phase === "counting" || rolling || current.revealed;
    el.soundButton.textContent = state.sound ? "♪" : "♩";
    el.soundButton.setAttribute("aria-label", state.sound ? "关闭提示音" : "开启提示音");
    el.soundButton.title = state.sound ? "关闭提示音" : "开启提示音";
  }

  function renderTimer() {
    const running = state.phase === "counting";
    const finished = !!state.currentId && (state.phase === "await-check" || state.phase === "answer");
    const duration = (running || finished) ? (currentRecord()?.timerDurationMs || DEFAULT_TIMER_SECONDS * 1000) : state.timerSeconds * 1000;
    let remaining = duration;
    if (running) remaining = Math.max(0, state.timerEndsAt - Date.now());
    if (finished) remaining = 0;
    el.timerValue.textContent = String(Math.ceil(remaining / 1000));
    el.timerFace.style.setProperty("--progress", `${Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100))}%`);
    el.timerCard.classList.toggle("is-running", running);
    el.timerCard.classList.toggle("is-done", finished);
    el.timerStatus.textContent = running ? `请在 ${duration / 1000} 秒内回答` : finished ? "时间到 · 可以查看答案" : state.phase === "question-rolling" ? `题目定格后开始 · ${state.timerSeconds} 秒` : `等待题目定格 · ${state.timerSeconds} 秒`;
  }

  function renderRecords() {
    el.recordCount.textContent = `${state.usedStudentIds.length} / ${state.students.length}`;
    el.recordList.replaceChildren();
    if (!state.records.length) {
      const empty = makeText("div", "record-empty", "");
      empty.append(makeText("span", "", "✧"), makeText("strong", "", "等待第一位同学"), makeText("small", "", "抽取结果会出现在这里"));
      el.recordList.append(empty);
      return;
    }
    const finalRecords = new Map(state.records.map((record) => [record.studentId, record]));
    const sorted = [...state.records].sort((a, b) => Number(b.status === "wrong") - Number(a.status === "wrong") || b.createdAt - a.createdAt);
    for (const record of sorted) {
      const item = makeText("article", `record-item ${record.status === "wrong" ? "wrong" : record.status === "correct" ? "correct" : ""}`, "");
      const head = makeText("div", "record-item-head", "");
      head.append(makeText("strong", "record-item-name", `${record.studentName} · 第 ${record.attempt || 1} 次`));
      head.append(makeText("span", "record-item-time", new Date(record.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })));
      head.append(makeText("span", "record-status", record.status === "absent" ? "缺席" : record.status === "wrong" ? "答错" : record.status === "correct" ? "答对" : "待判定"));
      item.append(head);
      if (record.status === "absent") {
        item.append(makeText("p", "record-item-detail", "缺席 · 已跳过，不计入题目答错率"));
        el.recordList.append(item); continue;
      }
      if (state.retryIds !== null && (record.attempt || 1) === 1) {
        item.append(makeText("p", "record-item-detail", finalRecords.get(record.studentId) !== record ? "首次记录已保留，当前结果以二次作答为准" : state.retryIds.includes(record.studentId) ? "首次答错 · 等待二次抽背" : "最终结果 · 首次答对"));
      }
      const detail = makeText("p", "record-item-detail", `${directionName(record.direction)} · ${record.prompt}`);
      item.append(detail);
      if (record.revealed) {
        const answer = makeText("p", "record-item-detail", "答案：");
        answer.append(makeText("span", "answer-text", record.answer));
        item.append(answer);
      }
      const actions = makeText("div", "record-item-actions", "");
      if (!record.revealed) {
        const reveal = makeText("button", "record-action", "查看答案");
        reveal.type = "button";
        reveal.disabled = record.id === state.currentId && state.phase === "counting";
        reveal.addEventListener("click", () => revealAnswer(record.id));
        actions.append(reveal);
      } else {
        const correct = makeText("button", `record-action correct-choice ${record.status === "correct" ? "is-selected" : ""}`, "✓ 答对");
        const wrong = makeText("button", `record-action wrong-choice ${record.status === "wrong" ? "is-selected" : ""}`, "× 答错");
        correct.type = wrong.type = "button";
        correct.disabled = wrong.disabled = state.retryIds !== null && (record.attempt || 1) === 1;
        correct.setAttribute("aria-pressed", String(record.status === "correct"));
        wrong.setAttribute("aria-pressed", String(record.status === "wrong"));
        correct.addEventListener("click", () => markRecord(record.id, "correct"));
        wrong.addEventListener("click", () => markRecord(record.id, "wrong"));
        actions.append(correct, wrong);
      }
      item.append(actions);
      el.recordList.append(item);
    }
  }

  function overviewData() {
    const records = new Map(state.records.map((record) => [record.studentId, record]));
    const used = new Set(state.usedStudentIds);
    const students = state.students.map((student, index) => {
      const record = records.get(student.id);
      const awaitingRetry = state.retryIds?.includes(student.id) && (record?.attempt || 1) !== 2;
      const status = awaitingRetry ? "pending" : record?.status === "absent" ? "absent" : record?.status === "wrong" ? "wrong" : record?.status === "correct" ? "correct" : used.has(student.id) ? "pending" : "undrawn";
      return { ...student, index, status };
    });
    return { students, wrongNames: students.filter((student) => student.status === "wrong").map((student) => student.name) };
  }

  function renderOverview() {
    const { students, wrongNames } = overviewData();
    const counts = { absent: 0, wrong: 0, correct: 0, pending: 0, undrawn: 0 };
    students.forEach((student) => { counts[student.status] += 1; });
    el.overviewTitle.textContent = `${activeClass().name} · 作答概览`;
    el.overviewSummary.textContent = `本轮已抽 ${state.usedStudentIds.length} / ${state.students.length} 位同学 · ${state.retryIds !== null ? "以二次结果为准 · " : ""}答错优先展示`;
    el.overviewStats.replaceChildren();
    for (const [label, count, kind] of [["已抽", state.usedStudentIds.length, ""], ["答错", counts.wrong, "wrong"], ["答对", counts.correct, "correct"], ["待判定", counts.pending, "pending"], ["未抽", counts.undrawn, "undrawn"], ["缺席", counts.absent, "absent"]]) {
      el.overviewStats.append(makeText("span", `overview-stat ${kind}`, `${label} ${count}`));
    }
    el.overviewGrid.replaceChildren();
    if (!students.length) {
      el.overviewGrid.append(makeText("p", "overview-empty", "当前班级尚未导入学生名单。"));
    } else {
      const statusName = { absent: "— 缺席", wrong: "× 答错", correct: "✓ 答对", pending: "◷ 待判定", undrawn: "○ 未抽" };
      students.sort((a, b) => Number(b.status === "wrong") - Number(a.status === "wrong") || a.index - b.index);
      for (const student of students) {
        const tile = makeText("div", `overview-student ${student.status}`, "");
        tile.setAttribute("role", "listitem");
        tile.setAttribute("aria-label", `${student.name}，${statusName[student.status]}`);
        tile.append(makeText("span", "student-order", String(student.index + 1).padStart(2, "0")), makeText("strong", "", student.name), makeText("span", "student-status", statusName[student.status]));
        el.overviewGrid.append(tile);
      }
    }
    el.wrongNamesTitle.textContent = `答错名单 · ${wrongNames.length} 人`;
    el.wrongNames.textContent = wrongNames.length ? wrongNames.join("、") : "本轮暂无答错同学";
    el.copyWrongNames.disabled = wrongNames.length === 0;
  }

  async function copyWrongNames() {
    const names = overviewData().wrongNames;
    if (!names.length) { showToast("本轮暂无答错同学。"); return; }
    const content = names.join("\n");
    let copied = false;
    try {
      if (window.navigator?.clipboard?.writeText) { await window.navigator.clipboard.writeText(content); copied = true; }
    } catch (_) { /* try the older browser copy path below */ }
    if (!copied) {
      const temporary = document.createElement("textarea");
      temporary.value = content;
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      try { temporary.select(); copied = document.execCommand("copy"); }
      catch (_) { copied = false; }
      finally { temporary.remove(); }
    }
    showToast(copied ? `已复制 ${names.length} 位答错同学的姓名。` : "复制失败，请长按弹窗中的名单手动复制。");
  }

  function markAbsent() {
    if (state.phase !== "student-ready") return;
    const student = studentById(state.pendingStudentId);
    if (!student) return;
    state.records.push({ id: makeId("absent"), studentId: student.id, studentName: student.name,
      attempt: state.retryIds === null ? 1 : 2, status: "absent", revealed: true, createdAt: Date.now() });
    state.pendingStudentId = null; state.currentId = null; state.timerEndsAt = null; state.phase = "idle";
    save(); renderAll(); showToast(`${student.name}已标记缺席，可抽取下一位。`);
  }

  function setBank(id) {
    // Save each class's question progress before changing the shared bank.
    clearRollInterval();
    if (state.phase === "student-rolling") state.phase = "idle";
    if (state.phase === "question-rolling") state.phase = "student-ready";
    preview = null;
    snapshotActive(state);
    for (const classroom of state.classes) {
      classroom.bankProgress ||= {};
      if (state.activeBankId) classroom.bankProgress[state.activeBankId] = { deck: classroom.questionDeck, cycle: classroom.questionCycle };
    }
    state.activeBankId = id;
    const bank = state.questionBanks.find((bank) => bank.id === id);
    state.questions = bank?.entries || []; state.files.questions = bank?.fileName || "";
    for (const classroom of state.classes) {
      const progress = classroom.bankProgress[id];
      classroom.questionDeck = progress ? progress.deck : shuffled(state.questions.map((q) => q.id));
      classroom.questionCycle = progress?.cycle || 1;
    }
    activateClass(state, state.activeClassId);
  }
  function renderFilesAndMode() {
    const select = $("bankSelect");
    select.replaceChildren(...state.questionBanks.map((bank) => {
      const option = makeText("option", "", `${bank.name} · ${bank.entries.length} 题`); option.value = bank.id; return option;
    }));
    select.value = state.activeBankId || "";
    select.disabled = !state.questionBanks.length;
    $("bankCapacity").textContent = `已保存 ${state.questionBanks.length} / 5 个题库 · 切换对所有班级生效，保留各题库抽题进度`;
    $("editBank").disabled = $("deleteBank").disabled = !state.activeBankId;

    el.studentFileLabel.textContent = state.files.students || "选择 Excel 文件";
    el.questionFileLabel.textContent = state.files.questions || "选择 DOCX 文件";
    for (const radio of document.querySelectorAll('input[name="direction"]')) radio.checked = radio.value === state.mode;
    for (const radio of document.querySelectorAll('input[name="question-type"]')) radio.checked = radio.value === state.questionType;
    for (const radio of document.querySelectorAll('input[name="timer-seconds"]')) radio.checked = Number(radio.value) === state.timerSeconds;
    for (const radio of document.querySelectorAll('input[name="roll-speed"]')) radio.checked = radio.value === state.rollSpeed;
  }

  function renderAll() { renderClassSelect(); renderDraw(); renderControls(); renderTimer(); renderRecords(); renderRoundSummary(); renderFilesAndMode(); if (el.recordOverviewDialog.open) renderOverview(); }

  function ensureAudio() {
    if (!state.sound) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext ||= new AudioCtor();
      if (audioContext.state === "suspended") audioContext.resume();
    } catch (_) { /* visual timer remains available */ }
  }

  function playDing() {
    if (!state.sound || !audioContext || audioContext.state !== "running") return;
    try {
      for (const [offset, frequency] of [[0, 660], [.16, 880]]) {
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(.0001, audioContext.currentTime + offset);
        volume.gain.exponentialRampToValueAtTime(.15, audioContext.currentTime + offset + .02);
        volume.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + offset + .3);
        oscillator.connect(volume).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + offset);
        oscillator.stop(audioContext.currentTime + offset + .31);
      }
    } catch (_) { /* visual timer remains available */ }
  }

  function stopTimerInterval() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
  function startTimerInterval() {
    stopTimerInterval();
    timerInterval = setInterval(() => {
      if (state.phase !== "counting") { stopTimerInterval(); return; }
      if (Date.now() >= state.timerEndsAt) finishTimer(true);
      else renderTimer();
    }, 100);
  }
  function finishTimer(announce) {
    if (state.phase !== "counting") return;
    stopTimerInterval();
    state.phase = "await-check";
    save(); renderAll();
    if (announce) { playDing(); showToast(`${(currentRecord()?.timerDurationMs || DEFAULT_TIMER_SECONDS * 1000) / 1000} 秒到！点击 CHECK 查看答案。`); }
  }

  function choose(values) { return values[Math.floor(Math.random() * values.length)]; }
  function rollIntervalMs() { return ROLL_SPEEDS[state.rollSpeed] || ROLL_SPEEDS.normal; }
  function clearRollInterval() { if (rollInterval) clearInterval(rollInterval); rollInterval = null; }

  function restartRollInterval() {
    clearRollInterval();
    if (state.phase === "student-rolling") rollInterval = setInterval(() => { preview = studentCandidate(); renderDraw(); }, rollIntervalMs());
    if (state.phase === "question-rolling") rollInterval = setInterval(() => { preview = questionCandidate(); renderDraw(); }, rollIntervalMs());
  }

  function studentCandidate() {
    const id = choose(state.studentDeck.filter((studentId) => drawIds().includes(studentId) && !drawnIds().includes(studentId)));
    const student = studentById(id);
    return student ? { studentId: student.id, studentName: student.name } : null;
  }

  function questionCandidate() {
    const question = questionById(choose(state.questionDeck));
    if (!question) return null;
    const direction = directionForMode();
    return { questionId: question.id, direction, prompt: direction === "en-zh" ? question.en : question.zh };
  }

  function startStudentRolling() {
    if (!state.students.length || !state.questions.length) { el.settingsDialog.showModal(); showToast("请先导入学生名单和英汉题库。"); return; }
    if (remainingCount() === 0) { showToast("本轮所有同学都抽过了，请手动重置本轮。"); return; }
    if (["counting", "student-ready", "student-rolling", "question-rolling"].includes(state.phase)) return;
    if (!state.studentDeck.length) {
      const remaining = drawIds().filter((id) => !drawnIds().includes(id));
      state.studentDeck = shuffled(remaining);
    }
    preview = studentCandidate();
    if (!preview) { showToast("抽取学生失败，请重新导入名单后再试。"); return; }
    state.currentId = null;
    state.timerEndsAt = null;
    state.pendingStudentId = null;
    state.phase = "student-rolling";
    save(); renderAll();
    restartRollInterval();
  }

  function stopStudentRolling() {
    if (state.phase !== "student-rolling") return;
    clearRollInterval();
    const student = studentById(preview?.studentId);
    if (!student || drawnIds().includes(student.id)) { state.phase = "idle"; preview = null; save(); renderAll(); showToast("抽取学生失败，请重新试一次。"); return; }
    const deckIndex = state.studentDeck.indexOf(student.id);
    if (deckIndex >= 0) state.studentDeck.splice(deckIndex, 1);
    state.pendingStudentId = student.id;
    drawnIds().push(student.id);
    state.phase = "student-ready";
    preview = null;
    save(); renderAll();
  }

  function startQuestionRolling() {
    if (state.phase !== "student-ready") return;
    const student = studentById(state.pendingStudentId);
    if (!student) { state.pendingStudentId = null; state.phase = "idle"; save(); renderAll(); showToast("未找到已抽学生，请重新抽取。"); return; }
    if (!state.questionDeck.length) {
      state.questionDeck = shuffled(state.questions.map((question) => question.id));
      state.questionCycle += 1;
      showToast(`题库已抽完，正在使用第 ${state.questionCycle} 轮题目。`);
    }
    preview = questionCandidate();
    if (!preview) { save(); renderAll(); showToast("抽取题目失败，请重新导入题库后再试。"); return; }
    state.phase = "question-rolling";
    save(); renderAll();
    restartRollInterval();
  }

  function stopQuestionRolling() {
    if (state.phase !== "question-rolling") return;
    clearRollInterval();
    const student = studentById(state.pendingStudentId);
    const question = questionById(preview?.questionId);
    if (!student || !question || !preview) { state.phase = "student-ready"; preview = null; save(); renderAll(); showToast("抽取题目失败，请重新试一次。"); return; }
    const deckIndex = state.questionDeck.indexOf(question.id);
    if (deckIndex >= 0) state.questionDeck.splice(deckIndex, 1);
    const direction = preview.direction;
    const record = {
      id: makeId("answer"), studentId: student.id, studentName: student.name, questionId: question.id,
      direction, prompt: direction === "en-zh" ? question.en : question.zh,
      answer: direction === "en-zh" ? question.zh : question.en,
      attempt: state.retryIds === null ? 1 : 2,
      status: "pending", revealed: false, timerDurationMs: state.timerSeconds * 1000, createdAt: Date.now()
    };
    state.records.push(record);
    state.currentId = record.id;
    state.pendingStudentId = null;
    state.timerEndsAt = Date.now() + record.timerDurationMs;
    state.phase = "counting";
    ensureAudio();
    save(); renderAll(); startTimerInterval();
    if (state.questionType === "audio") speakQuestion(record.prompt);
    preview = null;
  }

  function handleDrawAction() {
    if (state.phase === "student-ready") startQuestionRolling();
    else startStudentRolling();
  }

  function speakQuestion(text) {
    if (!text || !window.speechSynthesis) { showToast("当前浏览器不支持语音播放，请使用最新版 Chrome、Edge 或 Safari。"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-US";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function stopRolling() {
    if (state.phase === "student-rolling") stopStudentRolling();
    else if (state.phase === "question-rolling") stopQuestionRolling();
  }

  function revealAnswer(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record || record.revealed || (id === state.currentId && state.phase === "counting")) return;
    record.revealed = true;
    if (id === state.currentId) state.phase = "answer";
    save(); renderAll();
  }

  function markRecord(id, status) {
    const record = state.records.find((item) => item.id === id);
    if (!record || record.status === "absent" || !record.revealed || !["correct", "wrong"].includes(status)) return;
    if (state.retryIds !== null && (record.attempt || 1) === 1) return;
    record.status = status;
    save(); renderAll();
  }

  function resetRoundData() {
    stopTimerInterval();
    clearRollInterval();
    preview = null;
    state.studentDeck = shuffled(state.students.map((student) => student.id));
    state.questionDeck = shuffled(state.questions.map((question) => question.id));
    state.usedStudentIds = [];
    state.retryIds = null; state.retryUsedIds = [];
    state.records = [];
    state.currentId = null;
    state.pendingStudentId = null;
    state.timerEndsAt = null;
    state.phase = "idle";
    state.questionCycle = 1;
    activeClass().bankProgress = {};
  }

  function switchClass(id) {
    if (id === state.activeClassId || !state.classes.some((item) => item.id === id)) return;
    stopTimerInterval();
    clearRollInterval();
    if (state.phase === "student-rolling") state.phase = "idle";
    if (state.phase === "question-rolling") state.phase = "student-ready";
    preview = null;
    snapshotActive(state);
    activateClass(state, id);
    if (state.students.length && !state.studentDeck.length && !state.usedStudentIds.length) state.studentDeck = shuffled(state.students.map((student) => student.id));
    if (state.questions.length && !state.questionDeck.length && !state.records.length) state.questionDeck = shuffled(state.questions.map((question) => question.id));
    pendingImport = null;
    showImportPreview();
    save(); renderAll();
    if (state.phase === "counting") startTimerInterval();
    showToast(`已切换到${activeClass().name}。`);
  }

  function saveClassName() {
    const name = el.classNameInput.value.trim();
    if (!name) { showToast("请输入班级名称。"); return; }
    activeClass().name = name;
    save(); renderAll();
    showToast(`已保存班级名称：${name}`);
  }

  function parseDocxText(rawText) {
    const entries = [];
    const rejected = [];
    const paragraphs = rawText.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    paragraphs.forEach((paragraph, index) => {
      const withoutNumber = paragraph.replace(/^(?:第\s*)?\d{1,4}\s*[.．、)）:：-]\s*/, "").trim();
      const match = /[\u3400-\u9fff]/.exec(withoutNumber);
      const english = match ? withoutNumber.slice(0, match.index).trim() : "";
      const chinese = match ? withoutNumber.slice(match.index).trim() : "";
      if (!english || !chinese) rejected.push(`第 ${index + 1} 段：${paragraph.slice(0, 55)}`);
      else entries.push({ id: makeId("q"), en: english, zh: chinese });
    });
    return { entries, rejected };
  }

  function parseSheet(workbook) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel 文件中没有工作表。");
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false, raw: false });
    const entries = [];
    const duplicate = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const name = String(row[0] ?? "").trim();
      if (!name || /^(姓名|学生姓名|name|student name)$/i.test(name)) return;
      if (/^\d+$/.test(name)) return;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) { duplicate.push(`第 ${index + 1} 行：${name}`); return; }
      seen.add(key);
      entries.push({ id: makeId("s"), name });
    });
    return { entries, rejected: duplicate };
  }

  function showImportPreview() {
    if (!pendingImport) { el.importPreview.hidden = true; return; }
    const isStudents = pendingImport.kind === "students";
    el.importPreview.hidden = false;
    el.previewTitle.textContent = isStudents ? "名单导入预览" : "题库导入预览";
    el.previewSummary.textContent = `文件：${pendingImport.fileName} · ${isStudents ? `${activeClass().name} · ` : ""}识别 ${pendingImport.entries.length} ${isStudents ? "位学生" : "道词条"}`;
    el.previewExamples.replaceChildren();
    $("bankNameRow").hidden = isStudents;
    $("addQuestionRow").hidden = isStudents;
    $("bankNameInput").value = pendingImport.name || pendingImport.fileName.replace(/\.docx$/i, "");
    if (isStudents) {
      for (const item of pendingImport.entries.slice(0, 5)) el.previewExamples.append(makeText("li", "", item.name));
    } else {
      pendingImport.entries.forEach((item, index) => {
        const row = makeText("li", "question-edit-row", "");
        row.append(makeText("strong", "", `第 ${index + 1} 题`));
        for (const [field, label] of [["en", "英文"], ["zh", "中文"]]) {
          const input = document.createElement("textarea"); input.value = item[field]; input.rows = 2;
          input.setAttribute("aria-label", `第 ${index + 1} 题${label}`); input.placeholder = label;
          input.addEventListener("input", () => { item[field] = input.value; }); row.append(input);
        }
        const remove = makeText("button", "record-action", "删除此题"); remove.type = "button";
        remove.addEventListener("click", () => { pendingImport.entries.splice(index, 1); showImportPreview(); });
        row.append(remove); el.previewExamples.append(row);
      });
    }
    el.previewWarning.hidden = pendingImport.rejected.length === 0;
    el.previewWarning.textContent = pendingImport.rejected.length ? `${isStudents ? "重复姓名" : "无法识别的段落"} ${pendingImport.rejected.length} 条，导入时将跳过。${pendingImport.rejected.slice(0, 3).join("；")}` : "";
    el.applyImport.disabled = pendingImport.entries.length === 0;
  }

  async function handleFile(kind, file) {
    if (!file) return;
    const requestedClassId = state.activeClassId;
    pendingImport = null; showImportPreview();
    try {
      if (kind === "questions" && !/\.docx$/i.test(file.name)) throw new Error("题库请使用 .docx 格式；旧版 .doc 请先另存为 .docx。");
      if (kind === "students" && !/\.(xlsx|xls)$/i.test(file.name)) throw new Error("名单请使用 .xlsx 或 .xls 格式。");
      let parsed;
      if (kind === "questions") {
        if (!window.mammoth) throw new Error("Word 解析组件加载失败，请检查网络连接后刷新网页。");
        const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        parsed = parseDocxText(result.value);
      } else {
        if (!window.XLSX) throw new Error("Excel 解析组件加载失败，请检查网络连接后刷新网页。");
        const workbook = window.XLSX.read(await file.arrayBuffer());
        parsed = parseSheet(workbook);
      }
      if (kind === "students" && state.activeClassId !== requestedClassId) { showToast("解析期间切换了班级，请在目标班级重新选择名单。"); return; }
      pendingImport = { kind, classId: requestedClassId, fileName: file.name, ...parsed };
      showImportPreview();
      if (!parsed.entries.length) showToast("没有识别到可导入的内容，请检查文件格式。");
    } catch (error) {
      showToast(error.message || "文件解析失败，请检查文件是否损坏。");
    }
  }

  function applyImport() {
    if (!pendingImport || !pendingImport.entries.length) return;
    const { kind, entries, fileName, classId, bankId } = pendingImport;
    if (kind === "questions") {
      if (!bankId && state.questionBanks.length >= 5) { showToast("最多保存 5 个题库，请先删除不需要的题库再导入。"); return; }
      if (!$("bankNameInput").value.trim()) { showToast("请填写题库名称。"); return; }
      if (entries.some((q) => !q.en.trim() || !q.zh.trim())) { showToast("请补全每道题的英文和中文，或删除空白题目。"); return; }
      entries.forEach((q) => { q.en = q.en.trim(); q.zh = q.zh.trim(); });
    }
    const beforeImport = JSON.stringify(state);
    if (kind === "students") {
      if (classId !== state.activeClassId) { showToast("班级已切换，请重新选择名单文件。"); return; }
      if (state.usedStudentIds.length && !window.confirm(`替换${activeClass().name}名单会清空该班本轮进度和 Record。确定继续吗？`)) return;
      state.students = entries;
      state.files.students = fileName;
      resetRoundData();
    } else {
      const bank = { id: bankId || makeId("bank"), name: $("bankNameInput").value.trim(), fileName, entries };
      const index = state.questionBanks.findIndex((item) => item.id === bank.id);
      if (index >= 0) state.questionBanks[index] = bank; else state.questionBanks.push(bank);
      setBank(bank.id);
      if (bankId) {
        // Edited banks restart their deck; historical answer snapshots stay unchanged.
        for (const classroom of state.classes) {
          classroom.questionDeck = shuffled(entries.map((q) => q.id)); classroom.questionCycle = 1;
          delete classroom.bankProgress[bankId];
        }
        activateClass(state, state.activeClassId);
      }
    }
    if (!save()) {
      state = JSON.parse(beforeImport);
      if (state.phase === "student-rolling") { state.phase = "idle"; state.pendingStudentId = null; }
      if (state.phase === "question-rolling") state.phase = "student-ready";
      renderAll();
      showToast("保存失败，原数据已保留。请减少题库内容后重试，当前编辑内容尚未保存。");
      return;
    }
    pendingImport = null;
    showImportPreview();
    renderAll();
    if (kind === "questions") el.settingsDialog.close();
    showToast(kind === "students" ? `已为${activeClass().name}导入 ${entries.length} 位学生，该班本轮进度已重置。` : `题库已保存，共 ${entries.length} 道词条；旧题库和作答记录仍保留。`);
  }

  function resetRound() {
    if (!state.students.length && !state.questions.length) { showToast("请先导入名单与题库。"); return; }
    if (state.usedStudentIds.length && !window.confirm(`确定为${activeClass().name}开启新一轮吗？该班本轮进度和 Record 将清空。`)) return;
    resetRoundData(); save(); renderAll();
    el.settingsDialog.close();
    showToast(`${activeClass().name}的新一轮已准备好，所有同学均可再次抽取。`);
  }

  function init() {
    if (state.students.length && !state.studentDeck.length && !state.usedStudentIds.length) state.studentDeck = shuffled(state.students.map((student) => student.id));
    if (state.questions.length && !state.questionDeck.length && !state.records.length) state.questionDeck = shuffled(state.questions.map((question) => question.id));
    if (state.phase === "counting" && Date.now() >= state.timerEndsAt) state.phase = "await-check";
    save(); renderAll();
    if (state.phase === "counting") startTimerInterval();
    $("retryButton").addEventListener("click", startRetry);
    $("absentButton").addEventListener("click", markAbsent);
    $("bankNameInput").addEventListener("input", () => { if (pendingImport) pendingImport.name = $("bankNameInput").value; });
    $("addQuestionRow").addEventListener("click", () => {
      if (pendingImport?.kind !== "questions") return;
      pendingImport.entries.push({ id: makeId("q"), en: "", zh: "" }); showImportPreview();
      el.previewExamples.lastElementChild?.querySelector("textarea")?.focus();
    });
    $("bankSelect").addEventListener("change", () => {
      setBank($("bankSelect").value); save(); renderAll(); showToast("已切换题库，从下一道题开始使用。");
    });
    $("editBank").addEventListener("click", () => {
      const bank = state.questionBanks.find((item) => item.id === state.activeBankId); if (!bank) return;
      pendingImport = { kind: "questions", bankId: bank.id, name: bank.name, fileName: bank.fileName,
        entries: bank.entries.map((q) => ({ ...q })), rejected: [] }; showImportPreview();
    });
    $("deleteBank").addEventListener("click", () => {
      const bank = state.questionBanks.find((item) => item.id === state.activeBankId);
      if (!bank || !window.confirm(`删除题库“${bank.name}”？已保存的作答记录保留；题库需要重新导入才能恢复。`)) return;
      state.questionBanks = state.questionBanks.filter((item) => item.id !== bank.id);
      setBank(state.questionBanks[0]?.id || null);
      for (const classroom of state.classes) delete classroom.bankProgress[bank.id];
      if (pendingImport?.bankId === bank.id) { pendingImport = null; showImportPreview(); }
      save(); renderAll();
    });
    el.startButton.addEventListener("click", handleDrawAction);
    el.stopButton.addEventListener("click", stopRolling);
    el.checkButton.addEventListener("click", () => { if (state.currentId) revealAnswer(state.currentId); });
    el.soundButton.addEventListener("click", () => { state.sound = !state.sound; if (state.sound) ensureAudio(); save(); renderControls(); });
    el.audioQuestionButton.addEventListener("click", () => { const record = currentRecord(); const text = record?.prompt || preview?.prompt; if (text) speakQuestion(text); });
    el.classSelect.addEventListener("change", () => switchClass(el.classSelect.value));
    el.settingsClassSelect.addEventListener("change", () => switchClass(el.settingsClassSelect.value));
    $("saveClassName").addEventListener("click", saveClassName);
    el.classNameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") saveClassName(); });
    $("openSettings").addEventListener("click", () => el.settingsDialog.showModal());
    $("openSettingsTop").addEventListener("click", () => el.settingsDialog.showModal());
    $("openRecordOverview").addEventListener("click", () => { renderOverview(); el.recordOverviewDialog.showModal(); });
    $("closeRecordOverview").addEventListener("click", () => el.recordOverviewDialog.close());
    el.recordOverviewDialog.addEventListener("click", (event) => { if (event.target === el.recordOverviewDialog) el.recordOverviewDialog.close(); });
    el.copyWrongNames.addEventListener("click", copyWrongNames);
    $("closeSettings").addEventListener("click", () => el.settingsDialog.close());
    el.settingsDialog.addEventListener("click", (event) => { if (event.target === el.settingsDialog) el.settingsDialog.close(); });
    el.studentFile.addEventListener("change", (event) => { handleFile("students", event.target.files[0]); event.target.value = ""; });
    el.questionFile.addEventListener("change", (event) => { handleFile("questions", event.target.files[0]); event.target.value = ""; });
    el.applyImport.addEventListener("click", applyImport);
    $("cancelImport").addEventListener("click", () => { pendingImport = null; showImportPreview(); });
    $("resetRound").addEventListener("click", resetRound);
    for (const radio of document.querySelectorAll('input[name="direction"]')) radio.addEventListener("change", () => { state.mode = radio.value; save(); renderAll(); });
    for (const radio of document.querySelectorAll('input[name="question-type"]')) radio.addEventListener("change", () => { state.questionType = radio.value; save(); renderAll(); showToast(radio.value === "audio" ? "已切换为听音复述题。" : "已切换为显示文字题。"); });
    for (const radio of document.querySelectorAll('input[name="timer-seconds"]')) radio.addEventListener("change", () => {
      const seconds = Number(radio.value);
      if (!TIMER_CHOICES.includes(seconds)) return;
      state.timerSeconds = seconds;
      save(); renderAll();
      showToast(`倒计时已设为 ${seconds} 秒，从下一次抽取开始生效。`);
    });
    for (const radio of document.querySelectorAll('input[name="roll-speed"]')) radio.addEventListener("change", () => {
      if (!Object.prototype.hasOwnProperty.call(ROLL_SPEEDS, radio.value)) return;
      state.rollSpeed = radio.value;
      save(); renderAll(); restartRollInterval();
      showToast(`滚动速度已设为${radio.value === "slow" ? "慢速" : radio.value === "fast" ? "快速" : "适中"}。`);
    });
  }

  init();
})();
