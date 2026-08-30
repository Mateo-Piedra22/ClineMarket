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
