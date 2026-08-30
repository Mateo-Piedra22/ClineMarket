# Capa 3: Seguridad & Auth

### Score: 8.5/10
**Justificación:** Arquitectura local-first sólida con enlace loopback estricto (127.0.0.1), serialización mutex y sanitizadores robustos contra command injection / path traversal, pero expuesta a vectores Cross-Origin/CSRF y con llamadas sincrónicas en updates.

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Ausencia de validación de `Origin` / CSRF en endpoints mutantes del Control Plane | `server.js:33-41`<br>`lib/routes.js:301,371,526,668` | `grep -n "Origin" server.js` -> Ninguna verificación de `Origin` o `Sec-Fetch-Site` para `POST /api/install`, `POST /api/shutdown`, `POST /api/update/run`. | Agregar middleware en Express que valide `req.headers['sec-fetch-site'] === 'same-origin'` o `req.headers['origin']` coincidente con `http://127.0.0.1:*` y `http://localhost:*`. | 20 min |
| 2 | **Media** | Omisión de sanitizadores de tipo e ID en importación masiva (`/api/import`) | `lib/routes.js:640-655` | `node -e "import('./lib/routes.js')"` -> `state.items[key] = { type: it.type, id: it.id }` no ejecuta `sanitizePrimitiveType` ni `sanitizePrimitiveId`. | Validar `const type = sanitizePrimitiveType(it.type); const id = sanitizePrimitiveId(it.id); if (!type || !id) continue;` dentro del bucle de importación. | 5 min |
| 3 | **Media** | Bloqueo síncrono del Event Loop (DoS) en `POST /api/update/run` vía `execSync` | `lib/routes.js:528-529` | `execSync("git pull origin main", { timeout: 30000 })` congela el proceso Node.js hasta 90s impidiendo atender otras peticiones HTTP. | Reemplazar `execSync` por `execFileP` (asíncrono) y encolar la ejecución dentro del mutex `_commandLock` de `runner.js`. | 15 min |
| 4 | **Media** | Falta de cabecera `Content-Security-Policy` (CSP) en respuestas HTTP | `server.js:34-41` | `grep -i "content-security-policy" server.js` -> 0 resultados. `res.setHeader` solo define `X-Frame-Options` y `X-Content-Type-Options`. | Añadir `res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com;");`. | 5 min |
| 5 | **Baja** | Mutación ciega de configuración en `POST /api/settings` sin validación de esquema | `lib/routes.js:175` | `const updated = { ...current, ...(req.body || {}) };` fusiona cualquier propiedad arbitraria en `user-settings.json`. | Filtrar `req.body` permitiendo únicamente una lista blanca de claves (`recentWorkspaces`, `defaultScope`, `themeContrast`, `autoUpdateCheck`). | 10 min |
| 6 | **Baja** | Atributo `data-watch` sin escape HTML en renderizado de cards | `public/app.js:224` | `data-watch="${entry.key}"` no utiliza `escapeHtml(entry.key)` a diferencia del resto de interpolaciones. | Cambiar a `data-watch="${escapeHtml(entry.key)}"`. | 2 min |

---

### 3 quick wins
1. **Validación de `Sec-Fetch-Site` & `Origin`**: Agregar un middleware en `server.js` que rechace con HTTP 403 peticiones `POST` cuyo origen no sea `same-origin` o `127.0.0.1`/`localhost`, eliminando el vector CSRF local.
2. **Implementación de CSP**: Configurar la cabecera `Content-Security-Policy` restringiendo la ejecución de scripts y conexiones solo a `'self'` y las APIs oficiales de GitHub.
3. **Sanitización en `/api/import`**: Envolver `it.type` e `it.id` con `sanitizePrimitiveType()` y `sanitizePrimitiveId()` antes de persistir en `installed.json`.
