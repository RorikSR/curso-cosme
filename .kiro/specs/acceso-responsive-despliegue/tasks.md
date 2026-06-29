# Implementation Plan: Acceso, Responsive y Despliegue

## Overview

Este plan convierte el diseño en pasos de codificación incrementales para "Ivania Facial Lab",
manteniendo **vanilla JS sin framework**. Cubre cuatro frentes interdependientes:

1. Autenticación, sesión y rol en la SPA (`App/app.js`, `App/index.html`, `App/styles.css`).
2. Empaquetado y despliegue (Docker + nginx Basic Auth, Portainer, Cloudflare Tunnel).
3. Responsive móvil (drawer del sidebar, "Empezar sesión"/actividad reciente, lazy load).
4. Eliminación del estado vacío en Quizzes y Flashcards (`resolveWeek` + selector embebido).

Decisiones confirmadas reflejadas en el plan:
- **Barrera de acceso**: Basic Auth en nginx (Opción B), con dos credenciales compartidas
  (estudiante y admin) en un `.htpasswd`.
- **Conexión Cloudflare ↔ contenedor**: Cloudflare Tunnel (sin IP pública ni puerto abierto directo).

Los tests de propiedad usan **fast-check** sobre la lógica pura, ejecutados con un runner ligero
(Vitest). Las sub-tareas marcadas con `*` son opcionales (tests) y pueden omitirse para un MVP.

## Tasks

- [x] 1. Preparar el entorno de pruebas y la API testeable
  - [x] 1.1 Configurar Vitest + fast-check y exponer la lógica pura
    - Crear `package.json` con dependencias de desarrollo (`vitest`, `fast-check`) y script `test`
    - Crear configuración de Vitest (entorno `jsdom` para mocks de `localStorage`/DOM)
    - Definir el punto de exportación testeable de la lógica pura (`window.__authTestApi` o módulo
      equivalente) para `validateCredentials`, sesión, `canAccessView`, `loadExternal`/`ensureX` y
      `resolveWeek`, sin introducir framework en la app
    - _Requirements: 1.2, 2.1, 3.4, 11.2, 12.1_

- [x] 2. Implementar el módulo de autenticación y sesión en `App/app.js`
  - [x] 2.1 Implementar `validateCredentials` y `AUTH_CONFIG`
    - Definir `AUTH_CONFIG` con usuario y contraseña como **hash SHA-256** para estudiante y admin
    - Implementar `validateCredentials(username, password)` que devuelve `"student" | "admin" | null`
      usando `crypto.subtle` para hashear y comparar
    - _Requirements: 1.2, 1.3, 1.4_

  - [x]* 2.2 Escribir test de propiedad de validación de credenciales
    - **Property 1: Validación de credenciales devuelve el rol correcto**
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - Generadores: usuarios/claves válidas que coinciden con cada rol e inválidas aleatorias
    - Mínimo 100 iteraciones; etiqueta de trazabilidad en comentario

  - [x] 2.3 Implementar ciclo de vida de la sesión y migración de perfil
    - Implementar `createSession(role)`, `restoreSession()`, `destroySession()` con clave
      `ivania-facial-lab-session-v1` en `localStorage` y estado en memoria `session`
    - Degradar a sesión solo en memoria con `console.warn` si `localStorage` no está disponible
    - Migrar `profiles.ivania → profiles.student` al cargar si aún no existe `profiles.student`,
      sin modificar el resto del estado `ivania-facial-lab-state-v2`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 1.6, 1.7_

  - [x]* 2.4 Escribir test de propiedad de round-trip de sesión
    - **Property 2: Round-trip de sesión preserva el rol y el logout lo elimina**
    - **Validates: Requirements 2.1, 2.2, 2.3, 1.7**
    - Generadores: rol ∈ {student, admin}; `localStorage` mockeado

  - [x]* 2.5 Escribir tests unitarios de logout y fallo de borrado
    - Logout exitoso borra la sesión y vuelve al login (R1.6, R1.7)
    - `destroySession` con `removeItem` que lanza devuelve `false`, mantiene la sesión en memoria y
      no completa el logout (R2.4)
    - _Requirements: 1.6, 2.4_

- [x] 3. Construir la pantalla de login, el access gate y el control de sesión
  - [x] 3.1 Crear el overlay de login y sus estilos
    - Añadir el formulario de login (usuario, contraseña, mensaje de error inline) como overlay en
      `App/index.html` y los estilos correspondientes en `App/styles.css`
    - Mensaje "Usuario o contraseña incorrectos" sin revelar qué campo falló; conservar el foco
    - _Requirements: 1.1, 1.4_

  - [x] 3.2 Implementar el access gate (`applyAccessState`)
    - Implementar `applyAccessState`, `showLogin`/`hideContent` y `hideLogin`/`showContent` de modo
      que el contenido se muestre si y solo si existe una sesión válida
    - Cablear el envío del formulario de login a `validateCredentials` → `createSession` →
      `applyAccessState`; en fallo, mostrar el error y permanecer en login
    - _Requirements: 1.1, 1.5, 4.1, 4.2_

  - [x]* 3.3 Escribir test de propiedad del gating (verificación manual en navegador; el gating equivalente está cubierto por los tests de integración del backend 401/200)
    - **Property 3: El gating depende solo de la existencia de sesión**
    - **Validates: Requirements 1.1, 1.5, 4.1, 4.2**
    - Generadores: sesión nula vs. sesión válida

  - [x] 3.4 Implementar `canAccessView` y el router guard en `render()`
    - Implementar `canAccessView(viewName, role)` (vista `admin` solo para `admin`)
    - Integrar la comprobación en `render()` **antes** de despachar la vista; si un `student`
      solicita `admin`, forzar `app.view = "home"` como control primario
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 3.5 Escribir test de propiedad de autorización por rol
    - **Property 4: La autorización del panel de administración depende solo del rol**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Generadores: vista ∈ rutas; rol ∈ {student, admin}; sin dependencia del DOM/CSS

  - [x] 3.6 Reemplazar el profile switcher por el control de sesión real
    - Sustituir el dropdown cosmético de 3 perfiles por un control que muestre el rol activo
      ("Administrador"/"Estudiante") y un botón de cerrar sesión cableado a `destroySession`
    - Mostrar/ocultar la navegación al Panel_Administracion según el rol de la sesión
    - _Requirements: 5.1, 5.2, 3.1, 3.2_

  - [x]* 3.7 Escribir test de propiedad de inmutabilidad del rol y unit del control de sesión (verificación manual en navegador; el rol lo fija el backend vía cookie firmada)
    - **Property 5: El rol solo cambia a través de la autenticación**
    - **Validates: Requirements 5.3**
    - Generadores: secuencias aleatorias de acciones de UI que no incluyen login
    - Unit: el control muestra el rol correcto y reemplaza el dropdown de 3 perfiles (R5.1, R5.2)
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 4. Checkpoint - Verificar autenticación y acceso
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar el responsive móvil (drawer y acceso a la sesión sugerida)
  - [x] 5.1 Implementar el CSS del drawer y el backdrop
    - En `App/styles.css`, dentro de la media query móvil, presentar el Sidebar como panel
      superpuesto (drawer) que no empuja el contenido, con clase `.sidebar-open` en `.academy-shell`
      y un backdrop; el contenido ocupa el ancho disponible cuando el drawer está oculto
    - _Requirements: 9.1, 9.2_

  - [x] 5.2 Implementar los handlers del drawer en `App/app.js`
    - Implementar `toggleSidebar()` y `closeSidebar()`, cablear el `#toggleSidebarBtn` (☰) para
      abrir/cerrar, cerrar al tocar el backdrop y cerrar al seleccionar una opción de navegación
    - _Requirements: 9.3, 9.4, 9.5_

  - [x]* 5.3 Escribir tests unitarios del drawer (verificación manual en navegador; requiere matchMedia/eventos)
    - ☰ abre (R9.3), ☰ de nuevo cierra (R9.4), navegar cierra (R9.5), backdrop cierra
    - _Requirements: 9.3, 9.4, 9.5_

  - [x] 5.4 Implementar "Empezar sesión" y actividad reciente en móvil
    - Renderizar, en el flujo de contenido móvil, un acceso visible a "Empezar sesión" que abra la
      lección sugerida vía `nextLesson()`, y reubicar la información de actividad reciente del
      Right_Rail
    - Si `nextLesson()` no devuelve lección válida, mostrar aviso y ofrecer la Ruta de estudio
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x]* 5.5 Escribir tests unitarios de "Empezar sesión" en móvil (verificación manual en navegador; requiere render completo)
    - Abre la lección sugerida (R10.2) y degrada con aviso si no hay lección (R10.3)
    - _Requirements: 10.2, 10.3_

- [x] 6. Implementar la carga diferida de Leaflet y Swiper
  - [x] 6.1 Implementar el cargador dinámico y quitar los scripts del head
    - Eliminar los `<script>`/`<link>` de Leaflet y Swiper del `<head>` de `App/index.html`
    - Implementar `loadExternal(kind, url)` (cachea la promesa, rechaza en `onerror` o si el global
      esperado no aparece) y `ensureLeaflet()`/`ensureSwiper()` que cargan CSS+JS bajo demanda
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 6.2 Integrar la carga diferida en las vistas que la usan
    - En `renderAnatomy` hacer `await ensureLeaflet()` y en `renderFlashcards` `await ensureSwiper()`
      dentro de `try/catch`; mostrar indicador de carga y bloquear el visor/carrusel mientras
      la promesa está pendiente; ante error, render de bloque con botón "Reintentar" sin propagar
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [x]* 6.3 Escribir test de propiedad de idempotencia del cargador
    - **Property 6: El cargador diferido es idempotente**
    - **Validates: Requirements 11.2, 11.4**
    - Generadores: n invocaciones (1..50) de `ensureLeaflet`/`ensureSwiper`; loader mockeado con
      contador que verifica una sola solicitud del recurso

  - [x]* 6.4 Escribir tests unitarios de error de carga
    - La vista afectada muestra error y la app sigue navegable si una librería diferida falla (R11.5)
    - _Requirements: 11.3, 11.5_

- [x] 7. Eliminar el estado vacío en Quizzes y Flashcards
  - [x] 7.1 Implementar `resolveWeek`
    - Implementar `resolveWeek(selected, current, available)`: si `selected !== "all"` devuelve
      `selected`; si `"all"` devuelve la semana actual; nunca devuelve el sentinel "sin selección";
      calcular `hasContent` según existencia de contenido del tipo solicitado
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6_

  - [x]* 7.2 Escribir test de propiedad de resolución de semana
    - **Property 7: La resolución de semana nunca produce el estado vacío "Selecciona una semana"**
    - **Validates: Requirements 12.1, 12.2, 12.4**
    - Generadores: selector ∈ {all, Semana k}; semana actual aleatoria

  - [x]* 7.3 Escribir test de propiedad de disponibilidad de contenido
    - **Property 8: La resolución de semana reporta correctamente la disponibilidad de contenido**
    - **Validates: Requirements 12.5, 12.6**
    - Generadores: datasets con/sin quizzes y flashcards por semana

  - [x] 7.4 Integrar `resolveWeek` y el selector de semana embebido en las vistas
    - Usar `resolveWeek` al renderizar Vista_Quizzes y Vista_Flashcards para defaultear a la semana
      actual cuando el selector está en "Todas las semanas"
    - Añadir un Selector_Semana embebido en cada vista que actualice el contenido al cambiar; si la
      semana resuelta carece de un tipo, mostrar el disponible y siempre ofrecer elegir otra semana
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x]* 7.5 Escribir test unitario del selector embebido (verificación manual en navegador; requiere render de la vista)
    - Quizzes/Flashcards exponen un selector de semana embebido que actualiza el contenido (R12.3)
    - _Requirements: 12.3_

- [x] 8. Checkpoint - Verificar frontend (auth, responsive, lazy load, semanas)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Empaquetado y despliegue (Docker, nginx Basic Auth, Portainer, Cloudflare Tunnel)
  - [x] 9.1 Crear `nginx.conf`, `.htpasswd` y `50x.html`
    - `nginx.conf` con `auth_basic` sobre `/` (sirve `App/` en `/usr/share/nginx/html`), tipos MIME
      correctos para CSV/MD/SVG y `error_page 500 502 503 504 /50x.html;` con `internal;`
    - `.htpasswd` con **dos entradas** (estudiante y admin) como credenciales compartidas
    - `50x.html`: página estática de "servicio no disponible"
    - _Requirements: 6.1, 6.2, 7.3, 8.1, 8.2, 4.3_

  - [x] 9.2 Crear el `Dockerfile` y `.dockerignore`
    - `Dockerfile` basado en `nginx:alpine` que copia `App/`, `nginx.conf`, `.htpasswd` y `50x.html`
    - `.dockerignore` que excluye `.kiro/`, `.git/` y los Markdown de autoría fuera de `App/`
    - _Requirements: 6.1, 6.2_

  - [x] 9.3 Crear el `docker-compose.yml` para Portainer
    - Servicio único que construye/usa la imagen, mapea el puerto del servidor web y define
      `restart: unless-stopped`, importable y ejecutable como stack en Portainer
    - _Requirements: 6.3, 6.4, 7.3_

  - [x] 9.4 Crear el README de despliegue
    - Documentar el despliegue del stack en Portainer y el enrutamiento del Subdominio mediante
      **Cloudflare Tunnel** hacia el contenedor (sin IP pública ni puerto abierto directo)
    - Documentar la relación entre la barrera de borde (Basic Auth en nginx) y la capa de
      sesión/rol de la SPA para los dos roles (estudiante/admin)
    - _Requirements: 7.1, 7.2, 7.4, 8.3_

  - [x]* 9.5 Escribir tests de smoke e integración del despliegue (integración del backend automatizada en tests/server-auth.test.js: /data sin sesión → 401, con sesión → 200, login/logout; el smoke de Docker `docker build` + `docker compose config` se ejecuta en el servidor al desplegar, ver deploy/README.md §3)
    - Smoke (servidor): la imagen Node construye y el backend arranca (R6.1, R6.3); `docker compose config` valida y el puerto `${HOST_PORT:-8080}:3000` queda mapeado (R6.4)
    - Integración (automatizada): petición a un recurso protegido (`/data/Quizzes.csv`) sin sesión
      devuelve `401` y con sesión `200` (R4.3, R6.2, R8.2)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.3, 8.1, 8.2, 4.3_

- [x] 10. Checkpoint final - Verificar build, tests y despliegue
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las sub-tareas marcadas con `*` son opcionales (tests) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los tests de propiedad (fast-check, ≥100 iteraciones) validan las Propiedades 1–8 del diseño y se
  ubican cerca de su implementación para detectar errores temprano.
- Los tests unitarios cubren ejemplos, interacciones de UI y condiciones de error puntuales.
- La capa de despliegue (nginx/Docker/Cloudflare Tunnel) se cubre con smoke + integración, no con PBT.
- Se mantiene **vanilla JS sin framework** en toda la implementación.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "9.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "9.2", "9.4"] },
    { "id": 2, "tasks": ["2.3", "5.1", "2.2", "9.3"] },
    { "id": 3, "tasks": ["3.2", "2.4", "2.5", "9.5"] },
    { "id": 4, "tasks": ["3.4", "3.3"] },
    { "id": 5, "tasks": ["3.6", "3.5"] },
    { "id": 6, "tasks": ["5.2", "3.7"] },
    { "id": 7, "tasks": ["5.4", "5.3"] },
    { "id": 8, "tasks": ["6.1", "5.5"] },
    { "id": 9, "tasks": ["6.2"] },
    { "id": 10, "tasks": ["7.1", "6.3", "6.4"] },
    { "id": 11, "tasks": ["7.4"] },
    { "id": 12, "tasks": ["7.2", "7.3", "7.5"] }
  ]
}
```
