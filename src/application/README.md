# Aplicación

Los casos de uso coordinan el dominio mediante sus puertos, sin conocer Express ni los adaptadores concretos. Esta capa publica, consulta, lista, cancela y cierra subastas; también registra pujas y persiste el agregado tras una puja rechazada para conservar su auditoría.

`RegisterUser` normaliza y valida el correo, aplica la política mínima de contraseña, verifica duplicados y delega el hash en `PasswordHasher`. `LoginUser` usa un mensaje genérico tanto para correo inexistente como para contraseña incorrecta y delega la emisión en `AccessTokenService`. `GetAuthenticatedProfile` recibe la identidad ya validada por el adaptador HTTP. Ninguno de estos casos de uso conoce bcrypt, JWT, Express o SQL Server, y sus DTO nunca contienen el hash.

Los adaptadores HTTP obtienen vendedor y postor desde el token validado y los entregan a `PublishAuction` y `PlaceBid`; los cuerpos HTTP no controlan esas identidades. `CancelAuction` recibe el solicitante como parte de su comando y comprueba en Application que coincida con el vendedor antes de invocar las reglas de cancelación del agregado. El historial requiere autenticación en el adaptador HTTP y mantiene su DTO sin correos, hashes o datos de contacto.

`ListAuctions` normaliza los filtros opcionales de categoría y estado, valida `page` y `limit` (máximo 100) y delega al puerto la consulta paginada y su conteo. `GetPaymentOrder` localiza la orden y autoriza que sólo su ganador/deudor pueda consultarla; el adaptador HTTP obtiene esa identidad del JWT y el presentador no expone `debtorId` ni datos de usuario.

## Cierre perezoso

`ProcessAuctionClosure` centraliza la coordinación sin duplicar la adjudicación de Domain. `GetAuction` lo invoca para la consulta individual y `PlaceBid` antes de evaluar una oferta. Si la subasta sigue `OPEN` y `Clock.now()` es mayor o igual que `closesAt`, se ejecuta `Auction.close()`, se guarda el agregado, se guarda la orden de pago cuando existe y se publica `auction:closed`. Después de ese proceso, una puja tardía pasa por `Auction.receiveBid()` y queda auditada como rechazada.

La presencia de `AuctionClosure` en el estado restaurado es la barrera de idempotencia dentro del proceso académico: un cierre ya efectuado retorna el mismo resultado sin nuevas escrituras, orden o evento. El ID determinista `payment-{auctionId}` refuerza la unicidad junto con la restricción SQL de una orden por subasta. El endpoint manual se conserva para compatibilidad, exige autenticación y autoriza al vendedor en Application; reutiliza el mismo coordinador y no puede adelantar la fecha de cierre.

`ProcessPaymentNotification` verifica el origen mediante `PaymentNotificationVerifier` antes de validar o procesar el contenido. Un evento nuevo y aprobado usa `PaymentOrder.confirmWithVerifiedEvent`; uno rechazado se registra sin pagar la orden. El registro persistido conserva una clave del contenido normalizado y la respuesta original para reintentos secuenciales.

La implementación en memoria no ofrece exclusión mutua ni rollback: dos solicitudes concurrentes podrían superar simultáneamente la consulta por ID, y un fallo al guardar el evento después de guardar la orden podría dejar un cambio parcial. SQL Server deberá imponer unicidad por evento y ejecutar la transición y el registro dentro de una transacción.

`ProcessPaymentOrderExpiration` procesa por ID una orden pendiente usando el `Clock` inyectado. Si alcanzó `dueAt`, ejecuta `PaymentOrder.expire()`, localiza la subasta mediante `auctionId`, ejecuta `Auction.markAsDefaulted()` y guarda ambos agregados. Devuelve resultados explícitos para una ejecución nueva, una orden aún no vencida, una orden pagada o una pareja orden/subasta ya procesada. Una notificación `REJECTED` no simula vencimiento.

El caso de uso no está expuesto por HTTP ni se ejecuta en segundo plano. Para automatizar RN-20 hará falta un coordinador programado y un puerto de consulta capaz de descubrir órdenes `PENDING` con `dueAt` menor o igual al instante de evaluación; el contrato actual sólo permite buscar una orden conocida por ID.

Los repositorios en memoria no ofrecen transacciones ni rollback. El caso de uso valida ambas entidades y aplica las reglas de dominio antes de guardar, pero las escrituras de orden y subasta siguen siendo independientes. Un fallo en la segunda escritura puede dejar la orden persistida como `EXPIRED` y la subasta como `CLOSED`; además, los adaptadores en memoria conservan referencias mutables, por lo que una excepción posterior a una transición de dominio puede ser observable aun sin llamar a `save`. El adaptador SQL Server deberá guardar ambos agregados en una única transacción y permitir reintentos seguros de estados parciales.

## Publicación en tiempo real

`RealtimeEventPublisher` es un puerto de salida de Application. Expresa eventos tipados del sistema sin importar Socket.IO, nombres de salas ni conexiones de red. `PlaceBid` publica la puja aceptada y, cuando cambia el líder, dirige otro evento al postor anterior. `ProcessAuctionClosure` publica el cierre general y resultados privados para el ganador y el vendedor; una subasta desierta sólo produce el resultado privado del vendedor. `ProcessPaymentNotification` y `ProcessPaymentOrderExpiration` publican, respectivamente, un pago confirmado por una notificación verificada y nueva, y un incumplimiento procesado correctamente.

Los casos de uso esperan la publicación y sólo retornan éxito cuando el publicador no falla. La publicación ocurre después de persistir para no anunciar cambios rechazados, pero actualmente no es atómica con esas escrituras. Si el publicador falla, el estado puede quedar guardado aunque el caso de uso rechace; un reintento idempotente tampoco garantiza republicación. SQL Server necesitará una transacción con un patrón outbox y un despachador reintentable para ofrecer garantías más fuertes.

Los casos de uso continúan dependiendo exclusivamente de los puertos de repositorio. Los adaptadores SQL Server pueden reemplazar a los adaptadores en memoria desde la composición sin cambiar Application. Cada guardado de `Auction` es transaccional dentro de su agregado, pero los casos de uso que coordinan más de un repositorio no comparten todavía una unidad de trabajo; orden, subasta, evento y publicación pueden quedar parcialmente actualizados ante un fallo intermedio.
