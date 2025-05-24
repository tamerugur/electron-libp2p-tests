import { useState, useEffect, useRef } from "react";
import micIcon from "../assets/micIcon.svg";
import micOffIcon from "../assets/micOffIcon.svg";

function VoiceChat(props) {
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState("");
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const audioContextRef = useRef(null);

  useEffect(() => {
    // Set up event listeners
    window.electronAPI.onVoiceChatPeerConnected(handlePeerConnected);
    window.electronAPI.onVoiceChatPeerDisconnected(handlePeerDisconnected);
    window.electronAPI.onVoiceChatError(handleVoiceChatError);
    window.electronAPI.onSignalingData(handleSignalingData);

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      // Close all peer connections
      peerConnectionsRef.current.forEach((conn) => {
        conn.close();
      });
      window.electronAPI.removeSignalingDataListener();
      window.electronAPI.removeMessageListeners();
    };
  }, []);

  const handlePeerConnected = async ({ peerId, type }) => {
    try {
      console.log("Peer connected:", peerId, type);
      setPeers((prev) => new Set([...prev, peerId]));

      if (type === "incoming") {
        // Set up WebRTC for incoming connection
        await setupWebRTCConnection(peerId);
      }
    } catch (err) {
      console.error("Error handling peer connection:", err);
      setError("Failed to establish peer connection");
    }
  };

  const handlePeerDisconnected = ({ peerId }) => {
    console.log("Peer disconnected:", peerId);
    setPeers((prev) => {
      const newPeers = new Set(prev);
      newPeers.delete(peerId);
      return newPeers;
    });

    // Clean up peer connection
    const peerConnection = peerConnectionsRef.current.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(peerId);
    }
  };

  const handleVoiceChatError = ({ error }) => {
    console.error("Voice chat error:", error);
    setError(error);
  };

  const setupWebRTCConnection = async (peerId) => {
    try {
      console.log("Setting up WebRTC connection for peer:", peerId);
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          {
            urls: "stun:global.stun.twilio.com:3478",
          },
          {
            urls: [
              "turn:global.turn.twilio.com:3478?transport=udp",
              "turn:global.turn.twilio.com:3478?transport=tcp",
            ],
            username:
              "88a4fe9eeb4026d09b3f3d32affe583b71bc89ad73ede54acc24efc46e08d503",
            credential: "5+a4RLeKZuTFw/B0q92TdCXhV3jCqUlDsCCaxDi3V7U=",
          },
          {
            urls: "turn:global.turn.twilio.com:443?transport=tcp",
            username:
              "88a4fe9eeb4026d09b3f3d32affe583b71bc89ad73ede54acc24efc46e08d503",
            credential: "5+a4RLeKZuTFw/B0q92TdCXhV3jCqUlDsCCaxDi3V7U=",
          },
        ],
        iceCandidatePoolSize: 10,
      });

      // Store the peer connection
      peerConnectionsRef.current.set(peerId, peerConnection);

      // Add local stream tracks to the connection
      if (localStreamRef.current) {
        console.log("Adding local stream tracks to connection");
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log("Received remote track");
        const [remoteStream] = event.streams;
        const videoEl = document.getElementById(`video-${peerId}`);
        if (videoEl) {
          videoEl.srcObject = remoteStream;
        }
      };

      // Monitor ICE gathering state
      peerConnection.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", peerConnection.iceGatheringState);
        setConnectionStatus(
          `ICE gathering: ${peerConnection.iceGatheringState}`
        );
      };

      // Monitor connection state
      peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState);
        setConnectionStatus(`Connection: ${peerConnection.connectionState}`);

        if (peerConnection.connectionState === "connected") {
          console.log("WebRTC connection established successfully");
        } else if (
          ["disconnected", "failed", "closed"].includes(
            peerConnection.connectionState
          )
        ) {
          console.error("WebRTC connection failed or closed");
          handlePeerDisconnected({ peerId });
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("New ICE candidate:", event.candidate.type);
          // Send the ICE candidate to the peer through your signaling channel
          window.electronAPI.sendSignalingData(peerId, {
            type: "ice-candidate",
            candidate: event.candidate,
          });
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      console.log("Local description set, sending offer");

      // Send the offer to the peer through your signaling channel
      window.electronAPI.sendSignalingData(peerId, {
        type: "offer",
        sdp: offer,
      });

      return peerConnection;
    } catch (err) {
      console.error("Error setting up WebRTC connection:", err);
      throw err;
    }
  };

  const handleSignalingData = async (data, peerId) => {
    try {
      console.log("Received signaling data:", data.type, "from peer:", peerId);
      const peerConnection =
        peerConnectionsRef.current.get(peerId) ||
        (await setupWebRTCConnection(peerId));

      if (data.type === "offer") {
        console.log("Processing offer");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send the answer back
        window.electronAPI.sendSignalingData(peerId, {
          type: "answer",
          sdp: answer,
        });
      } else if (data.type === "answer") {
        console.log("Processing answer");
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );
      } else if (data.type === "ice-candidate") {
        console.log("Adding ICE candidate");
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      }
    } catch (err) {
      console.error("Error handling signaling data:", err);
      setError("Failed to establish peer connection");
    }
  };

  const playRemoteStream = (stream) => {
    try {
      console.log("Playing remote stream");
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 1.0; // Adjust volume as needed

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      console.log("Remote stream connected to audio output");
    } catch (err) {
      console.error("Error playing remote stream:", err);
      setError("Failed to play remote audio");
    }
  };

  // Add function to play local audio (for monitoring)
  const setupLocalAudioMonitoring = (stream) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.5; // Lower volume for local monitoring

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      console.log("Local audio monitoring enabled");
    } catch (err) {
      console.error("Error setting up local audio monitoring:", err);
    }
  };

  const startVoiceChat = async () => {
    try {
      console.log("Starting voice chat...");

      // Initialize voice chat handlers first
      const initResult = await window.electronAPI.initVoiceChat();
      if (initResult.error) {
        throw new Error(initResult.error);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: { width: 640, height: 480 },
      });

      console.log("Got media stream");
      localStreamRef.current = stream;
      setIsConnected(true);
      setError(null);

      // Initially mute the stream
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });

      // Initialize audio context and set up local monitoring
      setupLocalAudioMonitoring(stream);

      // Get the list of connected peers from libp2p node
      const connections = await window.electronAPI.getConnections();
      console.log("Current connections:", connections);

      // If we already have peers, set up connections with them
      if (connections && connections.length > 0) {
        console.log("Setting up connections with existing peers:", connections);
        for (const connection of connections) {
          try {
            await setupWebRTCConnection(connection.peerId);
            console.log(
              "Successfully set up connection with peer:",
              connection.peerId
            );
          } catch (err) {
            console.error(
              "Failed to set up connection with peer:",
              connection.peerId,
              err
            );
          }
        }
      } else {
        console.log("No existing peers to connect to");
      }
    } catch (err) {
      console.error("Error starting voice chat:", err);
      setError(
        err.message ||
          "Could not start voice chat. Make sure you are connected to a peer first."
      );
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
        console.log("Microphone " + (isMuted ? "unmuted" : "muted"));
      }
    }
  };

  return (
    <div
      style={{
        height: props.chatHeight,
        width: props.chatWidth,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: "#303136",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px",
        padding: "20px",
        color: "white",
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>Voice Chat</h2>

      {error && (
        <div
          style={{
            color: "#ff4444",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {connectionStatus && (
        <div
          style={{
            marginBottom: "20px",
            textAlign: "center",
            color: connectionStatus.includes("connected")
              ? "#44ff44"
              : "#ffff44",
          }}
        >
          {connectionStatus}
        </div>
      )}
      {/* Local Video */}
      <video
        ref={(ref) => {
          if (ref && localStreamRef.current)
            ref.srcObject = localStreamRef.current;
        }}
        autoPlay
        muted
        style={{ width: "200px", borderRadius: "10px", marginBottom: "10px" }}
      />

      {/* Remote Video Container */}
      {Array.from(peers).map((peerId) => (
        <video
          key={peerId}
          id={`video-${peerId}`}
          autoPlay
          style={{ width: "200px", borderRadius: "10px", marginBottom: "10px" }}
        />
      ))}
      {!isConnected ? (
        <button
          onClick={startVoiceChat}
          style={{
            backgroundColor: "#5865F2",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            marginTop: "20px",
          }}
        >
          Join Voice Chat
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            width: "100%",
          }}
        >
          <div
            style={{
              backgroundColor: "#41444a",
              padding: "20px",
              borderRadius: "10px",
              textAlign: "center",
              width: "80%",
            }}
          >
            <p>Connected to Voice Chat</p>
            <p style={{ fontSize: "0.9em", color: "#aaa" }}>
              {peers.size} peer{peers.size !== 1 ? "s" : ""} connected
            </p>
          </div>

          <button
            onClick={toggleMute}
            style={{
              backgroundColor: isMuted ? "#ff4444" : "#44ff44",
              color: "white",
              padding: "15px",
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              width: "50px",
              height: "50px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={isMuted ? micOffIcon : micIcon}
              alt={isMuted ? "Unmute" : "Mute"}
              style={{ width: "24px", height: "24px" }}
            />
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceChat;
