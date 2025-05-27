import React, { useState, useEffect, useRef } from "react";

const VoiceChat = ({ chatHeight, chatWidth, currentPeerAddr }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callStatus, setCallStatus] = useState("Idle"); // Idle, Calling, Connected, Error, Terminated
  const [peerId, setPeerId] = useState(null); // PeerID of the other user in the call

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]); // Queue for incoming audio chunks
  const isPlayingRef = useRef(false); // To prevent multiple playNextChunk calls
  const localStreamRef = useRef(null); // To store the local media stream for stopping tracks

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
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    isPlayingRef.current = true;

    const { chunk } = audioQueueRef.current.shift();

    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    // The chunk received from main.js should now be a Uint8Array.
    // We need its underlying ArrayBuffer for decodeAudioData.
    let arrayBufferChunk;
    if (chunk instanceof ArrayBuffer) {
      arrayBufferChunk = chunk;
    } else if (chunk instanceof Uint8Array) {
      arrayBufferChunk = chunk.buffer; // Get the underlying ArrayBuffer from Uint8Array
    } else if (chunk && chunk.type === "Buffer" && Array.isArray(chunk.data)) {
      // Fallback for old format, though main.js should send Uint8Array now
      console.warn(
        "Received chunk in legacy {type: 'Buffer'} format. Converting."
      );
      arrayBufferChunk = new Uint8Array(chunk.data).buffer;
    } else {
      console.error(
        "Received chunk is not in a recognized format (ArrayBuffer, Uint8Array, or legacy Buffer object):",
        chunk
      );
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) setTimeout(playNextChunk, 0);
      return;
    }

    if (!arrayBufferChunk || arrayBufferChunk.byteLength === 0) {
      console.warn("Received empty audio chunk. Skipping playback.");
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
        if (audioQueueRef.current.length > 0) {
          playNextChunk();
        }
      };
      source.start();
    } catch (error) {
      console.error(
        "Error playing audio chunk:",
        error,
        "Chunk length:",
        arrayBufferChunk.byteLength
      );
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) setTimeout(playNextChunk, 0); // Try next if error
    }
  };

  useEffect(() => {
    const handleVoiceCallInitiated = ({ peerAddr, streamId }) => {
      console.log(
        `Voice call initiated event with: ${peerAddr}, stream ID: ${streamId}`
      );
      setCallStatus("Connected");
      setPeerId(peerAddr);
      setInCall(true);
    };

    const handleIncomingVoiceCall = ({ peerId: remotePeerId, streamId }) => {
      console.log(
        `Incoming voice call event from: ${remotePeerId}, stream ID: ${streamId}`
      );
      setCallStatus("Connected"); // Auto-accept for now
      setPeerId(remotePeerId);
      setInCall(true);
    };

    const handleVoiceChunkReceived = ({ peerId: remotePeerId, chunk }) => {
      // console.log('Voice chunk received from:', remotePeerId, chunk);
      audioQueueRef.current.push({ peerId: remotePeerId, chunk });
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    };

    const handleVoiceCallTerminated = ({
      reason,
      peerId: terminatedPeerId,
    }) => {
      console.log(
        `Voice call terminated. Reason: ${reason}`,
        terminatedPeerId ? `Peer: ${terminatedPeerId}` : ""
      );
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
        // Ensure call is terminated if component unmounts during a call
        window.electronAPI
          .terminateVoiceCall()
          .catch((err) =>
            console.error("Error terminating call on unmount:", err)
          );
      }
    };
  }, [isMuted, inCall]); // Add inCall and isMuted to dependencies

  const startSendingAudio = async () => {
    // Primary gate: only proceed if in a call and not muted.
    // The `useEffect` hook that calls this already checks for `inCall && !isMuted`.
    // This is an additional safeguard, especially if called from elsewhere (e.g. toggleMute).
    if (!inCall) {
      console.warn(
        "startSendingAudio called but not in an active call. Aborting."
      );
      stopMediaRecording(); // Ensure media is stopped if we somehow get here without a call
      return;
    }
    if (isMuted) {
      console.log(
        "startSendingAudio called but currently muted. MediaRecorder will not send data."
      );
      // We might still want to ensure the mic is active for quick unmuting, but data sending is blocked by isMuted flag in ondataavailable
      // For now, we let it proceed to get user media if it wasn't already active.
    }

    // If MediaRecorder is already active and recording, don't try to restart it.
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      console.log("startSendingAudio: MediaRecorder already recording.");
      return;
    }

    // The old logic for initiating a call if currentPeerAddr is present is removed from here,
    // as initiateCall is now more explicitly handled by user action (clicking "Call Peer")
    // or by the effect hook reacting to `inCall` state changes triggered by call initiation/acceptance.

    console.log("Attempting to start sending audio...");

    try {
      // Ensure existing tracks are stopped before getting new user media, to avoid issues.
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream; // Store stream to stop tracks later
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && !isMuted) {
          const arrayBuffer = await event.data.arrayBuffer();
          // console.log("Sending voice chunk, size:", arrayBuffer.byteLength);
          const result = await window.electronAPI.sendVoiceChunk(
            new Uint8Array(arrayBuffer)
          );
          if (result && result.error) {
            console.error("Error sending voice chunk:", result.error);
            // Handle error, maybe stop call
            if (result.error === "No active voice stream.") {
              setCallStatus("Error: Stream lost");
              await hangUp(); // Attempt to clean up
            }
          }
        }
      };
      mediaRecorderRef.current.start(100); // Collect 100ms of audio at a time
      console.log("MediaRecorder started.");
    } catch (err) {
      console.error(
        "Error accessing microphone or starting MediaRecorder:",
        err
      );
      setCallStatus("Error: Mic access");
    }
  };

  const initiateCall = async (peerAddrToCall) => {
    if (inCall) {
      console.warn("Already in a call.");
      return;
    }
    console.log("Initiating call to:", peerAddrToCall);
    setCallStatus("Calling...");
    setPeerId(peerAddrToCall); // Tentatively set peerId
    const result = await window.electronAPI.initiateVoiceCall(peerAddrToCall);
    if (result && result.error) {
      console.error("Error initiating voice call:", result.error);
      setCallStatus("Error: Call failed");
      setPeerId(null);
      setInCall(false);
    } else if (result && result.success) {
      console.log("Voice call successfully initiated with:", result.peerAddr);
      // Success state (inCall, status) will be set by onVoiceCallInitiated handler
    }
  };

  const hangUp = async () => {
    console.log("Hanging up call...");
    setCallStatus("Terminating...");
    stopMediaRecording();
    // No need to call cleanupAudio here, onVoiceCallTerminated handler will do it

    const result = await window.electronAPI.terminateVoiceCall();
    if (result && result.error) {
      console.error("Error terminating voice call:", result.error);
      // Even if termination fails on main process, update UI
      setCallStatus("Idle");
      setInCall(false);
      setPeerId(null);
    } else {
      console.log("Voice call termination requested.");
      // Actual state change will be triggered by 'voice-call-terminated' event from main.
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (
      !isMuted &&
      inCall &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "inactive"
    ) {
      // If unmuting and recorder was stopped, restart it.
      // This scenario might happen if muted then call started.
      // More robustly, startSendingAudio should handle this.
      console.log("Unmuting, ensuring audio sending is active if in call.");
      startSendingAudio();
    } else if (
      isMuted &&
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      // When muting, we don't stop the MediaRecorder,
      // just stop sending data in ondataavailable.
      // If you wanted to stop the recorder:
      // mediaRecorderRef.current.stop();
      console.log(
        "Muted. MediaRecorder continues, but data sending is paused."
      );
    }
  };

  // Effect to start/stop sending audio when `inCall` or `isMuted` changes
  useEffect(() => {
    if (inCall && !isMuted) {
      startSendingAudio();
    } else if ((!inCall || isMuted) && mediaRecorderRef.current) {
      // Don't stop MediaRecorder on mute, just ondataavailable handles it.
      // Stop only if not in call.
      if (!inCall) {
        stopMediaRecording();
      }
    }
    // Cleanup on unmount is handled by the main useEffect return function
  }, [inCall, isMuted]);

  return (
    <div
      style={{
        height: chatHeight,
        width: chatWidth,
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#2a2b2f", // Slightly different from Chat.jsx for distinction
        color: "white",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px",
      }}
    >
      <h2>Voice Chat</h2>
      <div style={{ marginBottom: "10px" }}>Status: {callStatus}</div>
      {peerId && (
        <div style={{ marginBottom: "10px", fontSize: "0.8em" }}>
          Peer: {peerId}
        </div>
      )}

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
