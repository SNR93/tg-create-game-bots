# Codex developer notes:
# Образ frontend: собирает Vite-приложение и отдаёт результат через nginx.
# Runtime-код React после сборки статичен, поэтому изменения frontend требуют пересборки frontend-контейнера.
# Медиа ботов nginx получает через примонтированную read-only папку backend/data/media.
# Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
