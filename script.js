let quizzes=JSON.parse(localStorage.getItem("zbq_quizzes")||"[]");
let currentQuiz=null;
let currentStudent="";
let createMode="ai";
let leaderboards=JSON.parse(localStorage.getItem("zbq_leaderboards")||"{}");

function saveLeaderboards(){
  localStorage.setItem("zbq_leaderboards",JSON.stringify(leaderboards));
}

function saveQuizzes(){localStorage.setItem("zbq_quizzes",JSON.stringify(quizzes));}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}
function showHome(){showView("homeView")}
function openTeacher(){showView("teacherView");selectCreateMode("ai")}
function openStudent(){showView("studentView")}
function openAdmin(){showView("adminView");renderAdmin()}

function selectCreateMode(mode){
  createMode=mode;
  document.getElementById("aiModeCard").classList.toggle("selected",mode==="ai");
  document.getElementById("manualModeCard").classList.toggle("selected",mode==="manual");
  document.getElementById("aiCreator").classList.toggle("hidden",mode!=="ai");
  document.getElementById("manualCreator").classList.toggle("hidden",mode!=="manual");
  if(mode==="manual" && !document.querySelector(".question-editor")) addManualQuestion();
}

async function generateAIQuiz(){
  const topic=document.getElementById("aiTopic").value.trim();
  const count=Number(document.getElementById("aiCount").value);
  const difficulty=document.getElementById("aiDifficulty").value;
  const type=document.getElementById("aiType").value;
  const status=document.getElementById("aiStatus");
  if(!topic){status.innerHTML='<div class="status error">Please enter a topic.</div>';return}
  if(count<1||count>30){status.innerHTML='<div class="status error">Choose between 1 and 30 questions.</div>';return}
  status.innerHTML='<div class="status">🤖 AI is creating your quiz. Please wait...</div>';
  try{
    const res=await fetch("/api/generate-quiz",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,count,difficulty,type})});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||"AI generation failed");
    const quiz=normalizeQuiz(data.quiz||data);
    createQuiz(quiz,"AI Generated");
    status.innerHTML='<div class="status success">Quiz generated successfully.</div>';
  }catch(err){
    status.innerHTML='<div class="status error">❌ '+escapeHtml(err.message)+'<br><small>If the AI server is not configured yet, follow README.txt to add the Gemini API key.</small></div>';
  }
}

function normalizeQuiz(q){
  const questions=(q.questions||[]).map(x=>({
    question:String(x.question||"Question"),
    options:Array.isArray(x.options)?x.options.map(String):["True","False"],
    answer:Number.isInteger(x.answer)?x.answer:0
  }));
  return {title:String(q.title||"AI Quiz"),questions};
}

function makeCode(){
  let code;
  do{code="ZBQ"+Math.floor(1000+Math.random()*9000)}while(quizzes.some(q=>q.code===code));
  return code;
}

function createQuiz(quiz,method){
  quiz.code=makeCode(); quiz.method=method; quiz.createdAt=new Date().toLocaleString();
  quizzes.push(quiz); saveQuizzes(); showCreatedQuiz(quiz);
}

function showCreatedQuiz(quiz){
  const panel=document.getElementById("createdQuizPanel");
  panel.classList.remove("hidden");
  panel.innerHTML='<h2>🎉 Quiz Created Successfully!</h2>'+
    '<div class="code-box"><div>Your Quiz Code</div><div class="join-code">'+quiz.code+'</div><div>Share this code with your students.</div></div>'+
    '<h3>'+escapeHtml(quiz.title)+'</h3>'+
    '<p>'+quiz.questions.length+' questions • '+escapeHtml(quiz.method)+'</p>'+
    '<button class="secondary-btn" onclick="openStudent()">Go to Student Join</button>'+
'<button class="secondary-btn" onclick="showLeaderboard(\''+quiz.code+'\')">🏆 View Leaderboard</button>';
  panel.scrollIntoView({behavior:"smooth"});
}

function addManualQuestion(){
  const box=document.getElementById("manualQuestions");
  const n=box.querySelectorAll(".question-editor").length+1;
  const el=document.createElement("div"); el.className="question-editor";
  el.innerHTML='<h3>Question '+n+'</h3>'+
    '<input class="mq-text" placeholder="Enter your question">'+
    '<div class="option-row"><input class="mq-option" placeholder="Option A"><input type="radio" name="correct'+n+'" value="0" checked> Correct</div>'+
    '<div class="option-row"><input class="mq-option" placeholder="Option B"><input type="radio" name="correct'+n+'" value="1"> Correct</div>'+
    '<div class="option-row"><input class="mq-option" placeholder="Option C"><input type="radio" name="correct'+n+'" value="2"> Correct</div>'+
    '<div class="option-row"><input class="mq-option" placeholder="Option D"><input type="radio" name="correct'+n+'" value="3"> Correct</div>';
  box.appendChild(el);
}

function saveManualQuiz(){
  const title=document.getElementById("manualTitle").value.trim()||"My Quiz";
  const editors=[...document.querySelectorAll(".question-editor")];
  const questions=[];
  for(const e of editors){
    const text=e.querySelector(".mq-text").value.trim();
    const opts=[...e.querySelectorAll(".mq-option")].map(x=>x.value.trim());
    const correct=Number(e.querySelector("input[type=radio]:checked").value);
    if(!text||opts.some(x=>!x)){document.getElementById("manualStatus").innerHTML='<div class="status error">Please complete every question and option.</div>';return}
    questions.push({question:text,options:opts,answer:correct});
  }
  if(!questions.length){return}
  createQuiz({title,questions},"Teacher Created");
  document.getElementById("manualStatus").innerHTML='<div class="status success">Your quiz has been saved.</div>';
}

function joinQuiz(){
  const name=document.getElementById("studentName").value.trim();
  const code=document.getElementById("studentCode").value.trim().toUpperCase();
  const msg=document.getElementById("studentMessage");
  if(!name||!code){msg.innerHTML='<div class="status error">Please enter your name and quiz code.</div>';return}
  const quiz=quizzes.find(q=>q.code===code);
  if(!quiz){msg.innerHTML='<div class="status error">Quiz code not found on this device.</div>';return}
  currentQuiz=quiz;currentStudent=name;renderQuiz();
}

function renderQuiz(){
  showView("quizView");
  document.getElementById("quizTitle").textContent=currentQuiz.title;
  document.getElementById("quizStudent").textContent="Student: "+currentStudent+" • Code: "+currentQuiz.code;
  document.getElementById("quizResult").innerHTML="";
  document.getElementById("quizQuestions").innerHTML=currentQuiz.questions.map((q,i)=>
    '<div class="question-card"><h3>'+(i+1)+". "+escapeHtml(q.question)+'</h3>'+
    q.options.map((o,j)=>'<label class="quiz-option"><input type="radio" name="q'+i+'" value="'+j+'">'+escapeHtml(o)+'</label>').join("")+
    '</div>').join("");
}

function submitQuiz(){
  let score=0;
  let answered=0;

  currentQuiz.questions.forEach((q,i)=>{
    const chosen=document.querySelector('input[name="q'+i+'"]:checked');

    if(chosen){
      answered++;

      if(Number(chosen.value)===q.answer){
        score++;
      }
    }
  });

  const total=currentQuiz.questions.length;
  const pct=Math.round(score/total*100);

  // Create leaderboard for this quiz
  if(!leaderboards[currentQuiz.code]){
    leaderboards[currentQuiz.code]=[];
  }

  // Save student's result
  leaderboards[currentQuiz.code].push({
    name:currentStudent,
    score:score,
    total:total,
    percentage:pct,
    submittedAt:new Date().toISOString()
  });

  // Sort highest score first
  leaderboards[currentQuiz.code].sort((a,b)=>{
    if(b.score!==a.score){
      return b.score-a.score;
    }

    return new Date(a.submittedAt)-new Date(b.submittedAt);
  });

  saveLeaderboards();

  // Find student's rank
  const studentResult=leaderboards[currentQuiz.code]
    .findIndex(r=>
      r.name===currentStudent &&
      r.score===score
    );

  const rank=studentResult+1;

  document.getElementById("quizResult").innerHTML=
    '<div class="result-box">'+
      '<h2>🎉 Quiz Completed</h2>'+
      '<p><strong>'+escapeHtml(currentStudent)+'</strong>, your score is '+
      '<strong>'+score+'/'+total+'</strong> ('+pct+'%).</p>'+
      '<p>You answered '+answered+' of '+total+' questions.</p>'+
      '<div class="student-rank">'+
        '🏆 Your Rank: <strong>#'+rank+'</strong>'+
      '</div>'+
      '<button class="secondary-btn leaderboard-btn" onclick="showLeaderboard(\''+currentQuiz.code+'\')">'+
        '🏆 View Leaderboard'+
      '</button>'+
    '</div>';

  // Disable questions after submission
  document.querySelectorAll("#quizQuestions input").forEach(input=>{
    input.disabled=true;
  });

  window.scrollTo({
    top:document.body.scrollHeight,
    behavior:"smooth"
  });
}

function renderAdmin(){

  const list=document.getElementById("adminList");

  if(!quizzes.length){

    list.innerHTML=
      "<p class='muted'>No quizzes created on this browser yet.</p>";

    return;
  }

  list.innerHTML=quizzes.map(q=>{

    const results=leaderboards[q.code]||[];

    return `
      <div class="admin-item">

        <div>
          <strong>${escapeHtml(q.title)}</strong>

          <br>

          <span class="muted">
            ${q.questions.length} questions •
            ${escapeHtml(q.method||"Quiz")} •
            ${results.length} student(s)
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

  }).join("");
}
function clearAllQuizzes(){

  if(confirm("Delete all quizzes and leaderboard data stored on this browser?")){

    quizzes=[];
    leaderboards={};

    saveQuizzes();
    saveLeaderboards();

    renderAdmin();
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
