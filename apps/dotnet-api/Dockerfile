# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

ARG VERSION=0.0.0

WORKDIR /src

COPY apps/dotnet-api/DotnetApi.csproj apps/dotnet-api/

RUN dotnet restore apps/dotnet-api/DotnetApi.csproj

COPY apps/dotnet-api apps/dotnet-api

RUN dotnet publish \
    apps/dotnet-api/DotnetApi.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    -p:Version="${VERSION}" \
    -p:InformationalVersion="${VERSION}"


FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

ARG VERSION=0.0.0

ENV ASPNETCORE_URLS=http://+:8080
ENV APP_VERSION=${VERSION}

LABEL org.opencontainers.image.version="${VERSION}"

WORKDIR /app

COPY --from=build /app/publish .

USER $APP_UID

EXPOSE 8080

ENTRYPOINT ["dotnet", "DotnetApi.dll"]