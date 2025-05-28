import { useState, useEffect } from "react";

function ServerConfig({
  onUsernameSet,
  usernameLocked: parentLocked,
  username: parentUsername,
  onConfigSent,
  onRelayChange,
  onStunTurnChange,
}) {
  const [username, setUsername] = useState(parentUsername || "");
  const [usernameLocked, setUsernameLocked] = useState(!!parentLocked);
  const [statusMessage, setStatusMessage] = useState("");

  const [useCustomRelay, setUseCustomRelay] = useState(false);
  const [useCustomStunTurn, setUseCustomStunTurn] = useState(false);
  const [relayServer, setRelayServer] = useState("");
  const [stunServer, setStunServer] = useState("");
  const [turnServer, setTurnServer] = useState("");
  const [turnUsername, setTurnUsername] = useState("");
  const [turnCredential, setTurnCredential] = useState("");
  const [configurationsSent, setConfigurationsSent] = useState(false);

  const handleSetUsername = async () => {
    if (!username.trim()) {
      setStatusMessage("Please enter a valid username.");
      return;
    }
    try {
      const response = await window.electronAPI.setUsername(username);
      if (response.success) {
        setStatusMessage(`Username set to: ${response.username}`);
        setUsernameLocked(true);
        if (onUsernameSet) onUsernameSet(username, true);
      } else {
        setStatusMessage("Failed to set username.");
      }
    } catch (error) {
      setStatusMessage(`Failed to set username: ${error.message}`);
    }
  };

  // Handler for relay server button
  const handleRelayButton = () => {
    // TODO: Implement relay server logic
  };

  // Handler for stun/turn server button
  const handleStunTurnButton = () => {
    // TODO: Implement stun/turn server logic
  };

  const handleSendConfigurations = () => {
    setConfigurationsSent(true);
    if (typeof onConfigSent === "function") onConfigSent(true);
    // TODO: Implement actual send logic
  };

  const handleRelayCheckbox = () => {
    setUseCustomRelay((prev) => {
      const next = !prev;
      if (typeof onRelayChange === "function") onRelayChange(next);
      return next;
    });
  };
  const handleStunTurnCheckbox = () => {
    setUseCustomStunTurn((prev) => {
      const next = !prev;
      if (typeof onStunTurnChange === "function") onStunTurnChange(next);
      return next;
    });
  };

  useEffect(() => {
    if (!usernameLocked && onUsernameSet) onUsernameSet(username, false);
  }, [usernameLocked, username]);

  return (
    <div
      style={{
        backgroundColor: "#2e2f35",
        padding: "20px",
        borderRadius: "10px",
        color: "white",
        marginTop: "20px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ marginTop: 0 }}>User Configuration</h2>
      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          disabled={usernameLocked}
          style={{
            padding: "10px",
            width: "250px",
            marginRight: "10px",
            marginBottom: "10px",
            borderRadius: "5px",
            border: "1px solid #555",
            backgroundColor: usernameLocked ? "#3a3b42" : "#202124",
            color: "white",
          }}
        />
        <button
          onClick={handleSetUsername}
          disabled={usernameLocked || !username.trim()}
          style={{
            backgroundColor: usernameLocked ? "#888" : "#5865F2",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: "5px",
            cursor: usernameLocked ? "not-allowed" : "pointer",
            opacity: usernameLocked ? 0.5 : 1,
            marginBottom: "10px",
            alignSelf: "flex-start",
          }}
        >
          {usernameLocked ? "Username Set!" : "Set Username"}
        </button>
      </div>
      {statusMessage && <p>{statusMessage}</p>}

      <h2 style={{ marginTop: "30px" }}>Server Configuration</h2>

      <label style={{ display: "block", marginBottom: "10px" }}>
        <input
          type="checkbox"
          checked={useCustomRelay}
          onChange={handleRelayCheckbox}
          style={{ marginRight: "10px" }}
        />
        I want to use my own relay server
      </label>
      <input
        type="text"
        disabled={!useCustomRelay}
        value={relayServer}
        onChange={(e) => setRelayServer(e.target.value)}
        placeholder="Enter Relay Server Address"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "20px",
          borderRadius: "5px",
          border: "1px solid #555",
          backgroundColor: useCustomRelay ? "#3a3b42" : "#202124",
          color: "white",
        }}
      />
      {useCustomRelay && (
        <p
          style={{
            marginTop: "10px",
            backgroundColor: "#1e1f23",
            padding: "15px",
            borderRadius: "5px",
            fontSize: "14px",
            color: "#ccc",
            lineHeight: "1.5",
            border: "1px dashed #555",
          }}
        >
          <strong>Note:</strong> If you will use your own relay server, for the
          configuration and port management, you need to install{" "}
          <code>cloudflared</code> and create a basic tunnel.
        </p>
      )}

      <label
        style={{ display: "block", marginBottom: "10px", marginTop: "20px" }}
      >
        <input
          type="checkbox"
          checked={useCustomStunTurn}
          onChange={handleStunTurnCheckbox}
          style={{ marginRight: "10px" }}
        />
        I want to use my own STUN/TURN servers
      </label>

      <input
        type="text"
        disabled={!useCustomStunTurn}
        value={stunServer}
        onChange={(e) => setStunServer(e.target.value)}
        placeholder="Enter STUN Server URL (e.g., stun:yourdomain.com:3478)"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "10px",
          borderRadius: "5px",
          border: "1px solid #555",
          backgroundColor: useCustomStunTurn ? "#3a3b42" : "#202124",
          color: "white",
        }}
      />

      <input
        type="text"
        disabled={!useCustomStunTurn}
        value={turnServer}
        onChange={(e) => setTurnServer(e.target.value)}
        placeholder="Enter TURN Server URL (e.g., turn:yourdomain.com:3478)"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "10px",
          borderRadius: "5px",
          border: "1px solid #555",
          backgroundColor: useCustomStunTurn ? "#3a3b42" : "#202124",
          color: "white",
        }}
      />

      <input
        type="text"
        disabled={!useCustomStunTurn}
        value={turnUsername}
        onChange={(e) => setTurnUsername(e.target.value)}
        placeholder="TURN Username"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "10px",
          borderRadius: "5px",
          border: "1px solid #555",
          backgroundColor: useCustomStunTurn ? "#3a3b42" : "#202124",
          color: "white",
        }}
      />

      <input
        type="password"
        disabled={!useCustomStunTurn}
        value={turnCredential}
        onChange={(e) => setTurnCredential(e.target.value)}
        placeholder="TURN Credential"
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "5px",
          border: "1px solid #555",
          backgroundColor: useCustomStunTurn ? "#3a3b42" : "#202124",
          color: "white",
        }}
      />

      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
        <button
          onClick={handleSendConfigurations}
          disabled={configurationsSent}
          style={{
            backgroundColor: configurationsSent ? "#888" : "#5865F2",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: "5px",
            cursor: configurationsSent ? "not-allowed" : "pointer",
            opacity: configurationsSent ? 0.5 : 1,
          }}
        >
          {configurationsSent ? "Configurations Sent" : "Send Configurations"}
        </button>
      </div>
    </div>
  );
}

export default ServerConfig;
