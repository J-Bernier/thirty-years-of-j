import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import type { QuizQuestion } from '../types';

import GameConfiguration from '@/components/GameConfiguration';
import ShowBuilder from '@/components/ShowBuilder';

export default function HostDashboard() {
  const { isConnected, socket, gameState } = useSocket();
  const [showEmergency, setShowEmergency] = useState(false);
  const [showScoreAdjust, setShowScoreAdjust] = useState(false);
  const [showFx, setShowFx] = useState(false);
  const [activeTab, setActiveTab] = useState<'teams' | 'shows' | 'questions' | 'history'>('teams');
  const [questionCount, setQuestionCount] = useState<number | null>(null);

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
    socket.emit('adminGetQuestions', (questions: QuizQuestion[]) => {
      setQuestionCount(questions.length);
    });
  }, [socket]);

  const teamCount = gameState?.teams.length || 0;
  const quiz = gameState?.quiz;
  const isLive = !!gameState?.activeRound;
  const showState = gameState?.show;
  const leaderboardActive = !!gameState?.showLeaderboard;

  const sendQuizAction = (type: string, payload?: Record<string, unknown>) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  const answeredCount = gameState?.teams.filter(t => quiz?.answers[t.id]?.locked).length || 0;
  const isLastQuestion = (quiz?.currentQuestionIndex ?? 0) === (quiz?.config.totalQuestions || 0) - 1;

  const answerDistribution = quiz?.phase === 'QUESTION' && quiz.currentQuestion
    ? quiz.currentQuestion.options.map((_, i) =>
        gameState?.teams.filter(t => quiz.answers[t.id]?.optionIndex === i).length || 0
      )
    : null;

  const teamResults = quiz?.phase === 'REVEAL' && quiz.currentQuestion
    ? gameState?.teams.map(t => {
        const answer = quiz.answers[t.id];
        const correct = answer?.locked && answer.optionIndex === quiz.currentQuestion!.correctOptionIndex;
        return { id: t.id, name: t.name, color: t.color, correct, answered: !!answer?.locked, timestamp: answer?.timestamp ?? 0 };
      }).sort((a, b) => b.timestamp - a.timestamp) || []
    : null;

  const fastestCorrect = teamResults?.find(t => t.correct);

  const closePanels = () => { setShowEmergency(false); setShowScoreAdjust(false); setShowFx(false); };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* ═══ STATUS BAR ═══ */}
      <div className={`flex-shrink-0 px-4 py-2.5 flex items-center justify-between transition-colors ${
        isLive ? 'bg-slate-900 text-white' : 'bg-white border-b border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
          {isLive ? (
            <span className="text-xs font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded">LIVE</span>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Lobby</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {quiz?.phase === 'QUESTION' && (
            <>
              <span className={`text-2xl font-black tabular-nums ${(quiz?.timer ?? 99) <= 5 ? 'text-red-400' : ''}`}>
                {quiz?.timer}s
              </span>
              <span className="text-xs opacity-60">
                {answeredCount}/{teamCount} locked
              </span>
              <span className="text-xs opacity-60">
                Q{(quiz?.currentQuestionIndex ?? 0) + 1}/{quiz?.config.totalQuestions}
              </span>
            </>
          )}
          {!isLive && (
            <span className="text-sm font-semibold text-slate-500">{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
          )}
          {isLive && quiz?.phase !== 'QUESTION' && (
            <span className="text-xs opacity-60">{teamCount} teams</span>
          )}
        </div>
      </div>

      {/* ═══ PRIMARY AREA ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-4" onClick={closePanels}>
        {!isLive ? (
          /* ═══ LOBBY ═══ */
          <div className="space-y-4">
            {/* Team counter */}
            <div className="text-center py-4">
              <div className="text-7xl font-black tabular-nums text-slate-900">{teamCount}</div>
              <div className="text-slate-400 mt-1 text-sm">team{teamCount !== 1 ? 's' : ''} joined</div>
            </div>

            {/* Start button — accent color */}
            <Button
              className="w-full min-h-[64px] text-xl font-bold rounded-2xl text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: teamCount > 0 ? '#e94560' : '#cbd5e1' }}
              onClick={() => handleAction('setup-quiz', () => sendQuizAction('SETUP'), 4000)}
              disabled={teamCount === 0}
            >
              {teamCount === 0 ? 'Waiting for teams...' : 'Start Quiz'}
            </Button>

            {/* Readiness info */}
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400 py-1">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {isConnected ? 'Server connected' : 'Disconnected'}
              </span>
              <span>•</span>
              <span>{questionCount !== null ? `${questionCount} questions loaded` : 'Loading questions...'}</span>
            </div>

            {/* Admin tabs — custom styling */}
            <div className="mt-2">
              <div className="flex border-b border-slate-200">
                {(['teams', 'shows', 'questions', 'history'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      activeTab === tab
                        ? 'text-slate-900 border-b-2 border-slate-900'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {activeTab === 'teams' && (
                  teamCount === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">Waiting for players to scan the QR code...</p>
                  ) : (
                    <ul className="space-y-2">
                      {gameState?.teams.map(team => (
                        <li key={team.id} className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-slate-100 text-sm">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                          <span className="font-semibold flex-1 text-slate-800">{team.name}</span>
                          <span className="tabular-nums text-slate-400 font-medium">{team.score} pts</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
                {activeTab === 'shows' && <ShowBuilder />}
                {activeTab === 'questions' && <GameConfiguration />}
                {activeTab === 'history' && (
                  !gameState?.history?.length ? (
                    <p className="text-slate-400 text-sm text-center py-6">No games played yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {gameState.history.slice().reverse().map(game => (
                        <div key={game.id} className="p-3 bg-white rounded-xl border border-slate-100 text-sm">
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-800">{game.gameType}</span>
                            <span className="text-xs text-slate-400">{new Date(game.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

        ) : quiz?.phase === 'IDLE' ? (
          /* ═══ QUIZ IDLE ═══ */
          <div className="space-y-3 py-6">
            <p className="text-center text-slate-400 text-sm mb-4">Quiz loaded — choose a mode:</p>
            <Button
              className="w-full min-h-[64px] text-xl font-bold rounded-2xl text-white"
              style={{ backgroundColor: '#e94560' }}
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
              className="w-full min-h-[72px] text-2xl font-bold rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: '#f59e0b', boxShadow: '0 8px 20px rgba(245,158,11,0.25)' }}
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
              className="w-full min-h-[72px] text-2xl font-bold rounded-2xl text-white"
              style={{ backgroundColor: '#e94560' }}
              onClick={() => handleAction('next', () => sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
            >
              {isLastQuestion ? 'Show Results' : 'Next Question →'}
            </Button>
          </div>

        ) : quiz?.phase === 'END' ? (
          /* ═══ QUIZ END ═══ */
          <div className="space-y-4 py-8 text-center">
            <p className="text-lg font-semibold text-slate-800">Podium on screen</p>
            <p className="text-sm text-slate-400">The audience can see the results</p>
            {showState?.isActive ? (
              <Button
                className="w-full min-h-[56px] text-lg font-bold rounded-2xl text-white"
                style={{ backgroundColor: '#e94560' }}
                onClick={() => handleAction('show-advance', () => socket?.emit('showAdvance'))}
              >
                Next Segment →
              </Button>
            ) : (
              <Button
                className="w-full min-h-[56px] text-lg font-bold rounded-2xl text-white"
                style={{ backgroundColor: '#e94560' }}
                onClick={() => handleAction('back-lobby', () => sendQuizAction('CANCEL'))}
              >
                Back to Lobby
              </Button>
            )}
            {/* Insert ad-hoc segment */}
            {showState?.isActive && (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs"
                  onClick={() => { socket?.emit('showInsertSegment', { type: 'media', src: '', title: 'Break', duration: 30, autoAdvance: true }); }}>
                  + Insert Break
                </Button>
                <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs"
                  onClick={() => { socket?.emit('showInsertSegment', { type: 'leaderboard', duration: 15 }); }}>
                  + Insert Leaderboard
                </Button>
              </div>
            )}
          </div>

        ) : (
          /* ═══ BREAK / MEDIA ═══ */
          <div className="space-y-4 py-8 text-center">
            <p className="text-[11px] uppercase tracking-widest text-slate-400">
              {showState?.isActive
                ? `Segment ${(showState.currentSegmentIndex ?? 0) + 1} of ${showState.totalSegments}`
                : 'Now Playing'}
            </p>
            <p className="text-xl font-bold text-slate-800">
              {showState?.currentSegmentTitle || showState?.currentSegmentType || 'Break'}
            </p>
            <Button
              className="w-full min-h-[56px] text-lg font-bold rounded-2xl text-white"
              style={{ backgroundColor: '#e94560' }}
              onClick={() => handleAction('show-advance', () => socket?.emit('showAdvance'))}
            >
              Next Segment →
            </Button>
            {showState?.isActive && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs"
                  onClick={() => { socket?.emit('showInsertSegment', { type: 'media', src: '', title: 'Break', duration: 30, autoAdvance: true }); }}>
                  + Insert Break
                </Button>
                <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs"
                  onClick={() => { socket?.emit('showInsertSegment', { type: 'leaderboard', duration: 15 }); }}>
                  + Insert Leaderboard
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ BOTTOM TRAY ═══ */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-3 pt-2 pb-3">
        {/* Expandable panels */}
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
                <span className="text-sm font-semibold flex-1 text-slate-700 truncate">{team.name}</span>
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

        {/* Tray buttons — equal width grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            className={`flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              leaderboardActive
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            onClick={() => handleAction('lb-toggle', () => socket?.emit('toggleLeaderboard', !leaderboardActive))}
          >
            🏆 {leaderboardActive ? 'ON' : 'Board'}
          </button>

          <button
            className={`flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              showFx ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowFx(!showFx); setShowEmergency(false); setShowScoreAdjust(false); }}
          >
            🎬 FX
          </button>

          <button
            className={`flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              showScoreAdjust ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowScoreAdjust(!showScoreAdjust); setShowEmergency(false); setShowFx(false); }}
          >
            ± Score
          </button>

          <button
            className={`flex items-center justify-center gap-1.5 h-11 rounded-xl text-xs font-semibold transition-colors ${
              showEmergency ? 'bg-red-100 text-red-600 border border-red-300' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
            onClick={(e) => { e.stopPropagation(); setShowEmergency(!showEmergency); setShowScoreAdjust(false); setShowFx(false); }}
          >
            ⚠️ SOS
          </button>
        </div>
      </div>
    </div>
  );
}
