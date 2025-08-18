FROM oven/bun:1 AS base

WORKDIR /rss-bot_src

COPY package.json bun.lockb* ./ 

RUN bun install --frozen-lockfile

COPY . .

RUN bunx tsc --noEmit

EXPOSE 8443

CMD ["bun", "run", "start"]