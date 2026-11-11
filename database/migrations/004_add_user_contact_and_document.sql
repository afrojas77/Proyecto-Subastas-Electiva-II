IF COL_LENGTH(N'dbo.users', N'document_type') IS NULL
  ALTER TABLE dbo.users ADD document_type NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'document_number') IS NULL
  ALTER TABLE dbo.users ADD document_number NVARCHAR(30) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'phone') IS NULL
  ALTER TABLE dbo.users ADD phone NVARCHAR(16) NULL;
GO
