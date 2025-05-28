import React, { useState } from "react";
import ServerConfig from "./ServerConfig";
const VoiceChat = ({
  chatHeight,
  chatWidth,
  currentPeerAddr,
  onUsernameStateChange,
  onConfigStateChange, // new prop for parent to receive config state
}) => {
  const [username, setUsername] = useState("");
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [configurationsSent, setConfigurationsSent] = useState(false);
  const [useCustomRelay, setUseCustomRelay] = useState(false);
  const [useCustomStunTurn, setUseCustomStunTurn] = useState(false);

  // Called by ServerConfig when username is set/locked
  const handleUsernameSet = (uname, locked) => {
    setUsername(uname);
    setUsernameLocked(locked);
    if (onUsernameStateChange) onUsernameStateChange(uname, locked);
  };

  // Called by ServerConfig when configurations are sent
  const handleConfigSent = (sent) => {
    setConfigurationsSent(sent);
    if (onConfigStateChange)
      onConfigStateChange({
        configurationsSent: sent,
        useCustomRelay,
        useCustomStunTurn,
      });
  };

  // Track relay/stun/turn checkboxes
  const handleRelayChange = (checked) => {
    setUseCustomRelay(checked);
    if (onConfigStateChange)
      onConfigStateChange({
        configurationsSent,
        useCustomRelay: checked,
        useCustomStunTurn,
      });
  };
  const handleStunTurnChange = (checked) => {
    setUseCustomStunTurn(checked);
    if (onConfigStateChange)
      onConfigStateChange({
        configurationsSent,
        useCustomRelay,
        useCustomStunTurn: checked,
      });
  };

  return (
    <div
      style={{
        height: chatHeight,
        width: chatWidth,
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: "#2a2b2f",
        color: "white",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px",
      }}
    >
      <ServerConfig
        onUsernameSet={handleUsernameSet}
        username={username}
        usernameLocked={usernameLocked}
        onConfigSent={handleConfigSent}
        // Patch: pass relay/stun/turn change handlers
        onRelayChange={handleRelayChange}
        onStunTurnChange={handleStunTurnChange}
      />
      {/* <h2>Voice Chat</h2>
      <div>Status: {callStatus}</div>
      {peerId && <div>Connected to: {peerId}</div>}
      {inCall && (
        <div style={{ marginTop: "10px", fontSize: "0.9em" }}>
          {isSelfSpeaking && (
            <div style={{ color: "#5cb85c" }}>🎙️ You are speaking...</div>
          )}
          {isPeerSpeaking && (
            <div style={{ color: "#5bc0de" }}>🎧 Peer is speaking...</div>
          )}
          {!isSelfSpeaking && !isPeerSpeaking && (
            <div style={{ color: "#ccc" }}>No one is speaking</div>
          )}
        </div>
      )}
      {!inCall && currentPeerAddr && usernameReady && (
        <button
          onClick={() => initiateCall(currentPeerAddr)}
          style={buttonStyle}
        >
          Call Peer
        </button>
      )}
      {inCall && (
        <>
          <button onClick={toggleMute} style={buttonStyle}>
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={hangUp}
            style={{ ...buttonStyle, backgroundColor: "#d9534f" }}
          >
            Hang Up
          </button>
        </>
      )}
      {callStatus.startsWith("Error") && (
        <button
          onClick={() => {
            setCallStatus("Idle");
            setInCall(false);
            setPeerId(null);
          }}
          style={{ ...buttonStyle, backgroundColor: "#f0ad4e" }}
        >
          Dismiss Error
        </button>
      )} */}
    </div>
  );
};

const buttonStyle = {
  padding: "8px 15px",
  margin: "5px",
  borderRadius: "5px",
  border: "none",
  cursor: "pointer",
  backgroundColor: "#5cb85c",
  color: "white",
  fontSize: "14px",
};

export default VoiceChat;
