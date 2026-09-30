CREATE TYPE "BookingDuration" AS ENUM ('1hr', '1.5hr', '2hr');

ALTER TABLE "bookings"
ADD COLUMN "service" VARCHAR(120) NOT NULL DEFAULT 'General booking',
ADD COLUMN "amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN "duration" "BookingDuration" NOT NULL DEFAULT '1hr';