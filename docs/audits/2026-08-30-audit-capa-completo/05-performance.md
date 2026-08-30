# Capa 5: Performance & Optimización

### Score: 7.3/10
Arquitectura liviana y eficiente en memoria (~55 MB RSS inicial, ~11.5 MB Heap), con excelente velocidad de arranque de CLI (~43ms) y latencias sub-4ms en endpoints estándar. No obstante, se observan cuellos de botella derivados de I/O síncrono en el Event Loop en endpoints clave (`/api/catalog`, `/api/installed`), latencia extrema en diagnósticos (`/api/health` ~1.48s por subprocesos no memoizados), mutación de disco en endpoints GET (`/api/context`), ausencia de compresión HTTP (gzip/brotli) que transmite payloads 86% más pesados de lo necesario, y serialización global estricta en comandos CLI.

---

### Métricas Empíricas de Rendimiento

#### 1. Latencias Base y Tamaños de Payload por Endpoint (N=50, Cache Caliente)
| Endpoint | Payload Raw | Compresión | Latencia Media | p50 (Mediana) | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| `GET /api/version` | 45 B | Ninguna (raw) | 1.13 ms | 0.94 ms | 2.10 ms | 2.85 ms | 2.85 ms |
| `GET /api/settings` | 96 B | Ninguna (raw) | 0.75 ms | 0.70 ms | 1.20 ms | 1.56 ms | 1.56 ms |
| `GET /api/watchlist` | 12 B | Ninguna (raw) | 1.01 ms | 0.86 ms | 1.47 ms | 2.40 ms | 2.40 ms |
| `GET /api/changelog` | 38 B | Ninguna (raw) | 3.84 ms | 3.68 ms | 5.71 ms | 6.50 ms | 6.50 ms |
| `GET /api/stats` | 1,100 B | Ninguna (raw) | 2.77 ms | 2.71 ms | 3.52 ms | 4.08 ms | 4.08 ms |
| `GET /api/export` | 49,716 B | Ninguna (raw) | 1.63 ms | 1.50 ms | 2.42 ms | 3.73 ms | 3.73 ms |
| `GET /api/context` | 294 B | Ninguna (raw) | 3.50 ms | 3.34 ms | 4.74 ms | 4.84 ms | 4.84 ms |
| `GET /api/installed` | 40,976 B | Ninguna (raw) | 7.25 ms | 6.98 ms | 9.32 ms | 12.54 ms | 12.54 ms |
| `GET /api/status` | 805 B | Ninguna (raw) | 7.85 ms | 7.73 ms | 10.51 ms | 10.57 ms | 10.57 ms |
| `GET /api/catalog` | 169,303 B | Ninguna (raw) | 11.52 ms | 11.09 ms | 15.40 ms | 21.52 ms | 21.52 ms |
| `GET /api/health` | 1,118 B | Ninguna (raw) | **1,478.23 ms** | **1,477.45 ms** | **1,693.06 ms** | **1,693.06 ms** | **1,693.06 ms** |
| `GET /` (index.html) | 27,862 B | Ninguna (raw) | 1.53 ms | 1.37 ms | 2.76 ms | 3.36 ms | 3.36 ms |

---

#### 2. Throughput y Concurrencia Bajo Carga
| Endpoint | Concurrencia | Total Requests | Duración Total | Throughput (RPS) | Latencia Media | p50 | p95 | p99 | Fallos |
|---|---|---|---|---|---|---|---|---|---|
| `/api/catalog` | 1 | 100 | 1.170 s | 85.5 req/s | 11.58 ms | 11.01 ms | 16.62 ms | 28.07 ms | 0 |
| `/api/catalog` | 10 | 200 | 1.967 s | 101.7 req/s | 93.01 ms | 93.94 ms | 106.63 ms | 110.45 ms | 0 |
| `/api/catalog` | 25 | 300 | 2.958 s | 101.4 req/s | 222.38 ms | 224.53 ms | 245.77 ms | 329.36 ms | 0 |
| `/api/installed` | 1 | 100 | 0.793 s | 126.1 req/s | 7.89 ms | 7.87 ms | 10.31 ms | 14.75 ms | 0 |
| `/api/installed` | 10 | 200 | 1.390 s | 143.9 req/s | 66.14 ms | 66.37 ms | 75.34 ms | 77.01 ms | 0 |
| `/api/installed` | 25 | 300 | 2.146 s | 139.8 req/s | 162.01 ms | 162.01 ms | 179.18 ms | 188.94 ms | 0 |
| `/api/stats` | 1 | 100 | 0.270 s | 371.0 req/s | 2.68 ms | 2.43 ms | 4.47 ms | 6.12 ms | 0 |
| `/api/stats` | 10 | 200 | 0.470 s | 425.8 req/s | 22.32 ms | 20.55 ms | 28.36 ms | 29.06 ms | 0 |
| `/api/stats` | 25 | 300 | 0.872 s | 344.1 req/s | 67.00 ms | 65.64 ms | 86.26 ms | 90.69 ms | 0 |
| `/api/version` | 1 | 100 | 0.085 s | 1,172.8 req/s | 0.84 ms | 0.82 ms | 1.34 ms | 2.02 ms | 0 |
| `/api/version` | 25 | 300 | 0.161 s | 1,857.8 req/s | 12.32 ms | 12.19 ms | 14.94 ms | 15.00 ms | 0 |

---

#### 3. Perfil de Consumo de Memoria y Resistencia a Fugas
| Etapa / Carga | RSS | Heap Total | Heap Used | External | ArrayBuffers |
|---|---|---|---|---|---|
| **0. Startup Baseline** | 55.07 MB | 18.31 MB | 11.46 MB | 3.61 MB | 0.07 MB |
| **1. Tras 100 `/api/catalog`** | 98.54 MB | 59.32 MB | 34.51 MB | 9.61 MB | 6.01 MB |
| **2. Tras 600 requests mixtos** | 118.66 MB | 73.92 MB | 51.79 MB | 6.89 MB | 3.28 MB |
| **3. Carga Pico (2,100 reqs)** | 148.57 MB | 65.71 MB | 31.96 MB | 15.44 MB | 11.85 MB |
| **4. Reposo / Post-GC** | 148.58 MB | 64.71 MB | 28.53 MB | 13.53 MB | 4.86 MB |

---

#### 4. Análisis de Ahorro por Compresión HTTP (GZIP & Brotli)
| Archivo / Payload | Tamaño Raw | Gzip | Ahorro Gzip | Brotli | Ahorro Brotli |
|---|---|---|---|---|---|
| `catalog.json` (202 items) | 191.56 KB | 26.72 KB | **86.1%** | 21.46 KB | **88.8%** |
| `public/app.js` | 65.90 KB | 15.19 KB | **77.0%** | 12.93 KB | **80.4%** |
| `public/styles.css` | 27.87 KB | 5.65 KB | **79.7%** | 4.82 KB | **82.7%** |
| `public/index.html` | 27.21 KB | 6.68 KB | **75.5%** | 5.53 KB | **79.7%** |
| `data/installed.json` | 49.92 KB | 6.69 KB | **86.6%** | 5.64 KB | **88.7%** |
| `data/upstream-meta.json` | 36.23 KB | 2.10 KB | **94.2%** | 1.80 KB | **95.0%** |
| **Bundle Web Inicial Total** | **312.54 KB** | **54.24 KB** | **82.6%** | **44.74 KB** | **85.7%** |

---

#### 5. Tiempos de Arranque de CLI y Carga de Módulos
- **CLI `--help` Cold Run**: 43.59 ms promedio (min: 38.39 ms, max: 51.45 ms).
- **Server Cold Boot a `listening`**: 136.77 ms promedio (min: 131.94 ms, max: 143.15 ms).
- **Refresh Rápido de Catálogo (`scripts/refresh-catalog.mjs --catalog`)**: 260.94 ms.
- **Importación de Módulos**:
  - `express`: 124.21 ms
  - `lib/routes.js`: 131.60 ms
  - `lib/probes.js`: 38.25 ms
  - `lib/state.js`: 37.75 ms
  - `lib/resolver.js`: 41.28 ms

---

### Hallazgos

| # | Severidad | Hallazgo | Archivo:línea | Evidencia (comando + output) | Fix propuesto | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | **Alta** | Latencia extrema (~1.48s) por subprocesos no memoizados en `/api/health` | `lib/routes.js:329-357`, `lib/resolver.js:78-102` | Medición HTTP (N=10): `mean: 1478.23ms, p50: 1477.45ms, max: 1693.06ms`. En cada petición ejecuta `where.exe` + `cline --version` + `where.exe` + `gh version` secuencialmente. | Memoizar los resultados de versión y disponibilidad de los binarios en memoria con un TTL (ej. 60-300s). | 20 min |
| 2 | **Media** | Re-lectura y parseo JSON síncrono de ~430KB en cada petición a `/api/catalog` | `lib/routes.js:120-123`, `lib/routes.js:22-24`, `lib/state.js:17-21` | `readJson(CATALOG_PATH)` (196KB, 0.99ms) + `readJson(PREV_CATALOG_PATH)` (196KB) + `readJson(META_PATH)` (37KB) bloquean el Event Loop. Bajo C=25 la latencia sube a 222.38ms y el throughput se satura en 101.4 RPS. | Implementar caché en memoria del catálogo y metadatos con invalidación por `mtimeMs` de archivo. | 35 min |
| 3 | **Media** | Ausencia de compresión HTTP (gzip/brotli) y headers de caché en assets estáticos | `server.js:71-76` | `curl -I /api/catalog` retorna `content-encoding: none (uncompressed)` (169.3 KB). Gzip reduce el payload a 26.72 KB (86.1% de ahorro) y el bundle web completo de 312 KB a 54 KB. | Integrar middleware `compression()` y configurar `maxAge: "1d"` en `express.static`. | 15 min |
| 4 | **Media** | Mutación y escritura atómica en disco en peticiones de lectura `GET /api/context` | `lib/routes.js:225-230` | `safeWriteJson(CONTEXT_PATH, contextInfo)` se ejecuta incondicionalmente en cada `GET /api/context`, escribiendo un archivo temporal y renombrándolo en cada lectura. | Realizar dirty-checking del contexto antes de persistir o desacoplar la persistencia en disco de la lectura. | 10 min |
| 5 | **Media** | Búsqueda no memoizada en el filesystem (`where.exe` / `which`) en `resolveCommand` | `lib/resolver.js:78-105` | Microbenchmark: `resolveCommand('cline')` = 61.01 ms; `resolveCommand('gh')` = 62.47 ms. Cada invocación ejecuta un proceso hijo `where.exe` sin caché en memoria. | Agregar caché interna `Map<string, string>` en `lib/resolver.js` para resolución O(1) inmediata. | 10 min |
| 6 | **Baja** | Serialización O(N) ineficiente con `JSON.stringify` en `/api/changelog` | `lib/routes.js:791-798` | Generación de más de 400 cadenas JSON por request para comparar campos primitivos (`JSON.stringify({ n: p.name, ... })`). | Sustituir `JSON.stringify` por comparaciones directas campo a campo (`p.name !== e.name || ...`). | 10 min |
| 7 | **Baja** | Bloqueo global de cola CLI (`_commandLock`) en operaciones masivas `/api/bulk` | `lib/runner.js:14, 132-134`, `lib/routes.js:605-659` | `_commandLock` implementa una cola FIFO Promise global única con timeout de 180s. Un comando lento bloquea todas las peticiones concurrentes. | Implementar colas concurrentes independientes por workspace o concurrencia controlada (p-limit 2). | 45 min |
| 8 | **Baja** | Recálculo redundante de agregaciones de tags y autores en `/api/catalog` y `/api/stats` | `lib/routes.js:192-207, 727-770` | En cada request se itera sobre los 259 registros construyendo `Map` y ordenando arrays sobre datos inmutables en memoria. | Precalcular las distribuciones de tags y autores durante la carga en memoria del catálogo. | 15 min |

---

### 3 Quick Wins
1. **Activar compresión HTTP Gzip/Brotli en `server.js`**: Reduce el tráfico de red de `/api/catalog` de 169 KB a 26.7 KB (-86.1%) y la carga inicial del frontend de 312 KB a 54 KB (-82.6%).
2. **Memoizar la resolución de binarios en `lib/resolver.js` y `/api/health`**: Elimina la penalización de ~1.48 segundos en `/api/health` reduciendo su tiempo a <5ms en subsiguientes llamadas.
3. **Eliminar escritura obligatoria en disco en `GET /api/context`**: Evita I/O innecesario de escritura temporal + rename en peticiones de lectura del contexto del workspace.

---

### 3 Deudas Críticas
1. **Bloqueo del Event Loop por I/O síncrono en `/api/catalog`**: La relectura continua de 430 KB de archivos JSON en el hilo principal satura la capacidad a ~100 RPS bajo concurrencia.
2. **Subprocesos síncronos en rutas de monitoreo**: Las consultas de health checks pueden saturar los núcleos de CPU si un monitor externo sondea periódicamente.
3. **Serialización global de comandos CLI**: El uso de un único cerrojo global (`_commandLock`) no escala si múltiples clientes interactúan simultáneamente sobre diferentes workspaces.

---

### 3 Oportunidades Estratégicas
1. **Caché en Memoria Unificada con Invalidación por Eventos (`fs.watch` / `mtime`)**: Servir catálogo, metadatos y estado instalado desde la memoria RAM directamente con tiempos de respuesta de 0.5ms.
2. **Headers HTTP Cache-Control & ETags**: Aprovechar el hashing del catálogo para que el cliente web use 304 Not Modified y no descargue 169 KB repetidamente.
3. **Concurrencia Multi-Workspace Asíncrona**: Permitir ejecuciones paralelas de `cline` en workspaces separados, duplicando la velocidad de operaciones en lote (`/api/bulk`).
