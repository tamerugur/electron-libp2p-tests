// project imports
import Chat from "./Chat";
import Server from "./Server";
import VoiceChat from "./VoiceChat";

import React, { useState, useEffect } from "react";

function Main(props) {
  // const [relayStatus, setRelayStatus] = useState(""); // Removed, was unused in JSX
  const [currentPeerAddr, setCurrentPeerAddr] = useState(null);

  // Removed useEffect that set dynamic chatHeight/chatWidth
  // Removed handleStartRelay, was unused in JSX

  // Define fixed heights and proportional widths for the layout
  const componentHeight = "96vh"; // Example height
  const serverWidth = "26vw";
  const chatWidth = "46vw";
  const voiceChatWidth = "26vw";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "space-around", // Distribute space for a row layout
        alignItems: "center",
        backgroundColor: "#212226",
        padding: "0", // Reset padding if any was implied
      }}
    >
      <Server chatHeight={componentHeight} chatWidth={serverWidth} />
      <Chat
        chatHeight={componentHeight}
        chatWidth={chatWidth}
        onPeerSelected={setCurrentPeerAddr}
      />
      <VoiceChat
        chatHeight={componentHeight}
        chatWidth={voiceChatWidth}
        currentPeerAddr={currentPeerAddr}
      />
    </div>
  );
}

export default Main;
