import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import type { GameState } from '../types';

import DisplayQuizView from '../games/quiz/DisplayQuizView';

export default function DisplayView() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('gameStateUpdate', (state: GameState) => {
      setGameState(state);
    });

    return () => {
      socket.off('gameStateUpdate');
    };
  }, [socket]);

  if (gameState?.activeRound === 'QUIZ' && gameState) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <DisplayQuizView gameState={gameState} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
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
  );
}
