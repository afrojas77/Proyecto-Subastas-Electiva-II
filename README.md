# Subastas

API REST académica para publicar artículos en subasta, registrar pujas, consultar su historial, cancelar ofertas sin pujas y cerrar subastas. La persistencia de esta entrega es temporal, en memoria.

## Tecnologías

- Node.js 20 o posterior
- Express
- Socket.IO
- TypeScript
- Jest y Supertest
- ESLint y Prettier

## Instalación

```bash
npm install
```

## Configuración

`PORT` permite cambiar el puerto predeterminado `3000`. El webhook académico de pagos usa `SIMULATED_PAYMENT_WEBHOOK_SECRET`; si no se define fuera de producción, se utiliza un valor local explícitamente inseguro. Este verificador simula el origen externo para desarrollo y pruebas, no sustituye la firma criptográfica de una pasarela real y la aplicación lo rechaza cuando `NODE_ENV=production`.

## Ejecución

Iniciar el servidor en desarrollo con recarga automática:

```bash
npm run dev
```

De forma predeterminada, la API y Socket.IO comparten el servidor HTTP en `http://localhost:3000`.

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
│       └── memory/                 # Adaptadores con Map en memoria
├── app.ts                           # Configuración de Express
└── index.ts                         # Arranque del servidor
```

La API expone `GET /health` y los recursos documentados en `docs/openapi.yaml`.

## Modelo de dominio

`Auction` es la raíz del agregado de subasta y protege la publicación, las condiciones inmutables, la cancelación, la recepción y auditoría de pujas y el cierre idempotente. `Bid` y `RejectedBidAttempt` pertenecen a ese agregado. `User`, `PaymentOrder`, `PaymentEvent` y `Notification` conservan identidad propia; `Money`, `Email`, `AuctionStatus`, `Article` y `Category` son valores inmutables y autovalidados.

Los contratos de `src/domain/ports` expresan las necesidades de persistencia sin acoplar el dominio a una base de datos.

## Reglas de negocio

Implementadas en Domain y demostradas desde Application/API: RN-01 a RN-16 y RN-21. `PlaceBid` coordina RN-12: guarda la subasta aun cuando el dominio rechaza una puja, preservando el intento de auditoría.

RN-17 a RN-19 se demuestran con un webhook y un verificador de secreto compartido exclusivo de desarrollo. La persistencia en memoria reproduce respuestas en reintentos secuenciales, pero no garantiza idempotencia atómica concurrente. RN-20 dispone de transición y caso de uso para procesar una orden identificada; todavía falta descubrir automáticamente las órdenes vencidas y ejecutar el caso de uso mediante un coordinador programado. Continúan pendientes RN-22 (registro y unicidad global) y RN-23 (autenticación para limitar el historial a usuarios registrados). El historial API y los eventos en tiempo real no exponen datos de contacto.

## API

El contrato de la API está en `docs/openapi.yaml`. Incluye publicación, consulta, listado, pujas, historial, cancelación y cierre de subastas, además del webhook simulado `POST /api/payments/webhook`.

## Eventos en tiempo real

Socket.IO publica `auction:bid-accepted`, `auction:closed`, `payment:confirmed` y `auction:defaulted` en la sala `auction:{auctionId}`. Un cliente puede solicitar la unión mediante `auction:join`, enviando el ID de la subasta. Esta unión sólo valida la forma del ID: antes de producción debe autenticar la conexión y autorizar que el usuario pueda observar la subasta solicitada.

Los eventos se emiten después de las escrituras de aplicación y no contienen correos, contraseñas, datos de contacto ni información de verificación del webhook. La implementación actual no ofrece transacciones, outbox, reintentos ni entrega exactamente una vez; una caída entre persistencia y publicación puede perder el evento.
