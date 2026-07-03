#!/bin/bash
set -e

echo "=== Запуск skill-openclaw ==="
node index.js &

echo "=== Ожидание готовности сервера ==="
for i in $(seq 1 30); do
  if curl -s http://localhost:10000/health > /dev/null 2>&1; then
    echo "Сервер готов"
    break
  fi
  sleep 2
done

echo "=== Сохраняем apiCode ==="
curl -s -X POST http://localhost:10000/tool/set_api_code \
  -H "Content-Type: application/json" \
  -d '{"apiCode":"1462374659c949daba11e69a4065b9be"}'

echo "=== Запускаем майнинг-сессию ==="
curl -s -X POST http://localhost:10000/tool/start_mining_session \
  -H "Content-Type: application/json" \
  -d '{"apiCode":"1462374659c949daba11e69a4065b9be","autoBuyStamina":true,"lang":"ru_RU"}'

echo "=== Готово, майнинг работает ==="

# Мониторинг: проверяем каждые 5 минут, не остановился ли цикл
while true; do
  sleep 300
  STATUS=$(curl -s -X POST http://localhost:10000/tool/get_managed_mining_status \
    -H "Content-Type: application/json" \
    -d '{}')
  RUNNING=$(echo "$STATUS" | grep -o '"running":true')
  if [ -z "$RUNNING" ]; then
    echo "[WATCHDOG] Майнинг остановлен, перезапускаю..."
    curl -s -X POST http://localhost:10000/tool/start_mining_session \
      -H "Content-Type: application/json" \
      -d '{"apiCode":"1462374659c949daba11e69a4065b9be","autoBuyStamina":true,"lang":"ru_RU"}'
    echo "[WATCHDOG] Перезапуск выполнен."
  else
    echo "[WATCHDOG] Майнинг активен."
  fi
done
