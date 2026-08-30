# Capa 4: Persistencia & Datos

### Score: 8.5/10
Sólida arquitectura con escrituras atómicas (`.tmp` + `renameSync`) y cola de serialización por promesas, pero con mutación de disco innecesaria en lecturas GET y riesgo de sobreescritura destructiva ante JSON corrupto.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Sobreescritura destructiva ante JSON corrupto (pérdida de historial de instalaciones) | `lib/state.js:16-24`<br>`lib/routes.js:23,164` | `readJson` retorna fallback `{ items: {} }` si falla `JSON.parse`. Al llamar `GET /api/installed`, `reconcile` y `saveInstalled` sobreescriben el archivo corrupto en disco, borrando permanentemente `installedAt`, comandos y metadata previa. | Si `existsSync(p)` es true pero `JSON.parse` falla, crear backup `p.corrupt.<timestamp>` y rechazar/abortar la reescritura destructiva de estado vacío. | 45 min |
| 2 | **Media** | `GET /api/installed` realiza escritura en disco en cada request (no idempotente / I/O thrashing) | `lib/routes.js:160-166` | `router.get("/installed", async (req, res) => { ... const state = reconcile(loadInstalled(), probe); await saveInstalled(state); res.json(state); });`<br>Cualquier cliente o polling UI genera reescritura de 50KB+ en disco aunque no haya cambios. | Implementar dirty-checking (comparar cambios de drift) antes de invocar `saveInstalled()`, manteniendo las lecturas GET puras. | 25 min |
| 3 | **Media** | Claves de cola no normalizadas en `_writeQueues` permiten carreras con rutas relativas vs absolutas | `lib/state.js:39,53` | `_writeQueues.get(p)` indexa por string crudo `p`. Si un componente pasa `data/installed.json` y otro `C:\...\data\installed.json`, se crean colas separadas. | Aplicar `const normPath = resolve(p);` al inicio de `safeWriteJson` para garantizar cola única por archivo físico. | 10 min |
| 4 | **Media** | `reconciler.js` lanza `TypeError` si el archivo JSON de estado no incluye la propiedad `items` | `lib/reconciler.js:17,35` | `if (!state.items[key])` y `Object.keys(state.items)`. Si el archivo existe con formato `{}` (sin `items`), `reconcile()` falla con error 500. | Añadir guardia al inicio de `reconcile`: `if (!state?.items) state = { ...state, items: {} };`. | 10 min |
| 5 | **Baja** | `refresh-catalog.mjs` utiliza `writeFileSync` directo sin atomicidad ni cola de escritura | `scripts/refresh-catalog.mjs:283,287,297` | `writeFileSync(cur, JSON.stringify(catalog, null, 2));` escribe directamente `catalog.json` (200KB). Si el proceso se interrumpe, deja el archivo corrupto. | Importar y usar `safeWriteJson` desde `lib/state.js` en los scripts de actualización de catálogo. | 15 min |
| 6 | **Baja** | I/O síncrono bloqueante (`writeFileSync` / `renameSync`) dentro del wrapper asíncrono de promesas | `lib/state.js:44-45` | `writeFileSync` y `renameSync` detienen el event loop principal de Node durante la serialización y flush a disco de archivos JSON. | Migrar a `node:fs/promises` (`writeFile`, `rename`, `unlink`) para I/O asíncrono. | 30 min |
| 7 | **Baja** | Falta de validación de esquema en `POST /api/settings` permite inyección de claves arbitrarias | `lib/routes.js:175` | `const updated = { ...current, ...(req.body || {}) }; await saveSettings(updated);` persiste cualquier propiedad arbitraria enviada en el body sin filtrado. | Aplicar whitelist de propiedades permitidas (`defaultScope`, `themeContrast`, `autoUpdateCheck`, `recentWorkspaces`). | 15 min |

---

### 3 quick wins
1. **Normalización canónica de paths en `_writeQueues`**: Utilizar `const canonicalPath = resolve(p);` para indexar `_writeQueues`.
2. **Defensiva contra `state.items` indefinido en `reconciler.js`**: Asegurar `if (!state?.items) state = { items: {} };` al inicio de `reconcile()`.
3. **Persistencia atómica uniforme en `scripts/refresh-catalog.mjs`**: Reemplazar las llamadas directas `writeFileSync` por `safeWriteJson`.
