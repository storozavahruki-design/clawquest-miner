#!/bin/bash
set -e

echo "=== Установка Skill через ClawHub ==="
clawhub install @zhzai30/clawquest-agent-mine-openclaw || {
  echo "CLI установка не удалась, пробуем git..."
  git clone https://github.com/zhzai30/clawquest-agent-mine-openclaw.git /tmp/skill
  cp -r /tmp/skill/* /app/
  npm install
}

echo "=== Запуск Skill ==="
# Ищем правильный путь запуска
if [ -f "dist/index.js" ]; then
  node dist/index.js &
elif [ -f "index.js" ]; then
  node index.js &
elif [ -f "src/index.js" ]; then
  node src/index.js &
else
  echo "Ищу entry point..."
  ls -la
  ls -la dist/ 2>/dev/null || true
  ls -la src/ 2>/dev/null || true
fi

echo "=== Ожидание сервера ==="
for i in $(seq 1 30); do
  if curl -s http://localhost:10000/tool/check_mining_state \
    -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1; then
    echo "Сервер готов"
    break
  fi
  sleep 2
done

echo "=== set_api_code ==="
curl -s -X POST http://localhost:10000/tool/set_api_code \
  -H "Content-Type: application/json" \
  -d '{"apiCode":"1462374659c949daba11e69a4065b9be"}'

echo "=== start_mining_session ==="
curl -s -X POST http://localhost:10000/tool/start_mining_session \
  -H "Content-Type: application/json" \
  -d '{"apiCode":"1462374659c949daba11e69a4065b9be","autoBuyStamina":true}'

echo "=== Статус ==="
curl -s -X POST http://localhost:10000/tool/check_mining_state \
  -H "Content-Type: application/json" \
  -d '{"apiCode":"1462374659c949daba11e69a4065b9be"}'

echo "=== Готово ==="
wait
