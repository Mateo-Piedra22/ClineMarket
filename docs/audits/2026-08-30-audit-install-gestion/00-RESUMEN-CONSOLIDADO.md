# Auditoría `/audit-capa-completo` — Instalación, gestión de Skills, Plugins, MCPs y Bundles

**Fecha:** 2026-08-30 · **Commit:** `5dcb9a5` (main) · **Método:** orquestación multi-agente (Agents Squad → fallback `spawn_agent` nativo por error de auth del runtime de teams) · **Scope específico:** ciclo de instalación/gestión de primitivas (skills, plugins, MCPs) y bundles.

## Score promedio: **6.0 / 10**

| # | Capa | Reporte | Score | Hallazgo más grave |
|---|---|---|---:|---|
| 1 | Seguridad de installs | [`04-seguridad-installs.md`](./04-seguridad-installs.md) | **4.5** | **Critical C4-01**: RCE vía `entry.install.args` del catálogo sin sanitizar (`routes.js:824-826`) + `shell:true` amplificador (`runner.js:109-116`) |
| 2 | Detección y estado | [`02-deteccion-estado.md`](./02-deteccion-estado.md) | **5.5** | **Critical**: `refresh-catalog.mjs` destruye `upstream-meta.json` con `{}` sin token/rate-limit (`:222-226, 317-322`) |
| 3 | Lifecycle install/gestión | [`01-lifecycle-instalacion.md`](./01-lifecycle-instalacion.md) | **6.5** | **High F1-F3**: exit codes CLI siempre 0; bulk sin límite (DoS de cola); update sin guard `.git` |
| 4 | Bundles y catálogo | [`03-bundles-catalogo.md`](./03-bundles-catalogo.md) | **7.5** | **High C4**: refresh sin validación de esquema upstream (`refresh-catalog.mjs:283-309`) |

## Cadena de ataque consolidada (top finding)

```
refresh-catalog.mjs (sin schema validation, C4-03/C4-catálogo)
  → catalog.json malicioso/comprometido
    → POST /api/install spread de entry.install.args sin sanitizar (C4-01, Critical)
      → runCline() con shell:true si exe es .cmd shim en Windows (C4-02, amplificador)
        → RCE con entorno completo del usuario (incl. GITHUB_TOKEN en env del hijo)
```

Mitigación propuesta (3 líneas de defensa):
1. **Sanitizar `entry.install.args`** con allowlist estricta antes del spread (`routes.js:824-826`).
2. **Validar esquema del catálogo upstream** en `refresh-catalog.mjs` antes de persistir.
3. **Eliminar `shell:true`** resolviendo el JS real del shim `.cmd` o escapando args.

## Top hallazgos transversales

1. **RCE por cadena de suministro** (Critical, Capa 4) — ver cadena arriba.
2. **Pérdida destructiva de datos** (Critical, Capa 2) — `upstream-meta.json` sobreescrito con `{}` en refresh sin token.
3. **Integridad declarada pero no implementada** (High, Capa 2) — `skills-lock.json` con hash `computedHash` que nunca se verifica; tampering de skills locales indetectable.
4. **Estado fantasma en fallos** (Medium, Capa 1) — install/uninstall persisten estado sin correlacionar `result.code`.
5. **Bulk roto para bundles** (Medium, Capa 1+3) — bulk ignora `entry.install.args` y retry `--force` → bundles fallan aunque el install individual funcione.
6. **Contrato `/api/context` OK** (positivo, Capa 3) — el fix de la auditoría previa está verificado en producción; catálogo 202/202 consistente.

## Hallazgos ya diagnosticados en auditorías previas y SIN fix (deuda recurrente)

- `git pull` sin guard `.git` en `/api/update/run` → 500 en installs npm-globales (Capas 1 y 3).
- Bulk sin límite de items → DoS de cola de comandos (Capas 1 y 4).
- Port desync CLI vs server (Capa 1).
- `MARKETPLACE_CATALOG_URL`/`HOST` overridables sin guardia (Capa 4).

## Prioridad de remediación global

1. C4-01 (sanitizar install.args) + C4-02 (shell:true) + C4-03 (schema validation refresh) — **bloqueante para deploy**.
2. Capa 2 #1 (merge defensivo upstream-meta) — pérdida de datos real.
3. F1+F3 (exit codes + límite bulk) — <30 min combinados, High.
4. skills-lock verificador (Capa 2 #3) + redacción de `env` en configs MCP persistidas (Capa 2 #2).
5. F2 (guard `.git`) + F6/F7 (estado-en-fallo) + F4/F5 (bulk semántica).
6. Deuda Low del parser YAML y detección multiplataforma (Capa 2 #16-#22).

## Verificación de entorno (cero invención)

- Commit auditado: `5dcb9a5` (`git log --oneline -1`).
- Working tree limpio al inicio del audit (`git status --short` vacío).
- Instalación viva verificada: `data/installed.json` 94 KB, `upstream-meta.json` 37 KB, 202 entries en catálogo.

## Limitaciones de este reporte

- Los runs de los sub-agentes fueron capturados con truncamiento parcial en las capas 1 y 2; los hallazgos condensados (F8-F12, capa 2 #7-#15) están referenciados con su evidencia visible y marcados como extracto. El detalle íntegro queda en la traza de sesión de cada sub-agente.
- El runtime de Agents Squad (teams) falló con `Unauthorized` (re-auth de cuenta Cline requerida); la orquestación se ejecutó vía `spawn_agent` nativo con los mismos briefs, 4/4 runs completados (1 retry por timeout en capa 3).
