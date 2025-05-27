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
const VOICE_PROTOCOL = "/libp2p/examples/voice/1.0.0";
let username;
let ma;
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;
const voiceStreams = new Map();

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
  ipcMain.handle("send-voice-chunk", async (_, chunk) => {
  if (!ma) return { error: "No peer connection available" };
  const peerId = ma.getPeerId();
  const stream = voiceStreams.get(peerId);

  if (!stream) {
    console.error("No active voice stream found for peer", peerId);
    return { error: "No active voice stream." };
  }
  if (stream.source?.ended) {
    console.error("Voice stream already ended for peer", peerId);
    return { error: "Voice stream already ended." };
  }

  try {
    await stream.write(chunk);
    return { success: true };
  } catch (err) {
    console.error("Failed to send voice chunk:", err);
    return { error: err.message };
  }
});


  ipcMain.handle("terminate-voice-call", async () => {
    const peerId = ma?.getPeerId();
    if (peerId && voiceStreams.has(peerId)) {
      try {
        const stream = voiceStreams.get(peerId);
        await stream.close?.();
        voiceStreams.delete(peerId);
        console.log("Voice stream terminated.");
      } catch (err) {
        console.error("Error closing voice stream:", err);
      }
    }

    return { success: true };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function isPublicMultiaddr(addr) {
  const s = addr.toString();
  return (
    s.includes("/dns4/") ||
    s.includes("/dns6/") ||
    s.includes("/webrtc") ||
    (s.includes("/ip4/") &&
      !s.includes("/ip4/192.") &&
      !s.includes("/ip4/172.") &&
      !s.includes("/ip4/10."))
  );
}

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

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("incoming-voice-call", {
            peerId: connection.remotePeer.toString(),
            streamId: connection.remotePeer.toString(),
          });
        }
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
        if (parsed.type === "webrtc-addr" && parsed.multiaddr) {
          console.log("Received WebRTC multiaddr:", parsed.multiaddr);
          const addr = multiaddr(parsed.multiaddr);
          await libp2pNode.dial(addr);
          return;
        } else {
          console.log(`[${parsed.time}] ${parsed.username}: ${parsed.message}`);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("message-received", {
            username: parsed.username,
            time: parsed.time,
            message: parsed.message,
            isCurrentUser: parsed.username === username,
          });
        }
      } catch (err) {
        if (
          rawMessage.startsWith("/ip4/") ||
          rawMessage.startsWith("/dns4/") ||
          rawMessage.startsWith("/webrtc/")
        ) {
          console.log("Received raw multiaddr for WebRTC:", rawMessage);

          try {
            const addr = multiaddr(rawMessage);
            console.log("Attempting direct WebRTC dial...");
            await libp2pNode.dial(addr);
            console.log("Direct WebRTC connection established!");
          } catch (dialErr) {
            console.error("Failed to dial WebRTC address:", dialErr);
          }
        } else {
          console.error("Failed to parse message:", rawMessage, err);
        }
      }
    }
  });

  libp2pNode.handle(VOICE_PROTOCOL, async ({ stream, connection }) => {
    const peerId = connection.remotePeer.toString();
    const voiceStream = byteStream(stream);
    voiceStreams.set(peerId, voiceStream);
    console.log("Incoming voice stream from", connection.remotePeer.toString());

    while (true) {
      const chunk = await voiceStream.read();
      if (!chunk) break;

      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("Forwarding audio chunk to renderer. Bytes:", chunk.length);
        mainWindow.webContents.send("voice-chunk-received", {
          peerId,
          chunk: chunk.subarray(),
        });

        mainWindow.webContents.send("voice-chunk-received", {
          peerId: connection.remotePeer.toString(),
          chunk: chunk.subarray(), // Send Uint8Array to renderer
        });
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

      // send our WebRTC address back to peer over CHAT_PROTOCOL
      try {
        const stream = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL);
        const chatStream = byteStream(stream);
        const selfAddr = libp2pNode
          .getMultiaddrs()
          .find((a) => a.toString().includes("/p2p/"));

        if (selfAddr) {
          await chatStream.write(
            fromString(
              JSON.stringify({
                type: "webrtc-addr",
                multiaddr: selfAddr.toString(),
              })
            )
          );
          console.log(
            "Sent our WebRTC multiaddr to peer:",
            selfAddr.toString()
          );
        }
      } catch (sendErr) {
        console.error("Failed to send our WebRTC multiaddr to peer:", sendErr);
      }

      try {
        const voiceStream = await libp2pNode.dialProtocol(ma, VOICE_PROTOCOL);
        voiceStreams.set(peerId, byteStream(voiceStream));
        console.log("Outgoing voice stream established and saved.");
      } catch (err) {
        console.error("Failed to open voice stream:", err);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("voice-call-initiated", {
          peerAddr: webrtcMultiaddr,
          streamId: peerId,
        });
      }
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
      const peerMultiaddr = libp2pNode.getMultiaddrs().find((addr) => {
        const s = addr.toString();
        return s.includes("/p2p/") && isPublicMultiaddr(addr);
      });

      if (peerMultiaddr) {
        const peerMaString = peerMultiaddr.toString();
        console.log("Sending my PUBLIC multiaddr to the peer:", peerMaString);

        await chatStream.write(
          fromString(
            JSON.stringify({
              type: "webrtc-addr",
              multiaddr: peerMaString,
            })
          )
        );
      } else {
        console.warn("No public multiaddr found to send to peer.");
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
