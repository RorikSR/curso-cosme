import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { loadAuthTestApi } from "./helpers/loadAuthApi.js";

// Tests de andamiaje (tarea 1.1): verifican que la infraestructura de pruebas
// está lista — Vitest + fast-check + entorno jsdom + punto de exportación
// testeable (window.__authTestApi) — antes de implementar la lógica pura.
// No validan comportamiento de negocio; las propiedades 1–8 llegan en tareas
// posteriores (2.x, 3.x, 6.x, 7.x).

describe("infraestructura de pruebas (tarea 1.1)", () => {
  it("expone localStorage y DOM del entorno jsdom para los mocks", () => {
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
    expect(typeof window.localStorage).toBe("object");
    window.localStorage.setItem("infra-smoke", "ok");
    expect(window.localStorage.getItem("infra-smoke")).toBe("ok");
    window.localStorage.removeItem("infra-smoke");
  });

  it("tiene fast-check operativo para los tests de propiedad", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => n + 0 === n),
      { numRuns: 100 }
    );
  });

  it("carga la lógica pura de la app y devuelve window.__authTestApi", () => {
    const api = loadAuthTestApi();
    // El punto de exportación existe aunque aún esté vacío: las funciones
    // puras se registran en él conforme se implementen en tareas posteriores.
    expect(api).toBeTypeOf("object");
    expect(window.__authTestApi).toBe(api);
  });
});
