import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { loadAuthTestApi } from "./helpers/loadAuthApi.js";

const ROLES = ["student", "admin"];

describe("Property 4 — autorización por rol (canAccessView, pura sin DOM)", () => {
  it("autoriza la vista 'admin' si y solo si el rol es 'admin'", () => {
    // Feature: acceso-responsive-despliegue, Property 4: el panel admin solo es accesible para role==='admin'
    // Validates: Requirements 3.1, 3.2
    const api = loadAuthTestApi();
    fc.assert(
      fc.property(fc.constantFrom(...ROLES), (role) => {
        expect(api.canAccessView("admin", role)).toBe(role === "admin");
      }),
      { numRuns: 100 }
    );
  });

  it("cualquier vista distinta de 'admin' se autoriza para cualquier rol", () => {
    // Feature: acceso-responsive-despliegue, Property 4: vistas no-admin abiertas a todo rol válido
    // Validates: Requirements 3.3, 3.4
    const api = loadAuthTestApi();
    fc.assert(
      fc.property(
        // Vistas arbitrarias, excluyendo el sentinel "admin".
        fc.string().filter((v) => v !== "admin"),
        fc.constantFrom(...ROLES),
        (viewName, role) => {
          expect(api.canAccessView(viewName, role)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("unit: rol ausente/desconocido se trata como NO admin", () => {
    // Validates: Requirements 3.1, 3.4
    const api = loadAuthTestApi();
    expect(api.canAccessView("admin", undefined)).toBe(false);
    expect(api.canAccessView("admin", "")).toBe(false);
    expect(api.canAccessView("home", undefined)).toBe(true);
  });
});

// =====================================================================
// Alcance de pruebas — casos OMITIDOS deliberadamente en esta suite
// ---------------------------------------------------------------------
// Los siguientes criterios NO se cubren aquí porque requieren un navegador
// real (render completo del DOM, eventos táctiles, overlays, layout
// responsive) o infraestructura de despliegue (Docker/nginx/Cloudflare), que
// quedan fuera del alcance de los tests de lógica pura (Vitest + jsdom):
//   - Drawer móvil abre/cierra con ☰ (R9.3) — requiere DOM/CSS y eventos.
//   - "Empezar sesión" en móvil (R10.5/R10.2) — requiere render y flujo de UI.
//   - Gating con overlay visible/oculto (R3.3 a nivel de DOM) — requiere render.
//   - Selector de semana embebido (R7.5/R12.3) — requiere DOM render.
//   - Inmutabilidad del rol en la UI (R3.7) — requiere flujo de interacción.
//   - Smoke/integración Docker y nginx Basic Auth (R9.5/R6/R8) — requiere Docker.
// Estos se validan con tests de integración/smoke o pruebas manuales
// documentadas, según la Testing Strategy del diseño.
// =====================================================================
