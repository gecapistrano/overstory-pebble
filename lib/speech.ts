/** Web Speech API helpers: continuous listening + one-sentence spoken replies. */
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

export function speechSupported() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Why listening stopped without words: shown to the user so a blocked mic never looks like a dead button. */
export type MicProblem = "blocked" | "no-mic" | "service" | "no-speech" | "unsupported";

function problemOf(code: string): MicProblem {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "NotAllowedError" || code === "SecurityError") return "blocked";
  if (code === "audio-capture" || code === "NotFoundError" || code === "NotReadableError") return "no-mic";
  if (code === "no-speech") return "no-speech";
  return "service"; // "network", "language-not-supported", ...: the browser's speech service isn't available
}

/** Can we listen at all? Live captions need SpeechRecognition; any-language transcription only needs a recorder. */
export function canListen() {
  if (typeof window === "undefined") return false;
  return speechSupported() || (typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
}

/**
 * One tap starts listening. Asks for the microphone first (so the browser shows its permission prompt), then:
 *  - records the voice, so Gemini can transcribe it in whatever language was spoken (onAudio), and
 *  - runs the browser's recognizer for live captions (it only knows one language, so its text is a fallback).
 * Finishes after ~2s of silence (heard by the recognizer or the level meter), or when stop() is called.
 * If nothing could be heard, onError says why instead of finishing empty.
 */
export function listen(opts: {
  lang?: string;
  onPartial: (text: string) => void;
  onDone: (text: string) => void;
  /** Recorded voice + the recognizer's best guess; when given, it is called instead of onDone. */
  onAudio?: (audio: Blob, liveText: string) => void;
  onError?: (p: MicProblem) => void;
  onLevel?: (v: number) => void;
  silenceMs?: number;
}) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const silenceMs = opts.silenceMs ?? 2200;
  let rec: Rec = null;
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let finalText = "";
  let interimText = "";
  let heardVoice = false; // the level meter heard someone speak
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  let stopMeter = () => {};
  const text = () => (finalText || interimText).trim();

  const end = (then: (audio: Blob | null) => void) => {
    done = true;
    if (timer) clearTimeout(timer);
    try { rec?.stop(); } catch {}
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        stopMeter();
        then(chunks.length ? new Blob(chunks, { type: recorder!.mimeType || "audio/webm" }) : null);
      };
      try { recorder.stop(); } catch { stopMeter(); then(null); }
    } else {
      stopMeter();
      then(null);
    }
  };
  const finish = () => {
    if (done) return;
    end((audio) => {
      if (audio && opts.onAudio && (heardVoice || text())) opts.onAudio(audio, text());
      else opts.onDone(text());
    });
  };
  const fail = (code: string) => {
    if (done) return;
    if (text() || (heardVoice && opts.onAudio && recorder)) return finish(); // we heard something: use it
    end(() => {
      if (opts.onError) opts.onError(problemOf(code));
      else opts.onDone("");
    });
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(finish, silenceMs);
  };

  const startRecognition = () => {
    if (done || !SR) return;
    rec = new SR();
    rec.lang = opts.lang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      interimText = interim;
      opts.onPartial((finalText + interim).trim());
      arm();
    };
    // with a recorder running, a recognizer problem (other language, no speech service) is not fatal
    rec.onerror = (e: any) => {
      if (e?.error === "aborted") return;
      if (recorder && !["not-allowed", "service-not-allowed", "audio-capture"].includes(e?.error)) return;
      fail(e?.error || "service");
    };
    rec.onend = () => {
      if (done || recorder) return; // the recorder + level meter decide when we're done
      if (text()) finish();
      else fail("no-speech");
    };
    try {
      rec.start();
    } catch (e: any) {
      if (!recorder) fail(e?.name || "service");
    }
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    if (!SR) fail("unsupported");
    else startRecognition();
    return { stop: () => (text() ? finish() : fail("no-speech")) };
  }

  // 1) ask for the mic, 2) record + meter (silence detection), 3) live captions
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    if (done) return stream.getTracks().forEach((t) => t.stop());
    if (typeof MediaRecorder !== "undefined") {
      try {
        const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t));
        recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.start(250);
      } catch {
        recorder = null;
      }
    }
    if (!recorder && !SR) return fail("unsupported");
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    let raf = 0;
    let quietSince = 0;
    const started = Date.now();
    const tick = () => {
      an.getByteFrequencyData(buf);
      const level = buf.reduce((a, b) => a + b, 0) / buf.length / 128;
      opts.onLevel?.(level);
      const now = Date.now();
      if (level > 0.18) {
        heardVoice = true;
        quietSince = 0;
      } else if (!quietSince) quietSince = now;
      if (recorder && !done) {
        if (heardVoice && quietSince && now - quietSince > silenceMs) finish();
        else if (!heardVoice && now - started > 8000) fail("no-speech");
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    stopMeter = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    };
    startRecognition();
  }).catch((e) => fail(e?.name || "NotAllowedError"));

  return { stop: () => (text() || heardVoice ? finish() : fail("no-speech")) };
}

/** Blob -> data: URL (for sending recorded audio to the AI route). */
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  u.lang = lang;
  const v = lang.startsWith("en")
    ? voices.find((x) => /Samantha|Google US English|Jenny|Aria|Ava/i.test(x.name)) || voices.find((x) => x.lang.startsWith("en"))
    : voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 1.03;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}
