# Capa 2: Calidad de Código & Tipado

### Score: 7.0/10
**Justificación:** Base arquitectónica modular y limpia implementada en ECMAScript Modules (ESM) nativo sin dependencias pesadas más allá de Express 5.2.1. El motor de persistencia atómica (`lib/state.js`) y la resolución de ejecutables cross-platform (`lib/resolver.js`) presentan un diseño defensivo sólido. Sin embargo, la calificación está penalizada por: (1) una incompatibilidad crítica de contrato API en `/api/context` que inutiliza la vista de recomendaciones en el frontend, (2) desalineación de propiedades de respuesta en `/api/refresh` y `/api/update/run`, (3) duplicación de código y divergencia lógica (`isWindowsBatchShim` y el motor de heurísticas de contexto entre `scripts/detect-context.mjs` y `lib/routes.js`), (4) cobertura de JSDoc críticamente baja (6.5% global; 0% en `lib/routes.js` y `public/app.js`) y nula verificación estática de tipos (`jsconfig.json`/`tsconfig.json`), y (5) formatos de respuesta de error inconsistentes.

---

### Resumen de Métricas del Código

- **Líneas de Código Totales:** 5,201 líneas distribuidas en 24 archivos JavaScript (`.js` y `.mjs`).
- **Total de Funciones Identificadas:** 260 funciones.
- **Bloques JSDoc Documentados:** 17 bloques (6.54% de cobertura).
- **Verificación de Sintaxis (`node --check`):** 24/24 archivos válidos (100% de pase sintáctico).
- **Test Unitarios Nativos (`scripts/unit-test.mjs`):** 8/8 pruebas exitosas en ~150 ms.
- **Test de Humo de Integración (`scripts/smoke-test.mjs`):** Pasa todas las aserciones en runtime activo.
- **Dependencias en Runtime:** 1 (`express: ^5.2.1`). Dependencias dev: 0.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Crítica** | **Incompatibilidad Crítica de Contrato API en Recomendaciones (`/api/context`)**: El backend retorna un array simple de strings (`recommended: string[]`), pero el cliente frontend espera una estructura enriquecida (`recommendations: Array<{ entry, reasons, score, matchPercent }>` y `bundles`). Como resultado, la pestaña "Recommended" se renderiza permanentemente vacía y el badge permanece oculto. | `lib/routes.js:56-114` vs `public/app.js:584-655, 891` | `node -e "import('./server.js').then(async ({startServer})=>{const s=await startServer(); const r=await (await fetch('http://127.0.0.1:'+s.port+'/api/context')).json(); console.log('Keys:', Object.keys(r)); console.log('recommendations in data?:', 'recommendations' in r); s.server.close();});"` &rarr; `Keys: ['cwd','repo','languages','frameworks','tags','hints','recommended']`, `recommendations in data?: false`. En `app.js:585` la condición `if (!ctx || (!ctx.recommendations?.length && !ctx.bundles?.length))` oculta el listado y muestra `#recEmpty`. | Actualizar `analyzeWorkspaceContext` en `lib/routes.js` para hidratar las entradas del catálogo y generar la estructura `{ recommendations, bundles }` con sus metadatos de score y matching, o adaptar el parser en `public/app.js`. | 1.5 h |
| 2 | **Alta** | **Desalineación de Propiedades en Respuestas API (`/api/refresh` y `/api/update/run`)**: Desajuste entre los nombres de propiedades emitidos por el backend y consumidos por la UI. `/api/refresh` emite `total` y la UI lee `res.entries` (imprimiendo `"undefined entries"` en el toast); `/api/update/run` emite `output` y la UI lee `res.message` (omitiendo los logs de actualización). | `lib/routes.js:675-680, 714` vs `public/app.js:1618, 1702` | Inspección de código: `lib/routes.js:676` retorna `{ ok: true, output, total, metaCount }` mientras `public/app.js:1618` ejecuta `toast('Catalog refreshed', \`\${res.entries} entries · meta for \${res.metaCount}\`, 'success')`. En `routes.js:714` retorna `{ ok: true, output }` mientras `app.js:1702` lee `res.message`. | Homogeneizar las respuestas en `lib/routes.js` para devolver `{ ok: true, total, entries: total, message: output, output, metaCount }` y alinear los accesos en `public/app.js`. | 20 min |
| 3 | **Alta** | **Duplicación de Lógica y Divergencia entre `scripts/detect-context.mjs` y `lib/routes.js`**: Heurísticas de detección de stack tecnológico implementadas por duplicado. `detect-context.mjs` contiene soporte para 25+ frameworks y detección de repositorios Git, mientras `lib/routes.js` contiene una versión recortada con sólo 5 frameworks y `repo: null`. | `scripts/detect-context.mjs:1-170` vs `lib/routes.js:56-114` | Comparación de archivos: `scripts/detect-context.mjs` analiza `next`, `react`, `vue`, `nuxt`, `svelte`, `astro`, `angular`, `fastify`, `nestjs`, `prisma`, `drizzle`, `supabase`, `postgres`, `mongoose`, `redis`, `vitest`, `playwright`, `cypress`, `cloudflare`, `fastapi`, `django`, etc. `lib/routes.js` sólo evalúa 5 frameworks en package.json y nunca invoca a `detect-context.mjs`. | Extraer el motor de análisis a un módulo compartido `lib/context.js` y consumirlo de forma unificada en `lib/routes.js` y en la CLI. | 1.0 h |
| 4 | **Alta** | **Duplicación de Código de Detección de Plataforma `isWindowsBatchShim`**: La función está declarada y exportada en dos módulos independientes con implementaciones y firmas divergentes (`isWin` vs `typeof p !== "string"`), generando confusión en imports. | `lib/resolver.js:123-127` vs `lib/sanitizers.js:56-60` | `lib/runner.js:7` importa `isWindowsBatchShim` desde `./sanitizers.js`, mientras `lib/routes.js:14` y `scripts/unit-test.mjs:7` la importan desde `./resolver.js`. Ambas tienen firmas distintas para validar `exePath`. | Eliminar la definición duplicada en `lib/sanitizers.js` y consolidar la función en `lib/resolver.js` (o `lib/platform.js`). | 15 min |
| 5 | **Media** | **Cobertura JSDoc Críticamente Baja (6.5%) y Nula Verificación Estática (`checkJs` / `tsconfig`)**: Ausencia de tipado e interfaces formales para entidades clave (`PrimitiveEntry`, `InstalledItem`, `CatalogSchema`, `WorkspaceContext`). No existe configuración de linter ni `jsconfig.json`. | `lib/routes.js:1-861`, `public/app.js:1-1755`, `bin/cline-marketplace.js:1-278`, `server.js:1-163` | Script métrico: De 260 funciones en el proyecto, sólo 17 cuentan con bloque `@param`/`@returns`. `lib/routes.js` (861 líneas) y `public/app.js` (1755 líneas) tienen 0 bloques JSDoc. No existe `jsconfig.json` en la raíz. | Crear `jsconfig.json` con `"checkJs": true` y `"strict": true`, agregar `@types/node` y `@types/express` en devDependencies y documentar las entidades principales con JSDoc `@typedef`. | 2.5 h |
| 6 | **Media** | **Falta de Validación Estricta de Esquemas en Endpoints Mutantes (`/api/settings`, `/api/import`)**: Los objetos y arrays anidados recibidos en `POST /api/settings` (`recentWorkspaces`) y `POST /api/import` (`installed`) no se validan en profundidad antes de persistirse en disco. | `lib/routes.js:257-287, 815-847` | En `lib/routes.js:265`, `b.recentWorkspaces.slice(0, 20)` almacena elementos sin validar que sean objetos `{ path, name, lastUsedAt }`. En `routes.js:830-840`, campos como `it.scope` o `it.workspace` se copian sin sanitización estricta de rutas. | Implementar validadores de esquema defensivos para payloads estructurados en `lib/sanitizers.js` antes de persistir a `safeWriteJson`. | 45 min |
| 7 | **Media** | **Inconsistencia en Formato de Envoltura de Errores HTTP**: Mezcla de respuestas de error con estructura `{ error: string }` y `{ ok: false, error: string }` a lo largo de los endpoints de la API y middlewares. | `server.js:54, 63, 111` vs `lib/routes.js:405, 433, 476, 515, 683, 717` | `server.js:54` retorna `res.status(403).json({ error: "Forbidden..." })` (sin `ok: false`), mientras `server.js:111` retorna `{ ok: false, error: ... }`. `lib/routes.js:405` retorna `{ error: ... }` mientras `routes.js:683` retorna `{ ok: false, error: ... }`. | Estandarizar un helper `respondError(res, statusCode, message, code)` que garantice siempre `{ ok: false, error: message, status: statusCode }`. | 30 min |
| 8 | **Baja** | **Scripts Scratch y Re-exports Huérfanos en `scripts/`**: Presencia de scripts de depuración manual no vinculados al ciclo de vida del proyecto ni cubiertos por pruebas. | `scripts/test-where.mjs:1-10`, `scripts/debug-browser.mjs:1-79`, `scripts/lib/resolve-command.mjs:1-3` | `test-where.mjs` y `debug-browser.mjs` no figuran en `package.json` scripts y contienen rutas absolutas hardcodeadas a Windows (`C:\\Program Files\\...`). `scripts/lib/resolve-command.mjs` es un re-export de 3 líneas huérfano. | Depurar o mover los tests exploratorios a `scripts/unit-test.mjs` y eliminar scripts de depuración efímeros. | 20 min |
| 9 | **Baja** | **Detección Frágil de Invocación Directa de Archivo Principal en Windows**: Comparación estricta de strings sobre `process.argv[1]` sensible a casing de letras de unidad y separadores de ruta. | `server.js:158` | `process.argv[1] === fileURLToPath(import.meta.url)`: en Windows `process.argv[1]` puede ser `c:\...` mientras `fileURLToPath` resuelve a `C:\...`, impidiendo el arranque directo en ciertos entornos de shell. | Utilizar `resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))` o `import.meta.filename`. | 10 min |

---

### Análisis Detallado por Dimensión

#### 1. Sintaxis ES Modules e Integración de Módulos
- El proyecto utiliza `"type": "module"` de forma consistente en `package.json`.
- Todos los imports locales en `server.js`, `lib/*.js` y `scripts/*.mjs` incluyen explícitamente sus extensiones `.js` o `.mjs`, garantizando compatibilidad nativa con Node.js ESM sin loaders intermedios.
- Las funciones asíncronas y top-level awaits están bien balanceadas; en el cliente (`public/app.js`) se utiliza un IIFE asíncrono para encapsular el ciclo de inicio.

#### 2. Robustez de Manejo de Errores & Propagación
- **Persistencia Segura:** `lib/state.js` implementa un excelente mecanismo de escritura atómica con archivo temporal (`.tmp`), reemplazo atómico (`renameSync`) y cola de promesas por ruta canónica para serializar escrituras concurrentes.
- **Cuarentena de Archivos:** Ante un JSON corrupto, `readJson` genera automáticamente un backup de cuarentena (`.corrupt.<timestamp>`) evitando pérdida total de datos.
- **Manejo Global Express 5:** `server.js` cuenta con middleware centralizado de captura de errores (`err, req, res, next`).
- **Oportunidad de Mejora:** Abundancia de bloques `catch {}` completamente silenciosos en `lib/probes.js` (8 instancias) que no emiten logs de depuración cuando se presentan errores de permisos (`EPERM` / `EACCES`).

#### 3. Deuda Técnica, Modularidad y Complejidad
- `lib/routes.js` concentra 861 líneas y 19 endpoints, actuando como un módulo monolítico que mezcla routing Express, reconciliación de probes, ejecución de CLI y análisis de contexto.
- Existe duplicación directa de código entre `scripts/detect-context.mjs` y `lib/routes.js:56-114`, habiendo quedado desfasada la versión que corre en el servidor.
- Duplicación de la función `isWindowsBatchShim` en `lib/resolver.js` y `lib/sanitizers.js`.

#### 4. Tipado, JSDoc y Seguridad Estática
- La cobertura actual de JSDoc es de solo **6.5%** (17 bloques en 260 funciones).
- Los archivos más extensos y críticos del sistema (`lib/routes.js` con 861 líneas y `public/app.js` con 1,755 líneas) carecen en un 100% de anotaciones JSDoc.
- No se cuenta con `jsconfig.json`, `tsconfig.json` ni linter configurado, lo que permitió que las discrepancias de nombres de propiedades en respuestas de la API pasaran desapercibidas.

#### 5. Contratos de API y Validación de Payloads
- **Incompatibilidad crítica en `/api/context`:** La vista de recomendaciones está rota por discrepancia de esquema entre lo que emite el backend (`recommended: string[]`) y lo que consume la UI (`recommendations: Array<{ entry, reasons, score, matchPercent }>` y `bundles`).
- **Desalineaciones menores:** `/api/refresh` (`total` vs `res.entries`) y `/api/update/run` (`output` vs `res.message`).
- **Falta de esquemas de validación estricta:** Endpoints mutantes no validan la estructura profunda de objetos en arrays como `recentWorkspaces` e `installed`.

---

### 3 Quick Wins
1. **Alinear nombres de propiedades en `/api/refresh` y `/api/update/run` (`lib/routes.js:675-680, 714`)**: Retornar `{ ok: true, total, entries: total, message: output, output, metaCount }` para corregir de inmediato los toasts en la UI (20 min).
2. **Eliminar duplicación de `isWindowsBatchShim` (`lib/sanitizers.js:56-60`)**: Reutilizar el export canónico de `lib/resolver.js` en todos los módulos (15 min).
3. **Normalizar detección de ejecución directa en `server.js:158`**: Aplicar `resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))` para robustez en Windows (10 min).

### 3 Deudas Críticas
1. **Reconciliación y unificación del motor de contexto (`lib/context.js`)**: Fusionar `scripts/detect-context.mjs` y `lib/routes.js:56-114` en un módulo único que soporte todos los frameworks y entregue el contrato `{ recommendations, bundles }` esperado por la UI.
2. **Adopción de Type-Checking Estático (`jsconfig.json` con `checkJs: true`)**: Configurar chequeo estático y documentar con JSDoc `@typedef` los contratos de estado y API para prevenir regresiones silenciosas.
3. **Modularización de `lib/routes.js`**: Separar el router monolítico en submódulos por dominio (`routes/catalog.js`, `routes/installed.js`, `routes/system.js`, `routes/context.js`).

### 3 Oportunidades Estratégicas
1. **Validación Declarativa con Esquemas (Zod / TypeBox)**: Incorporar validación de contratos en los endpoints de mutación para blindar la API contra payloads malformados.
2. **Estandarización de Respuestas de Error**: Implementar un middleware unificado que garantice que todas las respuestas de error sigan el estándar RFC 7807 o `{ ok: false, error, code, timestamp }`.
3. **Integración de Linter en Pre-commit**: Configurar Biome o ESLint en el pipeline de hooks (`scripts/pre-commit.mjs`) para garantizar consistencia estilística y sintáctica automática.
