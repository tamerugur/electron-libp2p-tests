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
const VOICE_CHAT_PROTOCOL = "/libp2p/examples/voice/1.0.0";
let username;
let ma;
let libp2pNode = null;
let currentVoiceCallStream = null;
const WEBRTC_CODE = protocols("webrtc").code;

// Global map to store RTCPeerConnection instances
// const peerConnections = new Map();
// const LIBP2P_DATA_CHANNEL_LABEL = "libp2p-webrtc"; // REMOVING

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
      // Ensure libp2pNode is reset on failure to allow retry
      if (libp2pNode) {
        await libp2pNode
          .stop()
          .catch((e) =>
            console.error("Error stopping libp2p node on create failure:", e)
          );
      }
      libp2pNode = null;
      // peerConnections.clear(); // REMOVING - No longer using peerConnections map
      return { error: err.message };
    }
  });

  ipcMain.handle("dial-peer", async (_, peerMultiaddr) => {
    return await dialPeer(peerMultiaddr);
  });

  ipcMain.handle("switch-to-webrtc", async (_, peerMultiaddr) => {
    // This handler is part of the old multiaddr-exchange flow.
    // With the new manual SDP/ICE signaling, this specific IPC call might become obsolete
    // or would need to be re-purposed if client-side initiation of WebRTC handshake is still desired via a button.
    // For now, we'll log that it's been called but the new flow is proactive.
    console.warn(
      "IPC 'switch-to-webrtc' called. New WebRTC handshake is proactive via relay connection."
    );
    // try {
    //   await switchToWebRTC(peerMultiaddr); // switchToWebRTC function will be removed
    //   return { success: true };
    // } catch (err) {
    //   console.error("Error switching to WebRTC (old flow):", err);
    //   return { error: err.message };
    // }
    return {
      info: "WebRTC handshake is now proactive based on relay connections.",
    };
  });

  ipcMain.handle("send-message", async (_, message) => {
    return await sendMessage(message);
  });

  ipcMain.handle("set-username", (_, _username) => {
    username = _username || "Anonymous";
    console.log("Username set to:", username);
    return { success: true, username };
  });

  // New IPC Handlers for Voice Chat
  ipcMain.handle("initiate-voice-call", async (_, peerAddrStr) => {
    if (!libp2pNode) return { error: "Libp2p node not initialized." };
    if (!ma && !peerAddrStr)
      return {
        error: "No peer address provided and no default peer (ma) set.",
      };

    const targetAddr = peerAddrStr ? multiaddr(peerAddrStr) : ma;
    if (!targetAddr) return { error: "Invalid peer address." };

    try {
      if (currentVoiceCallStream) {
        console.log(
          "Terminating existing voice call stream before initiating new outgoing call."
        );
        // Use peerId from the existing stream if possible for the termination event
        const oldPeerId = currentVoiceCallStream.remotePeer
          ? currentVoiceCallStream.remotePeer.toString()
          : null;
        await terminateVoiceCallLogic("New call initiated", oldPeerId);
      }
      console.log(`Initiating voice call to ${targetAddr.toString()}`);
      currentVoiceCallStream = await libp2pNode.dialProtocol(
        targetAddr,
        VOICE_CHAT_PROTOCOL,
        {
          runOnLimitedConnection: true,
        }
      );
      console.log(
        "Voice stream established for outgoing call to:",
        targetAddr.toString()
      );
      mainWindow.webContents.send("voice-call-initiated", {
        peerAddr: targetAddr.toString(),
        streamId: currentVoiceCallStream.id,
      });
      return { success: true, peerAddr: targetAddr.toString() };
    } catch (err) {
      console.error("Error initiating voice call:", err);
      if (currentVoiceCallStream) {
        // Should be null if dialProtocol failed, but defensive
        await currentVoiceCallStream
          .close()
          .catch((e) =>
            console.error("Error closing failed outgoing stream attempt:", e)
          );
      }
      currentVoiceCallStream = null; // Ensure it's null on failure
      return { error: err.message };
    }
  });

  ipcMain.handle("send-voice-chunk", async (_, chunk) => {
    if (!currentVoiceCallStream) {
      // This log can be very noisy if called frequently when no stream exists.
      // console.warn("send-voice-chunk: No active voice stream to send chunk.");
      return { error: "No active voice stream." };
    }
    try {
      await byteStream(currentVoiceCallStream).write(chunk); // chunk from renderer is already Uint8Array
      return { success: true };
    } catch (err) {
      console.error("Error sending voice chunk:", err);
      if (
        err.message.includes("stream ended") ||
        err.message.includes("voetbal") ||
        err.message.includes("reset") ||
        err.message.includes("closed")
      ) {
        console.warn(
          "Voice stream closed or reset while sending. Terminating call from send-voice-chunk."
        );
        const peerIdForEvent =
          currentVoiceCallStream && currentVoiceCallStream.remotePeer
            ? currentVoiceCallStream.remotePeer.toString()
            : null;
        await terminateVoiceCallLogic(
          "Stream error during send",
          peerIdForEvent
        );
      }
      return { error: err.message };
    }
  });

  ipcMain.handle("terminate-voice-call", async () => {
    // User-initiated termination from renderer
    const peerIdForEvent =
      currentVoiceCallStream && currentVoiceCallStream.remotePeer
        ? currentVoiceCallStream.remotePeer.toString()
        : null;
    return await terminateVoiceCallLogic("User action", peerIdForEvent);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function startRelay() {
  const server = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/51357/ws", "/webrtc"], // Removed /p2p-circuit/webrtc from listener as we're handling manually
    },
    transports: [
      webSockets(),
      webRTC({ rtcConfiguration: RTC_CONFIGURATION }),
      circuitRelayTransport({
        discoverRelays: 1, // Enable relay discovery
      }),
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

async function createNode(relayAddr) {
  if (libp2pNode) {
    console.log("Node already exists. Stopping and recreating.");
    await libp2pNode
      .stop()
      .catch((e) => console.error("Error stopping existing node:", e));
    libp2pNode = null;
    // peerConnections.clear(); // REMOVING - No longer using peerConnections map
  }
  console.log("Creating new libp2p node...");

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

  libp2pNode.handle(CHAT_PROTOCOL, async ({ stream, connection }) => {
    const chat = byteStream(stream);
    const remotePeerAddr = connection.remoteAddr.toString();

    while (true) {
      const buf = await chat.read();
      const msgStr = toString(buf.subarray());
      let msg;
      try {
        msg = JSON.parse(msgStr);
      } catch (e) {
        console.error("Failed to parse incoming chat message JSON:", msgStr, e);
        continue; // Skip malformed message
      }

      // Handle signaling messages for WebRTC
      // The 'else' block containing existing chat message logic becomes the main execution path.
      // if (msg.type === "sdp-offer") { ... } else if (msg.type === "sdp-answer") { ... } else if (msg.type === "ice-candidate") { ... } else { ... }
      // Becomes just:
      console.log(
        `[${msg.time}] ${msg.username} (${remotePeerAddr}): ${msg.message}`
      );
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("message-received", {
          ...msg,
          isCurrentUser: msg.username === username,
          peerAddr: remotePeerAddr,
        });
      }
    }
  });

  // Handle incoming voice streams
  libp2pNode.handle(VOICE_CHAT_PROTOCOL, async ({ stream, connection }) => {
    const remotePeerIdStr = connection.remotePeer.toString();
    console.log(
      `Incoming voice stream from ${remotePeerIdStr} (stream ID: ${stream.id})`
    );

    if (currentVoiceCallStream && currentVoiceCallStream !== stream) {
      console.log(
        "Incoming call while another voice stream is active. Closing previous stream and accepting new one."
      );
      const oldPeerId = currentVoiceCallStream.remotePeer
        ? currentVoiceCallStream.remotePeer.toString()
        : null;
      await terminateVoiceCallLogic("Replaced by new incoming call", oldPeerId);
    } else if (currentVoiceCallStream === stream) {
      console.warn(
        "VOICE_CHAT_PROTOCOL handler called for an already active stream. This is unusual. Ignoring."
      );
      // This case should ideally not happen if libp2p handles protocol negotiation correctly on a single stream.
      // Or, if it does, it might mean a re-negotiation we don't need to explicitly handle here if `stream` is the same object.
      return;
    }

    currentVoiceCallStream = stream; // Assign the new incoming stream as the active one

    mainWindow.webContents.send("incoming-voice-call", {
      peerId: remotePeerIdStr,
      streamId: stream.id,
    });

    const voiceReader = byteStream(stream);
    try {
      while (true) {
        const rawChunk = await voiceReader.read(); // This is likely Uint8ArrayList or similar

        if (!rawChunk || rawChunk.length === 0) {
          // Stream ended cleanly or empty chunk
          if (!rawChunk)
            console.log(
              `Voice stream with ${remotePeerIdStr} ended cleanly (read returned null/undefined).`
            );
          else
            console.log(
              `Voice stream with ${remotePeerIdStr} sent empty chunk.`
            );
          break; // Exit loop if stream ended or empty chunk that signifies end.
        }

        // Convert Uint8ArrayList (or similar) to a single Uint8Array
        const finalChunk = rawChunk.subarray();

        if (finalChunk.length === 0) {
          console.warn(
            `[main.js] VOICE_CHAT_PROTOCOL: rawChunk.subarray() resulted in an empty finalChunk. Original rawChunk length: ${rawChunk.length}. Skipping send.`
          );
          // Continue to the next iteration of the read loop, effectively dropping this empty chunk.
          // If this happens often, it might indicate an issue with the sender or the stream.
          continue;
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("voice-chunk-received", {
            peerId: remotePeerIdStr,
            chunk: finalChunk,
          });
        }
      }
    } catch (err) {
      console.error(
        `Error reading from voice stream with ${remotePeerIdStr}: ${err.message}`
      );
      // Error will be handled by the finally block if this was the active stream
    } finally {
      console.log(
        `Read loop for voice stream with ${remotePeerIdStr} (stream ID: ${stream.id}) has ended.`
      );
      // If the stream that ended was the one we consider active for the call:
      if (currentVoiceCallStream === stream) {
        console.log(
          "The active voice call stream (incoming) has ended. Terminating call logic via finally block."
        );
        await terminateVoiceCallLogic(
          "Remote stream ended (incoming)",
          remotePeerIdStr
        );
      } else {
        console.log(
          `Non-active or already replaced stream (ID: ${stream.id}) for peer ${remotePeerIdStr} ended. No action on currentVoiceCallStream.`
        );
        // Ensure this specific stream is closed if it wasn't the active one that got closed by terminateVoiceCallLogic
        stream
          .close()
          .catch((e) =>
            console.warn(
              "Error closing non-active stream in finally:",
              e.message
            )
          );
      }
    }
  });

  libp2pNode.addEventListener("connection:open", (evt) => {
    const c = evt.detail;
    updateConnList();
    // REMOVING: Manual handshake initiation logic that called initiateWebRTCHandshake
  });

  libp2pNode.addEventListener("connection:close", (evt) => {
    updateConnList();
    // REMOVING: Manual handshake related cleanup logic for peerConnections
  });

  let relayMultiaddr;
  if (relayAddr) {
    await libp2pNode.dial(multiaddr(relayAddr));
    await new Promise((r) => setTimeout(r, 10000));
    libp2pNode.getMultiaddrs().forEach((a) => {
      const s = a.toString();
      // Ensure we are picking a /webrtc multiaddr that is not /p2p-circuit unless it also has webrtc
      // Prefer direct webrtc addresses if available after relay connection.
      if (
        s.includes("/webrtc") &&
        (s.startsWith("/dns4/") || s.startsWith("/ip4/"))
      ) {
        if (
          !s.includes("/p2p-circuit") ||
          (s.includes("/p2p-circuit") && s.includes("/webrtc/"))
        ) {
          relayMultiaddr = s; // This could be a direct WebRTC addr or a relayed one
        }
      }
    });
    if (!relayMultiaddr) {
      // Fallback if no ideal address was found
      libp2pNode.getMultiaddrs().forEach((a) => {
        const s = a.toString();
        if (s.includes("/p2p-circuit/webrtc")) relayMultiaddr = s;
      });
    }
    console.log(
      "Selected node multiaddr for WebRTC (via relay or direct):",
      relayMultiaddr
    );
  }
  return { relayMultiaddr };
}

// This function is now replaced by the new manual signaling flow.
// It was called when a "webrtc-offer" (which was just a multiaddr) was received.
// The new flow initiates proactively or responds to SDP offers within the CHAT_PROTOCOL handler.
/*
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
    // This part was problematic, sending remoteAddr as our own.
    // const mywebrtcAddr = direct.remoteAddr.toString();
    // sendWebRTCAddrToPeer(direct, mywebrtcAddr);
  }
}
*/

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

    // REMOVING: Logic to check manual peerConnections and dataChannel.readyState
    // The code that started with "let targetPeerIdStr = null;" and checked peerConnections is removed.

    // This becomes the primary method now.
    if (!ma) {
      console.error(
        "sendMessage: No target multiaddr (ma) set. Cannot send message."
      );
      return { error: "No target peer for message." };
    }

    console.log(`Sending message to ${ma.toString()} via libp2p dial.`);
    const s = await libp2pNode.dialProtocol(ma, CHAT_PROTOCOL, {
      runOnLimitedConnection: true,
    });
    const chat = byteStream(s);
    await chat.write(fromString(payload));
    return { success: true, method: "libp2p-dial" }; // Keep method for potential logging
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

async function terminateVoiceCallLogic(reason = "Call ended", peerId = null) {
  if (currentVoiceCallStream) {
    const streamToClose = currentVoiceCallStream;
    currentVoiceCallStream = null; // Nullify early to prevent race conditions / re-entry issues
    console.log(
      `terminateVoiceCallLogic: Closing current voice call stream. Reason: ${reason}`
    );
    try {
      await streamToClose.close();
    } catch (closeErr) {
      console.error(
        "Error closing voice stream in terminateVoiceCallLogic:",
        closeErr
      );
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const eventPeerId = streamToClose.remotePeer
        ? streamToClose.remotePeer.toString()
        : peerId;
      mainWindow.webContents.send("voice-call-terminated", {
        peerId: eventPeerId,
        reason,
      });
    }
    return { success: true, reason };
  }
  return { info: "No active voice call to terminate." };
}
