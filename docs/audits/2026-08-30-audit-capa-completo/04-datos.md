# Capa 4: Persistencia y Gestión de Estado

### Score: 9.2 / 10
*Almacenamiento local atómico y robusto ante cortes de energía y caídas súbitas del proceso.*

---

### Hallazgos de Persistencia

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Baja | Concurrencia de escritura no serializada | [`server.js:130-145`](../../server.js) | `safeWriteJson` escribe a `.tmp` y renombra. Si dos requests escriben a la vez, el último sobrescribe. | Implementar una cola en memoria (`Promise queue`) para serializar escrituras en `data/`. | Bajo |
| 2 | Informativa | Integridad JSON garantizada | [`server.js:130-145`](../../server.js) | Uso de `writeFileSync` temporal + `renameSync` atómico en el mismo filesystem. | Mantener mecanismo atómico. | N/A |

### 3 Quick Wins
1. Crear una función helper `queueWrite(path, data)` que serialice escrituras sobre el mismo archivo.
2. Añadir rotación y backup de `installed.json` (`installed.json.bak`) antes de mutaciones masivas.
3. Guardar versión de esquema (`schemaVersion: 1`) en los archivos de estado para futuras migraciones.

### 1 Deuda Crítica
- Evitar bloqueo síncrono en operaciones masivas de guardado cuando el catálogo crezca a más de 10,000 primitivas.

### 1 Oportunidad
- Evaluar el uso de SQLite / better-sqlite3 si el volumen de datos o historial de cambios supera los 50MB.

### Limitaciones
- Evaluado en particiones NTFS (Windows) y ext4 (Linux).
