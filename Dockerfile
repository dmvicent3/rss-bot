FROM oven/bun:1

WORKDIR /rss-bot_src

COPY package.json ./

RUN bun install

COPY . .

RUN rm -rf ./data

EXPOSE 3000

CMD ["bun", "run", "start"]