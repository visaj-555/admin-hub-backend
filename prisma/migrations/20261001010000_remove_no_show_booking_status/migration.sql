ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "BookingStatus_new" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "bookings"
ALTER COLUMN "status" TYPE "BookingStatus_new"
USING (
  CASE "status"::text
    WHEN 'NO_SHOW' THEN 'CANCELLED'
    ELSE "status"::text
  END
)::"BookingStatus_new";

ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";