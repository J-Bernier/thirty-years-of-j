import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GameState } from '../types';

import GameConfiguration from '@/components/GameConfiguration';

export default function HostDashboard() {
  const { isConnected, socket } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showScoreAdjust, setShowScoreAdjust] = useState(false);
  const [showFx, setShowFx] = useState(false);

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
  const leaderboardActive = !!gameState?.showLeaderboard;

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
        return { id: t.id, name: t.name, color: t.color, correct, answered: !!answer?.locked, timestamp: answer?.timestamp ?? 0 };
      }).sort((a, b) => b.timestamp - a.timestamp) || []
    : null;

  const fastestCorrect = teamResults?.find(t => t.correct);

  // Close panels when tapping outside
  const closePanels = () => { setShowEmergency(false); setShowScoreAdjust(false); setShowFx(false); };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#fafafa' }}>
      {/* STATUS BAR */}
      <div className="flex-shrink-0 border-b px-4 py-2.5 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
          {isLive ? (
            <span className="text-xs font-bold uppercase tracking-widest text-red-500">LIVE</span>
          ) : (
            <span className="text-xs font-medium uppercase tracking-widest text-slate-400">Lobby</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {quiz?.phase === 'QUESTION' && (
            <>
              <span className={`text-2xl font-black tabular-nums ${(quiz?.timer ?? 99) <= 5 ? 'text-red-500' : 'text-slate-900'}`}>
                {quiz?.timer}s
              </span>
              <span className="text-xs text-slate-400">
                {answeredCount}/{teamCount} locked
              </span>
            </>
          )}
          {isLive && quiz?.phase === 'QUESTION' && (
            <span className="text-xs text-slate-400">
              Q{(quiz?.currentQuestionIndex ?? 0) + 1}/{quiz?.config.totalQuestions}
            </span>
          )}
          {!isLive && (
            <span className="text-sm font-medium text-slate-500">{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* PRIMARY AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-4" onClick={closePanels}>
        {!isLive ? (
          /* ═══ LOBBY ═══ */
          <div className="space-y-5">
            <div className="text-center py-6">
              <div className="text-7xl font-black tabular-nums text-slate-900">{teamCount}</div>
              <div className="text-slate-400 mt-1 text-sm">team{teamCount !== 1 ? 's' : ''} joined</div>
            </div>

            <Button
              className="w-full min-h-[64px] text-xl font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => handleAction('setup-quiz', () => sendQuizAction('SETUP'), 4000)}
            >
              Start Quiz
            </Button>

            {/* Pre-show admin tabs */}
            <Tabs defaultValue="teams" className="mt-4">
              <TabsList className="grid w-full grid-cols-3 bg-slate-100 rounded-xl">
                <TabsTrigger value="teams" className="text-xs rounded-lg">Teams</TabsTrigger>
                <TabsTrigger value="config" className="text-xs rounded-lg">Questions</TabsTrigger>
                <TabsTrigger value="history" className="text-xs rounded-lg">History</TabsTrigger>
              </TabsList>
              <TabsContent value="teams">
                {teamCount === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">Waiting for players to scan the QR code...</p>
                ) : (
                  <ul className="space-y-2 mt-3">
                    {gameState?.teams.map(team => (
                      <li key={team.id} className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-slate-100 text-sm">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                        <span className="font-semibold flex-1 text-slate-800">{team.name}</span>
                        <span className="tabular-nums text-slate-400 font-medium">{team.score} pts</span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="config"><GameConfiguration /></TabsContent>
              <TabsContent value="history">
                {!gameState?.history?.length ? (
                  <p className="text-slate-400 text-sm text-center py-6">No games played yet.</p>
                ) : (
                  <div className="space-y-2 mt-3">
                    {gameState.history.slice().reverse().map(game => (
                      <div key={game.id} className="p-3 bg-white rounded-xl border border-slate-100 text-sm">
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-800">{game.gameType}</span>
                          <span className="text-xs text-slate-400">{new Date(game.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

        ) : quiz?.phase === 'IDLE' ? (
          /* ═══ QUIZ IDLE ═══ */
          <div className="space-y-3 py-6">
            <p className="text-center text-slate-400 text-sm mb-4">Quiz loaded. Choose a mode:</p>
            <Button
              className="w-full min-h-[64px] text-xl font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => handleAction('start-30', () => sendQuizAction('START', { timePerQuestion: 30, totalQuestions: 10 }), 3000)}
            >
              Standard — 30s
            </Button>
            <Button
              className="w-full min-h-[56px] text-lg font-semibold rounded-2xl bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => handleAction('start-15', () => sendQuizAction('START', { timePerQuestion: 15, totalQuestions: 10 }), 3000)}
            >
              Blitz — 15s
            </Button>
          </div>

        ) : quiz?.phase === 'QUESTION' ? (
          /* ═══ QUIZ QUESTION ═══ */
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-white border border-slate-100">
              <p className="font-semibold text-sm text-slate-800">{quiz.currentQuestion?.text}</p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                Answer: {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex ?? 0]}
              </p>
            </div>

            {/* Live answer distribution */}
            {answerDistribution && quiz.currentQuestion && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {quiz.currentQuestion.options.map((_opt, i) => {
                  const count = answerDistribution[i];
                  const total = Math.max(teamCount, 1);
                  const percent = (count / total) * 100;
                  const isCorrect = i === quiz.currentQuestion!.correctOptionIndex;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-bold w-5 text-slate-500">{String.fromCharCode(65 + i)}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(percent, 2)}%`,
                            backgroundColor: isCorrect ? '#10b981' : '#94a3b8',
                          }}
                        />
                      </div>
                      <span className="font-bold tabular-nums w-5 text-right text-slate-600">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              className="w-full min-h-[72px] text-2xl font-bold rounded-2xl bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20"
              onClick={() => handleAction('reveal', () => sendQuizAction('REVEAL'))}
            >
              Reveal Answer
            </Button>
          </div>

        ) : quiz?.phase === 'REVEAL' ? (
          /* ═══ QUIZ REVEAL ═══ */
          <div className="space-y-4 py-2">
            <div className="text-center p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-[11px] uppercase tracking-widest text-emerald-600/70 mb-1">Correct Answer</p>
              <p className="text-xl font-bold text-emerald-700">
                {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex ?? 0]}
              </p>
            </div>

            {teamResults && (
              <div className="space-y-1.5">
                {teamResults.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-white border border-slate-100">
                    <span className={`text-base ${t.correct ? 'text-emerald-500' : t.answered ? 'text-red-400' : 'text-slate-300'}`}>
                      {t.correct ? '✓' : t.answered ? '✗' : '—'}
                    </span>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="font-semibold flex-1 text-slate-800">{t.name}</span>
                    {t === fastestCorrect && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">fastest</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full min-h-[72px] text-2xl font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => handleAction('next', () => sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
            >
              {isLastQuestion ? 'Show Results' : 'Next Question →'}
            </Button>
          </div>

        ) : quiz?.phase === 'END' ? (
          /* ═══ QUIZ END ═══ */
          <div className="space-y-4 py-12 text-center">
            <p className="text-lg font-semibold text-slate-800">Podium on screen</p>
            <p className="text-sm text-slate-400">The audience can see the results</p>
            <Button
              className="w-full min-h-[56px] text-lg font-bold rounded-2xl"
              onClick={() => handleAction('back-lobby', () => sendQuizAction('CANCEL'))}
            >
              Back to Lobby
            </Button>
          </div>

        ) : (
          /* ═══ BREAK / MEDIA ═══ */
          <div className="space-y-4 py-12 text-center">
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Now Playing</p>
            <p className="text-xl font-bold text-slate-800">{showState?.currentSegmentType || 'Break'}</p>
            <Button
              className="w-full min-h-[56px] text-lg font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => handleAction('show-advance', () => socket?.emit('showAdvance'))}
            >
              Next Segment →
            </Button>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM TRAY ═══ */}
      <div className="flex-shrink-0 border-t bg-white px-3 pt-2 pb-3">
        {/* Expandable panels (above the tray) */}
        {showFx && (
          <div className="flex gap-2 mb-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg text-sm"
              onClick={() => { handleAction('confetti', () => socket?.emit('triggerAnimation', 'confetti'), 2000); setShowFx(false); }}>
              🎉 Confetti
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg text-sm"
              onClick={() => { handleAction('applause', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/applause.mp3', duration: 5 }), 5000); setShowFx(false); }}>
              👏 Applause
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg text-sm"
              onClick={() => { handleAction('boo', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/boo.mp3', duration: 3 }), 3000); setShowFx(false); }}>
              👎 Boo
            </Button>
          </div>
        )}

        {showEmergency && (
          <div className="mb-2 p-3 rounded-xl bg-red-50 border border-red-200 space-y-2">
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest">Emergency</p>
            {isLive && quiz?.phase === 'QUESTION' && (
              <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={() => { sendQuizAction('REVEAL'); setShowEmergency(false); }}>
                Skip to Reveal
              </Button>
            )}
            {isLive && (
              <Button variant="outline" size="sm" className="w-full rounded-lg" onClick={() => { sendQuizAction('SKIP_TO_END'); setShowEmergency(false); }}>
                End Quiz Early
              </Button>
            )}
            <Button variant="destructive" size="sm" className="w-full rounded-lg" onClick={() => { sendQuizAction('CANCEL'); setShowEmergency(false); }}>
              Cancel Show
            </Button>
          </div>
        )}

        {showScoreAdjust && gameState?.teams && gameState.teams.length > 0 && (
          <div className="mb-2 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Adjust Scores</p>
            {gameState.teams.map(team => (
              <div key={team.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                <span className="text-sm font-semibold flex-1 text-slate-700">{team.name}</span>
                <span className="text-sm font-bold tabular-nums w-10 text-right text-slate-500">{team.score}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: -1 })}>-</Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 1 })}>+</Button>
                  <Button variant="outline" size="sm" className="h-8 w-12 p-0 rounded-lg text-xs"
                    onClick={() => socket?.emit('adminUpdateScore', { teamId: team.id, delta: 10 })}>+10</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tray buttons */}
        <div className="flex items-center gap-1">
          {/* Leaderboard toggle — clear active state */}
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              leaderboardActive
                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-500'
            }`}
            onClick={() => handleAction('lb-toggle', () => socket?.emit('toggleLeaderboard', !leaderboardActive))}
          >
            🏆 {leaderboardActive ? 'Board ON' : 'Board'}
          </button>

          {/* FX button — opens reactions */}
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              showFx ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowFx(!showFx); setShowEmergency(false); setShowScoreAdjust(false); }}
          >
            🎬 FX
          </button>

          {/* Score adjust */}
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              showScoreAdjust ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowScoreAdjust(!showScoreAdjust); setShowEmergency(false); setShowFx(false); }}
          >
            ± Score
          </button>

          {/* Emergency — distinct red accent */}
          <button
            className={`h-11 w-11 flex items-center justify-center rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
              showEmergency ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-400'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowEmergency(!showEmergency); setShowScoreAdjust(false); setShowFx(false); }}
          >
            ⚠️
          </button>
        </div>
      </div>
    </div>
  );
}
