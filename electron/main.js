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
import { setupVoiceChatHandlers } from "./voiceChat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";
let username;
let ma;
let libp2pNode = null;
const WEBRTC_CODE = protocols("webrtc").code;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.floor(width),
    height: Math.floor(height),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL("http://localhost:5173");
  mainWindow.webContents.openDevTools(); // Open DevTools automatically
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

  ipcMain.handle("voice-chat-init", async (event) => {
    try {
      if (!libp2pNode) {
        throw new Error("Libp2p node not initialized");
      }
      return await setupVoiceChatHandlers(libp2pNode, event);
    } catch (err) {
      console.error("Error initializing voice chat:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("get-connections", async () => {
    try {
      if (!libp2pNode) {
        throw new Error("Libp2p node not initialized");
      }
      const connections = libp2pNode.getConnections();
      return connections.map((conn) => ({
        peerId: conn.remotePeer.toString(),
        type: conn.remoteAddr.protoCodes().includes(WEBRTC_CODE)
          ? "webrtc"
          : "relay",
      }));
    } catch (err) {
      console.error("Error getting connections:", err);
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
    transports: [
      webSockets(),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: "stun:global.stun.twilio.com:3478",
            },
            {
              urls: [
                "turn:global.turn.twilio.com:3478?transport=udp",
                "turn:global.turn.twilio.com:3478?transport=tcp",
              ],
              username:
                "88a4fe9eeb4026d09b3f3d32affe583b71bc89ad73ede54acc24efc46e08d503",
              credential: "5+a4RLeKZuTFw/B0q92TdCXhV3jCqUlDsCCaxDi3V7U=",
            },
            {
              urls: "turn:global.turn.twilio.com:443?transport=tcp",
              username:
                "88a4fe9eeb4026d09b3f3d32affe583b71bc89ad73ede54acc24efc46e08d503",
              credential: "5+a4RLeKZuTFw/B0q92TdCXhV3jCqUlDsCCaxDi3V7U=",
            },
          ],
          iceCandidatePoolSize: 10,
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

  // Log all addresses including WebRTC
  const addresses = libp2pNode.getMultiaddrs();
  console.log(
    "Node addresses:",
    addresses.map((addr) => addr.toString())
  );
  const webrtcAddrs = addresses.filter((addr) =>
    addr.toString().includes("/webrtc")
  );
  console.log(
    "WebRTC addresses:",
    webrtcAddrs.map((addr) => addr.toString())
  );

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
  libp2pNode.handle(CHAT_PROTOCOL, async ({ stream, connection }) => {
    const chatStream = byteStream(stream);

    try {
      while (!stream.closed) {
        try {
          const buf = await chatStream.read();
          if (!buf) break;

          const rawMessage = toString(buf.subarray());
          if (!rawMessage) continue;

          const parsed = JSON.parse(rawMessage);

          if (parsed.type === "webrtc-addr") {
            console.log("Received peer WebRTC address:", parsed.addr);
            try {
              // Get our WebRTC address (direct, not through relay)
              const webrtcAddr = libp2pNode.getMultiaddrs().find((addr) => {
                const addrStr = addr.toString();
                return (
                  addrStr.includes("/webrtc") &&
                  !addrStr.includes("/p2p-circuit")
                );
              });

              if (!webrtcAddr) {
                console.error(
                  "No direct WebRTC address available to send back"
                );
                continue;
              }

              console.log(
                "Found our direct WebRTC address:",
                webrtcAddr.toString()
              );

              // Send our address back with acknowledgment
              console.log(
                "Sending our WebRTC address back:",
                webrtcAddr.toString()
              );
              await chatStream.write(
                fromString(
                  JSON.stringify({
                    type: "webrtc-addr",
                    addr: webrtcAddr.toString(),
                    acknowledge: true,
                  })
                )
              );

              // Add a small delay to ensure both peers have exchanged addresses
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Then attempt to switch to WebRTC using the received address
              const switchResult = await switchToWebRTC(parsed.addr);

              if (switchResult.success) {
                console.log("Successfully established WebRTC connection");

                // Close the relay stream after successful WebRTC connection
                if (!stream.closed) {
                  await stream.close();
                }
                break;
              } else {
                console.log(
                  "Failed to establish WebRTC connection, keeping relay open"
                );
              }
            } catch (err) {
              console.error("Error in WebRTC address exchange:", err);
              // Don't break here - allow retries after a delay
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          } else {
            // Regular chat message handling
            console.log(
              `[${parsed.time}] ${parsed.username}: ${parsed.message}`
            );
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
          if (stream.closed) {
            console.log("Stream was closed, ending chat protocol handler");
            break;
          }
          console.error("Error processing message:", err);
        }
      }
    } catch (err) {
      console.error("Fatal error in chat protocol handler:", err);
    } finally {
      if (!stream.closed) {
        await stream.close().catch(console.error);
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

      const webrtcMultiaddr = libp2pNode.getMultiaddrs().find((addr) => {
        const addrStr = addr.toString();
        return addrStr.includes("/webrtc") && !addrStr.includes("/p2p-circuit");
      });

      if (webrtcMultiaddr) {
        console.log(
          "Found our direct WebRTC address:",
          webrtcMultiaddr.toString()
        );

        await chatStream.write(
          fromString(
            JSON.stringify({
              type: "webrtc-addr",
              addr: webrtcMultiaddr.toString(),
            })
          )
        );

        console.log("Waiting for peer's WebRTC address...");
        try {
          while (!stream.closed) {
            const response = await chatStream.read();
            if (!response) break;

            const responseMsg = toString(response.subarray());
            const parsed = JSON.parse(responseMsg);

            if (parsed.type === "webrtc-addr") {
              console.log("Received peer's WebRTC address:", parsed.addr);

              try {
                const switchResult = await switchToWebRTC(parsed.addr);
                if (!switchResult.success) {
                  console.warn(
                    "WebRTC switch returned unsuccessful status:",
                    switchResult
                  );
                }
              } catch (err) {
                console.error("WebRTC switch failed on Peer B:", err);
              }

              break;
            }
          }
        } catch (err) {
          console.error("Error waiting for peer's WebRTC address:", err);
        } finally {
          if (!stream.closed) {
            await stream.close().catch(console.error);
          }
        }
      } else {
        console.warn(
          "No direct WebRTC multiaddr found on Peer B after dialing"
        );
      }

      // Final validation log
      const connections = libp2pNode.getConnections();
      console.log("All active connections after dialing:");
      connections.forEach((conn) => {
        console.log(
          "Conn to:",
          conn.remotePeer.toString(),
          conn.remoteAddr.toString()
        );
      });
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
    if (!libp2pNode) throw new Error("Libp2p node not initialized");
    if (!ma) throw new Error("No target multiaddr set");

    // Create message payload first
    const currentTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const messageData = {
      username: username || "Anonymous",
      time: currentTime,
      message: message,
      isCurrentUser: true,
    };

    // Show message in UI immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("message-received", messageData);
    } // Get active WebRTC connection and address
    const peerId = ma.getPeerId();
    const webrtcConn = libp2pNode.getConnections(peerId)?.find((conn) => {
      const addr = conn.remoteAddr.toString();
      return addr.includes("/webrtc") && !addr.includes("/p2p-circuit");
    });

    if (!webrtcConn) {
      throw new Error("No active direct WebRTC connection to peer");
    }

    // Update the global ma to use direct WebRTC address
    ma = webrtcConn.remoteAddr;
    console.log("Using direct WebRTC address for messaging:", ma.toString());

    // Create message payload
    const payload = JSON.stringify({
      username: username || "Anonymous",
      time: currentTime,
      message: message,
      protocol: "webrtc-direct",
      timestamp: Date.now(),
    });

    // Create stream over WebRTC connection
    console.log("Opening new chat stream over WebRTC");
    const stream = await webrtcConn.newStream(CHAT_PROTOCOL);
    const chatStream = byteStream(stream);

    // Send message
    await chatStream.write(fromString(payload));

    // UI update
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("message-sent", {
        status: "delivered",
        protocol: "webrtc",
        peerId: peerId,
        timestamp: Date.now(),
      });
    }

    console.log(`Message sent via WebRTC to ${peerId}: ${message}`);
    return { success: true };
  } catch (error) {
    console.error("Message send failed:", error);
    console;

    // UI error reporting
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("message-sent", {
        status: "failed",
        error: error.message,
        protocol: "webrtc",
        timestamp: Date.now(),
      });
    }

    return {
      error: error.message,
      details: {
        peerId: ma?.getPeerId(),
        multiaddr: ma?.toString(),
        timestamp: Date.now(),
      },
    };
  }
}

async function switchToWebRTC(peerMultiaddr) {
  try {
    console.log(`Attempting WebRTC switch with: ${peerMultiaddr}`);

    if (!peerMultiaddr) {
      throw new Error("No peer multiaddr provided");
    }

    let targetMa = multiaddr(peerMultiaddr);
    console.log("Parsed WebRTC multiaddr:", targetMa.toString());

    if (!targetMa.protoCodes().includes(WEBRTC_CODE)) {
      throw new Error(
        "Not a WebRTC multiaddr. Required format: /webrtc/p2p/<peer-id>"
      );
    }

    const peerId = targetMa.getPeerId();
    if (!peerId) {
      throw new Error("Missing Peer ID in multiaddr");
    }

    let dialTarget = targetMa;
    if (targetMa.toString().includes("/p2p-circuit")) {
      dialTarget = multiaddr(`/webrtc/p2p/${peerId}`);
      console.log("Converted to direct WebRTC address:", dialTarget.toString());
    }

    const existingConnections = libp2pNode.getConnections(peerId);
    const hasDirectWebRTC = existingConnections.some((conn) => {
      const addr = conn.remoteAddr.toString();
      return addr.includes("/webrtc") && !addr.includes("/p2p-circuit");
    });

    if (!hasDirectWebRTC) {
      console.log("Dialing WebRTC directly:", dialTarget.toString());
      const signal = AbortSignal.timeout(15000);

      try {
        await libp2pNode.dial(dialTarget, { signal });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error("Direct WebRTC dial failed:", err);
        throw new Error("Failed to establish direct WebRTC connection");
      }

      const postDialConns = libp2pNode.getConnections(peerId);
      const newConn = postDialConns.find((conn) => {
        const addr = conn.remoteAddr.toString();
        return addr.includes("/webrtc") && !addr.includes("/p2p-circuit");
      });

      if (!newConn) {
        console.warn("No direct WebRTC connection appeared after dialing.");
        throw new Error("WebRTC direct connection failed to establish");
      }

      console.log(
        "New direct WebRTC connection:",
        newConn.remoteAddr.toString()
      );
    }

    const relayConns = libp2pNode
      .getConnections(peerId)
      .filter((conn) => conn.remoteAddr.toString().includes("/p2p-circuit/"));

    if (relayConns.length > 0) {
      console.log(
        `Delaying before closing ${relayConns.length} relay connections...`
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await Promise.all(relayConns.map((conn) => conn.close()));
    }

    const finalConn = libp2pNode
      .getConnections(peerId)
      .find(
        (conn) =>
          conn.remoteAddr.protoCodes().includes(WEBRTC_CODE) &&
          !conn.remoteAddr.toString().includes("/p2p-circuit")
      );

    if (!finalConn) {
      throw new Error("No valid WebRTC connection after cleanup");
    }

    ma = finalConn.remoteAddr;
    console.log("Final WebRTC connection in use:", ma.toString());

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("webrtc-status", {
        connected: true,
        peerId: peerId,
        multiaddr: ma.toString(),
      });
    }

    return {
      success: true,
      peerId: peerId,
      webrtcMultiaddr: ma.toString(),
    };
  } catch (err) {
    console.error("WebRTC switch failed:", err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("webrtc-status", {
        connected: false,
        error: err.message,
      });
    }
    throw err;
  }
}
