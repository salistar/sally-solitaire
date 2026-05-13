/**
 * @file RaceVoiceChat.tsx
 * @description Audio-only WebRTC voice chat overlay for the 1v1 race screen.
 * Both players auto-connect to a P2P audio call keyed by the match code, with
 * SDP/ICE signaling relayed via the existing `/webrtc` gateway.
 *
 * Three states:
 *   - `idle`     : button "🎤 Activer le micro"
 *   - `connecting`: spinner + "Connexion..."
 *   - `active`   : pulse indicator + mute + hangup buttons
 *
 * Native module: `react-native-webrtc` (installed in package.json). Doesn't
 * work in plain Expo Go (no native binaries). In Expo Go it falls back to a
 * clear "Voice chat requires a dev build" notice. In EAS/dev build, full P2P
 * audio works via the existing TURN server (sallycards-turn:3478).
 *
 * Signaling flow:
 *   1. Tap "Activer le micro" → getUserMedia({audio:true})
 *   2. Connect to /webrtc socket, emit `webrtc:join` { roomCode }
 *   3. On `webrtc:peers` (existing peers in room) → create offer for each
 *   4. On `webrtc:offer` → setRemoteDescription + createAnswer
 *   5. On `webrtc:answer` → setRemoteDescription
 *   6. Both sides exchange `webrtc:ice` candidates
 *   7. Remote audio plays automatically via the RTCPeerConnection's track event
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../shared/api';

// react-native-webrtc may not be available in Expo Go. Wrap import defensively.
let RTC: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RTC = require('react-native-webrtc');
} catch {
  RTC = null;
}

interface Props {
  /** Match code = WebRTC room code. */
  code: string;
  /** Current user's display name (shown to peer). */
  displayName: string;
  /** JWT for /webrtc auth. */
  authToken: string;
}

type CallState = 'idle' | 'connecting' | 'active' | 'unavailable';

export default function RaceVoiceChat({ code, displayName, authToken }: Props) {
  const [state, setState] = useState<CallState>(RTC == null ? 'unavailable' : 'idle');
  const [muted, setMuted] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);

  const teardown = useCallback(() => {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    try {
      localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop());
    } catch {}
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    try { socketRef.current?.emit('webrtc:leave', { roomCode: code }); } catch {}
    try { socketRef.current?.disconnect(); } catch {}
    socketRef.current = null;
    setPeerConnected(false);
  }, [code]);

  useEffect(() => () => teardown(), [teardown]);

  const startCall = useCallback(async () => {
    if (state !== 'idle' || RTC == null) return;
    setState('connecting');
    try {
      // 1. Get mic
      const stream = await RTC.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 2. Create peer connection (with TURN server for NAT traversal)
      const pc = new RTC.RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // Local TURN (when running on a real device on the same Wi-Fi as Docker)
          { urls: 'turn:localhost:3478', username: 'sallycards', credential: 'sallycards_dev_turn_2026' },
        ],
      });
      pcRef.current = pc;

      // Add local audio tracks
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

      pc.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          setPeerConnected(true);
        }
      };

      // 3. Connect signaling socket
      const sock = io(`${SOCKET_URL}/webrtc`, {
        auth: { token: authToken },
        transports: ['websocket'],
      });
      socketRef.current = sock;

      pc.onicecandidate = (event: any) => {
        if (event.candidate && sock.connected) {
          sock.emit('webrtc:ice', { roomCode: code, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setState('active');
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setPeerConnected(false);
        }
      };

      sock.on('connect', () => {
        sock.emit('webrtc:join', { roomCode: code });
      });

      // 4. When server tells us about existing peers, we initiate offer(s)
      sock.on('webrtc:peers', async (payload: { peers: string[]; me: string }) => {
        for (const peerSocketId of payload.peers ?? []) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          sock.emit('webrtc:offer', { roomCode: code, to: peerSocketId, sdp: offer });
        }
        setState('active');
      });

      // 5. Inbound offer → answer
      sock.on('webrtc:offer', async (payload: { from: string; sdp: any }) => {
        await pc.setRemoteDescription(new RTC.RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('webrtc:answer', { roomCode: code, to: payload.from, sdp: answer });
        setState('active');
      });

      // 6. Inbound answer
      sock.on('webrtc:answer', async (payload: { from: string; sdp: any }) => {
        await pc.setRemoteDescription(new RTC.RTCSessionDescription(payload.sdp));
      });

      // 7. ICE candidates from peer
      sock.on('webrtc:ice', async (payload: { from: string; candidate: any }) => {
        try { await pc.addIceCandidate(new RTC.RTCIceCandidate(payload.candidate)); } catch {}
      });

      sock.on('webrtc:left', () => setPeerConnected(false));
    } catch (e) {
      console.error('Voice chat init error:', e);
      teardown();
      setState('idle');
    }
  }, [code, authToken, state, teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks?.().forEach((t: any) => (t.enabled = !next));
    setMuted(next);
    // Optionally advertise mute state to peer
    socketRef.current?.emit('signal:mute', { roomCode: code, audio: !next, video: false });
  }, [muted, code]);

  const hangup = useCallback(() => {
    teardown();
    setState('idle');
    setMuted(false);
  }, [teardown]);

  if (state === 'unavailable') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.unavailableText}>🎤 Voice chat — requiert un dev build (Expo Go non supporté)</Text>
      </View>
    );
  }

  if (state === 'idle') {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.startBtn} onPress={startCall} activeOpacity={0.8}>
          <Text style={styles.startBtnText}>🎤 Activer le micro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'connecting') {
    return (
      <View style={[styles.wrap, styles.row]}>
        <ActivityIndicator size="small" color="#FCD34D" />
        <Text style={styles.connectingText}>Connexion vocale…</Text>
        <TouchableOpacity onPress={hangup} style={styles.hangupSmall}>
          <Text style={styles.hangupText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // active
  return (
    <View style={[styles.wrap, styles.row]}>
      <View style={[styles.dot, peerConnected && styles.dotActive]} />
      <Text style={styles.statusText}>
        {peerConnected ? `🟢 En appel — ${displayName}` : '🟡 En attente du peer…'}
      </Text>
      <TouchableOpacity onPress={toggleMute} style={[styles.iconBtn, muted && styles.iconBtnMuted]}>
        <Text style={styles.iconText}>{muted ? '🔇' : '🎤'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={hangup} style={styles.hangupBtn}>
        <Text style={styles.hangupText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    margin: 8,
    marginTop: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#7C3AED', alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },
  connectingText: { color: '#FCD34D', fontSize: 12 },
  unavailableText: { color: '#9CA3AF', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B7280' },
  dotActive: { backgroundColor: '#10B981' },
  statusText: { color: '#E9D5FF', fontSize: 12, flex: 1 },
  iconBtn: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(124,58,237,0.3)' },
  iconBtnMuted: { backgroundColor: 'rgba(220,38,38,0.4)' },
  iconText: { fontSize: 14 },
  hangupBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#DC2626' },
  hangupSmall: { padding: 4, marginLeft: 'auto' },
  hangupText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
