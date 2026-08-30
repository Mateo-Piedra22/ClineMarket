# Fix Capa 6: Frontend y Skeleton Loaders (DESIGN.md)

### Estado: ✅ Resuelto

---

### Acciones Realizadas
1. Se añadieron estilos CSS para `.skeleton-card` y `.skeleton-box` con animación de shimmer en `public/styles.css`, respetando los radios de 25px y colores de superficie `#141414` / `#232323`.
2. Se implementó la función `renderSkeletons()` en `public/app.js` para renderizar 6 tarjetas esqueleto con animación durante la carga inicial y cambio de workspace.

### Validación
- Verificado en navegador y probado durante la inicialización de `reloadAll()`.
