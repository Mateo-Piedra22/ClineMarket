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
