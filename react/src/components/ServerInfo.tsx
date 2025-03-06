interface serverInfoProps {
  chatHeight: string;
  chatWidth: string;
}

function ServerInfo(props: serverInfoProps) {
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
      <h1>Server Info</h1>
      <p>Server IP: </p>
      <p>Server Port: </p>
    </div>
  );
}

export default ServerInfo;
