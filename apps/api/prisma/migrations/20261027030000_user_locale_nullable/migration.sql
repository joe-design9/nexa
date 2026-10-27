-- Die Profil-Sprache darf die Browser-/Systemsprache beim ersten Start nur
-- dann ablösen, wenn der Nutzer sie ausdrücklich gewählt hat. Deshalb ist
-- "locale" jetzt nullable: NULL = noch keine Wahl getroffen (die Web-App
-- nutzt dann die Browser-/Systemsprache, sonst Englisch). Bestehende
-- Werte bleiben unverändert.
ALTER TABLE "User" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "locale" DROP NOT NULL;
