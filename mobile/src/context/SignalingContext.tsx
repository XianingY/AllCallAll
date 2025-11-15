import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform
} from "react-native";
import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices
} from "react-native-webrtc";

import { SignalingClient, SignalMessage } from "../api/signaling";
import { useAuthContext } from "./AuthContext";

type CallDirection = "incoming" | "outgoing";

type SessionDescriptionPayload = RTCSessionDescriptionInit;

type IceCandidatePayload = RTCIceCandidateInit;

interface CallSession {
  callId: string;
  peerEmail: string;
  direction: CallDirection;
  offer?: SessionDescriptionPayload;
}

type CallStatus = "idle" | "connecting" | "incoming" | "in_call";

interface SignalingContextValue {
  status: CallStatus;
  session: CallSession | null;
  connectionReady: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (email: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
}

const SignalingContext = createContext<SignalingContextValue | undefined>(
  undefined
);

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

const isSessionDescriptionPayload = (
  value: unknown
): value is SessionDescriptionPayload => {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sdp?: unknown }).sdp === "string" &&
    typeof (value as { type?: unknown }).type === "string"
  );
};

const isIceCandidatePayload = (
  value: unknown
): value is IceCandidatePayload => {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { candidate?: unknown }).candidate === "string"
  );
};

export const SignalingProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const { token, user } = useAuthContext();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [session, setSession] = useState<CallSession | null>(null);
  const [connectionReady, setConnectionReady] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const pendingTarget = useRef<string | null>(null);
  const pendingLocalCandidates = useRef<IceCandidatePayload[]>([]);
  const pendingRemoteCandidates = useRef<IceCandidatePayload[]>([]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const ensureAudioPermission = useCallback(async () => {
    if (Platform.OS === "android") {
      const permissions: string[] = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      ];

      if (Platform.Version >= 31) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }

      // 部分厂商在仅采集音频时也会检查摄像头权限，提前申请避免崩溃
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);

      const result = await PermissionsAndroid.requestMultiple(permissions, {
        title: "语音通话权限",
        message: "AllCallAll 需要访问麦克风 / 蓝牙设备以进行语音通话",
        buttonPositive: "允许"
      });

      return permissions.every(
        (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }, []);

  const resetPeerResources = useCallback(() => {
    pendingLocalCandidates.current = [];
    pendingRemoteCandidates.current = [];

    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
    }

    setLocalStream(null);
    setRemoteStream(null);
  }, [localStream, remoteStream]);

  const resetCallState = useCallback(() => {
    pendingTarget.current = null;
    setSession(null);
    sessionRef.current = null;
    setStatus("idle");
    resetPeerResources();
  }, [resetPeerResources]);

  const sendMessage = useCallback((message: SignalMessage) => {
    const client = signalingRef.current;
    if (!client) {
      console.warn("No active signaling client, message dropped", message);
      if (message.type !== "ice.candidate") {
        Alert.alert("Connection issue", "Signaling service not connected.");
      }
      return;
    }
    try {
      const sent = client.send(message);
      if (!sent) {
        console.debug("Signaling message queued until connection recovers", message.type);
      }
    } catch (error) {
      console.error("Failed to send signaling message", error);
      if (message.type !== "ice.candidate") {
        Alert.alert("Connection issue", "Unable to send signaling message.");
      }
    }
  }, []);

  const enqueueRemoteCandidate = useCallback((candidate: IceCandidatePayload) => {
    const alreadyQueued = pendingRemoteCandidates.current.some(
      (item) =>
        item.candidate === candidate.candidate &&
        item.sdpMid === candidate.sdpMid &&
        item.sdpMLineIndex === candidate.sdpMLineIndex
    );
    if (!alreadyQueued) {
      pendingRemoteCandidates.current.push(candidate);
    }
  }, []);

  const flushPendingLocalCandidates = useCallback(
    (callId: string, peerEmail: string) => {
      if (!pendingLocalCandidates.current.length) {
        return;
      }
      const items = [...pendingLocalCandidates.current];
      pendingLocalCandidates.current = [];
      items.forEach((candidate) =>
        sendMessage({
          type: "ice.candidate",
          call_id: callId,
          to: peerEmail,
          payload: candidate
        })
      );
    },
    [sendMessage]
  );

  const drainRemoteCandidates = useCallback(async () => {
    const pc = peerRef.current;
    if (!pc || !pendingRemoteCandidates.current.length) {
      return;
    }
    const items = [...pendingRemoteCandidates.current];
    pendingRemoteCandidates.current = [];
    for (const candidate of items) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn("Failed to add queued ICE candidate", error);
      }
    }
  }, []);

const createPeerConnection = useCallback(() => {
  const pc = new RTCPeerConnection({
    iceServers: STUN_SERVERS,
    bundlePolicy: "max-bundle",
    iceTransportPolicy: "all",
    sdpSemantics: "unified-plan"
  });

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      const candidateInit: IceCandidatePayload = {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? undefined,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined
      };
      const current = sessionRef.current;
      if (current?.callId) {
        sendMessage({
          type: "ice.candidate",
          call_id: current.callId,
          to: current.peerEmail,
          payload: candidateInit
        });
      } else {
        pendingLocalCandidates.current.push(candidateInit);
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        resetCallState();
      }
    };

    peerRef.current = pc;
    return pc;
  }, [resetCallState, sendMessage]);

  useEffect(() => {
    if (!token) {
      signalingRef.current?.disconnect();
      signalingRef.current = null;
      setConnectionReady(false);
      resetCallState();
      return;
    }

    const client = new SignalingClient(token);
    signalingRef.current = client;
    client.connect();

    const handleOpen = () => setConnectionReady(true);
    const handleClose = () => {
      setConnectionReady(false);
      resetCallState();
    };

    const handleMessage = async (message: SignalMessage) => {
      switch (message.type) {
        case "call.invite.ack":
          if (pendingTarget.current) {
            const newSession: CallSession = {
              callId: message.call_id ?? "",
              peerEmail: pendingTarget.current,
              direction: "outgoing"
            };
            sessionRef.current = newSession;
            setSession(newSession);
            setStatus("connecting");
            if (newSession.callId) {
              flushPendingLocalCandidates(
                newSession.callId,
                newSession.peerEmail
              );
            }
            pendingTarget.current = null;
          }
          break;
        case "call.invite":
          if (!message.from || !isSessionDescriptionPayload(message.payload)) {
            Alert.alert("呼叫错误", "收到无效的呼叫请求");
            break;
          }
          setSession({
            callId: message.call_id ?? "",
            peerEmail: message.from,
            direction: "incoming",
            offer: message.payload
          });
          setStatus("incoming");
          break;
        case "call.accept":
          if (isSessionDescriptionPayload(message.payload)) {
            const pc = peerRef.current;
            if (pc) {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(message.payload)
                );
                await drainRemoteCandidates();
              } catch (error) {
                console.warn("Failed to apply remote answer", error);
              }
            }
          }
          setStatus("in_call");
          setSession((current) =>
            current
              ? {
                  ...current,
                  callId: message.call_id ?? current.callId
                }
              : current
          );
          if (sessionRef.current && message.call_id) {
            const current = {
              ...sessionRef.current,
              callId: message.call_id
            };
            sessionRef.current = current;
            flushPendingLocalCandidates(current.callId, current.peerEmail);
          }
          break;
        case "call.reject":
          Alert.alert("Call rejected", `${message.from} declined the call.`);
          resetCallState();
          break;
        case "call.end":
          Alert.alert("Call ended", `${message.from ?? "Peer"} ended the call.`);
          resetCallState();
          break;
        case "ice.candidate":
          if (isIceCandidatePayload(message.payload)) {
            const pc = peerRef.current;
            if (pc) {
              const hasRemoteDescription =
                pc.remoteDescription !== null &&
                typeof pc.remoteDescription?.type === "string";
              if (hasRemoteDescription) {
                try {
                  await pc.addIceCandidate(
                    new RTCIceCandidate(message.payload)
                  );
                } catch (error) {
                  console.warn("Failed to add ICE candidate", error);
                }
              } else {
                enqueueRemoteCandidate(message.payload);
              }
            } else {
              enqueueRemoteCandidate(message.payload);
            }
          }
          break;
        case "call.error":
          Alert.alert("Call error", String(message.payload?.reason ?? "Error"));
          resetCallState();
          break;
        default:
          break;
      }
    };

    client.on("open", handleOpen);
    client.on("close", handleClose);
    client.on("message", handleMessage);
    client.on("error", (err) => console.warn("signaling error", err));

    return () => {
      client.off("open", handleOpen);
      client.off("close", handleClose);
      client.off("message", handleMessage);
      client.disconnect();
      signalingRef.current = null;
    };
  }, [flushPendingLocalCandidates, resetCallState, drainRemoteCandidates, enqueueRemoteCandidate, token]);

  const startCall = useCallback(
    async (email: string) => {
      if (!user || status !== "idle") {
        return;
      }

      const hasPermission = await ensureAudioPermission();
      if (!hasPermission) {
        Alert.alert("需要麦克风权限", "请在系统设置中授予麦克风或蓝牙权限。");
        return;
      }

      try {
        resetPeerResources();
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        setLocalStream(stream);

        const pc = createPeerConnection();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await pc.setLocalDescription(offer);

        pendingTarget.current = email;
        setStatus("connecting");
        sendMessage({
          type: "call.invite",
          to: email,
          payload: {
            sdp: offer.sdp,
            type: offer.type
          }
        });
      } catch (error) {
        console.error("startCall error", error);
        Alert.alert("无法发起通话", "请确认麦克风未被占用或已授权。");
        resetPeerResources();
        setStatus("idle");
      }
    },
    [createPeerConnection, ensureAudioPermission, resetPeerResources, sendMessage, status, user]
  );

  const acceptCall = useCallback(async () => {
    if (!session || session.direction !== "incoming" || !session.offer) {
      return;
    }

    const hasPermission = await ensureAudioPermission();
    if (!hasPermission) {
      Alert.alert("需要麦克风权限", "请在系统设置中授予麦克风权限。");
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      setLocalStream(stream);

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
      } catch (error) {
        console.warn("setRemoteDescription failed", error);
        Alert.alert("呼叫错误", "无法解析对方的连接请求");
        resetCallState();
        return;
      }

      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(answer);
      await drainRemoteCandidates();

      sendMessage({
        type: "call.accept",
        call_id: session.callId,
        to: session.peerEmail,
        payload: {
          sdp: answer.sdp,
          type: answer.type
        }
      });

      setStatus("in_call");
    } catch (error) {
      console.error("acceptCall error", error);
      Alert.alert("无法接通", "请确认麦克风或蓝牙权限已授权。");
      resetCallState();
    }
  }, [createPeerConnection, drainRemoteCandidates, ensureAudioPermission, resetCallState, sendMessage, session]);

  const rejectCall = useCallback(() => {
    if (!session) {
      return;
    }
    sendMessage({
      type: "call.reject",
      call_id: session.callId,
      to: session.peerEmail
    });
    resetCallState();
  }, [resetCallState, sendMessage, session]);

  const endCall = useCallback(() => {
    if (!session) {
      return;
    }
    sendMessage({
      type: "call.end",
      call_id: session.callId,
      to: session.peerEmail
    });
    resetCallState();
  }, [resetCallState, sendMessage, session]);

  const value = useMemo<SignalingContextValue>(
    () => ({
      status,
      session,
      connectionReady,
      localStream,
      remoteStream,
      startCall,
      acceptCall,
      rejectCall,
      endCall
    }),
    [
      status,
      session,
      connectionReady,
      localStream,
      remoteStream,
      startCall,
      acceptCall,
      rejectCall,
      endCall
    ]
  );

  return (
    <SignalingContext.Provider value={value}>
      {children}
    </SignalingContext.Provider>
  );
};

export const useSignaling = () => {
  const ctx = useContext(SignalingContext);
  if (!ctx) {
    throw new Error("useSignaling must be used within SignalingProvider");
  }
  return ctx;
};
