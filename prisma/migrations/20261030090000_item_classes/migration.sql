-- CreateTable
CREATE TABLE "ItemClass" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemClass_itemType_parentId_idx" ON "ItemClass"("itemType", "parentId");

-- AddForeignKey
ALTER TABLE "ItemClass" ADD CONSTRAINT "ItemClass_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemClass" ADD CONSTRAINT "ItemClass_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
