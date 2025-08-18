FROM oven/bun:1

WORKDIR /rss-bot_src

COPY package.json ./

RUN bun install

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]