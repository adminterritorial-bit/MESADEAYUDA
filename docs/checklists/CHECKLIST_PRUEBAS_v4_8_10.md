# Checklist de pruebas · Mesa TIC v4.8.10

## 1. Acceso
- [ ] Login con administrador TIC.
- [ ] Login con secretario general.
- [ ] Login con comunicador.
- [ ] Login con funcionario solicitante.

## 2. Radicación
- [ ] Nueva solicitud abre el wizard amplio.
- [ ] El wizard no se cierra solo.
- [ ] Permite seleccionar responsable.
- [ ] Permite seleccionar modalidad.
- [ ] Radica correctamente.
- [ ] Aparece en Mis solicitudes.
- [ ] Aparece correo pendiente `ticket.created` en `notification_delivery_queue`.

## 3. Correo de radicación
- [ ] Apps Script envía correo.
- [ ] Correo incluye radicado.
- [ ] Correo incluye título, descripción, servicio, responsable, modalidad y prioridad.

## 4. Gestión del ticket
- [ ] Administrador abre ticket.
- [ ] Pop-up/drawer amplio y legible.
- [ ] Mensajes se guardan.
- [ ] Se puede programar en cronograma.
- [ ] Al hacer clic en actividad del cronograma se ve el detalle.

## 5. Cierre
- [ ] Cierre exige nota.
- [ ] Cierre guarda mensaje público.
- [ ] Estado cambia a Cerrada.
- [ ] Conversación queda bloqueada.
- [ ] Aparece correo pendiente `ticket.closed` en cola.

## 6. Correo de cierre
- [ ] Apps Script envía correo de cierre.
- [ ] Incluye radicado y datos del caso.
- [ ] Incluye nota de cierre/conversación.
- [ ] Botón abre la Mesa con `?ticket_id=`.
- [ ] Después de login, se abre el ticket automáticamente.

## 7. Seguimiento interno
- [ ] Notificaciones internas aparecen en Seguimiento.
- [ ] Contador de no leídas funciona.
- [ ] Al hacer clic en notificación abre la solicitud.
- [ ] Administrador ve panel de correos institucionales.

## 8. Responsive
- [ ] Wizard cómodo en móvil.
- [ ] Resolución del ticket cómoda en móvil.
- [ ] Cronograma usable en móvil.
