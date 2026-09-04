# Dominio

Esta capa contiene el modelo y las reglas del negocio. No conoce Express, HTTP, bases de datos ni implementaciones de infraestructura.

## Agregados y conceptos

- `Auction` es la raíz del agregado de subasta: publica condiciones inmutables, recibe pujas, conserva los intentos rechazados, cancela y cierra una sola vez.
- `Bid` y `RejectedBidAttempt` son entidades internas del agregado `Auction`; solo la raíz puede crearlas como resultado de intentar pujar.
- `User` y `PaymentOrder` tienen identidad y ciclo de vida propios. La unicidad global del correo y su persistencia se coordinan mediante puertos.
- `PaymentEvent` y `Notification` representan hechos con identidad que más adelante serán procesados por casos de uso y adaptadores.
- `Article` y `Category` son objetos de valor inmutables: en esta entrega no tienen una identidad ni un ciclo de vida independientes de la oferta publicada.

## Carpetas

- `entities`: entidades y raíces de agregado.
- `value-objects`: valores inmutables y autovalidados.
- `errors`: errores propios del dominio, sin semántica HTTP.
- `ports`: contratos requeridos por aplicación para persistir o consultar el modelo.

## Decisiones temporales y transiciones pendientes

- La publicación recibe un `Clock` como puerto de tiempo. `Auction` captura ese instante como `publishedAt` y exige que `closesAt` sea posterior, lo que impide crear una subasta ya vencida sin introducir llamadas no deterministas al reloj del sistema.
- Los límites de una hora y treinta días se interpretan como duraciones exactas desde el instante de publicación. Treinta días equivalen a treinta periodos consecutivos de 24 horas; esta interpretación es adecuada para fechas UTC y para Colombia, que no aplica cambios estacionales de hora.
- `Auction` conserva cada `RejectedBidAttempt` antes de lanzar `BidRejectedError`. El futuro caso de uso deberá guardar el agregado incluso cuando capture ese error.
- `PaymentOrder.status` está encapsulado y nace como `PENDING`. Las transiciones a `PAID` y `EXPIRED` se añadirán como operaciones de dominio cuando existan, respectivamente, un evento verificado y el caso de uso de vencimiento; ningún consumidor puede asignar el estado directamente.
