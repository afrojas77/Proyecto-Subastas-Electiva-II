# Persistencia en memoria

Estos adaptadores implementan los puertos del dominio con `Map` en memoria: subastas, usuarios, órdenes de pago y eventos de pago. Sirven para ejecutar y demostrar la Entrega 1; sus datos no sobreviven al reinicio del proceso y pueden sustituirse por adaptadores SQL sin cambiar Application ni Domain.

El registro de eventos permite reproducir respuestas idempotentes en solicitudes secuenciales. No garantiza atomicidad ante concurrencia ni rollback entre la actualización de una orden y el registro de su evento; esas garantías requieren restricciones únicas y transacciones en el futuro adaptador SQL.
