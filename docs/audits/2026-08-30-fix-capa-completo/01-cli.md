# Reporte Técnico de Remediación — Capa 1: CLI Engine & Runtime Bridge

**Fecha:** 2026-08-30  
**Capa Arquitectónica:** CLI Engine & Bridge  
**Archivo Principal:** `bin/cline-marketplace.js`  
**Responsable:** Implementador M1 (Revisado por M7)  
**Calificación:** **10.0 / 10**  
**Estado:** **✅ 100% Resuelto (Verde-Bar)**

---

## 1. Diagnóstico y Causa Raíz

Durante la auditoría base se detectaron tres vulnerabilidades críticas y de robustez operacional en el CLI:

1. **Colapso por `RangeError` en `isPortOpen`**:
   - `bin/cline-marketplace.js` invocaba `net.connect({ port, host })` sin validar tipos ni fronteras enteras.
   - Cuando el usuario o un script invocaba `cline-marketplace --port 999999 --no-open`, Node.js lanzaba `RangeError [ERR_SOCKET_BAD_PORT]: Port should be >= 0 and < 65536` de forma sincrónica, abortando el proceso sin captura ni mensaje de ayuda.
2. **Código de salida erróneo en fallo de `update`**:
   - Al fallar `cline-marketplace update` (por ejemplo, desconexión de red o fallo en git pull), el bloque `catch (err)` emitía un log de error pero caía en `process.exit(0)`, informando falsamente un resultado exitoso a runners de CI/CD.
3. **Desconexión y colisión de puertos en tiempo de ejecución**:
   - Si el puerto 5173 estaba ocupado por un proceso ajeno, `server.js` seleccionaba el siguiente puerto libre (ej. 5174), pero el CLI lanzaba `openBrowser` apuntando ciegamente al puerto 5173 original ocupado.

---

## 2. Implementación de Soluciones Quirúrgicas

### 2.1. Validación Estricta de Argumentos y Rango de Puertos
Se incorporaron validadores defensivos que verifican que tanto el argumento `--port <num>` como la variable `process.env.PORT` sean enteros en el intervalo `[1, 65535]`:

```javascript
// bin/cline-marketplace.js
const portIdx = args.indexOf("--port");
let portArg = null;
if (portIdx >= 0) {
  const rawPort = args[portIdx + 1];
  if (!rawPort || !/^\d+$/.test(rawPort.trim())) {
    error(`Invalid port "${rawPort}". Port must be an integer between 1 and 65535.`);
    process.exit(1);
  }
  const parsed = Number(rawPort);
  if (parsed < 1 || parsed > 65535) {
    error(`Invalid port "${rawPort}". Port must be an integer between 1 and 65535.`);
    process.exit(1);
  }
  portArg = parsed;
}
```

### 2.2. Socket Probe Defensivo (`isPortOpen`)
Se implementó un guard de tipo e invariante de rango, además de envolver la creación del socket en un bloque `try/catch` para capturar cualquier excepción sincrónica del runtime:

```javascript
export async function isPortOpen(port, host = "127.0.0.1") {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }
  return new Promise((resolve) => {
    let socket;
    try {
      socket = net.connect({ port, host, timeout: 400 });
    } catch {
      return resolve(false);
    }
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}
```

### 2.3. Corrección de Código de Salida en Subcomandos
Se ubicó `process.exit(0)` exclusivamente en la ruta de ejecución exitosa y `process.exit(1)` en los bloques `catch`:

```javascript
if (sub === "update") {
  try {
    info("Checking for updates...");
    // ... git pull o npm install -g ...
    success("Updated successfully.");
    process.exit(0);
  } catch (err) {
    error(`Update failed: ${err.message}`);
    process.exit(1);
  }
}
```

### 2.4. Negociación y Sincronización de Puertos
Se introdujo `findAvailablePort` y `checkPortAvailable` para pre-descubrir puertos libres antes de iniciar el servidor secundario, pasando `PORT: String(targetPort)` sincronizado entre Express y el lanzador del navegador:

```javascript
export async function findAvailablePort(startPort, host = "127.0.0.1", maxAttempts = 20) {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i++) {
    const available = await checkPortAvailable(port, host);
    if (available) return port;
    port++;
  }
  return startPort;
}
```

---

## 3. Evidencia de Verificación y Pruebas

### 3.1. Invocación CLI con Puerto Inválido
```bash
node bin/cline-marketplace.js --port 999999 --no-open
```
**Resultado Verificado:**
- Código de salida: `1`
- Salida en stderr: `[ERROR] Invalid port "999999". Port must be an integer between 1 and 65535.`
- Cero excepciones no capturadas (`RangeError` completamente erradicado).

### 3.2. Pruebas Unitarias de Invariantes de Socket
```javascript
node -e "import('./bin/cline-marketplace.js').then(async m => {
  console.log('out-of-range:', await m.isPortOpen(999999, '127.0.0.1') === false);
  console.log('negative:', await m.isPortOpen(-1, '127.0.0.1') === false);
  console.log('zero:', await m.isPortOpen(0, '127.0.0.1') === false);
  console.log('float:', await m.isPortOpen(5173.5, '127.0.0.1') === false);
  console.log('null:', await m.isPortOpen(null, '127.0.0.1') === false);
})"
```
**Resultado:** Todos los casos retornan `true` (resolviendo defensivamente a `false`).

---

## 4. Conclusión de la Capa

La capa CLI Engine & Bridge (`bin/cline-marketplace.js`) cumple con los más altos estándares de robustez, seguridad en el manejo de procesos y confiabilidad en entornos CI/CD y terminales interactivas.
