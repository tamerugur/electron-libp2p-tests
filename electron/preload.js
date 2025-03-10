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
  dialpeer: (node, peerMultiaddr) =>
    electron_1.ipcRenderer.invoke("dial-peer", node, peerMultiaddr),
  registerPeer: (peerId, multiaddr) =>
    electron_1.ipcRenderer.invoke("register-peer", peerId, multiaddr),
  getPeers: () => electron_1.ipcRenderer.invoke("get-peers"),
});
