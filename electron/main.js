import { app, BrowserWindow, screen, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { createLibp2p } from "libp2p";
import { webRTC, webRTCDirect } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import localtunnel from "localtunnel";
import { multiaddr, protocols } from "@multiformats/multiaddr";
import { ping } from "@libp2p/ping";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

  ipcMain.handle("register-peer", (_, peerId, multiaddr) => {
    connectedPeers.set(peerId, multiaddr);
    console.log(`Peer registered: ${peerId} -> ${multiaddr}`);
    return { success: true };
  });

  ipcMain.handle("get-peers", () => {
    return Array.from(connectedPeers.entries());
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function startRelay() {
  // Create the libp2p node
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

  // Get multiaddresses for the server
  const multiaddrs = server.getMultiaddrs().map((ma) => ma.toString());
  console.log("Listening multiaddrs:", multiaddrs);
  try {
    const tunnel = await localtunnel({ port: 51357 });
    console.log(`Localtunnel is running at ${tunnel.url}`);

    // Return multiaddrs, tunnelUrl, and listeningAddresses
    return {
      multiaddrs: multiaddrs,
      tunnelUrl: tunnel.url,
    };
  } catch (err) {
    console.error("Error starting Localtunnel:", err);
  }
}

const WEBRTC_CODE = protocols("webrtc").code;

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
      ,
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

      // Register the peer in the connectedPeers map
      const peerId = libp2pNode.peerId.toString();
      const multiaddrs = libp2pNode.getMultiaddrs().map((ma) => ma.toString());

      connectedPeers.set(peerId, multiaddrs);
      console.log(`Registered peer: ${peerId} -> ${multiaddrs}`);
    } catch (err) {
      console.error("Failed to connect to relay:", err);
    }
  } else {
    console.warn("No relay address provided, WebRTC connections may not work.");
  }

  // Wait to ensure multiaddrs populate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Checking multiaddrs...");
  const multiaddrs = libp2pNode
    .getMultiaddrs()
    .filter((ma) => ma.toString().includes("p2p-circuit"));
  console.log("All multiaddrs:", multiaddrs);
  return multiaddrs.map((ma) => ma.toString());
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
