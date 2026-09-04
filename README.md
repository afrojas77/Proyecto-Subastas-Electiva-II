# Subastas

API REST académica para publicar artículos en subasta, registrar pujas, consultar su historial, cancelar ofertas sin pujas y cerrar subastas. La persistencia de esta entrega es temporal, en memoria.

## Tecnologías

- Node.js 20 o posterior
- Express
- TypeScript
- Jest y Supertest
- ESLint y Prettier

## Instalación

```bash
npm install
```

## Configuración

No se requieren credenciales ni variables de entorno para esta base. De forma opcional, `PORT` permite cambiar el puerto predeterminado `3000`; por eso no se incluye un archivo `.env.example` en este paso.

## Ejecución

Iniciar el servidor en desarrollo con recarga automática:

```bash
npm run dev
```

De forma predeterminada, la API escucha en `http://localhost:3000`.

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

La aplicación sigue arquitectura hexagonal: `Domain` contiene reglas y puertos sin conocer HTTP; `Application` coordina los casos de uso mediante esos puertos; `Infrastructure` implementa HTTP, tiempo, logging y persistencia en memoria. La composición de dependencias ocurre en `src/app.ts`.

## Estructura

```text
src/
├── domain/                         # Núcleo, reglas y puertos
├── application/                    # Casos de uso que coordinan puertos
├── infrastructure/
│   ├── http/
│   │   ├── controllers/            # Adaptadores de entrada HTTP
│   │   └── routes/                 # Definición de rutas Express
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

Preparadas, pero no completadas sin sus adaptadores o casos de uso posteriores: RN-17 y RN-18 (verificación externa de pagos), RN-19 (idempotencia de eventos), RN-20 (vencimiento coordinado), RN-22 (registro de usuario y unicidad global) y RN-23 (autenticación para limitar el historial a usuarios registrados). El historial API actual no expone datos de contacto.

## API

El contrato de la API está en `docs/openapi.yaml`. Incluye publicación, consulta, listado, pujas, historial, cancelación y cierre de subastas.
