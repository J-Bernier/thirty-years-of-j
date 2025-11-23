import { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';

interface Reaction {
  id: number;
  type: string;
  x: number;
  teamColor: string;
  teamName: string;
}

export default function ReactionOverlay() {
  const { socket } = useSocket();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const reactionIdCounter = useRef(0);

  useEffect(() => {
    if (!socket) return;

    const handleReaction = (payload: { type: string; teamColor: string; teamName: string }) => {
      const id = reactionIdCounter.current++;
      const x = Math.random() * 80 + 10; // Random position between 10% and 90%
      
      setReactions(prev => [...prev, { 
        id, 
        type: payload.type, 
        x, 
        teamColor: payload.teamColor,
        teamName: payload.teamName 
      }]);

      // Remove reaction after animation
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 2000);
    };

    socket.on('reactionTriggered', handleReaction);

    return () => {
      socket.off('reactionTriggered', handleReaction);
    };
  }, [socket]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {reactions.map(reaction => (
        <div
          key={reaction.id}
          className="absolute bottom-0 flex flex-col items-center animate-float-up opacity-0"
          style={{ 
            left: `${reaction.x}%`,
          }}
        >
          <div className="text-6xl" style={{ textShadow: `0 0 20px ${reaction.teamColor}` }}>
            {reaction.type}
          </div>
          <div className="text-white font-bold text-lg mt-2 bg-black/50 px-2 py-1 rounded-full whitespace-nowrap">
            {reaction.teamName}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          10% { opacity: 1; transform: translateY(-20px) scale(1.2); }
          100% { transform: translateY(-80vh) scale(1); opacity: 0; }
        }
        .animate-float-up {
          animation: float-up 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
