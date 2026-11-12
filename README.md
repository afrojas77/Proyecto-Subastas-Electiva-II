# Subastas

API REST académica para publicar artículos en subasta, registrar pujas, consultar su historial, cancelar ofertas sin pujas y cerrar subastas. La ejecución admite persistencia temporal en memoria o persistencia real en SQL Server.

## Tecnologías

- Node.js 20 o posterior
- Express
- Socket.IO
- SQL Server mediante `mssql`
- Hash de contraseñas con bcrypt y tokens JWT firmados
- TypeScript
- Jest y Supertest
- ESLint y Prettier

## Instalación

```bash
npm install
```

## Configuración

`PORT` permite cambiar el puerto predeterminado `3000`. `PERSISTENCE` selecciona `memory` o `sqlserver`; si no se define, desarrollo usa memoria, pero producción exige explícitamente SQL Server. Las variables `DB_*` están descritas en `.env.example` y se validan antes de abrir el pool. El proyecto lee `process.env`: `.env.example` es una plantilla y no carga archivos `.env` automáticamente.

La autenticación exige `AUTH_TOKEN_SECRET`, con al menos 32 caracteres, y `AUTH_TOKEN_EXPIRES_IN_SECONDS`, un entero positivo. El secreto real sólo debe existir en el entorno local o en el gestor de secretos del despliegue; nunca debe copiarse a `.env.example` ni a la documentación.

El webhook académico de pagos usa `SIMULATED_PAYMENT_WEBHOOK_SECRET`; si no se define fuera de producción, se utiliza un valor local explícitamente inseguro. Este verificador simula el origen externo para desarrollo y pruebas, no sustituye la firma criptográfica de una pasarela real y la aplicación lo rechaza cuando `NODE_ENV=production`.

## Ejecución

Iniciar el servidor en desarrollo con recarga automática:

```bash
npm run dev
```

De forma predeterminada, la API y Socket.IO comparten el servidor HTTP en `http://localhost:3000`.

El cliente React se encuentra en `frontend/`. Después de instalar sus dependencias con `npm --prefix frontend install`, puede iniciarse desde la raíz con `npm run frontend:dev`; Vite lo sirve en `http://localhost:3001` y redirige `/api` a la API local en el puerto `3000`. El login ya consume `POST /api/auth/login` y mantiene sus dependencias separadas de las del backend.

Comprobar el servidor:

```bash
curl http://localhost:3000/health
```

La respuesta esperada es `{"status":"ok"}`.

Generar JavaScript compilado en `dist/` e iniciarlo:

```bash
npm run build
npm start
```

## Calidad y pruebas

```bash
npm run lint
npm run format:check
npm test
```

Las pruebas reales de persistencia están separadas de la suite normal. En este
proyecto académico se autorizan únicamente sobre `SubastasDB` y se ejecutan de
forma explícita con `npm run test:integration`. La suite carga el `.env` local,
exige `RUN_SQLSERVER_INTEGRATION=true` y solo elimina registros creados por esa
misma ejecución.

## Arquitectura

La aplicación sigue arquitectura hexagonal: `Domain` contiene reglas y puertos sin conocer HTTP; `Application` coordina los casos de uso y publica eventos mediante `RealtimeEventPublisher`; `Infrastructure` implementa HTTP, Socket.IO, tiempo, logging y persistencia en memoria. La composición de los casos de uso ocurre en `src/app.ts`, mientras `src/index.ts` conecta Express y Socket.IO al mismo servidor HTTP.

## Estructura

```text
src/
├── domain/                         # Núcleo, reglas y puertos
├── application/                    # Casos de uso que coordinan puertos
├── infrastructure/
│   ├── http/
│   │   ├── controllers/            # Adaptadores de entrada HTTP
│   │   └── routes/                 # Definición de rutas Express
│   ├── realtime/                    # Adaptador de salida Socket.IO
│   └── persistence/
│       ├── memory/                  # Adaptadores con Map para pruebas
│       └── sqlserver/               # Pool, mapeadores y repositorios SQL
├── app.ts                           # Configuración de Express
└── index.ts                         # Arranque del servidor
```

El esquema relacional está en `database/schema.sql`.

La API expone `GET /health` y los recursos documentados en `docs/openapi.yaml`.

## Modelo de dominio

`Auction` es la raíz del agregado de subasta y protege la publicación, las condiciones inmutables, la cancelación, la recepción y auditoría de pujas y el cierre idempotente. `Bid` y `RejectedBidAttempt` pertenecen a ese agregado. `User` conserva nombre, correo normalizado y hash; `PaymentOrder`, `PaymentEvent` y `Notification` conservan identidad propia. `Money`, `Email`, `AuctionStatus`, `Article` y `Category` son valores inmutables y autovalidados.

El cierre de subastas es perezoso y no necesita scheduler. `GET /api/auctions/{id}` y el intento de pujar evalúan el reloj inyectado: cuando `now >= closesAt`, Application invoca las reglas existentes de `Auction.close()`, persiste el resultado y su orden cuando existe, y publica una sola vez `auction:closed`. Una puja tardía se audita como `AUCTION_NOT_OPEN` después de completar el cierre. Las lecturas posteriores restauran el estado cerrado y no repiten orden ni evento.

Los contratos de `src/domain/ports` expresan las necesidades de persistencia sin acoplar el dominio a una base de datos.

## Reglas de negocio

Implementadas en Domain y demostradas desde Application/API: RN-01 a RN-16 y RN-21. `PlaceBid` coordina RN-12: guarda la subasta aun cuando el dominio rechaza una puja, preservando el intento de auditoría.

RN-17 a RN-19 se demuestran con un webhook y un verificador de secreto compartido exclusivo de desarrollo. SQL Server serializa por evento y orden los webhooks concurrentes, conserva una sola respuesta y actualiza orden y evento en la misma transacción; la persistencia en memoria sólo reproduce reintentos secuenciales. RN-20 se evalúa perezosamente al consultar la orden y antes de procesar un webhook verificado: si `now >= dueAt`, orden y subasta pasan atómicamente a `EXPIRED` y `DEFAULTED`, y una confirmación tardía se rechaza. RN-22 se protege en registro mediante consulta normalizada y restricción SQL única. RN-23 exige autenticación para el detalle y el historial de pujas, que continúan sin exponer datos de contacto.

SQL Server refuerza RN-21 con columnas `BIGINT` y restricciones de rango, y RN-22 mediante una restricción única de correo sin distinción entre mayúsculas y minúsculas. Los usuarios se registran mediante `POST /api/users/register`; las filas anteriores a autenticación siguen siendo referencias válidas, pero no pueden iniciar sesión mientras no tengan un hash asociado.

## API

El contrato de la API está en `docs/openapi.yaml`. Incluye `POST /api/users/register` con nombre, tipo y número de documento, teléfono, correo y contraseña; `POST /api/auth/login`; y el perfil protegido `GET /api/users/me`, que resume las subastas publicadas y aquellas en las que el usuario pujó. También documenta las operaciones de subastas, la consulta protegida `GET /api/payment-orders/{id}` y el webhook simulado `POST /api/payments/webhook`. Publicar, consultar el detalle con historial, pujar, cancelar, cerrar manualmente y leer una orden de pago exigen Bearer token. Vendedor y postor se toman exclusivamente de la identidad autenticada; los campos `sellerId` y `bidderId` enviados por el cliente son rechazados. Una orden sólo se entrega cuando el usuario del token coincide con su ganador/deudor.

`GET /api/auctions` admite `category`, `status`, `page` y `limit`. La página predeterminada es 1, el tamaño predeterminado es 20 y el máximo es 100. La respuesta contiene `auctions`, `page`, `limit`, `total` y `totalPages`; SQL Server aplica el filtro, el conteo y la paginación antes de reconstruir los agregados de la página.

## Eventos en tiempo real

Socket.IO exige el mismo JWT de la API en `auth.token`. Tras verificarlo, el servidor incorpora la conexión a `user:{userId}` sin aceptar identidades declaradas por el cliente. La suscripción pública se solicita con `auction:subscribe` y un identificador válido; incorpora el socket a `auction:{auctionId}`.

Las salas de subasta reciben `auction:bid-accepted`, `auction:closed`, `payment:confirmed` y `auction:defaulted`. El líder anterior recibe `auction:bid-outbid` en su sala privada. Al cerrar, ganador y vendedor reciben `auction:result`; si el resultado es `DESERTED`, sólo el vendedor recibe el resultado privado y nunca se inventa un ganador. La documentación detallada y los ejemplos están en `src/infrastructure/realtime/README.md`.

Los eventos se emiten después de las escrituras de aplicación y no contienen correos, contraseñas, datos de contacto ni información de verificación del webhook. La implementación actual no ofrece outbox, reintentos ni entrega exactamente una vez; una caída entre persistencia y publicación puede perder el evento.

En SQL Server, el cierre y su orden, el vencimiento y el incumplimiento, y la confirmación con su evento se confirman o revierten juntos. `sp_getapplock`, con propietario transaccional, serializa operaciones sobre la misma subasta, orden o evento. Esta garantía no incluye Socket.IO ni se reproduce en los repositorios en memoria.

## SQL Server

1. Crea la base local `SubastasDB`.
2. Ejecuta `database/schema.sql` desde SQL Server Management Studio, Azure Data Studio o `sqlcmd` contra esa base. El script es incremental y agrega las columnas ausentes en una instalación existente.
3. Copia los nombres de `.env.example` a variables de entorno locales y reemplaza sólo localmente usuario y contraseña.
4. Define `PERSISTENCE=sqlserver` y arranca la aplicación.

El proceso crea un único pool compartido y lo cierra junto con Socket.IO al recibir `SIGINT` o `SIGTERM`. Si falta configuración o falla la conexión, el inicio termina con un error claro y no cambia silenciosamente a memoria. Consulta `src/infrastructure/persistence/sqlserver/README.md` para el diseño, las relaciones y las limitaciones.

Las pujas concurrentes sobre SQL Server usan la versión técnica del agregado. Una escritura obsoleta se rechaza antes de reemplazar el historial y `PlaceBid` vuelve a leer y evaluar la oferta de forma acotada. La suite de integración ejecuta dos pujas simultáneas para comprobar que no exista una actualización perdida.

Para las pruebas de integración se reutiliza la base académica `SubastasDB`,
dedicada exclusivamente a este proyecto. La suite aplica `database/schema.sql`
sin eliminar ni recrear la base y limpia únicamente los registros que llevan el
prefijo único generado para su propia ejecución.
