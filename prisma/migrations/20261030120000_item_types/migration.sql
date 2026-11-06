-- Item types move from a list in code to a table, and item classes link to them by id.

-- CreateTable
CREATE TABLE "ItemType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_name_key" ON "ItemType"("name");

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The types that used to be built in, then any other name already used by a class.
INSERT INTO "ItemType" ("id", "name", "sortOrder")
SELECT 'ityp_' || md5(t.name), t.name, t.ord
FROM (VALUES ('Configurable', 1), ('Customer Defined', 2), ('Finished Goods', 3), ('Non-Inventory', 4),
             ('Raw Materials', 5), ('Service', 6), ('Supplies', 7)) AS t(name, ord);
INSERT INTO "ItemType" ("id", "name", "sortOrder")
SELECT DISTINCT 'ityp_' || md5(c."itemType"), c."itemType", 100
FROM "ItemClass" c
WHERE c."itemType" NOT IN (SELECT "name" FROM "ItemType");

-- Link classes by id instead of name.
ALTER TABLE "ItemClass" ADD COLUMN "itemTypeId" TEXT;
UPDATE "ItemClass" c SET "itemTypeId" = t."id" FROM "ItemType" t WHERE t."name" = c."itemType";
ALTER TABLE "ItemClass" ALTER COLUMN "itemTypeId" SET NOT NULL;
DROP INDEX "ItemClass_itemType_parentId_idx";
ALTER TABLE "ItemClass" DROP COLUMN "itemType";

-- CreateIndex
CREATE INDEX "ItemClass_itemTypeId_parentId_idx" ON "ItemClass"("itemTypeId", "parentId");

-- AddForeignKey
ALTER TABLE "ItemClass" ADD CONSTRAINT "ItemClass_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma sets updatedAt itself; the default was only for the rows inserted above.
ALTER TABLE "ItemType" ALTER COLUMN "updatedAt" DROP DEFAULT;
