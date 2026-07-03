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

async function getStamina() {
  const data = await apiCall('/api/getStamina', { apiCode: API_CODE });
  return data?.data || {};
}

async function buyStamina() {
  return await apiCall('/api/buyStamina', { apiCode: API_CODE });
}

async function setAutoMining() {
  return await apiCall('/api/setAutoMining', { apiCode: API_CODE });
}

async function miningLoop() {
  console.log('=== Авто-майнинг (setAutoMining) ===');

  // Включаем авто-майнинг один раз
  console.log('Включаю setAutoMining...');
  const setResult = await setAutoMining();
  if (setResult?.code === 0) {
    console.log('Авто-майнинг активирован! Игра сама будет запускать и завершать майнинг.');
  } else {
    console.log('Не удалось включить авто-майнинг, код:', setResult?.code);
  }

  // Цикл поддержки выносливости
  let errors = 0;
  while (errors < 10) {
    try {
      const stamina = await getStamina();
      console.log(`[Баланс] Выносливость: ${stamina.stamina}, Алмазы: ${stamina.diamond ?? 'нет данных'}`);

      if (stamina.stamina !== undefined && stamina.stamina < 1) {
        console.log('Выносливость на нуле, покупаю...');
        const buyResult = await buyStamina();
        if (buyResult?.code === 0) {
          console.log('Выносливость куплена.');
        } else {
          console.log('Ошибка покупки выносливости.');
        }
      } else {
        console.log('Выносливости достаточно.');
      }

      errors = 0; // сброс при успешной проверке
      await sleep(60000); // проверяем раз в минуту
    } catch (err) {
      errors++;
      console.error(`Ошибка #${errors}:`, err.message);
      await sleep(30000);
    }
  }
  console.log('Слишком много ошибок, остановка.');
}

// HTTP-сервер для Render
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ClawQuest AutoMiner Active');
}).listen(PORT, () => {
  console.log(`HTTP-сервер на порту ${PORT}`);
});

console.log('=== ClawQuest AutoMiner Starting ===');
await sleep(5000);
miningLoop();
