-- CreateTable
CREATE TABLE "CustomModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fields" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "CustomEntity_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CustomModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CustomEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomModule_slug_key" ON "CustomModule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CustomEntity_moduleId_slug_key" ON "CustomEntity"("moduleId", "slug");

-- CreateIndex
CREATE INDEX "CustomRecord_entityId_createdAt_idx" ON "CustomRecord"("entityId", "createdAt");
