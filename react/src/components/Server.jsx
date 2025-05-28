import { useState, useEffect } from "react";

function Server(props) {
  // Accept usernameLocked as a prop from parent (VoiceChat/Main)
  const { usernameLocked } = props;
  const [isToggled, setIsToggled] = useState(false);
  const [multiaddrs, setMultiaddrs] = useState([]);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [relayAddr, setRelayAddr] = useState("");
  const [message, setMessage] = useState("");
  const [peers, setPeers] = useState([]);
  const [peerDialAddr, setPeerDialAddr] = useState("");
  const [dialMessage, setDialMessage] = useState("");

  const handleStartServer = async () => {
    setLoading(true);
    try {
      // Step 1: Start relay and get tunnel URL
      const result = await window.electronAPI.startRelay();
      setTunnelUrl(result.relayUrl);

      // Step 2: Automatically create node using the tunnel URL
      const response = await window.electronAPI.createNode(result.relayUrl);
      setMultiaddrs(response.relayMultiaddr);

      setMessage("Server started and node created successfully!");
    } catch (error) {
      console.error("Failed to start server:", error);
      setMessage(`Failed to start server: ${error.message}`);
    }
    setLoading(false);
  };

  const handleUrlSubmit = async (event) => {
    event.preventDefault();

    if (!relayAddr || relayAddr.trim() === "") {
      setMessage("Please enter a relay address");
      return;
    }

    try {
      const response = await window.electronAPI.createNode(relayAddr);
      setMultiaddrs(response.relayMultiaddr);
      setMessage("Node created successfully!");
    } catch (error) {
      console.error("Failed to create node:", error);
      setMessage(`Failed to create node: ${error.message}`);
    }
  };

  const handleDialPeer = async () => {
    if (!peerDialAddr.trim()) {
      setDialMessage("Please enter a valid peer address.");
      return;
    }
    setDialMessage("Dialing peer...");
    try {
      // Automatically create node if none exists
      if (multiaddrs.length === 0) {
        setDialMessage("Creating node...");
        const response = await window.electronAPI.createNode();
        setMultiaddrs(response.relayMultiaddr);
      }
      await window.electronAPI.dialPeer(peerDialAddr);
      setDialMessage("Successfully dialed peer!");
    } catch (error) {
      console.error("Failed to dial peer:", error);
      setDialMessage(`Failed to dial peer: ${error.message}`);
    }
  };

  async function getPeers() {
    try {
      const peersList = await window.electronAPI.getPeers();
      setPeers(peersList);
    } catch (error) {
      console.error("Failed to get peers:", error);
    }
  }

  return (
    <div
      style={{
        width: props.chatWidth,
        height: props.chatHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: "#303136",
        borderTopRightRadius: "10px",
        borderBottomRightRadius: "10px",
        overflow: "auto",
      }}
    >
      {/* Toggle switch remains unchanged */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
          marginTop: "5vh",
        }}
      >
        <span>Join Another Peer</span>
        <label
          style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={isToggled}
            onChange={() => setIsToggled(!isToggled)}
            style={{ display: "none" }}
          />
          <div
            style={{
              width: "60px",
              height: "30px",
              backgroundColor: "#363940",
              borderRadius: "30px",
              position: "relative",
              transition: "background-color 0.3s",
            }}
          >
            <div
              style={{
                width: "26px",
                height: "26px",
                backgroundColor: "white",
                borderRadius: "50%",
                position: "absolute",
                top: "2px",
                left: isToggled ? "32px" : "2px",
                transition: "left 0.3s",
              }}
            ></div>
          </div>
        </label>
        <span>Create Server</span>
      </div>

      {!isToggled ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <h1>Join a Server</h1>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={peerDialAddr}
              onChange={(e) => setPeerDialAddr(e.target.value)}
              placeholder="Enter Peer Multiaddr"
              style={{
                padding: "10px",
                width: "300px",
                marginBottom: "10px",
                opacity: usernameLocked ? 1 : 0.5,
                pointerEvents: usernameLocked ? "auto" : "none",
              }}
              disabled={!usernameLocked}
            />
            <button
              onClick={handleDialPeer}
              style={{
                backgroundColor: "#5865F2",
                color: "white",
                padding: "10px 20px",
                borderRadius: "5px",
                cursor: usernameLocked ? "pointer" : "not-allowed",
                width: "150px",
                marginBottom: "10px",
                opacity: usernameLocked ? 1 : 0.5,
              }}
              disabled={!usernameLocked}
            >
              Dial Peer
            </button>
          </div>
          {!usernameLocked && (
            <div
              style={{
                color: "#ffb347",
                marginTop: "10px",
                textAlign: "center",
              }}
            >
              In order to continue, you need to set your username first.
            </div>
          )}
          {dialMessage && <p>{dialMessage}</p>}
        </div>
      ) : (
        <div
          style={{
            padding: "0 30px",
            width: "100%",
            maxWidth: "calc(100% - 60px)",
            boxSizing: "border-box",
          }}
        >
          <p>
            Create your server and share your IP with your friend to start
            chatting!
          </p>
          <button
            onClick={handleStartServer}
            style={{
              backgroundColor: "#5865F2",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
              cursor: usernameLocked ? "pointer" : "not-allowed",
              marginBottom: "20px",
              transition: "transform 0.1s",
              opacity: usernameLocked ? 1 : 0.5,
            }}
            disabled={!usernameLocked}
          >
            {loading ? "Starting Server..." : "Start the Server"}
          </button>
          {!usernameLocked && (
            <div
              style={{
                color: "#ffb347",
                marginTop: "10px",
                textAlign: "center",
              }}
            >
              In order to continue, you need to set your username first.
            </div>
          )}
          {tunnelUrl && (
            <div>
              <h2>Server Information</h2>
              <p style={{ wordBreak: "break-word", marginBottom: "20px" }}>
                Relay URL: {tunnelUrl}
              </p>
              <h2>Node Multiaddress</h2>
              {multiaddrs ? (
                <div
                  style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
                >
                  {multiaddrs}
                </div>
              ) : (
                <p>Generating node address...</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Server;
