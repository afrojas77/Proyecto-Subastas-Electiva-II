import { createServer } from 'node:http';

import { createApp } from './app';
import { SocketIoRealtimeEventPublisher } from './infrastructure/realtime/socket-io-realtime-event-publisher';

const port = Number(process.env.PORT ?? 3000);
const httpServer = createServer();
const realtimeEventPublisher =
  SocketIoRealtimeEventPublisher.attach(httpServer);
const app = createApp({ realtimeEventPublisher });
httpServer.on('request', app);

httpServer.listen(port, () => {
  console.log(`Servidor disponible en http://localhost:${port}`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await realtimeEventPublisher.close();
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
