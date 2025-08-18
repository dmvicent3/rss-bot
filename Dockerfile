FROM python:3.12.2-slim-bullseye
# Set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
COPY . /rss-bot_src
WORKDIR /rss-bot_src
RUN bun install

#TYPE CHECK
RUN bun run check-ts

EXPOSE 8443