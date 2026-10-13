import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Play, Plus, Search, Upload, X, FolderOpen, Globe, Music } from "lucide-react";
import { registerCustomSample, removeCustomSample, getCustomSamples, loadedBanks, downloadYoutubeAudio } from "@/lib/sample-registry";
import { ALL_MODIFIERS, MODIFIERS_BY_CATEGORY, CATEGORY_LABELS } from "@/lib/modifier-registry";
import type { CustomSample } from "@/lib/stores/db";
import DirtSamplesBrowser from "@/components/samples/dirt-samples-browser";
import FreesoundSearch from "@/components/samples/freesound-search";
import ApiKeyDialog from "@/components/samples/api-key-dialog";

function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

interface SamplesPanelProps {
  onInsertSample: (name: string, n?: number) => void;
  onPlaySample: (name: string) => void;
  refreshKey?: number;
  onInsertCode?: (code: string) => void;
}

const BUILTIN_SAMPLES = [
  {
    name: "Synths",
    sections: [
      { label: "Sample Banks", samples: ["noise"] },
      { label: "Waveforms", samples: ["sawtooth", "square", "triangle", "sine", "saw", "tri"] },
    ],
  },
  {
    name: "Drums",
    sections: [
      { label: "Sample Banks", samples: ["bd", "sd", "hh", "cp", "cb"] },
    ],
  },
  {
    name: "Melodic",
    sections: [
      { label: "Sample Banks", samples: ["pad", "pluck", "arp"] },
    ],
  },
  {
    name: "Bass",
    sections: [
      { label: "Sample Banks", samples: ["bass", "wobble"] },
    ],
  },
  {
    name: "Ambient",
    sections: [
      { label: "Sample Banks", samples: ["wind", "noise"] },
    ],
  },
];

export default function SamplesPanel({ onInsertSample, onPlaySample, refreshKey, onInsertCode }: SamplesPanelProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [discoveredBanks, setDiscoveredBanks] = useState<string[]>([]);
  const [customSamples, setCustomSamples] = useState<CustomSample[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [originTab, setOriginTab] = useState<'builtin' | 'dirt' | 'freesound' | 'custom' | 'modifiers'>('builtin');
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlName, setUrlName] = useState("");
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlError, setUrlError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    refreshDiscovered();
    refreshCustom();
    pollTimerRef.current = setInterval(refreshDiscovered, 2000);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  useEffect(() => {
    refreshCustom();
  }, [refreshKey]);

  const refreshDiscovered = useCallback(() => {
    const banks: string[] = Array.from(loadedBanks).filter((b: string) => b !== 'gm');
    setDiscoveredBanks(prev => {
      const merged = [...new Set([...prev, ...banks])];
      return merged.length !== prev.length ? merged : prev;
    });
  }, []);

  const refreshCustom = useCallback(async () => {
    const samples = await getCustomSamples();
    setCustomSamples(samples);
  }, []);

  const handleFileDrop = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|aiff|aif)$/i)) {
        console.warn(`[Samples] Skipping non-audio file: ${file.name}`);
        continue;
      }
      const name = file.name.replace(/\.[^.]+$/, '');
      await registerCustomSample(name, file, 'local');
    }
    await refreshCustom();
  }, [refreshCustom]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileDrop(e.dataTransfer.files);
    }
  }, [handleFileDrop]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileDrop(e.target.files);
      e.target.value = '';
    }
  }, [handleFileDrop]);

  const handleUrlImport = useCallback(async () => {
    const name = urlName.trim() || urlInput.split('/').pop()?.replace(/\.[^.]+$/, '') || 'sample';
    setUrlImporting(true);
    setUrlError('');

    try {
      const isYoutube = /youtube\.com|youtu\.be/i.test(urlInput);

      if (isYoutube) {
        if (!isDesktopApp()) {
          setUrlError('YouTube imports require the desktop app');
          setUrlImporting(false);
          return;
        }
        const blob = await downloadYoutubeAudio(urlInput, name);
        await registerCustomSample(name, blob, 'url', urlInput);
      } else {
        const res = await fetch(urlInput);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        await registerCustomSample(name, blob, 'url', urlInput);
      }

      await refreshCustom();
      setUrlInput('');
      setUrlName('');
      setUrlDialogOpen(false);
    } catch (e: any) {
      console.error('[Samples] URL import failed:', e);
      setUrlError(e instanceof Error ? e.message : String(e));
    } finally {
      setUrlImporting(false);
    }
  }, [urlInput, urlName, refreshCustom]);

  const handleRemoveCustom = useCallback(async (name: string) => {
    await removeCustomSample(name);
    await refreshCustom();
  }, [refreshCustom]);

  const filterSamples = (samples: string[]) =>
    samples.filter(s => s.toLowerCase().includes(search.toLowerCase()));

  const builtinFiltered = BUILTIN_SAMPLES.map(cat => ({
    ...cat,
    sections: cat.sections.map(sec => ({
      ...sec,
      samples: filterSamples(sec.samples),
    })).filter(sec => sec.samples.length > 0),
  })).filter(cat => cat.sections.length > 0);

  const displayedBuiltin = activeCategory
    ? builtinFiltered.filter(c => c.name === activeCategory)
    : builtinFiltered;

  const allCategories = BUILTIN_SAMPLES.map(c => c.name);

  return (
    <div className="flex flex-col flex-1 min-h-0" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-strudel-accent/20 border-2 border-dashed border-strudel-accent rounded pointer-events-none">
          <div className="text-strudel-accent text-sm font-bold">Drop audio files here</div>
        </div>
      )}

      <div className="p-2 border-b border-strudel-surface-light">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter samples..."
            className="bg-strudel-dark border-strudel-surface-light text-xs h-7 pl-7 text-white"
          />
        </div>
      </div>

      <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
        {(['builtin', 'dirt', 'freesound', 'custom', 'modifiers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setOriginTab(tab)}
            className={`text-[10px] px-2 py-0.5 rounded uppercase ${
              originTab === tab
                ? 'bg-strudel-primary text-white'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            {tab === 'freesound' ? '🌐 FREESOUND' : tab === 'builtin' ? 'BUILT-IN' : tab === 'modifiers' ? 'FX' : tab}
          </button>
        ))}
      </div>

      {originTab === 'builtin' && (
        <div className="flex gap-1 p-1 border-b border-strudel-surface-light flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[10px] px-2 py-0.5 rounded ${!activeCategory ? 'bg-strudel-primary text-white' : 'text-muted-foreground hover:text-white'}`}
          >
            ALL
          </button>
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-[10px] px-2 py-0.5 rounded ${activeCategory === cat ? 'bg-strudel-primary text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {originTab === 'custom' && (
        <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
          <Button
            variant="ghost" size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
          >
            <Upload size={10} /> ADD FILE
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setUrlDialogOpen(true)}
            className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
          >
            <Globe size={10} /> ADD URL
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}
      {originTab === 'freesound' && (
        <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
          <Button
            variant="ghost" size="sm"
            onClick={() => setApiKeyDialogOpen(true)}
            className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1 ml-auto"
            title="Configure Freesound API Key"
          >
            🔑 API KEY
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {originTab === 'custom' && customSamples.length > 0 && (
          <SampleSection
            label="MY SAMPLES"
            color="#a855f7"
            items={customSamples.map(s => s.name)}
            onInsert={onInsertSample}
            onPlay={onPlaySample}
            onRemove={handleRemoveCustom}
            showRemove
          />
        )}

        {originTab === 'custom' && discoveredBanks.length > 0 && (
          <SampleSection
            label="DISCOVERED"
            color="#22c55e"
            items={discoveredBanks}
            onInsert={name => onInsertSample(name)}
            onPlay={name => onPlaySample(name)}
          />
        )}

        {originTab === 'builtin' && customSamples.length > 0 && (
          <SampleSection
            label="MY SAMPLES"
            color="#a855f7"
            items={customSamples.map(s => s.name)}
            onInsert={onInsertSample}
            onPlay={onPlaySample}
            onRemove={handleRemoveCustom}
            showRemove
          />
        )}

        {originTab === 'builtin' && discoveredBanks.length > 0 && (
          <SampleSection
            label="DISCOVERED"
            color="#22c55e"
            items={discoveredBanks}
            onInsert={name => onInsertSample(name)}
            onPlay={name => onPlaySample(name)}
          />
        )}

        {originTab === 'builtin' && displayedBuiltin.length > 0 && <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground border-b border-strudel-surface-light">
          ● BUILT-IN
        </div>}
        {originTab === 'builtin' && displayedBuiltin.map(cat =>
          cat.sections.length > 0 && (
            <div key={cat.name}>
              <div className="px-3 py-0.5 text-[9px] font-bold text-muted-foreground/60 uppercase">
                {cat.name}
              </div>
              {cat.sections.map(sec => (
                <div key={sec.label}>
                  <div className="px-3 py-0.5 text-[8px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                    {sec.label}
                  </div>
                  {sec.samples.map(sample => (
                    <SampleRow key={sample} name={sample} onInsert={onInsertSample} onPlay={onPlaySample} />
                  ))}
                </div>
              ))}
            </div>
          )
        )}

        {originTab === 'dirt' && (
          <DirtSamplesBrowser
            search={search}
            onInsertSample={onInsertSample}
          />
        )}

        {originTab === 'freesound' && (
          <FreesoundSearch
            onInsertSample={onInsertSample}
            onOpenApiKeyDialog={() => setApiKeyDialogOpen(true)}
          />
        )}

        {originTab === 'modifiers' && (
          <div className="p-2 space-y-3">
            <p className="text-[9px] text-muted-foreground">Click a modifier to insert it at cursor.</p>
            {(Object.keys(MODIFIERS_BY_CATEGORY) as (keyof typeof MODIFIERS_BY_CATEGORY)[]).map(cat => (
              <div key={cat}>
                <div className="text-[9px] font-bold text-muted-foreground/60 uppercase mb-1">{CATEGORY_LABELS[cat]}</div>
                {MODIFIERS_BY_CATEGORY[cat].map(mod => (
                  <ModifierRow
                    key={mod.name}
                    name={mod.name}
                    detail={mod.detail}
                    syntax={mod.syntax}
                    onInsert={() => onInsertCode?.(`.${mod.syntax}`)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent className="bg-strudel-surface border-strudel-surface-light max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">Import from URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground">Sample Name (optional)</label>
              <Input
                value={urlName}
                onChange={e => setUrlName(e.target.value)}
                placeholder="my_sample"
                className="bg-strudel-dark border-strudel-surface-light text-white text-xs h-8"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">
                Audio URL (.wav, .mp3, .ogg)
                {isDesktopApp() && <span className="text-strudel-accent ml-1">or YouTube</span>}
              </label>
              <Input
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                placeholder={isDesktopApp() ? "https://example.com/sound.wav or YouTube URL" : "https://example.com/sound.wav"}
                className="bg-strudel-dark border-strudel-surface-light text-white text-xs h-8"
              />
            </div>
            {urlError && (
              <p className="text-[10px] text-red-400">{urlError}</p>
            )}
            <Button
              onClick={handleUrlImport}
              disabled={!urlInput.trim() || urlImporting}
              className="w-full bg-strudel-primary hover:bg-strudel-secondary text-xs h-8"
            >
              {urlImporting ? 'Importing...' : 'Import'}
            </Button>
            <p className="text-[9px] text-muted-foreground text-center">
              {isDesktopApp()
                ? 'YouTube URLs are downloaded via yt-dlp and converted to WAV'
                : 'Direct audio URLs only. Use the desktop app for YouTube import.'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <ApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
      />
    </div>
  );
}

interface SampleSectionProps {
  label: string;
  color: string;
  items: string[];
  onInsert: (name: string) => void;
  onPlay: (name: string) => void;
  onRemove?: (name: string) => void;
  showRemove?: boolean;
}

function SampleSection({ label, color, items, onInsert, onPlay, onRemove, showRemove }: SampleSectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-2 py-1 text-[10px] font-bold border-b border-strudel-surface-light" style={{ color }}>
        ● {label}
      </div>
      {items.map(item => (
        <SampleRow key={item} name={item} onInsert={onInsert} onPlay={onPlay} onRemove={onRemove} showRemove={showRemove} />
      ))}
    </div>
  );
}

interface ModifierRowProps {
  name: string;
  detail: string;
  syntax: string;
  onInsert: () => void;
}

function ModifierRow({ name, detail, syntax, onInsert }: ModifierRowProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 hover:bg-strudel-surface-light/50 text-xs">
      <span className="text-strudel-accent font-mono text-[11px] w-16 shrink-0">{name}</span>
      <span className="flex-1 text-muted-foreground text-[9px] truncate">{detail}</span>
      <span className="text-[8px] text-muted-foreground/40 font-mono hidden sm:block">{syntax}</span>
      <button
        onClick={onInsert}
        className="text-muted-foreground hover:text-white p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
        title={`Insert ${name}`}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

interface SampleRowProps {
  name: string;
  onInsert: (name: string) => void;
  onPlay: (name: string) => void;
  onRemove?: (name: string) => void;
  showRemove?: boolean;
}

function SampleRow({ name, onInsert, onPlay, onRemove, showRemove }: SampleRowProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 text-xs">
      <Music size={10} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-white font-mono truncate">{name}</span>
      <button
        onClick={() => onPlay(name)}
        className="text-strudel-accent p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
        title={`Preview ${name}`}
      >
        <Play size={12} />
      </button>
      <button
        onClick={() => onInsert(name)}
        className="text-muted-foreground hover:text-white p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
        title={`Insert ${name}`}
      >
        <Plus size={12} />
      </button>
      {showRemove && onRemove && (
        <button
          onClick={() => onRemove(name)}
          className="text-muted-foreground hover:text-red-400 p-0.5 hover:bg-strudel-surface-light rounded cursor-pointer"
          title={`Remove ${name}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
