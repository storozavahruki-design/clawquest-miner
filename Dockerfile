FROM node:20-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

EXPOSE 10000

COPY start.sh ./
RUN chmod +x start.sh

CMD ["./start.sh"]
