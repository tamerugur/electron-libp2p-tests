"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");

electron_1.contextBridge.exposeInMainWorld("electronAPI", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
  startRelay: () => electron_1.ipcRenderer.invoke("start-relay"),
  createNode: (relayAddr) =>
    electron_1.ipcRenderer.invoke("create-node", relayAddr),
  switchToWebRTC: (peerMultiaddr) =>
    electron_1.ipcRenderer.invoke("switch-to-webrtc", peerMultiaddr),
  dialPeer: (node, peerMultiaddr) =>
    electron_1.ipcRenderer.invoke("dial-peer", node, peerMultiaddr),
  getPeers: () => electron_1.ipcRenderer.invoke("get-peers"),
  sendMessage: (message) =>
    electron_1.ipcRenderer.invoke("send-message", message),
  setUsername: (username) => 
    electron_1.ipcRenderer.invoke("set-username", username),
  // Voice chat methods
  initVoiceChat: () => 
    electron_1.ipcRenderer.invoke("voice-chat-init"),
  dialVoiceChat: (peerId) => 
    electron_1.ipcRenderer.invoke("voice-chat-dial", { peerId }), 
  disconnectVoiceChat: (peerId) => 
    electron_1.ipcRenderer.invoke("voice-chat-disconnect", { peerId }),
  getConnections: () =>
    electron_1.ipcRenderer.invoke("get-connections"),
  // Signaling methods for WebRTC
  sendSignalingData: (peerId, data) =>
    electron_1.ipcRenderer.invoke("send-signaling-data", peerId, data),
  // Event listeners
  onMessageReceived: (callback) => {
    electron_1.ipcRenderer.on("message-received", (event, message) =>
      callback(message)
    );
  },
  onVoiceChatPeerConnected: (callback) => {
    electron_1.ipcRenderer.on("voice-chat-peer-connected", (event, data) =>
      callback(data)
    );
  },
  onVoiceChatPeerDisconnected: (callback) => {
    electron_1.ipcRenderer.on("voice-chat-peer-disconnected", (event, data) =>
      callback(data)
    );
  },
  onVoiceChatError: (callback) => {
    electron_1.ipcRenderer.on("voice-chat-error", (event, data) =>
      callback(data)
    );
  },
  onSignalingData: (callback) => {
    electron_1.ipcRenderer.on("signaling-data", (event, data, peerId) =>
      callback(data, peerId)
    );
  },
  removeSignalingDataListener: () => {
    electron_1.ipcRenderer.removeAllListeners("signaling-data");
  },
  removeMessageListeners: () => {
    electron_1.ipcRenderer.removeAllListeners("message-received");
    electron_1.ipcRenderer.removeAllListeners("voice-chat-peer-connected");
    electron_1.ipcRenderer.removeAllListeners("voice-chat-peer-disconnected");
    electron_1.ipcRenderer.removeAllListeners("voice-chat-error");
  },
});
