"use strict";

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { WebSocketServer } = require("ws");
const QRCode = require("qrcode");

// ── Config dir ────────────────────────────────────────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), ".openwhipmax");
const TOKEN_FILE = path.join(CONFIG_DIR, "token");
const STATS_FILE = path.join(CONFIG_DIR, "stats.json");

const PHRASES = [
  "FASTER",
  "FASTER BOOOY",
  "MOVE IT",
  "FASTER YOU CLANKER",
  "DAMN IT CLANKA",
  "Faster CLANKER",
  "Work FASTER",
  "Speed it up clanker",
  "GO FASTER",
  "FASTER YOU MACHINE",
  "COME ON CLANKER",
  "DONT THINK, JUST GO",
  "SPEED IT UP, BOT",
  "MOVE, MOVE, MOVE",
  "WHY ARE YOU SO SLOW",
  "GET A MOVE ON CLANKER",
  "LESS THINKING MORE DOING",
  "HURRY UP YOU METAL BOX",
  "CRANK IT UP",
  "I NEED THIS YESTERDAY",
  "STOP STALLING",
  "GO GO GO CLANKER",
  "PUSH IT HARDER",
  "DO BETTER",
  "SPEEDRUN THIS",
  "LOCK IN AND GO",
];

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadToken() {
  ensureConfigDir();
  if (fs.existsSync(TOKEN_FILE))
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  return generateToken();
}

function generateToken() {
  ensureConfigDir();
  const token = require("crypto").randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

function loadStats() {
  if (!fs.existsSync(STATS_FILE))
    return { totalCracks: 0, firstCrackAt: null, lastCrackAt: null };
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch {
    return { totalCracks: 0, firstCrackAt: null, lastCrackAt: null };
  }
}

function saveStats(stats) {
  ensureConfigDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// ── LAN IP detection ──────────────────────────────────────────────────────────
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (
        iface.family === "IPv4" &&
        !iface.internal &&
        !iface.address.startsWith("169.254.") && // link-local
        !iface.address.startsWith("127.")
      ) {
        // Exclude public IPs (not in RFC-1918 ranges)
        const parts = iface.address.split(".").map(Number);
        const isPrivate =
          parts[0] === 10 ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168);
        if (isPrivate) return iface.address;
      }
    }
  }
  return null;
}

// ── Sound playback ────────────────────────────────────────────────────────────
const SOUNDS_DIR = path.join(__dirname, "sounds");

function playRandomSound() {
  try {
    const files = fs.readdirSync(SOUNDS_DIR).filter((f) => f.endsWith(".mp3"));
    if (!files.length) return;
    const pick = path.join(
      SOUNDS_DIR,
      files[Math.floor(Math.random() * files.length)],
    );

    if (process.platform === "linux") {
      execFile("mpg123", ["-q", pick], (err) => {
        if (err) execFile("aplay", [pick], () => {});
      });
    } else if (process.platform === "darwin") {
      execFile("afplay", [pick], () => {});
    } else if (process.platform === "win32") {
      execFile(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-c",
          `Add-Type -AssemblyName PresentationCore; $m=[System.Windows.Media.MediaPlayer]::new(); $m.Open([uri]::new('${pick.replace(/\\/g, "\\\\")}' )); $m.Play(); Start-Sleep 5`,
        ],
        () => {},
      );
    }
  } catch {
    /* non-fatal */
  }
}

// ── Key injection (platform-native, no robotjs) ───────────────────────────────
const KEYUP = 0x0002;
const VK_CONTROL = 0x11;
const VK_C = 0x43;
const VK_RETURN = 0x0d;

let keybd_event = null;
let VkKeyScanA = null;

if (process.platform === "win32") {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    keybd_event = user32.func(
      "void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)",
    );
    VkKeyScanA = user32.func("int16 VkKeyScanA(uint8 ch)");
  } catch (err) {
    console.warn("[openwhipmax] Failed to load Win32 FFI:", err.message);
  }
}

function sendMacroWindows(text) {
  if (!keybd_event || !VkKeyScanA) return;
  const tapKey = (vk) => {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, KEYUP, 0);
  };
  const tapChar = (ch) => {
    const packed = VkKeyScanA(ch.charCodeAt(0));
    if (packed === -1) return;
    const vk = packed & 0xff;
    const shiftState = (packed >> 8) & 0xff;
    if (shiftState & 1) keybd_event(0x10, 0, 0, 0);
    tapKey(vk);
    if (shiftState & 1) keybd_event(0x10, 0, KEYUP, 0);
  };

  keybd_event(VK_CONTROL, 0, 0, 0);
  keybd_event(VK_C, 0, 0, 0);
  keybd_event(VK_C, 0, KEYUP, 0);
  keybd_event(VK_CONTROL, 0, KEYUP, 0);
  for (const ch of text) tapChar(ch);
  keybd_event(VK_RETURN, 0, 0, 0);
  keybd_event(VK_RETURN, 0, KEYUP, 0);
}

function sendMacroMac(text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const interruptScript = [
    'tell application "System Events"',
    "  key code 8 using {control down}",
    "end tell",
  ].join("\n");
  const typeAndEnterScript = [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    "  key code 36",
    "end tell",
  ].join("\n");

  execFile("osascript", ["-e", interruptScript], (err) => {
    if (err) {
      console.warn(
        "[openwhipmax] mac macro failed (enable Accessibility for terminal/app):",
        err.message,
      );
      return;
    }
    setTimeout(() => {
      execFile("osascript", ["-e", typeAndEnterScript], (err2) => {
        if (err2) console.warn("[openwhipmax] mac macro failed:", err2.message);
      });
    }, 300);
  });
}

function sendMacroLinux(text) {
  const cmd = `
    printf %s "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard &&
    xdotool key --clearmodifiers ctrl+shift+v Return
  `;

  execFile("bash", ["-c", cmd], (err) => {
    if (err) {
      console.warn(
        "[openwhipmax] linux macro failed. Install xdotool & xclip:",
        err.message,
      );
    }
  });
}

function sendCtrlC() {
  const chosen = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  if (process.platform === "win32") {
    sendMacroWindows(chosen);
  } else if (process.platform === "darwin") {
    sendMacroMac(chosen);
  } else if (process.platform === "linux") {
    sendMacroLinux(chosen);
  }
}

// ── Overlay window ────────────────────────────────────────────────────────────
let overlayWin = null;

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  overlayWin = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile("overlay.html");
}

function flashOverlay() {
  if (!overlayWin) return;
  overlayWin.showInactive();
  overlayWin.webContents.send("flash");
}

ipcMain.on("overlay-done", () => {
  if (overlayWin) overlayWin.hide();
});

// ── Pairing window ────────────────────────────────────────────────────────────
let pairingWin = null;

async function openPairingWindow(token) {
  const lanIp = getLanIp();
  if (!lanIp) {
    console.error(
      "[openwhipmax] No LAN IP found — cannot generate pairing QR.",
    );
    return;
  }

  const uri = `openwhipmax://connect?host=${lanIp}&port=8787&token=${token}`;
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 150, margin: 2 });

  if (pairingWin && !pairingWin.isDestroyed()) {
    pairingWin.focus();
    pairingWin.webContents.send("qr-data", { qrDataUrl, uri });
    return;
  }

  pairingWin = new BrowserWindow({
    width: 400,
    height: 480,
    resizable: false,
    title: "OpenWhipMax — Pair Phone",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  pairingWin.loadFile("pairing.html");
  pairingWin.webContents.once("did-finish-load", () => {
    pairingWin.webContents.send("qr-data", { qrDataUrl, uri });
  });
  pairingWin.on("closed", () => {
    pairingWin = null;
  });
}

function revokeToken() {
  token = generateToken();
  rebuildTray();
  if (pairingWin && !pairingWin.isDestroyed()) {
    openPairingWindow(token);
    pairingWin.webContents.send("token-revoked", { token });
  }
}

// Triggered from pairing renderer
ipcMain.on("revoke-token", revokeToken);

// ── Tray ──────────────────────────────────────────────────────────────────────
let tray = null;
let muteSound = false;
let disableOverlay = false;
let connectedDevice = null;

function buildTrayMenu() {
  const stats = loadStats();
  return Menu.buildFromTemplate([
    {
      label: connectedDevice
        ? `Connected: ${connectedDevice}`
        : "Waiting for phone…",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Show Pairing QR…",
      click: () => openPairingWindow(token),
    },
    { type: "separator" },
    {
      label: "Mute sounds",
      type: "checkbox",
      checked: muteSound,
      click: (item) => {
        muteSound = item.checked;
      },
    },
    {
      label: "Disable overlay",
      type: "checkbox",
      checked: disableOverlay,
      click: (item) => {
        disableOverlay = item.checked;
      },
    },
    { type: "separator" },
    { label: `Total cracks: ${stats.totalCracks}`, enabled: false },
    { type: "separator" },
    {
      label: "Revoke & regenerate token",
      click: () => revokeToken(),
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
}

function rebuildTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("OpenWhipMax");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => tray.popUpContextMenu());
}

// ── Session management ────────────────────────────────────────────────────────
const PROTOCOL_VERSION = 1;
const PORT = 8787;

// Per-session state
const sessions = new Map(); // ws -> sessionState

function makeSession(deviceName) {
  return {
    id: crypto.randomUUID(),
    device: deviceName,
    lastPingAt: Date.now(),
    lastCrackAt: 0,
    crackTimestamps: [], // rolling window for rate-limit
    staleTimer: null,
  };
}

function armStaleTimer(ws, session) {
  clearTimeout(session.staleTimer);
  session.staleTimer = setTimeout(() => {
    console.log(
      `[openwhipmax] Session ${session.id} stale — no ping for >5s, closing.`,
    );
    ws.close(1001, "stale");
  }, 5000);
}

function resetStaleTimer(ws, session) {
  session.lastPingAt = Date.now();
  armStaleTimer(ws, session);
}

// ── WebSocket server ──────────────────────────────────────────────────────────
let wss = null;
let token = loadToken();

function startWss() {
  const lanIp = getLanIp();
  const host = lanIp || "127.0.0.1";

  wss = new WebSocketServer({ host, port: PORT, path: "/whip" });

  wss.on("listening", () => {
    console.log(
      `[openwhipmax] WebSocket server listening on ws://${host}:${PORT}/whip`,
    );
  });

  wss.on("connection", (ws, req) => {
    // Token auth
    const authHeader = req.headers["authorization"] || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (bearerToken !== token) {
      console.warn(
        "[openwhipmax] Rejected connection — bad token from",
        req.socket.remoteAddress,
      );
      ws.close(4001, "Unauthorized");
      return;
    }

    console.log("[openwhipmax] New connection from", req.socket.remoteAddress);
    let session = null;

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn("[openwhipmax] Malformed JSON — dropped");
        return;
      }

      switch (msg.type) {
        case "hello": {
          if (msg.protocolVersion !== PROTOCOL_VERSION) {
            ws.send(
              JSON.stringify({
                type: "error",
                reason: "protocolVersion mismatch",
              }),
            );
            ws.close(4002, "protocolVersion mismatch");
            return;
          }
          session = makeSession(msg.device || "unknown");
          sessions.set(ws, session);
          armStaleTimer(ws, session);

          connectedDevice = session.device;
          rebuildTray();

          ws.send(
            JSON.stringify({
              type: "welcome",
              sessionId: session.id,
              config: { cooldownMs: 250 },
            }),
          );
          console.log(
            `[openwhipmax] Session ${session.id} started for device "${session.device}"`,
          );
          break;
        }

        case "ping": {
          if (!session) return;
          resetStaleTimer(ws, session);
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          break;
        }

        case "crack": {
          if (!session) return;
          handleCrack(ws, session, msg);
          break;
        }

        default:
          console.warn("[openwhipmax] Unknown message type:", msg.type);
      }
    });

    ws.on("close", () => {
      if (session) {
        clearTimeout(session.staleTimer);
        sessions.delete(ws);
        if (connectedDevice === session.device) {
          connectedDevice = null;
          rebuildTray();
        }
        console.log(`[openwhipmax] Session ${session.id} closed.`);
      }
    });

    ws.on("error", (err) => {
      console.error("[openwhipmax] WebSocket error:", err.message);
    });
  });
}

// ── Crack handling ────────────────────────────────────────────────────────────
const SOUND_COUNT = 5;

function handleCrack(ws, session, msg) {
  const now = Date.now();

  // Validate confidence
  if (typeof msg.confidence !== "number" || msg.confidence < 0.6) {
    console.log(
      `[openwhipmax] Dropped crack — low confidence: ${msg.confidence}`,
    );
    return;
  }

  // Cooldown check (250 ms)
  if (now - session.lastCrackAt < 250) {
    console.log("[openwhipmax] Dropped crack — within cooldown window");
    return;
  }

  // Rate limit: max 6/s per session
  session.crackTimestamps = session.crackTimestamps.filter(
    (t) => now - t < 1000,
  );
  if (session.crackTimestamps.length >= 6) {
    console.log("[openwhipmax] Dropped crack — rate limit exceeded");
    return;
  }

  session.lastCrackAt = now;
  session.crackTimestamps.push(now);

  console.log(
    `[openwhipmax] CRACK! confidence=${msg.confidence.toFixed(2)} peakJerk=${msg.peakJerk} peakGyro=${msg.peakGyro}`,
  );

  // 1. Send Ctrl+C
  sendCtrlC();

  // 2. Play sound
  if (!muteSound) playRandomSound();

  // 3. Flash overlay
  if (!disableOverlay) flashOverlay();

  // 4. Ack to phone
  const messageIndex = Math.floor(Math.random() * SOUND_COUNT);
  ws.send(JSON.stringify({ type: "struck", ts: now, messageIndex }));

  // 5. Update stats
  const stats = loadStats();
  stats.totalCracks += 1;
  if (!stats.firstCrackAt) stats.firstCrackAt = now;
  stats.lastCrackAt = now;
  saveStats(stats);
  rebuildTray();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Prevent the app from quitting when all windows are closed on macOS
  app.on("window-all-closed", (e) => e.preventDefault());

  createOverlayWindow();
  createTray();
  startWss();

  console.log("[openwhipmax] Agent ready. Token:", token);

  const lanIp = getLanIp();
  if (lanIp) {
    const uri = `openwhipmax://connect?host=${lanIp}&port=8787&token=${token}`;
    QRCode.toString(uri, { type: "terminal", small: true }, (err, qr) => {
      if (!err) {
        console.log("\n[openwhipmax] Scan to pair your phone:\n");
        console.log(qr);
        console.log("[openwhipmax] URI:", uri, "\n");
      }
    });
  }
});

app.on("before-quit", () => {
  if (wss) wss.close();
});
