# Tiempo real con Socket.IO

`SocketIoRealtimeEventPublisher` implementa el puerto de aplicación `RealtimeEventPublisher`. Se conecta al mismo servidor HTTP que Express y traduce eventos tipados a emisiones Socket.IO públicas o privadas.

## Conexión y autenticación

Toda conexión debe enviar un JWT válido emitido por la API. El servidor verifica el token con `AccessTokenService`; no usa un `userId` proporcionado por el cliente. Una conexión válida se incorpora automáticamente a `user:{userId}` y una conexión ausente, alterada o vencida se rechaza.

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken },
});

socket.emit('auction:subscribe', 'auction-1', (result) => {
  console.log(result);
});
```

`auction:subscribe` acepta identificadores de 1 a 100 caracteres formados por letras, números, punto, guion, guion bajo o dos puntos. La sala pública resultante es `auction:{auctionId}`. El cliente no puede solicitar la unión a una sala `user:*`; esas salas se derivan exclusivamente del JWT.

## Eventos

Eventos implementados:

- `auction:bid-accepted`: se emite a la sala de la subasta después de persistir una puja aceptada. Contiene `auctionId`, `bidId`, `bidderId`, `amount`, `placedAt` y `sequence`.
- `auction:bid-outbid`: se emite únicamente a la sala privada del líder anterior cuando otro postor lo supera. Contiene `auctionId`, `newBidId`, `currentAmount` y `occurredAt`; el identificador interno del destinatario no forma parte del mensaje.
- `auction:closed`: se emite a la sala de la subasta después de persistir un cierre nuevo. Contiene estado, fecha y, cuando existe, ganador, orden e importe ganador.
- `auction:result`: se emite en privado al ganador y al vendedor con `recipientRole`, `status`, `closedAt` y los datos aplicables del resultado. Para `DESERTED` sólo se notifica al vendedor.
- `payment:confirmed`: después de guardar una notificación verificada, nueva y aprobada.
- `auction:defaulted`: después de guardar la orden vencida y la subasta incumplida.

Ejemplo de recepción:

```ts
socket.on('auction:bid-accepted', (event) => console.log(event));
socket.on('auction:bid-outbid', (event) => console.log(event));
socket.on('auction:closed', (event) => console.log(event));
socket.on('auction:result', (event) => console.log(event));
```

La sala pública no exige ser participante de la subasta, según el alcance académico actual. Los mensajes contienen identificadores operativos, importes, estados y fechas, pero no correos, contraseñas, contactos ni datos de verificación de pagos.

Socket.IO confirma que la emisión fue entregada al servidor, no a todos los clientes. Sin persistencia transaccional, outbox ni reintentos, no existe garantía de entrega exactamente una vez y un fallo posterior a guardar puede causar pérdida o duplicación observable del evento.
