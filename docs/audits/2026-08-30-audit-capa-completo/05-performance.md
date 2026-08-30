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
