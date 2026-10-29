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
- `Auction.restore` y `PaymentOrder.restore` reconstruyen estado persistido explícito sin repetir publicación, pujas, cierre ni creación de órdenes. La restauración valida coherencia estructural entre el agregado, sus pujas, el resultado y la orden.
- `PaymentOrder.status` está encapsulado y nace como `PENDING`. `confirmWithVerifiedEvent` permite `PENDING → PAID` únicamente con un evento `APPROVED` de la misma orden; `expire` permite `PENDING → EXPIRED` al alcanzar `dueAt`. `PAID` y `EXPIRED` son terminales y no admiten transiciones contradictorias.
- La verificación criptográfica de una notificación pertenece a Application/Infrastructure. El dominio no considera confiable un `PaymentEvent` por contener `originVerificationData`: la capa de aplicación debe verificar el origen antes de llamar `confirmWithVerifiedEvent`. RN-19 también queda fuera de estas operaciones y se coordinará mediante caso de uso y persistencia idempotente.
- `Auction.markAsDefaulted` permite `CLOSED → DEFAULTED` sólo cuando la orden asociada está `EXPIRED` y coincide con la subasta, el ganador y el importe. La operación reconstruye `AuctionClosure` con el mismo ganador y la orden vencida para mantener ambos estados coherentes.
