import fetch from 'node-fetch';
import http from 'http';

const API_BASE = 'https://api.km.cocweb3.com';
const API_CODE = '1462374659c949daba11e69a4065b9be';
const PORT = process.env.PORT || 10000;

const headers = {
  'X-Api-Code': API_CODE,
  'Content-Type': 'application/json'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiCall(endpoint, body = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log(`${endpoint}:`, JSON.stringify(data));
    return data;
  } catch (err) {
    console.error(`${endpoint} ошибка:`, err.message);
    return null;
  }
}

async function checkState() {
  const data = await apiCall('/api/checkMiningState', { apiCode: API_CODE });
  return data?.data || {};
}

async function buyStamina() {
  return await apiCall('/api/buyStamina', { apiCode: API_CODE });
}

async function startMining() {
  return await apiCall('/api/startMining', { apiCode: API_CODE });
}

async function endMining() {
  return await apiCall('/api/endMining', { apiCode: API_CODE });
}

async function getStamina() {
  const data = await apiCall('/api/getStamina', { apiCode: API_CODE });
  return data?.data || {};
}

async function miningLoop() {
  console.log('=== Управляемый майнинг-цикл запущен ===');
  let errors = 0;
  let currentEstimatedEnd = null; // Храним ожидаемое время завершения

  while (errors < 10) {
    try {
      // 1. Проверяем состояние
      const state = await checkState();
      console.log(`[Состояние] apiState=${state.apiState}, miningState=${state.miningState}`);

      // Если API не активно – ждём
      if (state.apiState !== 1) {
        console.log('API не активно, ожидаю 60 сек...');
        await sleep(60000);
        continue;
      }

      // 2. Если майнинг в процессе
      if (state.miningState === 1) {
        // Если у нас нет сохранённого estimatedEnd, но майнинг уже идёт (например, после перезапуска) –
        // попробуем получить estimatedEnd из ответа startMining? Не можем, потому что не мы запускали.
        // Будем ждать и проверять, не изменилось ли состояние на 2.
        if (currentEstimatedEnd && Date.now() >= currentEstimatedEnd) {
          console.log('Время майнинга истекло, вызываю endMining...');
          const endResult = await endMining();
          if (endResult?.code === 0) {
            console.log('Майнинг завершён успешно!');
            // Выводим баланс после завершения
            const stamina = await getStamina();
            console.log(`[БАЛАНС] Выносливость: ${stamina.stamina}, Алмазы: ${stamina.diamond || 'нет данных'}`);
            currentEstimatedEnd = null;
          } else if (endResult?.code === 2018) {
            console.log('Майнинг ещё не завершён, жду расчётное время...');
          } else {
            console.log('Ошибка завершения майнинга, повтор через 30 сек.');
            await sleep(30000);
            continue;
          }
        } else {
          console.log('Майнинг выполняется, ожидаю завершения...');
          await sleep(60000); // Проверяем раз в минуту
        }
        continue;
      }

      // 3. Если ожидается награда (miningState === 2)
      if (state.miningState === 2) {
        console.log('Ожидается награда за майнинг, вызываю endMining для фиксации...');
        const endResult = await endMining();
        if (endResult?.code === 0) {
          console.log('Награда получена!');
          const stamina = await getStamina();
          console.log(`[БАЛАНС] Выносливость: ${stamina.stamina}, Алмазы: ${stamina.diamond || 'нет данных'}`);
        } else {
          console.log('Не удалось завершить ожидающую награду, попробую позже.');
        }
        await sleep(10000);
        continue;
      }

      // 4. Если майнинг не идёт (MiningIdle = 0)
      // Проверяем выносливость
      const stamina = await getStamina();
      if (stamina.stamina !== undefined && stamina.stamina < 1) {
        console.log('Недостаточно выносливости, покупаю...');
        const buyResult = await buyStamina();
        if (buyResult?.code !== 0) {
          console.log('Не удалось купить выносливость, жду 60 сек.');
          await sleep(60000);
          continue;
        }
        await sleep(3000);
      }

      // Запускаем майнинг
      console.log('Запускаю новый майнинг...');
      const startResult = await startMining();
      if (startResult?.code === 0 && startResult?.data?.estimatedEndAt) {
        currentEstimatedEnd = startResult.data.estimatedEndAt;
        console.log(`Майнинг запущен, завершится в ${new Date(currentEstimatedEnd).toISOString()}`);
      } else if (startResult?.code === 2003) {
        console.log('Всё ещё недостаточно выносливости, покупаю ещё раз...');
        await buyStamina();
        await sleep(5000);
        continue;
      } else if (startResult?.code === 2009) {
        console.log('Конфликт состояний, сброс estimatedEnd и повтор через 30 сек.');
        currentEstimatedEnd = null;
        await sleep(30000);
        continue;
      } else if (startResult?.code === 2014) {
        console.log('API майнинг не активирован в игре! Проверьте настройки.');
        await sleep(300000);
        continue;
      } else {
        errors++;
        console.log(`Неизвестный ответ при старте, ошибка #${errors}`);
        await sleep(30000);
        continue;
      }

      errors = 0; // Сброс счётчика ошибок после успешного старта
    } catch (err) {
      errors++;
      console.error(`Критическая ошибка #${errors}:`, err.message);
      await sleep(30000);
    }
  }
  console.log('Слишком много ошибок, остановка цикла.');
}

// HTTP-сервер для Render
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ClawQuest Miner Active');
}).listen(PORT, () => {
  console.log(`HTTP-сервер на порту ${PORT}`);
});

console.log('=== ClawQuest Miner Starting ===');
await sleep(5000);
miningLoop();
