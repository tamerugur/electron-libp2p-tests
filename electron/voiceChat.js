import { ipcMain } from "electron";
import { byteStream } from "it-byte-stream";
import { fromString, toString } from "uint8arrays";

const VOICE_CHAT_PROTOCOL = "/libp2p/voice-chat/1.0.0";
const SIGNALING_PROTOCOL = "/libp2p/voice-chat-signaling/1.0.0";

// Keep track of registered handlers
let isHandlersRegistered = false;

export function setupVoiceChatHandlers(libp2pNode, event) {
  if (!libp2pNode) {
    throw new Error("Libp2p node not initialized");
  }

  // Clean up existing handlers if they exist
  if (isHandlersRegistered) {
    try {
      // Remove protocol handlers
      libp2pNode.unhandle(VOICE_CHAT_PROTOCOL);
      libp2pNode.unhandle(SIGNALING_PROTOCOL);

      // Remove IPC handlers
      ipcMain.removeHandler("send-signaling-data");
      ipcMain.removeHandler("voice-chat-dial");
      ipcMain.removeHandler("voice-chat-disconnect");
    } catch (err) {
      console.warn("Error cleaning up existing handlers:", err);
    }
  }

  // Handle incoming voice chat streams
  libp2pNode.handle(VOICE_CHAT_PROTOCOL, async ({ stream, connection }) => {
    try {
      // Send the peer ID to the renderer
      event.sender.send("voice-chat-peer-connected", {
        peerId: connection.remotePeer.toString(),
        type: "incoming",
      });

      // Handle stream closure
      stream.once("close", () => {
        event.sender.send("voice-chat-peer-disconnected", {
          peerId: connection.remotePeer.toString(),
        });
      });
    } catch (err) {
      console.error("Error handling voice chat stream:", err);
      event.sender.send("voice-chat-error", {
        error: err.message,
        type: "incoming",
      });
    }
  });

  // Handle signaling protocol
  libp2pNode.handle(SIGNALING_PROTOCOL, async ({ stream, connection }) => {
    const signalingStream = byteStream(stream);
    const peerId = connection.remotePeer.toString();
    console.log(`Signaling stream opened with peer: ${peerId}`);
    try {
      while (true) {
        const data = await signalingStream.read();
        const signalingData = JSON.parse(toString(data.subarray()));
        console.log(`Received signaling data from ${peerId}:`, signalingData);

        // Log WebRTC address if present in signaling data
        if (signalingData.type === "webrtc-addr" || signalingData.webrtcAddr) {
          console.log(
            `Received WebRTC address from ${peerId}:`,
            signalingData.webrtcAddr || signalingData.addr
          );
        }

        // Forward signaling data to renderer
        event.sender.send("signaling-data", signalingData, peerId);
      }
    } catch (err) {
      console.error("Error in signaling stream:", err);
    }
  });

  // Set up IPC handlers for voice chat
  ipcMain.handle("send-signaling-data", async (event, peerId, data) => {
    try {
      // Create a new stream for signaling
      const stream = await libp2pNode.dialProtocol(peerId, SIGNALING_PROTOCOL);
      const signalingStream = byteStream(stream);

      // Log WebRTC address if we're sending one
      if (data.type === "webrtc-addr" || data.webrtcAddr) {
        console.log(
          `Sending WebRTC address to ${peerId}:`,
          data.webrtcAddr || data.addr
        );
      }

      // Send the signaling data
      await signalingStream.write(fromString(JSON.stringify(data)));

      return { success: true };
    } catch (err) {
      console.error("Error sending signaling data:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("voice-chat-dial", async (event, data) => {
    let peerId = data?.peerId;
    if (Array.isArray(peerId)) {
      peerId = peerId[0];
    }
    if (typeof peerId !== "string") {
      const errMsg = `Invalid peerId format: ${typeof peerId}`;
      console.error(errMsg);
      return { error: errMsg };
    }

    try {
      const stream = await libp2pNode.dialProtocol(peerId, VOICE_CHAT_PROTOCOL);

      event.sender.send("voice-chat-peer-connected", {
        peerId,
        type: "outgoing",
      });

      stream.once("close", () => {
        event.sender.send("voice-chat-peer-disconnected", { peerId });
      });

      return { success: true };
    } catch (err) {
      console.error("Error dialing peer for voice chat:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("voice-chat-disconnect", async (event, { peerId }) => {
    try {
      // Close all connections to the peer
      const connections = libp2pNode.getConnections(peerId);
      await Promise.all(connections.map((conn) => conn.close()));

      return { success: true };
    } catch (err) {
      console.error("Error disconnecting voice chat:", err);
      return { error: err.message };
    }
  });

  // Mark handlers as registered
  isHandlersRegistered = true;

  return { success: true };
}
