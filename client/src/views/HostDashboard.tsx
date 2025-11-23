import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { GameState } from '../types';

import HostQuizControl from '../games/quiz/HostQuizControl';

export default function HostDashboard() {
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Host Dashboard</h1>
        <div className={`px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Game Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!gameState?.activeRound && (
                <Button className="w-full" onClick={() => socket?.emit('quizAdminAction', { type: 'SETUP' })}>
                  Start Life Quiz
                </Button>
              )}
              <Button variant="secondary" className="w-full">Reset Round</Button>
            </CardContent>
          </Card>
          
          {gameState?.activeRound === 'QUIZ' && gameState && (
            <HostQuizControl gameState={gameState} />
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Teams ({gameState?.teams.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {gameState?.teams.length === 0 ? (
              <p className="text-muted-foreground">No teams joined yet.</p>
            ) : (
              <ul className="space-y-2">
                {gameState?.teams.map((team) => (
                  <li key={team.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                    <span className="font-medium" style={{ color: team.color }}>{team.name}</span>
                    <span>{team.score} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
