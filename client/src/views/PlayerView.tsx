
import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GameState } from '@/types';
import PlayerQuizView from '../games/quiz/PlayerQuizView';
import ReactionPad from '@/components/ReactionPad';

export default function PlayerView() {
  const { isConnected, socket } = useSocket();
  const [teamName, setTeamName] = useState('');
  const [joined, setJoined] = useState(false);
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

  const handleJoin = () => {
    if (teamName.trim() && isConnected && socket) {
      socket.emit('joinTeam', teamName);
      setJoined(true);
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Join Game</CardTitle>
            <CardDescription>Enter your team name to start playing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              placeholder="Team Name" 
              value={teamName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeamName(e.target.value)}
            />
            <Button 
              className="w-full" 
              onClick={handleJoin}
              disabled={!isConnected || !teamName.trim()}
            >
              Join Game
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }



  if (gameState?.activeRound === 'QUIZ' && gameState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
        <div className="mb-4 font-bold text-lg">{teamName}</div>
        <PlayerQuizView gameState={gameState} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      <div className="text-center space-y-8">
        <h1 className="text-2xl font-bold">{teamName}</h1>
        <p className="text-muted-foreground">Waiting for next game...</p>
        <ReactionPad />
      </div>
    </div>
  );
}
