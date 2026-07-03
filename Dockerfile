FROM node:20-slim

RUN apt-get update && apt-get install -y curl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Устанавливаем ClawHub CLI
RUN npm install -g @anthropic/clawhub-cli || \
    npm install -g clawhub-cli || \
    echo "Пробуем альтернативную установку..."

# Проверяем, что CLI доступен
RUN which clawhub || echo "CLI не найден, продолжаем..."

COPY package.json ./

EXPOSE 10000

COPY start.sh ./
RUN chmod +x start.sh

CMD ["./start.sh"]
