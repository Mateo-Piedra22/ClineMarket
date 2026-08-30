# Auditoría Multicapa Cline Marketplace — 2026-08-30 — MODO PARALELO (11 Subagents)

## Resumen Ejecutivo

Se ejecutó la auditoría exhaustiva y profunda de **Cline Marketplace** mediante el despacho simultáneo de **11 subagents especializados en paralelo**, abarcando desde la arquitectura del backend y persistencia JSON, hasta la seguridad local, el puente de ejecución de subprocesos, la calidad de código, pruebas y pipelines de CI/CD.

El sistema presenta una base moderna, sólida y modular estructurada en ES Modules (Node 22), con enlace estricto a loopback (`127.0.0.1`), diseño visual de alta fidelidad alineado a `DESIGN.md` y soporte multiplataforma para Cline CLI v3.0.60+.

No obstante, la auditoría descubrió desalineaciones críticas entre endpoints del frontend y el router backend (`/api/context`, `/api/refresh`, `/api/mark/:type/:id`, `/api/watchlist`), bloqueos síncronos en el Event Loop por `execSync`, omisión de `"lib"` en `package.json` para distribución npm, y una suite de smoke tests carente de aserciones formales que enmascara fallos en CI.

---

## Tabla Maestra Consolidada

| # | Capa | Sev | Hallazgo | Archivo:línea | Fix Propuesto | Esfuerzo | Estado |
|---|---|:---:|---|---|---|:---:|:---:|
| 1 | Arquitectura | **Crítica** | Omisión de `lib/` en propiedad `files` de `package.json` (falla en `npx`) | [`package.json:10`](../../package.json) | Añadir `"lib"` al array `"files"` | 5 min | ⬜ Pendiente |
| 2 | DevOps | **Crítica** | Action version tags inexistentes en workflows (`checkout@v7`, `setup-node@v7`, `github-script@v9`) | [`.github/workflows/ci.yml:21`](../../.github/workflows/ci.yml) | Ajustar a versiones oficiales estables (`checkout@v4`, `setup-node@v5`, `github-script@v7`) | 15 min | ⬜ Pendiente |
| 3 | Testing | **Alta** | Smoke tests sin aserciones formales (`assert`), enmascarando fallos estructurales | [`scripts/smoke-test.mjs:68`](../../scripts/smoke-test.mjs) | Incorporar `node:assert/strict` en todos los endpoints probados | 1.5 h | ⬜ Pendiente |
| 4 | Código / Ecosistema | **Alta** | Desalineación de endpoints REST entre UI y backend (`/api/context`, `/api/refresh`, `/api/mark/:type/:id`) | [`public/app.js:1109`](../../public/app.js) / [`lib/routes.js:407`](../../lib/routes.js) | Implementar `GET /api/context`, `POST /api/refresh`, `DELETE /api/mark/:type/:id` en `lib/routes.js` | 1.5 h | ⬜ Pendiente |
| 5 | Seguridad / Perf | **Alta** | Bloqueo sincrónico del Event Loop con `execSync` en `/api/update/run` y `/api/health` | [`lib/routes.js:238,528`](../../lib/routes.js) | Migrar a `execFile` promisificado asíncrono con control de timeout | 30 min | ⬜ Pendiente |
| 6 | Bridge CLI | **Alta** | Procesos huérfanos en Windows tras timeout debido a `proc.kill("SIGTERM")` sobre `shell: true` | [`lib/runner.js:78`](../../lib/runner.js) | Implementar terminación por árbol de procesos en Windows (`taskkill /pid ${proc.pid} /T /F`) | 25 min | ⬜ Pendiente |
| 7 | Persistencia | **Alta** | Riesgo de sobreescritura destructiva de estado si `data/installed.json` sufre corrupción | [`lib/state.js:16`](../../lib/state.js) | Crear backup en cuarentena `.corrupt.<timestamp>` y rechazar sobreescritura vacía | 45 min | ⬜ Pendiente |
| 8 | Seguridad | **Alta** | Ausencia de validación `Origin` / `Sec-Fetch-Site` para prevenir CSRF en daemon local | [`server.js:33`](../../server.js) | Middleware de validación de origen loopback en endpoints mutantes | 20 min | ⬜ Pendiente |
| 9 | Frontend | **Media** | Íconos SVG ausentes en spritesheet (`#icon-package`, `#icon-sparkle`) | [`public/index.html:11`](../../public/index.html) | Declarar símbolos faltantes en el SVG oculto | 5 min | ⬜ Pendiente |
| 10 | Performance | **Media** | I/O muerto: llamada innecesaria a `fsProbe()` en `/api/stats` | [`lib/routes.js:539`](../../lib/routes.js) | Eliminar invocación huérfana de `fsProbe` | 2 min | ⬜ Pendiente |

---

## Scores por Capa (1-10)

- **Capa 1: Arquitectura & Patrones:** 8.2 / 10
- **Capa 2: Calidad de Código & Tipado:** 6.8 / 10
- **Capa 3: Seguridad & Auth:** 8.5 / 10
- **Capa 4: Persistencia & Datos:** 8.5 / 10
- **Capa 5: Performance & Optimización:** 7.2 / 10
- **Capa 6: Frontend & UI/UX:** 8.8 / 10
- **Capa 7: DevOps & CI/CD:** 7.8 / 10
- **Capa 8: Testing & QA:** 4.5 / 10
- **Capa 9: Observabilidad & Diagnósticos:** 9.4 / 10
- **Capa 10: Ecosistema Cline & MCP:** 8.8 / 10
- **Capa 11: Subprocess Bridge & CLI Runner:** 8.5 / 10

**Promedio Global: 7.91 / 10**

---

## 3 Quick Wins Cross-Capa
1. **Empaquetado y Distribución npm:** Agregar `"lib"` a la lista `"files"` en `package.json` y corregir action tags a `@v4`/`@v5`/`@v7` en `.github/workflows/*.yml`.
2. **Alineación de Endpoints REST en `lib/routes.js`:** Implementar `GET /api/context`, `POST /api/refresh`, `DELETE /api/mark/:type/:id` y `DELETE /api/watchlist/:type/:id`.
3. **Eliminación de I/O bloqueante y redundante:** Eliminar `fsProbe()` en `/api/stats` y migrar `execSync` a `execFileP` asíncrono.

---

## 3 Deudas Críticas
1. **Blindaje de Smoke Tests con Aserciones Estrictas:** Reemplazar logs informativos por `node:assert/strict` para evitar falsos positivos en CI.
2. **Manejo de Árbol de Procesos en Windows (`taskkill /T /F`):** Evitar subprocesos huérfanos ante timeouts de CLI.
3. **Protección Anti-Corrupción en Persistencia:** Backup automático ante fallos de parseo JSON para preservar historial de instalación.
# Capa 1: Arquitectura & Patrones

### Score: 8.2/10
**Justificación:** Arquitectura modular sólida en ESM nativo con persistencia atómica y validaciones defensivas, pero penalizada por la omisión de `lib` en el empaquetado npm, llamadas sincrónicas bloqueantes (`execSync`) e inversión de dependencias hacia `scripts/`.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Crítica** | Omisión del directorio `lib` en la propiedad `files` de distribución npm | `package.json:10-19` | `node -e "console.log(JSON.parse(fs.readFileSync('package.json')).files)"`<br>`[ 'bin', 'public', 'scripts', 'docs', 'catalog.json', 'server.js', 'README.md', 'LICENSE' ]` | Agregar `"lib"` a la lista `"files"` en `package.json` para evitar que `npx cline-marketplace` falle por módulos faltantes en npm. | 5 min |
| 2 | **Alta** | Bloqueo sincrónico del Event Loop mediante `execSync` en endpoints HTTP | `lib/routes.js:238, 250, 528, 529` | `grep -n "execSync" lib/routes.js`<br>`238: const out = execSync(...)`<br>`528: const pullOut = execSync("git pull origin main", ...)`<br>`529: const installOut = execSync("npm install --omit=dev", ...)` | Reemplazar `execSync` por `execFile` promisificado (`node:child_process` + `util.promisify`) con async/await no bloqueante. | 30 min |
| 3 | **Alta** | Inversión de capas: módulos de runtime productivo (`lib/`) importan utilidades de `scripts/` | `lib/routes.js:12`<br>`lib/runner.js:4` | `grep -n "scripts/lib" lib/*.js`<br>`lib/routes.js:12: import { resolveCommand } from "../scripts/lib/resolve-command.mjs";`<br>`lib/runner.js:4: import { resolveCommand } from "../scripts/lib/resolve-command.mjs";` | Mover `scripts/lib/resolve-command.mjs` a `lib/resolver.js` y hacer que `scripts/` consuma `lib/`, respetando la jerarquía de dependencias. | 15 min |
| 4 | **Media** | Ausencia de middleware global de captura de errores en Express 5 | `server.js:73-80` | `grep -n "app.use.*err" server.js`<br>`(sin resultados — unhandled rejections emiten HTML por defecto de Express)` | Registrar un middleware de error unificado al final de la cadena: `app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }))`. | 15 min |
| 5 | **Media** | Fat Router / Monolito en `createApiRouter` (~675 LOC con mezcla de transporte, negocio e I/O) | `lib/routes.js:1-675` | `wc -l lib/routes.js`<br>`675 lib/routes.js` | Desacoplar en arquitectura en capas: `routes/` (definición HTTP) -> `controllers/` (traducción req/res) -> `services/` (lógica de catálogo, stats, reconcile y changelog). | 2.5 h |
| 6 | **Baja** | Mutación directa in-place del objeto de estado en el reconciliador | `lib/reconciler.js:17-42` | `lib/reconciler.js:18: state.items[key] = ...`<br>`lib/reconciler.js:41: state.items[key].detected = stillThere;` | Retornar un nuevo objeto inmutable con spread operator o deep clone para evitar efectos secundarios sobre referencias cacheadas. | 20 min |

---

### 3 quick wins
1. **Corregir `package.json` (`files`)**: Agregar `"lib"` al array de empaquetado para garantizar que la distribución en npm / npx sea 100% funcional.
2. **Promisificar ejecuciones en `lib/routes.js`**: Migrar los 4 usos de `execSync` (`/api/health` y `/api/update/run`) a `execFile` asíncrono con `util.promisify`.
3. **Mover resolver a `lib/`**: Reubicar `scripts/lib/resolve-command.mjs` en `lib/resolver.js` eliminando el acoplamiento cruzado de capas.

---

### 1 deuda crítica
- **Bloqueo del hilo principal de Node.js por `execSync` en `/api/update/run` y `/api/health`**: Si un usuario dispara `/api/update/run` (que ejecuta `git pull` y `npm install` con timeout de 60s), el servidor queda completamente congelado, rechazando o encolando todas las peticiones HTTP entrantes (UI inaccesible) hasta que finalice el proceso hijo.

---

### 1 oportunidad
- **Refactor a Arquitectura de Servicios & Controladores**: Extraer la lógica de agregación de estadísticas, diffing de versiones de catálogo y reconciliación a servicios desacoplados (`CatalogService`, `StateService`, `SystemService`). Esto permitirá testear el 100% de la lógica de negocio mediante `node:test` sin necesidad de levantar el servidor HTTP ni mockear requests de Express.
# Capa 2: Calidad de Código & Tipado

### Score: 6.8/10
Base modular limpia en ESM nativo con buena intención defensiva, pero penalizada por desalineación de contratos API (rutas 404 entre UI y backend), nula verificación estática/linting y funciones impuras dependientes de estado global.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Desalineación de rutas API entre cliente y servidor (`/api/context`, `/api/refresh`, `/api/watchlist`, `/api/mark/:type/:id`). | `public/app.js:1109, 1123, 1232, 1616` vs `lib/routes.js:407-470` | `grep -n "api/context" lib/routes.js` &rarr; `0 matches`. Al invocar `refreshContext()`, el fetch recibe HTTP 404 y Recommendation queda vacío. | Implementar `GET /api/context` (invocando `detect-context.mjs`) y `POST /api/refresh` en `lib/routes.js`; alinear llamadas de watchlist (`/watchlist/toggle`) y borrado (`/forget`). | 1.5 h |
| 2 | **Alta** | Bloqueo sincrónico del Event Loop con `execSync` durante actualizaciones de software. | `lib/routes.js:528-529` | `execSync("git pull ...", { timeout: 30000 })` bloquea por completo la atención de requests concurrentes en el proceso Node. | Migrar a `execFile` asíncrono con `promisify(execFile)` o streaming mediante `spawn`. | 20 min |
| 3 | **Media** | Duplicación de listeners de eventos DOM para diagnósticos y copia de sistema. | `public/app.js:1571-1592` y `1691-1707` | `#btnCopySysInfo` y `#btnHealthRefresh` tienen `addEventListener("click")` registrado 2 veces dentro de `wireActions()`, disparando doble ejecución en cada click. | Remover el bloque duplicado redundante en `public/app.js:1691-1707`. | 5 min |
| 4 | **Media** | Función impura y falta de protección defensiva ante estado sin propiedad `items` en reconciliador. | `lib/reconciler.js:9-45` | `state.items[key]` muta el objeto en memoria y arroja `TypeError: Cannot read properties of undefined` si `state` carece de `.items`. | Retornar nuevo objeto `{ items: { ...state?.items } }` de forma inmutable y validar `state?.items ?? {}`. | 20 min |
| 5 | **Media** | Cliente HTTP `delJson` sin verificación de `r.ok` ni parsing seguro de errores no-JSON. | `public/app.js:51-54` | `const r = await fetch(...); return r.json();` arroja `SyntaxError: Unexpected token '<'` al recibir una respuesta HTML de error (404/500). | Homogeneizar con `postJson`: verificar `r.ok`, leer como `r.text()` y parsear en bloque `try/catch`. | 10 min |
| 6 | **Media** | Cobertura JSDoc <20%, ausencia de linter (ESLint/Biome) y sin comprobación estática (`checkJs`). | `lib/logger.js:1-44`, `lib/routes.js:1-675`, `public/app.js:1-1773` | Cero anotaciones `@typedef` o `@param` en `routes.js` y `app.js`; ausencia de `eslint.config.js` y `jsconfig.json` en raíz. | Configurar Biome o ESLint + `jsconfig.json` (`"checkJs": true`) y documentar firmas de API/estado. | 2.5 h |
| 7 | **Baja** | Procesos huérfanos al abortar comandos por timeout en Windows (Batch shims). | `lib/runner.js:80` | `proc.kill("SIGTERM")` en Windows con `shell: true` mata la shell `cmd.exe` pero no los procesos hijos subyacentes. | Implementar `taskkill /pid ${proc.pid} /T /F` en ramas Windows al activarse el timeout. | 25 min |

---

### 3 Quick Wins
1. **Eliminar listeners duplicados en `public/app.js` (L1691–1707)**: Elimina el registro redundante sobre `#btnCopySysInfo` y `#btnHealthRefresh` para evitar llamadas redundantes de red y toast duplicado.
2. **Blindar helper `delJson` en `public/app.js` (L51–54)**: Agregar verificación de `r.ok` y fallback de parseo de errores como se hace en `postJson`.
3. **Asincronizar `/api/update/run` en `lib/routes.js` (L528–529)**: Reemplazar `execSync` por `execFile` con `promisify` para no congelar el servidor mientras corre `git pull` o `npm install`.
# Capa 3: Seguridad & Auth

### Score: 8.5/10
**Justificación:** Arquitectura local-first sólida con enlace loopback estricto (127.0.0.1), serialización mutex y sanitizadores robustos contra command injection / path traversal, pero expuesta a vectores Cross-Origin/CSRF y con llamadas sincrónicas en updates.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Ausencia de validación de `Origin` / CSRF en endpoints mutantes del Control Plane | `server.js:33-41`<br>`lib/routes.js:301,371,526,668` | `grep -n "Origin" server.js` -> Ninguna verificación de `Origin` o `Sec-Fetch-Site` para `POST /api/install`, `POST /api/shutdown`, `POST /api/update/run`. | Agregar middleware en Express que valide `req.headers['sec-fetch-site'] === 'same-origin'` o `req.headers['origin']` coincidente con `http://127.0.0.1:*` y `http://localhost:*`. | 20 min |
| 2 | **Media** | Omisión de sanitizadores de tipo e ID en importación masiva (`/api/import`) | `lib/routes.js:640-655` | `node -e "import('./lib/routes.js')"` -> `state.items[key] = { type: it.type, id: it.id }` no ejecuta `sanitizePrimitiveType` ni `sanitizePrimitiveId`. | Validar `const type = sanitizePrimitiveType(it.type); const id = sanitizePrimitiveId(it.id); if (!type || !id) continue;` dentro del bucle de importación. | 5 min |
| 3 | **Media** | Bloqueo síncrono del Event Loop (DoS) en `POST /api/update/run` vía `execSync` | `lib/routes.js:528-529` | `execSync("git pull origin main", { timeout: 30000 })` congela el proceso Node.js hasta 90s impidiendo atender otras peticiones HTTP. | Reemplazar `execSync` por `execFileP` (asíncrono) y encolar la ejecución dentro del mutex `_commandLock` de `runner.js`. | 15 min |
| 4 | **Media** | Falta de cabecera `Content-Security-Policy` (CSP) en respuestas HTTP | `server.js:34-41` | `grep -i "content-security-policy" server.js` -> 0 resultados. `res.setHeader` solo define `X-Frame-Options` y `X-Content-Type-Options`. | Añadir `res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com;");`. | 5 min |
| 5 | **Baja** | Mutación ciega de configuración en `POST /api/settings` sin validación de esquema | `lib/routes.js:175` | `const updated = { ...current, ...(req.body || {}) };` fusiona cualquier propiedad arbitraria en `user-settings.json`. | Filtrar `req.body` permitiendo únicamente una lista blanca de claves (`recentWorkspaces`, `defaultScope`, `themeContrast`, `autoUpdateCheck`). | 10 min |
| 6 | **Baja** | Atributo `data-watch` sin escape HTML en renderizado de cards | `public/app.js:224` | `data-watch="${entry.key}"` no utiliza `escapeHtml(entry.key)` a diferencia del resto de interpolaciones. | Cambiar a `data-watch="${escapeHtml(entry.key)}"`. | 2 min |

---

### 3 quick wins
1. **Validación de `Sec-Fetch-Site` & `Origin`**: Agregar un middleware en `server.js` que rechace con HTTP 403 peticiones `POST` cuyo origen no sea `same-origin` o `127.0.0.1`/`localhost`, eliminando el vector CSRF local.
2. **Implementación de CSP**: Configurar la cabecera `Content-Security-Policy` restringiendo la ejecución de scripts y conexiones solo a `'self'` y las APIs oficiales de GitHub.
3. **Sanitización en `/api/import`**: Envolver `it.type` e `it.id` con `sanitizePrimitiveType()` y `sanitizePrimitiveId()` antes de persistir en `installed.json`.
# Capa 4: Persistencia & Datos

### Score: 8.5/10
Sólida arquitectura con escrituras atómicas (`.tmp` + `renameSync`) y cola de serialización por promesas, pero con mutación de disco innecesaria en lecturas GET y riesgo de sobreescritura destructiva ante JSON corrupto.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Sobreescritura destructiva ante JSON corrupto (pérdida de historial de instalaciones) | `lib/state.js:16-24`<br>`lib/routes.js:23,164` | `readJson` retorna fallback `{ items: {} }` si falla `JSON.parse`. Al llamar `GET /api/installed`, `reconcile` y `saveInstalled` sobreescriben el archivo corrupto en disco, borrando permanentemente `installedAt`, comandos y metadata previa. | Si `existsSync(p)` es true pero `JSON.parse` falla, crear backup `p.corrupt.<timestamp>` y rechazar/abortar la reescritura destructiva de estado vacío. | 45 min |
| 2 | **Media** | `GET /api/installed` realiza escritura en disco en cada request (no idempotente / I/O thrashing) | `lib/routes.js:160-166` | `router.get("/installed", async (req, res) => { ... const state = reconcile(loadInstalled(), probe); await saveInstalled(state); res.json(state); });`<br>Cualquier cliente o polling UI genera reescritura de 50KB+ en disco aunque no haya cambios. | Implementar dirty-checking (comparar cambios de drift) antes de invocar `saveInstalled()`, manteniendo las lecturas GET puras. | 25 min |
| 3 | **Media** | Claves de cola no normalizadas en `_writeQueues` permiten carreras con rutas relativas vs absolutas | `lib/state.js:39,53` | `_writeQueues.get(p)` indexa por string crudo `p`. Si un componente pasa `data/installed.json` y otro `C:\...\data\installed.json`, se crean colas separadas. | Aplicar `const normPath = resolve(p);` al inicio de `safeWriteJson` para garantizar cola única por archivo físico. | 10 min |
| 4 | **Media** | `reconciler.js` lanza `TypeError` si el archivo JSON de estado no incluye la propiedad `items` | `lib/reconciler.js:17,35` | `if (!state.items[key])` y `Object.keys(state.items)`. Si el archivo existe con formato `{}` (sin `items`), `reconcile()` falla con error 500. | Añadir guardia al inicio de `reconcile`: `if (!state?.items) state = { ...state, items: {} };`. | 10 min |
| 5 | **Baja** | `refresh-catalog.mjs` utiliza `writeFileSync` directo sin atomicidad ni cola de escritura | `scripts/refresh-catalog.mjs:283,287,297` | `writeFileSync(cur, JSON.stringify(catalog, null, 2));` escribe directamente `catalog.json` (200KB). Si el proceso se interrumpe, deja el archivo corrupto. | Importar y usar `safeWriteJson` desde `lib/state.js` en los scripts de actualización de catálogo. | 15 min |
| 6 | **Baja** | I/O síncrono bloqueante (`writeFileSync` / `renameSync`) dentro del wrapper asíncrono de promesas | `lib/state.js:44-45` | `writeFileSync` y `renameSync` detienen el event loop principal de Node durante la serialización y flush a disco de archivos JSON. | Migrar a `node:fs/promises` (`writeFile`, `rename`, `unlink`) para I/O asíncrono. | 30 min |
| 7 | **Baja** | Falta de validación de esquema en `POST /api/settings` permite inyección de claves arbitrarias | `lib/routes.js:175` | `const updated = { ...current, ...(req.body || {}) }; await saveSettings(updated);` persiste cualquier propiedad arbitraria enviada en el body sin filtrado. | Aplicar whitelist de propiedades permitidas (`defaultScope`, `themeContrast`, `autoUpdateCheck`, `recentWorkspaces`). | 15 min |

---

### 3 quick wins
1. **Normalización canónica de paths en `_writeQueues`**: Utilizar `const canonicalPath = resolve(p);` para indexar `_writeQueues`.
2. **Defensiva contra `state.items` indefinido en `reconciler.js`**: Asegurar `if (!state?.items) state = { items: {} };` al inicio de `reconcile()`.
3. **Persistencia atómica uniforme en `scripts/refresh-catalog.mjs`**: Reemplazar las llamadas directas `writeFileSync` por `safeWriteJson`.
# Capa 5: Performance & Optimización

### Score: 7.2/10
Estructura modular liviana (~40MB RAM), pero penalizada por I/O síncrono bloqueante en el Event Loop, escrituras en requests GET y omisiones en la caché de metadatos locales.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Bloqueo síncrono del Event Loop con `execSync` en `/api/health` | `lib/routes.js:238, 250` | `execSync(\`"${clineExe}" --version\`, { timeout: 3000 })` y `execSync(\`"${ghExe}" version\`)` ejecutados síncronamente en el hilo principal durante peticiones HTTP | Reemplazar `execSync` por `execFileP` (asíncrono promisificado) o memoizar el resultado del chequeo de CLI | 15 min |
| 2 | **Media** | I/O muerto: `fsProbe()` ejecutado innecesariamente en `/api/stats` | `lib/routes.js:539` | `const probe = fsProbe(wsDir);` es invocado en cada petición a `/api/stats` pero la variable `probe` jamás es utilizada en la función | Eliminar la línea `const probe = fsProbe(wsDir);` de la ruta `/api/stats` | 2 min |
| 3 | **Media** | Mutación y escritura atómica en disco en peticiones de lectura `GET /api/installed` | `lib/routes.js:164` | `await saveInstalled(state);` se ejecuta incondicionalmente en cada `GET`, ejecutando `writeFileSync` en archivo temporal + `renameSync` sin verificar si hubo cambios reales | Comparar hash/contenido del estado antes de persistir o actualizar solo ante drift detectado | 10 min |
| 4 | **Media** | Falta de memoización en `_metaCache` para skills locales basados únicamente en `SKILL.md` / `README.md` | `lib/probes.js:82-121` | `_metaCache.set(m, ...)` solo se invoca si existe un archivo manifiesto JSON (`package.json`, etc.). Para skills sin manifiesto, se lee y parsea `SKILL.md` con `readFileSync` en cada invocación de `fsProbe` | Guardar en `_metaCache` la entrada utilizando la ruta del directorio `dir` tras resolver la descripción por Markdown | 20 min |
| 5 | **Media** | Re-lectura y parseo JSON síncrono de ~430KB en cada petición de `/api/catalog` y `/api/status` | `lib/routes.js:55-57, 201-203`, `lib/state.js:19` | `loadCatalog()` (196KB) + `readJson(PREV_CATALOG_PATH)` (196KB) + `readJson(META_PATH)` (37KB) leídos síncronamente con `readFileSync` + `JSON.parse` en cada request | Implementar memoización en memoria del catálogo y metadatos con invalidación por `mtimeMs` o `fs.watch` | 45 min |
| 6 | **Baja** | Serialización global estricta de CLI y ejecución secuencial en operaciones en lote (`/api/bulk`) | `lib/runner.js:9, 103-104`, `lib/routes.js:481-501` | `_commandLock` implementa una cola global única con timeout de 180s; el bucle de `/api/bulk` ejecuta `await runCline` uno a uno secuencialmente | Implementar colas de ejecución por workspace y permitir paralelismo controlado en operaciones independientes | 1 h |

---

### 3 quick wins
1. **Eliminar `const probe = fsProbe(wsDir);` en `lib/routes.js:539` (`/api/stats`)**: Elimina el escaneo de disco innecesario en este endpoint.
2. **Evitar escritura atómica en `GET /api/installed` si no hay cambios**: Guardar únicamente ante drift detectado.
3. **Reemplazar `execSync` por `execFileP` asíncrono en `lib/routes.js:238, 250` (`/api/health`)**: Previene bloqueos del Event Loop.
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
# Capa 7: DevOps & CI/CD

### Score: 7.8/10
Sólida arquitectura CI/CD con multi-OS, SAST, Release Drafter y capturas CDP 2x, pero penalizada por versiones de acciones no existentes en GitHub Actions (@v7/@v9), ausencia de Node 24 en CI y hooks locales no auto-instalables.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|-----------|----------|---------------|------------------------------|---------------|----------|
| 1 | **Crítica** | **Action version tags inexistentes (`checkout@v7`, `setup-node@v7`, `github-script@v9`)**: Los workflows referencian versiones mayores inexistentes que provocan fallo inmediato de resolución en GitHub Actions runners. | `.github/workflows/ci.yml:21,24`<br>`.github/workflows/release.yml:24,39`<br>`.github/workflows/codeql.yml:27`<br>`.github/workflows/auto-changelog.yml:21`<br>`.github/workflows/sync-catalog.yml:19,22` | `grep "checkout@v7"` -> `uses: actions/checkout@v7`, `uses: actions/setup-node@v7`, `uses: actions/github-script@v9` (Las versiones oficiales estables actuales son checkout@v4, setup-node@v5, github-script@v7). | Reemplazar las etiquetas `@v7`/`@v9` por `@v4`, `@v5` y `@v7` respectivamente en todos los archivos `.github/workflows/*.yml`. | 15 min |
| 2 | **Media** | **Matriz de Node incompleta en CI (falta Node 24.x)**: El workflow `ci.yml` cubre Node 18.x, 20.x y 22.x en Ubuntu, Windows y macOS, pero omite Node 24.x a pesar de que `package.json` declara `"engines": { "node": ">=18.0.0" }`. | `.github/workflows/ci.yml:17` | `view_file .github/workflows/ci.yml` -> `node-version: [18.x, 20.x, 22.x]` | Agregar `24.x` al array `node-version: [18.x, 20.x, 22.x, 24.x]`. | 5 min |
| 3 | **Alta** | **Ruta absoluta hardcodeada a Chrome en Windows (`C:\Program Files\Google\Chrome\...`)**: El script de capturas CDP 2x falla en Linux/macOS y en sistemas con Chrome en AppData o rutas no estándar. | `scripts/capture-screenshots.mjs:8` | `view_file scripts/capture-screenshots.mjs` -> `const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";` | Usar helper dinámico multiplataforma (`resolveCommand('google-chrome') || resolveCommand('chrome') || resolveCommand('chromium')` o `process.env.CHROME_PATH`). | 30 min |
| 4 | **Media** | **Git Hooks no auto-instalables para colaboradores**: Los hooks `pre-commit` y `pre-push` residen en `.git/hooks/` pero no existe lifecycle script (`prepare`) en `package.json` para instalarlos tras clonar (`npm install`). | `package.json:20-29`<br>`.git/hooks/pre-commit:1-3`<br>`.git/hooks/pre-push:1-11` | `view_file package.json` -> No existe script `"prepare"` en `package.json`. | Añadir script `"prepare": "node scripts/setup-hooks.mjs"` en `package.json`. | 20 min |
| 5 | **Media** | **Push directo a rama `main` en sincronización periódica upstream**: El cron `sync-catalog.yml` ejecuta `git push origin main`, susceptible a fallos si la rama `main` tiene Branch Protection Rules activas. | `.github/workflows/sync-catalog.yml:52` | `view_file .github/workflows/sync-catalog.yml` -> `git push origin main` | Reemplazar push directo por creación automatizada de Pull Request con `peter-evans/create-pull-request`. | 30 min |
| 6 | **Baja** | **Workflow de Release sin pipeline de publicación npm ni test gate**: `release.yml` crea el GitHub Release con metadata estática sin verificar pruebas unitarias ni publicar a npm registry con OIDC provenance. | `.github/workflows/release.yml:18-59` | `view_file .github/workflows/release.yml` -> Solo invoca `softprops/action-gh-release@v2`. | Añadir `npm test` como gate previo y step de `npm publish --provenance`. | 45 min |
| 7 | **Baja** | **Sobrecarga de captura CDP completa en cada commit local**: `pre-commit.mjs` levanta el servidor Express y Chrome headless para capturar 5 pantallas en 2x resolution en cada commit. | `scripts/pre-commit.mjs:18-24` | `view_file scripts/pre-commit.mjs` -> Ejecuta `capture-screenshots.mjs` en cada commit. | Dejar solo `unit-test.mjs` en `pre-commit` y mover la regeneración de screenshots a `pre-push` o `npm run docs:screenshots`. | 10 min |

---

### 3 quick wins
1. **Corregir Action Tags a versiones oficiales estables**: Actualizar `actions/checkout@v4`, `actions/setup-node@v5` y `actions/github-script@v7` en todos los workflows `.github/workflows/*.yml`.
2. **Incorporar Node 24.x a la matriz de CI**: Extender la matriz en `ci.yml` a `[18.x, 20.x, 22.x, 24.x]`.
3. **Optimizar el ciclo de desarrollo en `pre-commit`**: Separar la captura gráfica CDP de `pre-commit` hacia `npm run docs:screenshots` / `pre-push`.
# Capa 8: Testing & QA

### Score: 4.5/10
Cuenta con base nativa en `node:test`, CI multi-plataforma y hooks de git, pero los smoke tests carecen de aserciones reales (0 asserts) y la cobertura unitaria omite componentes centrales como reconciler, probes, runner y rutas REST.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Los smoke tests de endpoints REST (`/api/status`, `/api/health`, `/api/installed`, `/api/catalog`, `/api/stats`, `/api/changelog`, `/api/export`) no ejecutan aserciones (`assert`); actúan como pings/loggers y enmascaran fallos estructurales mediante encadenamiento opcional (`?.length`). | `scripts/smoke-test.mjs:68-121` | `grep_search "assert" scripts/smoke-test.mjs` -> *No results found*. Si la API devuelve `{}` o `health.ok: false`, el test pasa con éxito. | Importar `node:assert/strict` en `smoke-test.mjs` y verificar HTTP status codes, tipos de datos, longitud de colecciones, headers (`Content-Disposition`) y schemas. | 1.5 h |
| 2 | **Alta** | Cobertura unitaria nula (0%) en módulos troncales del backend: `lib/reconciler.js` (46 líneas), `lib/probes.js` (271 líneas) y `lib/runner.js` (107 líneas). | `scripts/unit-test.mjs:1-88`<br>`lib/reconciler.js:1-46`<br>`lib/probes.js:1-271`<br>`lib/runner.js:1-107` | `unit-test.mjs` únicamente importa `sanitizers.js`, `state.js` y `resolve-command.mjs`. Ninguna prueba verifica la detección de drift en `reconcile()`. | Incorporar tests unitarios para `reconcile()`, `extractLocalSkillMeta()`, `verbFor()` y mocks de procesos hijos para `runCline()`. | 2 h |
| 3 | **Media** | Endpoints de mutación, configuración y ciclo de vida (`/api/install`, `/api/uninstall`, `/api/mark`, `/api/forget`, `/api/settings`, `/api/workspaces/recent`, `/api/bulk`, `/api/import`, `/api/watchlist/toggle`) totalmente desprovistos de tests. | `lib/routes.js:173-196, 301-504, 633-661` | Búsqueda de `/api/install` o `/api/settings` en `scripts/` arroja 0 ejecuciones de prueba automatizadas. | Diseñar tests de integración para el ciclo de vida completo. | 2 h |
| 4 | **Media** | Efectos colaterales y polución en el almacenamiento persistente de disco (`data/installed.json`, `data/watchlist.json`) durante la ejecución de pruebas. | `lib/routes.js:160-166`<br>`scripts/smoke-test.mjs:82-86` | La invocación a `GET /api/installed` en `smoke-test.mjs` ejecuta `saveInstalled(state)` sobre el archivo real `data/installed.json`. | Inyectar un `dataDir` configurable o directorio temporal efímero durante las sesiones de prueba. | 1 h |
| 5 | **Baja** | Inexistencia de reporte de cobertura (coverage) y métricas de umbral mínimo en la pipeline de CI. | `.github/workflows/ci.yml:32-36`<br>`package.json:26-29` | CI ejecuta `npm run test:unit` y `npm run test:smoke` sin flags de cobertura ni reporte de líneas cubiertas. | Habilitar `--experimental-test-coverage` en Node nativo en GitHub Actions. | 15 min |
| 6 | **Baja** | Ausencia de casos de prueba negativos para validación de errores HTTP (400 Bad Request, 500 Internal Error, timeouts). | `lib/routes.js:181-185, 305-307, 474-476` | `unit-test.mjs` solo evalúa retornos `null` en sanitizers pero no valida las respuestas JSON de error de las rutas Express. | Agregar pruebas de integración pasando payloads corruptos y verificar status 400 y mensaje JSON. | 1 h |

---

### 3 quick wins
1. **Aserciones estrictas en `scripts/smoke-test.mjs`**: Reemplazar los `console.log` informativos por llamadas a `assert.strictEqual()`, `assert.ok()` y validaciones de schema JSON para todos los endpoints.
2. **Suite unitaria de `lib/reconciler.js`**: Agregar en `scripts/unit-test.mjs` pruebas que validen la lógica pura de reconciliación y detección de drift.
3. **Métricas de cobertura nativas en `package.json`**: Añadir el flag `--experimental-test-coverage` en `package.json`.
# Capa 9: Observabilidad & Diagnósticos

### Score: 9.4/10
Excelente base con logger estructurado ANSI, trazas de ejecución con tiempos en ms y diagnósticos multi-probe, con margen de mejora en desacople asíncrono y telemetría de memoria.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|:---:|
| 1 | **Media** | Bloqueo síncrono del Event Loop con `execSync` en health checks | `lib/routes.js:238,250` | `execSync(\`"${clineExe}" --version\`, { timeout: 3000 })` congela el bucle de eventos durante los sondeos de salud. | Migrar a `execFile` promisificado (`node:child_process`) con timeout no bloqueante. | 10 min |
| 2 | **Media** | Uptime de host en vez de uptime del proceso del servidor | `lib/routes.js:5,295` | `import { uptime } from "node:os"; uptime: Math.round(uptime())` devuelve el tiempo de encendido del SO en vez de `process.uptime()`. | Reemplazar por `process.uptime()` para monitorear el ciclo de vida del servidor de control plane. | 2 min |
| 3 | **Media** | Logger importado como módulo pero sin uso en manejadores de ruta | `lib/routes.js:13` | `import { logger } from "./logger.js";` no se invoca en bloques `catch` de rutas de mutación (`/install`, `/uninstall`, `/update/run`). | Instrumentar `logger.error` estructurado al atrapar excepciones en rutas críticas. | 5 min |
| 4 | **Baja** | Umbral permisivo de health check marca OK sin el ejecutable `cline` | `lib/routes.js:288` | `ok: checks.filter((c) => c.ok).length >= 4` evalúa a `true` incluso si el CLI primario `cline` no está instalado. | Definir `cline`, `node` y `catalog` como dependencias críticas obligatorias para el flag global `ok`. | 5 min |
| 5 | **Baja** | Pérdida de traza estructurada `logger.exec` en timeouts de comandos | `lib/runner.js:78-82` | Al vencer el timeout de 180s, se rechaza la promesa antes de `proc.on("close")`, omitiendo el log de salida `EXEC`. | Invocar `logger.exec` o `logger.error` explícitamente en el callback del temporizador de timeout. | 5 min |
| 6 | **Baja** | Omisión del estándar `NO_COLOR` y niveles de verbosidad `LOG_LEVEL` | `lib/logger.js:3-13` | Los códigos ANSI se emiten de forma fija sin validar `process.env.NO_COLOR` ni `process.stdout.isTTY`. | Condicionar paleta ANSI según `process.env.NO_COLOR || !process.stdout.isTTY`. | 10 min |
| 7 | **Informativa** | Falta de métricas de telemetría de memoria/CPU en `/api/status` y `/api/health` | `lib/routes.js:207-222` | Las respuestas diagnósticas omiten `process.memoryUsage()`. | Incluir objeto `memory: { rss, heapUsed, heapTotal }` en los payloads de `/api/status` y `/api/health`. | 5 min |

---

### 3 Quick Wins
1. **Corregir Uptime:** Cambiar `uptime()` de `node:os` por `Math.round(process.uptime())` en `lib/routes.js:295`.
2. **Telemetría de Recursos:** Exponer `memory: process.memoryUsage()` en `/api/status` y `/api/health`.
3. **Respeto a `NO_COLOR`:** Añadir guarda `const useColor = !process.env.NO_COLOR && Boolean(process.stdout.isTTY)` en `lib/logger.js`.
# Capa 10: Ecosistema Cline & MCP

### Score: 8.8/10
Sólida integración CLI y multi-raíz con síntesis local, pero con desincronización de endpoints REST en ciclo de vida y disparidad multiplataforma.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Desincronización en endpoint de eliminación/olvido de primitivas (`forget` / `mark`) entre frontend y backend | `public/app.js:1109`<br>`lib/routes.js:432` | `public/app.js`: `await delJson('/api/mark/${entry.type}/${entry.id}')`<br>`lib/routes.js`: `router.post('/forget', ...)`<br>Output: Click en "Forget" devuelve 404. | Unificar agregando `DELETE /api/mark/:type/:id` y `DELETE /api/forget/:type/:id` en `lib/routes.js`. | 15 min |
| 2 | **Alta** | Desincronización en endpoints de Watchlist (`POST/DELETE` vs `toggle`) | `public/app.js:1123-1126`<br>`lib/routes.js:449` | `public/app.js`: `postJson('/api/watchlist', ...)` y `delJson('/api/watchlist/...')`<br>`lib/routes.js`: solo define `router.post('/watchlist/toggle', ...)`. | Exponer `POST /api/watchlist` y `DELETE /api/watchlist/:type/:id` en `lib/routes.js`. | 15 min |
| 3 | **Media** | Endpoint de refresh de catálogo (`POST /api/refresh`) no implementado en Express | `public/app.js:1616`<br>`lib/routes.js:15` | `public/app.js`: `await postJson('/api/refresh', {})`<br>`lib/routes.js`: No tiene ruta `router.post('/refresh')`. | Implementar `router.post('/refresh')` en `lib/routes.js` ejecutando `scripts/refresh-catalog.mjs`. | 30 min |
| 4 | **Media** | Endpoint de heurísticas de contexto (`GET /api/context`) documentado pero no expuesto en router | `lib/routes.js:15`<br>`scripts/detect-context.mjs:1`<br>`README.md:238` | `README.md:238`: `GET /api/context ?cwd=...`<br>`public/app.js:1232`: `getJson('/api/context...')`. | Montar `router.get('/context')` en `lib/routes.js` invocando `scripts/detect-context.mjs`. | 45 min |
| 5 | **Media** | Operación `bulk` no implementa `watch`/`unwatch` y omite reconciliación de estado tras install/uninstall | `lib/routes.js:470-504` | `lib/routes.js:474`: Valida `['install', 'uninstall', 'watch', 'unwatch']`, pero el loop solo evalúa install/uninstall. | Implementar ramas para `watch`/`unwatch` en `router.post('/bulk')` y ejecutar `reconcile` + `saveInstalled`. | 30 min |
| 6 | **Baja** | Disparidad de plataformas en detección de Roo-Cline y derivados de VS Code (macOS/Linux) | `lib/probes.js:31-54`<br>`lib/probes.js:220-238` | En Windows se busca `rooveterinaryinc.roo-cline`, pero en Darwin y Linux no está incluido en `clineRootCandidates`. | Agregar rutas canónicas de Roo-Cline, Cursor y VSCodium para macOS y Linux en `lib/probes.js`. | 20 min |
| 7 | **Informativa** | Discrepancia en nombre de propiedad de estado entre frontend y backend (`storageRoots` vs `clineRoots`) | `lib/routes.js:212`<br>`public/app.js:1249` | `lib/routes.js:212`: devuelve `{ storageRoots: probe.roots }`<br>`public/app.js:1249`: evalúa `if (s.clineRoots && s.clineRoots.length)`. | Incluir ambos campos (`storageRoots` y `clineRoots`) en la respuesta de `GET /api/status`. | 5 min |

---

### 3 quick wins
1. **Unificar endpoints REST de ciclo de vida en `lib/routes.js`**: Agregar `DELETE /api/mark/:type/:id`, `DELETE /api/forget/:type/:id`, `POST /api/watchlist` y `DELETE /api/watchlist/:type/:id`.
2. **Exponer `GET /api/context` y `POST /api/refresh` en Express**: Conectar `detect-context.mjs` y `refresh-catalog.mjs` al router.
3. **Completar soporte multiplataforma para Roo-Cline y Cursor**: Añadir rutas de macOS y Linux en `lib/probes.js`.
# Capa 11: Subprocess Bridge & CLI Runner

### Score: 8.5/10
Arquitectura de serialización y resolución de shims multiplataforma altamente sólida, penalizada por descarte incompleto de subprocesos huérfanos en Windows (`shell: true` sin tree-kill) y llamadas síncronas bloqueantes `execSync` en endpoints HTTP.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Procesos huérfanos en Windows tras timeout debido a `proc.kill("SIGTERM")` sobre wrappers `shell: true` | `lib/runner.js:78-82` | `spawn(exe, args, { shell: true })` genera `cmd.exe` como PID raíz. `proc.kill("SIGTERM")` solo termina el wrapper `cmd.exe`, dejando el subproceso subyacente (`node`/`cline`) corriendo en segundo plano. | Implementar terminación por árbol de procesos en Windows vía `taskkill /pid ${proc.pid} /T /F`. | 15 min |
| 2 | **Media** | Bloqueo síncrono del Event Loop con `execSync` en rutas de diagnóstico `/health` y actualización `/update/run` | `lib/routes.js:238,250,528-529` | `execSync(\`"${clineExe}" --version\`)` y `execSync("git pull ...")` detienen sincrónicamente el hilo principal de Node.js. | Reemplazar `execSync` por `promisify(execFile)` asíncrono. | 20 min |
| 3 | **Media** | Ausencia de escalado a `SIGKILL` (Force Kill) para procesos colgados en entornos POSIX | `lib/runner.js:78-82` | Si un proceso `cline` ignora `SIGTERM`, la promesa rechaza pero el proceso permanece activo sin recibir nunca `SIGKILL`. | Añadir un temporizador secundario de gracia (2000 ms) tras `SIGTERM` que emita `proc.kill("SIGKILL")`. | 10 min |
| 4 | **Baja** | Acumulación ilimitada de buffers en memoria (`stdout`/`stderr`) sin cota máxima | `lib/runner.js:74-75, 84-85` | `proc.stdout.on("data", (d) => { stdout += d.toString(); });` concatena chunks sin límite. | Establecer un `maxBuffer` configurable (ej. 5 MB) truncando la salida excedente. | 10 min |
| 5 | **Baja** | Caché estática persistente `_cachedClinePath` sin validación de existencia (`existsSync`) en caliente | `lib/runner.js:8, 15-20` | `if (_cachedClinePath) return _cachedClinePath;` almacena en memoria la ruta sin verificar si el binario fue movido o desinstalado. | Validar `existsSync(_cachedClinePath)` antes de retornar. | 5 min |
| 6 | **Baja** | Candidatos de fallback en `getStandardCandidates` carecen de gestores comunes (Scoop, Choco, fnm, nvm) | `scripts/lib/resolve-command.mjs:28-52` | Si `where.exe`/`which` falla, no se buscan shims en `~/scoop/shims`, `C:\ProgramData\chocolatey\bin`, ni `~/.nvm`. | Incorporar las rutas estándar de Scoop, Chocolatey y fnm/nvm en el array de candidatos fallback. | 15 min |
| 7 | **Informativa** | Duplicación de la función `isWindowsBatchShim` en dos módulos distintos | `lib/sanitizers.js:56-60` y `scripts/lib/resolve-command.mjs:115-119` | Ambas implementaciones coexisten con leves diferencias. | Unificar `isWindowsBatchShim` en `resolve-command.mjs` y reutilizarla en `sanitizers.js`. | 5 min |

---

### 3 Quick Wins
1. **Asignación asíncrona no bloqueante en `/api/health`**: Reemplazar `execSync` por `execFileP(clineExe, ["--version"], { timeout: 3000 })`.
2. **Validación de frescura en `resolveCline()`**: Comprobar `existsSync(_cachedClinePath)` antes de resolver desde caché.
3. **Límite defensivo de buffer (`maxBuffer`)**: Agregar cota de 5 MB a `stdout`/`stderr` en `lib/runner.js`.
