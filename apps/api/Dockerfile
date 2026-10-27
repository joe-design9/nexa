# Nexa API – mehrstufiges Image.
# Build-Kontext ist das Repo-Root (siehe docker-compose.yml).

# ─── Stufe 1: Abhängigkeiten + Build ────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo

# Workspace-Manifeste zuerst kopieren (bessere Layer-Nutzung)
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --ignore-scripts || npm install --ignore-scripts

# Quellen kopieren und Shared + API bauen
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @nexa/shared \
 && npx --prefix apps/api prisma generate \
 && npm run build -w @nexa/api

# ─── Stufe 2: Runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma

WORKDIR /repo/apps/api
EXPOSE 4000

# Beim Start Schema anwenden (Migrationen, sonst db push) und API starten.
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push; node dist/main.js"]
