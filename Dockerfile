FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG ZEABUR_GIT_COMMIT_SHA=""
ENV ZEABUR_GIT_COMMIT_SHA=${ZEABUR_GIT_COMMIT_SHA}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/default.conf
