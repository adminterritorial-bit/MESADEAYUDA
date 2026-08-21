# Ajuste responsive v4.8.16

Se aplicó una corrección conservadora de escala visual para web, tablet y móvil.

## Objetivo
- Reducir el tamaño general de tarjetas, botones, barras, modales, sidebar, métricas y componentes móviles.
- Mantener intacta la lógica de tickets, correo, Google Apps Script, Drive, Supabase y notificaciones.
- Mejorar relación de aspecto en escritorio, portátil, tablet y celular.

## Cambios principales
- Sidebar reducido de 316px a 286px.
- Topbar más compacta y con menor altura.
- Botones, inputs y tarjetas con menor altura y padding.
- Héroes, métricas e iconos menos grandes.
- Modales y wizard más proporcionados.
- Mobile tabbar más baja y usable.
- Breakpoints reforzados para 1380px, 1180px, 860px y 520px.
- Contenido limitado en pantallas muy grandes para evitar gigantismo.

## Validación
- `node --check app.js`: OK.
- `node --check sw.js`: OK.
- `site.webmanifest`: JSON válido.

## Nota
No se modificó SQL, Apps Script ni claves. Es una versión frontend/responsive.
