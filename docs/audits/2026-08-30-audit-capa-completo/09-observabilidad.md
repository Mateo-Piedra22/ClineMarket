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
