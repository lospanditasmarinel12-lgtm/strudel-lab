import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Plus } from 'lucide-react';
import { DRUM_SAMPLES, MELODIC_SAMPLES, BASS_SAMPLES, AMBIENT_SAMPLES, SYNTH_SAMPLES } from '@shared/schema';

export interface DirtSamplesBrowserProps {
  search: string;
  onInsertSample: (name: string, n?: number) => void;
}

type BankCategory = 'drums' | 'bass' | 'melodic' | 'ambient' | 'fx';

interface BankEntry {
  name: string;
  category: BankCategory;
  sampleCount: number;
  samples: string[];
  relativePaths: string[];
}

const categoryInfo: Record<string, { color: string; label: string }> = {
  drums: { color: '#FF6B4A', label: 'Drums' },
  bass: { color: '#FFB000', label: 'Bass' },
  melodic: { color: '#4BE38A', label: 'Melodic' },
  ambient: { color: '#6FB7FF', label: 'Ambient' },
  fx: { color: '#E0A9FF', label: 'FX' },
};

function categorizeBank(bankName: string): BankCategory {
  const lower = bankName.toLowerCase();
  if (DRUM_SAMPLES.includes(lower)) return 'drums';
  if (BASS_SAMPLES.includes(lower)) return 'bass';
  if (MELODIC_SAMPLES.includes(lower)) return 'melodic';
  if (SYNTH_SAMPLES.includes(lower)) return 'melodic';
  if (AMBIENT_SAMPLES.includes(lower)) return 'ambient';
  return 'fx';
}

export default function DirtSamplesBrowser({ search, onInsertSample }: DirtSamplesBrowserProps) {
  const [manifest, setManifest] = useState<Record<string, string[]> | null>(null);
  const [sampleBase, setSampleBase] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBank, setExpandedBank] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewId(null);
  }, [search, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { loadManifest } = await import('@/lib/sample-registry');
        const data = await loadManifest();
        if (cancelled) return;
        if (data) {
          const raw = data as Record<string, unknown>;
          if (typeof raw._base === 'string') {
            setSampleBase(raw._base);
          }
          const banks: Record<string, string[]> = {};
          for (const [key, val] of Object.entries(raw)) {
            if (Array.isArray(val)) banks[key] = val;
          }
          setManifest(banks);
        } else {
          setError('Failed to load sample manifest. Check your internet connection.');
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setExpandedBank(null);
  }, [search, categoryFilter]);

  const allBanks: BankEntry[] = useMemo(() => {
    if (!manifest) return [];
    return Object.entries(manifest)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
      .map(([name, paths]) => ({
        name,
        category: categorizeBank(name),
        sampleCount: paths.length,
        samples: paths.map(p => p.split('/').pop() || p),
        relativePaths: paths,
      }));
  }, [manifest]);

  const filteredBanks = useMemo(() => {
    let result = allBanks;
    if (categoryFilter) {
      result = result.filter(b => b.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.samples.some(s => s.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [allBanks, categoryFilter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, BankEntry[]> = {};
    for (const bank of filteredBanks) {
      (groups[bank.category] ||= []).push(bank);
    }
    return groups;
  }, [filteredBanks]);

  const handleToggleBank = useCallback((name: string) => {
    setExpandedBank(prev => prev === name ? null : name);
  }, []);

  const handlePreview = useCallback((url: string, id: string) => {
    if (previewId === id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.volume = 0.6;
    audio.onended = () => setPreviewId(null);
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPreviewId(id);
  }, [previewId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        Loading banks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <p className="text-red-400 text-xs">{error}</p>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex gap-1 p-1 border-b border-strudel-surface-light flex-wrap">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`text-[10px] px-2 py-0.5 rounded ${!categoryFilter ? 'bg-strudel-primary text-black' : 'text-muted-foreground hover:text-white'}`}
        >
          ALL ({allBanks.length})
        </button>
        {Object.entries(categoryInfo).map(([key, info]) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className={`text-[10px] px-2 py-0.5 rounded ${
              categoryFilter === key ? 'text-white' : 'text-muted-foreground hover:text-white'
            }`}
            style={categoryFilter === key ? { backgroundColor: info.color } : {}}
          >
            {info.label} ({(allBanks.filter(b => b.category === key)).length})
          </button>
        ))}
      </div>

      {filteredBanks.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          {search ? `No banks matching "${search}"` : 'No banks found'}
        </div>
      ) : (
        Object.entries(grouped).map(([category, banks]) => (
          <div key={category}>
            <div
              className="px-2 py-1 text-[10px] font-bold border-b border-strudel-surface-light"
              style={{ color: categoryInfo[category]?.color || '#888' }}
            >
              ● {categoryInfo[category]?.label || category} ({banks.length} banks)
            </div>
            {banks.map(bank => {
              const firstUrl = sampleBase && bank.relativePaths[0] ? sampleBase + bank.relativePaths[0] : null;
              return (
              <div key={bank.name}>
                <div
                  onClick={() => handleToggleBank(bank.name)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleBank(bank.name); } }}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 w-full text-left text-xs group cursor-pointer"
                >
                  <span className="text-muted-foreground">{expandedBank === bank.name ? '▾' : '▸'}</span>
                  <span className="flex-1 text-white font-mono truncate">{bank.name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{bank.sampleCount} samples</span>
                  {firstUrl && (
                    <button
                      onClick={e => { e.stopPropagation(); handlePreview(firstUrl, bank.name); }}
                      className="text-strudel-accent p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
                      title={`Preview ${bank.name}`}
                    >
                      {previewId === bank.name ? <span className="text-strudel-accent">◼</span> : <Play size={12} />}
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onInsertSample(bank.name); }}
                    className="text-muted-foreground hover:text-white p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
                    title={`Insert ${bank.name}`}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {expandedBank === bank.name && (
                  <div className="pl-6 border-l border-strudel-surface-light ml-2 mb-1">
                    {bank.relativePaths.slice(0, 100).map((relPath, idx) => {
                      const sampleName = relPath.split('/').pop() || relPath;
                      const fullUrl = sampleBase ? sampleBase + relPath : null;
                      const previewKey = `${bank.name}:${idx}`;
                      return (
                      <div
                        key={relPath}
                        className="flex items-center gap-2 px-2 py-0.5 hover:bg-strudel-surface-light/30 text-[10px] group"
                      >
                        <span className="flex-1 text-muted-foreground truncate">{sampleName}</span>
                        {fullUrl && (
                          <button
                            onClick={() => handlePreview(fullUrl, previewKey)}
                            className="text-strudel-accent p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
                            title="Preview"
                          >
                            {previewId === previewKey ? <span className="text-strudel-accent">◼</span> : '▶'}
                          </button>
                        )}
                        <button
                          onClick={() => onInsertSample(bank.name, idx)}
                          className="text-muted-foreground hover:text-white p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
                          title="Insert"
                        >
                          +
                        </button>
                      </div>
                      );
                    })}
                    {bank.samples.length > 100 && (
                      <p className="text-[9px] text-muted-foreground px-2 py-0.5">
                        +{bank.samples.length - 100} more samples
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
