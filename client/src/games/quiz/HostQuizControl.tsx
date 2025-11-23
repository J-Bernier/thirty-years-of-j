import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GameState } from '@/types';

interface HostQuizControlProps {
  gameState: GameState;
}

export default function HostQuizControl({ gameState }: HostQuizControlProps) {
  const { socket } = useSocket();
  const quiz = gameState.quiz;

  const sendAction = (type: 'SETUP' | 'START' | 'NEXT' | 'REVEAL' | 'CANCEL' | 'SKIP_TO_END', payload?: any) => {
    socket?.emit('quizAdminAction', { type, payload });
  };

  if (quiz.phase === 'IDLE') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start Quiz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => sendAction('START', { timePerQuestion: 30, totalQuestions: 5 })}>
              Start Quiz (30s)
            </Button>
            <Button onClick={() => sendAction('START', { timePerQuestion: 15, totalQuestions: 5 })} variant="secondary">
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
        <CardTitle>Quiz Control: Question {quiz.currentQuestionIndex + 1}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-2xl font-bold text-center mb-4">
          Timer: {quiz.timer}s
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {quiz.phase === 'QUESTION' && (
            <Button onClick={() => sendAction('REVEAL')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
              Reveal Answer
            </Button>
          )}
          
          {quiz.phase === 'REVEAL' && (
            <Button onClick={() => sendAction('NEXT')} className="w-full">
              Next Question
            </Button>
          )}
          
          <Button onClick={() => sendAction('CANCEL')} variant="destructive" className="w-full">
            End Quiz
          </Button>

          <Button onClick={() => sendAction('SKIP_TO_END')} variant="outline" className="w-full">
            Finish Quiz (Leaderboard)
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
