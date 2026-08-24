## Descripcion

<!-- Que cambia y por que. -->

## Tipo de cambio

- [ ] Correccion de error
- [ ] Nueva funcionalidad
- [ ] Cambio en la base de datos (incluye migracion)
- [ ] Documentacion o infraestructura

## Comprobaciones

- [ ] `npm run lint` sin errores
- [ ] `npm test` en verde
- [ ] Probado con `docker compose up --build`
- [ ] Si hay cambios de esquema, se agrego una migracion nueva en `src/db/migrations/`
- [ ] No se exponen datos de alumnos ni codigos de acceso en logs
