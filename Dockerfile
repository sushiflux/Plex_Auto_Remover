# syntax=docker/dockerfile:1

FROM node:26-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:11.0 AS backend-build
WORKDIR /src/backend
COPY backend/PlexAutoRemover.csproj ./
RUN dotnet restore
COPY backend/ ./
RUN dotnet publish -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:11.0 AS runtime
WORKDIR /app
COPY --from=backend-build /out ./
COPY --from=frontend-build /src/frontend/dist ./wwwroot
COPY docs/handbuch/*.pdf ./docs/handbuch/
COPY version.txt ./version.txt
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV ASPNETCORE_URLS=http://+:8080
ENV CONFIG_DIR=/config
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
