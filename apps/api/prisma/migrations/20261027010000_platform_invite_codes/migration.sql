-- CreateTable
CREATE TABLE "PlatformInviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInviteCode_code_key" ON "PlatformInviteCode"("code");

-- CreateIndex
CREATE INDEX "PlatformInviteCode_createdById_idx" ON "PlatformInviteCode"("createdById");

-- CreateIndex
CREATE INDEX "PlatformInviteCode_revoked_createdAt_idx" ON "PlatformInviteCode"("revoked", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformInviteCode" ADD CONSTRAINT "PlatformInviteCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

