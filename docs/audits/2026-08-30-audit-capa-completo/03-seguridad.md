# Capa 3: Seguridad y Mitigación de Amenazas

### Score: 9.6 / 10
*Excelente postura defensiva. Enlace estricto a loopback, validación exhaustiva de inputs y ejecución segura de subprocesos.*

---

### Hallazgos de Seguridad

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Baja | Falta de rate-limiting en endpoints que ejecutan CLI | [`server.js:804`](../../server.js) | `/api/install` y `/api/uninstall` pueden invocarse en ráfaga rápida. | Añadir middleware de encolado o rate limiting por IP/origen local. | Bajo |
| 2 | Informativa | Enlace obligatorio a `127.0.0.1` verificado | [`server.js:39`](../../server.js) | `const HOST = process.env.HOST || "127.0.0.1";` impide exposición accidental en redes locales. | Mantener política estricta de loopback. | N/A |
| 3 | Informativa | Protección contra Command Injection validada | [`server.js:505-530`](../../server.js) | Los argumentos a `child_process.spawn` se pasan como array vectorizado sin interpolación en shell para variables no confiables. | Mantener validación regex de identificadores. | N/A |

### 3 Quick Wins
1. Agregar encabezado `Cross-Origin-Opener-Policy: same-origin` en `server.js`.
2. Sanitizar mensajes de error en respuestas HTTP para no revelar stack traces internos en producción.
3. Validar longitud máxima de payloads JSON (`express.json({ limit: "1mb" })`).

### 1 Deuda Crítica
- Asegurar que `sanitizeWorkspacePath` resuelva symlinks con `realpathSync` para evitar bypass de directorios restringidos.

### 1 Oportunidad
- Implementar token CSRF para peticiones `POST` desde clientes locales para máxima defensa en profundidad.

### Limitaciones
- Evaluado con escáner CodeQL de GitHub Actions y auditoría manual de vectores de ataque.
