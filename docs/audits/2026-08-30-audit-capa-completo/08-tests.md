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
