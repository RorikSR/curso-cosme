import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { loadAuthTestApi } from "./helpers/loadAuthApi.js";

const SENTINEL = "Selecciona una semana";

// Generador de etiquetas de semana del estilo "Semana N".
const weekLabel = fc.integer({ min: 1, max: 52 }).map((n) => `Semana ${n}`);

describe("Property 7 — resolveWeek nunca cae en el estado vacío", () => {
  it("selected='all' resuelve a la Semana_Actual; nunca el sentinel", () => {
    // Feature: acceso-responsive-despliegue, Property 7: 'all' -> semana actual, sin estado vacío
    // Validates: Requirements 12.1, 12.4
    const api = loadAuthTestApi();
    fc.assert(
      fc.property(weekLabel, (current) => {
        const { week } = api.resolveWeek("all", current, undefined);
        expect(week).toBe(current);
        expect(week).not.toBe(SENTINEL);
      }),
      { numRuns: 100 }
    );
  });

  it("selected='Semana k' resuelve a esa semana; nunca el sentinel", () => {
    // Feature: acceso-responsive-despliegue, Property 7: semana concreta -> esa semana
    // Validates: Requirements 12.2, 12.4
    const api = loadAuthTestApi();
    fc.assert(
      fc.property(weekLabel, weekLabel, (selected, current) => {
        const { week } = api.resolveWeek(selected, current, undefined);
        expect(week).toBe(selected);
        expect(week).not.toBe(SENTINEL);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Property 8 — resolveWeek reporta la disponibilidad de contenido", () => {
  it("hasContent es true si y solo si la semana resuelta está en availableWeeks", () => {
    // Feature: acceso-responsive-despliegue, Property 8: hasContent <-> semana en availableWeeks
    // Validates: Requirements 12.5, 12.6
    const api = loadAuthTestApi();
    fc.assert(
      fc.property(
        fc.constantFrom("all", "__concrete__"),
        weekLabel, // current
        weekLabel, // selected concreto (si aplica)
        fc.array(weekLabel, { maxLength: 12 }),
        (mode, current, selectedWeek, availableWeeks) => {
          const selected = mode === "all" ? "all" : selectedWeek;
          const { week, hasContent } = api.resolveWeek(selected, current, availableWeeks);
          expect(hasContent).toBe(availableWeeks.includes(week));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("unit: sin availableWeeks, hasContent es undefined", () => {
    // Validates: Requirements 12.5
    const api = loadAuthTestApi();
    expect(api.resolveWeek("all", "Semana 3", undefined).hasContent).toBeUndefined();
  });
});
