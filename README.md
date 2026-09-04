# Subastas

API REST académica para un sistema de subastas. La entrega actual incluye la base técnica y un modelo de dominio aislado de la infraestructura.

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

## Estructura inicial

```text
src/
├── domain/                         # Núcleo y contratos del negocio
├── application/                    # Casos de uso y coordinación
├── infrastructure/
│   ├── http/
│   │   ├── controllers/            # Adaptadores de entrada HTTP
│   │   └── routes/                 # Definición de rutas Express
│   └── persistence/
│       └── memory/                 # Futuros adaptadores en memoria
├── app.ts                           # Configuración de Express
└── index.ts                         # Arranque del servidor
```

La organización sigue arquitectura hexagonal: `domain` permanece independiente; `application` coordina el dominio; `infrastructure` contiene los adaptadores de entrada y salida. La API todavía expone únicamente la ruta técnica `GET /health`.

## Modelo de dominio

`Auction` es la raíz del agregado de subasta y protege la publicación, las condiciones inmutables, la cancelación, la recepción y auditoría de pujas y el cierre idempotente. `Bid` y `RejectedBidAttempt` pertenecen a ese agregado. `User`, `PaymentOrder`, `PaymentEvent` y `Notification` conservan identidad propia; `Money`, `Email`, `AuctionStatus`, `Article` y `Category` son valores inmutables y autovalidados.

Los contratos de `src/domain/ports` expresan las necesidades futuras de persistencia sin acoplar el dominio a una base de datos. La integración de pagos, los canales de notificación y los casos de uso HTTP todavía no están implementados.
