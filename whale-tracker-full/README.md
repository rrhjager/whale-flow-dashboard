# Whale Tracker — End-to-End

## Proxy (motor) op Render
1. Upload deze repo (via GitHub public) naar Render als **Web Service**.
   - Build: `npm install`
   - Start: `node server/server.js`
2. Je krijgt een URL zoals `https://jouw-proxy.onrender.com`
3. Test: open `/api/health`

## Website (UI) op Netlify of Surge
- Upload de map `public/` naar Netlify Drop (sleep & neerzetten)
- Of gebruik Surge: `surge ./public mijnsite.surge.sh`

## Koppelen
- Pas `public/assets/config.js` aan:
  ```js
  window.WHALE_TRACKER_CONFIG = {
    WA_KEY: "",
    PROXY: "https://jouw-proxy.onrender.com",
    MIN_USD: 500000
  };
  ```
- Deploy de UI opnieuw
