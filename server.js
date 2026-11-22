
/* =========================================================
   ZERO BARRIER QUIZ — V3 BACKEND
   Express + PostgreSQL + AI + Institutions + Live Quiz
   ========================================================= */

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

if (!JWT_SECRET) {
  console.error("ERROR: JWT_SECRET is missing.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   DATABASE
   ========================================================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS institutions (
      id SERIAL PRIMARY PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT DEFAULT 'Free',
      quiz_limit INTEGER DEFAULT 10,
      used_quizzes INTEGER DEFAULT 0,
      expiry DATE,
      logo_url TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      institution_id INTEGER REFERENCES institutions(id),
      title TEXT NOT NULL,
      method TEXT,
      questions JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_results (
      id SERIAL PRIMARY KEY,
      quiz_code TEXT NOT NULL REFERENCES quizzes(code) ON DELETE CASCADE,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percentage INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Database tables ready.");
}

/* =========================================================
   HELPERS
   ========================================================= */

function makeCode(prefix = "ZBQ") {
  return prefix + crypto.randomInt(1000, 10000);
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function cleanQuiz(quiz) {
  return {
    title: String(quiz.title || "Quiz").slice(0, 200),
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.slice(0, 100).map(q => ({
          question: String(q.question || "").slice(0, 2000),
          options: Array.isArray(q.options)
            ? q.options.slice(0, 4).map(o => String(o).slice(0, 500))
            : [],
          answer: Number(q.answer)
        }))
      : []
  };
}

function publicQuiz(quiz, includeAnswers = false) {
  const questions = quiz.questions || [];

  return {
    code: quiz.code,
    title: quiz.title,
    method: quiz.method,
    questions: questions.map(q => {
      const item = {
        question: q.question,
        options: q.options
      };
      if (includeAnswers) item.answer = q.answer;
      return item;
    })
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

function issueAuth(res, user) {
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("zbq_session", token, cookieOptions());
}

function auth(req, res, next) {
  try {
    const token = req.cookies?.zbq_session;
    if (!token) return res.status(401).json({ error: "Please log in." });

    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// Cookie parser (no external dependency)
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(part => {
    const [key, ...value] = part.trim().split("=");
    if (key) req.cookies[key] = decodeURIComponent(value.join("=") || "");
  });
  next();
});

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Super Admin access required." });
  }
  next();
}

function requireInstitution(req, res, next) {
  if (req.user?.role !== "institution") {
    return res.status(403).json({ error: "Institution login required." });
  }
  next();
}

async function getInstitution(id) {
  const result = await pool.query(
    "SELECT * FROM institutions WHERE id=$1",
    [id]
  );
  return result.rows[0];
}

function rankResults(rows) {
  return rows.map((item, index) => ({
    rank: index + 1,
    name: item.name,
    score: item.score,
    total: item.total,
    percentage: item.percentage
  }));
}

async function leaderboard(code) {
  const result = await pool.query(
    `SELECT name, score, total, percentage
     FROM quiz_results
     WHERE quiz_code=$1
     ORDER BY score DESC, percentage DESC, created_at ASC`,
    [code]
  );

  return rankResults(result.rows);
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", version: 3 });
  } catch {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
});

/* =========================================================
   AUTH — SUPER ADMIN
   ========================================================= */

app.post("/api/auth/super-admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  const adminUsername = process.env.SUPER_ADMIN_USERNAME;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return res.status(500).json({ error: "Super Admin credentials not configured." });
  }

  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const user = { role: "super_admin", username };
  issueAuth(res, user);

  res.json({ success: true, user });
});

/* =========================================================
   AUTH — INSTITUTION
   ========================================================= */

app.post("/api/auth/institution/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  const result = await pool.query(
    "SELECT * FROM institutions WHERE username=$1 AND active=TRUE",
    [username]
  );

  const institution = result.rows[0];

  if (!institution || !(await bcrypt.compare(password, institution.password_hash))) {
    return res.status(401).json({ error: "Invalid institution credentials." });
  }

  if (institution.expiry && new Date(institution.expiry) < new Date()) {
    return res.status(403).json({ error: "Institution account has expired." });
  }

  const user = {
    role: "institution",
    institutionId: institution.id,
    username: institution.username,
    name: institution.name
  };

  issueAuth(res, user);
  res.json({ success: true, user });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("zbq_session", { path: "/" });
  res.json({ success: true });
});

/* =========================================================
   SUPER ADMIN — INSTITUTIONS
   ========================================================= */

app.get("/api/super-admin/institutions", auth, requireSuperAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, username, plan, quiz_limit AS "quizLimit",
            used_quizzes AS "usedQuizzes", expiry, logo_url AS "logoUrl", active
     FROM institutions ORDER BY created_at DESC`
  );

  res.json({ institutions: result.rows });
});

app.post("/api/super-admin/institutions", auth, requireSuperAdmin, async (req, res) => {
  const {
    name, username, password, quizLimit, plan, expiry
  } = req.body || {};

  if (!name || !username || !password) {
    return res.status(400).json({ error: "Name, username, and password are required." });
  }

  const limit = Number(quizLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
    return res.status(400).json({ error: "Invalid quiz limit." });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO institutions (name, username, password_hash, quiz_limit, plan, expiry)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, username, plan, quiz_limit AS "quizLimit", expiry`,
      [name.trim(), username.trim().toLowerCase(), passwordHash, limit, plan || "Free", expiry || null]
    );

    res.json({ success: true, institution: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Username already exists." });
    }
    res.status(500).json({ error: "Could not create institution." });
  }
});

/* =========================================================
   INSTITUTION DASHBOARD
   ========================================================= */

app.get("/api/institution/dashboard", auth, requireInstitution, async (req, res) => {
  const institution = await getInstitution(req.user.institutionId);

  if (!institution) {
    return res.status(404).json({ error: "Institution not found." });
  }

  res.json({
    institution: {
      id: institution.id,
      name: institution.name,
      username: institution.username,
      logoUrl: institution.logo_url,
      plan: institution.plan
    },
    usedQuizzes: institution.used_quizzes,
    quizLimit: institution.quiz_limit,
    expiry: institution.expiry
  });
});

/* =========================================================
   AI QUIZ GENERATION
   ========================================================= */

app.post("/api/generate-quiz", auth, requireInstitution, async (req, res) => {
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "AI API key is not configured." });
  }

  const { topic, count, difficulty, type } = req.body || {};
  const number = Number(count);

  if (!topic || !Number.isInteger(number) || number < 1 || number > 30) {
    return res.status(400).json({ error: "Topic and 1–30 questions required." });
  }

  try {
    const prompt = `Create exactly ${number} ${difficulty || "medium"} difficulty multiple-choice quiz questions about "${topic}". 
Type: ${type || "general"}.
Return ONLY valid JSON in this format:
{"title":"Quiz title","questions":[{"question":"...","options":["A","B","C","D"],"answer":0}]}
Every question must have exactly four options. answer must be the zero-based index 0, 1, 2, or 3.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You generate valid educational quizzes. Output JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.6
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message || "AI generation failed.");
    }

    let content = result.choices?.[0]?.message?.content || "";
    content = content.replace(/```json|```/g, "").trim();

    const quiz = JSON.parse(content);
    const cleaned = cleanQuiz(quiz);

    if (cleaned.questions.length !== number) {
      throw new Error("AI returned an unexpected question count. Please try again.");
    }

    res.json({ quiz: cleaned });
  } catch (error) {
    res.status(500).json({ error: error.message || "Quiz generation failed." });
  }
});

/* =========================================================
   CREATE QUIZ — INSTITUTION ONLY
   ========================================================= */

app.post("/api/quizzes", auth, requireInstitution, async (req, res) => {
  const institution = await getInstitution(req.user.institutionId);

  if (!institution || !institution.active) {
    return res.status(403).json({ error: "Institution account is inactive." });
  }

  if (institution.expiry && new Date(institution.expiry) < new Date()) {
    return res.status(403).json({ error: "Institution subscription expired." });
  }

  if (institution.used_quizzes >= institution.quiz_limit) {
    return res.status(403).json({ error: "Quiz limit reached for your institution." });
  }

  const quiz = cleanQuiz(req.body);

  if (!quiz.title || !quiz.questions.length) {
    return res.status(400).json({ error: "Quiz must contain questions." });
  }

  for (const q of quiz.questions) {
    if (
      !q.question ||
      q.options.length !== 4 ||
      !Number.isInteger(q.answer) ||
      q.answer < 0 ||
      q.answer > 3 ||
      q.options.some(o => !o)
    ) {
      return res.status(400).json({ error: "Invalid quiz question or options." });
    }
  }

  let code;
  do {
    code = makeCode();
  } while ((await pool.query("SELECT 1 FROM quizzes WHERE code=$1", [code])).rowCount);

  const result = await pool.query(
    `INSERT INTO quizzes (code, institution_id, title, method, questions)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING code, title, method, questions`,
    [code, institution.id, quiz.title, req.body.method || "Quiz", JSON.stringify(quiz.questions)]
  );

  await pool.query(
    "UPDATE institutions SET used_quizzes=used_quizzes+1 WHERE id=$1",
    [institution.id]
  );

  res.json({
    success: true,
    quiz: publicQuiz(result.rows[0], true)
  });
});

/* =========================================================
   GET QUIZ — STUDENT
   ========================================================= */

app.get("/api/quizzes/:code", async (req, res) => {
  const result = await pool.query(
    "SELECT code, title, method, questions FROM quizzes WHERE code=$1",
    [req.params.code.toUpperCase()]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Quiz not found." });
  }

  // Never send correct answers to students.
  res.json({ quiz: publicQuiz(result.rows[0], false) });
});

/* =========================================================
   SUBMIT NORMAL QUIZ — SERVER SCORING
   ========================================================= */

app.post("/api/quizzes/:code/results", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { name, answers } = req.body || {};

  if (!name || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Student name and answers required." });
  }

  const quizResult = await pool.query(
    "SELECT questions FROM quizzes WHERE code=$1",
    [code]
  );

  if (!quizResult.rows.length) {
    return res.status(404).json({ error: "Quiz not found." });
  }

  const questions = quizResult.rows[0].questions;
  let score = 0;

  questions.forEach((q, index) => {
    if (Number(answers[index]) === q.answer) score++;
  });

  const total = questions.length;
  const percentage = total ? Math.round(score / total * 100) : 0;

  const saved = await pool.query(
    `INSERT INTO quiz_results (quiz_code, name, score, total, percentage)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, score, total, percentage`,
    [code, String(name).trim().slice(0, 60), score, total, percentage]
  );

  const board = await leaderboard(code);
  const result = saved.rows[0];
  result.rank = board.findIndex(item => item.id === result.id) + 1;

  // Determine rank by matching the just-inserted result row.
  const all = await pool.query(
    `SELECT id, name, score, total, percentage
     FROM quiz_results WHERE quiz_code=$1
     ORDER BY score DESC, percentage DESC, created_at ASC`,
    [code]
  );
  const rank = all.rows.findIndex(row => row.id === result.id) + 1;

  res.json({
    success: true,
    result: { score, total, percentage, rank },
    leaderboard: board,
    participants: board.length
  });
});

app.get("/api/quizzes/:code/results", async (req, res) => {
  const code = req.params.code.toUpperCase();

  const exists = await pool.query("SELECT 1 FROM quizzes WHERE code=$1", [code]);
  if (!exists.rowCount) return res.status(404).json({ error: "Quiz not found." });

  const board = await leaderboard(code);
  res.json({ leaderboard: board, participants: board.length });
});

/* =========================================================
   LIVE QUIZ — MEMORY SESSIONS
   ========================================================= */

const liveSessions = new Map();

function finishLiveSession(session) {
  session.phase = "finished";
  session.finishedAt = Date.now();

  session.leaderboard = [...session.participants.values()]
    .map(p => ({
      name: p.name,
      score: p.score,
      total: session.quiz.questions.length,
      percentage: Math.round(p.score / Math.max(session.quiz.questions.length, 1) * 100),
      joinedAt: p.joinedAt
    }))
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      score: p.score,
      total: p.total,
      percentage: p.percentage
    }));
}

function advanceLive(session) {
  session.currentQuestionIndex++;

  if (session.currentQuestionIndex >= session.quiz.questions.length) {
    finishLiveSession(session);
    return;
  }

  session.deadline = Date.now() + 60000;
  session.participants.forEach(p => {
    p.answered = false;
    p.lastAnswer = null;
  });
}

function currentLiveQuestion(session) {
  if (session.phase !== "active") return null;
  if (Date.now() >= session.deadline) advanceLive(session);
  if (session.phase !== "active") return null;
  return session.quiz.questions[session.currentQuestionIndex];
}

function liveStateForStudent(session, participant) {
  currentLiveQuestion(session);

  if (session.phase === "waiting") {
    return {
      status: "waiting",
      phase: "waiting",
      participants: [...session.participants.values()].map(p => ({ name: p.name }))
    };
  }

  if (session.phase === "active") {
    const question = session.quiz.questions[session.currentQuestionIndex];

    return {
      status: "active",
      phase: "active",
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.quiz.questions.length,
      question: { question: question.question, options: question.options },
      deadline: new Date(session.deadline).toISOString(),
      answered: participant.answered
    };
  }

  const leaderboard = session.leaderboard || [];
  const rank = leaderboard.findIndex(p => p.name === participant.name) + 1;
  const result = leaderboard[rank - 1] || { score: 0, total: session.quiz.questions.length, percentage: 0 };

  return {
    status: "finished",
    phase: "finished",
    totalQuestions: session.quiz.questions.length,
    result: { ...result, rank },
    leaderboard
  };
}

function liveStateForHost(session) {
  currentLiveQuestion(session);

  const participants = [...session.participants.values()].map(p => ({
    name: p.name,
    answered: p.answered
  }));

  if (session.phase === "waiting") {
    return { phase: "waiting", participants };
  }

  if (session.phase === "active") {
    const question = session.quiz.questions[session.currentQuestionIndex];

    return {
      phase: "active",
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.quiz.questions.length,
      question: { question: question.question, options: question.options },
      deadline: new Date(session.deadline).toISOString(),
      answeredCount: participants.filter(p => p.answered).length,
      participants
    };
  }

  return {
    phase: "finished",
    totalQuestions: session.quiz.questions.length,
    leaderboard: session.leaderboard || [],
    participants
  };
}

/* Create Live Quiz */
app.post("/api/live", auth, requireInstitution, async (req, res) => {
  const quizCode = String(req.body.quizCode || "").toUpperCase();

  const result = await pool.query(
    "SELECT * FROM quizzes WHERE code=$1 AND institution_id=$2",
    [quizCode, req.user.institutionId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Quiz not found for your institution." });
  }

  const liveCode = makeCode("LIV");
  const hostToken = makeToken();

  const session = {
    liveCode,
    hostToken,
    quiz: result.rows[0],
    phase: "waiting",
    participants: new Map(),
    currentQuestionIndex: 0,
    deadline: null
  };

  liveSessions.set(liveCode, session);

  res.json({ liveCode, hostToken });
});

/* Join Live Quiz */
app.post("/api/live/:code/join", async (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });
  if (session.phase !== "waiting") return res.status(403).json({ error: "Live Quiz already started." });

  const name = String(req.body.name || "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: "Name required." });

  const participantToken = makeToken();
  session.participants.set(participantToken, {
    token: participantToken,
    name,
    score: 0,
    answered: false,
    joinedAt: Date.now(),
    lastAnswer: null
  });

  res.json({ participantToken });
});

/* Student Live State */
app.get("/api/live/:code/state", (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });

  const token = req.query.token;
  const participant = session.participants.get(token);
  if (!participant) return res.status(403).json({ error: "Invalid participant token." });

  res.json(liveStateForStudent(session, participant));
});

/* Host Live State */
app.get("/api/live/:code/host-state", (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });
  if (req.query.token !== session.hostToken) return res.status(403).json({ error: "Invalid host token." });

  res.json(liveStateForHost(session));
});

/* Start Live Quiz */
app.post("/api/live/:code/start", (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });
  if (req.body.hostToken !== session.hostToken) return res.status(403).json({ error: "Invalid host token." });
  if (session.phase !== "waiting") return res.status(400).json({ error: "Live Quiz already started." });
  if (session.participants.size === 0) return res.status(400).json({ error: "No students joined." });

  session.phase = "active";
  session.currentQuestionIndex = 0;
  session.deadline = Date.now() + 60000;

  res.json({ state: liveStateForHost(session) });
});

/* Submit Live Answer */
app.post("/api/live/:code/answer", (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });
  if (session.phase !== "active") return res.status(400).json({ error: "Live Quiz is not active." });

  const participant = session.participants.get(req.body.participantToken);
  if (!participant) return res.status(403).json({ error: "Invalid participant token." });

  currentLiveQuestion(session);
  if (session.phase !== "active") return res.status(400).json({ error: "Question time ended." });

  const questionIndex = Number(req.body.questionIndex);
  const answer = Number(req.body.answer);

  if (questionIndex !== session.currentQuestionIndex) {
    return res.status(400).json({ error: "This question is no longer active." });
  }

  if (participant.answered) return res.status(409).json({ error: "Answer already submitted." });
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    return res.status(400).json({ error: "Invalid answer." });
  }

  const question = session.quiz.questions[session.currentQuestionIndex];

  if (answer === question.answer) participant.score++;
  participant.answered = true;
  participant.lastAnswer = answer;

  // Automatically advance when everyone has answered.
  if ([...session.participants.values()].every(p => p.answered)) {
    advanceLive(session);
  }

  res.json({ success: true });
});

/* End Live Quiz */
app.post("/api/live/:code/end", (req, res) => {
  const session = liveSessions.get(req.params.code.toUpperCase());
  if (!session) return res.status(404).json({ error: "Live Quiz not found." });
  if (req.body.hostToken !== session.hostToken) return res.status(403).json({ error: "Invalid host token." });

  finishLiveSession(session);
  res.json({ success: true, state: liveStateForHost(session) });
});

/* =========================================================
   STATIC WEBSITE
   ========================================================= */

app.use(express.static(path.join(__dirname)));

/* =========================================================
   START SERVER
   ========================================================= */

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Zero Barrier Quiz V3 running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
