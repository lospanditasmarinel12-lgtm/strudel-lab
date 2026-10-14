import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Play, Plus, Loader2 } from 'lucide-react';
import { hasApiKey, searchSounds, getPreviewUrl } from '@/lib/freesound-api';
import type { FreesoundSound } from '@/lib/freesound-api';
import { registerCustomSample } from '@/lib/sample-registry';

export interface FreesoundSearchProps {
  onInsertSample: (name: string) => void;
  onOpenApiKeyDialog: () => void;
  /** Bump to re-check whether an API key is present (e.g. after saving one). */
  refreshKey?: number;
}

export default function FreesoundSearch({ onInsertSample, onOpenApiKeyDialog, refreshKey }: FreesoundSearchProps) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundSound[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);

  const [previewId, setPreviewId] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;
    hasApiKey().then((present) => {
      if (active) setHasKey(present);
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [results]);

  const doSearch = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    const q = query.trim();
    if (!q) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setErrorCode(null);

    try {
      const res = await searchSounds(q, pageNum, 20, controller.signal);
      if (controller.signal.aborted) return;

      if (append) {
        setResults(prev => [...prev, ...res.results]);
      } else {
        setResults(res.results);
      }
      setTotalCount(res.count);
      setPage(pageNum);
      setHasMore(!!res.next);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setErrorCode(err.code || null);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [query]);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    doSearch(1, false);
  }, [doSearch, query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleLoadMore = useCallback(() => {
    doSearch(page + 1, true);
  }, [doSearch, page]);

  const handleImport = useCallback(async (sound: FreesoundSound) => {
    const url = getPreviewUrl(sound);
    if (!url) return;

    setImportingId(sound.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = sound.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/\.(mp3|ogg|wav)$/i, '') || `fs_${sound.id}`;
      await registerCustomSample(name, blob, 'url', url);
      onInsertSample(name);
    } catch (err: any) {
      setError(`Failed to import "${sound.name}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportingId(null);
    }
  }, [onInsertSample]);

  const handlePreview = useCallback((sound: FreesoundSound) => {
    if (previewId === sound.id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    const url = getPreviewUrl(sound);
    if (!url) return;
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.volume = 0.6;
    audio.onended = () => setPreviewId(null);
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPreviewId(sound.id);
  }, [previewId]);

  if (hasKey === null) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (hasKey === false) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 px-4">
        <p className="text-muted-foreground text-xs text-center">
          🌐 Search over <strong>700,000+</strong> CC0 / Creative Commons sounds from Freesound.
        </p>
        <p className="text-[10px] text-muted-foreground text-center">
          A free API key is required. Get yours at freesound.org/apiv2/apply
        </p>
        <Button
          onClick={onOpenApiKeyDialog}
          size="sm"
          className="text-xs h-7 bg-strudel-primary hover:bg-strudel-secondary"
        >
          Set up API Key
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="p-2 border-b border-strudel-surface-light">
        <div className="flex gap-1">
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Search 700k+ Freesound sounds..."
            className="bg-strudel-dark border-strudel-surface-light text-xs h-7 text-white flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            size="sm"
            className="h-7 text-xs bg-strudel-primary hover:bg-strudel-secondary"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-2 py-1.5">
          <p className="text-[10px] text-red-400">{error}</p>
          {errorCode === 'INVALID_KEY' && (
            <button
              onClick={onOpenApiKeyDialog}
              className="text-[10px] text-strudel-accent underline mt-1"
            >
              Update API Key
            </button>
          )}
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-strudel-surface-light">
          {totalCount.toLocaleString()} results
        </div>
      )}

      <div className="flex-1 min-w-0">
        {results.map(sound => (
          <div
            key={sound.id}
            className="flex items-start gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 group text-xs"
          >
            <button
              onClick={() => handlePreview(sound)}
              className="text-muted-foreground hover:text-strudel-accent p-0.5 shrink-0 mt-0.5 cursor-pointer"
              title={`Preview ${sound.name}`}
            >
              {previewId === sound.id ? <span className="text-strudel-accent">◼</span> : <Play size={12} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-mono truncate">{sound.name}</div>
              <div className="text-[9px] text-muted-foreground flex gap-2 items-center">
                <span>{sound.duration.toFixed(1)}s</span>
                <span className="text-green-400/60">
                  {sound.license === 'Creative Commons 0' ? 'CC0' : sound.license === 'Attribution' ? 'CC BY' : 'CC BY-NC'}
                </span>
                <span>@{sound.username}</span>
              </div>
              {sound.tags.length > 0 && (
                <div className="text-[8px] text-muted-foreground/60 truncate mt-0.5">
                  {sound.tags.slice(0, 6).join(', ')}
                  {sound.tags.length > 6 && ` +${sound.tags.length - 6}`}
                </div>
              )}
            </div>
            <button
              onClick={() => handleImport(sound)}
              disabled={importingId === sound.id}
              className="text-muted-foreground hover:text-white p-0.5 shrink-0 mt-0.5 cursor-pointer disabled:opacity-50"
              title={`Import ${sound.name}`}
            >
              {importingId === sound.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            </button>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="p-2 border-t border-strudel-surface-light">
          <Button
            onClick={handleLoadMore}
            disabled={searching}
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
          >
            {searching ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      {!searching && results.length === 0 && !error && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          {query.trim()
            ? `No sounds found for "${query.trim()}"`
            : 'Enter a search term to find sounds'}
        </div>
      )}
    </>
  );
}
