FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# The pipeline passes the repository root as Docker's build context.
COPY . .

RUN dotnet publish apps/api/DotNetWebAPI.Api.csproj \
    --configuration Release \
    --output /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app

COPY --from=build /publish/ .

USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "DotNetWebAPI.Api.dll"]