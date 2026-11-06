/*
  Migración compatible para bases creadas antes de RF-01.
  Los usuarios nuevos siempre reciben un nombre validado por la aplicación.
  Las filas académicas históricas permanecen con NULL para no inventar datos.
*/

IF COL_LENGTH(N'dbo.users', N'name') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD name NVARCHAR(200) NULL;
END;
GO
