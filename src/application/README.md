# Aplicación

Los casos de uso coordinan el dominio mediante sus puertos, sin conocer Express ni los adaptadores concretos. Esta capa publica, consulta, lista, cancela y cierra subastas; también registra pujas y persiste el agregado tras una puja rechazada para conservar su auditoría.

`ProcessPaymentNotification` verifica el origen mediante `PaymentNotificationVerifier` antes de validar o procesar el contenido. Un evento nuevo y aprobado usa `PaymentOrder.confirmWithVerifiedEvent`; uno rechazado se registra sin pagar la orden. El registro persistido conserva una clave del contenido normalizado y la respuesta original para reintentos secuenciales.

La implementación en memoria no ofrece exclusión mutua ni rollback: dos solicitudes concurrentes podrían superar simultáneamente la consulta por ID, y un fallo al guardar el evento después de guardar la orden podría dejar un cambio parcial. SQL Server deberá imponer unicidad por evento y ejecutar la transición y el registro dentro de una transacción.

`ProcessPaymentOrderExpiration` procesa por ID una orden pendiente usando el `Clock` inyectado. Si alcanzó `dueAt`, ejecuta `PaymentOrder.expire()`, localiza la subasta mediante `auctionId`, ejecuta `Auction.markAsDefaulted()` y guarda ambos agregados. Devuelve resultados explícitos para una ejecución nueva, una orden aún no vencida, una orden pagada o una pareja orden/subasta ya procesada. Una notificación `REJECTED` no simula vencimiento.

El caso de uso no está expuesto por HTTP ni se ejecuta en segundo plano. Para automatizar RN-20 hará falta un coordinador programado y un puerto de consulta capaz de descubrir órdenes `PENDING` con `dueAt` menor o igual al instante de evaluación; el contrato actual sólo permite buscar una orden conocida por ID.

Los repositorios en memoria no ofrecen transacciones ni rollback. El caso de uso valida ambas entidades y aplica las reglas de dominio antes de guardar, pero las escrituras de orden y subasta siguen siendo independientes. Un fallo en la segunda escritura puede dejar la orden persistida como `EXPIRED` y la subasta como `CLOSED`; además, los adaptadores en memoria conservan referencias mutables, por lo que una excepción posterior a una transición de dominio puede ser observable aun sin llamar a `save`. El adaptador SQL Server deberá guardar ambos agregados en una única transacción y permitir reintentos seguros de estados parciales.

## Publicación en tiempo real

`RealtimeEventPublisher` es un puerto de salida de Application. Expresa eventos tipados del sistema sin importar Socket.IO, nombres de salas ni conexiones de red. `PlaceBid`, `CloseAuction`, `ProcessPaymentNotification` y `ProcessPaymentOrderExpiration` publican, respectivamente, una puja aceptada, un cierre nuevo, un pago confirmado por una notificación verificada y nueva, y un incumplimiento procesado correctamente.

Los casos de uso esperan la publicación y sólo retornan éxito cuando el publicador no falla. La publicación ocurre después de persistir para no anunciar cambios rechazados, pero actualmente no es atómica con esas escrituras. Si el publicador falla, el estado puede quedar guardado aunque el caso de uso rechace; un reintento idempotente tampoco garantiza republicación. SQL Server necesitará una transacción con un patrón outbox y un despachador reintentable para ofrecer garantías más fuertes.
