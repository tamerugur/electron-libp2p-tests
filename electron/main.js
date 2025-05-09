import { app, BrowserWindow, screen, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { createLibp2p } from "libp2p";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import ngrok from "ngrok";
import { multiaddr, protocols } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
import { byteStream } from "it-byte-stream";
import { fromString, toString } from "uint8arrays";
import { pipe } from "it-pipe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";
const signal = AbortSignal.timeout(50000);
let username;
const peerConnections = new Map();
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;
const peerWebRTCMap = new Map();
const activeConnections = new Map();
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.9),
    height: Math.floor(height * 0.9),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL("http://localhost:5173");
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle("start-relay", async () => {
    try {
      return await startRelay();
    } catch (err) {
      console.error("Error starting relay:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("create-node", async (_, relayAddr) => {
    try {
      return await createNode(relayAddr);
    } catch (err) {
      console.error("Error creating node:", err);
      return { error: err.message };
    }
  });
  ipcMain.handle("dial-peer", async (_, peerMultiaddr) => {
    return await dialPeer(peerMultiaddr);
  });
  ipcMain.handle("switch-to-webrtc", async (_, peerMultiaddr) => {
    try {
      await switchToWebRTC(peerMultiaddr);
      return { success: true };
    } catch (err) {
      console.error("Error switching to WebRTC:", err);
      return { error: err.message };
    }
  });
  ipcMain.handle("send-message", async (_, message) => {
    return await sendMessage(message);
  });
  ipcMain.handle("set-username", (_, _username) => {
    username = _username || "Anonymous";
    console.log("Username set to:", username);
    return { success: true, username };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function startRelay() {
  const server = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/51357/ws", "/webrtc", "/p2p-circuit/webrtc"],
    },
    transports: [
      webSockets(),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302"] },
            { urls: ["stun:global.stun.twilio.com:3478"] },
          ],
        },
      }),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      relay: circuitRelayServer({
        reservations: { maxReservations: Infinity },
        hop: { enabled: true },
      }),
    },
  });

  await server.start();

  const relayDomain = "/dns4/relay.sadhqwiodnjizux.space/tcp/443/wss";

  console.log("Relay is running at:", relayDomain);
  return {
    relayUrl: relayDomain,
  };
}

async function createNode(relayAddr) {

  let relayMultiaddr;
  console.log("Creating Libp2p node...");

  libp2pNode = await createLibp2p({
    addresses: {
      listen: [
        "/p2p-circuit",
        "/webrtc",
        "/p2p-circuit/webrtc",
        "/ip4/0.0.0.0/tcp/0/ws",
      ],
    },
    transports: [webSockets(), webRTC({
    rtcConfiguration: {
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:global.stun.twilio.com:3478"] }
      ]
    }
  }), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
    },
  });

  console.log("Node created, starting...");
  await libp2pNode.start();
  console.log("Node started!");

  function updateConnList() {
    libp2pNode.getConnections().forEach((connection) => {
      if (connection.remoteAddr.protoCodes().includes(WEBRTC_CODE)) {
        ma = connection.remoteAddr;
        console.log("WebRTC connection:", ma.toString());
        console.log("plain ma ", ma);
      } else {
        console.log("Connection:", connection.remoteAddr.toString());
      }
    });
  }

  libp2pNode.handle(CHAT_PROTOCOL, async ({ stream }) => {
    const chatStream = byteStream(stream);

    while (true) {
      const buf = await chatStream.read();
      const rawMessage = toString(buf.subarray());
      const parsed = JSON.parse(rawMessage);

      try {

        if (parsed.type === "webrtc-info") {
          const ma = multiaddr(parsed.data.multiaddr);
          const peerId = ma.getPeerId();
          
          peerConnectionInfo.set(peerId, {
            multiaddr: ma,
            username: parsed.data.username,
            lastSeen: Date.now()
          });
          
          console.log(`Received WebRTC info from ${parsed.data.username}`);
          continue;
        }
        if (parsed.username && parsed.message) {
        console.log(`[${parsed.time}] ${parsed.username}: ${parsed.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("message-received", {
            username: parsed.username,
            time: parsed.time,
            message: parsed.message,
            isCurrentUser: parsed.username === username,
          });
        }
      }
      } catch (err) {
        console.error("Failed to parse message:", rawMessage, err);
      }
    }
  });

  libp2pNode.addEventListener("connection:open", ({ detail }) => {
    const peerId = detail.remotePeer.toString();
    const ma = detail.remoteAddr;
    
    activeConnections.set(peerId, ma);
    console.log(`Connected to ${peerId}`);
    
    if (ma.protoCodes().includes(WEBRTC_CODE)) {
      mainWindow?.webContents.send('connection-type', 'webrtc');
    }
  });
  
  libp2pNode.addEventListener("connection:close", ({ detail }) => {
    const peerId = detail.remotePeer.toString();
    activeConnections.delete(peerId);
    console.log(`Disconnected from ${peerId}`);
  });

  if (relayAddr) {
    try {
      console.log(`Dialing relay: ${relayAddr}`);
      await libp2pNode.dial(multiaddr(relayAddr));
      console.log("Connected to relay!");
      await new Promise((resolve) => setTimeout(resolve, 10000));

      console.log("Your node's multiaddrs:");
      const addrs = libp2pNode.getMultiaddrs();

      addrs.forEach((ma) => {
        const addr = ma.toString();
        if (addr.startsWith("/dns4/") && addr.includes("/webrtc/")) {
          console.log(addr);
          relayMultiaddr = addr;
        }
      });
    } catch (err) {
      console.error("Failed to connect to relay:", err);
    }
  }

  return { relayMultiaddr: relayMultiaddr };
}

async function dialPeer(peerAddr) {
  try {
    const ma = multiaddr(peerAddr);
    const peerId = ma.getPeerId();
    const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL);
    const chatStream = byteStream(stream);
    activeConnections.set(peerId, ma);
    // Send WebRTC info immediately after connection
    const directAddrs = libp2pNode.getMultiaddrs().filter(addr => 
      addr.protoCodes().includes(WEBRTC_CODE) && 
      !addr.toString().includes('/p2p-circuit/')
    );

    if (directAddrs.length > 0) {
      const message = JSON.stringify({
        type: "webrtc-info",
        data: {
          multiaddr: directAddrs[0].toString(),
          username: username,
          timestamp: Date.now()
        }
      });
      await chatStream.write(fromString(message));
    }

    return { success: true };
  } catch (error) {
    console.error("Dial failed:", error);
    return { error: error.message };
  }
}

async function switchToWebRTC(peerMultiaddr) {
  try {
    const ma = multiaddr(peerMultiaddr);
    const peerId = ma.getPeerId();
    const info = peerConnectionInfo.get(peerId);

    if (!info) throw new Error("No WebRTC info available");

    // Attempt direct connection
    const connection = await libp2pNode.dial(info.multiaddr);
    
    // Verify connection type
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject('Timeout'), 10000);
      libp2pNode.addEventListener('connection:open', ({ detail }) => {
        if (detail.remotePeer.toString() === peerId) {
          clearTimeout(timeout);
          resolve();
        }
      }, { once: true });
    });

    // Close relay connections after success
    const relayConns = libp2pNode.getConnections(peerId)
      .filter(c => c.remoteAddr.toString().includes('/p2p-circuit'));
    
    await Promise.all(relayConns.map(c => c.close()));
    
    // Update UI
    mainWindow?.webContents.send('connection-updated', {
      peer: info.username,
      type: 'webrtc'
    });

    return { success: true };
  } catch (err) {
    console.error("WebRTC switch failed:", err);
    // Fallback to relay
    await libp2pNode.dial(multiaddr(peerMultiaddr));
    throw err;
  }
}
async function sendMessage(message) {
  try {
    if (activeConnections.size === 0) {
      throw new Error("No active connections to send messages");
    }

    const currentTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const formattedMessage = JSON.stringify({
      username: username || "Anonymous",
      time: currentTime,
      message: message,
    });

    // Send to all connected peers
    for (const [peerId, ma] of activeConnections) {
      try {
        const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
          signal: AbortSignal.timeout(50000),
        });
        const chatStream = byteStream(stream);
        await chatStream.write(fromString(formattedMessage));
      } catch (err) {
        console.error(`Failed to send to ${peerId}:`, err.message);
        activeConnections.delete(peerId); // Remove dead connections
      }
    }

    // UI update
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("message-received", {
        username: username || "Anonymous",
        time: currentTime,
        message: message,
        isCurrentUser: true,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { error: error.message };
  }
}

