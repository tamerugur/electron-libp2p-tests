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

  onMessageReceived: (callback) => {
    electron_1.ipcRenderer.on("message-received", (event, message) =>
      callback(message)
    );
  },
  removeMessageListeners: () => {
    electron_1.ipcRenderer.removeAllListeners("message-received");
  },
});
