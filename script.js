
/* ==========================================================
   ZERO BARRIER QUIZ - VERSION 3
   Frontend Controller
   ========================================================== */

const API = "";
let zbqToken = localStorage.getItem("zbq_token") || "";
let zbqRole = localStorage.getItem("zbq_role") || "";
let zbqInstitution = JSON.parse(localStorage.getItem("zbq_institution") || "null");

let currentQuiz = null;
let studentName = "";
let studentAnswers = [];
let manualQuestions = [];
let manualQuizTitle = "";
let createMode = "ai";

/* ==========================================================
   HELPERS
   ========================================================== */

function el(...ids) {
  for (const id of ids) {
    const node = document.getElementById(id);
    if (node) return node;
  }
  return null;
}

function value(...ids) {
  return el(...ids)?.value?.trim() || "";
}

function setText(text, ...ids) {
  const node = el(...ids);
  if (node) node.textContent = text ?? "";
}

function setHTML(html, ...ids) {
  const node = el(...ids);
  if (node) node.innerHTML = html ?? "";
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    ...(zbqToken ? { Authorization: "Bearer " + zbqToken } : {})
  };
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(zbqToken ? { Authorization: "Bearer " + zbqToken } : {})
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(API + url, {
    ...options,
    headers
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ")");
  }

  return data;
}

function showMessage(message, type = "info") {
  alert(message);
}

function saveLogin(token, role, institution = null) {
  zbqToken = token;
  zbqRole = role;
  zbqInstitution = institution;

  localStorage.setItem("zbq_token", token);
  localStorage.setItem("zbq_role", role);

  if (institution) {
    localStorage.setItem("zbq_institution", JSON.stringify(institution));
  } else {
    localStorage.removeItem("zbq_institution");
  }
}

function clearLogin() {
  zbqToken = "";
  zbqRole = "";
  zbqInstitution = null;

  localStorage.removeItem("zbq_token");
  localStorage.removeItem("zbq_role");
  localStorage.removeItem("zbq_institution");
}

function hideAllViews() {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.remove("active");
    v.style.display = "none";
  });

  document.querySelectorAll("[data-view]").forEach(v => {
    v.style.display = "none";
  });
}

function showView(viewId) {
  hideAllViews();

  const view = document.getElementById(viewId);
  if (view) {
    view.style.display = "block";
    view.classList.add("active");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  showView("homeView");
}

/* ==========================================================
   HOME / ROLE NAVIGATION
   ========================================================== */

function openSuperAdminLogin() {
  showView("superAdminLoginView");
}

function openInstitutionLogin() {
  showView("institutionLoginView");
}

function openStudent() {
  showView("studentJoinView");
}

function openTeacher() {
  if (zbqRole !== "institution" || !zbqToken) {
    openInstitutionLogin();
    return;
  }
  loadInstitutionDashboard();
}

function openAdmin() {
  if (zbqRole === "superadmin" && zbqToken) {
    loadSuperAdminDashboard();
  } else {
    openSuperAdminLogin();
  }
}

function returnToDashboard() {
  if (zbqRole === "superadmin") {
    loadSuperAdminDashboard();
  } else if (zbqRole === "institution") {
    loadInstitutionDashboard();
  } else {
    showHome();
  }
}

/* ==========================================================
   SUPER ADMIN AUTH
   ========================================================== */

async function loginSuperAdmin() {
  const username = value("superAdminUsername", "superadminUsername", "adminUsername");
  const password = value("superAdminPassword", "superadminPassword", "adminPassword");

  if (!username || !password) {
    return showMessage("Enter your Super Admin username and password.");
  }

  try {
    const data = await api("/api/auth/superadmin", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    saveLogin(data.token, "superadmin");
    await loadSuperAdminDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

function superAdminLogout() {
  clearLogin();
  showHome();
}

/* ==========================================================
   SUPER ADMIN DASHBOARD
   ========================================================== */

async function loadSuperAdminDashboard() {
  try {
    const data = await api("/api/superadmin/dashboard");

    showView("superAdminDashboardView");

    const stats = data.stats || {};

    setText(stats.institutions ?? 0, "totalInstitutions", "institutionCount");
    setText(stats.active ?? 0, "activeInstitutions");
    setText(stats.quizzes ?? 0, "totalQuizzes");
    setText(stats.submissions ?? 0, "totalSubmissions");

    renderInstitutions(data.institutions || []);
  } catch (err) {
    showMessage(err.message);
    if (err.message.toLowerCase().includes("session")) clearLogin();
  }
}

function renderInstitutions(institutions) {
  const container = el("institutionsList", "institutionList", "institutionsTable");
  if (!container) return;

  if (!institutions.length) {
    container.innerHTML = "<p>No institutions created yet.</p>";
    return;
  }

  container.innerHTML = institutions.map(inst => `
    <div class="card">
      <h3>${escapeHtml(inst.name)}</h3>
      ${inst.logo ? `<img src="${escapeHtml(inst.logo)}" alt="Logo" style="max-width:100px;max-height:80px">` : ""}
      <p><b>Username:</b> ${escapeHtml(inst.username)}</p>
      <p><b>Plan:</b> ${escapeHtml(inst.plan)}</p>
      <p><b>Quizzes:</b> ${inst.quiz_used} / ${inst.quiz_limit}</p>
      <p><b>Expiry:</b> ${inst.expires_at ? escapeHtml(new Date(inst.expires_at).toLocaleDateString()) : "No expiry"}</p>
      <p><b>Status:</b> ${inst.active ? "Active" : "Disabled"}</p>
      <button class="btn-secondary" onclick="toggleInstitution(${inst.id},${!inst.active})">
        ${inst.active ? "Disable" : "Enable"}
      </button>
    </div>
  `).join("");
}

function showAddInstitutionForm() {
  const form = el("addInstitutionForm", "institutionCreateForm");
  if (form) form.style.display = "block";
}

function hideAddInstitutionForm() {
  const form = el("addInstitutionForm", "institutionCreateForm");
  if (form) form.style.display = "none";
}

async function createInstitution() {
  const name = value("institutionName", "newInstitutionName");
  const username = value("institutionUsername", "newInstitutionUsername");
  const password = value("institutionPassword", "newInstitutionPassword");
  const plan = value("institutionPlan", "newInstitutionPlan") || "Free";
  const quizLimit = value("institutionQuizLimit", "quizLimit", "newQuizLimit") || "10";
  const expiresAt = value("institutionExpiry", "expiresAt");
  const logoInput = el("institutionLogo", "logoUpload", "newInstitutionLogo");

  if (!name || !username || !password) {
    return showMessage("Fill in institution name, username and password.");
  }

  const formData = new FormData();
  formData.append("name", name);
  formData.append("username", username);
  formData.append("password", password);
  formData.append("plan", plan);
  formData.append("quizLimit", quizLimit);
  if (expiresAt) formData.append("expiresAt", expiresAt);
  if (logoInput?.files?.[0]) formData.append("logo", logoInput.files[0]);

  try {
    const response = await fetch("/api/superadmin/institutions", {
      method: "POST",
      headers: { Authorization: "Bearer " + zbqToken },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Institution creation failed.");

    showMessage("Institution created successfully!");
    hideAddInstitutionForm();

    ["institutionName", "newInstitutionName",
     "institutionUsername", "newInstitutionUsername",
     "institutionPassword", "newInstitutionPassword",
     "institutionQuizLimit", "quizLimit", "newQuizLimit",
     "institutionExpiry", "expiresAt"
    ].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.value = "";
    });

    await loadSuperAdminDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

async function toggleInstitution(id, active) {
  try {
    await api("/api/superadmin/institutions/" + id, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    await loadSuperAdminDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

/* ==========================================================
   INSTITUTION AUTH
   ========================================================== */

async function loginInstitution() {
  const username = value("institutionLoginUsername", "loginInstitutionUsername", "institutionUser");
  const password = value("institutionLoginPassword", "loginInstitutionPassword", "institutionPass");

  if (!username || !password) {
    return showMessage("Enter your institution username and password.");
  }

  try {
    const data = await api("/api/auth/institution", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    saveLogin(data.token, "institution", data.institution);
    await loadInstitutionDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

function institutionLogout() {
  clearLogin();
  showHome();
}

/* ==========================================================
   INSTITUTION DASHBOARD
   ========================================================== */

async function loadInstitutionDashboard() {
  try {
    const data = await api("/api/institution/dashboard");
    const inst = data.institution;

    zbqInstitution = inst;
    localStorage.setItem("zbq_institution", JSON.stringify(inst));

    showView("institutionDashboardView");

    setText(inst.name, "institutionDashboardName", "institutionNameDisplay");
    setText(inst.plan, "institutionPlanDisplay", "currentPlan");
    setText(inst.quiz_used, "institutionQuizUsed", "quizzesUsed");
    setText(inst.quiz_limit, "institutionQuizLimitDisplay", "quizzesLimit");
    setText(inst.quiz_remaining, "institutionQuizRemaining", "quizzesRemaining");

    const logo = el("institutionDashboardLogo", "dashboardInstitutionLogo");
    if (logo && inst.logo) {
      logo.src = inst.logo;
      logo.style.display = "block";
    }

    renderInstitutionQuizzes(data.quizzes || []);
  } catch (err) {
    showMessage(err.message);
    clearLogin();
    openInstitutionLogin();
  }
}

function renderInstitutionQuizzes(quizzes) {
  const container = el("institutionQuizzes", "institutionQuizList", "createdQuizList");
  if (!container) return;

  if (!quizzes.length) {
    container.innerHTML = "<p>You haven't created any quizzes yet.</p>";
    return;
  }

  container.innerHTML = quizzes.map(q => `
    <div class="card">
      <h3>${escapeHtml(q.title)}</h3>
      <p>Quiz Code: <b>${escapeHtml(q.code)}</b></p>
      <p>Created: ${q.created_at ? escapeHtml(new Date(q.created_at).toLocaleDateString()) : ""}</p>
      <button class="btn-secondary" onclick="showLeaderboard('${escapeHtml(q.code)}')">Leaderboard</button>
    </div>
  `).join("");
}

/* ==========================================================
   CREATE QUIZ MODE
   ========================================================== */

function selectCreateMode(mode) {
  createMode = mode;

  const aiPanel = el("aiQuizPanel", "aiQuizForm", "aiCreatePanel");
  const manualPanel = el("manualQuizPanel", "manualQuizForm", "manualCreatePanel");

  if (aiPanel) aiPanel.style.display = mode === "ai" ? "block" : "none";
  if (manualPanel) manualPanel.style.display = mode === "manual" ? "block" : "none";
}

function normalizeQuiz(quiz) {
  return {
    title: quiz.title || "Untitled Quiz",
    questions: (quiz.questions || []).map(q => ({
      question: q.question || "",
      options: (q.options || []).slice(0, 4),
      answer: Number(q.answer),
      explanation: q.explanation || ""
    }))
  };
}

async function generateAIQuiz() {
  const topic = value("aiTopic", "quizTopic", "topic");
  const count = Number(value("aiQuestionCount", "questionCount", "quizCount") || 5);
  const difficulty = value("aiDifficulty", "difficulty") || "medium";
  const type = value("aiQuestionType", "questionType") || "multiple-choice";

  if (!topic) return showMessage("Enter a quiz topic.");
  if (!zbqToken) return showMessage("Please log in to your institution first.");

  try {
    const data = await api("/api/generate-quiz", {
      method: "POST",
      body: JSON.stringify({ topic, count, difficulty, type })
    });

    currentQuiz = normalizeQuiz(data.quiz);
    await createQuiz(currentQuiz, "AI");
  } catch (err) {
    showMessage(err.message);
  }
}

/* ==========================================================
   CREATE QUIZ & DISPLAY CODE
   ========================================================== */

async function createQuiz(quiz, method = "Manual") {
  if (!zbqToken) {
    return showMessage("Please log in before creating a quiz.");
  }

  quiz = normalizeQuiz(quiz);

  if (!quiz.title || !quiz.questions.length) {
    return showMessage("Quiz needs a title and questions.");
  }

  try {
    const data = await api("/api/quizzes", {
      method: "POST",
      body: JSON.stringify({
        title: quiz.title,
        questions: quiz.questions
      })
    });

    quiz.code = data.quiz.code;
    quiz.method = method;
    currentQuiz = quiz;

    showCreatedQuiz(quiz);
    if (zbqRole === "institution") loadInstitutionDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

function showCreatedQuiz(quiz) {
  showView("quizCreatedView");

  setText(quiz.title, "createdQuizTitle", "quizCreatedTitle");
  setText(quiz.code, "createdQuizCode", "quizCodeDisplay", "createdCode");
  setText(quiz.questions.length, "createdQuestionCount", "quizQuestionCount");

  const codeBox = el("createdQuizCode", "quizCodeDisplay", "createdCode");
  if (codeBox) codeBox.textContent = quiz.code;

  const details = el("quizCreatedDetails", "createdQuizDetails");
  if (details) {
    details.innerHTML = `
      <h2>${escapeHtml(quiz.title)}</h2>
      <p>Questions: ${quiz.questions.length}</p>
      <p>Quiz Code:</p>
      <div class="quiz-code">${escapeHtml(quiz.code)}</div>
      <button class="btn" onclick="openStudent()">Go to Student Join</button>
      <button class="btn-secondary" onclick="showLeaderboard('${escapeHtml(quiz.code)}')">View Leaderboard</button>
      <button class="btn-outline" onclick="returnToDashboard()">Dashboard</button>
    `;
  }
}

/* ==========================================================
   MANUAL QUIZ CREATOR
   ========================================================== */

function addManualQuestion() {
  const questionText = value("manualQuestionText", "questionText", "newQuestion");
  const options = [
    value("manualOption0", "option0", "optionA"),
    value("manualOption1", "option1", "optionB"),
    value("manualOption2", "option2", "optionC"),
    value("manualOption3", "option3", "optionD")
  ];

  const answerNode = el("manualCorrectAnswer", "correctAnswer", "correctOption");
  const answer = answerNode ? Number(answerNode.value) : 0;

  if (!questionText || options.some(o => !o)) {
    return showMessage("Enter the question and all four options.");
  }

  manualQuestions.push({
    question: questionText,
    options,
    answer
  });

  renderManualQuestions();

  ["manualQuestionText", "questionText", "newQuestion",
   "manualOption0", "option0", "optionA",
   "manualOption1", "option1", "optionB",
   "manualOption2", "option2", "optionC",
   "manualOption3", "option3", "optionD"
  ].forEach(id => {
    const n = document.getElementById(id);
    if (n) n.value = "";
  });
}

function renderManualQuestions() {
  const container = el("manualQuestionsList", "manualQuestionList");
  if (!container) return;

  container.innerHTML = manualQuestions.map((q, i) => `
    <div class="card">
      <b>Question ${i + 1}:</b> ${escapeHtml(q.question)}
      <ul>${q.options.map(o => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
      <button class="btn-danger" onclick="removeManualQuestion(${i})">Remove</button>
    </div>
  `).join("");
}

function removeManualQuestion(index) {
  manualQuestions.splice(index, 1);
  renderManualQuestions();
}

async function saveManualQuiz() {
  const title = value("manualQuizTitle", "quizTitle", "newQuizTitle");

  if (!title) return showMessage("Enter a quiz title.");
  if (!manualQuestions.length) return showMessage("Add at least one question.");

  await createQuiz({ title, questions: manualQuestions }, "Manual");
  manualQuestions = [];
  renderManualQuestions();
}

/* ==========================================================
   STUDENT JOIN
   ========================================================== */

async function joinQuiz() {
  const name = value("studentName", "playerName", "joinStudentName");
  const code = value("quizCode", "joinQuizCode", "studentQuizCode").toUpperCase();

  if (!name || !code) {
    return showMessage("Enter your name and quiz code.");
  }

  try {
    const data = await api("/api/quizzes/" + encodeURIComponent(code));
    studentName = name;
    currentQuiz = normalizeQuiz(data.quiz || data);
    currentQuiz.code = code;

    studentAnswers = new Array(currentQuiz.questions.length).fill(null);
    renderStudentQuiz();
  } catch (err) {
    showMessage(err.message);
  }
}

function renderStudentQuiz() {
  if (!currentQuiz) return;
  showView("quizTakingView");

  setText(currentQuiz.title, "takingQuizTitle", "studentQuizTitle");

  const container = el("quizQuestions", "studentQuestions", "quizQuestionContainer");
  if (!container) return;

  container.innerHTML = currentQuiz.questions.map((q, i) => `
    <div class="question-card">
      <h3>Question ${i + 1}</h3>
      <p class="question-title">${escapeHtml(q.question)}</p>
      ${q.options.map((option, j) => `
        <label class="option">
          <input type="radio" name="question_${i}" value="${j}"
            onchange="studentAnswers[${i}]=${j}">
          ${escapeHtml(option)}
        </label>
      `).join("")}
    </div>
  `).join("") + `
    <button class="btn-success" onclick="submitQuiz()">Submit Quiz</button>
  `;
}

async function submitQuiz() {
  if (!currentQuiz) return;

  if (studentAnswers.some(a => a === null)) {
    if (!confirm("You haven't answered every question. Submit anyway?")) return;
  }

  try {
    const data = await api("/api/quizzes/" + encodeURIComponent(currentQuiz.code) + "/results", {
      method: "POST",
      body: JSON.stringify({
        name: studentName,
        answers: studentAnswers
      })
    });

    showQuizResult(data);
  } catch (err) {
    showMessage(err.message);
  }
}

function showQuizResult(data) {
  showView("quizResultView");

  setText(data.score, "resultScore", "studentScore");
  setText(data.total, "resultTotal", "studentTotal");
  setText(data.percentage + "%", "resultPercentage", "studentPercentage");
  setText(data.rank, "resultRank", "studentRank");

  const resultContainer = el("quizResultDetails", "resultDetails");
  if (resultContainer) {
    resultContainer.innerHTML = `
      <h2>Your Result</h2>
      <h1>${data.score} / ${data.total}</h1>
      <h2>${data.percentage}%</h2>
      <p>Rank: ${data.rank}</p>
      <button class="btn" onclick="showLeaderboard('${escapeHtml(currentQuiz.code)}')">Leaderboard</button>
      <button class="btn-secondary" onclick="openStudent()">Join Another Quiz</button>
      <button class="btn-outline" onclick="showHome()">Home</button>
    `;
  }
}

/* ==========================================================
   LEADERBOARD
   ========================================================== */

async function showLeaderboard(code) {
  if (!code) code = currentQuiz?.code;
  if (!code) return showMessage("Quiz code not found.");

  try {
    const data = await api("/api/quizzes/" + encodeURIComponent(code) + "/results");
    showView("leaderboardView");

    setText(code, "leaderboardQuizCode", "leaderboardCode");

    const container = el("leaderboardList", "leaderboardResults", "leaderboardTable");
    if (!container) return;

    const rows = data.leaderboard || [];

    if (!rows.length) {
      container.innerHTML = "<p>No students have submitted yet.</p>";
      return;
    }

    container.innerHTML = `
      <table>
        <thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>%</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${r.score}/${r.total}</td>
              <td>${r.percentage}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    showMessage(err.message);
  }
}

/* ==========================================================
   ADMIN / LOCAL QUIZ VIEW
   ========================================================== */

function renderAdmin() {
  if (zbqRole === "superadmin") {
    loadSuperAdminDashboard();
  } else if (zbqRole === "institution") {
    loadInstitutionDashboard();
  } else {
    openSuperAdminLogin();
  }
}

async function clearAllQuizzes() {
  if (!confirm("Delete all quizzes? This cannot be undone.")) return;

  if (zbqRole !== "superadmin") {
    return showMessage("Only Super Admin can clear all quizzes.");
  }

  try {
    await api("/api/superadmin/quizzes", { method: "DELETE" });
    showMessage("All quizzes deleted.");
    loadSuperAdminDashboard();
  } catch (err) {
    showMessage(err.message);
  }
}

/* ==========================================================
   INITIALIZATION
   ========================================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (zbqToken && zbqRole === "superadmin") {
    loadSuperAdminDashboard();
  } else if (zbqToken && zbqRole === "institution") {
    loadInstitutionDashboard();
  } else {
    showHome();
  }
});

/* Make functions available to HTML onclick attributes */
Object.assign(window, {
  showView,
  showHome,
  openSuperAdminLogin,
  loginSuperAdmin,
  superAdminLogout,
  openInstitutionLogin,
  loginInstitution,
  institutionLogout,
  returnToDashboard,
  openTeacher,
  openStudent,
  openAdmin,
  showAddInstitutionForm,
  hideAddInstitutionForm,
  createInstitution,
  toggleInstitution,
  selectCreateMode,
  generateAIQuiz,
  createQuiz,
  showCreatedQuiz,
  addManualQuestion,
  removeManualQuestion,
  saveManualQuiz,
  joinQuiz,
  submitQuiz,
  showQuizResult,
  showLeaderboard,
  renderAdmin,
  clearAllQuizzes
});
