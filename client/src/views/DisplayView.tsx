import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import type { ChatMessage, MediaPayload } from '../types';
import { GAME_LAUNCH_DISPLAY_MS, REACTION_DISPLAY_DURATION_MS, CHAT_HISTORY_MAX } from '@shared/constants';

import DisplayQuizView from '../games/quiz/DisplayQuizView';
import ReactionOverlay from '@/components/ReactionOverlay';
import ChatFeed from '@/components/ChatFeed';

import confetti from 'canvas-confetti';
import { QRCodeSVG } from 'qrcode.react';

interface PlayerReactionState {
  type: string;
  timestamp: number;
}

export default function DisplayView() {
  const { isConnected, socket, gameState } = useSocket();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playerReactions, setPlayerReactions] = useState<Record<string, PlayerReactionState>>({});
  const [mediaPayload, setMediaPayload] = useState<MediaPayload | null>(null);
  const [showGameLaunch, setShowGameLaunch] = useState(false);
  const prevActiveRound = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Game launch splash
  useEffect(() => {
    if (gameState?.activeRound && !prevActiveRound.current) {
      setShowGameLaunch(true);
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 200 });
      setTimeout(() => setShowGameLaunch(false), GAME_LAUNCH_DISPLAY_MS);
    }
    prevActiveRound.current = gameState?.activeRound || null;
  }, [gameState?.activeRound]);

  // Socket event listeners (gameState comes from context, not a local listener)
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

    socket.on('reactionTriggered', (payload) => {
      setPlayerReactions(prev => ({
        ...prev,
        [payload.teamId]: { type: payload.type, timestamp: Date.now() }
      }));
      setTimeout(() => {
        setPlayerReactions(prev => {
          const next = { ...prev };
          if (next[payload.teamId]?.timestamp && Date.now() - next[payload.teamId].timestamp >= REACTION_DISPLAY_DURATION_MS) {
            delete next[payload.teamId];
          }
          return next;
        });
      }, REACTION_DISPLAY_DURATION_MS);
    });

    return () => {
      socket.off('triggerAnimation');
      socket.off('chatMessage');
      socket.off('reactionTriggered');
      socket.off('playMedia');
    };
  }, [socket]);

  // Media autoplay
  useEffect(() => {
    if (mediaPayload?.type === 'video' && videoRef.current) {
      videoRef.current.play().catch(e => console.error('Video play failed', e));
    } else if (mediaPayload?.type === 'audio' && audioRef.current) {
      audioRef.current.play().catch(e => console.error('Audio play failed', e));
    }
  }, [mediaPayload]);

  const sortedTeams = gameState?.teams ? [...gameState.teams].sort((a, b) => b.score - a.score) : [];

  // Show media state from ShowRunner
  const showMedia = gameState?.show?.mediaState;

  // Player join URL for QR code
  const joinUrl = `${window.location.origin}/player`;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden font-sans"
      style={{
        backgroundColor: 'var(--show-bg-base)',
        color: 'var(--show-text)',
        // Disconnect indicator: pulsing red border
        border: !isConnected ? '3px solid transparent' : 'none',
        animation: !isConnected ? 'disconnect-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      <ReactionOverlay />
      <ChatFeed messages={chatMessages} />

      {/* Disconnect badge */}
      {!isConnected && (
        <div
          className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-mono z-50"
          style={{ backgroundColor: 'rgba(233,69,96,0.2)', color: 'var(--show-accent)' }}
        >
          Reconnecting...
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Game launch splash */}
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

        /* ShowRunner media segment */
        ) : showMedia && showMedia.phase === 'PLAYING' ? (
          <motion.div
            key="show-media"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ backgroundColor: 'var(--show-bg-base)' }}
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

        /* Global leaderboard */
        ) : gameState?.showLeaderboard ? (
          <motion.div
            key="leaderboard"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-4xl mx-auto p-8 text-center rounded-3xl z-30"
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
                    {playerReactions[team.id] && (
                      <span className="absolute -top-4 -right-4 text-4xl animate-bounce">
                        {playerReactions[team.id].type}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

        /* Main content area */
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex flex-col items-center justify-center"
          >
            {gameState?.activeRound === 'QUIZ' && gameState ? (
              <DisplayQuizView gameState={gameState} />
            ) : (
              /* Lobby */
              <div className="text-center w-full max-w-6xl px-8">
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
                          {playerReactions[team.id] && (
                            <span className="text-2xl animate-bounce">
                              {playerReactions[team.id].type}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legacy media overlay (from adminPlayMedia) */}
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
  );
}
