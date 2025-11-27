import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GameState } from '@/types';

interface HostQuizControlProps {
  gameState: GameState;
  onAction: (action: () => void, duration?: number) => void;
}

export default function HostQuizControl({ gameState, onAction }: HostQuizControlProps) {
  const { socket } = useSocket();
  const quiz = gameState.quiz;

  const sendAction = (type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: any) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  const isLastQuestion = quiz.currentQuestionIndex === (quiz.config.totalQuestions || 0) - 1;

  if (quiz.phase === 'END') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz Finished</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center mb-4">
            <p className="text-xl">The quiz has ended.</p>
            <p className="text-muted-foreground">The podium is currently displayed on the main screen.</p>
          </div>
          <Button onClick={() => onAction(() => sendAction('CANCEL'))} className="w-full">
            Back to Welcome Screen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (quiz.phase === 'IDLE') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start Quiz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => onAction(() => sendAction('START', { timePerQuestion: 30, totalQuestions: 5 }), 3000)}>
              Start Quiz (30s)
            </Button>
            <Button onClick={() => onAction(() => sendAction('START', { timePerQuestion: 15, totalQuestions: 5 }), 3000)} variant="secondary">
              Start Blitz (15s)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz Control: Question {quiz.currentQuestionIndex + 1} / {quiz.config.totalQuestions}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-2xl font-bold text-center mb-4">
          Timer: {quiz.timer}s
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {quiz.phase === 'QUESTION' && (
            <Button onClick={() => onAction(() => sendAction('REVEAL'))} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
              Reveal Answer
            </Button>
          )}
          
          {quiz.phase === 'REVEAL' && (
            <>
              {isLastQuestion ? (
                <Button onClick={() => onAction(() => sendAction('SKIP_TO_END'))} className="w-full bg-green-600 hover:bg-green-700 text-white">
                  Go to End Screen (Podium)
                </Button>
              ) : (
                <Button onClick={() => onAction(() => sendAction('NEXT'))} className="w-full">
                  Next Question
                </Button>
              )}
            </>
          )}
          
          <Button onClick={() => onAction(() => sendAction('SKIP_TO_END'))} variant="destructive" className="w-full">
            End Game Early (Go to Podium)
          </Button>
        </div>

        <div className="mt-4 p-4 bg-secondary rounded-md">
          <h3 className="font-semibold mb-2">Current Question:</h3>
          <p>{quiz.currentQuestion?.text}</p>
          <p className="text-sm text-muted-foreground mt-1">Correct: {quiz.currentQuestion?.options[quiz.currentQuestion?.correctOptionIndex || 0]}</p>
        </div>
      </CardContent>
    </Card>
  );
}
