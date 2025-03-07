import { useState } from "react";

function Server(props) {
  const [isToggled, setIsToggled] = useState(false);
  const [multiaddrs, setMultiaddrs] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleStartServer = async () => {
    setLoading(true);
    try {
      // Call the exposed method from preload.js
      const addresses = await window.electronAPI.startRelay(); // Use window.electronAPI
      setMultiaddrs(addresses);
    } catch (error) {
      console.error("Failed to start relay:", error);
    }
    setLoading(false);
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
        <div style={{ padding: "0 30px" }}>
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
          <h2>Server Multiaddrs</h2>
          {multiaddrs.length > 0 ? (
            <ul>
              {multiaddrs.map((addr, index) => (
                <li key={index} style={{ wordBreak: "break-word" }}>
                  {addr}
                </li>
              ))}
            </ul>
          ) : (
            !loading && <p>No server running.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default Server;
