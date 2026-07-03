FROM node:20-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN chmod +x start.sh
EXPOSE 10000
CMD ["bash", "-c", "while true; do ./start.sh; echo 'Restarting after crash...'; sleep 5; done"]
