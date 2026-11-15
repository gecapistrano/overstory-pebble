/** Web Speech API helpers: continuous listening + one-sentence spoken replies. */
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

export function speechSupported() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/**
 * One tap starts listening. Keeps listening while the user rambles (continuous +
 * interim results) and finishes after ~2s of silence, or when stop() is called.
 */
export function listen(opts: { lang?: string; onPartial: (text: string) => void; onDone: (text: string) => void; onLevel?: (v: number) => void; silenceMs?: number }) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec: Rec = new SR();
  rec.lang = opts.lang || "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try { rec.stop(); } catch {}
    stopMeter();
    opts.onDone(finalText.trim());
  };
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(finish, opts.silenceMs ?? 2200);
  };
  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    opts.onPartial((finalText + interim).trim());
    arm();
  };
  rec.onerror = () => finish();
  rec.onend = () => {
    if (!done) finish();
  };
  rec.start();

  // mic level meter for the waveform
  let stopMeter = () => {};
  if (opts.onLevel && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteFrequencyData(buf);
        opts.onLevel!(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
        raf = requestAnimationFrame(tick);
      };
      tick();
      stopMeter = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
      };
    }).catch(() => {});
  }
  return { stop: finish };
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
