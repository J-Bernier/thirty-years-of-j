import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

      <Tabs defaultValue="game" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="game">Game Control</TabsTrigger>
          <TabsTrigger value="teams">Teams & Scoreboard</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="game">
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Broadcast Control</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Display</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant={gameState?.showLeaderboard ? "default" : "outline"}
                          onClick={() => socket?.emit('toggleLeaderboard', true)}
                        >
                          Show Global Leaderboard
                        </Button>
                        <Button 
                          variant={!gameState?.showLeaderboard ? "default" : "outline"}
                          onClick={() => socket?.emit('toggleLeaderboard', false)}
                        >
                          Show Game Leaderboard
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Media</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="outline"
                          onClick={() => socket?.emit('triggerAnimation', 'confetti')}
                        >
                          🎉 Confetti
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => socket?.emit('adminPlayMedia', { type: 'audio', url: 'https://www.soundjay.com/human/applause-01.mp3', duration: 5 })}
                        >
                          👏 Applause
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/boo.mp3', duration: 3 })}
                        >
                          👎 Boo
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => socket?.emit('adminPlayMedia', { type: 'video', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXp4eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7abKhOpu0NwenH3O/giphy.mp4', duration: 5 })}
                        >
                          🎉 Celebration GIF
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!gameState?.activeRound ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Game Selection</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <Button 
                      className="h-32 text-xl flex flex-col gap-2"
                      onClick={() => socket?.emit('quizAdminAction', { type: 'SETUP' })}
                    >
                      <span className="text-4xl">🧠</span>
                      Life Quiz
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-32 text-xl flex flex-col gap-2 opacity-50 cursor-not-allowed"
                    >
                      <span className="text-4xl">🎤</span>
                      Karaoke (Soon)
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {gameState.activeRound === 'QUIZ' && (
                    <HostQuizControl gameState={gameState} />
                  )}
                  <Button 
                    variant="secondary" 
                    className="w-full mt-4"
                    onClick={() => socket?.emit('quizAdminAction', { type: 'CANCEL' })}
                  >
                    Reset / Back to Lobby
                  </Button>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="teams">
          <div className="grid grid-cols-1 gap-6">


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
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -10 })}
                            >
                              -10
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -1 })}
                            >
                              -1
                            </Button>
                            <span className="font-bold w-12 text-center">{team.score} pts</span>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 1 })}
                            >
                              +1
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 10 })}
                            >
                              +10
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Game History</CardTitle>
            </CardHeader>
            <CardContent>
              {!gameState?.history?.length ? (
                <p className="text-muted-foreground">No games played yet.</p>
              ) : (
                <div className="space-y-4">
                  {gameState.history.slice().reverse().map((game) => (
                    <div key={game.id} className="p-4 bg-secondary rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold">{game.gameType}</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(game.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm space-y-1">
                        {game.scores
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 3)
                          .map((score, i) => (
                            <div key={score.teamId} className="flex justify-between">
                              <span>#{i + 1} {score.teamName}</span>
                              <span>{score.score} pts</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
