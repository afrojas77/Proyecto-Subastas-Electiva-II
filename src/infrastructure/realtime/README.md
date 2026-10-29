# Tiempo real con Socket.IO

`SocketIoRealtimeEventPublisher` implementa el puerto de aplicación `RealtimeEventPublisher`. Se conecta al mismo servidor HTTP que Express, traduce el evento tipado a una emisión Socket.IO y lo dirige a la sala `auction:{auctionId}`.

Eventos implementados:

- `auction:bid-accepted`: después de persistir una puja aceptada.
- `auction:closed`: después de persistir un cierre nuevo, adjudicado o desierto.
- `payment:confirmed`: después de guardar una notificación verificada, nueva y aprobada.
- `auction:defaulted`: después de guardar la orden vencida y la subasta incumplida.

Un cliente de una etapa posterior podrá usar el cliente oficial de Socket.IO de forma equivalente a:

```ts
const socket = io('http://localhost:3000');
socket.emit('auction:join', 'auction-1', console.log);
socket.on('auction:bid-accepted', console.log);
```

La operación `auction:join` sólo comprueba que `auctionId` sea texto no vacío. Falta autenticar el socket y autorizar la suscripción según el usuario y la visibilidad de la subasta; conocer un ID no debe bastar para acceder a información restringida. Los eventos actuales contienen identificadores operativos, importes, estados y fechas, pero no correos, contraseñas, contactos ni datos de verificación de pagos.

Socket.IO confirma que la emisión fue entregada al servidor, no a todos los clientes. Sin persistencia transaccional, outbox ni reintentos, no existe garantía de entrega exactamente una vez y un fallo posterior a guardar puede causar pérdida o duplicación observable del evento.
