
import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PlayerQuizView from '../games/quiz/PlayerQuizView';
import ReactionPad from '@/components/ReactionPad';
import { Smile } from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import Modal from '@/components/ui/modal';
export default function PlayerView() {
  const { isConnected, socket, gameState } = useSocket();
  const [teamName, setTeamName] = useState('');
  const [joined, setJoined] = useState(false);
  const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);
  const [playerId, setPlayerId] = useState<string>('');

  useEffect(() => {
    let storedId = localStorage.getItem('playerId');
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('playerId', storedId);
    }
    setPlayerId(storedId);

    const storedName = localStorage.getItem('teamName');
    if (storedName) {
      setTeamName(storedName);
    }
  }, []);

  // Auto-rejoin: if gameState shows we're already in the game, mark as joined
  useEffect(() => {
    if (playerId && gameState?.teams.some(t => t.id === playerId)) {
      if (!joined) {
        console.log('Auto-rejoining game with ID:', playerId);
        setJoined(true);
      }
    }
  }, [gameState, playerId, joined]);

  const handleJoin = () => {
    if (teamName.trim() && isConnected && socket && playerId) {
      socket.emit('joinTeam', { name: teamName, playerId });
      localStorage.setItem('teamName', teamName);
      setJoined(true);
    }
  };

  const handleSendChat = (message: string) => {
    socket?.emit('sendChatMessage', message);
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

  return (
    <div className="min-h-screen flex flex-col p-4 bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-bold text-lg">{teamName}</h1>
        <Button variant="outline" size="sm" onClick={() => setIsReactionModalOpen(true)}>
          <Smile className="h-4 w-4 mr-2" /> Reactions
        </Button>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center w-full">
        {gameState?.activeRound === 'QUIZ' && gameState ? (
          <PlayerQuizView gameState={gameState} playerId={playerId} />
        ) : (
          <div className="text-center space-y-8">
            <p className="text-muted-foreground">Waiting for next game...</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 w-full max-w-md mx-auto sticky bottom-0 bg-slate-50 pb-2">
        <ChatBox onSend={handleSendChat} disabled={!isConnected} />
      </div>

      <Modal isOpen={isReactionModalOpen} onClose={() => setIsReactionModalOpen(false)} title="Reactions">
        <ReactionPad />
      </Modal>
    </div>
  );
}
