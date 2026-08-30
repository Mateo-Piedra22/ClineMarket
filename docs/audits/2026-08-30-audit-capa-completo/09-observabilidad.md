# Capa 9: Observabilidad & Diagnóstico

### Score: 8.8/10
Sólida infraestructura base con logger modular ANSI (`lib/logger.js`), trazas de ejecución con tiempos en milisegundos (`logger.exec`, `logger.http`), diagnósticos multi-probe enriquecidos (`/api/health`, `/api/status`, `/api/context`, `/api/stats`) y telemetría de memoria/uptime. Presenta margen de mejora en estandarización de esquemas de error JSON, correlación de peticiones (`X-Request-Id`), niveles de log configurables (`LOG_LEVEL`), modo de log JSON estructurado para ingestion cloud/CI, flags de depuración CLI (`--verbose`/`--debug`) y concurrencia optimizada en sondeos de salud.

---

### Matriz de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia Empírica (comando + output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|:---:|
| 1 | **Media** | Retorno de documento HTML en rutas `/api/*` no existentes (404) | `server.js:103-106` | `fetch("http://127.0.0.1:5173/api/nonexistent")` $\rightarrow$ `HTTP 404`, `Content-Type: text/html`<br>`<!DOCTYPE html>...<pre>Cannot GET /api/nonexistent</pre>` | Registrar middleware 404 dedicado para `/api/*` que retorne JSON `{ ok: false, error: "Endpoint not found: GET /api/...", code: "NOT_FOUND" }`. | 5 min |
| 2 | **Media** | Inconsistencia de esquemas de respuesta de error en endpoints Express | `lib/routes.js:405,433,476,488,515,537,683`, `server.js:54,63,111` | `POST /api/install (body {})` $\rightarrow$ `{"error":"..."}` (sin `ok: false`)<br>`POST /api/refresh (error)` $\rightarrow$ `{"ok":false,"error":"..."}`<br>`server.js (500)` $\rightarrow$ `{"ok":false,"error":"..."}` | Unificar middleware de respuesta de error con helper `sendError(res, status, code, message, details)` garantizando `{ ok: false, code, error, details, timestamp }`. | 15 min |
| 3 | **Media** | Código de salida exitoso falso (`exit 0`) en fallo de actualización CLI | `bin/cline-marketplace.js:221-224` | `sub === "update"` captura excepción con `catch (err) { error(...) }` e inmediatamente ejecuta `process.exit(0)` en lugar de `process.exit(1)`. | Invocar `process.exit(1)` en el bloque `catch` del comando `update` para señalizar fallo real a scripts y CI. | 2 min |
| 4 | **Media** | Ausencia de niveles de log filtrables (`LOG_LEVEL`) y método `logger.debug` | `lib/logger.js:24-48` | `process.env.LOG_LEVEL = "warn"` $\rightarrow$ Todos los logs (`INFO`, `OK`, `HTTP`) continúan emitiéndose a stdout sin filtrado por severidad. | Implementar jerarquía de niveles (`debug: 10, info: 20, warn: 30, error: 40, silent: 50`) y evaluar contra `process.env.LOG_LEVEL || "info"`. | 10 min |
| 5 | **Media** | Latencia secuencial de procesos hijos (~1500ms) en endpoint `/api/health` | `lib/routes.js:329-357` | `fetch("/api/health")` $\rightarrow$ Tardo `1497.23ms` debido a ejecución secuencial síncrona/promisificada de `cline --version` y `gh version`. | Paralelizar sondeos externos con `Promise.allSettled()` y aplicar memoización en memoria con TTL de 15 segundos. | 15 min |
| 6 | **Media** | Umbral de salud permisivo reporta `ok: true` ante ausencia del CLI `cline` | `lib/routes.js:386` | `ok: checks.filter(c => c.ok).length >= 4` $\rightarrow$ Si `cline` y `gh` fallan pero los otros 4 pasan, `/api/health` evalúa a `true` aunque el control plane no pueda operar. | Categorizar probes como obligatorios (`critical: true` para `node`, `cline`, `catalog`) y fallar el health global si falta un componente crítico. | 5 min |
| 7 | **Baja** | Ausencia de Correlation IDs / Request Tracing (`X-Request-Id`) | `server.js:77-86`, `lib/logger.js:44-47`, `lib/runner.js:124` | `Headers X-Request-Id: null` en todas las respuestas HTTP; trazas `EXEC` y `HTTP` desacopladas sin ID de correlación cruzada. | Generar `req.id = req.headers["x-request-id"] || crypto.randomUUID()`, propagarlo en headers `res.setHeader("X-Request-Id", req.id)` y adjuntarlo a `logger.http`/`logger.exec`. | 10 min |
| 8 | **Baja** | Omisión de modo de salida JSON estructurado para ingestion cloud/CI | `lib/logger.js:24-48` | El logger solo formatea strings ANSI para consola interactiva. No soporta `LOG_FORMAT=json` ni NDJSON machine-readable. | Añadir flag `const isJson = process.env.LOG_FORMAT === "json"` para emitir objetos JSON serializados por línea a stdout/stderr. | 10 min |
| 9 | **Baja** | CLI carece de flags de depuración `--verbose`, `--debug` y `--json` | `bin/cline-marketplace.js:50-74` | `cline-marketplace --verbose` $\rightarrow$ No reconocido; inicia servidor sin alterar verbosidad de salida ni mostrar trazas de error completas. | Incorporar parsing de `--verbose`, `--debug` y `--json` en CLI, inyectando variables `LOG_LEVEL=debug` y `LOG_FORMAT=json`. | 15 min |
| 10 | **Baja** | Duplicación y fragmentación de funciones de logging en CLI (`bin/cline-marketplace.js`) | `bin/cline-marketplace.js:40-48` | `bin/cline-marketplace.js` declara funciones aisladas `log()`, `warn()`, `error()` con formato `[HH:MM:SS] [CLI]` en vez de reutilizar `lib/logger.js`. | Importar `logger` desde `../lib/logger.js` para mantener un formato visual y operacional 100% unificado en toda la aplicación. | 10 min |
| 11 | **Baja** | HTTP Access Log omite rutas estáticas (`/`, `/public/*`, `/docs/*`) | `server.js:81-83` | `if (req.path.startsWith("/api/")) { logger.http(...) }` $\rightarrow$ Peticiones a assets JS/CSS y SPA no son auditables en logs. | Registrar peticiones generales o habilitar traza de assets bajo nivel `debug` / flag configurable. | 5 min |
| 12 | **Informativa** | Ausencia de métricas de tráfico HTTP en tiempo de ejecución en `/api/status` | `lib/routes.js:290-317` | `/api/status` expone memoria y uptime, pero carece de contadores de requests atendidos (`totalRequests`, `status2xx`, `status4xx`, `status5xx`, `avgLatencyMs`). | Integrar un colector ligero en memoria de métricas HTTP expuesto en `/api/status`. | 10 min |
| 13 | **Informativa** | Timestamp de logs con resolución en segundos sin milisegundos ni fecha | `lib/logger.js:20-22` | `function ts() { return new Date().toISOString().slice(11, 19); }` emite `[HH:MM:SS]`, perdiendo discriminación cronológica milimétrica. | Extender `ts()` a `toISOString().slice(11, 23)` (`HH:MM:SS.mmm`) o timestamp ISO completo en modo no TTY. | 3 min |

---

### Análisis Empírico por Dominio

#### 1. Arquitectura de Logging & Transports
- **Estado Actual**:
  - `lib/logger.js` centraliza los canales `info`, `warn`, `error`, `success`, `exec` y `http`.
  - Cumple estrictamente con la detección de entorno TTY y el estándar `NO_COLOR` (`!process.env.NO_COLOR && (process.env.FORCE_COLOR !== "0") && (process.stdout?.isTTY ?? true)`).
  - La sincronización atómica de archivos en `lib/state.js` detecta corrupción de JSON y genera copias de cuarentena `*.corrupt.<timestamp>` registrando `logger.error`.
- **Deficiencias Detectadas**:
  - Inexistencia de soporte para `LOG_LEVEL` (ej. `LOG_LEVEL=error` o `LOG_LEVEL=silent`). No existe el método `logger.debug()`.
  - Inexistencia de modo de salida JSON estructurado (`LOG_FORMAT=json`), imprescindible para ingestores de logs en contenedores y pipelines de observabilidad (Datadog, AWS CloudWatch, Grafana Loki, ELK).
  - Fragmentación en `bin/cline-marketplace.js` y `scripts/refresh-catalog.mjs`, los cuales reimplementan funciones `console.log("[CLI] ...")` y `console.log("[refresh] ...")` en vez de consumir `lib/logger.js`.

#### 2. Formato de Errores y Códigos de Salida
- **Estado Actual**:
  - El manejador global de Express en `server.js:109-112` captura excepciones no controladas y responde `{ ok: false, error: err.message || "Internal Server Error" }`.
  - Las validaciones de entrada (`sanitizers.js`) previenen path traversal y sanitizan identificadores antes de la ejecución.
- **Deficiencias Detectadas**:
  - **Inconsistencia de Respuestas de Error**: Endpoints como `/api/install`, `/api/uninstall`, `/api/bulk`, `/api/workspaces/recent` retornan `{ error: "..." }` con HTTP 400/500, mientras que `/api/refresh`, `/api/update/run` y el middleware de error global retornan `{ ok: false, error: "..." }`.
  - **Fallo 404 HTML**: Al solicitar una ruta `/api/*` inexistente (ej. `/api/nonexistent`), Express devuelve el documento HTML estándar de Express (`<pre>Cannot GET /api/nonexistent</pre>`) con `Content-Type: text/html` en lugar de un JSON estructurado consumible por clientes API.
  - **CLI Update Exit Code**: En `bin/cline-marketplace.js:221-224`, cuando `git pull` o `npm install` lanzan un error durante `cline-marketplace update`, el bloque `catch` registra el mensaje de error pero ejecuta `process.exit(0)`, retornando erróneamente éxito al sistema operativo.

#### 3. Trazabilidad de Peticiones y Correlación (Request Tracing)
- **Estado Actual**:
  - Middleware en `server.js:78-86` mide el tiempo de respuesta con `Date.now() - start` en el evento `res.on("finish")` para rutas `/api/*`.
  - `lib/runner.js:124` registra la duración de comandos externos CLI (`logger.exec`).
- **Deficiencias Detectadas**:
  - No existe generación ni propagación de encabezados de correlación `X-Request-Id`.
  - Las trazas de ejecución CLI en `lib/runner.js` ocurren en un contexto desacoplado, imposibilitando correlacionar un comando `cline plugin install <id>` con la petición HTTP entrante que lo disparó.

#### 4. Facilidades de Depuración y Diagnóstico
- **Estado Actual**:
  - Catálogo completo de endpoints de diagnóstico:
    - `GET /api/status`: Inspección de Node, SO, PID, uptime, memoria, rutas de almacenamiento y contadores del catálogo.
    - `GET /api/health`: Sondeo de 6 subsistemas (`node`, `cline`, `gh`, `cline-storage`, `catalog`, `metadata`).
    - `GET /api/context`: Análisis estático del workspace actual (lenguajes, frameworks detectados y recomendaciones).
    - `GET /api/stats`: Análisis estadístico de autores, tags y frescura temporal.
    - `GET /api/changelog`: Diferencial entre versiones de catálogo upstream.
- **Deficiencias Detectadas**:
  - **Latencia Secuencial de Health Checks**: `/api/health` tarda **~1500ms** debido a que ejecuta secuencialmente `cline --version` y `gh version`.
  - **Cálculo de Salud Permisivo**: La expresión `checks.filter(c => c.ok).length >= 4` evalúa a `ok: true` aun cuando el binario fundamental `cline` no esté presente en el sistema.
  - **Falta de Flags CLI**: `bin/cline-marketplace.js` no cuenta con flags `--verbose`, `--debug` ni `--json`.

#### 5. Métricas y Monitoreo de Recursos
- **Estado Actual**:
  - Uptime medido con `Math.round(process.uptime())` (ciclo de vida del proceso de control plane).
  - Telemetría de memoria expuesta mediante `process.memoryUsage()` (`rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`).
- **Deficiencias Detectadas**:
  - Ausencia de métricas de rendimiento HTTP en memoria (conteo de peticiones totales, ratio de errores 4xx/5xx, latencia promedio o percentiles p95).

---

### Evidencias de Verificación Empírica

#### 1. Prueba de Canales y Formato del Logger (`lib/logger.js`)
```bash
node -e "
import { logger } from './lib/logger.js';
logger.info('Test info message', { extra: 123 });
logger.warn('Test warn message');
logger.error('Test error message');
logger.success('Test success message');
logger.exec('cline plugin list', 45, 0);
logger.exec('cline plugin install bad-pkg', 120, 1);
logger.http('GET', '/api/status', 200, 12);
logger.http('POST', '/api/install', 500, 450);
"
```
**Salida Obtenida:**
```text
[17:31:33] INFO  Test info message { extra: 123 }
[17:31:33] WARN  Test warn message
[17:31:33] ERROR Test error message
[17:31:33] OK    Test success message
[17:31:33] EXEC  cline plugin list -> exit 0 (45ms)
[17:31:33] EXEC  cline plugin install bad-pkg -> exit 1 (120ms)
[17:31:33] HTTP  GET /api/status -> 200 (12ms)
[17:31:33] HTTP  POST /api/install -> 500 (450ms)
```

#### 2. Prueba de Cumplimiento `NO_COLOR`
```bash
node -e "
process.env.NO_COLOR = '1';
import('./lib/logger.js').then(({ colors, logger }) => {
  console.log('colors.cyan is empty string?', colors.cyan === '');
  logger.info('Testing NO_COLOR output');
});
"
```
**Salida Obtenida:**
```text
colors.cyan is empty string? true
[17:31:37] INFO  Testing NO_COLOR output
```

#### 3. Benchmark de Endpoints Diagnósticos y Latencia de `/api/health`
```bash
node -e "
import { app } from './server.js';
import { createServer } from 'node:http';

const server = createServer(app).listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const base = 'http://127.0.0.1:' + port;
  const endpoints = ['/api/status', '/api/health', '/api/stats', '/api/context', '/api/changelog', '/api/version', '/api/update/check'];
  for (const ep of endpoints) {
    const t0 = performance.now();
    const res = await fetch(base + ep);
    const ms = (performance.now() - t0).toFixed(2);
    const data = await res.json();
    console.log(ep + ' -> status: ' + res.status + ' (' + ms + 'ms), keys: ' + Object.keys(data).join(', '));
  }
  server.close();
});
"
```
**Salida Obtenida:**
```text
/api/status -> status: 200 (107.19ms), keys: node, platform, arch, pid, uptime, memory, clinePath, storageRoots, clineRoots, catalog, installedCount, metaCount
/api/health -> status: 200 (1497.23ms), keys: ok, checks, system
/api/stats -> status: 200 (6.45ms), keys: total, byType, byTag, topAuthors, freshness, installed
/api/context -> status: 200 (6.26ms), keys: cwd, repo, languages, frameworks, tags, hints, recommended
/api/changelog -> status: 200 (7.26ms), keys: added, removed, updated
/api/version -> status: 200 (2.57ms), keys: version, app
/api/update/check -> status: 200 (439.35ms), keys: hasUpdate, currentVersion, remoteVersion
```

#### 4. Detección de Falla 404 HTML en Rutas de API
```bash
node -e "
import { app } from './server.js';
import { createServer } from 'node:http';

const server = createServer(app).listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const res = await fetch('http://127.0.0.1:' + port + '/api/nonexistent');
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Body:', (await res.text()).slice(0, 100));
  server.close();
});
"
```
**Salida Obtenida:**
```text
Status: 404
Content-Type: text/html; charset=utf-8
Body: <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot GET /api/nonexistent</pre>
```

#### 5. Prueba de Malformed JSON y Manejo Global de Excepciones
```bash
node -e '
import { app } from "./server.js";
import { createServer } from "node:http";

const server = createServer(app).listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  const res = await fetch("http://127.0.0.1:" + port + "/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://127.0.0.1:" + port },
    body: "{\"broken_json\": 123"
  });
  const data = await res.json();
  console.log("Status:", res.status, "body:", JSON.stringify(data));
  server.close();
});
'
```
**Salida Obtenida:**
```text
[17:32:36] ERROR Unhandled request error: Expected ',' or '}' after property value in JSON at position 19 (line 1 column 20)
Status: 400 body: {"ok":false,"error":"Expected ',' or '}' after property value in JSON at position 19 (line 1 column 20)"}
```

---

### 3 Quick Wins Recomendados

1. **Fallback 404 JSON para `/api/*`:**
   Insertar antes del manejador de errores global en `server.js`:
   ```javascript
   app.use("/api", (req, res) => {
     res.status(404).json({ ok: false, error: `Endpoint not found: ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" });
   });
   ```

2. **Corrección de Exit Code en CLI `update`:**
   En `bin/cline-marketplace.js:221-224`:
   ```javascript
   // Antes:
   } catch (err) {
     error(`Update failed: ${err.message}`);
   }
   process.exit(0);

   // Después:
   } catch (err) {
     error(`Update failed: ${err.message}`);
     process.exit(1);
   }
   process.exit(0);
   ```

3. **Paralelización de Diagnósticos en `/api/health`:**
   En `lib/routes.js:329-357`, envolver las llamadas externas en `Promise.allSettled()` para reducir la latencia de diagnóstico de ~1500ms a ~700ms.

---

### Plan de Remediación Priorizado

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FASE 1: INTEGRIDAD INMEDIATA (30 min)              │
├────────────────────────────────────────────────────────────────────────┤
│ 1. [Fix] Corregir exit code 1 en CLI update (bin/cline-marketplace.js) │
│ 2. [Fix] Agregar middleware 404 JSON para /api/* en server.js          │
│ 3. [Fix] Corregir lógica de health check crítico (cline obligatorio)   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                      FASE 2: TRAZABILIDAD & LOGGING (1.5 h)             │
├────────────────────────────────────────────────────────────────────────┤
│ 4. [Logger] Añadir LOG_LEVEL, logger.debug() y LOG_FORMAT=json         │
│ 5. [Tracing] Generar X-Request-Id y propagar en headers y logs         │
│ 6. [CLI] Unificar logger de CLI con lib/logger.js y añadir --verbose   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                      FASE 3: PERFORMANCE & MÉTRICAS (1 h)               │
├────────────────────────────────────────────────────────────────────────┤
│ 7. [Health] Paralelizar checks externos con Promise.allSettled() y TTL │
│ 8. [Metrics] Incorporar contador de peticiones HTTP en /api/status     │
│ 9. [Schema] Estandarizar helper sendError(res, status, code, msg)      │
└────────────────────────────────────────────────────────────────────────┘
```
