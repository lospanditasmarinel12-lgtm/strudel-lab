import { getStrudelAudioContext } from './strudel-engine';
import { audioBufferToWavBlob } from './wav-encoder';
import { downloadYoutubeAudio } from './sample-registry';
import { nanoid } from 'nanoid';

export type MediaSource = 'youtube' | 'local_file' | 'url' | 'mic_freeze';

export interface MediaImportResult {
  name: string;
  blob: Blob;
  blobUrl: string;
  duration: number;
  sampleRate: number;
  channels: number;
  source: MediaSource;
}

export class MediaImporter {
  async importLocalFile(file: File): Promise<MediaImportResult> {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || `sample_${nanoid(6)}`;
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' });
    return this.processBlob(blob, name, 'local_file');
  }

  async importFromUrl(url: string, name?: string): Promise<MediaImportResult> {
    const isYoutube = /youtube\.com|youtu\.be/i.test(url);
    if (isYoutube) {
      return this.importFromYoutube(url, name || 'youtube_sample');
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    const blob = await response.blob();
    const resolvedName = name || url.split('/').pop()?.replace(/\.[^.]+$/, '') || `url_${nanoid(6)}`;
    return this.processBlob(blob, resolvedName, 'url');
  }

  async importFromYoutube(url: string, name: string): Promise<MediaImportResult> {
    const wavBlob = await downloadYoutubeAudio(url, name);
    return this.processBlob(wavBlob, name, 'youtube');
  }

  async registerWithStrudel(result: MediaImportResult): Promise<void> {
    const { samples } = await import('@strudel/web');
    await samples({ [result.name]: [result.blobUrl] });
    URL.revokeObjectURL(result.blobUrl);
  }

  private async processBlob(blob: Blob, name: string, source: MediaSource): Promise<MediaImportResult> {
    const ctx = getStrudelAudioContext();
    if (!ctx) throw new Error('AudioContext not available for decoding');

    const arrayBuffer = await blob.arrayBuffer();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } catch (err: unknown) {
      throw new Error(`Could not decode audio: ${err instanceof Error ? err.message : String(err)}. Supported formats: WAV, MP3, OGG, FLAC`);
    }

    const blobUrl = URL.createObjectURL(blob);

    return {
      name,
      blob,
      blobUrl,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      source,
    };
  }
}

export const globalMediaImporter = new MediaImporter();
