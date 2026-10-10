const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// NORMAL QUIZ STORAGE
// ============================================================

const quizzes = new Map();
const quizResults = new Map();

// ============================================================
// LIVE QUIZ STORAGE
// ============================================================

const liveSessions = new Map();

const LIVE_QUESTION_TIME = 60 * 1000; // 60 seconds


// ============================================================
// HELPERS
// ============================================================

function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}


function generateLiveCode() {
  let code;

  do {
    code = "LIV" + generateCode(4);
  } while (liveSessions.has(code));

  return code;
}


function generateToken() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}


function normalizeQuiz(quiz) {
  if (!quiz || typeof quiz !== "object") {
    return null;
  }

  const questions = Array.isArray(quiz.questions)
    ? quiz.questions.map((q) => ({
        question: String(q.question || ""),
        options: Array.isArray(q.options)
          ? q.options.map((x) => String(x))
          : [],
        answer: Number.isInteger(q.answer)
          ? q.answer
          : parseInt(q.answer, 10)
      }))
    : [];

  return {
    code: String(quiz.code || "").trim().toUpperCase(),
    title: String(quiz.title || "Untitled Quiz"),
    questions
  };
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Zero Barrier Quiz server is running"
  });
});


// ============================================================
// NORMAL QUIZ
// ============================================================

// Create normal quiz
app.post("/api/quizzes", (req, res) => {
  try {
    const quiz = normalizeQuiz(req.body);

    if (!quiz) {
      return res.status(400).json({
        error: "Invalid quiz data"
      });
    }

    if (!quiz.code) {
      return res.status(400).json({
        error: "Quiz code is required"
      });
    }

    if (!quiz.questions.length) {
      return res.status(400).json({
        error: "Quiz must contain at least one question"
      });
    }

    quizzes.set(quiz.code, quiz);

    if (!quizResults.has(quiz.code)) {
      quizResults.set(quiz.code, []);
    }

    console.log(`Quiz created: ${quiz.code}`);

    res.json({
      success: true,
      quiz
    });
  } catch (error) {
    console.error("Create quiz error:", error);

    res.status(500).json({
      error: "Failed to create quiz"
    });
  }
});


// Get normal quiz
app.get("/api/quizzes/:code", (req, res) => {
  const code = String(req.params.code || "")
    .trim()
    .toUpperCase();

  const quiz = quizzes.get(code);

  if (!quiz) {
    return res.status(404).json({
      error: "Quiz not found"
    });
  }

  res.json(quiz);
});


// Submit normal quiz result
app.post("/api/quizzes/:code/results", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const quiz = quizzes.get(code);

    if (!quiz) {
      return res.status(404).json({
        error: "Quiz not found"
      });
    }

    const name = String(req.body.name || "Student").trim();

    const score = Number(req.body.score);
    const total = Number(req.body.total);

    if (!Number.isFinite(score) || !Number.isFinite(total)) {
      return res.status(400).json({
        error: "Invalid score"
      });
    }

    const percentage =
      total > 0
        ? Math.round((score / total) * 100)
        : 0;

    const result = {
      id: generateToken(),
      name,
      score,
      total,
      percentage,
      submittedAt: Date.now()
    };

    if (!quizResults.has(code)) {
      quizResults.set(code, []);
    }

    const results = quizResults.get(code);

    results.push(result);

    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.submittedAt - b.submittedAt;
    });

    const rank =
      results.findIndex((item) => item.id === result.id) + 1;

    res.json({
      success: true,
      result: {
        ...result,
        rank
      },
      leaderboard: results.map((item, index) => ({
        rank: index + 1,
        name: item.name,
        score: item.score,
        total: item.total,
        percentage: item.percentage
      }))
    });
  } catch (error) {
    console.error("Submit result error:", error);

    res.status(500).json({
      error: "Failed to submit result"
    });
  }
});


// Get normal quiz leaderboard
app.get("/api/quizzes/:code/results", (req, res) => {
  const code = String(req.params.code || "")
    .trim()
    .toUpperCase();

  const results = quizResults.get(code) || [];

  const leaderboard = [...results]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.submittedAt - b.submittedAt;
    })
    .map((item, index) => ({
      rank: index + 1,
      name: item.name,
      score: item.score,
      total: item.total,
      percentage: item.percentage,
      submittedAt: item.submittedAt
    }));

  res.json({
    code,
    participants: leaderboard.length,
    leaderboard
  });
});


// ============================================================
// GROQ AI QUIZ GENERATOR
// ============================================================

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GROQ_API_KEY is not configured on the server."
      });
    }

    const topic = String(req.body.topic || "").trim();

    const requestedCount = Math.max(
      1,
      Math.min(
        100,
        parseInt(req.body.count, 10) || 10
      )
    );

    const difficulty = String(
      req.body.difficulty || "medium"
    );

    if (!topic) {
      return res.status(400).json({
        error: "Topic is required"
      });
    }

    let finalQuestions = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      const prompt = `
Create exactly ${requestedCount} multiple-choice questions.

Topic: ${topic}
Difficulty: ${difficulty}

Return ONLY valid JSON.

Required format:

{
  "questions": [
    {
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "answer": 0
    }
  ]
}

IMPORTANT:
- Create EXACTLY ${requestedCount} questions.
- Every question must have exactly 4 options.
- "answer" must be an integer from 0 to 3.
- Do not use A, B, C, D for answer.
- Do not add explanations.
- Do not add markdown.
- Return JSON only.
`;

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.4,
            messages: [
              {
                role: "system",
                content:
                  "You are a precise quiz generator. Return only valid JSON."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            response_format: {
              type: "json_object"
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Groq API error:",
          response.status,
          errorText
        );

        return res.status(500).json({
          error: "Groq API request failed"
        });
      }

      const data = await response.json();

      const content =
        data?.choices?.[0]?.message?.content;

      if (!content) {
        continue;
      }

      let parsed;

      try {
        parsed = JSON.parse(content);
      } catch (error) {
        console.error("AI JSON parse error:", error);
        continue;
      }

      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
        : [];

      const cleaned = questions
        .map((q) => ({
          question: String(q.question || "").trim(),

          options: Array.isArray(q.options)
            ? q.options
                .slice(0, 4)
                .map((x) => String(x).trim())
            : [],

          answer: Number(q.answer)
        }))
        .filter(
          (q) =>
            q.question &&
            q.options.length === 4 &&
            Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer <= 3
        );

      if (cleaned.length >= requestedCount) {
        finalQuestions = cleaned.slice(
          0,
          requestedCount
        );

        break;
      }

      console.log(
        `AI returned ${cleaned.length}/${requestedCount} questions. Retrying...`
      );
    }

    if (finalQuestions.length !== requestedCount) {
      return res.status(500).json({
        error: `AI could not generate exactly ${requestedCount} valid questions. Please try again.`
      });
    }

    res.json({
      success: true,
      questions: finalQuestions
    });
  } catch (error) {
    console.error("Generate quiz error:", error);

    res.status(500).json({
      error: "Failed to generate quiz"
    });
  }
});


// ============================================================
// LIVE QUIZ HELPERS
// ============================================================

function getLiveSession(code) {
  return liveSessions.get(
    String(code || "").trim().toUpperCase()
  );
}


function finishLiveSession(session) {
  if (session.status === "finished") {
    return;
  }

  session.status = "finished";
  session.finishedAt = Date.now();
  session.deadline = null;

  const totalQuestions =
    session.quiz.questions.length;

  const leaderboard = [];

  for (const participant of session.participants.values()) {
    let score = 0;

    for (let i = 0; i < totalQuestions; i++) {
      const givenAnswer = participant.answers[i];

      if (
        Number.isInteger(givenAnswer) &&
        givenAnswer === session.quiz.questions[i].answer
      ) {
        score++;
      }
    }

    participant.score = score;

    const percentage =
      totalQuestions > 0
        ? Math.round(
            (score / totalQuestions) * 100
          )
        : 0;

    leaderboard.push({
      participantToken: participant.token,
      name: participant.name,
      score,
      total: totalQuestions,
      percentage
    });
  }

  leaderboard.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return (
      (session.participants.get(a.participantToken)
        ?.joinedAt || 0) -
      (session.participants.get(b.participantToken)
        ?.joinedAt || 0)
    );
  });

  leaderboard.forEach((item, index) => {
    item.rank = index + 1;
  });

  session.leaderboard = leaderboard;
}


function advanceLiveSession(session) {
  if (!session) return;

  if (session.status !== "live") {
    return;
  }

  const now = Date.now();

  while (
    session.status === "live" &&
    session.deadline &&
    now >= session.deadline
  ) {
    if (
      session.currentQuestionIndex <
      session.quiz.questions.length - 1
    ) {
      session.currentQuestionIndex++;

      session.questionStartedAt =
        session.deadline;

      session.deadline =
        session.questionStartedAt +
        LIVE_QUESTION_TIME;
    } else {
      finishLiveSession(session);
    }
  }
}


function getPublicQuestion(question, revealAnswer = false) {
  if (!question) {
    return null;
  }

  const result = {
    question: question.question,
    options: question.options
  };

  if (revealAnswer) {
    result.answer = question.answer;
  }

  return result;
}


function getLiveStateForParticipant(
  session,
  participant
) {
  advanceLiveSession(session);

  const totalQuestions =
    session.quiz.questions.length;

  const state = {
    code: session.code,
    title: session.quiz.title,
    status: session.status,
    totalQuestions,
    currentQuestion:
      session.status === "live"
        ? session.currentQuestionIndex
        : null,
    questionNumber:
      session.status === "live"
        ? session.currentQuestionIndex + 1
        : null,
    deadline:
      session.status === "live"
        ? session.deadline
        : null,
    participantCount:
      session.participants.size,
    name: participant ? participant.name : null
  };

  if (session.status === "waiting") {
    state.message =
      "Waiting for the host to start the quiz.";
  }

  if (session.status === "live") {
    const q =
      session.quiz.questions[
        session.currentQuestionIndex
      ];

    state.question = getPublicQuestion(
      q,
      false
    );

    state.myAnswer =
      participant &&
      participant.answers[
        session.currentQuestionIndex
      ] !== undefined
        ? participant.answers[
            session.currentQuestionIndex
          ]
        : null;

    state.hasAnswered =
      state.myAnswer !== null;
  }

  if (session.status === "finished") {
    state.message = "Live quiz finished.";

    state.questions =
      session.quiz.questions.map((q) =>
        getPublicQuestion(q, true)
      );

    state.leaderboard =
      session.leaderboard || [];

    if (participant) {
      const me =
        session.leaderboard?.find(
          (item) =>
            item.participantToken ===
            participant.token
        );

      if (me) {
        state.myResult = {
          rank: me.rank,
          score: me.score,
          total: me.total,
          percentage: me.percentage
        };
      }
    }
  }

  return state;
}


function getLiveHostState(session) {
  advanceLiveSession(session);

  const state = {
    code: session.code,
    title: session.quiz.title,
    status: session.status,

    totalQuestions:
      session.quiz.questions.length,

    currentQuestion:
      session.status === "live"
        ? session.currentQuestionIndex
        : null,

    questionNumber:
      session.status === "live"
        ? session.currentQuestionIndex + 1
        : null,

    deadline:
      session.status === "live"
        ? session.deadline
        : null,

    participantCount:
      session.participants.size,

    participants:
      Array.from(
        session.participants.values()
      ).map((p) => ({
        name: p.name,
        answered:
          session.status === "live"
            ? p.answers[
                session.currentQuestionIndex
              ] !== undefined
            : false,
        score:
          session.status === "finished"
            ? p.score
            : undefined
      }))
  };

  if (session.status === "waiting") {
    state.message =
      "Waiting for students to join.";
  }

  if (session.status === "live") {
    const q =
      session.quiz.questions[
        session.currentQuestionIndex
      ];

    state.question =
      getPublicQuestion(q, false);

    state.answeredCount =
      Array.from(
        session.participants.values()
      ).filter(
        (p) =>
          p.answers[
            session.currentQuestionIndex
          ] !== undefined
      ).length;
  }

  if (session.status === "finished") {
    state.message =
      "Live quiz finished.";

    state.questions =
      session.quiz.questions.map((q) =>
        getPublicQuestion(q, true)
      );

    state.leaderboard =
      session.leaderboard || [];
  }

  return state;
}


// ============================================================
// CREATE LIVE QUIZ SESSION
// ============================================================

app.post("/api/live", (req, res) => {
  try {
    const quizCode = String(
      req.body.quizCode || ""
    )
      .trim()
      .toUpperCase();

    const quiz = quizzes.get(quizCode);

    if (!quiz) {
      return res.status(404).json({
        error:
          "Normal quiz not found. Create the quiz first."
      });
    }

    if (!quiz.questions.length) {
      return res.status(400).json({
        error:
          "This quiz does not contain questions."
      });
    }

    const code = generateLiveCode();
    const hostToken = generateToken();

    const session = {
      code,
      hostToken,
      quiz,

      status: "waiting",

      currentQuestionIndex: 0,

      questionStartedAt: null,
      deadline: null,

      createdAt: Date.now(),
      finishedAt: null,

      participants: new Map(),

      leaderboard: []
    };

    liveSessions.set(code, session);

    console.log(
      `Live quiz created: ${code} for quiz ${quizCode}`
    );

    res.json({
      success: true,

      liveCode: code,

      hostToken,

      title: quiz.title,

      totalQuestions:
        quiz.questions.length
    });
  } catch (error) {
    console.error(
      "Create live session error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to create live quiz"
    });
  }
});


// ============================================================
// STUDENT JOINS LIVE QUIZ
// ============================================================

app.post("/api/live/:code/join", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const session = getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz code not found."
      });
    }

    if (session.status !== "waiting") {
      return res.status(400).json({
        error:
          "This live quiz has already started. New students cannot join."
      });
    }

    const name = String(
      req.body.name || ""
    ).trim();

    if (!name) {
      return res.status(400).json({
        error:
          "Student name is required."
      });
    }

    if (name.length > 60) {
      return res.status(400).json({
        error:
          "Student name is too long."
      });
    }

    const participantToken =
      generateToken();

    const participant = {
      token: participantToken,

      name,

      joinedAt: Date.now(),

      answers: {},

      score: 0
    };

    session.participants.set(
      participantToken,
      participant
    );

    console.log(
      `${name} joined live quiz ${code}`
    );

    res.json({
      success: true,

      participantToken,

      state:
        getLiveStateForParticipant(
          session,
          participant
        )
    });
  } catch (error) {
    console.error(
      "Live join error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to join live quiz"
    });
  }
});


// ============================================================
// GET LIVE STUDENT STATE
// ============================================================

app.get("/api/live/:code/state", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const token = String(
      req.query.token || ""
    );

    const session = getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz not found."
      });
    }

    const participant =
      session.participants.get(token);

    if (!participant) {
      return res.status(403).json({
        error:
          "Invalid participant session."
      });
    }

    res.json(
      getLiveStateForParticipant(
        session,
        participant
      )
    );
  } catch (error) {
    console.error(
      "Live student state error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to get live quiz state"
    });
  }
});


// ============================================================
// GET LIVE HOST STATE
// ============================================================

app.get("/api/live/:code/host-state", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const token = String(
      req.query.token || ""
    );

    const session = getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz not found."
      });
    }

    if (token !== session.hostToken) {
      return res.status(403).json({
        error:
          "Invalid host session."
      });
    }

    res.json(
      getLiveHostState(session)
    );
  } catch (error) {
    console.error(
      "Live host state error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to get host state"
    });
  }
});


// ============================================================
// START LIVE QUIZ
// ============================================================

app.post("/api/live/:code/start", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const hostToken = String(
      req.body.hostToken || req.body.token || ""
    );

    const session = getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz not found."
      });
    }

    if (hostToken !== session.hostToken) {
      return res.status(403).json({
        error:
          "Invalid host session."
      });
    }

    if (session.status !== "waiting") {
      return res.status(400).json({
        error:
          "This live quiz has already started or finished."
      });
    }

    if (session.participants.size === 0) {
      return res.status(400).json({
        error:
          "At least one student must join before starting."
      });
    }

    session.status = "live";

    session.currentQuestionIndex = 0;

    session.questionStartedAt =
      Date.now();

    session.deadline =
      session.questionStartedAt +
      LIVE_QUESTION_TIME;

    console.log(
      `Live quiz started: ${code}`
    );

    res.json({
      success: true,

      state:
        getLiveHostState(session)
    });
  } catch (error) {
    console.error(
      "Start live quiz error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to start live quiz"
    });
  }
});


// ============================================================
// STUDENT SUBMITS LIVE ANSWER
// ============================================================

app.post("/api/live/:code/answer", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const participantToken =
      String(
        req.body.participantToken || ""
      );

    const questionIndex =
      Number(req.body.questionIndex);

    const answer =
      Number(req.body.answer);

    const session =
      getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz not found."
      });
    }

    if (session.status !== "live") {
      return res.status(400).json({
        error:
          "The live quiz is not currently accepting answers."
      });
    }

    const participant =
      session.participants.get(
        participantToken
      );

    if (!participant) {
      return res.status(403).json({
        error:
          "Invalid participant session."
      });
    }

    advanceLiveSession(session);

    if (session.status !== "live") {
      return res.status(400).json({
        error:
          "The quiz has ended."
      });
    }

    if (
      questionIndex !==
      session.currentQuestionIndex
    ) {
      return res.status(400).json({
        error:
          "This question is no longer active."
      });
    }

    if (
      Date.now() >= session.deadline
    ) {
      advanceLiveSession(session);

      return res.status(400).json({
        error:
          "Time is up for this question."
      });
    }

    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 3
    ) {
      return res.status(400).json({
        error:
          "Invalid answer."
      });
    }

    if (
      participant.answers[
        questionIndex
      ] !== undefined
    ) {
      return res.status(400).json({
        error:
          "You already answered this question."
      });
    }

    participant.answers[
      questionIndex
    ] = answer;

    res.json({
      success: true,

      message:
        "Answer submitted successfully."
    });
  } catch (error) {
    console.error(
      "Live answer error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to submit answer"
    });
  }
});


// ============================================================
// HOST ENDS LIVE QUIZ
// ============================================================

app.post("/api/live/:code/end", (req, res) => {
  try {
    const code = String(req.params.code || "")
      .trim()
      .toUpperCase();

    const hostToken = String(
      req.body.hostToken || ""
    );

    const session =
      getLiveSession(code);

    if (!session) {
      return res.status(404).json({
        error:
          "Live quiz not found."
      });
    }

    if (hostToken !== session.hostToken) {
      return res.status(403).json({
        error:
          "Invalid host session."
      });
    }

    if (session.status === "finished") {
      return res.json({
        success: true,

        state:
          getLiveHostState(session)
      });
    }

    finishLiveSession(session);

    console.log(
      `Live quiz ended: ${code}`
    );

    res.json({
      success: true,

      state:
        getLiveHostState(session)
    });
  } catch (error) {
    console.error(
      "End live quiz error:",
      error
    );

    res.status(500).json({
      error:
        "Failed to end live quiz"
    });
  }
});


// ============================================================
// STATIC WEBSITE
// ============================================================

app.use(
  express.static(
    path.join(__dirname)
  )
);


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(
    `Zero Barrier Quiz server running on port ${PORT}`
  );

  console.log(
    `AI model: ${MODEL}`
  );
});
