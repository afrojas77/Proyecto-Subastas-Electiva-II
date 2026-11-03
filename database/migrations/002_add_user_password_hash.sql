/*
  Migración de autenticación para una SubastasDB existente.
  Es idempotente y no elimina ni modifica usuarios existentes. Los registros
  anteriores quedan sin credencial y no pueden iniciar sesión hasta contar con
  un mecanismo de alta o restablecimiento de contraseña.
*/
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
  THROW 50001, 'La tabla dbo.users no existe. Ejecute primero database/schema.sql.', 1;
END;
GO

IF COL_LENGTH(N'dbo.users', N'password_hash') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD password_hash NVARCHAR(255) NULL;
END;
GO
