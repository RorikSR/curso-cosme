import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { loadAuthTestApi } from "./helpers/loadAuthApi.js";

// Property 6 — Idempotencia del cargador diferido.
//
// Enfoque: mockeamos el DOM (document.createElement + head.appendChild) para
// CONTAR cuántos nodos <script>/<link> se inyectan por URL. Cada nodo falso
// dispara su evento "load" en una microtask; cuando el nodo inyectado es el JS
// de la librería, definimos el global esperado (window.L / window.Swiper) justo
// antes de resolver, para que la verificación posterior de ensureX() pase.
//
// Si window.L / window.Swiper ya existen, ensureX() resuelve de inmediato sin
// tocar el DOM; y loadExternal cachea la promesa por URL, así que repetir la
// llamada NO reinyecta el recurso. Tras N llamadas, cada URL aparece a lo sumo
// una vez en el registro de inyecciones.

let originalCreateElement;
let originalAppendChild;
let injectedUrls;

function installDomMock() {
  injectedUrls = [];
  originalCreateElement = document.createElement.bind(document);
  originalAppendChild = document.head.appendChild.bind(document.head);

  document.createElement = (tag) => {
    // Nodo falso mínimo: registra handlers y expone src/href/rel/async.
    const handlers = {};
    return {
      tagName: String(tag).toUpperCase(),
      rel: "",
      href: "",
      src: "",
      async: false,
      addEventListener(type, cb) {
        handlers[type] = cb;
      },
      __fire(type) {
        if (handlers[type]) handlers[type]();
      }
    };
  };

  document.head.appendChild = (node) => {
    const url = node.src || node.href;
    injectedUrls.push(url);
    // Disparar "load" en microtask. Si es el JS de la librería, definir el
    // global esperado para que la comprobación de ensureX() tenga éxito.
    Promise.resolve().then(() => {
      if (/leaflet.*\.js/i.test(url)) window.L = window.L || { __mock: true };
      if (/swiper.*\.js/i.test(url)) window.Swiper = window.Swiper || function () {};
      node.__fire("load");
    });
    return node;
  };
}

function restoreDomMock() {
  document.createElement = originalCreateElement;
  document.head.appendChild = originalAppendChild;
}

describe("Property 6 — el cargador diferido es idempotente", () => {
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

  it("ensureLeaflet inyecta cada recurso a lo sumo una vez tras N llamadas", async () => {
    // Feature: acceso-responsive-despliegue, Property 6: ensureLeaflet idempotente
    // Validates: Requirements 11.2
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (n) => {
        delete window.L;
        injectedUrls = [];
        const api = loadAuthTestApi();
        for (let i = 0; i < n; i++) {
          await api.ensureLeaflet();
        }
        // Ninguna URL se inyecta más de una vez.
        const unique = new Set(injectedUrls);
        expect(injectedUrls.length).toBe(unique.size);
        // Y el recurso se solicitó (al menos el JS) exactamente una vez.
        const leafletJs = injectedUrls.filter((u) => /leaflet.*\.js/i.test(u));
        expect(leafletJs.length).toBe(1);
        expect(window.L).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });

  it("ensureSwiper inyecta cada recurso a lo sumo una vez tras N llamadas", async () => {
    // Feature: acceso-responsive-despliegue, Property 6: ensureSwiper idempotente
    // Validates: Requirements 11.4
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (n) => {
        delete window.Swiper;
        injectedUrls = [];
        const api = loadAuthTestApi();
        for (let i = 0; i < n; i++) {
          await api.ensureSwiper();
        }
        const unique = new Set(injectedUrls);
        expect(injectedUrls.length).toBe(unique.size);
        const swiperJs = injectedUrls.filter((u) => /swiper.*\.js/i.test(u));
        expect(swiperJs.length).toBe(1);
        expect(window.Swiper).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });

  it("unit: loadExternal cachea la promesa por URL (misma URL -> misma promesa)", () => {
    // Verificación de idempotencia a nivel de loadExternal: dos llamadas con la
    // misma URL devuelven exactamente la misma promesa cacheada (no reinyecta).
    // Validates: Requirements 11.2, 11.4
    injectedUrls = [];
    const api = loadAuthTestApi();
    const p1 = api.loadExternal("script", "https://example.test/lib.js");
    const p2 = api.loadExternal("script", "https://example.test/lib.js");
    expect(p1).toBe(p2);
    expect(injectedUrls.filter((u) => u === "https://example.test/lib.js").length).toBe(1);
  });
});
