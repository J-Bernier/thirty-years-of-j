import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import type { GameState } from '../types';

import DisplayQuizView from '../games/quiz/DisplayQuizView';
import ReactionOverlay from '@/components/ReactionOverlay';

import confetti from 'canvas-confetti';

export default function DisplayView() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);

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

    return () => {
      socket.off('gameStateUpdate');
      socket.off('triggerAnimation');
    };
  }, [socket]);

  if (gameState?.showLeaderboard) {
    const sortedTeams = [...(gameState.teams || [])].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <ReactionOverlay />
        <div className="w-full max-w-4xl mx-auto p-8 text-center animate-in fade-in zoom-in duration-500">
          <h1 className="text-6xl font-bold mb-12 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            Global Leaderboard
          </h1>
          <div className="space-y-4">
            {sortedTeams.map((team, index) => (
              <div key={team.id} className="flex items-center p-6 bg-slate-900 rounded-xl border border-slate-800">
                <div className="text-4xl font-bold text-slate-500 w-16">#{index + 1}</div>
                <div className="w-6 h-6 rounded-full mr-4" style={{ backgroundColor: team.color }} />
                <div className="text-3xl font-bold flex-grow text-left">{team.name}</div>
                <div className="text-4xl font-bold text-yellow-400">{team.score} pts</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <ReactionOverlay />
      
      {gameState?.activeRound === 'QUIZ' && gameState ? (
        <DisplayQuizView gameState={gameState} />
      ) : (
        <div className="text-center space-y-8 w-full max-w-6xl">
      {!isConnected && (
        <div className="absolute top-4 right-4 text-red-500 font-mono">
          DISCONNECTED
        </div>
      )}
      
      <div className="text-center space-y-8 w-full max-w-6xl">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
          Thirty Years of J
        </h1>
        
        {gameState?.teams.length === 0 ? (
          <p className="text-2xl text-slate-400 animate-pulse">
            Waiting for teams to join...
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 mt-12">
            {gameState?.teams.map((team) => (
              <div key={team.id} className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                 <div className="w-4 h-4 rounded-full mb-4" style={{ backgroundColor: team.color }} />
                 <span className="text-2xl font-bold">{team.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
