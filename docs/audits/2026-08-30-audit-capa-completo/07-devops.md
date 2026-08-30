# Capa 7: DevOps & CI/CD

### Score: 7.8/10
Sólida arquitectura CI/CD con multi-OS, SAST, Release Drafter y capturas CDP 2x, pero penalizada por versiones de acciones no existentes en GitHub Actions (@v7/@v9), ausencia de Node 24 en CI y hooks locales no auto-instalables.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|-----------|----------|---------------|------------------------------|---------------|----------|
| 1 | **Crítica** | **Action version tags inexistentes (`checkout@v7`, `setup-node@v7`, `github-script@v9`)**: Los workflows referencian versiones mayores inexistentes que provocan fallo inmediato de resolución en GitHub Actions runners. | `.github/workflows/ci.yml:21,24`<br>`.github/workflows/release.yml:24,39`<br>`.github/workflows/codeql.yml:27`<br>`.github/workflows/auto-changelog.yml:21`<br>`.github/workflows/sync-catalog.yml:19,22` | `grep "checkout@v7"` -> `uses: actions/checkout@v7`, `uses: actions/setup-node@v7`, `uses: actions/github-script@v9` (Las versiones oficiales estables actuales son checkout@v4, setup-node@v5, github-script@v7). | Reemplazar las etiquetas `@v7`/`@v9` por `@v4`, `@v5` y `@v7` respectivamente en todos los archivos `.github/workflows/*.yml`. | 15 min |
| 2 | **Media** | **Matriz de Node incompleta en CI (falta Node 24.x)**: El workflow `ci.yml` cubre Node 18.x, 20.x y 22.x en Ubuntu, Windows y macOS, pero omite Node 24.x a pesar de que `package.json` declara `"engines": { "node": ">=18.0.0" }`. | `.github/workflows/ci.yml:17` | `view_file .github/workflows/ci.yml` -> `node-version: [18.x, 20.x, 22.x]` | Agregar `24.x` al array `node-version: [18.x, 20.x, 22.x, 24.x]`. | 5 min |
| 3 | **Alta** | **Ruta absoluta hardcodeada a Chrome en Windows (`C:\Program Files\Google\Chrome\...`)**: El script de capturas CDP 2x falla en Linux/macOS y en sistemas con Chrome en AppData o rutas no estándar. | `scripts/capture-screenshots.mjs:8` | `view_file scripts/capture-screenshots.mjs` -> `const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";` | Usar helper dinámico multiplataforma (`resolveCommand('google-chrome') || resolveCommand('chrome') || resolveCommand('chromium')` o `process.env.CHROME_PATH`). | 30 min |
| 4 | **Media** | **Git Hooks no auto-instalables para colaboradores**: Los hooks `pre-commit` y `pre-push` residen en `.git/hooks/` pero no existe lifecycle script (`prepare`) en `package.json` para instalarlos tras clonar (`npm install`). | `package.json:20-29`<br>`.git/hooks/pre-commit:1-3`<br>`.git/hooks/pre-push:1-11` | `view_file package.json` -> No existe script `"prepare"` en `package.json`. | Añadir script `"prepare": "node scripts/setup-hooks.mjs"` en `package.json`. | 20 min |
| 5 | **Media** | **Push directo a rama `main` en sincronización periódica upstream**: El cron `sync-catalog.yml` ejecuta `git push origin main`, susceptible a fallos si la rama `main` tiene Branch Protection Rules activas. | `.github/workflows/sync-catalog.yml:52` | `view_file .github/workflows/sync-catalog.yml` -> `git push origin main` | Reemplazar push directo por creación automatizada de Pull Request con `peter-evans/create-pull-request`. | 30 min |
| 6 | **Baja** | **Workflow de Release sin pipeline de publicación npm ni test gate**: `release.yml` crea el GitHub Release con metadata estática sin verificar pruebas unitarias ni publicar a npm registry con OIDC provenance. | `.github/workflows/release.yml:18-59` | `view_file .github/workflows/release.yml` -> Solo invoca `softprops/action-gh-release@v2`. | Añadir `npm test` como gate previo y step de `npm publish --provenance`. | 45 min |
| 7 | **Baja** | **Sobrecarga de captura CDP completa en cada commit local**: `pre-commit.mjs` levanta el servidor Express y Chrome headless para capturar 5 pantallas en 2x resolution en cada commit. | `scripts/pre-commit.mjs:18-24` | `view_file scripts/pre-commit.mjs` -> Ejecuta `capture-screenshots.mjs` en cada commit. | Dejar solo `unit-test.mjs` en `pre-commit` y mover la regeneración de screenshots a `pre-push` o `npm run docs:screenshots`. | 10 min |

---

### 3 quick wins
1. **Corregir Action Tags a versiones oficiales estables**: Actualizar `actions/checkout@v4`, `actions/setup-node@v5` y `actions/github-script@v7` en todos los workflows `.github/workflows/*.yml`.
2. **Incorporar Node 24.x a la matriz de CI**: Extender la matriz en `ci.yml` a `[18.x, 20.x, 22.x, 24.x]`.
3. **Optimizar el ciclo de desarrollo en `pre-commit`**: Separar la captura gráfica CDP de `pre-commit` hacia `npm run docs:screenshots` / `pre-push`.
