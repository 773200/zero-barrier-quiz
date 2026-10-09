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
/* =========================================================
   🔴 ZERO BARRIER QUIZ - LIVE QUIZ SYSTEM
   Paste this entire section at the VERY END of script.js
   ========================================================= */

let liveHostSession = null;
let liveStudentSession = null;

let liveHostTimer = null;
let liveStudentTimer = null;


/* =========================================================
   LIVE QUIZ - HOST
   ========================================================= */

async function createLiveQuiz(quizCode) {

  try {

    const response = await fetch("/api/live", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        quizCode: quizCode
      })
    });


    const data = await response.json();


    if (!response.ok) {

      throw new Error(
        data.error || "Could not create Live Quiz."
      );

    }


    liveHostSession = {

      liveCode: data.liveCode,

      hostToken: data.hostToken,

      quizCode: quizCode

    };


    localStorage.setItem(
      "zbq_live_host",
      JSON.stringify(liveHostSession)
    );


    showLiveHostPanel();


  } catch (error) {

    console.error(
      "Live Quiz creation error:",
      error
    );


    alert(
      "❌ " +
      (error.message || "Could not create Live Quiz.")
    );

  }

}


/* =========================================================
   LIVE HOST PANEL
   ========================================================= */

function showLiveHostPanel() {

  const panel =
    document.getElementById("createdQuizPanel");


  if (!panel) return;


  panel.innerHTML = `

    <div class="code-box">

      <h2>🔴 Live Quiz Ready</h2>

      <p>Share this Live Quiz Code with your students:</p>

      <div class="join-code"
           id="liveHostCode">

        ${escapeHtml(
          liveHostSession.liveCode
        )}

      </div>

      <p>
        Students should enter this code from
        the Student section.
      </p>

    </div>


    <div id="liveHostPanel"
         style="
           margin-top:20px;
           padding:20px;
           border-radius:18px;
           background:#f5f8ff;
         ">

      <h2>👥 Waiting for Students...</h2>

      <p id="liveHostStatus">
        Connecting...
      </p>

      <div id="liveHostParticipants"
           style="margin-top:15px;">
      </div>

      <button
        id="liveStartButton"
        class="primary-btn"
        onclick="startLiveQuiz()"
        disabled>

        ▶️ Start Live Quiz

      </button>

    </div>

  `;


  panel.scrollIntoView({
    behavior: "smooth"
  });


  pollLiveHost();

}


/* =========================================================
   LIVE HOST POLLING
   ========================================================= */

async function pollLiveHost() {

  if (!liveHostSession) return;


  try {

    const response =
      await fetch(
        "/api/live/" +
        encodeURIComponent(
          liveHostSession.liveCode
        ) +
        "/host-state?token=" +
        encodeURIComponent(
          liveHostSession.hostToken
        )
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not read Live Quiz."
      );

    }


    renderLiveHostState(data);


  } catch (error) {

    console.error(
      "Live host polling error:",
      error
    );

  }


  clearTimeout(liveHostTimer);


  liveHostTimer =
    setTimeout(
      pollLiveHost,
      1000
    );

}


/* =========================================================
   RENDER HOST STATE
   ========================================================= */

function renderLiveHostState(data) {

  const status =
    document.getElementById(
      "liveHostStatus"
    );


  const participantsBox =
    document.getElementById(
      "liveHostParticipants"
    );


  const startButton =
    document.getElementById(
      "liveStartButton"
    );


  if (!status) return;


  const participants =
    data.participants || [];


  const phase =
    data.phase || "waiting";


  if (phase === "waiting") {

    status.innerHTML =
      `
      <strong>
        👥 ${participants.length}
        student(s) joined
      </strong>
      <br>
      Waiting for students...
      `;


    if (startButton) {

      startButton.disabled =
        participants.length === 0;

    }


    if (participants.length === 0) {

      participantsBox.innerHTML =
        `
        <div class="status">
          No students have joined yet.
        </div>
        `;

    } else {

      participantsBox.innerHTML =
        `
        <div
          style="
            display:grid;
            gap:10px;
          ">

          ${
            participants
              .map(
                (student, index) => `

                  <div
                    style="
                      padding:12px;
                      background:white;
                      border-radius:12px;
                      border:1px solid #e5e7eb;
                    ">

                    👤
                    <strong>
                      ${escapeHtml(
                        student.name ||
                        "Student " +
                        (index + 1)
                      )}
                    </strong>

                    <span
                      style="
                        float:right;
                        color:#666;
                      ">

                      ${
                        student.answered
                          ? "✅ Answered"
                          : "⏳ Waiting"
                      }

                    </span>

                  </div>

                `
              )
              .join("")
          }

        </div>
        `;

    }

    return;
  }


  if (phase === "active") {

    if (startButton) {

      startButton.style.display =
        "none";

    }


    renderLiveHostQuestion(
      data
    );


    return;
  }


  if (
    phase === "finished" ||
    phase === "ended"
  ) {

    if (startButton) {

      startButton.style.display =
        "none";

    }


    renderLiveHostFinal(
      data
    );

  }

}


/* =========================================================
   HOST QUESTION
   ========================================================= */

function renderLiveHostQuestion(data) {

  const panel =
    document.getElementById(
      "liveHostPanel"
    );


  if (!panel) return;


  const question =
    data.question || null;


  const questionNumber =
    Number(
      data.currentQuestionIndex || 0
    ) + 1;


  const total =
    Number(
      data.totalQuestions ||
      0
    );


  const answered =
    Number(
      data.answeredCount ||
      0
    );


  if (!question) {

    panel.innerHTML = `

      <h2>🔴 Live Quiz</h2>

      <div class="status">
        Loading question...
      </div>

    `;

    return;
  }


  panel.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:space-between;
        gap:15px;
        flex-wrap:wrap;
        align-items:center;
      ">

      <h2>
        🔴 Question
        ${questionNumber}/${total}
      </h2>

      <div
        id="liveHostTimer"
        style="
          font-size:28px;
          font-weight:800;
        ">

        60

      </div>

    </div>


    <div
      style="
        margin-top:20px;
        padding:20px;
        background:white;
        border-radius:16px;
      ">

      <h3>
        ${escapeHtml(
          question.question || ""
        )}
      </h3>


      <div
        style="
          display:grid;
          gap:10px;
          margin-top:15px;
        ">

        ${
          (question.options || [])
            .map(
              (option, index) => `

                <div
                  style="
                    padding:12px;
                    border:1px solid #ddd;
                    border-radius:10px;
                  ">

                  ${
                    String.fromCharCode(
                      65 + index
                    )
                  }.
                  ${escapeHtml(option)}

                </div>

              `
            )
            .join("")
        }

      </div>

    </div>


    <div
      style="
        margin-top:15px;
        padding:15px;
        border-radius:12px;
        background:#eef5ff;
      ">

      👥 Students answered:
      <strong>
        ${answered}
      </strong>
      /
      <strong>
        ${
          (data.participants || []).length
        }
      </strong>

    </div>

  `;


  updateLiveCountdown(
    "liveHostTimer",
    data.deadline
  );

}


/* =========================================================
   START LIVE QUIZ
   ========================================================= */

async function startLiveQuiz() {

  if (!liveHostSession) {

    alert(
      "Live Quiz session not found."
    );

    return;
  }


  try {

    const response =
      await fetch(
        "/api/live/" +
        encodeURIComponent(
          liveHostSession.liveCode
        ) +
        "/start",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            token:
              liveHostSession.hostToken

          })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not start Live Quiz."
      );

    }


    renderLiveHostState(
      data
    );


  } catch (error) {

    alert(
      "❌ " +
      (
        error.message ||
        "Could not start Live Quiz."
      )
    );

  }

}


/* =========================================================
   HOST FINAL
   ========================================================= */

function renderLiveHostFinal(data) {

  const panel =
    document.getElementById(
      "liveHostPanel"
    );


  if (!panel) return;


  const leaderboard =
    data.leaderboard || [];


  panel.innerHTML = `

    <div class="result-box">

      <h2>
        🏆 Live Quiz Finished!
      </h2>

      <p>
        Final leaderboard
      </p>


      <div
        style="
          overflow-x:auto;
          margin-top:15px;
        ">

        <table
          style="
            width:100%;
            border-collapse:collapse;
          ">

          <thead>

            <tr
              style="
                background:#f2f6ff;
              ">

              <th style="padding:10px;">
                Rank
              </th>

              <th style="padding:10px;">
                Student
              </th>

              <th style="padding:10px;">
                Score
              </th>

              <th style="padding:10px;">
                Percentage
              </th>

            </tr>

          </thead>

          <tbody>

            ${
              leaderboard.length
                ? leaderboard
                    .map(
                      item => `

                        <tr>

                          <td
                            style="
                              padding:10px;
                              text-align:center;
                            ">

                            #${item.rank}

                          </td>

                          <td
                            style="
                              padding:10px;
                            ">

                            ${escapeHtml(
                              item.name || ""
                            )}

                          </td>

                          <td
                            style="
                              padding:10px;
                              text-align:center;
                            ">

                            ${item.score}/${item.total}

                          </td>

                          <td
                            style="
                              padding:10px;
                              text-align:center;
                            ">

                            ${item.percentage}%

                          </td>

                        </tr>

                      `
                    )
                    .join("")
                : `
                    <tr>

                      <td
                        colspan="4"
                        style="
                          padding:20px;
                          text-align:center;
                        ">

                        No results yet.

                      </td>

                    </tr>
                  `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   STUDENT JOIN OVERRIDE
   ========================================================= */

async function liveAwareJoinQuiz() {

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


  if (!name || !code) {

    msg.innerHTML =
      `
      <div class="status error">
        Please enter your name and quiz code.
      </div>
      `;

    return;
  }


  /*
    Normal quiz
  */

  if (!code.startsWith("LIV")) {

    await joinNormalQuizFromOriginal(
      name,
      code
    );

    return;
  }


  /*
    Live quiz
  */

  await joinLiveQuiz(
    name,
    code
  );

}


/* =========================================================
   NORMAL QUIZ JOIN
   ========================================================= */

async function joinNormalQuizFromOriginal(
  name,
  code
) {

  const msg =
    document.getElementById(
      "studentMessage"
    );


  msg.innerHTML =
    `
    <div class="status">
      🔍 Finding your quiz...
    </div>
    `;


  try {

    const response =
      await fetch(
        "/api/quizzes/" +
        encodeURIComponent(code)
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
      data.quiz || data;


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
      `
      <div class="status error">

        ❌
        ${escapeHtml(
          error.message ||
          "Quiz not found."
        )}

      </div>
      `;

  }

}


/* =========================================================
   JOIN LIVE QUIZ
   ========================================================= */

async function joinLiveQuiz(
  name,
  liveCode
) {

  const msg =
    document.getElementById(
      "studentMessage"
    );


  msg.innerHTML =
    `
    <div class="status">
      🔴 Joining Live Quiz...
    </div>
    `;


  try {

    const response =
      await fetch(
        "/api/live/" +
        encodeURIComponent(
          liveCode
        ) +
        "/join",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            name: name

          })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not join Live Quiz."
      );

    }


    liveStudentSession = {

      liveCode:
        liveCode,

      studentToken:
        data.studentToken,

      name:
        name

    };


    sessionStorage.setItem(
      "zbq_live_student",
      JSON.stringify(
        liveStudentSession
      )
    );


    showLiveStudentPanel();


  } catch (error) {

    console.error(
      "Live join error:",
      error
    );


    msg.innerHTML =
      `
      <div class="status error">

        ❌
        ${escapeHtml(
          error.message ||
          "Could not join Live Quiz."
        )}

      </div>
      `;

  }

}


/* =========================================================
   STUDENT LIVE PANEL
   ========================================================= */

function showLiveStudentPanel() {

  showView(
    "studentView"
  );


  const msg =
    document.getElementById(
      "studentMessage"
    );


  msg.innerHTML = `

    <div
      id="liveStudentPanel"
      style="
        margin-top:20px;
        padding:20px;
        border-radius:18px;
        background:#f5f8ff;
      ">

      <h2>
        🔴 Live Quiz
      </h2>

      <div id="liveStudentContent">

        <div class="status">
          ⏳ Waiting for host to start...
        </div>

      </div>

    </div>

  `;


  pollLiveStudent();

}


/* =========================================================
   STUDENT POLLING
   ========================================================= */

async function pollLiveStudent() {

  if (!liveStudentSession) return;


  try {

    const response =
      await fetch(
        "/api/live/" +
        encodeURIComponent(
          liveStudentSession.liveCode
        ) +
        "/state?token=" +
        encodeURIComponent(
          liveStudentSession.studentToken
        )
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Live Quiz connection failed."
      );

    }


    renderLiveStudentState(
      data
    );


  } catch (error) {

    console.error(
      "Live student polling error:",
      error
    );

  }


  clearTimeout(
    liveStudentTimer
  );


  liveStudentTimer =
    setTimeout(
      pollLiveStudent,
      1000
    );

}


/* =========================================================
   STUDENT STATE
   ========================================================= */

function renderLiveStudentState(
  data
) {

  const box =
    document.getElementById(
      "liveStudentContent"
    );


  if (!box) return;


  const phase =
    data.phase ||
    "waiting";


  if (phase === "waiting") {

    box.innerHTML = `

      <div class="status">

        ⏳ Waiting for the host...

      </div>


      <p
        style="
          text-align:center;
          margin-top:15px;
        ">

        You have joined successfully.

        <br>

        <strong>
          ${escapeHtml(
            liveStudentSession.name
          )}
        </strong>

      </p>

    `;

    return;
  }


  if (phase === "active") {

    renderLiveStudentQuestion(
      data
    );

    return;
  }


  if (
    phase === "finished" ||
    phase === "ended"
  ) {

    renderLiveStudentFinal(
      data
    );

  }

}


/* =========================================================
   STUDENT QUESTION
   ========================================================= */

function renderLiveStudentQuestion(
  data
) {

  const box =
    document.getElementById(
      "liveStudentContent"
    );


  if (!box) return;


  const question =
    data.question;


  if (!question) {

    box.innerHTML =
      `
      <div class="status">
        Loading question...
      </div>
      `;

    return;
  }


  const questionNumber =
    Number(
      data.currentQuestionIndex || 0
    ) + 1;


  const total =
    Number(
      data.totalQuestions ||
      0
    );


  const alreadyAnswered =
    data.answered === true;


  box.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
      ">

      <h2>
        Question
        ${questionNumber}/${total}
      </h2>

      <div
        id="liveStudentTimer"
        style="
          font-size:28px;
          font-weight:800;
        ">

        60

      </div>

    </div>


    <div
      style="
        margin-top:20px;
        padding:20px;
        background:white;
        border-radius:16px;
      ">

      <h3>

        ${escapeHtml(
          question.question || ""
        )}

      </h3>


      <div
        style="
          display:grid;
          gap:12px;
          margin-top:20px;
        ">

        ${
          (question.options || [])
            .map(
              (option, index) => `

                <label
                  class="quiz-option"
                  style="
                    cursor:pointer;
                    display:block;
                    padding:14px;
                  ">

                  <input
                    type="radio"
                    name="liveAnswer"
                    value="${index}"
                    ${
                      alreadyAnswered
                        ? "disabled"
                        : ""
                    }>

                  <span>

                    ${
                      String.fromCharCode(
                        65 + index
                      )
                    }.

                    ${escapeHtml(option)}

                  </span>

                </label>

              `
            )
            .join("")
        }

      </div>


      <button
        id="liveAnswerButton"
        class="primary-btn"
        style="margin-top:20px;"
        onclick="submitLiveAnswer()"
        ${
          alreadyAnswered
            ? "disabled"
            : ""
        }>

        ${
          alreadyAnswered
            ? "✅ Answer Submitted"
            : "Submit Answer"
        }

      </button>


      <div
        id="liveAnswerStatus"
        style="margin-top:15px;">

        ${
          alreadyAnswered
            ? `
              <div class="status success">
                Your answer has been submitted.
                Waiting for the next question...
              </div>
            `
            : ""
        }

      </div>

    </div>

  `;


  updateLiveCountdown(
    "liveStudentTimer",
    data.deadline
  );

}


/* =========================================================
   SUBMIT LIVE ANSWER
   ========================================================= */

async function submitLiveAnswer() {

  if (!liveStudentSession) {

    alert(
      "Live Quiz session not found."
    );

    return;
  }


  const selected =
    document.querySelector(
      'input[name="liveAnswer"]:checked'
    );


  if (!selected) {

    alert(
      "Please select an answer."
    );

    return;
  }


  const button =
    document.getElementById(
      "liveAnswerButton"
    );


  if (button) {

    button.disabled =
      true;

  }


  try {

    const response =
      await fetch(
        "/api/live/" +
        encodeURIComponent(
          liveStudentSession.liveCode
        ) +
        "/answer",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            token:
              liveStudentSession.studentToken,

            answer:
              Number(
                selected.value
              )

          })

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not submit answer."
      );

    }


    document
      .querySelectorAll(
        'input[name="liveAnswer"]'
      )
      .forEach(
        input => {
          input.disabled =
            true;
        }
      );


    const status =
      document.getElementById(
        "liveAnswerStatus"
      );


    if (status) {

      status.innerHTML =
        `
        <div class="status success">

          ✅ Answer submitted!

          <br>

          Waiting for the next question...

        </div>
        `;

    }


  } catch (error) {

    console.error(
      "Live answer error:",
      error
    );


    if (button) {

      button.disabled =
        false;

    }


    alert(
      "❌ " +
      (
        error.message ||
        "Could not submit answer."
      )
    );

  }

}


/* =========================================================
   STUDENT FINAL RESULT
   ========================================================= */

function renderLiveStudentFinal(
  data
) {

  const box =
    document.getElementById(
      "liveStudentContent"
    );


  if (!box) return;


  const result =
    data.result || {};


  const leaderboard =
    data.leaderboard || [];


  box.innerHTML = `

    <div class="result-box">

      <h2>
        🎉 Live Quiz Completed!
      </h2>


      <p>

        <strong>
          ${escapeHtml(
            liveStudentSession.name
          )}
        </strong>

      </p>


      <h1
        style="
          text-align:center;
          margin:20px 0;
        ">

        ${
          result.score !== undefined
            ? result.score
            : 0
        }

        /

        ${
          result.total !== undefined
            ? result.total
            : data.totalQuestions || 0
        }

      </h1>


      <p
        style="
          text-align:center;
          font-size:20px;
        ">

        ${
          result.percentage !== undefined
            ? result.percentage
            : 0
        }%

      </p>


      ${
        result.rank
          ? `
            <div
              class="student-rank"
              style="margin-top:15px;">

              🏆 Your Rank:
              <strong>
                #${result.rank}
              </strong>

            </div>
          `
          : ""
      }


      <h3
        style="
          margin-top:25px;
        ">

        🏆 Final Leaderboard

      </h3>


      <div
        style="
          overflow-x:auto;
          margin-top:15px;
        ">

        <table
          style="
            width:100%;
            border-collapse:collapse;
          ">

          <thead>

            <tr
              style="
                background:#f2f6ff;
              ">

              <th style="padding:10px;">
                Rank
              </th>

              <th style="padding:10px;">
                Student
              </th>

              <th style="padding:10px;">
                Score
              </th>

              <th style="padding:10px;">
                %
              </th>

            </tr>

          </thead>

          <tbody>

            ${
              leaderboard
                .map(
                  item => `

                    <tr>

                      <td
                        style="
                          padding:10px;
                          text-align:center;
                        ">

                        #${item.rank}

                      </td>

                      <td
                        style="
                          padding:10px;
                        ">

                        ${escapeHtml(
                          item.name || ""
                        )}

                      </td>

                      <td
                        style="
                          padding:10px;
                          text-align:center;
                        ">

                        ${item.score}/${item.total}

                      </td>

                      <td
                        style="
                          padding:10px;
                          text-align:center;
                        ">

                        ${item.percentage}%

                      </td>

                    </tr>

                  `
                )
                .join("")
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =========================================================
   LIVE COUNTDOWN
   ========================================================= */

function updateLiveCountdown(
  elementId,
  deadline
) {

  const element =
    document.getElementById(
      elementId
    );


  if (!element) return;


  const endTime =
    new Date(
      deadline
    ).getTime();


  function update() {

    const remaining =
      Math.max(
        0,
        endTime -
        Date.now()
      );


    const seconds =
      Math.ceil(
        remaining / 1000
      );


    element.textContent =
      seconds;


    if (seconds <= 0) {

      element.textContent =
        "0";

      return;

    }


    setTimeout(
      update,
      250
    );

  }


  update();

}


/* =========================================================
   RESTORE HOST SESSION
   ========================================================= */

function restoreLiveHostSession() {

  try {

    const saved =
      localStorage.getItem(
        "zbq_live_host"
      );


    if (saved) {

      liveHostSession =
        JSON.parse(saved);

    }

  } catch (error) {

    console.error(
      "Could not restore host session:",
      error
    );

  }

}


/* =========================================================
   RESTORE STUDENT SESSION
   ========================================================= */

function restoreLiveStudentSession() {

  try {

    const saved =
      sessionStorage.getItem(
        "zbq_live_student"
      );


    if (saved) {

      liveStudentSession =
        JSON.parse(saved);

    }

  } catch (error) {

    console.error(
      "Could not restore student session:",
      error
    );

  }

}


/* =========================================================
   ADD LIVE BUTTON TO CREATED QUIZ
   ========================================================= */

const originalShowCreatedQuiz =
  window.showCreatedQuiz;


window.showCreatedQuiz =
  function(quiz) {

    originalShowCreatedQuiz(
      quiz
    );


    const panel =
      document.getElementById(
        "createdQuizPanel"
      );


    if (!panel) return;


    const existing =
      document.getElementById(
        "startLiveQuizButton"
      );


    if (existing) return;


    const liveButton =
      document.createElement(
        "button"
      );


    liveButton.id =
      "startLiveQuizButton";


    liveButton.className =
      "primary-btn";


    liveButton.style.marginTop =
      "12px";


    liveButton.textContent =
      "🔴 Start Live Quiz";


    liveButton.onclick =
      function() {

        createLiveQuiz(
          quiz.code
        );

      };


    panel.appendChild(
      liveButton
    );

  };


/* =========================================================
   OVERRIDE STUDENT JOIN
   ========================================================= */

window.joinQuiz =
  liveAwareJoinQuiz;


/* =========================================================
   STARTUP
   ========================================================= */

restoreLiveHostSession();

restoreLiveStudentSession();


console.log(
  "🔴 Zero Barrier Quiz Live Quiz System loaded successfully."
);
