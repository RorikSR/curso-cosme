const BASE = "data";

const files = {
  lessons: `${BASE}/Lecciones.csv`,
  flashcards: `${BASE}/Flashcards.csv`,
  quizzes: `${BASE}/Quizzes.csv`,
  ingredients: `${BASE}/Ingredientes.csv`,
  protocols: `${BASE}/Protocolos.csv`,
  cases: `${BASE}/Casos prácticos.csv`,
  resources: `${BASE}/Recursos.csv`,
  visuals: `${BASE}/Visuales.csv`
};

const oldProgressKey = "ivania-course-progress-v1";
const oldNotesKey = "ivania-course-notes-v1";
const appStateKey = "ivania-facial-lab-state-v2";

const firebaseConfig = {
  // TODO: Reemplaza con tu configuración real de Firebase
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

let db = null;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  }
} catch (e) {
  console.warn("Firebase init error:", e);
}

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
  week: "all",
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
  globalStore: null,
  store: null
};

const $ = (selector) => document.querySelector(selector);
const view = $("#view");

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  try {
    // 1) Resolver la sesión consultando al servidor (cookie httpOnly). Si hay
    //    sesión válida, `session` queda con { user, role, profile }; si no, null.
    session = await fetchServerSession();

    // 2) Preparar el store local. loadStore() ya NO lee la sesión de
    //    localStorage: deriva el perfil activo de la variable `session`.
    app.store = await loadStore();

    // 3) Cablear controles y formulario de login.
    setupControls();
    setupLoginForm();

    // 4) Access gate ANTES de exponer el contenido: sin sesión se muestra la
    //    Pantalla_Login y se oculta .academy-shell.
    applyAccessState();

    // 5) Con sesión válida cargamos el contenido protegido (/data) y poblamos
    //    el selector de semana. Sin sesión, app.data.* queda vacío y el selector
    //    vacío, lo cual es correcto porque el contenido está oculto.
    if (session) {
      try {
        await loadAllContent();
        populateWeekSelect();
      } catch (error) {
        // 6) Si la carga falla con 401, la sesión se perdió: limpiar y volver
        //    a la Pantalla_Login. Otros errores se propagan al catch externo.
        if (error && error.status === 401) {
          session = null;
          applyAccessState();
        } else {
          throw error;
        }
      }
    }

    render();
    // Reafirmar el estado de acceso tras render() (render no toca el overlay
    // ni el shell, pero mantenemos la invariante de gating de forma explícita).
    applyAccessState();
  } catch (error) {
    console.error(error);
    view.innerHTML = `<section class="empty-state"><strong>No pude cargar el curso.</strong><p>Revisa que el servidor local esté abierto en la carpeta del curso y que los CSV existan.</p><code>${escapeHtml(error.message)}</code></section>`;
  }
}

// Carga TODO el contenido protegido (CSV de /data) y lo asigna a app.data.*.
// Requiere sesión válida: sin cookie, las peticiones a /data devuelven 401 y
// loadCsv → fetchText lanza un error con .status === 401.
async function loadAllContent() {
  const loaded = await Promise.all([
    loadCsv(files.lessons, "lessons"),
    loadCsv(files.flashcards, "flashcards"),
    loadCsv(files.quizzes, "quizzes"),
    loadCsv(files.ingredients, "ingredients"),
    loadCsv(files.protocols, "protocols"),
    loadCsv(files.cases, "cases"),
    loadCsv(files.resources, "resources"),
    loadCsv(files.visuals, "visuals")
  ]);
  [app.data.lessons, app.data.flashcards, app.data.quizzes, app.data.ingredients, app.data.protocols, app.data.cases, app.data.resources, app.data.visuals] = loaded;
}

// Rellena el <select id="weekSelect"> con las semanas disponibles según las
// lecciones cargadas. Se llama en init (tras cargar contenido) y tras un login
// exitoso, para que el selector se llene una vez que app.data.lessons existe.
function populateWeekSelect() {
  const weekSelect = $("#weekSelect");
  if (!weekSelect) return;
  const weeks = weeksList();
  weekSelect.innerHTML = `<option value="all">Todas las semanas</option>` + weeks.map((week) => `<option value="${escapeAttr(week)}">${escapeHtml(week)}</option>`).join("");
  weekSelect.value = app.week;
}

function setupControls() {
  populateWeekSelect();
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
      // En móvil, seleccionar una opción de navegación cierra el drawer (R9.5).
      // En escritorio closeSidebar() es inofensivo (no hay clase .sidebar-open).
      closeSidebar();
    });
  });

  $("#railStartLesson").addEventListener("click", () => {
    const lesson = nextLesson();
    openLesson(lesson.lessonTitle);
  });

  // Control de sesión real (R5.1, R5.2): el botón "Cerrar sesión" llama al
  // backend (POST /api/logout) para invalidar la cookie de sesión y luego
  // applyAccessState() vuelve a mostrar la Pantalla_Login.
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await apiLogout();
      applyAccessState();
    });
  }

  const toggleBtn = document.getElementById("toggleSidebarBtn");
  if (toggleBtn) {
    if (app.globalStore && app.globalStore.sidebarCollapsed) {
      document.querySelector(".academy-shell").classList.add("sidebar-collapsed");
    }
    toggleBtn.addEventListener("click", () => {
      // El botón ☰ tiene dos comportamientos según el ancho de pantalla:
      //  - En móvil (<= 820px) abre/cierra el DRAWER superpuesto (.sidebar-open),
      //    sin tocar el colapso de escritorio (R9.3, R9.4).
      //  - En escritorio mantiene el colapso del grid (.sidebar-collapsed) con
      //    persistencia en globalStore.sidebarCollapsed.
      if (isMobileViewport()) {
        toggleSidebar();
        return;
      }
      const shell = document.querySelector(".academy-shell");
      const isCollapsed = shell.classList.toggle("sidebar-collapsed");
      if (app.globalStore) {
        app.globalStore.sidebarCollapsed = isCollapsed;
        saveStore();
      }
    });
  }

  // Asegura el nodo .sidebar-backdrop y cablea el cierre del drawer al tocarlo (R9.4).
  ensureSidebarBackdrop();
}

// ---------------------------------------------------------------------
// Controlador del drawer móvil del Sidebar (tarea 5.2 / Requirement 9)
// ---------------------------------------------------------------------
// En la Interfaz_Movil el Sidebar se presenta como panel superpuesto (drawer)
// mediante la clase .sidebar-open en .academy-shell; el CSS (tarea 5.1) define
// el deslizamiento y el backdrop bajo @media (max-width: 820px).

// matchMedia compartido para decidir el modo móvil (<= 820px). Coincide con la
// media query del CSS, de modo que JS y estilos cambian de modo a la vez.
// Se construye de forma defensiva: en entornos sin window.matchMedia (p. ej. el
// harness de pruebas que carga app.js para exponer la lógica pura) queda en null
// y isMobileViewport() devuelve false sin lanzar al cargar el módulo.
const mobileMediaQuery = (typeof window !== "undefined" && typeof window.matchMedia === "function")
  ? window.matchMedia("(max-width: 820px)")
  : null;

// Devuelve true cuando el viewport corresponde a la Interfaz_Movil (<= 820px).
function isMobileViewport() {
  return !!(mobileMediaQuery && mobileMediaQuery.matches);
}

// Crea el nodo .sidebar-backdrop dentro de .academy-shell si aún no existe y
// le cabla el cierre del drawer al hacer clic (R9.4). El CSS solo lo hace
// visible/interactivo cuando .academy-shell tiene la clase .sidebar-open.
function ensureSidebarBackdrop() {
  const shell = document.querySelector(".academy-shell");
  if (!shell) return null;
  let backdrop = shell.querySelector(".sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("click", () => closeSidebar());
    shell.appendChild(backdrop);
  }
  return backdrop;
}

// Alterna la apertura/cierre del drawer móvil (R9.3, R9.4).
function toggleSidebar() {
  const shell = document.querySelector(".academy-shell");
  if (!shell) return;
  ensureSidebarBackdrop();
  shell.classList.toggle("sidebar-open");
}

// Cierra el drawer móvil quitando .sidebar-open; el backdrop se oculta vía CSS.
// Es seguro llamarla en escritorio: si no hay drawer abierto, no hace nada.
function closeSidebar() {
  const shell = document.querySelector(".academy-shell");
  if (!shell) return;
  shell.classList.remove("sidebar-open");
}

function resetSwiperAndMap() {
  if (flashSwiper) {
    try { flashSwiper.destroy(true, true); } catch(e) {}
    flashSwiper = null;
  }
  if (anatomyMapInstance) {
    try { anatomyMapInstance.remove(); } catch(e) {}
    anatomyMapInstance = null;
  }
}

function render() {
  resetSwiperAndMap();
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
    anatomy: renderAnatomy,
    flashcards: renderFlashcards,
    quizzes: renderQuizzes,
    resources: renderResources,
    progress: renderProgress,
    achievements: renderAchievements,
    admin: renderAdmin
  };
  
  // Router guard basado en el ROL real de la sesión (R3.3, R3.4). Es el control
  // PRIMARIO de acceso al Panel_Administracion: si un student (o una sesión sin
  // rol) solicita "admin", se fuerza app.view = "home" ANTES de despachar la
  // vista, en lugar de depender únicamente de la ocultación visual (CSS).
  // El rol se deriva de la sesión; rol ausente se trata como no-admin.
  const currentRole = session?.role;
  if (!canAccessView(app.view, currentRole)) {
    app.view = "home";
  }
  
  (routes[app.view] || renderHome)();
}

function titleForView(viewName) {
  return {
    home: "Inicio",
    roadmap: "Ruta de estudio",
    today: "Lección de hoy",
    diagnosis: "Diagnóstico guiado",
    cases: "Casos prácticos",
    ingredients: "Ingredientes",
    protocols: "Protocolos",
    anatomy: "Visor Anatómico",
    flashcards: "Flashcards",
    quizzes: "Quizzes",
    resources: "Recursos",
    progress: "Progreso",
    achievements: "Logros",
    admin: "Administración"
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
    anatomy: "Músculos y drenaje facial interactivo",
    flashcards: "Repaso activo",
    quizzes: "Evaluación sin pistas",
    resources: "Fuentes y enlaces",
    progress: "Historial local",
    achievements: "Gamificación",
    admin: "Panel de control"
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

  // El saludo refleja el PERFIL de la sesión activa (R5.2): ivi→Ivania,
  // xime→Ximena, admin→Administrador.
  const displayName = (session && PROFILE_LABELS[session.profile]) || "Estudiante";

  view.innerHTML = `
    <section class="hero-panel">
      <div>
        <p class="kicker">Bienvenida, ${escapeHtml(displayName)}</p>
        <h2>Semana actual: ${summary.currentWeek} de ${summary.totalWeeks}</h2>
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
  const selectedWeek = app.week && app.week !== "all" ? app.week : null;
  const filteredWeeks = selectedWeek ? [selectedWeek] : weeksList();
  const grouped = filteredWeeks.map((week) => ({
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
  // Semanas con al menos una pregunta: sirven como availableWeeks para
  // resolveWeek (cálculo de hasContent) y como opciones del selector embebido
  // (R12.5, R12.6).
  const quizWeeks = weeksWithContent(app.data.quizzes);
  // Semana_Actual sugerida: nextLesson().week devuelve "Semana N" directamente.
  const currentWeek = nextLesson().week;
  // Resolver la semana efectiva: si el selector está en "Todas las semanas"
  // ("all") se usa la Semana_Actual; nunca se cae en el estado vacío
  // "Selecciona una semana" (R12.1, R12.2).
  const { week: activeWeek, hasContent } = resolveWeek(app.week, currentWeek, quizWeeks);
  // Selector_Semana EMBEBIDO: convive con el de la topbar; ambos cambian app.week.
  const selectorMarkup = embeddedWeekSelector(activeWeek, quizWeeks);

  // Si la semana resuelta no tiene preguntas, mostrar la ausencia de contenido
  // PERO siempre ofreciendo el selector para elegir otra semana (R12.6).
  if (!hasContent) {
    view.innerHTML = `
      <section class="view-with-week-selector">
        ${selectorMarkup}
        <div class="empty-state">
          <strong>No hay quizzes para ${escapeHtml(activeWeek)}.</strong>
          <p>Elige otra semana en el selector para tomar un quiz de opción múltiple.</p>
        </div>
      </section>
    `;
    bindEmbeddedWeekSelector();
    return;
  }

  const questions = filterRows(app.data.quizzes.filter((quiz) => field(quiz, "Semana") === activeWeek));
  if (!questions.length) {
    view.innerHTML = `
      <section class="view-with-week-selector">
        ${selectorMarkup}
        <div class="empty-state">No hay preguntas para esta búsqueda.</div>
      </section>
    `;
    bindEmbeddedWeekSelector();
    return;
  }
  app.quizScope = questions;
  if (app.quizFinished) {
    renderQuizResults(questions, activeWeek, selectorMarkup);
    return;
  }
  app.quizIndex = Math.min(app.quizIndex, questions.length - 1);
  const question = questions[app.quizIndex];
  const questionId = idFor(field(question, "Pregunta"));
  const selected = app.quizAnswers[questionId] || "";
  const options = field(question, "Opciones").split("|").map((item) => item.trim()).filter(Boolean);

  view.innerHTML = `
    <section class="view-with-week-selector">
      ${selectorMarkup}
      <article class="academy-card quiz-card">
        <div class="section-head">
          <div>
            <p class="kicker">${escapeHtml(activeWeek)} · Pregunta ${app.quizIndex + 1} de ${questions.length}</p>
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
      </article>
    </section>
  `;
  bindEmbeddedWeekSelector();
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

function renderQuizResults(questions, activeWeek = app.week, selectorMarkup = "") {
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
  const quizId = idFor(activeWeek);
  const earned = (approved ? points.quizApproved : 0) + (perfect ? points.quizPerfect : 0);
  app.store.quizAttempts[quizId] = {
    week: activeWeek,
    score,
    total: questions.length,
    percent,
    approved,
    perfect,
    answers: app.quizAnswers,
    completedAt: new Date().toISOString()
  };
  if (approved) awardOnce(`quiz-approved:${quizId}`, points.quizApproved, `Aprobaste el quiz de ${activeWeek}`);
  if (perfect) awardOnce(`quiz-perfect:${quizId}`, points.quizPerfect, `Quiz perfecto en ${activeWeek}`);
  addActivityOnce(`quiz:${quizId}:${score}`, approved ? "quiz" : "quiz", `${approved ? "Aprobaste" : "Terminaste"} el quiz de ${activeWeek} con ${score}/${questions.length}`);
  checkAchievements();
  saveStore();

  view.innerHTML = `
    <section class="view-with-week-selector">
      ${selectorMarkup}
      <article class="academy-card">
        <div class="section-head">
          <div>
            <p class="kicker">Resultado</p>
            <h2>${escapeHtml(activeWeek)} · ${percent}%</h2>
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
      </article>
    </section>
  `;
  bindEmbeddedWeekSelector();
  $("[data-reset-quiz]").addEventListener("click", () => {
    resetQuizRuntime();
    render();
  });
}

let flashSwiper = null;

function renderFlashcards() {
  // Semanas con al menos una tarjeta: availableWeeks para resolveWeek y opciones
  // del selector embebido (R12.5, R12.6).
  const flashWeeks = weeksWithContent(app.data.flashcards);
  // Semana_Actual sugerida (nextLesson().week devuelve "Semana N" directamente).
  const currentWeek = nextLesson().week;
  // Resolver semana efectiva: "all" -> Semana_Actual; nunca el estado vacío
  // "Selecciona una semana" (R12.1, R12.2).
  const { week: activeWeek, hasContent } = resolveWeek(app.week, currentWeek, flashWeeks);
  // Selector_Semana embebido (convive con el de la topbar; ambos cambian app.week).
  const selectorMarkup = embeddedWeekSelector(activeWeek, flashWeeks);

  // Si la semana resuelta no tiene tarjetas, mostrar la ausencia PERO siempre
  // ofreciendo el selector para elegir otra semana (R12.6).
  if (!hasContent) {
    view.innerHTML = `
      <section class="view-with-week-selector">
        ${selectorMarkup}
        <div class="empty-state">
          <strong>No hay flashcards para ${escapeHtml(activeWeek)}.</strong>
          <p>Elige otra semana en el selector para repasar las tarjetas.</p>
        </div>
      </section>
    `;
    bindEmbeddedWeekSelector();
    return;
  }

  const cards = filterRows(app.data.flashcards.filter((card) => field(card, "Semana") === activeWeek));
  if (!cards.length) {
    view.innerHTML = `
      <section class="view-with-week-selector">
        ${selectorMarkup}
        <div class="empty-state">No hay flashcards para esta búsqueda.</div>
      </section>
    `;
    bindEmbeddedWeekSelector();
    return;
  }

  view.innerHTML = `
    <section class="view-with-week-selector">
      ${selectorMarkup}
      <div class="flashcards-container is-lib-loading" data-flash-container>
      <div class="swiper flash-swiper">
        <div class="swiper-wrapper">
          ${cards.map((card) => {
            const cardId = idFor(field(card, "Pregunta"));
            const status = app.store.flashcards[cardId]?.status || "pending";
            return `
              <div class="swiper-slide">
                <div class="flashcard-3d" data-flip-card>
                  <div class="card-face front">
                    <div class="card-header-mini">
                      <span class="tag">${escapeHtml(field(card, "Tema"))}</span>
                      <span class="status-pill ${status}" data-status-pill="${escapeAttr(cardId)}">${statusLabel(status)}</span>
                    </div>
                    <div class="card-body-content">
                      <p class="kicker">Pregunta de Repaso</p>
                      <h3>${escapeHtml(field(card, "Pregunta"))}</h3>
                      <small class="touch-hint">Toca para voltear</small>
                    </div>
                  </div>
                  <div class="card-face back">
                    <div class="card-header-mini">
                      <span class="tag">Respuesta</span>
                    </div>
                    <div class="card-body-content">
                      <p>${escapeHtml(field(card, "Respuesta"))}</p>
                    </div>
                    <div class="card-actions-inner">
                      <button class="pill-btn flash-mark-btn" data-mark-flash="${escapeAttr(cardId)}" data-mark-status="known" type="button">Lo sé</button>
                      <button class="pill-btn secondary flash-mark-btn" data-mark-flash="${escapeAttr(cardId)}" data-mark-status="review" type="button">Repasar</button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <div class="swiper-pagination"></div>
        <div class="swiper-button-prev"></div>
        <div class="swiper-button-next"></div>
      </div>
      <div class="flash-counter muted">${cards.length} tarjetas · ${escapeHtml(activeWeek)}</div>
      <div class="lib-loading" data-flash-loading>
        <span class="lib-spinner" aria-hidden="true"></span>
        <span>Cargando el carrusel de tarjetas...</span>
      </div>
      </div>
    </section>
  `;

  // Cablear el selector embebido (R12.3, R12.4).
  bindEmbeddedWeekSelector();

  // Delegación de flip
  view.querySelectorAll("[data-flip-card]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".flash-mark-btn")) return;
      card.classList.toggle("flipped");
    });
  });

  // Delegación de "Lo sé" / "Repasar" — actualiza in-place sin destruir Swiper
  view.querySelectorAll(".flash-mark-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cardId = btn.dataset.markFlash;
      const status = btn.dataset.markStatus;
      app.store.flashcards[cardId] = { status, updatedAt: new Date().toISOString() };
      if (status === "known") {
        app.store.points += points.flashcard;
        addActivity("points", `Repasaste flashcard (+${points.flashcard} pts)`);
      }
      checkAchievements();
      saveStore();

      // Actualizar pill in-place
      const pill = view.querySelector(`[data-status-pill="${cardId}"]`);
      if (pill) { pill.className = `status-pill ${status}`; pill.textContent = statusLabel(status); }

      // Desflipear y avanzar
      const cardEl = btn.closest(".flashcard-3d");
      if (cardEl) cardEl.classList.remove("flipped");
      setTimeout(() => { if (flashSwiper) flashSwiper.slideNext(); }, 400);
    });
  });

  // Inicialización diferida de Swiper: la librería se carga bajo demanda
  // (ensureSwiper) antes de construir el carrusel. Mientras la promesa está
  // pendiente, el contenedor muestra un indicador de carga (.is-lib-loading);
  // si falla, se muestra un bloque de error con "Reintentar" (R11.4, R11.5).
  setupFlashSwiper();
}

// setupFlashSwiper(): carga Swiper bajo demanda y monta el carrusel de
// flashcards. Estructurada con async/await:
//   1. Muestra el indicador de carga y bloquea el carrusel mientras la promesa
//      de ensureSwiper() está pendiente (R11.4).
//   2. Si la carga falla, renderiza un bloque de error con botón "Reintentar"
//      SIN propagar la excepción, de modo que el resto de la navegación sigue
//      operativa (R11.5).
//   3. Si la vista cambió mientras se cargaba, aborta silenciosamente.
async function setupFlashSwiper() {
  const container = view.querySelector("[data-flash-container]");
  if (!container) return;

  try {
    // ensureSwiper() cachea la promesa: reintentos/relamadas son baratas.
    await ensureSwiper();
  } catch (error) {
    // No propagar: el resto de la app sigue navegable (R11.5).
    renderFlashLibError(container, error);
    return;
  }

  // Si el usuario navegó a otra vista mientras Swiper cargaba, el contenedor
  // ya no está en el documento: no intentamos montar el carrusel.
  if (!document.body.contains(container)) return;

  // Quitar el indicador de carga y desbloquear el carrusel.
  container.classList.remove("is-lib-loading");
  const loading = container.querySelector("[data-flash-loading]");
  if (loading) loading.remove();

  if (flashSwiper) { try { flashSwiper.destroy(true, true); } catch {} }
  flashSwiper = new Swiper(".flash-swiper", {
    effect: "cards",
    grabCursor: true,
    cardsEffect: { perSlideOffset: 8, perSlideRotate: 2, rotate: true },
    navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" },
    pagination: { el: ".swiper-pagination", dynamicBullets: true }
  });
}

// renderFlashLibError(): sustituye el contenido del contenedor de flashcards
// por un bloque de error con un botón "Reintentar" que vuelve a renderizar la
// vista completa (rebuild + nuevo intento de carga de Swiper) (R11.5).
function renderFlashLibError(container, error) {
  container.classList.remove("is-lib-loading");
  container.innerHTML = `
    <div class="lib-error">
      <strong>No se pudo cargar el carrusel de flashcards.</strong>
      <p class="muted">Revisa tu conexión e inténtalo de nuevo. El resto de la academia sigue disponible.</p>
      <code>${escapeHtml(error && error.message ? error.message : String(error))}</code>
      <button class="primary-btn" data-retry-flash type="button">Reintentar</button>
    </div>
  `;
  const retry = container.querySelector("[data-retry-flash]");
  if (retry) retry.addEventListener("click", () => renderFlashcards());
}

/* ── Visor Anatómico Interactivo ── */

let anatomyMapInstance = null;

function renderAnatomy() {
  view.innerHTML = `
    <section class="anatomy-viewer-panel academy-card">
      <div class="section-head">
        <div>
          <p class="kicker">Visor Anatómico</p>
          <h2>Músculos y drenaje facial interactivo</h2>
          <p class="muted">Explora los puntos de interés. Haz clic en cada marcador para ver la descripción clínica.</p>
        </div>
      </div>
      <div class="anatomy-controls action-row">
        <button class="pill-btn active" data-anatomy-layer="muscles" type="button">Músculos Faciales</button>
        <button class="pill-btn" data-anatomy-layer="lymph" type="button">Líneas de Drenaje</button>
      </div>
      <div id="anatomyMap"></div>
    </section>
  `;

  // Delegación de botones de capa
  view.querySelectorAll("[data-anatomy-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view.querySelectorAll("[data-anatomy-layer]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      initAnatomyVisor(btn.dataset.anatomyLayer);
    });
  });

  setTimeout(() => initAnatomyVisor("muscles"), 60);
}

// initAnatomyVisor(): carga Leaflet bajo demanda y monta el visor anatómico.
// Estructurada con async/await para integrar la carga diferida (R11.2, R11.3):
//   1. Antes de usar `L`, muestra un indicador de carga dentro de #anatomyMap y
//      bloquea el visor (no se llama a L.map hasta que Leaflet esté disponible).
//   2. Si ensureLeaflet() falla, renderiza un bloque de error con botón
//      "Reintentar" SIN propagar la excepción (R11.5); el botón reintenta la
//      carga de la misma capa.
//   3. Si la vista cambió mientras Leaflet cargaba, aborta silenciosamente.
async function initAnatomyVisor(layerType = "muscles") {
  const mapEl = document.getElementById("anatomyMap");
  if (!mapEl) return;

  // Destruir cualquier instancia previa para poder re-montar de forma limpia
  // (cambio de capa o reintento). .remove() libera el _leaflet_id del nodo.
  if (anatomyMapInstance) { try { anatomyMapInstance.remove(); } catch (e) {} anatomyMapInstance = null; }

  // Indicador de carga + bloqueo del visor mientras Leaflet está pendiente
  // (R11.3): el contenedor no monta ningún mapa hasta que la promesa resuelve.
  mapEl.classList.add("is-lib-loading");
  mapEl.innerHTML = `
    <div class="lib-loading">
      <span class="lib-spinner" aria-hidden="true"></span>
      <span>Cargando el visor anatómico...</span>
    </div>
  `;

  try {
    // ensureLeaflet() cachea la promesa: reintentos/relamadas son baratas.
    await ensureLeaflet();
  } catch (error) {
    // No propagar: el resto de la app sigue navegable (R11.5).
    mapEl.classList.remove("is-lib-loading");
    mapEl.innerHTML = `
      <div class="lib-error">
        <strong>No se pudo cargar el visor anatómico.</strong>
        <p class="muted">Revisa tu conexión e inténtalo de nuevo. El resto de la academia sigue disponible.</p>
        <code>${escapeHtml(error && error.message ? error.message : String(error))}</code>
        <button class="primary-btn" data-retry-anatomy type="button">Reintentar</button>
      </div>
    `;
    const retry = mapEl.querySelector("[data-retry-anatomy]");
    if (retry) retry.addEventListener("click", () => initAnatomyVisor(layerType));
    return;
  }

  // Si el usuario navegó a otra vista mientras Leaflet cargaba, abortar.
  if (!document.body.contains(mapEl)) return;

  // Limpiar el indicador de carga: L.map requiere el contenedor vacío.
  mapEl.classList.remove("is-lib-loading");
  mapEl.innerHTML = "";

  anatomyMapInstance = L.map("anatomyMap", {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 2,
    zoomSnap: 0.25,
    attributionControl: false
  });

  const bounds = [[0, 0], [1000, 1000]];
  const imageUrl = layerType === "muscles"
    ? "assets/anatomy/musculos_faciales.png"
    : "assets/anatomy/sistema_linfatico.png";

  L.imageOverlay(imageUrl, bounds).addTo(anatomyMapInstance);
  anatomyMapInstance.fitBounds(bounds);

  const hotspots = {
    muscles: [
      { coords: [820, 500], title: "Músculo Frontal", desc: "Eleva las cejas y genera arrugas horizontales de expresión. En masaje facial, se trabaja con movimientos ascendentes suaves." },
      { coords: [740, 680], title: "Corrugador Superciliar", desc: "Frunce las cejas (líneas del entrecejo). Zona de mucha tensión emocional." },
      { coords: [700, 350], title: "Orbicular de los Ojos", desc: "Cierra el párpado y protege el globo ocular. Cuidar presión en masajes perioculares; piel muy fina." },
      { coords: [680, 750], title: "Temporal", desc: "Músculo de la masticación lateral. Se palpa al apretar los dientes. Acumula tensión por estrés." },
      { coords: [600, 500], title: "Músculo Nasal", desc: "Comprime y ensancha la abertura nasal. Conecta con la respiración facial." },
      { coords: [480, 680], title: "Cigomático Mayor", desc: "Eleva la comisura labial (sonrisa). Punto clave en masaje de elevación facial." },
      { coords: [420, 500], title: "Orbicular de los Labios", desc: "Cierra y protruye los labios. Zona de arrugas peribucales (código de barras)." },
      { coords: [370, 280], title: "Masetero", desc: "Principal músculo de la masticación. Zona crítica de tensión facial y bruxismo." },
      { coords: [340, 400], title: "Buccinador", desc: "Comprime las mejillas contra los dientes. Actúa al soplar o succionar." },
      { coords: [280, 500], title: "Mentoniano", desc: "Eleva y protruye el labio inferior. Genera arrugas en el mentón ('piel de naranja')." }
    ],
    lymph: [
      { coords: [700, 720], title: "Ganglios Preauriculares", desc: "Drenan la región temporal, frontal y palpebral. Primera estación de drenaje facial lateral." },
      { coords: [650, 280], title: "Ganglios Parotídeos", desc: "Asociados a la glándula parótida. Drenan la mejilla, nariz y párpado inferior." },
      { coords: [400, 350], title: "Ganglios Submandibulares", desc: "Drenan la comisura labial, labio superior, mejillas y encías. Los más palpables en clínica." },
      { coords: [340, 500], title: "Ganglios Submentonianos", desc: "Drenan el labio inferior, suelo de la boca y punta de la lengua." },
      { coords: [250, 680], title: "Ganglios Cervicales Superficiales", desc: "Cadena a lo largo de la vena yugular externa. Recogen linfa de toda la cara." },
      { coords: [150, 500], title: "Ganglios Cervicales Profundos", desc: "Cadena profunda paralela a la yugular interna. Estación final antes del conducto torácico." },
      { coords: [80, 400], title: "Ganglios Supraclaviculares", desc: "Última estación cervical. La linfa drena al conducto torácico o al conducto linfático derecho." }
    ]
  };

  const markerStyle = layerType === "muscles"
    ? { radius: 10, color: "#b99cff", fillColor: "#d8b4fe", fillOpacity: 0.85, weight: 2 }
    : { radius: 10, color: "#81e6c6", fillColor: "#a7f3d0", fillOpacity: 0.85, weight: 2 };

  const activePoints = hotspots[layerType] || [];
  activePoints.forEach((point) => {
    L.circleMarker(point.coords, { ...markerStyle, className: "anatomy-hotspot" })
      .addTo(anatomyMapInstance)
      .bindPopup(`
        <div class="anatomy-popup">
          <strong>${escapeHtml(point.title)}</strong>
          <p>${escapeHtml(point.desc)}</p>
        </div>
      `, { maxWidth: 280, className: "anatomy-popup-wrapper" });
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
  const allRows = filterRows(app.data.cases);
  const rows = allRows.filter((item) => isItemInWeek(idFor(field(item, "Caso")), "cases", app.week));
  if (rows.length === 0) {
    view.innerHTML = `
      <section class="empty-state">
        <strong>No hay casos prácticos para la semana seleccionada.</strong>
        <p>Elige otra semana en el selector superior o "Todas las semanas".</p>
      </section>
    `;
    return;
  }
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
  const allRows = filterRows(app.data.ingredients);
  const rows = allRows.filter((item) => isItemInWeek(idFor(field(item, "Ingrediente")), "ingredients", app.week));
  if (rows.length === 0) {
    view.innerHTML = `
      <section class="empty-state">
        <strong>No hay ingredientes para la semana seleccionada.</strong>
        <p>Elige otra semana en el selector superior o "Todas las semanas".</p>
      </section>
    `;
    return;
  }
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
  const allRows = filterRows(app.data.protocols);
  const rows = allRows.filter((item) => isItemInWeek(idFor(field(item, "Protocolo")), "protocols", app.week));
  const gridHtml = rows.length === 0
    ? `<section class="empty-state">
        <strong>No hay protocolos para la semana seleccionada.</strong>
        <p>Elige otra semana en el selector superior o "Todas las semanas".</p>
       </section>`
    : `<section class="data-grid">
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
      </section>`;

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
    ${gridHtml}
  `;
  $("[data-build-protocol]").addEventListener("click", buildProtocolSuggestion);
  document.querySelectorAll("[data-review-protocol]").forEach((button) => {
    button.addEventListener("click", () => reviewProtocol(button.dataset.reviewProtocol, button.dataset.protocolTitle));
  });
}

function renderResources() {
  const allRows = filterRows(app.data.resources);
  const rows = allRows.filter((item) => isItemInWeek(idFor(field(item, "Nombre")), "resources", app.week));
  if (rows.length === 0) {
    view.innerHTML = `
      <section class="empty-state">
        <strong>No hay recursos para la semana seleccionada.</strong>
        <p>Elige otra semana en el selector superior o "Todas las semanas".</p>
      </section>
    `;
    return;
  }
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

  // Reubica "Empezar sesión" y la actividad reciente en el flujo de contenido
  // para la Interfaz_Movil, donde el Right_Rail está oculto (R10.1, R10.4).
  renderMobileSessionAccess();
}

// ---------------------------------------------------------------------
// Acceso a "Empezar sesión" y actividad reciente en móvil (tarea 5.4 / R10)
// ---------------------------------------------------------------------
// El Right_Rail (.right-rail) se oculta con display:none bajo 1180px, dejando
// sin acceso al botón "Empezar sesión" (#railStartLesson) y a la actividad
// reciente. Este bloque reubica ambas piezas dentro del flujo de contenido
// (#mobileSessionAccess), visible SOLO en móvil vía CSS (@media max-width:1180px),
// de modo que el escritorio (rail visible >1180px) queda intacto.
//
// Se ejecuta en cada render desde updateGlobalChrome(): rellena el contenido y
// recablea sus handlers. La visibilidad la decide el CSS, por lo que el bloque
// es reactivo al redimensionar sin necesidad de listeners de resize.

// Determina si nextLesson() devolvió una lección válida y abrible (R10.2/R10.3).
function hasValidSuggestedLesson(suggested) {
  return !!(
    suggested &&
    suggested.lesson &&
    Object.keys(suggested.lesson).length > 0 &&
    suggested.lessonTitle &&
    suggested.lessonTitle !== "Sin lección"
  );
}

function renderMobileSessionAccess() {
  const container = document.getElementById("mobileSessionAccess");
  if (!container) return;

  const suggested = nextLesson();
  const recent = recentActivity(4);
  const isValid = hasValidSuggestedLesson(suggested);

  // Tarjeta de "Empezar sesión": si hay lección sugerida válida se ofrece el
  // botón que la abre (R10.2); si no, se muestra un aviso y un acceso a la
  // Ruta de estudio como alternativa (R10.3).
  const suggestedCard = isValid
    ? `
      <section class="mobile-session-card">
        <p class="kicker">Sesión sugerida</p>
        <h3>${escapeHtml(suggested.lessonTitle)}</h3>
        <p class="muted">${escapeHtml(suggested.week)} · ${escapeHtml(suggested.day)} · ${escapeHtml(field(suggested.lesson, "Tema"))}</p>
        <button id="mobileStartLesson" class="primary-btn full" type="button">Empezar sesión</button>
      </section>
    `
    : `
      <section class="mobile-session-card">
        <p class="kicker">Sesión sugerida</p>
        <h3>Sin lección sugerida</h3>
        <p class="muted">No encontramos una lección disponible para empezar ahora mismo.</p>
        <button id="mobileGoRoadmap" class="primary-btn full" type="button">Ir a la Ruta de estudio</button>
      </section>
    `;

  container.innerHTML = `
    ${suggestedCard}
    <section class="mobile-session-card">
      <div class="rail-title">
        <p class="kicker">Actividad reciente</p>
        <span>${app.store.activity.length}</span>
      </div>
      ${activityMarkup(recent, true)}
    </section>
  `;

  // Cableado de "Empezar sesión" en móvil (R10.2): abre la lección sugerida.
  const startBtn = document.getElementById("mobileStartLesson");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const lesson = nextLesson();
      if (hasValidSuggestedLesson(lesson)) {
        openLesson(lesson.lessonTitle);
      } else {
        // Degradación segura si entre renders la lección dejó de ser válida (R10.3).
        alert("La lección sugerida no está disponible. Te llevamos a la Ruta de estudio.");
        app.view = "roadmap";
        app.currentLesson = null;
        render();
      }
    });
  }

  // Alternativa cuando no hay lección sugerida válida (R10.3): Ruta de estudio.
  const roadmapBtn = document.getElementById("mobileGoRoadmap");
  if (roadmapBtn) {
    roadmapBtn.addEventListener("click", () => {
      app.view = "roadmap";
      app.currentLesson = null;
      render();
    });
  }
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
  const alertBlock = result.level === "rojo" ? `
    <div class="biosafety-alert">
      <span class="biosafety-alert-icon">⚠️</span>
      <div>
        <strong>ALERTA DE SEGURIDAD</strong>
        <p>No realizar práctica de estudio. Condición de riesgo detectada — derivar al médico.</p>
      </div>
    </div>` : "";
  return `
    <div class="diagnosis-output">
      ${alertBlock}
      ${safetyChip(result.level)}
      <p><strong>Biotipo probable:</strong> ${escapeHtml(input.diagBiotype || "Por definir")}</p>
      <p><strong>Condiciones detectadas:</strong> ${escapeHtml(result.conditions.join(", ") || "sin condición dominante clara")}</p>
      <p><strong>Qué evitar hoy:</strong> <span class="avoid-list">${escapeHtml(result.avoid.join(", ") || "evitar improvisar; trabajar conservador")}</span></p>
      <p><strong>Aparatología:</strong> ${escapeHtml(result.devices)}</p>
      <p><strong>Recomendación educativa:</strong> ${escapeHtml(result.advice)}</p>
      <div class="suggested-ingredients-block ${result.level === "rojo" ? "blocked-by-alert" : ""}">
        <strong>Principios activos recomendados (de tu biblioteca):</strong>
        <div class="ingredient-pills-row">
          ${result.suggestedIngredients.map(ing => `<span class="ingredient-pill"><span class="ingredient-pill-dot"></span>${escapeHtml(ing.name)}<small>${escapeHtml(ing.category)}</small></span>`).join("") || `<span class="muted">No hay ingredientes sugeridos para este objetivo.</span>`}
        </div>
      </div>
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
    conditions.push("piel reactiva o rosácea de sospecha");
    avoid.push("calor", "vapor", "fricción intensa");
    devices = "Evitar calor y aparatos estimulantes; considerar derivación si hay brote.";
  }

  // BÚSQUEDA AUTOMÁTICA EN TU CSV DE INGREDIENTES
  const targetGoal = (input.diagGoal || "Hidratación").toLowerCase();
  const goalWords = targetGoal.split(/[\s,;/]+/).filter(w => w.length > 2);
  const matchedIngredients = app.data.ingredients
    .map((ing) => {
      const idealFor = field(ing, "Ideal para").toLowerCase();
      const funcion = field(ing, "Función").toLowerCase();
      const combined = `${idealFor} ${funcion}`;
      const score = goalWords.reduce((s, w) => s + (combined.includes(w) ? 1 : 0), 0);
      return score > 0 ? { name: field(ing, "Ingrediente"), category: field(ing, "Categoría"), score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { 
    level, 
    conditions: unique(conditions), 
    avoid: unique(avoid), 
    devices, 
    advice,
    suggestedIngredients: matchedIngredients
  };
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
  const allWeeks = weeksList();
  const totalWeeks = allWeeks.length || 1;
  const lessonsPerWeek = Math.max(1, Math.ceil(totalLessons / totalWeeks));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil((completedLessons + 1) / lessonsPerWeek)));
  return { completedLessons, totalLessons, approvedQuizzes, pendingFlashcards: Math.max(0, pendingFlashcards), solvedCases, percent, currentWeek, totalWeeks };
}

function nextLesson() {
  const selectedWeek = app.week && app.week !== "all" ? app.week : null;
  const lesson = app.data.lessons.find((item) => {
    if (selectedWeek && field(item, "Semana") !== selectedWeek) return false;
    return !isLessonComplete(field(item, "Lección"));
  }) || app.data.lessons.find((item) => {
    if (selectedWeek && field(item, "Semana") !== selectedWeek) return false;
    return true;
  }) || app.data.lessons[0] || {};

  return {
    lesson,
    lessonTitle: field(lesson, "Lección") || "Sin lección",
    week: field(lesson, "Semana") || "Semana 1",
    day: field(lesson, "Día") || "Lunes"
  };
}

function upcomingLessons(count) {
  const selectedWeek = app.week && app.week !== "all" ? app.week : null;
  return app.data.lessons.filter((lesson) => {
    if (selectedWeek && field(lesson, "Semana") !== selectedWeek) return false;
    return !isLessonComplete(field(lesson, "Lección"));
  }).slice(0, count);
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
  if (titles[week]) return titles[week];
  const lessons = app.data.lessons.filter((l) => field(l, "Semana") === week);
  const tema = lessons.length ? field(lessons[0], "Tema") : "";
  return tema || week;
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

function getBlankProfile() {
  return {
    lessons: {}, notes: {}, quizAttempts: {}, flashcards: {}, cases: {},
    caseNotes: {}, protocols: {}, points: 0, pointLedger: {},
    achievements: {}, activity: [], diagnosisDraft: {}
  };
}

async function loadStore() {
  let existing = JSON.parse(localStorage.getItem(appStateKey) || "null");

  if (db) {
    try {
      const doc = await db.collection("curso_state").doc("globalStore").get();
      if (doc.exists) {
        existing = doc.data();
        localStorage.setItem(appStateKey, JSON.stringify(existing));
      }
    } catch (e) {
      console.warn("Firebase read error:", e);
    }
  }
  
  let globalStore;
  if (!existing || existing.version < 3) {
    globalStore = {
      version: 3,
      activeProfile: "ivania",
      profiles: {
        ivania: existing ? existing : getBlankProfile(),
        ximena: getBlankProfile(),
        admin: getBlankProfile()
      },
      customContent: {}
    };
    if (globalStore.profiles.ivania.version) delete globalStore.profiles.ivania.version;
  } else {
    globalStore = existing;
  }
  
  globalStore.profiles.ivania = { ...getBlankProfile(), ...globalStore.profiles.ivania };
  globalStore.profiles.ximena = { ...getBlankProfile(), ...globalStore.profiles.ximena };
  globalStore.profiles.admin = { ...getBlankProfile(), ...globalStore.profiles.admin };

  // Migración a perfiles por USUARIO (feature: acceso-responsive-despliegue).
  // Cada cuenta tiene avance independiente: ivi (Ivania), xime (Ximena), admin.
  // Para preservar el progreso histórico se copia ivania→ivi y ximena→xime la
  // primera vez (copia profunda para no compartir referencias). Si existiera un
  // perfil "student" previo (versión anterior), se usa como origen de ivi.
  if (!globalStore.profiles.ivi) {
    const source = globalStore.profiles.student || globalStore.profiles.ivania || getBlankProfile();
    globalStore.profiles.ivi = JSON.parse(JSON.stringify(source));
  }
  if (!globalStore.profiles.xime) {
    const source = globalStore.profiles.ximena || getBlankProfile();
    globalStore.profiles.xime = JSON.parse(JSON.stringify(source));
  }
  globalStore.profiles.ivi = { ...getBlankProfile(), ...globalStore.profiles.ivi };
  globalStore.profiles.xime = { ...getBlankProfile(), ...globalStore.profiles.xime };

  globalStore.customContent = globalStore.customContent || {};

  // El perfil activo se deriva del PERFIL de la sesión (admin/ivi/xime) ya
  // resuelta por el servidor en init() (variable `session`). Si hay una sesión
  // válida cuyo perfil existe, se activa; si no, se conserva el activeProfile
  // por defecto (login pendiente) y NO se carga contenido.
  if (session && session.profile && globalStore.profiles[session.profile]) {
    globalStore.activeProfile = session.profile;
  }

  app.globalStore = globalStore;
  app.store = globalStore.profiles[globalStore.activeProfile];
  
  setTimeout(setupProfileSwitcher, 0);
  return app.store;
}

function saveStore() {
  localStorage.setItem(appStateKey, JSON.stringify(app.globalStore));
  if (db) {
    db.collection("curso_state").doc("globalStore")
      .set(app.globalStore)
      .catch(e => console.warn("Firebase save error:", e));
  }
  updateGlobalChrome();
}

function setupProfileSwitcher() {
  // Refleja el PERFIL de la sesión activa en el control de sesión (R5.2):
  //   ivi → "Ivania", xime → "Ximena", admin → "Administrador".
  // Muestra/oculta la navegación al Panel_Administracion según el rol
  // (R3.1, R3.2): visible solo si role === "admin".
  const nameEl = document.getElementById("sessionRoleName");
  const avatarEl = document.getElementById("sessionRoleAvatar");
  const isAdmin = session?.role === "admin";
  const displayName = (session && PROFILE_LABELS[session.profile]) || (isAdmin ? "Administrador" : "Estudiante");

  if (nameEl && avatarEl) {
    nameEl.textContent = displayName;
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
    avatarEl.className = `profile-avatar ${isAdmin ? "pink" : "mint"}`;
  }

  const adminBtn = document.querySelector(".nav-btn.admin-only");
  if (adminBtn) adminBtn.classList.toggle("hidden", !isAdmin);
}

async function loadCsv(url, key) {
  if (app.globalStore && app.globalStore.customContent && app.globalStore.customContent[key]) {
    return parseCsv(app.globalStore.customContent[key]);
  }
  const text = await fetchText(url);
  return parseCsv(text);
}

async function fetchText(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    // Adjuntar el status para que el llamador (init/loadAllContent) pueda
    // distinguir un 401 (sesión perdida) de otros errores.
    const error = new Error(`No se pudo cargar ${url}`);
    error.status = response.status;
    throw error;
  }
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

function isItemInWeek(itemId, type, weekName) {
  if (!weekName || weekName === "all") return true;
  const weekNum = parseInt(weekName.replace("Semana ", ""));
  if (isNaN(weekNum)) return true;

  if (type === "cases") {
    const caseWeeks = {
      "caso-1-grasa-congestionada": [6, 10, 11, 12],
      "caso-2-deshidratada-sensible": [2, 5, 11, 12],
      "caso-3-manchas-y-textura": [4, 7, 11, 12],
      "caso-4-firmeza-leve": [9, 11, 12],
      "caso-5-rojez-persistente": [8, 11, 12]
    };
    return (caseWeeks[itemId] || []).includes(weekNum);
  }

  if (type === "protocols") {
    const protocolWeeks = {
      "hidratante": [5, 11, 12],
      "purificante-seguro": [3, 6, 10, 11, 12],
      "calmante": [2, 8, 11, 12],
      "luminosidad-manchas": [7, 11, 12],
      "reafirmante-conservador": [9, 11, 12]
    };
    return (protocolWeeks[itemId] || []).includes(weekNum);
  }

  if (type === "ingredients") {
    const ingredientWeeks = {
      "acido-hialuronico": [5, 11, 12],
      "glicerina": [5, 11, 12],
      "pantenol": [8, 11, 12],
      "niacinamida": [6, 7, 11, 12],
      "zinc": [6, 11, 12],
      "acido-salicilico": [4, 11, 12],
      "acido-glicolico": [4, 11, 12],
      "pha": [4, 11, 12],
      "vitamina-c": [7, 11, 12],
      "ceramidas": [5, 11, 12],
      "aloe": [8, 11, 12],
      "arcillas": [6, 11, 12],
      "peptidos": [9, 11, 12],
      "bakuchiol": [9, 11, 12],
      "protector-solar-spf-30": [7, 11, 12]
    };
    return (ingredientWeeks[itemId] || []).includes(weekNum);
  }

  if (type === "resources") {
    const resourceWeeks = {
      "amevie-tecnica-en-cosmetologia": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "amevie-cosmiatria-y-aparatologia": [3, 6, 9, 10, 11, 12],
      "cidesco-beauty-therapy-diploma": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "milady-standard-esthetics": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "pivot-point-skin-assessment": [1, 11, 12],
      "rose-point-skin-assessment": [1, 11, 12],
      "dermalogica-skinfluencer-academy": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "fda-microneedling-devices": [8, 10, 11, 12],
      "fda-chemical-peels-warning": [4, 11, 12],
      "aad-sunscreen": [7, 11, 12],
      "aad-rosacea-skin-care": [8, 11, 12],
      "videlca-catalogo": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "ainhoa-hi-luronic": [5, 11, 12],
      "miguett": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    };
    return (resourceWeeks[itemId] || []).includes(weekNum);
  }

  return true;
}

function weeksList() {
  // Semanas únicas según las lecciones.
  return unique(app.data.lessons.map((lesson) => field(lesson, "Semana")).filter(Boolean));
}

// ---------------------------------------------------------------------
// Selector de semana embebido para Quizzes y Flashcards (tarea 7.4 / R12)
// ---------------------------------------------------------------------

// weeksWithContent(rows): devuelve, en orden de aparición, las semanas que
// tienen al menos un elemento en el dataset dado (quizzes o flashcards). Se usa
// como availableWeeks de resolveWeek (cálculo de hasContent) y como opciones del
// selector embebido (R12.5, R12.6).
function weeksWithContent(rows) {
  return unique((rows || []).map((row) => field(row, "Semana")).filter(Boolean));
}

// embeddedWeekSelector(activeWeek, contentWeeks): construye el marcado de un
// Selector_Semana EMBEBIDO en la propia vista (R12.3). Lista las semanas que
// tienen contenido del tipo de la vista y refleja la semana resuelta como valor
// seleccionado. Si la semana resuelta carece de contenido (no está en
// contentWeeks), se antepone una opción deshabilitada para reflejarla sin
// romper la lista de semanas elegibles (R12.6).
function embeddedWeekSelector(activeWeek, contentWeeks) {
  const weeks = Array.isArray(contentWeeks) ? contentWeeks : [];
  const activeHasContent = weeks.includes(activeWeek);
  const placeholder = activeHasContent
    ? ""
    : `<option value="${escapeAttr(activeWeek)}" selected disabled>${escapeHtml(activeWeek)} (sin contenido)</option>`;
  const options = weeks
    .map((week) => `<option value="${escapeAttr(week)}"${activeHasContent && week === activeWeek ? " selected" : ""}>${escapeHtml(week)}</option>`)
    .join("");
  return `
    <div class="toolbar embedded-week-toolbar">
      <label class="field week-select-field">
        <span>Semana</span>
        <select data-embedded-week>${placeholder}${options}</select>
      </label>
    </div>
  `;
}

// bindEmbeddedWeekSelector(): cabla el <select> embebido para que, al cambiar,
// actualice app.week y re-renderice la vista (R12.4). Convive con el selector
// de la topbar: render() sincroniza #weekSelect con app.week, de modo que ambos
// reflejan siempre la misma semana.
function bindEmbeddedWeekSelector() {
  const select = view.querySelector("[data-embedded-week]");
  if (!select) return;
  select.addEventListener("change", (event) => {
    app.week = event.target.value;
    app.currentLesson = null;
    resetQuizRuntime();
    render();
  });
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

/* ── Panel de Administración ── */

function renderAdmin() {
  view.innerHTML = `
    <section class="admin-panel">
      <div class="section-head">
        <div>
          <h2>Gestión de Contenido Local</h2>
          <p class="muted">Sube archivos CSV para actualizar el plan de estudios. Los cambios se guardan localmente en tu navegador.</p>
        </div>
      </div>
      
      <div class="admin-grid">
        <div class="academy-card file-upload-zone" id="uploadLessons">
          <div class="file-upload-icon">📄</div>
          <strong>Actualizar Lecciones (CSV)</strong>
          <p class="muted" style="margin-top:8px;font-size:12px;">Arrastra o selecciona Lecciones.csv</p>
          <input type="file" accept=".csv" data-csv-type="lessons">
        </div>
        
        <div class="academy-card file-upload-zone" id="uploadFlashcards">
          <div class="file-upload-icon">📇</div>
          <strong>Actualizar Flashcards (CSV)</strong>
          <p class="muted" style="margin-top:8px;font-size:12px;">Arrastra o selecciona Flashcards.csv</p>
          <input type="file" accept=".csv" data-csv-type="flashcards">
        </div>
        
        <div class="academy-card file-upload-zone" id="uploadIngredients">
          <div class="file-upload-icon">🧪</div>
          <strong>Actualizar Ingredientes (CSV)</strong>
          <p class="muted" style="margin-top:8px;font-size:12px;">Arrastra o selecciona Ingredientes.csv</p>
          <input type="file" accept=".csv" data-csv-type="ingredients">
        </div>

        <div class="academy-card file-upload-zone danger-zone">
          <div class="file-upload-icon" style="color:var(--danger)">⚠️</div>
          <strong style="color:var(--danger)">Restablecer Progreso</strong>
          <p class="muted" style="margin-top:8px;font-size:12px;">Borrar progreso de Ivania o Ximena</p>
          <div style="margin-top:14px; display:flex; gap:10px; justify-content:center;">
            <button class="pill-btn btn-reset-progress" data-profile="ivania">Reset Ivania</button>
            <button class="pill-btn btn-reset-progress" data-profile="ximena">Reset Ximena</button>
          </div>
        </div>
      </div>
    </section>
  `;

  view.querySelectorAll(".btn-reset-progress").forEach(btn => {
    btn.addEventListener("click", () => {
      const profileId = btn.dataset.profile;
      if (confirm(`¿Estás seguro de que quieres restablecer todo el progreso de ${profileId}?`)) {
        app.globalStore.profiles[profileId] = getBlankProfile();
        saveStore();
        alert(`El progreso de ${profileId} ha sido reiniciado.`);
      }
    });
  });

  view.querySelectorAll("input[type='file']").forEach(input => {
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const type = input.dataset.csvType;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        app.globalStore.customContent[type] = text;
        saveStore();
        
        // Reload that specific CSV immediately
        app.data[type] = parseCsv(text);
        
        // Show success UI briefly
        const zone = input.closest('.file-upload-zone');
        const oldHtml = zone.innerHTML;
        zone.innerHTML = `<div class="file-upload-icon" style="color:var(--mint)">✅</div><strong>Actualizado</strong>`;
        setTimeout(() => { zone.innerHTML = oldHtml; }, 2000);
      };
      reader.readAsText(file);
    });
  });
}

// =====================================================================
// Autenticación — login real contra el backend (server/server.js)
// ---------------------------------------------------------------------
// El login YA NO valida credenciales en el cliente. Las credenciales se envían
// al backend (POST /api/login), que las verifica con bcrypt y emite una cookie
// de sesión httpOnly firmada. El cliente solo conoce el estado de la sesión a
// través de /api/session y nunca maneja hashes ni contraseñas.
//
// Por eso se eliminaron AUTH_CONFIG, sha256Hex, constantTimeEquals,
// validateCredentials y el ciclo de sesión en localStorage (createSession,
// restoreSession, destroySession). El estado de la sesión vive solo en memoria
// (variable `session`) y se resuelve desde el servidor.
// =====================================================================

// Nombre visible por perfil (para saludo y control de sesión).
const PROFILE_LABELS = { ivi: "Ivania", xime: "Ximena", admin: "Administrador" };

// Estado de la sesión en memoria. null = sin sesión activa.
// Forma: { user, role, profile }. La fuente de verdad es el servidor: este
// valor se rellena con fetchServerSession()/apiLogin() y se limpia con
// apiLogout(). No se persiste en localStorage.
let session = null;

// Autorización por rol para una vista (R3.1, R3.2, R3.3, R3.4).
// Control PRIMARIO basado en el ROL de la sesión, no en clases CSS ni en el DOM:
//   - La vista "admin" se autoriza si y solo si el rol es "admin".
//   - Cualquier otra vista se autoriza para cualquier rol (incluido rol ausente).
// El rol ausente/desconocido se trata como NO admin por seguridad.
function canAccessView(viewName, role) {
  if (viewName === "admin") return role === "admin";
  return true;
}

// Resuelve qué semana mostrar en Vista_Quizzes / Vista_Flashcards
// (R12.1, R12.2, R12.4, R12.5, R12.6). Función PURA: no toca el DOM ni el
// estado global, por lo que es testeable de forma aislada.
//
// Parámetros:
//   - selected: valor del Selector_Semana ("all" para "Todas las semanas",
//     o una semana concreta como "Semana 3").
//   - current: la Semana_Actual sugerida (p. ej. "Semana 3").
//   - availableWeeks: (opcional) array de semanas que SÍ tienen contenido del
//     tipo solicitado (quizzes o flashcards). Si no se pasa, no se evalúa la
//     disponibilidad.
//
// Devuelve un objeto { week, hasContent }:
//   - week = selected cuando selected !== "all"; en caso contrario week = current.
//     NUNCA devuelve un sentinel de "sin selección": siempre hay una semana
//     concreta que mostrar (R12.1, R12.2).
//   - hasContent = true si y solo si la semana resuelta está en availableWeeks
//     (R12.5, R12.6). Si availableWeeks no se proporciona, hasContent = undefined
//     (la disponibilidad no se evalúa en ese caso).
function resolveWeek(selected, current, availableWeeks) {
  // Si hay una semana concreta seleccionada se respeta; si es "all" se usa la
  // Semana_Actual sugerida. Así nunca se cae en el estado vacío.
  const week = selected !== "all" ? selected : current;

  // hasContent solo se calcula cuando se conoce la lista de semanas con
  // contenido del tipo en cuestión.
  const hasContent = Array.isArray(availableWeeks)
    ? availableWeeks.includes(week)
    : undefined;

  return { week, hasContent };
}

// =====================================================================
// API de sesión contra el backend (server/server.js)
// ---------------------------------------------------------------------
// Estas funciones reemplazan a validateCredentials/createSession/etc. Todas
// usan fetch con credentials:"same-origin" para enviar/recibir la cookie de
// sesión httpOnly. Actualizan la variable en memoria `session`.
// =====================================================================

// Consulta la sesión actual al servidor (GET /api/session). Si hay sesión
// válida (200), asigna `session = { user, role, profile }` y la devuelve; en
// cualquier otro caso (401 o fallo de red) deja `session = null` y devuelve null.
async function fetchServerSession() {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin" });
    if (res.ok) {
      session = await res.json();
      return session;
    }
    session = null;
    return null;
  } catch (error) {
    // Fallo de red: tratar como ausencia de sesión.
    session = null;
    return null;
  }
}

// Envía credenciales al backend (POST /api/login). Devuelve:
//   - { ok: true } y asigna `session` si las credenciales son válidas (200).
//   - { ok: false, error } con el mensaje del servidor si son inválidas (401).
//   - { ok: false, error } con aviso de rate limit si el servidor responde 429.
async function apiLogin(username, password) {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      session = await res.json();
      return { ok: true };
    }
    if (res.status === 429) {
      return { ok: false, error: "Demasiados intentos, espera unos minutos" };
    }
    let error = "Usuario o contraseña incorrectos";
    try {
      const data = await res.json();
      if (data && data.error) error = data.error;
    } catch (parseError) {
      // Respuesta sin JSON: se conserva el mensaje por defecto.
    }
    return { ok: false, error };
  } catch (error) {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

// Cierra la sesión en el servidor (POST /api/logout) y limpia la sesión en
// memoria. Aunque la petición falle, se limpia `session` localmente.
async function apiLogout() {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } catch (error) {
    console.warn("No se pudo contactar al servidor para cerrar sesión:", error);
  }
  session = null;
}

// =====================================================================
// Access gate (tarea 3.2) — R1.1, R1.5, R4.1, R4.2
// ---------------------------------------------------------------------
// Punto único de decisión de la UI tras conocer el estado de la sesión:
// el Contenido_Educativo (.academy-shell) se muestra SI Y SOLO SI existe una
// sesión válida en memoria; en caso contrario se presenta la Pantalla_Login
// (#loginOverlay). El toggle usa la clase utilitaria .hidden
// (display:none !important) ya definida en styles.css.
//
// Nota: el overlay NO trae .hidden por defecto en el HTML (arranca visible
// para evitar un "flash" de contenido antes de que corra el gate). Por eso
// hideLogin() AÑADE .hidden y showLogin() la QUITA.
// =====================================================================

// Muestra la Pantalla_Login quitando .hidden del overlay (R1.1).
function showLogin() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.classList.remove("hidden");
}

// Oculta la Pantalla_Login añadiendo .hidden al overlay (R1.5).
function hideLogin() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.classList.add("hidden");
}

// Oculta el Contenido_Educativo añadiendo .hidden al shell (R4.1, R4.2).
function hideContent() {
  const shell = document.querySelector(".academy-shell");
  if (shell) shell.classList.add("hidden");
}

// Expone el Contenido_Educativo quitando .hidden del shell (R1.5).
function showContent() {
  const shell = document.querySelector(".academy-shell");
  if (shell) shell.classList.remove("hidden");
}

// Decisión única de acceso: si NO hay sesión válida → login + ocultar
// contenido (R1.1, R4.1, R4.2); si hay sesión → ocultar login + mostrar
// contenido (R1.5). El gating depende SOLO de la existencia de `session`.
function applyAccessState() {
  if (!session) {
    showLogin();
    hideContent();
  } else {
    hideLogin();
    showContent();
  }
}

// Cablea el envío del formulario de login (#loginForm). En submit: previene el
// envío nativo, lee usuario/contraseña y los envía al backend con apiLogin().
// Si el servidor valida las credenciales → activa el perfil de datos, carga el
// contenido protegido, puebla el selector de semana y muestra el contenido
// (R1.2, R1.3, R1.5). Si no → muestra el error inline (con el mensaje del
// servidor) y permanece en el login conservando el foco (R1.4).
function setupLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const userInput = document.getElementById("loginUser");
  const passInput = document.getElementById("loginPass");
  const errorEl = document.getElementById("loginError");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = userInput ? userInput.value.trim() : "";
    const pass = passInput ? passInput.value : "";

    const r = await apiLogin(user, pass);

    if (r.ok) {
      // Credenciales válidas: apiLogin ya asignó `session`. Activar el perfil de
      // datos propio de la cuenta (avance independiente por usuario).
      if (app.globalStore && session) {
        if (!app.globalStore.profiles[session.profile]) {
          app.globalStore.profiles[session.profile] = getBlankProfile();
        }
        app.globalStore.activeProfile = session.profile;
        app.store = app.globalStore.profiles[session.profile];
        saveStore();
      }
      // Limpiar el error y la contraseña antes de entrar al contenido.
      if (errorEl) errorEl.classList.add("hidden");
      if (passInput) passInput.value = "";
      // Cargar el contenido protegido (ya hay cookie de sesión) y poblar el
      // selector de semana, que dependía de app.data.lessons.
      try {
        await loadAllContent();
        populateWeekSelect();
      } catch (error) {
        console.error("No se pudo cargar el contenido tras el login:", error);
      }
      // Abrir el contenido y refrescar la UI dependiente del rol.
      applyAccessState();
      render();
      setupProfileSwitcher();
    } else {
      // Credenciales inválidas o rate limit (R1.4): mostrar el mensaje del
      // servidor y permanecer en el login conservando el foco en el formulario.
      if (errorEl) {
        errorEl.textContent = r.error || "Usuario o contraseña incorrectos";
        errorEl.classList.remove("hidden");
      }
      if (passInput) {
        passInput.value = "";
        passInput.focus();
      } else if (userInput) {
        userInput.focus();
      }
    }
  });
}

// =====================================================================
// Cargador diferido de librerías externas (tarea 6.1) — R11.1, R11.2, R11.4
// ---------------------------------------------------------------------
// Leaflet y Swiper ya no se incluyen en el <head> de index.html: se cargan
// bajo demanda solo al entrar a las vistas que los usan. Esto evita penalizar
// la carga inicial en móvil (R11.1).
//
// URLs de las librerías (mismas versiones que estaban antes en el <head>).
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const SWIPER_CSS = "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css";
const SWIPER_JS = "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js";

// Caché de promesas por URL para garantizar idempotencia: cada recurso se
// solicita a lo sumo una vez aunque loadExternal() se invoque muchas veces.
const externalLoadPromises = new Map();

// loadExternal(kind, url): carga dinámicamente un recurso externo UNA sola vez.
//   - kind "script": inyecta un <script src=url> y resuelve en onload.
//   - kind "css":    inyecta un <link rel="stylesheet" href=url> y resuelve en onload.
// Cachea la promesa por URL (idempotencia): invocaciones repetidas con la misma
// URL devuelven la misma promesa sin volver a inyectar el nodo. Rechaza en
// onerror. La verificación del global esperado (window.L / window.Swiper) se
// hace en ensureLeaflet()/ensureSwiper(), no aquí. Devuelve Promise<void>.
function loadExternal(kind, url) {
  // Reutilizar la promesa cacheada si el recurso ya se solicitó (R11.2, R11.4).
  if (externalLoadPromises.has(url)) {
    return externalLoadPromises.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("document no disponible para cargar recursos externos"));
      return;
    }

    let node;
    if (kind === "css") {
      node = document.createElement("link");
      node.rel = "stylesheet";
      node.href = url;
    } else if (kind === "script") {
      node = document.createElement("script");
      node.src = url;
      node.async = true;
    } else {
      reject(new Error(`Tipo de recurso desconocido: ${kind}`));
      return;
    }

    // Resolver al cargar correctamente; rechazar ante error de red/404.
    node.addEventListener("load", () => resolve());
    node.addEventListener("error", () => {
      // Si la carga falla, descartar la promesa cacheada para permitir reintentos.
      externalLoadPromises.delete(url);
      reject(new Error(`No se pudo cargar el recurso externo: ${url}`));
    });

    (document.head || document.documentElement).appendChild(node);
  });

  externalLoadPromises.set(url, promise);
  return promise;
}

// ensureLeaflet(): garantiza que Leaflet (window.L) esté disponible.
//   - Si window.L ya existe, resuelve de inmediato.
//   - Si no, carga el CSS y el JS de Leaflet 1.9.4 vía loadExternal y resuelve
//     cuando window.L está disponible.
// La promesa queda cacheada en loadExternal por URL, así que no se recarga.
// Rechaza si tras cargar el JS window.L sigue sin existir (R11.2).
async function ensureLeaflet() {
  if (typeof window !== "undefined" && window.L) return;
  // El CSS puede cargarse en paralelo; el JS define el global window.L.
  await Promise.all([
    loadExternal("css", LEAFLET_CSS),
    loadExternal("script", LEAFLET_JS)
  ]);
  if (typeof window === "undefined" || !window.L) {
    throw new Error("Leaflet se cargó pero window.L no está disponible");
  }
}

// ensureSwiper(): análogo a ensureLeaflet pero para Swiper (window.Swiper).
//   - Si window.Swiper ya existe, resuelve de inmediato.
//   - Si no, carga el CSS y el JS de Swiper 11 vía loadExternal y resuelve
//     cuando window.Swiper está disponible.
// Rechaza si tras cargar el JS window.Swiper sigue sin existir (R11.4).
async function ensureSwiper() {
  if (typeof window !== "undefined" && window.Swiper) return;
  await Promise.all([
    loadExternal("css", SWIPER_CSS),
    loadExternal("script", SWIPER_JS)
  ]);
  if (typeof window === "undefined" || !window.Swiper) {
    throw new Error("Swiper se cargó pero window.Swiper no está disponible");
  }
}

// =====================================================================
// Superficie testeable — feature: acceso-responsive-despliegue
// ---------------------------------------------------------------------
// Expone la LÓGICA PURA de la app a los tests de propiedad/unitarios
// (Vitest + fast-check) SIN introducir un framework ni un build step.
//
// En el navegador, app.js sigue siendo un <script> clásico: este bloque
// solo adjunta un objeto a window.__authTestApi. Los tests cargan app.js
// con el harness (tests/helpers/loadAuthApi.js) y leen este objeto.
//
// Funciones puras/auxiliares expuestas a los tests:
//   - canAccessView                               (autorización por rol)
//   - loadExternal / ensureLeaflet / ensureSwiper (cargador diferido)
//   - resolveWeek                                 (resolución de semana)
//   - applyAccessState                            (access gate)
//
// `typeof <identificador no declarado>` devuelve "undefined" sin lanzar
// ReferenceError, por lo que registrar funciones que no existan es seguro:
// simplemente se omiten.
// =====================================================================
(function exposeAuthTestApi() {
  if (typeof window === "undefined") return;
  const api = {};
  api.applyAccessState = typeof applyAccessState !== "undefined" ? applyAccessState : undefined;
  api.canAccessView = typeof canAccessView !== "undefined" ? canAccessView : undefined;
  api.loadExternal = typeof loadExternal !== "undefined" ? loadExternal : undefined;
  api.ensureLeaflet = typeof ensureLeaflet !== "undefined" ? ensureLeaflet : undefined;
  api.ensureSwiper = typeof ensureSwiper !== "undefined" ? ensureSwiper : undefined;
  api.resolveWeek = typeof resolveWeek !== "undefined" ? resolveWeek : undefined;
  // Eliminar las entradas no disponibles para no exponer `undefined`.
  Object.keys(api).forEach((key) => api[key] === undefined && delete api[key]);
  window.__authTestApi = api;
})();
