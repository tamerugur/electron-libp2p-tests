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
import { multiaddr, protocols } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
import { byteStream } from "it-byte-stream";
import { fromString, toString } from "uint8arrays";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";
let username;
let ma;
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;

// ICE configuration for both relay and direct WebRTC
const RTC_CONFIGURATION = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ],
};

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
  if (process.platform !== "darwin") app.quit();
});

async function startRelay() {
  const server = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/51357/ws", "/webrtc", "/p2p-circuit/webrtc"],
    },
    transports: [
      webSockets(),
      webRTC({ rtcConfiguration: RTC_CONFIGURATION }),
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
  return { relayUrl: relayDomain };
}

// Corrected: send WebRTC offer, avoid self-dial and handle limited connections
async function sendWebRTCAddrToPeer(connOrPeer, webrtcAddr) {
  try {
    // Determine the target for dialing (PeerId or Multiaddr)
    let target = connOrPeer;
    let targetPeerId = null;

    if (connOrPeer && connOrPeer.remotePeer) {
      // Passed a Connection instance
      targetPeerId = connOrPeer.remotePeer;
      target = targetPeerId;
      console.log("Sending WebRTC address to peer:", targetPeerId.toString());
    } else if (typeof connOrPeer === "string") {
      // Passed a multiaddr string
      target = connOrPeer;
      console.log("Sending WebRTC address to multiaddr:", target);
    } else if (connOrPeer && connOrPeer.toString) {
      // Possibly a Multiaddr object
      target = connOrPeer;
      console.log("Sending WebRTC address to multiaddr:", target.toString());
    }

    // Skip sending to ourselves
    const selfId = libp2pNode.peerId.toString();
    if (targetPeerId && targetPeerId.toString() === selfId) {
      console.log("sendWebRTCAddrToPeer: target is self, skipping");
      return;
    }

    // Open a protocol stream, allowing relay (limited) connections
    const stream = await libp2pNode.dialProtocol(target, CHAT_PROTOCOL, {
      runOnLimitedConnection: true,
    });

    const ws = byteStream(stream);
    await ws.write(
      fromString(JSON.stringify({ type: "webrtc-offer", addr: webrtcAddr }))
    );
  } catch (err) {
    console.error("sendWebRTCAddrToPeer failed:", err);
  }
}

async function createNode(relayAddr) {
  libp2pNode = await createLibp2p({
    addresses: {
      listen: [
        "/p2p-circuit",
        "/webrtc",
        "/p2p-circuit/webrtc",
        "/ip4/0.0.0.0/tcp/0/ws",
      ],
    },
    transports: [
      webSockets(),
      webRTC({ rtcConfiguration: RTC_CONFIGURATION }),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
    },
  });

  await libp2pNode.start();
  console.log("Node created with PeerID:", libp2pNode.peerId.toString());

  function updateConnList() {
    libp2pNode.getConnections().forEach((c) => {
      const addr = c.remoteAddr.toString();
      if (c.remoteAddr.protoCodes().includes(WEBRTC_CODE)) {
        ma = c.remoteAddr;
        console.log("WebRTC conn:", addr);
      }
    });
  }

  libp2pNode.handle(CHAT_PROTOCOL, async ({ stream }) => {
    const chat = byteStream(stream);
    while (true) {
      const buf = await chat.read();
      const msg = JSON.parse(toString(buf.subarray()));
      if (msg.type === "webrtc-offer") {
        console.log("📥 Received peerMultiaddr for WebRTC:", msg.addr);
        try {
          await switchToWebRTC(msg.addr);
        } catch (e) {
          console.error("Error switching to WebRTC:", e);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("error", {
              message: "Failed to switch to WebRTC",
              details: e.message,
            });
          }
        }
      } else {
        console.log(`[${msg.time}] ${msg.username}: ${msg.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("message-received", {
            ...msg,
            isCurrentUser: msg.username === username,
          });
        }
      }
    }
  });

  libp2pNode.addEventListener("connection:open", (evt) => {
    const c = evt.detail;
    updateConnList();
    if (c && c.remoteAddr.toString().includes("/p2p-circuit/")) {
      const myAddr = libp2pNode
        .getMultiaddrs()
        .find(
          (a) =>
            a.toString().includes("/webrtc/") && a.toString().includes("/p2p/")
        );
      if (myAddr) sendWebRTCAddrToPeer(c, myAddr.toString());
    }
  });

  libp2pNode.addEventListener("connection:close", updateConnList);

  let relayMultiaddr;
  if (relayAddr) {
    await libp2pNode.dial(multiaddr(relayAddr));
    await new Promise((r) => setTimeout(r, 10000));
    libp2pNode.getMultiaddrs().forEach((a) => {
      const s = a.toString();
      if (s.startsWith("/dns4/") && s.includes("/webrtc/")) relayMultiaddr = s;
    });
  }
  return { relayMultiaddr };
}

async function switchToWebRTC(peerMultiaddr) {
  console.log("Switching to WebRTC:", peerMultiaddr);
  if (!peerMultiaddr) throw new Error("peerMultiaddr undefined");

  const m = multiaddr(peerMultiaddr);
  const peerId = m.getPeerId();
  console.log("Attempting to connect to PeerID:", peerId);
  console.log("My PeerID:", libp2pNode.peerId.toString());

  await libp2pNode.dial(m);
  await new Promise((r) => setTimeout(r, 2000));

  const conns = libp2pNode.getConnections(peerId);
  conns
    .filter((c) => c.remoteAddr.toString().includes("/p2p-circuit/"))
    .forEach((c) => c.close());

  console.log("Direct WebRTC now active with peer:", peerId.toString());
  const direct = conns.find((c) =>
    c.remoteAddr.toString().includes("/webrtc/")
  );
  if (direct) {
    const mywebrtcAddr = direct.remoteAddr.toString();
    sendWebRTCAddrToPeer(direct, mywebrtcAddr);
  }
}

async function dialPeer(peerAddr) {
  try {
    const m = multiaddr(peerAddr);
    await libp2pNode.dialProtocol(m, CHAT_PROTOCOL, {
      runOnLimitedConnection: true,
    });
  } catch (e) {
    console.error("dialPeer failed:", e);
    return { error: e.message };
  }
}

async function sendMessage(message) {
  try {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const payload = JSON.stringify({
      username: username || "Anonymous",
      time,
      message,
    });
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("message-received", {
        username,
        time,
        message,
        isCurrentUser: true,
      });
    const s = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
      runOnLimitedConnection: true,
    });
    const chat = byteStream(s);
    await chat.write(fromString(payload));
    return { success: true };
  } catch (e) {
    console.error("sendMessage failed:", e);
    return {
      error: e.message,
      details: {
        multiaddr: ma?.toString(),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
