import sendIcon from "../assets/sendIcon.svg";

interface voiceChatProps {
  chatHeight: string;
  chatWidth: string;
}

function Chat(props: voiceChatProps) {
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
        }}
      ></div>
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
          }}
          placeholder="Type your message..."
        />
        <button
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
