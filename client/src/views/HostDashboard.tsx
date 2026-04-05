import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GameState } from '../types';

import HostQuizControl from '../games/quiz/HostQuizControl';
import GameConfiguration from '@/components/GameConfiguration';

export default function HostDashboard() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Per-action debounce: track which actions are blocked independently
  const blockedActions = useRef(new Set<string>());

  const handleAction = useCallback((key: string, action: () => void, duration = 1000) => {
    if (blockedActions.current.has(key)) return;
    action();
    blockedActions.current.add(key);
    setTimeout(() => blockedActions.current.delete(key), duration);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('gameStateUpdate', (state: GameState) => setGameState(state));
    return () => { socket.off('gameStateUpdate'); };
  }, [socket]);

  const teamCount = gameState?.teams.length || 0;
  const showState = gameState?.show;

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Status bar — always visible, fixed context */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Backstage</h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {showState?.isActive && (
            <span className="text-xs font-mono uppercase tracking-wider text-primary">
              LIVE — {showState.currentSegmentType}
            </span>
          )}
          <span>{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue="game" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="game" className="text-xs sm:text-sm">Control</TabsTrigger>
            <TabsTrigger value="teams" className="text-xs sm:text-sm">Teams</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
            <TabsTrigger value="config" className="text-xs sm:text-sm">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="game">
            <div className="space-y-4">
              {/* Broadcast controls */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Display</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={gameState?.showLeaderboard ? 'default' : 'outline'}
                      className="min-h-[48px] text-sm"
                      onClick={() => handleAction('leaderboard-on', () => socket?.emit('toggleLeaderboard', true))}
                    >
                      Leaderboard
                    </Button>
                    <Button
                      variant={!gameState?.showLeaderboard ? 'default' : 'outline'}
                      className="min-h-[48px] text-sm"
                      onClick={() => handleAction('leaderboard-off', () => socket?.emit('toggleLeaderboard', false))}
                    >
                      Live Screen
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      className="min-h-[48px] text-sm"
                      onClick={() => handleAction('confetti', () => socket?.emit('triggerAnimation', 'confetti'), 2000)}
                    >
                      🎉 Confetti
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-[48px] text-sm"
                      onClick={() => handleAction('applause', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/applause.mp3', duration: 5 }), 5000)}
                    >
                      👏 Applause
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-[48px] text-sm"
                      onClick={() => handleAction('boo', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/boo.mp3', duration: 3 }), 3000)}
                    >
                      👎 Boo
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Game selection or active game controls */}
              {!gameState?.activeRound ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Start a Game</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full min-h-[64px] text-lg font-bold"
                      onClick={() => handleAction('setup-quiz', () => socket?.emit('quizAdminAction', { type: 'SETUP' }), 4000)}
                    >
                      🧠 Life Quiz
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {gameState.activeRound === 'QUIZ' && (
                    <HostQuizControl gameState={gameState} onAction={handleAction} />
                  )}
                  <Button
                    variant="ghost"
                    className="w-full min-h-[48px] text-muted-foreground"
                    onClick={() => handleAction('cancel', () => socket?.emit('quizAdminAction', { type: 'CANCEL' }))}
                  >
                    Cancel / Back to Lobby
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="teams">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Teams ({teamCount})</CardTitle>
              </CardHeader>
              <CardContent>
                {teamCount === 0 ? (
                  <p className="text-muted-foreground text-sm">No teams joined yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {gameState?.teams.map((team) => (
                      <li key={team.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                          <span className="font-medium">{team.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] min-w-[44px]"
                            onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -10 })}
                          >
                            -10
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] min-w-[44px]"
                            onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -1 })}
                          >
                            -1
                          </Button>
                          <span className="font-bold w-14 text-center tabular-nums">{team.score}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] min-w-[44px]"
                            onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 1 })}
                          >
                            +1
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] min-w-[44px]"
                            onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 10 })}
                          >
                            +10
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Game History</CardTitle>
              </CardHeader>
              <CardContent>
                {!gameState?.history?.length ? (
                  <p className="text-muted-foreground text-sm">No games played yet.</p>
                ) : (
                  <div className="space-y-3">
                    {gameState.history.slice().reverse().map((game) => (
                      <div key={game.id} className="p-3 bg-secondary rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-sm">{game.gameType}</span>
                          <span className="text-xs text-muted-foreground">
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

          <TabsContent value="config">
            <GameConfiguration />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
