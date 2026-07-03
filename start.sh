#!/bin/bash
set -e

echo "=== Запуск сервера Skill ==="
node node_modules/@zhzai30/clawquest-agent-mine-openclaw/dist/index.js &

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
