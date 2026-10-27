-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "favoritedAt" TIMESTAMP(3),
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;
