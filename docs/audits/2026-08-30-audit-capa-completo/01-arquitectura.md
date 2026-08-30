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
