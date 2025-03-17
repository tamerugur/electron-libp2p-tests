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
import { fromString } from "uint8arrays";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";

var connectedPeers = new Map();
let libp2pNode = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const mainWindow = new BrowserWindow({
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
  const serverMultiaddrs = server.getMultiaddrs().map((ma) => ma.toString());

  try {
    const url = await ngrok.connect({ proto: "http", addr: 51357 });
    const ngrokAddr =
      url.replace("https://", "/dns4/").replace("http://", "/dns4/") +
      "/tcp/443/wss";
    const fullAddr = `${ngrokAddr}/p2p/${server.peerId.toString()}`;

    return {
      multiaddrs: serverMultiaddrs,
      ngrokUrl: ngrokAddr,
      clientAddr: fullAddr,
    };
  } catch (err) {
    console.error("Error in relay setup:", err);
    return { error: err.message };
  }
}
async function createNode(relayAddr) {
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
      ping: ping(),
    },
  });

  console.log("Node created, starting...");
  await libp2pNode.start();
  console.log("Node started!");

  if (relayAddr) {
    try {
      console.log(`Dialing relay: ${relayAddr}`);
      await libp2pNode.dial(multiaddr(relayAddr));
      console.log("Connected to relay!");
      console.log("Waiting for relay registration...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("Your node's multiaddrs:");
      libp2pNode.getMultiaddrs().forEach((ma) => console.log(ma.toString()));
    } catch (err) {
      console.error("Failed to connect to relay:", err);
    }
  }

  return libp2pNode.getMultiaddrs().map((ma) => ma.toString());
}

async function switchToWebRTC(peerMultiaddr) {
  try {
    console.log(`Dialing peer directly via WebRTC: ${peerMultiaddr}`);

    if (!peerMultiaddr) {
      throw new Error("Error: peerMultiaddr is undefined or null");
    }

    const ma = multiaddr(peerMultiaddr);
    if (!ma.toString().includes("/p2p/")) {
      throw new Error("Error: Invalid multiaddr format, missing /p2p/");
    }

    const peerId = ma.getPeerId();
    console.log("Extracted Peer ID:", peerId);

    // Get all peers from the peer store
    const peers = Array.from(await libp2pNode.peerStore.all());
    console.log(
      "Known peers:",
      peers.map((peer) => peer.id.toString())
    );

    // Find the peer info
    const peerInfo = peers.find((peer) => peer.id.toString() === peerId);

    if (!peerInfo) {
      console.log(`Peer ${peerId} not found in store, attempting to dial...`);
      await libp2pNode.dial(ma);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for connection
    }

    // Check if WebRTC is supported
    const connections = libp2pNode.getConnections(peerId);
    console.log("Current connections:", connections);

    if (!connections || connections.length === 0) {
      throw new Error("No connections found for peer");
    }

    const hasWebRTC = connections.some((conn) => {
      if (!conn || !conn.remotePeer) return false;

      // Safely check for WebRTC streams
      const streams = conn.streams || [];
      return streams.some((stream) => {
        return (
          stream &&
          stream.protocol &&
          typeof stream.protocol === "string" &&
          stream.protocol.includes("webrtc")
        );
      });
    });

    if (hasWebRTC) {
      console.log("WebRTC connection established!");

      // Close relay connections
      const relayConnections = connections.filter(
        (conn) =>
          conn.remoteAddr && conn.remoteAddr.toString().includes("/p2p-circuit")
      );

      for (const conn of relayConnections) {
        await conn.close();
      }

      console.log("Relay connections closed, WebRTC active!");
    } else {
      console.warn("WebRTC connection not confirmed, keeping relay active.");
    }
  } catch (err) {
    console.error("Failed to switch to WebRTC:", err);
    throw err;
  }
}

async function dialPeer(peerMultiaddr) {
  if (!libp2pNode) {
    console.error("Libp2p node not initialized.");
    return { error: "Node not initialized" };
  }
  try {
    await libp2pNode.dial(multiaddr(peerMultiaddr));
    console.log("Connection established to the peer!");
    return { success: true };
  } catch (err) {
    console.error("Failed to dial peer:", err);
    return { error: err.message };
  }
}
