import { useSocket } from '@/context/SocketContext';
import { Button } from '@/components/ui/button';

const REACTIONS = [
  { id: 'clap', label: '👏', name: 'Clap' },
  { id: 'laugh', label: '😂', name: 'Laugh' },
  { id: 'love', label: '❤️', name: 'Love' },
  { id: 'fire', label: '🔥', name: 'Fire' },
  { id: 'party', label: '🎉', name: 'Party' },
  { id: 'wow', label: '😮', name: 'Wow' },
];

export default function ReactionPad() {
  const { socket } = useSocket();

  const sendReaction = (type: string) => {
    socket?.emit('playerReaction', type);
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 max-w-md mx-auto">
      {REACTIONS.map((reaction) => (
        <Button
          key={reaction.id}
          variant="outline"
          className="h-24 text-4xl hover:scale-105 transition-transform"
          onClick={() => sendReaction(reaction.label)}
        >
          {reaction.label}
        </Button>
      ))}
    </div>
  );
}
