const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-20b";

app.use(express.json());

app.use(express.static(__dirname));

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic, count, difficulty, type } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "Groq API key is missing."
      });
    }

    if (!topic) {
      return res.status(400).json({
        error: "Topic is required."
      });
    }

    const questionCount = Number(count) || 5;

    const prompt = `
Create a quiz for school or college students.

Topic: ${topic}
Number of questions: ${questionCount}
Difficulty: ${difficulty || "medium"}
Question type: ${type || "multiple choice"}

Return ONLY valid JSON.

Use exactly this format:

{
  "title": "Quiz title",
  "questions": [
    {
      "question": "Question text",
      "options": [
        "Option 1",
        "Option 2",
        "Option 3",
        "Option 4"
      ],
      "answer": "Correct option"
    }
  ]
}

Important rules:

1. Create exactly ${questionCount} questions.
2. Every question must have 4 options.
3. The answer must exactly match one of the options.
4. Do not include markdown.
5. Do not include explanations outside the JSON.
`;

    let quiz = null;

    // Try up to 3 times to get exactly the requested number
    for (let attempt = 1; attempt <= 3; attempt++) {

      console.log(
        `Generating quiz: attempt ${attempt}/3 for ${questionCount} questions`
      );

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            Authorization:
              `Bearer ${process.env.GROQ_API_KEY}`
          },

          body: JSON.stringify({
            model: MODEL,

            messages: [
              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.2,

            response_format: {
              type: "json_object"
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Groq API Error:", data);

        return res.status(response.status).json({
          error:
            data?.error?.message ||
            "Groq API request failed."
        });
      }

      const content =
        data?.choices?.[0]?.message?.content;

      if (!content) {
        console.log("Groq returned an empty response.");
        continue;
      }

      try {
        quiz = JSON.parse(content);
      } catch (error) {
        console.error("JSON Parse Error:", content);
        quiz = null;
        continue;
      }

      if (
        quiz &&
        Array.isArray(quiz.questions) &&
        quiz.questions.length === questionCount
      ) {
        console.log(
          `Success: Exactly ${questionCount} questions generated.`
        );

        break;
      }

      console.log(
        `Attempt ${attempt}: AI returned ${
          quiz?.questions?.length || 0
        } questions instead of ${questionCount}. Retrying...`
      );

      quiz = null;
    }

    // If AI still did not return the exact number
    if (
      !quiz ||
      !Array.isArray(quiz.questions) ||
      quiz.questions.length !== questionCount
    ) {
      return res.status(500).json({
        error:
          `AI could not generate exactly ${questionCount} questions. Please try again.`
      });
    }

    // Send the quiz only when the exact number is available
    res.json({
      quiz
    });

  } catch (error) {
    console.error("Server Error:", error);

    res.status(500).json({
      error: "Something went wrong on the server."
    });
  }
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.listen(PORT, () => {
  console.log(
    `Zero Barrier Quiz running at http://localhost:${PORT}`
  );
});
