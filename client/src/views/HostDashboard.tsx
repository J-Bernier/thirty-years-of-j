import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GameState } from '../types';

import GameConfiguration from '@/components/GameConfiguration';

export default function HostDashboard() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showScoreAdjust, setShowScoreAdjust] = useState(false);

  // Per-action debounce
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
  const quiz = gameState?.quiz;
  const isLive = !!gameState?.activeRound;
  const showState = gameState?.show;

  const sendQuizAction = (type: string, payload?: Record<string, unknown>) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  // Derived quiz state
  const answeredCount = gameState?.teams.filter(t => quiz?.answers[t.id]?.locked).length || 0;
  const isLastQuestion = (quiz?.currentQuestionIndex ?? 0) === (quiz?.config.totalQuestions || 0) - 1;

  // Answer distribution for live commentary
  const answerDistribution = quiz?.phase === 'QUESTION' && quiz.currentQuestion
    ? quiz.currentQuestion.options.map((_, i) =>
        gameState?.teams.filter(t => quiz.answers[t.id]?.optionIndex === i).length || 0
      )
    : null;

  // Per-team results for reveal
  const teamResults = quiz?.phase === 'REVEAL' && quiz.currentQuestion
    ? gameState?.teams.map(t => {
        const answer = quiz.answers[t.id];
        const correct = answer?.locked && answer.optionIndex === quiz.currentQuestion!.correctOptionIndex;
        return { name: t.name, color: t.color, correct, answered: !!answer?.locked, timestamp: answer?.timestamp ?? 0 };
      }).sort((a, b) => b.timestamp - a.timestamp) || []
    : null;

  const fastestCorrect = teamResults?.find(t => t.correct);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* STATUS BAR */}
      <div className="flex-shrink-0 bg-background border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          {isLive ? (
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-500">LIVE</span>
          ) : (
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">LOBBY</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {quiz?.phase === 'QUESTION' && (
            <>
              <span className="text-xs text-muted-foreground">{answeredCount}/{teamCount}</span>
              <span className={`text-xl font-bold tabular-nums ${(quiz?.timer ?? 99) <= 5 ? 'text-red-500' : ''}`}>
                {quiz?.timer}s
              </span>
            </>
          )}
          {quiz?.phase === 'QUESTION' && (
            <span className="text-xs text-muted-foreground">
              Q{(quiz?.currentQuestionIndex ?? 0) + 1}/{quiz?.config.totalQuestions}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* PRIMARY AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!isLive ? (
          /* ═══ LOBBY ═══ */
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-6xl font-black tabular-nums">{teamCount}</div>
              <div className="text-muted-foreground mt-1">team{teamCount !== 1 ? 's' : ''} joined</div>
            </div>

            <Button
              className="w-full min-h-[72px] text-xl font-bold"
              onClick={() => handleAction('setup-quiz', () => sendQuizAction('SETUP'), 4000)}
              disabled={teamCount === 0}
            >
              Start Quiz
            </Button>

            {/* Pre-show admin tabs */}
            <Tabs defaultValue="teams" className="mt-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="teams" className="text-xs">Teams</TabsTrigger>
                <TabsTrigger value="config" className="text-xs">Questions</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
              </TabsList>
              <TabsContent value="teams">
                {teamCount === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">Waiting for teams...</p>
                ) : (
                  <ul className="space-y-2 mt-2">
                    {gameState?.teams.map(team => (
                      <li key={team.id} className="flex items-center gap-2 p-2 bg-secondary rounded-lg text-sm">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="font-medium flex-1">{team.name}</span>
                        <span className="tabular-nums text-muted-foreground">{team.score} pts</span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="config"><GameConfiguration /></TabsContent>
              <TabsContent value="history">
                {!gameState?.history?.length ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No games yet.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {gameState.history.slice().reverse().map(game => (
                      <div key={game.id} className="p-2 bg-secondary rounded-lg text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{game.gameType}</span>
                          <span className="text-xs text-muted-foreground">{new Date(game.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

        ) : quiz?.phase === 'IDLE' ? (
          /* ═══ QUIZ IDLE (ready to start) ═══ */
          <div className="space-y-3 py-4">
            <p className="text-center text-muted-foreground text-sm">Quiz loaded. Choose a mode:</p>
            <Button
              className="w-full min-h-[72px] text-xl font-bold"
              onClick={() => handleAction('start-30', () => sendQuizAction('START', { timePerQuestion: 30, totalQuestions: 10 }), 3000)}
            >
              Start — 30s per question
            </Button>
            <Button
              variant="secondary"
              className="w-full min-h-[56px] text-lg"
              onClick={() => handleAction('start-15', () => sendQuizAction('START', { timePerQuestion: 15, totalQuestions: 10 }), 3000)}
            >
              Blitz — 15s per question
            </Button>
          </div>

        ) : quiz?.phase === 'QUESTION' ? (
          /* ═══ QUIZ QUESTION (timer running) ═══ */
          <div className="space-y-4 py-2">
            {/* Question text for host reference */}
            <div className="p-3 rounded-lg bg-secondary">
              <p className="font-medium text-sm">{quiz.currentQuestion?.text}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Answer: {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex ?? 0]}
              </p>
            </div>

            {/* Live answer distribution */}
            {answerDistribution && quiz.currentQuestion && (
              <div className="grid grid-cols-2 gap-2">
                {quiz.currentQuestion.options.map((opt, i) => {
                  const count = answerDistribution[i];
                  const maxCount = Math.max(...answerDistribution, 1);
                  const percent = (count / maxCount) * 100;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-bold w-5 text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                      <div className="flex-1 h-6 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/30 rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="font-bold tabular-nums w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PRIMARY: Reveal Answer */}
            <Button
              className="w-full min-h-[72px] text-2xl font-bold bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => handleAction('reveal', () => sendQuizAction('REVEAL'))}
            >
              Reveal Answer
            </Button>
          </div>

        ) : quiz?.phase === 'REVEAL' ? (
          /* ═══ QUIZ REVEAL (answer shown) ═══ */
          <div className="space-y-4 py-2">
            {/* Correct answer */}
            <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Correct Answer</p>
              <p className="text-xl font-bold text-green-600">
                {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex ?? 0]}
              </p>
            </div>

            {/* Per-team results */}
            {teamResults && (
              <div className="space-y-1">
                {teamResults.map(t => (
                  <div key={t.name} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded">
                    <span className={t.correct ? 'text-green-500' : t.answered ? 'text-red-400' : 'text-muted-foreground'}>
                      {t.correct ? '✓' : t.answered ? '✗' : '—'}
                    </span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="font-medium flex-1">{t.name}</span>
                    {t === fastestCorrect && (
                      <span className="text-xs text-amber-500 font-medium">fastest</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* PRIMARY: Next Question */}
            <Button
              className="w-full min-h-[72px] text-2xl font-bold"
              onClick={() => handleAction('next', () => sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
            >
              {isLastQuestion ? 'Show Results' : 'Next Question →'}
            </Button>
          </div>

        ) : quiz?.phase === 'END' ? (
          /* ═══ QUIZ END (podium on screen) ═══ */
          <div className="space-y-4 py-8">
            <p className="text-center text-lg font-semibold">Podium on screen</p>
            <Button
              className="w-full min-h-[56px] text-lg font-bold"
              onClick={() => handleAction('back-lobby', () => sendQuizAction('CANCEL'))}
            >
              Back to Lobby
            </Button>
          </div>

        ) : (
          /* ═══ BREAK / MEDIA ═══ */
          <div className="space-y-4 py-8">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Now Playing</p>
              <p className="text-lg font-bold mt-1">{showState?.currentSegmentType || 'Break'}</p>
            </div>
            <Button
              className="w-full min-h-[56px] text-lg font-bold"
              onClick={() => handleAction('show-advance', () => socket?.emit('showAdvance'))}
            >
              Next Segment →
            </Button>
          </div>
        )}
      </div>

      {/* QUICK TRAY (always visible) */}
      <div className="flex-shrink-0 border-t bg-background px-4 py-3">
        <div className="flex justify-around items-center">
          <button
            className={`flex flex-col items-center gap-0.5 text-xs ${gameState?.showLeaderboard ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={() => handleAction('lb-toggle', () => socket?.emit('toggleLeaderboard', !gameState?.showLeaderboard))}
          >
            <span className="text-xl">🏆</span>
            <span>Board</span>
          </button>
          <button
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground"
            onClick={() => handleAction('confetti', () => socket?.emit('triggerAnimation', 'confetti'), 2000)}
          >
            <span className="text-xl">🎉</span>
            <span>Confetti</span>
          </button>
          <button
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground"
            onClick={() => handleAction('applause', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/applause.mp3', duration: 5 }), 5000)}
          >
            <span className="text-xl">👏</span>
            <span>Applause</span>
          </button>
          <button
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground relative"
            onClick={() => setShowEmergency(!showEmergency)}
          >
            <span className="text-xl">⚠️</span>
            <span>SOS</span>
          </button>
          <button
            className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground"
            onClick={() => setShowScoreAdjust(!showScoreAdjust)}
          >
            <span className="text-xl">±</span>
            <span>Score</span>
          </button>
        </div>

        {/* Emergency panel */}
        {showEmergency && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
            <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Emergency Controls</p>
            {isLive && quiz?.phase === 'QUESTION' && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { sendQuizAction('REVEAL'); setShowEmergency(false); }}>
                Skip to Reveal
              </Button>
            )}
            {isLive && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { sendQuizAction('SKIP_TO_END'); setShowEmergency(false); }}>
                End Quiz Early
              </Button>
            )}
            <Button variant="destructive" size="sm" className="w-full" onClick={() => { sendQuizAction('CANCEL'); setShowEmergency(false); }}>
              Cancel / Back to Lobby
            </Button>
          </div>
        )}

        {/* Score adjust panel */}
        {showScoreAdjust && gameState?.teams && (
          <div className="mt-3 p-3 rounded-lg bg-secondary space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Adjust Scores</p>
            {gameState.teams.map(team => (
              <div key={team.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                <span className="text-sm font-medium flex-1">{team.name}</span>
                <span className="text-sm font-bold tabular-nums w-10 text-right">{team.score}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -1 })}>-</Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 1 })}>+</Button>
                  <Button variant="outline" size="sm" className="h-8 w-12 p-0"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 10 })}>+10</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
