import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APP_JS = resolve(here, "../../App/app.js");

/**
 * Carga la lógica pura de App/app.js y devuelve la superficie testeable
 * (window.__authTestApi) SIN introducir un framework ni un build step en la app.
 *
 * Cómo funciona, sin tocar la app:
 * - app.js es un <script> clásico (no un módulo). Aquí leemos su código fuente
 *   y lo ejecutamos dentro de una función aislada (new Function) sobre el
 *   `window` de jsdom que provee Vitest.
 * - El bloque de registro al final de app.js asigna las funciones puras a
 *   `window.__authTestApi`. Ese objeto es lo que devolvemos.
 * - `init()` solo se dispara en el listener de DOMContentLoaded, que no se
 *   emite al ejecutar el código, así que no corren los efectos de red/DOM.
 * - Usar `new Function` (en lugar de eval indirecto) crea un ámbito nuevo en
 *   cada llamada, por lo que puede invocarse en varios tests sin colisiones de
 *   `const`/`function` ya declarados.
 *
 * @returns {Record<string, Function>} La API de pruebas (vacía hasta que las
 *   tareas 2.x, 3.x, 6.x y 7.x implementen las funciones puras).
 */
export function loadAuthTestApi() {
  const src = readFileSync(APP_JS, "utf8");
  // El cuerpo se ejecuta en modo no estricto (igual que el <script> clásico)
  // y tiene acceso al `window`/`document` globales de jsdom.
  const run = new Function(src);
  run();
  return (typeof window !== "undefined" && window.__authTestApi) || {};
}
