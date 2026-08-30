# Capa 6: Frontend, UI/UX & CLI Presentation

### Score: 8.2/10
**Justificación Objetiva:** La interfaz web de ClineMarket presenta una ejecución visual de alta fidelidad con respecto a su especificación de diseño (`DESIGN.md`), incorporando tokens CSS bien estructurados, animaciones de shimmer para skeleton loaders, paleta de colores coherente y un control plane ágil en Vanilla ES modules sin sobrecarga de frameworks. No obstante, la auditoría empírica identifica oportunidades críticas de mejora: una violación de Content Security Policy (CSP) por un inline event handler en el renderizado de iconos, anidamiento de controles interactivos en tarjetas (`role="button"` contenedor de `<button>` y `<input>`) contrario a WCAG 2.1 AA (4.1.2), desajustes en el estándar `NO_COLOR` en el ejecutable CLI `bin/cline-marketplace.js`, fallos de contraste en textos muted (#777/#888), y riesgo de desborde horizontal en viewports móviles reducidos (<390px).

---

### Tabla de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | **Alta** | Violación de Content Security Policy (CSP) por inline event handler `onerror` en `renderCard()` | `public/app.js:184`<br>`server.js:42` | `grep_search "onerror="` en `public/app.js:184` → `<img src="..." onerror="this.replaceWith(...)">`. Con CSP `script-src 'self'`, el navegador bloquea el handler inline, anulando el fallback de iconos rotos y arrojando violaciones CSP en consola. Además, si el nombre inicia con comilla, la entidad `&#39;` se decodifica en el parser y rompe la sintaxis JS. | Reemplazar el inline handler por un listener adjunto en el ciclo de vida del elemento DOM (`img.addEventListener('error', ...)`) o resolver el fallback en memoria antes de la inserción. | 15 min |
| 2 | **Alta** | Violación WCAG 2.1 AA (4.1.2) por controles interactivos anidados dentro de `<article role="button" tabindex="0">` | `public/app.js:197-230` | `grep_search "role=\"button\""` en `public/app.js:200` → El contenedor `.card` tiene `role="button"` y aloja internamente `<button class="card-watch">`, `<input type="checkbox">`, `<span class="tag" role="button">` y botones de acción rápida. | Remover `role="button"` y `tabindex="0"` del elemento contenedor `.card`. Delegar la apertura de detalles a un botón primario interno o al evento de clic en áreas no interactivas, manteniendo la navegación accesible por teclado mediante elementos nativos. | 25 min |
| 3 | **Media** | Infracción del estándar `NO_COLOR` / TTY en el binario CLI `bin/cline-marketplace.js` | `bin/cline-marketplace.js:22-32` | `node .agents/audit_06_frontend/verify_cli_nocolor.cjs` → `CLI help output has ANSI codes with NO_COLOR=1: true` (`\u001b[1mcline-marketplace...`). A diferencia de `lib/logger.js`, el runner CLI no valida `process.env.NO_COLOR` ni `isTTY`. | Adoptar la misma lógica de `lib/logger.js:3-6` en `bin/cline-marketplace.js` para desactivar secuencias ANSI cuando `NO_COLOR` esté presente o el stdout no sea TTY. | 10 min |
| 4 | **Media** | Elementos huérfanos y falta de reglas CSS para el Drawer Móvil (`#btnToggleSidebar`, `#sidebarBackdrop`, `#btnHelp`) | `public/app.js:1293-1299, 1545-1548`<br>`public/index.html`<br>`public/styles.css` | `node .agents/audit_06_frontend/verify_ids.cjs` → `Missing IDs in index.html: ['sidebarBackdrop', 'btnToggleSidebar', 'btnHelp']`. En pantallas móviles, `toggleMobileSidebar()` retorna prematuramente y la barra lateral de filtros queda apilada verticalmente sin poder plegarse. | Añadir el botón hamburguesa (`#btnToggleSidebar`) y backdrop (`#sidebarBackdrop`) en `index.html`, junto con las reglas de transición `.sidebar.open` en `styles.css`. | 30 min |
| 5 | **Media** | Desborde horizontal y colisión de elementos sticky en resoluciones móviles (< 390px) | `public/styles.css:312, 401, 564, 1344` | `grep_search "@media"` en `styles.css:1344` → Solo existe un breakpoint (`max-width: 960px`). La grilla `.grid` fuerza `minmax(340px, 1fr)` con padding de 28px (requiere 396px mín.), y `.nav-floating-wrap` tiene `top: 73px` fijo que colisiona cuando `.topbar` se apila verticalmente. | Ajustar `.grid` a `minmax(min(100%, 300px), 1fr)`, habilitar scroll horizontal `overflow-x: auto` en `.nav-pill-bar`, y reajustar offsets sticky en viewports reducidos. | 25 min |
| 6 | **Media** | Incumplimiento de ratios de contraste WCAG 2.1 AA en textos secundarios y badges sobre fondos oscuros | `public/styles.css:54, 469, 708-722, 788` | `node .agents/audit_06_frontend/verify_contrast.cjs` → Color `#777777` sobre `#141414` da 4.11:1 (FAIL < 4.5:1), `#888888` sobre `#232323` da 4.43:1 (FAIL < 4.5:1), `--color-iris-violet` (#7a78ff) sobre `#232323` da 4.46:1 (FAIL < 4.5:1). | Elevar tonos muted de `#777` a mínimo `#949494` (5.9:1) y `#888` a `#9e9e9e` (6.6:1), asegurando cumplimiento estricto de WCAG AA para textos de cuerpo pequeño. | 15 min |
| 7 | **Baja** | Cuadro ASCII de actualización con relleno de espacios rígido en `bin/cline-marketplace.js` | `bin/cline-marketplace.js:128-131` | `grep_search "repeat("` en `bin/cline-marketplace.js:129-130` → `" ".repeat(25)` y `" ".repeat(8)`. Versiones semver largas rompen el alineamiento del borde `│`. | Calcular dinámicamente el padding en función de `boxWidth - textLength`. | 10 min |
| 8 | **Baja** | Ausencia de atributo de accesibilidad `aria-labelledby` en `#serverStoppedOverlay` | `public/index.html:411-424` | `view_file` en `public/index.html:411` → `<div id="serverStoppedOverlay" class="modal hidden" role="dialog" aria-modal="true">` carece de enlace a su título `<h2>Server Stopped</h2>`. | Añadir `id="serverStoppedTitle"` al encabezado y `aria-labelledby="serverStoppedTitle"` al modal. | 5 min |
| 9 | **Baja** | Inserción síncrona sin `DocumentFragment` en el renderizado del catálogo masivo | `public/app.js:542-549` | `view_file` en `public/app.js:546` → `for (const e of entries) grid.appendChild(renderCard(e));` ejecuta 250+ mutaciones DOM directas en el grid contenedor. | Utilizar `const frag = document.createDocumentFragment();` y realizar una única mutación `grid.appendChild(frag)`. | 10 min |

---

### Análisis Detallado por Subsistema

#### 1. Web UI: Arquitectura DOM, Componentes y Diseño Visual
- **Fidelidad al Design System (`DESIGN.md`)**:
  - Paleta cromática: Utiliza correctamente la pizarra oscura (`--surface-pitch-black: #141414`), superficies de elevación (`#232323`), acentos de acción (`--color-acid-lime: #c7ff69`), tonos complementarios de la micro-paleta de cinco colores (Iris Violet, Toxic Green, Ember Orange, Schoolbus Yellow, Cobalt Blue) y tipografías grotesque/sans-serif.
  - Radios de borde: Se respetan los 1000px para botones/pills/inputs y 25px para cards y contenedores medianos (`--radius-cards: 25px; --radius-pills: 1000px`).
  - Skeleton Shimmer Loader: Implementado en `styles.css:1224-1276` con `@keyframes shimmer` y en `app.js:1190-1211` con `renderSkeletons()`, ofreciendo retroalimentación visual inmediata durante la carga de datos.
- **Sprites Vectoriales SVG**:
  - Los 15 símbolos SVG (`icon-search`, `icon-filter`, `icon-refresh`, `icon-scan`, `icon-power`, `icon-bulk`, `icon-star-filled`, `icon-star-outline`, `icon-check`, `icon-close`, `icon-github`, `icon-feedback`, `icon-download`, `icon-package`, `icon-sparkle`) están declarados en `public/index.html:12-59` y sincronizados con los llamados en `public/app.js`.
- **Prevención de XSS y Manipulación de Plantillas**:
  - La función `escapeHtml` (`app.js:64-68`) sanitiza exhaustivamente caracteres HTML (`&`, `<`, `>`, `"`, `'`).
  - No obstante, la inyección inline de cadenas en atributos de eventos (`onerror="..."`, Hallazgo #1) genera un riesgo de bloqueo CSP y errores de sintaxis si el nombre contiene comillas.

#### 2. Accesibilidad (WCAG 2.1 AA)
- **Trampas de Foco y Modales**:
  - `handleModalTabTrap` (`app.js:141-159`) gestiona el ciclado del foco (Tab / Shift+Tab) en modales activos (`detailModal`, `feedbackModal`, `helpModal`, `shutdownModal`).
  - Al abrir un modal, se guarda `lastActiveElement` y se retorna el foco al disparador al cerrarse (`closeModal`, `app.js:123-134`).
- **Navegación por Teclado**:
  - Soporte para atajos rápidos globales: `/` (búsqueda), `b` (modo masivo), `?` (ayuda), `g`/`r`/`w`/`s`/`c`/`h` (pestañas directas), `Esc` (cierre de modales/búsqueda).
  - Los atajos se ignoran correctamente cuando el foco está en inputs o cuando un modal está desplegado.
- **Jerarquía y Controles Anidados**:
  - Como se detalla en el Hallazgo #2, el uso de `role="button"` en el contenedor `.card` viola el principio de accesibilidad al anidar botones internos (`.card-watch`, `.tag`, checkboxes).

#### 3. Diseño Responsivo y Experiencia Móvil
- **Evaluación de Breakpoints**:
  - Actualmente solo existe un único `@media (max-width: 960px)`.
  - La navegación flotante (`.nav-floating-wrap`) carece de manejo de overflow en pantallas < 500px, provocando scroll horizontal en dispositivos móviles estándar.
  - La posición `position: sticky; top: 73px` colisiona cuando el topbar pasa a flujo vertical.
- **Drawer Móvil**:
  - Existen métodos en JS (`toggleMobileSidebar`, `app.js:1292-1299`), pero faltan los disparadores visuales en el DOM (`#btnToggleSidebar`) y los estilos de capas en CSS, dejando la interfaz móvil incompleta para la gestión de filtros.

#### 4. Interfaz de Línea de Comandos (CLI UI)
- **Formato y Legibilidad**:
  - Salida limpia con prefijos cronometrados `[HH:MM:SS] [CLI]` y banner de bienvenida.
  - Gestión adecuada de señales del sistema (`SIGINT`, `SIGTERM`) con mensajes de apagado amigables.
- **Conformidad con Estándares de Terminal**:
  - El logger del servidor (`lib/logger.js`) cumple el estándar `NO_COLOR` y respeta terminales no-TTY.
  - El ejecutable principal (`bin/cline-marketplace.js`) omite esta comprobación, emitiendo secuencias ANSI crudas en entornos no interactivos (Hallazgo #3).

#### 5. Gestión de Estados (Empty, Loading, Error, Success)
- **Estados Vacíos**: Mensajes e ilustraciones SVG claras para búsqueda sin resultados (`#emptyState`), recomendaciones vacías (`#recEmpty`), watchlist vacía (`#watchEmpty`) y changelog sin cambios.
- **Estados de Carga**: Animación shimmer en skeletons, deshabilitación de botones durante mutaciones (`Install`, `Uninstall`, `Refresh`, `Bulk Actions`) con actualización de etiquetas ("Installing…", "Stopping…").
- **Notificaciones Toast**: Sistema flotante (`#toastHost`) con soporte polimórfico (`success`, `error`, `warn`, `info`), iconos temáticos y auto-desvanecimiento con animación translateY.

---

### 3 Quick Wins
1. **Eliminar el inline `onerror` en `public/app.js:184`**: Reemplazar por listeners de eventos estándar en JS para garantizar total conformidad con CSP (`script-src 'self'`).
2. **Implementar `NO_COLOR` y TTY check en `bin/cline-marketplace.js`**: Importar o replicar la lógica de `lib/logger.js:3-6` para no emitir códigos ANSI cuando `NO_COLOR` esté activo.
3. **Optimizar el renderizado del catálogo con `DocumentFragment`**: Envolver el ciclo de inserción de `renderCatalogTab()` en un fragmento de memoria para reducir 250 reflows a 1 única mutación DOM.

### 3 Deudas Críticas
1. **Reestructurar la semántica accesible de las tarjetas de catálogo (WCAG 4.1.2)**: Eliminar `role="button"` del contenedor `.card` y estructurarlo con enlaces o botones explícitos para no anidar elementos interactivos.
2. **Ajustar el sistema de colores muted para alcanzar contraste 4.5:1 (WCAG AA)**: Elevar los grises `#777777` y `#888888` a mínimo `#949494` y `#9e9e9e` sobre fondos oscuros.
3. **Completar la arquitectura del Drawer Móvil y Responsive Breakpoints**: Añadir el botón hamburguesa `#btnToggleSidebar`, `#sidebarBackdrop` y estilos responsivos con scroll horizontal para la barra de navegación flotante.

### 3 Oportunidades Estratégicas
1. **Soporte de Tema de Alto Contraste (High Contrast Mode)**: Integrar una opción en configuración para alternar bordes y textos a máximo contraste (18:1) para usuarios con visión reducida.
2. **Virtualización de Listas para Catálogos > 1,000 Primitivas**: Incorporar virtual scroll en la grilla de catálogo para mantener 60 FPS independientemente del crecimiento del repositorio upstream.
3. **Indicadores de Progreso CLI con Spinners Interactivos**: Reemplazar los logs estáticos en el binario CLI por una librería ligera de spinners / barras de progreso en terminales TTY.
