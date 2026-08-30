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
