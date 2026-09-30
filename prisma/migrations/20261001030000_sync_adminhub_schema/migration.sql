ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EDITOR';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'TRANSFER';

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "profile_image" VARCHAR(500);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'auth'
      AND column_name = 'password'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'auth'
      AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE "auth" RENAME COLUMN "password" TO "password_hash";
  END IF;
END $$;

ALTER TABLE "bookings"
ALTER COLUMN "booking_number" TYPE VARCHAR(40);

ALTER TABLE "transactions"
ALTER COLUMN "transaction_number" TYPE VARCHAR(40),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "users"
ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "auth"
ALTER COLUMN "last_login_at" TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bookings"
ALTER COLUMN "scheduled_at" TYPE TIMESTAMPTZ(3) USING "scheduled_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "transactions"
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

DO $$
BEGIN
  CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AlertType" AS ENUM (
    'TRANSACTION_FAILED',
    'BOOKING_PENDING',
    'BOOKING_CANCELLED',
    'USER_SUSPENDED',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" UUID NOT NULL,
  "type" "AlertType" NOT NULL,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
  "title" VARCHAR(160) NOT NULL,
  "message" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "resolved_at" TIMESTAMPTZ(3),
  "user_id" UUID,
  "booking_id" UUID,
  "transaction_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "alerts_booking_id_fkey" FOREIGN KEY ("booking_id")
    REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "alerts_transaction_id_fkey" FOREIGN KEY ("transaction_id")
    REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");
CREATE INDEX IF NOT EXISTS "bookings_created_at_idx" ON "bookings"("created_at");
CREATE INDEX IF NOT EXISTS "transactions_booking_id_idx" ON "transactions"("booking_id");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions"("created_at");
CREATE INDEX IF NOT EXISTS "alerts_is_read_created_at_idx" ON "alerts"("is_read", "created_at");
CREATE INDEX IF NOT EXISTS "alerts_severity_created_at_idx" ON "alerts"("severity", "created_at");
CREATE INDEX IF NOT EXISTS "alerts_user_id_idx" ON "alerts"("user_id");
CREATE INDEX IF NOT EXISTS "alerts_booking_id_idx" ON "alerts"("booking_id");
CREATE INDEX IF NOT EXISTS "alerts_transaction_id_idx" ON "alerts"("transaction_id");
