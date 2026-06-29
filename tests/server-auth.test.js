// Tests de integración del backend seguro (server/server.js).
// Feature: acceso-responsive-despliegue — login propio seguro (Opción A).
// Verifican que el CONTENIDO está realmente bloqueado sin sesión y que el
// login con bcrypt + cookie de sesión funciona. Se monta el servidor real en
// un puerto efímero (app.listen(0)) y se le pega con fetch, gestionando la
// cookie de sesión manualmente (fetch de Node no la persiste solo).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";

// El backend es CommonJS; lo cargamos con require desde este test ESM.
const require = createRequire(import.meta.url);
const app = require("../server/server.js");

let server;
let base;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

// Extrae las cookies de un Set-Cookie para reenviarlas. cookie-session emite
// dos cookies (payload + firma "*.sig"); getSetCookie() las separa de forma
// fiable (evita el problema de las comas en las fechas Expires).
function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  return list.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function login(username, password) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return { status: res.status, body: await res.json().catch(() => ({})), cookie: cookieFrom(res) };
}

describe("Backend seguro — el contenido exige sesión (R4.1, R4.3, R8.2)", () => {
  it("sin sesión, /data y /assets devuelven 401", async () => {
    // Validates: Requirements 4.1, 4.3, 8.2
    expect((await fetch(`${base}/data/Quizzes.csv`)).status).toBe(401);
    expect((await fetch(`${base}/assets/anatomy/musculos_faciales.png`)).status).toBe(401);
    expect((await fetch(`${base}/api/session`)).status).toBe(401);
  });

  it("el shell público (index.html, app.js) se sirve sin sesión", async () => {
    // Validates: Requirements 4.2 (la app puede mostrar el login sin exponer contenido)
    expect((await fetch(`${base}/index.html`)).status).toBe(200);
    expect((await fetch(`${base}/app.js`)).status).toBe(200);
  });

  it("credenciales incorrectas → 401 (R1.4)", async () => {
    // Validates: Requirements 1.4
    expect((await login("admin", "incorrecta")).status).toBe(401);
    expect((await login("noexiste", "ohliliana")).status).toBe(401);
  });

  it("admin/admin123 inicia sesión y obtiene acceso al contenido (R1.3, R1.5)", async () => {
    // Validates: Requirements 1.3, 1.5, 4.3
    const { status, body, cookie } = await login("admin", "admin123");
    expect(status).toBe(200);
    expect(body).toEqual({ user: "admin", role: "admin", profile: "admin" });
    const csv = await fetch(`${base}/data/Quizzes.csv`, { headers: { cookie } });
    expect(csv.status).toBe(200);
    const sess = await fetch(`${base}/api/session`, { headers: { cookie } });
    expect(sess.status).toBe(200);
  });

  it("ivi/ohliliana y xime/ohliliana inician sesión como estudiantes (R1.2)", async () => {
    // Validates: Requirements 1.2
    const ivi = await login("ivi", "ohliliana");
    expect(ivi.status).toBe(200);
    expect(ivi.body).toEqual({ user: "ivi", role: "student", profile: "ivi" });
    const xime = await login("xime", "ohliliana");
    expect(xime.status).toBe(200);
    expect(xime.body).toEqual({ user: "xime", role: "student", profile: "xime" });
  });

  it("tras logout, el contenido vuelve a estar bloqueado (R1.7)", async () => {
    // Validates: Requirements 1.6, 1.7
    const { cookie } = await login("admin", "admin123");
    expect((await fetch(`${base}/data/Quizzes.csv`, { headers: { cookie } })).status).toBe(200);
    const out = await fetch(`${base}/api/logout`, { method: "POST", headers: { cookie } });
    const cookie2 = cookieFrom(out) || cookie;
    // Con la cookie de sesión ya invalidada, el contenido vuelve a 401.
    const after = await fetch(`${base}/data/Quizzes.csv`, { headers: { cookie: cookie2 } });
    expect(after.status).toBe(401);
  });
});
