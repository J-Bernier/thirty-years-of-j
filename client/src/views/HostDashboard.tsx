import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import GameConfiguration from '@/components/GameConfiguration';
import type { ShowDefinition, ShowMedia, QuizQuestion, GameState } from '../types';
import { Trash2, Plus, ArrowLeft, Pencil, Check, X, ChevronDown, Play, Trophy, Monitor, QrCode, Flame, Snowflake, VolumeX, ShieldAlert, Eye, SkipForward, StopCircle, Send, Minus } from 'lucide-react';

type DashboardMode = 'picker' | 'prep' | 'live';
type LiveTab = 'sounds' | 'titles' | 'games' | 'media' | 'teams';

// Sound cues
const SOUND_CUES = [
  { emoji: '🥁', label: 'Drumroll', url: '/sfx/drumroll.mp3' },
  { emoji: '🎺', label: 'Fanfare', url: '/sfx/fanfare.mp3' },
  { emoji: '👏', label: 'Applause', url: '/sfx/applause.mp3' },
  { emoji: '😰', label: 'Suspense', url: '/sfx/suspense.mp3' },
  { emoji: '🎵', label: 'Intro Music', url: '/sfx/intro.mp3' },
  { emoji: '📺', label: 'TV Static', url: '/sfx/static.mp3' },
  { emoji: '❌', label: 'Wrong Buzz', url: '/sfx/wrong.mp3' },
  { emoji: '✅', label: 'Correct Ding', url: '/sfx/correct.mp3' },
  { emoji: '🎤', label: 'Mic Drop', url: '/sfx/micdrop.mp3' },
];

// Hardcoded title cards
const TITLE_CARDS = [
  '30 Years of J',
  'Round 1',
  'Round 2',
  'Final Round',
  'Thank You!',
];

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveTab, setLiveTab] = useState<LiveTab>('sounds');
  const [mediaPicker, setMediaPicker] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

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
    if (gameState.show?.isLive) setMode('live');
    else {
      const savedShowId = localStorage.getItem('hostSelectedShowId');
      if (savedShowId) setMode('prep');
      else setMode('picker');
    }
  }, []); // only on mount

  // Transition to live when show goes live
  useEffect(() => {
    if (gameState?.show?.isLive && mode !== 'live' && !goingLive) {
      setMode('live');
    }
  }, [gameState?.show?.isLive]);

  // Transition back to picker when show ends
  useEffect(() => {
    if (mode === 'live' && gameState && !gameState.show?.isLive && gameState.phase === 'LOBBY') {
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
    if ((mode === 'prep' || mode === 'live') && selectedShowId) fetchShowData(selectedShowId);
  }, [mode, selectedShowId, fetchShowData]);

  // Helpers
  const selectShow = (showId: string) => {
    setSelectedShowId(showId);
    localStorage.setItem('hostSelectedShowId', showId);
    setMode('prep');
  };

  const createShow = () => {
    if (!socket || !newShowName.trim()) return;
    socket.emit('adminSaveShow', { name: newShowName.trim() }, (result: { success: boolean; id?: string; error?: string }) => {
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
    socket.emit('showGoLive', selectedShowId, (result: { success: boolean; error?: string }) => {
      if (result.success) {
        setTimeout(() => {
          setGoingLive(false);
          setMode('live');
        }, 1500);
      } else {
        setGoingLive(false);
        setActionError(result.error || 'Failed to go live');
      }
    });
  };

  const saveShowName = () => {
    if (!socket || !selectedShowId || !editNameValue.trim()) return;
    socket.emit('adminSaveShow', { id: selectedShowId, name: editNameValue.trim() }, (result: { success: boolean; id?: string; error?: string }) => {
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
    socket.emit('adminAddShowMedia', selectedShowId, media, (result: { success: boolean; error?: string }) => {
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
  const answeredCount = gameState?.teams.filter(t => quiz?.answers[t.id]?.locked).length || 0;
  const isLastQuestion = (quiz?.currentQuestionIndex ?? 0) === (quiz?.config.totalQuestions || 0) - 1;
  const quizActive = gameState?.activeRound === 'QUIZ' && quiz?.phase !== 'END';
  const leaderboardActive = !!gameState?.showLeaderboard;

  const answerDistribution = quiz?.currentQuestion
    ? quiz.currentQuestion.options.map((_, i) =>
        gameState?.teams.filter(t => quiz.answers[t.id]?.optionIndex === i).length || 0
      )
    : null;

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#0a0a1a', color: '#f0f0f0' }}>
      <AnimatePresence mode="wait">

        {/* GO LIVE OVERLAY */}
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

        {/* MODE: PICKER */}
        {mode === 'picker' && (
          <motion.div
            key="picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto p-4 space-y-4">
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

        {/* MODE: PREP */}
        {mode === 'prep' && selectedShowId && (
          <motion.div
            key="prep"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto p-4 space-y-5">
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

              <div className="flex gap-4 text-sm text-gray-400">
                <span>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                <span>{showMedia.length} media clip{showMedia.length !== 1 ? 's' : ''}</span>
              </div>

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

                {/* Leaderboard card */}
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

        {/* MODE: LIVE — Trigger Grid */}
        {mode === 'live' && (
          <motion.div
            key="live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Status bar */}
            <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between" style={{ backgroundColor: '#1a1a2e' }}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
                <span className="text-xs font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded">
                  LIVE
                </span>
                {showState?.instanceName && (
                  <span className="text-xs text-gray-500 ml-1 truncate max-w-[120px]">{showState.instanceName}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {quiz?.phase === 'QUESTION' && (
                  <span className={`text-lg font-black tabular-nums font-mono ${(quiz?.timer ?? 99) <= 5 ? 'text-red-400' : ''}`}>
                    {quiz?.timer}s
                  </span>
                )}
                <span className="text-xs text-gray-500">{teamCount} team{teamCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Top section: Instant Triggers (~35%) */}
            <div className="flex-shrink-0 p-3" style={{ minHeight: '35%' }}>
              {quizActive ? (
                <QuizTriggers
                  quiz={quiz!}
                  isLastQuestion={isLastQuestion}
                  handleAction={handleAction}
                  sendQuizAction={sendQuizAction}
                  finishSegment={finishSegment}
                />
              ) : (
                <StageTriggers
                  leaderboardActive={leaderboardActive}
                  showMedia={showMedia}
                  mediaPicker={mediaPicker}
                  setMediaPicker={setMediaPicker}
                  handleAction={handleAction}
                  executeSegment={executeSegment}
                  finishSegment={finishSegment}
                  socket={socket}
                />
              )}
            </div>

            {/* Divider */}
            <div className="flex-shrink-0 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

            {/* Bottom section: Browsable Pages (~65%) */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {quizActive ? (
                <QuizInfoPanel
                  quiz={quiz!}
                  gameState={gameState!}
                  answeredCount={answeredCount}
                  teamCount={teamCount}
                  answerDistribution={answerDistribution}
                />
              ) : (
                <>
                  {/* Tab bar */}
                  <div className="flex-shrink-0 flex border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    {(['sounds', 'titles', 'games', 'media', 'teams'] as LiveTab[]).map(tab => (
                      <button
                        key={tab}
                        className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                          liveTab === tab ? 'text-[#e94560]' : 'text-gray-500 hover:text-gray-300'
                        }`}
                        style={liveTab === tab ? { borderBottom: '2px solid #e94560' } : undefined}
                        onClick={() => setLiveTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {liveTab === 'sounds' && (
                      <SoundsTab socket={socket} handleAction={handleAction} />
                    )}
                    {liveTab === 'titles' && (
                      <TitlesTab
                        socket={socket}
                        handleAction={handleAction}
                        customTitle={customTitle}
                        setCustomTitle={setCustomTitle}
                      />
                    )}
                    {liveTab === 'games' && (
                      <GamesTab
                        questionCount={questionCount}
                        handleAction={handleAction}
                        executeSegment={executeSegment}
                      />
                    )}
                    {liveTab === 'media' && (
                      <MediaTab
                        showMedia={showMedia}
                        socket={socket}
                        handleAction={handleAction}
                      />
                    )}
                    {liveTab === 'teams' && (
                      <TeamsTab
                        gameState={gameState}
                        socket={socket}
                        handleAction={handleAction}
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* End show button — always accessible */}
            <div className="flex-shrink-0 px-3 py-2 flex justify-end" style={{ backgroundColor: '#1a1a2e', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                onClick={() => {
                  if (confirm('End this show?')) endShow();
                }}
              >
                End Show
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─────────────────────────────────────────────
// STAGE TRIGGERS (no game active)
// ─────────────────────────────────────────────
function StageTriggers({
  leaderboardActive, showMedia, mediaPicker, setMediaPicker,
  handleAction, executeSegment, finishSegment, socket,
}: {
  leaderboardActive: boolean;
  showMedia: ShowMedia[];
  mediaPicker: boolean;
  setMediaPicker: (v: boolean) => void;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  executeSegment: (config: Record<string, unknown>) => void;
  finishSegment: () => void;
  socket: any;
}) {
  return (
    <div className="space-y-3">
      {/* Row 1 */}
      <div className="grid grid-cols-4 gap-2">
        <TriggerButton
          icon={<Trophy className="w-4 h-4" />}
          label={leaderboardActive ? '✓ Board' : 'Board'}
          className={leaderboardActive ? 'ring-2 ring-[#ffb700] bg-[#ffb700]/20' : ''}
          onClick={() => handleAction('toggle-lb', () => {
            if (leaderboardActive) {
              finishSegment();
            } else {
              executeSegment({ type: 'leaderboard' });
            }
          }, 1000)}
        />
        <TriggerButton
          icon={<Monitor className="w-4 h-4" />}
          label="Media"
          onClick={() => setMediaPicker(!mediaPicker)}
        />
        <TriggerButton
          icon={<QrCode className="w-4 h-4" />}
          label="QR"
          onClick={() => handleAction('show-qr', () =>
            socket?.emit('stageOverlaySet', { type: 'qr' }, () => {}), 1000)}
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-4 gap-2">
        <TriggerButton
          icon={<Flame className="w-4 h-4" />}
          label="Hype"
          className="bg-gradient-to-br from-orange-500/30 to-red-500/30 hover:from-orange-500/50 hover:to-red-500/50"
          onClick={() => handleAction('mood-hype', () =>
            socket?.emit('stageMoodSet', 'hype'))}
        />
        <TriggerButton
          icon={<Snowflake className="w-4 h-4" />}
          label="Chill"
          className="bg-gradient-to-br from-blue-500/30 to-cyan-500/30 hover:from-blue-500/50 hover:to-cyan-500/50"
          onClick={() => handleAction('mood-chill', () =>
            socket?.emit('stageMoodSet', 'chill'))}
        />
        <TriggerButton
          icon={<VolumeX className="w-4 h-4" />}
          label="Mute"
          onClick={() => handleAction('mute', () => {
            socket?.emit('stageAudioMusic', null);
          })}
        />
        <TriggerButton
          icon={<ShieldAlert className="w-4 h-4" />}
          label="SOS"
          className="bg-red-500/10 hover:bg-red-500/30 text-red-400"
          onClick={() => handleAction('sos', () => {
            socket?.emit('showCancel');
            socket?.emit('stageOverlayClear');
            socket?.emit('stageMoodSet', 'neutral');
            socket?.emit('stageAudioMusic', null);
          }, 3000)}
        />
      </div>

      {/* Media picker overlay */}
      {mediaPicker && (
        <div className="p-3 rounded-xl space-y-2" style={{ backgroundColor: '#1a1a2e' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Select media</p>
          {showMedia.length === 0 ? (
            <p className="text-sm text-gray-500">No media clips. Add them in prep mode.</p>
          ) : (
            showMedia.map(m => (
              <button
                key={m.id}
                className="w-full text-left p-2.5 rounded-lg hover:bg-white/10 transition-colors"
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
}


// ─────────────────────────────────────────────
// QUIZ TRIGGERS (quiz active)
// ─────────────────────────────────────────────
function QuizTriggers({
  quiz, isLastQuestion, handleAction, sendQuizAction, finishSegment,
}: {
  quiz: GameState['quiz'];
  isLastQuestion: boolean;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  sendQuizAction: (type: string, payload?: Record<string, unknown>) => void;
  finishSegment: () => void;
}) {
  const phase = quiz.phase;

  return (
    <div className="grid grid-cols-4 gap-2">
      {phase === 'IDLE' && (
        <>
          <TriggerButton
            icon={<Play className="w-4 h-4" />}
            label="Start"
            accent
            onClick={() => handleAction('start-quiz', () =>
              sendQuizAction('START', { timePerQuestion: 30, totalQuestions: quiz.config.totalQuestions }), 2000)}
          />
          <TriggerButton
            icon={<StopCircle className="w-4 h-4" />}
            label="Cancel"
            className="text-red-400"
            onClick={() => handleAction('cancel-quiz', () => {
              sendQuizAction('CANCEL');
              finishSegment();
            }, 2000)}
          />
          <div />
          <div />
        </>
      )}

      {phase === 'QUESTION' && (
        <>
          <TriggerButton
            icon={<Eye className="w-4 h-4" />}
            label="Reveal"
            accent
            onClick={() => handleAction('reveal', () => sendQuizAction('REVEAL'))}
          />
          <TriggerButton
            icon={<SkipForward className="w-4 h-4" />}
            label="Next"
            onClick={() => handleAction('next', () =>
              sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
          />
          <TriggerButton
            icon={<SkipForward className="w-4 h-4" />}
            label="Skip"
            onClick={() => handleAction('skip', () => sendQuizAction('NEXT'))}
          />
          <TriggerButton
            icon={<StopCircle className="w-4 h-4" />}
            label="End Round"
            className="text-red-400"
            onClick={() => handleAction('end-round', () => {
              sendQuizAction('SKIP_TO_END');
              finishSegment();
            }, 2000)}
          />
        </>
      )}

      {phase === 'REVEAL' && (
        <>
          <TriggerButton
            icon={<SkipForward className="w-4 h-4" />}
            label={isLastQuestion ? 'Results' : 'Next Q'}
            accent
            onClick={() => handleAction('next', () =>
              sendQuizAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
          />
          <TriggerButton
            icon={<StopCircle className="w-4 h-4" />}
            label="End Round"
            onClick={() => handleAction('end-round', () => {
              sendQuizAction('SKIP_TO_END');
              finishSegment();
            }, 2000)}
          />
          <div /> {/* spacer */}
          <div /> {/* spacer */}
        </>
      )}

      {phase === 'END' && (
        <>
          <TriggerButton
            icon={<Check className="w-4 h-4" />}
            label="Finish"
            accent
            onClick={() => handleAction('finish', () => finishSegment())}
          />
          <div />
          <div />
          <div />
        </>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// TRIGGER BUTTON
// ─────────────────────────────────────────────
function TriggerButton({
  icon, label, accent, className, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-xl flex flex-col items-center justify-center gap-1 min-h-[48px] py-3 px-2 transition-all active:scale-95 ${
        accent
          ? 'bg-[#e94560] hover:bg-[#d63a54] text-white'
          : className || 'bg-white/10 hover:bg-white/20'
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}


// ─────────────────────────────────────────────
// QUIZ INFO PANEL (replaces tabs when quiz active)
// ─────────────────────────────────────────────
function QuizInfoPanel({
  quiz, gameState, answeredCount, teamCount, answerDistribution,
}: {
  quiz: GameState['quiz'];
  gameState: GameState;
  answeredCount: number;
  teamCount: number;
  answerDistribution: number[] | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* QUIZ ACTIVE bar */}
      <div className="px-3 py-2 flex items-center gap-3" style={{ backgroundColor: 'rgba(233, 69, 96, 0.15)' }}>
        <span className="text-xs font-black uppercase tracking-widest text-[#e94560]">QUIZ ACTIVE</span>
        <span className="text-xs text-gray-400">
          Q{(quiz.currentQuestionIndex ?? 0) + 1}/{quiz.config.totalQuestions}
        </span>
      </div>

      <div className="p-3 space-y-4">
        {/* Timer */}
        {quiz.phase === 'QUESTION' && (
          <div className="text-center">
            <span className={`text-6xl font-black tabular-nums font-mono ${
              (quiz.timer ?? 99) <= 5 ? 'text-red-400' : (quiz.timer ?? 99) <= 10 ? 'text-yellow-400' : 'text-white'
            }`}>
              {quiz.timer}
            </span>
          </div>
        )}

        {quiz.phase === 'REVEAL' && (
          <div className="text-center">
            <span className="text-2xl font-bold text-[#00c896]">REVEAL</span>
          </div>
        )}

        {quiz.phase === 'END' && (
          <div className="text-center">
            <span className="text-2xl font-bold text-[#ffb700]">ROUND COMPLETE</span>
          </div>
        )}

        {/* Question text */}
        {quiz.currentQuestion && (
          <div className="p-3 rounded-xl" style={{ backgroundColor: '#1a1a2e' }}>
            <p className="text-sm font-semibold">{quiz.currentQuestion.text}</p>
            <p className="text-xs text-[#00c896] mt-1">
              {String.fromCharCode(65 + quiz.currentQuestion.correctOptionIndex)}: {quiz.currentQuestion.options[quiz.currentQuestion.correctOptionIndex]}
            </p>
          </div>
        )}

        {/* Answer distribution */}
        {quiz.currentQuestion && answerDistribution && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Answer Distribution</p>
            {quiz.currentQuestion.options.map((opt, i) => {
              const count = answerDistribution[i];
              const maxCount = Math.max(...answerDistribution, 1);
              const percent = (count / maxCount) * 100;
              const isCorrect = i === quiz.currentQuestion!.correctOptionIndex;
              const isRevealed = quiz.phase === 'REVEAL';
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold w-4 text-gray-500">{String.fromCharCode(65 + i)}</span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden relative" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(percent, 4)}%`,
                        backgroundColor: isRevealed
                          ? isCorrect ? '#00c896' : 'rgba(255,255,255,0.15)'
                          : 'rgba(255,255,255,0.2)',
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs truncate text-gray-300">{opt}</span>
                  </div>
                  <span className="text-xs tabular-nums w-4 text-right text-gray-500">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Answered count — team dots */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Answered: {answeredCount}/{teamCount}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {gameState.teams.map(t => {
              const answered = quiz.answers[t.id]?.locked;
              return (
                <div
                  key={t.id}
                  className="w-3 h-3 rounded-full transition-all"
                  style={{
                    backgroundColor: answered ? t.color : 'rgba(255,255,255,0.1)',
                    boxShadow: answered ? `0 0 6px ${t.color}` : 'none',
                  }}
                  title={`${t.name}${answered ? ' (answered)' : ''}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: SOUNDS
// ─────────────────────────────────────────────
function SoundsTab({
  socket, handleAction,
}: {
  socket: any;
  handleAction: (key: string, action: () => void, duration?: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SOUND_CUES.map(cue => (
        <button
          key={cue.url}
          className="rounded-xl p-3 flex flex-col items-center gap-1 bg-white/5 hover:bg-white/15 active:scale-95 transition-all"
          onClick={() => handleAction(`sfx-${cue.label}`, () =>
            socket?.emit('stageAudioCue', cue.url), 500)}
        >
          <span className="text-xl">{cue.emoji}</span>
          <span className="text-[10px] font-semibold text-gray-400">{cue.label}</span>
        </button>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: TITLES
// ─────────────────────────────────────────────
function TitlesTab({
  socket, handleAction, customTitle, setCustomTitle,
}: {
  socket: any;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  customTitle: string;
  setCustomTitle: (v: string) => void;
}) {
  const showTitle = (text: string) => {
    handleAction('title', () =>
      socket?.emit('stageOverlaySet', { type: 'title', content: text }, () => {}), 500);
  };

  return (
    <div className="space-y-3">
      {/* Custom title input */}
      <div className="flex gap-2">
        <Input
          value={customTitle}
          onChange={e => setCustomTitle(e.target.value)}
          placeholder="Custom title..."
          className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-gray-500 h-10 text-sm"
          onKeyDown={e => {
            if (e.key === 'Enter' && customTitle.trim()) {
              showTitle(customTitle.trim());
              setCustomTitle('');
            }
          }}
        />
        <Button
          className="h-10 bg-white/10 hover:bg-white/20"
          onClick={() => {
            if (customTitle.trim()) {
              showTitle(customTitle.trim());
              setCustomTitle('');
            }
          }}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Preset titles */}
      <div className="space-y-1.5">
        {TITLE_CARDS.map(title => (
          <button
            key={title}
            className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/15 active:scale-[0.98] transition-all"
            onClick={() => showTitle(title)}
          >
            <p className="text-sm font-semibold">{title}</p>
          </button>
        ))}
      </div>

      {/* Clear overlay */}
      <button
        className="w-full text-center p-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        onClick={() => handleAction('clear-overlay', () =>
          socket?.emit('stageOverlayClear'), 500)}
      >
        Clear Overlay
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: GAMES
// ─────────────────────────────────────────────
function GamesTab({
  questionCount, handleAction, executeSegment,
}: {
  questionCount: number;
  handleAction: (key: string, action: () => void, duration?: number) => void;
  executeSegment: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-2">
      <button
        className="w-full p-4 rounded-xl text-left bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all"
        onClick={() => handleAction('start-quiz', () =>
          executeSegment({ type: 'quiz', timePerQuestion: 30, totalQuestions: questionCount }), 3000)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#e94560]/20 flex items-center justify-center">
            <span className="text-lg" role="img" aria-label="quiz">&#10068;</span>
          </div>
          <div>
            <p className="font-semibold text-sm">Quiz</p>
            <p className="text-xs text-gray-500">{questionCount} questions available</p>
          </div>
        </div>
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: MEDIA
// ─────────────────────────────────────────────
function MediaTab({
  showMedia, socket, handleAction,
}: {
  showMedia: ShowMedia[];
  socket: any;
  handleAction: (key: string, action: () => void, duration?: number) => void;
}) {
  if (showMedia.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        No media clips. Add them in prep mode.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showMedia.map(m => (
        <button
          key={m.id}
          className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all"
          onClick={() => handleAction('display-media', () =>
            socket?.emit('stageOverlaySet', { type: 'media', content: m.src }, () => {}), 1000)}
        >
          <p className="text-sm font-semibold">{m.title}</p>
          <p className="text-xs text-gray-500 truncate">{m.src}</p>
          {m.duration && <p className="text-xs text-gray-500">{m.duration}s</p>}
        </button>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: TEAMS
// ─────────────────────────────────────────────
function TeamsTab({
  gameState, socket, handleAction,
}: {
  gameState: GameState | null;
  socket: any;
  handleAction: (key: string, action: () => void, duration?: number) => void;
}) {
  const teams = gameState?.teams || [];
  const sorted = [...teams].sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        No teams have joined yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
          <span className="text-sm font-semibold flex-1 truncate">{t.name}</span>
          <span className="text-sm font-bold tabular-nums min-w-[40px] text-right">{t.score}</span>
          <div className="flex gap-1">
            <button
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center active:scale-90 transition-all"
              onClick={() => handleAction(`score-${t.id}-down`, () =>
                socket?.emit('adminUpdateScore', { teamId: t.id, delta: -10 }), 300)}
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center active:scale-90 transition-all"
              onClick={() => handleAction(`score-${t.id}-up`, () =>
                socket?.emit('adminUpdateScore', { teamId: t.id, delta: 10 }), 300)}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
