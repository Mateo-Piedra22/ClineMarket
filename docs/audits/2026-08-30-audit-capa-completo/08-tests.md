# Capa 8: Tests & Cobertura QA

### Score: 6.0/10

**Justificación del Score:**
El proyecto cuenta con una base de pruebas ágil y moderna basada en el test runner nativo de Node.js (`node:test`, `node:assert/strict`), lo que elimina dependencias pesadas de desarrollo y permite una ejecución ultrarrápida (<150 ms para unit tests y <1.5 s para smoke tests). La infraestructura de CI en GitHub Actions evalúa una matriz exhaustiva de sistemas operativos (Ubuntu, Windows, macOS) y versiones de Node.js (18.x, 20.x, 22.x, 24.x), complementada con hooks de pre-commit y pre-push.

Sin embargo, el score se sitúa en 6.0/10 debido a severas brechas estructurales de cobertura y rigor de aserciones:
1. **Brecha Masiva de Cobertura Unitaria:** Módulos críticos como `lib/probes.js` (291 líneas) y `lib/routes.js` (861 líneas) tienen **0.00% de cobertura unitaria**, sumando más del 70% de la base de código backend sin pruebas aisladas.
2. **Omisión de Endpoints Mutantes:** 18 rutas HTTP mutantes de Express (`POST /api/install`, `POST /api/uninstall`, `POST /api/mark`, `POST /api/forget`, `DELETE /api/forget/:type/:id`, `GET/POST/DELETE /api/watchlist`, `POST /api/bulk`, `POST /api/refresh`, `POST /api/settings`, `POST /api/workspaces/recent`, `POST /api/import`, etc.) carecen de pruebas automatizadas en la suite oficial.
3. **Aserciones Débiles y Falsos Positivos:** En `scripts/smoke-test.mjs`, las llamadas a `resolveCommand("cline")` y `resolveCommand("gh")` carecen de aserciones (`assert`), limitándose a imprimir en consola; asimismo, la prueba de `/api/health` valida `health.checks.length >= 4` pero no comprueba que `health.ok === true` ni que los checks individuales pasen. En `scripts/unit-test.mjs`, el test de concurrencia evalúa débilmente `typeof finalData.iteration === "number"` en lugar del valor exacto secuencial `4`.
4. **Polución de Estado en Disco:** Las pruebas unitarias y de integración escriben directamente en el directorio de producción `data/` (`data/test-queue-*.json`, mutación de `data/installed.json` y `data/context-cache.json`) sin utilizar aislamiento en `os.tmpdir()`.
5. **Cero Mocks de Procesos:** `lib/runner.js` no cuenta con mocks para `runCline`, `resolveCline` o `killProcessTree`, dejando la ejecución de subprocesos y timeouts sin pruebas unitarias.

---

### Evidencia Empírica de Ejecución

#### 1. Ejecución de la Suite Completa (`npm test`)
```
> cline-marketplace@1.0.0 test
> node --test scripts/unit-test.mjs && node scripts/smoke-test.mjs

TAP version 13
# Subtest: sanitizers: sanitizePrimitiveId
ok 1 - sanitizers: sanitizePrimitiveId
  ---
  duration_ms: 0.744
  type: 'test'
  ...
# Subtest: sanitizers: sanitizePrimitiveType
ok 2 - sanitizers: sanitizePrimitiveType
  ---
  duration_ms: 0.1998
  type: 'test'
  ...
# Subtest: sanitizers: sanitizeWorkspacePath
ok 3 - sanitizers: sanitizeWorkspacePath
  ---
  duration_ms: 0.7418
  type: 'test'
  ...
# Subtest: resolver: isWindowsBatchShim
ok 4 - resolver: isWindowsBatchShim
  ---
  duration_ms: 0.1533
  type: 'test'
  ...
# Subtest: state: safeWriteJson and readJson serialization
ok 5 - state: safeWriteJson and readJson serialization
  ---
  duration_ms: 6.037
  type: 'test'
  ...
# Subtest: runner: verbFor maps primitive types correctly
ok 6 - runner: verbFor maps primitive types correctly
  ---
  duration_ms: 0.1611
  type: 'test'
  ...
# Subtest: reconciler: correctly merges discovered primitives and detects drift
ok 7 - reconciler: correctly merges discovered primitives and detects drift
  ---
  duration_ms: 1.2245
  type: 'test'
  ...
# Subtest: command resolver: resolves installed system binaries
ok 8 - command resolver: resolves installed system binaries
  ---
  duration_ms: 67.6077
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 148.4804
==> Starting temporary server instance on 127.0.0.1:5173...
==> Testing Command Resolver
  cline resolved to: C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  gh resolved to: C:\Program Files\GitHub CLI\gh.exe

==> Testing /api/status
  node: v22.17.0 platform: win32 uptime: 0 s

==> Testing /api/health
  [✓] node: v22.17.0 (x64)
  [✓] cline: 3.0.60 at C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  [✓] gh: Authenticated to GitHub
  [✓] cline-storage: C:\Users\mateo\.cline, C:\Users\mateo\.claude, C:\Users\mateo\AppData\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev, C:\Users\mateo\AppData\Roaming\Claude
  [✓] catalog: 202 entries, generated 2026-06-19T18:20:28.065Z
  [✓] metadata: 202 upstream commit records cached

==> Testing /api/installed
  installed items: 58 total (57 active on disk)

==> Testing /api/catalog
  catalog total: 259 (marketplace: 202, local: 57)

==> Testing /api/context
  context languages: javascript, recommended count: 6

==> Testing /api/stats
  stats total: 202, top authors: 10, tags: 12

==> Testing /api/changelog
  changelog added: 0, removed: 0, updated: 0

==> Testing /api/export
  export records: 58

==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!
```

#### 2. Reporte de Cobertura Nativa de Node.js (`node --test --experimental-test-coverage scripts/unit-test.mjs`)
```
# start of coverage report
# -----------------------------------------------------------------------------
# file           | line % | branch % | funcs % | uncovered lines
# -----------------------------------------------------------------------------
# lib            |        |          |         | 
#  logger.js     |  70.83 |    10.00 |    0.00 | 20-22 26 29 32 35 38-42 45-46
#  reconciler.js |  96.72 |    75.00 |  100.00 | 15-16
#  resolver.js   |  51.97 |    61.11 |   75.00 | 19-63 75-76 101-102 104-115
#  runner.js     |  32.59 |   100.00 |   25.00 | 21-25 42-54 63-135
#  sanitizers.js |  93.33 |    95.83 |   75.00 | 57-60
#  state.js      |  72.73 |    55.56 |   75.00 | 23-34 47-48 58-61
# scripts        |        |          |         | 
#  unit-test.mjs | 100.00 |    90.91 |  100.00 | 
# -----------------------------------------------------------------------------
# all files      |  69.75 |    72.45 |   62.16 | 
# -----------------------------------------------------------------------------
# end of coverage report
```
*Nota:* `lib/probes.js` (291 líneas), `lib/routes.js` (861 líneas), `server.js` (163 líneas) y `bin/cline-marketplace.js` (278 líneas) **ni siquiera aparecen en el reporte** porque tienen 0.00% de importación/ejecución en la suite unitaria.

---

### Matriz de Cobertura por Módulo

| Módulo / Archivo | Líneas Totales | Cobertura Unitaria (Líneas %) | Cobertura Smoke (Funcional %) | Endpoints / Funciones sin Probar | Estado de QA |
|---|---|---|---|---|---|
| `lib/sanitizers.js` | 61 | 93.33% | Alta (~90%) | `isWindowsBatchShim` (duplicado), boundary 128 chars | 🟢 Bueno |
| `lib/reconciler.js` | 62 | 96.72% | Alta (~95%) | Null probe guard (líneas 15-16) | 🟢 Excelente |
| `lib/state.js` | 67 | 72.73% | Media (~60%) | Quarantine backup de JSON corrupto, mkdir recursivo | 🟡 Aceptable |
| `lib/resolver.js` | 128 | 51.97% | Media (~50%) | `getStandardCandidates` (líneas 19-63), `which` fallback | 🟡 Parcial |
| `lib/logger.js` | 49 | 70.83% (0% funcs) | Pasiva | `logger.info`, `logger.warn`, `logger.error`, `logger.http` | 🟡 Pasivo |
| `lib/runner.js` | 136 | 32.59% | 0% | `runCline`, `resolveCline`, `killProcessTree`, timeout logic | 🔴 Crítico |
| `lib/probes.js` | 291 | **0.00%** | Parcial (~40%) | `clineRootCandidates` (Darwin/Linux), MCP configs parsing | 🔴 Crítico |
| `lib/routes.js` | 861 | **0.00%** | ~30% (8 GETs) | 18 rutas mutantes (`/install`, `/uninstall`, `/watchlist`, etc.) | 🔴 Crítico |
| `server.js` | 163 | **0.00%** | ~50% (HTTP init) | CSRF rejection middleware, error handler global | 🟡 Parcial |
| `bin/cline-marketplace.js` | 278 | **0.00%** | 0% | CLI flags (`--no-open`, `--port`), subcomandos (`update`, `refresh`) | 🔴 Crítico |
| `scripts/refresh-catalog.mjs`| 304 | **0.00%** | 0% | GitHub token resolution, commits walking, ratelimit retry | 🔴 Crítico |
| `scripts/detect-context.mjs` | 170 | **0.00%** | 0% (solo GET /context) | Detección de Go, Rust, Java, Python, Docker, C# | 🟡 Parcial |
| `public/` (Frontend UI) | ~1,200 | **0.00%** | 0% | Vanilla DOM interactions, filtros, modales, star toggle | 🔴 Sin Tests |

---

### Hallazgos de la Auditoría

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia (Comando + Output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | **Cobertura unitaria nula (0.00%) en `lib/probes.js` y `lib/routes.js`**: Más de 1,150 líneas de lógica central de negocio (escaneo de almacenamiento, extracción de metadata, enrutamiento Express) están completamente desprovistas de pruebas unitarias aisladas. | `lib/probes.js:1-291`<br>`lib/routes.js:1-861` | `node --test --experimental-test-coverage scripts/unit-test.mjs`<br>*Output: `probes.js` y `routes.js` tienen 0 líneas reportadas*. | Crear `tests/unit/probes.test.mjs` y `tests/unit/routes.test.mjs` utilizando mocks en memoria de filesystem y supertest/express router. | 4 h |
| 2 | **Alta** | **Ausencia total de pruebas automatizadas para 18 endpoints mutantes y de configuración**: Rutas críticas que ejecutan comandos de instalación/desinstalación, modifican listas de seguimiento y alteran configuraciones no tienen cobertura en ninguna suite. | `lib/routes.js:400-470, 471-506, 509-549, 551-602, 605-660, 663-685, 707-720, 815-847` | Búsqueda en `scripts/unit-test.mjs` y `scripts/smoke-test.mjs` de endpoints como `/api/install`, `/api/watchlist`, `/api/bulk`, `/api/settings` arroja **0 resultados**. | Desarrollar `tests/integration/api-mutations.test.mjs` validando ciclo de vida completo: POST install, GET watchlist, POST settings, POST bulk, POST import. | 3.5 h |
| 3 | **Media** | **Aserciones no estrictas y falsos positivos en suites de prueba**: En `smoke-test.mjs`, la resolución de `cline` y `gh` no tiene `assert` (solo `console.log`); `/api/health` solo evalúa `checks.length >= 4` sin verificar que `health.ok === true`; y en `unit-test.mjs` el test de concurrencia evalúa `typeof iteration === "number"` en lugar del valor exacto `4`. | `scripts/smoke-test.mjs:64-67, 78-84`<br>`scripts/unit-test.mjs:78` | `scripts/smoke-test.mjs:64-67`:<br>`const cline = await resolveCommand("cline");`<br>`console.log(" cline resolved to:", cline \|\| "NOT FOUND");`<br>*(Si `cline` es null, el test pasa sin error).* | Añadir `assert.ok(cline, "cline binary must resolve")`, `assert.strictEqual(health.ok, true)`, y en `unit-test.mjs` `assert.strictEqual(finalData.iteration, 4)`. | 1 h |
| 4 | **Media** | **Polución de almacenamiento de producción y falta de aislamiento en pruebas**: `unit-test.mjs` escribe en `data/test-queue-*.json`, mientras que `smoke-test.mjs` muta `data/installed.json` y `data/context-cache.json` en disco real durante la ejecución de los tests. | `scripts/unit-test.mjs:67`<br>`lib/routes.js:228, 246`<br>`scripts/smoke-test.mjs:86-92` | `ls data/`<br>*Durante las pruebas se crean y modifican archivos en el directorio de runtime del usuario*. | Parametrizar `dataDir` en el router de Express y en los tests para apuntar a un directorio temporal efímero generado con `fs.mkdtempSync(join(os.tmpdir(), "cline-test-"))`. | 2 h |
| 5 | **Media** | **Acoplamiento de entorno y falta de mocks de procesos para `lib/runner.js`**: `runner.js` tiene solo 32.59% de cobertura; `runCline`, la cola de serialización `_commandLock`, la terminación de árbol de procesos `killProcessTree` y el manejo de timeouts no tienen pruebas unitarias aisladas. | `lib/runner.js:62-135` | `node --test --experimental-test-coverage scripts/unit-test.mjs`<br>*Líneas 21-25, 42-54, 63-135 no cubiertas*. | Escribir tests unitarios con stubs de `child_process.spawn` para validar timeout de 180s, reintento con `--force` y serialización de comandos concurrentes. | 2.5 h |
| 6 | **Media** | **Divergencia semántica y duplicación en `isWindowsBatchShim`**: `isWindowsBatchShim` está implementado dos veces con diferente comportamiento ante plataformas POSIX (`sanitizers.js:56-60` no valida OS, mientras `resolver.js:123-127` valida `platform() === 'win32'`). `runner.js` importa la versión de sanitizers y `routes.js` importa la de resolver. | `lib/sanitizers.js:56-60`<br>`lib/resolver.js:123-127`<br>`lib/runner.js:7`<br>`lib/routes.js:14` | Ejecución diagnóstica en entorno POSIX:<br>`isShimSanitizer('/tmp/fake.cmd') === true`<br>`isShimResolver('/tmp/fake.cmd') === false` | Unificar la función en `lib/resolver.js` y exportarla consistentemente hacia `runner.js`, `routes.js` y `unit-test.mjs`. | 30 min |
| 7 | **Baja** | **Ausencia de umbrales mínimos de cobertura en CI (`coverage threshold gate`)**: La pipeline de GitHub Actions ejecuta `npm run test:unit` y `npm run test:smoke` pero no falla la build si la cobertura disminuye o no alcanza un umbral (e.g. 80%). | `.github/workflows/ci.yml:32-36` | `.github/workflows/ci.yml` líneas 32-36:<br>`run: npm run test:unit`<br>`run: npm run test:smoke`<br>*(Sin flags de cobertura ni validación de threshold).* | Configurar `node --test --experimental-test-coverage --test-coverage-threshold 75` o integrar reporte `c8` en el workflow de CI. | 30 min |
| 8 | **Baja** | **Inexistencia de pruebas End-to-End (E2E) para la interfaz web (`public/`) y CLI (`bin/`)**: La aplicación de navegador local y los flags del binario CLI (`--no-open`, `--port`, subcomando `refresh`) no tienen pruebas automatizadas de interfaz o interacción. | `public/index.html`<br>`bin/cline-marketplace.js:50-74` | Búsqueda de herramientas E2E (Playwright, Puppeteer) arroja 0 configuraciones de test frontend. | Implementar un smoke E2E ligero con Node test runner o Playwright headless para validar carga del DOM, filtros de tags y renderizado del catálogo. | 3 h |

---

### Top 3 Quick Wins
1. **Aserciones estrictas en `scripts/smoke-test.mjs` y `scripts/unit-test.mjs`**: Reemplazar verificaciones laxas (`typeof iteration === "number"`, ausencia de asserts en `resolveCommand`) por `assert.strictEqual(finalData.iteration, 4)` y comprobación obligatoria de `health.ok === true`. *(Esfuerzo: 1 h)*.
2. **Unificación de `isWindowsBatchShim`**: Eliminar la copia redundante en `lib/sanitizers.js`, usar la versión estricta de `lib/resolver.js` en todos los módulos y corregir las importaciones en `lib/runner.js`. *(Esfuerzo: 30 min)*.
3. **Métricas de cobertura nativa en `package.json` y CI**: Actualizar el script `test:unit` a `node --test --experimental-test-coverage scripts/unit-test.mjs` y publicarlo en el log de CI. *(Esfuerzo: 15 min)*.

### Top 3 Deudas Críticas
1. **Zero-coverage en `lib/routes.js` (861 líneas) y endpoints mutantes**: Toda la lógica transaccional de la API Express (instalación de plugins, modificación de watchlist, importación y settings) no tiene ningún test automatizado que prevenga regresiones.
2. **Zero-coverage en `lib/probes.js` (291 líneas)**: El motor de inspección de filesystem para VS Code, Claude Desktop, Cursor y directorios `.cline` no tiene pruebas unitarias con estructuras de archivos simuladas.
3. **Polución de estado en disco durante tests**: Los tests unitarios e integrados crean y modifican archivos en la carpeta real `data/` del repositorio, lo que puede corromper el estado del usuario local durante el desarrollo.

### Top 3 Oportunidades Estratégicas
1. **Suite de Integración con Directorio Temporal (`os.tmpdir()`)**: Diseñar una fixture compartida de testing que inicie el router de Express sobre un directorio aislado efímero, permitiendo probar mutaciones completas sin tocar archivos de producción.
2. **Mocks de Procesos para `runCline` y Simulación de Fallos de Red**: Implementar tests que simulen timeouts de procesos, respuestas no zero de CLI, fallos de API de GitHub (rate limits 403) y archivos JSON malformados en cuarentena.
3. **Smoke Tests E2E de CLI y Frontend**: Añadir pruebas que ejecuten `bin/cline-marketplace.js --help` y validen con un browser headless que `index.html` inicializa correctamente los 250+ items del catálogo.

---

### Verificación y Métodos de Reproducción

Para verificar de manera independiente todos los hallazgos de este reporte:

1. **Ejecutar suite de tests oficial:**
   ```bash
   npm test
   ```
2. **Ejecutar reporte de cobertura nativo:**
   ```bash
   node --test --experimental-test-coverage scripts/unit-test.mjs
   ```
3. **Verificar ausencia de aserciones en `smoke-test.mjs` (Líneas 64-67):**
   ```bash
   grep -n "resolveCommand" scripts/smoke-test.mjs
   ```
4. **Verificar duplicación de `isWindowsBatchShim`:**
   ```bash
   grep -n "function isWindowsBatchShim" lib/sanitizers.js lib/resolver.js
   ```
5. **Verificar mutación de disco en tests:**
   ```bash
   node scripts/smoke-test.mjs
   git status data/
   ```
