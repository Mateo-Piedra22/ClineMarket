# Auditoría Capa 2 — Detección de primitivas instaladas y estado persistido (ClineMarket)

**Commit auditado:** `5dcb9a5` · **Agente:** sub-agente especializado (`spawn_agent`) · **Método:** lectura directa de `lib/probes.js` (551 líneas), `lib/reconciler.js` (61), `lib/state.js` (92), `skills-lock.json`, `scripts/refresh-catalog.mjs`, `lib/logger.js`, `data/` (instalación viva: `installed.json` 94 KB, `upstream-meta.json` 37 KB).

**Score: 5.5 / 10**

---

## Tabla de hallazgos

| # | Severidad | Hallazgo | Evidencia | Fix |
|---|-----------|----------|-----------|-----|
| 1 | **Critical** | `refresh-catalog.mjs` destruye `data/upstream-meta.json` con `{}` cuando no hay token GitHub (o rate-limit parcial). `fetchMeta` retorna `{}` (`scripts/refresh-catalog.mjs:222-226`) y `main()` lo persiste igual: `writeFileSync(metaTmp, JSON.stringify(meta, null, 2)); renameSync(...)` (`refresh-catalog.mjs:317-322`). Borra los ~202 registros de commits (37 KB hoy). Rate-limit también retorna parcial (`:241`) → sobrescribe con subconjunto. Además usa `writeFileSync` crudo, no `safeWriteJson`. | `scripts/refresh-catalog.mjs:222-226, 241, 317-322` | Merge defensivo: si `Object.keys(meta).length === 0`, skip + log; si parcial, merge sobre lo existente. Usar `safeWriteJson`. |
| 2 | **High** | Persistencia de configuraciones MCP completas (comandos, args, URLs, y cualquier `env` futuro) en disco plano y servibles por API. `reconcile()` copia `info.config` sin sanitizar (`lib/reconciler.js:40-42`). Evidencia empírica: 12 bloques `"config": {` en `data/installed.json` con `command`/`args`/`url` (líneas 950-1104). Hoy sin secretos (grep `TOKEN\|KEY\|SECRET` solo matchea descripciones), pero la superficie queda expuesta: cualquier MCP con `env` con credenciales queda persistido en plaintext + expuesto en rutas. | `lib/reconciler.js:40-42`; `data/installed.json:950-1104` | Redactar/omitir `env` y headers con credenciales antes de persistir; persistir solo `{command, args, url, transport}` + hash del resto. |
| 3 | **High** | `skills-lock.json` es huérfano: cero referencias en el código. Búsquedas `skills-lock` y `computedHash` sobre 229 archivos solo matchean el propio archivo. El hash `83d769…` (`skills-lock.json:8`) nunca se recalcula ni compara: **control de integridad declarado y no implementado**. Tampering con el SKILL.md local de `cline/sdk-skill` es indetectable. | `skills-lock.json:1-11`; searches sin consumidores | Implementar verificador: recomputar SHA-256 del `skillPath` remoto/local y comparar contra `computedHash` en install/update; fallar con drift si difiere. |
| 4 | **High** | Riesgo real de escritura corrupta: el repo vive en OneDrive, y `data/` se resuelve a `<cwd>/data` (`lib/state.js:19`). `renameSync` sobre archivos con handle abierto por OneDrive/otro proceso → `EPERM`. Retry: solo 3 intentos con backoff de 15/30 ms (`lib/state.js:70-81`) — insuficiente para locks de sincronización (segundos). `_writeQueues` solo serializa intra-proceso (`lib/state.js:8, 62`): servidor Express + CLI concurrentes = lost update. | `lib/state.js:8, 62, 70-81`; workspace en OneDrive | Backoff exponencial mayor (50ms×2^n, 6 intentos), lockfile inter-proceso, y recomendar `CLINEMARKET_DATA_DIR` fuera de OneDrive. |
| 5 | **Medium** | Parser YAML: cualquier línea dentro de block scalar (`>` o `|`) con formato `palabra: texto` matchea el regex de key (`lib/probes.js:193`) y corta el bloque, asignando el resto a una key inventada. | `lib/probes.js:193-207` | Detectar indentación mayor que la del key actual antes de tratar línea como key nueva. |
| 6 | **Medium** | Block scalar `|` (literal) destruye semántica: `map(l => l.trim())` elimina indentación interna y `filter(Boolean)` elimina líneas en blanco (`lib/probes.js:146-149`). Descripciones multilínea se colapsan mal. | `lib/probes.js:146-149` | Preservar indentación relativa y líneas vacías en modo literal. |

| 7–11 | **Medium** (extracto condensado) | Del run completo: tercer bug de corrección del parser YAML; detección ciega de Roo-Cline en macOS (#9) y Claude Code (#10) en candidates multiplataforma; schema degradation ya materializada en el `installed.json` vivo (#11). Detalle completo en traza del run. | `lib/probes.js` (candidates por plataforma) | Extender `clineRootCandidates` para Roo/Cursor/VSCodium en darwin/linux; normalización/migración de schema en installed.json. |
| 12–15 | **Medium** (extracto condensado) | Hallazgos Medium restantes del run completo (ver traza del subagente). | — | — |
| 16 | **Low** | Sufijo hash de plugins instalados se limpia mal: ids tipo `foo-deadbeef00` colapsan múltiples variantes hash del mismo plugin en una entry silenciosamente (overwrite del Map, `probes.js:440`). | `lib/probes.js:438-446` | Mantener `rawId` como key de Map y `cleanId` solo como display. |
| 17 | **Low** | `reconciler.js:48` `key.split(":")` deconstruye `[type, id]`: ids con `:` (válidos en directorios POSIX/macOS) pierden la cola y el drift check falla silenciosamente. | `lib/reconciler.js:48, 50-52` | Usar `indexOf` y `slice` en vez de destructuring. |
| 18 | **Low** | Keys YAML forzadas a minúsculas (`probes.js:196` `.toLowerCase()`): rompe round-trip y colisiona keys diferenciadas por caso; `#` aceptado como char de key (`probes.js:193`). | `lib/probes.js:193, 196` | Preservar caso original; normalizar solo en lookup. |
| 19 | **Low** | `cleanQuotes` naive: sin manejo de escapes (`\"`, `''` en YAML) — `probes.js:114-121`. | `lib/probes.js:114-121` | Manejar `''`→`'` y `\"`→`"`. |
| 20 | **Low** | Config de servidor MCP sin validación de tipo: si el valor no es objeto (string/número) se persiste igual (`probes.js:539-542`). | `lib/probes.js:539-542` | `if (srvConfig && typeof srvConfig === "object")`. |
| 21 | **Low** | `_writeQueues` nunca limpia entries (`state.js:90`): la promesa completada queda retenida por path. | `lib/state.js:90` | `currentOp.finally(() => { if (_writeQueues.get(k) === done) _writeQueues.delete(k) })`. |
| 22 | **Low** | `DATA_DIR` como env override es genérico y colisionable (`state.js:17`); catch-alls `catch {}` ×8 en probes silencian fallos de detección sin log (`probes.js:24, 282, 312, 363, 426, 450, 464, 545`). | `lib/state.js:17`; `lib/probes.js` (8 sitios) | Prefijar `CLINEMARKET_DATA_DIR` only; log de debug en catches. |
| 23 | **Informativa** | Artefactos de test en data/ de producción: `data/test-probe-dir-1788111111658/` (residuo de smoke test). Logs OK: rotación diaria + pruning por edad (`lib/logger.js:67-81`); cero archivos `.corrupt.*` acumulados (verificado). | `data/test-probe-dir-*`; `lib/logger.js:67-81` | Limpiar `data/test-probe-dir-*`; tests a tmpdir aislado. |
| 24 | **Informativa** | Reconciler no es "inmutable" como afirma su docstring: shallow copy comparte objetos anidados con el estado previo (`reconciler.js:11` vs doc en `:5`). Sin impacto actual observado. | `lib/reconciler.js:5, 11` | Deep-copy de items o corregir docstring. |

---

## Score: **5.5 / 10** — Justificación

El motor de sondas es amplio en cobertura (12 roots home + 9 workspace + 27 paths MCP multiplataforma, `probes.js:35-87, 381-530`) y `state.js` tiene las piezas correctas (atomicidad tmp+rename, queue por path, quarantine). Pero:

- **−2.5**: 1 Critical de pérdida real de datos (upstream-meta.json destructivo, aún no fijado pese a estar documentado en auditoría previa `.agents/audit_04_db_estado/handoff.md`) + 3 High (secretos MCP latentes persistidos, lockfile sin verificación alguna, riesgo OneDrive/EPERM sobre el data dir en producción).
- **−1.5**: 11 Medium, de los cuales 3 son bugs de corrección del parser YAML casero (#5, #6, #7) que invalidan descripciones/versiones detectadas, 1 es schema degradation ya materializada en el `installed.json` vivo (#11), y 2 son detección ciega (Roo macOS #9, Claude Code #10).
- **−0.5**: deuda Low acumulada + observabilidad nula (8 catch silenciosos en el trayecto de detección).

No baja más porque la capa funciona de punta a punta en el caso feliz (instalación viva con 200+ items reconciliados, logs con retención, cero corruptos en disco). No sube porque dos de los hallazgos graves ya estaban identificados en auditorías internas previas y siguen sin fix.
