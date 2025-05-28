// project imports
import React, { useState } from "react";
import Chat from "./Chat";
import Server from "./Server";
import VoiceChat from "./VoiceChat";

function Main(props) {
  const [currentPeerAddr, setCurrentPeerAddr] = useState(null);
  const [usernameLocked, setUsernameLocked] = useState(false);

  // Handler to receive username lock state from VoiceChat
  const handleUsernameStateChange = (uname, locked) => {
    setUsernameLocked(locked);
  };

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
      <Server
        chatHeight={componentHeight}
        chatWidth={serverWidth}
        usernameLocked={usernameLocked}
      />
      <Chat
        chatHeight={componentHeight}
        chatWidth={chatWidth}
        onPeerSelected={setCurrentPeerAddr}
      />
      <VoiceChat
        chatHeight={componentHeight}
        chatWidth={voiceChatWidth}
        currentPeerAddr={currentPeerAddr}
        onUsernameStateChange={handleUsernameStateChange}
      />
    </div>
  );
}

export default Main;
