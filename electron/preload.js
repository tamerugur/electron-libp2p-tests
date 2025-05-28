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
  setRelayAddr: (relayAddr) =>
    electron_1.ipcRenderer.invoke("set-relay-addr", relayAddr),
  setStunTurnConfig: (stunTurnConfig) =>
    electron_1.ipcRenderer.invoke("set-stun-turn-config", stunTurnConfig),
  onMessageReceived: (callback) => {
    electron_1.ipcRenderer.on("message-received", (event, message) =>
      callback(message)
    );
  },
  removeMessageListeners: () => {
    electron_1.ipcRenderer.removeAllListeners("message-received");
  },
  // Voice Chat API
  initiateVoiceCall: (peerAddr) =>
    electron_1.ipcRenderer.invoke("initiate-voice-call", peerAddr),
  sendVoiceChunk: (chunk) =>
    electron_1.ipcRenderer.invoke("send-voice-chunk", chunk),
  terminateVoiceCall: () =>
    electron_1.ipcRenderer.invoke("terminate-voice-call"),
  onVoiceCallInitiated: (callback) => {
    electron_1.ipcRenderer.on("voice-call-initiated", (event, data) =>
      callback(data)
    );
  },
  onIncomingVoiceCall: (callback) => {
    electron_1.ipcRenderer.on("incoming-voice-call", (event, data) =>
      callback(data)
    );
  },
  onVoiceChunkReceived: (callback) => {
    electron_1.ipcRenderer.on("voice-chunk-received", (event, data) =>
      callback(data)
    );
  },
  onVoiceCallTerminated: (callback) => {
    electron_1.ipcRenderer.on("voice-call-terminated", (event, data) =>
      callback(data)
    );
  },
  removeAllVoiceChatListeners: () => {
    electron_1.ipcRenderer.removeAllListeners("voice-call-initiated");
    electron_1.ipcRenderer.removeAllListeners("incoming-voice-call");
    electron_1.ipcRenderer.removeAllListeners("voice-chunk-received");
    electron_1.ipcRenderer.removeAllListeners("voice-call-terminated");
  },
  onConnectionReady: (callback) => {
    electron_1.ipcRenderer.on("connection-ready", () => callback());
  },
});
