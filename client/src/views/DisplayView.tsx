import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import type { ChatMessage, MediaPayload, StageMood } from '../types';
import { GAME_LAUNCH_DISPLAY_MS, CHAT_HISTORY_MAX } from '@shared/constants';

import DisplayQuizView from '../games/quiz/DisplayQuizView';
import ReactionOverlay from '@/components/ReactionOverlay';
import ChatFeed from '@/components/ChatFeed';

import confetti from 'canvas-confetti';
import { QRCodeSVG } from 'qrcode.react';

// ---------------------------------------------------------------------------
// SFX file list — pre-decoded on unlock, gracefully handles missing files
// ---------------------------------------------------------------------------
const SFX_FILES = [
  'drumroll', 'fanfare', 'applause', 'suspense',
  'intro', 'static', 'wrong', 'correct', 'micdrop',
];

// ---------------------------------------------------------------------------
// Atmosphere CSS (injected once)
// ---------------------------------------------------------------------------
const ATMOSPHERE_STYLES = `
@keyframes atmos-hype {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes atmos-chill {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes disconnect-pulse {
  0%, 100% { border-color: rgba(233,69,96,0.2); }
  50%      { border-color: rgba(233,69,96,0.8); }
}
`;

const MOOD_CLASSES: Record<StageMood, React.CSSProperties> = {
  neutral: {
    background: 'linear-gradient(135deg, #0a0a1a, #1a1a2e, #0a0a1a)',
    backgroundSize: '100% 100%',
  },
  hype: {
    background: 'linear-gradient(135deg, #e94560, #ff6b35, #1a1a2e, #e94560, #ff6b35)',
    backgroundSize: '400% 400%',
    animation: 'atmos-hype 3s ease infinite',
  },
  chill: {
    background: 'linear-gradient(135deg, #0a1a2e, #0a2e2e, #1a1a2e, #0a1a2e, #0a2e2e)',
    backgroundSize: '400% 400%',
    animation: 'atmos-chill 8s ease infinite',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DisplayView() {
  const { isConnected, socket, gameState } = useSocket();

  // Local UI state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [mediaPayload, setMediaPayload] = useState<MediaPayload | null>(null);
  const [showGameLaunch, setShowGameLaunch] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const prevActiveRound = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Audio engine refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const prevCueRef = useRef<string | null>(null);
  const prevMusicRef = useRef<string | null>(null);

  // Stage state (with safe defaults)
  const stage = gameState?.stage ?? { mood: 'neutral' as const, overlay: { type: null }, audio: { cue: null, music: null } };
  const mood = stage.mood;
  const overlay = stage.overlay;

  // ------------------------------------------------------------------
  // Audio init on mount (no user interaction required)
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // Pre-decode SFX (fire and forget, failures are fine)
    Promise.allSettled(
      SFX_FILES.map(async (name) => {
        try {
          const res = await fetch(`/sfx/${name}.mp3`);
          if (!res.ok) throw new Error(`${res.status}`);
          const buf = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          buffersRef.current.set(name, decoded);
        } catch {
          console.warn(`[audio] Could not load /sfx/${name}.mp3 — skipping`);
        }
      }),
    ).then(() => setAudioReady(true));

    return () => { ctx.close(); };
  }, []);

  // ------------------------------------------------------------------
  // Audio cue playback
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioReady) return;

    const cue = stage.audio.cue;
    if (cue && cue !== prevCueRef.current) {
      const buffer = buffersRef.current.get(cue);
      if (buffer) {
        ctx.resume();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      } else {
        console.warn(`[audio] No buffer for cue "${cue}"`);
      }
    }
    prevCueRef.current = cue;
  }, [stage.audio.cue, audioReady]);

  // ------------------------------------------------------------------
  // Music loop
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioReady) return;

    const music = stage.audio.music;
    if (music === prevMusicRef.current) return;
    prevMusicRef.current = music;

    // Stop current music
    if (musicSourceRef.current) {
      try { musicSourceRef.current.stop(); } catch { /* already stopped */ }
      musicSourceRef.current = null;
    }

    if (music) {
      const buffer = buffersRef.current.get(music);
      if (buffer) {
        ctx.resume();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(ctx.destination);
        source.start();
        musicSourceRef.current = source;
      } else {
        console.warn(`[audio] No buffer for music "${music}"`);
      }
    }
  }, [stage.audio.music, audioReady]);

  // ------------------------------------------------------------------
  // Game launch splash
  // ------------------------------------------------------------------
  useEffect(() => {
    if (gameState?.activeRound && !prevActiveRound.current) {
      setShowGameLaunch(true);
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 200 });
      setTimeout(() => setShowGameLaunch(false), GAME_LAUNCH_DISPLAY_MS);
    }
    prevActiveRound.current = gameState?.activeRound || null;
  }, [gameState?.activeRound]);

  // ------------------------------------------------------------------
  // Socket events
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    socket.on('triggerAnimation', (type: string) => {
      if (type === 'confetti') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
    });

    socket.on('chatMessage', (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message].slice(-CHAT_HISTORY_MAX));
    });

    socket.on('playMedia', (payload: MediaPayload) => {
      setMediaPayload(payload);
      if (payload.duration) {
        setTimeout(() => setMediaPayload(null), payload.duration * 1000);
      }
    });

    return () => {
      socket.off('triggerAnimation');
      socket.off('chatMessage');
      socket.off('playMedia');
    };
  }, [socket]);

  // Legacy media autoplay
  useEffect(() => {
    if (mediaPayload?.type === 'video' && videoRef.current) {
      videoRef.current.play().catch(e => console.error('Video play failed', e));
    } else if (mediaPayload?.type === 'audio' && audioRef.current) {
      audioRef.current.play().catch(e => console.error('Audio play failed', e));
    }
  }, [mediaPayload]);

  // Helpers
  const sortedTeams = gameState?.teams ? [...gameState.teams].sort((a, b) => b.score - a.score) : [];
  const showMedia = gameState?.show?.mediaState;
  const joinUrl = `${window.location.origin}/player`;

  // Timer bar values (for quiz)
  const quiz = gameState?.quiz;
  const timerPercent = quiz && quiz.config.timePerQuestion > 0
    ? (quiz.timer / quiz.config.timePerQuestion) * 100
    : 0;

  // Determine if we should show the quiz timer bar
  const showTimerBar = overlay.type === 'game'
    && gameState?.activeRound === 'QUIZ'
    && quiz?.phase === 'QUESTION';

  // ------------------------------------------------------------------
  // Main three-layer render
  // ------------------------------------------------------------------
  return (
    <>
      <style>{ATMOSPHERE_STYLES}</style>

      <div
        className="min-h-screen relative overflow-hidden font-sans"
        style={{
          color: 'var(--show-text)',
          // Disconnect indicator: pulsing red border
          border: !isConnected ? '3px solid transparent' : 'none',
          animation: !isConnected ? 'disconnect-pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        {/* ============================================================
            LAYER 1: Atmosphere
            ============================================================ */}
        <div
          className="absolute inset-0 z-0"
          style={{
            ...MOOD_CLASSES[mood],
            transition: 'background 1s ease, background-size 1s ease',
          }}
        />

        {/* ============================================================
            LAYER 2: Overlay
            ============================================================ */}
        <div className="relative z-10 min-h-screen flex flex-col">
          {/* Quiz timer bar — top of screen, always visible during questions */}
          {showTimerBar && (
            <div className="absolute top-0 left-0 right-0 z-30 h-[6px]">
              <motion.div
                className="h-full"
                animate={{ width: `${timerPercent}%` }}
                transition={{ duration: 0.8, ease: 'linear' }}
                style={{
                  background: timerPercent > 60
                    ? '#00c896'
                    : timerPercent > 30
                      ? '#ffb700'
                      : '#e94560',
                }}
              />
            </div>
          )}

          {/* Disconnect badge */}
          {!isConnected && (
            <div
              className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-mono z-50"
              style={{ backgroundColor: 'rgba(233,69,96,0.2)', color: 'var(--show-accent)' }}
            >
              Reconnecting...
            </div>
          )}

          {/* Reactions + Chat (always on) */}
          <ReactionOverlay />
          <ChatFeed messages={chatMessages} />

          {/* Main overlay content */}
          <div className="flex-1 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {/* Game launch splash (highest priority) */}
              {showGameLaunch ? (
                <motion.div
                  key="launch"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="absolute inset-0 z-40 flex flex-col items-center justify-center"
                  style={{ backgroundColor: 'rgba(10,10,26,0.95)' }}
                >
                  <h1
                    className="text-[96px] font-black uppercase tracking-wider text-center px-8"
                    style={{
                      color: 'var(--show-accent)',
                      textShadow: '0 0 40px rgba(233,69,96,0.4)',
                    }}
                  >
                    {gameState?.activeRound === 'QUIZ' ? 'LIFE QUIZ' : 'GAME START'}
                  </h1>
                  <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-4xl font-light mt-4"
                    style={{ color: 'var(--show-text-muted)' }}
                  >
                    Get Ready!
                  </motion.div>
                </motion.div>

              /* ---- title overlay ---- */
              ) : overlay.type === 'title' ? (
                <motion.div
                  key="title"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center px-8"
                >
                  <h1
                    className="text-[72px] font-black leading-tight"
                    style={{
                      background: 'linear-gradient(135deg, #e94560, #ffb700, #00a8e8)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 4px 20px rgba(233,69,96,0.3))',
                    }}
                  >
                    {overlay.content}
                  </h1>
                </motion.div>

              /* ---- media overlay ---- */
              ) : overlay.type === 'media' ? (
                <motion.div
                  key="media"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center justify-center"
                >
                  {overlay.content && /\.(mp4|webm|ogg)$/i.test(overlay.content) ? (
                    <video
                      src={overlay.content}
                      autoPlay
                      className="max-w-[80vw] max-h-[80vh] rounded-xl"
                      style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                    />
                  ) : overlay.content ? (
                    <img
                      src={overlay.content}
                      className="max-w-[80vw] max-h-[80vh] rounded-xl"
                      style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                    />
                  ) : null}
                </motion.div>

              /* ---- leaderboard overlay ---- */
              ) : overlay.type === 'leaderboard' || gameState?.showLeaderboard ? (
                <motion.div
                  key="leaderboard"
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="w-full max-w-4xl mx-auto p-8 text-center rounded-3xl"
                  style={{
                    backgroundColor: 'rgba(26,26,46,0.8)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <h1
                    className="text-[48px] font-bold mb-12 uppercase tracking-[6px]"
                    style={{ color: 'var(--show-accent)' }}
                  >
                    Leaderboard
                  </h1>
                  <div className="space-y-3">
                    {sortedTeams.map((team, index) => {
                      const medalColor = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : undefined;
                      return (
                        <motion.div
                          key={team.id}
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center px-6 py-5 rounded-xl"
                          style={{
                            backgroundColor: medalColor ? `${medalColor}10` : 'rgba(255,255,255,0.05)',
                            border: medalColor ? `1px solid ${medalColor}40` : '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <span
                            className="text-3xl font-bold w-16"
                            style={{ color: medalColor || 'var(--show-text-muted)' }}
                          >
                            #{index + 1}
                          </span>
                          <div className="w-5 h-5 rounded-full mr-4" style={{ backgroundColor: team.color }} />
                          <span className="text-2xl font-bold flex-grow text-left" style={{ color: 'var(--show-text)' }}>
                            {team.name}
                          </span>
                          <span className="text-3xl font-bold" style={{ color: 'var(--show-warning)' }}>
                            {team.score} pts
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>

              /* ---- QR code overlay ---- */
              ) : overlay.type === 'qr' ? (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <h1
                    className="text-[96px] font-black tracking-tighter leading-none mb-10"
                    style={{
                      background: 'linear-gradient(135deg, #e94560, #ffb700, #00a8e8)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 4px 20px rgba(233,69,96,0.3))',
                    }}
                  >
                    30 Years of J
                  </h1>
                  <div className="flex items-center justify-center gap-8">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: '#fff' }}>
                      <QRCodeSVG value={joinUrl} size={200} level="M" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm uppercase tracking-[3px] mb-2" style={{ color: 'var(--show-text-dim)' }}>
                        Join the game
                      </p>
                      <p className="text-3xl font-bold font-mono" style={{ color: 'var(--show-text)' }}>
                        {joinUrl.replace(/^https?:\/\//, '')}
                      </p>
                    </div>
                  </div>
                </motion.div>

              /* ---- game overlay (quiz, etc.) ---- */
              ) : overlay.type === 'game' ? (
                <motion.div
                  key="game"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full flex flex-col items-center justify-center"
                >
                  {gameState?.activeRound === 'QUIZ' && gameState ? (
                    <DisplayQuizView gameState={gameState} />
                  ) : null}
                </motion.div>

              /* ---- ShowRunner media segment (backwards compat) ---- */
              ) : showMedia && showMedia.phase === 'PLAYING' ? (
                <motion.div
                  key="show-media"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center justify-center"
                >
                  {showMedia.title && (
                    <motion.h2
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-3xl font-light uppercase tracking-[8px] mb-8"
                      style={{ color: 'var(--show-text-muted)' }}
                    >
                      {showMedia.title}
                    </motion.h2>
                  )}
                  {showMedia.src.match(/\.(mp4|webm|ogg)$/i) ? (
                    <video
                      src={showMedia.src}
                      autoPlay
                      className="max-w-full max-h-[80vh] rounded-xl"
                      style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                    />
                  ) : (
                    <img
                      src={showMedia.src}
                      className="max-w-full max-h-[80vh] rounded-xl"
                      style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
                    />
                  )}
                </motion.div>

              /* ---- null / lobby (default) ---- */
              ) : (
                <motion.div
                  key="lobby"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center w-full max-w-6xl px-8"
                >
                  <h1
                    className="text-[96px] font-black tracking-tighter leading-none"
                    style={{
                      background: 'linear-gradient(135deg, #e94560, #ffb700, #00a8e8)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 4px 20px rgba(233,69,96,0.3))',
                    }}
                  >
                    30 Years of J
                  </h1>

                  {/* QR code + URL */}
                  <div className="flex items-center justify-center gap-8 mt-10">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: '#fff' }}>
                      <QRCodeSVG value={joinUrl} size={200} level="M" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm uppercase tracking-[3px] mb-2" style={{ color: 'var(--show-text-dim)' }}>
                        Join the game
                      </p>
                      <p className="text-3xl font-bold font-mono" style={{ color: 'var(--show-text)' }}>
                        {joinUrl.replace(/^https?:\/\//, '')}
                      </p>
                    </div>
                  </div>

                  {gameState?.teams.length === 0 ? (
                    <p
                      className="text-xl mt-8 animate-pulse font-light"
                      style={{ color: 'var(--show-text-muted)' }}
                    >
                      Waiting for teams to join...
                    </p>
                  ) : (
                    <div className="mt-10">
                      <p
                        className="text-lg mb-6 uppercase tracking-[4px]"
                        style={{ color: 'var(--show-text-dim)' }}
                      >
                        {gameState?.teams.length} team{gameState?.teams.length !== 1 ? 's' : ''} joined
                      </p>
                      <div className="flex flex-wrap justify-center gap-4">
                        {gameState?.teams.map((team, i) => (
                          <motion.div
                            key={team.id}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: i * 0.05, type: 'spring' }}
                            className="flex items-center gap-3 px-5 py-3 rounded-full"
                            style={{
                              backgroundColor: 'var(--show-bg-surface)',
                              border: `1px solid ${team.color}40`,
                            }}
                          >
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                            <span className="text-xl font-bold" style={{ color: 'var(--show-text)' }}>
                              {team.name}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ============================================================
            Legacy media overlay (from adminPlayMedia)
            ============================================================ */}
        <AnimatePresence>
          {mediaPayload?.type === 'video' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(10,10,26,0.9)' }}
            >
              <video
                ref={videoRef}
                src={mediaPayload.url}
                className="max-w-full max-h-full rounded-xl"
                onEnded={() => setMediaPayload(null)}
                controls={false}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {mediaPayload?.type === 'audio' && (
          <audio
            ref={audioRef}
            src={mediaPayload.url}
            onEnded={() => setMediaPayload(null)}
            className="hidden"
          />
        )}
      </div>
    </>
  );
}
