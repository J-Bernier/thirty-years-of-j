import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import GameConfiguration from '@/components/GameConfiguration';
import type { ShowDefinition, ShowMedia, QuizQuestion } from '../types';
import { Trash2, Plus, ArrowLeft, Pencil, Check, X, ChevronDown } from 'lucide-react';

type DashboardMode = 'picker' | 'prep' | 'lobby' | 'live' | 'postshow';

export default function HostDashboard() {
  const { isConnected, socket, gameState } = useSocket();
  const [mode, setMode] = useState<DashboardMode>('picker');
  const [selectedShowId, setSelectedShowId] = useState<string | null>(
    () => localStorage.getItem('hostSelectedShowId')
  );

  // Picker state
  const [shows, setShows] = useState<ShowDefinition[]>([]);
  const [creatingShow, setCreatingShow] = useState(false);
  const [newShowName, setNewShowName] = useState('');

  // Prep state
  const [selectedShow, setSelectedShow] = useState<ShowDefinition | null>(null);
  const [showMedia, setShowMedia] = useState<ShowMedia[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [newMediaTitle, setNewMediaTitle] = useState('');
  const [newMediaSrc, setNewMediaSrc] = useState('');
  const [newMediaDuration, setNewMediaDuration] = useState('');
  const [prepTab, setPrepTab] = useState<'quiz' | 'media' | null>(null);

  // Live state
  const [goingLive, setGoingLive] = useState(false);
  const [segmentComplete, setSegmentComplete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mediaPicker, setMediaPicker] = useState(false);

  // Per-action debounce
  const blockedActions = useRef(new Set<string>());
  const handleAction = useCallback((key: string, action: () => void, duration = 1000) => {
    if (blockedActions.current.has(key)) return;
    action();
    blockedActions.current.add(key);
    setTimeout(() => blockedActions.current.delete(key), duration);
  }, []);

  // Mode inference on mount (refresh recovery)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.show?.isLive && gameState.show.currentSegmentType) setMode('live');
    else if (gameState.show?.isLive) setMode('lobby');
    else {
      const savedShowId = localStorage.getItem('hostSelectedShowId');
      if (savedShowId) setMode('prep');
      else setMode('picker');
    }
  }, []); // only on mount

  // Transition from lobby to live when first segment starts
  useEffect(() => {
    if (mode === 'lobby' && gameState?.show?.isLive && gameState.show.currentSegmentType) {
      setMode('live');
    }
  }, [mode, gameState?.show?.currentSegmentType]);

  // Transition to postshow when show is no longer live (host ended it)
  useEffect(() => {
    if ((mode === 'live' || mode === 'lobby') && gameState && !gameState.show?.isLive && gameState.phase === 'LOBBY') {
      // Show was cancelled or ended, go back to picker
      setMode('picker');
    }
  }, [mode, gameState?.show?.isLive, gameState?.phase]);

  // Fetch shows for picker
  const fetchShows = useCallback(() => {
    socket?.emit('adminGetShows', (fetched: ShowDefinition[]) => {
      setShows(fetched.sort((a, b) => b.updatedAt - a.updatedAt));
    });
  }, [socket]);

  useEffect(() => {
    if (mode === 'picker') fetchShows();
  }, [mode, fetchShows]);

  // Fetch show data for prep mode
  const fetchShowData = useCallback((showId: string) => {
    if (!socket) return;
    socket.emit('adminGetShows', (fetched: ShowDefinition[]) => {
      const show = fetched.find(s => s.id === showId);
      if (show) setSelectedShow(show);
    });
    socket.emit('adminGetShowQuestions', showId, (questions: QuizQuestion[]) => {
      setQuestionCount(questions.length);
    });
    socket.emit('adminGetShowMedia', showId, (media: ShowMedia[]) => {
      setShowMedia(media);
    });
  }, [socket]);

  useEffect(() => {
    if (mode === 'prep' && selectedShowId) fetchShowData(selectedShowId);
  }, [mode, selectedShowId, fetchShowData]);

  // Helpers
  const selectShow = (showId: string) => {
    setSelectedShowId(showId);
    localStorage.setItem('hostSelectedShowId', showId);
    setMode('prep');
  };

  const createShow = () => {
    if (!socket || !newShowName.trim()) return;
    socket.emit('adminSaveShow', { name: newShowName.trim() }, (result) => {
      if (result.success && result.id) {
        setCreatingShow(false);
        setNewShowName('');
        selectShow(result.id);
      }
    });
  };

  const deleteShow = (id: string) => {
    if (!socket || !confirm('Delete this show?')) return;
    socket.emit('adminDeleteShow', id, (success: boolean) => {
      if (success) fetchShows();
    });
  };

  const goLive = () => {
    if (!socket || !selectedShowId) return;
    setGoingLive(true);
    socket.emit('showGoLive', selectedShowId, (result) => {
      if (result.success) {
        setTimeout(() => {
          setGoingLive(false);
          setMode('lobby');
        }, 1500);
      } else {
        setGoingLive(false);
        setActionError(result.error || 'Failed to go live');
      }
    });
  };

  const saveShowName = () => {
    if (!socket || !selectedShowId || !editNameValue.trim()) return;
    socket.emit('adminSaveShow', { id: selectedShowId, name: editNameValue.trim() }, (result) => {
      if (result.success) {
        setEditingName(false);
        fetchShowData(selectedShowId);
      }
    });
  };

  const addMedia = () => {
    if (!socket || !selectedShowId || !newMediaSrc.trim()) return;
    const media: Omit<ShowMedia, 'id'> = {
      title: newMediaTitle.trim() || 'Untitled',
      src: newMediaSrc.trim(),
      duration: newMediaDuration ? parseInt(newMediaDuration) : undefined,
    };
    socket.emit('adminAddShowMedia', selectedShowId, media, (result) => {
      if (result.success) {
        setNewMediaTitle('');
        setNewMediaSrc('');
        setNewMediaDuration('');
        fetchShowData(selectedShowId);
      }
    });
  };

  const deleteMedia = (mediaId: string) => {
    if (!socket || !selectedShowId) return;
    socket.emit('adminDeleteShowMedia', selectedShowId, mediaId, (success: boolean) => {
      if (success) fetchShowData(selectedShowId);
    });
  };

  const sendQuizAction = (type: string, payload?: Record<string, unknown>) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  const executeSegment = (config: Record<string, unknown>) => {
    socket?.emit('showExecuteSegment', config);
    setMediaPicker(false);
  };

  const finishSegment = () => {
    socket?.emit('showFinishSegment');
    setSegmentComplete(true);
    setTimeout(() => setSegmentComplete(false), 1000);
  };

  const endShow = () => {
    socket?.emit('showEndShow');
    localStorage.removeItem('hostSelectedShowId');
    setSelectedShowId(null);
    setSelectedShow(null);
    setMode('picker');
  };

  // Derived state
  const teamCount = gameState?.teams.length || 0;
  const quiz = gameState?.quiz;
  const showState = gameState?.show;
  const leaderboardActive = !!gameState?.showLeaderboard;
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
        return { id: t.id, name: t.name, color: t.color, correct, answered: !!answer?.locked, score: t.score };
      }).sort((a, b) => b.score - a.score) || []
    : null;

  // Determine live segment state
  const liveSegment = showState?.currentSegmentType;
  const quizPhase = quiz?.phase;

  const getLivePhase = (): string => {
    if (!liveSegment) return 'idle';
    if (liveSegment === 'quiz') {
      if (quizPhase === 'QUESTION') return 'quiz-question';
      if (quizPhase === 'REVEAL') return 'quiz-reveal';
      if (quizPhase === 'END') return 'quiz-end';
      return 'quiz-idle';
    }
    if (liveSegment === 'media') return 'media';
    if (liveSegment === 'leaderboard') return 'leaderboard';
    return 'idle';
  };

  const livePhase = getLivePhase();

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#0a0a1a', color: '#f0f0f0' }}>
      <AnimatePresence mode="wait">

        {/* ═══ GO LIVE OVERLAY ═══ */}
        {goingLive && (
          <motion.div
            key="going-live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: '#e94560' }}
          >
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl font-black text-white tracking-wider"
            >
              GOING LIVE
            </motion.span>
          </motion.div>
        )}

        {/* ═══ MODE: PICKER ═══ */}
        {mode === 'picker' && (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Shows</h1>
                <Button
                  className="h-9 text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  onClick={() => setCreatingShow(true)}
                >
                  <Plus className="w-4 h-4 mr-1.5" /> New Show
                </Button>
              </div>

              {/* Create form */}
              {creatingShow && (
                <div className="flex gap-2 p-3 rounded-lg" style={{ backgroundColor: '#1a1a2e' }}>
                  <Input
                    value={newShowName}
                    onChange={e => setNewShowName(e.target.value)}
                    placeholder="Show name..."
                    className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-gray-500"
                    onKeyDown={e => e.key === 'Enter' && createShow()}
                    autoFocus
                  />
                  <Button className="h-9" style={{ backgroundColor: '#e94560' }} onClick={createShow}>Create</Button>
                  <Button className="h-9 bg-white/10" onClick={() => { setCreatingShow(false); setNewShowName(''); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Empty state */}
              {shows.length === 0 && !creatingShow && (
                <div className="text-center py-16 space-y-3">
                  <p className="text-2xl font-bold">Ready to host?</p>
                  <p className="text-sm text-gray-500">Create your first show to get started. Each show has its own questions and media.</p>
                  <Button
                    className="h-11 mt-4 text-white"
                    style={{ backgroundColor: '#e94560' }}
                    onClick={() => setCreatingShow(true)}
                  >
                    Create your first show
                  </Button>
                </div>
              )}

              {/* Most recent show — promoted */}
              {shows.length > 0 && (
                <>
                  <div
                    className="p-4 rounded-lg cursor-pointer hover:ring-1 hover:ring-white/20 transition-all"
                    style={{ backgroundColor: '#1a1a2e' }}
                    onClick={() => selectShow(shows[0].id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold">{shows[0].name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Last updated {new Date(shows[0].updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button className="h-10 px-6 text-white" style={{ backgroundColor: '#e94560' }}>
                        Continue
                      </Button>
                    </div>
                  </div>

                  {/* Other shows — compact rows */}
                  {shows.slice(1).map(show => (
                    <div
                      key={show.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{show.name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(show.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-3">
                        <Button
                          className="h-8 text-xs bg-white/10 hover:bg-white/20"
                          onClick={() => selectShow(show.id)}
                        >
                          Select
                        </Button>
                        <button
                          className="text-gray-500 hover:text-red-400 p-1"
                          onClick={(e) => { e.stopPropagation(); deleteShow(show.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ MODE: PREP ═══ */}
        {mode === 'prep' && selectedShowId && (
          <motion.div
            key="prep"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto p-4 space-y-5">
              {/* Back + show name */}
              <div className="flex items-center gap-3">
                <button
                  className="text-gray-500 hover:text-white transition-colors"
                  onClick={() => {
                    localStorage.removeItem('hostSelectedShowId');
                    setSelectedShowId(null);
                    setSelectedShow(null);
                    setMode('picker');
                  }}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {editingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      className="flex-1 bg-white/10 border-white/10 text-white text-lg font-bold"
                      onKeyDown={e => e.key === 'Enter' && saveShowName()}
                      autoFocus
                    />
                    <button className="text-green-400 hover:text-green-300" onClick={saveShowName}>
                      <Check className="w-5 h-5" />
                    </button>
                    <button className="text-gray-500 hover:text-white" onClick={() => setEditingName(false)}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <h1 className="text-xl font-bold truncate">{selectedShow?.name || 'Loading...'}</h1>
                    <button
                      className="text-gray-500 hover:text-white"
                      onClick={() => {
                        setEditNameValue(selectedShow?.name || '');
                        setEditingName(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Readiness summary */}
              <div className="flex gap-4 text-sm text-gray-400">
                <span>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                <span>{showMedia.length} media clip{showMedia.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Round types */}
              <div className="space-y-4">
                {/* Quiz round card */}
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a2e' }}>
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    onClick={() => setPrepTab(prepTab === 'quiz' ? null : 'quiz')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#e94560]/20 flex items-center justify-center text-lg">
                        <span role="img" aria-label="quiz">&#10068;</span>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">Quiz Rounds</p>
                        <p className="text-xs text-gray-500">Trivia questions with timer</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${prepTab === 'quiz' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {prepTab === 'quiz' && (
                    <div className="px-4 pb-4 border-t border-white/5">
                      <GameConfiguration showId={selectedShowId} onCountChange={setQuestionCount} />
                    </div>
                  )}
                </div>

                {/* Media breaks card */}
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a2e' }}>
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    onClick={() => setPrepTab(prepTab === 'media' ? null : 'media')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#00a8e8]/20 flex items-center justify-center text-lg">
                        <span role="img" aria-label="media">&#127910;</span>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">Media Breaks</p>
                        <p className="text-xs text-gray-500">Video or image intermissions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{showMedia.length} clip{showMedia.length !== 1 ? 's' : ''}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${prepTab === 'media' ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {prepTab === 'media' && (
                    <div className="px-4 pb-4 border-t border-white/5 space-y-3 pt-3">
                      {showMedia.length > 0 && (
                        <div className="space-y-2">
                          {showMedia.map(m => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate">{m.title}</p>
                                <p className="text-xs text-gray-500 truncate">{m.src}</p>
                              </div>
                              {m.duration && <span className="text-xs text-gray-500 ml-2">{m.duration}s</span>}
                              <button
                                className="text-gray-500 hover:text-red-400 ml-2"
                                onClick={() => deleteMedia(m.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-3 rounded-lg space-y-2 bg-white/5">
                        <div className="flex gap-2">
                          <Input
                            value={newMediaTitle}
                            onChange={e => setNewMediaTitle(e.target.value)}
                            placeholder="Title"
                            className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-gray-500 h-9 text-sm"
                          />
                          <Input
                            value={newMediaDuration}
                            onChange={e => setNewMediaDuration(e.target.value)}
                            placeholder="Sec"
                            type="number"
                            className="w-16 bg-white/10 border-white/10 text-white placeholder:text-gray-500 h-9 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newMediaSrc}
                            onChange={e => setNewMediaSrc(e.target.value)}
                            placeholder="URL (video/image)"
                            className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-gray-500 h-9 text-sm"
                            onKeyDown={e => e.key === 'Enter' && addMedia()}
                          />
                          <Button className="h-9 text-sm bg-white/10 hover:bg-white/20" onClick={addMedia}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Leaderboard card (no content to manage, just info) */}
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#1a1a2e' }}>
                  <div className="w-10 h-10 rounded-lg bg-[#ffb700]/20 flex items-center justify-center text-lg">
                    <span role="img" aria-label="leaderboard">&#127942;</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Leaderboard</p>
                    <p className="text-xs text-gray-500">Show standings between rounds. No setup needed.</p>
                  </div>
                </div>
              </div>

              {/* GO LIVE button */}
              <Button
                className="w-full h-14 text-xl font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: '#e94560' }}
                onClick={goLive}
                disabled={questionCount === 0}
              >
                GO LIVE
              </Button>
              {actionError && (
                <p className="text-sm text-red-400 text-center">{actionError}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ MODE: LOBBY / LIVE ═══ */}
        {(mode === 'lobby' || mode === 'live') && (
          <motion.div
            key="live-shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Connection indicator */}
            <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between" style={{ backgroundColor: '#1a1a2e' }}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
                <span className="text-xs font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded">
                  LIVE
                </span>
                {showState?.instanceName && (
                  <span className="text-xs text-gray-500 ml-2">{showState.instanceName}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {quiz?.phase === 'QUESTION' && (
                  <>
                    <span className={`text-2xl font-black tabular-nums font-mono ${(quiz?.timer ?? 99) <= 5 ? 'text-red-400' : ''}`}>
                      {quiz?.timer}s
                    </span>
                    <span className="text-xs text-gray-500">
                      Q{(quiz?.currentQuestionIndex ?? 0) + 1}/{quiz?.config.totalQuestions}
                    </span>
                  </>
                )}
                <span className="text-xs text-gray-500">{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* 3-panel layout (lg+) or stacked (mobile) */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

              {/* LEFT PANEL — Status */}
              <div className="hidden lg:flex lg:w-1/4 flex-col p-4 border-r" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Status</p>
                <LeftPanel livePhase={livePhase} quiz={quiz} teamCount={teamCount} answeredCount={answeredCount} showState={showState} />
              </div>

              {/* CENTER PANEL — Actions */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
                {segmentComplete ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                  >
                    <span className="text-4xl">&#10003;</span>
                    <p className="text-green-400 font-semibold mt-2">Complete</p>
                  </motion.div>
                ) : (
                  <CenterPanel
                    livePhase={livePhase}
                    quiz={quiz}
                    isLastQuestion={isLastQuestion}
                    questionCount={questionCount}
                    showMedia={showMedia}
                    mediaPicker={mediaPicker}
                    setMediaPicker={setMediaPicker}
                    handleAction={handleAction}
                    sendQuizAction={sendQuizAction}
                    executeSegment={executeSegment}
                    finishSegment={finishSegment}
                    actionError={actionError}
                  />
                )}

                {/* Mobile: collapsed status line */}
                <div className="lg:hidden mt-4">
                  <LeftPanel livePhase={livePhase} quiz={quiz} teamCount={teamCount} answeredCount={answeredCount} showState={showState} compact />
                </div>
              </div>

              {/* RIGHT PANEL — Context */}
              <div className="hidden lg:flex lg:w-1/4 flex-col p-4 border-l overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Context</p>
                <RightPanel
                  livePhase={livePhase}
                  quiz={quiz}
                  gameState={gameState}
                  answerDistribution={answerDistribution}
                  teamResults={teamResults}
                  questionCount={questionCount}
                  showMedia={showMedia}
                />
              </div>
            </div>

            {/* FX BAR */}
            <FxBar
              socket={socket}
              leaderboardActive={leaderboardActive}
              handleAction={handleAction}
              onEndShow={() => {
                if (confirm('End this show?')) {
                  socket?.emit('showFinishSegment');
                  setMode('postshow');
                }
              }}
            />
          </motion.div>
        )}

        {/* ═══ MODE: POSTSHOW ═══ */}
        {mode === 'postshow' && (
          <PostShow gameState={gameState} onEnd={endShow} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// LEFT PANEL
// ─────────────────────────────────────────────
function LeftPanel({
  livePhase, quiz, teamCount, answeredCount, showState, compact,
}: {
  livePhase: string;
  quiz: ReturnType<typeof useSocket>['gameState'] extends { quiz: infer Q } ? Q : never;
  teamCount: number;
  answeredCount: number;
  showState: ReturnType<typeof useSocket>['gameState'] extends { show?: infer S } ? S : never;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <span className="font-semibold text-white">
          {livePhase === 'idle' && 'Ready'}
          {livePhase === 'quiz-question' && `Q${(quiz?.currentQuestionIndex ?? 0) + 1} — ${answeredCount}/${teamCount} answered`}
          {livePhase === 'quiz-reveal' && 'Reveal'}
          {livePhase === 'quiz-end' && 'Round Complete'}
          {livePhase === 'quiz-idle' && 'Quiz Setup'}
          {livePhase === 'media' && 'Media Break'}
          {livePhase === 'leaderboard' && 'Leaderboard'}
        </span>
        {livePhase === 'idle' && <span>{teamCount} teams joined</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {livePhase === 'idle' && (
        <>
          <p className="text-2xl font-bold">Ready</p>
          <p className="text-sm text-gray-500">{teamCount} team{teamCount !== 1 ? 's' : ''} joined</p>
        </>
      )}
      {livePhase === 'quiz-question' && (
        <>
          <p className={`text-5xl font-black tabular-nums font-mono ${(quiz?.timer ?? 99) <= 5 ? 'text-red-400' : (quiz?.timer ?? 99) <= 10 ? 'text-yellow-400' : ''}`}>
            {quiz?.timer}s
          </p>
          <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Quiz Round</p>
          <p className="text-base text-gray-200">Q{(quiz?.currentQuestionIndex ?? 0) + 1} of {quiz?.config.totalQuestions}</p>
          <p className="text-sm text-gray-500">{answeredCount}/{teamCount} answered</p>
        </>
      )}
      {livePhase === 'quiz-reveal' && (
        <>
          <p className="text-2xl font-bold">Reveal</p>
          <p className="text-sm text-gray-500">
            {quiz?.currentQuestion?.options[quiz?.currentQuestion?.correctOptionIndex ?? 0]}
          </p>
        </>
      )}
      {livePhase === 'quiz-end' && (
        <p className="text-2xl font-bold">Round Complete</p>
      )}
      {livePhase === 'quiz-idle' && (
        <>
          <p className="text-2xl font-bold">Quiz</p>
          <p className="text-sm text-gray-500">Setting up...</p>
        </>
      )}
      {livePhase === 'media' && (
        <>
          <p className="text-2xl font-bold">Media Break</p>
          {showState?.mediaState && (
            <>
              {showState.mediaState.title && (
                <p className="text-base text-gray-200">{showState.mediaState.title}</p>
              )}
              <p className="text-sm text-gray-500">
                {showState.mediaState.elapsed}s
                {showState.mediaState.duration ? ` / ${showState.mediaState.duration}s` : ''}
              </p>
            </>
          )}
        </>
      )}
      {livePhase === 'leaderboard' && (
        <p className="text-2xl font-bold">Leaderboard</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// CENTER PANEL
// ─────────────────────────────────────────────
function CenterPanel({
  livePhase, quiz, isLastQuestion, questionCount, showMedia, mediaPicker, setMediaPicker,
  handleAction, sendQuizAction, executeSegment, finishSegment, actionError,
}: {
  livePhase: string;
  quiz: any;
  isLastQuestion: boolean;
  questionCount: number;
  showMedia: ShowMedia[];
  mediaPicker: boolean;
  setMediaPicker: (v: boolean) => void;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  sendQuizAction: (type: string, payload?: Record<string, unknown>) => void;
  executeSegment: (config: Record<string, unknown>) => void;
  finishSegment: () => void;
  actionError: string | null;
}) {
  const idleActions = (
    <div className="space-y-3 max-w-md mx-auto w-full">
      <Button
        className="w-full h-14 text-xl font-bold text-white"
        style={{ backgroundColor: '#e94560' }}
        onClick={() => handleAction('start-quiz', () =>
          executeSegment({ type: 'quiz', timePerQuestion: 30, totalQuestions: questionCount }), 3000)}
      >
        Start Quiz Round
      </Button>
      <Button
        className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
        onClick={() => handleAction('show-lb', () =>
          executeSegment({ type: 'leaderboard' }), 2000)}
      >
        Show Leaderboard
      </Button>
      <Button
        className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
        onClick={() => setMediaPicker(true)}
      >
        Play Media
      </Button>

      {/* Media picker */}
      {mediaPicker && (
        <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: '#1a1a2e' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Select media</p>
          {showMedia.length === 0 ? (
            <p className="text-sm text-gray-500">No media clips. Add them in prep mode.</p>
          ) : (
            showMedia.map(m => (
              <button
                key={m.id}
                className="w-full text-left p-2 rounded hover:bg-white/10 transition-colors"
                onClick={() => handleAction('play-media', () =>
                  executeSegment({ type: 'media', src: m.src, title: m.title, duration: m.duration, autoAdvance: true }), 2000)}
              >
                <p className="text-sm font-semibold">{m.title}</p>
                {m.duration && <p className="text-xs text-gray-500">{m.duration}s</p>}
              </button>
            ))
          )}
          <Button className="w-full h-8 text-xs bg-white/10" onClick={() => setMediaPicker(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {(livePhase === 'idle' || livePhase === 'quiz-end') && idleActions}

      {livePhase === 'quiz-idle' && (
        <div className="max-w-md mx-auto w-full space-y-3">
          <Button
            className="w-full h-14 text-xl font-bold text-white"
            style={{ backgroundColor: '#e94560' }}
            onClick={() => handleAction('start-30', () =>
              sendQuizAction('START', { timePerQuestion: 30, totalQuestions: questionCount }), 3000)}
          >
            Start — 30s per question
          </Button>
          <Button
            className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
            onClick={() => handleAction('start-15', () =>
              sendQuizAction('START', { timePerQuestion: 15, totalQuestions: questionCount }), 3000)}
          >
            Blitz — 15s per question
          </Button>
        </div>
      )}

      {livePhase === 'quiz-question' && (
        <div className="max-w-md mx-auto w-full space-y-3">
          {/* Current question preview */}
          {quiz?.currentQuestion && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#1a1a2e' }}>
              <p className="text-sm font-semibold">{quiz.currentQuestion.text}</p>
              <p className="text-xs text-green-400 mt-1">
                Answer: {quiz.currentQuestion.options[quiz.currentQuestion.correctOptionIndex]}
              </p>
            </div>
          )}
          <Button
            className="w-full h-14 text-xl font-bold text-white"
            style={{ backgroundColor: '#e94560' }}
            onClick={() => handleAction('reveal', () => sendQuizAction('REVEAL'))}
          >
            Reveal Answer
          </Button>
          <Button
            className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
            onClick={() => handleAction('skip', () => sendQuizAction('REVEAL'))}
          >
            Skip Question
          </Button>
        </div>
      )}

      {livePhase === 'quiz-reveal' && (
        <div className="max-w-md mx-auto w-full space-y-3">
          <Button
            className="w-full h-14 text-xl font-bold text-white"
            style={{ backgroundColor: '#e94560' }}
            onClick={() => handleAction('next', () =>
              sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
          >
            {isLastQuestion ? 'Show Results' : 'Next Question'}
          </Button>
          <Button
            className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
            onClick={() => handleAction('end-round', () => sendQuizAction('SKIP_TO_END'))}
          >
            End Round
          </Button>
        </div>
      )}

      {livePhase === 'media' && (
        <div className="max-w-md mx-auto w-full">
          <Button
            className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
            onClick={() => handleAction('skip-media', () => finishSegment())}
          >
            Skip
          </Button>
        </div>
      )}

      {livePhase === 'leaderboard' && (
        <div className="max-w-md mx-auto w-full">
          <Button
            className="w-full h-11 text-base font-semibold bg-white/10 hover:bg-white/20"
            onClick={() => handleAction('dismiss-lb', () => finishSegment())}
          >
            Dismiss
          </Button>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-red-400 text-center">{actionError}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// RIGHT PANEL
// ─────────────────────────────────────────────
function RightPanel({
  livePhase, quiz, gameState, answerDistribution, teamResults, questionCount, showMedia,
}: {
  livePhase: string;
  quiz: any;
  gameState: any;
  answerDistribution: number[] | null;
  teamResults: any[] | null;
  questionCount: number;
  showMedia: ShowMedia[];
}) {
  // Idle: content remaining
  if (livePhase === 'idle' || livePhase === 'quiz-end') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-500">Content remaining</p>
          <p className="text-base text-gray-200 mt-1">{questionCount} questions available</p>
          <p className="text-base text-gray-200">{showMedia.length} media clips</p>
        </div>
        {gameState?.teams?.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-2">Teams</p>
            {gameState.teams.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-1">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-sm flex-1 truncate">{t.name}</span>
                <span className="text-sm text-gray-500 tabular-nums">{t.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Quiz question: answer distribution
  if (livePhase === 'quiz-question' && answerDistribution && quiz?.currentQuestion) {
    const teamCount = Math.max(gameState?.teams?.length || 1, 1);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-500 mb-2">Answer distribution</p>
          {quiz.currentQuestion.options.map((opt: string, i: number) => {
            const count = answerDistribution[i];
            const percent = (count / teamCount) * 100;
            const isCorrect = i === quiz.currentQuestion!.correctOptionIndex;
            return (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold w-4 text-gray-500">{String.fromCharCode(65 + i)}</span>
                <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(percent, 3)}%`,
                      backgroundColor: isCorrect ? '#00c896' : 'rgba(255,255,255,0.2)',
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums w-4 text-right text-gray-500">{count}</span>
              </div>
            );
          })}
        </div>
        <div>
          <p className="text-sm text-gray-500 mb-1">Team status</p>
          {gameState?.teams?.map((t: any) => {
            const answered = quiz.answers[t.id]?.locked;
            return (
              <div key={t.id} className="flex items-center gap-2 py-0.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: answered ? '#00c896' : 'rgba(255,255,255,0.1)' }} />
                <span className="text-xs truncate">{t.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Quiz reveal: per-team results
  if (livePhase === 'quiz-reveal' && teamResults) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500 mb-2">Results</p>
        {teamResults.map((t: any) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <span className={`text-sm ${t.correct ? 'text-green-400' : t.answered ? 'text-red-400' : 'text-gray-600'}`}>
              {t.correct ? '\u2713' : t.answered ? '\u2717' : '\u2014'}
            </span>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
            <span className="text-sm flex-1 truncate">{t.name}</span>
            <span className="text-sm text-gray-500 tabular-nums">{t.score}</span>
          </div>
        ))}
      </div>
    );
  }

  // Leaderboard: full standings
  if (livePhase === 'leaderboard' && gameState?.teams) {
    const sorted = [...gameState.teams].sort((a: any, b: any) => b.score - a.score);
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500 mb-2">Standings</p>
        {sorted.map((t: any, i: number) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <span className="text-xs font-bold w-4 text-gray-500">{i + 1}</span>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
            <span className="text-sm flex-1 truncate">{t.name}</span>
            <span className="text-sm text-gray-500 tabular-nums">{t.score}</span>
          </div>
        ))}
      </div>
    );
  }

  // Media: content inventory
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">{questionCount} questions, {showMedia.length} media clips</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// FX BAR
// ─────────────────────────────────────────────
function FxBar({
  socket, leaderboardActive, handleAction, onEndShow,
}: {
  socket: any;
  leaderboardActive: boolean;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  onEndShow: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 h-16 flex items-center justify-center gap-3 px-4 border-t"
      style={{ backgroundColor: '#1a1a2e', borderColor: 'rgba(255,255,255,0.05)' }}
    >
      <button
        className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg transition-colors ${
          leaderboardActive ? 'bg-yellow-500/20 ring-1 ring-yellow-500/50' : 'bg-white/10 hover:bg-white/20'
        }`}
        onClick={() => handleAction('lb-toggle', () => socket?.emit('toggleLeaderboard', !leaderboardActive))}
        title="Leaderboard"
      >
        <span role="img" aria-label="leaderboard">&#127942;</span>
      </button>
      <button
        className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
        onClick={() => handleAction('confetti', () => socket?.emit('triggerAnimation', 'confetti'), 2000)}
        title="Confetti"
      >
        <span role="img" aria-label="confetti">&#127881;</span>
      </button>
      <button
        className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
        onClick={() => handleAction('applause', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/applause.mp3', duration: 5 }), 5000)}
        title="Applause"
      >
        <span role="img" aria-label="applause">&#128079;</span>
      </button>
      <button
        className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
        onClick={() => handleAction('boo', () => socket?.emit('adminPlayMedia', { type: 'audio', url: '/assets/sounds/boo.mp3', duration: 3 }), 3000)}
        title="Boo"
      >
        <span role="img" aria-label="boo">&#128078;</span>
      </button>
      <button
        className="w-12 h-12 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-lg"
        onClick={onEndShow}
        title="End Show"
      >
        <span role="img" aria-label="end show">&#9888;&#65039;</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// POSTSHOW
// ─────────────────────────────────────────────
function PostShow({
  gameState, onEnd,
}: {
  gameState: any;
  onEnd: () => void;
}) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  }, []);

  const sorted = [...(gameState?.teams || [])].sort((a: any, b: any) => b.score - a.score);
  const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <motion.div
      key="postshow"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center p-6 space-y-6"
    >
      <h1 className="text-3xl font-black">Great show!</h1>

      <div className="w-full max-w-md space-y-3">
        {sorted.map((t: any, i: number) => (
          <div
            key={t.id}
            className="flex items-center gap-3 p-4 rounded-lg"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            <span
              className="text-xl font-black w-8 text-center"
              style={{ color: medals[i] || '#888' }}
            >
              {i + 1}
            </span>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
            <span className="text-lg font-bold flex-1">{t.name}</span>
            <span className="text-lg font-bold tabular-nums">{t.score}</span>
          </div>
        ))}
      </div>

      <div className="text-sm text-gray-500 text-center space-y-1">
        <p>{sorted.length} teams played</p>
        {gameState?.quiz?.config?.totalQuestions && (
          <p>{gameState.quiz.config.totalQuestions} questions</p>
        )}
      </div>

      <Button
        className="h-14 px-8 text-lg font-bold text-white"
        style={{ backgroundColor: '#e94560' }}
        onClick={onEnd}
      >
        End Show
      </Button>
    </motion.div>
  );
}
