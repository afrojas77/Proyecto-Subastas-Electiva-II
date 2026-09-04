# Subastas

Base técnica de una API REST académica para un sistema de subastas. Este primer paso incluye el servidor y su comprobación técnica; todavía no implementa el modelo ni las reglas de negocio.

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

La organización sigue arquitectura hexagonal: `domain` permanece independiente; `application` coordina el dominio; `infrastructure` contiene los adaptadores de entrada y salida. En esta base solo existe la ruta técnica `GET /health`; las piezas de negocio se añadirán de forma incremental.
