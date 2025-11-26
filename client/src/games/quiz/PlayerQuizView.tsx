import { useState, useEffect } from 'react';
import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GameState } from '@/types';

interface PlayerQuizViewProps {
  gameState: GameState;
  playerId: string;
}

export default function PlayerQuizView({ gameState, playerId }: PlayerQuizViewProps) {
  const { socket } = useSocket();
  const quiz = gameState.quiz;
  const myAnswer = playerId ? quiz.answers[playerId] : null;
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // Reset local selection when question changes
  useEffect(() => {
    if (quiz.phase === 'QUESTION') {
      // If we already have a locked answer on server, sync it
      if (myAnswer) {
        setSelectedOption(myAnswer.optionIndex);
      } else {
        setSelectedOption(null);
      }
    }
  }, [quiz.currentQuestionIndex, quiz.phase, myAnswer]);

  const handleSelect = (index: number) => {
    if (myAnswer?.locked) return;
    setSelectedOption(index);
    socket?.emit('quizAnswer', index);
  };

  const handleLock = () => {
    if (selectedOption !== null) {
      socket?.emit('quizLock');
    }
  };

  if (!quiz.currentQuestion) return <div>Waiting for question...</div>;

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">
            {quiz.phase === 'REVEAL' ? (
              selectedOption === quiz.currentQuestion.correctOptionIndex ? 
                <span className="text-green-500">Correct!</span> : 
                <span className="text-red-500">Wrong!</span>
            ) : (
              <span>Question {quiz.currentQuestionIndex + 1}</span>
            )}
          </CardTitle>
          {quiz.phase === 'QUESTION' && (
            <div className="text-lg font-medium text-center mt-2">
              {quiz.currentQuestion.text}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center text-xl font-bold">
            {quiz.phase === 'QUESTION' ? `${quiz.timer}s` : 'Time\'s up!'}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {quiz.currentQuestion.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrect = index === quiz.currentQuestion?.correctOptionIndex;
              const showCorrect = quiz.phase === 'REVEAL';
              
              let variant: "default" | "secondary" | "outline" | "destructive" = "outline";
              if (showCorrect && isCorrect) variant = "default"; // Green-ish (primary)
              else if (showCorrect && isSelected && !isCorrect) variant = "destructive";
              else if (isSelected) variant = "default";

              return (
                <Button
                  key={index}
                  variant={variant}
                  className={`h-16 text-lg justify-start px-6 ${showCorrect && isCorrect ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => handleSelect(index)}
                  disabled={myAnswer?.locked || quiz.phase !== 'QUESTION' || quiz.timer === 0}
                >
                  <span className="mr-4 font-bold opacity-50">{String.fromCharCode(65 + index)}.</span>
                  {option}
                </Button>
              );
            })}
          </div>

          {quiz.phase === 'QUESTION' && (
            <Button 
              className="w-full h-12 text-xl font-bold mt-4" 
              size="lg"
              onClick={handleLock}
              disabled={selectedOption === null || myAnswer?.locked}
            >
              {myAnswer?.locked ? 'LOCKED' : 'LOCK ANSWER'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
