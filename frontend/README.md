# Frontend Aurea

Cliente React para la API académica de subastas. Se mantiene separado del backend para conservar responsabilidades y dependencias claras.

## Desarrollo local

1. Inicia la API en `http://localhost:3000`.
2. Instala una vez las dependencias con `npm install` dentro de `frontend/`.
3. Ejecuta `npm run dev` dentro de `frontend/`.
4. Abre `http://localhost:3001`.

Vite envía `/api` y `/health` a la API mediante su proxy de desarrollo. En despliegues separados se puede definir `VITE_API_BASE_URL` a partir de `.env.example`.

## Organización

- `components/`: piezas visuales reutilizables sin lógica de negocio.
- `features/auth/`: pantalla, tipos, llamada HTTP y almacenamiento de sesión del módulo de autenticación.
- `lib/api-client.ts`: cliente HTTP común para futuros módulos.

El login utiliza el endpoint real `POST /api/auth/login`. La opción “Mantener mi sesión” guarda la sesión en `localStorage`; sin marcarla utiliza `sessionStorage`. Registro, recuperación y Google se presentan como funciones pendientes porque la API actual no ofrece esos dos últimos flujos.
