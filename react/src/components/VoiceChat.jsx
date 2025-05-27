import React, { useState, useEffect, useRef } from "react";

const VoiceChat = ({ chatHeight, chatWidth, currentPeerAddr }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callStatus, setCallStatus] = useState("Idle");
  const [peerId, setPeerId] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const localStreamRef = useRef(null);

  const stopMediaRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      console.log("MediaRecorder stopped.");
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      console.log("Microphone access stopped.");
    }
  };

  const cleanupAudio = () => {
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current
        .close()
        .then(() => console.log("AudioContext closed."));
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const playNextChunk = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;

    const { chunk } = audioQueueRef.current.shift();

    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    let arrayBufferChunk;
    if (chunk instanceof ArrayBuffer) arrayBufferChunk = chunk;
    else if (chunk instanceof Uint8Array) arrayBufferChunk = chunk.buffer;
    else if (chunk && chunk.type === "Buffer" && Array.isArray(chunk.data)) {
      arrayBufferChunk = new Uint8Array(chunk.data).buffer;
    } else {
      console.error("Unrecognized audio chunk format:", chunk);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) setTimeout(playNextChunk, 0);
      return;
    }

    if (!arrayBufferChunk || arrayBufferChunk.byteLength === 0) {
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) setTimeout(playNextChunk, 0);
      return;
    }

    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(
        arrayBufferChunk
      );
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) playNextChunk();
      };
      source.start();
    } catch (error) {
      console.error("Error playing audio chunk:", error);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) setTimeout(playNextChunk, 0);
    }
  };

  useEffect(() => {
    const handleVoiceCallInitiated = ({ peerAddr }) => {
      setCallStatus("Connected");
      setPeerId(peerAddr);
      setInCall(true);
    };

    const handleIncomingVoiceCall = ({ peerId: remotePeerId }) => {
      setCallStatus("Connected");
      setPeerId(remotePeerId);
      setInCall(true);
    };

    const handleVoiceChunkReceived = ({ chunk }) => {
      audioQueueRef.current.push({ chunk });
      if (!isPlayingRef.current) playNextChunk();
    };

    const handleVoiceCallTerminated = () => {
      setCallStatus("Terminated");
      setInCall(false);
      setPeerId(null);
      stopMediaRecording();
      cleanupAudio();
    };

    window.electronAPI.onVoiceCallInitiated(handleVoiceCallInitiated);
    window.electronAPI.onIncomingVoiceCall(handleIncomingVoiceCall);
    window.electronAPI.onVoiceChunkReceived(handleVoiceChunkReceived);
    window.electronAPI.onVoiceCallTerminated(handleVoiceCallTerminated);

    return () => {
      window.electronAPI.removeAllVoiceChatListeners();
      stopMediaRecording();
      cleanupAudio();
      if (inCall) {
        window.electronAPI.terminateVoiceCall().catch(console.error);
      }
    };
  }, [isMuted, inCall]);

  const startSendingAudio = async () => {
    if (!inCall) return stopMediaRecording();
    if (isMuted) return;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    )
      return;

    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && !isMuted) {
          const arrayBuffer = await event.data.arrayBuffer();
          await window.electronAPI.sendVoiceChunk(new Uint8Array(arrayBuffer));
        }
      };
      mediaRecorderRef.current.start(100);
    } catch (err) {
      console.error("Error starting audio:", err);
      setCallStatus("Error: Mic access");
    }
  };

  const initiateCall = async (peerAddrToCall) => {
    if (inCall) return;
    setCallStatus("Calling...");
    setPeerId(peerAddrToCall);
    const result = await window.electronAPI.initiateVoiceCall(peerAddrToCall);
    if (result?.error) {
      setCallStatus("Error: Call failed");
      setPeerId(null);
      setInCall(false);
    }
  };

  const hangUp = async () => {
    setCallStatus("Terminating...");
    stopMediaRecording();
    await window.electronAPI.terminateVoiceCall();
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
    if (!isMuted && inCall && mediaRecorderRef.current?.state === "inactive") {
      startSendingAudio();
    }
  };

  useEffect(() => {
    if (inCall && !isMuted) {
      startSendingAudio();
    } else if (!inCall) {
      stopMediaRecording();
    }
  }, [inCall, isMuted]);

  return (
    <div
      style={{
        height: chatHeight,
        width: chatWidth,
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        backgroundColor: "#2a2b2f",
        color: "white",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px",
      }}
    >
      <h2>Voice Chat</h2>
      <div>Status: {callStatus}</div>
      {peerId && <div>Connected to: {peerId}</div>}
      {!inCall && currentPeerAddr && (
        <button
          onClick={() => initiateCall(currentPeerAddr)}
          style={buttonStyle}
        >
          Call Peer
        </button>
      )}
      {inCall && (
        <>
          <button onClick={toggleMute} style={buttonStyle}>
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={hangUp}
            style={{ ...buttonStyle, backgroundColor: "#d9534f" }}
          >
            Hang Up
          </button>
        </>
      )}
      {callStatus.startsWith("Error") && (
        <button
          onClick={() => {
            setCallStatus("Idle");
            setInCall(false);
            setPeerId(null);
          }}
          style={{ ...buttonStyle, backgroundColor: "#f0ad4e" }}
        >
          Dismiss Error
        </button>
      )}
    </div>
  );
};

const buttonStyle = {
  padding: "8px 15px",
  margin: "5px",
  borderRadius: "5px",
  border: "none",
  cursor: "pointer",
  backgroundColor: "#5cb85c",
  color: "white",
  fontSize: "14px",
};

export default VoiceChat;
