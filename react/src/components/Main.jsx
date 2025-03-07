// project imports
import Chat from "./Chat";
import Server from "./Server";
import VoiceChat from "./VoiceChat";

import { useState } from "react";
function Main() {
  const [relayStatus, setRelayStatus] = useState("");

  const handleStartRelay = async () => {
    try {
      // Call the exposed method from preload.js
      const response = await window.electronAPI.startRelay();
      setRelayStatus(`Relay started at: ${response.join(", ")}`);
    } catch (error) {
      console.error("Failed to start relay:", error);
      setRelayStatus("Failed to start relay");
    }
  };
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#212226",
        padding: "0",
      }}
    >
      <VoiceChat chatHeight="96vh" chatWidth="26vw" />
      <Chat chatHeight="96vh" chatWidth="46vw" />
      <Server chatHeight="96vh" chatWidth="26vw" />
    </div>
  );
}

export default Main;
