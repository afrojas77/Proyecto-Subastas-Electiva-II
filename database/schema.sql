/*
  Esquema inicial de Entrega 2 para Microsoft SQL Server.
  Los importes se almacenan como BIGINT porque Money representa pesos
  colombianos enteros, seguros y no negativos.
*/

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id NVARCHAR(100) NOT NULL,
    name NVARCHAR(200) NOT NULL,
    email NVARCHAR(320) COLLATE Latin1_General_100_CI_AI NOT NULL,
    -- Nullable para conservar usuarios académicos creados antes de autenticación.
    -- El endpoint de registro siempre persiste un hash bcrypt.
    password_hash NVARCHAR(255) NULL,
    document_type NVARCHAR(20) NULL,
    document_number NVARCHAR(30) NULL,
    phone NVARCHAR(16) NULL,
    CONSTRAINT PK_users PRIMARY KEY (id),
    CONSTRAINT UQ_users_email UNIQUE (email)
  );
END;
GO

IF COL_LENGTH(N'dbo.users', N'document_type') IS NULL
  ALTER TABLE dbo.users ADD document_type NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'document_number') IS NULL
  ALTER TABLE dbo.users ADD document_number NVARCHAR(30) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'phone') IS NULL
  ALTER TABLE dbo.users ADD phone NVARCHAR(16) NULL;
GO

-- Los usuarios históricos pueden no tener nombre. Los registros nuevos siempre
-- lo exigen en Domain y Application; la columna queda nullable solo al migrar
-- una base académica existente para evitar inventar datos personales.
IF COL_LENGTH(N'dbo.users', N'name') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD name NVARCHAR(200) NULL;
END;
GO

-- Actualización idempotente para bases creadas antes del bloque de autenticación.
IF COL_LENGTH(N'dbo.users', N'password_hash') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD password_hash NVARCHAR(255) NULL;
END;
GO

IF OBJECT_ID(N'dbo.auctions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.auctions (
    id NVARCHAR(100) NOT NULL,
    seller_id NVARCHAR(100) NOT NULL,
    article_denomination NVARCHAR(200) NOT NULL,
    article_description NVARCHAR(2000) NOT NULL,
    article_conservation_state NVARCHAR(20) NOT NULL,
    category_name NVARCHAR(200) NOT NULL,
    base_price BIGINT NOT NULL,
    minimum_increment BIGINT NOT NULL,
    published_at DATETIME2(3) NOT NULL,
    closes_at DATETIME2(3) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    version BIGINT NOT NULL CONSTRAINT DF_auctions_version DEFAULT 0,
    CONSTRAINT PK_auctions PRIMARY KEY (id),
    CONSTRAINT FK_auctions_seller FOREIGN KEY (seller_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_auctions_conservation_state CHECK (
      article_conservation_state IN ('NEW', 'LIKE_NEW', 'USED', 'RESTORED')
    ),
    CONSTRAINT CK_auctions_status CHECK (
      status IN ('OPEN', 'CANCELLED', 'CLOSED', 'DESERTED', 'DEFAULTED')
    ),
    CONSTRAINT CK_auctions_base_price CHECK (
      base_price > 0 AND base_price <= 9007199254740991
    ),
    CONSTRAINT CK_auctions_minimum_increment CHECK (
      minimum_increment > 0 AND minimum_increment <= 9007199254740991
    ),
    CONSTRAINT CK_auctions_dates CHECK (closes_at > published_at)
  );
END;
GO

-- Control optimista para impedir actualizaciones perdidas entre pujas concurrentes.
IF COL_LENGTH(N'dbo.auctions', N'version') IS NULL
BEGIN
  ALTER TABLE dbo.auctions
    ADD version BIGINT NOT NULL
      CONSTRAINT DF_auctions_version DEFAULT 0;
END;
GO

IF OBJECT_ID(N'dbo.accepted_bids', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.accepted_bids (
    id NVARCHAR(100) NOT NULL,
    auction_id NVARCHAR(100) NOT NULL,
    bidder_id NVARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL,
    placed_at DATETIME2(3) NOT NULL,
    sequence INT NOT NULL,
    CONSTRAINT PK_accepted_bids PRIMARY KEY (id),
    CONSTRAINT FK_accepted_bids_auction FOREIGN KEY (auction_id) REFERENCES dbo.auctions(id),
    CONSTRAINT FK_accepted_bids_bidder FOREIGN KEY (bidder_id) REFERENCES dbo.users(id),
    CONSTRAINT UQ_accepted_bids_auction_sequence UNIQUE (auction_id, sequence),
    CONSTRAINT UQ_accepted_bids_auction_id_id UNIQUE (auction_id, id),
    CONSTRAINT CK_accepted_bids_amount CHECK (
      amount >= 0 AND amount <= 9007199254740991
    ),
    CONSTRAINT CK_accepted_bids_sequence CHECK (sequence > 0)
  );
END;
GO

IF OBJECT_ID(N'dbo.rejected_bid_attempts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rejected_bid_attempts (
    id NVARCHAR(100) NOT NULL,
    auction_id NVARCHAR(100) NOT NULL,
    bidder_id NVARCHAR(100) NOT NULL,
    attempted_amount BIGINT NOT NULL,
    attempted_at DATETIME2(3) NOT NULL,
    reason NVARCHAR(40) NOT NULL,
    attempt_order INT NOT NULL,
    CONSTRAINT PK_rejected_bid_attempts PRIMARY KEY (id),
    CONSTRAINT FK_rejected_bid_attempts_auction FOREIGN KEY (auction_id) REFERENCES dbo.auctions(id),
    CONSTRAINT FK_rejected_bid_attempts_bidder FOREIGN KEY (bidder_id) REFERENCES dbo.users(id),
    CONSTRAINT UQ_rejected_bid_attempts_auction_order UNIQUE (auction_id, attempt_order),
    CONSTRAINT CK_rejected_bid_attempts_amount CHECK (
      attempted_amount >= 0 AND attempted_amount <= 9007199254740991
    ),
    CONSTRAINT CK_rejected_bid_attempts_reason CHECK (
      reason IN (
        'AUCTION_NOT_OPEN',
        'SELLER_CANNOT_BID',
        'BID_BELOW_BASE_PRICE',
        'BID_INCREMENT_TOO_LOW',
        'BIDDER_ALREADY_LEADING'
      )
    ),
    CONSTRAINT CK_rejected_bid_attempts_order CHECK (attempt_order > 0)
  );
END;
GO

IF OBJECT_ID(N'dbo.payment_orders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.payment_orders (
    id NVARCHAR(100) NOT NULL,
    auction_id NVARCHAR(100) NOT NULL,
    debtor_id NVARCHAR(100) NOT NULL,
    amount BIGINT NOT NULL,
    created_at DATETIME2(3) NOT NULL,
    due_at DATETIME2(3) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_payment_orders PRIMARY KEY (id),
    CONSTRAINT UQ_payment_orders_auction UNIQUE (auction_id),
    CONSTRAINT FK_payment_orders_auction FOREIGN KEY (auction_id) REFERENCES dbo.auctions(id),
    CONSTRAINT FK_payment_orders_debtor FOREIGN KEY (debtor_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_payment_orders_amount CHECK (
      amount >= 0 AND amount <= 9007199254740991
    ),
    CONSTRAINT CK_payment_orders_status CHECK (status IN ('PENDING', 'PAID', 'EXPIRED')),
    CONSTRAINT CK_payment_orders_dates CHECK (due_at >= created_at)
  );
END;
GO

IF OBJECT_ID(N'dbo.auction_closures', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.auction_closures (
    auction_id NVARCHAR(100) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    winning_bid_id NVARCHAR(100) NULL,
    CONSTRAINT PK_auction_closures PRIMARY KEY (auction_id),
    CONSTRAINT FK_auction_closures_auction FOREIGN KEY (auction_id) REFERENCES dbo.auctions(id),
    CONSTRAINT FK_auction_closures_winning_bid FOREIGN KEY (auction_id, winning_bid_id)
      REFERENCES dbo.accepted_bids(auction_id, id),
    CONSTRAINT CK_auction_closures_status CHECK (
      status IN ('CLOSED', 'DESERTED', 'DEFAULTED')
    ),
    CONSTRAINT CK_auction_closures_winner CHECK (
      (status = 'DESERTED' AND winning_bid_id IS NULL)
      OR (status IN ('CLOSED', 'DEFAULTED') AND winning_bid_id IS NOT NULL)
    )
  );
END;
GO

IF OBJECT_ID(N'dbo.payment_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.payment_events (
    id NVARCHAR(100) NOT NULL,
    payment_order_id NVARCHAR(100) NOT NULL,
    result NVARCHAR(20) NOT NULL,
    occurred_at DATETIME2(3) NOT NULL,
    origin_verification_data NVARCHAR(2048) NOT NULL,
    content_key NVARCHAR(1000) NOT NULL,
    response_event_id NVARCHAR(100) NOT NULL,
    response_payment_order_id NVARCHAR(100) NOT NULL,
    response_result NVARCHAR(20) NOT NULL,
    response_order_status NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_payment_events PRIMARY KEY (id),
    CONSTRAINT FK_payment_events_order FOREIGN KEY (payment_order_id) REFERENCES dbo.payment_orders(id),
    CONSTRAINT CK_payment_events_result CHECK (result IN ('APPROVED', 'REJECTED')),
    CONSTRAINT CK_payment_events_response_result CHECK (
      response_result IN ('APPROVED', 'REJECTED')
    ),
    CONSTRAINT CK_payment_events_response_order_status CHECK (
      response_order_status IN ('PENDING', 'PAID', 'EXPIRED')
    ),
    CONSTRAINT CK_payment_events_response_identity CHECK (
      response_event_id = id AND response_payment_order_id = payment_order_id
    )
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_auctions_category_status_published'
    AND object_id = OBJECT_ID(N'dbo.auctions')
)
  CREATE INDEX IX_auctions_category_status_published
    ON dbo.auctions(category_name, status, published_at, id);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_auctions_status_closes_at'
    AND object_id = OBJECT_ID(N'dbo.auctions')
)
  CREATE INDEX IX_auctions_status_closes_at ON dbo.auctions(status, closes_at);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_accepted_bids_bidder_auction'
    AND object_id = OBJECT_ID(N'dbo.accepted_bids')
)
  CREATE INDEX IX_accepted_bids_bidder_auction
    ON dbo.accepted_bids(bidder_id, auction_id);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_payment_orders_status_due_at'
    AND object_id = OBJECT_ID(N'dbo.payment_orders')
)
  CREATE INDEX IX_payment_orders_status_due_at ON dbo.payment_orders(status, due_at);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_payment_events_payment_order_id'
    AND object_id = OBJECT_ID(N'dbo.payment_events')
)
  CREATE INDEX IX_payment_events_payment_order_id ON dbo.payment_events(payment_order_id);
GO
