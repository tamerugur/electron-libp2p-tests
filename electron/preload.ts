import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
});
