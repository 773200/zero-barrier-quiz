
/* =========================================================
   ZERO BARRIER QUIZ — VERSION 3
   Multi-Institution Quiz Platform
   ========================================================= */

const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error("ERROR: JWT_SECRET is missing from environment variables.");
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
app.use(express.static(__dirname));

/* =========================================================
   DATABASE
   ========================================================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS institutions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      logo TEXT DEFAULT '',
      plan TEXT DEFAULT 'Free',
      quiz_limit INTEGER DEFAULT 10,
      quiz_used INTEGER DEFAULT 0,
      expires_at TIMESTAMPTZ,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      questions JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quiz_results (
      id SERIAL PRIMARY KEY,
      quiz_code TEXT REFERENCES quizzes(code) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percentage NUMERIC NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Database tables ready.");
}

/* =========================================================
   HELPERS
   ========================================================= */

function makeCode(prefix = "ZBQ") {
  return prefix + crypto.randomBytes(3).toString("hex").toUpperCase();
}

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "12h"
  });
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({ error: "Login required." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Super Admin access required." });
  }
  next();
}

function requireInstitution(req, res, next) {
  if (req.user.role !== "institution") {
    return res.status(403).json({ error: "Institution access required." });
  }
  next();
}

function cleanQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions.slice(0, 100).map(q => ({
    question: String(q.question || ""),
    options: Array.isArray(q.options)
      ? q.options.slice(0, 4).map(x => String(x))
      : [],
    answer: Number(q.answer),
    explanation: String(q.explanation || "")
  }));
}

function publicQuiz(quiz) {
  return {
    code: quiz.code,
    title: quiz.title,
    questions: quiz.questions.map(q => ({
      question: q.question,
      options: q.options
    }))
  };
}

async function getQuiz(code) {
  const result = await pool.query(
    "SELECT * FROM quizzes WHERE code = $1",
    [code.toUpperCase()]
  );
  return result.rows[0] || null;
}

/* =========================================================
   LOGO UPLOAD
   ========================================================= */

const uploadDir = path.join(__dirname, "uploads");

const fs = require("fs");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use("/uploads", express.static(uploadDir));

/* =========================================================
   HEALTH
   ========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "Zero Barrier Quiz v3" });
  } catch {
    res.status(500).json({ status: "database_error" });
  }
});

/* =========================================================
   SUPER ADMIN LOGIN
   Credentials come from Render Environment Variables
   ========================================================= */

app.post("/api/auth/superadmin", (req, res) => {
  const { username, password } = req.body;

  if (
    !process.env.SUPERADMIN_USERNAME ||
    !process.env.SUPERADMIN_PASSWORD
  ) {
    return res.status(503).json({
      error: "Super Admin credentials have not been configured."
    });
  }

  if (
    username !== process.env.SUPERADMIN_USERNAME ||
    password !== process.env.SUPERADMIN_PASSWORD
  ) {
    return res.status(401).json({ error: "Incorrect login details." });
  }

  const token = makeToken({ role: "superadmin", username });

  res.json({
    success: true,
    token,
    role: "superadmin",
    username
  });
});

/* =========================================================
   INSTITUTION LOGIN
   ========================================================= */

app.post("/api/auth/institution", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM institutions WHERE username = $1",
      [username]
    );

    const institution = result.rows[0];

    if (!institution || !institution.active) {
      return res.status(401).json({
        error: "Invalid account or institution inactive."
      });
    }

    const correct = await bcrypt.compare(
      password,
      institution.password_hash
    );

    if (!correct) {
      return res.status(401).json({ error: "Incorrect login details." });
    }

    if (
      institution.expires_at &&
      new Date(institution.expires_at) < new Date()
    ) {
      return res.status(403).json({
        error: "Institution plan has expired."
      });
    }

    const token = makeToken({
      role: "institution",
      institutionId: institution.id,
      username: institution.username
    });

    res.json({
      success: true,
      token,
      institution: {
        id: institution.id,
        name: institution.name,
        username: institution.username,
        logo: institution.logo,
        plan: institution.plan,
        quizLimit: institution.quiz_limit,
        quizUsed: institution.quiz_used,
        quizRemaining: Math.max(
          0,
          institution.quiz_limit - institution.quiz_used
        ),
        expiresAt: institution.expires_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Institution login failed." });
  }
});

/* =========================================================
   SUPER ADMIN — INSTITUTIONS
   ========================================================= */

app.get(
  "/api/superadmin/dashboard",
  verifyToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM institutions) AS institutions,
          (SELECT COUNT(*) FROM institutions WHERE active = TRUE) AS active,
          (SELECT COUNT(*) FROM quizzes) AS quizzes,
          (SELECT COUNT(*) FROM quiz_results) AS submissions
      `);

      const institutions = await pool.query(`
        SELECT id, name, username, logo, plan,
               quiz_limit, quiz_used, expires_at, active, created_at
        FROM institutions
        ORDER BY created_at DESC
      `);

      res.json({
        stats: stats.rows[0],
        institutions: institutions.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Dashboard failed to load." });
    }
  }
);

app.post(
  "/api/superadmin/institutions",
  verifyToken,
  requireSuperAdmin,
  upload.single("logo"),
  async (req, res) => {
    try {
      const {
        name,
        username,
        password,
        plan,
        quizLimit,
        expiresAt
      } = req.body;

      if (!name || !username || !password) {
        return res.status(400).json({
          error: "Institution name, username and password are required."
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          error: "Password must contain at least 8 characters."
        });
      }

      const limit = Number(quizLimit);

      if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
        return res.status(400).json({
          error: "Invalid quiz quota."
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const logo = req.file
        ? "/uploads/" + req.file.filename
        : "";

      const result = await pool.query(
        `INSERT INTO institutions
         (name, username, password_hash, logo, plan, quiz_limit, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, username, logo, plan, quiz_limit, quiz_used, expires_at, active`,
        [
          name.trim(),
          username.trim().toLowerCase(),
          passwordHash,
          logo,
          plan || "Free",
          limit,
          expiresAt || null
        ]
      );

      res.status(201).json({
        success: true,
        institution: result.rows[0]
      });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: "That institution username already exists."
        });
      }
      console.error(err);
      res.status(500).json({ error: "Institution creation failed." });
    }
  }
);

app.patch(
  "/api/superadmin/institutions/:id",
  verifyToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { active, quizLimit, plan, expiresAt } = req.body;
      const id = Number(req.params.id);

      const result = await pool.query(
        `UPDATE institutions SET
          active = COALESCE($1, active),
          quiz_limit = COALESCE($2, quiz_limit),
          plan = COALESCE($3, plan),
          expires_at = COALESCE($4, expires_at)
         WHERE id = $5
         RETURNING id, name, username, plan, quiz_limit, quiz_used, expires_at, active`,
        [
          typeof active === "boolean" ? active : null,
          quizLimit !== undefined ? Number(quizLimit) : null,
          plan ?? null,
          expiresAt ?? null,
          id
        ]
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Institution not found." });
      }

      res.json({ success: true, institution: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Institution update failed." });
    }
  }
);

/* =========================================================
   INSTITUTION DASHBOARD
   ========================================================= */

app.get(
  "/api/institution/dashboard",
  verifyToken,
  requireInstitution,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, username, logo, plan, quiz_limit,
                quiz_used, expires_at, active
         FROM institutions WHERE id = $1`,
        [req.user.institutionId]
      );

      const institution = result.rows[0];

      if (!institution) {
        return res.status(404).json({ error: "Institution not found." });
      }

      const quizzes = await pool.query(
        `SELECT code, title, created_at
         FROM quizzes WHERE institution_id = $1
         ORDER BY created_at DESC`,
        [institution.id]
      );

      res.json({
        institution: {
          ...institution,
          quiz_remaining: Math.max(
            0,
            institution.quiz_limit - institution.quiz_used
          )
        },
        quizzes: quizzes.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Dashboard failed to load." });
    }
  }
);

/* =========================================================
   CREATE QUIZ
   ========================================================= */

app.post("/api/quizzes", verifyToken, async (req, res) => {
  try {
    if (
      req.user.role !== "institution" &&
      req.user.role !== "superadmin"
    ) {
      return res.status(403).json({ error: "Not authorized." });
    }

    const { title, questions, code } = req.body;
    const cleaned = cleanQuestions(questions);

    if (!title || cleaned.length === 0) {
      return res.status(400).json({
        error: "Quiz title and questions are required."
      });
    }

    for (const q of cleaned) {
      if (
        !q.question ||
        q.options.length !== 4 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer > 3
      ) {
        return res.status(400).json({
          error: "Invalid question format. Each question needs four options and a correct answer."
        });
      }
    }

    let institutionId = null;

    if (req.user.role === "institution") {
      institutionId = req.user.institutionId;

      const instResult = await pool.query(
        "SELECT * FROM institutions WHERE id=$1 FOR UPDATE",
        [institutionId]
      );

      const inst = instResult.rows[0];

      if (!inst || !inst.active) {
        return res.status(403).json({ error: "Institution is inactive." });
      }

      if (inst.expires_at && new Date(inst.expires_at) < new Date()) {
        return res.status(403).json({ error: "Institution plan expired." });
      }

      if (inst.quiz_used >= inst.quiz_limit) {
        return res.status(403).json({
          error: "Quiz creation limit reached. Contact your administrator."
        });
      }
    }

    const quizCode = (code || makeCode()).toUpperCase();

    const result = await pool.query(
      `INSERT INTO quizzes (code, institution_id, title, questions)
       VALUES ($1,$2,$3,$4)
       RETURNING id, code, institution_id, title, created_at`,
      [quizCode, institutionId, title, JSON.stringify(cleaned)]
    );

    if (institutionId !== null) {
      await pool.query(
        "UPDATE institutions SET quiz_used = quiz_used + 1 WHERE id = $1",
        [institutionId]
      );
    }

    res.status(201).json({
      success: true,
      quiz: result.rows[0]
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Quiz code already exists." });
    }
    console.error(err);
    res.status(500).json({ error: "Quiz creation failed." });
  }
});

/* =========================================================
   GET QUIZ
   ========================================================= */

app.get("/api/quizzes/:code", async (req, res) => {
  try {
    const quiz = await getQuiz(req.params.code);

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    res.json({ quiz: publicQuiz(quiz) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Quiz loading failed." });
  }
});

/* =========================================================
   SUBMIT QUIZ — SERVER SCORING
   ========================================================= */

app.post("/api/quizzes/:code/results", async (req, res) => {
  try {
    const quiz = await getQuiz(req.params.code);

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    const { name, answers } = req.body;

    if (!name || !Array.isArray(answers)) {
      return res.status(400).json({
        error: "Student name and answers are required."
      });
    }

    const questions = quiz.questions;
    let score = 0;

    questions.forEach((q, index) => {
      if (Number(answers[index]) === Number(q.answer)) {
        score++;
      }
    });

    const total = questions.length;
    const percentage = total
      ? Math.round((score / total) * 100)
      : 0;

    await pool.query(
      `INSERT INTO quiz_results
       (quiz_code, student_name, score, total, percentage)
       VALUES ($1,$2,$3,$4,$5)`,
      [quiz.code, name.trim().slice(0, 100), score, total, percentage]
    );

    const board = await pool.query(
      `SELECT student_name AS name, score, total, percentage, created_at
       FROM quiz_results
       WHERE quiz_code = $1
       ORDER BY score DESC, created_at ASC`,
      [quiz.code]
    );

    const rank = board.rows.findIndex(
      r => r.name === name.trim() && Number(r.score) === score
    ) + 1;

    res.json({
      success: true,
      score,
      total,
      percentage,
      rank,
      leaderboard: board.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Quiz submission failed." });
  }
});

/* =========================================================
   LEADERBOARD
   ========================================================= */

app.get("/api/quizzes/:code/results", async (req, res) => {
  try {
    const quiz = await getQuiz(req.params.code);

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    const result = await pool.query(
      `SELECT student_name AS name, score, total, percentage, created_at
       FROM quiz_results
       WHERE quiz_code = $1
       ORDER BY score DESC, created_at ASC`,
      [quiz.code]
    );

    res.json({ leaderboard: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Leaderboard loading failed." });
  }
});

/* =========================================================
   AI QUIZ GENERATION — GROQ
   ========================================================= */

app.post("/api/generate-quiz", verifyToken, async (req, res) => {
  try {
    if (
      req.user.role !== "institution" &&
      req.user.role !== "superadmin"
    ) {
      return res.status(403).json({ error: "Not authorized." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        error: "AI is not configured. GROQ_API_KEY is missing."
      });
    }

    const { topic, count, difficulty, type } = req.body;
    const number = Math.min(Math.max(Number(count) || 5, 1), 100);

    if (!topic) {
      return res.status(400).json({ error: "Topic is required." });
    }

    const prompt = `
Generate ${number} multiple-choice quiz questions about "${topic}".
Difficulty: ${difficulty || "medium"}.
Question type: ${type || "multiple-choice"}.

Return ONLY valid JSON in this exact structure:
{
  "title": "Quiz title",
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "Short explanation"
    }
  ]
}

The answer must be the zero-based index of the correct option.
Each question must have exactly four options.
`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: "You create educational quizzes and output strict JSON only."
            },
            { role: "user", content: prompt }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq error:", data);
      return res.status(502).json({
        error: "AI generation provider failed."
      });
    }

    let content = data.choices?.[0]?.message?.content || "";

    content = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const quiz = JSON.parse(content);

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      throw new Error("Invalid AI quiz format.");
    }

    quiz.questions = cleanQuestions(quiz.questions).slice(0, number);

    res.json({ success: true, quiz });
  } catch (err) {
    console.error("AI quiz error:", err);
    res.status(500).json({ error: "Quiz generation failed." });
  }
});

/* =========================================================
   DELETE QUIZZES — SUPER ADMIN
   ========================================================= */

app.delete(
  "/api/superadmin/quizzes",
  verifyToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      await pool.query("DELETE FROM quizzes");
      res.json({ success: true, message: "All quizzes deleted." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Deletion failed." });
    }
  }
);

/* =========================================================
   404 & ERROR HANDLING
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

/* =========================================================
   START SERVER
   ========================================================= */

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Zero Barrier Quiz v3 running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Database startup failed:", err);
    process.exit(1);
  });
