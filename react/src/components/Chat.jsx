import { useState, useEffect, useRef } from "react";
import sendIcon from "../assets/sendIcon.svg";

function Chat(props) {
  const [messageToSend, setMessageToSend] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const handleMessageReceived = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    window.electronAPI.onMessageReceived(handleMessageReceived);

    return () => {
      window.electronAPI.removeMessageListeners();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageToSend.trim()) return;
    try {
      await window.electronAPI.sendMessage(messageToSend);
      setMessageToSend("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSendMessage();
    }
  };

  const handlePeerSelect = (peerAddr) => {
    if (props.onPeerSelected && peerAddr) {
      props.onPeerSelected(peerAddr);
      console.log("Selected peer for voice call:", peerAddr);
    } else {
      console.warn(
        "Cannot select peer: no peerAddr available on message or onPeerSelected not provided."
      );
    }
  };

  return (
    <div
      style={{
        height: props.chatHeight,
        width: props.chatWidth,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#363940",
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          margin: "0",
          overflow: "auto",
          padding: "20px",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              marginBottom: "15px",
              color: "#fff",
              alignSelf: msg.isCurrentUser ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "baseline",
                color: "#888",
              }}
            >
              {!msg.isCurrentUser && msg.peerAddr ? (
                <button
                  onClick={() => handlePeerSelect(msg.peerAddr)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontWeight: "bold",
                    color: "#7289da",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {msg.username}
                </button>
              ) : (
                <span style={{ fontWeight: "bold", color: "#4752C4" }}>
                  {msg.username}
                </span>
              )}
              <span style={{ fontSize: "0.8rem" }}>{msg.time}</span>
            </div>
            <div
              style={{
                background: msg.isCurrentUser ? "#4752C4" : "#41444a",
                padding: "10px 15px",
                borderRadius: "15px",
                maxWidth: "80%",
                wordBreak: "break-word",
                width: "fit-content",
                marginRight: msg.isCurrentUser ? "0" : "auto",
              }}
            >
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          display: "flex",
          width: "90%",
          position: "relative",
          marginBottom: "10px",
          alignSelf: "center",
        }}
      >
        <input
          type="text"
          value={messageToSend}
          onChange={(e) => setMessageToSend(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{
            width: `${props.chatWidth}`,
            padding: "12px",
            paddingRight: "40px",
            borderRadius: "10px",
            border: "1px solid #41444a",
            fontSize: "16px",
            outline: "none",
            height: "25px",
            backgroundColor: "#41444a",
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold",
            color: "#fff",
          }}
          placeholder="Type your message..."
        />
        <button
          onClick={handleSendMessage}
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "8px 16px",
            backgroundColor: "transparent",
            color: "#4752C4",
            border: "none",
            outline: "none",
            cursor: "pointer",
            fontSize: "18px",
            fontFamily: "Inter, sans-serif",
            fontWeight: "bold",
          }}
        >
          <img
            src={sendIcon}
            alt="Send"
            style={{ width: "20px", height: "20px" }}
          />
        </button>
      </div>
    </div>
  );
}

export default Chat;
