# Capa 6: Frontend & UI/UX

### Score: 8.8/10
Fiel apego a la identidad oficial de DESIGN.md (pizarra con micro-grilla, micro-paleta y skeleton shimmer), con desajustes puntuales en variables CSS heredadas, sprites SVG faltantes y focus-traps en modales.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Media | Íconos SVG ausentes en spritesheet (`#icon-package`, `#icon-sparkle`) | `public/app.js:615, 1161`<br>`public/index.html:11-53` | `grep_search "icon-package"` en `index.html` → 0 matches. El JS renderiza `<use href="#icon-package">` y `<use href="#icon-sparkle">` en blanco. | Declarar `<symbol id="icon-package">` y `<symbol id="icon-sparkle">` dentro del `<svg>` de sprites en `public/index.html`. | 5 min |
| 2 | Media | Variables CSS no declaradas en templates dinámicos de JS | `public/app.js:188, 942, 1156-1161`<br>`public/styles.css:8-53` | `app.js` usa `var(--cline-cyan)`, `var(--cline-blue-glow)`, `var(--border-glow)`, `var(--fg-muted)`, `var(--success)`, `var(--danger)`, `var(--warn)`, inexistentes en `:root`. | Reemplazar por tokens del design system (`var(--color-acid-lime)`, `--color-ember-orange`, `--color-toxic-green`, etc.) o agregar aliases en `:root`. | 10 min |
| 3 | Baja | Selector `#recIndividualTitle` huérfano (no oculta título en estado vacío) | `public/app.js:576, 584`<br>`public/index.html:258` | `app.js` invoca `$("#recIndividualTitle")` para alternar `.hidden`, pero `index.html:258` carece del atributo `id`. | Agregar `id="recIndividualTitle"` en el encabezado `<div>` de `public/index.html:258`. | 2 min |
| 4 | Baja | Clases inyectadas por JS sin reglas en `styles.css` | `public/styles.css`<br>`public/app.js:610, 718, 1021, 1153` | Clases `.install-output`, `.install-output.error`, `.changelog-item`, `.bundle-items-list` y variantes `.toast.error/.warn` no tienen reglas CSS. | Agregar definiciones en `styles.css` para bloques de log preformateados, badges de toasts y listas de changelog/bundles. | 15 min |
| 5 | Baja | Focus-trap ausente en modales secundarios y `aria-labelledby` faltante | `public/app.js:1507-1515`<br>`public/index.html:405` | `handleModalTabTrap` solo se ejecuta para `#helpModal` y `#detailModal`. `#feedbackModal` y `#shutdownModal` permiten escape del foco. `#serverStoppedOverlay` sin label. | Unificar el trap para cualquier `.modal:not(.hidden)` activo y añadir `aria-labelledby="serverStoppedTitle"`. | 10 min |
| 6 | Baja | Listeners de drawer móvil sin elementos en el DOM (`#btnToggleSidebar`, `#sidebarBackdrop`) | `public/app.js:1288-1295, 1544-1545`<br>`public/index.html` | `app.js` intenta registrar handlers en `#btnToggleSidebar` y `#sidebarBackdrop`, pero ninguno existe en `index.html`. | Integrar botón hamburguesa y backdrop en `index.html` o limpiar handlers en desuso. | 10 min |
| 7 | Informativa | Violación WCAG de anidamiento de controles interactivos en cards | `public/app.js:194-225` | `<article class="card" role="button" tabindex="0">` aloja botones `<button class="card-watch">`, inputs `<input type="checkbox">` y `<span role="button">`. | Remover `role="button"` del contenedor `.card` y utilizar enlaces internos o navegación delegada limpia. | 20 min |

---

### 3 quick wins
1. **Restaurar SVG sprites y IDs vinculantes**: Añadir `<symbol id="icon-package">` e `<symbol id="icon-sparkle">` al SVG de sprites en `public/index.html` y asignar `id="recIndividualTitle"` en `public/index.html:258`.
2. **Normalizar variables CSS en JavaScript**: Mapear en `public/styles.css` los aliases de variables (`--cline-cyan: var(--color-acid-lime)`, `--success: var(--color-toxic-green)`, etc.).
3. **Completar estilos de componentes dinámicos**: Añadir reglas para `.install-output`, variantes de color en `.toast` (`.error`, `.warn`, `.success`) y `.changelog-item`.
