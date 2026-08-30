# Capa 9: Observabilidad, Logs y Diagnósticos del Sistema

### Score: 9.4 / 10
*Excelente visibilidad operativa. Logs ANSI estructurados en consola, probes de salud detallados y exportación rápida de diagnóstico.*

---

### Hallazgos de Observabilidad

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Baja | Sin persistencia de logs en archivo local en disco | [`server.js:45-90`](../../server.js) | Los logs de `logger.info/exec/error` solo se imprimen en `stdout`/`stderr`. | Agregar transporte opcional a `data/logs/server.log` rotativo. | Bajo |
| 2 | Informativa | Diagnóstico en tiempo real enriquecido | [`server.js:730-770`](../../server.js) | El endpoint `/api/health` valida ejecutables en PATH, permisos de storage y conteo de plugins. | Mantener probes activos. | N/A |

### 3 Quick Wins
1. Agregar escritura opcional de logs en disco (`data/server.log`).
2. Añadir métricas de tiempo de ejecución promedio de comandos CLI en la pestaña de Health.
3. Incluir estado del motor de actualización (última versión remota chequeada) en `/api/status`.

### 1 Deuda Crítica
- Estandarizar el formato de logs a JSON estructurado cuando se active la bandera `--json-logs`.

### 1 Oportunidad
- Implementar un panel de streaming de logs en vivo dentro de la pestaña Health de la interfaz.

### Limitaciones
- Evaluado mediante inspección de logs en consola de PowerShell y panel de diagnósticos web.
