FROM mcr.microsoft.com/dotnet/sdk:8.0

WORKDIR /app

COPY ./app .

RUN dotnet restore || true

EXPOSE 3000

CMD ["dotnet", "run", "--urls", "http://0.0.0.0:3000"]
