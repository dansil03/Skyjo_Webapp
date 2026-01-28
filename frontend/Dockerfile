# base deps stage
FROM node:20-alpine AS deps
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

# build stage
FROM deps AS build
RUN npm run build

# dev stage
FROM deps AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# runtime stage
FROM nginx:alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
