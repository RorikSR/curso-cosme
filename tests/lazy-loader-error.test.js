// Tarea 6.4 — manejo de error de carga de librerías diferidas (R11.5).
// Verifica el MECANISMO de error del cargador: si la inyección del recurso
// falla (evento "error"), ensureLeaflet/ensureSwiper rechazan la promesa y la
// caché por URL se limpia para permitir un reintento posterior exitoso.
// El bloque visual de "Reintentar" en la vista se valida con pruebas de
// navegador/manual (jsdom no renderiza la vista completa).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadAuthTestApi } from "./helpers/loadAuthApi.js";

let originalCreateElement;
let originalAppendChild;
let mode; // "error" → los scripts disparan onerror; "ok" → onload + global

function installDomMock() {
  originalCreateElement = document.createElement.bind(document);
  originalAppendChild = document.head.appendChild.bind(document.head);

  document.createElement = (tag) => {
    const handlers = {};
    return {
      tagName: String(tag).toUpperCase(),
      rel: "", href: "", src: "", async: false,
      addEventListener(type, cb) { handlers[type] = cb; },
      __fire(type) { if (handlers[type]) handlers[type](); }
    };
  };

  document.head.appendChild = (node) => {
    const url = node.src || node.href;
    Promise.resolve().then(() => {
      if (mode === "error" && node.src) {
        // Solo los <script> fallan; el CSS puede "cargar" sin efecto.
        node.__fire("error");
      } else {
        if (/leaflet.*\.js/i.test(url)) window.L = window.L || { __mock: true };
        if (/swiper.*\.js/i.test(url)) window.Swiper = window.Swiper || function () {};
        node.__fire("load");
      }
    });
    return node;
  };
}

function restoreDomMock() {
  document.createElement = originalCreateElement;
  document.head.appendChild = originalAppendChild;
}

describe("Tarea 6.4 — error de carga de librería diferida (R11.5)", () => {
  beforeEach(() => {
    delete window.L;
    delete window.Swiper;
    installDomMock();
  });
  afterEach(() => {
    restoreDomMock();
    delete window.L;
    delete window.Swiper;
  });

  it("ensureLeaflet rechaza si el script falla, y un reintento posterior tiene éxito", async () => {
    // Feature: acceso-responsive-despliegue, R11.5: fallo de carga no rompe la app
    // Validates: Requirements 11.5
    const api = loadAuthTestApi();

    mode = "error";
    await expect(api.ensureLeaflet()).rejects.toBeTruthy();
    expect(window.L).toBeFalsy();

    // La caché de la promesa fallida se limpió: un reintento (ahora OK) resuelve.
    mode = "ok";
    await expect(api.ensureLeaflet()).resolves.toBeUndefined();
    expect(window.L).toBeTruthy();
  });

  it("ensureSwiper rechaza si el script falla, sin dejar window.Swiper definido", async () => {
    // Feature: acceso-responsive-despliegue, R11.5: fallo de carga aislado
    // Validates: Requirements 11.5
    const api = loadAuthTestApi();

    mode = "error";
    await expect(api.ensureSwiper()).rejects.toBeTruthy();
    expect(window.Swiper).toBeFalsy();

    mode = "ok";
    await expect(api.ensureSwiper()).resolves.toBeUndefined();
    expect(window.Swiper).toBeTruthy();
  });
});
