# Capa 11: CLI Engine & Runtime Bridge

**Auditoría Especializada — Dimensión 11: CLI Engine & Runtime Bridge**  
**Fecha:** 2026-08-30  
**Proyecto:** ClineMarket (`cline-marketplace`)  
**Binario Principal:** `bin/cline-marketplace.js`  
**Controlador de Runtime:** `server.js` | `lib/runner.js` | `lib/resolver.js`  
**Score Objetivo:** **7.8 / 10**

---

## 1. Resumen Ejecutivo y Evaluación Global

La dimensión de **CLI Engine & Runtime Bridge** evalúa la robustez, portabilidad, ciclo de vida de procesos, interoperabilidad entre el binario de línea de comandos y el servidor de control plane, compatibilidad multiplataforma (Windows PowerShell / CMD / Linux / macOS) y la interacción con el CLI subyacente de `cline`.

### Aspectos Destacados (Fortalezas)
1. **Serialización de Comandos en Cola FIFO (`lib/runner.js:14, 132-134`)**: Implementación robusta de `_commandLock` mediante promesas encadenadas, garantizando que operaciones concurrentes sobre el backend de `cline` no colisionen ni corrompan el estado del filesystem.
2. **Manejo Especializado de Shims Multiplataforma (`lib/resolver.js:118-127`, `lib/runner.js:78-91`)**: Detección nativa de shims Windows (`.cmd`, `.bat`) con activación automática de `shell: true`, junto con búsqueda heurística en `where.exe` / `which` y directorios globales (`APPDATA`, `LOCALAPPDATA`, `scoop`, `chocolatey`, `cargo`, `homebrew`).
3. **Terminación Defensiva de Árbol de Procesos (`lib/runner.js:42-54`)**: Uso de `taskkill /pid ${proc.pid} /T /F` en Windows y escalado de `SIGTERM` a `SIGKILL` con temporizador de gracia en POSIX para prevenir procesos huérfanos.
4. **Detección Multi-Instancia y Loopback Probing (`bin/cline-marketplace.js:138-168, 248-276`)**: Detección inteligente de instancias activas preexistentes vía socket probe y HTTP GET `/api/status`, evitando el lanzamiento redundante de múltiples servidores locales.

### Áreas Críticas de Mejora (Debilidades)
1. **Manejo Incompleto de Argumentos CLI y Flags Estándar**: Ausencia del flag `--version` / `-v` (que provoca el arranque no deseado del servidor en lugar de imprimir la versión) y falta de validación de subcomandos desconocidos.
2. **Excepción No Controlada `RangeError` por Puerto Inválido (`bin/cline-marketplace.js:140`)**: `net.connect()` en `isPortOpen` carece de bloque `try/catch` y validación de rango `1-65535`, colapsando el CLI ante entradas fuera de rango.
3. **Código de Salida 0 en Fallo del Subcomando `update` (`bin/cline-marketplace.js:224`)**: Enmascara errores en scripts de automatización y pipelines CI/CD retornando éxito tras excepciones fatales.
4. **Desconexión en Colisión de Puertos entre CLI y Servidor (`bin/cline-marketplace.js:254-268` vs `server.js:126-155`)**: Si el puerto objetivo está ocupado por una app ajena, el servidor cambia a un puerto libre pero el CLI abre el navegador en el puerto colisionado original por falta de handshake/IPC.
5. **Permisos de Archivo en Git Index (`100644`) y Líneas CRLF en Scripts**: `bin/cline-marketplace.js` y `scripts/*.mjs` están registrados como no ejecutables en git, y `scripts/refresh-catalog.mjs` posee finales de línea CRLF que fallan en Linux/macOS.

---

## 2. Arquitectura del Runtime Bridge & CLI Engine

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                            CLI INVOCATION                               │
 │             npx cline-marketplace / node bin/cline-marketplace.js       │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
     [ CLI Flags / Subcommands ]                  [ IPC & Instance Probe ]
     --help / -h      --> Print Help & Exit       isPortOpen(port, host)
     --version / -v   --> [BUG: Missing!]         probeStatus(port, host)
     refresh          --> Run refresh script      ├─► Active: Attach & Open Browser
     update           --> git pull / npm update   └─► Inactive: Spawn server.js
     default          --> Bootstrap & Daemon
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                       EXPRESS 5 CONTROL PLANE                           │
 │                              server.js                                  │
 ├─────────────────────────────────────────────────────────────────────────┤
 │  • Dynamic Port Discovery (findAvailablePort)                           │
 │  • Loopback Binding (127.0.0.1) & Host Header Guards                    │
 │  • REST API Router (lib/routes.js)                                      │
 └──────────────────────┬────────────────────────────┬─────────────────────┘
                        │                            │
                        ▼                            ▼
 ┌────────────────────────────────────────┐ ┌──────────────────────────────┐
 │         COMMAND RESOLVER               │ │   SERIALIZED RUNNER QUEUE    │
 │          lib/resolver.js               │ │        lib/runner.js         │
 ├────────────────────────────────────────┤ ├──────────────────────────────┤
 │ • where.exe (Win) / which (POSIX)      │ │ • FIFO Queue (_commandLock)  │
 │ • Fallbacks (AppData, Scoop, Choco...) │ │ • isWindowsBatchShim (shell) │
 │ • isWindowsBatchShim (.cmd, .bat)      │ │ • Process Tree Kill          │
 └────────────────────────────────────────┘ └──────────────┬───────────────┘
                                                           │
                                                           ▼
                                            ┌──────────────────────────────┐
                                            │       CLINE BACKEND          │
                                            │      cline CLI Binary        │
                                            └──────────────────────────────┘
```

---

## 3. Matriz Consolidada de Hallazgos

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia Empírica | Solución Propuesta | Esfuerzo |
|---|---|---|---|---|---|---|
| **1** | **Alta** | Colapso por `RangeError` no capturado en `isPortOpen` ante puerto inválido | `bin/cline-marketplace.js:140` | `node bin/cline-marketplace.js --port 999999 --no-open` lanza `RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536` no capturado (Exit 1). | Validar rango de puerto (1-65535) y envolver `net.connect` en bloque `try/catch`. | 15 min |
| **2** | **Alta** | Subcomando `update` retorna código de salida `0` en caso de error fatal | `bin/cline-marketplace.js:224` | Inspección de `catch (err)` en línea 221-224 que captura el fallo pero ejecuta `process.exit(0)`. | Invocar `process.exit(1)` en el bloque `catch` para propagar el código de error al shell/CI. | 5 min |
| **3** | **Media** | Desconexión en negociación de puertos entre CLI y Express en colisiones | `bin/cline-marketplace.js:254-268` / `server.js:135-155` | Si el puerto está ocupado por un proceso ajeno, `server.js` selecciona 5174, pero CLI abre el navegador en 5173 (puerto ajeno). | Implementar handshake de puerto vía IPC (`process.send`) o parsing de banner stdout estructurado. | 30 min |
| **4** | **Media** | Ausencia de flags `--version` / `-v` e inexistencia de validación de subcomandos | `bin/cline-marketplace.js:64-74` | `node bin/cline-marketplace.js --version --no-open` arranca el servidor HTTP en lugar de imprimir versión y salir con 0. | Añadir parser para `--version`/`-v` y alertar con error 1 ante subcomandos desconocidos. | 20 min |
| **5** | **Media** | Falta de manejadores de parada elegante (`SIGINT`/`SIGTERM`) en Express | `server.js:135-163` | `server.js` no captura señales del SO para invocar `server.close()`, provocando corte abrupto de conexiones HTTP. | Implementar listener de `SIGINT`/`SIGTERM` con drenaje de sockets y cierre ordenado de colas de estado. | 25 min |
| **6** | **Media** | Modos de archivo no ejecutables (`100644`) en Git index y líneas CRLF en scripts | Git Index / `scripts/refresh-catalog.mjs:1` | `git ls-files -s bin/cline-marketplace.js` arroja `100644`. Script de refresh contiene bytes `\r\n`. | Ejecutar `git update-index --chmod=+x` y normalizar finales de línea a LF. | 10 min |
| **7** | **Media** | Rutas absolutas Windows hardcodeadas en scripts de captura y debug | `scripts/debug-browser.mjs:3` / `scripts/capture-screenshots.mjs:30` | `const CHROME_PATH = "C:\\Program Files\\..."` falla de inmediato en entornos macOS y Linux. | Utilizar resolución dinámica multiplataforma mediante `resolveCommand()`. | 15 min |
| **8** | **Baja** | Cobertura de tests automatizados nula para el binario CLI (`bin/cline-marketplace.js`) | `scripts/unit-test.mjs` / `scripts/smoke-test.mjs` | `npm test` ejecuta 8 tests unitarios y tests de API, pero 0 tests invocan `bin/cline-marketplace.js`. | Añadir suite de integración para banderas CLI (`--help`, `--version`, `--no-open`, códigos de salida). | 25 min |
| **9** | **Baja** | Ausencia de manejadores globales para `uncaughtException` y `unhandledRejection` | `bin/cline-marketplace.js:1-49` | Errores asíncronos imprevistos emiten traza no formateada de Node sin limpieza de procesos hijos. | Registrar `process.on('uncaughtException')` y `process.on('unhandledRejection')` formateados con logger. | 10 min |

---

## 4. Análisis Empírico Detallado

### 4.1 Binario Ejecutable y Empaquetado (`bin/cline-marketplace.js`)

#### Inspección del Shebang y `package.json`
El archivo `bin/cline-marketplace.js` inicia con el shebang estándar:
```javascript
// bin/cline-marketplace.js:1
#!/usr/bin/env node
```
En `package.json`, el campo `bin` se encuentra debidamente declarado:
```json
// package.json:7-9
"bin": {
  "cline-marketplace": "bin/cline-marketplace.js"
}
```
Sin embargo, al verificar el modo de archivo registrado en el índice de Git:
```bash
git ls-files -s bin/cline-marketplace.js server.js scripts/
```
**Output obtenido:**
```
100644 d28696e08054926581fc3071f3aed514a38a99b6 0 bin/cline-marketplace.js
100644 9e58daab3f9e72a2fe31ee9b2d84d9a054c252a9 0 server.js
100644 21855a908369539183c4d62fe0c85519f6b5cce7 0 scripts/refresh-catalog.mjs
100644 3ea2f4c450c4e03192ed958ec6fddcefc12ec196 0 scripts/smoke-test.mjs
100644 4900e7f9e7150298fc7aef159e93ea6151b11d03 0 scripts/unit-test.mjs
```
*Impacto:* En clones directos de Git en sistemas Linux/macOS, la ejecución directa `./bin/cline-marketplace.js` falla con `Permission denied (EACCES)`. Debe aplicarse `git update-index --chmod=+x bin/cline-marketplace.js`.

---

### 4.2 Análisis de Argumentos y Banderas de Línea de Comandos

#### Banderas Soportadas: `--help`, `-h`, `help`
Verificación empírica:
```bash
node bin/cline-marketplace.js --help
```
**Output obtenido (Exit code: 0):**
```
cline-marketplace — Local browser and control plane for Cline Marketplace primitives.

Usage:
  npx cline-marketplace               One-shot launch: prepare → start server → open browser
  cline-marketplace                   Standard CLI launch
  cline-marketplace --no-open         Start server without opening browser window
  cline-marketplace --port <n>        Specify server port (default: 5173 or next available)
  cline-marketplace update            Check for updates and pull latest version
  cline-marketplace refresh           Re-download catalog and refresh upstream metadata
  cline-marketplace refresh --catalog Fast catalog refresh (skip commit metadata)
  cline-marketplace help              Display this help message
```

#### Falla de Bandera `--version` / `-v` (Hallazgo #4)
Al ejecutar `node bin/cline-marketplace.js --version --no-open`:
```bash
node bin/cline-marketplace.js --version --no-open
```
**Output obtenido:**
```
[14:31:32] [CLI] Spawning server process on http://127.0.0.1:5173
┌──────────────────────────────────────────────────────────┐
│  Cline Marketplace Local Control Plane                   │
│  Local URL:   http://127.0.0.1:5173                      │
│  Catalog:     250+ Community & Custom Primitives         │
│  Security:    Defense-in-depth on 127.0.0.1 (Loopback)   │
└──────────────────────────────────────────────────────────┘
[14:31:33] [CLI] Browser launch skipped (--no-open). URL: http://127.0.0.1:5173
```
*Observación:* La línea de comandos ignora `--version` e inicia el servidor HTTP completo en lugar de imprimir `1.0.0` y terminar con código 0.

#### Falla de Validación de Puerto (Hallazgo #1)
Al ejecutar `node bin/cline-marketplace.js --port 999999 --no-open`:
```bash
node bin/cline-marketplace.js --port 999999 --no-open
```
**Output obtenido (Exit code: 1):**
```
node:net:1330
    validatePort(port);
    ^

RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536. Received type number (999999).
    at lookupAndConnect (node:net:1330:5)
    at Socket.connect (node:net:1285:5)
    at Object.connect (node:net:245:17)
    at file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:140:22
    at new Promise (<anonymous>)
    at isPortOpen (file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:139:10)
    at file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:248:13 {
  code: 'ERR_SOCKET_BAD_PORT'
}
```

#### Código de Salida en Subcomando `update` (Hallazgo #2)
Código en `bin/cline-marketplace.js:210-224`:
```javascript
if (sub === "update") {
  log("Checking for updates and pulling latest changes...");
  try {
    const gitDir = join(pkgRoot, ".git");
    if (existsSync(gitDir)) {
      await execFileP("git", ["pull", "origin", "main"], { cwd: pkgRoot });
      log("Updated from git successfully.");
    } else {
      await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "-g", "cline-marketplace@latest"]);
      log("Updated global package via npm.");
    }
  } catch (err) {
    error(`Update failed: ${err.message}`);
  }
  process.exit(0); // <-- ERROR: Sale con 0 incluso tras un error en catch!
}
```

---

### 4.3 Compatibilidad Multiplataforma (Windows / macOS / Linux)

#### 1. Separadores de Ruta y Resolución
- El proyecto utiliza consistentemente `node:path` (`join`, `resolve`, `dirname`).
- En `bin/cline-marketplace.js:18`, `join(pkgRoot, "scripts/refresh-catalog.mjs")` contiene un slash mixto que, aunque normalizado por Node.js, debe especificarse como `join(pkgRoot, "scripts", "refresh-catalog.mjs")`.

#### 2. Ejecución de Shims de Windows en Subprocesos (`lib/resolver.js` y `lib/runner.js`)
- En Windows, los paquetes globales de npm generan archivos shim `.cmd` o `.bat`. La invocación directa de `spawn("cline.cmd", args)` sin `shell: true` falla en Node.js con `EINVAL` o `ENOENT`.
- `lib/runner.js:78-91` implementa la mitigación adecuada:
```javascript
if (isBatch) {
  proc = spawn(exe, args, {
    cwd: targetCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: true,
  });
} else {
  proc = spawn(exe, args, {
    cwd: targetCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
```

#### 3. Apertura de Navegador Multiplataforma (`bin/cline-marketplace.js:194-208`)
- Se bifurca adecuadamente por plataforma:
  - Windows (`win32`): `cmd.exe /c start "" <url>`
  - macOS (`darwin`): `open <url>`
  - Linux: `xdg-open <url>`

---

### 4.4 Ciclo de Vida de Procesos y Señales del Sistema Operativo

#### Reenvío de Señales CLI -> Proceso Hijo
En `bin/cline-marketplace.js:189-191`:
```javascript
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
```
Esto asegura que si el usuario presiona `Ctrl+C` en la terminal del CLI, la señal se transmite al subproceso de `server.js`.

#### Ausencia de Graceful Shutdown en `server.js` (Hallazgo #5)
En `server.js`, la instancia del servidor HTTP Express:
```javascript
const server = app.listen(port, HOST, () => { ... });
```
No registra listeners para `SIGINT` o `SIGTERM`. Al recibir la señal, el runtime finaliza de forma inmediata sin permitir que las peticiones en curso terminen ni que se liberen sockets de manera controlada.

#### Terminación de Árboles de Procesos (`lib/runner.js:42-54`)
```javascript
function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {});
  } else {
    try {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2000);
    } catch {}
  }
}
```
Esto garantiza la eliminación completa de subprocesos colgados (por ejemplo, `cline` lanzado dentro de `cmd.exe`).

---

### 4.5 Runtime Bridge, IPC y Detección de Instancias

#### Detección Multi-Instancia
Al ejecutar una segunda instancia del CLI mientras el servidor está activo:
```bash
node bin/cline-marketplace.js --no-open
```
**Output obtenido (Exit code: 0):**
```
[14:31:44] [CLI] Port 5173 is active; probing existing instance...
[14:31:44] [CLI] Connected to active instance (202 entries loaded).
[14:31:44] [CLI] Browser launch skipped (--no-open). URL: http://127.0.0.1:5173
[14:31:44] [CLI] Existing instance active. CLI finished.
```
La detección funciona limpiamente conectándose a la instancia activa sin generar procesos duplicados.

#### Desincronización en Colisión de Puertos (Hallazgo #3)
Si el puerto 5173 está ocupado por un proceso ajeno:
1. `isPortOpen(5173)` es `true`.
2. `probeStatus(5173)` retorna `null`.
3. CLI emite `warn("Port 5173 is occupied... Starting on next available port...")`, pero llama `startServer(port, host)` con `port = 5173`.
4. `server.js` ejecuta `findAvailablePort(5173)` y se enlaza al puerto `5174`.
5. CLI ejecuta `openBrowser("http://127.0.0.1:5173")` abriendo el puerto ajeno en lugar del 5174.

---

## 5. Quick Wins, Deudas Críticas y Oportunidades Estratégicas

### 3 Quick Wins (< 30 minutos)
1. **Manejo de Bandera `--version` / `-v` (15 min)**:
   ```javascript
   if (process.argv.includes("--version") || process.argv.includes("-v")) {
     const pkg = JSON.parse(readFileSync(pkgJsonFile, "utf8"));
     console.log(`cline-marketplace v${pkg.version}`);
     process.exit(0);
   }
   ```
2. **Propagación de Código de Error en `update` (5 min)**:
   Modificar `bin/cline-marketplace.js:221-224` para ejecutar `process.exit(1)` en el bloque `catch`.
3. **Validación Defensiva de Rango de Puerto en CLI (10 min)**:
   Verificar `if (cliPort !== null && (Number.isNaN(cliPort) || cliPort < 1 || cliPort > 65535))` y mostrar error explicativo saliendo con código 1.

### 3 Deudas Críticas
1. **Handshake de Puerto Dinámico entre CLI y Express (`bin/cline-marketplace.js` / `server.js`)**:
   Implementar paso de mensaje IPC (`process.send({ type: 'ready', port: actualPort })`) cuando `server.js` se ejecuta como proceso hijo, permitiendo al CLI conocer exactamente el puerto asignado antes de invocar `openBrowser()`.
2. **Graceful Shutdown & Connection Draining en Express (`server.js`)**:
   Implementar cierre ordenado ante `SIGINT` / `SIGTERM` con `server.close()`, cancelación de timers activos y drenaje de la cola `_writeQueues` en `lib/state.js`.
3. **Normalización de Permisos Git Index (`+x`) y Líneas LF en Scripts**:
   Asegurar que todos los ejecutables en `bin/` y `scripts/` tengan modo `100755` en git y codificación LF estricta.

### 3 Oportunidades Estratégicas
1. **CLI Headless Operations (`cline-marketplace search|list|info|install`)**:
   Extender el CLI para permitir consultas y gestión directamente desde la terminal en modo headless/CI (vía REST loopback o módulos directos), sin requerir abrir el navegador.
2. **Soporte de Bandera `--host <ip>` y `--json`**:
   Permitir configurar la interfaz de red (`127.0.0.1`, `0.0.0.0`, `localhost`) mediante flag explícito y emitir respuestas en formato JSON para integración con herramientas externas.
3. **Diagnóstico Automatizado CLI (`cline-marketplace doctor`)**:
   Exponer el motor de `/api/health` directamente como comando de consola `cline-marketplace doctor` con formateo enriquecido en terminal.

---

## 6. Registro de Evidencias Empíricas

### E1: Ejecución de Suite de Tests Automatizados (`npm test`)
```bash
npm test
```
**Resultado:**
```
> cline-marketplace@1.0.0 test
> node --test scripts/unit-test.mjs && node scripts/smoke-test.mjs

TAP version 13
# Subtest: sanitizers: sanitizePrimitiveId
ok 1 - sanitizers: sanitizePrimitiveId
# Subtest: sanitizers: sanitizePrimitiveType
ok 2 - sanitizers: sanitizePrimitiveType
# Subtest: sanitizers: sanitizeWorkspacePath
ok 3 - sanitizers: sanitizeWorkspacePath
# Subtest: resolver: isWindowsBatchShim
ok 4 - resolver: isWindowsBatchShim
# Subtest: state: safeWriteJson and readJson serialization
ok 5 - state: safeWriteJson and readJson serialization
# Subtest: runner: verbFor maps primitive types correctly
ok 6 - runner: verbFor maps primitive types correctly
# Subtest: reconciler: correctly merges discovered primitives and detects drift
ok 7 - reconciler: correctly merges discovered primitives and detects drift
# Subtest: command resolver: resolves installed system binaries
ok 8 - command resolver: resolves installed system binaries
1..8
# tests 8, suites 0, pass 8, fail 0

==> Testing Command Resolver
  cline resolved to: C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  gh resolved to: C:\Program Files\GitHub CLI\gh.exe
==> Testing /api/status -> node: v22.17.0 platform: win32 uptime: 0 s
==> Testing /api/health -> [✓] node, [✓] cline (3.0.60), [✓] gh, [✓] cline-storage, [✓] catalog (202), [✓] metadata (202)
==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!
```

### E2: Prueba de Subcomando `refresh --catalog`
```bash
node bin/cline-marketplace.js refresh --catalog
```
**Resultado:**
```
[14:32:01] [CLI] Running catalog refresh...
[refresh] github token: detected (gho_rz7…)
[refresh] downloading catalog: https://cline.github.io/marketplace/catalog.json
[refresh] catalog: 202 entries (plugins 15, skills 38, mcps 149)
[refresh] rotated previous catalog -> catalog-prev.json
[refresh] wrote catalog.json
[refresh] --catalog flag set, skipping per-entry metadata
```

### E3: Verificación de Formato y Modos de Archivo en Repositorio
```bash
node -e "
import fs from 'node:fs';
const files = ['bin/cline-marketplace.js', 'server.js', 'scripts/refresh-catalog.mjs', 'scripts/smoke-test.mjs', 'scripts/unit-test.mjs'];
for (const f of files) {
  const buf = fs.readFileSync(f);
  console.log({ file: f, size: buf.length, hasCRLF: buf.includes(Buffer.from('\r\n')), hasLF: buf.includes(Buffer.from('\n')) });
}
"
```
**Resultado:**
- `bin/cline-marketplace.js`: LF (`hasCRLF: false`)
- `server.js`: LF (`hasCRLF: false`)
- `scripts/refresh-catalog.mjs`: CRLF (`hasCRLF: true`)
- `scripts/smoke-test.mjs`: LF (`hasCRLF: false`)
- `scripts/unit-test.mjs`: LF (`hasCRLF: false`)

---

## 7. Conclusión y Justificación del Score

**Score Final: 7.8 / 10**

### Desglose Justificado:
- **Arquitectura de Runtime Bridge (9.0 / 10)**: La cola FIFO de serialización `_commandLock`, la resolución de shims multiplataforma y la terminación de árboles de procesos `taskkill`/`SIGKILL` son excepcionales y previenen corrupción concurrente y procesos huérfanos.
- **Portabilidad Multiplataforma (8.5 / 10)**: Excelente cobertura de rutas de Windows, macOS y Linux en probing y shims. Penalizado levemente por modos `100644` en Git y CRLF en script de refresh.
- **Robustez del CLI Engine (6.8 / 10)**: Penalizado por la falta de manejo de `--version`, fallo no controlado ante puertos fuera de rango (`RangeError`), enmascaramiento de errores con `process.exit(0)` en `update`, y desincronización de puertos en colisiones con procesos de terceros.
- **Ciclo de Vida de Procesos y Confiabilidad (7.0 / 10)**: Buen reenvío de señales en el launcher CLI, pero carencia de graceful shutdown en `server.js` y ausencia de tests automatizados dedicados para el binario CLI.
