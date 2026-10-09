FROM node:24-bookworm-slim
WORKDIR /app/FE
ENV CI=true
COPY FE/package.json FE/package-lock.json ./
RUN npm ci --no-audit --no-fund && npx --no-install playwright install --with-deps chromium \
    && apt-get update && apt-get install -y --no-install-recommends libnss3-tools \
    && rm -rf /var/lib/apt/lists/*
COPY FE/ ./
CMD ["npm", "run", "check"]
