import { Card, CardContent } from '@/components/ui/card';
import type { GameState } from '@/types';

interface DisplayQuizViewProps {
  gameState: GameState;
}

export default function DisplayQuizView({ gameState }: DisplayQuizViewProps) {
  const quiz = gameState.quiz;
  
  if (quiz.phase === 'IDLE') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white">
        <h1 className="text-6xl font-bold mb-8 animate-pulse">Get Ready!</h1>
        <p className="text-2xl text-slate-400">Quiz is about to start...</p>
      </div>
    );
  }
  
  if (quiz.phase === 'END') {
    const sortedTeams = [...gameState.teams].sort((a, b) => b.score - a.score);
    
    return (
      <div className="w-full max-w-4xl mx-auto p-8 text-center">
        <h1 className="text-6xl font-bold mb-12 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          Leaderboard
        </h1>
        <div className="space-y-4">
          {sortedTeams.map((team, index) => (
            <div key={team.id} className="flex items-center p-6 bg-slate-900 rounded-xl border border-slate-800">
              <div className="text-4xl font-bold text-slate-500 w-16">#{index + 1}</div>
              <div className="w-6 h-6 rounded-full mr-4" style={{ backgroundColor: team.color }} />
              <div className="text-3xl font-bold flex-grow text-left">{team.name}</div>
              <div className="text-4xl font-bold text-yellow-400">{team.score} pts</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!quiz.currentQuestion) return null;

  return (
    <div className="w-full max-w-6xl mx-auto p-8">
      <div className="text-center mb-12">
        <div className="text-2xl text-blue-400 font-semibold mb-4 uppercase tracking-widest">
          Question {quiz.currentQuestionIndex + 1}
        </div>
        <h2 className="text-5xl md:text-7xl font-bold text-white leading-tight">
          {quiz.currentQuestion.text}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {quiz.currentQuestion.options.map((option, index) => {
          const isCorrect = index === quiz.currentQuestion?.correctOptionIndex;
          const showCorrect = quiz.phase === 'REVEAL';
          
          return (
            <Card 
              key={index}
              className={`border-2 transition-all duration-500 ${
                showCorrect && isCorrect 
                  ? 'bg-green-600 border-green-400 scale-105 shadow-[0_0_30px_rgba(74,222,128,0.5)]' 
                  : 'bg-slate-900 border-slate-700'
              } ${showCorrect && !isCorrect ? 'opacity-50' : ''}`}
            >
              <CardContent className="flex items-center p-8 h-full">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold mr-6 ${
                  showCorrect && isCorrect ? 'bg-white text-green-600' : 'bg-slate-800 text-slate-400'
                }`}>
                  {String.fromCharCode(65 + index)}
                </div>
                <span className={`text-3xl md:text-4xl font-medium ${
                  showCorrect && isCorrect ? 'text-white' : 'text-slate-200'
                }`}>
                  {option}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <div className={`relative flex items-center justify-center w-32 h-32 rounded-full border-4 ${
          quiz.timer <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-blue-500 text-blue-500'
        }`}>
          <span className="text-5xl font-bold font-mono">{quiz.timer}</span>
        </div>
      </div>
      
      {/* Answer Stats (Optional) */}
      <div className="mt-8 flex justify-center gap-4">
        {gameState.teams.map(team => {
            const answer = quiz.answers[team.id];
            return (
                <div key={team.id} className={`w-3 h-3 rounded-full ${answer?.locked ? 'bg-green-500' : 'bg-slate-700'}`} title={team.name} />
            );
        })}
      </div>
    </div>
  );
}
