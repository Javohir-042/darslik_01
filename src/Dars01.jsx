import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// ░░ BLOK 1 — DIQQAT · Dars01 — "Farqini top" (att-1-01-v1)
// 12 juft rasm + "nima o'zgardi?" — o'qishni talab qilmaydigan diqqat mashqi.
// Maskot: Diqqat tulkichasi (lupa bilan). Sahifalar: Muqova + 12 raund + Sertifikat.
//
// UMUMIY MEXANIKA (spetsifikatsiya bo'yicha):
//  TO'G'RI:  yashil ramka → konfetti → yulduzcha (pop) → "ding-ding!" →
//            yulduzcha hisoblagichga uchadi → +1 (sakraydi) + "chiling!" →
//            qisqa pauza → avtomatik keyingi sahifa.
//  NOTO'G'RI: yulduz YO'Q, karta yumshoq chapga-o'ngga silkinadi, past "hmm",
//            qizil rang/X ISHLATILMAYDI, variantlar joyida, cheksiz urinish.
//  OVOZ:     har sahifada FAQAT bitta avto-ovozli xabar (savol/ko'rsatma).
// ============================================================================

// ============================================================
// PALITRA — bolalarbop, yumshoq sariq-ko'k: fon #FFE9A8→#CDEFFF gradient,
// matn #3D3A50, muvaffaqiyat #2FA45C, oltin #FFC23C (STYLES ichida).
// ============================================================


// ============================================================
// KONFIG (LMS props) — Dars05 etaloni bilan bir xil naqsh
// ============================================================
let ttsConfig = { ttsApiBase: '', voiceGender: 'f' };
const configureLesson = (cfg) => { ttsConfig = { ...ttsConfig, ...cfg }; };

function buildTtsUrl(base, text, gender) {
  const enc = encodeURIComponent(String(text).slice(0, 1000));
  const g = gender === 'f' ? 'f' : 'm';
  return `${base}/api/tts?text=${enc}&g=${g}`;
}

// ============================================================
// TOVUSH DVIJOKI (WebAudio) — tovush jadvali bo'yicha:
//  ding-ding (to'g'ri) · chiling (hisoblagich) · hmm (xato) ·
//  fanfar (bosqich yakuni) · bayram musiqasi (sertifikat, ~5-6 s)
// ============================================================
let _actx = null;
const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _actx = _actx || new AC();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
};

// bitta nota: t0 (s, hozirdan), f (Hz), dur (s), vol, type
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

// Yorqin "ding-ding!" — to'g'ri javob
function sfxDingDing() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    660, 0.22, 0.17);
    note(c, 0.13, 880, 0.30, 0.17);
  } catch (e) { /* no-op */ }
}
// "Chiling!" qo'ng'iroqcha — yulduz hisoblagichga yetganda
function sfxChiling() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    1318, 0.18, 0.13, 'triangle');
    note(c, 0.09, 1760, 0.34, 0.13, 'triangle');
  } catch (e) { /* no-op */ }
}
// Past, mayin "hmm" — noto'g'ri javob (qo'pol emas)
function sfxHmm() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    300, 0.22, 0.09);
    note(c, 0.14, 235, 0.30, 0.09);
  } catch (e) { /* no-op */ }
}
// Uzunroq quvnoq fanfar — bosqich (12-raund) yakunida
function sfxFanfare() {
  try { const c = getCtx(); if (!c) return;
    const seq = [[0, 523], [0.16, 659], [0.32, 784], [0.5, 1047]];
    seq.forEach(([t, f]) => note(c, t, f, 0.3, 0.15, 'triangle'));
    note(c, 0.72, 1047, 0.7, 0.17, 'triangle');
    note(c, 0.72, 784,  0.7, 0.10, 'sine');
  } catch (e) { /* no-op */ }
}
// Bayramona musiqa (~5-6 soniya) — sertifikat sahifasi
function sfxFestive() {
  try { const c = getCtx(); if (!c) return;
    const mel = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 1047, 880, 784, 659, 523, 659, 784, 880, 1047, 1047];
    mel.forEach((f, i) => note(c, 0.2 + i * 0.24, f, 0.26, 0.11, 'triangle'));
    // yengil bas qatlami
    const bass = [262, 196, 220, 262, 196, 220, 262, 262];
    bass.forEach((f, i) => note(c, 0.2 + i * 0.66, f, 0.5, 0.05, 'sine'));
  } catch (e) { /* no-op */ }
}

// ============================================================
// OVOZLI XABAR — har sahifada FAQAT bitta, sahifa ochilganda avto.
// LMS bergan HTTP TTS bo'lsa — <audio>; bo'lmasa preview: Web Speech (uz-UZ).
// Avtoplay bloklansa — birinchi pointerdown/keydown'da qayta uriniladi.
// ============================================================
// Mavjud ovozlar ichidan eng mosini tanlaydi: uz -> tr (lotinni yaxshi o'qiydi) ->
// ru -> en -> birinchisi. Ovoz topilmasa null (ba'zi Linux brauzerlarida ro'yxat bo'sh).
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

// Sahifa ochilganda avto gapiradi (delayMs — necha ms dan keyin boshlashi;
// delayMs = null bo'lsa AVTO YO'Q — faqat birinchi teginishda gapiradi).
// Qaytaradi: { replay, stop, started } — replay: boshidan aytish; stop: o'chirish.
function useVoice(text, delayMs = 120) {
  const speakRef = useRef(null);
  const stopRef = useRef(null);
  const speakingRef = useRef(null);
  const [startedUi, setStartedUi] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !text) return undefined;
    let cancelled = false;
    let audioEl = null;
    let started = false;   // ovoz haqiqatan yangradimi (autoplay blokini aniqlash uchun)
    let muted = false;     // foydalanuvchi o'chirdi — avto-urinishlar ham to'xtaydi
    let armed = false;     // belgilangan vaqt (delayMs) yetib keldimi — undan oldin gapirmaymiz
    setStartedUi(false);
    const markStarted = () => { started = true; setStartedUi(true); };

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
        setTimeout(() => { try { synth.speak(u); } catch (e) { /* no-op */ } }, 60);
      };
      // Ovozlar ro'yxati ba'zi brauzerlarda kech (async) yuklanadi — kutamiz.
      if ((synth.getVoices() || []).length === 0) {
        const once = () => { synth.removeEventListener('voiceschanged', once); doSpeak(); };
        synth.addEventListener('voiceschanged', once);
        setTimeout(doSpeak, 500);   // voiceschanged kelmasa ham urinib ko'ramiz
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
        const p = audioEl.play();
        if (p && p.catch) p.catch(() => { /* bloklandi — jestda qayta uriniladi */ });
        return;
      }
      speakWS();
    };
    // replay — o'chirilgan bo'lsa ham qayta yoqib, BOSHIDAN aytadi
    speakRef.current = () => { muted = false; speak(); };
    // stop — ovozni darhol to'xtatadi va avto-urinishlarni o'chiradi
    stopRef.current = () => {
      muted = true;
      try { if (audioEl) audioEl.pause(); } catch (e) { /* no-op */ }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* no-op */ }
    };
    // hozir gapiryaptimi (HTTP audio yoki Web Speech)
    speakingRef.current = () => {
      if (audioEl) return !audioEl.paused && !audioEl.ended;
      try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; }
    };

    // Jest (teginish) — armed bo'lsa va ovoz hali boshlanmagan bo'lsa gapiradi.
    const resume = () => { if (armed && !started && !muted) speak(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    // delayMs = null -> avto-start YO'Q, faqat teginish kutiladi (armed darhol true).
    // Aks holda delayMs da birinchi urinish; ovozlar kech yuklansa yoki brauzer
    // bloklasa — +1.5s va +4s da yana takrorlaymiz.
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

  // "Qayta eshitish" — foydalanuvchi jesti ichida chaqiriladi (autoplay blokidan xoli)
  const replay = useCallback(() => { if (speakRef.current) speakRef.current(); }, []);
  const stop = useCallback(() => { if (stopRef.current) stopRef.current(); }, []);
  const isSpeaking = useCallback(() => (speakingRef.current ? speakingRef.current() : false), []);
  return { replay, stop, isSpeaking, started: startedUi };
}

// Dumaloq karnaycha tugmasi (ikki holatli): yoniq — bosilsa o'chadi;
// o'chiq (chizilgan karnay, kulrang) — bosilsa boshidan aytib beradi.
const VoiceButton = ({ muted, onClick, corner = 'tr' }) => (
  <button
    type="button"
    className={`d1-voice-btn ${corner !== 'tr' ? corner : ''} ${muted ? 'off' : ''}`}
    onClick={onClick}
    onPointerDown={(e) => e.stopPropagation()}
    aria-label={muted ? "Ovozni yoqish (boshidan aytadi)" : "Ovozni o'chirish"}
    title={muted ? 'Yoqish' : "O'chirish"}
  >
    {muted ? (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    ) : (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    )}
  </button>
);

// O'yin sahifalari karnaychasi: gapirayotganda bosilsa TO'XTAYDI (kulrang),
// yana bosilsa BOSHIDAN aytib beradi. voice = useVoice(...) qiymati.
const PageVoice = ({ voice, corner = 'bl' }) => {
  const [muted, setMuted] = useState(false);
  const onClick = () => {
    if (voice.isSpeaking()) { voice.stop(); setMuted(true); }
    else { voice.replay(); setMuted(false); }
  };
  return <VoiceButton corner={corner} muted={muted} onClick={onClick}/>;
};

// ============================================================
// MASKOT — Diqqat tulkichasi (do'mboqcha, lupa bilan, katta quvnoq ko'zlar).
// Uslub: flat vector, yumaloq burchaklar (Duolingo/LogicLike ruhida).
// mood: smile | cheer
// ============================================================
const FoxSVG = ({ mood = 'smile', className = '' }) => (
  <svg viewBox="0 0 200 210" className={className} aria-hidden="true">
    {/* dum */}
    <path d="M158 158 q34 -6 30 -40 q22 34 -10 56 q-16 10 -28 2 Z" fill="#FF8A50"/>
    <path d="M183 132 q14 20 -8 36 q-8 5 -14 2 q20 -14 16 -34 Z" fill="#FFFFFF" opacity="0.9"/>
    {/* tana */}
    <ellipse cx="100" cy="162" rx="52" ry="42" fill="#FF8A50"/>
    <ellipse cx="100" cy="172" rx="30" ry="26" fill="#FFF4E8"/>
    {/* oyoqchalar */}
    <ellipse cx="72" cy="198" rx="14" ry="9" fill="#E8703A"/>
    <ellipse cx="128" cy="198" rx="14" ry="9" fill="#E8703A"/>
    {/* quloqlar */}
    <path d="M48 44 L62 8 L84 38 Z" fill="#FF8A50"/>
    <path d="M56 38 L63 20 L74 35 Z" fill="#5C4033"/>
    <path d="M152 44 L138 8 L116 38 Z" fill="#FF8A50"/>
    <path d="M144 38 L137 20 L126 35 Z" fill="#5C4033"/>
    {/* bosh */}
    <circle cx="100" cy="78" r="54" fill="#FF8A50"/>
    {/* yonoq-tumshuq oq qismi */}
    <path d="M100 132 q-44 0 -46 -36 q14 14 30 10 q10 16 16 16 q6 0 16 -16 q16 4 30 -10 q-2 36 -46 36 Z" fill="#FFF4E8"/>
    {/* ko'zlar — katta, quvnoq */}
    {mood === 'cheer' ? (
      <g stroke="#3D3A50" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M68 74 q10 -12 20 0"/>
        <path d="M112 74 q10 -12 20 0"/>
      </g>
    ) : (
      <g>
        <circle cx="78" cy="74" r="12" fill="#3D3A50"/>
        <circle cx="82" cy="70" r="4.4" fill="#FFFFFF"/>
        <circle cx="122" cy="74" r="12" fill="#3D3A50"/>
        <circle cx="126" cy="70" r="4.4" fill="#FFFFFF"/>
      </g>
    )}
    {/* burun + tabassum */}
    <ellipse cx="100" cy="96" rx="7" ry="5.5" fill="#5C4033"/>
    <path d="M86 106 q14 12 28 0" stroke="#5C4033" strokeWidth="4" fill="none" strokeLinecap="round"/>
    {/* yonoq qizillik */}
    <circle cx="60" cy="92" r="8" fill="#FFB48A" opacity="0.85"/>
    <circle cx="140" cy="92" r="8" fill="#FFB48A" opacity="0.85"/>
    {/* LUPA — qo'lida */}
    <g transform="rotate(18 158 120)">
      <circle cx="158" cy="108" r="22" fill="#CDEFFF" stroke="#7A5230" strokeWidth="6"/>
      <circle cx="151" cy="101" r="7" fill="#FFFFFF" opacity="0.75"/>
      <rect x="152" y="128" width="12" height="34" rx="6" fill="#7A5230"/>
    </g>
    <ellipse cx="150" cy="140" rx="11" ry="9" fill="#FF8A50"/>
  </svg>
);

// ============================================================
// OB'EKTLAR KUTUBXONASI — flat-vector belgichalar (viewBox 0 0 60 60).
// Har biri asosiy rangni `c` prop orqali oladi — "rang o'zgardi" raundlari
// shu parametr bilan ishlaydi.
// ============================================================
const IC = {
  sun: (c) => (
    <g>
      <g stroke={c} strokeWidth="4" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="30" y1="6" x2="30" y2="13" transform={`rotate(${a} 30 30)`}/>
        ))}
      </g>
      <circle cx="30" cy="30" r="13" fill={c}/>
      <circle cx="25" cy="26" r="3" fill="#FFFFFF" opacity="0.55"/>
    </g>
  ),
  cloud: (c) => (
    <g fill={c}>
      <ellipse cx="30" cy="36" rx="20" ry="10"/>
      <circle cx="22" cy="28" r="9"/>
      <circle cx="36" cy="26" r="11"/>
    </g>
  ),
  tree: (c) => (
    <g>
      <rect x="26" y="36" width="8" height="18" rx="3" fill="#8B5E3C"/>
      <circle cx="30" cy="24" r="15" fill={c}/>
      <circle cx="19" cy="32" r="9" fill={c}/>
      <circle cx="41" cy="32" r="9" fill={c}/>
      <circle cx="24" cy="20" r="3" fill="#FFFFFF" opacity="0.35"/>
    </g>
  ),
  flower: (c) => (
    <g>
      <path d="M30 34 L30 54" stroke="#3CBF6E" strokeWidth="4" strokeLinecap="round"/>
      <path d="M30 46 q-9 -2 -11 -9 q9 0 11 9 Z" fill="#3CBF6E"/>
      <g fill={c}>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="30" cy="14" rx="6.4" ry="9.5" transform={`rotate(${a} 30 24)`}/>
        ))}
      </g>
      <circle cx="30" cy="24" r="6.5" fill="#FFD34D"/>
    </g>
  ),
  ball: (c) => (
    <g>
      <circle cx="30" cy="30" r="17" fill={c}/>
      <path d="M13.5 26 q16 10 33 0" stroke="#FFFFFF" strokeWidth="4" fill="none"/>
      <circle cx="23" cy="22" r="4" fill="#FFFFFF" opacity="0.6"/>
    </g>
  ),
  house: (c) => (
    <g>
      <rect x="14" y="26" width="32" height="26" rx="3" fill="#FFF3E0"/>
      <path d="M10 28 L30 8 L50 28 Z" fill={c}/>
      <rect x="20" y="33" width="9" height="9" rx="2" fill="#5AC8FA"/>
      <rect x="33" y="36" width="9" height="16" rx="2" fill="#8B5E3C"/>
    </g>
  ),
  car: (c) => (
    <g>
      <path d="M8 38 q0 -8 8 -8 l4 -8 q2 -3 6 -3 h10 q4 0 6 3 l4 8 q8 0 8 8 v5 q0 3 -3 3 h-40 q-3 0 -3 -3 Z" fill={c}/>
      <rect x="22" y="23" width="9" height="7" rx="2" fill="#CDEFFF"/>
      <rect x="33" y="23" width="8" height="7" rx="2" fill="#CDEFFF"/>
      <circle cx="19" cy="46" r="5.5" fill="#3D3A50"/>
      <circle cx="19" cy="46" r="2.4" fill="#CFCFDA"/>
      <circle cx="42" cy="46" r="5.5" fill="#3D3A50"/>
      <circle cx="42" cy="46" r="2.4" fill="#CFCFDA"/>
    </g>
  ),
  bird: (c) => (
    <g>
      <ellipse cx="28" cy="32" rx="14" ry="11" fill={c}/>
      <circle cx="40" cy="24" r="8" fill={c}/>
      <path d="M47 23 L55 26 L47 29 Z" fill="#F5A623"/>
      <circle cx="42" cy="22" r="2" fill="#3D3A50"/>
      <path d="M20 30 q6 -7 13 -2 q-6 8 -13 2 Z" fill="#FFFFFF" opacity="0.45"/>
      <path d="M22 43 l-3 6 M28 44 l0 6" stroke="#F5A623" strokeWidth="2.4" strokeLinecap="round"/>
    </g>
  ),
  kite: (c) => (
    <g>
      <path d="M30 4 L44 22 L30 40 L16 22 Z" fill={c}/>
      <path d="M30 4 L30 40 M16 22 L44 22" stroke="#FFFFFF" strokeWidth="2" opacity="0.6"/>
      <path d="M30 40 q-4 8 2 12 q-6 4 -2 8" stroke="#8B5E3C" strokeWidth="2" fill="none"/>
      <circle cx="31" cy="50" r="2.6" fill="#FFD34D"/>
      <circle cx="29" cy="58" r="2.6" fill="#FF8AB0"/>
    </g>
  ),
  fish: (c) => (
    <g>
      <path d="M40 30 L54 19 L54 41 Z" fill={c}/>
      <ellipse cx="27" cy="30" rx="17" ry="12.5" fill={c}/>
      <circle cx="18" cy="27" r="2.7" fill="#3D3A50"/>
      <path d="M27 22 q7 -3 12 2" stroke="#FFFFFF" strokeWidth="2.4" fill="none" opacity="0.6"/>
    </g>
  ),
  crab: (c) => (
    <g>
      <circle cx="14" cy="18" r="6" fill={c}/>
      <circle cx="46" cy="18" r="6" fill={c}/>
      <path d="M17 22 q5 6 8 4 M43 22 q-5 6 -8 4" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round"/>
      <ellipse cx="30" cy="36" rx="16" ry="12" fill={c}/>
      <circle cx="24" cy="32" r="2.6" fill="#3D3A50"/>
      <circle cx="36" cy="32" r="2.6" fill="#3D3A50"/>
      <path d="M25 41 q5 4 10 0" stroke="#3D3A50" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M16 44 l-5 5 M22 47 l-3 6 M44 44 l5 5 M38 47 l3 6" stroke={c} strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),
  seaweed: (c) => (
    <g stroke={c} strokeWidth="5" fill="none" strokeLinecap="round">
      <path d="M22 56 q-6 -10 2 -18 q7 -8 1 -18"/>
      <path d="M38 56 q7 -9 -1 -17 q-7 -8 0 -17"/>
    </g>
  ),
  mushroom: (c) => (
    <g>
      <rect x="24" y="30" width="12" height="22" rx="5" fill="#F4EBDD"/>
      <path d="M8 32 q0 -22 22 -22 q22 0 22 22 Z" fill={c}/>
      <circle cx="20" cy="22" r="3.4" fill="#FFFFFF"/>
      <circle cx="33" cy="16" r="2.8" fill="#FFFFFF"/>
      <circle cx="42" cy="25" r="3" fill="#FFFFFF"/>
    </g>
  ),
  rabbit: (c) => (
    <g>
      <ellipse cx="22" cy="14" rx="5.5" ry="12" fill={c}/>
      <ellipse cx="22" cy="15" rx="2.6" ry="8" fill="#FFC9D6"/>
      <ellipse cx="38" cy="14" rx="5.5" ry="12" fill={c}/>
      <ellipse cx="38" cy="15" rx="2.6" ry="8" fill="#FFC9D6"/>
      <circle cx="30" cy="36" r="17" fill={c}/>
      <circle cx="24" cy="33" r="2.8" fill="#3D3A50"/>
      <circle cx="36" cy="33" r="2.8" fill="#3D3A50"/>
      <ellipse cx="30" cy="40" rx="3" ry="2.4" fill="#FF9AAE"/>
      <path d="M30 42 q-4 4 -7 2 M30 42 q4 4 7 2" stroke="#3D3A50" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </g>
  ),
  butterfly: (c) => (
    <g>
      <ellipse cx="18" cy="22" rx="11" ry="13" fill={c}/>
      <ellipse cx="42" cy="22" rx="11" ry="13" fill={c}/>
      <ellipse cx="20" cy="42" rx="8" ry="9" fill={c} opacity="0.8"/>
      <ellipse cx="40" cy="42" rx="8" ry="9" fill={c} opacity="0.8"/>
      <circle cx="18" cy="21" r="3.4" fill="#FFFFFF" opacity="0.6"/>
      <circle cx="42" cy="21" r="3.4" fill="#FFFFFF" opacity="0.6"/>
      <rect x="27.5" y="14" width="5" height="34" rx="2.5" fill="#3D3A50"/>
      <path d="M30 14 q-5 -8 -9 -9 M30 14 q5 -8 9 -9" stroke="#3D3A50" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  ),
  lamp: (c) => (
    <g>
      <path d="M16 26 L44 26 L36 8 L24 8 Z" fill={c}/>
      <circle cx="30" cy="30" r="5" fill="#FFF7D6"/>
      <rect x="27.5" y="32" width="5" height="18" rx="2.5" fill="#8B8FA3"/>
      <rect x="18" y="50" width="24" height="6" rx="3" fill="#8B8FA3"/>
    </g>
  ),
  cat: (c) => (
    <g>
      <path d="M44 40 q12 -2 10 -14 q8 12 -2 20 q-5 4 -9 1 Z" fill={c}/>
      <ellipse cx="30" cy="44" rx="17" ry="12" fill={c}/>
      <circle cx="28" cy="22" r="13" fill={c}/>
      <path d="M17 15 L20 4 L27 12 Z" fill={c}/>
      <path d="M39 15 L36 4 L29 12 Z" fill={c}/>
      <circle cx="23" cy="20" r="2.6" fill="#3D3A50"/>
      <circle cx="33" cy="20" r="2.6" fill="#3D3A50"/>
      <ellipse cx="28" cy="26" rx="2.6" ry="2" fill="#FF9AAE"/>
      <path d="M14 24 l-8 -2 M14 28 l-8 2 M42 24 l8 -2 M42 28 l8 2" stroke="#3D3A50" strokeWidth="1.6" strokeLinecap="round"/>
    </g>
  ),
  book: (c) => (
    <g>
      <rect x="12" y="10" width="36" height="42" rx="4" fill={c}/>
      <rect x="18" y="10" width="3" height="42" fill="#FFFFFF" opacity="0.5"/>
      <path d="M26 22 h14 M26 30 h14 M26 38 h9" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),
  cake: (c) => (
    <g>
      <rect x="12" y="32" width="36" height="18" rx="5" fill={c}/>
      <path d="M12 38 q4 5 9 0 q4 5 9 0 q4 5 9 0 q4 5 9 0 L48 32 L12 32 Z" fill="#FFF3E0"/>
      <rect x="27.5" y="16" width="5" height="12" rx="2.5" fill="#5AC8FA"/>
      <ellipse cx="30" cy="13" rx="3.4" ry="4.4" fill="#FFB03A"/>
      <circle cx="20" cy="44" r="2.2" fill="#FFFFFF"/>
      <circle cx="30" cy="45" r="2.2" fill="#FFFFFF"/>
      <circle cx="40" cy="44" r="2.2" fill="#FFFFFF"/>
    </g>
  ),
  icecream: (c) => (
    <g>
      <path d="M18 26 L30 56 L42 26 Z" fill="#D9A35A"/>
      <path d="M21 30 l18 0 M24 37 l12 0 M27 44 l6 0" stroke="#B9803C" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="30" cy="18" r="13" fill={c}/>
      <circle cx="25" cy="14" r="3.4" fill="#FFFFFF" opacity="0.6"/>
    </g>
  ),
  candy: (c) => (
    <g>
      <path d="M14 30 L4 22 L6 34 L4 40 Z" fill={c}/>
      <path d="M46 30 L56 22 L54 34 L56 40 Z" fill={c}/>
      <circle cx="30" cy="30" r="13" fill={c}/>
      <path d="M22 21 q8 9 0 18 M30 18 q8 12 0 24 M38 21 q-2 9 0 18" stroke="#FFFFFF" strokeWidth="2.4" fill="none" opacity="0.65"/>
    </g>
  ),
  cookie: (c) => (
    <g>
      <circle cx="30" cy="30" r="18" fill={c}/>
      <circle cx="23" cy="24" r="2.8" fill="#6B4A2B"/>
      <circle cx="36" cy="22" r="2.4" fill="#6B4A2B"/>
      <circle cx="38" cy="35" r="2.8" fill="#6B4A2B"/>
      <circle cx="25" cy="38" r="2.4" fill="#6B4A2B"/>
      <circle cx="31" cy="30" r="2" fill="#6B4A2B"/>
    </g>
  ),
  bear: (c) => (
    <g>
      <circle cx="16" cy="16" r="8" fill={c}/>
      <circle cx="44" cy="16" r="8" fill={c}/>
      <circle cx="16" cy="16" r="4" fill="#F2E3CE"/>
      <circle cx="44" cy="16" r="4" fill="#F2E3CE"/>
      <circle cx="30" cy="32" r="20" fill={c}/>
      <ellipse cx="30" cy="40" rx="10" ry="8" fill="#F2E3CE"/>
      <circle cx="23" cy="28" r="2.8" fill="#3D3A50"/>
      <circle cx="37" cy="28" r="2.8" fill="#3D3A50"/>
      <ellipse cx="30" cy="37" rx="3.4" ry="2.6" fill="#5C4033"/>
      <path d="M30 39 q0 4 4 4" stroke="#5C4033" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  ),
  // kulib turgan tulkicha — 10-sahifa "rang o'zgardi" o'yini uchun
  fox: (c) => (
    <g>
      <path d="M11 5 L26 14 L13 25 Z" fill={c}/>
      <path d="M49 5 L34 14 L47 25 Z" fill={c}/>
      <path d="M15 9 L24 14 L16 20 Z" fill="#FFE3D0"/>
      <path d="M45 9 L36 14 L44 20 Z" fill="#FFE3D0"/>
      <circle cx="30" cy="32" r="19" fill={c}/>
      <path d="M30 51 q-13 -1 -16 -11 q7 6 16 6 q9 0 16 -6 q-3 10 -16 11 Z" fill="#FFF4EA"/>
      <circle cx="23" cy="28" r="2.8" fill="#3D3A50"/>
      <circle cx="37" cy="28" r="2.8" fill="#3D3A50"/>
      <ellipse cx="30" cy="39" rx="3.2" ry="2.6" fill="#3D3A50"/>
      <path d="M30 41 q-4 4 -8 2 M30 41 q4 4 8 2" stroke="#3D3A50" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </g>
  ),
  cube: (c) => (
    <g>
      <rect x="12" y="16" width="36" height="36" rx="5" fill={c}/>
      <path d="M12 21 q0 -5 5 -5 h26 q5 0 5 5 l-6 -9 h-24 Z" fill="#FFFFFF" opacity="0.3"/>
      <path d="M30 24 L33 31 L40 31.6 L35 36.4 L36.6 43.4 L30 39.6 L23.4 43.4 L25 36.4 L20 31.6 L27 31 Z" fill="#FFFFFF"/>
    </g>
  ),
  // qo'g'irchoq: sochli bosh + uchburchak ko'ylak (17-sahifa xonasi uchun)
  doll: (c) => (
    <g>
      <path d="M22 36 q-7 5 -9 11 M38 36 q7 5 9 11" stroke="#F5C9A6" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
      <path d="M25 50 l0 6 M35 50 l0 6" stroke="#F5C9A6" strokeWidth="4.5" strokeLinecap="round"/>
      <path d="M18 52 L30 26 L42 52 Z" fill={c}/>
      <circle cx="30" cy="16" r="10" fill="#FFDDC2"/>
      <path d="M19 14 Q21 4 30 4 Q39 4 41 14 Q36 9 30 9 Q24 9 19 14 Z" fill="#8A5A28"/>
      <circle cx="26" cy="16" r="1.9" fill="#3D3A50"/>
      <circle cx="34" cy="16" r="1.9" fill="#3D3A50"/>
      <path d="M27 20.5 q3 2.4 6 0" stroke="#3D3A50" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </g>
  ),
  balloon: (c) => (
    <g>
      <path d="M30 42 q-2 8 2 14" stroke="#8B8FA3" strokeWidth="2" fill="none"/>
      <ellipse cx="30" cy="24" rx="15" ry="18" fill={c}/>
      <path d="M26 40 L34 40 L30 46 Z" fill={c}/>
      <ellipse cx="24" cy="17" rx="4" ry="6" fill="#FFFFFF" opacity="0.5"/>
    </g>
  ),
  gift: (c) => (
    <g>
      <rect x="12" y="24" width="36" height="28" rx="4" fill={c}/>
      <rect x="26.5" y="24" width="7" height="28" fill="#FFD34D"/>
      <rect x="10" y="18" width="40" height="9" rx="3" fill={c}/>
      <rect x="26.5" y="18" width="7" height="9" fill="#FFD34D"/>
      <path d="M30 18 q-10 -12 -14 -4 q-2 6 14 4 Z" fill="#FFD34D"/>
      <path d="M30 18 q10 -12 14 -4 q2 6 -14 4 Z" fill="#FFD34D"/>
    </g>
  ),
  rocket: (c) => (
    <g>
      <path d="M30 4 q12 10 12 28 l0 8 L18 40 l0 -8 q0 -18 12 -28 Z" fill="#ECEFF4"/>
      <circle cx="30" cy="24" r="6.5" fill="#5AC8FA" stroke="#B9C2CE" strokeWidth="2"/>
      <path d="M18 34 L8 46 L18 44 Z" fill={c}/>
      <path d="M42 34 L52 46 L42 44 Z" fill={c}/>
      <path d="M25 42 L35 42 L30 56 Z" fill="#FFA53C"/>
    </g>
  ),
  planet: (c) => (
    <g>
      <circle cx="30" cy="30" r="14" fill="#F5A623"/>
      <circle cx="25" cy="26" r="4" fill="#FFD34D"/>
      <circle cx="35" cy="34" r="3" fill="#E08A10"/>
      <ellipse cx="30" cy="32" rx="24" ry="7" fill="none" stroke={c} strokeWidth="4"/>
    </g>
  ),
  moon: (c) => (
    <g>
      <path d="M38 6 a24 24 0 1 0 16 40 a19 19 0 0 1 -16 -40 Z" fill={c}/>
      <circle cx="30" cy="22" r="3" fill="#FFFFFF" opacity="0.4"/>
      <circle cx="24" cy="34" r="4" fill="#FFFFFF" opacity="0.3"/>
    </g>
  ),
  star5: (c) => (
    <g>
      <path d="M30 4 L37.3 21.6 L56 23.2 L41.8 35.8 L46.2 54 L30 44.2 L13.8 54 L18.2 35.8 L4 23.2 L22.7 21.6 Z" fill={c} stroke="#E0992A" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M30 13 L33.6 22.6 L30 29.5 L26.4 22.6 Z" fill="#FFFFFF" opacity="0.4"/>
    </g>
  ),
  boat: (c) => (
    <g>
      <path d="M30 6 L30 34" stroke="#8B5E3C" strokeWidth="3"/>
      <path d="M32 8 L50 30 L32 30 Z" fill={c}/>
      <path d="M28 14 L14 30 L28 30 Z" fill={c} opacity="0.75"/>
      <path d="M8 36 L52 36 L44 50 L16 50 Z" fill="#8B5E3C"/>
      <path d="M8 36 L52 36 L50 40 L10 40 Z" fill="#A5714A"/>
    </g>
  ),
  snowman: (c) => (
    <g>
      <circle cx="30" cy="42" r="14" fill="#FFFFFF" stroke="#D6E4F0" strokeWidth="2"/>
      <circle cx="30" cy="21" r="10" fill="#FFFFFF" stroke="#D6E4F0" strokeWidth="2"/>
      <rect x="20" y="6" width="20" height="6" rx="2" fill={c}/>
      <rect x="24" y="0" width="12" height="9" rx="2" fill={c}/>
      <circle cx="26.5" cy="19" r="2" fill="#3D3A50"/>
      <circle cx="33.5" cy="19" r="2" fill="#3D3A50"/>
      <path d="M30 22 L38 24 L30 26 Z" fill="#FF8A3C"/>
      <circle cx="30" cy="38" r="2" fill="#3D3A50"/>
      <circle cx="30" cy="45" r="2" fill="#3D3A50"/>
    </g>
  ),
  snowtree: (c) => (
    <g>
      <rect x="26" y="46" width="8" height="10" rx="2" fill="#8B5E3C"/>
      <path d="M30 4 L44 24 L36 24 L48 40 L40 40 L50 48 L10 48 L20 40 L12 40 L24 24 L16 24 Z" fill={c}/>
      <path d="M30 4 L38 15 L22 15 Z" fill="#FFFFFF" opacity="0.8"/>
      <circle cx="24" cy="32" r="2.4" fill="#FFFFFF"/>
      <circle cx="38" cy="42" r="2.4" fill="#FFFFFF"/>
    </g>
  ),
};

const ObjIcon = ({ kind, c }) => (
  <svg viewBox="0 0 60 60" width="100%" height="100%" aria-hidden="true">
    {(IC[kind] || IC.star5)(c)}
  </svg>
);
// ============================================================
// KONFETTI — to'g'ri javob nuqtasida kichik portlash (12 bo'lakcha)
// ============================================================
const BURST = [
  { a: 10,  d: 46, cl: '#FF5A8A' }, { a: 40,  d: 60, cl: '#FFD34D' },
  { a: 75,  d: 48, cl: '#5AC8FA' }, { a: 110, d: 62, cl: '#43C465' },
  { a: 145, d: 46, cl: '#8E5AE8' }, { a: 180, d: 58, cl: '#FF7043' },
  { a: 215, d: 48, cl: '#FFD34D' }, { a: 250, d: 62, cl: '#FF5A8A' },
  { a: 285, d: 46, cl: '#43C465' }, { a: 320, d: 58, cl: '#5AC8FA' },
  { a: 345, d: 52, cl: '#8E5AE8' }, { a: 60,  d: 40, cl: '#FF7043' },
];
const ConfettiBurst = () => (
  <span className="d1-burst" aria-hidden="true">
    {BURST.map(({ a, d, cl }, i) => {
      const rad = (a * Math.PI) / 180;
      const dx = Math.cos(rad) * d;
      const dy = Math.sin(rad) * d;
      return (
        <i key={i} style={{
          background: cl,
          '--bx': `${dx.toFixed(1)}px`,
          '--by': `${dy.toFixed(1)}px`,
          animationDelay: `${(i % 4) * 0.03}s`,
        }}/>
      );
    })}
  </span>
);

// Oltin yulduzcha (uchuvchi + sertifikat uchun)
const GoldStar = () => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
    <path d="M32 4 L40.8 22.4 L61 25.2 L46.4 39.3 L50 59.4 L32 49.8 L14 59.4 L17.6 39.3 L3 25.2 L23.2 22.4 Z"
      fill="#FFC23C" stroke="#E0992A" strokeWidth="2.5" strokeLinejoin="round"/>
    <path d="M32 12 L37.4 23.6 L50 25.4 L40.8 34.2 L43 46.8 L32 40.8 Z" fill="#FFFFFF" opacity="0.4"/>
  </svg>
);
// ============================================================
// YULDUZ PARVOZI API — GamePage to'g'ri javob nuqtasini ildizga uzatadi
// ============================================================
const FlightCtx = React.createContext({ onCorrect: () => {} });
const useFlightApi = () => React.useContext(FlightCtx);
// ============================================================
// SAHIFA 2 — Format 3: SOYA TOPISH (mushukcha)
// Oq karta ichida rangli mushukcha, pastda 3 ta qora siluet.
// Faqat bittasi aniq mos: qolganlarida quloq yoki dum farqli.
// ============================================================
const SHADOW_CAT_VOICE = "Mushukchaga o'z soyasini topishga yordam bering!";

// Mushukchaning umumiy geometriyasi (rangli rasm va soyalar BIR XIL nuqtalardan
// chiziladi — shunda to'g'ri soya haqiqatan aynan mos keladi). viewBox 0 0 120 120.
// variant: 'correct' (aynan mos) | 'round-ears' (qulog'i yumaloq) | 'up-tail' (dumi tepaga)
const CatParts = ({ variant = 'correct', silhouette = false }) => {
  const S = '#3F5185'; // soya rangi — qora emas, yumshoq indigo (bolalarga do'stona)
  const C = '#E8A54B'; // asosiy jun rangi (aa.png dagidek yassi, gradientsiz)

  const ears = variant === 'round-ears' ? (
    <g>
      <circle cx="42" cy="16" r="10" fill={silhouette ? S : C}/>
      <circle cx="78" cy="16" r="10" fill={silhouette ? S : C}/>
    </g>
  ) : (
    <g>
      <path d="M40 30 L35 6 L56 18 Z" fill={silhouette ? S : C}/>
      <path d="M80 30 L85 6 L64 18 Z" fill={silhouette ? S : C}/>
      {!silhouette && (
        <g>
          <path d="M43 25 L39 10 L52 19 Z" fill="#F2B8C6"/>
          <path d="M77 25 L81 10 L68 19 Z" fill="#F2B8C6"/>
        </g>
      )}
    </g>
  );

  const tail = variant === 'up-tail' ? (
    <path d="M32 96 Q24 76 34 58" stroke={silhouette ? S : C} strokeWidth="11" fill="none" strokeLinecap="round"/>
  ) : (
    <path d="M86 96 Q108 88 104 64" stroke={silhouette ? S : C} strokeWidth="11" fill="none" strokeLinecap="round"/>
  );

  return (
    <g>
      {tail}
      {/* dumdagi yo'l-yo'l chiziqlar */}
      {!silhouette && variant !== 'up-tail' && (
        <path d="M97 84 l8 -3 M100 74 l7 -1" stroke="#C97F2E" strokeWidth="3" strokeLinecap="round"/>
      )}
      {ears}
      {/* tana + bosh + panjalar (soya konturini belgilaydi) */}
      <ellipse cx="60" cy="84" rx="29" ry="25" fill={silhouette ? S : C}/>
      <circle cx="60" cy="44" r="24" fill={silhouette ? S : C}/>
      <ellipse cx="48" cy="106" rx="10" ry="5.5" fill={silhouette ? S : '#D8912F'}/>
      <ellipse cx="72" cy="106" rx="10" ry="5.5" fill={silhouette ? S : '#D8912F'}/>
      {/* rangli detallar — faqat asl rasmda (aa.png uslubi) */}
      {!silhouette && (
        <g>
          {/* ko'krak */}
          <ellipse cx="60" cy="92" rx="16" ry="14" fill="#FFF1DC"/>
          {/* boshdagi yo'l-yo'l chiziqlar */}
          <path d="M52 23 q3 -6 5 0 M63 23 q3 -6 5 0" stroke="#C97F2E" strokeWidth="3" fill="none" strokeLinecap="round"/>
          {/* katta ko'zlar */}
          <circle cx="50" cy="42" r="7.5" fill="#FFFFFF"/>
          <circle cx="70" cy="42" r="7.5" fill="#FFFFFF"/>
          <circle cx="51" cy="43" r="4.4" fill="#57A356"/>
          <circle cx="69" cy="43" r="4.4" fill="#57A356"/>
          <circle cx="51" cy="43" r="2.1" fill="#2F2B3A"/>
          <circle cx="69" cy="43" r="2.1" fill="#2F2B3A"/>
          <circle cx="52.5" cy="41" r="1.3" fill="#FFFFFF"/>
          <circle cx="70.5" cy="41" r="1.3" fill="#FFFFFF"/>
          {/* burun + og'iz */}
          <path d="M57 52 L63 52 L60 56 Z" fill="#F08A9B"/>
          <path d="M60 56 q-4 5 -8 2 M60 56 q4 5 8 2" stroke="#8A5A28" strokeWidth="2" fill="none" strokeLinecap="round"/>
          {/* mo'ylovlar */}
          <g stroke="#C9A46E" strokeWidth="1.6" strokeLinecap="round">
            <path d="M38 48 L24 46"/><path d="M39 53 L26 55"/>
            <path d="M82 48 L96 46"/><path d="M81 53 L94 55"/>
          </g>
          {/* yonoq qizilligi */}
          <circle cx="42" cy="50" r="4" fill="#F4B183" opacity="0.7"/>
          <circle cx="78" cy="50" r="4" fill="#F4B183" opacity="0.7"/>
        </g>
      )}
    </g>
  );
};

const CatSVG = ({ variant = 'correct', silhouette = false }) => (
  <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
    <CatParts variant={variant} silhouette={silhouette}/>
  </svg>
);

// Soya variantlari — to'g'risi o'rtada emas, har kirishda aralashadi
const SHADOW_CAT_VARIANTS = ['round-ears', 'correct', 'up-tail'];

// ============================================================
// QO'SHIMCHA IKONKALAR — 22 sahifalik darslik uchun (IC kutubxonasiga qo'shiladi).
// Har biri viewBox 0 0 60 60, asosiy rang `c` orqali.
// ============================================================
Object.assign(IC, {
  apple: (c) => (
    <g>
      <path d="M30 15 q1 -7 6 -9" stroke="#6E3A20" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <ellipse cx="38" cy="9" rx="5.5" ry="3" fill="#3E9B3A" transform="rotate(-20 38 9)"/>
      <path d="M30 17 C18 17 12 27 14 37 C16 47 22 53 30 53 C38 53 44 47 46 37 C48 27 42 17 30 17 Z" fill={c}/>
      <ellipse cx="23" cy="28" rx="3.4" ry="6" fill="#FFFFFF" opacity="0.4" transform="rotate(-16 23 28)"/>
    </g>
  ),
  orange: (c) => (
    <g>
      <ellipse cx="34" cy="12" rx="6" ry="3.2" fill="#3E9B3A" transform="rotate(-16 34 12)"/>
      <circle cx="30" cy="33" r="17" fill={c}/>
      <circle cx="24" cy="27" r="4" fill="#FFFFFF" opacity="0.35"/>
      <g fill="rgba(0,0,0,0.12)">
        <circle cx="36" cy="38" r="1.2"/><circle cx="30" cy="42" r="1.2"/><circle cx="40" cy="30" r="1.2"/>
      </g>
    </g>
  ),
  grape: (c) => (
    <g>
      <path d="M30 12 q1 -5 5 -6" stroke="#5A7D25" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <ellipse cx="37" cy="7" rx="5" ry="2.8" fill="#3E9B3A" transform="rotate(-18 37 7)"/>
      <g fill={c}>
        <circle cx="23" cy="22" r="7"/><circle cx="37" cy="22" r="7"/>
        <circle cx="16" cy="33" r="7"/><circle cx="30" cy="33" r="7"/><circle cx="44" cy="33" r="7"/>
        <circle cx="23" cy="44" r="7"/><circle cx="37" cy="44" r="7"/>
        <circle cx="30" cy="52" r="6.4"/>
      </g>
      <circle cx="20" cy="20" r="2.2" fill="#FFFFFF" opacity="0.5"/>
    </g>
  ),
  // 3 talik SEMIZ banan bog'lami — bitta banddan yelpig'ichdek tarqaladi;
  // orqadagilari to'qroq (chuqurlik), oldingisi ochiq yuzli, yaltiroq chiziqli.
  banana: (c) => {
    const body = "M15 9 C9 25 12.5 38.5 22.5 45.5 C32.5 52 45.5 53.5 52.5 48.5 C55.5 46.4 55 43.4 51.5 42.4 C42.5 40 33.5 36 27.5 29.5 C22.5 23 20.5 15.5 20.3 9.7 C20.2 5.2 16.6 4.6 15 9 Z";
    const tip = <ellipse cx="52.6" cy="45.8" rx="2.7" ry="2.1" fill="#7A4A14" transform="rotate(24 52.6 45.8)"/>;
    return (
      <g>
        <g transform="rotate(-14 17 9)">
          <path d={body} fill={c}/>
          <path d={body} fill="rgba(122,74,20,0.26)"/>
          {tip}
        </g>
        <g transform="rotate(4 17 9)">
          <path d={body} fill={c}/>
          <path d={body} fill="rgba(122,74,20,0.11)"/>
          {tip}
        </g>
        <g transform="rotate(21 17 9)">
          <path d={body} fill={c}/>
          {/* ochiq sariq "yuz" chizig'i — bananga hajm beradi */}
          <path d="M17.5 12 C14 25 17 35.5 24.5 42 C31.5 47.5 41.5 49.5 47.5 48"
            stroke="#FFEDB0" strokeWidth="4.6" fill="none" strokeLinecap="round" opacity="0.95"/>
          {/* yaltiroq gleam */}
          <path d="M16.8 14 C14.5 24 16.5 32.5 21.5 38.5"
            stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"/>
          {tip}
        </g>
        {/* umumiy band — uchchalasini tepada birlashtiradi */}
        <path d="M12.5 12.5 Q9.5 4.8 17.5 4 L21.5 10.5 Z" fill="#8A5A28"/>
        <path d="M14 6.5 q2.8 -1.8 5 -0.4" stroke="#6E4218" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      </g>
    );
  },
  pear: (c) => (
    <g>
      <path d="M30 13 q0 -5 4 -7" stroke="#6E3A20" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <ellipse cx="37" cy="7" rx="5" ry="2.8" fill="#3E9B3A" transform="rotate(-16 37 7)"/>
      <path d="M30 13 C33 13 35 17 34 23 C41 27 45 34 43 42 C41 50 36 54 30 54 C24 54 19 50 17 42 C15 34 19 27 26 23 C25 17 27 13 30 13 Z" fill={c}/>
      <ellipse cx="24" cy="36" rx="3" ry="5.5" fill="#FFFFFF" opacity="0.4" transform="rotate(-14 24 36)"/>
    </g>
  ),
  basket: (c) => (
    <g>
      <path d="M17 25 Q30 6 43 25" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M10 26 L50 26 L46 50 Q30 55 14 50 Z" fill={c}/>
      <path d="M18 28 l2 22 M30 28 l0 24 M42 28 l-2 22 M12 36 l36 0" stroke="rgba(0,0,0,0.16)" strokeWidth="2"/>
      <rect x="8" y="23" width="44" height="6" rx="3" fill="rgba(0,0,0,0.18)"/>
      <rect x="8" y="22" width="44" height="6" rx="3" fill={c}/>
    </g>
  ),
  bench: (c) => (
    <g fill={c}>
      <rect x="8" y="14" width="44" height="5.5" rx="2.75"/>
      <rect x="8" y="22" width="44" height="5.5" rx="2.75"/>
      <rect x="8" y="32" width="44" height="6.5" rx="3"/>
      <rect x="12" y="38" width="5" height="14" rx="2.5" fill="rgba(0,0,0,0.25)"/>
      <rect x="43" y="38" width="5" height="14" rx="2.5" fill="rgba(0,0,0,0.25)"/>
      <rect x="12" y="19" width="5" height="14" rx="2.5"/>
      <rect x="43" y="19" width="5" height="14" rx="2.5"/>
    </g>
  ),
  squirrel: (c) => (
    <g>
      <path d="M38 46 Q56 42 52 20 Q66 34 56 50 Q48 58 38 54 Z" fill={c}/>
      <ellipse cx="26" cy="44" rx="14" ry="12" fill="#B06E32"/>
      <circle cx="21" cy="26" r="10.5" fill="#B06E32"/>
      <path d="M14 19 L15 10 L22 16 Z" fill="#B06E32"/>
      <ellipse cx="26" cy="48" rx="7" ry="6" fill="#E8C49A"/>
      <circle cx="18" cy="24" r="2.2" fill="#2F2B3A"/>
      <circle cx="15" cy="29" r="1.8" fill="#5C4033"/>
      <ellipse cx="18" cy="55" rx="6" ry="3" fill="#8A5220"/>
    </g>
  ),
  hedgehog: (c) => (
    <g>
      <path d="M12 44 L17 26 L23 40 L28 22 L34 40 L40 24 L45 40 L50 28 L53 44 Z" fill={c}/>
      <ellipse cx="32" cy="45" rx="21" ry="9" fill={c}/>
      <ellipse cx="13" cy="44" rx="8" ry="6.5" fill="#E8C49A"/>
      <circle cx="7.5" cy="44" r="2.4" fill="#5C4033"/>
      <circle cx="13" cy="41" r="1.6" fill="#2F2B3A"/>
      <path d="M22 52 l0 3 M32 53 l0 3 M42 52 l0 3" stroke="#5C4033" strokeWidth="2.4" strokeLinecap="round"/>
    </g>
  ),
  hedgehogFew: (c) => (
    <g>
      <path d="M12 44 L21 24 L31 40 L41 24 L53 44 Z" fill={c}/>
      <ellipse cx="32" cy="45" rx="21" ry="9" fill={c}/>
      <ellipse cx="13" cy="44" rx="8" ry="6.5" fill="#E8C49A"/>
      <circle cx="7.5" cy="44" r="2.4" fill="#5C4033"/>
      <circle cx="13" cy="41" r="1.6" fill="#2F2B3A"/>
      <path d="M22 52 l0 3 M32 53 l0 3 M42 52 l0 3" stroke="#5C4033" strokeWidth="2.4" strokeLinecap="round"/>
    </g>
  ),
  octopus: (c) => (
    <g>
      <path d="M13 34 Q13 10 30 10 Q47 10 47 34 Z" fill={c}/>
      <path d="M15 34 q-3 10 -8 12 M25 34 q-1 12 -6 16 M35 34 q1 12 6 16 M45 34 q3 10 8 12" stroke={c} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
      <circle cx="23" cy="24" r="4.4" fill="#FFFFFF"/><circle cx="23" cy="24" r="2" fill="#2F2B3A"/>
      <circle cx="37" cy="24" r="4.4" fill="#FFFFFF"/><circle cx="37" cy="24" r="2" fill="#2F2B3A"/>
      <path d="M26 31 q4 3 8 0" stroke="#2F2B3A" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  ),
  octopus3: (c) => (
    <g>
      <path d="M13 34 Q13 10 30 10 Q47 10 47 34 Z" fill={c}/>
      <path d="M15 34 q-3 10 -8 12 M25 34 q-1 12 -6 16 M35 34 q1 12 6 16 M45 34 q3 10 8 12" stroke={c} strokeWidth="5.5" fill="none" strokeLinecap="round"/>
      <circle cx="21" cy="25" r="4" fill="#FFFFFF"/><circle cx="21" cy="25" r="1.8" fill="#2F2B3A"/>
      <circle cx="30" cy="20" r="4" fill="#FFFFFF"/><circle cx="30" cy="20" r="1.8" fill="#2F2B3A"/>
      <circle cx="39" cy="25" r="4" fill="#FFFFFF"/><circle cx="39" cy="25" r="1.8" fill="#2F2B3A"/>
      <path d="M26 31 q4 3 8 0" stroke="#2F2B3A" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  ),
  coral: (c) => (
    <path d="M30 54 L30 32 M30 40 Q20 36 18 24 M30 36 Q40 32 42 20 M18 24 Q15 18 19 12 M42 20 Q45 14 41 8" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round"/>
  ),
  bubble: (c) => (
    <g>
      <circle cx="30" cy="30" r="13" fill="none" stroke={c} strokeWidth="3" opacity="0.9"/>
      <circle cx="25" cy="25" r="3" fill={c} opacity="0.7"/>
    </g>
  ),
  planetPlain: (c) => (
    <g>
      <circle cx="30" cy="30" r="15" fill="#F5A623"/>
      <circle cx="25" cy="26" r="4" fill="#FFD34D"/>
      <circle cx="35" cy="34" r="3" fill="#E08A10"/>
    </g>
  ),
  sunLow: (c) => (
    <g>
      <g stroke={c} strokeWidth="4" strokeLinecap="round">
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1="30" y1="6" x2="30" y2="13" transform={`rotate(${a} 30 30)`}/>
        ))}
      </g>
      <circle cx="30" cy="30" r="13" fill={c}/>
      <circle cx="25" cy="26" r="3" fill="#FFFFFF" opacity="0.55"/>
    </g>
  ),
  frame: (c) => (
    <g>
      <rect x="13" y="11" width="34" height="38" rx="4" fill="#FFF8EC" stroke={c} strokeWidth="5"/>
      <path d="M18 42 L27 30 L33 36 L39 27 L42 42 Z" fill="#43A85C"/>
      <circle cx="24" cy="23" r="4" fill="#FFD34D"/>
    </g>
  ),
  bowbear: (c) => (
    <g>
      <circle cx="16" cy="14" r="8" fill="#C98A5B"/>
      <circle cx="44" cy="14" r="8" fill="#C98A5B"/>
      <circle cx="16" cy="14" r="4" fill="#F2E3CE"/>
      <circle cx="44" cy="14" r="4" fill="#F2E3CE"/>
      <circle cx="30" cy="28" r="18" fill="#C98A5B"/>
      <ellipse cx="30" cy="35" rx="9" ry="7" fill="#F2E3CE"/>
      <circle cx="23" cy="25" r="2.6" fill="#3D3A50"/>
      <circle cx="37" cy="25" r="2.6" fill="#3D3A50"/>
      <ellipse cx="30" cy="33" rx="3" ry="2.4" fill="#5C4033"/>
      <path d="M30 49 L18 43 L18 55 Z" fill={c}/>
      <path d="M30 49 L42 43 L42 55 Z" fill={c}/>
      <circle cx="30" cy="49" r="3.6" fill={c} stroke="rgba(0,0,0,0.2)" strokeWidth="1"/>
    </g>
  ),
  pyramid: (c) => (
    <g>
      <rect x="13" y="43" width="34" height="9" rx="4.5" fill={c}/>
      <rect x="17" y="33" width="26" height="9" rx="4.5" fill="#FFB03A"/>
      <rect x="21" y="23" width="18" height="9" rx="4.5" fill="#5AC8FA"/>
      <circle cx="30" cy="16" r="5.5" fill="#FF5A8A"/>
    </g>
  ),
  triangle: (c) => (
    <path d="M30 12 L50 46 L10 46 Z" fill={c} stroke={c} strokeWidth="7" strokeLinejoin="round"/>
  ),
  square: (c) => (
    <g>
      <rect x="12" y="12" width="36" height="36" rx="8" fill={c}/>
      <rect x="17" y="17" width="12" height="8" rx="4" fill="#FFFFFF" opacity="0.3"/>
    </g>
  ),
  heart: (c) => (
    <g>
      <path d="M30 52 C14 40 8 30 8 21 C8 13 14 8 21 8 C26 8 30 12 30 16 C30 12 34 8 39 8 C46 8 52 13 52 21 C52 30 46 40 30 52 Z" fill={c}/>
      <ellipse cx="20" cy="18" rx="4.5" ry="6" fill="#FFFFFF" opacity="0.35" transform="rotate(-24 20 18)"/>
    </g>
  ),
  dot: (c) => (
    <g>
      <circle cx="30" cy="30" r="18" fill={c}/>
      <circle cx="24" cy="24" r="5" fill="#FFFFFF" opacity="0.4"/>
    </g>
  ),
  monkeyFace: (c) => (
    <g>
      <circle cx="10" cy="28" r="7" fill="#A9744F"/>
      <circle cx="50" cy="28" r="7" fill="#A9744F"/>
      <circle cx="10" cy="28" r="3.4" fill="#E8C39E"/>
      <circle cx="50" cy="28" r="3.4" fill="#E8C39E"/>
      <circle cx="30" cy="30" r="18" fill="#A9744F"/>
      <ellipse cx="24" cy="24" rx="6.5" ry="7.5" fill="#E8C39E"/>
      <ellipse cx="36" cy="24" rx="6.5" ry="7.5" fill="#E8C39E"/>
      <ellipse cx="30" cy="36" rx="11" ry="9" fill="#E8C39E"/>
      <circle cx="24" cy="25" r="2.4" fill="#2F2B3A"/>
      <circle cx="36" cy="25" r="2.4" fill="#2F2B3A"/>
      <circle cx="27" cy="35" r="1.4" fill="#8A5A28"/>
      <circle cx="33" cy="35" r="1.4" fill="#8A5A28"/>
      <path d="M25 40 Q30 44 35 40" stroke="#8A5A28" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  ),
  tigerFace: (c) => (
    <g>
      <circle cx="14" cy="14" r="6.5" fill="#F5A623"/>
      <circle cx="46" cy="14" r="6.5" fill="#F5A623"/>
      <circle cx="14" cy="14" r="3" fill="#FFC9D6"/>
      <circle cx="46" cy="14" r="3" fill="#FFC9D6"/>
      <circle cx="30" cy="31" r="18" fill="#F5A623"/>
      <path d="M30 13 l0 6 M18 17 l4 5 M42 17 l-4 5 M12 30 l6 1 M48 30 l-6 1" stroke="#3A2C1F" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="30" cy="38" rx="9.5" ry="7.5" fill="#FFF4E0"/>
      <circle cx="23" cy="28" r="2.6" fill="#2F2B3A"/>
      <circle cx="37" cy="28" r="2.6" fill="#2F2B3A"/>
      <path d="M27.5 36 L32.5 36 L30 39.5 Z" fill="#F08A9B"/>
      <path d="M30 39.5 q-4 4 -7 1.5 M30 39.5 q4 4 7 1.5" stroke="#8A5A28" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </g>
  ),
  clock: (c) => (
    <g>
      <circle cx="30" cy="32" r="16" fill="#FFFFFF" stroke={c} strokeWidth="5"/>
      <path d="M30 20 v3 M30 41 v3 M18 32 h3 M39 32 h3" stroke="#8B8FA3" strokeWidth="2"/>
      <path d="M30 32 L30 23 M30 32 L37 34" stroke="#3D3A50" strokeWidth="2.6" strokeLinecap="round"/>
      <rect x="24" y="10" width="12" height="5" rx="2.5" fill={c}/>
    </g>
  ),
  rabbitLeaf: (c) => (
    <g>
      <ellipse cx="22" cy="12" rx="6" ry="11" fill="#43A85C" transform="rotate(-10 22 12)"/>
      <path d="M22 4 L22 20" stroke="#2E7D4F" strokeWidth="1.6" transform="rotate(-10 22 12)"/>
      <ellipse cx="38" cy="12" rx="6" ry="11" fill="#43A85C" transform="rotate(10 38 12)"/>
      <path d="M38 4 L38 20" stroke="#2E7D4F" strokeWidth="1.6" transform="rotate(10 38 12)"/>
      <circle cx="30" cy="33" r="14" fill="#EDE7DC"/>
      <ellipse cx="30" cy="51" rx="11" ry="8" fill="#EDE7DC"/>
      <circle cx="25" cy="31" r="2.4" fill="#3D3A50"/>
      <circle cx="35" cy="31" r="2.4" fill="#3D3A50"/>
      <ellipse cx="30" cy="37" rx="2.6" ry="2" fill="#FF9AAE"/>
      <path d="M30 39 q-3 3 -6 1 M30 39 q3 3 6 1" stroke="#3D3A50" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </g>
  ),
});

// Fisher-Yates aralashtirish (faqat hodisa/mount paytida, render'da emas)
const shuffleArr = (a) => {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
};

// ============================================================
// SAHIFA 3 san'ati — QUYONCHA (oq-pushti, uzun quloq, sakrab turgan).
// Soya bilan bir geometriya. variant: correct | short-ears | down-ears
// ============================================================
const BunnyParts = ({ variant = 'correct', silhouette = false }) => {
  const S = '#3F5185';
  // To'q karamel tana — och pastel fonda aniq ajralib turadi
  const C = silhouette ? S : '#C08552';
  const ears = variant === 'short-ears' ? (
    <g>
      <circle cx="50" cy="22" r="8.5" fill={C}/>
      <circle cx="72" cy="22" r="8.5" fill={C}/>
    </g>
  ) : variant === 'down-ears' ? (
    <g>
      <ellipse cx="38" cy="34" rx="7" ry="16" fill={C} transform="rotate(56 38 34)"/>
      <ellipse cx="84" cy="34" rx="7" ry="16" fill={C} transform="rotate(-56 84 34)"/>
    </g>
  ) : (
    <g>
      <ellipse cx="50" cy="16" rx="7.5" ry="19" fill={C} transform="rotate(-8 50 16)"/>
      <ellipse cx="72" cy="16" rx="7.5" ry="19" fill={C} transform="rotate(8 72 16)"/>
      {!silhouette && (
        <g>
          <ellipse cx="50" cy="17" rx="3.6" ry="13" fill="#FFC9D6" transform="rotate(-8 50 17)"/>
          <ellipse cx="72" cy="17" rx="3.6" ry="13" fill="#FFC9D6" transform="rotate(8 72 17)"/>
        </g>
      )}
    </g>
  );
  return (
    <g transform="translate(-1 0)">
      {ears}
      {/* dumcha (chapda) + tana + bosh + oyoqlar — sakrashga shay poza */}
      <circle cx="32" cy="86" r="8" fill={C}/>
      <ellipse cx="62" cy="82" rx="27" ry="22" fill={C}/>
      <circle cx="61" cy="46" r="22" fill={C}/>
      <ellipse cx="48" cy="101" rx="11" ry="6" fill={C}/>
      <ellipse cx="76" cy="101" rx="11" ry="6" fill={C}/>
      {!silhouette && (
        <g>
          <ellipse cx="62" cy="88" rx="14" ry="12" fill="#FFFFFF"/>
          <circle cx="53" cy="44" r="2.6" fill="#3D3A50"/>
          <circle cx="69" cy="44" r="2.6" fill="#3D3A50"/>
          <circle cx="54.5" cy="42.5" r="0.9" fill="#FFFFFF"/>
          <circle cx="70.5" cy="42.5" r="0.9" fill="#FFFFFF"/>
          <ellipse cx="61" cy="50" rx="3" ry="2.4" fill="#FF9AAE"/>
          <path d="M61 52 q-3.4 3.4 -7 1.6 M61 52 q3.4 3.4 7 1.6" stroke="#3D3A50" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          <circle cx="45" cy="50" r="3.6" fill="#FFC0CB" opacity="0.75"/>
          <circle cx="77" cy="50" r="3.6" fill="#FFC0CB" opacity="0.75"/>
          <g stroke="#7E5734" strokeWidth="1.5" strokeLinecap="round">
            <path d="M48 51 L36 49"/><path d="M74 51 L86 49"/>
          </g>
        </g>
      )}
    </g>
  );
};
const BunnySVG = ({ variant = 'correct', silhouette = false }) => (
  <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
    <BunnyParts variant={variant} silhouette={silhouette}/>
  </svg>
);

// ============================================================
// SAHIFA 17 san'ati — QUSHCHA/PAPUG'AY (qanot holati farqli — qiyinroq).
// variant: correct (qanot pastda) | wing-up (qanot ko'tarilgan) | big-crest (katta toj)
// ============================================================
const BirdParts = ({ variant = 'correct', silhouette = false }) => {
  const S = '#3F5185';
  const B = silhouette ? S : '#43B05C';    // tana
  const W = silhouette ? S : '#FFD34D';    // qanot
  const T = silhouette ? S : '#4A90E2';    // dum
  const crest = variant === 'big-crest' ? (
    <path d="M56 18 Q50 2 62 4 Q60 10 68 8 Q64 16 70 16 L62 22 Z" fill={silhouette ? S : '#FF5A4E'}/>
  ) : (
    <path d="M58 16 Q56 6 66 8 Q62 14 68 15 L62 20 Z" fill={silhouette ? S : '#FF5A4E'}/>
  );
  const wing = variant === 'wing-up' ? (
    <ellipse cx="46" cy="46" rx="10" ry="20" fill={W} transform="rotate(38 46 46)"/>
  ) : (
    <ellipse cx="48" cy="66" rx="10" ry="19" fill={W} transform="rotate(-24 48 66)"/>
  );
  return (
    <g>
      {/* dum — pastga cho'zilgan patlar */}
      <path d="M66 88 q2 16 -4 24 M72 88 q6 14 2 24 M60 88 q-2 14 -10 20" stroke={T} strokeWidth="6" fill="none" strokeLinecap="round"/>
      {crest}
      {/* tana */}
      <path d="M62 18 C84 20 90 44 84 64 C79 82 68 92 58 92 C44 92 34 80 34 62 C34 38 44 20 62 18 Z" fill={B}/>
      {wing}
      {/* tumshuq */}
      <path d="M84 38 q12 2 10 10 q-8 4 -14 -2 Z" fill={silhouette ? S : '#F5A623'}/>
      {/* oyoqchalar */}
      <path d="M54 92 l-2 8 M64 92 l2 8" stroke={silhouette ? S : '#F5A623'} strokeWidth="4" strokeLinecap="round"/>
      {!silhouette && (
        <g>
          <circle cx="72" cy="36" r="7" fill="#FFFFFF"/>
          <circle cx="73" cy="37" r="3.2" fill="#2F2B3A"/>
          <circle cx="74.4" cy="35.6" r="1.1" fill="#FFFFFF"/>
          <ellipse cx="58" cy="76" rx="10" ry="8" fill="#8ED08E" opacity="0.7"/>
        </g>
      )}
    </g>
  );
};
const BirdSVG = ({ variant = 'correct', silhouette = false }) => (
  <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
    <BirdParts variant={variant} silhouette={silhouette}/>
  </svg>
);

// ============================================================
// THEME BG — karta ichidagi tematik fon: yumshoq gradient +
// xira dekor-belgilar (IC dan). Javob tugmalariga tegmaydi.
// theme: { bg, decor: [{ kind, c, x, y, s, o, r? }] }
// ============================================================
const ThemeBg = ({ theme }) => (
  <div className="d1-theme" style={{ background: theme.bg }} aria-hidden="true">
    {theme.decor.map((d, i) => (
      <span key={i} className="d1-theme-ic"
        style={{
          left: `${d.x}%`, top: `${d.y}%`,
          width: `clamp(${Math.round(d.s * 0.6)}px, ${d.s / 7}vw, ${d.s}px)`,
          opacity: d.o,
          transform: `translate(-50%, -50%) rotate(${d.r || 0}deg)`,
        }}>
        <ObjIcon kind={d.kind} c={d.c}/>
      </span>
    ))}
  </div>
);

// ============================================================
// PAGE SHELL — barcha o'yin sahifalari uchun umumiy qolip:
// sarlavha + kontent + futer (Orqaga / Keyingi).
// ============================================================
const PageShell = ({ title, children, onBack, onNext, nextOk }) => (
  <div className="d1-shadow fade-up">
    {title && <h2 className="d1-shadow-title">{title}</h2>}
    {children}
    <div className="d1-footer">
      <button type="button" className="d1-nav-back" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6"/>
        </svg>
        Orqaga
      </button>
      <button type="button" className="d1-nav-next" disabled={!nextOk} onClick={onNext}>
        Keyingi
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  </div>
);

// Yumshoq silkinish uchun umumiy hook (noto'g'ri javobda karta tebranadi)
function useShake() {
  const [shaking, setShaking] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const shake = useCallback(() => {
    sfxHmm();
    setShaking(false);
    clearTimeout(t.current);
    requestAnimationFrame(() => {
      setShaking(true);
      t.current = setTimeout(() => setShaking(false), 500);
    });
  }, []);
  return [shaking, shake];
}

// ============================================================
// FORMAT 3 — SOYA TOPISH (universal): rangli rasm + 3 soya.
// cfg: { title, voice, Art, variants:[correct + 2 farqli] }
// ============================================================
const ShadowGamePage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const [shaking, shake] = useShake();
  const [order] = useState(() => shuffleArr([...cfg.variants]));
  const Art = cfg.Art;

  const pick = (variant, el) => {
    if (solved) return;
    if (variant === 'correct') {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      shake();
    }
  };

  return (
    <PageShell title={cfg.title} onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d1-shadow-card ${cfg.theme ? 'themed' : ''} ${shaking ? 'd1-shake' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        <div className="d1-shadow-hero"><Art variant="correct"/></div>
        <div className="d1-shadow-row">
          {order.map((v) => {
            const hit = solved && v === 'correct';
            return (
              <button key={v} type="button" className={`d1-sil ${hit ? 'ok' : ''}`} disabled={solved}
                onClick={(e) => pick(v, e.currentTarget)} aria-label="Soya varianti">
                <Art variant={v} silhouette/>
                {hit && <ConfettiBurst/>}
              </button>
            );
          })}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

const SHADOW_CFG_CAT = {
  title: "Mushukchaning soyasini toping!",
  voice: SHADOW_CAT_VOICE,
  Art: CatSVG,
  variants: SHADOW_CAT_VARIANTS,
  // Uy xonasi: salqin ko'kish devor (to'q sariq mushuk aniq ajralsin) + iliq pol,
  // chetlarda xira dekor — devorda soat, torsher, polda kalava-to'p, kitob, sovg'a
  theme: {
    bg: 'linear-gradient(180deg, #E0EEFB 0%, #ECF2F6 48%, #F8E8CF 100%)',
    decor: [
      { kind: 'clock', c: '#F2B24A', x: 11, y: 13, s: 74,  o: 0.45 },
      { kind: 'star5', c: '#F6C45A', x: 63, y: 8,  s: 40,  o: 0.35 },
      { kind: 'house', c: '#8FB7DE', x: 90, y: 12, s: 80,  o: 0.35 },
      { kind: 'lamp',  c: '#B48CE0', x: 95, y: 60, s: 105, o: 0.32 },
      { kind: 'book',  c: '#6FA8DC', x: 5,  y: 66, s: 70,  o: 0.35, r: -8 },
      { kind: 'ball',  c: '#E86A8A', x: 9,  y: 93, s: 56,  o: 0.5 },
      { kind: 'fish',  c: '#F2A45E', x: 31, y: 96, s: 44,  o: 0.45 },
      { kind: 'gift',  c: '#7FCB8F', x: 88, y: 95, s: 48,  o: 0.45 },
      { kind: 'cube',  c: '#B48CE0', x: 70, y: 96, s: 36,  o: 0.4 },
    ],
  },
};
const SHADOW_CFG_BUNNY = {
  title: "Quyonchaning soyasini toping!",
  voice: "Quyonchaga... oʻz soyasini topishga yordam bering! ... " +
    "Rasmdagi quyonchaning... qu-loq-la-ri-ga... yaxshilab qarang... " +
    "va pastdan, unga aynan mos keladigan soyani tanlang! ... Qani, boshladik!",
  Art: BunnySVG,
  variants: ['short-ears', 'correct', 'down-ears'],
  // Yaylov: osmon -> o'tloq gradienti, chetlarda xira dekor (markaz bo'sh qoladi)
  theme: {
    bg: 'linear-gradient(180deg, #DDF1FF 0%, #E9F8EC 46%, #C8ECCF 100%)',
    decor: [
      { kind: 'sun',       c: '#FFD34D', x: 90, y: 12, s: 92,  o: 0.4 },
      { kind: 'cloud',     c: '#FFFFFF', x: 12, y: 12, s: 96,  o: 0.75 },
      { kind: 'cloud',     c: '#FFFFFF', x: 62, y: 7,  s: 64,  o: 0.55 },
      { kind: 'tree',      c: '#7FCB8F', x: 4,  y: 68, s: 110, o: 0.3 },
      { kind: 'tree',      c: '#8FD49E', x: 97, y: 62, s: 90,  o: 0.28 },
      { kind: 'butterfly', c: '#B48CE0', x: 20, y: 34, s: 44,  o: 0.5, r: -12 },
      { kind: 'flower',    c: '#F2A9C4', x: 8,  y: 92, s: 52,  o: 0.55 },
      { kind: 'flower',    c: '#F6C45A', x: 30, y: 96, s: 40,  o: 0.45 },
      { kind: 'flower',    c: '#F2A9C4', x: 88, y: 95, s: 46,  o: 0.5 },
      { kind: 'mushroom',  c: '#E86A5E', x: 70, y: 96, s: 38,  o: 0.4 },
    ],
  },
};

// ============================================================
// FORMAT 5 — RANGGA QARAB SARALASH (4-5-sahifalar), DRAG & DROP:
// narsa barmoq/sichqoncha bilan USHLAB ko'tariladi va o'z rangidagi
// qutiga OLIB BORIB qo'yiladi. To'g'ri quti -> joylashadi + yulduz;
// noto'g'ri -> quti silkinadi, narsa joyiga qaytadi.
// ============================================================
const ColorSortPage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // har kirganda pastdagi narsalar qatori tasodifiy tartibda
  const [items] = useState(() => shuffleArr([...cfg.items]));
  const [placed, setPlaced] = useState({});              // id -> true
  const [drag, setDrag] = useState(null);                // { id, x, y } — ushlangan narsa
  const [hoverBox, setHoverBox] = useState(null);        // sudrab ustiga kelingan quti
  const [shakeBox, setShakeBox] = useState(null);
  const boxRefs = useRef({});
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const doneCount = Object.keys(placed).length;
  const allDone = doneCount === items.length;
  const dragItem = drag ? items.find(i => i.id === drag.id) : null;

  // (x, y) nuqta qaysi quti ustida?
  const boxAt = (x, y) => cfg.boxes.find((b) => {
    const el = boxRefs.current[b.color];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });

  const startDrag = (e, id) => {
    if (placed[id] || allDone) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
    setDrag({ id, x: e.clientX, y: e.clientY });
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const b = boxAt(e.clientX, e.clientY);
    setHoverBox(b ? b.color : null);
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
  };
  const cancelDrag = () => { setDrag(null); setHoverBox(null); };
  const endDrag = (e) => {
    if (!drag) return;
    const item = items.find(i => i.id === drag.id);
    const box = boxAt(e.clientX, e.clientY);
    cancelDrag();
    if (!box) return;                                    // bo'sh joyga tashlandi — narsa qaytadi
    if (item.color === box.color) {
      const nextPlaced = { ...placed, [item.id]: true };
      setPlaced(nextPlaced);
      sfxDingDing();
      const r = boxRefs.current[box.color].getBoundingClientRect();
      const isLast = Object.keys(nextPlaced).length === items.length;
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, isLast);
    } else {
      sfxHmm();
      setShakeBox(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeBox(box.color);
        shakeTimer.current = setTimeout(() => setShakeBox(null), 500);
      });
    }
  };

  return (
    <PageShell title={cfg.title} onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card d1-sort-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        {/* rangli qutilar — narsa shu yerga OLIB KELIB tashlanadi */}
        <div className="d1-sort-boxes">
          {cfg.boxes.map((box) => {
            const inside = items.filter(i => placed[i.id] && i.color === box.color);
            return (
              <div key={box.color}
                ref={(el) => { boxRefs.current[box.color] = el; }}
                className={`d1-box ${hoverBox === box.color ? 'hover' : ''} ${shakeBox === box.color ? 'd1-shake' : ''}`}
                style={{ '--boxc': box.color }} aria-label="Quti">
                <span className="d1-box-lid" style={{ background: box.color }}/>
                <span className="d1-box-mark" style={{ background: box.color }}/>
                <span className="d1-box-slot">
                  {inside.map(i => (
                    <span key={i.id} className="d1-box-item fade-up">
                      <ObjIcon kind={i.kind} c={i.color}/>
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        {/* narsalar qatori — ushlab qutiga olib boriladi */}
        <div className="d1-sort-items">
          {items.map((i) => placed[i.id] ? (
            <span key={i.id} className="d1-sort-item done" aria-hidden="true"/>
          ) : (
            <button key={i.id} type="button"
              className={`d1-sort-item ${drag && drag.id === i.id ? 'lift' : ''}`}
              onPointerDown={(e) => startDrag(e, i.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              aria-label={i.id}>
              <ObjIcon kind={i.kind} c={i.color}/>
            </button>
          ))}
        </div>
        {/* barmoq ostida "ko'tarilgan" nusxa — body ga portal (ota-elementlardagi
            transform position:fixed koordinatalarini siljitib yubormasligi uchun) */}
        {dragItem && createPortal(
          <span className="d1-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            <ObjIcon kind={dragItem.kind} c={dragItem.color}/>
          </span>,
          document.body
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

const SORT_CFG_FRUITS = {
  title: "Mevalarni ranglariga qarab uylariga joylang!",
  voice: "Voy, qarang, qanchalik chiroyli mevalar! ... Lekin ular uychalarini yoʻqotib qoʻyishdi. ... " +
    "Har bir mevani... rangi-ga qa-rab... oʻz uychasiga joylashtiring! ... " +
    "Yashil uychaga yashilini, ... binafsha uychaga binafshasini! ... Qani, mevalarni uylariga kuzatib qoʻyamiz!",
  boxes: [{ color: '#43C465' }, { color: '#8E5AE8' }, { color: '#FFB03A' }],
  items: [
    { id: 'apple',  kind: 'apple',  color: '#43C465' },
    { id: 'grape',  kind: 'grape',  color: '#8E5AE8' },
    { id: 'orange', kind: 'orange', color: '#FFB03A' },
  ],
  // Mevazor bog': osmon -> maysa, chetlarda daraxt/quyosh/gullar
  theme: {
    bg: 'linear-gradient(180deg, #E2F3FF 0%, #EDF8EA 44%, #CFEDCA 100%)',
    decor: [
      { kind: 'sun',       c: '#FFD34D', x: 8,  y: 12, s: 88,  o: 0.4 },
      { kind: 'cloud',     c: '#FFFFFF', x: 55, y: 8,  s: 70,  o: 0.6 },
      { kind: 'cloud',     c: '#FFFFFF', x: 90, y: 14, s: 90,  o: 0.7 },
      { kind: 'tree',      c: '#7FCB8F', x: 4,  y: 62, s: 105, o: 0.3 },
      { kind: 'tree',      c: '#8FD49E', x: 96, y: 58, s: 115, o: 0.3 },
      { kind: 'basket',    c: '#C98A4B', x: 7,  y: 93, s: 52,  o: 0.4 },
      { kind: 'flower',    c: '#F2A9C4', x: 30, y: 96, s: 42,  o: 0.5 },
      { kind: 'butterfly', c: '#B48CE0', x: 70, y: 92, s: 44,  o: 0.45, r: 10 },
      { kind: 'flower',    c: '#F6C45A', x: 91, y: 95, s: 46,  o: 0.5 },
    ],
  },
};
const SORT_CFG_TOYS = {
  title: "O'yinchoqlarni rangli uychalariga joylang!",
  voice: "Oʻoʻv, qarang, xonangda oʻyinchoqlar tarqalib ketibdi-ku! ... Keling, ularni tezda joyiga yigʻamiz! ... " +
    "Har bir oʻyinchoqni... oʻz ran-gi-da-gi... uychasiga joylashtiring! ... " +
    "Moviy aylanani moviy uychaga, ... qizil toʻrtburchakni qizil uychaga! ... Qani, boshlaladik, xonangni saramjon qilamiz!",
  boxes: [{ color: '#FF5A4E' }, { color: '#4A90E2' }, { color: '#FFD34D' }],
  items: [
    { id: 'cube',     kind: 'square',   color: '#FF5A4E' },
    { id: 'circle',   kind: 'dot',      color: '#4A90E2' },
    { id: 'triangle', kind: 'triangle', color: '#FFD34D' },
  ],
  // O'yin xonasi: siyohrang-krem devor, chetlarda o'yinchoq dekorlar
  theme: {
    bg: 'linear-gradient(180deg, #F0EAFB 0%, #F7F2F6 46%, #FFE9CF 100%)',
    decor: [
      { kind: 'kite',    c: '#E86A8A', x: 9,  y: 14, s: 80,  o: 0.4,  r: -10 },
      { kind: 'balloon', c: '#7FB8E8', x: 90, y: 12, s: 78,  o: 0.45 },
      { kind: 'star5',   c: '#F6C45A', x: 60, y: 7,  s: 38,  o: 0.4 },
      { kind: 'bear',    c: '#C98A4B', x: 4,  y: 66, s: 90,  o: 0.3 },
      { kind: 'rocket',  c: '#8FB7DE', x: 96, y: 60, s: 95,  o: 0.32, r: 12 },
      { kind: 'car',     c: '#7FCB8F', x: 8,  y: 94, s: 54,  o: 0.45 },
      { kind: 'pyramid', c: '#B48CE0', x: 32, y: 96, s: 44,  o: 0.45 },
      { kind: 'ball',    c: '#E86A8A', x: 69, y: 95, s: 42,  o: 0.45 },
      { kind: 'gift',    c: '#F6C45A', x: 92, y: 94, s: 48,  o: 0.45 },
    ],
  },
};

// ============================================================
// FORMAT 4 — KETMA-KETLIK (6, 7, 18-sahifalar).
// Naqsh qatori + bo'sh punktir uya; pastda variantlar. To'g'risi
// uyaga joylashadi + yulduz + avto-o'tish.
// ============================================================
const SequencePage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // Har kirganda naqsh siklning BOSHQA a'zosidan boshlanadi — shu sabab
  // to'g'ri javob ham har safar o'zgaradi (goh maymun, goh yo'lbars).
  // Pastdagi variantlar tartibi ham tasodifiy aralashadi.
  // cfg.palette bo'lsa: sikl RANGLARI ham har kirganda to'plamdan
  // tasodifiy tanlanadi (18-sahifa: 6 rangdan 3 tasi).
  const [{ pattern, options }] = useState(() => {
    const cycle = cfg.palette
      ? shuffleArr([...cfg.palette]).slice(0, 3).map((c) => ({ kind: cfg.paletteKind || 'dot', c }))
      : cfg.cycle;
    const off = Math.floor(Math.random() * cycle.length);
    const rot = [...cycle.slice(off), ...cycle.slice(0, off)];
    const ans = rot[cfg.len % rot.length];
    return {
      pattern: Array.from({ length: cfg.len }, (_, i) => rot[i % rot.length]),
      options: shuffleArr(cycle.map(c => ({ ...c, correct: c === ans }))),
    };
  });
  const [solved, setSolved] = useState(false);
  const [shakeIdx, setShakeIdx] = useState(null);
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const pick = (opt, i, el) => {
    if (solved) return;
    if (opt.correct) {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      sfxHmm();
      setShakeIdx(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        shakeTimer.current = setTimeout(() => setShakeIdx(null), 500);
      });
    }
  };
  const answer = options.find(o => o.correct);

  return (
    <PageShell title={cfg.title} onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d1-shadow-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        {/* naqsh qatori */}
        <div className="d1-seq-row">
          {pattern.map((p, i) => (
            <span key={i} className="d1-seq-cell">
              <ObjIcon kind={p.kind} c={p.c}/>
            </span>
          ))}
          <span className={`d1-seq-slot ${solved ? 'filled' : ''}`}>
            {solved && (
              <span className="fade-up" style={{ width: '100%', height: '100%', display: 'block', position: 'relative' }}>
                <ObjIcon kind={answer.kind} c={answer.c}/>
                <ConfettiBurst/>
              </span>
            )}
            {!solved && <span className="d1-seq-q">?</span>}
          </span>
        </div>
        {/* variantlar */}
        {!solved && (
          <div className="d1-seq-opts">
            {options.map((o, i) => (
              <button key={i} type="button" className={`d1-seq-opt ${shakeIdx === i ? 'd1-shake' : ''}`}
                onClick={(e) => pick(o, i, e.currentTarget)} aria-label="Variant">
                <ObjIcon kind={o.kind} c={o.c}/>
              </button>
            ))}
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

const SEQ_CFG_ANIMALS = {
  title: "Keyingisida nima keladi?",
  voice: "Keling, bitta qiziqarli oʻyin oʻynaymiz! ... Rasmlarga birga qaraymiz: ... " +
    "Yoʻlbars, ... Maymun, ... Yoʻlbars, ... Maymun! ... Hm-m-m, keyingisida nima kelar ekan? ... " +
    "Soʻroq belgisining oʻrnida... qaysi hayvoncha turishi kerak? ... Qani, oʻsha aqlli hayvonchani topib, ustiga bosing!",
  // takrorlanuvchi sikl — naqsh va variantlar shundan tasodifiy quriladi
  cycle: [{ kind: 'monkeyFace' }, { kind: 'tigerFace' }],
  len: 4,
  // Changalzor: yashil gradient, chetlarda daraxt/banan/kapalak
  theme: {
    bg: 'linear-gradient(180deg, #E3F6E6 0%, #EFF9E9 46%, #CFEDCA 100%)',
    decor: [
      { kind: 'sun',       c: '#FFD34D', x: 8,  y: 12, s: 80,  o: 0.38 },
      { kind: 'cloud',     c: '#FFFFFF', x: 60, y: 8,  s: 70,  o: 0.6 },
      { kind: 'tree',      c: '#7FCB8F', x: 94, y: 20, s: 100, o: 0.32 },
      { kind: 'banana',    c: '#F6C45A', x: 5,  y: 52, s: 60,  o: 0.4,  r: 14 },
      { kind: 'butterfly', c: '#B48CE0', x: 95, y: 58, s: 46,  o: 0.45, r: -10 },
      { kind: 'tree',      c: '#8FD49E', x: 6,  y: 92, s: 84,  o: 0.3 },
      { kind: 'flower',    c: '#F2A9C4', x: 32, y: 96, s: 40,  o: 0.5 },
      { kind: 'mushroom',  c: '#E86A5E', x: 68, y: 96, s: 38,  o: 0.42 },
      { kind: 'flower',    c: '#F6C45A', x: 92, y: 95, s: 44,  o: 0.5 },
    ],
  },
};
const SEQ_CFG_SHAPES = {
  title: "Keyingi shakl qaysi?",
  voice: "Qarang, qanday chiroyli naqsh! ... Kel, uni birga oʻqiymiz: ... " +
    "Koʻk toʻrtburchak, ... Qizil doira, ... Koʻk toʻrtburchak, ... Qizil doira! ... " +
    "Voy, ... keyingi shakl qaysi boʻladi? ... Soʻroq belgisining ostiga yashiringan shaklni topib, ustiga bosing!",
  cycle: [{ kind: 'dot', c: '#FF5A4E' }, { kind: 'square', c: '#4A90E2' }],
  len: 4,
  // O'yin xonasi: siyohrang-krem devor, o'yinchoq dekorlar
  theme: {
    bg: 'linear-gradient(180deg, #EFE9FB 0%, #F6F1F8 48%, #FFEAD2 100%)',
    decor: [
      { kind: 'balloon', c: '#7FB8E8', x: 8,  y: 13, s: 76,  o: 0.42 },
      { kind: 'star5',   c: '#F6C45A', x: 58, y: 7,  s: 38,  o: 0.4 },
      { kind: 'kite',    c: '#E86A8A', x: 92, y: 13, s: 78,  o: 0.4, r: 12 },
      { kind: 'rocket',  c: '#8FB7DE', x: 5,  y: 56, s: 66,  o: 0.32, r: -8 },
      { kind: 'lamp',    c: '#B48CE0', x: 95, y: 56, s: 68,  o: 0.3 },
      { kind: 'car',     c: '#F2A45E', x: 8,  y: 94, s: 54,  o: 0.45 },
      { kind: 'gift',    c: '#B48CE0', x: 33, y: 96, s: 44,  o: 0.42 },
      { kind: 'bear',    c: '#C98A4B', x: 68, y: 95, s: 50,  o: 0.38 },
      { kind: 'balloon', c: '#F2A9C4', x: 93, y: 93, s: 52,  o: 0.42 },
    ],
  },
};
const SEQ_CFG_COLORS = {
  title: "Keyingi rang qaysi?",
  voice: "Ranglar naqshiga diqqat bilan qarang. Keyingi rang qaysi bo'lishi kerak?",
  // har kirganda: 6 rangdan tasodifiy 3 tasi sikl bo'ladi — naqsh
  // ranglari, boshlanish nuqtasi va javob har safar boshqacha
  palette: ['#FF5A4E', '#FFD34D', '#4A90E2', '#43C465', '#B06BFF', '#FF8FB3'],
  paletteKind: 'balloon',
  len: 5,
  // Bayram kayfiyati: shaftoli -> pushti -> och ko'k gradient, sharlar
  theme: {
    bg: 'linear-gradient(180deg, #FFEFD9 0%, #FFE4EC 46%, #DDEBFF 100%)',
    decor: [
      { kind: 'balloon', c: '#E86A5E', x: 8,  y: 12, s: 76, o: 0.45 },
      { kind: 'balloon', c: '#F6C45A', x: 50, y: 7,  s: 58, o: 0.42 },
      { kind: 'balloon', c: '#7FB8E8', x: 91, y: 12, s: 76, o: 0.45 },
      { kind: 'star5',   c: '#F6C45A', x: 27, y: 5,  s: 34, o: 0.45 },
      { kind: 'star5',   c: '#B48CE0', x: 72, y: 5,  s: 30, o: 0.42 },
      { kind: 'kite',    c: '#7FCB8F', x: 5,  y: 54, s: 64, o: 0.38, r: -12 },
      { kind: 'candy',   c: '#E86A8A', x: 95, y: 54, s: 50, o: 0.4 },
      { kind: 'gift',    c: '#F2A45E', x: 8,  y: 94, s: 50, o: 0.48 },
      { kind: 'cake',    c: '#F2A9C4', x: 33, y: 96, s: 46, o: 0.42 },
      { kind: 'star5',   c: '#FF8FB3', x: 62, y: 96, s: 30, o: 0.42 },
      { kind: 'gift',    c: '#7FCB8F', x: 91, y: 94, s: 50, o: 0.48 },
    ],
  },
};

// ============================================================
// FORMAT 1 — FARQ TOP (8, 9, 10, 16-sahifalar).
// Ikki deyarli bir xil rasm; o'ng rasmda `alt` belgili ob'ektlar farq:
//   alt.c — rang o'zgargan · alt.kind — shakl almashgan · alt.ghost — yo'qolgan
//   (ghost: o'ngda ko'rinmas tugma — bola bo'sh joyni topib bosadi).
// Farqni IKKALA rasmning qaysi birida bossa ham hisoblanadi.
// Har topilgan farq = 1 yulduz; hammasi topilgach avto-o'tish.
// Pastda topilgan farqlar doirachalari (spets: "bo'sh doirachalar").
// ============================================================
// IKKALA rasm ham bosiladi: farq qaysi rasmda bosilsa ham hisoblanadi.
// `altered` — o'ng rasm (alt qo'llanadi); chapda ob'ektlar asl holida.
// `lantern` — SEHRLI FONAR rejimi: panel qop-qorong'i, nur doirasi
//   barmoq/sichqonchaga ergashadi; farqlar faqat yorug'likda ko'rinadi.
const FIREFLIES = [
  { x: 18, y: 22, d: 0 }, { x: 72, y: 14, d: 1.1 }, { x: 88, y: 46, d: 0.5 },
  { x: 12, y: 66, d: 1.7 }, { x: 46, y: 38, d: 2.3 }, { x: 64, y: 78, d: 0.8 },
];
// `lanternMode` — sahifada fonar rejimi yoqilgan; `dark` — HOZIR qorong'ulik
// shu panelda (sichqoncha/barmoq qaysi panelda bo'lsa — o'shanisi qorong'u,
// ikkinchisi yorug' qoladi); `onClaimDark` — qorong'ulikni shu panelga olish.
const DiffPanel = ({ scene, altered, found, shaking, onPick, label, lanternMode, dark, onClaimDark }) => {
  const [beam, setBeam] = useState({ x: 50, y: 45 });
  const moveBeam = (e) => {
    if (!lanternMode) return;
    if (!dark) onClaimDark?.();
    const r = e.currentTarget.getBoundingClientRect();
    setBeam({
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    });
  };
  return (
  <div className={`d1-panel ${shaking ? 'd1-shake' : ''}`}
    onPointerMove={moveBeam} onPointerDown={moveBeam}
    style={{ background: `linear-gradient(180deg, ${scene.bg[0]}, ${scene.bg[1]})` }}>
    <span className="d1-panel-tag">{label}</span>
    {scene.objects.map((o, i) => {
      const isDiff = !!o.alt;
      const isFound = found && found.has(i);
      const style = { left: `${o.x}%`, top: `${o.y}%`, width: `${o.s}%`, animationDelay: `${(i % 5) * 0.35}s` };
      // faqat o'ng rasmda alt qo'llanadi; g'oyib bo'lgan ob'ekt chapda ko'rinadi
      const ghost = altered && isDiff && o.alt.ghost;
      const kind = altered && isDiff && o.alt.kind ? o.alt.kind : o.kind;
      const color = altered && isDiff && o.alt.c ? o.alt.c : o.c;
      return (
        <button key={i} type="button"
          className={`d1-obj d1-obj-btn ${isFound ? 'd1-hit-ok' : ''} ${ghost && !isFound ? 'd1-ghost' : ''}`}
          style={style}
          disabled={isFound}
          onClick={(e) => onPick(i, e.currentTarget)}
          aria-label={o.kind}>
          {/* g'oyib bo'lgan ob'ekt: topilgach xira ko'rinadi, aks holda ko'rinmas tugma */}
          {ghost ? (isFound && <span style={{ opacity: 0.35, display: 'block', width: '100%', height: '100%' }}><ObjIcon kind={o.kind} c={o.c}/></span>)
                 : <ObjIcon kind={kind} c={color}/>}
          {isFound && <ConfettiBurst/>}
        </button>
      );
    })}
    {lanternMode && dark && (
      <div className="d1-dark" aria-hidden="true"
        style={{ background: `radial-gradient(circle at ${beam.x}% ${beam.y}%, rgba(255,240,178,0.25) 0px, rgba(255,236,160,0.08) 92px, rgba(255,214,110,0.28) 122px, rgba(255,200,80,0.10) 134px, rgba(13,16,54,0.6) 175px)` }}>
        {FIREFLIES.map((f, i) => (
          <span key={i} className="d1-firefly" style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.d}s` }}/>
        ))}
      </div>
    )}
  </div>
  );
};

// TASODIFIY SAHNA QURISH (cfg.randomize bo'lsa): har kirganda
//   1) sahna 50/50 ehtimol bilan ko'zgudagidek o'giriladi (x -> 100-x);
//   2) `alts` zaxirasiga ega ob'ektlardan diffCount tasi tasodifiy tanlanib,
//      har biriga zaxiradan tasodifiy bitta farq beriladi.
// Natija: bola qayta kirsa — boshqa joylashuv, boshqa farqlar.
const buildDiffScene = (cfg) => {
  if (!cfg.randomize) return cfg.scene;
  const mirror = Math.random() < 0.5;
  const objects = cfg.scene.objects.map((o) => ({
    ...o,
    x: mirror ? 100 - o.x : o.x,
    alt: undefined,
  }));
  const candidates = cfg.scene.objects.map((o, i) => (o.alts ? i : -1)).filter(i => i >= 0);
  shuffleArr(candidates).slice(0, cfg.diffCount).forEach((i) => {
    const pool = cfg.scene.objects[i].alts;
    objects[i].alt = pool[Math.floor(Math.random() * pool.length)];
  });
  return { ...cfg.scene, objects };
};

const DiffPage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [scene] = useState(() => buildDiffScene(cfg));
  const [found, setFound] = useState(() => new Set());
  const [shaking, shake] = useShake();
  // fonar rejimida qorong'ulik SICHQONCHAGA ERGASHADI: kursor qaysi
  // panelda bo'lsa — o'shanisi tun bo'lib fonar yonadi, ikkinchisi yorug'
  const [darkSide, setDarkSide] = useState('right');
  const diffIdxs = scene.objects.map((o, i) => (o.alt ? i : -1)).filter(i => i >= 0);
  const allFound = found.size === diffIdxs.length;

  const pick = (i, el) => {
    if (allFound || found.has(i)) return;
    const o = scene.objects[i];
    if (o.alt) {
      const next = new Set(found); next.add(i);
      setFound(next);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === diffIdxs.length);
    } else {
      shake();
    }
  };

  return (
    <PageShell title={cfg.title} onBack={onBack} onNext={onNext} nextOk={allFound}>
      <div className={`d1-shadow-card d1-diff-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        <div className="d1-pair">
          <DiffPanel scene={scene} altered={false} found={found} shaking={shaking} onPick={pick} label="1"
            lanternMode={cfg.lantern} dark={darkSide === 'left'} onClaimDark={() => setDarkSide('left')}/>
          <div className="d1-vs" aria-hidden="true">
            <svg viewBox="0 0 60 60" width="100%" height="100%">
              <circle cx="30" cy="30" r="26" fill="#FFFFFF"/>
              <circle cx="26" cy="26" r="14" fill="none" stroke="#7A5230" strokeWidth="5"/>
              <rect x="36" y="36" width="14" height="7" rx="3.5" fill="#7A5230" transform="rotate(45 36 36)"/>
            </svg>
          </div>
          <DiffPanel scene={scene} altered found={found} shaking={shaking} onPick={pick} label="2"
            lanternMode={cfg.lantern} dark={darkSide === 'right'} onClaimDark={() => setDarkSide('right')}/>
        </div>
        {/* topilgan farqlar doirachalari */}
        <div className="d1-diff-dots" aria-label={`${found.size} / ${diffIdxs.length} farq topildi`}>
          {diffIdxs.map((_, i) => (
            <span key={i} className={`d1-diff-dot ${i < found.size ? 'on' : ''}`}>
              {i < found.size ? '✓' : ''}
            </span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ---- 6 ta farq-top sahnasi (spets bo'yicha) ----
const DIFF_CFG_TOYS = {
  title: "Ikkita rasmga diqqat bilan qarang va ulardagi farqlarni Toping va ustiga bosing",
  voice: "Hoy, chaqqon izquvar! ... Bu ikkita rasm bir qarashda bir xildek, ... lekin ularning orasida yashirinib olgan farqlar bor! ... " +
    "Ikkala rasmga ham... diq-qat bi-lan... yaxshilab qarang! ... " +
    "Ular oʻrtasidagi farqlarni topa olasizmi? ... Qani, topgan farqlaringizni ustiga birma-bir bosing! Boshladik!",
  // har kirganda: sahna ko'zguda o'girilishi mumkin + 3 farq zaxiradan tasodifiy
  randomize: true,
  diffCount: 3,
  scene: {
    bg: ['#FFF6E8', '#FFDFBC'],
    objects: [
      { kind: 'frame',   x: 28, y: 16, s: 26, c: '#5AC8FA', alts: [{ kind: 'lamp', c: '#FFD34D' }, { c: '#FFB03A' }, { ghost: true }] },
      { kind: 'bowbear', x: 25, y: 60, s: 38, c: '#F2647C', alts: [{ c: '#4A90E2' }, { c: '#43C465' }] },
      { kind: 'pyramid', x: 58, y: 77, s: 28, c: '#43C465', alts: [{ c: '#B06BFF' }, { ghost: true }] },
      { kind: 'cube',    x: 78, y: 40, s: 23, c: '#4A90E2', alts: [{ c: '#FFD34D' }, { kind: 'ball' }] },
      { kind: 'cube',    x: 84, y: 75, s: 23, c: '#FF5A4E', alts: [{ ghost: true }, { c: '#43C465' }] },
      { kind: 'ball',    x: 55, y: 37, s: 18, c: '#8E5AE8', alts: [{ c: '#FF5A4E' }, { ghost: true }] },
    ],
  },
  // O'yin xonasi: siyohrang-krem devor, chetlarda o'yinchoq dekorlar
  theme: {
    bg: 'linear-gradient(180deg, #F3ECFA 0%, #F8F1EE 48%, #FFEAD2 100%)',
    decor: [
      { kind: 'balloon', c: '#7FB8E8', x: 6,  y: 10, s: 64, o: 0.4 },
      { kind: 'star5',   c: '#F6C45A', x: 30, y: 5,  s: 32, o: 0.38 },
      { kind: 'star5',   c: '#B48CE0', x: 70, y: 5,  s: 28, o: 0.35 },
      { kind: 'kite',    c: '#E86A8A', x: 94, y: 9,  s: 66, o: 0.38, r: 12 },
      { kind: 'car',     c: '#F2A45E', x: 5,  y: 94, s: 46, o: 0.45 },
      { kind: 'gift',    c: '#7FCB8F', x: 28, y: 96, s: 40, o: 0.42 },
      { kind: 'ball',    c: '#E86A8A', x: 72, y: 96, s: 36, o: 0.42 },
      { kind: 'bear',    c: '#C98A4B', x: 95, y: 94, s: 44, o: 0.4 },
    ],
  },
};
const DIFF_CFG_ZOO = {
  title: "Onasi va bolasi! 3 ta farqni toping va ustiga bosing",
  voice: "Qarang, hayvonlarning onalari bolajonlari bilan sayrga chiqishdi! Ikki rasmni diqqat bilan solishtiring: qaysi bolajon o'zgarib qoldi? Uchta farqni topib bosing.",
  scene: {
    bg: ['#DFF3FF', '#C9ECB4'],
    objects: [
      { kind: 'sun',        x: 12, y: 12, s: 16, c: '#FFD34D' },
      { kind: 'cloud',      x: 52, y: 10, s: 18, c: '#FFFFFF' },
      { kind: 'butterfly',  x: 84, y: 16, s: 13, c: '#B06BFF' },
      { kind: 'tree',       x: 8,  y: 50, s: 26, c: '#43A85C' },
      // Mushuk oilasi: katta ona + kichkina bolasi
      { kind: 'cat',        x: 27, y: 52, s: 25, c: '#F2A45E' },
      { kind: 'cat',        x: 40, y: 70, s: 13, c: '#F2A45E', alt: { c: '#4A90E2' } },       // mushukcha ko'k bo'lib qoldi
      // Yo'lbars oilasi
      { kind: 'tigerFace',  x: 57, y: 48, s: 21, c: '#F5A623' },
      { kind: 'tigerFace',  x: 68, y: 66, s: 12, c: '#F5A623', alt: { kind: 'monkeyFace' } }, // yo'lbars bolasi maymunchaga aylandi
      // Quyon oilasi
      { kind: 'rabbit',     x: 85, y: 50, s: 17, c: '#C08552' },
      { kind: 'rabbit',     x: 91, y: 72, s: 10, c: '#C08552', alt: { ghost: true } },        // quyon bolasi bekinib oldi
    ],
  },
  // Hayvonot bog'i: osmon-o'tloq gradient, chetlarda daraxt/shar/kapalak dekorlar
  theme: {
    bg: 'linear-gradient(180deg, #E3F4FD 0%, #EDF8E4 52%, #FFF3D6 100%)',
    decor: [
      { kind: 'tree',      c: '#4FA86A', x: 5,  y: 12, s: 66, o: 0.34 },
      { kind: 'balloon',   c: '#E86A8A', x: 30, y: 5,  s: 36, o: 0.38 },
      { kind: 'butterfly', c: '#B48CE0', x: 70, y: 5,  s: 34, o: 0.36 },
      { kind: 'tree',      c: '#6BBF7E', x: 95, y: 11, s: 58, o: 0.32 },
      { kind: 'flower',    c: '#E86A8A', x: 6,  y: 94, s: 34, o: 0.4 },
      { kind: 'flower',    c: '#F6C45A', x: 28, y: 96, s: 30, o: 0.38 },
      { kind: 'bird',      c: '#7FB8E8', x: 72, y: 96, s: 34, o: 0.4 },
      { kind: 'flower',    c: '#B06BFF', x: 94, y: 94, s: 32, o: 0.38 },
    ],
  },
};
// SAHIFA 9 — SEHRLI FONAR (yengil variant, 6-7 yosh): o'ng rasmda "kech
// kirgan" — yarim shaffof qorong'ilik, rasm xira ko'rinib turadi; barmoq
// yurgizilganda katta fonar nuri ergashib, o'sha joyni yop-yorug' qiladi.
// 4 ta yirik, ko'zga tashlanadigan farq: uy rangi, mushukcha rangi,
// gulga aylangan qo'ziqorin, bekinib olgan quyoncha.
const DIFF_CFG_NIGHT = {
  title: "Sehrli fonar bilan 4 ta farqni toping!",
  voice: " ... Qarang, atrof birdan qorongʻu boʻlib qoldi-ku! ... Lekin sizda ajoyib bir narsa bor! ... " +
    "Sehrli fonaringni yoqing... va uni qorongʻu rasm ustida... se-kin... yuritib koʻring! ... " +
    "U yerga yashiringan... toʻrtta farqni topa olasizmi? ... Qani, sehrgarlikni boshlang va hamma farqlarni topib, ustiga bosing!",
  lantern: true,
  // har kirganda: sahna ko'zguda o'girilishi mumkin + 4 farq zaxiradan tasodifiy
  randomize: true,
  diffCount: 4,
  scene: {
    bg: ['#3A4A9C', '#28356F'],
    objects: [
      { kind: 'moon',     x: 14, y: 15, s: 18, c: '#FFE9A8', alts: [{ c: '#5AC8FA' }] },
      { kind: 'star5',    x: 40, y: 11, s: 11, c: '#FFD34D', alts: [{ ghost: true }, { c: '#FF8A3C' }] },
      { kind: 'cloud',    x: 82, y: 11, s: 16, c: '#8FA3D8', alts: [{ c: '#F2A9C4' }] },
      { kind: 'house',    x: 76, y: 42, s: 28, c: '#F2A45E', alts: [{ c: '#B06BFF' }, { c: '#43C465' }] },
      { kind: 'tree',     x: 11, y: 52, s: 28, c: '#2E7D4F', alts: [{ c: '#F6C45A' }, { ghost: true }] },
      { kind: 'cat',      x: 32, y: 72, s: 24, c: '#F2A45E', alts: [{ c: '#5AC8FA' }, { ghost: true }] },
      { kind: 'mushroom', x: 56, y: 82, s: 17, c: '#FF5A4E', alts: [{ kind: 'flower' }, { c: '#B06BFF' }] },
      { kind: 'rabbit',   x: 89, y: 76, s: 18, c: '#EDE7DC', alts: [{ ghost: true }, { c: '#F2A45E' }] },
    ],
  },
  // Tungi osmon: to'q siyohrang gradient, xira yulduz-oy dekorlar
  theme: {
    bg: 'linear-gradient(180deg, #2E3A7C 0%, #45408F 52%, #7B5EA8 100%)',
    decor: [
      { kind: 'moon',   c: '#FFE9A8', x: 6,  y: 8,  s: 52, o: 0.35 },
      { kind: 'star5',  c: '#FFD34D', x: 30, y: 5,  s: 26, o: 0.4 },
      { kind: 'star5',  c: '#FFD34D', x: 70, y: 6,  s: 30, o: 0.38 },
      { kind: 'star5',  c: '#FFF3C4', x: 94, y: 10, s: 22, o: 0.35 },
      { kind: 'star5',  c: '#FFD34D', x: 5,  y: 94, s: 24, o: 0.32 },
      { kind: 'lamp',   c: '#FFD34D', x: 28, y: 96, s: 38, o: 0.4 },
      { kind: 'star5',  c: '#FFF3C4', x: 72, y: 96, s: 26, o: 0.34 },
      { kind: 'moon',   c: '#FFE9A8', x: 95, y: 93, s: 36, o: 0.3 },
    ],
  },
};
const DIFF_CFG_FOREST = {
  title: "O'rmonda nima o'zgardi?",
  voice: "O'rmon do'stlarimizga qarang. Ular orasida nima o'zgargan ekan?",
  scene: {
    bg: ['#CDEFDD', '#A8E0C0'],
    objects: [
      { kind: 'tree',     x: 18, y: 36, s: 30, c: '#43A85C' },
      { kind: 'tree',     x: 84, y: 58, s: 22, c: '#2FA45C', alt: { ghost: true } },       // pastroq daraxt yo'qoldi
      { kind: 'squirrel', x: 40, y: 72, s: 24, c: '#E07B39', alt: { c: '#8E5AE8' } },      // sincap dumi rangi
      { kind: 'hedgehog', x: 66, y: 80, s: 22, c: '#6B4A2B', alt: { kind: 'hedgehogFew' } }, // ninalar soni
      { kind: 'rabbit',   x: 72, y: 36, s: 22, c: '#EDE7DC' },
      { kind: 'mushroom', x: 26, y: 84, s: 16, c: '#FF5A4E' },
    ],
  },
};
const DIFF_CFG_SPACE = {
  title: "Kosmosda 4 ta farq bor!",
  voice: "Endi kosmosga uchamiz! Yulduzlar orasida nima o'zgargan ekan? To'rtta farqni qidiring.",
  // har kirganda: sahna ko'zguda o'girilishi mumkin + 4 farq zaxiradan tasodifiy
  randomize: true,
  diffCount: 4,
  scene: {
    bg: ['#3A3480', '#241F52'],
    objects: [
      { kind: 'star5',  x: 12, y: 18, s: 13, c: '#FFD34D', alts: [{ ghost: true }, { c: '#FF8A3C' }] },
      { kind: 'moon',   x: 50, y: 12, s: 16, c: '#FFE9A8', alts: [{ c: '#5AC8FA' }, { ghost: true }] },
      { kind: 'star5',  x: 86, y: 14, s: 11, c: '#FFF3C4' },
      { kind: 'planet', x: 78, y: 38, s: 30, c: '#3CE0C8', alts: [{ kind: 'planetPlain' }, { c: '#FF8FB3' }] },
      { kind: 'rocket', x: 28, y: 52, s: 34, c: '#FF5A4E', alts: [{ c: '#43C465' }, { c: '#5AC8FA' }] },
      { kind: 'star5',  x: 55, y: 42, s: 10, c: '#FFD34D', alts: [{ c: '#F2A9C4' }, { ghost: true }] },
      { kind: 'planet', x: 14, y: 80, s: 24, c: '#B06BFF', alts: [{ c: '#F6C45A' }, { kind: 'planetPlain' }] },
      { kind: 'moon',   x: 88, y: 74, s: 20, c: '#FFE9A8', alts: [{ c: '#5AC8FA' }, { c: '#F2A9C4' }] },
      { kind: 'star5',  x: 60, y: 84, s: 12, c: '#FFD34D', alts: [{ ghost: true }, { c: '#5AC8FA' }] },
    ],
  },
  // Kosmik osmon: to'q binafsha gradient, sayyora-yulduz-raketa dekorlari
  theme: {
    bg: 'linear-gradient(180deg, #2A2560 0%, #453B8C 52%, #6B4FA8 100%)',
    decor: [
      { kind: 'planet', c: '#3CE0C8', x: 6,  y: 9,  s: 54, o: 0.35 },
      { kind: 'star5',  c: '#FFD34D', x: 30, y: 5,  s: 26, o: 0.4 },
      { kind: 'star5',  c: '#FFF3C4', x: 70, y: 6,  s: 30, o: 0.38 },
      { kind: 'moon',   c: '#FFE9A8', x: 94, y: 10, s: 44, o: 0.35 },
      { kind: 'star5',  c: '#FFD34D', x: 5,  y: 93, s: 24, o: 0.35 },
      { kind: 'rocket', c: '#FF8A3C', x: 27, y: 96, s: 44, o: 0.4, r: -20 },
      { kind: 'star5',  c: '#FFF3C4', x: 72, y: 96, s: 26, o: 0.36 },
      { kind: 'planet', c: '#B48CE0', x: 94, y: 92, s: 46, o: 0.35 },
    ],
  },
};
// ============================================================
// FORMAT 9 — ORTIQCHASINI TOP (20-sahifa). 4 ekran ketma-ket, har birida
// 4 ta KATTA predmet oq doiralarda, bittasi guruhga to'g'ri kelmaydi:
//   1) mevalar + yeb bo'lmaydigan narsa   2) jonivorlar + jonsiz narsa
//   3) bir rangdagi shakllar + boshqa rang 4) katta ayiqlar + kichkinasi
// To'g'ri bosilsa: yulduz + yashil ramka -> keyingi ekran. 4/4 = tugadi.
// Har kirganda: har ekran tarkibi zaxiradan tasodifiy quriladi va
// predmetlar tartibi aralashadi — ortiqchasi goh chetda, goh o'rtada.
// ============================================================
const ODDOUT_VOICE = "Qarang — bu yerdagi narsalar bir-biriga o'xshaydi. Lekin bittasi ular orasiga to'g'ri kelmaydi. Ortiqchasini topib bering!";
const oddPick = (arr, n) => shuffleArr([...arr]).slice(0, n);
const buildOddRounds = () => {
  // 1-ekran: 3 meva + yeb bo'lmaydigan narsa
  const fruits = oddPick([
    { kind: 'apple',  c: '#FF5A4E' },
    { kind: 'banana', c: '#FFD34D' },
    { kind: 'grape',  c: '#8E5AE8' },
    { kind: 'pear',   c: '#A8CC5A' },
    { kind: 'orange', c: '#F2A45E' },
  ], 3);
  const [notFood] = oddPick([
    { kind: 'ball', c: '#4A90E2' },
    { kind: 'car',  c: '#F5C518' },
    { kind: 'cube', c: '#5AC8FA' },
  ], 1);
  // 2-ekran: 3 jonivor + jonsiz narsa
  const animals = oddPick([
    { kind: 'cat',    c: '#F5A623' },
    { kind: 'rabbit', c: '#C08552' },
    { kind: 'bird',   c: '#5AC8FA' },
    { kind: 'fox',    c: '#FF7A3C' },
  ], 3);
  const [notAlive] = oddPick([
    { kind: 'car',  c: '#FF5A4E' },
    { kind: 'gift', c: '#B06BFF' },
    { kind: 'cube', c: '#4A90E2' },
  ], 1);
  // 3-ekran: bir rangdagi 3 xil shakl + shu shakllardan biri BOSHQA rangda
  const [baseC, oddC] = oddPick(['#FF5A4E', '#4A90E2', '#43C465', '#FFB03A', '#B06BFF'], 2);
  const shapes = oddPick([{ kind: 'dot' }, { kind: 'star5' }, { kind: 'heart' }, { kind: 'square' }], 3);
  // 4-ekran: 3 katta ayiq + kichkina ayiq
  const bear = { kind: 'bear', c: '#C98A4B' };
  return [
    { items: shuffleArr([...fruits, { ...notFood, odd: true }]) },
    { items: shuffleArr([...animals, { ...notAlive, odd: true }]) },
    { items: shuffleArr([...shapes.map(s => ({ ...s, c: baseC })), { ...shapes[0], c: oddC, odd: true }]) },
    { items: shuffleArr([{ ...bear }, { ...bear }, { ...bear }, { ...bear, small: true, odd: true }]) },
  ];
};
// Karta: oq-yumshoq sariq fon, chetlarda mayin yulduz-quyosh dekorlari
const ODDOUT_THEME = {
  bg: 'linear-gradient(180deg, #FFFDF4 0%, #FFF6DC 55%, #FFEFC2 100%)',
  decor: [
    { kind: 'star5',  c: '#F6C45A', x: 6,  y: 9,  s: 30, o: 0.4 },
    { kind: 'star5',  c: '#B48CE0', x: 30, y: 5,  s: 24, o: 0.35 },
    { kind: 'star5',  c: '#7FB8E8', x: 70, y: 6,  s: 26, o: 0.35 },
    { kind: 'sun',    c: '#FFD34D', x: 93, y: 10, s: 52, o: 0.35 },
    { kind: 'flower', c: '#F2A9C4', x: 6,  y: 92, s: 32, o: 0.4 },
    { kind: 'star5',  c: '#F6C45A', x: 28, y: 96, s: 24, o: 0.36 },
    { kind: 'flower', c: '#F6C45A', x: 72, y: 96, s: 30, o: 0.4 },
    { kind: 'star5',  c: '#FF8FB3', x: 94, y: 92, s: 26, o: 0.38 },
  ],
};

const OddOutPage = ({ onBack, onNext }) => {
  const voice = useVoice(ODDOUT_VOICE);
  const { onCorrect } = useFlightApi();
  const [rounds] = useState(buildOddRounds);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(0);          // yakunlangan ekranlar
  const [okIdx, setOkIdx] = useState(null);     // shu ekranda topilgani
  const [shaking, shake] = useShake();          // xatoda butun ekran qimirlaydi
  const [shakeIdx, setShakeIdx] = useState(null);
  const shakeTimer = useRef(null);
  const nextTimer = useRef(null);
  useEffect(() => () => { clearTimeout(shakeTimer.current); clearTimeout(nextTimer.current); }, []);

  const allDone = done === rounds.length;
  const items = rounds[round].items;

  const pick = (it, i, el) => {
    if (okIdx !== null || allDone) return;
    if (it.odd) {
      setOkIdx(i);
      setDone(d => d + 1);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      const last = round === rounds.length - 1;
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, last);
      // yulduz uchib bo'lgach keyingi ekran ochiladi
      if (!last) {
        nextTimer.current = setTimeout(() => { setRound(v => v + 1); setOkIdx(null); }, 1100);
      }
    } else {
      sfxHmm();
      shake();
      setShakeIdx(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeIdx(i);
        shakeTimer.current = setTimeout(() => setShakeIdx(null), 500);
      });
    }
  };

  return (
    <PageShell title="Ortiqchasini toping!" onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card themed ${shaking ? 'd1-shake' : ''}`}>
        <ThemeBg theme={ODDOUT_THEME}/>
        <div key={round} className="d1-oddout-row fade-up">
          {items.map((it, i) => (
            <button key={i} type="button"
              className={`d1-oddout-item ${okIdx === i ? 'ok' : ''} ${shakeIdx === i ? 'd1-shake' : ''}`}
              onClick={(e) => pick(it, i, e.currentTarget)} aria-label={it.kind}>
              <span className="d1-oddout-icon" style={{ width: it.small ? '52%' : '80%' }}>
                <ObjIcon kind={it.kind} c={it.c}/>
              </span>
              {okIdx === i && <ConfettiBurst/>}
            </button>
          ))}
        </div>
        {/* ekranlar progressi */}
        <div className="d1-diff-dots" aria-label={`${done} / ${rounds.length} ekran yakunlandi`}>
          {rounds.map((_, i) => (
            <span key={i} className={`d1-diff-dot ${i < done ? 'on' : ''}`}>{i < done ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 10 — QAYSI DO'STIMIZ RANGINI O'ZGARTIRDI? (yodlash o'yini)
// 1-ekran: yumshoq yashil o'tloqda 4 ta quvnoq hayvon yonma-yon
//   (quyon, mushuk, ayiq, tulki), tepada 3 ta yonib turgan
//   lampochka-taymer; ovoz sanagan sari lampochkalar birma-bir o'chadi.
// 2-ekran: xuddi shu qator, lekin BITTASI rangini o'zgartirgan;
//   pastdagi 4 ta yuz-ikonkadan o'sha do'stni topish kerak.
// Har kirganda: QAYSI hayvon va QAYSI rangga o'zgarishi tasodifiy —
//   bola qayta kirsa boshqa do'st boshqa rangga bo'yalgan bo'ladi.
// ============================================================
const CC_VOICE = "Bu do'stlarimizga diqqat bilan qarang va yaxshilab yodlab oling... uch... ikki... bir... Endi ayting-chi, ulardan qaysi biri o'zgarib qoldi?";
const CC_ANIMALS = [
  { id: 'rabbit', kind: 'rabbit', c: '#F2A9C4', alts: ['#43C465', '#4A90E2', '#8E5AE8'] },
  { id: 'cat',    kind: 'cat',    c: '#F5A623', alts: ['#4A90E2', '#43C465', '#8E5AE8'] },
  { id: 'bear',   kind: 'bear',   c: '#C98A4B', alts: ['#43C465', '#5AC8FA', '#8E5AE8'] },
  { id: 'fox',    kind: 'fox',    c: '#FF7A3C', alts: ['#4A90E2', '#43C465', '#B06BFF'] },
];
// o'tloq chetidagi bezaklar: quyosh, bulut, gullar, kapalak
const CC_DECOR = [
  { kind: 'sun',       c: '#FFD34D', x: 8,  y: 16, s: 52, o: 0.55 },
  { kind: 'cloud',     c: '#FFFFFF', x: 30, y: 10, s: 44, o: 0.7 },
  { kind: 'cloud',     c: '#FFFFFF', x: 72, y: 14, s: 52, o: 0.6 },
  { kind: 'butterfly', c: '#B48CE0', x: 92, y: 22, s: 30, o: 0.55 },
  { kind: 'flower',    c: '#F2A9C4', x: 6,  y: 90, s: 30, o: 0.6 },
  { kind: 'flower',    c: '#F6C45A', x: 22, y: 94, s: 26, o: 0.55 },
  { kind: 'flower',    c: '#E86A5E', x: 78, y: 94, s: 28, o: 0.55 },
  { kind: 'flower',    c: '#B06BFF', x: 93, y: 90, s: 30, o: 0.6 },
];

// Karta orqa foni: osmon-o'tloq gradient, chetlarda daraxt/shar/gul dekorlar
const CC_THEME = {
  bg: 'linear-gradient(180deg, #E3F4FD 0%, #EDF8E4 50%, #D6F0C8 100%)',
  decor: [
    { kind: 'tree',      c: '#4FA86A', x: 5,  y: 12, s: 64, o: 0.34 },
    { kind: 'balloon',   c: '#E86A8A', x: 30, y: 5,  s: 36, o: 0.38 },
    { kind: 'butterfly', c: '#B48CE0', x: 70, y: 5,  s: 34, o: 0.36 },
    { kind: 'tree',      c: '#6BBF7E', x: 95, y: 11, s: 58, o: 0.32 },
    { kind: 'flower',    c: '#E86A8A', x: 6,  y: 94, s: 34, o: 0.4 },
    { kind: 'flower',    c: '#F6C45A', x: 28, y: 96, s: 30, o: 0.38 },
    { kind: 'bird',      c: '#7FB8E8', x: 72, y: 96, s: 34, o: 0.4 },
    { kind: 'flower',    c: '#B06BFF', x: 94, y: 94, s: 32, o: 0.38 },
  ],
};

// Lampochka-taymer: yonganda sariq nur taratadi, o'chganda kulranglashadi
const BulbIcon = ({ on }) => (
  <svg viewBox="0 0 40 54" width="100%" height="100%" aria-hidden="true">
    {on && (
      <g stroke="#FFC23C" strokeWidth="2.6" strokeLinecap="round">
        <path d="M20 3 v-1 M6 8 l-2 -2 M34 8 l2 -2 M3 20 h-2 M37 20 h2"/>
      </g>
    )}
    <circle cx="20" cy="20" r="13" fill={on ? '#FFD34D' : '#CFCAD9'}/>
    <circle cx="16" cy="16" r="4" fill={on ? '#FFF3C4' : '#E2DEEA'}/>
    <path d="M16 32 h8 v4 a4 4 0 0 1 -8 0 Z" fill={on ? '#C98A4B' : '#A9A4B8'}/>
    <path d="M16 34 h8 M16 37 h8" stroke={on ? '#8F6234' : '#8B8798'} strokeWidth="1.4"/>
  </svg>
);

const ColorChangePage = ({ onBack, onNext }) => {
  const voice = useVoice(CC_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda tasodifiy sir: qaysi do'st va qaysi yangi rang
  const [secret] = useState(() => {
    const a = CC_ANIMALS[Math.floor(Math.random() * CC_ANIMALS.length)];
    return { id: a.id, kind: a.kind, c: a.alts[Math.floor(Math.random() * a.alts.length)] };
  });
  const [lamps, setLamps] = useState(3);          // yonib turgan lampochkalar soni
  const [phase, setPhase] = useState('show');     // show -> quiz
  const [solved, setSolved] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  // ovozdagi "uch... ikki... bir..." sanog'iga mos: har sanoqda 1 lampochka o'chadi
  useEffect(() => {
    const t = [
      setTimeout(() => setLamps(2), 3500),
      setTimeout(() => setLamps(1), 4500),
      setTimeout(() => { setLamps(0); setPhase('quiz'); }, 5500),
    ];
    return () => { t.forEach(clearTimeout); clearTimeout(shakeTimer.current); };
  }, []);

  const pick = (a, el) => {
    if (solved || phase !== 'quiz') return;
    if (a.id === secret.id) {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      sfxHmm();
      setShakeId(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeId(a.id);
        shakeTimer.current = setTimeout(() => setShakeId(null), 500);
      });
    }
  };

  return (
    <PageShell title={phase === 'quiz' ? "Qaysi do'stimiz o'zgarib qoldi?" : "Do'stlarni yodlab oling!"}
      onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d1-shadow-card themed">
        <ThemeBg theme={CC_THEME}/>
        {/* o'tloq sahnasi */}
        <div className="d1-cc-scene">
          {CC_DECOR.map((d, i) => (
            <span key={i} className="d1-cc-decor"
              style={{ left: `${d.x}%`, top: `${d.y}%`, width: `clamp(${Math.round(d.s * 0.55)}px, ${d.s / 9}vw, ${d.s}px)`, opacity: d.o }}>
              <ObjIcon kind={d.kind} c={d.c}/>
            </span>
          ))}
          {/* lampochka-taymer (faqat yodlash ekranida) */}
          {phase === 'show' && (
            <div className="d1-cc-lamps" aria-label={`${lamps} soniya qoldi`}>
              {[0, 1, 2].map(i => (
                <span key={i} className={`d1-cc-bulb ${i < lamps ? 'on' : ''}`}>
                  <BulbIcon on={i < lamps}/>
                </span>
              ))}
            </div>
          )}
          {/* 4 quvnoq do'st qatori */}
          <div className="d1-cc-row">
            {CC_ANIMALS.map((a) => {
              const changed = phase === 'quiz' && a.id === secret.id;
              return (
                <span key={a.id} className={`d1-cc-animal ${changed ? 'changed' : ''}`}>
                  <ObjIcon kind={a.kind} c={changed ? secret.c : a.c}/>
                </span>
              );
            })}
          </div>
        </div>
        {/* variantlar — 4 do'stning asl rangdagi yuzlari */}
        {phase === 'quiz' && !solved && (
          <div className="d1-seq-opts fade-up">
            {CC_ANIMALS.map((a) => (
              <button key={a.id} type="button" className={`d1-seq-opt ${shakeId === a.id ? 'd1-shake' : ''}`}
                onClick={(e) => pick(a, e.currentTarget)} aria-label={a.id}>
                <ObjIcon kind={a.kind} c={a.c}/>
              </button>
            ))}
          </div>
        )}
        {solved && (
          <div className="d1-seq-opts">
            <span className="d1-seq-opt ok" style={{ position: 'relative' }}>
              <ObjIcon kind={secret.kind} c={secret.c}/>
              <ConfettiBurst/>
            </span>
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 11 — ORALIQ MOTIVATSIYA: sakrayotgan tulkicha, yulduzlar soni,
// konfetti + fanfar. "Davom etish" -> keyingi sahifa.
// ============================================================
const MOTIV_VOICE = "Voy, ajoyib! Siz bu bosqichni juda chiroyli bajardingiz. Men siz bilan g'ururlanaman! Keyingi bosqichga o'tishga tayyormisiz?";

const MotivationPage = ({ stars, onNext }) => {
  useVoice(MOTIV_VOICE);
  useEffect(() => { const id = setTimeout(sfxFanfare, 500); return () => clearTimeout(id); }, []);
  return (
    <div className="d1-final fade-up">
      <div className="d1-rain" aria-hidden="true">
        {RAIN.map(({ x, d, c }, i) => (
          <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
        ))}
      </div>
      <h1 className="d1-final-title">Ajoyib!</h1>
      <div className="d1-motiv-stars">
        <span className="d1-motiv-star"><GoldStar/></span>
        <span className="d1-motiv-num">x{stars}</span>
      </div>
      <div className="d1-final-fox"><FoxSVG mood="cheer"/></div>
      <button type="button" className="d1-start-btn" onClick={onNext}>
        Davom etish
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  );
};

// ============================================================
// FORMAT 2a — NIMA O'ZGARDI? (12-sahifa: mevalar savati).
// 1-bosqich: savat ko'rsatiladi (sanoq 3-2-1). 2-bosqich: bitta meva
// yo'qolgan; pastdagi 4 variantdan yo'qolganini top.
// ============================================================
const MEMORY_VOICE = "Bu savatga diqqat bilan qarang va uni yaxshilab yodlab oling... uch... ikki... bir... Endi ayting-chi — savatdan nima yo'qolib qoldi?";
const MEMORY_FRUITS = [
  { id: 'apple',  kind: 'apple',  c: '#FF5A4E' },
  { id: 'banana', kind: 'banana', c: '#FFD34D' },
  { id: 'grape',  kind: 'grape',  c: '#8E5AE8' },
  { id: 'pear',   kind: 'pear',   c: '#A8CC5A' },
];
// Karta orqa foni: mevazor bog' — iliq krem-yashil gradient, meva dekorlari
const MEMORY_THEME = {
  bg: 'linear-gradient(180deg, #FFF3D6 0%, #F2F8E4 48%, #D9F0CC 100%)',
  decor: [
    { kind: 'tree',   c: '#6BBF7E', x: 5,  y: 12, s: 62, o: 0.34 },
    { kind: 'apple',  c: '#E86A5E', x: 28, y: 6,  s: 30, o: 0.4 },
    { kind: 'sun',    c: '#FFD34D', x: 60, y: 6,  s: 44, o: 0.38 },
    { kind: 'pear',   c: '#A8CC5A', x: 82, y: 8,  s: 30, o: 0.4 },
    { kind: 'tree',   c: '#7FCB8F', x: 96, y: 16, s: 56, o: 0.32 },
    { kind: 'grape',  c: '#B48CE0', x: 5,  y: 92, s: 32, o: 0.4 },
    { kind: 'flower', c: '#F2A9C4', x: 28, y: 96, s: 30, o: 0.42 },
    { kind: 'orange', c: '#F2A45E', x: 72, y: 96, s: 30, o: 0.4 },
    { kind: 'flower', c: '#F6C45A', x: 94, y: 92, s: 32, o: 0.4 },
  ],
};

const MemoryBasketPage = ({ onBack, onNext }) => {
  const voice = useVoice(MEMORY_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda: mevalar tartibi aralashadi va QAYSI meva yo'qolishi
  // ham tasodifiy tanlanadi (goh banan, goh olma, goh uzum...).
  // savol bosqichida qolgan mevalar O'RINLARI ham almashadi —
  // bola joyiga qarab emas, eslab topishi kerak.
  const [{ fruits, missing, quizFruits }] = useState(() => {
    const f = shuffleArr([...MEMORY_FRUITS]);
    const missing = f[Math.floor(Math.random() * f.length)];
    return { fruits: f, missing, quizFruits: shuffleArr(f.filter(x => x.id !== missing.id)) };
  });
  const [phase, setPhase] = useState('show');     // show -> countdown -> quiz
  const [count, setCount] = useState(null);       // 3,2,1
  const [solved, setSolved] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  useEffect(() => {
    const t = [];
    t.push(setTimeout(() => setCount(3), 2500));
    t.push(setTimeout(() => setCount(2), 3500));
    t.push(setTimeout(() => setCount(1), 4500));
    t.push(setTimeout(() => { setCount(null); setPhase('quiz'); }, 5500));
    return () => { t.forEach(clearTimeout); clearTimeout(shakeTimer.current); };
  }, []);

  const pick = (f, el) => {
    if (solved || phase !== 'quiz') return;
    if (f.id === missing.id) {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      sfxHmm();
      setShakeId(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeId(f.id);
        shakeTimer.current = setTimeout(() => setShakeId(null), 500);
      });
    }
  };

  const visibleFruits = phase === 'quiz' ? quizFruits : fruits;

  return (
    <PageShell title={phase === 'quiz' ? "Savatdan nima yo'qoldi?" : "Savatni yodlab oling!"}
      onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d1-shadow-card themed">
        <ThemeBg theme={MEMORY_THEME}/>
        {/* savat sahnasi */}
        <div className="d1-mem-scene">
          <div className="d1-mem-fruits">
            {visibleFruits.map((f) => (
              <span key={f.id} className="d1-mem-fruit"><ObjIcon kind={f.kind} c={f.c}/></span>
            ))}
          </div>
          <div className="d1-mem-basket"><ObjIcon kind="basket" c="#C98A4B"/></div>
          {count !== null && <span key={count} className="d1-mem-count">{count}</span>}
        </div>
        {/* variantlar (faqat 2-bosqichda) */}
        {phase === 'quiz' && !solved && (
          <div className="d1-seq-opts fade-up">
            {fruits.map((f) => (
              <button key={f.id} type="button" className={`d1-seq-opt ${shakeId === f.id ? 'd1-shake' : ''}`}
                onClick={(e) => pick(f, e.currentTarget)} aria-label={f.id}>
                <ObjIcon kind={f.kind} c={f.c}/>
              </button>
            ))}
          </div>
        )}
        {solved && (
          <div className="d1-seq-opts">
            <span className="d1-seq-opt ok" style={{ position: 'relative' }}>
              <ObjIcon kind={missing.kind} c={missing.c}/>
              <ConfettiBurst/>
            </span>
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// FORMAT 2b — QAYSI IKKITASI JOYINI ALMASHTIRDI? (19-sahifa: polka).
// 1-bosqich: 4 o'yinchoq tartibi yodlanadi (3-2-1). 2-bosqich: ikkitasi
// almashgan; pastdagi variantlardan o'sha IKKITASINI top (har biri yulduz).
// Har kirganda: 7 o'yinchoqdan tasodifiy 4 tasi, tartibi aralash va
// QAYSI ikkitasi joy almashishi ham tasodifiy tanlanadi.
// ============================================================
const SWAP_VOICE = "O'yinchoqlar qanday turganiga diqqat bilan qarang va yodlab oling. Endi ayting — qaysi ikkitasi joyini almashtirdi?";
const SWAP_POOL = [
  { id: 'car',     kind: 'car',     c: '#F5C518' },
  { id: 'cube',    kind: 'cube',    c: '#4A90E2' },
  { id: 'bear',    kind: 'bear',    c: '#C98A5B' },
  { id: 'ball',    kind: 'ball',    c: '#43C465' },
  { id: 'doll',    kind: 'doll',    c: '#E86A8A' },
  { id: 'gift',    kind: 'gift',    c: '#B06BFF' },
  { id: 'balloon', kind: 'balloon', c: '#FF8FB3' },
];
// Karta atrofi: o'yinchoqlar javoni devori — iliq lavanda-krem
const SWAP_THEME = {
  bg: 'linear-gradient(180deg, #F3ECFA 0%, #FBF1E9 50%, #FFE7CF 100%)',
  decor: [
    { kind: 'star5',   c: '#F6C45A', x: 6,  y: 8,  s: 30, o: 0.4 },
    { kind: 'balloon', c: '#7FB8E8', x: 27, y: 5,  s: 44, o: 0.38 },
    { kind: 'kite',    c: '#E86A8A', x: 72, y: 6,  s: 44, o: 0.36, r: 10 },
    { kind: 'star5',   c: '#B48CE0', x: 93, y: 9,  s: 28, o: 0.38 },
    { kind: 'gift',    c: '#7FCB8F', x: 6,  y: 93, s: 40, o: 0.42 },
    { kind: 'car',     c: '#F2A45E', x: 28, y: 96, s: 40, o: 0.4 },
    { kind: 'ball',    c: '#E86A8A', x: 71, y: 96, s: 34, o: 0.4 },
    { kind: 'bear',    c: '#C98A4B', x: 94, y: 93, s: 42, o: 0.38 },
  ],
};

const SwapShelfPage = ({ onBack, onNext }) => {
  const voice = useVoice(SWAP_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda: 4 o'yinchoq va almashuvchi juftlik tasodifiy
  const [{ toys, pair }] = useState(() => {
    const toys = shuffleArr([...SWAP_POOL]).slice(0, 4);
    const [a, b] = shuffleArr(toys.map(t => t.id)).slice(0, 2);
    return { toys, pair: [a, b] };
  });
  const [phase, setPhase] = useState('show');
  const [count, setCount] = useState(null);
  const [found, setFound] = useState(() => new Set());
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  useEffect(() => {
    const t = [];
    t.push(setTimeout(() => setCount(3), 2500));
    t.push(setTimeout(() => setCount(2), 3500));
    t.push(setTimeout(() => setCount(1), 4500));
    t.push(setTimeout(() => { setCount(null); setPhase('quiz'); }, 5500));
    return () => { t.forEach(clearTimeout); clearTimeout(shakeTimer.current); };
  }, []);

  const allFound = found.size === pair.length;
  // 2-bosqichda tanlangan juftlik o'rin almashadi
  const shelf = phase === 'quiz'
    ? toys.map(t => (t.id === pair[0] ? toys.find(x => x.id === pair[1])
      : t.id === pair[1] ? toys.find(x => x.id === pair[0]) : t))
    : toys;

  const pick = (t, el) => {
    if (phase !== 'quiz' || allFound || found.has(t.id)) return;
    if (pair.includes(t.id)) {
      const next = new Set(found); next.add(t.id);
      setFound(next);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === pair.length);
    } else {
      sfxHmm();
      setShakeId(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeId(t.id);
        shakeTimer.current = setTimeout(() => setShakeId(null), 500);
      });
    }
  };

  return (
    <PageShell title={phase === 'quiz' ? "Qaysi ikkitasi joy almashdi?" : "Polkani yodlab oling!"}
      onBack={onBack} onNext={onNext} nextOk={allFound}>
      <div className="d1-shadow-card themed">
        <ThemeBg theme={SWAP_THEME}/>
        {/* polka */}
        <div className="d1-mem-scene">
          <div className="d1-shelf-row">
            {shelf.map((t, i) => (
              <span key={`${t.id}-${i}`} className="d1-shelf-toy"><ObjIcon kind={t.kind} c={t.c}/></span>
            ))}
          </div>
          <div className="d1-shelf-board"/>
          {count !== null && <span key={count} className="d1-mem-count">{count}</span>}
        </div>
        {/* variantlar */}
        {phase === 'quiz' && (
          <div className="d1-seq-opts fade-up">
            {toys.map((t) => {
              const hit = found.has(t.id);
              return (
                <button key={t.id} type="button"
                  className={`d1-seq-opt ${hit ? 'ok' : ''} ${shakeId === t.id ? 'd1-shake' : ''}`}
                  disabled={hit} onClick={(e) => pick(t, e.currentTarget)} aria-label={t.id}>
                  <ObjIcon kind={t.kind} c={t.c}/>
                  {hit && <ConfettiBurst/>}
                </button>
              );
            })}
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// FORMAT 6 — SANOQ (13-14-sahifalar). 3 karta (pitsa/quti), har birida
// har xil sondagi narsalar. Faol karta yorqin; pastdan to'g'ri raqam
// tanlanadi. Har to'g'ri raqam = yulduz; 3-chisida sahifa yakunlanadi.
// ============================================================
// Pitsa: oq likopchada, qirg'og'i pufakchali, n ta yaltiroq bezak
const PizzaSVG = ({ n, top }) => {
  const POS = [[36, 45], [64, 45], [50, 62], [33, 65], [67, 65]];
  const CRUMB = [[34, 30], [66, 30], [20, 52], [80, 52], [30, 78], [70, 78]];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <ellipse cx="50" cy="58" rx="42" ry="40" fill="#FFFFFF"/>
      <ellipse cx="50" cy="58" rx="42" ry="40" fill="none" stroke="#E7DFEF" strokeWidth="2.5"/>
      <circle cx="50" cy="56" r="35" fill="#E8A94E"/>
      <circle cx="50" cy="56" r="35" fill="none" stroke="#D98F3C" strokeWidth="2"/>
      <circle cx="50" cy="56" r="27.5" fill="#FFD98A"/>
      {CRUMB.map(([x, y], i) => <circle key={`c${i}`} cx={x} cy={y} r="1.8" fill="#D98F3C"/>)}
      {Array.from({ length: n }).map((_, i) => (
        <g key={i}>
          <circle cx={POS[i][0]} cy={POS[i][1]} r="7.5" fill={top}/>
          <circle cx={POS[i][0] - 2} cy={POS[i][1] - 2} r="2.6" fill="rgba(255,255,255,0.5)"/>
        </g>
      ))}
    </svg>
  );
};
// Konfet qutisi: rangli quti + oq astar, ichida rang-barang katta konfetlar
const CANDY_COLS = ['#FF5A4E', '#8E5AE8', '#FFB03A', '#43C465', '#5AC8FA'];
const CandyBoxSVG = ({ n, box }) => {
  const POS = [[32, 44, 0], [60, 40, 12], [36, 66, -12], [64, 68, 8], [50, 54, 4]];
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <ellipse cx="50" cy="88" rx="36" ry="5" fill="rgba(61,58,80,0.10)"/>
      <rect x="14" y="26" width="72" height="58" rx="12" fill={box}/>
      <rect x="14" y="26" width="72" height="58" rx="12" fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="2"/>
      <rect x="20" y="32" width="60" height="46" rx="8" fill="rgba(255,255,255,0.55)"/>
      {Array.from({ length: n }).map((_, i) => {
        const [x, y, r] = POS[i];
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(0.4) rotate(${r} 30 30) translate(-30 -30)`}>
            {IC.candy(CANDY_COLS[i % CANDY_COLS.length])}
          </g>
        );
      })}
    </svg>
  );
};

const CountPage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // cfg.randomize bo'lsa har kirganda yangi o'yin: sonlar to'plamdan
  // tasodifiy 3 tasi, bezak turi/rangi ham tasodifiy, raqamlar aralash
  const [{ groups, numbers }] = useState(() => {
    if (!cfg.randomize) return { groups: cfg.groups, numbers: cfg.numbers };
    const counts = shuffleArr([2, 3, 4, 5]).slice(0, 3);
    const styles = shuffleArr([...cfg.variants]).slice(0, 3);
    return {
      groups: counts.map((n, i) => ({ n, ...styles[i] })),
      numbers: shuffleArr([...counts]),
    };
  });
  const [answered, setAnswered] = useState({});   // groupIdx -> true
  const [shakeN, setShakeN] = useState(null);
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const doneCount = Object.keys(answered).length;
  const allDone = doneCount === groups.length;
  const active = groups.findIndex((_, i) => !answered[i]);

  const pickNum = (num, el) => {
    if (allDone) return;
    if (num === groups[active].n) {
      const next = { ...answered, [active]: true };
      setAnswered(next);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, Object.keys(next).length === groups.length);
    } else {
      sfxHmm();
      setShakeN(null);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeN(num);
        shakeTimer.current = setTimeout(() => setShakeN(null), 500);
      });
    }
  };

  return (
    <PageShell title={cfg.title} onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        <div className="d1-count-row">
          {groups.map((g, i) => (
            <div key={i} className={`d1-count-card ${i === active ? 'active' : ''} ${answered[i] ? 'done' : ''}`}>
              {cfg.base === 'pizza' ? <PizzaSVG n={g.n} top={g.top}/> : <CandyBoxSVG n={g.n} box={g.box}/>}
              <span className={`d1-count-badge ${answered[i] ? 'on' : ''}`}>{answered[i] ? g.n : '?'}</span>
            </div>
          ))}
        </div>
        {!allDone && (
          <div className="d1-seq-opts">
            {numbers.map((num) => {
              const used = groups.some((g, i) => answered[i] && g.n === num);
              return (
                <button key={num} type="button"
                  className={`d1-num ${used ? 'used' : ''} ${shakeN === num ? 'd1-shake' : ''}`}
                  disabled={used} onClick={(e) => pickNum(num, e.currentTarget)}>
                  {num}
                </button>
              );
            })}
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

const COUNT_CFG_PIZZA = {
  title: "Bezaklarni sanang!",
  voice: "Har bir pitsada nechta bezak borligini birga sanaymizmi? Sanab, to'g'ri raqamni topib bering.",
  base: 'pizza',
  // har kirganda: 2-5 dan tasodifiy 3 son + bezak turi tasodifiy tanlanadi
  randomize: true,
  variants: [
    { top: '#E14B3A' },   // pomidor
    { top: '#43A85C' },   // bodring
    { top: '#3A3A3A' },   // zaytun
    { top: '#F5C544' },   // makkajo'xori
  ],
  // Pitseriya oshxonasi: iliq krem-shaftoli gradient, taom dekorlari
  theme: {
    bg: 'linear-gradient(180deg, #FFF7E3 0%, #FFE9C6 48%, #FFD9A9 100%)',
    decor: [
      { kind: 'cake',     c: '#F2A9C4', x: 6,  y: 10, s: 46, o: 0.35 },
      { kind: 'mushroom', c: '#E86A5E', x: 30, y: 5,  s: 30, o: 0.38 },
      { kind: 'cookie',   c: '#C98A4B', x: 70, y: 6,  s: 34, o: 0.38 },
      { kind: 'icecream', c: '#B48CE0', x: 94, y: 12, s: 42, o: 0.36 },
      { kind: 'orange',   c: '#F2A45E', x: 6,  y: 92, s: 34, o: 0.4 },
      { kind: 'candy',    c: '#E86A8A', x: 28, y: 96, s: 30, o: 0.4 },
      { kind: 'cookie',   c: '#D9A05B', x: 72, y: 96, s: 32, o: 0.38 },
      { kind: 'cake',     c: '#F6C45A', x: 94, y: 92, s: 40, o: 0.36 },
    ],
  },
};
const COUNT_CFG_CANDY = {
  title: "Shirinliklarni sanang!",
  voice: "Bu qutichalarda nechtadan shirinlik bor ekan? Diqqat bilan sanab ko'ring.",
  base: 'box',
  // har kirganda: 2-5 dan tasodifiy 3 son + quti rangi tasodifiy tanlanadi
  randomize: true,
  variants: [
    { box: '#FF8FB3' },
    { box: '#5AC8FA' },
    { box: '#FFD34D' },
    { box: '#B48CE0' },
  ],
  // Shirinliklar do'koni: pushti-lavanda gradient, shirinlik dekorlari
  theme: {
    bg: 'linear-gradient(180deg, #FFE9F2 0%, #F6E9FF 50%, #E4F1FF 100%)',
    decor: [
      { kind: 'candy',    c: '#FF6F91', x: 6,  y: 10, s: 40, o: 0.4 },
      { kind: 'icecream', c: '#B48CE0', x: 30, y: 5,  s: 42, o: 0.38 },
      { kind: 'cake',     c: '#F2A9C4', x: 70, y: 6,  s: 44, o: 0.36 },
      { kind: 'candy',    c: '#5AC8FA', x: 94, y: 12, s: 36, o: 0.4 },
      { kind: 'cookie',   c: '#C98A4B', x: 6,  y: 92, s: 34, o: 0.38 },
      { kind: 'cake',     c: '#F6C45A', x: 28, y: 96, s: 38, o: 0.36 },
      { kind: 'icecream', c: '#FF8FB3', x: 72, y: 96, s: 40, o: 0.38 },
      { kind: 'candy',    c: '#43C465', x: 94, y: 92, s: 34, o: 0.4 },
    ],
  },
};

// ============================================================
// FORMAT 7 — JUFTINI TOP (15-sahifa: dengiz tubi, baliqchalar).
// 6 ta katta kulgan baliqcha 2 qatorda (3+3), orasida ANIQ 3 juftlik —
// har juftlik bir xil rang va naqsh (chiziqli / nuqtali / oddiy).
// Bola ketma-ket 2 ta baliqni bosadi: juft bo'lsa — yulduz, yashil ramka,
// ikkinchisi birinchisining YONIGA suzib boradi va birga suzib turadi;
// juft bo'lmasa — "hmm" + silkinish. 3 juftlik topilgach sahifa yakunlanadi.
// Har kirganda: 6 uslubdan tasodifiy 3 tasi + joylashuv aralash.
// ============================================================
const FISH_VOICE = "Dengiz tubidagi baliqchalar o'z juftini yo'qotib qo'yibdi. Bir xil baliqchalarni topib, ularni birlashtirib bera olasizmi?";
// juftlik uslublari: asosiy rang + to'q rang (naqsh/suzgich) + naqsh turi
const FISH_VARIANTS = [
  { c: '#FF8A3C', d: '#D96A1E', pattern: 'stripes' },  // chiziqli to'q sariq
  { c: '#FF8FB3', d: '#E0538A', pattern: 'dots' },     // nuqtali pushti
  { c: '#43C465', d: '#2FA45C', pattern: 'plain' },    // oddiy yashil
  { c: '#5AC8FA', d: '#2E8FC9', pattern: 'stripes' },  // chiziqli havorang
  { c: '#B48CE0', d: '#8E5AE8', pattern: 'dots' },     // nuqtali binafsha
  { c: '#FFD34D', d: '#E8A50A', pattern: 'plain' },    // oddiy sariq
];
// katta, kulgan yuzli flat-vector baliqcha
const PairFishSVG = ({ c, d, pattern }) => (
  <svg viewBox="0 0 100 72" width="100%" height="100%" aria-hidden="true">
    <path d="M19 36 L3 20 Q-1 36 3 52 Z" fill={d}/>
    <path d="M45 15 Q54 2 67 11 Q58 15 53 19 Z" fill={d}/>
    <ellipse cx="55" cy="38" rx="38" ry="26" fill={c}/>
    <path d="M30 54 Q55 70 80 52 Q58 60 30 54 Z" fill="rgba(255,255,255,0.4)"/>
    <path d="M50 60 Q56 71 66 66 Q60 60 56 58 Z" fill={d}/>
    {pattern === 'stripes' && (
      <g stroke={d} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.9">
        <path d="M40 17 Q36 38 40 59"/>
        <path d="M54 14 Q50 38 54 61"/>
        <path d="M68 18 Q65 37 68 57"/>
      </g>
    )}
    {pattern === 'dots' && (
      <g fill={d} opacity="0.9">
        <circle cx="41" cy="28" r="4.6"/>
        <circle cx="57" cy="45" r="4.6"/>
        <circle cx="43" cy="49" r="4"/>
        <circle cx="59" cy="24" r="4"/>
      </g>
    )}
    <circle cx="76" cy="45" r="4.2" fill="rgba(255,110,110,0.45)"/>
    <circle cx="79" cy="31" r="7" fill="#FFFFFF"/>
    <circle cx="81" cy="31.5" r="3.4" fill="#3D3A50"/>
    <circle cx="82.2" cy="30" r="1.2" fill="#FFFFFF"/>
    <path d="M84 42 Q88 46.5 92.5 42" stroke="#3D3A50" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
  </svg>
);
// 2 qator x 3 ustun slot koordinatalari (% da)
const FISH_SLOTS = [
  { x: 18, y: 27 }, { x: 50, y: 27 }, { x: 82, y: 27 },
  { x: 18, y: 73 }, { x: 50, y: 73 }, { x: 82, y: 73 },
];
// juftlar boshida yonma-yon tushmasin
const fishLayoutOk = (f) => {
  for (const [a, b] of [[0, 1], [1, 2], [3, 4], [4, 5]])
    if (f[a].pair === f[b].pair) return false;
  return true;
};

const FishPairPage = ({ onBack, onNext }) => {
  const voice = useVoice(FISH_VOICE);
  const { onCorrect } = useFlightApi();
  // har kirganda: tasodifiy 3 juft uslub + aralash joylashuv
  const [fishes] = useState(() => {
    const styles = shuffleArr([...FISH_VARIANTS]).slice(0, 3);
    let f;
    do {
      f = shuffleArr(styles.flatMap((s, p) => [
        { id: `f${p}a`, pair: p, ...s },
        { id: `f${p}b`, pair: p, ...s },
      ]));
    } while (!fishLayoutOk(f));
    return f;
  });
  const [slots, setSlots] = useState(() => Object.fromEntries(fishes.map((f, i) => [f.id, i])));
  const [sel, setSel] = useState(null);          // birinchi bosilgan baliq
  const [matched, setMatched] = useState({});    // id -> true
  const [shakeIds, setShakeIds] = useState([]);
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const allDone = Object.keys(matched).length === 6;

  // juft topilganda: ikkinchisi birinchisining yonidagi slotga suzib
  // boradi (u yerdagi baliq bo'sh qolgan joyga o'tadi)
  const swimTogether = (aId, bId) => {
    setSlots(prev => {
      const sa = prev[aId];
      const target = sa % 3 === 2 ? sa - 1 : sa + 1;
      if (prev[bId] === target) return prev;
      const occupant = fishes.find(f => prev[f.id] === target).id;
      return { ...prev, [bId]: target, [occupant]: prev[bId] };
    });
  };

  const pick = (f, el) => {
    if (allDone || matched[f.id]) return;
    if (sel === f.id) { setSel(null); return; }
    if (sel === null) { setSel(f.id); return; }
    const first = fishes.find(x => x.id === sel);
    if (first.pair === f.pair) {
      const next = { ...matched, [sel]: true, [f.id]: true };
      setMatched(next);
      setSel(null);
      swimTogether(sel, f.id);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, Object.keys(next).length === 6);
    } else {
      sfxHmm();
      const ids = [sel, f.id];
      setSel(null);
      setShakeIds([]);
      clearTimeout(shakeTimer.current);
      requestAnimationFrame(() => {
        setShakeIds(ids);
        shakeTimer.current = setTimeout(() => setShakeIds([]), 500);
      });
    }
  };

  return (
    <PageShell title="Baliqchalarning juftini toping!" onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className="d1-shadow-card themed">
        {/* dengiz tubi foni: gradient + qum + suv o'tlari + pufakchalar */}
        <div className="d1-sea-bg" aria-hidden="true">
          <span className="d1-sea-sand"/>
          <span className="d1-sea-weed" style={{ left: '4%', width: 'clamp(40px, 8vh, 64px)' }}><ObjIcon kind="seaweed" c="#2FA45C"/></span>
          <span className="d1-sea-weed" style={{ left: '13%', width: 'clamp(30px, 6vh, 48px)', animationDelay: '0.7s' }}><ObjIcon kind="seaweed" c="#54D584"/></span>
          <span className="d1-sea-weed" style={{ right: '5%', width: 'clamp(42px, 8.5vh, 66px)', animationDelay: '0.4s' }}><ObjIcon kind="seaweed" c="#3CBF6E"/></span>
          {[8, 22, 38, 55, 70, 84, 93].map((left, i) => (
            <i key={i} className="d1-sea-bubble" style={{
              left: `${left}%`,
              width: `${8 + (i % 3) * 5}px`,
              animationDuration: `${5.5 + (i % 4) * 1.3}s`,
              animationDelay: `${i * 0.9}s`,
            }}/>
          ))}
        </div>
        <div className="d1-fish-scene">
          {fishes.map((f) => {
            const s = FISH_SLOTS[slots[f.id]];
            return (
              <button key={f.id} type="button"
                className={`d1-fish ${matched[f.id] ? 'ok' : ''} ${sel === f.id ? 'sel' : ''} ${shakeIds.includes(f.id) ? 'd1-shake' : ''}`}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                onClick={(e) => pick(f, e.currentTarget)} aria-label="baliqcha">
                <PairFishSVG c={f.c} d={f.d} pattern={f.pattern}/>
              </button>
            );
          })}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// FORMAT 8 — BERKINMACHOQ (17-sahifa: bolalar xonasi, o'rdakchalar).
// Bitta katta karta: xonada ochiq o'yinchoq qutisi va sochilgan
// o'yinchoqlar — kubiklar, mashina, ayiqcha, koptok, qo'g'irchoq,
// halqa piramida. Ular orasida 3 ta KICHKINA sariq o'rdakcha qisman
// yashiringan (to'liq berkitilmagan). Tepada 3 ta bo'sh siluet — hisob.
// O'rdakcha bosilsa: yulduz + yashil doira + siluet to'ladi.
// Boshqa joy bosilsa: "hmm" + sahna silkinadi. 3 tasi = sahifa tugadi.
// Har kirganda: 6 ta yashirinish joyidan tasodifiy 3 tasi tanlanadi.
// ============================================================
const DUCK_VOICE = "Bu xonada uchta kichkina sariq o'rdakcha berkinmachoq o'ynayapti. Ularni topib bera olasizmi? Diqqat bilan qarang — ular yaxshi yashiringan!";
// kichkina sariq o'rdakcha; sil=true — kulrang siluet (hisob qatori uchun)
const DuckArt = ({ sil }) => {
  const body = sil ? '#CFCADD' : '#FFD34D';
  const wing = sil ? '#BDB7D1' : '#F0B63C';
  const beak = sil ? '#BDB7D1' : '#FF9F2E';
  return (
    <svg viewBox="0 0 60 56" width="100%" height="100%" aria-hidden="true">
      {/* dumcha */}
      <path d="M44 34 Q53 26 50.5 38 Q48.5 44 42 42 Z" fill={body}/>
      {/* tana */}
      <ellipse cx="29" cy="40" rx="17" ry="12" fill={body}/>
      {/* qanotcha */}
      <ellipse cx="31.5" cy="41" rx="7.2" ry="4.8" fill={wing}/>
      {/* bosh */}
      <circle cx="15" cy="20" r="10.5" fill={body}/>
      {/* popukcha */}
      <path d="M11.5 10.5 Q13.5 5 18 8" stroke={body} strokeWidth="3.2" fill="none" strokeLinecap="round"/>
      {/* tumshuqcha */}
      <path d="M6 19 Q-1 19 1.8 23.5 Q4.8 26.5 8.8 24 Z" fill={beak}/>
      {!sil && (
        <g>
          <circle cx="12.5" cy="18" r="2.3" fill="#3D3A50"/>
          <circle cx="13.3" cy="17.2" r="0.8" fill="#FFFFFF"/>
          <circle cx="11" cy="24" r="2" fill="rgba(255,120,120,0.45)"/>
        </g>
      )}
    </svg>
  );
};
// katta ochiq o'yinchoq qutisi (qopqog'i orqaga qiya ochilgan)
const ToyBoxSVG = () => (
  <svg viewBox="0 0 130 100" width="100%" height="100%" aria-hidden="true">
    <g transform="rotate(-16 14 26)">
      <rect x="10" y="8" width="110" height="16" rx="7" fill="#D9814E"/>
      <rect x="10" y="8" width="110" height="16" rx="7" fill="rgba(0,0,0,0.08)"/>
    </g>
    <rect x="14" y="22" width="102" height="16" rx="8" fill="#8A4E2E"/>
    <rect x="10" y="30" width="110" height="62" rx="11" fill="#E8935A"/>
    <rect x="10" y="30" width="110" height="62" rx="11" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="2"/>
    <rect x="12" y="74" width="106" height="10" fill="rgba(255,255,255,0.28)"/>
    <path d="M65 42 L68.8 50.6 L78 51.4 L71.2 57.5 L73.3 66.4 L65 61.5 L56.7 66.4 L58.8 57.5 L52 51.4 L61.2 50.6 Z" fill="#FFF3D6"/>
  </svg>
);
// xonadagi qo'zg'almas narsalar: { kind, x, y, w(%), z, c }
const DUCK_TOYS = [
  { kind: 'frame',   x: 14, y: 16, w: 11, z: 1, c: '#5AC8FA' },
  { kind: 'balloon', x: 92, y: 16, w: 9,  z: 1, c: '#F2A9C4' },
  { kind: 'bear',    x: 9,  y: 52, w: 14, z: 3, c: '#C98A5B' },
  { kind: 'pyramid', x: 89, y: 74, w: 13, z: 4, c: '#43C465' },
  { kind: 'doll',    x: 79, y: 84, w: 11, z: 3, c: '#E86A8A' },
  { kind: 'ball',    x: 58, y: 74, w: 10, z: 3, c: '#FF5A4E' },
  { kind: 'car',     x: 42, y: 86, w: 15, z: 5, c: '#F5C518' },
  { kind: 'cube',    x: 17, y: 78, w: 12, z: 6, c: '#4A90E2' },
  { kind: 'cube',    x: 28, y: 80, w: 12, z: 6, c: '#43C465' },
  { kind: 'cube',    x: 22, y: 68, w: 11, z: 6, c: '#FF5A4E' },
];
// o'rdakcha yashirinishi mumkin bo'lgan 6 joy (har kirganda 3 tasi tanlanadi);
// z — yashiringan joyi oldidagi o'yinchoqdan PASTROQ, shunda qismi berkinadi.
// jx/jy — joy ichida tasodifiy siljish chegarasi (%): o'rdakcha har safar
// aynan bir nuqtada emas, o'sha yashirinish joyining atrofida turadi.
const DUCK_SPOTS = [
  { x: 22, y: 61, w: 9,   z: 5, jx: 3,   jy: 1.5 },            // kubiklar orasidan boshi ko'rinadi
  { x: 53, y: 40, w: 9,   z: 3, jx: 1.5, jy: 5 },              // qutining orqasidan mo'ralaydi
  { x: 33, y: 91, w: 9,   z: 2, jx: 6,   jy: 2, r: 78 },       // gilam chetida yotibdi
  { x: 15, y: 57, w: 8.5, z: 2, jx: 1.5, jy: 3, flip: true },  // ayiqchaning yonidan mo'ralaydi
  { x: 62, y: 67, w: 8.5, z: 2, jx: 2,   jy: 2, flip: true },  // koptok ortidan boshi chiqib turibdi
  { x: 85, y: 68, w: 8.5, z: 3, jx: 2,   jy: 2.5 },            // piramida ortiga bekingan
];
// Karta atrofi: iliq bolalar xonasi gradienti, o'yinchoq dekorlar
const DUCK_THEME = {
  bg: 'linear-gradient(180deg, #FFF3D6 0%, #FFE9D9 50%, #FCD9C4 100%)',
  decor: [
    { kind: 'balloon', c: '#7FB8E8', x: 5,  y: 10, s: 56, o: 0.38 },
    { kind: 'star5',   c: '#F6C45A', x: 28, y: 5,  s: 30, o: 0.38 },
    { kind: 'kite',    c: '#E86A8A', x: 72, y: 5,  s: 44, o: 0.36, r: 12 },
    { kind: 'balloon', c: '#B48CE0', x: 95, y: 12, s: 48, o: 0.36 },
    { kind: 'ball',    c: '#E86A8A', x: 5,  y: 93, s: 36, o: 0.4 },
    { kind: 'gift',    c: '#7FCB8F', x: 27, y: 96, s: 38, o: 0.4 },
    { kind: 'car',     c: '#F2A45E', x: 72, y: 96, s: 42, o: 0.4 },
    { kind: 'bear',    c: '#C98A4B', x: 94, y: 93, s: 42, o: 0.38 },
  ],
};

const HiddenDuckPage = ({ onBack, onNext }) => {
  const voice = useVoice(DUCK_VOICE);
  const { onCorrect } = useFlightApi();
  const [shaking, shake] = useShake();
  // har kirganda: 6 joydan tasodifiy 3 tasi TANLANADI, so'ng har biri
  // o'z joyi atrofida tasodifiy siljiydi va ozgina buriladi — o'rdakchalar
  // hech qachon aynan bir xil nuqtada turmaydi
  const [spots] = useState(() =>
    shuffleArr([...DUCK_SPOTS]).slice(0, 3).map((s) => ({
      ...s,
      x: s.x + (Math.random() * 2 - 1) * s.jx,
      y: s.y + (Math.random() * 2 - 1) * s.jy,
      r: (s.r || 0) + (Math.random() * 2 - 1) * 7,
    }))
  );
  const [found, setFound] = useState(() => new Set());
  const allFound = found.size === 3;

  const pickDuck = (i, el) => {
    if (found.has(i)) return;
    const next = new Set(found); next.add(i);
    setFound(next);
    sfxDingDing();
    const r = el.getBoundingClientRect();
    onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === 3);
  };
  const miss = () => { if (!allFound) { sfxHmm(); shake(); } };

  return (
    <PageShell title="3 ta o'rdakchani toping!" onBack={onBack} onNext={onNext} nextOk={allFound}>
      <div className="d1-shadow-card d1-duck-card themed">
        <ThemeBg theme={DUCK_THEME}/>
        {/* hisob qatori: 3 ta siluet, topilgani sayin to'ladi */}
        <div className="d1-duck-sils" aria-label={`${found.size} / 3 o'rdakcha topildi`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`d1-duck-sil ${i < found.size ? 'on' : ''}`}>
              <DuckArt sil={i >= found.size}/>
            </span>
          ))}
        </div>
        {/* xona sahnasi */}
        <div className={`d1-room ${shaking ? 'd1-shake' : ''}`} onClick={miss}>
          <span className="d1-room-rug"/>
          <span className="d1-room-obj d1-room-box" style={{ left: '69%', top: '50%', width: '30%', zIndex: 4 }}>
            <ToyBoxSVG/>
          </span>
          {DUCK_TOYS.map((t, i) => (
            <span key={i} className="d1-room-obj"
              style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, zIndex: t.z }}>
              <ObjIcon kind={t.kind} c={t.c}/>
            </span>
          ))}
          {spots.map((s, i) => (
            <button key={i} type="button"
              className={`d1-duck-btn ${found.has(i) ? 'ok' : ''}`}
              style={{
                left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`,
                zIndex: found.has(i) ? 7 : s.z,
                transform: `translate(-50%, -50%) rotate(${s.r || 0}deg) scaleX(${s.flip ? -1 : 1})`,
              }}
              onClick={(e) => { e.stopPropagation(); pickDuck(i, e.currentTarget); }}
              aria-label="o'rdakcha">
              <DuckArt/>
              {found.has(i) && <ConfettiBurst/>}
            </button>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SAHIFA 21 — YAKUNIY O'YIN: "G'alati narsalarni top".
// Bitta katta o'rmon manzarasi, 5 ta g'alati narsa yashiringan.
// Har biri bosilganda yulduz; 5-chisida sahifa yakunlanadi.
// Har kirganda: 9 ta g'alati narsadan tasodifiy 5 tasi tanlanadi,
// manzara 50/50 ko'zguda o'giriladi va hamma narsa ozgina siljiydi.
// ============================================================
const ODD_VOICE = "Bu o'rmon manzarasida beshta juda g'alati narsa yashiringan. Ularni diqqat bilan qidirib topa olasizmi?";
// doimiy manzara — oddiy (to'g'ri) narsalar
const ODD_BASE = [
  { kind: 'sun',       x: 8,  y: 11, s: 16, c: '#FFD34D' },
  { kind: 'cloud',     x: 56, y: 9,  s: 22, c: '#FFFFFF' },
  { kind: 'tree',      x: 20, y: 42, s: 32, c: '#43A85C' },
  { kind: 'tree',      x: 80, y: 38, s: 28, c: '#2FA45C' },
  { kind: 'butterfly', x: 33, y: 34, s: 10, c: '#B48CE0' },
  { kind: 'mushroom',  x: 10, y: 82, s: 15, c: '#FF5A4E' },
  { kind: 'flower',    x: 34, y: 86, s: 13, c: '#FF6FA0' },
  { kind: 'flower',    x: 68, y: 88, s: 12, c: '#F6C45A' },
  { kind: 'squirrel',  x: 90, y: 82, s: 17, c: '#E07B39' },
];
// g'alati narsalar zaxirasi — har kirganda 5 tasi tanlanadi
const ODD_POOL = [
  { kind: 'icecream',   x: 20, y: 23, s: 14, c: '#FF8FB3' },  // daraxtda muzqaymoq o'syapti
  { kind: 'clock',      x: 80, y: 21, s: 13, c: '#5AC8FA' },  // soat daraxtga osilgan
  { kind: 'fish',       x: 44, y: 16, s: 15, c: '#5AC8FA' },  // baliq havoda uchyapti
  { kind: 'candy',      x: 62, y: 24, s: 11, c: '#FF5A4E' },  // bulutdan konfet yog'yapti
  { kind: 'rabbitLeaf', x: 56, y: 74, s: 20, c: '#EDE7DC' },  // quyon quloqlari — barg
  { kind: 'moon',       x: 28, y: 8,  s: 11, c: '#FFE9A8' },  // kunduzi oy chiqib turibdi
  { kind: 'planet',     x: 91, y: 12, s: 13, c: '#3CE0C8' },  // osmonda sayyora ko'rinib turibdi
  { kind: 'cake',       x: 24, y: 91, s: 12, c: '#F2A9C4' },  // tort o'tloqda o'sib turibdi
  { kind: 'star5',      x: 46, y: 88, s: 10, c: '#FFD34D' },  // yulduz yerga tushib yotibdi
];
// manzara osmon-o'tloq gradienti (panel ichi)
const ODD_SKY = 'linear-gradient(180deg, #C9ECFA 0%, #DFF6E0 42%, #A8E3B8 72%, #8ED8A8 100%)';
// Karta atrofi: o'rmon chetlari — daraxt, gul, kapalak dekorlari
const ODD_THEME = {
  bg: 'linear-gradient(180deg, #DFF6E5 0%, #EAF9E0 50%, #CFEFC6 100%)',
  decor: [
    { kind: 'sun',       c: '#FFD34D', x: 6,  y: 9,  s: 48, o: 0.38 },
    { kind: 'cloud',     c: '#FFFFFF', x: 30, y: 5,  s: 54, o: 0.6 },
    { kind: 'butterfly', c: '#B48CE0', x: 70, y: 6,  s: 34, o: 0.4 },
    { kind: 'tree',      c: '#7FCB8F', x: 94, y: 10, s: 56, o: 0.32 },
    { kind: 'flower',    c: '#F2A9C4', x: 5,  y: 93, s: 32, o: 0.42 },
    { kind: 'mushroom',  c: '#E86A5E', x: 28, y: 96, s: 30, o: 0.4 },
    { kind: 'flower',    c: '#F6C45A', x: 72, y: 96, s: 30, o: 0.42 },
    { kind: 'tree',      c: '#8FD49E', x: 95, y: 92, s: 50, o: 0.3 },
  ],
};
// har kirganda yangi manzara: 5 g'alati narsa tasodifiy + ko'zgu + siljish
const buildOddScene = () => {
  const mirror = Math.random() < 0.5;
  const place = (o) => ({
    ...o,
    x: (mirror ? 100 - o.x : o.x) + (Math.random() * 2 - 1) * 1.5,
    y: o.y + (Math.random() * 2 - 1) * 1.5,
  });
  const odds = shuffleArr([...ODD_POOL]).slice(0, 5).map(o => ({ ...place(o), odd: true }));
  return [...ODD_BASE.map(place), ...odds];
};

const OddPage = ({ onBack, onNext }) => {
  const voice = useVoice(ODD_VOICE);
  const { onCorrect } = useFlightApi();
  const [objects] = useState(buildOddScene);
  const [found, setFound] = useState(() => new Set());
  const [shaking, shake] = useShake();
  const oddIdxs = objects.map((o, i) => (o.odd ? i : -1)).filter(i => i >= 0);
  const allFound = found.size === oddIdxs.length;

  const pick = (i, el) => {
    if (allFound || found.has(i)) return;
    const o = objects[i];
    if (o.odd) {
      const next = new Set(found); next.add(i);
      setFound(next);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, next.size === oddIdxs.length);
    } else {
      shake();
    }
  };

  return (
    <PageShell title="5 ta g'alati narsani toping!" onBack={onBack} onNext={onNext} nextOk={allFound}>
      <div className="d1-shadow-card d1-diff-card themed">
        <ThemeBg theme={ODD_THEME}/>
        <div className={`d1-panel d1-odd-panel ${shaking ? 'd1-shake' : ''}`}
          style={{ background: ODD_SKY }}>
          {objects.map((o, i) => {
            const isFound = found.has(i);
            return (
              <button key={i} type="button"
                className={`d1-obj d1-obj-btn ${isFound ? 'd1-hit-ok' : ''}`}
                style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.s}%`, animationDelay: `${(i % 5) * 0.35}s` }}
                disabled={isFound}
                onClick={(e) => pick(i, e.currentTarget)} aria-label={o.kind}>
                <ObjIcon kind={o.kind} c={o.c}/>
                {isFound && <ConfettiBurst/>}
              </button>
            );
          })}
        </div>
        <div className="d1-diff-dots">
          {oddIdxs.map((_, i) => (
            <span key={i} className={`d1-diff-dot ${i < found.size ? 'on' : ''}`}>{i < found.size ? '✓' : ''}</span>
          ))}
          <PageVoice voice={voice} corner="inline"/>
        </div>
      </div>
    </PageShell>
  );
};
// ============================================================
// SAHIFA 1 — MUQOVA: sariq-och ko'k gradient, bulutchalar va yulduzchalar,
// markazda lupali tulki maskoti, tepada yumaloq harfli sarlavha, "Boshlash".
// ============================================================
// Kirishda tulkicha o'zini TO'LIQ tanishtiradi: kimligi, lupasi, o'yin qoidasi,
// yulduzchalar va Boshlash tugmasi haqida gapiradi.
const COVER_VOICE = "Assalomu alaykum! Men — kichkina tulkichaman. " +
  "Sizni o'zim bilan ajoyib bir sayohatga taklif qilaman. " +
  "Tayyor bo'lsangiz, boshlaymiz!";

const COVER_STARS = [
  { x: 8,  y: 12, s: 26, d: 0 },   { x: 90, y: 9,  s: 20, d: 0.6 },
  { x: 14, y: 58, s: 18, d: 1.1 }, { x: 88, y: 52, s: 24, d: 0.3 },
  { x: 78, y: 76, s: 16, d: 0.9 }, { x: 6,  y: 34, s: 16, d: 1.4 },
  { x: 68, y: 16, s: 14, d: 1.8 }, { x: 28, y: 8,  s: 15, d: 0.4 },
];
const COVER_CLOUDS = [
  { x: 13, y: 20, s: 96,  d: 0 },
  { x: 82, y: 26, s: 116, d: 1.2 },
  { x: 24, y: 74, s: 104, d: 0.5 },
  { x: 72, y: 66, s: 84,  d: 1.7 },
];

// Sarlavha — katta, yumaloq, o'yinchoqdek RANGLI harflar (birma-bir sakrab chiqadi)
const TITLE_TEXT = 'Farqini toping!';
const TITLE_COLORS = ['#FF7043', '#FFB03A', '#43C465', '#5AC8FA', '#8E5AE8', '#FF5A8A'];

const CoverTitle = () => (
  <h1 className="d1-cover-title" aria-label={TITLE_TEXT}>
    {TITLE_TEXT.split('').map((ch, i) => (
      ch === ' '
        ? <span key={i} className="d1-title-space"> </span>
        : (
          <span
            key={i}
            className="d1-title-ch"
            style={{
              color: TITLE_COLORS[i % TITLE_COLORS.length],
              animationDelay: `${0.15 + i * 0.06}s`,
              transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 3}deg)`,
            }}
          >
            {ch}
          </span>
        )
    ))}
    
  </h1>
);

// SAHIFA 1 — statik muqova: sarlavha YUQORIDA, tulki MARKAZDA,
// "Boshlash" tugmasi PASTDA (bottom) — bosilgach 2-sahifaga o'tiladi.
const CoverPage = ({ onStart }) => {
  // Muqovada avto-ovoz YO'Q (hozircha): bola ekranga birinchi TEGINGANDA gapiradi
  const { replay: replayVoice, stop: stopVoice } = useVoice(COVER_VOICE, null);

  // Karnaycha tugmasi: yoniq -> bosilsa ovoz O'CHADI; o'chiq -> bosilsa BOSHIDAN aytadi.
  const [voiceOn, setVoiceOn] = useState(true);
  const toggleVoice = () => {
    if (voiceOn) { stopVoice(); setVoiceOn(false); }
    else { replayVoice(); setVoiceOn(true); }
  };

  return (
    <div className="d1-cover fade-up">
      {/* ovozni o'chirish/yoqish — yuqori o'ng burchak */}
      <VoiceButton muted={!voiceOn} onClick={toggleVoice}/>
      {/* dekor: bulutchalar va yulduzchalar */}
      {COVER_CLOUDS.map((cl, i) => (
        <span key={`c${i}`} className="d1-cover-cloud" style={{ left: `${cl.x}%`, top: `${cl.y}%`, width: cl.s, animationDelay: `${cl.d}s` }}>
          <ObjIcon kind="cloud" c="#FFFFFF"/>
        </span>
      ))}
      {COVER_STARS.map((st, i) => (
        <span key={`s${i}`} className="d1-cover-star" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, animationDelay: `${st.d}s` }}>
          <GoldStar/>
        </span>
      ))}

      {/* YUQORI: sarlavha */}
      <div className="d1-cover-top">
        <CoverTitle/>
      </div>

      {/* MARKAZ: lupali tulki maskoti (orqasida yumshoq nur halqasi) */}
      <div className="d1-cover-mid">
        <span className="d1-cover-glow" aria-hidden="true"/>
        <div className="d1-cover-fox">
          <FoxSVG mood="smile"/>
        </div>
      </div>

      {/* PAST (bottom): Boshlash tugmasi */}
      <div className="d1-cover-bottom">
        <button type="button" className="d1-start-btn" onClick={onStart}>
          Boshlash
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
};


// ============================================================
// SAHIFA 22 — SERTIFIKAT: oltin ramkali guvohnoma, medalli tulkicha,
// ism uchun chiziq, yulduzlar soni + bayramona musiqa (5-6 s).
// ============================================================
const CERT_VOICE = "Tabriklayman! Siz ushbu bosqichning barcha topshiriqlarini juda chiroyli bajardingiz. Endi siz — haqiqiy Diqqat chempionisiz! Men siz bilan juda g'ururlanaman!";

const RAIN = [
  { x: 4,  d: 0,   c: '#FF5A8A' }, { x: 12, d: 1.4, c: '#FFD34D' },
  { x: 22, d: 0.6, c: '#5AC8FA' }, { x: 30, d: 2.0, c: '#43C465' },
  { x: 40, d: 0.2, c: '#8E5AE8' }, { x: 48, d: 1.7, c: '#FF7043' },
  { x: 58, d: 0.9, c: '#FFD34D' }, { x: 66, d: 2.3, c: '#FF5A8A' },
  { x: 76, d: 0.4, c: '#43C465' }, { x: 84, d: 1.2, c: '#5AC8FA' },
  { x: 92, d: 1.9, c: '#8E5AE8' }, { x: 97, d: 0.7, c: '#FF7043' },
];

// Oltin medal (tulkichaga taqiladi)
const MedalSVG = () => (
  <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden="true">
    <path d="M22 0 L30 26 L38 0 L48 4 L34 34 L26 34 L12 4 Z" fill="#F2647C"/>
    <circle cx="30" cy="52" r="22" fill="#FFC23C" stroke="#E0992A" strokeWidth="3"/>
    <circle cx="30" cy="52" r="15" fill="#FFD86B"/>
    <path d="M30 42 L33 49 L40 49.6 L35 54.4 L36.6 61.4 L30 57.6 L23.4 61.4 L25 54.4 L20 49.6 L27 49 Z" fill="#E0992A"/>
  </svg>
);

const CertificatePage = ({ stars, total, onReplay, onBack }) => {
  useVoice(CERT_VOICE);
  useEffect(() => { const id = setTimeout(sfxFestive, 700); return () => clearTimeout(id); }, []);
  return (
    <div className="d1-final fade-up">
      <div className="d1-rain" aria-hidden="true">
        {RAIN.map(({ x, d, c }, i) => (
          <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
        ))}
      </div>
      {/* guvohnoma kartasi */}
      <div className="d1-cert">
        <p className="d1-cert-eyebrow">✦ DIQQAT CHEMPIONI — 1-daraja ✦</p>
        <h1 className="d1-cert-title">Tabriklaymiz!</h1>
        <div className="d1-cert-fox">
          <FoxSVG mood="cheer"/>
          <span className="d1-cert-medal"><MedalSVG/></span>
        </div>
        <div className="d1-cert-name">
          <span className="d1-cert-name-label">Ism:</span>
          <span className="d1-cert-name-line"/>
        </div>
        <div className="d1-cert-stars">
          <span className="d1-cert-star"><GoldStar/></span>
          <span className="d1-cert-count">{stars} / {total}</span>
          <span className="d1-cert-sub">ta yulduzcha yig'dingiz!</span>
        </div>
      </div>
      <div className="d1-cert-actions">
        <button type="button" className="d1-nav-back" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6"/>
          </svg>
          Orqaga
        </button>
        <button type="button" className="d1-start-btn" onClick={onReplay}>Qayta o'ynash</button>
      </div>
    </div>
  );
};

// ============================================================
// ILDIZ KOMPONENT — 22 sahifa (spets: 1_darslik.pdf / .md):
//  0 Muqova · 1 Soya-mushukcha · 2 Soya-quyoncha · 3 Saralash-meva ·
//  4 Saralash-o'yinchoq · 5 Ketma-ketlik-hayvon · 6 Ketma-ketlik-shakl ·
//  7-9 Farq-top (o'yinchoq/bog'/o'rmon) · 10 Motivatsiya · 11 Yodlash-savat ·
//  12 Sanoq-pitsa · 13 Sanoq-konfet · 14 Juftini-top (baliqchalar) ·
//  15 Farq-top (kosmos) ·
//  16 Berkinmachoq (o'rdakchalar) · 17 Ketma-ketlik-rang · 18 Almashinuv-polka ·
//  19 Ortiqchasini-top (4 ekran) · 20 G'alati narsalar · 21 Sertifikat.
// Yulduz parvozi: pop -> hisoblagichga uchadi -> +1 (sahifa limiti bilan);
// advance=true bo'lsa qisqa pauzadan keyin avto-o'tish.
// ============================================================
// Har sahifada nechta yulduz olish mumkin (qayta yechishda ortmasin)
const PAGE_MAX = { 1: 1, 2: 1, 3: 3, 4: 3, 5: 1, 6: 1, 7: 3, 8: 4, 9: 1, 10: 0, 11: 1, 12: 3, 13: 3, 14: 3, 15: 4, 16: 3, 17: 1, 18: 2, 19: 4, 20: 5, 21: 0 };
const TOTAL_STARS = Object.values(PAGE_MAX).reduce((a, b) => a + b, 0); // 47
const LAST_PAGE = 21;

export default function Dars01({ ttsApiBase, voiceGender, onFinished }) {
  configureLesson({ ttsApiBase: ttsApiBase || '', voiceGender: voiceGender || 'f' });

  const [page, setPage] = useState(0);
  const [stars, setStars] = useState(0);
  const [flight, setFlight] = useState(null);   // { x, y, phase:'init'|'pop'|'go', tx, ty }
  const [bump, setBump] = useState(false);
  const counterRef = useRef(null);
  const timersRef = useRef([]);
  const pageRef = useRef(0);
  const starsByRef = useRef({});                // sahifa -> olingan yulduzlar (limit uchun)
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Yulduz parvozi: pt — bosilgan nuqta. MUHIM: sahifa AVTO-O'TMAYDI —
  // bola faqat "Keyingi" tugmasini bosgandagina keyingi sahifaga o'tadi.
  const startFlight = useCallback((pt) => {
    setFlight({ x: pt.x, y: pt.y, phase: 'init', tx: pt.x, ty: pt.y });
    later(() => setFlight(f => (f ? { ...f, phase: 'pop' } : f)), 30);
    later(() => {
      setFlight(f => {
        if (!f) return f;
        const el = counterRef.current;
        const r = el ? el.getBoundingClientRect() : null;
        return { ...f, phase: 'go', tx: r ? r.left + r.width / 2 : f.x, ty: r ? r.top + r.height / 2 : 40 };
      });
    }, 560);
    later(() => {
      setFlight(null);
      sfxChiling();
      setBump(true);
      later(() => setBump(false), 550);
      const p = pageRef.current;
      // sahifa limiti: qayta o'ynalganda yulduz soni oshib ketmaydi
      const got = starsByRef.current[p] || 0;
      if (got < (PAGE_MAX[p] || 0)) {
        starsByRef.current[p] = got + 1;
        setStars(s => s + 1);
      }
    }, 1460);
  }, []);

  const flightApi = React.useMemo(() => ({ onCorrect: startFlight }), [startFlight]);

  const replay = () => { setStars(0); starsByRef.current = {}; setPage(0); };

  const finishedRef = useRef(false);
  useEffect(() => {
    if (page === LAST_PAGE && !finishedRef.current) {
      finishedRef.current = true;
      if (typeof onFinished === 'function') {
        onFinished({ lessonId: 'att-1-01-v1', stars, total: TOTAL_STARS });
      }
    }
    if (page === 0) finishedRef.current = false;
  }, [page, stars, onFinished]);

  const inGame = page >= 1 && page <= LAST_PAGE - 1;
  const nav = { onBack: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => Math.min(LAST_PAGE, p + 1)) };

  // 22 sahifalik xarita
  const view = (() => {
    switch (page) {
      case 0:  return <CoverPage onStart={() => setPage(1)}/>;
      case 1:  return <ShadowGamePage key={page} cfg={SHADOW_CFG_CAT} {...nav}/>;
      case 2:  return <ShadowGamePage key={page} cfg={SHADOW_CFG_BUNNY} {...nav}/>;
      case 3:  return <ColorSortPage key={page} cfg={SORT_CFG_FRUITS} {...nav}/>;
      case 4:  return <ColorSortPage key={page} cfg={SORT_CFG_TOYS} {...nav}/>;
      case 5:  return <SequencePage key={page} cfg={SEQ_CFG_ANIMALS} {...nav}/>;
      case 6:  return <SequencePage key={page} cfg={SEQ_CFG_SHAPES} {...nav}/>;
      case 7:  return <DiffPage key={page} cfg={DIFF_CFG_TOYS} {...nav}/>;
      case 8:  return <DiffPage key={page} cfg={DIFF_CFG_NIGHT} {...nav}/>;
      case 9:  return <ColorChangePage key={page} {...nav}/>;
      case 10: return <MotivationPage key={page} stars={stars} onNext={nav.onNext}/>;
      case 11: return <MemoryBasketPage key={page} {...nav}/>;
      case 12: return <CountPage key={page} cfg={COUNT_CFG_PIZZA} {...nav}/>;
      case 13: return <CountPage key={page} cfg={COUNT_CFG_CANDY} {...nav}/>;
      case 14: return <FishPairPage key={page} {...nav}/>;
      case 15: return <DiffPage key={page} cfg={DIFF_CFG_SPACE} {...nav}/>;
      case 16: return <HiddenDuckPage key={page} {...nav}/>;
      case 17: return <SequencePage key={page} cfg={SEQ_CFG_COLORS} {...nav}/>;
      case 18: return <SwapShelfPage key={page} {...nav}/>;
      case 19: return <OddOutPage key={page} {...nav}/>;
      case 20: return <OddPage key={page} {...nav}/>;
      default: return <CertificatePage stars={stars} total={TOTAL_STARS} onReplay={replay} onBack={nav.onBack}/>;
    }
  })();

  // parvoz yulduzchasining joriy inline-holati
  const flyStyle = flight ? (
    flight.phase === 'go'
      ? { left: flight.tx, top: flight.ty, transform: 'translate(-50%, -50%) scale(0.42)' }
      : { left: flight.x, top: flight.y, transform: `translate(-50%, -50%) scale(${flight.phase === 'pop' ? 1.25 : 0.1})` }
  ) : null;

  return (
    <FlightCtx.Provider value={flightApi}>
      <style>{STYLES}</style>
      <div className="d1-root">
        {/* sahifa progressi (son.png uslubi): eng tepada to'liq enli uzun chiziq */}
        {inGame && (
          <div className="d1-pageline" aria-hidden="true">
            <span className="d1-pageline-fill" style={{ width: `${((page + 1) / (LAST_PAGE + 1)) * 100}%` }}/>
          </div>
        )}
        {/* yuqori panel: maskot + sahifa soni + yulduz-hisoblagich (o'yin sahifalarida) */}
        {inGame && (
          <div className="d1-topbar">
            <div className="d1-brand">
              <span className="d1-brand-fox"><FoxSVG mood="smile"/></span>
              <span className="d1-brand-txt" aria-label="Zukko ko'zlar">
                {"Zukko ko'zlar".split('').map((ch, i) => (
                  <span key={i} className="d1-brand-ch" aria-hidden="true"
                    style={{ animationDelay: `${i * 0.12}s` }}>
                    {ch === ' ' ? ' ' : ch}
                  </span>
                ))}
              </span>
            </div>
            <div className="d1-top-right">
              <span className="d1-pagenum" aria-label={`Sahifa ${page + 1} / ${LAST_PAGE + 1}`}>
                {String(page + 1).padStart(2, '0')} / {LAST_PAGE + 1}
              </span>
              <div ref={counterRef} className={`d1-counter ${bump ? 'bump' : ''}`}>
                <span className="d1-counter-star"><GoldStar/></span>
                <span className="d1-counter-num">x{stars}</span>
              </div>
            </div>
          </div>
        )}

        {view}

        {/* uchuvchi yulduzcha (fixed overlay) */}
        {flight && (
          <span className={`d1-fly ${flight.phase === 'go' ? 'go' : ''}`} style={flyStyle} aria-hidden="true">
            <GoldStar/>
          </span>
        )}
      </div>
    </FlightCtx.Provider>
  );
}

// ============================================================
// STILLAR — flat, yumaloq burchaklar, yumshoq soyalar, bolalar kitobi uslubi
// ============================================================
const STYLES = `
html, body { margin: 0; padding: 0; }
.d1-root, .d1-root * { box-sizing: border-box; }
.d1-root {
  font-family: 'Manrope', 'Nunito', system-ui, sans-serif;
  color: #3D3A50;
  position: fixed;
  inset: 0;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  /* fon.png uslubi: och, neytral kulrang-ko'k sahifa foni */
  background: #EFF3F9;
  display: flex;
  flex-direction: column;
}
.d1-root h1, .d1-root h2, .d1-root p { margin: 0; }
.d1-root button { -webkit-tap-highlight-color: transparent; }

@keyframes d1fadeup { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: d1fadeup 0.45s ease-out both; }

/* ===== YUQORI PANEL: brend + yulduz-hisoblagich ===== */
.d1-topbar {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(10px, 2vw, 16px) clamp(14px, 3vw, 28px) 0;
  z-index: 20;
}
/* sahifa progress chizig'i (son.png uslubi): eng tepada, to'liq enli */
.d1-pageline {
  flex-shrink: 0;
  width: 100%; height: clamp(6px, 1vh, 9px);
  background: #E1E6F0;
}
.d1-pageline-fill {
  display: block; height: 100%;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, #FFB25E, #FF7043);
  box-shadow: 0 0 10px 2px rgba(255, 112, 67, 0.45);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.d1-top-right { display: flex; align-items: center; gap: clamp(8px, 1.6vw, 14px); }
/* sahifa soni: 07 / 22 */
.d1-pagenum {
  font-weight: 800; font-size: clamp(13px, 2vh, 16px);
  letter-spacing: 0.08em; color: #6E6A85;
  background: #FFFFFF; border-radius: 999px;
  padding: clamp(7px, 1.2vh, 10px) clamp(12px, 1.8vw, 18px);
  box-shadow: 0 6px 16px -6px rgba(61, 58, 80, 0.2);
  white-space: nowrap;
}
.d1-brand { display: flex; align-items: center; gap: 8px; }
.d1-brand-fox {
  width: clamp(34px, 5vw, 44px); display: inline-flex;
  transform-origin: 50% 88%;
  animation: d1foxbob 3s ease-in-out infinite;
}
@keyframes d1foxbob {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  20%      { transform: rotate(-5deg) translateY(-2px); }
  40%      { transform: rotate(3deg) translateY(0); }
  60%      { transform: rotate(-2deg) translateY(-1px); }
  80%      { transform: rotate(4deg) translateY(0); }
}
.d1-brand-txt { font-weight: 800; font-size: clamp(15px, 2.2vw, 19px); letter-spacing: 0.02em; }
/* harflar navbat bilan mayin sakraydi (to'lqin) */
.d1-brand-ch {
  display: inline-block;
  animation: d1chwave 3s ease-in-out infinite;
}
@keyframes d1chwave {
  0%, 30%, 100% { transform: translateY(0); color: #3D3A50; }
  10% { transform: translateY(-4px) scale(1.08); color: #E8703A; }
  20% { transform: translateY(0.5px) scale(1); color: #3D3A50; }
}
.d1-counter {
  display: flex; align-items: center; gap: 7px;
  background: #FFFFFF;
  border-radius: 999px;
  padding: clamp(5px, 1vw, 8px) clamp(12px, 2vw, 18px);
  box-shadow: 0 6px 18px -6px rgba(61, 58, 80, 0.28);
}
.d1-counter-star { width: clamp(22px, 3.4vw, 28px); display: inline-flex; }
.d1-counter-num { font-weight: 800; font-size: clamp(16px, 2.6vw, 21px); }
@keyframes d1bump { 0% { transform: scale(1); } 45% { transform: scale(1.32) rotate(-4deg); } 100% { transform: scale(1); } }
.d1-counter.bump { animation: d1bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }

/* karnaycha — ovozni o'chirish/yoqish tugmasi */
.d1-voice-btn {
  position: absolute; top: clamp(12px, 2vh, 20px); right: clamp(12px, 2vw, 22px); z-index: 6;
  width: clamp(46px, 7vh, 58px); aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, #FFB25E 0%, #FF7043 100%);
  color: #FFFFFF;
  border: none; border-radius: 50%; cursor: pointer;
  box-shadow: 0 8px 18px -6px rgba(232, 112, 58, 0.6), inset 0 -3px 0 rgba(140, 50, 20, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
/* "tinglang!" halqasi — sekin kengayib so'nadi */
.d1-voice-btn::before {
  content: '';
  position: absolute; inset: -3px;
  border-radius: 50%;
  border: 3px solid rgba(255, 112, 67, 0.55);
  animation: d1voiceping 2.2s ease-out infinite;
  pointer-events: none;
}
@keyframes d1voiceping {
  0%   { transform: scale(1); opacity: 0.8; }
  70%  { transform: scale(1.45); opacity: 0; }
  100% { transform: scale(1.45); opacity: 0; }
}
.d1-voice-btn:hover { transform: scale(1.1); box-shadow: 0 12px 26px -8px rgba(232, 112, 58, 0.7), inset 0 -3px 0 rgba(140, 50, 20, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.35); }
.d1-voice-btn:active { transform: scale(0.92); }
.d1-voice-btn.off {
  background: linear-gradient(145deg, #D9D6E4 0%, #B9B5CC 100%);
  color: #FFFFFF;
  box-shadow: 0 6px 14px -6px rgba(61, 58, 80, 0.35), inset 0 -3px 0 rgba(61, 58, 80, 0.15);
}
.d1-voice-btn.off::before { animation: none; opacity: 0; }

/* ===== MUQOVA: sarlavha yuqorida · tulki markazda · tugma pastda ===== */
.d1-cover {
  position: relative; flex: 1; overflow: hidden;
  display: flex; flex-direction: column; align-items: center;
  background: linear-gradient(180deg, #FFE9A8 0%, #FFF6D9 34%, #CDEFFF 100%);
}
.d1-cover-cloud { position: absolute; opacity: 0.9; z-index: 0; animation: d1drift 7s ease-in-out infinite alternate; }
@keyframes d1drift { from { transform: translateX(-8px); } to { transform: translateX(14px); } }
.d1-cover-star { position: absolute; z-index: 0; animation: d1twinkle 2.6s ease-in-out infinite; }
@keyframes d1twinkle { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.28) rotate(10deg); opacity: 1; } }

/* yuqori blok — sarlavha */
.d1-cover-top {
  position: relative; z-index: 2;
  flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center;
  gap: clamp(8px, 1.6vh, 14px);
  padding: clamp(18px, 4vh, 40px) 16px 0;
  text-align: center;
}
.d1-cover-eyebrow {
  font-size: clamp(11px, 1.6vw, 14px); font-weight: 800;
  letter-spacing: 0.22em; text-transform: uppercase; color: #8A6B2F;
  background: rgba(255, 255, 255, 0.65);
  padding: 6px 16px; border-radius: 999px;
}
.d1-cover-title {
  font-size: clamp(42px, 9.5vw, 82px);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}
.d1-title-ch {
  display: inline-block;
  text-shadow: 0 4px 0 #FFFFFF, 0 9px 20px rgba(61, 58, 80, 0.22);
  animation: d1titlepop 0.55s cubic-bezier(0.34, 1.6, 0.64, 1) both;
}
.d1-title-space { display: inline-block; width: 0.35em; }
@keyframes d1titlepop {
  0% { opacity: 0; transform: translateY(22px) scale(0.3); }
  70% { opacity: 1; transform: translateY(-6px) scale(1.15); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* markaz — tulki maskoti + yumshoq nur halqasi */
.d1-cover-mid {
  position: relative; z-index: 2;
  flex: 1; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  width: 100%;
}
.d1-cover-glow {
  position: absolute;
  width: clamp(230px, 44vh, 400px); aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.35) 55%, rgba(255, 255, 255, 0) 72%);
}
.d1-cover-fox { position: relative; width: clamp(180px, 36vh, 320px); animation: d1bob 2.6s ease-in-out infinite; }
@keyframes d1bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

/* past (bottom) blok — Boshlash tugmasi */
.d1-cover-bottom {
  position: relative; z-index: 2;
  flex-shrink: 0;
  width: 100%;
  display: flex; justify-content: center;
  padding: clamp(10px, 2vh, 18px) 20px calc(clamp(18px, 4vh, 36px) + env(safe-area-inset-bottom, 0px));
}
.d1-start-btn {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(18px, 3vw, 24px);
  color: #FFFFFF;
  background: linear-gradient(180deg, #4FC46B, #2FA45C);
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(13px, 2.2vh, 18px) clamp(34px, 6vw, 54px);
  box-shadow: 0 8px 0 #1F7A42, 0 16px 30px -8px rgba(47, 164, 92, 0.55);
  transition: transform 0.15s, box-shadow 0.15s;
}
.d1-start-btn:hover { transform: translateY(-2px); }
.d1-start-btn:active { transform: translateY(4px); box-shadow: 0 3px 0 #1F7A42, 0 8px 16px -8px rgba(47, 164, 92, 0.5); }

/* ===== O'YIN SAHIFASI ===== */
.d1-game {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  padding: clamp(6px, 1.4vh, 14px) clamp(12px, 3vw, 40px) clamp(12px, 2.4vh, 22px);
  max-width: 1060px; width: 100%; margin: 0 auto;
}
.d1-game-head {
  flex-shrink: 0;
  display: flex; align-items: center; gap: clamp(10px, 2vw, 18px);
  padding: clamp(4px, 1vh, 10px) 0 clamp(8px, 1.6vh, 14px);
}
.d1-round-chip {
  font-weight: 800; font-size: clamp(12px, 1.8vw, 15px);
  background: #FFFFFF; color: #6E6A85;
  border-radius: 999px; padding: 6px 13px;
  box-shadow: 0 4px 12px -4px rgba(61, 58, 80, 0.2);
  white-space: nowrap;
}
.d1-question { flex: 1; font-size: clamp(17px, 3vw, 26px); font-weight: 800; line-height: 1.2; }
.d1-q-sub { display: block; font-size: clamp(12px, 1.8vw, 15px); font-weight: 700; color: #6E6A85; margin-top: 2px; }
.d1-fox-mini { width: clamp(52px, 8vh, 84px); flex-shrink: 0; }

.d1-pair {
  flex: 1; min-height: 0;
  display: flex; align-items: center; gap: clamp(6px, 1.4vw, 14px);
  position: relative;
}
.d1-panel {
  position: relative;
  flex: 1; min-width: 0;
  aspect-ratio: 1 / 1.02;
  max-height: 100%;
  border-radius: clamp(16px, 2.6vw, 26px);
  box-shadow: 0 10px 26px -8px rgba(61, 58, 80, 0.3), inset 0 0 0 4px rgba(255, 255, 255, 0.55);
  overflow: hidden;
}
.d1-panel-tag {
  position: absolute; left: 10px; top: 8px; z-index: 3;
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 50%;
  font-weight: 800; font-size: 14px; color: #6E6A85;
}
.d1-vs { width: clamp(34px, 5vw, 52px); flex-shrink: 0; filter: drop-shadow(0 4px 8px rgba(61,58,80,0.25)); }

/* sahna ob'ektlari */
.d1-obj {
  position: absolute;
  transform: translate(-50%, -50%);
  aspect-ratio: 1;
  display: block;
  animation: d1float 3.4s ease-in-out infinite;
}
@keyframes d1float { 0%, 100% { transform: translate(-50%, -50%) translateY(0); } 50% { transform: translate(-50%, -50%) translateY(-5px); } }
.d1-obj-btn {
  background: transparent; border: none; padding: 3px; margin: 0;
  cursor: pointer; border-radius: 18px;
  transition: filter 0.15s;
}
.d1-obj-btn:not(:disabled):hover { filter: brightness(1.08) drop-shadow(0 0 6px rgba(255,255,255,0.8)); }
.d1-obj-btn:disabled { cursor: default; }

/* TO'G'RI JAVOB: yashil yorqin ramka (spetsifikatsiya 1-bandi) */
.d1-hit-ok {
  animation: none;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.75);
}

/* NOTO'G'RI: butun karta yumshoq chapga-o'ngga silkinadi (qattiq emas) */
@keyframes d1shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-7px) rotate(-0.4deg); }
  38% { transform: translateX(6px) rotate(0.4deg); }
  58% { transform: translateX(-4px); }
  78% { transform: translateX(3px); }
}
.d1-shake { animation: d1shake 0.5s ease; }

/* konfetti portlashi (tanlangan ob'ekt ustida) */
.d1-burst { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.d1-burst i {
  position: absolute; left: 50%; top: 50%;
  width: 9px; height: 9px; border-radius: 2.5px;
  animation: d1burst 0.75s ease-out both;
}
@keyframes d1burst {
  0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--bx)), calc(-50% + var(--by))) scale(0.5) rotate(220deg); opacity: 0; }
}

/* uchuvchi yulduzcha: pop (bosilgan joyda) -> hisoblagich tomon parvoz */
.d1-fly {
  position: fixed; z-index: 90;
  width: clamp(42px, 6vw, 56px); aspect-ratio: 1;
  pointer-events: none;
  filter: drop-shadow(0 0 10px rgba(255, 194, 60, 0.9));
  transition: transform 0.4s cubic-bezier(0.34, 1.8, 0.64, 1);
}
.d1-fly.go {
  transition:
    left 0.8s cubic-bezier(0.5, -0.15, 0.55, 1),
    top 0.8s cubic-bezier(0.3, 0.7, 0.5, 1),
    transform 0.8s ease-in;
}

/* ===== SOYA TOPISH SAHIFASI (Format 3) ===== */
.d1-shadow {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; align-items: center;
  padding: clamp(4px, 1vh, 12px) 16px 0;
  /* fon.png uslubi: karta yon taraflarga kengroq yoyiladi */
  width: 100%; max-width: min(1100px, 96vw); margin: 0 auto;
}
.d1-shadow-title {
  flex-shrink: 0;
  font-size: clamp(18px, 3.4vw, 28px); font-weight: 800;
  color: #3D3A50; text-align: center;
  padding: clamp(2px, 0.8vh, 8px) 0 clamp(8px, 1.6vh, 14px);
}
/* katta o'yin kartasi — fon.png uslubi: qalin oq ramka + orqasida
   qiya "stiker" qatlamlari + yumshoq soya, eniga keng */
.d1-shadow-card {
  position: relative;
  flex: 1; min-height: 0;
  width: 100%;
  background: #FFFFFF;
  border: clamp(8px, 1.4vw, 12px) solid #FFFFFF;
  border-radius: clamp(26px, 4vw, 40px);
  box-shadow: 0 22px 55px -18px rgba(61, 58, 80, 0.35);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(8px, 2vh, 18px);
  padding: clamp(10px, 2.2vh, 20px) clamp(14px, 3vw, 28px) clamp(40px, 7vh, 56px);
}
/* orqadagi qiya qatlamlar (chap-o'ngga ozroq yoyilgan) */
.d1-shadow-card::before,
.d1-shadow-card::after {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: clamp(30px, 4.4vw, 46px);
  z-index: -1;
}
.d1-shadow-card::before { background: #FFFFFF; opacity: 0.75; transform: rotate(-1.4deg) scale(1.008); }
.d1-shadow-card::after  { background: #E2E8F2; opacity: 0.85; transform: rotate(1.1deg) scale(1.004); }
.d1-shadow-hero { width: clamp(160px, 32vh, 260px); flex-shrink: 0; }
/* past ekranlarda karta ichiga sig'sin */
@media (max-height: 720px) {
  .d1-shadow-hero { width: clamp(125px, 24vh, 185px); }
  .d1-sil { max-width: 150px; }
}

/* tematik fon qatlami — karta ichida, bosib bo'lmaydi */
.d1-theme {
  position: absolute; inset: 0; z-index: 0;
  border-radius: clamp(18px, 2.8vw, 30px);
  overflow: hidden;
  pointer-events: none;
}
.d1-theme-ic {
  position: absolute;
  aspect-ratio: 1;
  display: block;
}
/* kontent fon ustida tursin */
.d1-shadow-card.themed .d1-shadow-hero,
.d1-shadow-card.themed .d1-shadow-row { position: relative; z-index: 1; }
/* rangli fonda javob tugmalari oq bo'lib aniq ajralsin */
.d1-shadow-card.themed .d1-sil {
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 20px -10px rgba(61, 58, 80, 0.35);
}
.d1-shadow-card.themed .d1-sil:not(:disabled):hover { background: #FFFFFF; }
.d1-shadow-card.themed .d1-sil.ok {
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}
.d1-shadow-row {
  display: flex; gap: clamp(8px, 2vw, 16px);
  width: 100%; justify-content: center;
}
/* soya varianti tugmasi */
.d1-sil {
  position: relative;
  flex: 1; max-width: 190px; min-width: 0;
  aspect-ratio: 1;
  background: #F3F1F8;
  border: none; border-radius: 18px;
  padding: 10px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.d1-sil:not(:disabled):hover {
  transform: translateY(-3px);
  background: #EDEAF5;
  box-shadow: 0 10px 22px -8px rgba(61, 58, 80, 0.3);
}
.d1-sil:disabled { cursor: default; }
/* TO'G'RI soya: yashil yorqin ramka (umumiy mexanika 1-bandi) */
.d1-sil.ok {
  background: #E0F6E8;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}
/* karnaycha karta ichida chap-pastda (spets: "chap pastda ovoz belgisi") */
.d1-voice-btn.bl {
  position: absolute;
  top: auto; right: auto;
  left: clamp(10px, 2vw, 16px); bottom: clamp(10px, 2vh, 16px);
  width: clamp(42px, 6.5vh, 52px);
}

/* pastki panel: Orqaga / Keyingi */
.d1-footer {
  flex-shrink: 0;
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(10px, 2vh, 16px) 2px calc(clamp(12px, 2.4vh, 20px) + env(safe-area-inset-bottom, 0px));
}
.d1-nav-back {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(14px, 2.2vw, 17px);
  color: #6E6A85;
  background: #FFFFFF;
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(10px, 1.8vh, 14px) clamp(18px, 3vw, 26px);
  box-shadow: 0 6px 16px -6px rgba(61, 58, 80, 0.25);
  transition: transform 0.15s, box-shadow 0.15s;
}
.d1-nav-back:hover { transform: translateY(-2px); box-shadow: 0 10px 22px -6px rgba(61, 58, 80, 0.32); }
.d1-nav-next {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: inherit; font-weight: 800;
  font-size: clamp(14px, 2.2vw, 17px);
  color: #FFFFFF;
  background: linear-gradient(180deg, #4FC46B, #2FA45C);
  border: none; cursor: pointer;
  border-radius: 999px;
  padding: clamp(10px, 1.8vh, 14px) clamp(20px, 3.4vw, 30px);
  box-shadow: 0 6px 0 #1F7A42, 0 12px 24px -8px rgba(47, 164, 92, 0.5);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.d1-nav-next:hover:not(:disabled) { transform: translateY(-2px); }
.d1-nav-next:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 #1F7A42; }
.d1-nav-next:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; background: #B9B5C9; animation: none; }
/* topshiriq yechilgach "Keyingi" pulsatsiya bilan bolani chorlaydi
   (avto-o'tish YO'Q — faqat shu tugma bosilganda o'tadi) */
@keyframes d1nextpulse {
  0%, 100% { transform: scale(1); box-shadow: 0 6px 0 #1F7A42, 0 12px 24px -8px rgba(47, 164, 92, 0.5); }
  50% { transform: scale(1.06); box-shadow: 0 6px 0 #1F7A42, 0 14px 30px -6px rgba(47, 164, 92, 0.75); }
}
.d1-nav-next:not(:disabled) { animation: d1nextpulse 1.3s ease-in-out infinite; }

/* ===== SERTIFIKAT ===== */
.d1-final {
  position: relative; flex: 1; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(8px, 1.6vh, 16px);
  padding: 20px; text-align: center;
  background: linear-gradient(180deg, #FFE9A8 0%, #FFF6D9 34%, #CDEFFF 100%);
}
.d1-final-title {
  font-size: clamp(36px, 8vw, 64px); font-weight: 800; color: #FF7043;
  text-shadow: 0 4px 0 #FFFFFF, 0 9px 22px rgba(255, 112, 67, 0.35);
}
.d1-final-stars {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: clamp(6px, 1.4vw, 12px);
  width: min(92vw, 470px);
}
.d1-final-star { opacity: 0.25; transform: scale(0.6); }
.d1-final-star.on { animation: d1starpop 0.5s cubic-bezier(0.34, 1.6, 0.64, 1) both; }
@keyframes d1starpop { 0% { opacity: 0; transform: scale(0.2) rotate(-30deg); } 70% { opacity: 1; transform: scale(1.25) rotate(6deg); } 100% { opacity: 1; transform: scale(1); } }
.d1-final-count { display: flex; align-items: baseline; gap: 6px; font-weight: 800; }
.d1-final-num { font-size: clamp(30px, 6vw, 46px); color: #2FA45C; }
.d1-final-total { font-size: clamp(16px, 3vw, 22px); color: #6E6A85; }
.d1-final-fox { width: clamp(150px, 26vh, 240px); animation: d1bob 2.2s ease-in-out infinite; }

/* bayram konfetti yomg'iri */
.d1-rain { position: absolute; inset: 0; pointer-events: none; }
.d1-rain i {
  position: absolute; top: -20px;
  width: 10px; height: 14px; border-radius: 3px;
  animation: d1rainfall 3.6s linear infinite;
}
@keyframes d1rainfall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(340deg); opacity: 0.75; }
}

/* ===== REDUCED MOTION ===== */
@media (prefers-reduced-motion: reduce) {
  .d1-obj, .d1-cover-fox, .d1-final-fox, .d1-cover-cloud, .d1-cover-star,
  .d1-brand-fox, .d1-brand-ch,
  .d1-shake, .d1-counter.bump, .d1-rain i { animation: none !important; }
  .d1-voice-btn::before { animation: none !important; opacity: 0 !important; }
  .d1-burst i { animation-duration: 0.01s !important; }
  .d1-fly, .d1-fly.go { transition-duration: 0.01s !important; }
  .fade-up { animation-duration: 0.01s !important; }
  .d1-final-star.on { animation: none !important; opacity: 1; transform: scale(1); }
}

/* ===== YANGI SAHIFALAR (22-sahifalik darslik) ===== */

/* farq-top: juft rasm + topilganlar doirachalari — bitta katta karta ichida */
/* farq-top sahifalarida karta kengroq — rasmlar kattaroq ko'rinadi */
.d1-shadow:has(.d1-diff-card) { max-width: min(1260px, 98vw); }
.d1-diff-card { justify-content: stretch; padding: clamp(10px, 2vh, 18px); gap: clamp(8px, 1.6vh, 14px); }
.d1-diff-card .d1-pair { width: 100%; }
.d1-diff-card .d1-panel { box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.6); }
.d1-diff-wrap { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; gap: clamp(8px, 1.6vh, 14px); }
.d1-pair { flex: 1; min-height: 0; display: flex; align-items: center; gap: clamp(6px, 1.4vw, 14px); position: relative; }
.d1-diff-dots { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: clamp(8px, 1.6vw, 14px); position: relative; padding-bottom: 2px; }
.d1-diff-dot {
  width: clamp(26px, 4.4vh, 34px); aspect-ratio: 1; border-radius: 50%;
  background: #FFFFFF; box-shadow: inset 0 0 0 3px rgba(110, 106, 133, 0.3);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: clamp(14px, 2.4vh, 18px); color: #FFFFFF;
  transition: background 0.25s, box-shadow 0.25s;
}
.d1-diff-dot.on { background: #2FA45C; box-shadow: 0 4px 12px -3px rgba(47, 164, 92, 0.6); animation: d1bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }
/* g'oyib bo'lgan ob'ekt uchun ko'rinmas tugma (topilgunga qadar) */
.d1-ghost { background: transparent; }
.d1-ghost:not(:disabled):hover { filter: none; }

/* SEHRLI FONAR (9-sahifa): qorong'i qatlam — nur doirasi radial-gradient
   orqali, pointer-events yo'q (bosishlar ostidagi ob'ektlarga o'tadi) */
.d1-dark {
  position: absolute; inset: 0; z-index: 2;
  pointer-events: none;
  touch-action: none;
  animation: d1darkin 0.35s ease;
}
@keyframes d1darkin { from { opacity: 0; } to { opacity: 1; } }
.d1-firefly {
  position: absolute;
  width: 7px; height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: #FFE066;
  box-shadow: 0 0 8px 3px rgba(255, 224, 102, 0.75);
  animation: d1firefly 3.6s ease-in-out infinite;
}
@keyframes d1firefly {
  0%, 100% { opacity: 0.15; transform: translate(0, 0) scale(0.8); }
  35%      { opacity: 0.95; transform: translate(6px, -8px) scale(1.15); }
  70%      { opacity: 0.4;  transform: translate(-5px, 5px) scale(0.9); }
}

/* RANG O'ZGARDI (10-sahifa): o'tloq sahnasi, lampochka-taymer, do'stlar qatori */
.d1-shadow-card.themed .d1-cc-scene { position: relative; z-index: 1; }
.d1-cc-scene {
  position: relative;
  border-radius: clamp(16px, 2.6vw, 26px);
  background: linear-gradient(180deg, #DFF3FF 0%, #CDEFC0 55%, #A8DF8E 100%);
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.55);
  padding: clamp(46px, 9vh, 72px) clamp(10px, 3vw, 26px) clamp(18px, 4vh, 30px);
  overflow: hidden;
}
.d1-cc-decor {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.d1-cc-lamps {
  position: absolute; top: clamp(6px, 1.4vh, 12px); left: 50%;
  transform: translateX(-50%);
  display: flex; gap: clamp(8px, 2vw, 18px);
  z-index: 2;
}
.d1-cc-bulb {
  width: clamp(24px, 4.6vw, 40px); aspect-ratio: 40 / 54;
  transition: opacity 0.35s, filter 0.35s;
}
.d1-cc-bulb.on {
  filter: drop-shadow(0 0 8px rgba(255, 211, 77, 0.9));
  animation: d1bulb 1s ease-in-out infinite;
}
.d1-cc-bulb:not(.on) { opacity: 0.45; }
@keyframes d1bulb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.d1-cc-row {
  position: relative;
  display: flex; justify-content: center; align-items: flex-end;
  gap: clamp(10px, 3vw, 30px);
}
.d1-cc-animal {
  width: clamp(56px, 14vw, 116px); aspect-ratio: 1;
  display: block;
  animation: d1ccfloat 3.4s ease-in-out infinite;
}
.d1-cc-animal:nth-child(2) { animation-delay: 0.4s; }
.d1-cc-animal:nth-child(3) { animation-delay: 0.8s; }
.d1-cc-animal:nth-child(4) { animation-delay: 1.2s; }
@keyframes d1ccfloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.d1-cc-animal.changed { animation: d1ccpop 0.55s ease; }
@keyframes d1ccpop {
  0%   { transform: scale(0.5) rotate(-8deg); }
  60%  { transform: scale(1.18) rotate(4deg); }
  100% { transform: scale(1) rotate(0); }
}
/* karnaycha doirachalar qatorida (inline) */
/* position: relative — ping halqasi (::before) tugmaning o'ziga yopishib tursin */
.d1-voice-btn.inline { position: relative; top: auto; right: auto; width: clamp(38px, 6vh, 46px); margin-left: clamp(6px, 1.4vw, 12px); }

/* g'alati narsalar: bitta katta panel */
.d1-odd-panel { flex: 1; min-height: 0; width: 100%; aspect-ratio: auto; }
.d1-shadow-card.themed .d1-odd-panel { z-index: 1; }

/* rangga saralash */
.d1-sort-boxes { display: flex; gap: clamp(12px, 2.8vw, 26px); width: 100%; justify-content: center; }
.d1-box {
  position: relative; flex: 1; max-width: clamp(150px, 26vh, 200px); aspect-ratio: 1 / 1.05;
  border: none; border-radius: 20px;
  background: #FBFAFE;
  box-shadow: 0 8px 20px -8px rgba(61, 58, 80, 0.25), inset 0 0 0 4px var(--boxc);
  transition: transform 0.15s, box-shadow 0.15s;
  overflow: hidden;
  padding: 0;
}
/* narsa sudrab USTIGA kelganda quti "uyg'onadi" */
.d1-box.hover {
  transform: translateY(-5px) scale(1.05);
  box-shadow: 0 14px 30px -10px rgba(61, 58, 80, 0.4), inset 0 0 0 5px var(--boxc);
}
.d1-box-lid { position: absolute; left: 0; right: 0; top: 0; height: 22%; opacity: 0.9; }
.d1-box-mark {
  position: absolute; top: 8%; left: 50%; transform: translate(-50%, 0);
  width: 16px; height: 16px; border-radius: 50%;
  box-shadow: 0 0 0 3px #FFFFFF;
}
.d1-box-slot { position: absolute; inset: 26% 8% 8%; display: flex; align-items: center; justify-content: center; }
.d1-box-item { width: 70%; display: block; }
.d1-sort-items { display: flex; gap: clamp(12px, 2.8vw, 26px); justify-content: center; width: 100%; }
.d1-sort-item {
  width: clamp(80px, 14vh, 118px); aspect-ratio: 1;
  background: #F3F1F8; border: none; border-radius: 20px;
  cursor: grab; touch-action: none;
  padding: 10px; transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.d1-sort-item:hover { transform: translateY(-3px); box-shadow: 0 10px 22px -8px rgba(61, 58, 80, 0.3); }
/* ushlab ko'tarilgan narsaning o'rni xira bo'lib turadi */
.d1-sort-item.lift { opacity: 0.3; transform: scale(0.94); cursor: grabbing; }
.d1-sort-item.done { visibility: hidden; }
/* barmoq/sichqoncha ostida uchib yuradigan nusxa */
.d1-drag-ghost {
  position: fixed; z-index: 80;
  width: clamp(80px, 14vh, 118px); aspect-ratio: 1;
  transform: translate(-50%, -62%) scale(1.15) rotate(-4deg);
  pointer-events: none;
  filter: drop-shadow(0 14px 18px rgba(61, 58, 80, 0.35));
}
.d1-hint { font-size: clamp(13px, 2.2vh, 16px); font-weight: 700; color: #6E6A85; text-align: center; }
@keyframes d1selpulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
/* saralash sahifasida tematik fon ustidagi qatlamlar */
.d1-shadow-card.themed .d1-sort-boxes,
.d1-shadow-card.themed .d1-sort-items { position: relative; z-index: 1; }
.d1-shadow-card.themed .d1-sort-item { background: rgba(255, 255, 255, 0.94); }
/* qolgan o'yin sahifalarida ham kontent tematik fon USTIDA tursin */
.d1-shadow-card.themed .d1-seq-row,
.d1-shadow-card.themed .d1-seq-opts,
.d1-shadow-card.themed .d1-mem-scene,
.d1-shadow-card.themed .d1-count-row,
.d1-shadow-card.themed .d1-pair,
.d1-shadow-card.themed .d1-diff-dots { position: relative; z-index: 1; }
/* rangli fonda naqsh katakchalari oq bo'lib aniq ajralsin */
.d1-shadow-card.themed .d1-seq-cell { background: rgba(255, 255, 255, 0.9); box-shadow: 0 8px 20px -12px rgba(61, 58, 80, 0.35); }
.d1-shadow-card.themed .d1-seq-slot:not(.filled) { background: rgba(237, 245, 255, 0.92); }
.d1-shadow-card.themed .d1-count-card { background: rgba(255, 255, 255, 0.94); }
@media (max-height: 720px) {
  .d1-box { max-width: clamp(130px, 22vh, 160px); }
  .d1-sort-item, .d1-drag-ghost { width: clamp(64px, 11vh, 92px); }
}

/* ketma-ketlik */
.d1-seq-row { display: flex; align-items: center; justify-content: center; gap: clamp(8px, 2vw, 18px); width: 100%; flex-wrap: wrap; }
.d1-seq-cell {
  width: clamp(76px, 14vh, 126px); aspect-ratio: 1;
  background: #F3F1F8; border-radius: 20px; padding: 9px;
  animation: d1ccfloat 3.4s ease-in-out infinite;
}
.d1-seq-cell:nth-child(2) { animation-delay: 0.4s; }
.d1-seq-cell:nth-child(3) { animation-delay: 0.8s; }
.d1-seq-cell:nth-child(4) { animation-delay: 1.2s; }
.d1-seq-cell:nth-child(5) { animation-delay: 1.6s; }
.d1-seq-slot {
  position: relative;
  width: clamp(76px, 14vh, 126px); aspect-ratio: 1; border-radius: 20px; padding: 9px;
  background: #EDF5FF;
  box-shadow: inset 0 0 0 3px #5AC8FA;
  display: flex; align-items: center; justify-content: center;
}
.d1-seq-slot:not(.filled) { box-shadow: none; border: 3px dashed #5AC8FA; }
.d1-seq-slot.filled { box-shadow: inset 0 0 0 3px #2FA45C, 0 0 18px 2px rgba(47, 164, 92, 0.5); background: #E0F6E8; }
.d1-seq-q { font-size: clamp(30px, 6vh, 46px); font-weight: 800; color: #5AC8FA; animation: d1selpulse 1.4s ease-in-out infinite; }
.d1-seq-opts { display: flex; gap: clamp(12px, 2.8vw, 24px); justify-content: center; width: 100%; }
.d1-seq-opt {
  position: relative;
  width: clamp(100px, 17.5vh, 154px); aspect-ratio: 1;
  background: #FFFFFF; border: none; border-radius: 22px; cursor: pointer;
  padding: 12px;
  box-shadow: 0 8px 20px -8px rgba(61, 58, 80, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}
@media (max-height: 720px) {
  .d1-seq-cell, .d1-seq-slot { width: clamp(60px, 11.5vh, 96px); }
  .d1-seq-opt { width: clamp(80px, 14vh, 116px); }
}
.d1-seq-opt:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 12px 26px -8px rgba(61, 58, 80, 0.38); }
.d1-seq-opt.ok { background: #E0F6E8; box-shadow: 0 0 0 4px #2FA45C, 0 0 22px 4px rgba(80, 220, 130, 0.6); }

/* yodlash sahnalari (savat / polka) */
.d1-mem-scene { position: relative; display: flex; flex-direction: column; align-items: center; width: 100%; }
.d1-mem-fruits { display: flex; align-items: flex-end; gap: clamp(8px, 2vw, 20px); z-index: 2; margin-bottom: -10px; }
.d1-mem-fruit {
  width: clamp(68px, 13vh, 104px);
  filter: drop-shadow(0 6px 10px rgba(61, 58, 80, 0.28));
  animation: d1ccfloat 3.4s ease-in-out infinite;
}
.d1-mem-fruit:nth-child(2) { animation-delay: 0.4s; }
.d1-mem-fruit:nth-child(3) { animation-delay: 0.8s; }
.d1-mem-fruit:nth-child(4) { animation-delay: 1.2s; }
.d1-mem-basket { width: clamp(210px, 36vh, 320px); margin-top: -14px; filter: drop-shadow(0 8px 14px rgba(61, 58, 80, 0.22)); }
.d1-mem-count {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(64px, 15vh, 110px); font-weight: 800; color: #FF7043;
  text-shadow: 0 4px 0 #FFFFFF, 0 10px 24px rgba(61, 58, 80, 0.3);
  background: rgba(255, 255, 255, 0.55);
  border-radius: 20px;
  animation: d1countpop 0.9s cubic-bezier(0.34, 1.6, 0.64, 1);
  z-index: 5;
}
@keyframes d1countpop { 0% { transform: scale(0.3); opacity: 0; } 40% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }
.d1-shelf-row { display: flex; align-items: flex-end; gap: clamp(16px, 3.2vw, 34px); z-index: 2; padding: 0 8px; }
.d1-shelf-toy {
  width: clamp(76px, 14vh, 116px);
  filter: drop-shadow(0 6px 10px rgba(61, 58, 80, 0.25));
  animation: d1ccfloat 3.4s ease-in-out infinite;
}
.d1-shelf-toy:nth-child(2) { animation-delay: 0.4s; }
.d1-shelf-toy:nth-child(3) { animation-delay: 0.8s; }
.d1-shelf-toy:nth-child(4) { animation-delay: 1.2s; }
.d1-shelf-board {
  width: 94%; height: clamp(12px, 2.2vh, 18px); border-radius: 8px;
  background: linear-gradient(180deg, #D99C5E 0%, #C98A4B 60%, #B5793C 100%);
  box-shadow: 0 8px 0 #A5713C, 0 18px 26px -10px rgba(120, 70, 20, 0.45);
  margin-top: -6px;
}

/* sanoq */
.d1-count-row { display: flex; gap: clamp(12px, 3vw, 28px); width: 100%; justify-content: center; }
.d1-count-card {
  position: relative; flex: 1; max-width: clamp(195px, 36vh, 270px); aspect-ratio: 1;
  background: #F9F7FD; border-radius: 22px; padding: 10px;
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.2);
  transition: box-shadow 0.25s, transform 0.25s;
}
.d1-count-card.active {
  box-shadow: 0 0 0 4px #FFB03A, 0 14px 28px -8px rgba(255, 176, 58, 0.55);
  animation: d1countbob 1.6s ease-in-out infinite;
}
@keyframes d1countbob {
  0%, 100% { transform: translateY(-3px) scale(1); }
  50% { transform: translateY(-10px) scale(1.035); }
}
.d1-count-card.done { box-shadow: 0 0 0 3px #2FA45C; }
.d1-count-badge {
  position: absolute; right: -8px; top: -8px;
  width: clamp(34px, 6.4vh, 46px); aspect-ratio: 1; border-radius: 50%;
  background: #FFFFFF; color: #6E6A85;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: clamp(17px, 3.2vh, 24px);
  box-shadow: 0 4px 12px -4px rgba(61, 58, 80, 0.3);
}
.d1-count-badge.on { background: #2FA45C; color: #FFFFFF; animation: d1bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }
.d1-num {
  width: clamp(66px, 12vh, 100px); aspect-ratio: 1;
  border: none; border-radius: 50%; cursor: pointer;
  background: #FFFFFF; color: #3D3A50;
  font-family: inherit; font-weight: 800; font-size: clamp(30px, 6vh, 48px);
  box-shadow: 0 8px 20px -8px rgba(61, 58, 80, 0.3);
  transition: transform 0.15s, opacity 0.15s;
  animation: d1ccfloat 3s ease-in-out infinite;
}
.d1-num:nth-child(2) { animation-delay: 0.5s; }
.d1-num:nth-child(3) { animation-delay: 1s; }
.d1-num:hover:not(:disabled) { transform: translateY(-3px); }
.d1-num.used { opacity: 0.25; cursor: default; animation: none; }
.d1-num.d1-shake { animation: d1shake 0.5s ease; }

/* juftini top — dengiz tubi */
.d1-sea-bg {
  position: absolute; inset: 0; z-index: 0;
  border-radius: clamp(18px, 2.8vw, 30px);
  overflow: hidden; pointer-events: none;
  background: linear-gradient(180deg, #C8EEFA 0%, #8ED8F0 45%, #4FA8D8 100%);
}
.d1-sea-sand {
  position: absolute; left: -10%; right: -10%; bottom: -8%; height: 24%;
  background: #F2DCA4; border-radius: 50% 50% 0 0;
  box-shadow: 0 -5px 0 rgba(255, 255, 255, 0.3);
}
.d1-sea-weed {
  position: absolute; bottom: 3%; aspect-ratio: 1;
  transform-origin: 50% 100%; opacity: 0.85;
  animation: d1weedsway 3.2s ease-in-out infinite;
}
@keyframes d1weedsway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(7deg); } }
.d1-sea-bubble {
  position: absolute; bottom: -26px; aspect-ratio: 1; border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  border: 2px solid rgba(255, 255, 255, 0.75);
  animation: d1bubbleup linear infinite;
}
@keyframes d1bubbleup {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  12%  { opacity: 0.9; }
  85%  { opacity: 0.75; }
  100% { transform: translateY(-70vh) translateX(12px); opacity: 0; }
}
.d1-fish-scene {
  position: relative; z-index: 1;
  align-self: stretch; flex: 1; min-height: 0;
}
.d1-fish {
  position: absolute; transform: translate(-50%, -50%);
  width: clamp(100px, 18vh, 156px); aspect-ratio: 100 / 72;
  border: none; padding: clamp(5px, 1vh, 10px); cursor: pointer;
  background: transparent; border-radius: clamp(16px, 3vh, 26px);
  filter: drop-shadow(0 8px 12px rgba(20, 60, 90, 0.28));
  transition: left 0.8s cubic-bezier(0.45, 0, 0.25, 1), top 0.8s cubic-bezier(0.45, 0, 0.25, 1),
    background 0.25s, box-shadow 0.25s;
  animation: d1fishbob 3s ease-in-out infinite;
}
.d1-fish:nth-child(2) { animation-delay: 0.5s; }
.d1-fish:nth-child(3) { animation-delay: 1s; }
.d1-fish:nth-child(4) { animation-delay: 1.5s; }
.d1-fish:nth-child(5) { animation-delay: 2s; }
.d1-fish:nth-child(6) { animation-delay: 2.5s; }
@keyframes d1fishbob {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50%      { transform: translate(-50%, -50%) translateY(-6px); }
}
.d1-fish.sel {
  background: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 0 4px #FFB03A, 0 0 18px 2px rgba(255, 200, 90, 0.55);
}
/* topilgan juft: yashil ramka + IKKALASI bir maromda birga suzadi */
.d1-fish.ok {
  background: rgba(224, 246, 232, 0.55); cursor: default;
  box-shadow: 0 0 0 4px #2FA45C, 0 0 20px 3px rgba(80, 220, 130, 0.5);
  animation: d1fishswim 2.4s ease-in-out infinite;
  animation-delay: 0s;
}
@keyframes d1fishswim {
  0%, 100% { transform: translate(-50%, -50%) translateY(0) rotate(-2deg); }
  50%      { transform: translate(-50%, -50%) translateY(-9px) rotate(2.5deg); }
}
/* markazlashgan holda silkinish (umumiy d1shake markazni buzadi) */
.d1-fish.d1-shake { animation: d1fishshake 0.5s ease; }
@keyframes d1fishshake {
  0%, 100% { transform: translate(-50%, -50%); }
  20%, 60% { transform: translate(calc(-50% - 8px), -50%) rotate(-4deg); }
  40%, 80% { transform: translate(calc(-50% + 8px), -50%) rotate(4deg); }
}

/* berkinmachoq — bolalar xonasi */
.d1-shadow:has(.d1-duck-card) { max-width: min(1150px, 98vw); }
.d1-duck-sils {
  position: relative; z-index: 1;
  display: flex; gap: clamp(10px, 2vw, 20px);
  background: rgba(255, 255, 255, 0.78);
  padding: clamp(4px, 1vh, 8px) clamp(14px, 2.4vw, 24px);
  border-radius: 999px;
  box-shadow: 0 6px 16px -8px rgba(61, 58, 80, 0.25);
}
.d1-duck-sil { width: clamp(44px, 8vh, 66px); aspect-ratio: 60 / 56; opacity: 0.8; }
.d1-duck-sil.on { opacity: 1; animation: d1bump 0.5s cubic-bezier(0.34, 1.6, 0.64, 1); }
.d1-room {
  position: relative; z-index: 1;
  align-self: stretch; flex: 1; min-height: 0;
  border-radius: clamp(14px, 2.2vw, 22px);
  overflow: hidden; cursor: pointer;
  background: linear-gradient(180deg, #FFF1DC 0%, #FFE7C8 58%, #F2C98E 58%, #E8B876 100%);
  box-shadow: 0 10px 26px -8px rgba(61, 58, 80, 0.3), inset 0 0 0 4px rgba(255, 255, 255, 0.55);
}
.d1-room-rug {
  position: absolute; left: 38%; top: 84%; width: 56%; height: 26%;
  transform: translate(-50%, -50%); z-index: 1;
  background: radial-gradient(ellipse at center, #8FD0C2 0%, #6FBFAE 68%, #57AC9A 100%);
  border-radius: 50%;
  box-shadow: inset 0 0 0 6px rgba(255, 255, 255, 0.35);
}
.d1-room-obj {
  position: absolute; display: block; aspect-ratio: 1;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 5px 8px rgba(120, 70, 20, 0.22));
  pointer-events: none;
}
.d1-room-box { aspect-ratio: 130 / 100; }
.d1-duck-btn {
  position: absolute; aspect-ratio: 60 / 56;
  background: transparent; border: none; padding: 2px; margin: 0;
  cursor: pointer; border-radius: 50%;
}
.d1-duck-btn.ok {
  cursor: default;
  background: rgba(224, 246, 232, 0.4);
  box-shadow: 0 0 0 4px #2FA45C, 0 0 0 8px rgba(47, 164, 92, 0.35), 0 0 24px 5px rgba(80, 220, 130, 0.7);
}

/* ortiqchasini top */
.d1-oddout-row {
  position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  gap: clamp(14px, 3vw, 34px); width: 100%; flex-wrap: wrap;
}
.d1-oddout-item {
  width: clamp(110px, 20vh, 180px); aspect-ratio: 1;
  border: none; border-radius: 50%; cursor: pointer;
  background: #FFFFFF;
  box-shadow: 0 10px 24px -10px rgba(61, 58, 80, 0.28), inset 0 0 0 4px #FFF3D6;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  transition: box-shadow 0.2s;
  animation: d1ccfloat 3.4s ease-in-out infinite;
}
.d1-oddout-item:nth-child(2) { animation-delay: 0.4s; }
.d1-oddout-item:nth-child(3) { animation-delay: 0.8s; }
.d1-oddout-item:nth-child(4) { animation-delay: 1.2s; }
.d1-oddout-item:hover { box-shadow: 0 14px 30px -10px rgba(61, 58, 80, 0.38), inset 0 0 0 4px #FFD34D; }
.d1-oddout-item.ok {
  box-shadow: 0 0 0 5px #2FA45C, 0 0 24px 5px rgba(80, 220, 130, 0.6);
  cursor: default;
}
.d1-oddout-icon { display: block; aspect-ratio: 1; }

/* motivatsiya */
.d1-motiv-stars { display: flex; align-items: center; gap: 10px; }
.d1-motiv-star { width: clamp(56px, 10vh, 84px); animation: d1twinkle 2s ease-in-out infinite; }
.d1-motiv-num { font-size: clamp(40px, 8vh, 64px); font-weight: 800; color: #E8A50A; text-shadow: 0 3px 0 #FFFFFF; }

/* sertifikat */
.d1-cert {
  position: relative; z-index: 2;
  width: min(94vw, 560px);
  background: #FFFDF6;
  border-radius: 26px;
  padding: clamp(16px, 3vh, 28px) clamp(16px, 3.4vw, 32px);
  box-shadow: 0 0 0 5px #FFC23C, 0 0 0 9px #FFFDF6, 0 0 0 11px rgba(255, 194, 60, 0.5), 0 22px 50px -14px rgba(61, 58, 80, 0.4);
  display: flex; flex-direction: column; align-items: center;
  gap: clamp(6px, 1.4vh, 14px);
}
.d1-cert-eyebrow { font-size: clamp(11px, 1.8vh, 15px); font-weight: 800; letter-spacing: 0.14em; color: #B8860B; }
.d1-cert-title { font-size: clamp(30px, 6vh, 48px); font-weight: 800; color: #FF7043; text-shadow: 0 3px 0 #FFFFFF; }
.d1-cert-fox { position: relative; width: clamp(120px, 22vh, 180px); }
.d1-cert-medal { position: absolute; right: -14%; top: 26%; width: 42%; filter: drop-shadow(0 4px 8px rgba(61,58,80,0.3)); animation: d1twinkle 2.6s ease-in-out infinite; }
.d1-cert-name { display: flex; align-items: baseline; gap: 10px; width: 84%; }
.d1-cert-name-label { font-weight: 800; font-size: clamp(14px, 2.4vh, 18px); color: #6E6A85; }
.d1-cert-name-line { flex: 1; border-bottom: 3px dashed #B9B5C9; height: clamp(20px, 3.4vh, 28px); }
.d1-cert-stars { display: flex; align-items: baseline; gap: 8px; }
.d1-cert-star { width: clamp(30px, 5.4vh, 42px); align-self: center; }
.d1-cert-count { font-size: clamp(26px, 5vh, 40px); font-weight: 800; color: #E8A50A; }
.d1-cert-sub { font-size: clamp(13px, 2.2vh, 17px); font-weight: 700; color: #6E6A85; }
.d1-cert-actions { position: relative; z-index: 2; display: flex; gap: clamp(12px, 3vw, 24px); align-items: center; }

@media (prefers-reduced-motion: reduce) {
  .d1-sort-item.sel, .d1-seq-q, .d1-mem-count, .d1-motiv-star, .d1-cert-medal, .d1-diff-dot.on,
  .d1-count-card.active, .d1-num, .d1-sea-weed, .d1-sea-bubble, .d1-fish, .d1-seq-cell,
  .d1-shelf-toy, .d1-oddout-item, .d1-nav-next:not(:disabled) { animation: none !important; }
}
`;
