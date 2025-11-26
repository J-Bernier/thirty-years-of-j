import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import type { GameState, ChatMessage } from '../types';

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
    };
  }, [socket]);

  if (gameState?.showLeaderboard) {
    const sortedTeams = [...(gameState.teams || [])].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <ReactionOverlay />
        <ChatFeed messages={chatMessages} />
        <div className="w-full max-w-4xl mx-auto p-8 text-center animate-in fade-in zoom-in duration-500">
          <h1 className="text-6xl font-bold mb-12 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            Global Leaderboard
          </h1>
          <div className="space-y-4">
            {sortedTeams.map((team, index) => (
              <div key={team.id} className="flex items-center p-6 bg-slate-900 rounded-xl border border-slate-800 relative">
                <div className="text-4xl font-bold text-slate-500 w-16">#{index + 1}</div>
                <div className="w-6 h-6 rounded-full mr-4" style={{ backgroundColor: team.color }} />
                <div className="text-3xl font-bold flex-grow text-left">{team.name}</div>
                <div className="text-4xl font-bold text-yellow-400">{team.score} pts</div>
                {playerReactions[team.id] && (
                  <div className="absolute -top-4 -right-4 text-4xl animate-bounce">
                    {playerReactions[team.id].type}
                  </div>
                )}
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
      <ChatFeed messages={chatMessages} />
      
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
              <div key={team.id} className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
                 <div className="w-4 h-4 rounded-full mb-4" style={{ backgroundColor: team.color }} />
                 <span className="text-2xl font-bold">{team.name}</span>
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
    </div>
  );
}
