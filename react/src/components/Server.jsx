import { useState } from "react";

function Server(props) {
  const [isToggled, setIsToggled] = useState(false);
  const [multiaddrs, setMultiaddrs] = useState([]);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [relayAddr, setRelayAddr] = useState("");
  const [message, setMessage] = useState("");
  const [peers, setPeers] = useState([]);
  const [peerDialAddr, setPeerDialAddr] = useState("");
  const [dialMessage, setDialMessage] = useState("");
  const [username, setUsername] = useState("");

  const handleSetUsername = async () => {
    if (!username.trim()) {
      setMessage("Please enter a valid username.");
      return;
    }
    try {
      const response = await window.electronAPI.setUsername(username);
      if (response.success) {
        setMessage(`Username set to: ${response.username}`);
      } else {
        setMessage("Failed to set username.");
      }
    } catch (error) {
      console.error("Failed to set username:", error);
      setMessage(`Failed to set username: ${error.message}`);
    }
  };

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

    // Check if relayAddr is empty or just whitespace
    if (!relayAddr || relayAddr.trim() === "") {
      setMessage("Please enter a relay address");
      return;
    }

    console.log("Submitting relayAddr:", relayAddr);

    try {
      console.log("Creating node with relayAddr:", relayAddr);
      const response = await window.electronAPI.createNode(relayAddr);
      setMultiaddrs(response.relayMultiaddr);
      console.log("Node created:", response);
      console.log(response.relayMultiaddr);
      if (response.error) {
        setMessage(`Failed to create node: ${response.error}`);
      } else {
        setMessage("Node created successfully!");
      }
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
      await window.electronAPI.dialPeer(peerDialAddr);
    } catch (error) {
      console.error("Failed to dial peer:", error);
      setDialMessage(`Failed to dial peer: ${error.message}`);
    }
  };

  async function getPeers() {
    try {
      const peersList = await window.electronAPI.getPeers();
      console.log("Available peers:", peersList);
      setPeers(peersList);
    } catch (error) {
      console.error("Failed to get peers:", error);
    }
  }

  const handleCreateNode = async () => {
    try {
      const addrs = await window.electronAPI.createNode();
      console.log("Node created:", addrs);
      setMessage("Node created successfully without relay!");
    } catch (error) {
      console.error("Failed to create node:", error);
      setMessage(`Failed to create node: ${error.message}`);
    }
  };

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
            <button
              onClick={handleCreateNode}
              style={{
                backgroundColor: "#5865F2",
                color: "white",
                padding: "10px 20px",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                marginBottom: "20px",
                transition: "transform 0.1s",
              }}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(0.95)")
              }
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")}
            >
              Create Node (No Relay)
            </button>

            <input
              type="text"
              value={peerDialAddr}
              onChange={(e) => setPeerDialAddr(e.target.value)}
              placeholder="Enter Peer Multiaddr"
              style={{
                padding: "10px",
                width: "300px",
                marginBottom: "10px",
              }}
            />
            <button
              onClick={handleDialPeer}
              style={{
                backgroundColor: "#5865F2",
                color: "white",
                padding: "10px 20px",
                borderRadius: "5px",
                cursor: "pointer",
                width: "150px",
                marginBottom: "10px",
              }}
            >
              Dial Peer
            </button>
          </div>
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
              cursor: "pointer",
              marginBottom: "20px",
              transition: "transform 0.1s",
            }}
            onMouseDown={(e) =>
              (e.currentTarget.style.transform = "scale(0.95)")
            }
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {loading ? "Starting Server..." : "Start the Server"}
          </button>
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: "#303136",
          padding: "20px",
          borderRadius: "10px",
        }}
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter Username"
          style={{
            padding: "10px",
            width: "300px",
            marginBottom: "10px",
            fontSize: "16px",
            outline: "none",
            border: "1px solid #363940",
            backgroundColor: "#363940",
            color: "white",
            marginTop: "40px",
          }}
        />
        <button
          onClick={handleSetUsername}
          style={{
            backgroundColor: "#5865F2",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "transform 0.1s",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          Set Username
        </button>
        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

export default Server;
