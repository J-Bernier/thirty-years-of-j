import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GameState } from '@/types';

interface HostQuizControlProps {
  gameState: GameState;
  onAction: (key: string, action: () => void, duration?: number) => void;
}

export default function HostQuizControl({ gameState, onAction }: HostQuizControlProps) {
  const { socket } = useSocket();
  const quiz = gameState.quiz;

  const sendAction = (type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: Record<string, unknown>) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  const answeredCount = gameState.teams.filter(t => quiz.answers[t.id]?.locked).length;
  const isLastQuestion = quiz.currentQuestionIndex === (quiz.config.totalQuestions || 0) - 1;

  if (quiz.phase === 'END') {
    return (
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Quiz finished — podium on screen</p>
          </div>
          <Button
            className="w-full min-h-[56px] text-lg font-bold"
            onClick={() => onAction('back-lobby', () => sendAction('CANCEL'))}
          >
            Back to Lobby
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (quiz.phase === 'IDLE') {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          <Button
            className="w-full min-h-[56px] text-lg font-bold"
            onClick={() => onAction('start-30', () => sendAction('START', { timePerQuestion: 30, totalQuestions: 5 }), 3000)}
          >
            Start Quiz — 30s per question
          </Button>
          <Button
            variant="secondary"
            className="w-full min-h-[48px]"
            onClick={() => onAction('start-15', () => sendAction('START', { timePerQuestion: 15, totalQuestions: 5 }), 3000)}
          >
            Blitz Mode — 15s per question
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base">
            Q{quiz.currentQuestionIndex + 1}/{quiz.config.totalQuestions}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {answeredCount}/{gameState.teams.length} answered
            </span>
            <span className={`text-2xl font-bold tabular-nums ${quiz.timer <= 5 ? 'text-red-500' : ''}`}>
              {quiz.timer}s
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary action — the one thing the host most likely needs to tap */}
        {quiz.phase === 'QUESTION' && (
          <Button
            className="w-full min-h-[64px] text-xl font-bold bg-amber-500 hover:bg-amber-600 text-white"
            onClick={() => onAction('reveal', () => sendAction('REVEAL'))}
          >
            Reveal Answer
          </Button>
        )}

        {quiz.phase === 'REVEAL' && (
          <Button
            className="w-full min-h-[64px] text-xl font-bold"
            onClick={() => onAction('next', () => sendAction(isLastQuestion ? 'SKIP_TO_END' : 'NEXT'))}
          >
            {isLastQuestion ? 'Show Results' : 'Next Question →'}
          </Button>
        )}

        {/* Secondary action */}
        <Button
          variant="outline"
          className="w-full min-h-[48px] text-muted-foreground"
          onClick={() => onAction('end-early', () => sendAction('SKIP_TO_END'))}
        >
          End Quiz Early
        </Button>

        {/* Current question preview (small, for host reference) */}
        <div className="p-3 rounded-lg bg-secondary text-sm">
          <p className="font-medium">{quiz.currentQuestion?.text}</p>
          <p className="text-muted-foreground mt-1">
            Answer: {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex || 0]}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
