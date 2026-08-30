# Capa 8: Pruebas, Cobertura y Aseguramiento de Calidad (QA)

### Score: 8.7 / 10
*Suite de smoke tests autónoma y robusta, validando endpoints REST, resolutor de binarios y síntesis de catálogo.*

---

### Hallazgos de Testing

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Media | Cobertura centrada en integración y smoke tests | [`scripts/smoke-test.mjs:1`](../../scripts/smoke-test.mjs) | Falta suite de unit tests para funciones puras como `sanitizePrimitiveId` o `detectContext`. | Crear archivo `scripts/unit-test.mjs` con casos de prueba aislados. | Bajo |
| 2 | Informativa | Autonomía de ejecución en smoke tests | [`scripts/smoke-test.mjs:30-45`](../../scripts/smoke-test.mjs) | Si el servidor no está corriendo, levanta una instancia efímera automáticamente. | Mantener comportamiento autónomo. | N/A |

### 3 Quick Wins
1. Agregar suite de pruebas unitarias (`scripts/unit-test.mjs`) usando el runner nativo `node:test`.
2. Añadir tests de carga para el endpoint `/api/catalog` con 1,000 peticiones concurrentes.
3. Probar escenarios de CLI no encontrada (mock de PATH vacío).

### 1 Deuda Crítica
- Añadir tests específicos para la reconciliación de drift cuando un plugin se borra manualmente del disco.

### 1 Oportunidad
- Integrar Playwright o Puppeteer en CI para validación E2E completa de la interfaz gráfica.

### Limitaciones
- Smoke tests ejecutados localmente y validados en el entorno de desarrollo.
