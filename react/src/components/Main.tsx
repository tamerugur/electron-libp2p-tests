// project imports
import Chat from "./Chat";
import ServerInfo from "./ServerInfo";
import VoiceChat from "./VoiceChat";

function Main() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#212226",
        padding: "0",
      }}
    >
      <VoiceChat chatHeight="96vh" chatWidth="26vw" />
      <Chat chatHeight="96vh" chatWidth="46vw" />
      <ServerInfo chatHeight="96vh" chatWidth="26vw" />
    </div>
  );
}

export default Main;
