# Aplicación

Los casos de uso coordinan el dominio mediante sus puertos, sin conocer Express ni los adaptadores concretos. Esta capa publica, consulta, lista, cancela y cierra subastas; también registra pujas y persiste el agregado tras una puja rechazada para conservar su auditoría.

La verificación de pagos, la idempotencia de eventos externos y el vencimiento de órdenes se implementarán en futuros casos de uso cuando existan sus adaptadores externos.
