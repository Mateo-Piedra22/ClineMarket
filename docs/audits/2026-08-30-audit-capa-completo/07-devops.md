# Capa 7: DevOps, CI/CD y Automatización

### Score: 9.6 / 10
*Automatización total en GitHub Actions, tests matriciales multi-OS, escaneo SAST y pre-push hooks automáticos.*

---

### Hallazgos de DevOps

| # | Severidad | Hallazgo | Archivo:Línea | Evidencia | Fix Propuesto | Esfuerzo |
|---|:---:|---|---|---|---|:---:|
| 1 | Informativa | Matriz multi-OS completa | [`.github/workflows/ci.yml:15-30`](../../.github/workflows/ci.yml) | Ejecuta tests en `ubuntu-latest`, `windows-latest` y `macos-latest` sobre Node 18, 20 y 22. | Mantener matriz de compatibilidad. | N/A |
| 2 | Informativa | Hook Pre-Push automatizado | [`scripts/pre-push.mjs:1`](../../scripts/pre-push.mjs) | Recaptura capturas en 2x y corre smoke tests automáticamente antes de cualquier push. | Mantener hook activo en `.git/hooks/pre-push`. | N/A |

### 3 Quick Wins
1. Cachear dependencias de npm en GitHub Actions usando `actions/setup-node@v4` con `cache: 'npm'`.
2. Añadir step de verificación de formato / linter en el workflow de CI.
3. Incluir reporte de cobertura en los checks de Pull Requests.

### 1 Deuda Crítica
- Asegurar que las versiones de las GitHub Actions utilicen tags de versión fijos o SHAs de commit para prevenir ataques a la cadena de suministro.

### 1 Oportunidad
- Implementar publicación automática a npmjs.com mediante release tags `v*.*.*` con provenance attestations.

### Limitaciones
- CI validado en GitHub Actions con runners oficiales de Ubuntu, macOS y Windows Server.
