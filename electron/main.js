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
let ma;
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;

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
    transports: [webSockets(), webRTC(), circuitRelayTransport()],
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

      try {
        const parsed = JSON.parse(rawMessage);
        console.log(`[${parsed.time}] ${parsed.username}: ${parsed.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("message-received", {
            username: parsed.username,
            time: parsed.time,
            message: parsed.message,
            isCurrentUser: parsed.username === username,
          });
        }
      } catch (err) {
        console.error("Failed to parse message:", rawMessage, err);
      }
    }
  });

  libp2pNode.addEventListener("connection:open", (event) => {
    updateConnList();
  });

  libp2pNode.addEventListener("connection:close", (event) => {
    updateConnList();
  });

  if (relayAddr) {
    try {
      console.log(`Dialing relay: ${relayAddr}`);
      await libp2pNode.dial(multiaddr(relayAddr));
      console.log("Connected to relay!");
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

async function switchToWebRTC(peerMultiaddr) {
  try {
    console.log(`Dialing peer directly via WebRTC: ${peerMultiaddr}`);

    if (!peerMultiaddr) {
      throw new Error("Error: peerMultiaddr is undefined or null");
    }

    ma = multiaddr(peerMultiaddr);
    if (!ma.toString().includes("/p2p/")) {
      throw new Error("Error: Invalid multiaddr format, missing /p2p/");
    }

    const peerId = ma.getPeerId();
    console.log("Extracted Peer ID:", peerId);

    const peers = Array.from(await libp2pNode.peerStore.all());
    const peerInfo = peers.find((peer) => peer.id.toString() === peerId);

    if (!peerInfo) {
      console.log(`Peer ${peerId} not found in store, attempting to dial...`);
      await libp2pNode.dial(ma);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const connections = libp2pNode.getConnections(peerId);
    if (!connections || connections.length === 0) {
      throw new Error("No connections found for peer");
    }

    const hasWebRTC = connections.some((conn) => {
      if (!conn || !conn.remotePeer) return false;
      const streams = conn.streams || [];
      return streams.some((stream) => {
        return (
          stream &&
          stream.protocol &&
          typeof stream.protocol === "string" &&
          stream.protocol.includes(CHAT_PROTOCOL)
        );
      });
    });

    if (hasWebRTC) {
      console.log("WebRTC connection established!");
      const relayConnections = connections.filter(
        (conn) =>
          conn.remoteAddr && conn.remoteAddr.toString().includes("/p2p-circuit")
      );

      for (const conn of relayConnections) {
        await conn.close();
      }

      console.log("Relay connections closed, WebRTC active!");
      const webrtcMultiaddr = `/p2p/${peerId}/webrtc`;
      console.log("Sharing WebRTC multiaddr:", webrtcMultiaddr);
      sendWebRTCAddrToPeer(peerId, webrtcMultiaddr);
    } else {
      console.warn("WebRTC connection not confirmed, keeping relay active.");
    }
  } catch (err) {
    console.error("Failed to switch to WebRTC:", err);
    throw err;
  }
}

async function dialPeer(peerAddr) {
  try {
    console.log(`Dialing peer: ${peerAddr}`);
    ma = multiaddr(peerAddr);
    const signal = AbortSignal.timeout(50000);

    try {
      const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
        signal,
      });
      const chatStream = byteStream(stream);

      // Only send our multiaddr without setting up a reader
      const peerMultiaddr = libp2pNode
        .getMultiaddrs()
        .find((addr) => addr.toString().includes("/p2p/"));
      if (peerMultiaddr) {
        const peerMaString = peerMultiaddr.toString();
        console.log("Sending my multiaddr to the peer:", peerMaString);
        await chatStream.write(fromString(peerMaString));
      }
    } catch (err) {
      if (signal.aborted) {
        console.error(
          "Request was aborted:",
          signal.reason || "Unknown reason"
        );
      } else {
        console.error(`Opening chat stream failed - ${err.message}`);
      }
      return { error: err.message };
    }
  } catch (error) {
    console.error("Failed to dial peer:", error);
    return { error: error.message };
  }
}

async function sendMessage(message) {
  try {
    const currentTime = new Date().toLocaleTimeString();
    const formattedMessage = JSON.stringify({
      username: username || "Anonymous",
      time: currentTime,
      message: message,
    });

    // Immediately show sent message in UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("message-received", {
        username: username || "Anonymous",
        time: currentTime,
        message: message,
        isCurrentUser: true,
      });
    }

    // Send message over the network
    const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
      signal: AbortSignal.timeout(50000),
    });
    const chatStream = byteStream(stream);

    await chatStream.write(fromString(formattedMessage));

    return { success: true };
  } catch (error) {
    console.error("Failed to send message:", error);
    return {
      error: error.message,
      details: {
        multiaddr: ma?.toString(),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
