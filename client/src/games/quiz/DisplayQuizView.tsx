import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/types';
import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

const OPTION_COLORS = [
  { bg: 'rgba(233,69,96,0.15)', border: 'rgba(233,69,96,0.4)', letter: '#e94560' },   // A
  { bg: 'rgba(0,168,232,0.15)', border: 'rgba(0,168,232,0.4)', letter: '#00a8e8' },    // B
  { bg: 'rgba(0,200,150,0.15)', border: 'rgba(0,200,150,0.4)', letter: '#00c896' },    // C
  { bg: 'rgba(255,183,0,0.15)', border: 'rgba(255,183,0,0.4)', letter: '#ffb700' },    // D
];

interface DisplayQuizViewProps {
  gameState: GameState;
}

export default function DisplayQuizView({ gameState }: DisplayQuizViewProps) {
  const quiz = gameState.quiz;
  const prevPhaseRef = useRef(quiz.phase);

  // Confetti on reveal if majority got it right
  useEffect(() => {
    if (quiz.phase === 'REVEAL' && prevPhaseRef.current === 'QUESTION') {
      const correctIndex = quiz.currentQuestion?.correctOptionIndex;
      if (correctIndex !== undefined) {
        const correctCount = gameState.teams.filter(t => {
          const answer = quiz.answers[t.id];
          return answer?.locked && answer.optionIndex === correctIndex;
        }).length;
        if (correctCount > gameState.teams.length / 2) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
      }
    }
    prevPhaseRef.current = quiz.phase;
  }, [quiz.phase]);

  if (quiz.phase === 'IDLE') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <motion.h1
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-[72px] font-black"
          style={{ color: 'var(--show-accent)' }}
        >
          Get Ready!
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-2xl mt-4"
          style={{ color: 'var(--show-text-muted)' }}
        >
          Quiz is about to start...
        </motion.p>
      </div>
    );
  }

  if (quiz.phase === 'END') {
    return <QuizEndPodium gameState={gameState} />;
  }

  if (!quiz.currentQuestion) return null;

  const isRevealing = quiz.phase === 'REVEAL';
  const correctIndex = quiz.currentQuestion.correctOptionIndex;
  const timerCritical = quiz.timer <= 5 && quiz.timer > 0;
  const timerPercent = quiz.config.timePerQuestion > 0
    ? (quiz.timer / quiz.config.timePerQuestion) * 100
    : 0;

  // Stats for reveal
  const answeredTeams = gameState.teams.filter(t => quiz.answers[t.id]?.locked);
  const correctTeams = answeredTeams.filter(t => quiz.answers[t.id]?.optionIndex === correctIndex);
  const fastestTeam = correctTeams.length > 0
    ? correctTeams.reduce((best, t) => {
        const tTime = quiz.answers[t.id]?.timestamp ?? 0;
        const bestTime = quiz.answers[best.id]?.timestamp ?? 0;
        return tTime > bestTime ? t : best;
      })
    : null;

  return (
    <div className="w-full max-w-6xl mx-auto px-8 flex flex-col h-full justify-between py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span
          className="text-sm font-semibold uppercase tracking-[4px]"
          style={{ color: 'var(--show-accent)' }}
        >
          Question {quiz.currentQuestionIndex + 1} / {quiz.config.totalQuestions}
        </span>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.h2
          key={quiz.currentQuestionIndex}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          className="text-[48px] leading-tight font-semibold text-center flex-shrink-0"
          style={{ color: 'var(--show-text)' }}
        >
          {quiz.currentQuestion.text}
        </motion.h2>
      </AnimatePresence>

      {/* Options grid */}
      <div className="grid grid-cols-2 gap-4 my-6">
        {quiz.currentQuestion.options.map((option, index) => {
          const color = OPTION_COLORS[index];
          const isCorrect = index === correctIndex;
          const showCorrect = isRevealing && isCorrect;
          const showWrong = isRevealing && !isCorrect;

          return (
            <motion.div
              key={index}
              initial={{ x: -30, opacity: 0 }}
              animate={{
                x: 0,
                opacity: showWrong ? 0.3 : 1,
                scale: showCorrect ? 1.03 : 1,
              }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="flex items-center gap-4 rounded-lg px-6 py-5"
              style={{
                backgroundColor: showCorrect ? 'rgba(0,200,150,0.2)' : color.bg,
                border: `2px solid ${showCorrect ? 'var(--show-success)' : color.border}`,
                boxShadow: showCorrect ? '0 0 30px rgba(0,200,150,0.3)' : 'none',
              }}
            >
              <span
                className="text-[36px] font-bold min-w-[40px]"
                style={{ color: showCorrect ? 'var(--show-success)' : color.letter }}
              >
                {String.fromCharCode(65 + index)}
              </span>
              <span
                className="text-[28px] font-medium"
                style={{ color: showCorrect ? 'var(--show-success)' : 'var(--show-text)' }}
              >
                {option}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Timer + answer dots */}
      {!isRevealing ? (
        <div className="flex flex-col items-center gap-3">
          {/* Timer bar */}
          <div className="w-full max-w-2xl flex items-center gap-4">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--show-text-dim)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${timerPercent}%` }}
                transition={{ duration: 0.8, ease: 'linear' }}
                style={{
                  background: timerCritical
                    ? 'var(--show-accent)'
                    : timerPercent < 40
                      ? 'var(--show-warning)'
                      : 'var(--show-success)',
                }}
              />
            </div>
            <motion.span
              className="text-[80px] font-bold tabular-nums leading-none"
              animate={timerCritical ? { scale: [1, 1.05, 1] } : {}}
              transition={timerCritical ? { duration: 0.5, repeat: Infinity } : {}}
              style={{
                color: timerCritical ? 'var(--show-accent)' : 'var(--show-text)',
                textShadow: timerCritical ? '0 0 20px rgba(233,69,96,0.5)' : 'none',
              }}
            >
              {quiz.timer}
            </motion.span>
          </div>

          {/* Answer dots */}
          <div className="flex gap-2">
            {gameState.teams.map(team => {
              const answer = quiz.answers[team.id];
              return (
                <motion.div
                  key={team.id}
                  animate={answer?.locked ? { scale: [1, 1.3, 1] } : {}}
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: answer?.locked ? 'var(--show-success)' : 'var(--show-text-dim)',
                  }}
                  title={team.name}
                />
              );
            })}
          </div>
        </div>
      ) : (
        /* Reveal stats */
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex justify-center gap-12 mt-4"
        >
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: 'var(--show-text)' }}>
              {correctTeams.length}/{gameState.teams.length}
            </div>
            <div className="text-xs uppercase tracking-wider mt-1" style={{ color: 'var(--show-text-muted)' }}>
              Got it right
            </div>
          </div>
          {fastestTeam && (
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: fastestTeam.color }}>
                {fastestTeam.name}
              </div>
              <div className="text-xs uppercase tracking-wider mt-1" style={{ color: 'var(--show-text-muted)' }}>
                Fastest
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/** End-of-quiz podium with bottom-up reveal */
function QuizEndPodium({ gameState }: { gameState: GameState }) {
  const quiz = gameState.quiz;
  const sortedTeams = [...gameState.teams].sort((a, b) => {
    const scoreA = quiz.gameScores?.[a.id] || 0;
    const scoreB = quiz.gameScores?.[b.id] || 0;
    return scoreB - scoreA;
  });

  // Confetti on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 200 });
    }, sortedTeams.length * 500 + 2000); // After all reveals + #1 pause
    return () => clearTimeout(timer);
  }, []);

  const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

  return (
    <div className="w-full max-w-4xl mx-auto px-8 text-center">
      <motion.h1
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-[48px] font-bold mb-8 uppercase tracking-[6px]"
        style={{ color: 'var(--show-accent)' }}
      >
        Results
      </motion.h1>
      <div className="space-y-3">
        {/* Render bottom-up: reverse the array, stagger from last to first */}
        {[...sortedTeams].reverse().map((team, reverseIndex) => {
          const rank = sortedTeams.length - reverseIndex;
          const isFirst = rank === 1;
          const medalColor = rank <= 3 ? MEDAL_COLORS[rank - 1] : undefined;
          // Delay: bottom reveals first, #1 has extra 2s pause
          const delay = reverseIndex * 0.5 + (isFirst ? 2 : 0);

          return (
            <motion.div
              key={team.id}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay, duration: 0.4, ease: 'easeOut' }}
              className="flex items-center gap-4 px-6 py-4 rounded-xl"
              style={{
                backgroundColor: medalColor ? `${medalColor}10` : 'rgba(255,255,255,0.05)',
                border: medalColor ? `1px solid ${medalColor}40` : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span
                className="text-3xl font-bold min-w-[48px]"
                style={{ color: medalColor || 'var(--show-text-muted)' }}
              >
                #{rank}
              </span>
              <div
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span className="text-2xl font-bold flex-1 text-left" style={{ color: 'var(--show-text)' }}>
                {team.name}
              </span>
              <AnimatedScore
                target={quiz.gameScores?.[team.id] || 0}
                delay={delay}
                color={medalColor || 'var(--show-warning)'}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Score counter that animates from 0 to target */
function AnimatedScore({ target, delay, color }: { target: number; delay: number; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || target === 0) return;

    const startTime = (delay + 0.4) * 1000; // Wait for row to appear
    const duration = target * 50; // 50ms per point
    let frame: number;

    const timeout = setTimeout(() => {
      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        el.textContent = `${Math.round(progress * target)} pts`;
        if (progress < 1) {
          frame = requestAnimationFrame(animate);
        }
      };
      frame = requestAnimationFrame(animate);
    }, startTime);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [target, delay]);

  return (
    <span ref={ref} className="text-3xl font-bold tabular-nums" style={{ color }}>
      0 pts
    </span>
  );
}
