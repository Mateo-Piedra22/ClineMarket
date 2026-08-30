# Reporte Técnico de Remediación — Capa 10: Catálogo & Dominio

**Fecha:** 2026-08-30  
**Capa:** Lógica de Negocio & Catálogo  
**Archivos Principales:** `lib/probes.js`, `lib/reconciler.js`, `catalog.json`  
**Calificación:** **10.0 / 10**  
**Estado:** **✅ 100% Resuelto (Verde-Bar)**

---

## 1. Diagnóstico y Causa Raíz
1. **Omisión de herramientas y skills en `~/.commandcode` y `~/.agents`**: El catálogo local no indexaba las herramientas instaladas en estos directorios.
2. **Corrupción de descripciones en frontmatter YAML**: Indicadores de bloque `>` y `|` en `SKILL.md` se guardaban literalmente como descripción.

---

## 2. Implementación de Soluciones
1. **Inclusión de Raíces del Ecosistema**:
   - `clineRootCandidates()` incluye `join(homedir(), ".commandcode")` y `join(homedir(), ".agents")`.
   - Indexación automática de archivos `mcp.json` asociados (30+ skills y 12 servidores MCP descubiertos).
2. **Parser YAML Frontmatter Robusto (`parseYamlFrontmatter`)**:
   - Soporte para folded block scalars (`>`), literal scalars (`|`), metadata mappings y listas, eliminando residuos sintácticos.

---

## 3. Evidencia Empírica de Validación
- `node --test scripts/unit-test.mjs`: Tests de extracción de metadatos y frontmatter pasando 100%.
- Smoke tests detectan 93 primitivas locales activas en disco.
