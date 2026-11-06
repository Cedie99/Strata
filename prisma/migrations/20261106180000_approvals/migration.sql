-- Configurable approval workflows: rules with ordered approver levels, requests that hold a document until
-- it is approved, and a credit limit per customer.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditLimit" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "threshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRuleLevel" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ApprovalRuleLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "step" INTEGER NOT NULL DEFAULT 1,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "resultId" TEXT,
    "resultNumber" TEXT NOT NULL DEFAULT '',
    "resultHref" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "deciderId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRule_trigger_isActive_idx" ON "ApprovalRule"("trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRuleLevel_ruleId_level_key" ON "ApprovalRuleLevel"("ruleId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_number_key" ON "ApprovalRequest"("number");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_branchId_idx" ON "ApprovalRequest"("status", "branchId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_kind_resultId_idx" ON "ApprovalRequest"("kind", "resultId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetId_idx" ON "ApprovalRequest"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_requestId_level_key" ON "ApprovalStep"("requestId", "level");

-- AddForeignKey
ALTER TABLE "ApprovalRuleLevel" ADD CONSTRAINT "ApprovalRuleLevel_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRuleLevel" ADD CONSTRAINT "ApprovalRuleLevel_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────────── Guards ─────────────
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_check" CHECK ("threshold" >= 0);
ALTER TABLE "ApprovalRuleLevel" ADD CONSTRAINT "ApprovalRuleLevel_level_check" CHECK ("level" >= 1);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_status_check" CHECK ("status" IN ('WAITING', 'APPROVED', 'REJECTED'));
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_creditLimit_check" CHECK ("creditLimit" >= 0);

-- Approval history is permanent: requests and steps are never deleted, a decided request never changes again,
-- and a decided step keeps its decision, decider, time and reason.
CREATE FUNCTION approval_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Approval requests are permanent and cannot be deleted'; END IF;
  IF OLD."status" <> 'PENDING' THEN RAISE EXCEPTION 'A decided approval request cannot be changed'; END IF;
  IF (NEW."number", NEW."kind", NEW."targetId", NEW."branchId", NEW."amount", NEW."title", NEW."details", NEW."reasons", NEW."payload", NEW."requestedById", NEW."requestedAt")
     IS DISTINCT FROM
     (OLD."number", OLD."kind", OLD."targetId", OLD."branchId", OLD."amount", OLD."title", OLD."details", OLD."reasons", OLD."payload", OLD."requestedById", OLD."requestedAt") THEN
    RAISE EXCEPTION 'What was submitted for approval cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_request_guard BEFORE UPDATE OR DELETE ON "ApprovalRequest" FOR EACH ROW EXECUTE FUNCTION approval_request_guard();
CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON "ApprovalRequest" FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

CREATE FUNCTION approval_step_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Approval steps are permanent and cannot be deleted'; END IF;
  IF OLD."status" <> 'WAITING' THEN RAISE EXCEPTION 'A decided approval step cannot be changed'; END IF;
  IF (NEW."requestId", NEW."level", NEW."roleId", NEW."roleName", NEW."ruleName") IS DISTINCT FROM (OLD."requestId", OLD."level", OLD."roleId", OLD."roleName", OLD."ruleName") THEN
    RAISE EXCEPTION 'An approval step cannot be moved to another role or level';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_step_guard BEFORE UPDATE OR DELETE ON "ApprovalStep" FOR EACH ROW EXECUTE FUNCTION approval_step_guard();
CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON "ApprovalStep" FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- ───────────── Permissions ─────────────
-- Everyone signed in sees their own requests and what waits for them; seeing every request is for those who
-- read the books, and managing the rules is for those who manage roles.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'approvals.view' FROM "RolePermission" WHERE "permission" = 'accounting.view'
ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'approvals.rules.manage' FROM "RolePermission" WHERE "permission" = 'admin.roles.manage'
ON CONFLICT DO NOTHING;
