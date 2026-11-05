FROM node:22-bookworm-slim AS build

# FFmpeg + a real font are runtime requirements, not dev niceties: the reel
# renderer draws text and the preview slicer shells out to ffmpeg.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.check.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

RUN npm ci --include=dev

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Runtime state lives on the mounted volume (or Postgres when DATABASE_URL is set).
ENV OMNIGTM_DB_PATH=/data/omnigtm.db
ENV OMNIGTM_MEDIA_DIR=/data/previews

CMD ["npm", "run", "start", "--workspace", "@omnigtm/web", "--", "-p", "3000"]
