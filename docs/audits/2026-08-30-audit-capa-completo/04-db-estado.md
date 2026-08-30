# Capa 04: Almacenamiento de Datos & Estado

**Especialista Auditor:** Data Storage & State Specialist (Dimension 04)  
**Fecha de Auditoría:** 2026-08-30  
**Entorno de Verificación:** Node.js v22.17.0 | Windows 11 x64 (NTFS) | Express 5.x  
**Scope Auditado:** `catalog.json`, `data/installed.json`, `data/upstream-meta.json`, `data/watchlist.json`, `data/context-cache.json`, `data/user-settings.json`, `lib/state.js`, `lib/routes.js`, `lib/reconciler.js`, `lib/probes.js`, `scripts/refresh-catalog.mjs`.

---

## 1. Resumen Ejecutivo & Score

### Score: 7.5 / 10

### Justificación del Score:
ClineMarket presenta una base arquitectónica orientada a la seguridad de datos con persistencia atómica (`.tmp` + `renameSync`), respaldos en cuarentena (`.corrupt.<timestamp>`) ante fallos de parseo JSON y una cola de serialización por promesas en `lib/state.js`. No obstante, la auditoría empírica reveló vulnerabilidades críticas y de severidad alta:
1. **Destrucción silenciosa de datos históricos**: Al ejecutar `refresh-catalog.mjs` sin token de GitHub o ante *rate limiting*, el script sobreescribe `data/upstream-meta.json` con `{}` borrando los metadatos de commits de 202 extensiones.
2. **Fallas de concurrencia y colisiones en Windows (`EPERM`)**: La cola de escritura es puramente en memoria del proceso local; ante accesos concurrentes de múltiples procesos (CLI vs Servidor) o ráfagas rápidas en Windows NTFS, `renameSync` arroja `EPERM: operation not permitted` por falta de bucle de reintentos con backoff.
3. **Pérdida de metadatos raíz en reconciliación**: `reconciler.js` descarta `version` y `lastScanAt` de `data/installed.json`, degradando el esquema a un objeto simple `{ items }`.
4. **I/O síncrono no cacheado en lectura**: El catálogo de 196 KB se lee y parsea de forma síncrona en cada petición GET a `/api/catalog`, `/api/status`, `/api/health`, `/api/stats`, bloqueando el bucle de eventos (~1 ms por request vs 0.02 ms con mtime cache).

---

## 2. Métricas Empíricas de la Capa de Datos

| Métrica | Valor Empírico | Método / Comando de Verificación |
|---|---|---|
| **Tamaño Catálogo Maestro (`catalog.json`)** | 196,161 bytes (191.5 KB) | `fs.statSync('catalog.json').size` |
| **Total de Entradas en Catálogo** | 202 entradas (149 MCPs, 38 Skills, 15 Plugins) | Validación de esquema JSON empírico |
| **Integridad de Claves Únicas** | 202/202 únicas (0 duplicados) | Test de Set de claves (`type:id`) |
| **Tiempo de Lectura Síncrona (1,000 reqs)** | 986.50 ms (~0.98 ms/req bloqueante) | Benchmark `test-catalog-read-cost.mjs` |
| **Tiempo de Lectura con Mtime Cache (1,000 reqs)** | 24.60 ms (~0.02 ms/req no bloqueante) | Benchmark `test-catalog-read-cost.mjs` (40x más veloz) |
| **Colisiones de Concurrencia Multi-proceso** | 3 errores `EPERM` en 120 escrituras paralelas | Test `test-concurrency.mjs` (3 procesos Node paralelos) |
| **Tamaño `data/installed.json`** | 51,069 bytes (58 items registrados) | Inspección de disco |
| **Tamaño `data/upstream-meta.json`** | 37,104 bytes (202 registros de commit) | Inspección de disco |
| **Cobertura de Backup Cuarentena** | Implementado en `readJson` (`.corrupt.<ts>`) | Verificado en `lib/state.js:26-31` |
| **Esquema formal / Migración de Versión** | Inexistente (sin validador formal ni migradores) | Inspección de código global |

---

## 3. Matriz Completa de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (Comando + Output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Crítica** | Destrucción total de `data/upstream-meta.json` al ejecutar `refresh` sin token de GitHub o por rate-limit | `scripts/refresh-catalog.mjs:210-214, 296-298` | `node -e "import('./scripts/refresh-catalog.mjs')"`<br>Si `!githubToken`, `fetchMeta` retorna `{}` y la línea 297 ejecuta `writeFileSync(join(dataDir, 'upstream-meta.json'), JSON.stringify({}, null, 2))`, borrando los 202 registros históricos de commits. | Cargar la metadata previa existente (`readJson`), hacer merge incremental (`Object.assign(existing, newMeta)`) y no sobreescribir con objeto vacío si la consulta fue omitida o falló. | 25 min |
| 2 | **Alta** | Ausencia de locking inter-proceso y fallas por `EPERM` en `safeWriteJson` ante escrituras concurrentes o ráfagas en Windows | `lib/state.js:8, 50-65` | `node .agents/audit_04_db_estado/test-concurrency.mjs`<br>`[ERROR] Atomic write failed for ...: EPERM: operation not permitted, rename ...` (3 fallos al escribir 3 procesos en paralelo). | Implementar bucle de reintento con backoff exponencial/jitter (hasta 8 reintentos con delay de 10-50ms) en `safeWriteJson` para atrapar `EPERM`/`EBUSY` en Windows o integrar `proper-lockfile` / `write-file-atomic`. | 35 min |
| 3 | **Alta** | Eliminación destructiva de metadata de primer nivel (`version`, `lastScanAt`) en `data/installed.json` durante la reconciliación | `lib/reconciler.js:10-15, 60`<br>`lib/routes.js:237, 458, 655, 844` | `node -e "import('./lib/reconciler.js').then(m => console.log(m.reconcile({ version: '1.0.0', lastScanAt: 'now', items: {} }, { found: { plugins: new Map(), skills: new Map(), mcps: new Map() } })))"`<br>Output: `{ items: {} }` (las claves `version` y `lastScanAt` son eliminadas del retorno). | En `reconciler.js`, preservar propiedades raíz: `return { ...state, version: state?.version || "1.0.0", lastScanAt: now, items: nextItems };`. | 15 min |
| 4 | **Alta** | Sobreescritura no atómica y sin validación de esquema en `refresh-catalog.mjs` (`catalog.json` y `catalog-prev.json`) | `scripts/refresh-catalog.mjs:283, 287, 297` | `writeFileSync(cur, JSON.stringify(catalog, null, 2));`<br>Si la conexión falla o el CDN devuelve un error HTML o JSON vacío, se escribe directamente sobre `catalog.json` sin validar que `Array.isArray(catalog.entries)` y sin atomicidad (`.tmp`). | Validar el esquema mínimo (`Array.isArray(catalog?.entries) && catalog.entries.length > 0`) antes de persistir, y utilizar `safeWriteJson` atómico. | 25 min |
| 5 | **Media** | I/O de disco síncrono y bloqueo del Event Loop en cada request de lectura (`loadCatalog` / `loadInstalled`) | `lib/routes.js:22-24, 120, 293, 371, 723, 784`<br>`lib/state.js:20` | Benchmark `test-catalog-read-cost.mjs`:<br>1,000 lecturas síncronas de 196 KB consumen 986.5 ms de CPU bloqueante frente a 24.6 ms con mtime cache (penalización 40x). | Crear una capa de cache singleton en memoria para `catalog.json` con verificación de `mtimeMs` de archivo, evitando lecturas y parseos redundantes en cada GET. | 30 min |
| 6 | **Media** | Escritura en disco en request GET `/api/context` (operación no idempotente / I/O thrashing) | `lib/routes.js:225-230` | `router.get("/context", (req, res) => { ... safeWriteJson(CONTEXT_PATH, contextInfo).catch(() => {}); res.json(contextInfo); });`<br>Cualquier polling o apertura de pestañas dispara escrituras de disco en `data/context-cache.json` en operaciones GET. | Mantener el contexto en memoria o aplicar dirty-checking comparando el hash/JSON del contexto previo antes de invocar `safeWriteJson()`. | 20 min |
| 7 | **Media** | Ausencia de fallback automático a `data/catalog-prev.json` ante corrupción o falta de `catalog.json` | `lib/routes.js:22-24, 120, 371-376` | Si `catalog.json` se corrompe, `loadCatalog()` retorna `null` y `/api/catalog` sirve `entries: []`, a pesar de que `data/catalog-prev.json` está intacto en disco. | En `loadCatalog()`, si `readJson(CATALOG_PATH)` falla o es nulo, intentar leer automáticamente `readJson(PREV_CATALOG_PATH)` con log de advertencia. | 15 min |
| 8 | **Media** | Acumulación potencial de promesas en `_writeQueues` y crecimiento no acotado de `_metaCache` | `lib/state.js:8, 50, 64`<br>`lib/probes.js:9, 112, 140` | En `lib/state.js:64`, `_writeQueues.set(canonicalPath, currentOp.catch(() => {}))` nunca elimina las entradas del mapa al resolver. En `lib/probes.js`, `_metaCache` almacena rutas sin política de desalojo (LRU). | Eliminar la entrada del Map cuando la cola se drene (`if (pending === 0) _writeQueues.delete(path)`) y limitar `_metaCache` a un máximo de 500 entradas mediante LRU. | 25 min |
| 9 | **Baja** | Inconsistencia de campos y falta de versión de esquema en `data/watchlist.json` y `data/user-settings.json` | `lib/routes.js:35, 43, 260-266, 563` | `data/watchlist.json` (`{"items":[]}`) y `data/user-settings.json` carecen del campo `"version"` y de validación de los objetos internos de `recentWorkspaces`. | Normalizar la estructura con `"version": "1.0.0"` y validar el schema de items en los endpoints correspondientes. | 15 min |
| 10 | **Baja** | Operaciones I/O síncronas (`writeFileSync`, `renameSync`, `readFileSync`) dentro de wrappers asíncronos | `lib/state.js:3, 20, 55, 56` | `import { readFileSync, writeFileSync, renameSync } from "node:fs";` bloquea el thread principal de Node.js durante la serialización a disco. | Migrar a `node:fs/promises` (`readFile`, `writeFile`, `rename`, `unlink`) para I/O 100% no bloqueante. | 30 min |

---

## 4. Análisis Detallado de Dimensiones Críticas

### 4.1 Estructura e Integridad de `catalog.json`
- **Estructura del archivo**:
  - Propiedades raíz: `version` (1), `generatedAt` ("2026-06-19T18:20:28.065Z"), `baseUrl`, `counts` (`{ total: 202, mcps: 149, plugins: 15, skills: 38 }`), `tags` (12 categorías), `entries` (202 elementos).
  - Todas las 202 entradas poseen `type`, `id`, `name`, `description`, `author`, `tags`, `install.command`.
  - No se detectaron IDs duplicados ni campos nulos en el archivo actual.
- **Riesgos de corrupción**:
  - `scripts/refresh-catalog.mjs` escribe directamente con `writeFileSync` sin validar el payload entrante de red ni usar archivo temporal.
  - La aplicación no implementa validación con JSON Schema (ej. Zod o Ajv); si un elemento carece de `install` o `tags`, métodos como `analyzeWorkspaceContext` o `/api/stats` pueden fallar con `TypeError`.

### 4.2 Concurrencia de Lectura/Escritura & Mecanismos de Locking
- **In-Memory vs Multi-Proceso**:
  - `_writeQueues` en `lib/state.js` solo sincroniza promesas dentro del mismo proceso Node.js.
  - Cuando el CLI ejecuta `npx cline-marketplace refresh` o un proceso secundario interactúa con el servidor Express, ambos acceden a los mismos archivos JSON (`catalog.json`, `installed.json`, `upstream-meta.json`) sin ningún lock inter-proceso (flock / lockfile).
- **Comportamiento en Windows NTFS**:
  - En Windows, `renameSync` sobre un archivo existente arroja `EPERM` si el archivo destino está siendo indexado o sincronizado transitoriamente.
  - En la prueba empírica `test-concurrency.mjs` con 3 procesos paralelos, se registraron 3 excepciones `EPERM: operation not permitted` no recuperadas.

### 4.3 Estado en Memoria vs Estado en Disco & Ciclo de Vida
- **Sincronización y Caching**:
  - `loadCatalog()` no utiliza caché en memoria. Cada petición HTTP a `/api/catalog`, `/api/status`, `/api/health`, `/api/stats` y `/api/changelog` realiza `readFileSync` de 196 KB y parsea el árbol de objetos completo.
  - El benchmark empírico demostró que el caché por `mtime` reduce el tiempo acumulado de 986.5 ms a 24.6 ms (mejora de 40x).
- **Fuga de Recursos & Retención de Memoria**:
  - `_writeQueues` retiene promesas encadenadas indefinidamente en el Map.
  - `_metaCache` en `lib/probes.js` carece de límite de tamaño o política LRU, acumulando referencias a todos los directorios y archivos `package.json` sondeados.

### 4.4 Backup, Recuperación y Migración de Esquemas
- **Mecanismo de Cuarentena**:
  - `readJson` en `lib/state.js` crea un archivo `p.corrupt.<timestamp>` si el JSON está malformado.
  - Sin embargo, no existe un flujo de restauración automática ni comando de rollback: la aplicación inicializa el estado con el fallback vacío (`{ items: {} }`), y las rutas posteriores (como `/api/installed`) sobreescriben el archivo principal en disco con el estado vacío, perdiendo el historial original.
- **Estrategia de Migración**:
  - No existen migradores de versión para `catalog.json` (v1 -> v2) ni para los archivos de configuración local (`watchlist.json`, `user-settings.json`).

---

## 5. Quick Wins, Deudas Críticas y Oportunidades Estratégicas

### 3 Quick Wins (Implementación Inmediata < 1h)
1. **Preservar `version` y `lastScanAt` en `reconciler.js`**: Modificar el retorno de `reconcile()` a `return { ...state, version: state?.version || "1.0.0", lastScanAt: now, items: nextItems };`. (15 min)
2. **Merge defensivo de metadata en `refresh-catalog.mjs`**: Evitar que `upstream-meta.json` se sobreescriba con `{}` cuando se omita o falle la consulta de GitHub. (20 min)
3. **Fallback a `catalog-prev.json` en `loadCatalog()`**: Permitir que el servidor cargue `catalog-prev.json` si `catalog.json` está ausente o corrupto. (15 min)

### 3 Deudas Críticas (Prioridad Alta)
1. **Bucle de reintentos con backoff en `safeWriteJson`**: Añadir manejo resiliente de `EPERM`/`EBUSY` para evitar fallos de escritura en Windows y entornos multi-proceso. (35 min)
2. **Atomicidad y validación de esquema en `refresh-catalog.mjs`**: Reemplazar `writeFileSync` directo por validación rigurosa de esquema y `safeWriteJson`. (25 min)
3. **Caché en memoria con invalidación por `mtime` para `catalog.json`**: Eliminar el I/O de disco síncrono bloqueante en las rutas de lectura frecuentes de Express. (30 min)

### 3 Oportunidades Estratégicas (Evolución Arquitectónica)
1. **Migración a SQLite embebido o motor estructurado ligero**: Reemplazar archivos JSON individuales por una base de datos embebida (ej. `better-sqlite3` o `node:sqlite`), obteniendo transaccionalidad ACID nativa, locking inter-proceso robusto y consultas indexadas ultrarrápidas.
2. **Esquemas formales con Zod y Migradores Declarativos**: Implementar validación en tiempo de ejecución para todas las entradas del catálogo y estados locales, con migración declarativa automática ante incrementos de versión de esquema.
3. **Sistema de Snapshots y Rollback Transaccional**: Incorporar comandos de CLI (`cline-marketplace backup / restore`) y rotación automática de backups para recuperación instantánea ante desastres.
