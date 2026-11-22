/* =========================================================
   ZERO BARRIER QUIZ — VERSION 3
   Multi-Institution Quiz Platform
   ========================================================= */

let currentUser = null;
let currentQuiz = null;
let currentStudent = "";
let createMode = "ai";
let liveHostSession = null;
let liveStudentSession = null;

let liveHostTimer = null;
let liveStudentTimer = null;

let manualQuestions = [];
let leaderboards = {};


/* =========================================================
   API HELPER
   ========================================================= */

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}


/* =========================================================
   UTILITIES
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function showStatus(elementId, message, type = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.innerHTML = `
    <div class="status ${type}">
      ${escapeHtml(message)}
    </div>
  `;
}

function showView(id) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active");
  });

  const view = document.getElementById(id);
  if (view) view.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  showView("homeView");
}

function returnToDashboard() {
  if (currentUser?.role === "super_admin") {
    openSuperAdminDashboard();
  } else if (currentUser?.role === "institution") {
    openInstitutionDashboard();
  } else {
    showHome();
  }
}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

function openSuperAdminLogin() {
  showView("superAdminLoginView");
}

function openInstitutionLogin() {
  showView("institutionLoginView");
}

async function loginSuperAdmin() {
  const username = document.getElementById("superAdminUsername")?.value.trim();
  const password = document.getElementById("superAdminPassword")?.value;

  if (!username || !password) {
    showStatus("superAdminMessage", "Enter username and password.", "error");
    return;
  }

  try {
    const data = await api("/api/auth/super-admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    currentUser = data.user;
    openSuperAdminDashboard();
  } catch (error) {
    showStatus("superAdminMessage", error.message, "error");
  }
}

async function loginInstitution() {
  const username = document.getElementById("institutionUsername")?.value.trim();
  const password = document.getElementById("institutionPassword")?.value;

  if (!username || !password) {
    showStatus("institutionMessage", "Enter username and password.", "error");
    return;
  }

  try {
    const data = await api("/api/auth/institution/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    currentUser = data.user;
    openInstitutionDashboard();
  } catch (error) {
    showStatus("institutionMessage", error.message, "error");
  }
}

async function checkSession() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.user;

    if (currentUser?.role === "super_admin") {
      openSuperAdminDashboard();
    } else if (currentUser?.role === "institution") {
      openInstitutionDashboard();
    } else {
      showHome();
    }
  } catch {
    currentUser = null;
    showHome();
  }
}

async function superAdminLogout() {
  await logout();
}

async function institutionLogout() {
  await logout();
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}

  currentUser = null;
  showHome();
}


/* =========================================================
   SUPER ADMIN
   ========================================================= */

function openSuperAdminDashboard() {
  showView("superAdminView");
  loadInstitutions();
}

async function loadInstitutions() {
  const list = document.getElementById("institutionList");
  if (!list) return;

  list.innerHTML = `<p>Loading institutions...</p>`;

  try {
    const data = await api("/api/super-admin/institutions");

    const institutions = data.institutions || [];

    list.innerHTML = institutions.length
      ? institutions.map(institution => `
          <div class="admin-item">
            <div>
              <strong>${escapeHtml(institution.name)}</strong>
              <p>
                Username: ${escapeHtml(institution.username)}<br>
                Plan: ${escapeHtml(institution.plan)}<br>
                Quizzes: ${institution.usedQuizzes}/${institution.quizLimit}
              </p>
            </div>
          </div>
        `).join("")
      : `<p>No institutions added yet.</p>`;

  } catch (error) {
    list.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function showAddInstitutionForm() {
  document.getElementById("addInstitutionForm")?.classList.remove("hidden");
}

function hideAddInstitutionForm() {
  document.getElementById("addInstitutionForm")?.classList.add("hidden");
}

async function createInstitution() {
  const name = document.getElementById("newInstitutionName")?.value.trim();
  const username = document.getElementById("newInstitutionUsername")?.value.trim();
  const password = document.getElementById("newInstitutionPassword")?.value;
  const quizLimit = Number(document.getElementById("newInstitutionLimit")?.value);
  const plan = document.getElementById("newInstitutionPlan")?.value;
  const expiry = document.getElementById("newInstitutionExpiry")?.value;

  if (!name || !username || !password) {
    showStatus("institutionCreateMessage", "Complete all required fields.", "error");
    return;
  }

  try {
    await api("/api/super-admin/institutions", {
      method: "POST",
      body: JSON.stringify({
        name,
        username,
        password,
        quizLimit,
        plan,
        expiry
      })
    });

    showStatus("institutionCreateMessage", "Institution created successfully!", "success");
    hideAddInstitutionForm();
    await loadInstitutions();

  } catch (error) {
    showStatus("institutionCreateMessage", error.message, "error");
  }
}


/* =========================================================
   INSTITUTION DASHBOARD
   ========================================================= */

async function openInstitutionDashboard() {
  showView("institutionView");
  loadInstitutionDashboard();
}

async function loadInstitutionDashboard() {
  try {
    const data = await api("/api/institution/dashboard");

    const nameEl = document.getElementById("institutionDashboardName");
    if (nameEl) nameEl.textContent = data.institution?.name || "Institution";

    const usageEl = document.getElementById("institutionQuizUsage");
    if (usageEl) {
      usageEl.textContent =
        `${data.usedQuizzes ?? 0} / ${data.quizLimit ?? 0} quizzes used`;
    }

    const logo = document.getElementById("institutionLogo");
    if (logo && data.institution?.logoUrl) {
      logo.src = data.institution.logoUrl;
      logo.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Institution dashboard:", error);
  }
}


/* =========================================================
   TEACHER / QUIZ CREATION
   ========================================================= */

function openTeacher() {
  showView("teacherView");
  selectCreateMode("ai");
}

function selectCreateMode(mode) {
  createMode = mode;

  document.getElementById("aiModeCard")?.classList.toggle("selected", mode === "ai");
  document.getElementById("manualModeCard")?.classList.toggle("selected", mode === "manual");

  document.getElementById("aiCreator")?.classList.toggle("hidden", mode !== "ai");
  document.getElementById("manualCreator")?.classList.toggle("hidden", mode !== "manual");

  if (mode === "manual" && !document.querySelector(".question-editor")) {
    addManualQuestion();
  }
}


/* =========================================================
   NORMALIZE QUIZ
   ========================================================= */

function normalizeQuiz(quiz) {
  return {
    title: String(quiz.title || "Untitled Quiz"),
    questions: (quiz.questions || []).map(question => ({
      question: String(question.question || ""),
      options: Array.isArray(question.options)
        ? question.options.map(String)
        : [],
      answer: Number(question.answer ?? 0)
    }))
  };
}


/* =========================================================
   AI QUIZ GENERATION
   ========================================================= */

async function generateAIQuiz() {
  const topic = document.getElementById("aiTopic")?.value.trim();
  const count = Number(document.getElementById("aiCount")?.value);
  const difficulty = document.getElementById("aiDifficulty")?.value;
  const type = document.getElementById("aiType")?.value;

  if (!topic) {
    showStatus("aiStatus", "Enter a quiz topic.", "error");
    return;
  }

  if (!Number.isInteger(count) || count < 1) {
    showStatus("aiStatus", "Enter a valid number of questions.", "error");
    return;
  }

  showStatus("aiStatus", "AI is generating your quiz...", "info");

  try {
    const data = await api("/api/generate-quiz", {
      method: "POST",
      body: JSON.stringify({ topic, count, difficulty, type })
    });

    const quiz = normalizeQuiz(data.quiz || data);

    await createQuiz(quiz, "AI Generated");

    showStatus("aiStatus", "Quiz created successfully!", "success");

  } catch (error) {
    showStatus("aiStatus", error.message, "error");
  }
}


/* =========================================================
   MANUAL QUIZ
   ========================================================= */

function addManualQuestion() {
  const box = document.getElementById("manualQuestions");
  if (!box) return;

  const n = box.querySelectorAll(".question-editor").length + 1;

  const el = document.createElement("div");
  el.className = "question-editor";

  el.innerHTML = `
    <h3>Question ${n}</h3>
    <input class="mq-text" placeholder="Enter question">

    ${["A", "B", "C", "D"].map((letter, index) => `
      <div class="option-row">
        <input class="mq-option" placeholder="Option ${letter}">
        <label>
          <input type="radio" name="correct${n}" value="${index}" ${index === 0 ? "checked" : ""}>
          Correct
        </label>
      </div>
    `).join("")}
  `;

  box.appendChild(el);
}

async function saveManualQuiz() {
  const title = document.getElementById("manualTitle")?.value.trim() || "My Quiz";
  const editors = [...document.querySelectorAll(".question-editor")];

  if (!editors.length) {
    showStatus("manualStatus", "Add at least one question.", "error");
    return;
  }

  const questions = [];

  for (const editor of editors) {
    const question = editor.querySelector(".mq-text")?.value.trim();
    const options = [...editor.querySelectorAll(".mq-option")].map(x => x.value.trim());
    const answer = Number(editor.querySelector("input[type=radio]:checked")?.value);

    if (!question || options.some(option => !option)) {
      showStatus("manualStatus", "Complete every question and all four options.", "error");
      return;
    }

    questions.push({ question, options, answer });
  }

  try {
    await createQuiz({ title, questions }, "Teacher Created");
    showStatus("manualStatus", "Quiz saved successfully!", "success");
  } catch (error) {
    showStatus("manualStatus", error.message, "error");
  }
}


/* =========================================================
   CREATE QUIZ
   ========================================================= */

async function createQuiz(quiz, method) {
  const payload = {
    ...normalizeQuiz(quiz),
    method
  };

  const data = await api("/api/quizzes", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const createdQuiz = data.quiz || data;

  showCreatedQuiz(createdQuiz);
  return createdQuiz;
}

function showCreatedQuiz(quiz) {
  const panel = document.getElementById("createdQuizPanel");
  if (!panel) return;

  panel.classList.remove("hidden");

  panel.innerHTML = `
    <div class="code-box">
      <h2>Quiz Created Successfully!</h2>
      <p>Your Quiz Code</p>
      <div class="join-code">${escapeHtml(quiz.code)}</div>
      <p>Share this code with your students.</p>
    </div>

    <h3>${escapeHtml(quiz.title)}</h3>
    <p>${quiz.questions?.length || 0} questions • ${escapeHtml(quiz.method || "")}</p>

    <button class="secondary-btn" onclick="showLeaderboard('${escapeHtml(quiz.code)}')">
      View Leaderboard
    </button>

    <button class="primary-btn" onclick="createLiveQuiz('${escapeHtml(quiz.code)}')">
      Start Live Quiz
    </button>
  `;

  panel.scrollIntoView({ behavior: "smooth" });
}


/* =========================================================
   STUDENT
   ========================================================= */

function openStudent() {
  showView("studentView");
}

async function joinQuiz() {
  const name = document.getElementById("studentName")?.value.trim();
  const code = document.getElementById("studentCode")?.value.trim().toUpperCase();

  if (!name || !code) {
    showStatus("studentMessage", "Enter your name and quiz code.", "error");
    return;
  }

  if (code.startsWith("LIV")) {
    return joinLiveQuiz(name, code);
  }

  try {
    const data = await api(`/api/quizzes/${encodeURIComponent(code)}`);
    const quiz = data.quiz || data;

    if (!quiz || !Array.isArray(quiz.questions)) {
      throw new Error("Quiz not found.");
    }

    currentQuiz = quiz;
    currentStudent = name;
    renderQuiz();

  } catch (error) {
    showStatus("studentMessage", error.message, "error");
  }
}

function renderQuiz() {
  showView("quizView");

  document.getElementById("quizTitle").textContent = currentQuiz.title || "Quiz";
  document.getElementById("quizStudent").textContent =
    `Student: ${currentStudent} • Code: ${currentQuiz.code}`;

  document.getElementById("quizResult").innerHTML = "";

  document.getElementById("quizQuestions").innerHTML =
    currentQuiz.questions.map((question, index) => `
      <div class="question-card">
        <h3>${index + 1}. ${escapeHtml(question.question)}</h3>

        ${(question.options || []).map((option, i) => `
          <label class="quiz-option">
            <input type="radio" name="q${index}" value="${i}">
            ${escapeHtml(option)}
          </label>
        `).join("")}
      </div>
    `).join("");
}


/* =========================================================
   SUBMIT NORMAL QUIZ
   ========================================================= */

async function submitQuiz() {
  if (!currentQuiz) return;

  let score = 0;
  let answered = 0;

  currentQuiz.questions.forEach((question, index) => {
    const selected = document.querySelector(`input[name="q${index}"]:checked`);

    if (selected) {
      answered++;
      if (Number(selected.value) === question.answer) score++;
    }
  });

  const total = currentQuiz.questions.length;

  try {
    const data = await api(`/api/quizzes/${encodeURIComponent(currentQuiz.code)}/results`, {
      method: "POST",
      body: JSON.stringify({
        name: currentStudent,
        answers: [...currentQuiz.questions].map((_, index) =>
          Number(document.querySelector(`input[name="q${index}"]:checked`)?.value ?? -1)
        )
      })
    });

    const result = data.result || {};
    const resultBox = document.getElementById("quizResult");

    resultBox.innerHTML = `
      <div class="result-box">
        <h2>Quiz Completed!</h2>
        <p>${escapeHtml(currentStudent)}, your score:</p>
        <h1>${result.score ?? score}/${result.total ?? total}</h1>
        <p>${result.percentage ?? Math.round(score / Math.max(total, 1) * 100)}%</p>
        <p>Answered ${answered} of ${total} questions.</p>
        <p>Your Rank: #${result.rank ?? "—"}</p>
        <button class="secondary-btn" onclick="showLeaderboard('${escapeHtml(currentQuiz.code)}')">
          View Leaderboard
        </button>
      </div>
    `;

    document.querySelectorAll("#quizQuestions input").forEach(input => {
      input.disabled = true;
    });

  } catch (error) {
    showStatus("quizResult", error.message, "error");
  }
}


/* =========================================================
   LEADERBOARD
   ========================================================= */

async function getSharedLeaderboard(code) {
  return await api(`/api/quizzes/${encodeURIComponent(code)}/results`);
}

async function showLeaderboard(code) {
  try {
    const data = await getSharedLeaderboard(code);
    const leaderboard = data.leaderboard || [];

    document.getElementById("sharedLeaderboardModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "sharedLeaderboardModal";
    modal.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      background:rgba(0,0,0,.65); display:flex;
      align-items:center; justify-content:center; padding:20px;
    `;

    modal.innerHTML = `
      <div style="background:white;width:min(700px,95vw);max-height:85vh;overflow:auto;padding:25px;border-radius:18px;">
        <h2>Leaderboard</h2>
        <p>Quiz Code: ${escapeHtml(code)}</p>
        <p>Participants: ${data.participants ?? leaderboard.length}</p>

        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>Rank</th><th>Student</th><th>Score</th><th>%</th></tr></thead>
          <tbody>
            ${leaderboard.map(item => `
              <tr>
                <td>#${item.rank}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${item.score}/${item.total}</td>
                <td>${item.percentage}%</td>
              </tr>
            `).join("") || `<tr><td colspan="4">No results yet.</td></tr>`}
          </tbody>
        </table>

        <button id="closeLeaderboard" class="secondary-btn">Close</button>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("closeLeaderboard").onclick = () => modal.remove();
    modal.onclick = event => {
      if (event.target === modal) modal.remove();
    };

  } catch (error) {
    alert(error.message);
  }
}


/* =========================================================
   LIVE QUIZ — HOST
   ========================================================= */

async function createLiveQuiz(quizCode) {
  try {
    const data = await api("/api/live", {
      method: "POST",
      body: JSON.stringify({ quizCode })
    });

    liveHostSession = {
      liveCode: data.liveCode,
      hostToken: data.hostToken,
      quizCode
    };

    showLiveHostPanel();

  } catch (error) {
    alert(error.message);
  }
}

function showLiveHostPanel() {
  const panel = document.getElementById("createdQuizPanel");
  if (!panel || !liveHostSession) return;

  panel.innerHTML = `
    <h2>Live Quiz Ready</h2>
    <div class="join-code">${escapeHtml(liveHostSession.liveCode)}</div>
    <p>Share this Live Quiz code with students.</p>

    <div id="liveHostPanel">
      <p id="liveHostStatus">Waiting for students...</p>
      <div id="liveHostParticipants"></div>
      <button id="liveStartButton" onclick="startLiveQuiz()" disabled>Start Live Quiz</button>
    </div>
  `;

  pollLiveHost();
}

async function pollLiveHost() {
  if (!liveHostSession) return;

  try {
    const data = await api(
      `/api/live/${encodeURIComponent(liveHostSession.liveCode)}/host-state?token=${encodeURIComponent(liveHostSession.hostToken)}`
    );

    renderLiveHostState(data);
  } catch {}

  clearTimeout(liveHostTimer);
  liveHostTimer = setTimeout(pollLiveHost, 1000);
}

function renderLiveHostState(data) {
  const state = data.state || data;
  const participants = data.participants || state.participants || [];
  const phase = String(state.phase || state.status || "waiting").toLowerCase();

  const status = document.getElementById("liveHostStatus");
  const participantBox = document.getElementById("liveHostParticipants");
  const startButton = document.getElementById("liveStartButton");

  if (phase === "waiting") {
    if (status) status.textContent = `${participants.length} student(s) joined`;
    if (startButton) startButton.disabled = participants.length === 0;

    if (participantBox) {
      participantBox.innerHTML = participants.map(p =>
        `<p>${escapeHtml(p.name)} ${p.answered ? "Answered" : "Waiting"}</p>`
      ).join("") || "No students joined yet.";
    }
  } else if (phase === "active" || phase === "live") {
    if (startButton) startButton.style.display = "none";
    renderLiveHostQuestion(state);
  } else if (phase === "finished" || phase === "ended") {
    renderLiveHostFinal(state);
  }
}

function renderLiveHostQuestion(data) {
  const panel = document.getElementById("liveHostPanel");
  if (!panel) return;

  const question = data.question;
  if (!question) return;

  panel.innerHTML = `
    <h2>Question ${Number(data.currentQuestionIndex || 0) + 1}/${data.totalQuestions || 0}</h2>
    <div id="liveHostTimer">60</div>
    <h3>${escapeHtml(question.question)}</h3>
    ${(question.options || []).map((option, i) =>
      `<div class="quiz-option">${String.fromCharCode(65 + i)}. ${escapeHtml(option)}</div>`
    ).join("")}
    <p>Students answered: ${data.answeredCount || 0}/${(data.participants || []).length}</p>
  `;

  updateLiveCountdown("liveHostTimer", data.deadline);
}

async function startLiveQuiz() {
  if (!liveHostSession) return;

  try {
    const data = await api(`/api/live/${encodeURIComponent(liveHostSession.liveCode)}/start`, {
      method: "POST",
      body: JSON.stringify({ hostToken: liveHostSession.hostToken })
    });

    renderLiveHostState(data.state || data);
  } catch (error) {
    alert(error.message);
  }
}

function renderLiveHostFinal(data) {
  const panel = document.getElementById("liveHostPanel");
  if (!panel) return;

  panel.innerHTML = `
    <h2>Live Quiz Finished!</h2>
    ${renderLeaderboardTable(data.leaderboard || [])}
  `;
}


/* =========================================================
   LIVE QUIZ — STUDENT
   ========================================================= */

async function joinLiveQuiz(name, liveCode) {
  try {
    const data = await api(`/api/live/${encodeURIComponent(liveCode)}/join`, {
      method: "POST",
      body: JSON.stringify({ name })
    });

    liveStudentSession = {
      liveCode,
      studentToken: data.participantToken || data.studentToken,
      name
    };

    showLiveStudentPanel();

  } catch (error) {
    showStatus("studentMessage", error.message, "error");
  }
}

function showLiveStudentPanel() {
  showView("studentView");

  const msg = document.getElementById("studentMessage");
  if (!msg) return;

  msg.innerHTML = `
    <div id="liveStudentPanel">
      <h2>Live Quiz</h2>
      <div id="liveStudentContent">Waiting for host...</div>
    </div>
  `;

  pollLiveStudent();
}

async function pollLiveStudent() {
  if (!liveStudentSession) return;

  try {
    const data = await api(
      `/api/live/${encodeURIComponent(liveStudentSession.liveCode)}/state?token=${encodeURIComponent(liveStudentSession.studentToken)}`
    );

    renderLiveStudentState(data);
  } catch {}

  clearTimeout(liveStudentTimer);
  liveStudentTimer = setTimeout(pollLiveStudent, 1000);
}

function renderLiveStudentState(data) {
  const phase = String(data.status || data.phase || "waiting").toLowerCase();

  if (phase === "waiting") {
    const box = document.getElementById("liveStudentContent");
    if (box) box.innerHTML = `<p>Waiting for host to start...</p>`;
  } else if (phase === "active" || phase === "live") {
    renderLiveStudentQuestion(data);
  } else if (phase === "finished" || phase === "ended") {
    renderLiveStudentFinal(data);
  }
}

function renderLiveStudentQuestion(data) {
  const box = document.getElementById("liveStudentContent");
  if (!box || !data.question) return;

  const questionIndex = Number(data.currentQuestionIndex || 0);

  box.innerHTML = `
    <h2>Question ${questionIndex + 1}/${data.totalQuestions}</h2>
    <div id="liveStudentTimer">60</div>
    <h3>${escapeHtml(data.question.question)}</h3>

    ${(data.question.options || []).map((option, index) => `
      <label class="quiz-option">
        <input type="radio" name="liveAnswer" value="${index}" ${data.answered ? "disabled" : ""}>
        ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}
      </label>
    `).join("")}

    <button id="liveAnswerButton" onclick="submitLiveAnswer()" ${data.answered ? "disabled" : ""}>
      ${data.answered ? "Answer Submitted" : "Submit Answer"}
    </button>

    <div id="liveAnswerStatus">${data.answered ? "Answer submitted." : ""}</div>
  `;

  window.liveStudentQuestionIndex = questionIndex;
  updateLiveCountdown("liveStudentTimer", data.deadline);
}

async function submitLiveAnswer() {
  const selected = document.querySelector('input[name="liveAnswer"]:checked');
  if (!selected || !liveStudentSession) return;

  const button = document.getElementById("liveAnswerButton");
  if (button) button.disabled = true;

  try {
    await api(`/api/live/${encodeURIComponent(liveStudentSession.liveCode)}/answer`, {
      method: "POST",
      body: JSON.stringify({
        participantToken: liveStudentSession.studentToken,
        questionIndex: Number(window.liveStudentQuestionIndex || 0),
        answer: Number(selected.value)
      })
    });

    document.querySelectorAll('input[name="liveAnswer"]').forEach(input => {
      input.disabled = true;
    });

    const status = document.getElementById("liveAnswerStatus");
    if (status) status.textContent = "Answer submitted. Waiting for next question.";

  } catch (error) {
    if (button) button.disabled = false;
    alert(error.message);
  }
}

function renderLiveStudentFinal(data) {
  const box = document.getElementById("liveStudentContent");
  if (!box) return;

  const result = data.result || {};

  box.innerHTML = `
    <h2>Live Quiz Completed!</h2>
    <h3>${escapeHtml(liveStudentSession?.name || "")}</h3>
    <h1>${result.score ?? 0}/${result.total ?? data.totalQuestions ?? 0}</h1>
    <p>${result.percentage ?? 0}%</p>
    <p>Rank: #${result.rank ?? "—"}</p>
    ${renderLeaderboardTable(data.leaderboard || [])}
  `;
}


/* =========================================================
   LEADERBOARD TABLE
   ========================================================= */

function renderLeaderboardTable(items) {
  return `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr><th>Rank</th><th>Student</th><th>Score</th><th>%</th></tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>#${item.rank}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${item.score}/${item.total}</td>
            <td>${item.percentage}%</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* =========================================================
   COUNTDOWN
   ========================================================= */

function updateLiveCountdown(elementId, deadline) {
  const element = document.getElementById(elementId);
  if (!element || !deadline) return;

  const end = new Date(deadline).getTime();

  function update() {
    const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));

    const target = document.getElementById(elementId);
    if (!target) return;

    target.textContent = seconds;

    if (seconds > 0) {
      setTimeout(update, 250);
    }
  }

  update();
}


/* =========================================================
   ADMIN / QUIZ LIST
   ========================================================= */

async function openAdmin() {
  showView("adminView");
  renderAdmin();
}

async function renderAdmin() {
  const list = document.getElementById("adminList");
  if (!list) return;

  list.innerHTML = "<p>Quiz management is handled by the institution dashboard.</p>";
}

function clearAllQuizzes() {
  alert("Local quiz deletion is disabled in Version 3. Use the authorized admin dashboard.");
}


/* =========================================================
   STARTUP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
});

console.log("Zero Barrier Quiz V3 frontend loaded.");
