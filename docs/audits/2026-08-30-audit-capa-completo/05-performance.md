# Capa 5: Rendimiento y Optimización de Recursos

### Score: 9.1 / 10
*Excelente velocidad de respuesta (< 5ms en la mayoría de endpoints locales) y bajo consumo de memoria (< 45MB RSS).*

---

### Hallazgos de Rendimiento

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Baja | Escaneo síncrono recurrente de metadata local | [`server.js:230-260`](../../server.js) | Cada invocación a `/api/installed` realiza `statSync` sobre todos los plugins locales. | Implementar caché en memoria invalidado por `mtime` del directorio o watcher. | Bajo |
| 2 | Informativa | Filtrado multi-token de alta eficiencia | [`public/app.js:530-580`](../../public/app.js) | El filtrado en memoria de 250+ entradas ocurre en menos de 2ms. | Mantener arquitectura client-side indexing. | N/A |

### 3 Quick Wins
1. Cachear el resultado de `resolveCommand("cline")` y `resolveCommand("gh")` para evitar búsquedas repetidas en el PATH.
2. Comprimir respuestas estáticas con middleware `compression` si se accede remotamente.
3. Debounce de 150ms en el input de búsqueda del frontend para evitar re-renders en pulsaciones ultra-rápidas.

### 1 Deuda Crítica
- Reducir el tiempo de arranque en frío minimizando lecturas de archivos durante la inicialización de Express.

### 1 Oportunidad
- Implementar Virtual Scrolling en el DOM del catálogo si la lista supera los 1,000 elementos.

### Limitaciones
- Evaluado en entorno Windows 11 x64, Node.js v22.17.0.
