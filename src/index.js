const STROKE_LIMIT = 300;
const TEMP_ACCOUNT_LIFETIME_MS = 60 * 60 * 1000;

export class Board {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        width REAL NOT NULL,
        points TEXT NOT NULL,
        ts INTEGER NOT NULL
      )`
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL DEFAULT 'open',
        admin_token TEXT,
        created_ts INTEGER
      )`
    );
    this.sql.exec(`INSERT OR IGNORE INTO room_config (id, mode, admin_token, created_ts) VALUES (1, 'open', NULL, ?)`, Date.now());
    this.sql.exec(`UPDATE room_config SET created_ts = ? WHERE id = 1 AND created_ts IS NULL`, Date.now());
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS invites (
        token TEXT PRIMARY KEY,
        used INTEGER NOT NULL DEFAULT 0,
        created_ts INTEGER NOT NULL,
        used_ts INTEGER
      )`
    );
  }

  getConfig() {
    return [...this.sql.exec(`SELECT mode, admin_token, created_ts FROM room_config WHERE id = 1`)][0];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "anónimo").slice(0, 32);
    const adminParam = url.searchParams.get("admin");
    const inviteParam = url.searchParams.get("invite");

    const config = this.getConfig();
    let isAdmin = false;
    let newAdminToken = null;

    if (adminParam) {
      if (!config.admin_token) {
        newAdminToken = crypto.randomUUID();
        this.sql.exec(`UPDATE room_config SET admin_token = ? WHERE id = 1`, newAdminToken);
        isAdmin = true;
      } else if (adminParam === config.admin_token) {
        isAdmin = true;
      }
    }

    if (!isAdmin && config.mode === "closed") {
      let validInvite = false;
      if (inviteParam) {
        const rows = [...this.sql.exec(`SELECT token FROM invites WHERE token = ? AND used = 0`, inviteParam)];
        if (rows.length) {
          this.sql.exec(`UPDATE invites SET used = 1, used_ts = ? WHERE token = ?`, Date.now(), inviteParam);
          validInvite = true;
        }
      }
      if (!validInvite) {
        return new Response("Esta pizarra es privada. Necesitás un enlace de invitación válido.", { status: 403 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const clientId = crypto.randomUUID();
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ name, isAdmin, clientId });

    const history = [...this.sql.exec(
      `SELECT name, color, width, points, ts FROM strokes ORDER BY id ASC LIMIT ?`,
      STROKE_LIMIT
    )].map((row) => ({ ...row, points: JSON.parse(row.points) }));
    server.send(JSON.stringify({ history, ts: Date.now() }));
    server.send(JSON.stringify({
      status: true,
      mode: config.mode,
      isAdmin,
      adminToken: newAdminToken,
      clientId,
      createdTs: config.created_ts,
      expiryMs: TEMP_ACCOUNT_LIFETIME_MS,
      ts: Date.now(),
    }));

    const joinPayload = JSON.stringify({ system: true, text: `${name} se unió a la pizarra`, ts: Date.now() });
    for (const session of this.state.getWebSockets()) {
      session.send(joinPayload);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const { name, isAdmin, clientId } = ws.deserializeAttachment() || { name: "anónimo", isAdmin: false, clientId: null };

    let parsed = null;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;

    if (isAdmin && parsed.cmd) {
      this.handleAdminCommand(ws, parsed);
      return;
    }

    if (parsed.draw) {
      const payload = JSON.stringify({
        draw: true,
        clientId,
        strokeId: parsed.strokeId,
        color: parsed.color,
        width: parsed.width,
        points: parsed.points,
      });
      for (const session of this.state.getWebSockets()) {
        if (session !== ws) session.send(payload);
      }
      return;
    }

    if (parsed.strokeEnd) {
      const color = String(parsed.color || "#000000").slice(0, 16);
      const width = Number(parsed.width) || 3;
      const points = Array.isArray(parsed.points) ? parsed.points.slice(0, 5000) : [];
      const ts = Date.now();

      this.sql.exec(
        `INSERT INTO strokes (name, color, width, points, ts) VALUES (?, ?, ?, ?, ?)`,
        name, color, width, JSON.stringify(points), ts
      );
      this.sql.exec(
        `DELETE FROM strokes WHERE id NOT IN (SELECT id FROM strokes ORDER BY id DESC LIMIT ?)`,
        STROKE_LIMIT
      );
      return;
    }
  }

  handleAdminCommand(ws, cmd) {
    if (cmd.cmd === "setMode") {
      const mode = cmd.mode === "closed" ? "closed" : "open";
      this.sql.exec(`UPDATE room_config SET mode = ? WHERE id = 1`, mode);
      const payload = JSON.stringify({ system: true, text: `La pizarra ahora es ${mode === "closed" ? "CERRADA (solo invitados)" : "ABIERTA (cualquiera con el enlace)"}`, ts: Date.now() });
      for (const session of this.state.getWebSockets()) {
        session.send(payload);
      }
      return;
    }

    if (cmd.cmd === "createInvite") {
      const token = crypto.randomUUID();
      this.sql.exec(`INSERT INTO invites (token, used, created_ts) VALUES (?, 0, ?)`, token, Date.now());
      ws.send(JSON.stringify({ inviteToken: token, ts: Date.now() }));
      return;
    }

    if (cmd.cmd === "clearBoard") {
      this.sql.exec(`DELETE FROM strokes`);
      const payload = JSON.stringify({ clear: true, system: true, text: "El admin borró la pizarra", ts: Date.now() });
      for (const session of this.state.getWebSockets()) {
        session.send(payload);
      }
      return;
    }
  }

  async webSocketClose(ws) {
    const { name } = ws.deserializeAttachment() || { name: "anónimo" };
    const leavePayload = JSON.stringify({ system: true, text: `${name} salió de la pizarra`, ts: Date.now() });
    for (const session of this.state.getWebSockets()) {
      session.send(leavePayload);
    }
  }
}

const COLORS = ["#1c1f26", "#e63946", "#f4a300", "#2a9d8f", "#3b6bf5", "#8e44ad"];

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #eef0f4;
    --card: #ffffff;
    --border: #e2e5ea;
    --text: #1c1f26;
    --muted: #7a8091;
    --primary: #3b6bf5;
    --primary-text: #ffffff;
    --danger: #c0392b;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    padding: 32px 16px;
    display: flex;
    justify-content: center;
  }
  .app { width: 100%; max-width: 640px; }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px 4px;
    color: var(--text);
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px rgba(20, 20, 40, 0.06);
    padding: 20px;
  }
  #login input {
    width: 100%;
    padding: 11px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 15px;
    outline: none;
    margin-bottom: 10px;
  }
  #login input:focus { border-color: var(--primary); }
  button {
    font-family: inherit;
    cursor: pointer;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    transition: opacity 0.15s;
  }
  button:hover { opacity: 0.85; }
  #join {
    width: 100%;
    padding: 11px;
    background: var(--primary);
    color: var(--primary-text);
    font-size: 15px;
  }
  #loginError { color: var(--danger); margin-top: 10px; font-size: 13px; line-height: 1.4; }
  #board-wrap { display: none; flex-direction: column; }
  #login { display: flex; flex-direction: column; justify-content: center; }
  #expiryBanner {
    display: none;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 12.5px;
    border-radius: 999px;
    background: #eaf0ff;
    color: #33447a;
    text-align: center;
  }
  #adminPanel {
    display: none;
    background: #fbfaf3;
    border: 1px solid #ecdfa0;
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 12px;
    font-size: 13px;
  }
  #adminPanel .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  #adminPanel button {
    padding: 6px 10px;
    background: #fff;
    border: 1px solid #d8cc80;
    color: #6b5b0f;
    font-size: 12.5px;
  }
  #adminPanel button.danger { border-color: #e0a0a0; color: #a02020; }
  #modeLabel { font-weight: 700; }
  #inviteList div, #adminLink {
    font-size: 11.5px;
    word-break: break-all;
    color: #445;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 6px;
    margin-top: 4px;
    display: block;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .swatch {
    width: 26px; height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .swatch.active { border-color: var(--text); }
  #widthRange { width: 90px; }
  #clearBtn {
    margin-left: auto;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 12px;
  }
  #canvas-holder {
    position: relative;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    touch-action: none;
  }
  canvas { display: block; width: 100%; height: 440px; touch-action: none; }
  #log {
    max-height: 90px;
    overflow-y: auto;
    font-size: 12px;
    color: var(--muted);
    margin-top: 8px;
    font-style: italic;
  }

  @media (max-width: 700px) {
    body { padding: 0; align-items: stretch; }
    .app { max-width: 100%; height: 100dvh; display: flex; flex-direction: column; }
    h1 { margin: 14px 16px 10px; flex-shrink: 0; }
    #login, #board-wrap {
      flex: 1; min-height: 0;
      border-radius: 0; border-left: none; border-right: none; border-bottom: none; box-shadow: none;
    }
    #expiryBanner, #adminPanel, .toolbar { flex-shrink: 0; }
    #canvas-holder { flex: 1; min-height: 0; border-radius: 0; }
    canvas { height: 100%; }
    #log { flex-shrink: 0; }
  }
</style>
</head>
<body>
<div class="app">
  <h1>🎨 Pizarra efímera</h1>

  <div id="login" class="card">
    <input id="name" placeholder="tu nombre">
    <button id="join">entrar</button>
    <div id="loginError"></div>
  </div>

  <div id="board-wrap" class="card">
    <div id="expiryBanner"></div>
    <div id="adminPanel">
      <div class="row"><b>Panel admin</b> · modo: <span id="modeLabel">-</span></div>
      <div class="row">
        <button id="toggleMode">cambiar a...</button>
        <button id="createInvite">generar invitación</button>
        <button id="clearBoardBtn" class="danger">borrar pizarra</button>
      </div>
      <div id="inviteList"></div>
      <div style="color:#8a7c2a; font-size:11px; margin-top:6px;">Guardá este link para volver como admin:</div>
      <a id="adminLink" href="#"></a>
    </div>

    <div class="toolbar">
      ${COLORS.map((c, i) => `<button class="swatch${i === 0 ? " active" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
      <input type="range" id="widthRange" min="1" max="16" value="3">
      <button id="clearBtn" title="borra solo tu vista, no la pizarra">limpiar mi vista</button>
    </div>

    <div id="canvas-holder">
      <canvas id="canvas"></canvas>
    </div>
    <div id="log"></div>
  </div>
</div>

<script>
  const params = new URLSearchParams(location.search);
  const adminParam = params.get('admin');
  const inviteParam = params.get('invite');

  let ws;
  let myClientId = null;
  let myName = '';
  let currentColor = ${JSON.stringify(COLORS[0])};
  let currentWidth = 3;
  let currentMode = 'open';
  let expiryInterval = null;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const holder = document.getElementById('canvas-holder');
  const logEl = document.getElementById('log');
  let history = [];

  function resizeCanvas() {
    const rect = holder.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawAll();
  }
  window.addEventListener('resize', resizeCanvas);

  function drawSegment(color, width, p1, p2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p1[0] * canvas.clientWidth, p1[1] * canvas.clientHeight);
    ctx.lineTo(p2[0] * canvas.clientWidth, p2[1] * canvas.clientHeight);
    ctx.stroke();
  }

  function drawStroke(stroke) {
    for (let i = 1; i < stroke.points.length; i++) {
      drawSegment(stroke.color, stroke.width, stroke.points[i - 1], stroke.points[i]);
    }
    if (stroke.points.length === 1) {
      drawSegment(stroke.color, stroke.width, stroke.points[0], stroke.points[0]);
    }
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    history.forEach(drawStroke);
  }

  function logMsg(text) {
    const div = document.createElement('div');
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function startExpiryCountdown(expiresAt) {
    const banner = document.getElementById('expiryBanner');
    banner.style.display = 'block';
    if (expiryInterval) clearInterval(expiryInterval);
    function tick() {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        banner.textContent = '⏳ Esta pizarra efímera ya debería haber desaparecido (cuenta temporal vencida).';
        banner.style.background = '#fdd'; banner.style.color = '#a00';
        clearInterval(expiryInterval);
        return;
      }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      banner.textContent = '⏳ Pizarra efímera: se autodestruye en ~' + mins + ':' + String(secs).padStart(2, '0');
      if (remainingMs < 5 * 60000) { banner.style.background = '#fee'; banner.style.color = '#a40'; }
    }
    tick();
    expiryInterval = setInterval(tick, 1000);
  }

  function updateModeUI() {
    document.getElementById('modeLabel').textContent = currentMode;
    document.getElementById('toggleMode').textContent = currentMode === 'open' ? 'cambiar a CERRADA' : 'cambiar a ABIERTA';
  }

  function connect(name) {
    myName = name;
    const loginError = document.getElementById('loginError');
    loginError.textContent = '';

    let wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host +
      '/room/test?name=' + encodeURIComponent(name);
    if (adminParam) wsUrl += '&admin=' + encodeURIComponent(adminParam);
    if (inviteParam) wsUrl += '&invite=' + encodeURIComponent(inviteParam);
    ws = new WebSocket(wsUrl);

    let hasOpened = false;
    ws.onopen = () => {
      hasOpened = true;
      document.getElementById('login').style.display = 'none';
      document.getElementById('board-wrap').style.display = 'flex';
      requestAnimationFrame(resizeCanvas);
    };
    ws.onclose = () => {
      if (!hasOpened) {
        loginError.textContent = 'No se pudo entrar: la pizarra es privada y necesitás un enlace de invitación válido (o el tuyo ya se usó).';
      }
    };

    const liveStrokes = {};

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.history) {
        history = d.history;
        redrawAll();
      } else if (d.status) {
        myClientId = d.clientId;
        currentMode = d.mode;
        if (d.createdTs && d.expiryMs) startExpiryCountdown(d.createdTs + d.expiryMs);
        if (d.isAdmin) {
          document.getElementById('adminPanel').style.display = 'block';
          updateModeUI();
          if (d.adminToken) {
            const link = location.origin + location.pathname + '?admin=' + d.adminToken;
            const a = document.getElementById('adminLink');
            a.href = link; a.textContent = link;
          }
        }
      } else if (d.inviteToken) {
        const link = location.origin + location.pathname + '?invite=' + d.inviteToken;
        const div = document.createElement('div');
        div.textContent = 'Invitación: ' + link;
        document.getElementById('inviteList').appendChild(div);
      } else if (d.draw) {
        if (d.clientId === myClientId) return;
        const key = d.clientId + ':' + d.strokeId;
        const prev = liveStrokes[key];
        const pts = d.points;
        if (prev && pts.length) drawSegment(d.color, d.width, prev, pts[0]);
        for (let i = 1; i < pts.length; i++) drawSegment(d.color, d.width, pts[i - 1], pts[i]);
        if (pts.length) liveStrokes[key] = pts[pts.length - 1];
      } else if (d.clear) {
        history = [];
        redrawAll();
        logMsg(d.text);
      } else if (d.system) {
        logMsg(d.text);
        if (d.text.includes('pizarra ahora es')) {
          currentMode = d.text.includes('CERRADA') ? 'closed' : 'open';
          updateModeUI();
        }
      }
    };
  }

  function join() {
    const n = document.getElementById('name');
    const name = (n.value || 'anónimo').trim();
    if (!name) return;
    localStorage.setItem('boardName', name);
    connect(name);
  }
  document.getElementById('join').onclick = join;
  document.getElementById('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  const saved = localStorage.getItem('boardName');
  if (saved) document.getElementById('name').value = saved;

  document.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
    });
  });
  document.getElementById('widthRange').addEventListener('input', (e) => {
    currentWidth = Number(e.target.value);
  });
  document.getElementById('clearBtn').onclick = () => { redrawAll(); };

  document.getElementById('toggleMode').onclick = () => {
    const next = currentMode === 'open' ? 'closed' : 'open';
    ws.send(JSON.stringify({ cmd: 'setMode', mode: next }));
  };
  document.getElementById('createInvite').onclick = () => {
    ws.send(JSON.stringify({ cmd: 'createInvite' }));
  };
  document.getElementById('clearBoardBtn').onclick = () => {
    ws.send(JSON.stringify({ cmd: 'clearBoard' }));
  };

  // Drawing
  let drawing = false;
  let strokeId = null;
  let strokePoints = [];
  let pendingBatch = [];

  function toNorm(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  }

  function pointerDown(clientX, clientY) {
    drawing = true;
    strokeId = crypto.randomUUID();
    const p = toNorm(clientX, clientY);
    strokePoints = [p];
    pendingBatch = [p];
    drawSegment(currentColor, currentWidth, p, p);
  }
  function pointerMove(clientX, clientY) {
    if (!drawing) return;
    const p = toNorm(clientX, clientY);
    const last = strokePoints[strokePoints.length - 1];
    drawSegment(currentColor, currentWidth, last, p);
    strokePoints.push(p);
    pendingBatch.push(p);
    if (pendingBatch.length >= 4) flushBatch();
  }
  function flushBatch() {
    if (!pendingBatch.length || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ draw: true, strokeId, color: currentColor, width: currentWidth, points: pendingBatch }));
    pendingBatch = [];
  }
  function pointerUp() {
    if (!drawing) return;
    drawing = false;
    flushBatch();
    if (ws && ws.readyState === 1 && strokePoints.length) {
      ws.send(JSON.stringify({ strokeEnd: true, color: currentColor, width: currentWidth, points: strokePoints }));
      history.push({ name: myName, color: currentColor, width: currentWidth, points: strokePoints, ts: Date.now() });
    }
    strokeId = null; strokePoints = [];
  }

  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointerDown(e.clientX, e.clientY); });
  canvas.addEventListener('pointermove', (e) => pointerMove(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/room/")) {
      const roomName = url.pathname.split("/")[2] || "default";
      const id = env.BOARD.idFromName(roomName);
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
