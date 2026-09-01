# Auditoría Capa 3 — Bundles, recomendaciones y catálogo (ClineMarket)

**Commit auditado:** `5dcb9a5` · **Agente:** sub-agente especializado (`spawn_agent`) · **Método:** lectura directa de `lib/routes.js` (425-441, 1090-1164), `public/app.js` (570-670, 1590-1730 + handlers reales 1941, 2041), `scripts/refresh-catalog.mjs` completo, script Node sobre `catalog.json` (muestreo de 20 entradas, conteos por type, 0 entradas malformadas).

**Score: 7.5 / 10**

> Nota: los reportes históricos (`docs/audits/2026-08-30-*`) citaban líneas drift de las actuales; esta auditoría verificó contra código vigente, no contra reportes viejos.

---

## Hallazgos

| ID | Hallazgo | Archivo:línea | Severidad | Fix |
|---|---|---|---|---|
| C1 ✅ | Contrato `/api/context` **alineado**: backend retorna `ok:true` + `recommendations[{entry, reasons, score, matchPercent}]` + `bundles` + `recommended`. Frontend consume exactamente esos campos (`ctx.recommendations?.length && !ctx.bundles?.length` en 596; `rec.entry/reasons/score/matchPercent` en 660-665). El fix de la auditoría previa está en producción. | `lib/routes.js:425-440` (recs en 337-342, bundles en 372-421) vs `public/app.js:596,660-665` | — (OK) | Nada. Cubierto por smoke-test (`scripts/smoke-test.mjs:150-152`). |
| C2 | **`/api/refresh` mismatch de contrato**: backend retorna `{ok, output, total, metaCount}` pero frontend muestra `res.entries` → toast renderiza `"undefined entries · meta for N"`. | Backend `lib/routes.js:1114-1119` vs `public/app.js:1942` | **Media** (UI incorrecta, no rompe flujo) | Cambiar a `` `${res.total} entries` `` o agregar `entries: total` en el backend (1 línea). |
| C3 | **`/api/update/run` degradación silenciosa**: backend retorna `{ok, output}`; frontend lee `res.message \|\| "Update finished!"` → siempre muestra mensaje genérico, `output` descartado. Además `git pull origin main` se ejecuta sin verificar `existsSync(join(root,'.git'))` → en installs npm-globales falla con 500 `not a git repository` (regresión conocida del audit previo, no fixeada). | Backend `lib/routes.js:1152,1159` vs `public/app.js:2041` | **Media** (500 en deployments npm) | Frontend: usar `res.output`. Backend: guard `existsSync(join(root, ".git"))` + fallback `npm install -g cline-marketplace@latest`. |
| C4 | **`refresh-catalog.mjs` persiste sin validar esquema upstream**: descarga el catálogo (línea 283) y escribe `catalog.json` directo (306-309) con único check `counts?.total ?? entries.length`. Cero validación de `type ∈ {plugin,skill,mcp}`, `id` string no-vacío, `install.command`/`install.args` array. Un upstream corrupto/parcial contaminaría el catálogo servido (y rompería recomendaciones/bundles que matchean por `type:id`). | `scripts/refresh-catalog.mjs:283-309` | **Alta** (zero-trust hacia upstream + escritura atómica garantiza persistencia del dato malo) | Validar antes de escribir: filtrar entries con `id` string, `type` en whitelist, `install.args` array (si presente); log de descartados; abortar si `entries.length === 0`. |
| C5 ✅ | **Catálogo actual consistente**: muestreo de 20 entradas (cada 10ª de 202): `type` solo ∈ {mcp:149, plugin:15, skill:38} = 202 ✓; todas con `install.command` + `install.args` array (algunas + `env`/`notes`); 0 entradas con `id/type/install` faltantes. Contrato `install.{command,args}` consumido correctamente por el instalador (`lib/routes.js:826,863,950`). | `catalog.json` (202 entries; sample verificado por script) | — (OK) | Nada puntual; C4 protege esta consistencia a futuro. |
| C6 | Escritura síncrona a disco en cada `GET /api/context` (`safeWriteJson` fire-and-forget) — I/O de escritura en endpoint de lectura. Ya reportado en auditoría de performance. | `lib/routes.js:557` | **Baja** | Persistir solo en `POST /api/refresh` o con dirty-check como en `/api/installed` (línea 574). |

---

## Score: **7.5 / 10** — Justificación

Contrato crítico `/api/context` está íntegro y verificado con consumo real del frontend (el finding "crítico" de auditorías previas está resuelto). Catálogo 202/202 entradas consistentes en type e install.args. Descuenta: falta total de validación de esquema en el pipeline de refresh (riesgo de corrupción silenciosa, C4), dos mismatches de respuesta UI (`entries`/`message`, C2-C3) y el `git pull` sin guard que revienta 500 en installs npm-globales.