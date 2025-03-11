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
  const handleStartServer = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.startRelay();
      setMultiaddrs(result.multiaddrs);
      setTunnelUrl(result.ngrokUrl);

      // Create node after relay is started
      // await window.electronAPI.createNode();
    } catch (error) {
      console.error("Failed to start relay:", error);
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
      console.log("Node created:", response);

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
      const response = await window.electronAPI.dialPeer(peerDialAddr);
      if (response.error) {
        setDialMessage(`Failed to dial peer: ${response.error}`);
      } else {
        setDialMessage("Successfully connected to peer!");

        const switchResponse = await window.electronAPI.switchToWebRTC(
          peerDialAddr
        );
        if (switchResponse.error) {
          setDialMessage(`Failed to switch to WebRTC: ${switchResponse.error}`);
        } else {
          setDialMessage("Switched to WebRTC successfully!");
        }
      }
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

          <p>Server IP: </p>
          <p>Server Port: </p>
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
              <h2>Tunnel URL</h2>
              <p style={{ wordBreak: "break-word" }}>{tunnelUrl}</p>
              <h2>Enter Relay Address</h2>
              <form
                onSubmit={handleUrlSubmit}
                style={{ display: "flex", gap: "10px" }}
              >
                <input
                  type="text"
                  value={relayAddr}
                  onChange={(e) => setRelayAddr(e.target.value)}
                  placeholder="Enter Relay URL"
                  style={{
                    width: "300px",
                    padding: "10px",
                    fontSize: "16px",
                    outline: "none",
                    border: "1px solid #363940",
                    backgroundColor: "#363940",
                    color: "white",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#5865F2",
                    color: "white",
                    padding: "10px 20px",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  Submit
                </button>
              </form>
              {message && <p>{message}</p>}
            </div>
          )}

          <h2>Server Multiaddrs</h2>
          {multiaddrs.length > 0 ? (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                width: "100%",
              }}
            >
              {multiaddrs.map((addr, index) => (
                <li
                  key={index}
                  style={{
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    marginBottom: "10px",
                  }}
                >
                  {addr}
                </li>
              ))}
            </ul>
          ) : (
            !loading && <p>No server running.</p>
          )}

          <div style={{ width: "100%" }}>
            <h2>Available Peers</h2>
            <button style={{ backgroundColor: "#5865F2" }} onClick={getPeers}>
              Get Peers
            </button>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                width: "100%",
              }}
            >
              {peers.length > 0 ? (
                peers.map(([peerId, addr], index) => (
                  <li
                    key={index}
                    style={{
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      marginBottom: "10px",
                    }}
                  >
                    <strong>{peerId}</strong>: {addr}
                  </li>
                ))
              ) : (
                <li>No peers found</li>
              )}
            </ul>
          </div>
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
        <h2>Dial a Peer</h2>
        <input
          type="text"
          value={peerDialAddr}
          onChange={(e) => setPeerDialAddr(e.target.value)}
          placeholder="Enter Peer Multiaddr"
          style={{ padding: "10px", width: "300px", marginBottom: "10px" }}
        />
        <button
          onClick={handleDialPeer}
          style={{
            backgroundColor: "#5865F2",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Dial Peer
        </button>
        {dialMessage && <p>{dialMessage}</p>}
      </div>
    </div>
  );
}

export default Server;
