-- Add performance indexes that are present in the Prisma schema but not in the initial migration.
CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan");
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "User_email_organizationId_idx" ON "User"("email", "organizationId");
CREATE INDEX IF NOT EXISTS "Session_userId_expires_idx" ON "Session"("userId", "expires");
CREATE INDEX IF NOT EXISTS "Session_expires_idx" ON "Session"("expires");
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "GmailConnection_projectId_createdAt_idx" ON "GmailConnection"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "GmailConnection_email_idx" ON "GmailConnection"("email");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
CREATE INDEX IF NOT EXISTS "Lead_projectId_createdAt_idx" ON "Lead"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");
