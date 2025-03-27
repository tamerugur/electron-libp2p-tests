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

const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";
const signal = AbortSignal.timeout(5000);
let chatStream;
let ma;
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;

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
  // const serverMultiaddrs = server.getMultiaddrs().map((ma) => ma.toString());

  try {
    const url = await ngrok.connect({ proto: "http", addr: 51357 });
    const ngrokAddr =
      url.replace("https://", "/dns4/").replace("http://", "/dns4/") +
      "/tcp/443/wss";

    return {
      // multiaddrs: serverMultiaddrs,
      ngrokUrl: ngrokAddr,
    };
  } catch (err) {
    console.error("Error in relay setup:", err);
    return { error: err.message };
  }
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
      // Check if the connection has the WebRTC protocol
      if (connection.remoteAddr.protoCodes().includes(WEBRTC_CODE)) {
        // 0x0014 is WebRTC's protocol code
        const ma = connection.remoteAddr;
        console.log("WebRTC connection:", ma.toString());
      } else {
        console.log("Connection:", connection.remoteAddr.toString());
      }
    });
  }

  libp2pNode.handle(CHAT_PROTOCOL, async ({ stream }) => {
    const chatStream = byteStream(stream);

    while (true) {
      const buf = await chatStream.read();
      console.log(`Received message '${toString(buf.subarray())}'`);
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
      console.log("Waiting for relay registration...");
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
      // libp2pNode.getMultiaddrs().forEach((ma) => console.log(ma.toString()));
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
      console.log("Checking connection:");
      console.log("ID:", conn.id);
      console.log("Remote Address:", conn.remoteAddr.toString());
      console.log("Remote Peer:", conn.remotePeer.toString());
      console.log("Status:", conn.status);
      console.log("RTT:", conn.rtt);
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

async function dialPeer(peerAddr) {
  try {
    console.log(`Dialing peer: ${peerAddr}`);
    const ma = multiaddr(peerAddr);
    const signal = AbortSignal.timeout(5000);

    let chatStream = null;

    try {
      const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
        signal,
      });
      chatStream = byteStream(stream);

      // Handle incoming messages
      (async () => {
        try {
          while (true) {
            const buf = await chatStream.read();
            if (!buf || buf.length === 0) {
              // End of stream or empty message
              break;
            }
            console.log(`Received message: '${toString(buf.subarray())}'`);
          }
        } catch (err) {
          if (err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
            console.error("Error reading from stream:", err);
          }
        }
      })();

      // Send "Hello World" message
      const message = "Hello World";
      await chatStream.write(fromString(message));
    } catch (err) {
      if (signal.aborted) {
        console.error("Timed out opening chat stream");
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
