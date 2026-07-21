import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// OVOZ TIZIMI — Dars01 (2D) dagi bilan AYNAN bir xil xatti-harakat:
// WebAudio effektlar + TTS (LMS HTTP yoki Web Speech) + yodlash sanog'i.
// 3D versiya uchun alohida modulga ajratildi.
// ============================================================

let ttsConfig = { ttsApiBase: '', voiceGender: 'f' };
export const configureLesson = (cfg) => { ttsConfig = { ...ttsConfig, ...cfg }; };

function buildTtsUrl(base, text, gender) {
  const enc = encodeURIComponent(String(text).slice(0, 1000));
  const g = gender === 'f' ? 'f' : 'm';
  return `${base}/api/tts?text=${enc}&g=${g}`;
}

// ---------- WebAudio effektlar ----------
let _actx = null;
const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _actx = _actx || new AC();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
};

const note = (ctx, t0, f, dur, vol = 0.16, type = 'sine') => {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  const t = ctx.currentTime + t0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
};

export function sfxDingDing() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    660, 0.22, 0.17);
    note(c, 0.13, 880, 0.30, 0.17);
  } catch (e) { /* no-op */ }
}
export function sfxChiling() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    1318, 0.18, 0.13, 'triangle');
    note(c, 0.09, 1760, 0.34, 0.13, 'triangle');
  } catch (e) { /* no-op */ }
}
export function sfxHmm() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    300, 0.22, 0.09);
    note(c, 0.14, 235, 0.30, 0.09);
  } catch (e) { /* no-op */ }
}
export function sfxFanfare() {
  try { const c = getCtx(); if (!c) return;
    const seq = [[0, 523], [0.16, 659], [0.32, 784], [0.5, 1047]];
    seq.forEach(([t, f]) => note(c, t, f, 0.3, 0.15, 'triangle'));
    note(c, 0.72, 1047, 0.7, 0.17, 'triangle');
    note(c, 0.72, 784,  0.7, 0.10, 'sine');
  } catch (e) { /* no-op */ }
}
export function sfxFestive() {
  try { const c = getCtx(); if (!c) return;
    const mel = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 1047, 880, 784, 659, 523, 659, 784, 880, 1047, 1047];
    mel.forEach((f, i) => note(c, 0.2 + i * 0.24, f, 0.26, 0.11, 'triangle'));
    const bass = [262, 196, 220, 262, 196, 220, 262, 262];
    bass.forEach((f, i) => note(c, 0.2 + i * 0.66, f, 0.5, 0.05, 'sine'));
  } catch (e) { /* no-op */ }
}

// ---------- TTS ----------
const pickVoice = (synth) => {
  const vs = synth.getVoices() || [];
  return (
    vs.find(v => /^uz/i.test(v.lang)) ||
    vs.find(v => /^tr/i.test(v.lang)) ||
    vs.find(v => /^ru/i.test(v.lang)) ||
    vs.find(v => /^en/i.test(v.lang)) ||
    vs[0] || null
  );
};

let _sayAudio = null;
export const sayNow = (text, opts = {}) => {
  const { onStart, onEnd } = opts;
  let ended = false;
  const finish = () => { if (!ended) { ended = true; if (onEnd) onEnd(); } };
  try {
    if (ttsConfig.ttsApiBase) {
      try { if (_sayAudio) _sayAudio.pause(); } catch (e) { /* no-op */ }
      _sayAudio = new Audio(buildTtsUrl(ttsConfig.ttsApiBase, text, ttsConfig.voiceGender));
      if (onStart) _sayAudio.onplaying = onStart;
      _sayAudio.onended = finish;
      _sayAudio.onerror = finish;
      const p = _sayAudio.play();
      if (p && p.catch) p.catch(finish);
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) { finish(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(synth);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'uz-UZ'; }
    u.rate = 0.95; u.pitch = 1.05;
    if (onStart) u.onstart = onStart;
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  } catch (e) { finish(); }
};

// Sahifa ochilganda avto gapiradi; delayMs=null — faqat birinchi teginishda.
export function useVoice(text, delayMs = 120) {
  const speakRef = useRef(null);
  const stopRef = useRef(null);
  const speakingRef = useRef(null);
  const endCbRef = useRef(null);
  const [startedUi, setStartedUi] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !text) return undefined;
    let cancelled = false;
    let audioEl = null;
    let started = false;
    let muted = false;
    let armed = false;
    setStartedUi(false);
    const markStarted = () => { started = true; setStartedUi(true); };
    const markEnded = () => { if (!cancelled && endCbRef.current) endCbRef.current(); };

    const speakWS = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      let spoken = false;
      const doSpeak = () => {
        if (cancelled || spoken) return;
        spoken = true;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(synth);
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'uz-UZ'; }
        u.rate = 0.95; u.pitch = 1.05;
        u.onstart = markStarted;
        u.onend = markEnded;
        u.onerror = markEnded;
        setTimeout(() => { try { synth.speak(u); } catch (e) { /* no-op */ } }, 60);
      };
      if ((synth.getVoices() || []).length === 0) {
        const once = () => { synth.removeEventListener('voiceschanged', once); doSpeak(); };
        synth.addEventListener('voiceschanged', once);
        setTimeout(doSpeak, 500);
      } else {
        doSpeak();
      }
    };

    const speak = () => {
      if (cancelled || muted) return;
      const base = ttsConfig.ttsApiBase;
      if (base) {
        try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
        audioEl = new Audio(buildTtsUrl(base, text, ttsConfig.voiceGender));
        audioEl.onplaying = markStarted;
        audioEl.onended = markEnded;
        audioEl.onerror = markEnded;
        const p = audioEl.play();
        if (p && p.catch) p.catch(() => { /* bloklandi — jestda qayta uriniladi */ });
        return;
      }
      speakWS();
    };
    speakRef.current = () => { muted = false; speak(); };
    stopRef.current = () => {
      muted = true;
      try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no-op */ }
      markEnded();
    };
    speakingRef.current = () => {
      if (audioEl) return !audioEl.paused && !audioEl.ended;
      try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; }
    };

    const resume = () => { if (armed && !started && !muted) speak(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    let timers = [];
    if (delayMs === null) {
      armed = true;
    } else {
      timers = [0, 1500, 4000].map((off) =>
        setTimeout(() => { armed = true; if (!started && !muted) speak(); }, delayMs + off)
      );
    }

    return () => {
      cancelled = true;
      speakRef.current = null;
      stopRef.current = null;
      speakingRef.current = null;
      timers.forEach(clearTimeout);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no-op */ }
    };
  }, [text, delayMs]);

  const replay = useCallback(() => { if (speakRef.current) speakRef.current(); }, []);
  const stop = useCallback(() => { if (stopRef.current) stopRef.current(); }, []);
  const isSpeaking = useCallback(() => (speakingRef.current ? speakingRef.current() : false), []);
  const onEnded = useCallback((cb) => { endCbRef.current = cb; }, []);
  return { replay, stop, isSpeaking, onEnded, started: startedUi };
}

// ---------- Yodlash sanog'i (ovoz boshqaradi) ----------
const COUNT_WORDS = ['uch', 'ikki', 'bir'];
const T_COUNT_INTRO_MIN = 2500;
const T_COUNT_INTRO_MAX = 7000;
const T_COUNT_GAP = 350;
const T_COUNT_STEP_MIN = 900;
const T_COUNT_STEP_MAX = 2200;
const T_COUNT_FALLBACK = 300;

export function useMemorizeCountdown({ voice, question, onTick, onDone }) {
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const t0 = Date.now();

    const finish = () => {
      if (cancelled) return;
      let opened = false;
      const open = () => { if (!opened && !cancelled) { opened = true; onDone(); } };
      sayNow(question, { onStart: open });
      later(open, T_COUNT_FALLBACK);
    };

    const step = (i) => {
      if (cancelled) return;
      if (i >= COUNT_WORDS.length) { finish(); return; }
      const ts = Date.now();
      let ticked = false;
      let advanced = false;
      const tick = () => { if (!ticked && !cancelled) { ticked = true; onTick(COUNT_WORDS.length - i); } };
      const advance = () => {
        if (advanced || cancelled) return;
        advanced = true;
        const left = T_COUNT_STEP_MIN - (Date.now() - ts);
        later(() => step(i + 1), Math.max(0, left));
      };
      sayNow(`${COUNT_WORDS[i]}!`, { onStart: tick, onEnd: advance });
      later(tick, T_COUNT_FALLBACK);
      later(advance, T_COUNT_STEP_MAX);
    };

    let begun = false;
    const begin = () => {
      if (begun || cancelled) return;
      begun = true;
      voice.stop();
      step(0);
    };
    voice.onEnded(() => {
      const wait = Math.max(T_COUNT_GAP, T_COUNT_INTRO_MIN - (Date.now() - t0));
      later(begin, wait);
    });
    later(begin, T_COUNT_INTRO_MAX);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      voice.onEnded(null);
    };
  }, []);
}
