import fetch from 'node-fetch';

const API_BASE = 'https://api.km.cocweb3.com';
const API_CODE = '1462374659c949daba11e69a4065b9be';

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

async function getStamina() {
  const data = await apiCall('/api/getStamina', { apiCode: API_CODE });
  return data?.data || {};
}

async function miningLoop() {
  console.log('=== Майнинг-цикл запущен ===');
  let errors = 0;

  while (errors < 10) {
    try {
      const state = await checkState();
      console.log(`Состояние: apiState=${state.apiState}, miningState=${state.miningState}`);

      if (state.miningState === 1) {
        console.log('Майнинг уже идёт, жду 60 сек...');
        await sleep(60000);
        continue;
      }

      const stamina = await getStamina();
      if (stamina.stamina !== undefined && stamina.stamina < 1) {
        console.log('Нет выносливости, покупаю...');
        await buyStamina();
        await sleep(5000);
      }

      const start = await startMining();
      if (start?.code === 0) {
        console.log('Майнинг запущен!');
        errors = 0;
        await sleep(300000);
      } else if (start?.code === 2009) {
        console.log('Конфликт состояний, жду...');
        await sleep(30000);
      } else if (start?.code === 2003) {
        console.log('Недостаточно выносливости, покупаю...');
        await buyStamina();
        await sleep(10000);
      } else if (start?.code === 2014) {
        console.log('API майнинг не активирован в игре!');
        await sleep(300000);
      } else {
        errors++;
        await sleep(30000);
      }
    } catch (err) {
      errors++;
      console.error(`Ошибка #${errors}:`, err.message);
      await sleep(30000);
    }
  }
}

console.log('=== ClawQuest Miner Starting ===');
await sleep(5000);
miningLoop();
