import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ShowDefinition } from '../types';
import type { SegmentConfig } from '@shared/rounds';
import { DEFAULT_TIME_PER_QUESTION } from '@shared/constants';
import { Plus, Trash2, GripVertical, Play, Save, ArrowUp, ArrowDown } from 'lucide-react';

const SEGMENT_TEMPLATES: Record<string, () => SegmentConfig> = {
  quiz: () => ({ type: 'quiz', timePerQuestion: DEFAULT_TIME_PER_QUESTION, totalQuestions: 10 }),
  media: () => ({ type: 'media', src: '', title: 'Commercial Break', duration: 30, autoAdvance: true }),
  leaderboard: () => ({ type: 'leaderboard', duration: 15 }),
};

const SEGMENT_LABELS: Record<string, string> = {
  quiz: '🧠 Quiz Round',
  media: '🎬 Media Break',
  leaderboard: '🏆 Leaderboard',
};

export default function ShowBuilder() {
  const { socket } = useSocket();
  const [shows, setShows] = useState<ShowDefinition[]>([]);
  const [editingShow, setEditingShow] = useState<{ id?: string; name: string; segments: SegmentConfig[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchShows = () => {
    socket?.emit('adminGetShows', (fetched: ShowDefinition[]) => setShows(fetched));
  };

  useEffect(() => { fetchShows(); }, [socket]);

  const startNew = () => {
    setEditingShow({ name: 'New Show', segments: [] });
  };

  const editShow = (show: ShowDefinition) => {
    setEditingShow({ id: show.id, name: show.name, segments: [...show.segments] });
  };

  const saveShow = () => {
    if (!socket || !editingShow) return;
    setSaving(true);
    socket.emit('adminSaveShow', editingShow, (result: { success: boolean; id?: string; error?: string }) => {
      setSaving(false);
      if (result.success) {
        setEditingShow(null);
        fetchShows();
      } else {
        alert(`Failed to save: ${result.error}`);
      }
    });
  };

  const deleteShow = (id: string) => {
    if (!socket || !confirm('Delete this show?')) return;
    socket.emit('adminDeleteShow', id, (success: boolean) => {
      if (success) fetchShows();
    });
  };

  const startShow = (show: ShowDefinition) => {
    if (!socket) return;
    socket.emit('showLoadAndStart', show.segments);
  };

  const addSegment = (type: string) => {
    if (!editingShow) return;
    const template = SEGMENT_TEMPLATES[type];
    if (!template) return;
    setEditingShow({ ...editingShow, segments: [...editingShow.segments, template()] });
  };

  const removeSegment = (index: number) => {
    if (!editingShow) return;
    const segments = [...editingShow.segments];
    segments.splice(index, 1);
    setEditingShow({ ...editingShow, segments });
  };

  const moveSegment = (index: number, direction: -1 | 1) => {
    if (!editingShow) return;
    const segments = [...editingShow.segments];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= segments.length) return;
    [segments[index], segments[newIndex]] = [segments[newIndex], segments[index]];
    setEditingShow({ ...editingShow, segments });
  };

  const updateSegment = (index: number, updates: Partial<SegmentConfig>) => {
    if (!editingShow) return;
    const segments = [...editingShow.segments];
    segments[index] = { ...segments[index], ...updates } as SegmentConfig;
    setEditingShow({ ...editingShow, segments });
  };

  // Editing mode
  if (editingShow) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditingShow(null)}>
            ← Back
          </Button>
          <span className="text-sm font-semibold text-slate-500">
            {editingShow.id ? 'Edit Show' : 'New Show'}
          </span>
        </div>

        <Input
          value={editingShow.name}
          onChange={(e) => setEditingShow({ ...editingShow, name: e.target.value })}
          placeholder="Show name..."
          className="text-lg font-semibold"
        />

        {/* Segment list */}
        <div className="space-y-2">
          {editingShow.segments.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">No segments yet. Add one below.</p>
          )}
          {editingShow.segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-100">
              <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="text-sm font-semibold">{SEGMENT_LABELS[seg.type] || seg.type}</span>
                </div>
                {/* Inline config */}
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {seg.type === 'quiz' && (
                    <>
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        Time:
                        <Input
                          type="number"
                          value={(seg as any).timePerQuestion}
                          onChange={(e) => updateSegment(i, { timePerQuestion: parseInt(e.target.value) || 30 } as any)}
                          className="w-14 h-6 text-xs px-1"
                        />s
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        Questions:
                        <Input
                          type="number"
                          value={(seg as any).totalQuestions}
                          onChange={(e) => updateSegment(i, { totalQuestions: parseInt(e.target.value) || 10 } as any)}
                          className="w-14 h-6 text-xs px-1"
                        />
                      </label>
                    </>
                  )}
                  {seg.type === 'media' && (
                    <>
                      <Input
                        value={(seg as any).title || ''}
                        onChange={(e) => updateSegment(i, { title: e.target.value } as any)}
                        placeholder="Title..."
                        className="h-6 text-xs px-1 flex-1 min-w-[100px]"
                      />
                      <Input
                        value={(seg as any).src || ''}
                        onChange={(e) => updateSegment(i, { src: e.target.value } as any)}
                        placeholder="Video/image URL..."
                        className="h-6 text-xs px-1 flex-1 min-w-[120px]"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <Input
                          type="number"
                          value={(seg as any).duration || ''}
                          onChange={(e) => updateSegment(i, { duration: parseInt(e.target.value) || undefined } as any)}
                          className="w-12 h-6 text-xs px-1"
                        />s
                      </label>
                    </>
                  )}
                  {seg.type === 'leaderboard' && (
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      Duration:
                      <Input
                        type="number"
                        value={(seg as any).duration || ''}
                        onChange={(e) => updateSegment(i, { duration: parseInt(e.target.value) || undefined } as any)}
                        className="w-14 h-6 text-xs px-1"
                      />s
                    </label>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveSegment(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveSegment(i, 1)} disabled={i === editingShow.segments.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => removeSegment(i)} className="text-red-300 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add segment */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs" onClick={() => addSegment('quiz')}>
            + Quiz
          </Button>
          <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs" onClick={() => addSegment('media')}>
            + Media
          </Button>
          <Button variant="outline" size="sm" className="flex-1 rounded-lg text-xs" onClick={() => addSegment('leaderboard')}>
            + Leaderboard
          </Button>
        </div>

        {/* Save */}
        <Button
          className="w-full min-h-[48px] rounded-xl font-bold text-white"
          style={{ backgroundColor: '#e94560' }}
          onClick={saveShow}
          disabled={saving || !editingShow.name.trim() || editingShow.segments.length === 0}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Show'}
        </Button>
      </div>
    );
  }

  // Show list mode
  return (
    <div className="space-y-3">
      <Button variant="outline" className="w-full rounded-xl min-h-[44px]" onClick={startNew}>
        <Plus className="w-4 h-4 mr-2" /> New Show
      </Button>

      {shows.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">No shows created yet.</p>
      ) : (
        shows.map(show => (
          <div key={show.id} className="p-3 bg-white rounded-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-slate-800">{show.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {show.segments.length} segment{show.segments.length !== 1 ? 's' : ''} — {show.segments.map(s => SEGMENT_LABELS[s.type]?.split(' ')[0] || s.type).join(', ')}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-8 rounded-lg text-white text-xs"
                  style={{ backgroundColor: '#e94560' }}
                  onClick={() => startShow(show)}
                >
                  <Play className="w-3 h-3 mr-1" /> Start
                </Button>
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => editShow(show)}>
                  Edit
                </Button>
                <button onClick={() => deleteShow(show.id)} className="text-red-300 hover:text-red-500 px-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
