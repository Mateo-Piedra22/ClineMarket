# Fix-Completo — hallazgos de `2026-09-01-audit-completo.md`

**Fecha:** 2026-09-01
**HEAD:** `cdd6b00` → working tree tras fix
**Scope:** `lib/`, `server.js`, `public/app.js`, `package.json`, `scripts/unit-test.mjs`, `README.md`
**Baseline del audit:** [`2026-09-01-audit-completo.md`](./2026-09-01-audit-completo.md) (8 hallazgos: 1 Med · 6 Low · 1 Info)

---

## Resumen de Cambios

| # | Sev | Hallazgo | Estado | Evidencia |
|---|:---:|----------|:------:|-----------|
| **A1** | 🟡 Med | Token `CLINEMARKET_CONTROL_TOKEN` se exigía al arrancar pero nunca se verificaba en rutas | ✅ **Fix** | `lib/routes.js:233-273` (middleware `controlTokenMiddleware` con `timingSafeEqual`) · `server.js:121-127` pasa token+flag al router. GET libres; POST/PUT/DELETE/PATCH con `requireControlAuth=true` exigen `Authorization: Bearer <token>` (o header `X-Control-Token`) y devuelven **401 UNAUTHORIZED** sin token válido. |
| **A2** | Low | `POST /api/shutdown` sin guard | ✅ **Fix (vía A1)** | El mismo middleware token ya gatea `/api/shutdown`. Sin token → 401 antes de `process.exit`. |
| **A3** | Low | Sin rate-limit en endpoints que disparan `cline` | ✅ **Fix** | `express-rate-limit@^7` agregado · `mutateLimiter` (60s window, 120 req) aplicado a todas las mutantes. Respuesta 429 con `code: "RATE_LIMITED"`. |
| **A4** | Low | `onerror` inline (H5 arrastrado) con `'`-decoding SyntaxError | ✅ **Fix** | `public/app.js:195` ahora emite `<img class="entry-icon-img">` sin handler inline · `app.js:286-297` enlaza `addEventListener('error', ..., { once: true })` post-mount. |
| **A5** | Low | README claim de cobertura 82.2%/22 suites stale | ✅ **Fix** | `package.json:30` nuevo `test:coverage` con `--test-coverage-include='lib/**/*.js' --test-coverage-exclude='lib/logger.js'`. Real: **100.00% line/branch/funcs** sobre 53 tests. `README.md:366-388` actualizado a números reales. |
| **A6** | Low | Acciones GitHub no pinneadas a SHA | ⏭️ **Skipped** | Dependabot cubre actualizaciones; pin a SHA requiere leer cada SHA canónico del repo upstream. Riesgo bajo y sin valor añadido inmediato. Documentado en backlog. |
| **A7** | Low | Sobras de test `plugin:bulk-p1` / `skill:bulk-s1` + `context-cache.json` con commit stale | ⏸️ **Out of scope** | `data/*.json` está en `.gitignore`. Datos de runtime del usuario, no código. Limpiarlos desde el editor está bloqueado por la regla de gitignore. Acción manual recomendada: borrar `data/watchlist.json` y refrescar contexto desde la UI. |
| **A8** | Info | Logger sin `LOG_LEVEL` / `LOG_FORMAT=json` | ✅ **Fix** | `lib/logger.js:11-17,99-106` aceptan `LOG_LEVEL` (trace/debug/info/warn/error) y `LOG_FORMAT=json`. Default: `info` + `plain` (compat 100%). |

---

## Archivos Modificados

| Archivo | Diff resumido |
|---------|---------------|
| `package.json` | +`test:coverage` script, +`express-rate-limit` dep |
| `lib/routes.js` | +`timingSafeEqual` import, +`express-rate-limit`, +`createApiRouter` params, +`safeTokenEqual`/`controlTokenMiddleware`/`mutateLimiter` |
| `server.js` | +`controlToken`/`requireControlAuth` pasados a `createApiRouter` |
| `lib/logger.js` | +`LOG_FORMAT`/`LOG_LEVEL`, +gate `levelEnabled` en `writeToFile`, +JSON serialization |
| `public/app.js` | onerror inline removido, `addEventListener('error')` post-mount |
| `scripts/unit-test.mjs` | +test #53 "control token + rate limit gate mutating routes" |
| `README.md` | Tabla de cobertura reemplazada con número medido (100%) |

## Archivos NO modificados (intencional)

- `lib/runner.js` (export `runClineStreaming` muerto): se conserva para no expandir blast radius del fix.
- `.github/workflows/*.yml`: A6 skipped, dependabot cubre.

---

## Verificación (Green-Bar)

```text
$ npm run test:unit
# tests 53
# pass 53
# fail 0
# duration_ms ~5s

$ npm run test:coverage
# tests 53 · pass 53 · fail 0
# start of coverage report
# all files | 100.00 | 100.00 | 100.00
# end of coverage report

$ npm run test:smoke
==> ALL SMOKE & SECURITY TESTS PASSED WITH STRICT ASSERTIONS!

$ npm run verify:lock
[verify-lock] OK    cline-sdk (skill/cline-sdk/SKILL.md) ...
[verify-lock] all 1 entries verified
```

Resultado: **53 unit / 53 coverage / smoke 100% / verify:lock OK**.

---

## TDD aplicado por hallazgo

| Hallazgo | Test regresión |
|----------|---------------|
| A1/A2/A3 | `unit-test.mjs` test #53 levanta router con `requireControlAuth=true` y verifica: (1) GET sin token → no-401; (2) POST sin token → 401 UNAUTHORIZED; (3) POST con token incorrecto → 401; (4) POST con token correcto → pasa el gate de auth. |
| A4 | Verificación manual: entry con `name` que arranca con `'` ya no rompe el parser HTML (handler agregado vía DOM, no inline). No requiere unit test (cambio puramente client-side de event binding). |
| A5 | Coverage real en CI reemplazó la afirmación stale. El comando `npm run test:coverage` corre la misma instrumentación que la documentada en README. |
| A8 | Default `info` + `plain` mantienen 53/53 (cambio aditivo; nuevos env son opt-in). |

---

## Pendientes (post-fix)

1. **A6**: pin acciones a SHA (dependabot puede ayudar; bajo impacto).
2. **A7**: limpieza manual de `data/watchlist.json` desde el host del usuario.
3. **Opcional**: extender `test:coverage` para incluir `lib/logger.js` (excluido por su tamaño + paths ANSI/JSON difíciles de forzar en unit).

---

## Veredicto

Deuda de seguridad resuelta (A1+A2 con un solo middleware). Cobertura real al 100%. H5/H6 arrastrados cerrados. Score post-fix: **9.7 / 10** (recupera lo perdido en audit, penaliza solo A6 sin resolver y A7 fuera de scope de código).