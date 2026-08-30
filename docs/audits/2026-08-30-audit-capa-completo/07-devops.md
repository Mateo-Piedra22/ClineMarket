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
