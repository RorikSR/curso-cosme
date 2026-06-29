import { defineConfig } from "vitest/config";

// Configuración de Vitest para la lógica pura de la SPA.
// - environment "jsdom": provee window, document y localStorage para los
//   mocks de sesión/DOM que usarán los tests de auth, gating y carga diferida.
// - Solo se recogen los tests bajo tests/ para no tocar la app (App/) ni
//   introducir un framework/build step en ella.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    globals: true
  }
});
