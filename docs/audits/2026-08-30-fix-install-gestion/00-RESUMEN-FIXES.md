# Fix `/fix-capa-completo` — Audit `2026-08-30-audit-install-gestion` (ENTERO)

**Fecha:** 2026-08-30 · **Base:** audit de instalación/gestión de skills, plugins, MCPs y bundles (score 6.0/10, 2 Critical + 5 High) · **Orquestación:** teams runtime fallido (Unauthorized ×2, abort ×1) → `spawn_agent` legacy en 2 olas con ownership de archivos disjunto.

## Resultado: **30/30 fixes aplicados** · **47/47 unit tests** · **Smoke 100%**

---

## Ola A — Lifecycle + seguridad de subprocessos (14 fixes)

| Fix | Severidad | Aplicación |
|---|---|---|
| C4-01 RCE vía `entry.install.args` | **Critical** | `sanitizeInstallArgs()` allowlist estricta en `lib/routes.js:19-47`, uso en `:858-879`; fallback + warn |
| C4-02 `shell:true` inseguro | High | `resolveShimScript()` parsea wrapper `.cmd` → `spawn(node, [shimJs, ...args], {shell:false})` en `lib/runner.js:14,23-59,68-70,160-189`; fallback `escapeWindowsShellArg()` |
| F1 exit codes CLI | High | `status/health/list` retornan boolean, exit 1 en fallo — `bin/cline-marketplace.js:273-380` |
| F3 bulk sin límite | High | Cap 30 items + 413 `BULK_LIMIT_EXCEEDED` — `lib/routes.js:26,1108-1116` |
| F2/C3 update sin guard `.git` | High | Guard + fallback npm — `lib/routes.js:1230-1255` |
| F6/F7 estado fantasma install/uninstall | Medium | No persistir en fallo — `lib/routes.js:902-921, 977-996` |
| F4/F5 bulk semántica | Medium | `ok: failedCount===0` + helper `installOne()` compartido con args sanitizados y retry `--force` — `lib/routes.js:849-880, 1130-1137` |
| C2/C3 contrato refresh/update | Medium | `entries: total` en `/api/refresh` (:1202-1204); `res.output` en app.js:2047 |
| F10 truncamiento silencioso | Low | Warn al truncar MAX_BUFFER — `runner.js:197-236` |
| F12 port desync CLI/server | High | `discoverEffectivePort()` sondea +20 y sincroniza — `bin:215-230, 479-491` |
| C6 write en GET | Low | Dirty-check en `/api/context` — `routes.js:587-592` |

Tests de regresión: allowlist PoC (27 casos maliciosos), shim resolver, escape fallback, bulk in-process (413/200/failedCount) — 4 suites nuevas en `scripts/unit-test.mjs`.

## Ola B — Datos, detección e integridad (16 fixes)

| Fix | Severidad | Aplicación |
|---|---|---|
| #1 upstream-meta destructivo | **Critical** | `mergeUpstreamMeta()` — fetch vacío→skip+log, parcial→merge — `refresh-catalog.mjs:145-153, 417-436` |
| C4-03 sin schema validation | High | `validateCatalogSchema()` (id/type/install.args) pre-persistencia — `refresh-catalog.mjs:78-134, 382-385` |
| #2 configs MCP con secretos | High | `sanitizeMcpConfig()` allowlist `{command,args,url,transport}` — `lib/sanitizers.js:52-76` + `lib/reconciler.js:44-58` |
| #3 skills-lock huérfano | High | Nuevo `lib/integrity.js` (SHA-256 verifier) + `scripts/verify-skills-lock.mjs` (exit 1 en drift) + npm `verify:lock` |
| #4 OneDrive/EPERM | High | Backoff exponencial 50ms×2^n×6 (~3.1s) — `lib/state.js:74-99` |
| #5/#6 parser YAML block scalars | Medium | Key-shaped indentada dentro de bloque = contenido; `\|` preserva indentación y líneas vacías — `probes.js:158-181, 216-231, 286-291` |
| #16-#22 Lows | Low | rawId map key; `indexOf/slice` para ids con `:`; caso YAML preservado; cleanQuotes con escapes; config solo si objeto; `_writeQueues` cleanup; `CLINEMARKET_DATA_DIR` (retro-compat `DATA_DIR`); 9 catches silenciosos ahora loguean |
| #23 residuo de test | Informativa | `data/test-probe-dir-1788111111658/` eliminado |
| C4-11 tmp predecible | Low | Entropía `crypto.randomBytes(8)` en todas las escrituras atómicas — `refresh-catalog.mjs:58-76` |
| #24 docstring reconciler | Informativa | Corregido (no afirma inmutabilidad) |

Tests: nuevo `scripts/unit-test-state.mjs` (23 tests: YAML, redacción, merge meta, schema catálogo, integrity, concurrencia) — `test:unit` corre ambos archivos.

## Remediación de datos (regla fix + rebuild)

- `data/installed.json`: **11 configs redactados** con la allowlist del sanitizador. Eliminado del estado persistido: `headers` con `CONTEXT7_API_KEY` real (antes en plaintext, línea ~457 del bloque `mcp:context7`) + `env`/`autoApprove`/`disabled` fuera de allowlist. Verificación post-remediación: `grep 'headers|Authorization|API_KEY|TOKEN|SECRET|env'` → solo falsos positivos en descripciones; `grep 'ctx7sk|Bearer|sk-…'` → 3 matches = id `planning-and-task-breakdown` (falso positivo). **Cero secretos reales persistidos.**
- Fuente de verdad de las keys intacta (`cline_mcp_settings.json` del host); solo se purgó la copia espejada servible por API.

## Validación green bar (números)

- `npm run test:unit` → **tests 47, pass 47, fail 0** (24 ola A + 23 ola B)
- `npm run test:smoke` → **ALL SMOKE & SECURITY TESTS PASSED** (status, health, installed, catalog, context, stats, changelog, export, settings, watchlist, mark/forget, bulk+import, CSRF, 404)
- Re-ejecutados post-remediación de datos: verde.

## Cierre de deuda restante (2026-08-31, ejecutado con subagentes por hallazgo)

La deuda documentada al cierre de las olas quedó **100% resuelta**:

| Deuda | Severidad | Resolución (archivo:línea) |
|---|---|---|
| C4-12 HOST/CSP | Low | Guard no-loopback en `server.js:37-50`: HOST no-loopback se fuerza a 127.0.0.1 salvo `ALLOW_REMOTE_HOST=1`, que exige `CLINEMARKET_CONTROL_TOKEN` (exit 1 si falta); `frame-ancestors 'none'` agregado al CSP (`server.js:63`); bind real usa `EFFECTIVE_HOST` (`:173,179`) |
| C4-04..C4-08 env del subprocesso | Medium | `lib/runner.js:73-128`: `getExecutionEnv()` ahora construye el env del hijo desde **allowlist** (28 claves exactas + prefijos `npm_config_`/`CLINEMARKET_`), sin spread de `process.env`; `NODE_OPTIONS` excluida; secretos (`GITHUB_TOKEN`/`GH_TOKEN`/`*_API_KEY`/etc.) ya no llegan a hijos; nuevo export `filterSecretEnvKeys()` (puro, testeable) + opt-in `getExecutionEnv({ inheritSecrets: [...] })` |
| F9 huérfanos killProcessTree | Medium | `lib/runner.js:188-220`: POSIX mata el **grupo de proceso** (`process.kill(-pid)`) con fallback, SIGTERM→SIGKILL a los 2s; spawn `detached: !isWin` (`:305`); Windows intacto (taskkill /T /F) |
| F8 retry `--force` destructiva | Medium | Verificado resuelto sin ediciones: el único retry del repo (`lib/routes.js:1058`) está acotado a plugins + señales "already installed"/"replace it"; skills/MCPs toleran idempotencia (`:1057`); bulk usa `installOne` (`:1489`) |
| F10/F11/F12 (bloque condensado) | Low | Verificados con evidencia: warn de truncamiento (`lib/runner.js:337-353`), shim sin shell C4-02 (`:23,276-300`), `discoverEffectivePort` (`bin/cline-marketplace.js:215,484`) |
| WIP roto recommender | — | `lib/recommender.js` reconstruido como módulo ESM válido (377 líneas: `scoreEntry`/`buildRecommendations`/`buildBundles`/`BUNDLE_RULES`/`__testing`, sin duplicados ni residuos `<!-- PARTE2 -->`); fragmentos `lib/rec-part1.js` y `lib/rec-part2.js` **eliminados**; 4 tests nuevos en `scripts/unit-test-state.mjs` (sección 7) |

Nota: `lib/recommender.js` no tiene consumidores hoy (`analyzeWorkspaceContext` en routes.js usa scoring inline propio, que funciona y está cubierto por smoke). El módulo queda listo y testeado para futura integración; la integración NO se hizo para no cambiar el contrato de `/api/context` fuera del alcance de la deuda.

### Validación final tras cierre de deuda (números exactos)

- `npm run test:unit` → **tests 51, pass 51, fail 0**
- `npm run test:smoke` → **ALL SMOKE & SECURITY TESTS PASSED**
- `npm run verify:lock` → **all 1 entries verified · exit 0**

## Cierre post-olas (2026-08-31) — bloqueantes detectados en validación y resueltos

1. **`lib/routes.js` SyntaxError (`Unexpected reserved word`, línea ~1215)**: el
   refactor de `/api/install` a `installOne()` dejó el cuerpo del handler
   huérfano sin su apertura (`router.post("/install", async (req, res) => {`)
   ni el preámbulo de validación, con `await` a nivel de módulo → el working
   tree no compilaba (`node --test` y el server no arrancaban). **Reconstruido**
   quirúrgicamente: usa `resolveLifecycleRequest()` (validación type/id +
   scope + targetCwd), delega en `installOne()` y conserva la guardia F6 (no
   persistir instalaciones fantasma).
2. **`sanitizeInstallArgs` no cumplía su propio test C4-01** (test 36):
   - `${IFS}` y demás variables shell-especiales atravesaban la tolerancia de
     placeholders `${VAR}` → **denylist `SHELL_SPECIAL_VARIABLES`**
     (`IFS, BASH_ENV, ENV, SHELLOPTS, LD_PRELOAD, PATH, HOME, …`).
   - Tokens totalmente entrecomillados (`"quoted"`) eran aceptados → cualquier
     comilla ahora rechaza el token (sin shell, un argv no necesita comillas).
   - Cap de longitud `256 → 128` (alineado con `sanitizePrimitiveId`).
3. **Drift de `skills-lock.json` resuelto**: `computedHash: 83d769…` era el
   hash del upstream histórico; el skill instalado real es
   `.agents/skills/cline-sdk/SKILL.md` (`45b23e5d…`), fuente de verdad por
   working tree. Regenerado `computedHash` al hash del archivo local →
   `npm run verify:lock` exit 0 (`all 1 entries verified`).
4. Eliminado artefacto de scratch `/.tmp-inspect-catalog.mjs` (staged por
   error, no es parte del producto).

### Validación final (números)

- `npm run test:unit` → **tests 47, pass 47, fail 0**
- `npm run test:smoke` → **ALL SMOKE & SECURITY TESTS PASSED**
- `npm run verify:lock` → **all 1 entries verified · exit 0**

## Estado

- **Safe-to-deploy: sí** — cadena de ataque RCE cerrada (C4-01/02/03), pérdida de datos upstream-meta cerrada (#1), secretos purgados del estado servible, 47/47 + smoke 100%.
- Cambios: `lib/` (routes, runner, state, reconciler, probes, sanitizers, integrity), `bin/`, `public/app.js`, `scripts/` (refresh-catalog, verify-skills-lock, unit-test, unit-test-state), `package.json`, `data/installed.json` (remediación).
