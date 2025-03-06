interface voiceChatProps {
  chatHeight: string;
  chatWidth: string;
}

function VoiceChat(props: voiceChatProps) {
  return (
    <div
      style={{
        height: props.chatHeight,
        width: props.chatWidth,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        backgroundColor: "#303136",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px"
      }}
    >
      <h1>VoiceChat</h1>
    </div>
  );
}

export default VoiceChat;
