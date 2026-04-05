import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { QuizQuestion } from '../types';
import { Trash2, Plus } from 'lucide-react';

export default function GameConfiguration() {
  const { socket } = useSocket();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // New question form state
  const [newQuestionText, setNewQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);

  const fetchQuestions = () => {
    if (!socket) return;
    setIsLoading(true);
    socket.emit('adminGetQuestions', (fetchedQuestions: QuizQuestion[]) => {
      setQuestions(fetchedQuestions);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    fetchQuestions();
  }, [socket]);

  const handleAddQuestion = () => {
    if (!socket) return;
    
    // Validate
    if (!newQuestionText.trim()) return;
    if (options.some(opt => !opt.trim())) return;

    const newQuestion = {
      text: newQuestionText,
      options: options,
      correctOptionIndex: correctOptionIndex
    };

    socket.emit('adminAddQuestion', newQuestion, (response: { success: boolean; error?: string }) => {
      if (response.success) {
        // Reset form
        setNewQuestionText('');
        setOptions(['', '', '', '']);
        setCorrectOptionIndex(0);
        // Refresh list
        fetchQuestions();
      } else {
        alert(`Failed to add question: ${response.error}`);
      }
    });
  };

  const handleDeleteQuestion = (id: string) => {
    if (!socket) return;
    if (!confirm('Are you sure you want to delete this question?')) return;

    socket.emit('adminDeleteQuestion', id, (success: boolean) => {
      if (success) {
        fetchQuestions();
      } else {
        alert('Failed to delete question');
      }
    });
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add New Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question-text">Question Text</Label>
            <Input 
              id="question-text" 
              value={newQuestionText} 
              onChange={(e) => setNewQuestionText(e.target.value)} 
              placeholder="Enter question here..."
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={correctOptionIndex === index}
                    onChange={() => setCorrectOptionIndex(index)}
                    className="w-4 h-4"
                  />
                  <Input 
                    value={option} 
                    onChange={(e) => updateOption(index, e.target.value)} 
                    placeholder={`Option ${index + 1}`}
                    className={index === correctOptionIndex ? "border-green-500 ring-green-500" : ""}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Select the radio button next to the correct answer.</p>
          </div>

          <Button onClick={handleAddQuestion} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Add Question
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Questions ({questions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : questions.length === 0 ? (
            <p className="text-muted-foreground">No questions found.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id} className="p-4 border rounded-md flex justify-between items-start bg-card">
                  <div className="space-y-2">
                    <p className="font-medium">{q.text}</p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                      {q.options.map((opt, i) => (
                        <li key={i} className={i === q.correctOptionIndex ? "text-green-600 font-medium" : ""}>
                          {opt} {i === q.correctOptionIndex && "✓"}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteQuestion(q.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
