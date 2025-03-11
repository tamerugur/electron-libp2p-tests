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
    if (!libp2pNode) {
      console.error("Libp2p node not initialized.");
      return { error: "Node not initialized" };
    }
    try {
      await libp2pNode.dial(multiaddr(peerMultiaddr));
      console.log(`Successfully connected to peer: ${peerMultiaddr}`);
      return { success: true };
    } catch (err) {
      console.error("Error dialing peer:", err);
      return { error: err.message };
    }
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
      listen: ["/ip4/0.0.0.0/tcp/51357/ws"],
    },
    transports: [webSockets(), circuitRelayTransport()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: { maxReservations: Infinity },
        hop: { enabled: true },
      }),
    },
  });

  const multiaddrs = server.getMultiaddrs().map((ma) => ma.toString());
  console.log("Listening multiaddrs:", multiaddrs);

  try {
    const url = await ngrok.connect({ proto: "http", addr: 51357 });
    console.log(`Ngrok is running at ${url}`);

    return {
      multiaddrs: multiaddrs,
      ngrokUrl:
        url.replace("https://", "/dns4/").replace("http://", "/dns4/") +
        "/tcp/443/wss",
    };
  } catch (err) {
    console.error("Error starting Ngrok:", err);
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
    await libp2pNode.dial(multiaddr(peerMultiaddr));
    console.log("WebRTC connection established!");

    console.log("Shutting down relay...");
    await libp2pNode.hangUp(multiaddr(peerMultiaddr)); // Disconnect relay
    console.log("Relay shut down, WebRTC active!");
  } catch (err) {
    console.error("Failed to switch to WebRTC:", err);
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
