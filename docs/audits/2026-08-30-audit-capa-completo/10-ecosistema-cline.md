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
