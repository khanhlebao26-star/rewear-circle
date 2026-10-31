FROM node:24-bookworm-slim AS development

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && chown -R node:node /app
COPY --chown=node:node src ./src
COPY --chown=node:node test ./test
USER node
ENV NODE_ENV=development PORT=4000
CMD ["npm", "run", "dev"]

FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY test ./test
RUN mkdir -p uploads && chown node:node uploads

ENV NODE_ENV=production PORT=4000
USER node

EXPOSE 4000
CMD ["npm", "start"]
