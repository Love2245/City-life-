export interface MusicFile {
  id: string;
  url: string;
}

export interface MusicPlayerOptions {
  fadeSeconds?: number;
  onStarted?: (id: string) => void;
  onError?: (error: unknown, id: string) => void;
  loader?: (url: string) => Promise<AudioBuffer>;
}

interface EnvelopePoint {
  at: number;
  value: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  role: "background" | "jingle";
  epoch: number;
  startedAt: number;
  offset: number;
  endsAt: number;
  fadeOutSeconds: number;
  envelope: EnvelopePoint[];
  retiring: boolean;
}

const sameTrack = (a: MusicFile | null, b: MusicFile | null): boolean =>
  a === b || (!!a && !!b && a.id === b.id && a.url === b.url);

function envelopeValue(points: EnvelopePoint[], at: number): number {
  if (at <= points[0].at) return points[0].value;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    if (at <= next.at) {
      const span = next.at - previous.at;
      return span <= 0 ? next.value : previous.value + (next.value - previous.value) * ((at - previous.at) / span);
    }
  }
  return points[points.length - 1].value;
}

/** Plays decoded music files on the audio clock, independently of sound effects. */
export class MusicPlayer {
  private readonly master: GainNode;
  private readonly backgroundDuck: GainNode;
  private readonly loader: (url: string) => Promise<AudioBuffer>;
  private readonly fadeSeconds: number;
  private readonly voices = new Set<Voice>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loadingBuffers = new Map<string, Promise<AudioBuffer>>();
  private desired: MusicFile | null = null;
  private current: MusicFile | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private loopVoice: Voice | null = null;
  private jingle: Voice | null = null;
  private loadGeneration = 0;
  private jingleGeneration = 0;
  private currentEpoch = 0;
  private loadingTrack: string | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private disposed = false;
  private resumePosition: { track: MusicFile; offset: number } | null = null;
  private anchorAt = 0;
  private anchorOffset = 0;
  private duckEnvelope: EnvelopePoint[];
  private volumeEnvelope: EnvelopePoint[];

  constructor(private readonly context: AudioContext, private readonly options: MusicPlayerOptions = {}) {
    const requestedFade = options.fadeSeconds ?? 3;
    this.fadeSeconds = Number.isFinite(requestedFade) ? Math.max(0.01, requestedFade) : 3;
    this.master = context.createGain();
    this.backgroundDuck = context.createGain();
    this.backgroundDuck.connect(this.master);
    this.master.connect(context.destination);
    this.master.gain.setValueAtTime(1, context.currentTime);
    this.backgroundDuck.gain.setValueAtTime(1, context.currentTime);
    this.duckEnvelope = [{ at: context.currentTime, value: 1 }];
    this.volumeEnvelope = [{ at: context.currentTime, value: 1 }];
    this.loader = options.loader ?? (async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Music request failed (${response.status}): ${url}`);
      return await context.decodeAudioData(await response.arrayBuffer());
    });
  }

  setTrack(track: MusicFile | null, retireCurrentQuickly = false): void {
    if (this.disposed) return;
    const unchanged = sameTrack(this.desired, track);
    this.desired = track ? { id: track.id, url: track.url } : null;
    const key = track ? this.trackKey(track) : null;
    if (unchanged && (this.paused || this.loadingTrack === key || sameTrack(this.current, track))) return;
    this.loadGeneration++;
    this.loadingTrack = null;
    if (this.paused) return;
    // A venue track must not continue indefinitely while its replacement loads.
    if (retireCurrentQuickly) {
      this.current = null;
      this.currentBuffer = null;
      this.loopVoice = null;
      this.resumePosition = null;
      this.stopScheduler();
      this.retireBackground(this.context.currentTime, undefined, .2);
    }
    if (!track) {
      this.current = null;
      this.currentBuffer = null;
      this.loopVoice = null;
      this.resumePosition = null;
      this.stopScheduler();
      this.retireBackground(this.context.currentTime);
      return;
    }
    if (sameTrack(this.current, track)) return;
    void this.activate(track);
  }

  /** Receives a music-only volume from 0 to 1. */
  setVolume(value: number): void {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const before = envelopeValue(this.volumeEnvelope, now);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(before, now);
    this.master.gain.linearRampToValueAtTime(volume, now + 0.08);
    this.volumeEnvelope = [{ at: now, value: before }, { at: now + 0.08, value: volume }];
  }

  playJingle(track: MusicFile): void {
    if (this.disposed || this.paused) return;
    this.cancelJingle();
    const generation = ++this.jingleGeneration;
    void this.load(track.url).then((buffer) => {
      if (this.disposed || this.paused || generation !== this.jingleGeneration) return;
      const now = this.context.currentTime;
      // A rapid door change replaces an earlier fading jingle rather than layering them.
      for (const voice of [...this.voices]) {
        if (voice.role === "jingle") this.stopVoice(voice, now);
      }
      const voice = this.createVoice(buffer, now, 0, "jingle", 0, Math.min(0.025, buffer.duration / 2), Math.min(0.12, buffer.duration / 2));
      this.jingle = voice;
      const before = envelopeValue(this.duckEnvelope, now);
      const downEnd = now + Math.min(0.25, buffer.duration / 2);
      const end = now + buffer.duration;
      this.backgroundDuck.gain.cancelScheduledValues(now);
      this.backgroundDuck.gain.setValueAtTime(before, now);
      this.backgroundDuck.gain.linearRampToValueAtTime(0.25, downEnd);
      this.backgroundDuck.gain.setValueAtTime(0.25, end);
      this.backgroundDuck.gain.linearRampToValueAtTime(1, end + 0.6);
      this.duckEnvelope = [
        { at: now, value: before },
        { at: downEnd, value: 0.25 },
        { at: end, value: 0.25 },
        { at: end + 0.6, value: 1 },
      ];
    }).catch((error: unknown) => {
      if (!this.disposed && !this.paused && generation === this.jingleGeneration) this.reportError(error, track.id);
    });
  }

  cancelJingle(): void {
    if (this.disposed) return;
    this.jingleGeneration++;
    const now = this.context.currentTime;
    const old = this.jingle;
    this.jingle = null;
    if (old) this.retireVoice(old, now, 0.08);
    this.restoreDuck(now);
  }

  /** Stops immediately; background progress is preserved, jingles are discarded. */
  pause(): void {
    if (this.disposed || this.paused) return;
    const now = this.context.currentTime;
    if (this.current && this.currentBuffer) {
      const audible = [...this.voices]
        .filter((voice) => voice.role === "background" && voice.epoch === this.currentEpoch && voice.startedAt <= now && voice.endsAt > now)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      const offset = audible
        ? audible.offset + now - audible.startedAt
        : this.anchorOffset + Math.max(0, now - this.anchorAt);
      const period = this.currentBuffer.duration - this.loopFade(this.currentBuffer);
      this.resumePosition = {
        track: this.current,
        offset: audible ? Math.max(0, Math.min(offset, this.currentBuffer.duration - 0.001)) : offset % period,
      };
    }
    this.paused = true;
    this.loadGeneration++;
    this.jingleGeneration++;
    this.loadingTrack = null;
    this.current = null;
    this.currentBuffer = null;
    this.loopVoice = null;
    this.jingle = null;
    this.stopScheduler();
    for (const voice of [...this.voices]) this.stopVoice(voice, now);
    this.backgroundDuck.gain.cancelScheduledValues(now);
    this.backgroundDuck.gain.setValueAtTime(1, now);
    this.duckEnvelope = [{ at: now, value: 1 }];
  }

  resume(): void {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    if (this.desired) void this.activate(this.desired);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.buffers.clear();
    this.loadingBuffers.clear();
    this.backgroundDuck.disconnect();
    this.master.disconnect();
  }

  private trackKey(track: MusicFile): string {
    return `${track.id}\n${track.url}`;
  }

  private async activate(track: MusicFile): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingTrack = this.trackKey(track);
    try {
      const buffer = await this.load(track.url);
      if (this.disposed || this.paused || generation !== this.loadGeneration || !sameTrack(this.desired, track)) return;
      const now = this.context.currentTime;
      const offset = this.resumePosition && sameTrack(this.resumePosition.track, track) ? this.resumePosition.offset : 0;
      const epoch = this.currentEpoch + 1;
      const remaining = buffer.duration - offset;
      const fade = Math.min(this.loopFade(buffer), remaining / 2);
      // Starting successfully precedes retiring the previous track, so a load/start failure preserves it.
      const voice = this.createVoice(buffer, now, offset, "background", epoch, fade, fade);
      this.retireBackground(now, voice);
      this.currentEpoch = epoch;
      this.current = { id: track.id, url: track.url };
      this.currentBuffer = buffer;
      this.loopVoice = voice;
      this.anchorAt = now;
      this.anchorOffset = offset;
      this.resumePosition = null;
      this.loadingTrack = null;
      this.trimBackground(now);
      this.queueLoop(now);
      if (!this.current || this.currentEpoch !== epoch || !sameTrack(this.desired, track)) return;
      this.ensureScheduler();
      this.options.onStarted?.(track.id);
    } catch (error: unknown) {
      if (!this.disposed && !this.paused && generation === this.loadGeneration) {
        this.loadingTrack = null;
        this.reportError(error, track.id);
      }
    }
  }

  private load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) {
      this.buffers.delete(url);
      this.buffers.set(url, cached);
      return Promise.resolve(cached);
    }
    const pending = this.loadingBuffers.get(url);
    if (pending) return pending;
    const promise = Promise.resolve().then(() => this.loader(url)).then((buffer) => {
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error(`Empty music buffer: ${url}`);
      if (!this.disposed) {
        this.buffers.delete(url);
        this.buffers.set(url, buffer);
        const bytes=(b:AudioBuffer)=>Number.isFinite(b.length*b.numberOfChannels)?b.length*b.numberOfChannels*4:0;
        let total=[...this.buffers.values()].reduce((n,b)=>n+bytes(b),0);
        while (this.buffers.size > 3 || total>24*1024*1024) {const key=this.buffers.keys().next().value!;total-=bytes(this.buffers.get(key)!);this.buffers.delete(key);}
      }
      return buffer;
    }).finally(() => {
      if (this.loadingBuffers.get(url) === promise) this.loadingBuffers.delete(url);
    });
    this.loadingBuffers.set(url, promise);
    return promise;
  }

  private loopFade(buffer: AudioBuffer): number {
    return Math.min(this.fadeSeconds, buffer.duration / 2);
  }

  private createVoice(
    buffer: AudioBuffer,
    startAt: number,
    offset: number,
    role: Voice["role"],
    epoch: number,
    fadeInSeconds: number,
    fadeOutSeconds: number,
  ): Voice {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const endsAt = startAt + buffer.duration - offset;
    const fadeOutAt = endsAt - fadeOutSeconds;
    const voice: Voice = {
      source,
      gain,
      role,
      epoch,
      startedAt: startAt,
      offset,
      endsAt,
      fadeOutSeconds,
      envelope: [
        { at: startAt, value: 0 },
        { at: startAt + fadeInSeconds, value: 1 },
        { at: fadeOutAt, value: 1 },
        { at: endsAt, value: 0 },
      ],
      retiring: false,
    };
    try {
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain);
      gain.connect(role === "background" ? this.backgroundDuck : this.master);
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + fadeInSeconds);
      gain.gain.setValueAtTime(1, fadeOutAt);
      gain.gain.linearRampToValueAtTime(0, endsAt);
      source.onended = () => {
        this.removeVoice(voice);
        if (this.jingle === voice) this.jingle = null;
      };
      source.start(startAt, offset);
      source.stop(endsAt);
      this.voices.add(voice);
      return voice;
    } catch (error: unknown) {
      source.onended = null;
      try { source.stop(this.context.currentTime); } catch { /* A source may fail before starting. */ }
      source.disconnect();
      gain.disconnect();
      throw error;
    }
  }

  private queueLoop(now: number): void {
    if (!this.current || !this.currentBuffer || !this.loopVoice || this.loopVoice.startedAt > now) return;
    const preceding = this.loopVoice;
    this.anchorAt = preceding.startedAt;
    this.anchorOffset = preceding.offset;
    const startAt = preceding.endsAt - preceding.fadeOutSeconds;
    try {
      if (startAt < now) {
        // Recover a suspended/delayed scheduler without seeking beyond the buffer.
        const period = this.currentBuffer.duration - this.loopFade(this.currentBuffer);
        const offset = (now - startAt) % period;
        const fade = Math.min(this.loopFade(this.currentBuffer), (this.currentBuffer.duration - offset) / 2);
        this.loopVoice = this.createVoice(this.currentBuffer, now, offset, "background", this.currentEpoch, fade, fade);
      } else {
        this.loopVoice = this.createVoice(
          this.currentBuffer, startAt, 0, "background", this.currentEpoch,
          preceding.fadeOutSeconds, this.loopFade(this.currentBuffer),
        );
      }
      this.trimBackground(now);
    } catch (error: unknown) {
      const id = this.current.id;
      this.current = null;
      this.currentBuffer = null;
      this.loopVoice = null;
      this.stopScheduler();
      this.reportError(error, id);
    }
  }

  private ensureScheduler(): void {
    if (this.scheduler === null) this.scheduler = setInterval(() => this.queueLoop(this.context.currentTime), 250);
  }

  private stopScheduler(): void {
    if (this.scheduler !== null) clearInterval(this.scheduler);
    this.scheduler = null;
  }

  private retireBackground(now: number, except?: Voice, fadeSeconds = this.fadeSeconds): void {
    for (const voice of [...this.voices]) {
      if (voice.role !== "background" || voice === except) continue;
      if (voice.startedAt > now) this.stopVoice(voice, now);
      else if (!voice.retiring || voice.endsAt > now + fadeSeconds) this.retireVoice(voice, now, fadeSeconds);
    }
  }

  private retireVoice(voice: Voice, now: number, requestedFade: number): void {
    const seconds = Math.min(requestedFade, voice.endsAt - now);
    if (seconds <= 0) {
      this.stopVoice(voice, now);
      return;
    }
    const before = envelopeValue(voice.envelope, now);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(before, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
    voice.envelope = [{ at: now, value: before }, { at: now + seconds, value: 0 }];
    voice.endsAt = now + seconds;
    voice.retiring = true;
    try { voice.source.stop(voice.endsAt); } catch { this.removeVoice(voice); }
  }

  private trimBackground(now: number): void {
    const background = [...this.voices].filter((voice) => voice.role === "background");
    if (background.length <= 4) return;
    const candidates = background
      .filter((voice) => voice.epoch !== this.currentEpoch)
      .sort((a, b) => a.startedAt - b.startedAt);
    while (background.length > 4 && candidates.length) {
      const oldest = candidates.shift()!;
      this.stopVoice(oldest, now);
      background.splice(background.indexOf(oldest), 1);
    }
  }

  private stopVoice(voice: Voice, at: number): void {
    try { voice.source.stop(at); } catch { /* Already ended sources can safely be removed. */ }
    this.removeVoice(voice);
  }

  private removeVoice(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
  }

  private restoreDuck(now: number): void {
    const before = envelopeValue(this.duckEnvelope, now);
    this.backgroundDuck.gain.cancelScheduledValues(now);
    this.backgroundDuck.gain.setValueAtTime(before, now);
    this.backgroundDuck.gain.linearRampToValueAtTime(1, now + 0.35);
    this.duckEnvelope = [{ at: now, value: before }, { at: now + 0.35, value: 1 }];
  }

  private reportError(error: unknown, id: string): void {
    try { this.options.onError?.(error, id); } catch { /* Error handlers must not cause unhandled promise rejections. */ }
  }
}
