import { useState, useEffect, useRef } from "react";

function Server(props) {
  // Accept usernameLocked as a prop from parent (VoiceChat/Main)
  const {
    usernameLocked,
    configurationsSent,
    useCustomRelay,
    useCustomStunTurn,
  } = props;
  const [isToggled, setIsToggled] = useState(false);
  const [multiaddrs, setMultiaddrs] = useState([]);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [relayAddr, setRelayAddr] = useState("");
  const [message, setMessage] = useState("");
  const [peers, setPeers] = useState([]);
  const [peerDialAddr, setPeerDialAddr] = useState("");
  const [dialMessage, setDialMessage] = useState("");

  // Checklist animation state
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistValidating, setChecklistValidating] = useState(false);
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [checklistFading, setChecklistFading] = useState(false);
  const checklistTimeoutRef = useRef(null);
  const checklistFadeTimeoutRef = useRef(null);

  // Determine if all requirements are met
  const allValid =
    usernameLocked &&
    (!(useCustomRelay || useCustomStunTurn) || configurationsSent);

  // Show checklist instantly when invalid
  useEffect(() => {
    if (!allValid) {
      setShowChecklist(true);
      setChecklistValidating(false);
      setChecklistFading(false);
      setActionsEnabled(false);
    }
  }, [allValid]);

  // Hide checklist with fade when valid
  useEffect(() => {
    if (allValid) {
      setChecklistValidating(true);
      setChecklistFading(false);
      setActionsEnabled(false);
      checklistTimeoutRef.current = setTimeout(() => {
        setChecklistFading(true);
        checklistFadeTimeoutRef.current = setTimeout(() => {
          setShowChecklist(false);
          setChecklistValidating(false);
          setChecklistFading(false);
          setActionsEnabled(true);
        }, 450);
      }, 500);
    }
    return () => {
      if (checklistTimeoutRef.current) {
        clearTimeout(checklistTimeoutRef.current);
        checklistTimeoutRef.current = null;
      }
      if (checklistFadeTimeoutRef.current) {
        clearTimeout(checklistFadeTimeoutRef.current);
        checklistFadeTimeoutRef.current = null;
      }
    };
  }, [allValid]);

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

  // Block join/create/relay if custom relay or stun/turn is checked and configs not sent
  const configRequired =
    (useCustomRelay || useCustomStunTurn) && !configurationsSent;

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

      {/* Checklist UI for both Join and Create sections */}

      {!isToggled ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <h1>Join a Server</h1>
            <input
              type="text"
              value={peerDialAddr}
              onChange={(e) => setPeerDialAddr(e.target.value)}
              placeholder="Enter Peer Multiaddr"
              style={{
                padding: "10px",
                width: "300px",
                marginBottom: "10px",
                opacity: actionsEnabled ? 1 : 0.5,
                pointerEvents: actionsEnabled ? "auto" : "none",
              }}
              disabled={!actionsEnabled}
            />
            <button
              onClick={handleDialPeer}
              style={{
                backgroundColor: "#5865F2",
                color: "white",
                padding: "10px 20px",
                borderRadius: "5px",
                cursor: actionsEnabled ? "pointer" : "not-allowed",
                width: "150px",
                marginBottom: "10px",
                opacity: actionsEnabled ? 1 : 0.5,
              }}
              disabled={!actionsEnabled}
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
              cursor: actionsEnabled ? "pointer" : "not-allowed",
              marginBottom: "20px",
              transition: "transform 0.1s",
              opacity: actionsEnabled ? 1 : 0.5,
            }}
            disabled={!actionsEnabled}
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
      {showChecklist && (
        <div
          style={{
            color: checklistValidating ? "#4caf50" : "#ffb347",
            marginTop: "10px",
            textAlign: "center",
            fontSize: "1em",
            opacity: checklistFading ? 0 : checklistValidating ? 0.7 : 1,
            transition: checklistFading
              ? "opacity 0.45s"
              : "color 0.3s, opacity 0.45s",
          }}
        >
          <div style={{ marginBottom: 4 }}>
            {checklistValidating
              ? "In order to continue, you need to:"
              : "In order to continue, you need to:"}
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "inline-block",
              textAlign: "left",
            }}
          >
            <li
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: checklistValidating
                    ? "#4caf50"
                    : usernameLocked
                    ? "#4caf50"
                    : "#d9534f",
                  fontWeight: 700,
                }}
              >
                {usernameLocked || checklistValidating ? "✔" : "✘"}
              </span>
              <span>Set your username</span>
            </li>
            {(useCustomRelay || useCustomStunTurn) && (
              <li
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    color: checklistValidating
                      ? "#4caf50"
                      : configurationsSent
                      ? "#4caf50"
                      : "#d9534f",
                    fontWeight: 700,
                  }}
                >
                  {configurationsSent || checklistValidating ? "✔" : "✘"}
                </span>
                <span>Send your configuration(s)</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Server;
