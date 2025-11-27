import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import type { GameState, ChatMessage, MediaPayload } from '../types';

import DisplayQuizView from '../games/quiz/DisplayQuizView';
import ReactionOverlay from '@/components/ReactionOverlay';
import ChatFeed from '@/components/ChatFeed';

import confetti from 'canvas-confetti';

interface PlayerReactionState {
  type: string;
  timestamp: number;
}

export default function DisplayView() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [playerReactions, setPlayerReactions] = useState<Record<string, PlayerReactionState>>({});
  const [mediaPayload, setMediaPayload] = useState<MediaPayload | null>(null);
  const [showGameLaunch, setShowGameLaunch] = useState(false);
  const prevActiveRound = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (gameState?.activeRound && !prevActiveRound.current) {
      setShowGameLaunch(true);
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        zIndex: 200
      });
      setTimeout(() => setShowGameLaunch(false), 3000);
    }
    prevActiveRound.current = gameState?.activeRound || null;
  }, [gameState?.activeRound]);

  useEffect(() => {
    if (!socket) return;

    socket.on('gameStateUpdate', (state: GameState) => {
      setGameState(state);
    });

    socket.on('triggerAnimation', (type: string) => {
      if (type === 'confetti') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    });

    socket.on('chatMessage', (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message].slice(-50)); // Keep last 50 messages
    });

    socket.on('playMedia', (payload: MediaPayload) => {
      setMediaPayload(payload);
      // Auto-clear after duration if provided, or when media ends
      if (payload.duration) {
        setTimeout(() => setMediaPayload(null), payload.duration * 1000);
      }
    });

    socket.on('reactionTriggered', (payload) => {
      setPlayerReactions(prev => ({
        ...prev,
        [payload.teamId]: { type: payload.type, timestamp: Date.now() }
      }));

      // Clear reaction after 3 seconds
      setTimeout(() => {
        setPlayerReactions(prev => {
          const newState = { ...prev };
          if (newState[payload.teamId]?.timestamp && Date.now() - newState[payload.teamId].timestamp >= 3000) {
             delete newState[payload.teamId];
          }
          return newState;
        });
      }, 3000);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('triggerAnimation');
      socket.off('chatMessage');
      socket.off('reactionTriggered');
      socket.off('playMedia');
    };
  }, [socket]);

  useEffect(() => {
    if (mediaPayload?.type === 'video' && videoRef.current) {
      videoRef.current.play().catch(e => console.error("Video play failed", e));
    } else if (mediaPayload?.type === 'audio' && audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  }, [mediaPayload]);

  const handleMediaEnded = () => {
    setMediaPayload(null);
  };

  const sortedTeams = gameState?.teams ? [...gameState.teams].sort((a, b) => b.score - a.score) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 via-red-900 to-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans">
      <ReactionOverlay />
      <ChatFeed messages={chatMessages} />

      <AnimatePresence mode="wait">
        {showGameLaunch ? (
          <motion.div 
            key="launch"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <h1 className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-500 to-orange-500 drop-shadow-2xl text-center p-8">
              {gameState?.activeRound === 'QUIZ' ? 'LIFE QUIZ' : 'GAME START'}
            </h1>
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl text-white/80 font-light"
            >
              Get Ready!
            </motion.div>
          </motion.div>
        ) : gameState?.showLeaderboard ? (
          <motion.div 
            key="leaderboard"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-4xl mx-auto p-8 text-center bg-black/30 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl z-30"
          >
            <h1 className="text-6xl font-bold mb-12 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 drop-shadow-sm">
              Global Leaderboard
            </h1>
            <div className="space-y-4">
              {sortedTeams.map((team, index) => (
                <motion.div 
                  key={team.id} 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center p-6 bg-white/10 rounded-xl border border-white/5 relative hover:bg-white/20 transition-colors"
                >
                  <div className="text-4xl font-bold text-amber-500/80 w-16">#{index + 1}</div>
                  <div className="w-6 h-6 rounded-full mr-4 shadow-lg" style={{ backgroundColor: team.color }} />
                  <div className="text-3xl font-bold flex-grow text-left text-white/90">{team.name}</div>
                  <div className="text-4xl font-bold text-yellow-400">{team.score} pts</div>
                  {playerReactions[team.id] && (
                    <div className="absolute -top-4 -right-4 text-4xl animate-bounce">
                      {playerReactions[team.id].type}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
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
              <div className="text-center space-y-8 w-full max-w-6xl">
                {!isConnected && (
                  <div className="absolute top-4 right-4 text-red-500 font-mono bg-black/50 px-2 py-1 rounded">
                    DISCONNECTED
                  </div>
                )}
                
                <div className="text-center space-y-8 w-full max-w-6xl">
                  <h1 className="text-7xl md:text-9xl font-extrabold tracking-tighter bg-gradient-to-r from-amber-200 via-orange-400 to-red-500 text-transparent bg-clip-text drop-shadow-lg">
                    Thirty Years of J
                  </h1>
                  
                  {gameState?.teams.length === 0 ? (
                    <p className="text-3xl text-amber-200/70 animate-pulse font-light">
                      Waiting for teams to join...
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 mt-12">
                      {gameState?.teams.map((team) => (
                        <div key={team.id} className="bg-white/10 p-6 rounded-2xl border border-white/10 flex flex-col items-center animate-in fade-in zoom-in duration-300 relative backdrop-blur-sm shadow-xl hover:scale-105 transition-transform">
                           <div className="w-4 h-4 rounded-full mb-4 shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ backgroundColor: team.color }} />
                           <span className="text-2xl font-bold text-white/90">{team.name}</span>
                           {playerReactions[team.id] && (
                              <div className="absolute -top-6 -right-6 text-6xl animate-bounce filter drop-shadow-lg">
                                {playerReactions[team.id].type}
                              </div>
                           )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {mediaPayload?.type === 'video' && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <video 
              ref={videoRef}
              src={mediaPayload.url} 
              className="max-w-full max-h-full rounded-xl shadow-2xl"
              onEnded={handleMediaEnded}
              controls={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {mediaPayload?.type === 'audio' && (
        <audio 
          ref={audioRef}
          src={mediaPayload.url} 
          onEnded={handleMediaEnded}
          className="hidden"
        />
      )}
    </div>
  );
}
