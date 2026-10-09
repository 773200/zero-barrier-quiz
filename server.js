const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

app.use(express.json());

/* ======================================================
   SHARED QUIZ STORAGE
   ====================================================== */

const quizzes = new Map();

/* ======================================================
   SHARED QUIZ RESULTS / LEADERBOARD
   ====================================================== */

const quizResults = new Map();

/* ======================================================
   CREATE QUIZ
   ====================================================== */

app.post("/api/quizzes", (req, res) => {
  try {
    const quiz = req.body;

    if (!quiz || !quiz.code) {
      return res.status(400).json({
        error: "Invalid quiz data."
      });
    }

    quizzes.set(quiz.code, quiz);

    // Create empty leaderboard for this quiz
    if (!quizResults.has(quiz.code)) {
      quizResults.set(quiz.code, []);
    }

    console.log("Quiz stored:", quiz.code);

    res.json({
      success: true,
      quiz
    });

  } catch (error) {
    console.error("Create quiz error:", error);

    res.status(500).json({
      error: "Could not save quiz."
    });
  }
});

/* ======================================================
   GET QUIZ BY CODE
   ====================================================== */

app.get("/api/quizzes/:code", (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const quiz = quizzes.get(code);

    if (!quiz) {
      return res.status(404).json({
        error: "Quiz not found."
      });
    }

    res.json({
      success: true,
      quiz
    });

  } catch (error) {
    console.error("Get quiz error:", error);

    res.status(500).json({
      error: "Could not load quiz."
    });
  }
});

/* ======================================================
   SUBMIT QUIZ RESULT
   ====================================================== */

app.post("/api/quizzes/:code/results", (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const quiz = quizzes.get(code);

    if (!quiz) {
      return res.status(404).json({
        error: "Quiz not found."
      });
    }

    const {
      name,
      score,
      total,
      percentage
    } = req.body;

    if (
      !name ||
      typeof score !== "number" ||
      typeof total !== "number"
    ) {
      return res.status(400).json({
        error: "Invalid result data."
      });
    }

    if (!quizResults.has(code)) {
      quizResults.set(code, []);
    }

    const results = quizResults.get(code);

    const result = {
      id:
        Date.now().toString() +
        Math.random().toString(36).substring(2),

      name: String(name).trim(),

      score: Number(score),

      total: Number(total),

      percentage:
        typeof percentage === "number"
          ? Number(percentage)
          : Math.round((score / total) * 100),

      submittedAt: new Date().toISOString()
    };

    results.push(result);

    /* Sort:
       1. Highest score first
       2. Earlier submission first if scores are equal
    */

    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (
        new Date(a.submittedAt) -
        new Date(b.submittedAt)
      );
    });

    const rankedLeaderboard = results.map(
      (item, index) => ({
        rank: index + 1,
        ...item
      })
    );

    const studentRank =
      rankedLeaderboard.find(
        item => item.id === result.id
      );

    console.log(
      `Result submitted: ${result.name} - ${code} - ${result.score}/${result.total}`
    );

    res.json({
      success: true,

      result: studentRank,

      participants:
        rankedLeaderboard.length,

      leaderboard:
        rankedLeaderboard
    });

  } catch (error) {
    console.error("Submit result error:", error);

    res.status(500).json({
      error: "Could not save quiz result."
    });
  }
});

/* ======================================================
   GET QUIZ LEADERBOARD
   ====================================================== */

app.get("/api/quizzes/:code/results", (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const quiz = quizzes.get(code);

    if (!quiz) {
      return res.status(404).json({
        error: "Quiz not found."
      });
    }

    const results =
      quizResults.get(code) || [];

    const rankedLeaderboard =
      results.map((item, index) => ({
        rank: index + 1,
        ...item
      }));

    res.json({
      success: true,

      participants:
        rankedLeaderboard.length,

      leaderboard:
        rankedLeaderboard
    });

  } catch (error) {
    console.error(
      "Get leaderboard error:",
      error
    );

    res.status(500).json({
      error: "Could not load leaderboard."
    });
  }
});

/* ======================================================
   AI QUIZ GENERATION
   ====================================================== */

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const {
      topic,
      count,
      difficulty,
      type
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        error: "Topic is required."
      });
    }

    const questionCount =
      Number(count);

    if (
      !questionCount ||
      questionCount < 1 ||
      questionCount > 30
    ) {
      return res.status(400).json({
        error:
          "Question count must be between 1 and 30."
      });
    }

    const apiKey =
      process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error:
          "GROQ_API_KEY is not configured."
      });
    }

    let finalQuiz = null;

    /* Try up to 3 times to get the
       exact requested number of questions.
    */

    for (let attempt = 1; attempt <= 3; attempt++) {

      const prompt = `
Create a professional multiple-choice quiz.

Topic: ${topic}

Difficulty: ${difficulty}

Question type: ${type}

IMPORTANT:
Generate EXACTLY ${questionCount} questions.

Do NOT generate fewer.
Do NOT generate more.

Return ONLY valid JSON.

Required format:

{
  "title": "Quiz title",
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

The "answer" must be the correct option index:
0 = Option A
1 = Option B
2 = Option C
3 = Option D
`;

      const response =
        await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${apiKey}`
            },

            body: JSON.stringify({
              model: MODEL,

              messages: [
                {
                  role: "system",
                  content:
                    "You create accurate educational quizzes and return valid JSON only."
                },

                {
                  role: "user",
                  content: prompt
                }
              ],

              temperature: 0.7,

              max_tokens: 12000,

              response_format: {
                type: "json_object"
              }
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(
          "Groq error:",
          data
        );

        throw new Error(
          data.error?.message ||
          "Groq API request failed."
        );
      }

      let content =
        data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(
          "AI returned empty response."
        );
      }

      let quiz;

      try {
        quiz =
          typeof content === "string"
            ? JSON.parse(content)
            : content;
      } catch (error) {

        console.error(
          "JSON parse error:",
          content
        );

        continue;
      }

      if (
        quiz &&
        Array.isArray(
          quiz.questions
        ) &&
        quiz.questions.length ===
          questionCount
      ) {
        finalQuiz = quiz;
        break;
      }

      console.log(
        `Attempt ${attempt}: AI returned ${
          quiz?.questions?.length || 0
        } questions instead of ${questionCount}.`
      );
    }

    if (!finalQuiz) {
      return res.status(500).json({
        error:
          `AI could not generate exactly ${questionCount} questions. Please try again.`
      });
    }

    res.json({
      success: true,
      quiz: finalQuiz
    });

  } catch (error) {

    console.error(
      "AI generation error:",
      error
    );

    res.status(500).json({
      error:
        error.message ||
        "AI generation failed."
    });
  }
});

/* ======================================================
   SERVE WEBSITE
   ====================================================== */

app.use(
  express.static(__dirname)
);

/* ======================================================
   START SERVER
   ====================================================== */

app.listen(PORT, () => {
  console.log(
    `Zero Barrier Quiz server running on port ${PORT}`
  );
});
