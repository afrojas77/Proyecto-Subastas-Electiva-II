# Persistencia SQL Server

Esta carpeta implementa los puertos `AuctionRepository`, `UserRepository`, `PaymentOrderRepository` y `PaymentEventRepository` sin introducir `mssql` en Domain ni Application.

## Modelo relacional

- `users`: identidad, correo normalizado y hash bcrypt; el correo tiene restricción única con colación insensible a mayúsculas y minúsculas. El hash es nullable para conservar filas académicas anteriores, que no pueden autenticarse.
- `auctions`: datos inmutables del artículo, categoría, precios, fechas y estado actual.
- `accepted_bids`: pujas aceptadas con ID, postor, importe, instante y secuencia única por subasta.
- `rejected_bid_attempts`: auditoría de intentos rechazados, motivo y orden de reconstrucción.
- `auction_closures`: presencia y resultado del cierre; referencia la puja ganadora cuando existe.
- `payment_orders`: una orden como máximo por subasta, con deudor, importe, fechas y estado.
- `payment_events`: evento externo, evidencia de verificación, clave de contenido y respuesta normalizada usada para idempotencia.

Los identificadores son `NVARCHAR(100)`. Los pesos colombianos son `BIGINT` restringidos al rango entero seguro de JavaScript. Los instantes son `DATETIME2(3)` y el driver los reconstruye como `Date`. Estados, motivos y conservación tienen restricciones `CHECK`. Vendedores, postores y deudores referencian `users`; los nuevos usuarios pueden crearse mediante la API de registro.

`AuctionClosure` no expone una fecha propia. En una adjudicación, `PaymentOrder.createdAt` coincide con el cierre; una subasta desierta no permite recuperar ese instante con el modelo actual, por lo que el esquema no inventa una columna imposible de poblar desde el agregado.

## Configuración

Variables soportadas:

- `PERSISTENCE=sqlserver`
- `DB_SERVER` (obligatoria)
- `DB_PORT` (predeterminado `1433`)
- `DB_DATABASE` (obligatoria)
- `DB_USER` (obligatoria)
- `DB_PASSWORD` (obligatoria)
- `DB_ENCRYPT` (predeterminado `true`)
- `DB_TRUST_SERVER_CERTIFICATE` (predeterminado `false`)
- `DB_CONNECTION_TIMEOUT` (predeterminado `15000` ms)

No se registran contraseñas. El pool se crea una vez en el arranque y se cierra durante el apagado. Producción rechaza `memory`, configuración incompleta o una conexión fallida, sin fallback silencioso.

## Esquema

Ejecuta `database/schema.sql` sobre una instalación nueva. Para una base creada antes de autenticación, ejecuta `database/migrations/002_add_user_password_hash.sql`; es idempotente, no borra filas y sólo añade `password_hash`. El esquema general también contiene esa comprobación para que pueda repetirse con seguridad.

## Mapeo y consultas

Los mapeadores usan `Auction.restore()` y `PaymentOrder.restore()`; no simulan publicación, pujas, cierre ni transiciones. Todas las entradas dinámicas se envían como parámetros `mssql`. La lectura y escritura del agregado `Auction` se ejecutan dentro de una transacción `SERIALIZABLE` para evitar snapshots parciales entre sus tablas.

`payment_events.id` es la clave de idempotencia persistente. Un ID duplicado queda protegido por la clave primaria; el caso de uso recupera la respuesta original cuando el contenido coincide. La resolución atómica de dos webhooks concurrentes y la traducción de una colisión SQL a la respuesta previa requieren todavía una transacción de aplicación o procedimiento almacenado.

## Límites transaccionales

Las transacciones actuales cubren una operación de `SqlAuctionRepository`, no varios repositorios. `CloseAuction`, `ProcessPaymentNotification` y `ProcessPaymentOrderExpiration` realizan escrituras independientes, y la publicación Socket.IO ocurre después. Por tanto, todavía pueden existir estados parciales. La evolución recomendada es una unidad de trabajo SQL que incluya las escrituras coordinadas y una tabla outbox para los eventos en tiempo real.

El listado de subastas aplica categoría, estado, conteo y `OFFSET/FETCH` directamente en SQL mediante parámetros. El orden estable por `published_at, id` permite recorrer páginas de forma determinista; sólo se reconstruyen los agregados incluidos en la página solicitada. El esquema crea un índice compuesto para esta consulta.

Las pruebas normales usan dobles de `SqlDatabase`; validan mapeo, parámetros y
manejo de errores sin requerir SQL Server. La suite separada descrita a
continuación comprueba el esquema y las restricciones contra una instancia local
de pruebas cuando el desarrollador la habilita expresamente.

## Pruebas de integración reales

La suite `sqlserver.integration.test.ts` usa los adaptadores reales y está
excluida de `npm test`. Valida usuarios y correo único; restauración completa de
subastas; estados de órdenes; eventos e idempotencia persistida; claves foráneas;
restricciones monetarias y de secuencia; y rollback de la escritura interna de
un agregado.

### Preparación local

1. Instala SQL Server Developer o Express y habilita conexiones TCP/IP si la
   instalación local lo requiere.
2. Usa la base académica `SubastasDB`, dedicada exclusivamente a este proyecto.
   La suite no elimina ni recrea la base.
3. Completa el `.env` local con `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
   `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` y, opcionalmente,
   `DB_CONNECTION_TIMEOUT`.
4. Define `DB_TEST_DATABASE=SubastasDB`. Mantén
   `RUN_SQLSERVER_INTEGRATION=false` y autoriza cada ejecución desde la sesión.
5. Ejecuta `npm run test:integration`.

Ejemplo de variables para una sesión de PowerShell; sustituye los marcadores
solo en tu equipo y no guardes la contraseña en archivos versionados:

```powershell
$env:RUN_SQLSERVER_INTEGRATION = "true"
npm run test:integration
```

El comando carga `.env` mediante Node.js y la configuración de Jest fija
`NODE_ENV=test` para el proceso de integración. Antes de conectarse, la suite
comprueba nuevamente el indicador de autorización y el nombre exacto
`SubastasDB`. Después aplica `database/schema.sql` sin borrar la base. Cada
ejecución genera un prefijo único y la limpieza solo elimina filas con ese
prefijo, en el orden requerido por las claves foráneas. Si una ejecución se
interrumpe, puede repetirse la suite; para una limpieza manual inspecciona primero
las filas cuyo identificador comienza por `it` y elimina únicamente las que
pertenezcan a la ejecución, respetando este orden: eventos, cierres, órdenes,
intentos rechazados, pujas, subastas y usuarios.

La prueba de rollback demuestra atomicidad únicamente dentro de
`SqlAuctionRepository`. Siguen pendientes una unidad de trabajo compartida para
confirmar un pago, registrar su evento y actualizar la orden; otra para vencer la
orden y marcar la subasta como `DEFAULTED`; y una estrategia outbox para coordinar
la persistencia con Socket.IO.
