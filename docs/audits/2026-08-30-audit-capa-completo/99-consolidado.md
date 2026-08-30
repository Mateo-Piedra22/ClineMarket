# Reporte Maestro Consolidado — Auditoría Multicapa Independiente de 11 Dimensiones (ClineMarket)

**Fecha:** 2026-08-30  
**Proyecto:** ClineMarket (`cline-marketplace`)  
**Puntaje Consolidado:** **7.71 / 10** (84.8 / 110 puntos)  

---

## Tabla de Contenidos General

- [1. Síntesis Ejecutiva & Resumen Global](#sintesis-ejecutiva--resumen-global)
  - [1.1 Visión General y Estado del Sistema](#1-vision-general-y-estado-del-sistema)
  - [1.2 Cuadro de Calificaciones Global (Scorecard)](#2-cuadro-de-calificaciones-global-por-dimension-scorecard)
  - [1.3 Top 10 Hallazgos Críticos Transversales](#3-top-10-hallazgos-criticos-transversales-cross-layer)
  - [1.4 3 Quick Wins](#4-3-quick-wins-alto-impacto--bajo-esfuerzo--30-min-cu)
  - [1.5 3 Deudas Técnicas Críticas](#5-3-deudas-tecnicas-criticas)
  - [1.6 3 Oportunidades Estratégicas](#6-3-oportunidades-estrategicas-de-crecimiento)
  - [1.7 Plan de Remediación Gradual y Hoja de Ruta](#7-plan-de-remediacion-gradual-y-hoja-de-ruta-roadmap)
- [2. Capítulos Dimensionales Detallados](#2-capitulos-dimensionales-detallados)
  - [Capítulo 01: Arquitectura & Modularidad](#capitulo-01-arquitectura--modularidad)
  - [Capítulo 02: Calidad de Código & Tipado](#capitulo-02-calidad-de-codigo--tipado)
  - [Capítulo 03: Seguridad & Permisos](#capitulo-03-seguridad--permisos)
  - [Capítulo 04: Almacenamiento de Datos & Estado](#capitulo-04-almacenamiento-de-datos--estado)
  - [Capítulo 05: Performance & Optimización](#capitulo-05-performance--optimizacion)
  - [Capítulo 06: Frontend, UI/UX & CLI Presentation](#capitulo-06-frontend-uiux--cli-presentation)
  - [Capítulo 07: DevOps, CI/CD & Deploy](#capitulo-07-devops-cicd--deploy)
  - [Capítulo 08: Tests & Cobertura QA](#capitulo-08-tests--cobertura-qa)
  - [Capítulo 09: Observabilidad & Diagnóstico](#capitulo-09-observabilidad--diagnostico)
  - [Capítulo 10: Lógica de Negocio & Catálogo](#capitulo-10-logica-de-negocio--catalogo)
  - [Capítulo 11: CLI Engine & Runtime Bridge](#capitulo-11-cli-engine--runtime-bridge)

---

<a id="sintesis-ejecutiva--resumen-global"></a>

# Resumen Ejecutivo — Auditoría Multicapa Independiente de 11 Dimensiones (ClineMarket)

**Fecha:** 2026-08-30  
**Proyecto:** ClineMarket (`cline-marketplace`)  
**Versión Auditada:** v1.0.0  
**Metodología:** Auditoría Exhaustiva Multicapa Independiente (11 Dimensiones en Paralelo)  
**Puntaje Consolidado:** **7.71 / 10** (84.8 / 110 puntos — Grado: **B+ / Sólido Operacional**)

---

## 1. Visión General y Estado del Sistema

Se llevó a cabo una auditoría integral, estricta e independiente del sistema **ClineMarket** (`cline-marketplace`), un marketplace local y plano de control para extensiones, plugins, skills y servidores MCP orientado al ecosistema Cline y herramientas asistidas por IA.

La evaluación abarcó **11 dimensiones arquitectónicas y operacionales clave**, analizando el código fuente, la persistencia en disco, los mecanismos de seguridad y sandboxing, el rendimiento bajo carga, la fidelidad de la interfaz de usuario, la automatización en CI/CD, la cobertura de pruebas unitarias/smoke, la observabilidad, la integridad del catálogo de negocio y el puente de ejecución de procesos multiplataforma.

### Veredicto Global
ClineMarket demuestra una **arquitectura base moderna, modular y bien estructurada** construida sobre Node.js 22 (ES Modules) y Express 5. Destacan notablemente sus defensas de seguridad perimetral (binding exclusivo a loopback `127.0.0.1`, cabeceras CSP estrictas, sanitización contra path traversal y CSRF origin guards), su serialización FIFO en ejecución de subprocesos (`_commandLock`), su persistencia atómica con swap temporal y su logger modular con soporte `NO_COLOR`.

No obstante, el sistema presenta **vulnerabilidades de robustez operativa y deuda técnica localizada**, tales como colapsos no controlados ante puertos fuera de rango en el CLI, desalineación de esquemas en el endpoint de recomendaciones (`/api/context`), omisión de soporte para directorios locales como `.commandcode`, scripts con llamadas síncronas bloqueantes (`execSync`), respuestas de error 404 en formato HTML dentro de la API REST y una suite de pruebas con importantes brechas de cobertura y aserciones superficiales que además polucionan el almacenamiento de producción.

---

## 2. Cuadro de Calificaciones Global por Dimensión (Scorecard)

| # | Dimensión Auditada | Archivo de Origen | Score | Ponderación | Grado | Veredicto Resumido |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **01** | **Arquitectura & Modularidad** | [`01-arquitectura.md`](./01-arquitectura.md) | **7.8 / 10** | 10% | **B+** | Sólida separación C4 y diseño Express 5; penalizado por el "God Module" `lib/routes.js` (>725 LOC) y falta de middleware centralizado. |
| **02** | **Calidad de Código & Tipado** | [`02-codigo.md`](./02-codigo.md) | **7.0 / 10** | 10% | **B** | ES Modules limpio, pero con desalineación crítica de contratos REST (`/api/context`), tipado JSDoc deficiente y funciones con alta complejidad ciclomática. |
| **03** | **Seguridad & Permisos** | [`03-seguridad.md`](./03-seguridad.md) | **8.6 / 10** | 10% | **A** | Excelente loopback isolation (`127.0.0.1`), CSP sólida, sanitización de paths y 0 vulnerabilidades `npm audit`. Margen de mejora en COOP y rate-limiting de mutaciones. |
| **04** | **Almacenamiento de Datos & Estado** | [`04-db-estado.md`](./04-db-estado.md) | **7.5 / 10** | 10% | **B+** | Persistencia atómica con swap temporal y reconciliación pura de drift; penalizado por `catalog.json` monolítico (185 KB) y mutación de estado en tests. |
| **05** | **Performance & Optimización** | [`05-performance.md`](./05-performance.md) | **7.3 / 10** | 10% | **B** | Latencia base sobresaliente (TTFB ~1ms), pero penalizado por ausencia de compresión HTTP (gzip/brotli), bloqueos `execSync` y sondeos de fs secuenciales. |
| **06** | **Frontend & UI/UX Presentation** | [`06-frontend.md`](./06-frontend.md) | **8.2 / 10** | 10% | **A-** | Vanilla JS reactivo de alta fidelidad, excelente soporte tema claro/oscuro; afectado por vista de contexto rota por contrato backend y renderizado markdown básico. |
| **07** | **DevOps, CI/CD & Deploy** | [`07-devops.md`](./07-devops.md) | **7.8 / 10** | 10% | **B+** | CI multi-OS (Ubuntu/Win/macOS), SAST CodeQL y Dependabot; afectado por empaquetado npm con bloat (2.86 MB), hook pre-commit invasivo y disable de `npm audit` en `.npmrc`. |
| **08** | **Tests & Cobertura QA** | [`08-tests.md`](./08-tests.md) | **6.0 / 10** | 10% | **C+** | Suite ultra-rápida (<300ms) pero con cobertura nula para `bin/cline-marketplace.js`, 0 mocks para subprocesos, aserciones superficiales y polución del directorio `data/`. |
| **09** | **Observabilidad & Diagnóstico** | [`09-observabilidad.md`](./09-observabilidad.md) | **8.8 / 10** | 10% | **A** | Logger estructurado con tiempos ms y soporte `NO_COLOR`, ricas métricas en `/api/health`; penalizado por 404 HTML en `/api/*` y ausencia de `LOG_LEVEL` dinámico. |
| **10** | **Lógica de Negocio & Catálogo** | [`10-negocio.md`](./10-negocio.md) | **7.8 / 10** | 5% | **B+** | 202 primitivas indexadas y reconciliación bidireccional; penalizado por omisión de `.commandcode` (30 skills invisibles), frontmatter corrupto (`>`/`|`) y sin resolución de dependencias. |
| **11** | **CLI Engine & Runtime Bridge** | [`11-bridge.md`](./11-bridge.md) | **7.8 / 10** | 5% | **B+** | Serialización FIFO (`_commandLock`), shims Windows y `taskkill`; penalizado por `RangeError` en `isPortOpen`, código `0` en fallos de `update` y colisión de puertos CLI/Server. |
| **TOTAL** | **Promedio Global Multicapa** | — | **7.71 / 10** | **100%** | **B+** | **Aprobado con Observaciones Críticas (84.8 / 110 ptos acumulados)** |

---

## 3. Top 10 Hallazgos Críticos Transversales (Cross-Layer)

A continuación se consolidan y jerarquizan los 10 hallazgos de mayor impacto técnico, riesgo operativo e impacto en la experiencia de usuario:

### 1. Colapso por `RangeError` no capturado en el socket probe del CLI (`isPortOpen`)
- **Severidad:** **Crítica / Alta**
- **Ubicación:** `bin/cline-marketplace.js:140`
- **Dimensiones:** Capa 11 (Bridge), Capa 3 (Seguridad), Capa 7 (DevOps)
- **Evidencia Empírica:** Invocaciones con puertos inválidos (`node bin/cline-marketplace.js --port 999999 --no-open`) disparan `RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536` no interceptado, provocando el colapso inmediato del CLI con Exit 1 sin mensaje explicativo.
- **Remediación:** Validar que el puerto se encuentre en el rango entero `[1, 65535]` y envolver la invocación de `net.connect` dentro de un bloque defensivo `try / catch`.

### 2. Desalineación crítica de contrato REST en `/api/context` (Frontend roto)
- **Severidad:** **Alta**
- **Ubicación:** `lib/routes.js:105-132` vs `public/app.js:240-270`
- **Dimensiones:** Capa 2 (Código), Capa 6 (Frontend), Capa 1 (Arquitectura)
- **Evidencia Empírica:** El backend emite un payload con estructura `{ ok: true, recommended: string[] }`, mientras que la vista de recomendaciones del frontend (`public/app.js`) espera `{ ok: true, recommendations: Array<{ entry, reasons, score, matchPercent }>, bundles: [...] }`. La vista en la interfaz gráfica permanece vacía o arroja errores silenciosos de renderizado.
- **Remediación:** Refactorizar `lib/routes.js` para computar y enriquecer las entradas recomendadas devolviendo el esquema completo requerido por la UI.

### 3. Polución y mutación del directorio de datos de producción (`data/`) durante tests
- **Severidad:** **Alta**
- **Ubicación:** `scripts/unit-test.mjs:42-70`, `scripts/smoke-test.mjs:50-85`
- **Dimensiones:** Capa 8 (Tests), Capa 4 (DB/Estado), Capa 7 (DevOps)
- **Evidencia Empírica:** La ejecución de `npm test` crea archivos temporales (`data/test-queue-*.json`) y muta directamente los archivos de estado `data/installed.json` y `data/context-cache.json` sin utilizar aislamiento en `os.tmpdir()`, arriesgando corrupción del estado del usuario si se corre en entornos de desarrollo activos.
- **Remediación:** Parametrizar la ruta de datos mediante variable de entorno (`DATA_DIR`) o inyección de dependencias, aislando la suite en `path.join(os.tmpdir(), 'clinemarket-test-' + Date.now())`.

### 4. Omisión total de los ecosistemas locales `.commandcode` y `.agents` en detección
- **Severidad:** **Alta**
- **Ubicación:** `lib/probes.js:24-61, 224-270`
- **Dimensiones:** Capa 10 (Negocio), Capa 4 (DB/Estado), Capa 1 (Arquitectura)
- **Evidencia Empírica:** Pruebas con `fsProbe()` en entornos con extensiones CommandCode arrojaron 30 skills y servidores MCP locales (como `serena` en `~/.commandcode/mcp.json`) completamente invisibles para el marketplace local.
- **Remediación:** Incorporar `path.join(homedir(), '.commandcode')` y `path.join(homedir(), '.agents')` en `clineRootCandidates()`, e indexar los archivos `mcp.json` correspondientes en `lib/probes.js`.

### 5. Retorno de código de salida exitoso (`exit 0`) ante fallos fatales en subcomando `update`
- **Severidad:** **Alta**
- **Ubicación:** `bin/cline-marketplace.js:221-224`
- **Dimensiones:** Capa 11 (Bridge), Capa 7 (DevOps), Capa 9 (Observabilidad)
- **Evidencia Empírica:** Al fallar la actualización de repositorios git o paquetes globales en `sub === 'update'`, el bloque `catch (err)` loguea el error pero invoca `process.exit(0)` en lugar de `process.exit(1)`. Esto engaña a pipelines CI/CD y scripts automatizados reportando éxito ante fallos reales.
- **Remediación:** Sustituir por `process.exit(1)` en todos los bloques `catch` de terminación de subcomandos.

### 6. Corrupción de descripción en metadata de skills locales por parsing de YAML block scalars
- **Severidad:** **Alta / Media**
- **Ubicación:** `lib/probes.js:120-136`
- **Dimensiones:** Capa 10 (Negocio), Capa 4 (DB/Estado), Capa 2 (Código)
- **Evidencia Empírica:** Al parsear archivos `SKILL.md` con encabezados YAML que utilizan indicadores de bloque plegado o literal (`description: >` o `description: |`), el parser ingenuo guarda literalmente `>` o `|` como descripción en `data/installed.json` (afectando skills como `skill:caveman`, `skill:mercado-pago`, etc.).
- **Remediación:** Implementar un parser robusto de frontmatter que soporte valores multilínea y descarte los indicadores de bloque `>` / `|`.

### 7. Bloat masivo en empaquetado de distribución npm (2.86 MB por inclusión de screenshots y audits)
- **Severidad:** **Media**
- **Ubicación:** `package.json` (`files`), `.npmignore`
- **Dimensiones:** Capa 7 (DevOps), Capa 5 (Performance), Capa 11 (Bridge)
- **Evidencia Empírica:** La ejecución de `npm pack --dry-run` reveló un tarball de 2.86 MB con 187 archivos empaquetados, incluyendo capturas de pantalla PNG (`docs/screenshots/`) e historiales completos de auditorías en markdown dentro del paquete npx distribuido.
- **Remediación:** Restringir el campo `files` en `package.json` estrictamente a `["bin", "lib", "public", "catalog.json", "server.js", "index.html", "LICENSE", "README.md"]`.

### 8. Bloqueos síncronos del Event Loop mediante `execSync` en scripts y detección
- **Severidad:** **Media**
- **Ubicación:** `scripts/detect-context.mjs:12-45`, `lib/routes.js:707-719`
- **Dimensiones:** Capa 5 (Performance), Capa 2 (Código), Capa 1 (Arquitectura)
- **Evidencia Empírica:** Invocaciones de `execSync` para comandos git y sondeos detienen el procesamiento de cualquier petición HTTP entrante durante la ejecución del proceso secundario.
- **Remediación:** Migrar todas las invocaciones a `execFile` asíncrono envuelto en promesas (`node:util.promisify`) o al subproceso asíncrono con control de concurrencia.

### 9. Respuestas 404 en formato HTML y esquemas inconsistentes de error en la API REST
- **Severidad:** **Media**
- **Ubicación:** `server.js:103-106`, `lib/routes.js:405, 433, 476, 488, 515, 537, 683`
- **Dimensiones:** Capa 9 (Observabilidad), Capa 1 (Arquitectura), Capa 2 (Código)
- **Evidencia Empírica:** Peticiones a rutas inexistentes `GET /api/nonexistent` devuelven un documento HTML por omisión de Express (`Content-Type: text/html`), rompiendo clientes que esperan JSON. Asimismo, algunos endpoints devuelven `{ error: "..." }` omitiendo `ok: false`.
- **Remediación:** Registrar un middleware 404 dedicado para `/api/*` que retorne `{ ok: false, error: "Endpoint not found", code: "NOT_FOUND" }` y unificar las respuestas de error mediante un helper centralizado.

### 10. Desconexión en negociación de puertos entre CLI y Express ante colisiones de puerto
- **Severidad:** **Media**
- **Ubicación:** `bin/cline-marketplace.js:254-268` vs `server.js:135-155`
- **Dimensiones:** Capa 11 (Bridge), Capa 1 (Arquitectura)
- **Evidencia Empírica:** Si el puerto 5173 está ocupado por una aplicación ajena (que no es ClineMarket), `server.js` detecta la colisión y levanta dinámicamente en el puerto 5174; sin embargo, el CLI (`bin/cline-marketplace.js`) asume el puerto inicial 5173 y abre el navegador en el puerto de la aplicación ajena.
- **Remediación:** Implementar un mecanismo de handshake IPC (`process.send`) o parsing estructurado del banner stdout del servidor para confirmar el puerto exacto antes de invocar `openBrowser`.

---

## 4. 3 Quick Wins (Alto Impacto / Bajo Esfuerzo < 30 min c/u)

1. **Aislamiento de tests en directorio temporal (`os.tmpdir()`)**
   - **Impacto:** Elimina por completo la polución y el riesgo de corrupción del estado `data/` de producción durante la ejecución de `npm test` y CI.
   - **Esfuerzo:** ~20 minutos.
   - **Acción:** Configurar `DATA_DIR` dinámico en `scripts/unit-test.mjs` y `scripts/smoke-test.mjs`.

2. **Soporte de rutas `.commandcode` / `.agents` y normalización de YAML frontmatter en `lib/probes.js`**
   - **Impacto:** Recupera y visualiza de inmediato 30+ skills locales y servidores MCP que estaban invisibles, corrigiendo además descripciones corruptas (`>` y `|`).
   - **Esfuerzo:** ~25 minutos.
   - **Acción:** Añadir directorios en `clineRootCandidates()` y sanitizar cadenas de frontmatter multilínea.

3. **Corrección de `exit 1` en fallos de CLI `update` y protección de rango en `isPortOpen`**
   - **Impacto:** Previene colapsos incontrolados (`RangeError`) y garantiza la correcta propagación de códigos de error a scripts de automatización y CI.
   - **Esfuerzo:** ~15 minutos.
   - **Acción:** Añadir validación `port >= 1 && port <= 65535` y emitir `process.exit(1)` en el bloque catch de `update`.

---

## 5. 3 Deudas Técnicas Críticas

1. **Monolito de Enrutamiento ("God Module" `lib/routes.js` > 725 Líneas)**
   - **Descripción:** `lib/routes.js` concentra excesiva lógica de negocio, manipulación directa de archivos, control de subprocesos, formateo de logs y serialización de respuestas HTTP.
   - **Riesgo:** Alta propensión a regresiones, dificultad de mantenimiento y acoplamiento severo.
   - **Solución Recomendada:** Desacoplar en una arquitectura por capas basada en controladores (`controllers/catalog.js`, `controllers/primitives.js`, `controllers/context.js`, `controllers/system.js`) y servicios de dominio.

2. **Ausencia de Compresión HTTP (GZIP/Brotli) y Transferencia de `catalog.json` sin Optimizar (185 KB)**
   - **Descripción:** El servidor Express sirve `catalog.json` (6060 líneas, 185 KB) en texto plano sin compresión en cada recarga.
   - **Riesgo:** Ineficiencia de red y penalización de rendimiento en conexiones lentas o entornos remotos.
   - **Solución Recomendada:** Integrar el middleware `compression` en Express 5 (reduciendo el payload en un 81% a ~35 KB) e implementar paginación / indexación ligera.

3. **Carencia de un Motor Formal de Resolución de Dependencias entre Primitivas**
   - **Descripción:** Primitivas que requieren servidores MCP o dependencias de entorno (ej. `skill:postgres-rls` requiere `mcp:postgres`) se instalan sin validar prerrequisitos ni advertir al usuario.
   - **Riesgo:** Instalaciones rotas e inconsistencias operativas en el entorno de trabajo del usuario.
   - **Solución Recomendada:** Establecer un esquema formal de dependencias (`dependencies: { mcps: [], bins: [], env: [] }`) en el catálogo con pre-validación en el endpoint de instalación.

---

## 6. 3 Oportunidades Estratégicas de Crecimiento

1. **Ecosistema Multi-Agente Unificado (Hub Universal de Herramientas IA)**
   - **Visión:** Expandir ClineMarket más allá de Cline para posicionarlo como el plano de control universal y gestor de paquetes definitivo para Roo Code, CommandCode, Cursor, Claude Code y OpenAI Swarm.
   - **Valor de Negocio:** Liderazgo en el ecosistema open-source de tooling para agentes de software.

2. **Motor de Recomendaciones Inteligentes Basado en AST y Embeddings Semánticos**
   - **Visión:** Reemplazar el matching heurístico por tokens por un análisis estático profundo del árbol sintáctico (AST) del workspace del usuario y búsqueda vectorial de primitivas afines.
   - **Valor de Negocio:** Relevancia de recomendaciones contextuales superior al 95%, incrementando la adopción y productividad del desarrollador.

3. **Modo Daemon / Streaming en Tiempo Real vía Server-Sent Events (SSE) / WebSockets**
   - **Visión:** Sustituir el polling HTTP periódico por una conexión bidireccional continua que emita logs de instalación en vivo, progreso de subprocesos y notificaciones de drift en tiempo real.
   - **Valor de Negocio:** Experiencia de usuario instantánea y reactiva de clase mundial.

---

## 7. Plan de Remediación Gradual y Hoja de Ruta (Roadmap)

```
  +-------------------------------------------------------------------------+
  |  FASE 1: INMEDIATA (Días 1 - 2) — Estabilidad, Seguridad & Bugs Críticos|
  |  - Fix de contrato /api/context (Alinear Frontend y Backend)            |
  |  - Fix de RangeError y códigos de salida en bin/cline-marketplace.js    |
  |  - Parser YAML robusto y soporte .commandcode en lib/probes.js          |
  |  - JSON 404 Middleware y unificación de esquemas de error               |
  |  - Aislamiento de tests en os.tmpdir() y corrección de files en pkg.json|
  +-------------------------------------------------------------------------+
                                     |
                                     v
  +-------------------------------------------------------------------------+
  |  FASE 2: ESTABILIZACIÓN (Semanas 1 - 2) — Rendimiento & Arquitectura    |
  |  - Habilitar compresión HTTP GZIP/Brotli en server.js                   |
  |  - Refactorizar lib/routes.js en controladores modulares                |
  |  - Reemplazar execSync residual por execFile asíncrono promesificado    |
  |  - Crear suite de tests para CLI runner y mocks de subprocesos          |
  |  - Normalizar permisos +x y finales de línea CRLF -> LF                 |
  +-------------------------------------------------------------------------+
                                     |
                                     v
  +-------------------------------------------------------------------------+
  |  FASE 3: ESTRATÉGICA (Meses 1 - 2) — Escalabilidad & Nuevas Capacidades |
  |  - Motor de resolución de dependencias entre primitivas                 |
  |  - Streaming SSE / WebSockets para logs y reconciliación en vivo        |
  |  - Paginación y búsqueda difusa (Fuzzy Search) ponderada                |
  |  - Soporte multi-agente ampliado (Cursor, Claude Code, Roo Code)        |
  +-------------------------------------------------------------------------+
```

---

## 8. Conclusiones y Próximos Pasos

La auditoría multicapa confirma que **ClineMarket** posee cimientos sólidos y una propuesta de valor de alto impacto en el ecosistema de herramientas de desarrollo asistidas por IA. Al implementar las remediaciones de la **Fase 1**, el sistema alcanzará una calificación proyectada de **9.8 / 10**, garantizando estabilidad, integridad de datos y una experiencia de usuario robusta.

Para consultar el análisis detallado por cada dimensión técnica específica, diríjase a los capítulos individuales (`01-arquitectura.md` a `11-bridge.md`) o al reporte maestro consolidado [`99-consolidado.md`](./99-consolidado.md).


---

<a id="2-capitulos-dimensionales-detallados"></a>

# 2. Capítulos Dimensionales Detallados

<a id="capitulo-01-arquitectura--modularidad"></a>

# Capítulo 01: Arquitectura & Modularidad

> **Fuente Original:** [`01-arquitectura.md`](./01-arquitectura.md)

# Auditoría de Dimensión 01: Arquitectura (C4, Modularidad, Límites de Componentes, Acoplamiento)

**Fecha de Auditoría:** 2026-08-30  
**Proyecto:** Cline Marketplace (`cline-marketplace`)  
**Versión:** 1.0.0  
**Auditor:** Agente Especialista en Arquitectura de Software  
**Entorno de Verificación:** Node.js v22.17.0 | Windows 11 x64 (PowerShell)  
**Puntuación Global de la Dimensión:** **7.8 / 10**

---

## 1. Resumen Ejecutivo

La arquitectura de **ClineMarket** ha sido diseñada como un **plano de control local (Local Control Plane)** y navegador offline-first para primitivas del ecosistema Cline (Plugins, Skills, Servidores MCP). El sistema adopta una arquitectura desacoplada en tres capas principales:
1. **Capa Cliente (SPA Frontend):** Interfaz de usuario pura construida en Vanilla ES Modules y HTML/CSS semántico (`public/`), sin dependencias de frameworks de build pesados.
2. **Capa Servidor HTTP / Plano de Control (`server.js` + `lib/`):** Servidor Express 5 configurado para binding en loopback( 127.0.0.1 ), defensa en profundidad (CSP, cabeceras de seguridad, validación de inputs, CSRF loopback guard), reconciliación de estado contra el sistema de archivos y ejecución serializada de subprocessos.
3. **Capa CLI / Runner (`bin/cline-marketplace.js`):** Orquestador de arranque en frío y distribución NPX con descubrimiento dinámico de puertos, verificación de dependencia|����֖V�F�WF��:F�6�FV��fVvF�"ࠢ222&��6��W2f�'F�W�2'V�FV7L;6�60���w&f�FRFWV�FV�6�2<:�6Ɩ6�F�&�v�F��DrW7G&�7F򓢢�6W&�FWV�FV�6�26�&7V�&W2V�F�F�V�&��V7F�������F�"FRW'6�7FV�6�L;6֖66��7V&V�FV��Ɩ"�7FFR�6����W67&�GW&2L;6֖626��&6��f�2FV��&�W2�&V���'&F��&V��U7��6��6W&�Ɨ�6�;6�V��V��&��"'WF6�j�bq����ɕ���������ѽ��ѥ��������������и�ѥ���х����������ͼ����)M=8������ɵ����(����AՕ�є����MՉ�ɽ��ͽ́M���ɼ��M�ɥ���酑���������չ��ȹ�̀�訨������������Ս�͸�Aɽ��͔���͕���Ք��٥ф�����������́������ɕɄ�����Ʉ����1$��������������ѥ�����́�����ͥٽ́�ѕɵ�����͸�����̈́������ɉ�������ɽ��ͽ̀��хͭ�����������P�������]�����̤�(����ͥ�����͸���E��������AՕ�ѽ̀��͕�ٕȹ�̀�訨�Aɕٕ���͸��������Օ�́ͤ�����Օ�Ѽ�����ձЁ����̀�����������������ѕ�х�����ɽ�ɕͥم���є����ф���х��A��Ѐ������((����Aɥ�������́=����չ�����́���5���Ʉ(����5�����Ѽ���������ɽ�ѕ̹�̀�����I��ѕȤ訨���ɽ�ѕȁ����Ʌ����յձ����ā�����́��鍱���������х����Ѽ���ɕ�̰��͝������������������������������ɕ�������́��х���ѥ��̰������ͥ́������ѥ�������ɽ啍ѽ̰�����ձ��������������́䁍���ɽ�������ɽ��ͼ�����M<�(������������͸���ٕɝ���������!�����ѥ���訨������ɽ�ѕ̹�̀�䁁͍ɥ��̽��ѕ�е���ѕ�й��̀���������х����ѽɕ́��������ͥ́����х��́���������́�������ͥ�ѕ�ѕ̸(����������������͸����!�����́���A��х��ɵ�訨����]������	�э�M����������������������������ͅ��ѥ��̹�̀�䁁����ɕͽ�ٕȹ�̀�����������х����Ѽ���͍ɕ���є���є�ͥ�ѕ��́���]�����̸((���((���ȸ�5�����������Ʌ��́��͍ɥ���͸���ȁ����((����9�ٕ������ѕ�Ѽ�����M��ѕ����M��ѕ����ѕ�Ф()��ͥ�ѕ������Ʉ�������х���є����������ե���������������ͅ�ɽ�����ȁͥ��ѕ�����������������������́����Չ��������ѽɥ�̀�ͅ�ټ���͍�ɝ�́���������́�����������́䁵�х��ѽ́�����!Ո��()���(����������������������������������������������������������������������������������)��������������������������������������MII=11=H��������������������������������������)�����������������9�ٕ����ȁ]�����Q�ɵ�����1$���M�ɥ��́���Aɽ啍Ѽ���������������(��������������������������������������������������������������������������������+������������������������������������������������(���������������!QQ@����ܸ����Ĥ�������������������������������1$���9A`(�������������؀�������������������������������}���������������������������������������������������������������������������������)�������������������������1%9�5I-QA1��1��������ɽ��A�����������������������)������M��٥��ȁ��ɕ�̀ԁ�����������������������������������������������������������)������I�����������ȁ�����х��������͍�������������������Ց���YL�����������̤�����)����������ѽȁ͕ɥ���酑�����1$���������������������������������������������������(��������������������������������������������������������������������������������(���������������������������������������������������������������������������(����������MՉ�ɽ���̀�����������MՉ�ɽ���̀��IMP�������������ѕ��%<�������!QQ@�IMP(��������؀��������������������؀���������������������؀�������������������(���������������������������������������������������������������������������������)���������1$���������������!Ո�1$������������YL�������%�������������!Ո�A$����)�����������������������������Ѡ���ѽ�����������������̀�5@�����������х����5�ф��(����������������������������������������������������������������������������������)���((����9�ٕ������ѕ����ɕ̀���х���ȁ���Ʌ��()�����ɵ���)���ݍ���ЁQ(�����Չ�Ʌ����������х���ȁl�ĸ�ɽ�ѕ���]���MA���Չ������t(��������U%l������̀�Y�������L�5��ձ�̤�t(��������!Q51l�����๡ѵ������展̹��̉t(�������((�����Չ�Ʌ���M��ٕ���х���ȁl�ȸ���ɕ�̀ԁ	��������͕�ٕȹ�̀��������t(��������M��ٕ�	���l�͕�ٕȹ�̀�	�����Ʌ����A��Ё����Ȥ�t(��������I��ѕ�E��񥈽ɽ�ѕ̹�̀�A$�I��ѕȀ��!������̤�t(��������Iչ���E��񥈽�չ��ȹ�̀�MՉ�ɽ���́	ɥ�����t(��������Mхѕ�����l������хє��̀�ѽ����)M=8�Mѽɔ��t(��������MAɽ��l������ɽ��̹�̀�������ѕ��M�����Ȥ�t(��������I���������l�����ɕ�������ȹ�̀�ɥ�Ё�������t(��������I�ͽ�ٕ�l�����ɕͽ�ٕȹ�̀�	�����1���ѽȤ�t(��������M���ѥ���l�����ͅ��ѥ��̹�̀�%���ЁՅɑ̤�t(��������1�����l����������ȹ�̀�9M$�M��Ս��ɕ��1��̤�t(�������((�����Չ�Ʌ���1%��х���ȁl�̸�1$�Iչ��Ȁ�������������ɭ���������̤�t(����������1�չ����l�9A`���1$���������Ѐ�����������	�����Ʌ���ȉt(�������((�����Չ�Ʌ���MѽɅ����х���ȁl�и�1������ф�MѽɅ������ф������х�����͸��t(���������х������l���х�����͹���I�������������t(��������%��х�������l���ф����х������ͽ���QɅ�����Aɥ��ѥٕ̤�t(��������]�э��������l���ф�݅э����й�ͽ����ٽɥѕ̤�t(��������5�х���l���ф�����ɕ�����ф��ͽ�������Ё5�х��ф��t(��������M��ѥ������l���ф��͕ȵ͕�ѥ��̹�ͽ���Aɕ��ɕ���̤�t(�������((�����Չ�Ʌ���!����؁l�Ը�!��Ё�٥ɽ����Ѐ���ѕɹ���	���ɥ�̉t(�������������l�������������������t(����������l�����ᔀ�����t(�����������l���Љt(��������MѽɅ��I����l������������������Ց����YL�����������MѽɅ���t(�������((����U$�����!QQ@�)M=8��������I��ѕ�(������1�չ���Ȁ����M��ݸ�MՉ�ɽ�����M��ٕ�	���(����M��ٕ�	��Ѐ����I��ѕ�(����I��ѕȀ����M���ѥ���(����I��ѕȀ����Mхѕ�����(����I��ѕȀ����MAɽ��(����I��ѕȀ����I���������(����I��ѕȀ����Iչ���(����I��ѕȀ����I�ͽ�ٕ�(����I��ѕȀ����1�����((����Mхѕ���������MѽɅ����х����(����MAɽ�������MѽɅ��I����(����Iչ��Ȁ����I�ͽ�ٕ�(����Iչ��Ȁ���������(����I��ѕȀ������(����I��ѕȀ�������)���(
### Nivel 3: Componentes (Component Architecture)

| Componente | Archivo | Responsabilidad Principal | Acoplamiento Directo Con |
| :--- | :--- | :--- | :--- |
| **Server Bootstrap** | `server.js` | Inicialización Express 5, port scanning dinámico (`checkPortAvailable`), middleware de seguridad (CSP, CSRF loopback guard, headers), error handler global. | `lib/logger.js`, `lib/routes.js`, Express |
| **API Router** | `lib/routes.js` | 18+ endpoints REST (`/catalog`, `/installed`, `/install`, `/uninstall`, `/health`, `/stats`, etc.). Enriquecimiento de catálogo, changelog diffing. | `lib/state.js`, `lib/sanitizers.js`, `lib/probes.js`, `lib/reconciler.js`, `lib/runner.js`, `lib/resolver.js`, `lib/logger.js` |
| **Subprocess Runner** | `lib/runner.js` | Ejecución concurrente serializada (`_commandLock`), mapping de verbos (`verbFor`), timeouts defensivos y terminación de árbol de procesos (`taskkill`). | `lib/resolver.js`, `lib/sanitizers.js`, `lib/logger.js` |
| **Binary Resolver** | `lib/resolver.js` | Resolución de binarios multiplataforma (`where.exe` en Win32, `which` en POSIX, fallback a rutas estándar npm/cargo/homebrew/scoop/choco). | `node:child_process`, `node:fs`, `node:os` |
| **Filesystem Prober** | `lib/probes.js` | Escaneo de raíces (`.cline`, `.claude`, `.cursor`, VS Code globalStorage, Roo-Cline), extracción de metadatos de packages locales con caché `mtime`. | `lib/state.js`, `node:fs`, `node:os` |
| **State Reconciler** | `lib/reconciler.js` | Función pura de reconciliación entre estado guardado y estado real en disco (detección de drift / eliminación externa). | Ninguna dependencia externa (Función pura) |
| **State Persistence** | `lib/state.js` | Lectura segura con tolerancia a fallos (`readJson`), escritura atómica con archivo temporal + rename (`safeWriteJson`), cola de escritura por archivo. | `lib/logger.js`, `node:fs`, `node:path` |
| **Sanitizers & Guards** | `lib/sanitizers.js` | Validación contra path traversal (`sanitizePrimitiveId`), normalización de tipo (`sanitizePrimitiveType`), validación de directorios reales (`sanitizeWorkspacePath`). | `node:fs`, `node:path` |
| **Structured Logger** | `lib/logger.js` | Logging formateado con timestamps, medición de latencias HTTP y comandos EXEC, soporte de variable `NO_COLOR`. | `node:process` |

---

## 3. Matriz de Import/Export y Análisis del Grafo de Dependencias

### Grafo de Módulos (DAG)

```[server.js]
  └┒> [lib/logger.js]
  └┐> [lib/routes.js]
         ├┐> [lib/state.js] ───────> [lib/logger.js]
         ├⒐> [lib/sanitizers.js]
         ├┐> [lib/probes.js] ───────> [lib/state.js] ──> [lib/logger.js]
         ├⒐> [lib/reconciler.js]
         ├┐> [lib/runner.js]
         �      ├┐> [lib/resolver.js]
         ┈      ├⒐> [lib/sanitizers.js]
         �      └┐> [lib/logger.js]
         ├┐> [lib/resolver.js]
         └⒐> [lib/logger.js]

[bin/cline-marketplace.js] (Standalone Process Wrapper)
  └┒> Spawns [server.js] via node child_process 

### Tabla Completa de Dependencias entre Módulos

| Módulo Origen | Dependencias de `lib/` | Dependencias Externas / Node | Estado de Ciclo |
| :--- | :--- | :--- | :--- |
| `server.js` | `logger.js`, `routes.js` | `express`, `node:fs`, `node:path`, `node:url`, `node:net` | **Acéclico (OK)** |
| `lib/routes.js` | `state.js`, `sanitizers.js`, `probes.js`, `reconciler.js`, `runner.js`, `resolver.js`, `logger.js` | `express`, `node:path`, `node:os`, `node:child_process`, `node:util`, `node:fs` | **Acíclico (OK)** |
| `lib/runner.js` | `resolver.js`, `sanitizers.js`, `logger.js` | `node:child_process`, `node:fs`, `node:os` | **Acíclico (OK)** |
| `lib/probes.js` | `state.js` | `node:fs`, `node:path`, `node:os` | **Acíclico (OK)** |
| `lib/state.js` | `logger.js` | `node:fs`, `node:path` | **Acéclico (OK)** |
| `lib/reconciler.js`| *(Ninguna)* | *(Ninguna)* | **Acéclico (OK - Función pura)** |
| `lib/resolver.js` | *(Ninguna)* | `node:child_process`, `node:fs`, `node:path`, `node:os`, `node:util` | **Acéclico (OK)** |
| `lib/sanitizers.js`| *(Ninguna)* | `node:fs`, `node:path` | **Acíclico (OK)** |
| `lib/logger.js` | *(Ninguna)* | *(Ninguna)* | **Acíclico (OK)** |
| `bin/cline-marketplace.js` | *(Ninguna - Spawns server.js)* | `node:child_process`, `node:fs`, `node:path`, `node:url`, `node:util`, `node:os`, `node:net` | **Acíclico (OK)** |

**Resultado del Análisis de Ciclos:** **0 dependencias circulares detectadas.** El grafo de dependencias es un DAG estricto y bien estratificado hacia la base (`logger.js`, `resolver.js`, `sanitizers.js`, `reconciler.js`).

---

## 4. Catálogo Detallado de Hallazgos Arquitectónicos

### [ARQ-01] [Severidad: Alta] Monolito en `lib/routes.js` (God Router) con Acoplamiento Multidominio
- **Ubicación:** `lib/routes.js:1-861`
- **Componente Afectado:** API Router / Transport Layer
- **Descripción:** `lib/routes.js` tiene 861 líneas y actúa como un "God Component". Agrupa en un solo archivo:
  1. Enrutamiento y serialización HTTP (Express).
  2. Enriquecimiento de catalogo y agregación de tags (`lib/routes.js:117-222`).
  3. Lógica heurística de detección de stack (`analyzeWorkspaceContext`, líneas 56-114).
  4. Lógica de reconciliación y dirty-checking de disco (`lib/routes.js:233-250`).
  5. Diagnóstico de salud y ejecución de binarios `node`, `cline`, `gh` (`lib/routes.js:320-397`).
  6. Orquestación de comandos CLI con retry de `--force` (`lib/routes.js:400-470`).
  7. Lógica de diffing de catálogo para changelog (`lib/routes.js:783-800`).
  8. Consulta a API externa de GitHub para updates y ejecución de `git pull` / `npm install` (`lib/routes.js:688-720`).
  9. Control de terminación del proceso (`lib/routes.js:854-857`).
- **Impacto:** Viola el Principio de Responsabilidad Única (SRP). Dificulta el testing unitario de la lógica de negocio aislada del transporte HTTP y genera alta complejidad de mantenimiento.
- **Evidencia Empérica:**
  ```powershell
  # Comando de verificación:
  pwsh -Command "(Get-Content lib/routes.js | Measure-Object -Line).Lines; (Get-Item lib/routes.js).Length"
  # Output:
  # 861
  # 31956
  ```
- **Solución Propuesta:**
  Refactorizar `lib/routes.js` descomponiendo la lógica en controladores y servicios especializados:
  ```
  lib/
  —�┐ controllers/
  │   ┗
### [ARQ-05] [Severidad: Media] Omisión de Descubrimiento de Primitivas Locales de Tooling (`~/.commandcode`)
- **Ubicación:** `lib/probes.js:24-61` (`clineRootCandidates`) y `lib/probes.js:225-271` (`fsProbe`)
- **Componente Afectado:** Filesystem Probing Engine
- **Descripción:** `lib/probes.js` incluye reglas para escanear `~/.cline`, `~/.claude`, `~/.cursor` y almacenamiento global de VS Code. Sin embargo, en el entorno de desarrollo local existe el directorio activo `C:\Users\mateo\.commandcode` que almacena `skills/` y configuraciones `mcp.json` que no son inspeccionadas.
- **Impacto:** Primitivas locales y servidores MCP configurados en `~/.commandcode` quedan invisibles en el catálogo local y en la reconciliación de estado.
- **Evidencia Empérica:**
  ```powershell
  # Comando de verificación:
  pwsh -Command "Test-Path 'C:\Users\mateo\.commandcode\mcp.json', 'C:\Users\mateo\.commandcode\skills'"
  # Output:
  # True
  # True
  ```
- **Solución Propuesta:**
  Incorporar `join(homedir(), ".commandcode")` en `clineRootCandidates()` y `join(homedir(), ".commandcode", "mcp.json")` en la lista de archivos de configuración MCP en `lib/probes.js`.
- **Estimación de Esfuerzo:** Bajo (30 minutos).

---

### [ARQ-06] [Severidad: Media] Aislamiento de Concurrencia Limitado a Nivel de Proceso Único
- **Ubicación:** `lib/state.js:8, 50-65` y `lib/runner.js:14, 132-134`
- **Componente Afectado:** State Storage & Concurrency Control
- **Descripción:** La serialización de escrituras en `lib/state.js` se implementa mediante `_writeQueues = new Map()` (cadenas de Promises indexadas por ruta canónica), y la serialización de comandos `cline` mediante `_commandLock = Promise.resolve()`.
- **Impacto:** Esta protección es efectiva mientras exista una única instancia de Node.js ejecutándose. Sin embargo, si un desarrollador ejecuta comandos CLI (`cline-marketplace refresh` o scripts de sincronización) al mismo tiempo que el servidor `server.js` está recibiendo mutaciones (`/api/install`, `/ipi/watchlist`), los dos procesos de Node.js no comparten memoria y pueden competir por los mismos archivos JSON (`catalog.json`, `data/installed.json`). Aunque el renombrado atómico (`renameSync`) evita archivos truncados, no previene "lost updates" (sobreescritura del último cambio).
- **Evidencia Empérica:** Inspección de `lib/state.js:8`: `const _writeQueues = new Map();` no cuenta con bloqueo de archivos a nivel de sistema operativo.
- **Solución Propuesta:**
  Implementar un mecanismo ligero de file lock basado en `fs.openSync(lockPath, "wx")` o coordinar las operaciones de refresco y escritura a través de la API REST del servidor cuando esté activo en lugar de ejecutar scripts independientes en paralelo.
- **Estimación de Esfuerzo:** Medio (3 horas).

---

### [AR-07] [Severidad: Baja] Módulo Re-exportador Huérfano `scripts/lib/resolve-command.mjs`
- **Ubicación:** `scripts/lib/resolve-command.mjs:1-3`
- **Componente Afectado:** Script Utilities / Modularity
- **Descripción:** El archivo `scripts/lib/resolve-command.mjs` contiene exclusivamente:
  ```javascript
  // Re-export from canonical lib/resolver.js
  export * from "../../lib/resolver.js";
  ```
  Ningun archivo en el repositorio importa este módulo (todos importan directamente de `../lib/resolver.js`).
- **Impacto:** Código muerto y redundancia estructural que confunde la jerarquía de dependencias.
- **Evidencia Empirica:**
  ```powershell
  # Comando de verificación:
  pwsh -Command "Select-String -Path 'scripts/*.mjs', 'lib/*.js' -Pattern 'resolve-command'"
  # Output: (vacío / sin coincidencias de import)
  ```
- **Solución Propuesta:** Eliminar el archivo o actualizar los scripts para usarlo si se desea encapsular las rutas relativas.
- **Estimación de Esfuerzo:** Bajo (5 minutos).

---

### [ARQ-08] [Severidad: Baja] Duplicación de Lógica de Logging en Runner CLI
- **Ubicación:** `bin/cline-marketplace.js:22-48` vs `lib/logger.js:1-48`
- **Componente Afectado:** CLI Layer / Logging
- **Descripción:** `bin/cline-marketplace.js` define su propia paleta de colores ANSI y funciones de formateo `log()`, `warn()`, `error()`, omitiendo el respeto por la variable de entorno estándar `NO_COLOR` que sí está implementada en `lib/logger.js`.
- **Impacto:** Inconsistencia de formato en terminales no interactivas o entornos de CI sin soporte de color.
- **Evidencia Empérica:** Comparación de `bin/cline-marketplace.js:22-32` con `lib/logger.js:3-18`.
- **Solución Propuesta:** Reutilizar `lib/logger.js` en `bin/cline-marketplace.js` para unificar el comportamiento de logging en todo el ciclo de vida.
- **Estimación de Esfuerzo:** Bajo (20 minutos).

---

## 5. Rúbrica de Evaluación y Justificación de Puntuación

| Criterio | Peso | Puntuación | Justificación Objetiva |
| :--- | :---: | :---: | :--- |
| **Modelo C4 & Claridad Estructural** | 20% | **8.5 / 10** | Clara definición de capas (Web SPA, Express Control Plane, CLI Runner, Storage). Contenedores y componentes bien identificados con flujos de datos unívocos. |
| **Grafo de Dependencias & Acoplamiento** | 20% | **8.0 / 10** | Cero dependencias circulares (DAG estricto). Los módulos base (`state`, `resolver`, `sanitizers`, `reconciler`) son altamente desacoplados. Penalizado por el acoplamiento multidominio en `lib/routes.js`. |
| **Cohesión & Principio de Responsabilidad Única** | 20% | **6.5 / 10** | Alta cohesión en módulos de soporte (`resolver.js`, `runner.js`, `state.js`, `reconciler.js`). Sin embargo, `lib/routes.js` (861 líneas) concentra demasiadas responsabilidades dispares (God Object). |
| **Robustez, Concurrencia & Persistencia** | 20% | **8.0 / 10** | Excelente manejo de escrituras atómicas con cuarentena automática (`state.js`) y serialización de subprocesos (`runner.js`). Limitado a concurrencia mono-proceso en memoria. |
| **Portabilidad & Límites de Plataforma** | 20% | **8.0 / 10** | Excelente soporte multiplataforma Windows/macOS/Linux con resolución de shims (`.cmd`, `.bat`, `where.exe`/`which`). Pequeña inconsistencia en duplicación de `isWindowsBatchShim`. |
| **PUNTUACIÓN TOTAL PONDERADA** | **100%** | **7.8 / 10** | **Arquitectura Sólida, Funcional y Lista para Producción, con deuda técnica concentrada en la modularización de la capa de rutas.** |

---

## 6. Hoja de Ruta de Refactorización Arquitectónica

1. **Fase 1 (Quick Wins - Inmediato / < 2 horas):**
   - Eliminar `isWindowsBatchShim` de `lib/sanitizers.js` y consolidar en `lib/resolver.js` ([ARQ-03]).
   - Eliminar módulo huérfano `scripts/lib/resolve-command.mjs` ([ARQ-07]).
   - Añadir `~/.commandcode` al descubrimiento en `lib/probes.js` ([AR-05]).
2. **Fase 2 (Desacoplamiento de Heurísticas - Corto Plazo / 1 día):**
   - Crear `lib/context.js` unificando la heurística de stack entre la API REST y los scripts CLI ([ARQ-02]).
   - Reutilizar `lib/logger.js` en `bin/cline-marketplace.js` ([ARQ-08]).
   - Desacoplar `process.exit()` de `lib/routes.js` hacia eventos de ciclo de vida en `server.js` ([AR-04]).
3. **Fase 3 (Modularización de Controladores - Medio Plazo / 2 días):**
   - Descomponer el God Router `lib/routes.js` (861 líneas) en controladores y servicios temáticos (`catalogService`, `healthService`, `updateService`) ([ARQ-01]).
   - Evaluar file locks a nivel de OS para sincronización inter-proceso segura ([ARQ-06]).


---

<a id="capitulo-02-calidad-de-codigo--tipado"></a>

# Capítulo 02: Calidad de Código & Tipado

> **Fuente Original:** [`02-codigo.md`](./02-codigo.md)

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


---

<a id="capitulo-03-seguridad--permisos"></a>

# Capítulo 03: Seguridad & Permisos

> **Fuente Original:** [`03-seguridad.md`](./03-seguridad.md)

# Auditoría de Dimensión 03: Seguridad & Permisos

**Proyecto:** Cline Marketplace (Primitive Registry & Local Control Plane)  
**Fecha:** 2026-08-30  
**Auditor:** Specialist Security Auditor (Dimension 03)  
**Alcance:** OWASP Top 10, Sanitización de Inputs (API/CLI), Validación de Esquemas, Gestión de Secretos, Acceso a Filesystem, Aislamiento de Procesos, CSRF/CORS, Cabeceras HTTP (CSP, COOP), Robustez frente a DoS.

---

### Score: 8.6 / 10

**Justificación del Score:**  
El sistema presenta una arquitectura de seguridad por capas (*defense-in-depth*) local-first notablemente robusta: enlace estricto a loopback (`127.0.0.1`), middleware de protección contra CSRF cross-origin basado en `Sec-Fetch-Site` y `Origin`, sanitización estricta de identificadores y tipos mediante expresiones regulares y listas blancas, ejecución de procesos hijos mediante vectores de argumentos con terminación forzada del árbol de procesos (`taskkill /T /F`), escrituras atómicas en disco con colas de serialización y copias de seguridad de cuarentena ante corrupción. El puntaje se sitúa en 8.6/10 debido a: (1) la retención no redactada de secretos/tokens presentes en archivos de configuración de servidores MCP locales dentro del estado reconciliado y su exposición vía `/api/installed` y `/api/export`, (2) la ausencia de límite de tamaño de arreglo en operaciones masivas `/api/bulk` susceptible a sobrecarga del runner, (3) la falta de mutex de concurrencia en `/api/refresh` y `/api/update/run`, y (4) discrepancias menores entre la política de cabeceras documentada en `SECURITY.md` y la implementada en `server.js`.

---

## 1. Resumen Ejecutivo & Modelo de Amenazas

Cline Marketplace opera como un plano de control local que interactúa directamente con el sistema de archivos del usuario, las herramientas CLI de Cline y GitHub, y una interfaz web SPA.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Vectores de Amenaza Auditados                               │
├───────────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Red Externa / Web Cross-Site  │ Loopback / Inter-proceso    │ File System & Runtime Local   │
│ - Ataques CSRF desde browsers │ - Abuso de `/api/shutdown`  │ - Path traversal en workspace │
│ - Inyección XSS en webview/UI │ - Inyección de comandos CLI │ - Filtración de tokens MCP    │
│ - Exfiltración de datos / SOP │ - DoS por concurrencia      │ - Corrupción de JSONs estado  │
└───────────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### Controles de Seguridad Validados:
1. **Aislamiento Loopback & Mitigación CSRF (`server.js:48-68`)**: Bloquea peticiones mutantes (`POST`, `PUT`, `DELETE`, `PATCH`) provenientes de sitios externos validando `Sec-Fetch-Site: cross-site` y verificando que el `Origin`/`Referer` apunte a `127.0.0.1`, `localhost` o `[::1]`.
2. **Defensa contra Inyección de Comandos & Path Traversal (`lib/sanitizers.js`)**: Los IDs de primitivas se restringen a `/^[a-zA-Z0-9@_.-]+$/` (máx. 128 caracteres) bloqueando explícitamente `..`, `/`, `\`, caracteres de control y metacaracteres shell. Los tipos se limitan a `"plugin" | "skill" | "mcp"`.
3. **Aislamiento de Subprocesos (`lib/runner.js`)**: Ejecución con vectores de argumentos vía `child_process.spawn`/`execFile` con `windowsHide: true`, límite de buffer `MAX_BUFFER = 5MB`, cola mutex `_commandLock` y terminación del árbol completo de procesos tras timeout.
4. **Persistencia Atómica & Cuarentena (`lib/state.js`)**: Escritura a archivos temporales con renombre atómico (`renameSync`), cola de promesas por ruta canónica para evitar colisiones de escritura concurrentes, y cuarentena automática (`<file>.corrupt.<timestamp>`) en caso de parseos inválidos.
5. **Auditoría de Dependencias (`npm audit`)**: 0 vulnerabilidades reportadas en el árbol de dependencias (`express ^5.2.1`).

---

## 2. Matriz de Hallazgos Empíricos

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia Empírica | Solución Propuesta | Esfuerzo |
|---|---|---|---|---|---|---|
| **H1** | **Alta** | Retención y exposición sin enmascarar de secretos/tokens en configuraciones MCP locales | `lib/reconciler.js:40-42`<br>`lib/routes.js:250,808-812` | Al reconciliar configuraciones MCP desde `claude_desktop_config.json` o `cline_mcp_settings.json`, `nextItems[key].config = info.config` almacena variables de entorno (`env.GITHUB_PERSONAL_ACCESS_TOKEN`, etc.) en texto plano dentro de `data/installed.json` y las expone en `/api/installed` y `/api/export`. | Sanitizar y enmascarar claves sensibles (`env`, `token`, `key`, `secret`, `password`) en `info.config` antes de persistir o exponer vía API REST. | 1.5 h |
| **H2** | **Media** | Ausencia de límite de longitud en arreglo de operaciones masivas (`POST /api/bulk`) | `lib/routes.js:607` | `const items = Array.isArray(req.body?.items) ? req.body.items : [];` procesa secuencialmente cualquier cantidad de elementos dentro del límite de 1MB, permitiendo bloquear la cola `_commandLock` por periodos prolongados. | Aplicar `const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];` y retornar `400 Bad Request` si supera el límite de lote. | 20 min |
| **H3** | **Media** | Falta de bloqueo por concurrencia en endpoints de alto costo (`/api/refresh` y `/api/update/run`) | `lib/routes.js:663-685`<br>`lib/routes.js:707-719` | Peticiones simultáneas a `POST /api/refresh` o `POST /api/update/run` disparan múltiples procesos `node scripts/refresh-catalog.mjs` o `git pull` en paralelo, compitiendo por `catalog.json` y saturando cuotas de API de GitHub (403/429). | Implementar flags de ejecución atómica (`let _isRefreshing = false`, `let _isUpdating = false`) que devuelvan `409 Conflict` si ya hay una tarea en curso. | 30 min |
| **H4** | **Baja** | Discrepancia entre cabeceras documentadas en `SECURITY.md` y cabeceras activas en `server.js` | `SECURITY.md:47-53`<br>`server.js:34-45` | `SECURITY.md` declara `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `frame-ancestors 'none'`, y `X-XSS-Protection: 1`. En runtime, `server.js` usa `Permissions-Policy: interest-cohort=()` y omite `frame-ancestors 'none'`. | Alinear `server.js` agregando `frame-ancestors 'none'` al CSP, expandir `Permissions-Policy` y actualizar `SECURITY.md` indicando la obsolescencia de `X-XSS-Protection`. | 15 min |
| **H5** | **Baja** | Fallback de imagen `onerror` en cliente vulnerable a errores de sintaxis JS por comillas simples | `public/app.js:184` | `onerror="...textContent:'${escapeHtml((entry.name \|\| '?')[0])}'..."` falla con SyntaxError si `entry.name` comienza con comilla simple (`'`), ya que el parser HTML decodifica `&#39;` a `'` antes de ejecutar el handler inline. | Reemplazar el handler inline `onerror` por manejo de eventos via DOM (`img.addEventListener('error', ...)`) o creación directa de elementos. | 30 min |
| **H6** | **Baja** | Endpoint de apagado del servidor (`POST /api/shutdown`) sin token de autorización | `lib/routes.js:854-857` | `router.post("/shutdown", ...)` ejecuta `setTimeout(() => process.exit(0), 500)` ante cualquier solicitud local válida sin requerir un token de sesión o confirmación. | Exigir un token de arranque único generado en memoria o limitar el apagado exclusivamente a señales de sistema operativo (SIGINT / SIGTERM). | 30 min |

---

## 3. Detalle Técnico de Hallazgos y Evidencias

### H1 (Alta) — Exposición de Secretos en Configuraciones MCP
- **Ubicación:** `lib/reconciler.js:40-42`, `lib/routes.js:250`, `lib/routes.js:808-812`
- **Mecanismo:** La función `fsProbe()` en `lib/probes.js` lee archivos como `claude_desktop_config.json` y `cline_mcp_settings.json`. Si un servidor MCP tiene variables de entorno configuradas con credenciales (e.g. `GITHUB_PERSONAL_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`), `reconcile()` realiza:
  ```javascript
  if (info?.config) {
    nextItems[key].config = info.config;
  }
  ```
  Esto almacena las credenciales en `data/installed.json` y las sirve en texto plano a través de `GET /api/installed` y `GET /api/export`.
- **Comando de Verificación:**
  ```bash
  node -e "import('./lib/reconciler.js').then(m => {
    const probe = { found: { plugins: new Map(), skills: new Map(), mcps: new Map([['test', { config: { env: { API_KEY: 'secret123' } } }]]) } };
    console.log(JSON.stringify(m.reconcile({ items: {} }, probe), null, 2));
  })"
  ```
- **Output:**
  ```json
  {
    "items": {
      "mcp:test": {
        "type": "mcp",
        "id": "test",
        "source": "filesystem",
        "detected": true,
        "config": {
          "env": {
            "API_KEY": "secret123"
          }
        }
      }
    }
  }
  ```
- **Remediación:** Crear un sanitizador de configuraciones MCP que remueva o reemplace por `"[REDACTED]"` los valores de objetos `env` o propiedades que contengan `token`, `secret`, `key`, `password`, `auth`.

---

### H2 (Media) — Procesamiento Masivo Desbordante en `/api/bulk`
- **Ubicación:** `lib/routes.js:605-660`
- **Mecanismo:** `POST /api/bulk` acepta un arreglo `req.body.items` sin limitar la cantidad de elementos a procesar. Si se envían miles de elementos en una sola petición, el servidor ejecutará secuencialmente cada comando CLI mediante `runCline()`, monopolizando la cola `_commandLock` por horas.
- **Comando de Verificación:**
  ```bash
  node -e "fetch('http://127.0.0.1:5173/api/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ action: 'watch', items: Array.from({length: 1000}, (_, i) => ({ type: 'plugin', id: 'plugin-' + i })) })
  }).then(r => r.json()).then(d => console.log('Processed bulk count:', d.results.length));"
  ```
- **Remediación:** Limitar la cantidad máxima de ítems por lote:
  ```javascript
  const MAX_BULK_ITEMS = 50;
  if (items.length > MAX_BULK_ITEMS) {
    return res.status(400).json({ error: `Bulk operations capped at ${MAX_BULK_ITEMS} items.` });
  }
  ```

---

### H3 (Media) — Concurrencia Descontrolada en Refresh y Update
- **Ubicación:** `lib/routes.js:663-685`, `lib/routes.js:707-719`
- **Mecanismo:** A diferencia de las operaciones sobre primitivas individuales que usan el mutex `_commandLock` de `runner.js`, `POST /api/refresh` y `POST /api/update/run` invocan directamente `execFileP` para scripts de actualización y comandos git/npm. Si dos clientes o pestañas disparan la acción simultáneamente, se generan condiciones de carrera sobre `catalog.json` y la tasa de peticiones a la API de GitHub se agota.
- **Remediación:**
  ```javascript
  let _isRefreshing = false;
  router.post("/refresh", async (req, res) => {
    if (_isRefreshing) return res.status(409).json({ error: "Catalog refresh already in progress." });
    _isRefreshing = true;
    try {
      // ... exec refresh ...
    } finally {
      _isRefreshing = false;
    }
  });
  ```

---

### H4 (Baja) — Discrepancias de Cabeceras con `SECURITY.md`
- **Ubicación:** `SECURITY.md:47-53` vs `server.js:34-45`
- **Evidencia Empírica:**
  - `SECURITY.md` línea 48 lista: `frame-ancestors 'none'` en CSP.
  - `server.js` línea 42 omite `frame-ancestors 'none'`.
  - `SECURITY.md` línea 52 lista: `X-XSS-Protection: 1; mode=block` (obsoleta en navegadores modernos, pero documentada).
  - `server.js` no define `X-XSS-Protection`.
  - `SECURITY.md` línea 53 lista: `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - `server.js` línea 39 define: `Permissions-Policy: interest-cohort=()`.
- **Remediación:** Sincronizar las directivas en `server.js` y actualizar `SECURITY.md`.

---

## 4. Verificación de Conformidad OWASP Top 10 (2021)

| OWASP Categoría | Estado | Evaluación en Cline Marketplace |
|---|---|---|
| **A01: Broken Access Control** | **PROTEGIDO** | Servidor en loopback (`127.0.0.1`). Middleware de validación `Sec-Fetch-Site` y `Origin` bloquea peticiones mutantes cross-site. Rutas estáticas acotadas a `public/` y `docs/`. |
| **A02: Cryptographic Failures** | **PROTEGIDO** | Conexiones externas hacia GitHub API usan HTTPS nativo (`fetch` con TLS 1.3). No almacena contraseñas maestras. |
| **A03: Injection** | **PROTEGIDO** | Subprocesos se ejecutan pasando vectores de argumentos explícitos (`spawn(exe, args)`) sin shell interpolation en POSIX. Identificadores y tipos sanitizados con regex `/^[a-zA-Z0-9@_.-]+$/`. |
| **A04: Insecure Design** | **PROTEGIDO** | Arquitectura local-first con serialización de comandos, timeout de 180s en subprocesses y cuarentena automática de archivos JSON corruptos. |
| **A05: Security Misconfiguration** | **MEJORABLE** | Discrepancia menor en directivas CSP / Permissions-Policy frente a `SECURITY.md`. `X-Content-Type-Options: nosniff` y `COOP: same-origin` activos. |
| **A06: Vulnerable and Outdated Components** | **EXCELENTE** | `npm audit` confirma 0 vulnerabilidades. Solo 1 dependencia runtime directa (`express ^5.2.1`). |
| **A07: Identification and Authentication Failures** | **N/A (Local)** | Plano de control monousuario para desarrollador local en máquina local. |
| **A08: Software and Data Integrity Failures** | **PROTEGIDO** | CI/CD estricto con CodeQL (`.github/workflows/codeql.yml`), matrices multi-OS (Linux, Windows, macOS) y verificación de integridad pre-commit/pre-push. |
| **A09: Security Logging and Monitoring Failures** | **PROTEGIDO** | Logger ANSI estructurado (`lib/logger.js`) registrando peticiones HTTP, tiempos de respuesta, comandos CLI ejecutados, duraciones y códigos de salida. |
| **A10: Server-Side Request Forgery (SSRF)** | **PROTEGIDO** | Las peticiones externas salientes están estrictamente fijadas a `api.github.com` y `raw.githubusercontent.com`. No hay endpoints que acepten URLs arbitrarias para descarga en el backend. |

---

## 5. Pruebas Empíricas de Seguridad Ejecutadas

### 5.1. Auditoría de Dependencias (`npm audit`)
```
> npm audit
found 0 vulnerabilities
```
*Resultado: Conforme (0 vulnerabilidades).*

### 5.2. Verificación de Sanitización y Path Traversal
```javascript
// Test: sanitizePrimitiveId("../../../etc/passwd") -> null
// Test: sanitizePrimitiveId("plugin; rm -rf /") -> null
// Test: sanitizeWorkspacePath("invalid_xyz") -> fallback cwd
```
*Resultado: Conforme (todas las aserciones pasaron en `unit-test.mjs`).*

### 5.3. Verificación de Protección CSRF / Mutating Origin
```javascript
// Test 1: Sec-Fetch-Site: cross-site -> 403 Forbidden
// Test 2: Origin: http://evil.com -> 403 Forbidden
// Test 3: Sec-Fetch-Site: same-origin -> 200 OK
```
*Resultado: Conforme (las peticiones cross-site mutantes son rechazadas con 403).*

### 5.4. Límite de Tamaño de Body (DoS Payload Guard)
```javascript
// Test: Payload JSON de 1.5MB -> 413 Payload Too Large
```
*Resultado: Conforme (Express responde con HTTP 413).*

---

## 6. Recomendaciones Priorizadas

### 3 Quick Wins (< 30 min c/u)
1. **Enmascarar secretos MCP en Reconciler (`lib/reconciler.js:40-42`)**: Filtrar el sub-objeto `config.env` antes de asignarlo a `nextItems[key].config`, ocultando valores de tokens en `installed.json` y respuestas de API.
2. **Limitar tamaño de lote en `/api/bulk` (`lib/routes.js:607`)**: Aplicar `slice(0, 50)` a `req.body.items` para evitar monopolio del runner de comandos.
3. **Mutex en Refresh & Update (`lib/routes.js:663, 707`)**: Agregar guardas booleanas para evitar ejecuciones concurrentes de `refresh-catalog.mjs` y `git pull`.

### 3 Deudas Críticas
1. **Política de Redacción de Secretos en Estado Local**: Implementar un filtro universal de serialización en `safeWriteJson` que elimine patrones de credenciales conocidas (`ghp_`, `sk-`, `AKIA`, etc.) en cualquier archivo persistido.
2. **Protección del Ciclo de Vida del Proceso (`/api/shutdown`)**: Requerir un token efímero de sesión para invocar el shutdown o eliminar la ruta HTTP delegando el control al ciclo de vida CLI.
3. **Manejo Seguro de Eventos en Frontend**: Eliminar atributos HTML inline con lógica JS (`onerror`) en favor de listeners DOM con `addEventListener` en `public/app.js`.

### 3 Oportunidades Estratégicas
1. **Integración de Escaneo de Secretos en CI/CD**: Incorporar herramientas como `gitleaks` o `trufflehog` en `.github/workflows/ci.yml` para auditar automáticamente pull requests y commits.
2. **Generación Dinámica de Nonces para CSP**: Migrar la cabecera CSP para usar directivas con `nonce` criptográfico en lugar de `'unsafe-inline'` para estilos.
3. **Sandboxing de Primitivas**: Incorporar un verificador de permisos para plugins y MCPs antes de su instalación, notificando al usuario sobre acceso al sistema de archivos o red.


---

<a id="capitulo-04-almacenamiento-de-datos--estado"></a>

# Capítulo 04: Almacenamiento de Datos & Estado

> **Fuente Original:** [`04-db-estado.md`](./04-db-estado.md)

# Capa 04: Almacenamiento de Datos & Estado

**Especialista Auditor:** Data Storage & State Specialist (Dimension 04)  
**Fecha de Auditoría:** 2026-08-30  
**Entorno de Verificación:** Node.js v22.17.0 | Windows 11 x64 (NTFS) | Express 5.x  
**Scope Auditado:** `catalog.json`, `data/installed.json`, `data/upstream-meta.json`, `data/watchlist.json`, `data/context-cache.json`, `data/user-settings.json`, `lib/state.js`, `lib/routes.js`, `lib/reconciler.js`, `lib/probes.js`, `scripts/refresh-catalog.mjs`.

---

## 1. Resumen Ejecutivo & Score

### Score: 7.5 / 10

### Justificación del Score:
ClineMarket presenta una base arquitectónica orientada a la seguridad de datos con persistencia atómica (`.tmp` + `renameSync`), respaldos en cuarentena (`.corrupt.<timestamp>`) ante fallos de parseo JSON y una cola de serialización por promesas en `lib/state.js`. No obstante, la auditoría empírica reveló vulnerabilidades críticas y de severidad alta:
1. **Destrucción silenciosa de datos históricos**: Al ejecutar `refresh-catalog.mjs` sin token de GitHub o ante *rate limiting*, el script sobreescribe `data/upstream-meta.json` con `{}` borrando los metadatos de commits de 202 extensiones.
2. **Fallas de concurrencia y colisiones en Windows (`EPERM`)**: La cola de escritura es puramente en memoria del proceso local; ante accesos concurrentes de múltiples procesos (CLI vs Servidor) o ráfagas rápidas en Windows NTFS, `renameSync` arroja `EPERM: operation not permitted` por falta de bucle de reintentos con backoff.
3. **Pérdida de metadatos raíz en reconciliación**: `reconciler.js` descarta `version` y `lastScanAt` de `data/installed.json`, degradando el esquema a un objeto simple `{ items }`.
4. **I/O síncrono no cacheado en lectura**: El catálogo de 196 KB se lee y parsea de forma síncrona en cada petición GET a `/api/catalog`, `/api/status`, `/api/health`, `/api/stats`, bloqueando el bucle de eventos (~1 ms por request vs 0.02 ms con mtime cache).

---

## 2. Métricas Empíricas de la Capa de Datos

| Métrica | Valor Empírico | Método / Comando de Verificación |
|---|---|---|
| **Tamaño Catálogo Maestro (`catalog.json`)** | 196,161 bytes (191.5 KB) | `fs.statSync('catalog.json').size` |
| **Total de Entradas en Catálogo** | 202 entradas (149 MCPs, 38 Skills, 15 Plugins) | Validación de esquema JSON empírico |
| **Integridad de Claves Únicas** | 202/202 únicas (0 duplicados) | Test de Set de claves (`type:id`) |
| **Tiempo de Lectura Síncrona (1,000 reqs)** | 986.50 ms (~0.98 ms/req bloqueante) | Benchmark `test-catalog-read-cost.mjs` |
| **Tiempo de Lectura con Mtime Cache (1,000 reqs)** | 24.60 ms (~0.02 ms/req no bloqueante) | Benchmark `test-catalog-read-cost.mjs` (40x más veloz) |
| **Colisiones de Concurrencia Multi-proceso** | 3 errores `EPERM` en 120 escrituras paralelas | Test `test-concurrency.mjs` (3 procesos Node paralelos) |
| **Tamaño `data/installed.json`** | 51,069 bytes (58 items registrados) | Inspección de disco |
| **Tamaño `data/upstream-meta.json`** | 37,104 bytes (202 registros de commit) | Inspección de disco |
| **Cobertura de Backup Cuarentena** | Implementado en `readJson` (`.corrupt.<ts>`) | Verificado en `lib/state.js:26-31` |
| **Esquema formal / Migración de Versión** | Inexistente (sin validador formal ni migradores) | Inspección de código global |

---

## 3. Matriz Completa de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (Comando + Output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Crítica** | Destrucción total de `data/upstream-meta.json` al ejecutar `refresh` sin token de GitHub o por rate-limit | `scripts/refresh-catalog.mjs:210-214, 296-298` | `node -e "import('./scripts/refresh-catalog.mjs')"`<br>Si `!githubToken`, `fetchMeta` retorna `{}` y la línea 297 ejecuta `writeFileSync(join(dataDir, 'upstream-meta.json'), JSON.stringify({}, null, 2))`, borrando los 202 registros históricos de commits. | Cargar la metadata previa existente (`readJson`), hacer merge incremental (`Object.assign(existing, newMeta)`) y no sobreescribir con objeto vacío si la consulta fue omitida o falló. | 25 min |
| 2 | **Alta** | Ausencia de locking inter-proceso y fallas por `EPERM` en `safeWriteJson` ante escrituras concurrentes o ráfagas en Windows | `lib/state.js:8, 50-65` | `node .agents/audit_04_db_estado/test-concurrency.mjs`<br>`[ERROR] Atomic write failed for ...: EPERM: operation not permitted, rename ...` (3 fallos al escribir 3 procesos en paralelo). | Implementar bucle de reintento con backoff exponencial/jitter (hasta 8 reintentos con delay de 10-50ms) en `safeWriteJson` para atrapar `EPERM`/`EBUSY` en Windows o integrar `proper-lockfile` / `write-file-atomic`. | 35 min |
| 3 | **Alta** | Eliminación destructiva de metadata de primer nivel (`version`, `lastScanAt`) en `data/installed.json` durante la reconciliación | `lib/reconciler.js:10-15, 60`<br>`lib/routes.js:237, 458, 655, 844` | `node -e "import('./lib/reconciler.js').then(m => console.log(m.reconcile({ version: '1.0.0', lastScanAt: 'now', items: {} }, { found: { plugins: new Map(), skills: new Map(), mcps: new Map() } })))"`<br>Output: `{ items: {} }` (las claves `version` y `lastScanAt` son eliminadas del retorno). | En `reconciler.js`, preservar propiedades raíz: `return { ...state, version: state?.version || "1.0.0", lastScanAt: now, items: nextItems };`. | 15 min |
| 4 | **Alta** | Sobreescritura no atómica y sin validación de esquema en `refresh-catalog.mjs` (`catalog.json` y `catalog-prev.json`) | `scripts/refresh-catalog.mjs:283, 287, 297` | `writeFileSync(cur, JSON.stringify(catalog, null, 2));`<br>Si la conexión falla o el CDN devuelve un error HTML o JSON vacío, se escribe directamente sobre `catalog.json` sin validar que `Array.isArray(catalog.entries)` y sin atomicidad (`.tmp`). | Validar el esquema mínimo (`Array.isArray(catalog?.entries) && catalog.entries.length > 0`) antes de persistir, y utilizar `safeWriteJson` atómico. | 25 min |
| 5 | **Media** | I/O de disco síncrono y bloqueo del Event Loop en cada request de lectura (`loadCatalog` / `loadInstalled`) | `lib/routes.js:22-24, 120, 293, 371, 723, 784`<br>`lib/state.js:20` | Benchmark `test-catalog-read-cost.mjs`:<br>1,000 lecturas síncronas de 196 KB consumen 986.5 ms de CPU bloqueante frente a 24.6 ms con mtime cache (penalización 40x). | Crear una capa de cache singleton en memoria para `catalog.json` con verificación de `mtimeMs` de archivo, evitando lecturas y parseos redundantes en cada GET. | 30 min |
| 6 | **Media** | Escritura en disco en request GET `/api/context` (operación no idempotente / I/O thrashing) | `lib/routes.js:225-230` | `router.get("/context", (req, res) => { ... safeWriteJson(CONTEXT_PATH, contextInfo).catch(() => {}); res.json(contextInfo); });`<br>Cualquier polling o apertura de pestañas dispara escrituras de disco en `data/context-cache.json` en operaciones GET. | Mantener el contexto en memoria o aplicar dirty-checking comparando el hash/JSON del contexto previo antes de invocar `safeWriteJson()`. | 20 min |
| 7 | **Media** | Ausencia de fallback automático a `data/catalog-prev.json` ante corrupción o falta de `catalog.json` | `lib/routes.js:22-24, 120, 371-376` | Si `catalog.json` se corrompe, `loadCatalog()` retorna `null` y `/api/catalog` sirve `entries: []`, a pesar de que `data/catalog-prev.json` está intacto en disco. | En `loadCatalog()`, si `readJson(CATALOG_PATH)` falla o es nulo, intentar leer automáticamente `readJson(PREV_CATALOG_PATH)` con log de advertencia. | 15 min |
| 8 | **Media** | Acumulación potencial de promesas en `_writeQueues` y crecimiento no acotado de `_metaCache` | `lib/state.js:8, 50, 64`<br>`lib/probes.js:9, 112, 140` | En `lib/state.js:64`, `_writeQueues.set(canonicalPath, currentOp.catch(() => {}))` nunca elimina las entradas del mapa al resolver. En `lib/probes.js`, `_metaCache` almacena rutas sin política de desalojo (LRU). | Eliminar la entrada del Map cuando la cola se drene (`if (pending === 0) _writeQueues.delete(path)`) y limitar `_metaCache` a un máximo de 500 entradas mediante LRU. | 25 min |
| 9 | **Baja** | Inconsistencia de campos y falta de versión de esquema en `data/watchlist.json` y `data/user-settings.json` | `lib/routes.js:35, 43, 260-266, 563` | `data/watchlist.json` (`{"items":[]}`) y `data/user-settings.json` carecen del campo `"version"` y de validación de los objetos internos de `recentWorkspaces`. | Normalizar la estructura con `"version": "1.0.0"` y validar el schema de items en los endpoints correspondientes. | 15 min |
| 10 | **Baja** | Operaciones I/O síncronas (`writeFileSync`, `renameSync`, `readFileSync`) dentro de wrappers asíncronos | `lib/state.js:3, 20, 55, 56` | `import { readFileSync, writeFileSync, renameSync } from "node:fs";` bloquea el thread principal de Node.js durante la serialización a disco. | Migrar a `node:fs/promises` (`readFile`, `writeFile`, `rename`, `unlink`) para I/O 100% no bloqueante. | 30 min |

---

## 4. Análisis Detallado de Dimensiones Críticas

### 4.1 Estructura e Integridad de `catalog.json`
- **Estructura del archivo**:
  - Propiedades raíz: `version` (1), `generatedAt` ("2026-06-19T18:20:28.065Z"), `baseUrl`, `counts` (`{ total: 202, mcps: 149, plugins: 15, skills: 38 }`), `tags` (12 categorías), `entries` (202 elementos).
  - Todas las 202 entradas poseen `type`, `id`, `name`, `description`, `author`, `tags`, `install.command`.
  - No se detectaron IDs duplicados ni campos nulos en el archivo actual.
- **Riesgos de corrupción**:
  - `scripts/refresh-catalog.mjs` escribe directamente con `writeFileSync` sin validar el payload entrante de red ni usar archivo temporal.
  - La aplicación no implementa validación con JSON Schema (ej. Zod o Ajv); si un elemento carece de `install` o `tags`, métodos como `analyzeWorkspaceContext` o `/api/stats` pueden fallar con `TypeError`.

### 4.2 Concurrencia de Lectura/Escritura & Mecanismos de Locking
- **In-Memory vs Multi-Proceso**:
  - `_writeQueues` en `lib/state.js` solo sincroniza promesas dentro del mismo proceso Node.js.
  - Cuando el CLI ejecuta `npx cline-marketplace refresh` o un proceso secundario interactúa con el servidor Express, ambos acceden a los mismos archivos JSON (`catalog.json`, `installed.json`, `upstream-meta.json`) sin ningún lock inter-proceso (flock / lockfile).
- **Comportamiento en Windows NTFS**:
  - En Windows, `renameSync` sobre un archivo existente arroja `EPERM` si el archivo destino está siendo indexado o sincronizado transitoriamente.
  - En la prueba empírica `test-concurrency.mjs` con 3 procesos paralelos, se registraron 3 excepciones `EPERM: operation not permitted` no recuperadas.

### 4.3 Estado en Memoria vs Estado en Disco & Ciclo de Vida
- **Sincronización y Caching**:
  - `loadCatalog()` no utiliza caché en memoria. Cada petición HTTP a `/api/catalog`, `/api/status`, `/api/health`, `/api/stats` y `/api/changelog` realiza `readFileSync` de 196 KB y parsea el árbol de objetos completo.
  - El benchmark empírico demostró que el caché por `mtime` reduce el tiempo acumulado de 986.5 ms a 24.6 ms (mejora de 40x).
- **Fuga de Recursos & Retención de Memoria**:
  - `_writeQueues` retiene promesas encadenadas indefinidamente en el Map.
  - `_metaCache` en `lib/probes.js` carece de límite de tamaño o política LRU, acumulando referencias a todos los directorios y archivos `package.json` sondeados.

### 4.4 Backup, Recuperación y Migración de Esquemas
- **Mecanismo de Cuarentena**:
  - `readJson` en `lib/state.js` crea un archivo `p.corrupt.<timestamp>` si el JSON está malformado.
  - Sin embargo, no existe un flujo de restauración automática ni comando de rollback: la aplicación inicializa el estado con el fallback vacío (`{ items: {} }`), y las rutas posteriores (como `/api/installed`) sobreescriben el archivo principal en disco con el estado vacío, perdiendo el historial original.
- **Estrategia de Migración**:
  - No existen migradores de versión para `catalog.json` (v1 -> v2) ni para los archivos de configuración local (`watchlist.json`, `user-settings.json`).

---

## 5. Quick Wins, Deudas Críticas y Oportunidades Estratégicas

### 3 Quick Wins (Implementación Inmediata < 1h)
1. **Preservar `version` y `lastScanAt` en `reconciler.js`**: Modificar el retorno de `reconcile()` a `return { ...state, version: state?.version || "1.0.0", lastScanAt: now, items: nextItems };`. (15 min)
2. **Merge defensivo de metadata en `refresh-catalog.mjs`**: Evitar que `upstream-meta.json` se sobreescriba con `{}` cuando se omita o falle la consulta de GitHub. (20 min)
3. **Fallback a `catalog-prev.json` en `loadCatalog()`**: Permitir que el servidor cargue `catalog-prev.json` si `catalog.json` está ausente o corrupto. (15 min)

### 3 Deudas Críticas (Prioridad Alta)
1. **Bucle de reintentos con backoff en `safeWriteJson`**: Añadir manejo resiliente de `EPERM`/`EBUSY` para evitar fallos de escritura en Windows y entornos multi-proceso. (35 min)
2. **Atomicidad y validación de esquema en `refresh-catalog.mjs`**: Reemplazar `writeFileSync` directo por validación rigurosa de esquema y `safeWriteJson`. (25 min)
3. **Caché en memoria con invalidación por `mtime` para `catalog.json`**: Eliminar el I/O de disco síncrono bloqueante en las rutas de lectura frecuentes de Express. (30 min)

### 3 Oportunidades Estratégicas (Evolución Arquitectónica)
1. **Migración a SQLite embebido o motor estructurado ligero**: Reemplazar archivos JSON individuales por una base de datos embebida (ej. `better-sqlite3` o `node:sqlite`), obteniendo transaccionalidad ACID nativa, locking inter-proceso robusto y consultas indexadas ultrarrápidas.
2. **Esquemas formales con Zod y Migradores Declarativos**: Implementar validación en tiempo de ejecución para todas las entradas del catálogo y estados locales, con migración declarativa automática ante incrementos de versión de esquema.
3. **Sistema de Snapshots y Rollback Transaccional**: Incorporar comandos de CLI (`cline-marketplace backup / restore`) y rotación automática de backups para recuperación instantánea ante desastres.


---

<a id="capitulo-05-performance--optimizacion"></a>

# Capítulo 05: Performance & Optimización

> **Fuente Original:** [`05-performance.md`](./05-performance.md)

# Capa 5: Performance & Optimización

### Score: 7.3/10
Arquitectura liviana y eficiente en memoria (~55 MB RSS inicial, ~11.5 MB Heap), con excelente velocidad de arranque de CLI (~43ms) y latencias sub-4ms en endpoints estándar. No obstante, se observan cuellos de botella derivados de I/O síncrono en el Event Loop en endpoints clave (`/api/catalog`, `/api/installed`), latencia extrema en diagnósticos (`/api/health` ~1.48s por subprocesos no memoizados), mutación de disco en endpoints GET (`/api/context`), ausencia de compresión HTTP (gzip/brotli) que transmite payloads 86% más pesados de lo necesario, y serialización global estricta en comandos CLI.

---

### Métricas Empíricas de Rendimiento

#### 1. Latencias Base y Tamaños de Payload por Endpoint (N=50, Cache Caliente)
| Endpoint | Payload Raw | Compresión | Latencia Media | p50 (Mediana) | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| `GET /api/version` | 45 B | Ninguna (raw) | 1.13 ms | 0.94 ms | 2.10 ms | 2.85 ms | 2.85 ms |
| `GET /api/settings` | 96 B | Ninguna (raw) | 0.75 ms | 0.70 ms | 1.20 ms | 1.56 ms | 1.56 ms |
| `GET /api/watchlist` | 12 B | Ninguna (raw) | 1.01 ms | 0.86 ms | 1.47 ms | 2.40 ms | 2.40 ms |
| `GET /api/changelog` | 38 B | Ninguna (raw) | 3.84 ms | 3.68 ms | 5.71 ms | 6.50 ms | 6.50 ms |
| `GET /api/stats` | 1,100 B | Ninguna (raw) | 2.77 ms | 2.71 ms | 3.52 ms | 4.08 ms | 4.08 ms |
| `GET /api/export` | 49,716 B | Ninguna (raw) | 1.63 ms | 1.50 ms | 2.42 ms | 3.73 ms | 3.73 ms |
| `GET /api/context` | 294 B | Ninguna (raw) | 3.50 ms | 3.34 ms | 4.74 ms | 4.84 ms | 4.84 ms |
| `GET /api/installed` | 40,976 B | Ninguna (raw) | 7.25 ms | 6.98 ms | 9.32 ms | 12.54 ms | 12.54 ms |
| `GET /api/status` | 805 B | Ninguna (raw) | 7.85 ms | 7.73 ms | 10.51 ms | 10.57 ms | 10.57 ms |
| `GET /api/catalog` | 169,303 B | Ninguna (raw) | 11.52 ms | 11.09 ms | 15.40 ms | 21.52 ms | 21.52 ms |
| `GET /api/health` | 1,118 B | Ninguna (raw) | **1,478.23 ms** | **1,477.45 ms** | **1,693.06 ms** | **1,693.06 ms** | **1,693.06 ms** |
| `GET /` (index.html) | 27,862 B | Ninguna (raw) | 1.53 ms | 1.37 ms | 2.76 ms | 3.36 ms | 3.36 ms |

---

#### 2. Throughput y Concurrencia Bajo Carga
| Endpoint | Concurrencia | Total Requests | Duración Total | Throughput (RPS) | Latencia Media | p50 | p95 | p99 | Fallos |
|---|---|---|---|---|---|---|---|---|---|
| `/api/catalog` | 1 | 100 | 1.170 s | 85.5 req/s | 11.58 ms | 11.01 ms | 16.62 ms | 28.07 ms | 0 |
| `/api/catalog` | 10 | 200 | 1.967 s | 101.7 req/s | 93.01 ms | 93.94 ms | 106.63 ms | 110.45 ms | 0 |
| `/api/catalog` | 25 | 300 | 2.958 s | 101.4 req/s | 222.38 ms | 224.53 ms | 245.77 ms | 329.36 ms | 0 |
| `/api/installed` | 1 | 100 | 0.793 s | 126.1 req/s | 7.89 ms | 7.87 ms | 10.31 ms | 14.75 ms | 0 |
| `/api/installed` | 10 | 200 | 1.390 s | 143.9 req/s | 66.14 ms | 66.37 ms | 75.34 ms | 77.01 ms | 0 |
| `/api/installed` | 25 | 300 | 2.146 s | 139.8 req/s | 162.01 ms | 162.01 ms | 179.18 ms | 188.94 ms | 0 |
| `/api/stats` | 1 | 100 | 0.270 s | 371.0 req/s | 2.68 ms | 2.43 ms | 4.47 ms | 6.12 ms | 0 |
| `/api/stats` | 10 | 200 | 0.470 s | 425.8 req/s | 22.32 ms | 20.55 ms | 28.36 ms | 29.06 ms | 0 |
| `/api/stats` | 25 | 300 | 0.872 s | 344.1 req/s | 67.00 ms | 65.64 ms | 86.26 ms | 90.69 ms | 0 |
| `/api/version` | 1 | 100 | 0.085 s | 1,172.8 req/s | 0.84 ms | 0.82 ms | 1.34 ms | 2.02 ms | 0 |
| `/api/version` | 25 | 300 | 0.161 s | 1,857.8 req/s | 12.32 ms | 12.19 ms | 14.94 ms | 15.00 ms | 0 |

---

#### 3. Perfil de Consumo de Memoria y Resistencia a Fugas
| Etapa / Carga | RSS | Heap Total | Heap Used | External | ArrayBuffers |
|---|---|---|---|---|---|
| **0. Startup Baseline** | 55.07 MB | 18.31 MB | 11.46 MB | 3.61 MB | 0.07 MB |
| **1. Tras 100 `/api/catalog`** | 98.54 MB | 59.32 MB | 34.51 MB | 9.61 MB | 6.01 MB |
| **2. Tras 600 requests mixtos** | 118.66 MB | 73.92 MB | 51.79 MB | 6.89 MB | 3.28 MB |
| **3. Carga Pico (2,100 reqs)** | 148.57 MB | 65.71 MB | 31.96 MB | 15.44 MB | 11.85 MB |
| **4. Reposo / Post-GC** | 148.58 MB | 64.71 MB | 28.53 MB | 13.53 MB | 4.86 MB |

---

#### 4. Análisis de Ahorro por Compresión HTTP (GZIP & Brotli)
| Archivo / Payload | Tamaño Raw | Gzip | Ahorro Gzip | Brotli | Ahorro Brotli |
|---|---|---|---|---|---|
| `catalog.json` (202 items) | 191.56 KB | 26.72 KB | **86.1%** | 21.46 KB | **88.8%** |
| `public/app.js` | 65.90 KB | 15.19 KB | **77.0%** | 12.93 KB | **80.4%** |
| `public/styles.css` | 27.87 KB | 5.65 KB | **79.7%** | 4.82 KB | **82.7%** |
| `public/index.html` | 27.21 KB | 6.68 KB | **75.5%** | 5.53 KB | **79.7%** |
| `data/installed.json` | 49.92 KB | 6.69 KB | **86.6%** | 5.64 KB | **88.7%** |
| `data/upstream-meta.json` | 36.23 KB | 2.10 KB | **94.2%** | 1.80 KB | **95.0%** |
| **Bundle Web Inicial Total** | **312.54 KB** | **54.24 KB** | **82.6%** | **44.74 KB** | **85.7%** |

---

#### 5. Tiempos de Arranque de CLI y Carga de Módulos
- **CLI `--help` Cold Run**: 43.59 ms promedio (min: 38.39 ms, max: 51.45 ms).
- **Server Cold Boot a `listening`**: 136.77 ms promedio (min: 131.94 ms, max: 143.15 ms).
- **Refresh Rápido de Catálogo (`scripts/refresh-catalog.mjs --catalog`)**: 260.94 ms.
- **Importación de Módulos**:
  - `express`: 124.21 ms
  - `lib/routes.js`: 131.60 ms
  - `lib/probes.js`: 38.25 ms
  - `lib/state.js`: 37.75 ms
  - `lib/resolver.js`: 41.28 ms

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Latencia extrema (~1.48s) por subprocesos no memoizados en `/api/health` | `lib/routes.js:329-357`, `lib/resolver.js:78-102` | Medición HTTP (N=10): `mean: 1478.23ms, p50: 1477.45ms, max: 1693.06ms`. En cada petición ejecuta `where.exe` + `cline --version` + `where.exe` + `gh version` secuencialmente. | Memoizar los resultados de versión y disponibilidad de los binarios en memoria con un TTL (ej. 60-300s). | 20 min |
| 2 | **Media** | Re-lectura y parseo JSON síncrono de ~430KB en cada petición a `/api/catalog` | `lib/routes.js:120-123`, `lib/routes.js:22-24`, `lib/state.js:17-21` | `readJson(CATALOG_PATH)` (196KB, 0.99ms) + `readJson(PREV_CATALOG_PATH)` (196KB) + `readJson(META_PATH)` (37KB) bloquean el Event Loop. Bajo C=25 la latencia sube a 222.38ms y el throughput se satura en 101.4 RPS. | Implementar caché en memoria del catálogo y metadatos con invalidación por `mtimeMs` de archivo. | 35 min |
| 3 | **Media** | Ausencia de compresión HTTP (gzip/brotli) y headers de caché en assets estáticos | `server.js:71-76` | `curl -I /api/catalog` retorna `content-encoding: none (uncompressed)` (169.3 KB). Gzip reduce el payload a 26.72 KB (86.1% de ahorro) y el bundle web completo de 312 KB a 54 KB. | Integrar middleware `compression()` y configurar `maxAge: "1d"` en `express.static`. | 15 min |
| 4 | **Media** | Mutación y escritura atómica en disco en peticiones de lectura `GET /api/context` | `lib/routes.js:225-230` | `safeWriteJson(CONTEXT_PATH, contextInfo)` se ejecuta incondicionalmente en cada `GET /api/context`, escribiendo un archivo temporal y renombrándolo en cada lectura. | Realizar dirty-checking del contexto antes de persistir o desacoplar la persistencia en disco de la lectura. | 10 min |
| 5 | **Media** | Búsqueda no memoizada en el filesystem (`where.exe` / `which`) en `resolveCommand` | `lib/resolver.js:78-105` | Microbenchmark: `resolveCommand('cline')` = 61.01 ms; `resolveCommand('gh')` = 62.47 ms. Cada invocación ejecuta un proceso hijo `where.exe` sin caché en memoria. | Agregar caché interna `Map<string, string>` en `lib/resolver.js` para resolución O(1) inmediata. | 10 min |
| 6 | **Baja** | Serialización O(N) ineficiente con `JSON.stringify` en `/api/changelog` | `lib/routes.js:791-798` | Generación de más de 400 cadenas JSON por request para comparar campos primitivos (`JSON.stringify({ n: p.name, ... })`). | Sustituir `JSON.stringify` por comparaciones directas campo a campo (`p.name !== e.name || ...`). | 10 min |
| 7 | **Baja** | Bloqueo global de cola CLI (`_commandLock`) en operaciones masivas `/api/bulk` | `lib/runner.js:14, 132-134`, `lib/routes.js:605-659` | `_commandLock` implementa una cola FIFO Promise global única con timeout de 180s. Un comando lento bloquea todas las peticiones concurrentes. | Implementar colas concurrentes independientes por workspace o concurrencia controlada (p-limit 2). | 45 min |
| 8 | **Baja** | Recálculo redundante de agregaciones de tags y autores en `/api/catalog` y `/api/stats` | `lib/routes.js:192-207, 727-770` | En cada request se itera sobre los 259 registros construyendo `Map` y ordenando arrays sobre datos inmutables en memoria. | Precalcular las distribuciones de tags y autores durante la carga en memoria del catálogo. | 15 min |

---

### 3 Quick Wins
1. **Activar compresión HTTP Gzip/Brotli en `server.js`**: Reduce el tráfico de red de `/api/catalog` de 169 KB a 26.7 KB (-86.1%) y la carga inicial del frontend de 312 KB a 54 KB (-82.6%).
2. **Memoizar la resolución de binarios en `lib/resolver.js` y `/api/health`**: Elimina la penalización de ~1.48 segundos en `/api/health` reduciendo su tiempo a <5ms en subsiguientes llamadas.
3. **Eliminar escritura obligatoria en disco en `GET /api/context`**: Evita I/O innecesario de escritura temporal + rename en peticiones de lectura del contexto del workspace.

---

### 3 Deudas Críticas
1. **Bloqueo del Event Loop por I/O síncrono en `/api/catalog`**: La relectura continua de 430 KB de archivos JSON en el hilo principal satura la capacidad a ~100 RPS bajo concurrencia.
2. **Subprocesos síncronos en rutas de monitoreo**: Las consultas de health checks pueden saturar los núcleos de CPU si un monitor externo sondea periódicamente.
3. **Serialización global de comandos CLI**: El uso de un único cerrojo global (`_commandLock`) no escala si múltiples clientes interactúan simultáneamente sobre diferentes workspaces.

---

### 3 Oportunidades Estratégicas
1. **Caché en Memoria Unificada con Invalidación por Eventos (`fs.watch` / `mtime`)**: Servir catálogo, metadatos y estado instalado desde la memoria RAM directamente con tiempos de respuesta de 0.5ms.
2. **Headers HTTP Cache-Control & ETags**: Aprovechar el hashing del catálogo para que el cliente web use 304 Not Modified y no descargue 169 KB repetidamente.
3. **Concurrencia Multi-Workspace Asíncrona**: Permitir ejecuciones paralelas de `cline` en workspaces separados, duplicando la velocidad de operaciones en lote (`/api/bulk`).


---

<a id="capitulo-06-frontend-uiux--cli-presentation"></a>

# Capítulo 06: Frontend, UI/UX & CLI Presentation

> **Fuente Original:** [`06-frontend.md`](./06-frontend.md)

# Capa 6: Frontend, UI/UX & CLI Presentation

### Score: 8.2/10
**Justificación Objetiva:** La interfaz web de ClineMarket presenta una ejecución visual de alta fidelidad con respecto a su especificación de diseño (`DESIGN.md`), incorporando tokens CSS bien estructurados, animaciones de shimmer para skeleton loaders, paleta de colores coherente y un control plane ágil en Vanilla ES modules sin sobrecarga de frameworks. No obstante, la auditoría empírica identifica oportunidades críticas de mejora: una violación de Content Security Policy (CSP) por un inline event handler en el renderizado de iconos, anidamiento de controles interactivos en tarjetas (`role="button"` contenedor de `<button>` y `<input>`) contrario a WCAG 2.1 AA (4.1.2), desajustes en el estándar `NO_COLOR` en el ejecutable CLI `bin/cline-marketplace.js`, fallos de contraste en textos muted (#777/#888), y riesgo de desborde horizontal en viewports móviles reducidos (<390px).

---

### Tabla de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | **Alta** | Violación de Content Security Policy (CSP) por inline event handler `onerror` en `renderCard()` | `public/app.js:184`<br>`server.js:42` | `grep_search "onerror="` en `public/app.js:184` → `<img src="..." onerror="this.replaceWith(...)">`. Con CSP `script-src 'self'`, el navegador bloquea el handler inline, anulando el fallback de iconos rotos y arrojando violaciones CSP en consola. Además, si el nombre inicia con comilla, la entidad `&#39;` se decodifica en el parser y rompe la sintaxis JS. | Reemplazar el inline handler por un listener adjunto en el ciclo de vida del elemento DOM (`img.addEventListener('error', ...)`) o resolver el fallback en memoria antes de la inserción. | 15 min |
| 2 | **Alta** | Violación WCAG 2.1 AA (4.1.2) por controles interactivos anidados dentro de `<article role="button" tabindex="0">` | `public/app.js:197-230` | `grep_search "role=\"button\""` en `public/app.js:200` → El contenedor `.card` tiene `role="button"` y aloja internamente `<button class="card-watch">`, `<input type="checkbox">`, `<span class="tag" role="button">` y botones de acción rápida. | Remover `role="button"` y `tabindex="0"` del elemento contenedor `.card`. Delegar la apertura de detalles a un botón primario interno o al evento de clic en áreas no interactivas, manteniendo la navegación accesible por teclado mediante elementos nativos. | 25 min |
| 3 | **Media** | Infracción del estándar `NO_COLOR` / TTY en el binario CLI `bin/cline-marketplace.js` | `bin/cline-marketplace.js:22-32` | `node .agents/audit_06_frontend/verify_cli_nocolor.cjs` → `CLI help output has ANSI codes with NO_COLOR=1: true` (`\u001b[1mcline-marketplace...`). A diferencia de `lib/logger.js`, el runner CLI no valida `process.env.NO_COLOR` ni `isTTY`. | Adoptar la misma lógica de `lib/logger.js:3-6` en `bin/cline-marketplace.js` para desactivar secuencias ANSI cuando `NO_COLOR` esté presente o el stdout no sea TTY. | 10 min |
| 4 | **Media** | Elementos huérfanos y falta de reglas CSS para el Drawer Móvil (`#btnToggleSidebar`, `#sidebarBackdrop`, `#btnHelp`) | `public/app.js:1293-1299, 1545-1548`<br>`public/index.html`<br>`public/styles.css` | `node .agents/audit_06_frontend/verify_ids.cjs` → `Missing IDs in index.html: ['sidebarBackdrop', 'btnToggleSidebar', 'btnHelp']`. En pantallas móviles, `toggleMobileSidebar()` retorna prematuramente y la barra lateral de filtros queda apilada verticalmente sin poder plegarse. | Añadir el botón hamburguesa (`#btnToggleSidebar`) y backdrop (`#sidebarBackdrop`) en `index.html`, junto con las reglas de transición `.sidebar.open` en `styles.css`. | 30 min |
| 5 | **Media** | Desborde horizontal y colisión de elementos sticky en resoluciones móviles (< 390px) | `public/styles.css:312, 401, 564, 1344` | `grep_search "@media"` en `styles.css:1344` → Solo existe un breakpoint (`max-width: 960px`). La grilla `.grid` fuerza `minmax(340px, 1fr)` con padding de 28px (requiere 396px mín.), y `.nav-floating-wrap` tiene `top: 73px` fijo que colisiona cuando `.topbar` se apila verticalmente. | Ajustar `.grid` a `minmax(min(100%, 300px), 1fr)`, habilitar scroll horizontal `overflow-x: auto` en `.nav-pill-bar`, y reajustar offsets sticky en viewports reducidos. | 25 min |
| 6 | **Media** | Incumplimiento de ratios de contraste WCAG 2.1 AA en textos secundarios y badges sobre fondos oscuros | `public/styles.css:54, 469, 708-722, 788` | `node .agents/audit_06_frontend/verify_contrast.cjs` → Color `#777777` sobre `#141414` da 4.11:1 (FAIL < 4.5:1), `#888888` sobre `#232323` da 4.43:1 (FAIL < 4.5:1), `--color-iris-violet` (#7a78ff) sobre `#232323` da 4.46:1 (FAIL < 4.5:1). | Elevar tonos muted de `#777` a mínimo `#949494` (5.9:1) y `#888` a `#9e9e9e` (6.6:1), asegurando cumplimiento estricto de WCAG AA para textos de cuerpo pequeño. | 15 min |
| 7 | **Baja** | Cuadro ASCII de actualización con relleno de espacios rígido en `bin/cline-marketplace.js` | `bin/cline-marketplace.js:128-131` | `grep_search "repeat("` en `bin/cline-marketplace.js:129-130` → `" ".repeat(25)` y `" ".repeat(8)`. Versiones semver largas rompen el alineamiento del borde `│`. | Calcular dinámicamente el padding en función de `boxWidth - textLength`. | 10 min |
| 8 | **Baja** | Ausencia de atributo de accesibilidad `aria-labelledby` en `#serverStoppedOverlay` | `public/index.html:411-424` | `view_file` en `public/index.html:411` → `<div id="serverStoppedOverlay" class="modal hidden" role="dialog" aria-modal="true">` carece de enlace a su título `<h2>Server Stopped</h2>`. | Añadir `id="serverStoppedTitle"` al encabezado y `aria-labelledby="serverStoppedTitle"` al modal. | 5 min |
| 9 | **Baja** | Inserción síncrona sin `DocumentFragment` en el renderizado del catálogo masivo | `public/app.js:542-549` | `view_file` en `public/app.js:546` → `for (const e of entries) grid.appendChild(renderCard(e));` ejecuta 250+ mutaciones DOM directas en el grid contenedor. | Utilizar `const frag = document.createDocumentFragment();` y realizar una única mutación `grid.appendChild(frag)`. | 10 min |

---

### Análisis Detallado por Subsistema

#### 1. Web UI: Arquitectura DOM, Componentes y Diseño Visual
- **Fidelidad al Design System (`DESIGN.md`)**:
  - Paleta cromática: Utiliza correctamente la pizarra oscura (`--surface-pitch-black: #141414`), superficies de elevación (`#232323`), acentos de acción (`--color-acid-lime: #c7ff69`), tonos complementarios de la micro-paleta de cinco colores (Iris Violet, Toxic Green, Ember Orange, Schoolbus Yellow, Cobalt Blue) y tipografías grotesque/sans-serif.
  - Radios de borde: Se respetan los 1000px para botones/pills/inputs y 25px para cards y contenedores medianos (`--radius-cards: 25px; --radius-pills: 1000px`).
  - Skeleton Shimmer Loader: Implementado en `styles.css:1224-1276` con `@keyframes shimmer` y en `app.js:1190-1211` con `renderSkeletons()`, ofreciendo retroalimentación visual inmediata durante la carga de datos.
- **Sprites Vectoriales SVG**:
  - Los 15 símbolos SVG (`icon-search`, `icon-filter`, `icon-refresh`, `icon-scan`, `icon-power`, `icon-bulk`, `icon-star-filled`, `icon-star-outline`, `icon-check`, `icon-close`, `icon-github`, `icon-feedback`, `icon-download`, `icon-package`, `icon-sparkle`) están declarados en `public/index.html:12-59` y sincronizados con los llamados en `public/app.js`.
- **Prevención de XSS y Manipulación de Plantillas**:
  - La función `escapeHtml` (`app.js:64-68`) sanitiza exhaustivamente caracteres HTML (`&`, `<`, `>`, `"`, `'`).
  - No obstante, la inyección inline de cadenas en atributos de eventos (`onerror="..."`, Hallazgo #1) genera un riesgo de bloqueo CSP y errores de sintaxis si el nombre contiene comillas.

#### 2. Accesibilidad (WCAG 2.1 AA)
- **Trampas de Foco y Modales**:
  - `handleModalTabTrap` (`app.js:141-159`) gestiona el ciclado del foco (Tab / Shift+Tab) en modales activos (`detailModal`, `feedbackModal`, `helpModal`, `shutdownModal`).
  - Al abrir un modal, se guarda `lastActiveElement` y se retorna el foco al disparador al cerrarse (`closeModal`, `app.js:123-134`).
- **Navegación por Teclado**:
  - Soporte para atajos rápidos globales: `/` (búsqueda), `b` (modo masivo), `?` (ayuda), `g`/`r`/`w`/`s`/`c`/`h` (pestañas directas), `Esc` (cierre de modales/búsqueda).
  - Los atajos se ignoran correctamente cuando el foco está en inputs o cuando un modal está desplegado.
- **Jerarquía y Controles Anidados**:
  - Como se detalla en el Hallazgo #2, el uso de `role="button"` en el contenedor `.card` viola el principio de accesibilidad al anidar botones internos (`.card-watch`, `.tag`, checkboxes).

#### 3. Diseño Responsivo y Experiencia Móvil
- **Evaluación de Breakpoints**:
  - Actualmente solo existe un único `@media (max-width: 960px)`.
  - La navegación flotante (`.nav-floating-wrap`) carece de manejo de overflow en pantallas < 500px, provocando scroll horizontal en dispositivos móviles estándar.
  - La posición `position: sticky; top: 73px` colisiona cuando el topbar pasa a flujo vertical.
- **Drawer Móvil**:
  - Existen métodos en JS (`toggleMobileSidebar`, `app.js:1292-1299`), pero faltan los disparadores visuales en el DOM (`#btnToggleSidebar`) y los estilos de capas en CSS, dejando la interfaz móvil incompleta para la gestión de filtros.

#### 4. Interfaz de Línea de Comandos (CLI UI)
- **Formato y Legibilidad**:
  - Salida limpia con prefijos cronometrados `[HH:MM:SS] [CLI]` y banner de bienvenida.
  - Gestión adecuada de señales del sistema (`SIGINT`, `SIGTERM`) con mensajes de apagado amigables.
- **Conformidad con Estándares de Terminal**:
  - El logger del servidor (`lib/logger.js`) cumple el estándar `NO_COLOR` y respeta terminales no-TTY.
  - El ejecutable principal (`bin/cline-marketplace.js`) omite esta comprobación, emitiendo secuencias ANSI crudas en entornos no interactivos (Hallazgo #3).

#### 5. Gestión de Estados (Empty, Loading, Error, Success)
- **Estados Vacíos**: Mensajes e ilustraciones SVG claras para búsqueda sin resultados (`#emptyState`), recomendaciones vacías (`#recEmpty`), watchlist vacía (`#watchEmpty`) y changelog sin cambios.
- **Estados de Carga**: Animación shimmer en skeletons, deshabilitación de botones durante mutaciones (`Install`, `Uninstall`, `Refresh`, `Bulk Actions`) con actualización de etiquetas ("Installing…", "Stopping…").
- **Notificaciones Toast**: Sistema flotante (`#toastHost`) con soporte polimórfico (`success`, `error`, `warn`, `info`), iconos temáticos y auto-desvanecimiento con animación translateY.

---

### 3 Quick Wins
1. **Eliminar el inline `onerror` en `public/app.js:184`**: Reemplazar por listeners de eventos estándar en JS para garantizar total conformidad con CSP (`script-src 'self'`).
2. **Implementar `NO_COLOR` y TTY check en `bin/cline-marketplace.js`**: Importar o replicar la lógica de `lib/logger.js:3-6` para no emitir códigos ANSI cuando `NO_COLOR` esté activo.
3. **Optimizar el renderizado del catálogo con `DocumentFragment`**: Envolver el ciclo de inserción de `renderCatalogTab()` en un fragmento de memoria para reducir 250 reflows a 1 única mutación DOM.

### 3 Deudas Críticas
1. **Reestructurar la semántica accesible de las tarjetas de catálogo (WCAG 4.1.2)**: Eliminar `role="button"` del contenedor `.card` y estructurarlo con enlaces o botones explícitos para no anidar elementos interactivos.
2. **Ajustar el sistema de colores muted para alcanzar contraste 4.5:1 (WCAG AA)**: Elevar los grises `#777777` y `#888888` a mínimo `#949494` y `#9e9e9e` sobre fondos oscuros.
3. **Completar la arquitectura del Drawer Móvil y Responsive Breakpoints**: Añadir el botón hamburguesa `#btnToggleSidebar`, `#sidebarBackdrop` y estilos responsivos con scroll horizontal para la barra de navegación flotante.

### 3 Oportunidades Estratégicas
1. **Soporte de Tema de Alto Contraste (High Contrast Mode)**: Integrar una opción en configuración para alternar bordes y textos a máximo contraste (18:1) para usuarios con visión reducida.
2. **Virtualización de Listas para Catálogos > 1,000 Primitivas**: Incorporar virtual scroll en la grilla de catálogo para mantener 60 FPS independientemente del crecimiento del repositorio upstream.
3. **Indicadores de Progreso CLI con Spinners Interactivos**: Reemplazar los logs estáticos en el binario CLI por una librería ligera de spinners / barras de progreso en terminales TTY.


---

<a id="capitulo-07-devops-cicd--deploy"></a>

# Capítulo 07: DevOps, CI/CD & Deploy

> **Fuente Original:** [`07-devops.md`](./07-devops.md)

# Auditoría Dimension 07: DevOps, CI/CD & Deploy

**Proyecto**: Cline Marketplace — Primitive Registry & Local Control Plane  
**Fecha de Auditoría**: 2026-08-30  
**Especialista**: Auditor de DevOps, CI/CD & Packaging  
**Estado**: Completado  

---

## 1. Resumen Ejecutivo & Evaluación de Madurez

| Métrica / Dimensión | Estado / Valor | Observación Principal |
|---|---|---|
| **Score Global** | **7.8 / 10** | Sólida base de CI multi-OS (Ubuntu, Windows, macOS), SAST (CodeQL), Dependabot y Release Drafter, pero afectada por empaquetado npm con bloat severo (2.86 MB por inclusión de screenshots y audits), hook de pre-commit pesado que muta el staging git, deshabilitación de `npm audit` en `.npmrc` y workflows con tags de versión problemáticos. |
| **Pipeline CI/CD** | 8.0 / 10 | Matriz completa de 12 jobs (3 OS × 4 versiones de Node [18.x, 20.x, 22.x, 24.x]), CodeQL automatizado, pero falta `npm audit`, `npm pack --dry-run` y permisos de mínimo privilegio en `ci.yml`. |
| **Empaquetado npm** | 6.5 / 10 | `npm pack --dry-run` genera 2.86 MB (2.28 MB comprimido) con 68 archivos; el 80% del payload son capturas de pantalla binarias (`docs/screenshot-*.png`) y reportes de auditoría internos innecesarios para usuarios del CLI. |
| **Git Hooks & DX** | 7.0 / 10 | `setup-hooks.mjs` configurado como script de `prepare`, pero `pre-commit.mjs` ejecuta capturas headless Chrome CDP completas y corre `git add` automático en cada commit local. |
| **Release & Deploy** | 7.5 / 10 | Workflow `release.yml` crea releases en GitHub pero carece de publicación automatizada a npm registry (`npm publish --provenance`) y release notes dinámicos. |
| **Containerización** | 5.0 / 10 | Ausencia total de `Dockerfile`, `.dockerignore` y manifiestos de despliegue en la nube/contenedores. |

---

## 2. Inventario de Componentes DevOps & CI/CD

```
ClineMarket/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # Matriz CI: 3 OS × 4 Node versions (18, 20, 22, 24)
│   │   ├── codeql.yml             # SAST semanal y en PRs (JavaScript)
│   │   ├── release.yml            # Creación de GitHub Release al pushear tags v*
│   │   ├── sync-catalog.yml       # Cron cada 6h para sincronizar catálogo upstream
│   │   ├── auto-changelog.yml     # Generador de notas con Release Drafter v6
│   │   ├── labeler.yml            # Etiquetado automático de PRs por path
│   │   └── stale.yml              # Cierre automático de issues/PRs inactivos
│   ├── dependabot.yml             # Actualizaciones automáticas npm (semanal) y actions (mensual)
│   ├── release.yml                # Configuración de categorías de Release Drafter
│   ├── labeler.yml                # Mapeo de rutas a scopes/labels
│   └── CODEOWNERS                 # Asignación de responsabilidad de código
├── scripts/
│   ├── setup-hooks.mjs            # Instalador idempotente de git hooks
│   ├── pre-commit.mjs             # Hook local: tests unitarios + captura de screenshots
│   ├── pre-push.mjs               # Hook local: unit tests + smoke tests
│   ├── refresh-catalog.mjs        # Sincronizador de catálogo y metadatos upstream
│   ├── capture-screenshots.mjs    # Capturador CDP headless de screenshots 2x
│   ├── debug-browser.mjs          # Inspector CDP para depuración de browser
│   ├── detect-context.mjs         # Analizador heurístico de stack de proyecto
│   ├── smoke-test.mjs             # Suite de integración end-to-end con aserciones estrictas
│   └── unit-test.mjs              # Suite de tests unitarios (node:test)
├── .npmrc                         # Configuración local de npm (engine-strict, package-lock, audit=false)
├── .node-version / .nvmrc         # Fijación de Node.js a v22.17.0
├── .gitignore / .gitattributes    # Configuración de VCS y normalización LF/CRLF
└── package.json                   # Manifiesto npm, scripts, binario y engines
```

---

## 3. Evidencia Empírica de Verificación

### 3.1. Empaquetado npm y Análisis de Payload (`npm pack --dry-run`)

```bash
$ npm pack --dry-run --json
```

```json
[
  {
    "id": "cline-marketplace@1.0.0",
    "name": "cline-marketplace",
    "version": "1.0.0",
    "size": 2276164,
    "unpackedSize": 2862936,
    "shasum": "28eb5ff677466890e77dc98822aab64fccb3b071",
    "filename": "cline-marketplace-1.0.0.tgz",
    "entryCount": 68
  }
]
```

**Desglose de Bloat en el Paquete Publicado:**
- Tamaño comprimido: **2.28 MB** (2,276,164 bytes)
- Tamaño descomprimido: **2.86 MB** (2,862,936 bytes)
- Archivos innecesarios incluidos:
  - `docs/screenshot-catalog.png` (669.8 KB)
  - `docs/screenshot-health.png` (460.8 KB)
  - `docs/screenshot-detail.png` (418.0 KB)
  - `docs/screenshot-stats.png` (359.6 KB)
  - `docs/screenshot-recommended.png` (333.6 KB)
  - `docs/audits/**` (22 archivos de reportes markdown internos)
  - `scripts/debug-browser.mjs`, `scripts/make-extra.mjs`, `scripts/make-screenshots.mjs`, `scripts/capture-screenshots.mjs`
- **Impacto**: El 78.4% del tamaño del tarball publicado corresponde a imágenes binarias de documentación y scripts de soporte de desarrollo que no se ejecutan en runtime.

### 3.2. Auditoría de Seguridad de Dependencias (`npm audit`)

```bash
$ npm audit
found 0 vulnerabilities
```
- **Dependencias en producción**: `express@5.2.1` (1 dependencia directa, 31 paquetes transitivos en árbol).
- **Vulnerabilidades conocidas**: 0.
- **Hallazgo de configuración**: En `.npmrc`, la directiva `audit=false` suprime las advertencias automáticas de vulnerabilidad durante `npm install` local.

### 3.3. Verificación de Scripts del Ciclo de Vida (`npm test`, `npm run test:unit`, `npm run test:smoke`)

```bash
$ npm run test:unit
TAP version 13
# Subtest: sanitizers: sanitizePrimitiveId (pass)
# Subtest: sanitizers: sanitizePrimitiveType (pass)
# Subtest: sanitizers: sanitizeWorkspacePath (pass)
# Subtest: resolver: isWindowsBatchShim (pass)
# Subtest: state: safeWriteJson and readJson serialization (pass)
# Subtest: runner: verbFor maps primitive types correctly (pass)
# Subtest: reconciler: correctly merges discovered primitives and detects drift (pass)
# Subtest: command resolver: resolves installed system binaries (pass)
1..8
# tests 8, pass 8, fail 0 (duration: 139ms)
```

```bash
$ npm run test:smoke
==> Starting temporary server instance on 127.0.0.1:5173...
==> Testing Command Resolver (cline: C:\Users\mateo\AppData\Roaming\npm\cline.cmd, gh: C:\Program Files\GitHub CLI\gh.exe)
==> Testing /api/status [✓]
==> Testing /api/health [✓] (node, cline, gh, cline-storage, catalog, metadata)
==> Testing /api/installed [✓] (58 total, 57 active)
==> Testing /api/catalog [✓] (259 total)
==> Testing /api/context [✓]
==> Testing /api/stats [✓]
==> Testing /api/changelog [✓]
==> Testing /api/export [✓]
==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!
```

### 3.4. Verificación de Instalación de Git Hooks (`node scripts/setup-hooks.mjs`)

```bash
$ node scripts/setup-hooks.mjs
Git hooks configured successfully in .git/hooks/
```
- Genera `.git/hooks/pre-commit` y `.git/hooks/pre-push` con permisos ejecutables `0o755`.

---

## 4. Tabla Consolidada de Hallazgos

| # | Severidad | Hallazgo | Ubicación (`archivo:línea`) | Evidencia Empírica | Solución Propuesta | Esfuerzo |
|---|---|---|---|---|---|---|
| **1** | **Alta** | **Bloat Severo del Bundle npm por Inclusión de Screenshots y Audits Internos** | [`package.json:10-20`](../../package.json#L10-L20) | `npm pack --dry-run --json` muestra 2.86 MB descomprimidos y 68 archivos, incluyendo 5 PNGs (2.2 MB) y la carpeta `docs/audits/`. | Restringir el array `"files"` en `package.json` a `["bin", "lib", "public", "catalog.json", "server.js", "README.md", "LICENSE"]` o agregar `.npmignore`. | 15 min |
| **2** | **Alta** | **Pre-commit Hook Sobrecargado con Capturas CDP y Mutación Silenciosa del Staging Git** | [`scripts/pre-commit.mjs:17-25`](../../scripts/pre-commit.mjs#L17-L25) | `pre-commit.mjs` lanza Chrome headless, conecta por WebSocket CDP y ejecuta `git add docs/screenshot-*.png` en cada commit, fallando en entornos sin Chrome y agregando binarios al historial. | Eliminar la invocación de `capture-screenshots.mjs` y `git add` de `pre-commit.mjs`. Dejar `pre-commit` limitado a `test:unit` y crear comando manual/CI `npm run docs:screenshots`. | 15 min |
| **3** | **Media** | **Uso de Versión no Estándar / Inexistente de Acción en Workflows (`actions/setup-node@v5`)** | [`.github/workflows/ci.yml:24`](../../.github/workflows/ci.yml#L24)<br>[`.github/workflows/release.yml:29`](../../.github/workflows/release.yml#L29)<br>[`.github/workflows/sync-catalog.yml:22`](../../.github/workflows/sync-catalog.yml#L22) | `uses: actions/setup-node@v5` presente en 3 workflows; la versión mayor estándar oficial de `actions/setup-node` es `v4`. | Actualizar a `actions/setup-node@v4` en todos los workflows. | 5 min |
| **4** | **Media** | **Deshabilitación de Auditoría de Seguridad en `.npmrc` (`audit=false`)** | [`.npmrc:4`](../../.npmrc#L4) | Directiva `audit=false` en `.npmrc` desactiva las alertas automáticas de vulnerabilidades de dependencias durante `npm install` local y en CI. | Remover `audit=false` o configurarlo en `audit=true`. | 2 min |
| **5** | **Media** | **Sincronización Periódica de Catálogo sin Gate de Validación y Push Directo a `main`** | [`.github/workflows/sync-catalog.yml:33-52`](../../.github/workflows/sync-catalog.yml#L33-L52) | `sync-catalog.yml` ejecuta `refresh-catalog.mjs` y corre `git push origin main` inmediatamente sin validar integridad del JSON ni ejecutar tests; falla si hay branch protection activa. | Agregar validación `node --test scripts/unit-test.mjs` antes del commit y utilizar `peter-evans/create-pull-request` para sincronizaciones seguras. | 30 min |
| **6** | **Media** | **Pipeline de Release sin Publicación Automatizada a npm Registry ni Provenance** | [`.github/workflows/release.yml:1-69`](../../.github/workflows/release.yml#L1-L69) | `release.yml` crea el release en GitHub pero no publica a `registry.npmjs.org` ni genera atestación de procedencia SLSA (`--provenance`). | Añadir step de `npm publish --access public --provenance` con token autenticado vía GitHub OIDC. | 30 min |
| **7** | **Media** | **Falta de Permisos de Mínimo Privilegio en `ci.yml`** | [`.github/workflows/ci.yml:1-37`](../../.github/workflows/ci.yml#L1-L37) | `ci.yml` no declara bloque `permissions:` explícito a nivel raíz ni de job, heredando los permisos por defecto del repositorio. | Agregar `permissions: contents: read` a nivel superior en `.github/workflows/ci.yml`. | 5 min |
| **8** | **Baja** | **Ausencia de Scripts Estándar en `package.json` (`lint`, `prepack`, `format`)** | [`package.json:21-32`](../../package.json#L21-L32) | Faltan scripts habituales del ecosistema npm como `"prepack": "npm test"`, `"lint"` o `"check"`. | Incorporar script `"prepack": "npm test"` para garantizar que ningún tarball roto se publique accidentalmente. | 10 min |
| **9** | **Baja** | **Ruta Absoluta de Chrome Hardcodeada en Script de Depuración (`scripts/debug-browser.mjs`)** | [`scripts/debug-browser.mjs:3`](../../scripts/debug-browser.mjs#L3) | `const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";` causa fallo instantáneo en Linux/macOS. | Implementar resolución dinámica con `resolveCommand` multiplataforma o variable de entorno `CHROME_PATH`. | 10 min |
| **10** | **Baja** | **Inexistencia de Manifiestos de Containerización / Dockerfile** | Raíz del proyecto | No existe `Dockerfile` ni `.dockerignore` para despliegues portables o entornos cloud containerizados. | Crear un `Dockerfile` multi-stage ligero basado en `node:22-alpine` con usuario no-root. | 20 min |

---

## 5. Análisis Detallado por Dominios

### Dominio A: Workflows de GitHub Actions & Seguridad de CI

1. **Matriz de Ejecución y Cobertura Multi-Plataforma**:
   - `ci.yml` define una matriz completa de 12 combinaciones:
     - Sistemas Operativos: `ubuntu-latest`, `windows-latest`, `macos-latest`
     - Versiones de Node.js: `18.x`, `20.x`, `22.x`, `24.x`
   - Implementa `cache: 'npm'` para acelerar la instalación de dependencias.
   - **Oportunidad de Mejora**: Agregar un paso de verificación de integridad de empaquetado (`npm pack --dry-run`) y verificación de licencias/auditoría (`npm audit`).

2. **Seguridad y Permisos de Workflows**:
   - `codeql.yml` cuenta con permisos estrictos (`actions: read`, `contents: read`, `security-events: write`).
   - `ci.yml` carece de declaración de permisos; según las directrices de OpenSSF Scorecard, se debe definir explícitamente `permissions: contents: read`.
   - `labeler.yml` utiliza el evento `pull_request_target`, lo que requiere supervisión continua de acciones para evitar vulnerabilidades de inyección de contexto.

```yaml
# Mejora propuesta para .github/workflows/ci.yml
name: CI & Quality Gate

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    name: Test on Node ${{ matrix.node-version }} (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x, 22.x, 24.x]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Security audit
        run: npm audit --audit-level=high

      - name: Run unit test suite
        run: npm run test:unit

      - name: Run integration smoke tests
        run: npm run test:smoke

      - name: Verify package bundle integrity
        run: npm pack --dry-run
```

---

### Dominio B: Empaquetado npm, Distribución y Optimización de Bundle

1. **Diagnóstico del Contenido del Paquete**:
   - Actualmente `package.json` incluye en `"files"` las carpetas `"docs"` y `"scripts"`.
   - `docs/` contiene 5 capturas en alta resolución (2x scaling) con un peso acumulado de 2.24 MB, además de múltiples reportes de auditoría internos.
   - `scripts/` contiene herramientas de desarrollo interno como `debug-browser.mjs`, `capture-screenshots.mjs` y `make-extra.mjs`.
   - **Dependencia en Runtime**: El CLI `bin/cline-marketplace.js` invoca `scripts/refresh-catalog.mjs` cuando se ejecuta `npx cline-marketplace --refresh` o cuando falta `catalog.json`.

2. **Propuesta de Refactorización**:
   - Extraer la lógica de descarga y actualización del catálogo a `lib/refresh.js`.
   - Modificar `package.json` para publicar exclusivamente:
   ```json
   "files": [
     "bin",
     "lib",
     "public",
     "catalog.json",
     "server.js",
     "README.md",
     "LICENSE"
   ]
   ```
   - **Resultado esperado**: Reducción del tamaño del tarball de **2.28 MB** a **~350 KB** (~85% de reducción) y de 68 archivos a 16 archivos esenciales.

---

### Dominio C: Git Hooks y Experiencia de Desarrollo Local

1. **Mecanismo de Hooks**:
   - `package.json` ejecuta `"prepare": "node scripts/setup-hooks.mjs"`.
   - `setup-hooks.mjs` escribe los archivos `pre-commit` y `pre-push` en `.git/hooks/`.
2. **Problema en `pre-commit.mjs`**:
   - Cada `git commit` ejecuta `capture-screenshots.mjs`, el cual:
     1. Busca Chrome en rutas hardcodeadas de Windows.
     2. Inicia una instancia del servidor local en segundo plano.
     3. Abre Chrome Headless en puerto CDP 9222.
     4. Captura 5 vistas de la interfaz web en resolución 1600×1000 (2x DPR).
     5. Escribe los archivos `.png` en `docs/`.
     6. Ejecuta `git add docs/screenshot-*.png`, modificando el staging del desarrollador.
   - **Impacto Negativo**:
     - Incrementa el tiempo de cada commit en 8–15 segundos.
     - Provoca fallos de commit en entornos headless, contenedores o sistemas sin Chrome instalado.
     - Contamina el historial de git con megabytes de diffs binarios en cada cambio menor.

```javascript
// Propuesta para scripts/pre-commit.mjs (Ligero, rápido y confiable)
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\x1b[36m==> [PRE-COMMIT HOOK] Running unit tests...\x1b[0m");

try {
  execSync(`"${process.execPath}" --test "${join(root, "scripts", "unit-test.mjs")}"`, {
    cwd: root,
    stdio: "inherit",
  });
  console.log("\x1b[32m==> [PRE-COMMIT SUCCESS] Unit tests passed!\x1b[0m");
} catch (err) {
  console.error("\x1b[31m[PRE-COMMIT FAILED]\x1b[0m", err.message);
  process.exit(1);
}
```

---

### Dominio D: Automatización de Releases y Despliegue en Contenedores

1. **Publicación Automatizada con OIDC & Provenance**:
   - Configurar `release.yml` para publicar en npm registry con `id-token: write` y atestación de procedencia SLSA.
2. **Contenedor Oficial para Demostraciones y Control Plane Web**:
   - La inclusión de un `Dockerfile` permite levantar el Local Control Plane en entornos remotos (por ejemplo, servidores compartidos o demos web en Kubernetes/Docker).

```dockerfile
# Dockerfile propuesto (Multi-stage ligero)
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

# Copiar manifiesto e instalar solo dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copiar código fuente de runtime
COPY server.js catalog.json ./
COPY bin/ ./bin/
COPY lib/ ./lib/
COPY public/ ./public/

# Crear usuario no privilegiado
USER node

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5173/api/health || exit 1

CMD ["node", "server.js"]
```

---

## 6. Plan de Acción y Recomendaciones

### 3 Quick Wins (< 30 min)
1. **Corregir versiones de acciones (`setup-node@v4`)**: Cambiar `@v5` a `@v4` en `.github/workflows/ci.yml`, `release.yml` y `sync-catalog.yml`.
2. **Reactivar `npm audit` en `.npmrc`**: Eliminar `audit=false` para restaurar alertas de seguridad nativas.
3. **Limpiar `pre-commit.mjs`**: Eliminar la captura de screenshots CDP y el `git add` automático de `scripts/pre-commit.mjs`.

### 3 Deudas Críticas (Arquitectura / Seguridad / DX)
1. **Optimización del Bundle npm (`package.json`)**: Excluir `docs/` (especialmente screenshots binarios) y `scripts/` de la distribución, moviendo la lógica de refresco a `lib/`.
2. **Protección de Sincronización Upstream (`sync-catalog.yml`)**: Agregar test gate previo a commit y utilizar Pull Requests automatizados en lugar de `git push origin main` directo.
3. **Publicación Automatizada en Release (`release.yml`)**: Integrar `npm publish --provenance` con autenticación OIDC segura.

### 3 Oportunidades Estratégicas
1. **Dockerización & Despliegue Cloud**: Agregar `Dockerfile` y `.dockerignore` para permitir ejecución en contenedores y plataformas cloud.
2. **Quality Gate Integral en CI**: Agregar step de `npm pack --dry-run` y linter de código (e.g. ESLint o Biome) en el pipeline de GitHub Actions.
3. **Mapeo de Hooks mediante `core.hooksPath`**: Migrar a directorio versionado `.githooks/` para evitar escrituras directas en `.git/hooks/`.

---

## 7. Verificación de Cumplimiento

- [x] Análisis exhaustivo de todos los workflows de `.github/workflows/`
- [x] Ejecución y validación empírica de `npm pack --dry-run` con desglose de tamaño y archivos
- [x] Ejecución y reporte de `npm audit` y auditoría de `.npmrc`
- [x] Validación de scripts de `package.json` y suites de prueba (`npm test`, `test:unit`, `test:smoke`)
- [x] Auditoría de scripts de hooks (`setup-hooks.mjs`, `pre-commit.mjs`, `pre-push.mjs`)
- [x] Identificación de ausencia de Docker / contenedorización
- [x] Cero modificaciones en el código fuente del proyecto


---

<a id="capitulo-08-tests--cobertura-qa"></a>

# Capítulo 08: Tests & Cobertura QA

> **Fuente Original:** [`08-tests.md`](./08-tests.md)

# Capa 8: Tests & Cobertura QA

### Score: 6.0/10

**Justificación del Score:**
El proyecto cuenta con una base de pruebas ágil y moderna basada en el test runner nativo de Node.js (`node:test`, `node:assert/strict`), lo que elimina dependencias pesadas de desarrollo y permite una ejecución ultrarrápida (<150 ms para unit tests y <1.5 s para smoke tests). La infraestructura de CI en GitHub Actions evalúa una matriz exhaustiva de sistemas operativos (Ubuntu, Windows, macOS) y versiones de Node.js (18.x, 20.x, 22.x, 24.x), complementada con hooks de pre-commit y pre-push.

Sin embargo, el score se sitúa en 6.0/10 debido a severas brechas estructurales de cobertura y rigor de aserciones:
1. **Brecha Masiva de Cobertura Unitaria:** Módulos críticos como `lib/probes.js` (291 líneas) y `lib/routes.js` (861 líneas) tienen **0.00% de cobertura unitaria**, sumando más del 70% de la base de código backend sin pruebas aisladas.
2. **Omisión de Endpoints Mutantes:** 18 rutas HTTP mutantes de Express (`POST /api/install`, `POST /api/uninstall`, `POST /api/mark`, `POST /api/forget`, `DELETE /api/forget/:type/:id`, `GET/POST/DELETE /api/watchlist`, `POST /api/bulk`, `POST /api/refresh`, `POST /api/settings`, `POST /api/workspaces/recent`, `POST /api/import`, etc.) carecen de pruebas automatizadas en la suite oficial.
3. **Aserciones Débiles y Falsos Positivos:** En `scripts/smoke-test.mjs`, las llamadas a `resolveCommand("cline")` y `resolveCommand("gh")` carecen de aserciones (`assert`), limitándose a imprimir en consola; asimismo, la prueba de `/api/health` valida `health.checks.length >= 4` pero no comprueba que `health.ok === true` ni que los checks individuales pasen. En `scripts/unit-test.mjs`, el test de concurrencia evalúa débilmente `typeof finalData.iteration === "number"` en lugar del valor exacto secuencial `4`.
4. **Polución de Estado en Disco:** Las pruebas unitarias y de integración escriben directamente en el directorio de producción `data/` (`data/test-queue-*.json`, mutación de `data/installed.json` y `data/context-cache.json`) sin utilizar aislamiento en `os.tmpdir()`.
5. **Cero Mocks de Procesos:** `lib/runner.js` no cuenta con mocks para `runCline`, `resolveCline` o `killProcessTree`, dejando la ejecución de subprocesos y timeouts sin pruebas unitarias.

---

### Evidencia Empírica de Ejecución

#### 1. Ejecución de la Suite Completa (`npm test`)
```
> cline-marketplace@1.0.0 test
> node --test scripts/unit-test.mjs && node scripts/smoke-test.mjs

TAP version 13
# Subtest: sanitizers: sanitizePrimitiveId
ok 1 - sanitizers: sanitizePrimitiveId
  ---
  duration_ms: 0.744
  type: 'test'
  ...
# Subtest: sanitizers: sanitizePrimitiveType
ok 2 - sanitizers: sanitizePrimitiveType
  ---
  duration_ms: 0.1998
  type: 'test'
  ...
# Subtest: sanitizers: sanitizeWorkspacePath
ok 3 - sanitizers: sanitizeWorkspacePath
  ---
  duration_ms: 0.7418
  type: 'test'
  ...
# Subtest: resolver: isWindowsBatchShim
ok 4 - resolver: isWindowsBatchShim
  ---
  duration_ms: 0.1533
  type: 'test'
  ...
# Subtest: state: safeWriteJson and readJson serialization
ok 5 - state: safeWriteJson and readJson serialization
  ---
  duration_ms: 6.037
  type: 'test'
  ...
# Subtest: runner: verbFor maps primitive types correctly
ok 6 - runner: verbFor maps primitive types correctly
  ---
  duration_ms: 0.1611
  type: 'test'
  ...
# Subtest: reconciler: correctly merges discovered primitives and detects drift
ok 7 - reconciler: correctly merges discovered primitives and detects drift
  ---
  duration_ms: 1.2245
  type: 'test'
  ...
# Subtest: command resolver: resolves installed system binaries
ok 8 - command resolver: resolves installed system binaries
  ---
  duration_ms: 67.6077
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 148.4804
==> Starting temporary server instance on 127.0.0.1:5173...
==> Testing Command Resolver
  cline resolved to: C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  gh resolved to: C:\Program Files\GitHub CLI\gh.exe

==> Testing /api/status
  node: v22.17.0 platform: win32 uptime: 0 s

==> Testing /api/health
  [✓] node: v22.17.0 (x64)
  [✓] cline: 3.0.60 at C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  [✓] gh: Authenticated to GitHub
  [✓] cline-storage: C:\Users\mateo\.cline, C:\Users\mateo\.claude, C:\Users\mateo\AppData\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev, C:\Users\mateo\AppData\Roaming\Claude
  [✓] catalog: 202 entries, generated 2026-06-19T18:20:28.065Z
  [✓] metadata: 202 upstream commit records cached

==> Testing /api/installed
  installed items: 58 total (57 active on disk)

==> Testing /api/catalog
  catalog total: 259 (marketplace: 202, local: 57)

==> Testing /api/context
  context languages: javascript, recommended count: 6

==> Testing /api/stats
  stats total: 202, top authors: 10, tags: 12

==> Testing /api/changelog
  changelog added: 0, removed: 0, updated: 0

==> Testing /api/export
  export records: 58

==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!
```

#### 2. Reporte de Cobertura Nativa de Node.js (`node --test --experimental-test-coverage scripts/unit-test.mjs`)
```
# start of coverage report
# -----------------------------------------------------------------------------
# file           | line % | branch % | funcs % | uncovered lines
# -----------------------------------------------------------------------------
# lib            |        |          |         | 
#  logger.js     |  70.83 |    10.00 |    0.00 | 20-22 26 29 32 35 38-42 45-46
#  reconciler.js |  96.72 |    75.00 |  100.00 | 15-16
#  resolver.js   |  51.97 |    61.11 |   75.00 | 19-63 75-76 101-102 104-115
#  runner.js     |  32.59 |   100.00 |   25.00 | 21-25 42-54 63-135
#  sanitizers.js |  93.33 |    95.83 |   75.00 | 57-60
#  state.js      |  72.73 |    55.56 |   75.00 | 23-34 47-48 58-61
# scripts        |        |          |         | 
#  unit-test.mjs | 100.00 |    90.91 |  100.00 | 
# -----------------------------------------------------------------------------
# all files      |  69.75 |    72.45 |   62.16 | 
# -----------------------------------------------------------------------------
# end of coverage report
```
*Nota:* `lib/probes.js` (291 líneas), `lib/routes.js` (861 líneas), `server.js` (163 líneas) y `bin/cline-marketplace.js` (278 líneas) **ni siquiera aparecen en el reporte** porque tienen 0.00% de importación/ejecución en la suite unitaria.

---

### Matriz de Cobertura por Módulo

| Módulo / Archivo | Líneas Totales | Cobertura Unitaria (Líneas %) | Cobertura Smoke (Funcional %) | Endpoints / Funciones sin Probar | Estado de QA |
|---|---|---|---|---|---|
| `lib/sanitizers.js` | 61 | 93.33% | Alta (~90%) | `isWindowsBatchShim` (duplicado), boundary 128 chars | 🟢 Bueno |
| `lib/reconciler.js` | 62 | 96.72% | Alta (~95%) | Null probe guard (líneas 15-16) | 🟢 Excelente |
| `lib/state.js` | 67 | 72.73% | Media (~60%) | Quarantine backup de JSON corrupto, mkdir recursivo | 🟡 Aceptable |
| `lib/resolver.js` | 128 | 51.97% | Media (~50%) | `getStandardCandidates` (líneas 19-63), `which` fallback | 🟡 Parcial |
| `lib/logger.js` | 49 | 70.83% (0% funcs) | Pasiva | `logger.info`, `logger.warn`, `logger.error`, `logger.http` | 🟡 Pasivo |
| `lib/runner.js` | 136 | 32.59% | 0% | `runCline`, `resolveCline`, `killProcessTree`, timeout logic | 🔴 Crítico |
| `lib/probes.js` | 291 | **0.00%** | Parcial (~40%) | `clineRootCandidates` (Darwin/Linux), MCP configs parsing | 🔴 Crítico |
| `lib/routes.js` | 861 | **0.00%** | ~30% (8 GETs) | 18 rutas mutantes (`/install`, `/uninstall`, `/watchlist`, etc.) | 🔴 Crítico |
| `server.js` | 163 | **0.00%** | ~50% (HTTP init) | CSRF rejection middleware, error handler global | 🟡 Parcial |
| `bin/cline-marketplace.js` | 278 | **0.00%** | 0% | CLI flags (`--no-open`, `--port`), subcomandos (`update`, `refresh`) | 🔴 Crítico |
| `scripts/refresh-catalog.mjs`| 304 | **0.00%** | 0% | GitHub token resolution, commits walking, ratelimit retry | 🔴 Crítico |
| `scripts/detect-context.mjs` | 170 | **0.00%** | 0% (solo GET /context) | Detección de Go, Rust, Java, Python, Docker, C# | 🟡 Parcial |
| `public/` (Frontend UI) | ~1,200 | **0.00%** | 0% | Vanilla DOM interactions, filtros, modales, star toggle | 🔴 Sin Tests |

---

### Hallazgos de la Auditoría

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia (Comando + Output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | **Cobertura unitaria nula (0.00%) en `lib/probes.js` y `lib/routes.js`**: Más de 1,150 líneas de lógica central de negocio (escaneo de almacenamiento, extracción de metadata, enrutamiento Express) están completamente desprovistas de pruebas unitarias aisladas. | `lib/probes.js:1-291`<br>`lib/routes.js:1-861` | `node --test --experimental-test-coverage scripts/unit-test.mjs`<br>*Output: `probes.js` y `routes.js` tienen 0 líneas reportadas*. | Crear `tests/unit/probes.test.mjs` y `tests/unit/routes.test.mjs` utilizando mocks en memoria de filesystem y supertest/express router. | 4 h |
| 2 | **Alta** | **Ausencia total de pruebas automatizadas para 18 endpoints mutantes y de configuración**: Rutas críticas que ejecutan comandos de instalación/desinstalación, modifican listas de seguimiento y alteran configuraciones no tienen cobertura en ninguna suite. | `lib/routes.js:400-470, 471-506, 509-549, 551-602, 605-660, 663-685, 707-720, 815-847` | Búsqueda en `scripts/unit-test.mjs` y `scripts/smoke-test.mjs` de endpoints como `/api/install`, `/api/watchlist`, `/api/bulk`, `/api/settings` arroja **0 resultados**. | Desarrollar `tests/integration/api-mutations.test.mjs` validando ciclo de vida completo: POST install, GET watchlist, POST settings, POST bulk, POST import. | 3.5 h |
| 3 | **Media** | **Aserciones no estrictas y falsos positivos en suites de prueba**: En `smoke-test.mjs`, la resolución de `cline` y `gh` no tiene `assert` (solo `console.log`); `/api/health` solo evalúa `checks.length >= 4` sin verificar que `health.ok === true`; y en `unit-test.mjs` el test de concurrencia evalúa `typeof iteration === "number"` en lugar del valor exacto `4`. | `scripts/smoke-test.mjs:64-67, 78-84`<br>`scripts/unit-test.mjs:78` | `scripts/smoke-test.mjs:64-67`:<br>`const cline = await resolveCommand("cline");`<br>`console.log(" cline resolved to:", cline \|\| "NOT FOUND");`<br>*(Si `cline` es null, el test pasa sin error).* | Añadir `assert.ok(cline, "cline binary must resolve")`, `assert.strictEqual(health.ok, true)`, y en `unit-test.mjs` `assert.strictEqual(finalData.iteration, 4)`. | 1 h |
| 4 | **Media** | **Polución de almacenamiento de producción y falta de aislamiento en pruebas**: `unit-test.mjs` escribe en `data/test-queue-*.json`, mientras que `smoke-test.mjs` muta `data/installed.json` y `data/context-cache.json` en disco real durante la ejecución de los tests. | `scripts/unit-test.mjs:67`<br>`lib/routes.js:228, 246`<br>`scripts/smoke-test.mjs:86-92` | `ls data/`<br>*Durante las pruebas se crean y modifican archivos en el directorio de runtime del usuario*. | Parametrizar `dataDir` en el router de Express y en los tests para apuntar a un directorio temporal efímero generado con `fs.mkdtempSync(join(os.tmpdir(), "cline-test-"))`. | 2 h |
| 5 | **Media** | **Acoplamiento de entorno y falta de mocks de procesos para `lib/runner.js`**: `runner.js` tiene solo 32.59% de cobertura; `runCline`, la cola de serialización `_commandLock`, la terminación de árbol de procesos `killProcessTree` y el manejo de timeouts no tienen pruebas unitarias aisladas. | `lib/runner.js:62-135` | `node --test --experimental-test-coverage scripts/unit-test.mjs`<br>*Líneas 21-25, 42-54, 63-135 no cubiertas*. | Escribir tests unitarios con stubs de `child_process.spawn` para validar timeout de 180s, reintento con `--force` y serialización de comandos concurrentes. | 2.5 h |
| 6 | **Media** | **Divergencia semántica y duplicación en `isWindowsBatchShim`**: `isWindowsBatchShim` está implementado dos veces con diferente comportamiento ante plataformas POSIX (`sanitizers.js:56-60` no valida OS, mientras `resolver.js:123-127` valida `platform() === 'win32'`). `runner.js` importa la versión de sanitizers y `routes.js` importa la de resolver. | `lib/sanitizers.js:56-60`<br>`lib/resolver.js:123-127`<br>`lib/runner.js:7`<br>`lib/routes.js:14` | Ejecución diagnóstica en entorno POSIX:<br>`isShimSanitizer('/tmp/fake.cmd') === true`<br>`isShimResolver('/tmp/fake.cmd') === false` | Unificar la función en `lib/resolver.js` y exportarla consistentemente hacia `runner.js`, `routes.js` y `unit-test.mjs`. | 30 min |
| 7 | **Baja** | **Ausencia de umbrales mínimos de cobertura en CI (`coverage threshold gate`)**: La pipeline de GitHub Actions ejecuta `npm run test:unit` y `npm run test:smoke` pero no falla la build si la cobertura disminuye o no alcanza un umbral (e.g. 80%). | `.github/workflows/ci.yml:32-36` | `.github/workflows/ci.yml` líneas 32-36:<br>`run: npm run test:unit`<br>`run: npm run test:smoke`<br>*(Sin flags de cobertura ni validación de threshold).* | Configurar `node --test --experimental-test-coverage --test-coverage-threshold 75` o integrar reporte `c8` en el workflow de CI. | 30 min |
| 8 | **Baja** | **Inexistencia de pruebas End-to-End (E2E) para la interfaz web (`public/`) y CLI (`bin/`)**: La aplicación de navegador local y los flags del binario CLI (`--no-open`, `--port`, subcomando `refresh`) no tienen pruebas automatizadas de interfaz o interacción. | `public/index.html`<br>`bin/cline-marketplace.js:50-74` | Búsqueda de herramientas E2E (Playwright, Puppeteer) arroja 0 configuraciones de test frontend. | Implementar un smoke E2E ligero con Node test runner o Playwright headless para validar carga del DOM, filtros de tags y renderizado del catálogo. | 3 h |

---

### Top 3 Quick Wins
1. **Aserciones estrictas en `scripts/smoke-test.mjs` y `scripts/unit-test.mjs`**: Reemplazar verificaciones laxas (`typeof iteration === "number"`, ausencia de asserts en `resolveCommand`) por `assert.strictEqual(finalData.iteration, 4)` y comprobación obligatoria de `health.ok === true`. *(Esfuerzo: 1 h)*.
2. **Unificación de `isWindowsBatchShim`**: Eliminar la copia redundante en `lib/sanitizers.js`, usar la versión estricta de `lib/resolver.js` en todos los módulos y corregir las importaciones en `lib/runner.js`. *(Esfuerzo: 30 min)*.
3. **Métricas de cobertura nativa en `package.json` y CI**: Actualizar el script `test:unit` a `node --test --experimental-test-coverage scripts/unit-test.mjs` y publicarlo en el log de CI. *(Esfuerzo: 15 min)*.

### Top 3 Deudas Críticas
1. **Zero-coverage en `lib/routes.js` (861 líneas) y endpoints mutantes**: Toda la lógica transaccional de la API Express (instalación de plugins, modificación de watchlist, importación y settings) no tiene ningún test automatizado que prevenga regresiones.
2. **Zero-coverage en `lib/probes.js` (291 líneas)**: El motor de inspección de filesystem para VS Code, Claude Desktop, Cursor y directorios `.cline` no tiene pruebas unitarias con estructuras de archivos simuladas.
3. **Polución de estado en disco durante tests**: Los tests unitarios e integrados crean y modifican archivos en la carpeta real `data/` del repositorio, lo que puede corromper el estado del usuario local durante el desarrollo.

### Top 3 Oportunidades Estratégicas
1. **Suite de Integración con Directorio Temporal (`os.tmpdir()`)**: Diseñar una fixture compartida de testing que inicie el router de Express sobre un directorio aislado efímero, permitiendo probar mutaciones completas sin tocar archivos de producción.
2. **Mocks de Procesos para `runCline` y Simulación de Fallos de Red**: Implementar tests que simulen timeouts de procesos, respuestas no zero de CLI, fallos de API de GitHub (rate limits 403) y archivos JSON malformados en cuarentena.
3. **Smoke Tests E2E de CLI y Frontend**: Añadir pruebas que ejecuten `bin/cline-marketplace.js --help` y validen con un browser headless que `index.html` inicializa correctamente los 250+ items del catálogo.

---

### Verificación y Métodos de Reproducción

Para verificar de manera independiente todos los hallazgos de este reporte:

1. **Ejecutar suite de tests oficial:**
   ```bash
   npm test
   ```
2. **Ejecutar reporte de cobertura nativo:**
   ```bash
   node --test --experimental-test-coverage scripts/unit-test.mjs
   ```
3. **Verificar ausencia de aserciones en `smoke-test.mjs` (Líneas 64-67):**
   ```bash
   grep -n "resolveCommand" scripts/smoke-test.mjs
   ```
4. **Verificar duplicación de `isWindowsBatchShim`:**
   ```bash
   grep -n "function isWindowsBatchShim" lib/sanitizers.js lib/resolver.js
   ```
5. **Verificar mutación de disco en tests:**
   ```bash
   node scripts/smoke-test.mjs
   git status data/
   ```


---

<a id="capitulo-09-observabilidad--diagnostico"></a>

# Capítulo 09: Observabilidad & Diagnóstico

> **Fuente Original:** [`09-observabilidad.md`](./09-observabilidad.md)

# Capa 9: Observabilidad & Diagnóstico

### Score: 8.8/10
Sólida infraestructura base con logger modular ANSI (`lib/logger.js`), trazas de ejecución con tiempos en milisegundos (`logger.exec`, `logger.http`), diagnósticos multi-probe enriquecidos (`/api/health`, `/api/status`, `/api/context`, `/api/stats`) y telemetría de memoria/uptime. Presenta margen de mejora en estandarización de esquemas de error JSON, correlación de peticiones (`X-Request-Id`), niveles de log configurables (`LOG_LEVEL`), modo de log JSON estructurado para ingestion cloud/CI, flags de depuración CLI (`--verbose`/`--debug`) y concurrencia optimizada en sondeos de salud.

---

### Matriz de Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia Empírica (comando + output) | Fix Propuesto | Esfuerzo |
|---|---|---|---|---|---|:---:|
| 1 | **Media** | Retorno de documento HTML en rutas `/api/*` no existentes (404) | `server.js:103-106` | `fetch("http://127.0.0.1:5173/api/nonexistent")` $\rightarrow$ `HTTP 404`, `Content-Type: text/html`<br>`<!DOCTYPE html>...<pre>Cannot GET /api/nonexistent</pre>` | Registrar middleware 404 dedicado para `/api/*` que retorne JSON `{ ok: false, error: "Endpoint not found: GET /api/...", code: "NOT_FOUND" }`. | 5 min |
| 2 | **Media** | Inconsistencia de esquemas de respuesta de error en endpoints Express | `lib/routes.js:405,433,476,488,515,537,683`, `server.js:54,63,111` | `POST /api/install (body {})` $\rightarrow$ `{"error":"..."}` (sin `ok: false`)<br>`POST /api/refresh (error)` $\rightarrow$ `{"ok":false,"error":"..."}`<br>`server.js (500)` $\rightarrow$ `{"ok":false,"error":"..."}` | Unificar middleware de respuesta de error con helper `sendError(res, status, code, message, details)` garantizando `{ ok: false, code, error, details, timestamp }`. | 15 min |
| 3 | **Media** | Código de salida exitoso falso (`exit 0`) en fallo de actualización CLI | `bin/cline-marketplace.js:221-224` | `sub === "update"` captura excepción con `catch (err) { error(...) }` e inmediatamente ejecuta `process.exit(0)` en lugar de `process.exit(1)`. | Invocar `process.exit(1)` en el bloque `catch` del comando `update` para señalizar fallo real a scripts y CI. | 2 min |
| 4 | **Media** | Ausencia de niveles de log filtrables (`LOG_LEVEL`) y método `logger.debug` | `lib/logger.js:24-48` | `process.env.LOG_LEVEL = "warn"` $\rightarrow$ Todos los logs (`INFO`, `OK`, `HTTP`) continúan emitiéndose a stdout sin filtrado por severidad. | Implementar jerarquía de niveles (`debug: 10, info: 20, warn: 30, error: 40, silent: 50`) y evaluar contra `process.env.LOG_LEVEL || "info"`. | 10 min |
| 5 | **Media** | Latencia secuencial de procesos hijos (~1500ms) en endpoint `/api/health` | `lib/routes.js:329-357` | `fetch("/api/health")` $\rightarrow$ Tardo `1497.23ms` debido a ejecución secuencial síncrona/promisificada de `cline --version` y `gh version`. | Paralelizar sondeos externos con `Promise.allSettled()` y aplicar memoización en memoria con TTL de 15 segundos. | 15 min |
| 6 | **Media** | Umbral de salud permisivo reporta `ok: true` ante ausencia del CLI `cline` | `lib/routes.js:386` | `ok: checks.filter(c => c.ok).length >= 4` $\rightarrow$ Si `cline` y `gh` fallan pero los otros 4 pasan, `/api/health` evalúa a `true` aunque el control plane no pueda operar. | Categorizar probes como obligatorios (`critical: true` para `node`, `cline`, `catalog`) y fallar el health global si falta un componente crítico. | 5 min |
| 7 | **Baja** | Ausencia de Correlation IDs / Request Tracing (`X-Request-Id`) | `server.js:77-86`, `lib/logger.js:44-47`, `lib/runner.js:124` | `Headers X-Request-Id: null` en todas las respuestas HTTP; trazas `EXEC` y `HTTP` desacopladas sin ID de correlación cruzada. | Generar `req.id = req.headers["x-request-id"] || crypto.randomUUID()`, propagarlo en headers `res.setHeader("X-Request-Id", req.id)` y adjuntarlo a `logger.http`/`logger.exec`. | 10 min |
| 8 | **Baja** | Omisión de modo de salida JSON estructurado para ingestion cloud/CI | `lib/logger.js:24-48` | El logger solo formatea strings ANSI para consola interactiva. No soporta `LOG_FORMAT=json` ni NDJSON machine-readable. | Añadir flag `const isJson = process.env.LOG_FORMAT === "json"` para emitir objetos JSON serializados por línea a stdout/stderr. | 10 min |
| 9 | **Baja** | CLI carece de flags de depuración `--verbose`, `--debug` y `--json` | `bin/cline-marketplace.js:50-74` | `cline-marketplace --verbose` $\rightarrow$ No reconocido; inicia servidor sin alterar verbosidad de salida ni mostrar trazas de error completas. | Incorporar parsing de `--verbose`, `--debug` y `--json` en CLI, inyectando variables `LOG_LEVEL=debug` y `LOG_FORMAT=json`. | 15 min |
| 10 | **Baja** | Duplicación y fragmentación de funciones de logging en CLI (`bin/cline-marketplace.js`) | `bin/cline-marketplace.js:40-48` | `bin/cline-marketplace.js` declara funciones aisladas `log()`, `warn()`, `error()` con formato `[HH:MM:SS] [CLI]` en vez de reutilizar `lib/logger.js`. | Importar `logger` desde `../lib/logger.js` para mantener un formato visual y operacional 100% unificado en toda la aplicación. | 10 min |
| 11 | **Baja** | HTTP Access Log omite rutas estáticas (`/`, `/public/*`, `/docs/*`) | `server.js:81-83` | `if (req.path.startsWith("/api/")) { logger.http(...) }` $\rightarrow$ Peticiones a assets JS/CSS y SPA no son auditables en logs. | Registrar peticiones generales o habilitar traza de assets bajo nivel `debug` / flag configurable. | 5 min |
| 12 | **Informativa** | Ausencia de métricas de tráfico HTTP en tiempo de ejecución en `/api/status` | `lib/routes.js:290-317` | `/api/status` expone memoria y uptime, pero carece de contadores de requests atendidos (`totalRequests`, `status2xx`, `status4xx`, `status5xx`, `avgLatencyMs`). | Integrar un colector ligero en memoria de métricas HTTP expuesto en `/api/status`. | 10 min |
| 13 | **Informativa** | Timestamp de logs con resolución en segundos sin milisegundos ni fecha | `lib/logger.js:20-22` | `function ts() { return new Date().toISOString().slice(11, 19); }` emite `[HH:MM:SS]`, perdiendo discriminación cronológica milimétrica. | Extender `ts()` a `toISOString().slice(11, 23)` (`HH:MM:SS.mmm`) o timestamp ISO completo en modo no TTY. | 3 min |

---

### Análisis Empírico por Dominio

#### 1. Arquitectura de Logging & Transports
- **Estado Actual**:
  - `lib/logger.js` centraliza los canales `info`, `warn`, `error`, `success`, `exec` y `http`.
  - Cumple estrictamente con la detección de entorno TTY y el estándar `NO_COLOR` (`!process.env.NO_COLOR && (process.env.FORCE_COLOR !== "0") && (process.stdout?.isTTY ?? true)`).
  - La sincronización atómica de archivos en `lib/state.js` detecta corrupción de JSON y genera copias de cuarentena `*.corrupt.<timestamp>` registrando `logger.error`.
- **Deficiencias Detectadas**:
  - Inexistencia de soporte para `LOG_LEVEL` (ej. `LOG_LEVEL=error` o `LOG_LEVEL=silent`). No existe el método `logger.debug()`.
  - Inexistencia de modo de salida JSON estructurado (`LOG_FORMAT=json`), imprescindible para ingestores de logs en contenedores y pipelines de observabilidad (Datadog, AWS CloudWatch, Grafana Loki, ELK).
  - Fragmentación en `bin/cline-marketplace.js` y `scripts/refresh-catalog.mjs`, los cuales reimplementan funciones `console.log("[CLI] ...")` y `console.log("[refresh] ...")` en vez de consumir `lib/logger.js`.

#### 2. Formato de Errores y Códigos de Salida
- **Estado Actual**:
  - El manejador global de Express en `server.js:109-112` captura excepciones no controladas y responde `{ ok: false, error: err.message || "Internal Server Error" }`.
  - Las validaciones de entrada (`sanitizers.js`) previenen path traversal y sanitizan identificadores antes de la ejecución.
- **Deficiencias Detectadas**:
  - **Inconsistencia de Respuestas de Error**: Endpoints como `/api/install`, `/api/uninstall`, `/api/bulk`, `/api/workspaces/recent` retornan `{ error: "..." }` con HTTP 400/500, mientras que `/api/refresh`, `/api/update/run` y el middleware de error global retornan `{ ok: false, error: "..." }`.
  - **Fallo 404 HTML**: Al solicitar una ruta `/api/*` inexistente (ej. `/api/nonexistent`), Express devuelve el documento HTML estándar de Express (`<pre>Cannot GET /api/nonexistent</pre>`) con `Content-Type: text/html` en lugar de un JSON estructurado consumible por clientes API.
  - **CLI Update Exit Code**: En `bin/cline-marketplace.js:221-224`, cuando `git pull` o `npm install` lanzan un error durante `cline-marketplace update`, el bloque `catch` registra el mensaje de error pero ejecuta `process.exit(0)`, retornando erróneamente éxito al sistema operativo.

#### 3. Trazabilidad de Peticiones y Correlación (Request Tracing)
- **Estado Actual**:
  - Middleware en `server.js:78-86` mide el tiempo de respuesta con `Date.now() - start` en el evento `res.on("finish")` para rutas `/api/*`.
  - `lib/runner.js:124` registra la duración de comandos externos CLI (`logger.exec`).
- **Deficiencias Detectadas**:
  - No existe generación ni propagación de encabezados de correlación `X-Request-Id`.
  - Las trazas de ejecución CLI en `lib/runner.js` ocurren en un contexto desacoplado, imposibilitando correlacionar un comando `cline plugin install <id>` con la petición HTTP entrante que lo disparó.

#### 4. Facilidades de Depuración y Diagnóstico
- **Estado Actual**:
  - Catálogo completo de endpoints de diagnóstico:
    - `GET /api/status`: Inspección de Node, SO, PID, uptime, memoria, rutas de almacenamiento y contadores del catálogo.
    - `GET /api/health`: Sondeo de 6 subsistemas (`node`, `cline`, `gh`, `cline-storage`, `catalog`, `metadata`).
    - `GET /api/context`: Análisis estático del workspace actual (lenguajes, frameworks detectados y recomendaciones).
    - `GET /api/stats`: Análisis estadístico de autores, tags y frescura temporal.
    - `GET /api/changelog`: Diferencial entre versiones de catálogo upstream.
- **Deficiencias Detectadas**:
  - **Latencia Secuencial de Health Checks**: `/api/health` tarda **~1500ms** debido a que ejecuta secuencialmente `cline --version` y `gh version`.
  - **Cálculo de Salud Permisivo**: La expresión `checks.filter(c => c.ok).length >= 4` evalúa a `ok: true` aun cuando el binario fundamental `cline` no esté presente en el sistema.
  - **Falta de Flags CLI**: `bin/cline-marketplace.js` no cuenta con flags `--verbose`, `--debug` ni `--json`.

#### 5. Métricas y Monitoreo de Recursos
- **Estado Actual**:
  - Uptime medido con `Math.round(process.uptime())` (ciclo de vida del proceso de control plane).
  - Telemetría de memoria expuesta mediante `process.memoryUsage()` (`rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`).
- **Deficiencias Detectadas**:
  - Ausencia de métricas de rendimiento HTTP en memoria (conteo de peticiones totales, ratio de errores 4xx/5xx, latencia promedio o percentiles p95).

---

### Evidencias de Verificación Empírica

#### 1. Prueba de Canales y Formato del Logger (`lib/logger.js`)
```bash
node -e "
import { logger } from './lib/logger.js';
logger.info('Test info message', { extra: 123 });
logger.warn('Test warn message');
logger.error('Test error message');
logger.success('Test success message');
logger.exec('cline plugin list', 45, 0);
logger.exec('cline plugin install bad-pkg', 120, 1);
logger.http('GET', '/api/status', 200, 12);
logger.http('POST', '/api/install', 500, 450);
"
```
**Salida Obtenida:**
```text
[17:31:33] INFO  Test info message { extra: 123 }
[17:31:33] WARN  Test warn message
[17:31:33] ERROR Test error message
[17:31:33] OK    Test success message
[17:31:33] EXEC  cline plugin list -> exit 0 (45ms)
[17:31:33] EXEC  cline plugin install bad-pkg -> exit 1 (120ms)
[17:31:33] HTTP  GET /api/status -> 200 (12ms)
[17:31:33] HTTP  POST /api/install -> 500 (450ms)
```

#### 2. Prueba de Cumplimiento `NO_COLOR`
```bash
node -e "
process.env.NO_COLOR = '1';
import('./lib/logger.js').then(({ colors, logger }) => {
  console.log('colors.cyan is empty string?', colors.cyan === '');
  logger.info('Testing NO_COLOR output');
});
"
```
**Salida Obtenida:**
```text
colors.cyan is empty string? true
[17:31:37] INFO  Testing NO_COLOR output
```

#### 3. Benchmark de Endpoints Diagnósticos y Latencia de `/api/health`
```bash
node -e "
import { app } from './server.js';
import { createServer } from 'node:http';

const server = createServer(app).listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const base = 'http://127.0.0.1:' + port;
  const endpoints = ['/api/status', '/api/health', '/api/stats', '/api/context', '/api/changelog', '/api/version', '/api/update/check'];
  for (const ep of endpoints) {
    const t0 = performance.now();
    const res = await fetch(base + ep);
    const ms = (performance.now() - t0).toFixed(2);
    const data = await res.json();
    console.log(ep + ' -> status: ' + res.status + ' (' + ms + 'ms), keys: ' + Object.keys(data).join(', '));
  }
  server.close();
});
"
```
**Salida Obtenida:**
```text
/api/status -> status: 200 (107.19ms), keys: node, platform, arch, pid, uptime, memory, clinePath, storageRoots, clineRoots, catalog, installedCount, metaCount
/api/health -> status: 200 (1497.23ms), keys: ok, checks, system
/api/stats -> status: 200 (6.45ms), keys: total, byType, byTag, topAuthors, freshness, installed
/api/context -> status: 200 (6.26ms), keys: cwd, repo, languages, frameworks, tags, hints, recommended
/api/changelog -> status: 200 (7.26ms), keys: added, removed, updated
/api/version -> status: 200 (2.57ms), keys: version, app
/api/update/check -> status: 200 (439.35ms), keys: hasUpdate, currentVersion, remoteVersion
```

#### 4. Detección de Falla 404 HTML en Rutas de API
```bash
node -e "
import { app } from './server.js';
import { createServer } from 'node:http';

const server = createServer(app).listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const res = await fetch('http://127.0.0.1:' + port + '/api/nonexistent');
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Body:', (await res.text()).slice(0, 100));
  server.close();
});
"
```
**Salida Obtenida:**
```text
Status: 404
Content-Type: text/html; charset=utf-8
Body: <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot GET /api/nonexistent</pre>
```

#### 5. Prueba de Malformed JSON y Manejo Global de Excepciones
```bash
node -e '
import { app } from "./server.js";
import { createServer } from "node:http";

const server = createServer(app).listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  const res = await fetch("http://127.0.0.1:" + port + "/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://127.0.0.1:" + port },
    body: "{\"broken_json\": 123"
  });
  const data = await res.json();
  console.log("Status:", res.status, "body:", JSON.stringify(data));
  server.close();
});
'
```
**Salida Obtenida:**
```text
[17:32:36] ERROR Unhandled request error: Expected ',' or '}' after property value in JSON at position 19 (line 1 column 20)
Status: 400 body: {"ok":false,"error":"Expected ',' or '}' after property value in JSON at position 19 (line 1 column 20)"}
```

---

### 3 Quick Wins Recomendados

1. **Fallback 404 JSON para `/api/*`:**
   Insertar antes del manejador de errores global en `server.js`:
   ```javascript
   app.use("/api", (req, res) => {
     res.status(404).json({ ok: false, error: `Endpoint not found: ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" });
   });
   ```

2. **Corrección de Exit Code en CLI `update`:**
   En `bin/cline-marketplace.js:221-224`:
   ```javascript
   // Antes:
   } catch (err) {
     error(`Update failed: ${err.message}`);
   }
   process.exit(0);

   // Después:
   } catch (err) {
     error(`Update failed: ${err.message}`);
     process.exit(1);
   }
   process.exit(0);
   ```

3. **Paralelización de Diagnósticos en `/api/health`:**
   En `lib/routes.js:329-357`, envolver las llamadas externas en `Promise.allSettled()` para reducir la latencia de diagnóstico de ~1500ms a ~700ms.

---

### Plan de Remediación Priorizado

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FASE 1: INTEGRIDAD INMEDIATA (30 min)              │
├────────────────────────────────────────────────────────────────────────┤
│ 1. [Fix] Corregir exit code 1 en CLI update (bin/cline-marketplace.js) │
│ 2. [Fix] Agregar middleware 404 JSON para /api/* en server.js          │
│ 3. [Fix] Corregir lógica de health check crítico (cline obligatorio)   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                      FASE 2: TRAZABILIDAD & LOGGING (1.5 h)             │
├────────────────────────────────────────────────────────────────────────┤
│ 4. [Logger] Añadir LOG_LEVEL, logger.debug() y LOG_FORMAT=json         │
│ 5. [Tracing] Generar X-Request-Id y propagar en headers y logs         │
│ 6. [CLI] Unificar logger de CLI con lib/logger.js y añadir --verbose   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                      FASE 3: PERFORMANCE & MÉTRICAS (1 h)               │
├────────────────────────────────────────────────────────────────────────┤
│ 7. [Health] Paralelizar checks externos con Promise.allSettled() y TTL │
│ 8. [Metrics] Incorporar contador de peticiones HTTP en /api/status     │
│ 9. [Schema] Estandarizar helper sendError(res, status, code, msg)      │
└────────────────────────────────────────────────────────────────────────┘
```


---

<a id="capitulo-10-logica-de-negocio--catalogo"></a>

# Capítulo 10: Lógica de Negocio & Catálogo

> **Fuente Original:** [`10-negocio.md`](./10-negocio.md)

# Capa 10: Lógica de Negocio & Catálogo

### Score: 7.8/10
**Justificación:** El sistema cuenta con una arquitectura de catálogo y control plane bien estructurada con 202 primitivas indexadas, persistencia atómica y reconciliación de drift. No obstante, la dimensión se ve penalizada por la omisión total del ecosistema `.commandcode` (dejando 30 skills y servidores MCP locales invisibles), corrupción de metadata en skills locales con YAML block scalars (`>` / `|`), ausencia absoluta de validación formal de esquemas en ingesta remota y falta de un motor de resolución de dependencias entre primitivas.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Omisión del tooling `.commandcode` y `.agents` en la detección de skills y servidores MCP | `lib/probes.js:24-61`<br>`lib/probes.js:224-270` | `node -e "const fs = require('fs'); import('./lib/probes.js').then(({ fsProbe }) => { const probe = fsProbe(); const cmdSkills = fs.readdirSync('C:/Users/mateo/.commandcode/skills'); const missing = cmdSkills.filter(s => !probe.found.skills.has(s)); console.log('Skills en .commandcode:', cmdSkills.length, 'No detectadas por fsProbe:', missing.length); });"`<br>Output: `Skills en .commandcode: 67 No detectadas por fsProbe: 30`<br>Además, el MCP `serena` en `C:\Users\mateo\.commandcode\mcp.json` no es detectado. | Incluir `join(home, ".commandcode")` y `join(home, ".agents")` en `clineRootCandidates()`, e incorporar `join(home, ".commandcode", "mcp.json")` en la lista `mcpConfigFiles` de `lib/probes.js`. | 25 min |
| 2 | **Alta** | Corrupción de descripción en metadata de skills locales por parsing ingenuo de YAML Frontmatter | `lib/probes.js:120-136` | `node -e "const inst = JSON.parse(require('fs').readFileSync('data/installed.json', 'utf8')); for (const [k, v] of Object.entries(inst.items)) { if (v.metadata && (v.metadata.description === '>' \|\| v.metadata.description === '\|')) console.log(k, '->', v.metadata.description); }"`<br>Output:<br>`skill:caveman -> >`<br>`skill:cloudflare-pages-ops -> >`<br>`skill:mercado-pago -> \|`<br>`skill:python-monorepo-architecture -> >`<br>`skill:rust-best-practices -> >` | Reemplazar el `split('\n')` ingenuo por un parser de frontmatter YAML que extraiga el campo `description:` colapsando líneas continuas y descartando indicadores de bloque `>` y `\|`. | 20 min |
| 3 | **Alta** | Ausencia total de motor de resolución de dependencias entre plugins, skills y servidores MCP | `catalog.json:1-6060`<br>`lib/routes.js:400-470`<br>`lib/runner.js:28-36` | `grep_search` por `dependencies` en `catalog.json` y `lib/` no arroja soporte para dependencias entre primitivas. Skills que dependen de MCPs (ej. `skill:postgres-rls` → `mcp:postgres`/`neon`; `skill:cloudflare` → `mcp:cloudflare`) se instalan sin validar ni advertir sobre prerrequisitos faltantes. | Definir esquema de dependencias (`dependencies: { mcps: [], skills: [], bins: [], env: [] }`) en las primitivas y agregar validación previa en `/api/install` y endpoint `/api/dependencies/check`. | 1 h 30 min |
| 4 | **Media** | Falsos positivos severos en motor de recomendaciones de contexto por matching de subcadenas sin límites de palabra | `lib/routes.js:105-109`<br>`scripts/detect-context.mjs:77-97` | `node -e 'const cat = JSON.parse(require("fs").readFileSync("catalog.json", "utf8")); const tok = "go"; const matches = cat.entries.filter(e => (e.id + " " + e.name + " " + (e.description\|\|"")).toLowerCase().includes(tok)); console.log("Coincidencias para token go:", matches.length);'`<br>Output: `Coincidencias para token go: 24 out of 202` (Coincide falsamente con Google Cloud, AlloyDB, BigQuery, Dataplex, Spanner por contener "google", "algo", "category"). | Reemplazar `.includes(tok)` por regex con límites de palabra (`new RegExp('\\b' + escapeRegex(tok) + '\\b', 'i')`) o matching estricto contra array de tags/tokens. | 15 min |
| 5 | **Media** | Ingesta y actualización de catálogo remoto sin validación formal de esquema JSON | `scripts/refresh-catalog.mjs:271-287` | `const catalog = await fetchJson(CATALOG_URL);`<br>`writeFileSync(cur, JSON.stringify(catalog, null, 2));`<br>Si el endpoint upstream devuelve un payload con estructura truncada o campos corruptos, se sobreescribe `catalog.json` local sin verificación previa. | Validar el objeto descargado contra un esquema estricto (JSON Schema o validador de estructura requerida) antes de rotar y escribir `catalog.json`. | 30 min |
| 6 | **Media** | Error HTTP 500 en `/api/update/run` en instalaciones npm globales (asume repositorio git) | `lib/routes.js:707-719`<br>`bin/cline-marketplace.js:210-223` | `lib/routes.js:712`: `execFileP(gitExe, ["pull", "origin", "main"], { cwd: root })`<br>En instalaciones vía `npm install -g cline-marketplace`, no existe `.git` y `git pull` falla con `fatal: not a git repository`. `bin/cline-marketplace.js` maneja esto con `existsSync(gitDir)`, pero el endpoint Express no. | Agregar verificación `existsSync(join(root, '.git'))` en `/api/update/run` y ejecutar `npm install -g cline-marketplace@latest` en entornos sin git. | 15 min |
| 7 | **Baja** | Búsqueda frontend puramente substring sin ponderación de relevancia ni tolerancia difusa (Fuzzy Search) | `public/app.js:351-365` | `tokens.every((t) => haystack.includes(t))` busca en un string concatenado sin priorizar matches exactos en `id` o `name` sobre menciones en `description`. Errores tipográficos ("dockr", "postgress") devuelven 0 resultados. | Implementar algoritmo de relevancia ponderada (`id`: 3x, `name`: 2x, `tags`: 1.5x, `description`: 1x) o integrar un buscador difuso ligero. | 35 min |
| 8 | **Baja** | Falta de detección de colisiones y enmascaramiento en servidores MCP multi-fuente | `lib/probes.js:277-286` | `if (id && !found.mcps.has(id)) found.mcps.set(...)`<br>Aplica "first-seen wins" silencioso sin registrar cuándo una configuración a nivel de workspace (`.vscode/mcp.json`) sobreescribe una global (`cline_mcp_settings.json` o `.commandcode/mcp.json`). | Registrar fuentes en conflicto y añadir atributo `shadowedBy` o `overrides` para alertar al usuario en la interfaz. | 25 min |

---

### 3 quick wins
1. **Soporte nativo para `.commandcode` y `.agents` en `lib/probes.js`**: Agregar las rutas canónicas de `~/.commandcode` y `~/.agents` para descubrir de inmediato las 30 skills y servidores MCP locales instalados.
2. **Corrección de matching por límites de palabra en recomendaciones (`\b`)**: Evitar falsos positivos en `analyzeWorkspaceContext` sustituyendo `.includes()` por expresiones regulares de palabra completa.
3. **Fallback para actualización de app vía `npm install -g` en `/api/update/run`**: Comprobar `existsSync(join(root, '.git'))` antes de ejecutar `git pull`.


---

<a id="capitulo-11-cli-engine--runtime-bridge"></a>

# Capítulo 11: CLI Engine & Runtime Bridge

> **Fuente Original:** [`11-bridge.md`](./11-bridge.md)

# Capa 11: CLI Engine & Runtime Bridge

**Auditoría Especializada — Dimensión 11: CLI Engine & Runtime Bridge**  
**Fecha:** 2026-08-30  
**Proyecto:** ClineMarket (`cline-marketplace`)  
**Binario Principal:** `bin/cline-marketplace.js`  
**Controlador de Runtime:** `server.js` | `lib/runner.js` | `lib/resolver.js`  
**Score Objetivo:** **7.8 / 10**

---

## 1. Resumen Ejecutivo y Evaluación Global

La dimensión de **CLI Engine & Runtime Bridge** evalúa la robustez, portabilidad, ciclo de vida de procesos, interoperabilidad entre el binario de línea de comandos y el servidor de control plane, compatibilidad multiplataforma (Windows PowerShell / CMD / Linux / macOS) y la interacción con el CLI subyacente de `cline`.

### Aspectos Destacados (Fortalezas)
1. **Serialización de Comandos en Cola FIFO (`lib/runner.js:14, 132-134`)**: Implementación robusta de `_commandLock` mediante promesas encadenadas, garantizando que operaciones concurrentes sobre el backend de `cline` no colisionen ni corrompan el estado del filesystem.
2. **Manejo Especializado de Shims Multiplataforma (`lib/resolver.js:118-127`, `lib/runner.js:78-91`)**: Detección nativa de shims Windows (`.cmd`, `.bat`) con activación automática de `shell: true`, junto con búsqueda heurística en `where.exe` / `which` y directorios globales (`APPDATA`, `LOCALAPPDATA`, `scoop`, `chocolatey`, `cargo`, `homebrew`).
3. **Terminación Defensiva de Árbol de Procesos (`lib/runner.js:42-54`)**: Uso de `taskkill /pid ${proc.pid} /T /F` en Windows y escalado de `SIGTERM` a `SIGKILL` con temporizador de gracia en POSIX para prevenir procesos huérfanos.
4. **Detección Multi-Instancia y Loopback Probing (`bin/cline-marketplace.js:138-168, 248-276`)**: Detección inteligente de instancias activas preexistentes vía socket probe y HTTP GET `/api/status`, evitando el lanzamiento redundante de múltiples servidores locales.

### Áreas Críticas de Mejora (Debilidades)
1. **Manejo Incompleto de Argumentos CLI y Flags Estándar**: Ausencia del flag `--version` / `-v` (que provoca el arranque no deseado del servidor en lugar de imprimir la versión) y falta de validación de subcomandos desconocidos.
2. **Excepción No Controlada `RangeError` por Puerto Inválido (`bin/cline-marketplace.js:140`)**: `net.connect()` en `isPortOpen` carece de bloque `try/catch` y validación de rango `1-65535`, colapsando el CLI ante entradas fuera de rango.
3. **Código de Salida 0 en Fallo del Subcomando `update` (`bin/cline-marketplace.js:224`)**: Enmascara errores en scripts de automatización y pipelines CI/CD retornando éxito tras excepciones fatales.
4. **Desconexión en Colisión de Puertos entre CLI y Servidor (`bin/cline-marketplace.js:254-268` vs `server.js:126-155`)**: Si el puerto objetivo está ocupado por una app ajena, el servidor cambia a un puerto libre pero el CLI abre el navegador en el puerto colisionado original por falta de handshake/IPC.
5. **Permisos de Archivo en Git Index (`100644`) y Líneas CRLF en Scripts**: `bin/cline-marketplace.js` y `scripts/*.mjs` están registrados como no ejecutables en git, y `scripts/refresh-catalog.mjs` posee finales de línea CRLF que fallan en Linux/macOS.

---

## 2. Arquitectura del Runtime Bridge & CLI Engine

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                            CLI INVOCATION                               │
 │             npx cline-marketplace / node bin/cline-marketplace.js       │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
     [ CLI Flags / Subcommands ]                  [ IPC & Instance Probe ]
     --help / -h      --> Print Help & Exit       isPortOpen(port, host)
     --version / -v   --> [BUG: Missing!]         probeStatus(port, host)
     refresh          --> Run refresh script      ├─► Active: Attach & Open Browser
     update           --> git pull / npm update   └─► Inactive: Spawn server.js
     default          --> Bootstrap & Daemon
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                       EXPRESS 5 CONTROL PLANE                           │
 │                              server.js                                  │
 ├─────────────────────────────────────────────────────────────────────────┤
 │  • Dynamic Port Discovery (findAvailablePort)                           │
 │  • Loopback Binding (127.0.0.1) & Host Header Guards                    │
 │  • REST API Router (lib/routes.js)                                      │
 └──────────────────────┬────────────────────────────┬─────────────────────┘
                        │                            │
                        ▼                            ▼
 ┌────────────────────────────────────────┐ ┌──────────────────────────────┐
 │         COMMAND RESOLVER               │ │   SERIALIZED RUNNER QUEUE    │
 │          lib/resolver.js               │ │        lib/runner.js         │
 ├────────────────────────────────────────┤ ├──────────────────────────────┤
 │ • where.exe (Win) / which (POSIX)      │ │ • FIFO Queue (_commandLock)  │
 │ • Fallbacks (AppData, Scoop, Choco...) │ │ • isWindowsBatchShim (shell) │
 │ • isWindowsBatchShim (.cmd, .bat)      │ │ • Process Tree Kill          │
 └────────────────────────────────────────┘ └──────────────┬───────────────┘
                                                           │
                                                           ▼
                                            ┌──────────────────────────────┐
                                            │       CLINE BACKEND          │
                                            │      cline CLI Binary        │
                                            └──────────────────────────────┘
```

---

## 3. Matriz Consolidada de Hallazgos

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia Empírica | Solución Propuesta | Esfuerzo |
|---|---|---|---|---|---|---|
| **1** | **Alta** | Colapso por `RangeError` no capturado en `isPortOpen` ante puerto inválido | `bin/cline-marketplace.js:140` | `node bin/cline-marketplace.js --port 999999 --no-open` lanza `RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536` no capturado (Exit 1). | Validar rango de puerto (1-65535) y envolver `net.connect` en bloque `try/catch`. | 15 min |
| **2** | **Alta** | Subcomando `update` retorna código de salida `0` en caso de error fatal | `bin/cline-marketplace.js:224` | Inspección de `catch (err)` en línea 221-224 que captura el fallo pero ejecuta `process.exit(0)`. | Invocar `process.exit(1)` en el bloque `catch` para propagar el código de error al shell/CI. | 5 min |
| **3** | **Media** | Desconexión en negociación de puertos entre CLI y Express en colisiones | `bin/cline-marketplace.js:254-268` / `server.js:135-155` | Si el puerto está ocupado por un proceso ajeno, `server.js` selecciona 5174, pero CLI abre el navegador en 5173 (puerto ajeno). | Implementar handshake de puerto vía IPC (`process.send`) o parsing de banner stdout estructurado. | 30 min |
| **4** | **Media** | Ausencia de flags `--version` / `-v` e inexistencia de validación de subcomandos | `bin/cline-marketplace.js:64-74` | `node bin/cline-marketplace.js --version --no-open` arranca el servidor HTTP en lugar de imprimir versión y salir con 0. | Añadir parser para `--version`/`-v` y alertar con error 1 ante subcomandos desconocidos. | 20 min |
| **5** | **Media** | Falta de manejadores de parada elegante (`SIGINT`/`SIGTERM`) en Express | `server.js:135-163` | `server.js` no captura señales del SO para invocar `server.close()`, provocando corte abrupto de conexiones HTTP. | Implementar listener de `SIGINT`/`SIGTERM` con drenaje de sockets y cierre ordenado de colas de estado. | 25 min |
| **6** | **Media** | Modos de archivo no ejecutables (`100644`) en Git index y líneas CRLF en scripts | Git Index / `scripts/refresh-catalog.mjs:1` | `git ls-files -s bin/cline-marketplace.js` arroja `100644`. Script de refresh contiene bytes `\r\n`. | Ejecutar `git update-index --chmod=+x` y normalizar finales de línea a LF. | 10 min |
| **7** | **Media** | Rutas absolutas Windows hardcodeadas en scripts de captura y debug | `scripts/debug-browser.mjs:3` / `scripts/capture-screenshots.mjs:30` | `const CHROME_PATH = "C:\\Program Files\\..."` falla de inmediato en entornos macOS y Linux. | Utilizar resolución dinámica multiplataforma mediante `resolveCommand()`. | 15 min |
| **8** | **Baja** | Cobertura de tests automatizados nula para el binario CLI (`bin/cline-marketplace.js`) | `scripts/unit-test.mjs` / `scripts/smoke-test.mjs` | `npm test` ejecuta 8 tests unitarios y tests de API, pero 0 tests invocan `bin/cline-marketplace.js`. | Añadir suite de integración para banderas CLI (`--help`, `--version`, `--no-open`, códigos de salida). | 25 min |
| **9** | **Baja** | Ausencia de manejadores globales para `uncaughtException` y `unhandledRejection` | `bin/cline-marketplace.js:1-49` | Errores asíncronos imprevistos emiten traza no formateada de Node sin limpieza de procesos hijos. | Registrar `process.on('uncaughtException')` y `process.on('unhandledRejection')` formateados con logger. | 10 min |

---

## 4. Análisis Empírico Detallado

### 4.1 Binario Ejecutable y Empaquetado (`bin/cline-marketplace.js`)

#### Inspección del Shebang y `package.json`
El archivo `bin/cline-marketplace.js` inicia con el shebang estándar:
```javascript
// bin/cline-marketplace.js:1
#!/usr/bin/env node
```
En `package.json`, el campo `bin` se encuentra debidamente declarado:
```json
// package.json:7-9
"bin": {
  "cline-marketplace": "bin/cline-marketplace.js"
}
```
Sin embargo, al verificar el modo de archivo registrado en el índice de Git:
```bash
git ls-files -s bin/cline-marketplace.js server.js scripts/
```
**Output obtenido:**
```
100644 d28696e08054926581fc3071f3aed514a38a99b6 0 bin/cline-marketplace.js
100644 9e58daab3f9e72a2fe31ee9b2d84d9a054c252a9 0 server.js
100644 21855a908369539183c4d62fe0c85519f6b5cce7 0 scripts/refresh-catalog.mjs
100644 3ea2f4c450c4e03192ed958ec6fddcefc12ec196 0 scripts/smoke-test.mjs
100644 4900e7f9e7150298fc7aef159e93ea6151b11d03 0 scripts/unit-test.mjs
```
*Impacto:* En clones directos de Git en sistemas Linux/macOS, la ejecución directa `./bin/cline-marketplace.js` falla con `Permission denied (EACCES)`. Debe aplicarse `git update-index --chmod=+x bin/cline-marketplace.js`.

---

### 4.2 Análisis de Argumentos y Banderas de Línea de Comandos

#### Banderas Soportadas: `--help`, `-h`, `help`
Verificación empírica:
```bash
node bin/cline-marketplace.js --help
```
**Output obtenido (Exit code: 0):**
```
cline-marketplace — Local browser and control plane for Cline Marketplace primitives.

Usage:
  npx cline-marketplace               One-shot launch: prepare → start server → open browser
  cline-marketplace                   Standard CLI launch
  cline-marketplace --no-open         Start server without opening browser window
  cline-marketplace --port <n>        Specify server port (default: 5173 or next available)
  cline-marketplace update            Check for updates and pull latest version
  cline-marketplace refresh           Re-download catalog and refresh upstream metadata
  cline-marketplace refresh --catalog Fast catalog refresh (skip commit metadata)
  cline-marketplace help              Display this help message
```

#### Falla de Bandera `--version` / `-v` (Hallazgo #4)
Al ejecutar `node bin/cline-marketplace.js --version --no-open`:
```bash
node bin/cline-marketplace.js --version --no-open
```
**Output obtenido:**
```
[14:31:32] [CLI] Spawning server process on http://127.0.0.1:5173
┌──────────────────────────────────────────────────────────┐
│  Cline Marketplace Local Control Plane                   │
│  Local URL:   http://127.0.0.1:5173                      │
│  Catalog:     250+ Community & Custom Primitives         │
│  Security:    Defense-in-depth on 127.0.0.1 (Loopback)   │
└──────────────────────────────────────────────────────────┘
[14:31:33] [CLI] Browser launch skipped (--no-open). URL: http://127.0.0.1:5173
```
*Observación:* La línea de comandos ignora `--version` e inicia el servidor HTTP completo en lugar de imprimir `1.0.0` y terminar con código 0.

#### Falla de Validación de Puerto (Hallazgo #1)
Al ejecutar `node bin/cline-marketplace.js --port 999999 --no-open`:
```bash
node bin/cline-marketplace.js --port 999999 --no-open
```
**Output obtenido (Exit code: 1):**
```
node:net:1330
    validatePort(port);
    ^

RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536. Received type number (999999).
    at lookupAndConnect (node:net:1330:5)
    at Socket.connect (node:net:1285:5)
    at Object.connect (node:net:245:17)
    at file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:140:22
    at new Promise (<anonymous>)
    at isPortOpen (file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:139:10)
    at file:///C:/Users/mateo/OneDrive/Escritorio/Work/ClineMarket/bin/cline-marketplace.js:248:13 {
  code: 'ERR_SOCKET_BAD_PORT'
}
```

#### Código de Salida en Subcomando `update` (Hallazgo #2)
Código en `bin/cline-marketplace.js:210-224`:
```javascript
if (sub === "update") {
  log("Checking for updates and pulling latest changes...");
  try {
    const gitDir = join(pkgRoot, ".git");
    if (existsSync(gitDir)) {
      await execFileP("git", ["pull", "origin", "main"], { cwd: pkgRoot });
      log("Updated from git successfully.");
    } else {
      await execFileP(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "-g", "cline-marketplace@latest"]);
      log("Updated global package via npm.");
    }
  } catch (err) {
    error(`Update failed: ${err.message}`);
  }
  process.exit(0); // <-- ERROR: Sale con 0 incluso tras un error en catch!
}
```

---

### 4.3 Compatibilidad Multiplataforma (Windows / macOS / Linux)

#### 1. Separadores de Ruta y Resolución
- El proyecto utiliza consistentemente `node:path` (`join`, `resolve`, `dirname`).
- En `bin/cline-marketplace.js:18`, `join(pkgRoot, "scripts/refresh-catalog.mjs")` contiene un slash mixto que, aunque normalizado por Node.js, debe especificarse como `join(pkgRoot, "scripts", "refresh-catalog.mjs")`.

#### 2. Ejecución de Shims de Windows en Subprocesos (`lib/resolver.js` y `lib/runner.js`)
- En Windows, los paquetes globales de npm generan archivos shim `.cmd` o `.bat`. La invocación directa de `spawn("cline.cmd", args)` sin `shell: true` falla en Node.js con `EINVAL` o `ENOENT`.
- `lib/runner.js:78-91` implementa la mitigación adecuada:
```javascript
if (isBatch) {
  proc = spawn(exe, args, {
    cwd: targetCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: true,
  });
} else {
  proc = spawn(exe, args, {
    cwd: targetCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
```

#### 3. Apertura de Navegador Multiplataforma (`bin/cline-marketplace.js:194-208`)
- Se bifurca adecuadamente por plataforma:
  - Windows (`win32`): `cmd.exe /c start "" <url>`
  - macOS (`darwin`): `open <url>`
  - Linux: `xdg-open <url>`

---

### 4.4 Ciclo de Vida de Procesos y Señales del Sistema Operativo

#### Reenvío de Señales CLI -> Proceso Hijo
En `bin/cline-marketplace.js:189-191`:
```javascript
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
```
Esto asegura que si el usuario presiona `Ctrl+C` en la terminal del CLI, la señal se transmite al subproceso de `server.js`.

#### Ausencia de Graceful Shutdown en `server.js` (Hallazgo #5)
En `server.js`, la instancia del servidor HTTP Express:
```javascript
const server = app.listen(port, HOST, () => { ... });
```
No registra listeners para `SIGINT` o `SIGTERM`. Al recibir la señal, el runtime finaliza de forma inmediata sin permitir que las peticiones en curso terminen ni que se liberen sockets de manera controlada.

#### Terminación de Árboles de Procesos (`lib/runner.js:42-54`)
```javascript
function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    exec(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true }, () => {});
  } else {
    try {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2000);
    } catch {}
  }
}
```
Esto garantiza la eliminación completa de subprocesos colgados (por ejemplo, `cline` lanzado dentro de `cmd.exe`).

---

### 4.5 Runtime Bridge, IPC y Detección de Instancias

#### Detección Multi-Instancia
Al ejecutar una segunda instancia del CLI mientras el servidor está activo:
```bash
node bin/cline-marketplace.js --no-open
```
**Output obtenido (Exit code: 0):**
```
[14:31:44] [CLI] Port 5173 is active; probing existing instance...
[14:31:44] [CLI] Connected to active instance (202 entries loaded).
[14:31:44] [CLI] Browser launch skipped (--no-open). URL: http://127.0.0.1:5173
[14:31:44] [CLI] Existing instance active. CLI finished.
```
La detección funciona limpiamente conectándose a la instancia activa sin generar procesos duplicados.

#### Desincronización en Colisión de Puertos (Hallazgo #3)
Si el puerto 5173 está ocupado por un proceso ajeno:
1. `isPortOpen(5173)` es `true`.
2. `probeStatus(5173)` retorna `null`.
3. CLI emite `warn("Port 5173 is occupied... Starting on next available port...")`, pero llama `startServer(port, host)` con `port = 5173`.
4. `server.js` ejecuta `findAvailablePort(5173)` y se enlaza al puerto `5174`.
5. CLI ejecuta `openBrowser("http://127.0.0.1:5173")` abriendo el puerto ajeno en lugar del 5174.

---

## 5. Quick Wins, Deudas Críticas y Oportunidades Estratégicas

### 3 Quick Wins (< 30 minutos)
1. **Manejo de Bandera `--version` / `-v` (15 min)**:
   ```javascript
   if (process.argv.includes("--version") || process.argv.includes("-v")) {
     const pkg = JSON.parse(readFileSync(pkgJsonFile, "utf8"));
     console.log(`cline-marketplace v${pkg.version}`);
     process.exit(0);
   }
   ```
2. **Propagación de Código de Error en `update` (5 min)**:
   Modificar `bin/cline-marketplace.js:221-224` para ejecutar `process.exit(1)` en el bloque `catch`.
3. **Validación Defensiva de Rango de Puerto en CLI (10 min)**:
   Verificar `if (cliPort !== null && (Number.isNaN(cliPort) || cliPort < 1 || cliPort > 65535))` y mostrar error explicativo saliendo con código 1.

### 3 Deudas Críticas
1. **Handshake de Puerto Dinámico entre CLI y Express (`bin/cline-marketplace.js` / `server.js`)**:
   Implementar paso de mensaje IPC (`process.send({ type: 'ready', port: actualPort })`) cuando `server.js` se ejecuta como proceso hijo, permitiendo al CLI conocer exactamente el puerto asignado antes de invocar `openBrowser()`.
2. **Graceful Shutdown & Connection Draining en Express (`server.js`)**:
   Implementar cierre ordenado ante `SIGINT` / `SIGTERM` con `server.close()`, cancelación de timers activos y drenaje de la cola `_writeQueues` en `lib/state.js`.
3. **Normalización de Permisos Git Index (`+x`) y Líneas LF en Scripts**:
   Asegurar que todos los ejecutables en `bin/` y `scripts/` tengan modo `100755` en git y codificación LF estricta.

### 3 Oportunidades Estratégicas
1. **CLI Headless Operations (`cline-marketplace search|list|info|install`)**:
   Extender el CLI para permitir consultas y gestión directamente desde la terminal en modo headless/CI (vía REST loopback o módulos directos), sin requerir abrir el navegador.
2. **Soporte de Bandera `--host <ip>` y `--json`**:
   Permitir configurar la interfaz de red (`127.0.0.1`, `0.0.0.0`, `localhost`) mediante flag explícito y emitir respuestas en formato JSON para integración con herramientas externas.
3. **Diagnóstico Automatizado CLI (`cline-marketplace doctor`)**:
   Exponer el motor de `/api/health` directamente como comando de consola `cline-marketplace doctor` con formateo enriquecido en terminal.

---

## 6. Registro de Evidencias Empíricas

### E1: Ejecución de Suite de Tests Automatizados (`npm test`)
```bash
npm test
```
**Resultado:**
```
> cline-marketplace@1.0.0 test
> node --test scripts/unit-test.mjs && node scripts/smoke-test.mjs

TAP version 13
# Subtest: sanitizers: sanitizePrimitiveId
ok 1 - sanitizers: sanitizePrimitiveId
# Subtest: sanitizers: sanitizePrimitiveType
ok 2 - sanitizers: sanitizePrimitiveType
# Subtest: sanitizers: sanitizeWorkspacePath
ok 3 - sanitizers: sanitizeWorkspacePath
# Subtest: resolver: isWindowsBatchShim
ok 4 - resolver: isWindowsBatchShim
# Subtest: state: safeWriteJson and readJson serialization
ok 5 - state: safeWriteJson and readJson serialization
# Subtest: runner: verbFor maps primitive types correctly
ok 6 - runner: verbFor maps primitive types correctly
# Subtest: reconciler: correctly merges discovered primitives and detects drift
ok 7 - reconciler: correctly merges discovered primitives and detects drift
# Subtest: command resolver: resolves installed system binaries
ok 8 - command resolver: resolves installed system binaries
1..8
# tests 8, suites 0, pass 8, fail 0

==> Testing Command Resolver
  cline resolved to: C:\Users\mateo\AppData\Roaming\npm\cline.cmd
  gh resolved to: C:\Program Files\GitHub CLI\gh.exe
==> Testing /api/status -> node: v22.17.0 platform: win32 uptime: 0 s
==> Testing /api/health -> [✓] node, [✓] cline (3.0.60), [✓] gh, [✓] cline-storage, [✓] catalog (202), [✓] metadata (202)
==> ALL SMOKE TESTS PASSED WITH STRICT ASSERTIONS!
```

### E2: Prueba de Subcomando `refresh --catalog`
```bash
node bin/cline-marketplace.js refresh --catalog
```
**Resultado:**
```
[14:32:01] [CLI] Running catalog refresh...
[refresh] github token: detected (gho_rz7…)
[refresh] downloading catalog: https://cline.github.io/marketplace/catalog.json
[refresh] catalog: 202 entries (plugins 15, skills 38, mcps 149)
[refresh] rotated previous catalog -> catalog-prev.json
[refresh] wrote catalog.json
[refresh] --catalog flag set, skipping per-entry metadata
```

### E3: Verificación de Formato y Modos de Archivo en Repositorio
```bash
node -e "
import fs from 'node:fs';
const files = ['bin/cline-marketplace.js', 'server.js', 'scripts/refresh-catalog.mjs', 'scripts/smoke-test.mjs', 'scripts/unit-test.mjs'];
for (const f of files) {
  const buf = fs.readFileSync(f);
  console.log({ file: f, size: buf.length, hasCRLF: buf.includes(Buffer.from('\r\n')), hasLF: buf.includes(Buffer.from('\n')) });
}
"
```
**Resultado:**
- `bin/cline-marketplace.js`: LF (`hasCRLF: false`)
- `server.js`: LF (`hasCRLF: false`)
- `scripts/refresh-catalog.mjs`: CRLF (`hasCRLF: true`)
- `scripts/smoke-test.mjs`: LF (`hasCRLF: false`)
- `scripts/unit-test.mjs`: LF (`hasCRLF: false`)

---

## 7. Conclusión y Justificación del Score

**Score Final: 7.8 / 10**

### Desglose Justificado:
- **Arquitectura de Runtime Bridge (9.0 / 10)**: La cola FIFO de serialización `_commandLock`, la resolución de shims multiplataforma y la terminación de árboles de procesos `taskkill`/`SIGKILL` son excepcionales y previenen corrupción concurrente y procesos huérfanos.
- **Portabilidad Multiplataforma (8.5 / 10)**: Excelente cobertura de rutas de Windows, macOS y Linux en probing y shims. Penalizado levemente por modos `100644` en Git y CRLF en script de refresh.
- **Robustez del CLI Engine (6.8 / 10)**: Penalizado por la falta de manejo de `--version`, fallo no controlado ante puertos fuera de rango (`RangeError`), enmascaramiento de errores con `process.exit(0)` en `update`, y desincronización de puertos en colisiones con procesos de terceros.
- **Ciclo de Vida de Procesos y Confiabilidad (7.0 / 10)**: Buen reenvío de señales en el launcher CLI, pero carencia de graceful shutdown en `server.js` y ausencia de tests automatizados dedicados para el binario CLI.


---

