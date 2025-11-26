import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface ChatBoxProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatBox({ onSend, disabled }: ChatBoxProps) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-grow"
      />
      <Button onClick={handleSend} disabled={disabled || !message.trim()} size="icon">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
