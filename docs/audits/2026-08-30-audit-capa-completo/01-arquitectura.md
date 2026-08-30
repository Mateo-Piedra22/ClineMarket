# Capa 1: Arquitectura y Diseño de Sistemas

### Score: 8.5 / 10
*Arquitectura monolítica bien encapsulada con separación clara entre control plane, frontend estático y CLI bootstrap.*

---

### Hallazgos de Arquitectura

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Baja | Centralización excesiva en `server.js` | [`server.js:1-1568`](../../server.js) | El archivo agrupa logger, helpers de JSON, probes de FS, reconciliador, ejecutor de CLI y handlers de API en 1568 líneas. | Extraer utilidades a `lib/logger.js`, `lib/probes.js`, `lib/reconciler.js` y `lib/routes.js`. | Medio |
| 2 | Informativa | Protocolo de comunicación desacoplado | [`server.js:700-900`](../../server.js) | API REST JSON stateless con endpoints limpios (`/api/catalog`, `/api/installed`, `/api/health`, `/api/settings`). | Mantener el desacoplamiento REST/JSON para permitir clientes CLI externos. | Bajo |

### 3 Quick Wins
1. Crear carpeta `lib/` para alojar submódulos de backend.
2. Extraer el ANSI Logger a `lib/logger.js`.
3. Extraer el resolvedor de comandos a `lib/resolver.js`.

### 1 Deuda Crítica
- Reducir el tamaño de `server.js` a menos de 400 líneas delegando responsabilidades a módulos especializados.

### 1 Oportunidad
- Implementar soporte para WebSockets o Server-Sent Events (SSE) para transmitir la salida en tiempo real de `cline install` en lugar de esperar la resolución del comando.

### Limitaciones
- Arquitectura probada en Node.js v18, v20 y v22. No se detectaron fugas de dependencias circulares.
