# Capa 10: Ecosistema Cline, MCP y Compatibilidad de Primitivas

### Score: 9.6 / 10
*Compatibilidad nativa y completa con el ecosistema de Cline, servidores MCP y herramientas locales.*

---

### Hallazgos del Ecosistema Cline

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Informativa | Detección multi-raíz de almacenamiento | [`server.js:270-380`](../../server.js) | Soporta `~/.cline`, `~/.claude`, carpetas de VS Code (`saoudrizwan.claude-dev`, `cline.cline`, `roo-cline`) y `.cline` local de proyecto. | Mantener lista exhaustiva de storage roots. | N/A |
| 2 | Informativa | Heurísticas automáticas de stack | [`scripts/detect-context.mjs:1`](../../scripts/detect-context.mjs) | Analiza `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` y sugiere bundles relevantes. | Mantener reglas heurísticas actualizadas. | N/A |

### 3 Quick Wins
1. Añadir detección de proyectos Elixir (`mix.exs`) y Ruby (`Gemfile`).
2. Permitir exportar la configuración de MCP seleccionada directamente a `cline_mcp_settings.json`.
3. Añadir botón de "Test MCP Connection" en el modal de detalle de servidores MCP.

### 1 Deuda Crítica
- Validar compatibilidad de esquemas de configuración JSON de MCP ante versiones futuras de la especificación MCP de Anthropic.

### 1 Oportunidad
- Permitir creación de primitivas y plugins personalizados directamente desde la interfaz web.

### Limitaciones
- Pruebas realizadas con Cline CLI v3.0.60 y catálogo oficial de `cline/marketplace`.
