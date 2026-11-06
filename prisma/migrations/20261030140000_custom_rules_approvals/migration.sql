-- Record type settings: form layout, validation rules, approval.
ALTER TABLE "CustomEntity" ADD COLUMN "formLayout" TEXT NOT NULL DEFAULT 'sections',
ADD COLUMN "rules" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "approval" BOOLEAN NOT NULL DEFAULT false;

-- Approval status of each record.
ALTER TABLE "CustomRecord" ADD COLUMN "status" TEXT NOT NULL DEFAULT '',
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decisionNote" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "CustomRecord" ADD CONSTRAINT "CustomRecord_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
