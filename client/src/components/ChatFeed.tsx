import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';

interface ChatFeedProps {
  messages: ChatMessage[];
}

export default function ChatFeed({ messages }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="fixed bottom-4 right-4 w-80 h-64 bg-black/50 backdrop-blur-sm rounded-lg border border-white/10 flex flex-col overflow-hidden z-40">
      <div className="p-2 bg-white/10 font-bold text-sm">Chat</div>
      <div ref={scrollRef} className="flex-grow overflow-y-auto p-2 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm animate-in fade-in slide-in-from-bottom-2">
            <span className="font-bold" style={{ color: msg.teamColor }}>{msg.teamName}: </span>
            <span className="text-white/90">{msg.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
