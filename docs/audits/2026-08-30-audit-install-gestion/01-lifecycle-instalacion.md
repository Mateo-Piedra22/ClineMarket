# Auditoría Capa 1 — Ciclo de vida de instalación y gestión (ClineMarket)

**Commit auditado:** `5dcb9a5` · **Rama:** `main` · **Agente:** sub-agente especializado (`spawn_agent`) · **Método:** lectura directa de `bin/cline-marketplace.js`, `lib/routes.js`, `lib/runner.js`, `scripts/unit-test.mjs` + verificación de suites de test existentes.

**Score: 6.5 / 10**

---

## 1. Hallazgos

| ID | Componente | Archivo:línea | Severidad | Problema | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| **F1** | CLI exit codes | `bin/cline-marketplace.js:365-373` + `:308-310`, `:325-327` | **High** | Subcomandos `status`, `health`, `list` siempre ejecutan `process.exit(0)`. Los handlers capturan el error con `catch` y solo loguean, por lo que un fallo de red/servidor caído retorna exit 0. Rompe uso scripteado/CI. | Hacer que `runCliStatus/runCliHealth/runCliList` retornen boolean y `main()` haga `process.exit(failed ? 1 : 0)`. | 20 min |
| **F2** | Update endpoint | `lib/routes.js:1152` vs `bin/cline-marketplace.js:377-379` | **High** | `POST /api/update/run` ejecuta `git pull origin main` sin verificar `existsSync(join(root, '.git'))`. En instalación vía `npm install -g` falla con 500. El CLI sí hace el check (`:377-379`); el endpoint no. Ya diagnosticado en `docs/audits/2026-08-30-audit-capa-completo/99-consolidado.md` y **sigue sin fix**. | Replicar el guard `existsSync(.git)` y caer a `npm install -g cline-marketplace@latest`. | 15 min |
| **F3** | Bulk — sin límite | `lib/routes.js:1030,1041` vs `README.md:267` | **High** | `POST /api/bulk` no capta el tamaño de `items` (loop sin límite). README documenta "up to 30 items" pero el código no enforcea nada. Cada install/uninstall se serializa en la cola de `runCline` (180s timeout c/u): 500 items = hasta ~25h bloqueando toda la cola de comandos del servidor. Ya reportado en `.agents/audit_03_seguridad/handoff.md` — sigue abierto. | `const items = arr.slice(0, 30)` + responder 413 si excede. | 10 min |
| **F4** | Bulk — respuesta siempre `ok:true` | `lib/routes.js:1087` + `public/app.js:535-536` | **Medium** | `res.json({ ok: true, action, results })` retorna `ok:true` aunque **todos** los items hayan fallado. El frontend muestra toast "Completed install on N items" en verde sin inspeccionar `results`. | `const failed = results.filter(r => !r.ok).length; ok: failed === 0` + `failedCount` en payload; frontend debe chequearlo. | 20 min |
| **F5** | Bulk — semántica inconsistente con install | `lib/routes.js:1050,1057` vs `:826-845` | **Medium** | Bulk install ejecuta `[verb, "install", id]` crudo: ignora `entry.install.args` del catálogo (que `/api/install` sí usa en `:826`) y no tiene retry con `--force` (`:840-845`). Primitivas con args custom **fallan siempre en bulk** aunque funcionen vía card individual. Bundles del UI (`public/app.js:643`) usan bulk → bundles rotos para esas primitivas. | Extraer la lógica de `/api/install` a helper compartido `installOne(type, id, cwd, force)` y llamarla desde bulk. | 45 min |
| **F6** | Install — estado en fallo | `lib/routes.js:854-871` | **Medium** | `/api/install` persiste el item en `installed.json` incluso cuando `result.code !== 0` (registra `installedAt`, `source`, etc. con `detected:false`). Si el binario `cline` falla por red/permisos, el estado queda poblado de "instalaciones fantasma". El `reconcile` de `:873` solo lo corrige si el primitivo es visible por `fsProbe`. | Si `result.code !== 0` y el item no existía previamente, no persistir; responder 400 sin mutar estado. | 25 min |

| **F7** | Uninstall — estado en fallo | `lib/routes.js:910-916` | **Medium** | `/api/uninstall` marca `detected:false` **sin verificar `result.code`**. Un uninstall fallido (permisos, CLI ausente) deja el estado inconsistente respecto a la realidad del disco. | Verificar `result.code` antes de mutar estado; si falla, responder error y no tocar `installed.json`. | 20 min |
| **F8–F12** | Runner / CLI (extracto condensado) | `lib/runner.js:72-84, 135-143, 145-150, 98, 109-116` | **Medium/Low** | Hallazgos del run completo condensados: heurística de retry `--force` destructiva; timeout → `killProcessTree` puede dejar huérfanos y liberar el lock con proceso vivo; truncamiento silencioso de salida por `MAX_BUFFER`; branch batch shim `shell:true` sin test de sanitización previa; desincronización de puerto efectivo CLI vs server (`bin:235-265` vs `server.js:126-155`, High ya diagnosticado). | Fixes por hallazgo en traza del run; ver sección Cobertura de tests. | ~2-3h |
| **F13** | Update — output descartado | `lib/routes.js` (respuesta `{ok, output}`) vs `public/app.js:2041` | **Informativa** | El endpoint retorna `{ ok, output }` pero el frontend lee `res.message` — el output real del update nunca se muestra al usuario. | Retornar `message` o cambiar el frontend a `res.output`. | 5 min |

**Verificaciones sin hallazgos (método cero-inventos):**
- Inyección de comandos en `args`: los args llegan como array a `spawn` (sin shell en la rama no-batch, `runner.js:118-123`) y `type`/`id` pasan por `sanitizePrimitiveType`/`sanitizePrimitiveId` (`routes.js:816-817,891-892,1043-1044`). Sin evidencia de bypass directo (ver Capa 4 para el bypass vía catálogo).
- Mutex de comandos: `_commandLock` en `runner.js:13,172-173` serializa correctamente y propaga errores al caller sin romper la cadena.
- Bulk watch/unwatch: ejecuta todas las operaciones declaradas y persiste watchlist una sola vez (`routes.js:1062-1080`). Correcto.
- Bulk install/uninstall reconcilia estado al final (`routes.js:1082-1085`). Correcto.

---

## 2. Cobertura de tests de `lib/runner.js`

Suite relevante: `scripts/unit-test.mjs:152-177` (única).

| Ruta | Líneas | Riesgo |
|---|---|---|
| Timeout → `killProcessTree` | `runner.js:72-84, 135-143` | Huérfanos + lock liberado con proceso vivo |
| Cola/mutex `_commandLock` | `runner.js:172-173` | Sin test de serialización ni de error propagado a N waiters |
| Branch batch shim `shell:true` | `runner.js:98, 109-116` | Superficie de inyección sin test de sanitización previa |
| Spawn error | `runner.js:125-127, 152-157` | Rechazo limpio no verificado |
| CLI no encontrado (throw) | `runner.js:93-96` | Mensaje accionable no verificado |
| Truncamiento MAX_BUFFER | `runner.js:145-150` | Silencio total sin test |
| `getExecutionEnv` (PATH/ComSpec en Windows) | `runner.js:19-44` | Regresión de PATH rompería todos los installs |

**Agravante:** los tests de `resolveCline` y `runCline` (`unit-test.mjs:170,172`) son **condicionales** (`if (clinePath)`) — en un entorno sin `cline` instalado, la suite pasa sin ejecutar ninguna aserción de runner. Cobertura efectiva en CI limpio ≈ solo `verbFor`.

**Fix:** mocks de `child_process.spawn` (o binario fake `cline.cmd`/`cline` en temp dir) para ejercitar timeout, spawn error, cola y truncamiento incondicionalmente. Esfuerzo: ~2h.

---

## 3. Score: **6.5 / 10** — Justificación

- **Arquitectura base sólida (+):** serialización real de subprocessos (`runner.js:172-173`), sanitización de inputs en todos los endpoints de escritura, reconciliación post-operación tanto en single (`routes.js:873`) como en bulk (`routes.js:1082-1085`), mutex correcto en `/api/refresh`, propagación correcta de exit code en `refresh` CLI (`bin:395`), timeouts en todas las ejecuciones.
- **Resta:** 3 hallazgos High ya **diagnosticados en auditorías internas previas del propio repo** y **no remediados** (F2, F3, puerto desync). Patrones de estado-en-fallo sistémicos (F6, F7): el ciclo install/uninstall persiste estado sin correlacionarlo con el resultado del comando, que es el contrato central de la capa. Heurística de retry destructiva (F8). Cobertura de runner con tests condicionales que se saltan silenciosamente.

**Prioridad de remediación:** F1 → F3 → F2 → F7 → F6 → F4/F5 (mismo esfuerzo agrupado) → F13 → F8-F12.

**Safe-to-deploy:** No sin F1-F3. F1 y F3 son fixes de <30 min combinados.
