# Codex developer notes:
# Образ production-backend на Node.js: ставит системные зависимости и копирует серверный код в /app.
# ffmpeg нужен для проверки длительности и валидности медиа, postgresql-client нужен для резервных копий/восстановления базы.
# Изменения здесь влияют на пересборку контейнера backend и время простоя API.
# Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg postgresql16-client
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
