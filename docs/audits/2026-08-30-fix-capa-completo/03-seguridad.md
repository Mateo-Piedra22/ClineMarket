# Fix Capa 3: Seguridad, Mutex CLI y Sanitización

### Estado: ✅ Resuelto

---

### Acciones Realizadas
1. Se implementó un **Mutex de ejecución en memoria** (`_commandLock`) en `lib/runner.js` que encola secuencialmente las llamadas de mutación a la CLI de `cline`, evitando saturación o condiciones de carrera de ficheros bloqueados por el motor de Cline.
2. Se reforzó `sanitizeWorkspacePath` para utilizar `realpathSync` y resolver symlinks de forma segura.
3. Se mantuvo el límite de tamaño de payloads JSON a `1mb` en el servidor Express.

### Validación
- Peticiones concurrentes a `runCline` resueltas en serie sin colisiones ni memory leaks.
