// =====================================================================
// Ivania Facial Lab — Backend seguro (Express, CommonJS)
// ---------------------------------------------------------------------
// Sustituye el login solo-cliente por un login REAL en el servidor:
//   - Las credenciales se validan con bcrypt (nunca en el navegador).
//   - Se emite una cookie de sesión httpOnly firmada (cookie-session).
//   - El CONTENIDO (App/data/** y App/assets/**) NO se sirve sin sesión.
//
// Nota sobre el sistema de módulos: el package.json raíz declara
// "type": "module", por lo que añadimos server/package.json con
// { "type": "commonjs" } para que ESTE archivo use require/module.exports.
// =====================================================================

const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");

// ---------------------------------------------------------------------
// Constantes de entorno (con fallback para desarrollo)
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

// Secreto para firmar la cookie de sesión. En producción DEBE venir de env.
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-change-me";
if (SESSION_SECRET === "dev-insecure-change-me") {
  console.warn(
    "[ADVERTENCIA] SESSION_SECRET usa el valor por defecto inseguro. " +
    "Define la variable de entorno SESSION_SECRET con un secreto real antes de desplegar a producción."
  );
}

// Cookie segura (solo HTTPS) cuando COOKIE_SECURE === "true".
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

// Carpeta de la SPA (un nivel arriba de /server).
const APP_DIR = path.resolve(__dirname, "..", "App");

// ---------------------------------------------------------------------
// Usuarios (hashes bcrypt)
// ---------------------------------------------------------------------
// Los hashes se leen de variables de entorno con fallback a hashes ya
// generados. Las contraseñas de los fallbacks son:
//   ivi   → "ohliliana"
//   xime  → "ohliliana"
//   admin → "admin123"
// Para regenerar un hash bcrypt (coste 12):
//   node -e "console.log(require('bcryptjs').hashSync('CLAVE',12))"
const USERS = {
  ivi: {
    role: "student",
    profile: "ivi",
    hash: process.env.HASH_IVI || "$2b$12$Sl2sznwNK.SQbEsWKokRBe1I2abNI0G/pesi4.DR4e61vXAOdq0e6"
  },
  xime: {
    role: "student",
    profile: "xime",
    hash: process.env.HASH_XIME || "$2b$12$fNBYHb.p1bIu97QRpGOvRuBsqUcCkPVdWYhfmSRiq5u8FIlVae8aK"
  },
  admin: {
    role: "admin",
    profile: "admin",
    hash: process.env.HASH_ADMIN || "$2b$12$E3clbDlPaAvWCTYwOxQUW.6RjmDnuv/j0Hr0ORwPC2dAEZyDW7UUe"
  }
};

// Hash dummy contra el que comparar cuando el usuario NO existe, de modo que
// bcrypt.compare se ejecute SIEMPRE y no se filtre por timing si un usuario
// existe o no. (Es un hash bcrypt válido de una cadena arbitraria.)
const DUMMY_HASH = "$2b$12$E3clbDlPaAvWCTYwOxQUW.6RjmDnuv/j0Hr0ORwPC2dAEZyDW7UUe";

// ---------------------------------------------------------------------
// App y middleware
// ---------------------------------------------------------------------
const app = express();

// Necesario para que las cookies "secure" funcionen detrás de un proxy/HTTPS.
app.set("trust proxy", 1);

// Parseo de JSON en los endpoints /api.
app.use(express.json());

// Sesión basada en cookie httpOnly firmada.
app.use(cookieSession({
  name: "ivania_sess",
  secret: SESSION_SECRET,
  httpOnly: true,
  sameSite: "lax",
  secure: COOKIE_SECURE,
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
}));

// ---------------------------------------------------------------------
// Rate limiting básico en memoria para POST /api/login
// ---------------------------------------------------------------------
// Cuenta los intentos FALLIDOS por IP. Si superan MAX_ATTEMPTS dentro de la
// ventana WINDOW_MS, se responde 429 hasta que expire la ventana. Estructura
// simple con un Map; se limpian las entradas viejas en cada chequeo.
const MAX_ATTEMPTS = 10;            // máx. intentos fallidos
const WINDOW_MS = 15 * 60 * 1000;   // ventana de 15 minutos
const loginAttempts = new Map();    // ip -> { count, firstAt }

// Elimina entradas cuya ventana ya expiró (limpieza perezosa).
function cleanupAttempts(now) {
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAt > WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}

// Devuelve true si la IP está actualmente bloqueada por exceso de intentos.
function isRateLimited(ip) {
  const now = Date.now();
  cleanupAttempts(now);
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.firstAt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

// Registra un intento fallido para la IP, iniciando o reusando su ventana.
function registerFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

// Limpia los intentos de una IP tras un login exitoso.
function clearFailures(ip) {
  loginAttempts.delete(ip);
}

// ---------------------------------------------------------------------
// Endpoints de autenticación (responden JSON)
// ---------------------------------------------------------------------

// POST /api/login { username, password }
// Valida credenciales con bcrypt y, si coinciden, crea la sesión.
app.post("/api/login", async (req, res) => {
  const ip = req.ip;

  // Rate limit por IP: demasiados intentos fallidos → 429.
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Demasiados intentos, espera unos minutos" });
  }

  const { username, password } = req.body || {};
  const user = (typeof username === "string") ? username : "";
  const pass = (typeof password === "string") ? password : "";

  // Buscar el usuario; si no existe, comparar contra el hash dummy para no
  // filtrar por timing si el usuario existe o no.
  const account = USERS[user];
  const hashToCompare = account ? account.hash : DUMMY_HASH;

  // bcrypt.compare se ejecuta SIEMPRE (exista o no el usuario).
  let passwordOk = false;
  try {
    passwordOk = await bcrypt.compare(pass, hashToCompare);
  } catch (error) {
    passwordOk = false;
  }

  if (account && passwordOk) {
    // Credenciales correctas: emitir sesión y limpiar intentos fallidos.
    clearFailures(ip);
    req.session = { user, role: account.role, profile: account.profile };
    return res.status(200).json({ user, role: account.role, profile: account.profile });
  }

  // Credenciales incorrectas: contar el intento fallido y responder 401.
  registerFailure(ip);
  return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
});

// POST /api/logout — destruye la sesión.
app.post("/api/logout", (req, res) => {
  req.session = null;
  return res.status(200).json({ ok: true });
});

// GET /api/session — devuelve la sesión activa o 401 si no hay.
app.get("/api/session", (req, res) => {
  if (req.session && req.session.user) {
    return res.status(200).json({
      user: req.session.user,
      role: req.session.role,
      profile: req.session.profile
    });
  }
  return res.status(401).json({ error: "no session" });
});

// ---------------------------------------------------------------------
// Guard de contenido protegido
// ---------------------------------------------------------------------
// Solo se entrega /data y /assets si hay sesión válida. El orden importa:
// estas rutas guardadas van ANTES de los estáticos públicos.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).type("text").send("No autorizado");
}

app.use("/data", requireAuth, express.static(path.join(APP_DIR, "data")));
app.use("/assets", requireAuth, express.static(path.join(APP_DIR, "assets")));

// ---------------------------------------------------------------------
// Estáticos PÚBLICOS (sin secretos): index.html, app.js, styles.css, favicon.
// Van DESPUÉS de las rutas guardadas para que /data y /assets no se filtren.
// ---------------------------------------------------------------------
app.use(express.static(APP_DIR));

// Fallback SPA: cualquier otra ruta sirve index.html.
// NOTA: Express 5 usa path-to-regexp v8, donde el comodín de cadena "*" ya no
// es válido (lanza "Missing parameter name"). Usamos una expresión regular
// /.*/ que sí es compatible y cumple el mismo propósito de catch-all.
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(APP_DIR, "index.html"));
});

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
// Solo escucha cuando se ejecuta directamente (node server/server.js). Al
// importarse desde un test, se exporta `app` sin abrir el puerto, para poder
// montar el servidor en un puerto efímero durante las pruebas de integración.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ivania Facial Lab en http://localhost:${PORT}`);
  });
}

module.exports = app;
