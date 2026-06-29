# Requirements Document

## Introduction

Este documento define los requisitos para evolucionar "Ivania Facial Lab" (una SPA de vanilla JS que
carga contenido desde archivos CSV y Markdown) en cuatro frentes: (1) un control de acceso real con
dos roles —estudiante y administrador— soportado por un backend Node/Express con login propio y
seguro, que sustituya al actual selector de perfiles cosmético; (2) un empaquetado y despliegue
mediante contenedor Docker gestionado en Portainer y expuesto en un subdominio de Cloudflare; (3) una
experiencia responsive utilizable desde teléfono móvil; y (4) la eliminación de la fricción del
estado vacío en las vistas de Quizzes y Flashcards.

La capa de acceso es un backend Node/Express que sirve la SPA, valida las credenciales en el servidor
(bcrypt), gestiona una cookie de sesión httpOnly firmada y protege el contenido, en lugar de una
barrera externa de tipo Basic Auth en un servidor web estático o Cloudflare Access. La pantalla de
login es la propia de la aplicación: una sola pantalla, sin doble cortina.

El objetivo es que el contenido sea semiprivado (accesible solo tras iniciar sesión validada por el
backend), que la dueña controle el panel de administración de forma efectiva, que la aplicación se
sirva de forma estable en producción y que los estudiantes puedan estudiar cómodamente desde el
celular durante el salón o la clase.

## Glossary

- **Aplicacion**: La aplicación web SPA "Ivania Facial Lab" (App/index.html, App/app.js, App/styles.css) que sirve el contenido educativo.
- **Backend**: El servidor Node/Express que sirve la SPA, valida las credenciales con bcrypt, gestiona la Cookie_Sesion y protege el Contenido_Educativo. Es la única capa de autenticación del sistema.
- **Sistema_Autenticacion**: La función del Backend responsable de validar credenciales con bcrypt y emitir la Cookie_Sesion que establece la identidad y el rol de quien accede.
- **Sistema_Acceso**: La combinación de la SPA (gate de rol y experiencia de sesión) y el guard del Backend que autoriza o deniega el acceso a vistas y recursos en función del rol autenticado.
- **Sesion**: El estado autenticado de un usuario tras un inicio de sesión válido, con un rol y perfil asociados, transportado por la Cookie_Sesion.
- **Cookie_Sesion**: La cookie httpOnly firmada por el Backend (con SESSION_SECRET) que transporta el estado de la Sesion (usuario, rol y perfil) y no es accesible desde JavaScript del cliente.
- **Rol_Estudiante**: Rol asignado a los estudiantes (amigos del área), con acceso al contenido educativo pero sin acceso al Panel_Administracion. Existen dos cuentas con este rol —`ivi` y `xime`—, cada una con su propio perfil de avance independiente.
- **Rol_Administrador**: Rol asignado a la dueña mediante la cuenta `admin`, con acceso al contenido educativo y al Panel_Administracion.
- **Endpoint_Login**: El endpoint `POST /api/login` del Backend que recibe credenciales y, si son válidas, emite la Cookie_Sesion.
- **Endpoint_Logout**: El endpoint `POST /api/logout` del Backend que invalida la Cookie_Sesion.
- **Endpoint_Sesion**: El endpoint `GET /api/session` del Backend que devuelve el estado de la Sesion vigente o indica su ausencia.
- **Guard_Contenido**: El middleware del Backend (requireAuth) que exige una Sesion válida para entregar las rutas protegidas `/data` y `/assets`, respondiendo `401` cuando no existe Sesion.
- **Pantalla_Login**: La interfaz propia de la Aplicacion donde el usuario introduce sus credenciales, que se envían al Endpoint_Login.
- **Panel_Administracion**: La vista "Administración" de la Aplicacion destinada a la gestión de contenido.
- **Contenido_Educativo**: Las lecciones, quizzes, flashcards, casos, ingredientes, protocolos, anatomía y recursos servidos por la Aplicacion bajo las rutas protegidas `/data` y `/assets`.
- **Contenedor**: La imagen y el contenedor Docker (`node:alpine`) que empaquetan y ejecutan el Backend.
- **Stack_Despliegue**: El archivo de orquestación (docker-compose / stack) usado para desplegar el Contenedor en Portainer.
- **Portainer**: La plataforma de gestión de contenedores donde se despliega el Stack_Despliegue.
- **Cloudflare**: El proveedor de DNS y proxy donde se expone la Aplicacion en un subdominio.
- **Subdominio**: La dirección pública bajo el dominio del usuario donde queda accesible la Aplicacion.
- **Interfaz_Movil**: La presentación de la Aplicacion en anchos de pantalla propios de teléfonos móviles.
- **Sidebar**: El panel de navegación lateral izquierdo de la Aplicacion.
- **Right_Rail**: El panel lateral derecho que contiene la sesión sugerida (botón "Empezar sesión") y la actividad reciente.
- **Boton_Menu**: El botón con icono ☰ de la barra superior que controla la visibilidad del Sidebar.
- **Selector_Semana**: El control desplegable que filtra el contenido por semana del curso.
- **Vista_Quizzes**: La vista de la Aplicacion que presenta los cuestionarios de opción múltiple.
- **Vista_Flashcards**: La vista de la Aplicacion que presenta las tarjetas de repaso.
- **Semana_Actual**: La semana del curso calculada como sugerencia de avance del estudiante.

## Requirements

### Requirement 1: Inicio de sesión con credenciales

**User Story:** Como usuario de la plataforma, quiero iniciar sesión con mis credenciales a través de una única pantalla propia de la aplicación, para acceder al contenido del curso de forma controlada y segura.

#### Acceptance Criteria

1. WHEN la Aplicacion se carga sin una Sesion activa, THE Sistema_Acceso SHALL mostrar la Pantalla_Login y ocultar el Contenido_Educativo.
2. WHEN un usuario envía credenciales al Endpoint_Login que el Backend valida con bcrypt como correspondientes a una cuenta de Rol_Estudiante, THE Backend SHALL crear una Sesion con Rol_Estudiante y emitir la Cookie_Sesion con el perfil de esa cuenta.
3. WHEN un usuario envía credenciales al Endpoint_Login que el Backend valida con bcrypt como correspondientes a la cuenta de Rol_Administrador, THE Backend SHALL crear una Sesion con Rol_Administrador y emitir la Cookie_Sesion.
4. IF un usuario envía al Endpoint_Login credenciales que el Backend no valida con bcrypt como correspondientes a ninguna cuenta, THEN THE Backend SHALL rechazar el inicio de sesión con una respuesta de credenciales inválidas y THE Pantalla_Login SHALL mostrar un mensaje de error.
5. WHEN el Backend crea una Sesion correctamente, THE Sistema_Acceso SHALL ocultar la Pantalla_Login y mostrar el Contenido_Educativo.
6. THE Backend SHALL proporcionar el Endpoint_Logout para cerrar la Sesion activa e invalidar la Cookie_Sesion.
7. WHEN un usuario cierra la Sesion a través del Endpoint_Logout, THE Sistema_Acceso SHALL volver a mostrar la Pantalla_Login y ocultar el Contenido_Educativo.
8. IF un usuario envía más intentos de inicio de sesión al Endpoint_Login de los permitidos dentro de la ventana de control, THEN THE Backend SHALL responder con un estado de límite de intentos (429) y THE Pantalla_Login SHALL indicar al usuario que espere antes de reintentar.

### Requirement 2: Persistencia y caducidad de la sesión

**User Story:** Como estudiante, quiero que mi sesión se mantenga entre recargas de página, para no tener que iniciar sesión cada vez que abro la aplicación durante una clase.

#### Acceptance Criteria

1. WHEN una Sesion está activa y el usuario recarga la Aplicacion, THE Aplicacion SHALL restaurar la Sesion consultando el Endpoint_Sesion, que devuelve el rol y perfil de la Cookie_Sesion sin solicitar credenciales nuevamente.
2. WHILE la Cookie_Sesion permanece válida, THE Backend SHALL conservar el rol y el perfil asociados a esa Sesion.
3. WHEN el usuario cierra la Sesion a través del Endpoint_Logout, THE Backend SHALL invalidar la Cookie_Sesion de modo que el Endpoint_Sesion deje de reconocer la Sesion.
4. IF la solicitud de cierre de sesión al Endpoint_Logout no se completa, THEN THE Backend SHALL mantener la Cookie_Sesion válida y la Sesion permanecerá activa hasta que el cierre se complete.

### Requirement 3: Control de acceso por rol al panel de administración

**User Story:** Como dueña de la plataforma, quiero que solo el administrador acceda al panel de administración, para que los estudiantes no puedan modificar el contenido.

#### Acceptance Criteria

1. WHILE la Sesion activa tiene Rol_Administrador, THE Sistema_Acceso SHALL mostrar la opción de navegación hacia el Panel_Administracion.
2. WHILE la Sesion activa tiene Rol_Estudiante, THE Sistema_Acceso SHALL ocultar la opción de navegación hacia el Panel_Administracion.
3. IF un usuario con Rol_Estudiante solicita la vista del Panel_Administracion, THEN THE Sistema_Acceso SHALL denegar el acceso como control primario y, de forma complementaria, redirigir a la vista de inicio.
4. THE Sistema_Acceso SHALL basar la autorización del Panel_Administracion en el rol de la Sesion y no únicamente en la ocultación visual de elementos de la interfaz.

### Requirement 4: Protección del contenido semiprivado

**User Story:** Como dueña de la plataforma, quiero que el contenido del curso sea accesible solo tras iniciar sesión, para mantenerlo semiprivado de forma efectiva en el servidor.

#### Acceptance Criteria

1. IF un usuario sin Sesion activa solicita el Contenido_Educativo, THEN THE Sistema_Acceso SHALL denegar el acceso y presentar la Pantalla_Login.
2. WHILE no exista una Sesion activa, THE Sistema_Acceso SHALL restringir la navegación a la Pantalla_Login.
3. IF un solicitante sin Cookie_Sesion válida pide cualquier recurso de las rutas protegidas `/data` o `/assets`, THEN THE Guard_Contenido del Backend SHALL impedir la descarga directa del Contenido_Educativo respondiendo con un estado de no autorizado (401).

### Requirement 5: Sustitución del selector de perfiles cosmético

**User Story:** Como usuario, quiero que el antiguo selector de perfiles sea reemplazado por un control de sesión real, para que la identidad refleje el rol con el que inicié sesión.

#### Acceptance Criteria

1. THE Aplicacion SHALL reemplazar el selector de perfiles cosmético por un control de Sesion vinculado al Backend.
2. WHEN una Sesion está activa, THE Aplicacion SHALL mostrar el perfil y el rol de la Sesion devueltos por el Backend en la interfaz.
3. THE Aplicacion SHALL impedir el cambio de rol o de perfil sin pasar por el Sistema_Autenticacion del Backend.

### Requirement 6: Empaquetado en contenedor Docker

**User Story:** Como administrador del despliegue, quiero empaquetar la aplicación en un contenedor Docker que ejecute el backend Node, para desplegarla de forma reproducible.

#### Acceptance Criteria

1. THE Contenedor SHALL ejecutar el Backend Node/Express que sirve la Aplicacion y protege el Contenido_Educativo.
2. WHEN el Contenedor se inicia, THE Backend SHALL servir la SPA y entregar sus recursos protegidos (CSV, Markdown, imágenes, SVG) a las Sesiones válidas a través de HTTP.
3. THE Stack_Despliegue SHALL definir el Contenedor de forma que pueda importarse y ejecutarse en Portainer.
4. THE Stack_Despliegue SHALL exponer el puerto del Backend para su publicación a través de Portainer.

### Requirement 7: Publicación en subdominio de Cloudflare

**User Story:** Como administrador del despliegue, quiero exponer la aplicación en un subdominio de Cloudflare mediante un Tunnel hacia el backend, para que los estudiantes accedan desde una URL estable.

#### Acceptance Criteria

1. WHEN el Contenedor está en ejecución en Portainer, THE Aplicacion SHALL ser accesible a través del Subdominio configurado en Cloudflare mediante un Cloudflare Tunnel que enruta hacia el Backend (http://app:3000).
2. WHEN un usuario accede a la Aplicacion a través del Subdominio, THE Backend SHALL responder con la Pantalla_Login o con el Contenido_Educativo según el estado de la Sesion.
3. IF el Backend no está disponible o no responde, THEN THE Stack_Despliegue SHALL presentar al usuario una página de error de servicio no disponible en lugar de una respuesta vacía.
4. THE documentación del Stack_Despliegue SHALL describir la configuración necesaria para enrutar el Subdominio de Cloudflare hacia el Backend a través del Tunnel.

### Requirement 8: El backend como única capa de autenticación

**User Story:** Como administrador del despliegue, quiero que la autenticación y la protección del contenido vivan en el backend Node, para que exista una sola capa de acceso efectiva y sin doble cortina en producción.

#### Acceptance Criteria

1. THE Backend SHALL ser la única capa de autenticación del despliegue, validando credenciales con bcrypt y gestionando la Cookie_Sesion httpOnly firmada.
2. IF un solicitante sin Sesion válida pide cualquier recurso protegido a través del Subdominio, THEN THE Backend SHALL denegar la entrega del recurso mediante el Guard_Contenido.
3. THE diseño técnico SHALL documentar que el Backend es una sola capa que cubre tanto la protección del Contenido_Educativo como la sesión y el rol para el Rol_Estudiante y el Rol_Administrador.

### Requirement 9: Sidebar como drawer en móvil

**User Story:** Como estudiante que usa la aplicación en el celular, quiero abrir y cerrar la navegación como un panel deslizante, para no perder espacio de contenido en pantallas pequeñas.

#### Acceptance Criteria

1. WHILE el ancho de la pantalla corresponde a la Interfaz_Movil, THE Sidebar SHALL presentarse como un panel superpuesto (drawer) sobre el contenido en lugar de empujar el contenido hacia abajo.
2. WHILE el ancho de la pantalla corresponde a la Interfaz_Movil y el Sidebar está oculto, THE Aplicacion SHALL mostrar el Contenido_Educativo ocupando el ancho disponible.
3. WHEN el usuario activa el Boton_Menu en la Interfaz_Movil, THE Sidebar SHALL abrirse como panel superpuesto.
4. WHEN el Sidebar está abierto en la Interfaz_Movil y el usuario activa el Boton_Menu, THE Sidebar SHALL cerrarse.
5. WHEN el Sidebar está abierto en la Interfaz_Movil y el usuario selecciona una opción de navegación, THE Sidebar SHALL cerrarse.

### Requirement 10: Acceso a "Empezar sesión" en móvil

**User Story:** Como estudiante en el celular, quiero acceder a la acción "Empezar sesión" de la sesión sugerida, para iniciar mi estudio sin depender del panel lateral derecho.

#### Acceptance Criteria

1. WHILE el ancho de la pantalla corresponde a la Interfaz_Movil, THE Aplicacion SHALL ofrecer un acceso visible a la acción "Empezar sesión" de la sesión sugerida.
2. WHEN un estudiante activa la acción "Empezar sesión" en la Interfaz_Movil, THE Aplicacion SHALL abrir la lección sugerida correspondiente.
3. IF la lección sugerida no puede abrirse o no está disponible, THEN THE Aplicacion SHALL informar al usuario y ofrecer una lección alternativa o el acceso a la Ruta de estudio.
4. WHILE el ancho de la pantalla corresponde a la Interfaz_Movil, THE Aplicacion SHALL mantener accesible la información de actividad reciente del Right_Rail mediante una ubicación alternativa en el flujo de contenido.

### Requirement 11: Carga eficiente de librerías pesadas en móvil

**User Story:** Como estudiante con conexión móvil, quiero que las librerías pesadas no penalicen la carga inicial, para que la aplicación abra rápido en el celular.

#### Acceptance Criteria

1. WHEN la Aplicacion se carga inicialmente en la Interfaz_Movil, THE Aplicacion SHALL diferir la carga de las librerías Leaflet y Swiper hasta que se requiera la vista que las utiliza.
2. WHEN un usuario abre la vista de Anatomía Facial, THE Aplicacion SHALL cargar Leaflet antes de renderizar el visor anatómico.
3. WHILE Leaflet no se haya cargado correctamente, THE Aplicacion SHALL bloquear el visor anatómico y mostrar un indicador de carga o error en su lugar.
4. WHEN un usuario abre la Vista_Flashcards, THE Aplicacion SHALL cargar Swiper antes de renderizar el carrusel de tarjetas.
5. IF una librería diferida no logra cargarse, THEN THE Aplicacion SHALL mostrar un mensaje de error en la vista afectada sin interrumpir el resto de la Aplicacion.

### Requirement 12: Semana por defecto en Quizzes y Flashcards

**User Story:** Como estudiante, quiero que las vistas de Quizzes y Flashcards muestren contenido inmediatamente, para no encontrar un callejón sin salida cuando el filtro está en "Todas las semanas".

#### Acceptance Criteria

1. WHEN un usuario abre la Vista_Quizzes con el Selector_Semana en "Todas las semanas", THE Vista_Quizzes SHALL presentar las preguntas de la Semana_Actual en lugar del estado vacío "Selecciona una semana".
2. WHEN un usuario abre la Vista_Flashcards con el Selector_Semana en "Todas las semanas", THE Vista_Flashcards SHALL presentar las tarjetas de la Semana_Actual en lugar del estado vacío "Selecciona una semana".
3. WHERE la Vista_Quizzes o la Vista_Flashcards se muestran, THE Aplicacion SHALL permitir al usuario seleccionar una semana específica directamente desde esa vista.
4. WHEN un usuario selecciona una semana desde la Vista_Quizzes o la Vista_Flashcards, THE Aplicacion SHALL actualizar el contenido mostrado para reflejar la semana seleccionada.
5. WHERE la Semana_Actual contiene un tipo de contenido pero carece del otro, THE Aplicacion SHALL mostrar el tipo de contenido disponible en su vista correspondiente.
6. IF la Semana_Actual no contiene ni preguntas ni tarjetas, THEN THE Aplicacion SHALL informar la ausencia de contenido y ofrecer siempre la selección de otra semana.
