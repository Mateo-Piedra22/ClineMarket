# Auditoría Multicapa — ClineMarket (Primitive Registry & Control Plane)

**Fecha:** 2026-09-01
**HEAD:** `cdd6b00` · branch `main` · working tree clean
**Objetivo:** Auditoría completa solo-lectura del control plane local de Cline (plugins/skills/MCP).
**Baseline previo:** `2026-08-30-re-audit` (9.9/10). Esta auditoría busca **hallazgos nuevos / no corregidos**, no re-reporta lo ya cerrado.
**Stack auditado:** Node.js ESM ≥18 (v22.17.0 local), Express 5, vanilla JS frontend, catálogo JSON estático, persistencia JSON en `data/`, sin base de datos relacional.

> Nota de alcance: la skill `/audit-completo` describe una plantilla para un repo "ArgenPOS" (Python/React, AFIP/MP, Postgres RLS). Este repositorio es **ClineMarket** (Node/Express, datos JSON, sin AFIP/Mercado Pago, sin RLS). Se aplicó la estructura de capas adaptada al stack real. Capas inexistentes (DB relacional, AFIP) se marcan como **N/A**.

---

## Puntuación por Capa

| # | Capa | Score | Estado | Observaciones |
|---|------|:-----:|:------:|---------------|
| 1 | Arquitectura & Patrones | 9.5 / 10 | ✅ | Módulos ES puros en `lib/`, router desacoplado (`createApiRouter`), catch-all Express 5, inyección de paths. |
| 2 | Calidad de Código | 9.0 / 10 | ✅ | JSDoc, sanitización de inputs robusta. Export muerto `runClineStreaming` pendiente. |
| 3 | Seguridad & Auth | 8.5 / 10 | ⚠️ | Loopback default + CSRF + sanitización RCE OK. **Auth token en arranque nunca se verifica en rutas**. |
| 4 | Persistencia / Estado | 9.2 / 10 | ✅ | Escritura atómica + cola + backoff OneDrive. Sin DB → RLS N/A. |
| 5 | Performance | 9.0 / 10 | ✅ | Cache `_metaCache` LRU, sin `execSync` en hot path, buffering de stdout capado. |
| 6 | Frontend & UX | 9.0 / 10 | ✅ | `escapeHtml()` aplicado a todo data de catálogo (XSS contenido). `onerror` inline pendiente (H5). |
| 7 | DevOps & CI/CD | 9.0 / 10 | ✅ | Matrix OS×Node 18/20/22/24, CodeQL, dependabot, sync-catalog. Acciones no pinneadas a SHA. |
| 8 | Testing & QA | 9.3 / 10 | ✅ | 52 unit + smoke E2E reales (no tautológicos), aislamiento `os.tmpdir()`, `verify:lock` OK observado. |
| 9 | Observabilidad | 8.5 / 10 | ✅ | Logger ANSI + buffer + rotación diaria + `/api/logs`. Sin `LOG_LEVEL`/JSON. |
| 10 | Ecosistema Cline & MCP | 9.5 / 10 | ✅ | Multi-raíz (`.cline/.claude/.cursor/.agents/.commandcode`), redacción MCP config auditada, SDK lock verificado. |

**Score global ponderado ≈ 9.1 / 10** · Verde-Bar 100% (52 unit + smoke + verify:lock).

---

## Tabla Maestra de Hallazgos

| # | Sev | Capa | Archivo:Línea | Evidencia | Fix propuesto |
|---|:---:|------|---------------|-----------|---------------|
| **A1** | **Media** | Seguridad/Auth | `server.js:45-49` · `lib/routes.js` (ausencia) | `CLINEMARKET_CONTROL_TOKEN` se exige al arranque (`process.exit(1)` si falta con `ALLOW_REMOTE_HOST=1`), pero **ninguna ruta verifica el token**. El control plane completo (`/api/install`, `/api/uninstall`, `/api/bulk`, `/api/shutdown`, `/api/mark`) queda abierto en LAN a cualquier caller. Auth = dead code. | Middleware que exija `Authorization: Bearer <token>` (comparación safe) en todas las rutas mutantes **cuando** `ALLOW_REMOTE_HOST=1`. Cierra esto. |
| **A2** | **Baja** | Seguridad | `lib/routes.js:1748` | `router.post("/shutdown")` ejecuta `process.exit(0)` ante cualquier request válido sin token/confirmación (defensa CSRF loopback solamente). Documentado previamente como **H6** (2026-08-30) y **aún abierto**. | Mover shutdown a señal de SO (SIGINT/SIGTERM) o exigir el control token (se resuelve con A1). |
| **A3** | **Baja** | Seguridad | `server.js` (ausencia `express-rate-limit`) | No hay rate limit en endpoints que disparan subprocesos `cline` (`/api/install`, `/api/bulk`). Bajo por loopback default, sube si se expone. | Agregar `express-rate-limit` sobre rutas mutantes. |
| **A4** | **Baja** | Frontend | `public/app.js:195` | `onerror="...textContent:'${escapeHtml((entry.name \|\| '?')[0])}'..."` — el parser HTML decodifica `&#39;`→`'` antes del handler inline → `SyntaxError` si el nombre arranca con comilla simple. Documentado como **H5** y **aún abierto**. | Reemplazar handler inline por `img.addEventListener('error', ...)`. |
| **A5** | **Baja** | Docs/QA | `README.md:363-388` | README declara "22 TAP test suites" y cobertura 82.2% por módulo. Real: 2 suites, 52 tests; CI no instrumenta coverage. Claim stale. | Actualizar tabla a números reales o instrumentar coverage en CI. |
| **A6** | **Baja** | DevOps/CI | `.github/workflows/*.yml` | `actions/checkout@v4`, `actions/setup-node@v5` no pinneados a SHA. Riesgo supply-chain. `dependabot` mitigates parcialmente. | Pinnear a commit SHA y/o dependabot. |
| **A7** | **Baja** | Datos (local) | `data/watchlist.json` · `data/context-cache.json` | Sobras de test locales `plugin:bulk-p1` / `skill:bulk-s1`; `context-cache.json` con commit `19d1e38` **stale** (HEAD `cdd6b00`). `data/` solo versiona `.gitkeep` (gitignore OK, sin secrets en repo). | Limpiar watchlist local; forzar refresh de context-cache. |
| **A8** | **Info** | Observabilidad | `lib/logger.js` | Sin `LOG_LEVEL`, sin salida JSON (`LOG_FORMAT=json`), sin `logger.debug`. Buffer + rotación OK. | (Opcional) soportar `LOG_LEVEL`/`LOG_FORMAT`. |

---

## Positivos Verificados (no hallazgos)

- **XSS contenido**: `escapeHtml()` (app.js:66-70) aplicado a `name`, `type`, `tagline`, `description`, `author`, `license`, `install.command`, `reasons`, `matchPercent` en cards y detalle. Fuente upstream no confiable → correctamente escapada.
- **RCE install.args cerrado**: `validateInstallArgToken` (routes.js:70-92): cap 128 chars, rechaza comillas, `..`, vars shell-especiales (`${IFS}`…), metachars fuera de placeholders, spawn sin shell.
- **CSRF + headers**: `Sec-Fetch-Site`/`Origin` check + `express.json({limit:'1mb'})` + CSP/security headers.
- **Persistencia**: `safeWriteJson` atómico (tmp+rename) con backoff exponencial para OneDrive + cola por path (state.js:59-111).
- **Testing real**: 52 unit (sanitizers, state, reconciler, YAML parser, recommender) + smoke E2E en `os.tmpdir()`. `verify:lock` observado: `all 1 entries verified` (hash cline-sdk OK).
- **Higiene de datos**: `data/` solo versionado vía `.gitkeep`; `installed.json` sin credenciales de MCP (redacción `sanitizeMcpConfig` confirmada).

---

## Top 3 Deudas Críticas

1. **Auth token muerto (A1)** — el único control que transmite seguridad real a la LAN no comprueba nada. Es la deuda de mayor impacto real. Cierre: middleware + desactivar `/api/shutdown` sin token (A2).
2. **Hallazgos H5/H6 previos sin corregir (A2, A4)** — `onerror` inline (SyntaxError en edge) y `shutdown` sin guard ya estaban documentados el 2026-08-30 y siguen presentes. Deuda arrastrada.
3. **Stale documental de calidad (A5)** — README afirma cobertura/aislamiento que el repo no instrumenta en CI. La "green bar" reporta números que no se reproducen automáticamente.

## 3 Quick Wins

| Win | Esfuerzo | Impacto |
|-----|:--------:|---------|
| Middleware de control token en rutas mutantes (resuelve A1 **y** A2 a la vez) | ~30 min | Cierra la única deuda de seguridad real |
| Migrar `onerror` inline a `addEventListener` (A4) | ~10 min | Cierra H5 arrastrado |
| Instrumentar `node --test --experimental-test-coverage` en CI + actualizar tabla README (A5) | ~20 min | Reproduce la cobertura declarada y elimina el claim stale |

---

## Cobertura de Capas de la Skill (adaptada al stack real)

- Análisis de stock/C4 + deuda arquitectónica → capa 1 (9.5).
- Code smells / código muerto → capa 2 (9.0).
- OWASP, secrets, webhook / idempotencia → capa 3 (8.5). Webhooks/idempotencia: **N/A** (sin integraciones exteriores de pago/webhook en este repo).
- RLS Neon / índices FK / slow queries / N+1 → **N/A** (sin base relacional; persistencia JSON). Atomicidad y concurrencia sí auditadas (9.2).
- Bundle / CWV / bloqueos → capa 5 (9.0).
- Radix / Tailwind v4 / touch → **N/A** (frontend vanilla CSS propio; a11y básica presente: focus traps, roles, `aria-live`, `lang`, teclado). XSS cubierto (capa 6, 9.0).
- CI/CD, Pages, Docker → GitHub Actions auditado (9.0). Cloudflare Pages / Docker Compose: **N/A**.
- Cobertura / flaky / E2E → capa 8 (9.3).
- Logs estructurados / Sentry / métricas → capa 9 (8.5). Sentry: **N/A** (local-first, sin telemetría).
- AFIP / Mercado Pago / Ley 25.326 → **N/A** completo para este repo.

---

## Veredicto

Sistema maduro, bien auditado y con green bar real (52 unit + smoke + verify:lock OK). La calificación baja de 9.9 (re-audit) a **≈9.1** porque esta auditoría identificó deuda pendiente concreta y sin corregir de auditorías anteriores: el token de control que no autentica (A1) y los fix H5/H6 arrastrados. Los 3 quick wins cierran la holgura de seguridad y de documentación en <1 hora de trabajo.