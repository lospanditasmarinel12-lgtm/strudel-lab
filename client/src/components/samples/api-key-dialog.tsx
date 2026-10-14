import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getApiKey, setApiKey, validateApiKey } from '@/lib/freesound-api';

export interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeySaved?: () => void;
}

type KeyStatus = 'idle' | 'typing' | 'testing' | 'valid' | 'invalid' | 'error';

export default function ApiKeyDialog({ open, onOpenChange, onKeySaved }: ApiKeyDialogProps) {
  const [inputKey, setInputKey] = useState('');
  const [status, setStatus] = useState<KeyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    getApiKey().then((existing) => {
      if (!active) return;
      setInputKey(existing || '');
      setStatus(existing ? 'typing' : 'idle');
      setErrorMsg('');
    });
    return () => {
      active = false;
    };
  }, [open]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputKey(e.target.value);
    setStatus(e.target.value.trim() ? 'typing' : 'idle');
    setErrorMsg('');
  }, []);

  const handleTest = useCallback(async () => {
    const key = inputKey.trim();
    if (!key) return;
    setStatus('testing');
    setErrorMsg('');
    try {
      const valid = await validateApiKey(key);
      setStatus(valid ? 'valid' : 'invalid');
      if (!valid) setErrorMsg('Invalid key. Check your key at freesound.org/apiv2/apply');
    } catch {
      setStatus('error');
      setErrorMsg('Could not reach Freesound. Check your internet connection.');
    }
  }, [inputKey]);

  const handleSave = useCallback(async () => {
    if (status !== 'valid' && status !== 'typing') return;
    await setApiKey(inputKey.trim());
    onKeySaved?.();
    onOpenChange(false);
  }, [status, inputKey, onKeySaved, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const canTest = status === 'typing';
  const canSave = status === 'valid';
  const isTesting = status === 'testing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-strudel-surface border-strudel-surface-light max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-sm">🌐 Freesound API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Search over <strong>700,000+</strong> CC0 / Creative Commons sounds from Freesound.
          </p>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Get your free API key:</p>
            <a
              href="https://freesound.org/apiv2/apply"
              target="_blank"
              rel="noopener noreferrer"
              className="text-strudel-accent underline text-[10px] block"
            >
              freesound.org/apiv2/apply
            </a>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">API Key</label>
            <Input
              value={inputKey}
              onChange={handleInputChange}
              placeholder="Paste your Freesound API key here"
              className="bg-strudel-dark border-strudel-surface-light text-white text-xs h-8 mt-1"
              onKeyDown={e => { if (e.key === 'Enter' && canTest) handleTest(); }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={!canTest || isTesting}
              variant="outline"
              size="sm"
              className="text-xs h-7"
            >
              {isTesting ? 'Testing...' : 'Test Key'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              size="sm"
              className="text-xs h-7 bg-strudel-primary hover:bg-strudel-secondary"
            >
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          {status === 'invalid' && (
            <p className="text-[10px] text-red-400">{errorMsg}</p>
          )}
          {status === 'error' && (
            <p className="text-[10px] text-yellow-400">{errorMsg}</p>
          )}
          {status === 'valid' && (
            <p className="text-[10px] text-green-400">✓ Key is valid. Click Save to continue.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
