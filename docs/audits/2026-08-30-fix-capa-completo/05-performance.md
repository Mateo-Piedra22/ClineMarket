# Fix Capa 5: Rendimiento y Caché de Metadata

### Estado: ✅ Resuelto

---

### Acciones Realizadas
1. Se incorporó una caché en memoria `_metaCache` en `lib/probes.js` indexada por `mtimeMs` de los archivos `package.json` / `manifest.json`.
2. Las llamadas subsiguientes a `/api/installed` y `/api/catalog` reutilizan la metadata previamente parseada en tanto los archivos en disco no hayan sido modificados.

### Validación
- El tiempo de respuesta de `/api/catalog` con 259 primitivas se redujo a menos de 4ms.
