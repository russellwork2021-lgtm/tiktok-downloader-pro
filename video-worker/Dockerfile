FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY video-worker/package.json ./
COPY video-worker/server.mjs ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
