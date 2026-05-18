const BASE = "..";

const files = {
  lessons: `${BASE}/Notion/Lecciones.csv`,
  flashcards: `${BASE}/Notion/Flashcards.csv`,
  quizzes: `${BASE}/Notion/Quizzes.csv`,
  ingredients: `${BASE}/Notion/Ingredientes.csv`,
  protocols: `${BASE}/Notion/Protocolos.csv`,
  cases: `${BASE}/Notion/Casos prácticos.csv`,
  resources: `${BASE}/Notion/Recursos.csv`,
  visuals: `${BASE}/Notion/Visuales.csv`
};

const oldProgressKey = "ivania-course-progress-v1";
const oldNotesKey = "ivania-course-notes-v1";
const appStateKey = "ivania-facial-lab-state-v2";

const points = {
  lesson: 10,
  quizApproved: 10,
  quizPerfect: 20,
  flashcard: 5,
  caseSolved: 25,
  protocolReviewed: 30,
  weekComplete: 50
};

const app = {
  view: "home",
  week: "Semana 1",
  search: "",
  currentLesson: null,
  flashIndex: 0,
  showFlashAnswer: false,
  quizIndex: 0,
  quizAnswers: {},
  quizFinished: false,
  quizScope: [],
  data: {
    lessons: [],
    flashcards: [],
    quizzes: [],
    ingredients: [],
    protocols: [],
    cases: [],
    resources: [],
    visuals: []
  },
  store: null
};

const $ = (selector) => document.querySelector(selector);
const view = $("#view");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    app.store = loadStore();
    const loaded = await Promise.all([
      loadCsv(files.lessons),
      loadCsv(files.flashcards),
      loadCsv(files.quizzes),
      loadCsv(files.ingredients),
      loadCsv(files.protocols),
      loadCsv(files.cases),
      loadCsv(files.resources),
      loadCsv(files.visuals)
    ]);
    [app.data.lessons, app.data.flashcards, app.data.quizzes, app.data.ingredients, app.data.protocols, app.data.cases, app.data.resources, app.data.visuals] = loaded;
    setupControls();
    render();
  } catch (error) {
    console.error(error);
    view.innerHTML = `<section class="empty-state"><strong>No pude cargar el curso.</strong><p>Revisa que el servidor local esté abierto en la carpeta del curso y que los CSV existan.</p><code>${escapeHtml(error.message)}</code></section>`;
  }
}

function setupControls() {
  const weeks = weeksList();
  $("#weekSelect").innerHTML = weeks.map((week) => `<option>${escapeHtml(week)}</option>`).join("");
  $("#weekSelect").value = app.week;
  $("#weekSelect").addEventListener("change", (event) => {
    app.week = event.target.value;
    app.currentLesson = null;
    resetQuizRuntime();
    render();
  });

  $("#searchInput").addEventListener("input", (event) => {
    app.search = event.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      app.view = button.dataset.view;
      app.currentLesson = null;
      resetQuizRuntime();
      setActiveNav();
      render();
    });
  });

  $("#railStartLesson").addEventListener("click", () => {
    const lesson = nextLesson();
    openLesson(lesson.lesson);
  });
}

function render() {
  $("#viewTitle").textContent = titleForView(app.view);
  $("#viewKicker").textContent = kickerForView(app.view);
  $("#weekSelect").value = app.week;
  setActiveNav();
  updateGlobalChrome();

  const routes = {
    home: renderHome,
    roadmap: renderRoadmap,
    today: renderToday,
    diagnosis: renderDiagnosis,
    cases: renderCases,
    ingredients: renderIngredients,
    protocols: renderProtocols,
    flashcards: renderFlashcards,
    quizzes: renderQuizzes,
    resources: renderResources,
    progress: renderProgress,
    achievements: renderAchievements
  };
  (routes[app.view] || renderHome)();
}

function titleForView(viewName) {
  return {
    home: "Inicio",
    roadmap: "Ruta de 12 semanas",
    today: "Lección de hoy",
    diagnosis: "Diagnóstico guiado",
    cases: "Casos prácticos",
    ingredients: "Ingredientes",
    protocols: "Protocolos",
    flashcards: "Flashcards",
    quizzes: "Quizzes",
    resources: "Recursos",
    progress: "Progreso",
    achievements: "Logros"
  }[viewName] || "Inicio";
}

function kickerForView(viewName) {
  return {
    home: "Dashboard de estudio",
    roadmap: "Plan semanal",
    today: "Sesión activa",
    diagnosis: "Árbol de decisión estético",
    cases: "Práctica con imágenes reales",
    ingredients: "Lectura de activos y etiquetas",
    protocols: "Criterio de cabina",
    flashcards: "Repaso activo",
    quizzes: "Evaluación sin pistas",
    resources: "Fuentes y enlaces",
    progress: "Historial local",
    achievements: "Gamificación"
  }[viewName] || "Academia local";
}

function setActiveNav() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === app.view);
  });
}

function renderHome() {
  const summary = progressSummary();
  const today = nextLesson();
  const courses = courseCards();
  const agenda = upcomingLessons(6);
  const recent = recentActivity(5);

  view.innerHTML = `
    <section class="hero-panel">
      <div>
        <p class="kicker">Bienvenida, Ivania</p>
        <h2>Semana actual: ${summary.currentWeek} de 12</h2>
        <p class="muted">Sesión sugerida de hoy: ${escapeHtml(today.week)} · ${escapeHtml(today.day)}</p>
      </div>
      <div class="hero-score">
        <span>${summary.percent}%</span>
        <small>progreso general</small>
      </div>
    </section>

    <section class="metric-grid">
      ${metricCard("Curso activo", "Tratamientos Faciales", "12 semanas")}
      ${metricCard("Progreso general", `${summary.percent}%`, `${summary.completedLessons}/${summary.totalLessons} lecciones`)}
      ${metricCard("Lecciones completadas", `${summary.completedLessons}/${summary.totalLessons}`, "+10 pts cada una")}
      ${metricCard("Quizzes aprobados", summary.approvedQuizzes, "criterio >= 70%")}
      ${metricCard("Flashcards pendientes", summary.pendingFlashcards, "repaso activo")}
      ${metricCard("Casos completados", `${summary.solvedCases}/${app.data.cases.length}`, "+25 pts cada caso")}
    </section>

    <section class="dashboard-grid">
      <article class="academy-card span-7">
        <div class="section-head">
          <div>
            <p class="kicker">Sesión de hoy</p>
            <h3>${escapeHtml(today.lessonTitle)}</h3>
          </div>
          ${safetyBadge(today.lesson)}
        </div>
        <div class="lesson-meta-row">
          <span>${escapeHtml(today.week)}</span>
          <span>${escapeHtml(today.day)}</span>
          <span>${escapeHtml(field(today.lesson, "Tema"))}</span>
        </div>
        <p class="muted">${escapeHtml(field(today.lesson, "Objetivo"))}</p>
        <button class="primary-btn" data-open-lesson="${escapeAttr(today.lessonTitle)}" type="button">Empezar sesión</button>
      </article>

      <article class="academy-card span-5">
        <p class="kicker">Agenda</p>
        <div class="agenda-list">
          ${agenda.map((item) => `
            <button class="agenda-item" data-open-lesson="${escapeAttr(field(item, "Lección"))}" type="button">
              <span>${escapeHtml(field(item, "Semana"))} · ${escapeHtml(field(item, "Día"))}</span>
              <strong>${escapeHtml(field(item, "Lección"))}</strong>
            </button>
          `).join("")}
        </div>
      </article>

      <article class="academy-card span-12">
        <div class="section-head">
          <div>
            <p class="kicker">Mis cursos</p>
            <h3>Rutas de repaso</h3>
          </div>
        </div>
        <div class="course-grid">
          ${courses.map((course) => courseCard(course)).join("")}
        </div>
      </article>

      <article class="academy-card span-7">
        <p class="kicker">Actividad reciente</p>
        ${activityMarkup(recent)}
      </article>

      <article class="academy-card span-5">
        <p class="kicker">Logros próximos</p>
        <div class="achievement-mini-list">
          ${achievements().slice(0, 4).map((achievement) => miniAchievement(achievement)).join("")}
        </div>
      </article>
    </section>
  `;
  bindOpenLessonButtons();
}

function renderRoadmap() {
  const grouped = weeksList().map((week) => ({
    week,
    lessons: app.data.lessons.filter((lesson) => field(lesson, "Semana") === week)
  }));
  view.innerHTML = `
    <section class="roadmap">
      ${grouped.map((group) => {
        const complete = group.lessons.filter((lesson) => isLessonComplete(field(lesson, "Lección"))).length;
        return `
          <article class="academy-card week-card">
            <div class="section-head">
              <div>
                <p class="kicker">${escapeHtml(group.week)}</p>
                <h3>${weekTitle(group.week)}</h3>
              </div>
              <span class="round-count">${complete}/4</span>
            </div>
            <div class="progress-track"><div style="width:${(complete / Math.max(group.lessons.length, 1)) * 100}%"></div></div>
            <div class="week-lessons">
              ${group.lessons.map((lesson) => `
                <button class="week-lesson ${isLessonComplete(field(lesson, "Lección")) ? "done" : ""}" data-open-lesson="${escapeAttr(field(lesson, "Lección"))}" type="button">
                  ${safetyBadge(lesson)}
                  <span>${escapeHtml(field(lesson, "Día"))}</span>
                  <strong>${escapeHtml(field(lesson, "Lección"))}</strong>
                </button>
              `).join("")}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
  bindOpenLessonButtons();
}

function renderToday() {
  const lesson = app.currentLesson || nextLesson().lessonTitle;
  renderLessonReader(lesson);
}

async function renderLessonReader(lessonTitle) {
  const lesson = app.data.lessons.find((item) => field(item, "Lección") === lessonTitle);
  if (!lesson) {
    view.innerHTML = `<section class="empty-state">No encontré la lección seleccionada.</section>`;
    return;
  }

  view.innerHTML = `<section class="empty-state">Cargando sesión...</section>`;
  try {
    const markdown = await fetchText(`${BASE}/${encodePath(field(lesson, "Recurso principal"))}`);
    const section = extractLessonSection(markdown, field(lesson, "Lección"));
    const visual = app.data.visuals.find((item) => field(item, "Lección") === field(lesson, "Lección"));
    const lessonNotes = app.store.notes[field(lesson, "Lección")] || "";
    const relatedQuiz = app.data.quizzes.filter((quiz) => field(quiz, "Semana") === field(lesson, "Semana"));
    const relatedFlashcards = app.data.flashcards.filter((card) => field(card, "Semana") === field(lesson, "Semana")).slice(0, 5);

    view.innerHTML = `
      <section class="lesson-academy">
        <article class="academy-card lesson-main">
          <button class="ghost-btn inline" data-back-lessons type="button">← Volver</button>
          <p class="kicker">${escapeHtml(field(lesson, "Semana"))} · ${escapeHtml(field(lesson, "Día"))}</p>
          <div class="section-head">
            <div>
              <h2>${escapeHtml(field(lesson, "Lección"))}</h2>
              <p class="muted">${escapeHtml(field(lesson, "Objetivo"))}</p>
            </div>
            ${safetyBadge(lesson)}
          </div>
          ${visual ? visualBlock(visual) : ""}
          <div class="markdown lesson-content">${markdownToHtml(section)}</div>
        </article>

        <aside class="academy-card lesson-side">
          <p class="kicker">Panel de sesión</p>
          ${safetyNote(lesson)}
          <button class="primary-btn full" data-complete-lesson="${escapeAttr(field(lesson, "Lección"))}" type="button">
            ${isLessonComplete(field(lesson, "Lección")) ? "Marcar pendiente" : "Marcar como completada"}
          </button>

          <div class="side-block">
            <h3>Quiz de la lección</h3>
            <p class="muted">${relatedQuiz.length} preguntas disponibles.</p>
            <button class="pill-btn full" data-go-view="quizzes" type="button">Abrir quiz</button>
          </div>

          <div class="side-block">
            <h3>Flashcards relacionadas</h3>
            <ul class="mini-list">
              ${relatedFlashcards.map((card) => `<li>${escapeHtml(field(card, "Pregunta"))}</li>`).join("") || "<li>No hay tarjetas relacionadas.</li>"}
            </ul>
            <button class="pill-btn secondary full" data-go-view="flashcards" type="button">Repasar flashcards</button>
          </div>

          <label class="field notes-field">
            <span>Notas personales</span>
            <textarea data-lesson-notes="${escapeAttr(field(lesson, "Lección"))}" placeholder="Dudas, observaciones, productos usados...">${escapeHtml(lessonNotes)}</textarea>
          </label>
        </aside>
      </section>
    `;

    $("[data-back-lessons]").addEventListener("click", () => {
      app.currentLesson = null;
      render();
    });
    $("[data-complete-lesson]").addEventListener("click", () => toggleLessonComplete(field(lesson, "Lección")));
    document.querySelectorAll("[data-go-view]").forEach((button) => {
      button.addEventListener("click", () => {
        app.view = button.dataset.goView;
        app.currentLesson = null;
        render();
      });
    });
    $("[data-lesson-notes]").addEventListener("input", (event) => {
      app.store.notes[event.target.dataset.lessonNotes] = event.target.value;
      saveStore();
    });
  } catch (error) {
    view.innerHTML = `<section class="empty-state"><strong>No pude abrir la lección.</strong><p>${escapeHtml(error.message)}</p></section>`;
  }
}

function renderQuizzes() {
  const questions = filterRows(app.data.quizzes.filter((quiz) => field(quiz, "Semana") === app.week));
  if (!questions.length) {
    view.innerHTML = `<section class="empty-state">No hay preguntas para esta búsqueda.</section>`;
    return;
  }
  app.quizScope = questions;
  if (app.quizFinished) {
    renderQuizResults(questions);
    return;
  }
  app.quizIndex = Math.min(app.quizIndex, questions.length - 1);
  const question = questions[app.quizIndex];
  const questionId = idFor(field(question, "Pregunta"));
  const selected = app.quizAnswers[questionId] || "";
  const options = field(question, "Opciones").split("|").map((item) => item.trim()).filter(Boolean);

  view.innerHTML = `
    <section class="academy-card quiz-card">
      <div class="section-head">
        <div>
          <p class="kicker">${escapeHtml(app.week)} · Pregunta ${app.quizIndex + 1} de ${questions.length}</p>
          <h2>${escapeHtml(field(question, "Pregunta"))}</h2>
        </div>
        <span class="round-count">${Object.keys(app.quizAnswers).length}/${questions.length}</span>
      </div>
      <div class="quiz-options">
        ${options.map((option) => `<button class="option ${selected === option ? "selected" : ""}" data-quiz-option="${escapeAttr(option)}" type="button">${escapeHtml(option)}</button>`).join("")}
      </div>
      <p id="quizFeedback" class="muted">Elige una respuesta. La corrección aparecerá al final.</p>
      <div class="action-row">
        <button class="pill-btn secondary" data-prev-question type="button">Anterior</button>
        <button class="primary-btn" data-next-question type="button">${app.quizIndex === questions.length - 1 ? "Ver resultados" : "Siguiente"}</button>
        <button class="pill-btn warn" data-reset-quiz type="button">Reiniciar</button>
      </div>
    </section>
  `;
  document.querySelectorAll("[data-quiz-option]").forEach((button) => {
    button.addEventListener("click", () => {
      app.quizAnswers[questionId] = button.dataset.quizOption;
      document.querySelectorAll("[data-quiz-option]").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      $("#quizFeedback").textContent = "Respuesta guardada. Sigue sin mirar la corrección todavía.";
    });
  });
  $("[data-prev-question]").addEventListener("click", () => {
    app.quizIndex = Math.max(0, app.quizIndex - 1);
    render();
  });
  $("[data-next-question]").addEventListener("click", () => {
    if (!app.quizAnswers[questionId]) {
      $("#quizFeedback").textContent = "Primero elige una respuesta.";
      return;
    }
    if (app.quizIndex === questions.length - 1) app.quizFinished = true;
    else app.quizIndex += 1;
    render();
  });
  $("[data-reset-quiz]").addEventListener("click", () => {
    resetQuizRuntime();
    render();
  });
}

function renderQuizResults(questions) {
  const results = questions.map((question) => {
    const questionId = idFor(field(question, "Pregunta"));
    const selected = app.quizAnswers[questionId] || "";
    const correct = correctOptionFor(question);
    return { question, selected, correct, isCorrect: selected === correct };
  });
  const score = results.filter((item) => item.isCorrect).length;
  const percent = Math.round((score / questions.length) * 100);
  const approved = percent >= 70;
  const perfect = score === questions.length;
  const quizId = idFor(app.week);
  const earned = (approved ? points.quizApproved : 0) + (perfect ? points.quizPerfect : 0);
  app.store.quizAttempts[quizId] = {
    week: app.week,
    score,
    total: questions.length,
    percent,
    approved,
    perfect,
    answers: app.quizAnswers,
    completedAt: new Date().toISOString()
  };
  if (approved) awardOnce(`quiz-approved:${quizId}`, points.quizApproved, `Aprobaste el quiz de ${app.week}`);
  if (perfect) awardOnce(`quiz-perfect:${quizId}`, points.quizPerfect, `Quiz perfecto en ${app.week}`);
  addActivityOnce(`quiz:${quizId}:${score}`, approved ? "quiz" : "quiz", `${approved ? "Aprobaste" : "Terminaste"} el quiz de ${app.week} con ${score}/${questions.length}`);
  checkAchievements();
  saveStore();

  view.innerHTML = `
    <section class="academy-card">
      <div class="section-head">
        <div>
          <p class="kicker">Resultado</p>
          <h2>${escapeHtml(app.week)} · ${percent}%</h2>
          <p class="muted">${approved ? "Aprobado. Buen repaso." : "Conviene repasar y volver a intentarlo."}</p>
          <p><strong>Puntos obtenidos:</strong> ${earned} pts</p>
        </div>
        <span class="score-ring">${score}/${questions.length}</span>
      </div>
      <div class="result-list">
        ${results.map((result, index) => `
          <article class="result-item ${result.isCorrect ? "correct" : "wrong"}">
            <p class="kicker">Pregunta ${index + 1}</p>
            <h3>${escapeHtml(field(result.question, "Pregunta"))}</h3>
            <p><strong>Tu respuesta:</strong> ${escapeHtml(result.selected || "Sin responder")}</p>
            <p><strong>Respuesta correcta:</strong> ${escapeHtml(result.correct)}</p>
            <p class="muted">${escapeHtml(field(result.question, "Explicación"))}</p>
          </article>
        `).join("")}
      </div>
      <button class="primary-btn" data-reset-quiz type="button">Intentar de nuevo</button>
    </section>
  `;
  $("[data-reset-quiz]").addEventListener("click", () => {
    resetQuizRuntime();
    render();
  });
}

function renderFlashcards() {
  const cards = filterRows(app.data.flashcards.filter((card) => field(card, "Semana") === app.week));
  if (!cards.length) {
    view.innerHTML = `<section class="empty-state">No hay flashcards para esta búsqueda.</section>`;
    return;
  }
  app.flashIndex = Math.min(app.flashIndex, cards.length - 1);
  const card = cards[app.flashIndex];
  const cardId = idFor(field(card, "Pregunta"));
  const status = app.store.flashcards[cardId]?.status || "pending";
  const pendingCount = cards.filter((item) => (app.store.flashcards[idFor(field(item, "Pregunta"))]?.status || "pending") !== "known").length;

  view.innerHTML = `
    <section class="academy-card flash-shell">
      <div class="section-head">
        <div>
          <p class="kicker">${escapeHtml(field(card, "Semana"))} · ${escapeHtml(field(card, "Tema"))}</p>
          <h2>Tarjeta ${app.flashIndex + 1} de ${cards.length}</h2>
          <p class="muted">Pendientes: ${pendingCount}</p>
        </div>
        <span class="status-pill ${status}">${statusLabel(status)}</span>
      </div>
      <div class="flashcard">
        <p class="kicker">Pregunta</p>
        <strong>${escapeHtml(field(card, "Pregunta"))}</strong>
        ${app.showFlashAnswer ? `<div class="flash-answer"><p class="kicker">Respuesta:</p>${escapeHtml(field(card, "Respuesta"))}</div>` : ""}
      </div>
      <div class="action-row">
        <button class="primary-btn" data-show-flash type="button">${app.showFlashAnswer ? "Ocultar respuesta" : "Mostrar respuesta"}</button>
        <button class="pill-btn" data-known-flash type="button">Lo sabía</button>
        <button class="pill-btn secondary" data-review-flash type="button">Repasar otra vez</button>
        <button class="pill-btn secondary" data-prev-flash type="button">Anterior</button>
        <button class="pill-btn secondary" data-next-flash type="button">Siguiente</button>
      </div>
    </section>
  `;
  $("[data-show-flash]").addEventListener("click", () => {
    app.showFlashAnswer = !app.showFlashAnswer;
    render();
  });
  $("[data-known-flash]").addEventListener("click", () => markFlashcard(card, "known"));
  $("[data-review-flash]").addEventListener("click", () => markFlashcard(card, "review"));
  $("[data-prev-flash]").addEventListener("click", () => {
    app.flashIndex = (app.flashIndex - 1 + cards.length) % cards.length;
    app.showFlashAnswer = false;
    render();
  });
  $("[data-next-flash]").addEventListener("click", () => {
    app.flashIndex = (app.flashIndex + 1) % cards.length;
    app.showFlashAnswer = false;
    render();
  });
}

function renderDiagnosis() {
  const saved = app.store.diagnosisDraft || {};
  view.innerHTML = `
    <section class="academy-card diagnosis-panel">
      <div class="section-head">
        <div>
          <p class="kicker">Observación estética</p>
          <h2>Diagnóstico guiado antes de elegir productos o aparatología</h2>
          <p class="muted">No diagnostica enfermedades. Ayuda a decidir cuándo adaptar, pausar o derivar.</p>
        </div>
        <span class="safety-chip solo_teoria">educativo</span>
      </div>
      <div class="diagnosis-grid">
        ${selectField("diagBurn", "1. ¿Hay ardor, descamación, tirantez intensa o rojez?", [["no", "No"], ["yes", "Sí"]], saved.diagBurn)}
        ${selectField("diagWounds", "2. ¿Hay heridas, infección, herpes activo o quemadura solar?", [["no", "No"], ["yes", "Sí"]], saved.diagWounds)}
        ${selectField("diagInflamed", "3. ¿Hay acné inflamatorio importante?", [["no", "No"], ["yes", "Sí"]], saved.diagInflamed)}
        ${selectField("diagComedones", "4. ¿Hay comedones abiertos/cerrados?", [["no", "No"], ["yes", "Sí"]], saved.diagComedones)}
        ${selectField("diagSpots", "5. ¿Hay manchas o marcas postinflamatorias?", [["no", "No"], ["yes", "Sí"]], saved.diagSpots)}
        ${selectField("diagRosacea", "6. ¿Piel sensible o sospecha de rosácea?", [["no", "No"], ["yes", "Sí"]], saved.diagRosacea)}
        ${selectField("diagGoal", "7. Objetivo principal", [["Hidratación","Hidratación"],["Limpieza","Limpieza"],["Luminosidad","Luminosidad"],["Calma","Calma"],["Firmeza","Firmeza"]], saved.diagGoal || "Hidratación")}
        ${selectField("diagBiotype", "Biotipo probable", [["Grasa","Grasa"],["Seca","Seca"],["Mixta","Mixta"],["Normal","Normal"],["Alípica","Alípica"],["Por definir","Por definir"]], saved.diagBiotype || "Por definir")}
      </div>
      <div class="action-row">
        <button class="primary-btn" data-run-diagnosis type="button">Generar orientación</button>
        <button class="pill-btn secondary" data-copy-diagnosis type="button">Copiar resultado a notas</button>
      </div>
      <div id="diagnosisResult" class="diagnosis-result muted">
        <strong>Resultado orientativo:</strong> completa los campos para obtener una guía de observación estética; no sustituye diagnóstico médico.
      </div>
    </section>
    <section class="academy-card">
      <p class="kicker">Checklist rápido</p>
      <div class="decision-list">
        <div><strong>Si hay ardor o descamación:</strong> reparar barrera; evitar vapor intenso, microdermoabrasión, ácidos y extracción agresiva.</div>
        <div><strong>Si hay heridas, herpes, infección o quemadura:</strong> no trabajar en cabina como refuerzo; derivar o suspender.</div>
        <div><strong>Si hay manchas:</strong> priorizar fotoprotección, antioxidantes y baja irritación; cuidar riesgo de PIH.</div>
        <div><strong>Si el objetivo es firmeza:</strong> radiofrecuencia solo con checklist, consentimiento y manual del equipo.</div>
      </div>
    </section>
  `;
  document.querySelectorAll("#diagBurn,#diagWounds,#diagInflamed,#diagComedones,#diagSpots,#diagRosacea,#diagGoal,#diagBiotype").forEach((control) => {
    control.addEventListener("change", saveDiagnosisDraft);
  });
  $("[data-run-diagnosis]").addEventListener("click", () => {
    saveDiagnosisDraft();
    $("#diagnosisResult").innerHTML = diagnosisResultMarkup(app.store.diagnosisDraft);
  });
  $("[data-copy-diagnosis]").addEventListener("click", async () => {
    saveDiagnosisDraft();
    const text = diagnosisPlainText(app.store.diagnosisDraft);
    await navigator.clipboard?.writeText(text).catch(() => null);
    addActivity("diagnosis", "Copiaste un diagnóstico guiado a notas");
    saveStore();
    $("#diagnosisResult").innerHTML = `${diagnosisResultMarkup(app.store.diagnosisDraft)}<p class="muted">Resultado copiado.</p>`;
  });
}

function renderCases() {
  const rows = filterRows(app.data.cases);
  view.innerHTML = `
    <section class="data-grid">
      ${rows.map((item) => {
        const caseId = idFor(field(item, "Caso"));
        const solved = !!app.store.cases[caseId];
        return `
          <article class="academy-card data-card case-card">
            ${caseGallery(item)}
            <div class="section-head">
              <div>
                <p class="kicker">${escapeHtml(field(item, "Biotipo"))} · ${escapeHtml(field(item, "Edad"))} años</p>
                <h3>${escapeHtml(field(item, "Caso"))}</h3>
              </div>
              ${safetyBadge(item)}
            </div>
            <p>${escapeHtml(field(item, "Observaciones"))}</p>
            <div class="case-prompt">
              <strong>Preguntas guiadas</strong>
              <ol>
                <li>¿Qué observas?</li>
                <li>¿Qué no puedes asegurar?</li>
                <li>¿Qué preguntarías?</li>
                <li>¿Qué evitarías?</li>
                <li>¿Qué protocolo elegirías?</li>
              </ol>
            </div>
            <label class="field">
              <span>Notas del caso</span>
              <textarea data-case-notes="${escapeAttr(caseId)}" placeholder="Análisis antes de mostrar la respuesta...">${escapeHtml(app.store.caseNotes[caseId] || "")}</textarea>
            </label>
            <details class="answer-reveal block">
              <summary>Mostrar análisis sugerido</summary>
              <div>
                <p><strong>Diagnóstico:</strong> ${escapeHtml(field(item, "Diagnóstico estético"))}</p>
                <p><strong>Objetivo:</strong> ${escapeHtml(field(item, "Objetivo"))}</p>
                <p><strong>Aparatología:</strong> ${escapeHtml(field(item, "Aparatología elegida"))}</p>
                <p><strong>Justificación:</strong> ${escapeHtml(field(item, "Justificación"))}</p>
                <p><strong>Seguimiento:</strong> ${escapeHtml(field(item, "Seguimiento"))}</p>
              </div>
            </details>
            <button class="primary-btn full" data-solve-case="${escapeAttr(caseId)}" data-case-title="${escapeAttr(field(item, "Caso"))}" type="button">${solved ? "Caso resuelto" : "Marcar caso resuelto"}</button>
          </article>
        `;
      }).join("")}
    </section>
  `;
  document.querySelectorAll("[data-case-notes]").forEach((input) => {
    input.addEventListener("input", () => {
      app.store.caseNotes[input.dataset.caseNotes] = input.value;
      saveStore();
    });
  });
  document.querySelectorAll("[data-solve-case]").forEach((button) => {
    button.addEventListener("click", () => solveCase(button.dataset.solveCase, button.dataset.caseTitle));
  });
}

function renderIngredients() {
  const rows = filterRows(app.data.ingredients);
  view.innerHTML = `
    <section class="data-grid">
      ${rows.map((item) => `
        <article class="academy-card data-card">
          <p class="kicker">${escapeHtml(field(item, "Categoría"))}</p>
          <h3>${escapeHtml(field(item, "Ingrediente"))}</h3>
          <p>${escapeHtml(field(item, "Función"))}</p>
          <div class="tag-row">${splitTags(field(item, "Ideal para")).map((tag) => `<span class="tag mint">${escapeHtml(tag)}</span>`).join("")}</div>
          <p class="muted"><strong>Cuidar:</strong> ${escapeHtml(field(item, "Evitar o cuidar en") || "Según tolerancia")}</p>
          <p class="muted"><strong>Marcas:</strong> ${escapeHtml(field(item, "Marcas") || "Por revisar en etiquetas")}</p>
        </article>
      `).join("")}
    </section>
  `;
}

function renderProtocols() {
  const rows = filterRows(app.data.protocols);
  view.innerHTML = `
    <section class="academy-card">
      <p class="kicker">Constructor rápido</p>
      <div class="protocol-builder">
        ${selectField("goalPick", "Objetivo", [["Hidratación","Hidratación"],["Piel grasa","Piel grasa"],["Calmante","Calmante"],["Luminosidad/manchas","Luminosidad/manchas"],["Firmeza","Firmeza"]])}
        ${selectField("skinPick", "Tipo de piel", [["Grasa","Grasa"],["Seca","Seca"],["Mixta","Mixta"],["Normal","Normal"],["Sensible","Sensible"]])}
        ${selectField("conditionPick", "Condición", [["Deshidratada","Deshidratada"],["Sensibilizada","Sensibilizada"],["Congestionada","Congestionada"],["Manchas","Manchas"],["Flacidez leve","Flacidez leve"]])}
        <button class="primary-btn" data-build-protocol type="button">Sugerir enfoque</button>
      </div>
      <p id="protocolSuggestion" class="muted"></p>
    </section>
    <section class="data-grid">
      ${rows.map((item) => {
        const protocolId = idFor(field(item, "Protocolo"));
        const reviewed = !!app.store.protocols[protocolId];
        return `
          <article class="academy-card data-card protocol-card">
            <div class="section-head">
              <div>
                <p class="kicker">${escapeHtml(field(item, "Objetivo"))}</p>
                <h3>${escapeHtml(field(item, "Protocolo"))}</h3>
              </div>
              ${safetyBadge(item)}
            </div>
            <p><strong>Tipo de piel / condición:</strong> ${escapeHtml(field(item, "Tipo de piel"))} · ${escapeHtml(field(item, "Condición"))}</p>
            <p><strong>Aparatología:</strong> ${escapeHtml(field(item, "Aparatología") || "Sin aparatología")}</p>
            <p><strong>Contraindicaciones:</strong> ${escapeHtml(field(item, "Contraindicaciones"))}</p>
            <p><strong>Paso a paso:</strong> ${escapeHtml(field(item, "Paso a paso"))}</p>
            <p><strong>Cuidados posteriores:</strong> ${escapeHtml(field(item, "Cuidados posteriores"))}</p>
            <p class="muted"><strong>Cuándo derivar:</strong> si hay dolor, lesión sospechosa, infección, reacción intensa o condición médica fuera de cabina.</p>
            <button class="primary-btn full" data-review-protocol="${escapeAttr(protocolId)}" data-protocol-title="${escapeAttr(field(item, "Protocolo"))}" type="button">${reviewed ? "Protocolo repasado" : "Marcar protocolo repasado"}</button>
          </article>
        `;
      }).join("")}
    </section>
  `;
  $("[data-build-protocol]").addEventListener("click", buildProtocolSuggestion);
  document.querySelectorAll("[data-review-protocol]").forEach((button) => {
    button.addEventListener("click", () => reviewProtocol(button.dataset.reviewProtocol, button.dataset.protocolTitle));
  });
}

function renderResources() {
  const rows = filterRows(app.data.resources);
  view.innerHTML = `
    <section class="data-grid">
      ${rows.map((item) => `
        <article class="academy-card data-card">
          <p class="kicker">${escapeHtml(field(item, "Tipo"))} · ${escapeHtml(field(item, "Tema"))}</p>
          <h3>${escapeHtml(field(item, "Nombre"))}</h3>
          <p class="muted">${escapeHtml(field(item, "Notas"))}</p>
          <a class="primary-btn full" href="${escapeAttr(field(item, "URL"))}" target="_blank" rel="noreferrer">Abrir recurso</a>
        </article>
      `).join("")}
    </section>
  `;
}

function renderProgress() {
  const summary = progressSummary();
  const weeks = weeksList();
  view.innerHTML = `
    <section class="metric-grid">
      ${metricCard("Puntos totales", app.store.points, "gamificación local")}
      ${metricCard("Lecciones", `${summary.completedLessons}/${summary.totalLessons}`, `${summary.percent}%`)}
      ${metricCard("Quizzes aprobados", summary.approvedQuizzes, ">=70%")}
      ${metricCard("Casos resueltos", `${summary.solvedCases}/${app.data.cases.length}`, "+25 pts")}
    </section>
    <section class="academy-card">
      <p class="kicker">Progreso semanal</p>
      <div class="progress-week-list">
        ${weeks.map((week) => {
          const lessons = app.data.lessons.filter((lesson) => field(lesson, "Semana") === week);
          const done = lessons.filter((lesson) => isLessonComplete(field(lesson, "Lección"))).length;
          return `<div class="progress-week"><span>${escapeHtml(week)}</span><div class="progress-track"><div style="width:${(done / Math.max(lessons.length, 1)) * 100}%"></div></div><strong>${done}/${lessons.length}</strong></div>`;
        }).join("")}
      </div>
    </section>
    <section class="academy-card">
      <p class="kicker">Actividad reciente</p>
      ${activityMarkup(recentActivity(20))}
    </section>
  `;
}

function renderAchievements() {
  const items = achievements();
  view.innerHTML = `
    <section class="achievement-grid">
      ${items.map((item) => `
        <article class="academy-card achievement-card ${item.unlocked ? "unlocked" : "locked"}">
          <div class="achievement-icon">${item.unlocked ? "★" : "☆"}</div>
          <div>
            <p class="kicker">${item.unlocked ? "Desbloqueado" : "Bloqueado"}</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="muted">${escapeHtml(item.description)}</p>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function metricCard(label, value, hint) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function courseCard(course) {
  return `
    <article class="course-card">
      <div class="course-icon">${course.icon}</div>
      <h3>${escapeHtml(course.title)}</h3>
      <p class="muted">${escapeHtml(course.description)}</p>
      <div class="progress-track"><div style="width:${course.progress}%"></div></div>
      <span>${course.progress}%</span>
    </article>
  `;
}

function lessonCard(lesson) {
  const title = field(lesson, "Lección");
  return `
    <article class="academy-card lesson-item">
      <div class="section-head">
        <div>
          <p class="kicker">${escapeHtml(field(lesson, "Semana"))} · ${escapeHtml(field(lesson, "Día"))}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        ${safetyBadge(lesson)}
      </div>
      <p class="muted">${escapeHtml(field(lesson, "Objetivo"))}</p>
      <div class="lesson-meta-row">
        <span>${escapeHtml(field(lesson, "Tema"))}</span>
        ${isLessonComplete(title) ? "<span>Completada</span>" : "<span>Pendiente</span>"}
      </div>
      <button class="primary-btn full" data-open-lesson="${escapeAttr(title)}" type="button">Abrir sesión</button>
    </article>
  `;
}

function visualBlock(visual) {
  return `
    <figure class="lesson-visual">
      <img src="${escapeAttr(`${BASE}/${field(visual, "Imagen")}`)}" alt="${escapeAttr(field(visual, "Título"))}" loading="lazy">
      <figcaption>${escapeHtml(field(visual, "Uso sugerido"))} · ${escapeHtml(field(visual, "Fuente"))}</figcaption>
    </figure>
  `;
}

function caseGallery(item) {
  const images = splitTags(field(item, "Imagenes") || field(item, "Imagen")).map((image) => image.startsWith("http") ? image : `${BASE}/${image}`);
  if (!images.length) return "";
  return `
    <figure class="case-gallery">
      <div class="case-gallery-grid">
        ${images.map((image, index) => `<img src="${escapeAttr(image)}" alt="${escapeAttr(`${field(item, "Caso")} referencia ${index + 1}`)}" loading="lazy">`).join("")}
      </div>
      <figcaption>Imágenes de referencia: <a href="${escapeAttr(field(item, "Fuente imagen"))}" target="_blank" rel="noreferrer">${escapeHtml(field(item, "Crédito") || "Fuente")}</a></figcaption>
    </figure>
  `;
}

function updateGlobalChrome() {
  const summary = progressSummary();
  $("#sideProgressText").textContent = `${summary.percent}%`;
  $("#sideProgressBar").style.width = `${summary.percent}%`;
  $("#sidePoints").textContent = app.store.points;

  const lesson = nextLesson();
  $("#railLessonTitle").textContent = lesson.lessonTitle;
  $("#railLessonMeta").textContent = `${lesson.week} · ${lesson.day} · ${field(lesson.lesson, "Tema")}`;
  const recent = recentActivity(4);
  $("#activityCount").textContent = app.store.activity.length;
  $("#railActivity").innerHTML = activityMarkup(recent, true);
}

function bindOpenLessonButtons() {
  document.querySelectorAll("[data-open-lesson]").forEach((button) => {
    button.addEventListener("click", () => openLesson(button.dataset.openLesson));
  });
}

function openLesson(title) {
  app.currentLesson = title;
  app.view = "today";
  setActiveNav();
  render();
}

function toggleLessonComplete(title) {
  const wasDone = isLessonComplete(title);
  if (wasDone) {
    delete app.store.lessons[title];
  } else {
    app.store.lessons[title] = { completedAt: new Date().toISOString() };
    awardOnce(`lesson:${idFor(title)}`, points.lesson, `Completaste ${title}`);
    addActivity("lesson", `Completaste una lección: ${title}`);
    maybeAwardWeekComplete(weekForLesson(title));
  }
  checkAchievements();
  saveStore();
  render();
}

function markFlashcard(card, status) {
  const cardId = idFor(field(card, "Pregunta"));
  app.store.flashcards[cardId] = { status, updatedAt: new Date().toISOString() };
  if (status === "known") {
    awardOnce(`flashcard:${cardId}`, points.flashcard, `Repasaste una flashcard de ${field(card, "Semana")}`);
    addActivity("flashcard", `Repasaste flashcard: ${field(card, "Pregunta")}`);
  }
  checkAchievements();
  saveStore();
  app.showFlashAnswer = false;
  app.flashIndex = (app.flashIndex + 1) % Math.max(app.data.flashcards.filter((item) => field(item, "Semana") === app.week).length, 1);
  render();
}

function solveCase(caseId, title) {
  if (!app.store.cases[caseId]) {
    app.store.cases[caseId] = { solvedAt: new Date().toISOString() };
    awardOnce(`case:${caseId}`, points.caseSolved, `Resolviste caso práctico: ${title}`);
    addActivity("case", `Resolviste un caso: ${title}`);
    checkAchievements();
    saveStore();
  }
  render();
}

function reviewProtocol(protocolId, title) {
  if (!app.store.protocols[protocolId]) {
    app.store.protocols[protocolId] = { reviewedAt: new Date().toISOString() };
    awardOnce(`protocol:${protocolId}`, points.protocolReviewed, `Repasaste protocolo: ${title}`);
    addActivity("protocol", `Repasaste protocolo: ${title}`);
    checkAchievements();
    saveStore();
  }
  render();
}

function buildProtocolSuggestion() {
  const goal = $("#goalPick").value;
  const condition = $("#conditionPick").value;
  const skin = $("#skinPick").value;
  const sensitive = condition === "Sensibilizada" || skin === "Sensible";
  let text = `Objetivo ${goal}: iniciar con ficha, limpieza suave, observación, hidratación y protector solar al cierre. `;
  if (sensitive) text += "Evitar vapor intenso, microdermoabrasión, ácidos fuertes y radiofrecuencia hasta confirmar tolerancia.";
  else if (goal === "Piel grasa") text += "Considerar vapor corto, extracción puntual y alta frecuencia solo si no hay contraindicaciones.";
  else if (goal === "Firmeza") text += "Radiofrecuencia solo con contraindicaciones descartadas, consentimiento y manual del equipo.";
  else if (goal === "Luminosidad/manchas") text += "Elegir enfoque gradual, antioxidante y fotoprotección estricta.";
  else text += "Priorizar humectantes, emolientes y mascarilla hidratante.";
  $("#protocolSuggestion").textContent = text;
}

function saveDiagnosisDraft() {
  app.store.diagnosisDraft = {
    diagBurn: $("#diagBurn").value,
    diagWounds: $("#diagWounds").value,
    diagInflamed: $("#diagInflamed").value,
    diagComedones: $("#diagComedones").value,
    diagSpots: $("#diagSpots").value,
    diagRosacea: $("#diagRosacea").value,
    diagGoal: $("#diagGoal").value,
    diagBiotype: $("#diagBiotype").value
  };
  saveStore();
}

function diagnosisResultMarkup(input) {
  const result = diagnosisResult(input);
  return `
    <div class="diagnosis-output">
      ${safetyChip(result.level)}
      <p><strong>Biotipo probable:</strong> ${escapeHtml(input.diagBiotype || "Por definir")}</p>
      <p><strong>Condiciones probables:</strong> ${escapeHtml(result.conditions.join(", ") || "sin condición dominante clara")}</p>
      <p><strong>Qué evitar hoy:</strong> ${escapeHtml(result.avoid.join(", ") || "evitar improvisar; trabajar conservador")}</p>
      <p><strong>Aparatología sugerida o evitada:</strong> ${escapeHtml(result.devices)}</p>
      <p><strong>Recomendación educativa:</strong> ${escapeHtml(result.advice)}</p>
    </div>
  `;
}

function diagnosisPlainText(input) {
  const result = diagnosisResult(input);
  return [
    "Diagnóstico guiado - Ivania Facial Lab",
    `Biotipo probable: ${input.diagBiotype || "Por definir"}`,
    `Condiciones probables: ${result.conditions.join(", ") || "sin condición dominante clara"}`,
    `Seguridad: ${result.level}`,
    `Evitar hoy: ${result.avoid.join(", ") || "trabajo conservador"}`,
    `Aparatología: ${result.devices}`,
    `Recomendación: ${result.advice}`
  ].join("\n");
}

function diagnosisResult(input) {
  const conditions = [];
  const avoid = [];
  let level = "verde";
  let devices = "Sin aparatología agresiva; elegir según objetivo y tolerancia.";
  let advice = `Objetivo principal: ${input.diagGoal || "Hidratación"}. Trabajar con ficha, higiene y observación estética.`;

  if (input.diagBurn === "yes") {
    level = "amarillo";
    conditions.push("barrera alterada o sensibilidad");
    avoid.push("vapor intenso", "microdermoabrasión", "ácidos fuertes", "extracción agresiva");
    devices = "Evitar microdermoabrasión y radiofrecuencia; priorizar protocolo calmante.";
  }
  if (input.diagWounds === "yes") {
    level = "rojo";
    conditions.push("lesión activa o riesgo de infección");
    avoid.push("manipulación", "extracción", "aparatología", "exfoliación");
    devices = "No usar aparatología. Suspender práctica y derivar si corresponde.";
    advice = "No trabajar en cabina como refuerzo; estudiar como alerta y derivar.";
  }
  if (input.diagInflamed === "yes") {
    level = level === "rojo" ? "rojo" : "amarillo";
    conditions.push("inflamación importante");
    avoid.push("extracción agresiva", "microdermoabrasión");
  }
  if (input.diagComedones === "yes" && level !== "rojo") {
    conditions.push("comedones");
    devices = "Vapor corto/localizado y alta frecuencia solo si barrera y contraindicaciones lo permiten.";
  }
  if (input.diagSpots === "yes") {
    conditions.push("manchas o PIH");
    avoid.push("irritación", "sobreexfoliación", "sol sin protección");
    advice += " Priorizar fotoprotección y manejo gradual.";
  }
  if (input.diagRosacea === "yes") {
    level = level === "rojo" ? "rojo" : "amarillo";
    conditions.push("piel reactiva o rosácea sospechosa");
    avoid.push("calor", "vapor", "fricción intensa");
    devices = "Evitar calor y aparatos estimulantes; considerar derivación si hay brote.";
  }
  if (input.diagGoal === "Firmeza" && level === "verde") {
    level = "amarillo";
    devices = "Radiofrecuencia solo con checklist, consentimiento y manual del equipo.";
  }

  return { level, conditions: unique(conditions), avoid: unique(avoid), devices, advice };
}

function selectField(id, label, options, selected = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select id="${escapeAttr(id)}">
        ${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function safetyLevelFor(item) {
  const text = Object.values(item || {}).join(" ").toLowerCase();
  if (/microneedling|láser|laser|ipl|rf con agujas|procedimiento médico|solo teoría/.test(text)) return "solo_teoria";
  if (/herpes|infecci|herida|lesión sospechosa|acné inflamatorio severo|derivar|quemadura solar/.test(text)) return "rojo";
  if (/microdermo|radiofrecuencia|alta frecuencia|vapor|aparatolog|extracción|ácido|peeling|barrera dañada|rosácea|sensibilizada|embarazo|implante/.test(text)) return "amarillo";
  return "verde";
}

function safetyCopy(level) {
  return {
    verde: "Práctica de repaso segura si se mantienen higiene, ficha y consentimiento.",
    amarillo: "Requiere criterio, supervisión, contraindicaciones descartadas y manual del equipo.",
    rojo: "No practicar; suspender, derivar o estudiar como alerta.",
    solo_teoria: "Solo teoría: estudiar, no ejecutar como práctica de refuerzo."
  }[level] || "Revisar seguridad antes de practicar.";
}

function safetyBadge(item) {
  return safetyChip(safetyLevelFor(item));
}

function safetyChip(level) {
  return `<span class="safety-chip ${escapeAttr(level)}">${escapeHtml(level.replace("_", " "))}</span>`;
}

function safetyNote(item) {
  const level = safetyLevelFor(item);
  return `<div class="safety-note ${escapeAttr(level)}"><strong>Seguridad:</strong> ${escapeHtml(safetyCopy(level))}</div>`;
}

function achievements() {
  const completedWeek = (week) => app.data.lessons.filter((lesson) => field(lesson, "Semana") === week).every((lesson) => isLessonComplete(field(lesson, "Lección")));
  return [
    { id: "skin-detective", title: "Detective de piel", description: "Completar Semana 1.", unlocked: completedWeek("Semana 1") },
    { id: "barrier-guardian", title: "Guardiana de la barrera", description: "Completar Semana 2.", unlocked: completedWeek("Semana 2") },
    { id: "safe-cabin", title: "Modo cabina segura", description: "Completar temas de seguridad o diagnóstico guiado.", unlocked: completedWeek("Semana 8") || !!app.store.diagnosisDraft?.diagGoal },
    { id: "ingredient-pro", title: "Ingredientes Pro", description: "Repasar 15 ingredientes o terminar la ruta de ingredientes.", unlocked: app.data.ingredients.length >= 15 && Object.keys(app.store.flashcards).length >= 15 },
    { id: "protocol-criteria", title: "Protocolos con criterio", description: "Repasar 5 protocolos.", unlocked: Object.keys(app.store.protocols).length >= 5 },
    { id: "final-diagnosis", title: "Diagnóstico final", description: "Resolver casos de Semana 12 o todos los casos prácticos.", unlocked: Object.keys(app.store.cases).length >= app.data.cases.length }
  ];
}

function checkAchievements() {
  achievements().forEach((achievement) => {
    if (achievement.unlocked && !app.store.achievements[achievement.id]) {
      app.store.achievements[achievement.id] = { unlockedAt: new Date().toISOString() };
      addActivity("achievement", `Desbloqueaste logro: ${achievement.title}`);
    }
  });
}

function miniAchievement(achievement) {
  return `<div class="mini-achievement ${achievement.unlocked ? "unlocked" : "locked"}"><span>${achievement.unlocked ? "★" : "☆"}</span><div><strong>${escapeHtml(achievement.title)}</strong><small>${escapeHtml(achievement.description)}</small></div></div>`;
}

function progressSummary() {
  const completedLessons = Object.keys(app.store.lessons).length;
  const totalLessons = app.data.lessons.length || 48;
  const approvedQuizzes = Object.values(app.store.quizAttempts).filter((attempt) => attempt.approved).length;
  const pendingFlashcards = app.data.flashcards.length - Object.values(app.store.flashcards).filter((card) => card.status === "known").length;
  const solvedCases = Object.keys(app.store.cases).length;
  const percent = Math.round((completedLessons / Math.max(totalLessons, 1)) * 100);
  const currentWeek = Math.min(12, Math.max(1, Math.ceil((completedLessons + 1) / 4)));
  return { completedLessons, totalLessons, approvedQuizzes, pendingFlashcards: Math.max(0, pendingFlashcards), solvedCases, percent, currentWeek };
}

function nextLesson() {
  const lesson = app.data.lessons.find((item) => !isLessonComplete(field(item, "Lección"))) || app.data.lessons[0] || {};
  return {
    lesson,
    lessonTitle: field(lesson, "Lección") || "Sin lección",
    week: field(lesson, "Semana") || "Semana 1",
    day: field(lesson, "Día") || "Lunes"
  };
}

function upcomingLessons(count) {
  return app.data.lessons.filter((lesson) => !isLessonComplete(field(lesson, "Lección"))).slice(0, count);
}

function courseCards() {
  const completed = (predicate) => {
    const lessons = app.data.lessons.filter(predicate);
    if (!lessons.length) return 0;
    return Math.round((lessons.filter((lesson) => isLessonComplete(field(lesson, "Lección"))).length / lessons.length) * 100);
  };
  return [
    { icon: "✦", title: "Tratamientos Faciales", description: "Ruta completa de 12 semanas.", progress: progressSummary().percent },
    { icon: "◇", title: "Diagnóstico facial", description: "Biotipo, condición y decisión segura.", progress: completed((lesson) => /Diagnóstico|Casos/.test(field(lesson, "Tema"))) },
    { icon: "◌", title: "Ingredientes cosméticos", description: "Activos, funciones y precauciones.", progress: completed((lesson) => /Ingredientes/.test(field(lesson, "Tema"))) },
    { icon: "☑", title: "Aparatología segura", description: "Vapor, alta frecuencia, microdermo y RF.", progress: completed((lesson) => /Aparatología/.test(field(lesson, "Tema"))) },
    { icon: "▣", title: "Casos de cabina", description: "Práctica con imágenes y criterio.", progress: Math.round((Object.keys(app.store.cases).length / Math.max(app.data.cases.length, 1)) * 100) }
  ];
}

function weekTitle(week) {
  const titles = {
    "Semana 1": "Diagnóstico facial",
    "Semana 2": "Barrera cutánea",
    "Semana 3": "Limpieza profesional",
    "Semana 4": "Exfoliación",
    "Semana 5": "Hidratación y reparación",
    "Semana 6": "Acné, piel grasa y comedones",
    "Semana 7": "Manchas y fotoprotección",
    "Semana 8": "Piel reactiva y contraindicaciones",
    "Semana 9": "Envejecimiento y radiofrecuencia",
    "Semana 10": "Alta frecuencia y matriz de aparatos",
    "Semana 11": "Protocolos completos",
    "Semana 12": "Casos finales y evaluación"
  };
  return titles[week] || week;
}

function maybeAwardWeekComplete(week) {
  if (!week) return;
  const lessons = app.data.lessons.filter((lesson) => field(lesson, "Semana") === week);
  if (lessons.length && lessons.every((lesson) => isLessonComplete(field(lesson, "Lección")))) {
    awardOnce(`week:${idFor(week)}`, points.weekComplete, `Completaste ${week}`);
  }
}

function weekForLesson(title) {
  return field(app.data.lessons.find((lesson) => field(lesson, "Lección") === title), "Semana");
}

function isLessonComplete(title) {
  return !!app.store.lessons[title];
}

function statusLabel(status) {
  return {
    known: "Lo sabía",
    review: "Repasar",
    pending: "Pendiente"
  }[status] || "Pendiente";
}

function awardOnce(id, amount, label) {
  if (app.store.pointLedger[id]) return false;
  app.store.pointLedger[id] = { amount, label, at: new Date().toISOString() };
  app.store.points += amount;
  addActivity("points", `${label} (+${amount} pts)`);
  return true;
}

function addActivity(type, text) {
  app.store.activity.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, type, text, at: new Date().toISOString() });
  app.store.activity = app.store.activity.slice(0, 80);
}

function addActivityOnce(id, type, text) {
  if (app.store.activity.some((item) => item.id === id)) return;
  app.store.activity.unshift({ id, type, text, at: new Date().toISOString() });
  app.store.activity = app.store.activity.slice(0, 80);
}

function recentActivity(count) {
  return app.store.activity.slice(0, count);
}

function activityMarkup(items, compact = false) {
  if (!items.length) return `<div class="empty-inline">Todavía no hay actividad. Empieza una sesión para registrar avances.</div>`;
  return `<div class="activity-list ${compact ? "compact" : ""}">${items.map((item) => `<div class="activity-item"><span>${activityIcon(item.type)}</span><div><strong>${escapeHtml(item.text)}</strong><small>${formatDate(item.at)}</small></div></div>`).join("")}</div>`;
}

function activityIcon(type) {
  return { lesson: "✓", quiz: "?", flashcard: "◐", case: "▣", protocol: "☑", achievement: "★", points: "+" }[type] || "•";
}

function correctOptionFor(question) {
  const correct = field(question, "Respuesta correcta").trim();
  return field(question, "Opciones").split("|").map((item) => item.trim()).find((option) => option.startsWith(correct)) || correct;
}

function resetQuizRuntime() {
  app.quizIndex = 0;
  app.quizAnswers = {};
  app.quizFinished = false;
  app.quizScope = [];
}

function loadStore() {
  const existing = JSON.parse(localStorage.getItem(appStateKey) || "null");
  const store = existing || {
    version: 2,
    lessons: {},
    notes: {},
    quizAttempts: {},
    flashcards: {},
    cases: {},
    caseNotes: {},
    protocols: {},
    points: 0,
    pointLedger: {},
    achievements: {},
    activity: [],
    diagnosisDraft: {}
  };
  store.lessons ||= {};
  store.notes ||= {};
  store.quizAttempts ||= {};
  store.flashcards ||= {};
  store.cases ||= {};
  store.caseNotes ||= {};
  store.protocols ||= {};
  store.pointLedger ||= {};
  store.points ||= 0;
  store.achievements ||= {};
  store.activity ||= [];
  store.diagnosisDraft ||= {};

  const oldProgress = JSON.parse(localStorage.getItem(oldProgressKey) || "{}");
  Object.entries(oldProgress).forEach(([title, done]) => {
    if (done && !store.lessons[title]) store.lessons[title] = { completedAt: "migrated" };
  });
  const oldNotes = JSON.parse(localStorage.getItem(oldNotesKey) || "{}");
  Object.entries(oldNotes).forEach(([title, note]) => {
    if (note && !store.notes[title]) store.notes[title] = note;
  });
  localStorage.setItem(appStateKey, JSON.stringify(store));
  return store;
}

function saveStore() {
  localStorage.setItem(appStateKey, JSON.stringify(app.store));
  localStorage.setItem(oldProgressKey, JSON.stringify(Object.fromEntries(Object.keys(app.store.lessons).map((title) => [title, true]))));
  localStorage.setItem(oldNotesKey, JSON.stringify(app.store.notes));
  updateGlobalChrome();
}

async function loadCsv(url) {
  const text = await fetchText(url);
  return parseCsv(text);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quote && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === "," && !quote) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quote) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map(normalizeText);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, normalizeText(cells[index] || "")])));
}

function field(row, name) {
  if (!row) return "";
  return row[name] ?? row[normalizeText(name)] ?? "";
}

function normalizeText(value) {
  let text = String(value ?? "");
  if (/[ÃÂ]/.test(text)) {
    try {
      text = new TextDecoder("utf-8").decode(Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 255)));
    } catch {}
  }
  return text;
}

function extractLessonSection(markdown, lessonTitle) {
  const day = lessonTitle.match(/Día\s+(\d+)/)?.[1] || lessonTitle.match(/Dia\s+(\d+)/)?.[1];
  if (!day) return markdown;
  const heading = `## Dia ${Number(day)}`;
  const start = markdown.indexOf(heading);
  if (start === -1) return markdown;
  const next = markdown.indexOf("\n## Dia ", start + heading.length);
  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  let html = "";
  let inList = false;
  let inOrdered = false;
  let inTable = false;
  let tableRows = [];

  const closeLists = () => {
    if (inList) html += "</ul>";
    if (inOrdered) html += "</ol>";
    inList = false;
    inOrdered = false;
  };
  const flushTable = () => {
    if (!inTable) return;
    const [head, separator, ...body] = tableRows;
    if (head && separator) {
      const th = splitTable(head).map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
      const trs = body.map((row) => `<tr>${splitTable(row).map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("");
      html += `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    }
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    if (line.includes("|") && line.trim().startsWith("|")) {
      closeLists();
      inTable = true;
      tableRows.push(line);
      continue;
    }
    flushTable();
    if (!line.trim()) {
      closeLists();
      continue;
    }
    if (line.startsWith("# ")) {
      closeLists();
      html += `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
    } else if (line.startsWith("## ")) {
      closeLists();
      html += `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
    } else if (line.startsWith("### ")) {
      closeLists();
      html += `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
    } else if (/^\d+\.\s/.test(line)) {
      if (!inOrdered) {
        closeLists();
        html += "<ol>";
        inOrdered = true;
      }
      html += `<li>${studyLineToHtml(line.replace(/^\d+\.\s/, ""))}</li>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        closeLists();
        html += "<ul>";
        inList = true;
      }
      html += `<li>${studyLineToHtml(line.slice(2))}</li>`;
    } else {
      closeLists();
      html += `<p>${studyLineToHtml(line)}</p>`;
    }
  }
  flushTable();
  closeLists();
  return html;
}

function splitTable(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter((cell) => !/^---+$/.test(cell));
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[(?:.*?\|)?(.*?)\]\]/g, "$1");
}

function studyLineToHtml(text) {
  const answerMatch = text.match(/^(.*?)(?:\s*)Respuesta(?: esperada)?:\s*(.+)$/i);
  if (!answerMatch) return inlineMarkdown(text);
  const prompt = answerMatch[1].trim();
  const answer = answerMatch[2].trim();
  const promptHtml = prompt ? `${inlineMarkdown(prompt)} ` : "";
  return `${promptHtml}<details class="answer-reveal"><summary>Mostrar respuesta</summary><div>${inlineMarkdown(answer)}</div></details>`;
}

function splitTags(value) {
  return (value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function filterRows(rows) {
  if (!app.search) return rows;
  return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(app.search));
}

function weeksList() {
  return unique(app.data.lessons.map((lesson) => field(lesson, "Semana")).filter(Boolean));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function idFor(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value) {
  if (!value) return "";
  if (value === "migrated") return "migrado";
  return new Date(value).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
