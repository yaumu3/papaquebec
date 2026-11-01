# The one environment the visual tests run in: Linux, Chromium and software WebGPU through
# SwiftShader. Keep the tag at the version of Playwright in bun.lock.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
RUN npm install --global bun@1.4.2
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
