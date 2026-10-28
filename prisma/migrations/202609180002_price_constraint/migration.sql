-- SQL CHECK treats NULL as passing: require an explicit non-null amount for a currency.
ALTER TABLE "ProductVersion" DROP CONSTRAINT "product_price_currency_pair";
ALTER TABLE "ProductVersion" ADD CONSTRAINT "product_price_currency_pair" CHECK (
  ("price" IS NULL AND "currency" IS NULL)
  OR ("price" IS NOT NULL AND "price" >= 0 AND "currency" IS NOT NULL)
);
