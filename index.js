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

// Минимальный HTTP-сервер для Render
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mining OK');
}).listen(PORT, () => {
  console.log(`HTTP-сервер на порту ${PORT}`);
});

// ... весь остальной код (apiCall, checkState, buyStamina, startMining, getStamina, miningLoop) без изменений ...

console.log('=== ClawQuest Miner Starting ===');
await sleep(5000);
miningLoop();
