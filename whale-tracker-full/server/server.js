// server/server.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8787;

// ---------- Health ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- CoinGecko Top 25 ----------
app.get('/api/coingecko/top25', async (_req, res) => {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=25&page=1&price_change_percentage=24h';
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- Whale Alert proxy (optioneel) ----------
app.get('/api/whale/transactions', async (req, res) => {
  try {
    const apiKey = req.query.api_key || process.env.WHALE_ALERT_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'No Whale Alert API key provided' });
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) if (k !== 'api_key') params.set(k, String(v));
    if (!params.has('limit')) params.set('limit', '100');
    const url = `https://api.whale-alert.io/v1/transactions?api_key=${encodeURIComponent(apiKey)}&${params.toString()}`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await r.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// -------------------------- No-key providers --------------------------

// BTC via mempool.space
app.get('/api/nokey/btc/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const limitBlocks = Number(req.query.blocks || '6');
    const blocks = await (await fetch('https://mempool.space/api/blocks')).json();
    const useBlocks = (blocks || []).slice(0, limitBlocks);
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json())?.bitcoin?.usd || 0;
    const txs = [];
    for (const b of useBlocks) {
      const arr = await (await fetch(`https://mempool.space/api/block/${b.id}/txs/0`)).json();
      for (const tx of arr || []) {
        try {
          const outs = Array.isArray(tx.vout) ? tx.vout : [];
          let sum = 0;
          for (const o of outs) sum += Number(o?.value || 0);
          const usd = sum * price;
          if (usd >= minUsd)
            txs.push({
              timestamp: b.timestamp,
              hash: tx.txid || '',
              amount_usd: usd,
              from: { owner_type: 'unknown' },
              to: { owner_type: 'unknown' },
              chain: 'btc',
            });
        } catch {}
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// XRP via Ripple Data
app.get('/api/nokey/xrp/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd')).json())?.ripple?.usd || 0;
    const data = await (await fetch('https://data.ripple.com/v2/transactions?type=Payment&result=tesSUCCESS&limit=200&descending=true')).json();
    const out = [];
    for (const it of data?.transactions || []) {
      const amt = it?.tx?.Amount;
      if (typeof amt === 'string') {
        const xrp = Number(amt) / 1_000_000;
        const usd = xrp * price;
        if (usd >= minUsd)
          out.push({
            timestamp: Math.floor(new Date(it.date).getTime() / 1000),
            hash: it.hash,
            amount_usd: usd,
            from: { owner_type: 'unknown' },
            to: { owner_type: 'unknown' },
            chain: 'xrp',
          });
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: out });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// LTC via litecoinspace
app.get('/api/nokey/ltc/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const limitBlocks = Number(req.query.blocks || '6');
    const blocks = await (await fetch('https://litecoinspace.org/api/blocks')).json();
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd')).json())?.litecoin?.usd || 0;
    const txs = [];
    for (const b of (blocks || []).slice(0, limitBlocks)) {
      const arr = await (await fetch(`https://litecoinspace.org/api/block/${b.id}/txs/0`)).json();
      for (const tx of arr || []) {
        try {
          const outs = Array.isArray(tx.vout) ? tx.vout : [];
          let sum = 0;
          for (const o of outs) sum += Number(o?.value || 0);
          const usd = sum * price;
          if (usd >= minUsd)
            txs.push({
              timestamp: b.timestamp,
              hash: tx.txid || '',
              amount_usd: usd,
              from: { owner_type: 'unknown' },
              to: { owner_type: 'unknown' },
              chain: 'ltc',
            });
        } catch {}
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DOGE & BCH via Blockchair mempool
async function blockchairMempool(chain) {
  const url = `https://api.blockchair.com/${chain}/mempool/transactions`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  return await r.json();
}
app.get('/api/nokey/doge/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd')).json())?.dogecoin?.usd || 0;
    const data = await blockchairMempool('dogecoin');
    const arr = data?.data || data || [];
    const txs = [];
    for (const it of arr) {
      const val = Number(it?.value || it?.transaction?.value || 0);
      const usd = val * price;
      if (usd >= minUsd)
        txs.push({
          timestamp: it?.time || Math.floor(Date.now() / 1000),
          hash: it?.hash || it?.transaction_hash || '',
          amount_usd: usd,
          from: { owner_type: 'unknown' },
          to: { owner_type: 'unknown' },
          chain: 'doge',
        });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
app.get('/api/nokey/bch/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd')).json())?.['bitcoin-cash']?.usd || 0;
    const data = await blockchairMempool('bitcoin-cash');
    const arr = data?.data || data || [];
    const txs = [];
    for (const it of arr) {
      const val = Number(it?.value || it?.transaction?.value || 0);
      const usd = val * price;
      if (usd >= minUsd)
        txs.push({
          timestamp: it?.time || Math.floor(Date.now() / 1000),
          hash: it?.hash || it?.transaction_hash || '',
          amount_usd: usd,
          from: { owner_type: 'unknown' },
          to: { owner_type: 'unknown' },
          chain: 'bch',
        });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Stellar native (Horizon)
app.get('/api/nokey/xlm/payments', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd')).json())?.stellar?.usd || 0;
    const r = await fetch(`https://horizon.stellar.org/payments?limit=${Math.min(200, Number(req.query.limit || '200'))}&order=desc`);
    const data = await r.json();
    const recs = data?._embedded?.records || [];
    const out = [];
    for (const rec of recs) {
      if (rec?.type !== 'payment') continue;
      if ((rec?.asset_type || '') !== 'native') continue;
      const amount = Number(rec?.amount || 0);
      const usd = amount * price;
      if (usd >= minUsd)
        out.push({
          timestamp: Math.floor(new Date(rec.created_at).getTime() / 1000),
          hash: rec.transaction_hash || '',
          amount_usd: usd,
          from: { owner_type: 'unknown' },
          to: { owner_type: 'unknown' },
          chain: 'xlm',
        });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: out });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Generic EVM (ETH/BNB/MATIC/AVAX/ARB/OP etc.)
app.get('/api/nokey/evm/transactions', async (req, res) => {
  try {
    const rpc = req.query.rpc;
    const geckoId = req.query.coingecko_id || 'ethereum';
    const blocks = Number(req.query.blocks || '50');
    const minUsd = Number(req.query.min_usd || '500000');
    if (!rpc) return res.status(400).json({ error: 'Missing ?rpc=' });
    const headers = { 'content-type': 'application/json' };
    const price =
      (await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(geckoId)}&vs_currencies=usd`)).json())?.[
        geckoId
      ]?.usd || 0;
    const bnRes = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
    const bnJson = await bnRes.json();
    const latest = parseInt(bnJson?.result || '0', 16);
    const start = Math.max(0, latest - blocks);
    const txs = [];
    for (let i = latest; i > start; i--) {
      const hex = '0x' + i.toString(16);
      const bRes = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [hex, true] }) });
      const bJson = await bRes.json();
      const block = bJson?.result;
      if (!block) continue;
      const ts = parseInt(block.timestamp || '0x0', 16);
      for (const t of block.transactions || []) {
        try {
          const valWei = BigInt(t.value || '0x0');
          if (valWei === 0n) continue;
          const val = Number(valWei) / 1e18;
          const usd = val * price;
          if (usd >= minUsd) txs.push({ timestamp: ts, hash: t.hash || '', amount_usd: usd, from: { owner_type: 'unknown' }, to: { owner_type: 'unknown' } });
        } catch {}
      }
      if (txs.length > 500) break;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Solana
app.get('/api/nokey/sol/transactions', async (req, res) => {
  try {
    const rpc = 'https://api.mainnet-beta.solana.com';
    const minUsd = Number(req.query.min_usd || '500000');
    const blocksToScan = Number(req.query.blocks || '40');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')).json())?.solana?.usd || 0;
    const headers = { 'content-type': 'application/json' };
    const slotResp = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }) });
    const slotJson = await slotResp.json();
    const latestSlot = slotJson?.result || 0;
    const startSlot = Math.max(0, latestSlot - blocksToScan);
    const txs = [];
    for (let s = latestSlot; s > startSlot; s--) {
      const bodyStr = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [s, { transactionDetails: 'full', rewards: false, maxSupportedTransactionVersion: 0 }] });
      const bRes = await fetch(rpc, { method: 'POST', headers, body: bodyStr });
      const bJson = await bRes.json();
      const block = bJson?.result;
      if (!block?.transactions) continue;
      const ts = block.blockTime || Math.floor(Date.now() / 1000);
      for (const tx of block.transactions) {
        try {
          const meta = tx?.meta;
          if (!meta?.preBalances || !meta?.postBalances) continue;
          const deltaLamports = Math.abs(Number(meta.postBalances[0] || 0) - Number(meta.preBalances[0] || 0));
          if (deltaLamports <= 0) continue;
          const sol = deltaLamports / 1_000_000_000;
          const usd = sol * price;
          if (usd >= minUsd)
            txs.push({
              timestamp: ts,
              hash: tx?.transaction?.signatures?.[0] || '',
              amount_usd: usd,
              from: { owner_type: 'unknown' },
              to: { owner_type: 'unknown' },
              chain: 'sol',
            });
        } catch {}
      }
      if (txs.length > 500) break;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// TRON
app.get('/api/nokey/trx/transactions', async (req, res) => {
  try {
    const minUsd = Number(req.query.min_usd || '500000');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd')).json())?.tron?.usd || 0;
    const r = await fetch('https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=200');
    const data = await r.json();
    const arr = data?.data || [];
    const txs = [];
    for (const it of arr) {
      let amountTrx = 0;
      if (it.contractTypeDesc === 'TransferContract' && it.contractData?.amount) amountTrx = Number(it.contractData.amount) / 1_000_000;
      const usd = amountTrx * price;
      if (usd >= minUsd)
        txs.push({
          timestamp: Math.floor((it.timestamp || Date.now()) / 1000),
          hash: it.hash || '',
          amount_usd: usd,
          from: { owner_type: 'unknown' },
          to: { owner_type: 'unknown' },
          chain: 'trx',
        });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// NEAR
app.get('/api/nokey/near/transactions', async (req, res) => {
  try {
    const rpc = 'https://rpc.mainnet.near.org';
    const minUsd = Number(req.query.min_usd || '500000');
    const blocksToScan = Number(req.query.blocks || '20');
    const price =
      (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd')).json())?.near?.usd || 0;
    const headers = { 'content-type': 'application/json' };
    const bRes = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'block', params: { finality: 'final' } }) });
    const bJson = await bRes.json();
    const latestHeight = bJson?.result?.header?.height || 0;
    const start = Math.max(0, latestHeight - blocksToScan);
    const txs = [];
    for (let h = latestHeight; h > start; h--) {
      const blkRes = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'block', params: { block_id: h } }) });
      const blkJson = await blkRes.json();
      const block = blkJson?.result;
      if (!block) continue;
      const ts = Math.floor((block.header?.timestamp || Date.now() * 1e6) / 1e9);
      for (const ch of block.chunks || []) {
        if (!ch?.chunk_hash) continue;
        const cRes = await fetch(rpc, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chunk', params: { chunk_id: ch.chunk_hash } }) });
        const cJson = await cRes.json();
        const chunk = cJson?.result;
        if (!chunk?.transactions) continue;
        for (const t of chunk.transactions) {
          try {
            for (const a of t.actions || []) {
              if (a?.Transfer?.deposit) {
                const near = Number(a.Transfer.deposit) / 1e24;
                const usd = near * price;
                if (usd >= minUsd)
                  txs.push({ timestamp: ts, hash: t.hash || '', amount_usd: usd, from: { owner_type: 'unknown' }, to: { owner_type: 'unknown' }, chain: 'near' });
              }
            }
          } catch {}
        }
      }
      if (txs.length > 500) break;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ transactions: txs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Whale Tracker proxy listening on http://localhost:${PORT}`);
});
