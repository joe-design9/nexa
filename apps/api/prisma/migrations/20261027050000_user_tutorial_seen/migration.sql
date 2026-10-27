-- AlterTable
ALTER TABLE "User" ADD COLUMN "tutorialSeenAt" TIMESTAMP(3);

-- Bestehende Konten gelten als eingearbeitet: Sie bekommen das
-- Onboarding-Tutorial nicht automatisch aufgedrängt. Nur Konten, die
-- nach dieser Migration registriert werden (tutorialSeenAt = NULL),
-- sehen die Tour beim ersten Login.
UPDATE "User" SET "tutorialSeenAt" = "createdAt";
