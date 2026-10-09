let quizzes =
  JSON.parse(
    localStorage.getItem("zbq_quizzes") || "[]"
  );

let currentQuiz = null;

let currentStudent = "";

let createMode = "ai";

let leaderboards =
  JSON.parse(
    localStorage.getItem(
      "zbq_leaderboards"
    ) || "{}"
  );


/* ======================================================
   LOCAL STORAGE
   ====================================================== */

function saveLeaderboards() {
  localStorage.setItem(
    "zbq_leaderboards",
    JSON.stringify(leaderboards)
  );
}


function saveQuizzes() {
  localStorage.setItem(
    "zbq_quizzes",
    JSON.stringify(quizzes)
  );
}


/* ======================================================
   VIEW MANAGEMENT
   ====================================================== */

function showView(id) {

  document
    .querySelectorAll(".view")
    .forEach(v =>
      v.classList.remove("active")
    );

  document
    .getElementById(id)
    .classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function showHome() {
  showView("homeView");
}


function openTeacher() {

  showView("teacherView");

  selectCreateMode("ai");
}


function openStudent() {

  showView("studentView");
}


function openAdmin() {

  showView("adminView");

  renderAdmin();
}


/* ======================================================
   CREATE MODE
   ====================================================== */

function selectCreateMode(mode) {

  createMode = mode;

  document
    .getElementById("aiModeCard")
    .classList.toggle(
      "selected",
      mode === "ai"
    );

  document
    .getElementById("manualModeCard")
    .classList.toggle(
      "selected",
      mode === "manual"
    );

  document
    .getElementById("aiCreator")
    .classList.toggle(
      "hidden",
      mode !== "ai"
    );

  document
    .getElementById("manualCreator")
    .classList.toggle(
      "hidden",
      mode !== "manual"
    );

  if (
    mode === "manual" &&
    !document.querySelector(
      ".question-editor"
    )
  ) {

    addManualQuestion();
  }
}


/* ======================================================
   AI QUIZ GENERATION
   ====================================================== */

async function generateAIQuiz() {

  const topic =
    document
      .getElementById("aiTopic")
      .value
      .trim();

  const count =
    Number(
      document
        .getElementById("aiCount")
        .value
    );

  const difficulty =
    document
      .getElementById("aiDifficulty")
      .value;

  const type =
    document
      .getElementById("aiType")
      .value;

  const status =
    document
      .getElementById("aiStatus");


  if (!topic) {

    status.innerHTML =
      '<div class="status error">' +
      'Please enter a topic.' +
      '</div>';

    return;
  }


  if (
    count < 1 ||
    count > 30
  ) {

    status.innerHTML =
      '<div class="status error">' +
      'Choose between 1 and 30 questions.' +
      '</div>';

    return;
  }


  status.innerHTML =
    '<div class="status">' +
    '🤖 AI is creating your quiz. Please wait...' +
    '</div>';


  try {

    const res =
      await fetch(
        "/api/generate-quiz",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            topic,
            count,
            difficulty,
            type
          })
        }
      );


    const data =
      await res.json();


    if (!res.ok) {

      throw new Error(
        data.error ||
        "AI generation failed"
      );
    }


    const quiz =
      normalizeQuiz(
        data.quiz || data
      );


    await createQuiz(
      quiz,
      "AI Generated"
    );


    status.innerHTML =
      '<div class="status success">' +
      'Quiz generated successfully.' +
      '</div>';


  } catch (err) {

    status.innerHTML =
      '<div class="status error">' +
      '❌ ' +
      escapeHtml(
        err.message
      ) +
      '<br><small>Please try again.</small>' +
      '</div>';
  }
}


/* ======================================================
   NORMALIZE QUIZ
   ====================================================== */

function normalizeQuiz(q) {

  const questions =
    (q.questions || [])
      .map(x => ({

        question:
          String(
            x.question ||
            "Question"
          ),

        options:
          Array.isArray(
            x.options
          )
            ? x.options.map(
                String
              )
            : [
                "True",
                "False"
              ],

        answer:
          Number.isInteger(
            x.answer
          )
            ? x.answer
            : 0
      }));


  return {

    title:
      String(
        q.title ||
        "AI Quiz"
      ),

    questions
  };
}


/* ======================================================
   CREATE QUIZ CODE
   ====================================================== */

function makeCode() {

  let code;

  do {

    code =
      "ZBQ" +
      Math.floor(
        1000 +
        Math.random() * 9000
      );

  } while (
    quizzes.some(
      q =>
        q.code === code
    )
  );

  return code;
}


/* ======================================================
   CREATE + SAVE QUIZ
   ====================================================== */

async function createQuiz(
  quiz,
  method
) {

  quiz.code =
    makeCode();

  quiz.method =
    method;

  quiz.createdAt =
    new Date().toISOString();


  /* Save locally */
  quizzes.push(quiz);

  saveQuizzes();


  /* Upload to server */

  try {

    const response =
      await fetch(
        "/api/quizzes",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(quiz)
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        "Server quiz save failed:",
        data
      );

      throw new Error(
        data.error ||
        "Quiz could not be shared."
      );
    }


    console.log(
      "Quiz successfully stored on server:",
      quiz.code
    );


  } catch (error) {

    console.error(
      "Shared quiz error:",
      error
    );


    alert(
      "Quiz was created, but it could not be uploaded to the server. Students on other devices may not be able to join."
    );
  }


  showCreatedQuiz(quiz);
}


/* ======================================================
   SHOW CREATED QUIZ
   ====================================================== */

function showCreatedQuiz(quiz) {

  const panel =
    document.getElementById(
      "createdQuizPanel"
    );


  panel.classList.remove(
    "hidden"
  );


  panel.innerHTML =

    '<h2>🎉 Quiz Created Successfully!</h2>' +

    '<div class="code-box">' +

      '<div>Your Quiz Code</div>' +

      '<div class="join-code">' +
        quiz.code +
      '</div>' +

      '<div>' +
        'Share this code with your students.' +
      '</div>' +

    '</div>' +

    '<h3>' +
      escapeHtml(
        quiz.title
      ) +
    '</h3>' +

    '<p>' +
      quiz.questions.length +
      ' questions • ' +
      escapeHtml(
        quiz.method
      ) +
    '</p>' +

    '<button class="secondary-btn" onclick="openStudent()">' +
      'Go to Student Join' +
    '</button>' +

    '<button class="secondary-btn" onclick="showLeaderboard(\'' +
      quiz.code +
    '\')">' +
      '🏆 View Leaderboard' +
    '</button>';


  panel.scrollIntoView({
    behavior: "smooth"
  });
}


/* ======================================================
   MANUAL QUESTION
   ====================================================== */

function addManualQuestion() {

  const box =
    document.getElementById(
      "manualQuestions"
    );


  const n =
    box.querySelectorAll(
      ".question-editor"
    ).length + 1;


  const el =
    document.createElement(
      "div"
    );


  el.className =
    "question-editor";


  el.innerHTML =

    '<h3>Question ' +
      n +
    '</h3>' +

    '<input class="mq-text" placeholder="Enter your question">' +

    '<div class="option-row">' +
      '<input class="mq-option" placeholder="Option A">' +
      '<input type="radio" name="correct' +
        n +
      '" value="0" checked> Correct' +
    '</div>' +

    '<div class="option-row">' +
      '<input class="mq-option" placeholder="Option B">' +
      '<input type="radio" name="correct' +
        n +
      '" value="1"> Correct' +
    '</div>' +

    '<div class="option-row">' +
      '<input class="mq-option" placeholder="Option C">' +
      '<input type="radio" name="correct' +
        n +
      '" value="2"> Correct' +
    '</div>' +

    '<div class="option-row">' +
      '<input class="mq-option" placeholder="Option D">' +
      '<input type="radio" name="correct' +
        n +
      '" value="3"> Correct' +
    '</div>';


  box.appendChild(el);
}


/* ======================================================
   SAVE MANUAL QUIZ
   ====================================================== */

async function saveManualQuiz() {

  const title =
    document
      .getElementById(
        "manualTitle"
      )
      .value
      .trim() ||
    "My Quiz";


  const editors = [
    ...document.querySelectorAll(
      ".question-editor"
    )
  ];


  const questions = [];


  for (
    const e of editors
  ) {

    const text =
      e.querySelector(
        ".mq-text"
      ).value.trim();


    const opts = [
      ...e.querySelectorAll(
        ".mq-option"
      )
    ].map(
      x =>
        x.value.trim()
    );


    const correct =
      Number(
        e.querySelector(
          "input[type=radio]:checked"
        ).value
      );


    if (
      !text ||
      opts.some(
        x => !x
      )
    ) {

      document
        .getElementById(
          "manualStatus"
        )
        .innerHTML =
          '<div class="status error">' +
          'Please complete every question and option.' +
          '</div>';

      return;
    }


    questions.push({

      question:
        text,

      options:
        opts,

      answer:
        correct
    });
  }


  if (
    !questions.length
  ) {
    return;
  }


  await createQuiz(

    {
      title,
      questions
    },

    "Teacher Created"
  );


  document
    .getElementById(
      "manualStatus"
    )
    .innerHTML =
      '<div class="status success">' +
      'Your quiz has been saved.' +
      '</div>';
}


/* ======================================================
   STUDENT JOIN
   ====================================================== */

async function joinQuiz() {

  const name =
    document
      .getElementById(
        "studentName"
      )
      .value
      .trim();


  const code =
    document
      .getElementById(
        "studentCode"
      )
      .value
      .trim()
      .toUpperCase();


  const msg =
    document.getElementById(
      "studentMessage"
    );


  if (
    !name ||
    !code
  ) {

    msg.innerHTML =
      '<div class="status error">' +
      'Please enter your name and quiz code.' +
      '</div>';

    return;
  }


  msg.innerHTML =
    '<div class="status">' +
    '🔍 Finding your quiz...' +
    '</div>';


  try {

    const response =
      await fetch(
        "/api/quizzes/" +
        encodeURIComponent(
          code
        )
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Quiz not found."
      );
    }


    const quiz =
      data.quiz;


    if (
      !quiz ||
      !Array.isArray(
        quiz.questions
      )
    ) {

      throw new Error(
        "Invalid quiz data received."
      );
    }


    currentQuiz =
      quiz;

    currentStudent =
      name;


    renderQuiz();


  } catch (error) {

    console.error(
      "Join Quiz Error:",
      error
    );


    msg.innerHTML =
      '<div class="status error">' +
      '❌ ' +
      escapeHtml(
        error.message ||
        "Quiz not found."
      ) +
      '</div>';
  }
}


/* ======================================================
   RENDER QUIZ
   ====================================================== */

function renderQuiz() {

  showView(
    "quizView"
  );


  document
    .getElementById(
      "quizTitle"
    )
    .textContent =
      currentQuiz.title;


  document
    .getElementById(
      "quizStudent"
    )
    .textContent =
      "Student: " +
      currentStudent +
      " • Code: " +
      currentQuiz.code;


  document
    .getElementById(
      "quizResult"
    )
    .innerHTML =
      "";


  document
    .getElementById(
      "quizQuestions"
    )
    .innerHTML =

      currentQuiz.questions
        .map(
          (q, i) =>

            '<div class="question-card">' +

              '<h3>' +
                (i + 1) +
                ". " +
                escapeHtml(
                  q.question
                ) +
              '</h3>' +

              q.options
                .map(
                  (o, j) =>

                    '<label class="quiz-option">' +

                      '<input type="radio" name="q' +
                        i +
                      '" value="' +
                        j +
                      '">' +

                      escapeHtml(o) +

                    '</label>'
                )
                .join("") +

            '</div>'
        )
        .join("");
}


/* ======================================================
   SUBMIT QUIZ
   ====================================================== */

async function submitQuiz() {

  if (!currentQuiz) {

    alert(
      "No quiz is currently open."
    );

    return;
  }


  let score = 0;

  let answered = 0;


  currentQuiz.questions.forEach(
    (q, i) => {

      const chosen =
        document.querySelector(
          'input[name="q' +
          i +
          '"]:checked'
        );


      if (chosen) {

        answered++;


        if (
          Number(
            chosen.value
          ) ===
          q.answer
        ) {

          score++;
        }
      }
    }
  );


  const total =
    currentQuiz.questions.length;


  const pct =
    total > 0
      ? Math.round(
          (score / total) *
          100
        )
      : 0;


  const resultBox =
    document.getElementById(
      "quizResult"
    );


  resultBox.innerHTML =
    '<div class="status">' +
    '⏳ Saving your result...' +
    '</div>';


  try {

    /* Send result to shared server */

    const response =
      await fetch(
        "/api/quizzes/" +
        encodeURIComponent(
          currentQuiz.code
        ) +
        "/results",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              name:
                currentStudent,

              score:
                score,

              total:
                total,

              percentage:
                pct
            })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not save result."
      );
    }


    /* Save server leaderboard locally
       only as a cache */

    leaderboards[
      currentQuiz.code
    ] =
      data.leaderboard || [];

    saveLeaderboards();


    const rank =
      data.result?.rank ||
      0;


    resultBox.innerHTML =

      '<div class="result-box">' +

        '<h2>🎉 Quiz Completed</h2>' +

        '<p><strong>' +
          escapeHtml(
            currentStudent
          ) +
        '</strong>, your score is ' +

        '<strong>' +
          score +
          '/' +
          total +
        '</strong> (' +
          pct +
        '%).</p>' +

        '<p>You answered ' +
          answered +
          ' of ' +
          total +
          ' questions.</p>' +

        '<div class="student-rank">' +
          '🏆 Your Rank: <strong>#' +
          rank +
          '</strong>' +
        '</div>' +

        '<button class="secondary-btn leaderboard-btn" onclick="showLeaderboard(\'' +
          currentQuiz.code +
        '\')">' +
          '🏆 View Leaderboard' +
        '</button>' +

      '</div>';


    /* Disable questions */

    document
      .querySelectorAll(
        "#quizQuestions input"
      )
      .forEach(
        input => {
          input.disabled = true;
        }
      );


    window.scrollTo({

      top:
        document.body
          .scrollHeight,

      behavior:
        "smooth"
    });


  } catch (error) {

    console.error(
      "Submit result error:",
      error
    );


    resultBox.innerHTML =
      '<div class="status error">' +
      '❌ ' +
      escapeHtml(
        error.message ||
        "Could not save your result."
      ) +
      '<br>' +
      '<small>Please try submitting again.</small>' +
      '</div>';
  }
}


/* ======================================================
   GET SHARED LEADERBOARD
   ====================================================== */

async function getSharedLeaderboard(
  code
) {

  const response =
    await fetch(
      "/api/quizzes/" +
      encodeURIComponent(
        code
      ) +
      "/results"
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.error ||
      "Could not load leaderboard."
    );
  }


  return data;
}


/* ======================================================
   SHOW LEADERBOARD
   ====================================================== */

async function showLeaderboard(
  code
) {

  try {

    const data =
      await getSharedLeaderboard(
        code
      );


    const leaderboard =
      data.leaderboard || [];


    /* Remove old modal */

    const old =
      document.getElementById(
        "sharedLeaderboardModal"
      );

    if (old) {
      old.remove();
    }


    const modal =
      document.createElement(
        "div"
      );


    modal.id =
      "sharedLeaderboardModal";


    modal.style.position =
      "fixed";

    modal.style.inset =
      "0";

    modal.style.background =
      "rgba(0,0,0,0.65)";

    modal.style.zIndex =
      "99999";

    modal.style.display =
      "flex";

    modal.style.alignItems =
      "center";

    modal.style.justifyContent =
      "center";

    modal.style.padding =
      "20px";


    const box =
      document.createElement(
        "div"
      );


    box.style.background =
      "#ffffff";

    box.style.width =
      "min(700px, 95vw)";

    box.style.maxHeight =
      "85vh";

    box.style.overflowY =
      "auto";

    box.style.borderRadius =
      "18px";

    box.style.padding =
      "25px";

    box.style.boxShadow =
      "0 20px 60px rgba(0,0,0,0.3)";


    let rows = "";


    if (
      leaderboard.length === 0
    ) {

      rows =
        '<tr>' +
          '<td colspan="4" style="text-align:center;padding:20px;">' +
            'No students have submitted yet.' +
          '</td>' +
        '</tr>';

    } else {

      rows =
        leaderboard
          .map(
            item =>

              '<tr>' +

                '<td style="padding:10px;text-align:center;">' +
                  '#' +
                  item.rank +
                '</td>' +

                '<td style="padding:10px;">' +
                  escapeHtml(
                    item.name
                  ) +
                '</td>' +

                '<td style="padding:10px;text-align:center;">' +
                  item.score +
                  '/' +
                  item.total +
                '</td>' +

                '<td style="padding:10px;text-align:center;">' +
                  item.percentage +
                  '%' +
                '</td>' +

              '</tr>'
          )
          .join("");
    }


    box.innerHTML =

      '<div style="display:flex;justify-content:space-between;align-items:center;gap:15px;">' +

        '<div>' +

          '<h2 style="margin:0;">🏆 Leaderboard</h2>' +

          '<p style="margin:5px 0;color:#666;">' +
            'Quiz Code: ' +
            escapeHtml(code) +
          '</p>' +

        '</div>' +

        '<button id="closeLeaderboard" class="secondary-btn">' +
          '✕ Close' +
        '</button>' +

      '</div>' +

      '<p style="font-weight:600;">' +
        '👥 Participants: ' +
        data.participants +
      '</p>' +

      '<div style="overflow-x:auto;">' +

        '<table style="width:100%;border-collapse:collapse;">' +

          '<thead>' +

            '<tr style="background:#f2f6ff;">' +

              '<th style="padding:10px;">Rank</th>' +

              '<th style="padding:10px;text-align:left;">Student</th>' +

              '<th style="padding:10px;">Score</th>' +

              '<th style="padding:10px;">Percentage</th>' +

            '</tr>' +

          '</thead>' +

          '<tbody>' +
            rows +
          '</tbody>' +

        '</table>' +

      '</div>';


    modal.appendChild(
      box
    );


    document.body.appendChild(
      modal
    );


    document
      .getElementById(
        "closeLeaderboard"
      )
      .onclick =
        () => modal.remove();


    modal.onclick =
      event => {

        if (
          event.target ===
          modal
        ) {

          modal.remove();
        }
      };


  } catch (error) {

    console.error(
      "Leaderboard error:",
      error
    );


    alert(
      "❌ " +
      (
        error.message ||
        "Could not load leaderboard."
      )
    );
  }
}


/* ======================================================
   ADMIN
   ====================================================== */

async function renderAdmin() {

  const list =
    document.getElementById(
      "adminList"
    );


  if (!quizzes.length) {

    list.innerHTML =
      "<p class='muted'>" +
      "No quizzes created on this browser yet." +
      "</p>";

    return;
  }


  list.innerHTML =
    "<p class='muted'>⏳ Loading shared quiz results...</p>";


  const cards =
    await Promise.all(

      quizzes.map(
        async q => {

          let participants = 0;

          try {

            const data =
              await getSharedLeaderboard(
                q.code
              );

            participants =
              data.participants || 0;


          } catch (error) {

            console.error(
              "Could not load results for",
              q.code,
              error
            );


            /* Fallback to local cache */

            participants =
              (
                leaderboards[
                  q.code
                ] || []
              ).length;
          }


          return `

            <div class="admin-item">

              <div>

                <strong>
                  ${escapeHtml(
                    q.title
                  )}
                </strong>

                <br>

                <span class="muted">

                  ${q.questions.length}
                  questions •

                  ${escapeHtml(
                    q.method ||
                    "Quiz"
                  )}

                  •

                  ${participants}
                  student(s)

                </span>

              </div>


              <div>

                <div class="small-code">
                  ${q.code}
                </div>

                <button
                  class="secondary-btn"
                  onclick="showLeaderboard('${q.code}')">

                  🏆 Leaderboard

                </button>

              </div>

            </div>

          `;
        }
      )
    );


  list.innerHTML =
    cards.join("");
}


/* ======================================================
   CLEAR LOCAL QUIZZES
   ====================================================== */

function clearAllQuizzes() {

  if (
    confirm(
      "Delete all quizzes and leaderboard data stored on this browser?"
    )
  ) {

    quizzes = [];

    leaderboards = {};


    saveQuizzes();

    saveLeaderboards();


    renderAdmin();
  }
}


/* ======================================================
   ESCAPE HTML
   ====================================================== */

function escapeHtml(s) {

  return String(s).replace(
    /[&<>"']/g,

    m => ({
      "&":
        "&amp;",

      "<":
        "&lt;",

      ">":
        "&gt;",

      '"':
        "&quot;",

      "'":
        "&#039;"

    }[m])
  );
}
