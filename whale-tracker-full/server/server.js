import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 8787;

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/coingecko/top25', async (req, res) => {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=25&page=1';
  const r = await fetch(url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(await r.json());
});

app.listen(PORT, () => console.log("Server running on port " + PORT));
