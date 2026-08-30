# Auditoría Multicapa Cline Marketplace — 2026-08-30 — MODO PARALELO (11 Subagents)

## Resumen Ejecutivo

Se ejecutó la auditoría exhaustiva y profunda de **Cline Marketplace** mediante el despacho simultáneo de **11 subagents especializados en paralelo**, abarcando desde la arquitectura del backend y persistencia JSON, hasta la seguridad local, el puente de ejecución de subprocesos, la calidad de código, pruebas y pipelines de CI/CD.

El sistema presenta una base moderna, sólida y modular estructurada en ES Modules (Node 22), con enlace estricto a loopback (`127.0.0.1`), diseño visual de alta fidelidad alineado a `DESIGN.md` y soporte multiplataforma para Cline CLI v3.0.60+.

No obstante, la auditoría descubrió desalineaciones críticas entre endpoints del frontend y el router backend (`/api/context`, `/api/refresh`, `/api/mark/:type/:id`, `/api/watchlist`), bloqueos síncronos en el Event Loop por `execSync`, omisión de `"lib"` en `package.json` para distribución npm, y una suite de smoke tests carente de aserciones formales que enmascara fallos en CI.

---

## Tabla Maestra Consolidada

| # | Capa | Sev | Hallazgo | Archivo:línea | Fix Propuesto | Esfuerzo | Estado |
|---|---|:---:|---|---|---|:---:|:---:|
| 1 | Arquitectura | **Crítica** | Omisión de `lib/` en propiedad `files` de `package.json` (falla en `npx`) | [`package.json:10`](../../package.json) | Añadir `"lib"` al array `"files"` | 5 min | ⬜ Pendiente |
| 2 | DevOps | **Crítica** | Action version tags inexistentes en workflows (`checkout@v7`, `setup-node@v7`, `github-script@v9`) | [`.github/workflows/ci.yml:21`](../../.github/workflows/ci.yml) | Ajustar a versiones oficiales estables (`checkout@v4`, `setup-node@v5`, `github-script@v7`) | 15 min | ⬜ Pendiente |
| 3 | Testing | **Alta** | Smoke tests sin aserciones formales (`assert`), enmascarando fallos estructurales | [`scripts/smoke-test.mjs:68`](../../scripts/smoke-test.mjs) | Incorporar `node:assert/strict` en todos los endpoints probados | 1.5 h | ⬜ Pendiente |
| 4 | Código / Ecosistema | **Alta** | Desalineación de endpoints REST entre UI y backend (`/api/context`, `/api/refresh`, `/api/mark/:type/:id`) | [`public/app.js:1109`](../../public/app.js) / [`lib/routes.js:407`](../../lib/routes.js) | Implementar `GET /api/context`, `POST /api/refresh`, `DELETE /api/mark/:type/:id` en `lib/routes.js` | 1.5 h | ⬜ Pendiente |
| 5 | Seguridad / Perf | **Alta** | Bloqueo sincrónico del Event Loop con `execSync` en `/api/update/run` y `/api/health` | [`lib/routes.js:238,528`](../../lib/routes.js) | Migrar a `execFile` promisificado asíncrono con control de timeout | 30 min | ⬜ Pendiente |
| 6 | Bridge CLI | **Alta** | Procesos huérfanos en Windows tras timeout debido a `proc.kill("SIGTERM")` sobre `shell: true` | [`lib/runner.js:78`](../../lib/runner.js) | Implementar terminación por árbol de procesos en Windows (`taskkill /pid ${proc.pid} /T /F`) | 25 min | ⬜ Pendiente |
| 7 | Persistencia | **Alta** | Riesgo de sobreescritura destructiva de estado si `data/installed.json` sufre corrupción | [`lib/state.js:16`](../../lib/state.js) | Crear backup en cuarentena `.corrupt.<timestamp>` y rechazar sobreescritura vacía | 45 min | ⬜ Pendiente |
| 8 | Seguridad | **Alta** | Ausencia de validación `Origin` / `Sec-Fetch-Site` para prevenir CSRF en daemon local | [`server.js:33`](../../server.js) | Middleware de validación de origen loopback en endpoints mutantes | 20 min | ⬜ Pendiente |
| 9 | Frontend | **Media** | Íconos SVG ausentes en spritesheet (`#icon-package`, `#icon-sparkle`) | [`public/index.html:11`](../../public/index.html) | Declarar símbolos faltantes en el SVG oculto | 5 min | ⬜ Pendiente |
| 10 | Performance | **Media** | I/O muerto: llamada innecesaria a `fsProbe()` en `/api/stats` | [`lib/routes.js:539`](../../lib/routes.js) | Eliminar invocación huérfana de `fsProbe` | 2 min | ⬜ Pendiente |

---

## Scores por Capa (1-10)

- **Capa 1: Arquitectura & Patrones:** 8.2 / 10
- **Capa 2: Calidad de Código & Tipado:** 6.8 / 10
- **Capa 3: Seguridad & Auth:** 8.5 / 10
- **Capa 4: Persistencia & Datos:** 8.5 / 10
- **Capa 5: Performance & Optimización:** 7.2 / 10
- **Capa 6: Frontend & UI/UX:** 8.8 / 10
- **Capa 7: DevOps & CI/CD:** 7.8 / 10
- **Capa 8: Testing & QA:** 4.5 / 10
- **Capa 9: Observabilidad & Diagnósticos:** 9.4 / 10
- **Capa 10: Ecosistema Cline & MCP:** 8.8 / 10
- **Capa 11: Subprocess Bridge & CLI Runner:** 8.5 / 10

**Promedio Global: 7.91 / 10**

---

## 3 Quick Wins Cross-Capa
1. **Empaquetado y Distribución npm:** Agregar `"lib"` a la lista `"files"` en `package.json` y corregir action tags a `@v4`/`@v5`/`@v7` en `.github/workflows/*.yml`.
2. **Alineación de Endpoints REST en `lib/routes.js`:** Implementar `GET /api/context`, `POST /api/refresh`, `DELETE /api/mark/:type/:id` y `DELETE /api/watchlist/:type/:id`.
3. **Eliminación de I/O bloqueante y redundante:** Eliminar `fsProbe()` en `/api/stats` y migrar `execSync` a `execFileP` asíncrono.

---

## 3 Deudas Críticas
1. **Blindaje de Smoke Tests con Aserciones Estrictas:** Reemplazar logs informativos por `node:assert/strict` para evitar falsos positivos en CI.
2. **Manejo de Árbol de Procesos en Windows (`taskkill /T /F`):** Evitar subprocesos huérfanos ante timeouts de CLI.
3. **Protección Anti-Corrupción en Persistencia:** Backup automático ante fallos de parseo JSON para preservar historial de instalación.
