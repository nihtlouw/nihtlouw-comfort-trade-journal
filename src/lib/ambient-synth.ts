import type { AppLocale } from "@/lib/types";

export const AMBIENT_PRESET_IDS = [
  "soft_rain",
  "brown_noise",
  "botanical_pad",
  "night_stream",
] as const;

export type AmbientPresetId = (typeof AMBIENT_PRESET_IDS)[number];

export type AmbientPresetInfo = {
  id: AmbientPresetId;
  title: string;
  subtitle: string;
};

export function getAmbientPresets(locale: AppLocale): AmbientPresetInfo[] {
  if (locale === "id") {
    return [
      { id: "soft_rain", title: "Hujan Teduh", subtitle: "Ambien · 0 MB · Rintik halus" },
      { id: "brown_noise", title: "Derau Cokelat", subtitle: "Ambien · 0 MB · Fokus tenang" },
      { id: "botanical_pad", title: "Harmoni Botanikal", subtitle: "Ambien · 0 MB · Nada hangat" },
      { id: "night_stream", title: "Aliran Malam", subtitle: "Ambien · 0 MB · Air mengalir" },
    ];
  }
  return [
    { id: "soft_rain", title: "Soft Rain", subtitle: "Ambient · 0 MB · Gentle rainfall" },
    { id: "brown_noise", title: "Brown Noise", subtitle: "Ambient · 0 MB · Warm focus" },
    { id: "botanical_pad", title: "Botanical Pad", subtitle: "Ambient · 0 MB · Calm chord drone" },
    { id: "night_stream", title: "Night Stream", subtitle: "Ambient · 0 MB · Flowing water" },
  ];
}

function createNoiseBuffer(ctx: AudioContext, kind: "pink" | "brown", seconds = 4): AudioBuffer {
  const length = Math.max(1024, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = kind === "pink" ? 0x6d2b79f5 : 0x9e3779b9;
  const nextRand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };

  for (let ch = 0; ch < 2; ch++) {
    const out = buffer.getChannelData(ch);
    if (kind === "brown") {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = nextRand();
        last = (last + 0.02 * white) / 1.02;
        out[i] = last * 3.2;
      }
    } else {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = nextRand();
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.095;
        b6 = white * 0.115926;
      }
    }
    // Cross-fade loop ends (64 samples) so continuous looping never clicks.
    const fade = Math.min(128, Math.floor(length / 8));
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      out[i] *= w;
      out[length - 1 - i] *= w;
    }
  }
  return buffer;
}

type ActiveGraph = {
  preset: AmbientPresetId;
  master: GainNode;
  stopAll: () => void;
};

export class AmbientSynthController {
  private ctx: AudioContext | null = null;
  private graph: ActiveGraph | null = null;
  private volume = 0.8;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private targetGain(): number {
    if (this.muted || this.volume <= 0) return 0;
    return Math.min(1, Math.max(0, this.volume)) * 0.42;
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    if (this.ctx && this.graph) {
      const now = this.ctx.currentTime;
      this.graph.master.gain.cancelScheduledValues(now);
      this.graph.master.gain.setTargetAtTime(this.targetGain(), now, 0.04);
    }
  }

  async start(preset: AmbientPresetId): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Headless or policy-restricted contexts may keep state suspended; graph still builds cleanly.
      }
    }

    if (this.graph?.preset === preset) {
      const now = ctx.currentTime;
      this.graph.master.gain.cancelScheduledValues(now);
      this.graph.master.gain.setTargetAtTime(this.targetGain(), now, 0.05);
      return true;
    }

    this.teardownGraph();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.connect(ctx.destination);

    const disposers: Array<() => void> = [];

    if (preset === "soft_rain") {
      const src = ctx.createBufferSource();
      src.buffer = createNoiseBuffer(ctx, "pink", 4);
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1150;
      lp.Q.value = 0.6;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.11;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);

      src.connect(lp);
      lp.connect(master);
      src.start();
      lfo.start();
      disposers.push(() => {
        src.stop();
        lfo.stop();
        src.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        lp.disconnect();
      });
    } else if (preset === "brown_noise") {
      const src = ctx.createBufferSource();
      src.buffer = createNoiseBuffer(ctx, "brown", 4);
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 460;
      lp.Q.value = 0.5;

      src.connect(lp);
      lp.connect(master);
      src.start();
      disposers.push(() => {
        src.stop();
        src.disconnect();
        lp.disconnect();
      });
    } else if (preset === "botanical_pad") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 620;
      lp.Q.value = 0.8;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);
      lp.connect(master);
      lfo.start();

      const voices: Array<{ freq: number; detune: number; type: OscillatorType; gain: number }> = [
        { freq: 130.81, detune: -3, type: "sine", gain: 0.34 },
        { freq: 196.00, detune: 3, type: "sine", gain: 0.24 },
        { freq: 246.94, detune: -2, type: "triangle", gain: 0.12 },
        { freq: 293.66, detune: 4, type: "sine", gain: 0.16 },
      ];
      const oscNodes = voices.map((v) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = v.type;
        osc.frequency.value = v.freq;
        osc.detune.value = v.detune;
        g.gain.value = v.gain;
        osc.connect(g);
        g.connect(lp);
        osc.start();
        return { osc, g };
      });

      const air = ctx.createBufferSource();
      air.buffer = createNoiseBuffer(ctx, "pink", 4);
      air.loop = true;
      const airGain = ctx.createGain();
      airGain.gain.value = 0.05;
      air.connect(airGain);
      airGain.connect(lp);
      air.start();

      disposers.push(() => {
        oscNodes.forEach(({ osc, g }) => {
          osc.stop();
          osc.disconnect();
          g.disconnect();
        });
        air.stop();
        air.disconnect();
        airGain.disconnect();
        lfo.stop();
        lfo.disconnect();
        lfoGain.disconnect();
        lp.disconnect();
      });
    } else {
      const src = ctx.createBufferSource();
      src.buffer = createNoiseBuffer(ctx, "pink", 4);
      src.loop = true;

      const bpLow = ctx.createBiquadFilter();
      bpLow.type = "bandpass";
      bpLow.frequency.value = 430;
      bpLow.Q.value = 1.6;

      const bpHigh = ctx.createBiquadFilter();
      bpHigh.type = "bandpass";
      bpHigh.frequency.value = 940;
      bpHigh.Q.value = 2.0;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.15;
      lfoGain.gain.value = 95;
      lfo.connect(lfoGain);
      lfoGain.connect(bpHigh.frequency);

      src.connect(bpLow);
      src.connect(bpHigh);
      bpLow.connect(master);
      bpHigh.connect(master);
      src.start();
      lfo.start();
      disposers.push(() => {
        src.stop();
        lfo.stop();
        src.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        bpLow.disconnect();
        bpHigh.disconnect();
      });
    }

    master.gain.setTargetAtTime(this.targetGain(), ctx.currentTime, 0.06);

    this.graph = {
      preset,
      master,
      stopAll: () => {
        disposers.forEach((fn) => {
          try {
            fn();
          } catch {
            // Already stopped.
          }
        });
        try {
          master.disconnect();
        } catch {
          // Ignore disconnect errors.
        }
      },
    };
    return true;
  }

  pause(): void {
    if (!this.ctx || !this.graph) return;
    const now = this.ctx.currentTime;
    this.graph.master.gain.cancelScheduledValues(now);
    this.graph.master.gain.setTargetAtTime(0, now, 0.035);
  }

  stop(): void {
    this.teardownGraph();
  }

  dispose(): void {
    this.teardownGraph();
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      void c.close().catch(() => {});
    }
  }

  private teardownGraph(): void {
    if (!this.graph) return;
    const prev = this.graph;
    this.graph = null;
    prev.stopAll();
  }
}
