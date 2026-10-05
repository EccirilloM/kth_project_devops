FROM node:24-bookworm-slim
WORKDIR /app/simulator
ENV CI=true
COPY simulator/package.json simulator/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY simulator/tsconfig.json ./
COPY simulator/src/ ./src/
COPY simulator/test/ ./test/
COPY FE/src/app/core/mqtt/payloads.ts FE/src/app/core/mqtt/topics.ts FE/src/app/core/mqtt/attitude.ts /app/FE/src/app/core/mqtt/
COPY FE/src/app/dtos/ /app/FE/src/app/dtos/
COPY FE/tests/register.mjs /app/FE/tests/register.mjs
COPY ci/simulator/frontend-contract.test.mjs ./test/
COPY FE/scripts/audit.mjs FE/scripts/audit-policy.mjs /opt/kth-devops/
COPY ci/simulator/verify.mjs /opt/kth-devops/verify-simulator.mjs
CMD ["node", "/opt/kth-devops/verify-simulator.mjs"]
