CREATE TYPE "CommercePlatform" AS ENUM ('SHOPIFY', 'NUVEMSHOP');

ALTER TABLE "Store"
ADD COLUMN "platform" "CommercePlatform" NOT NULL DEFAULT 'SHOPIFY';
