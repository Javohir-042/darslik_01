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
// Qisqa salyut sadosi — sahifa to'liq yechilganda (markaziy yulduz bilan)
function sfxSalute() {
  try { const c = getCtx(); if (!c) return;
    note(c, 0,    392, 0.12, 0.11, 'triangle');
    note(c, 0.1,  523, 0.12, 0.12, 'triangle');
    note(c, 0.2,  659, 0.14, 0.13, 'triangle');
    note(c, 0.32, 784, 0.5,  0.15, 'triangle');
    note(c, 0.32, 1047, 0.42, 0.07, 'sine');
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

// ============================================================
// QISQA JONLI REPLIKA — "uch!", "ikki!", savol kabi qadamlarni ekran
// harakati bilan AYNI paytda aytish uchun. Oldingi qisqa replikani
// to'xtatib, darhol yangisini boshlaydi (harakat va ovoz birga boradi).
// ============================================================
let _sayAudio = null;
// opts.onStart — ovoz HAQIQATAN yangray boshlaganda; opts.onEnd — tugaganda
// (xato/bloklanishda ham onEnd chaqiriladi — harakat oqimi to'xtab qolmaydi).
// Ekran harakatini aynan shu hodisalarga bog'lash uchun ishlatiladi.
const sayNow = (text, opts = {}) => {
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
      if (p && p.catch) p.catch(finish);   // bloklandi — tugagan deb hisoblaymiz
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

// Sahifa ochilganda avto gapiradi (delayMs — necha ms dan keyin boshlashi;
// delayMs = null bo'lsa AVTO YO'Q — faqat birinchi teginishda gapiradi).
// Qaytaradi: { replay, stop, started } — replay: boshidan aytish; stop: o'chirish.
function useVoice(text, delayMs = 120) {
  const speakRef = useRef(null);
  const stopRef = useRef(null);
  const speakingRef = useRef(null);
  const endCbRef = useRef(null);   // onEnded(cb) — ovoz tugaganda xabar beriladi
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
    // ovoz tugadi (yoki o'chirildi/xato) — obunachi bo'lsa xabar beramiz
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
        audioEl.onended = markEnded;
        audioEl.onerror = markEnded;
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
      markEnded();   // kutayotganlar (masalan, sanoq) darhol davom etadi
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
  // onEnded(cb) — ovoz tugaganda cb chaqiriladi (cb=null — obunani bekor qilish)
  const onEnded = useCallback((cb) => { endCbRef.current = cb; }, []);
  return { replay, stop, isSpeaking, onEnded, started: startedUi };
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    ) : (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
// YODLASH SANOG'I — barcha yodlash o'yinlarida (10, 12, 19-sahifalar)
// BIR XIL ssenariy: intro ovozi -> "uch! ikki! bir!" -> savol bosqichi.
// SINXRONLIK: taymer emas, OVOZNING O'ZI harakatni boshqaradi —
//  · sanoq intro ovozi HAQIQATAN tugagach boshlanadi (kesilmaydi,
//    oldinga ham ketmaydi);
//  · ekran raqami/lampochkasi har so'z ovozi BOSHLANGAN paytda chiqadi;
//  · keyingi so'z oldingisi TUGAGACH aytiladi (min oraliq bilan);
//  · savol ekrani savol ovozi BOSHLANISHI bilan birga ochiladi.
// Ovoz bloklangan/yo'q bo'lsa zaxira taymerlar oqimni ushlab qoladi.
// ============================================================
const COUNT_WORDS = ['uch', 'ikki', 'bir'];
const T_COUNT_INTRO_MIN = 2500;   // sahnani ko'rib olish uchun eng kam vaqt
const T_COUNT_INTRO_MAX = 7000;   // ovoz kelmasa/cho'zilsa — baribir boshlaymiz
const T_COUNT_GAP = 350;          // intro tugashi va sanoq orasidagi nafas
const T_COUNT_STEP_MIN = 900;     // ikki sanoq so'zi orasidagi eng kam vaqt
const T_COUNT_STEP_MAX = 2200;    // ovoz "osilib" qolsa ham sanoq davom etadi
const T_COUNT_FALLBACK = 300;     // ovoz boshlanmasa raqam shuncha ms da chiqadi
function useMemorizeCountdown({ voice, question, onTick, onDone }) {
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const t0 = Date.now();

    // savol bosqichi: ekran savol ovozi bilan AYNI paytda ochiladi
    const finish = () => {
      if (cancelled) return;
      let opened = false;
      const open = () => { if (!opened && !cancelled) { opened = true; onDone(); } };
      sayNow(question, { onStart: open });
      later(open, T_COUNT_FALLBACK);   // ovoz kechiksa ham ekran qotib qolmaydi
    };

    // i-sanoq so'zi: raqam ovoz boshlanganda, keyingi qadam ovoz tugaganda
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

    // intro: ovoz tugashini kutamiz; juda erta tugasa — MIN gacha,
    // umuman tugamasa — MAX da baribir sanoqqa o'tamiz
    let begun = false;
    const begin = () => {
      if (begun || cancelled) return;
      begun = true;
      voice.stop();   // MAX orqali kelgan bo'lsak — intro hali gapirayotgan bo'lishi mumkin
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
// OB'EKTLAR KUTUBXONASI — barcha belgichalar QO'LDA CHIZILGAN yassi
// SVG (LogicLike uslubi). Emoji ISHLATILMAYDI. Registr quyida:
// LL_OBJ (narsalar, 100x100) va LL_KINDS (to'liq tanali jonivorlar).
// ============================================================

// #RRGGBB -> { h, s, l }
const hexToHsl = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
};

// Rasmni istalgan rangga "bo'yash" filtri (rang o'zgardi o'yinlari uchun)
const tintFilter = (hex) => {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.15) return `grayscale(1) brightness(${l < 0.5 ? 0.55 : 1.3})`;
  const br = l < 0.45 ? 0.8 : l > 0.72 ? 1.2 : 1;
  return `grayscale(1) sepia(1) saturate(5) hue-rotate(${Math.round(h - 50)}deg) brightness(${br})`;
};

// ObjIcon va LL_OBJ registri quyida (LL bo'limidan keyin) e'lon qilinadi.

// ============================================================
// LOGICLIKE-USLUB QAHRAMONLAR (2-sahifa) — qo'lda chizilgan yassi
// vektor jonivorlar: katta bosh, qalin qoshlar, nuqta ko'zlar,
// krem qorincha. sil=true — butun figura yaxlit quyuq rangda
// (soya varianti). Emoji ISHLATILMAYDI.
// ============================================================
const LL_SIL = '#32363F';

// umumiy yuz: qoshlar + ko'zlar + (ixtiyoriy) tabassum
const LLFace = ({ c, y = 94, dx = 23, brow = '#7A4A20', smile = true }) => (
  <g>
    <rect x={100 - dx - 9} y={y - 27} width="19" height="6.5" rx="3.2" fill={c(brow)}/>
    <rect x={100 + dx - 10} y={y - 27} width="19" height="6.5" rx="3.2" fill={c(brow)}/>
    <circle cx={100 - dx} cy={y} r="8" fill={c('#2E3140')}/>
    <circle cx={100 + dx} cy={y} r="8" fill={c('#2E3140')}/>
    <circle cx={100 - dx + 2.6} cy={y - 2.6} r="2.5" fill={c('#FFFFFF')}/>
    <circle cx={100 + dx + 2.6} cy={y - 2.6} r="2.5" fill={c('#FFFFFF')}/>
    {smile && (
      <path d={`M91 ${y + 24} q9 7 18 0`} stroke={c('#2E3140')} strokeWidth="4"
        fill="none" strokeLinecap="round"/>
    )}
  </g>
);

// umumiy tana: oyoqlar + gavda + qo'llar + qorincha
const LLBody = ({ c, main, dark, belly = '#FFEFD6', legs }) => (
  <g>
    <rect x="74" y="202" width="19" height="32" rx="9.5" fill={c(legs || dark)}/>
    <rect x="107" y="202" width="19" height="32" rx="9.5" fill={c(legs || dark)}/>
    <ellipse cx="100" cy="176" rx="46" ry="42" fill={c(main)}/>
    <ellipse cx="57" cy="168" rx="12" ry="24" fill={c(dark)} transform="rotate(20 57 168)"/>
    <ellipse cx="143" cy="168" rx="12" ry="24" fill={c(dark)} transform="rotate(-20 143 168)"/>
    <ellipse cx="100" cy="184" rx="26" ry="22" fill={c(belly)}/>
  </g>
);

const LLCat = ({ c }) => (
  <g>
    <path d="M144 208 Q188 202 182 158 Q179 138 162 142" stroke={c('#DE6E2C')} strokeWidth="13" fill="none" strokeLinecap="round"/>
    <path d="M50 72 L57 18 L96 42 Z" fill={c('#F1863F')}/>
    <path d="M150 72 L143 18 L104 42 Z" fill={c('#F1863F')}/>
    <path d="M59 60 L63 32 L84 45 Z" fill={c('#FFC9A0')}/>
    <path d="M141 60 L137 32 L116 45 Z" fill={c('#FFC9A0')}/>
    <LLBody c={c} main="#F1863F" dark="#DE6E2C"/>
    <circle cx="100" cy="94" r="58" fill={c('#F1863F')}/>
    <rect x="96" y="40" width="8" height="20" rx="4" fill={c('#DE6E2C')}/>
    <rect x="76" y="44" width="8" height="18" rx="4" fill={c('#DE6E2C')} transform="rotate(18 80 53)"/>
    <rect x="116" y="44" width="8" height="18" rx="4" fill={c('#DE6E2C')} transform="rotate(-18 120 53)"/>
    <g stroke={c('#2E3140')} strokeWidth="2.6" strokeLinecap="round">
      <path d="M28 92 L52 96"/><path d="M26 104 L52 104"/><path d="M28 116 L52 111"/>
      <path d="M172 92 L148 96"/><path d="M174 104 L148 104"/><path d="M172 116 L148 111"/>
    </g>
    <LLFace c={c} brow="#C2551F"/>
    <circle cx="62" cy="114" r="9" fill={c('#F8B08A')}/>
    <circle cx="138" cy="114" r="9" fill={c('#F8B08A')}/>
  </g>
);

const LLDog = ({ c }) => (
  <g>
    <path d="M146 202 Q178 194 172 168" stroke={c('#A96F3F')} strokeWidth="13" fill="none" strokeLinecap="round"/>
    <LLBody c={c} main="#C08552" dark="#A96F3F"/>
    <circle cx="100" cy="94" r="58" fill={c('#C08552')}/>
    <ellipse cx="46" cy="92" rx="16" ry="34" fill={c('#8F5A2E')} transform="rotate(12 46 92)"/>
    <ellipse cx="154" cy="92" rx="16" ry="34" fill={c('#8F5A2E')} transform="rotate(-12 154 92)"/>
    <ellipse cx="100" cy="124" rx="27" ry="19" fill={c('#F3DBB8')}/>
    <LLFace c={c} brow="#8F5A2E"/>
    <circle cx="100" cy="112" r="8" fill={c('#2E3140')}/>
  </g>
);

// Quyon — HAQIQIY quyon qiyofasi (quyon1-4.png suratlari asosida):
// cho'kkalab o'tirgan, boshi ko'tarilgan, quloqlari orqaga engashgan,
// katta yumaloq son, paxmoq dum. Tabiiy kulrang ranglar.
const LLRabbit = ({ c }) => (
  <g>
    {/* quloqlar: orqaga engashgan, asosi boshda */}
    <ellipse cx="128" cy="44" rx="11" ry="43" fill={c('#A69F94')} transform="rotate(-20 128 44)"/>
    <ellipse cx="150" cy="40" rx="12" ry="46" fill={c('#BFBAB2')} transform="rotate(-9 150 40)"/>
    <ellipse cx="150" cy="46" rx="6.5" ry="34" fill={c('#E8B4C4')} transform="rotate(-9 150 46)"/>
    {/* paxmoq dum */}
    <circle cx="26" cy="152" r="14" fill={c('#EDE9E2')}/>
    {/* katta son-orqa qism */}
    <ellipse cx="72" cy="160" rx="54" ry="60" fill={c('#BFBAB2')} transform="rotate(-8 72 160)"/>
    {/* o'rta tana / bel */}
    <ellipse cx="112" cy="158" rx="55" ry="47" fill={c('#BFBAB2')}/>
    {/* son qavati — yumshoq quyuqroq */}
    <circle cx="76" cy="174" r="34" fill={c('#ADA79C')}/>
    {/* oldinga cho'zilgan orqa panja */}
    <ellipse cx="102" cy="219" rx="27" ry="9" fill={c('#B2ACA2')}/>
    {/* ko'krak */}
    <ellipse cx="140" cy="182" rx="30" ry="34" fill={c('#BFBAB2')}/>
    {/* qorin-ko'krak ochroq */}
    <ellipse cx="133" cy="198" rx="15" ry="18" fill={c('#EDE9E2')}/>
    {/* oldingi panjalar */}
    <ellipse cx="140" cy="219" rx="13" ry="7" fill={c('#B2ACA2')}/>
    <ellipse cx="160" cy="219" rx="12" ry="7" fill={c('#BFBAB2')}/>
    {/* bosh: ko'tarilgan, o'ngga qaragan */}
    <ellipse cx="146" cy="108" rx="34" ry="31" fill={c('#BFBAB2')} transform="rotate(8 146 108)"/>
    {/* tumshuq */}
    <circle cx="172" cy="120" r="15" fill={c('#BFBAB2')}/>
    <ellipse cx="172" cy="126" rx="10" ry="7" fill={c('#EDE9E2')}/>
    {/* ko'z */}
    <circle cx="148" cy="102" r="7.5" fill={c('#2E3140')}/>
    <circle cx="150.5" cy="99.5" r="2.4" fill={c('#FFFFFF')}/>
    {/* burun + og'iz */}
    <path d="M184 116 q4 2 2 6 l-5 -2 Z" fill={c('#D89AAC')}/>
    <path d="M182 122 q-3 5 -9 5" stroke={c('#93897B')} strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    {/* mo'ylovlar */}
    <g stroke={c('#93897B')} strokeWidth="1.7" strokeLinecap="round">
      <line x1="176" y1="124" x2="196" y2="118"/>
      <line x1="176" y1="128" x2="197" y2="128"/>
      <line x1="174" y1="132" x2="194" y2="138"/>
    </g>
  </g>
);

const LLDuck = ({ c }) => (
  <g>
    <LLBody c={c} main="#FFD24D" dark="#F5B92E" belly="#FFE9A8" legs="#F0932A"/>
    <circle cx="100" cy="94" r="58" fill={c('#FFD24D')}/>
    <path d="M92 32 q8 -16 16 0 q-8 7 -16 0" fill={c('#F5B92E')}/>
    <LLFace c={c} y={90} brow="#E8A21F" smile={false}/>
    <ellipse cx="100" cy="112" rx="22" ry="9" fill={c('#FF9E2E')}/>
    <ellipse cx="100" cy="119" rx="15" ry="6.5" fill={c('#E8871F')}/>
  </g>
);

const LLRooster = ({ c }) => (
  <g>
    <path d="M52 178 Q20 170 26 142" stroke={c('#3E8A4F')} strokeWidth="11" fill="none" strokeLinecap="round"/>
    <path d="M56 190 Q26 192 24 166" stroke={c('#E8573F')} strokeWidth="11" fill="none" strokeLinecap="round"/>
    <LLBody c={c} main="#F4F0E6" dark="#DDD6C4" belly="#FFFDF6" legs="#F0932A"/>
    <circle cx="100" cy="94" r="56" fill={c('#F4F0E6')}/>
    <circle cx="80" cy="30" r="11" fill={c('#E8573F')}/>
    <circle cx="100" cy="22" r="12" fill={c('#E8573F')}/>
    <circle cx="120" cy="30" r="11" fill={c('#E8573F')}/>
    <rect x="74" y="28" width="52" height="16" rx="8" fill={c('#E8573F')}/>
    <LLFace c={c} y={90} dx={22} brow="#D8B24A" smile={false}/>
    <path d="M90 106 L110 106 L100 122 Z" fill={c('#FF9E2E')}/>
    <ellipse cx="100" cy="129" rx="8" ry="9" fill={c('#E8573F')}/>
  </g>
);

const LLCow = ({ c }) => (
  <g>
    <path d="M62 40 Q56 18 74 20" stroke={c('#C9B08E')} strokeWidth="10" fill="none" strokeLinecap="round"/>
    <path d="M138 40 Q144 18 126 20" stroke={c('#C9B08E')} strokeWidth="10" fill="none" strokeLinecap="round"/>
    <ellipse cx="42" cy="88" rx="15" ry="10" fill={c('#F7F3EA')} transform="rotate(-14 42 88)"/>
    <ellipse cx="158" cy="88" rx="15" ry="10" fill={c('#F7F3EA')} transform="rotate(14 158 88)"/>
    <LLBody c={c} main="#F7F3EA" dark="#E2DACB" belly="#FFFFFF"/>
    <ellipse cx="128" cy="166" rx="15" ry="11" fill={c('#6B4A33')}/>
    <circle cx="100" cy="94" r="58" fill={c('#F7F3EA')}/>
    <path d="M52 62 q14 -18 34 -10 l-10 24 q-14 -6 -24 -14 Z" fill={c('#6B4A33')}/>
    <LLFace c={c} y={90} brow="#B8A488" smile={false}/>
    <ellipse cx="100" cy="122" rx="30" ry="19" fill={c('#F2B8C6')}/>
    <circle cx="88" cy="122" r="4.5" fill={c('#D67F98')}/>
    <circle cx="112" cy="122" r="4.5" fill={c('#D67F98')}/>
  </g>
);

const LLPig = ({ c }) => (
  <g>
    <path d="M146 182 q18 -6 14 -18 q-3 -9 -13 -5" stroke={c('#E888A4')} strokeWidth="7" fill="none" strokeLinecap="round"/>
    <path d="M54 60 L60 20 L96 42 Z" fill={c('#F79CB4')}/>
    <path d="M146 60 L140 20 L104 42 Z" fill={c('#F79CB4')}/>
    <path d="M62 52 L65 30 L84 43 Z" fill={c('#E888A4')}/>
    <path d="M138 52 L135 30 L116 43 Z" fill={c('#E888A4')}/>
    <LLBody c={c} main="#F79CB4" dark="#E888A4" belly="#FCC9D8"/>
    <circle cx="100" cy="94" r="58" fill={c('#F79CB4')}/>
    <LLFace c={c} y={90} brow="#D8748F" smile={false}/>
    <ellipse cx="100" cy="114" rx="19" ry="14" fill={c('#E8879F')}/>
    <ellipse cx="92" cy="114" rx="4" ry="5.5" fill={c('#B95F7C')}/>
    <ellipse cx="108" cy="114" rx="4" ry="5.5" fill={c('#B95F7C')}/>
  </g>
);

const LLHorse = ({ c }) => (
  <g>
    <path d="M148 198 Q184 194 178 154" stroke={c('#7A5230')} strokeWidth="14" fill="none" strokeLinecap="round"/>
    <ellipse cx="70" cy="40" rx="12" ry="22" fill={c('#B98150')} transform="rotate(-10 70 40)"/>
    <ellipse cx="130" cy="40" rx="12" ry="22" fill={c('#B98150')} transform="rotate(10 130 40)"/>
    <LLBody c={c} main="#B98150" dark="#A26D3F" belly="#E9CFA9"/>
    <circle cx="100" cy="94" r="58" fill={c('#B98150')}/>
    <path d="M76 42 q24 -20 48 0 l-6 18 q-18 -12 -36 0 Z" fill={c('#7A5230')}/>
    <LLFace c={c} y={92} brow="#6E4A28" smile={false}/>
    <ellipse cx="100" cy="126" rx="28" ry="20" fill={c('#E9CFA9')}/>
    <ellipse cx="88" cy="128" rx="4.5" ry="6" fill={c('#8F6B45')}/>
    <ellipse cx="112" cy="128" rx="4.5" ry="6" fill={c('#8F6B45')}/>
    <path d="M90 142 q10 8 20 0" stroke={c('#8F6B45')} strokeWidth="4" fill="none" strokeLinecap="round"/>
  </g>
);

const LLSheep = ({ c }) => (
  <g>
    <ellipse cx="46" cy="98" rx="14" ry="9" fill={c('#E9C9A0')} transform="rotate(-18 46 98)"/>
    <ellipse cx="154" cy="98" rx="14" ry="9" fill={c('#E9C9A0')} transform="rotate(18 154 98)"/>
    <LLBody c={c} main="#F5F1E6" dark="#E0D8C5" belly="#FFFFFF"/>
    <circle cx="100" cy="96" r="50" fill={c('#F0CFA8')}/>
    <g fill={c('#F5F1E6')}>
      <circle cx="66" cy="66" r="17"/><circle cx="88" cy="54" r="18"/>
      <circle cx="112" cy="54" r="18"/><circle cx="134" cy="66" r="17"/>
      <circle cx="146" cy="86" r="14"/><circle cx="54" cy="86" r="14"/>
    </g>
    <LLFace c={c} y={98} brow="#C9A87E"/>
  </g>
);

const LLTurtle = ({ c }) => (
  <g>
    <ellipse cx="52" cy="206" rx="14" ry="10" fill={c('#8FCB6B')}/>
    <ellipse cx="148" cy="206" rx="14" ry="10" fill={c('#8FCB6B')}/>
    <rect x="86" y="116" width="28" height="34" fill={c('#8FCB6B')}/>
    <circle cx="100" cy="86" r="44" fill={c('#8FCB6B')}/>
    <LLFace c={c} y={84} dx={18} brow="#5E8A40"/>
    <path d="M48 208 q-4 -66 52 -66 q56 0 52 66 Z" fill={c('#6E9E4E')}/>
    <path d="M44 196 h112 q4 14 -10 14 h-92 q-14 0 -10 -14 Z" fill={c('#C9E4A4')}/>
    <g fill={c('#5E8A40')}>
      <circle cx="78" cy="178" r="10"/><circle cx="122" cy="178" r="10"/><circle cx="100" cy="162" r="10"/>
    </g>
  </g>
);

const LLElephant = ({ c }) => (
  <g>
    <circle cx="40" cy="92" r="26" fill={c('#93959F')}/>
    <circle cx="160" cy="92" r="26" fill={c('#93959F')}/>
    <LLBody c={c} main="#A6A8B2" dark="#93959F" belly="#DADCE4"/>
    <circle cx="100" cy="94" r="56" fill={c('#A6A8B2')}/>
    <LLFace c={c} y={88} brow="#7E808C" smile={false}/>
    <path d="M100 104 q-6 22 6 34 q6 6 14 2" stroke={c('#93959F')} strokeWidth="15" fill="none" strokeLinecap="round"/>
  </g>
);

const LLGiraffe = ({ c }) => (
  <g>
    <path d="M76 32 q-2 -16 10 -18" stroke={c('#C98A3B')} strokeWidth="8" fill="none" strokeLinecap="round"/>
    <path d="M124 32 q2 -16 -10 -18" stroke={c('#C98A3B')} strokeWidth="8" fill="none" strokeLinecap="round"/>
    <circle cx="83" cy="13" r="6" fill={c('#C98A3B')}/>
    <circle cx="117" cy="13" r="6" fill={c('#C98A3B')}/>
    <ellipse cx="48" cy="70" rx="14" ry="9" fill={c('#F2C14E')} transform="rotate(-22 48 70)"/>
    <ellipse cx="152" cy="70" rx="14" ry="9" fill={c('#F2C14E')} transform="rotate(22 152 70)"/>
    <LLBody c={c} main="#F2C14E" dark="#E0A93C" belly="#FBE8BC"/>
    <ellipse cx="70" cy="160" rx="9" ry="7" fill={c('#E0A93C')}/>
    <ellipse cx="128" cy="172" rx="8" ry="6" fill={c('#E0A93C')}/>
    <circle cx="100" cy="94" r="56" fill={c('#F2C14E')}/>
    <circle cx="66" cy="60" r="7" fill={c('#E0A93C')}/>
    <circle cx="134" cy="60" r="7" fill={c('#E0A93C')}/>
    <LLFace c={c} y={90} brow="#B87F2E" smile={false}/>
    <ellipse cx="100" cy="122" rx="27" ry="18" fill={c('#FBE8BC')}/>
    <ellipse cx="90" cy="122" rx="4" ry="5.5" fill={c('#C98A3B')}/>
    <ellipse cx="110" cy="122" rx="4" ry="5.5" fill={c('#C98A3B')}/>
    <path d="M92 134 q8 6 16 0" stroke={c('#C98A3B')} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
  </g>
);

const LLMonkey = ({ c }) => (
  <g>
    <path d="M144 200 Q186 206 182 160 Q180 144 166 148" stroke={c('#A85A1E')} strokeWidth="12" fill="none" strokeLinecap="round"/>
    <path d="M96 34 q-4 -18 8 -22 q-2 10 4 14 Z" fill={c('#A85A1E')}/>
    <circle cx="44" cy="86" r="20" fill={c('#B96A28')}/>
    <circle cx="156" cy="86" r="20" fill={c('#B96A28')}/>
    <circle cx="44" cy="86" r="11" fill={c('#F7DDB4')}/>
    <circle cx="156" cy="86" r="11" fill={c('#F7DDB4')}/>
    <LLBody c={c} main="#B96A28" dark="#A85A1E" belly="#F7DDB4"/>
    <circle cx="100" cy="94" r="54" fill={c('#B96A28')}/>
    <path d="M100 132 q-42 0 -44 -36 q0 -26 44 -26 q44 0 44 26 q-2 36 -44 36 Z" fill={c('#F7DDB4')}/>
    <LLFace c={c} y={92} brow="#8F4A16"/>
    <ellipse cx="100" cy="110" rx="5" ry="4" fill={c('#8F4A16')}/>
  </g>
);

// Shercha — LogicLike'dagi kabi: sariq yuz, atrofida to'q sariq yol
const LLLion = ({ c }) => (
  <g>
    <path d="M146 200 Q182 196 178 160" stroke={c('#E8A63C')} strokeWidth="12" fill="none" strokeLinecap="round"/>
    <circle cx="178" cy="152" r="10" fill={c('#B87F2E')}/>
    <circle cx="100" cy="94" r="72" fill={c('#E8963C')}/>
    <g fill={c('#E8963C')}>
      <circle cx="42" cy="52" r="16"/><circle cx="70" cy="28" r="16"/>
      <circle cx="100" cy="20" r="16"/><circle cx="130" cy="28" r="16"/>
      <circle cx="158" cy="52" r="16"/><circle cx="168" cy="90" r="14"/>
      <circle cx="32" cy="90" r="14"/><circle cx="44" cy="128" r="14"/>
      <circle cx="156" cy="128" r="14"/>
    </g>
    <LLBody c={c} main="#F2C14E" dark="#E0A93C" belly="#FBE8BC"/>
    <circle cx="100" cy="94" r="50" fill={c('#F2C14E')}/>
    <LLFace c={c} y={90} dx={21} brow="#B87F2E" smile={false}/>
    <ellipse cx="100" cy="120" rx="23" ry="16" fill={c('#FBE8BC')}/>
    <ellipse cx="100" cy="110" rx="6.5" ry="5" fill={c('#8F5A2E')}/>
    <path d="M100 115 v7" stroke={c('#8F5A2E')} strokeWidth="3.5" strokeLinecap="round"/>
    <path d="M100 122 q-8 8 -15 2 M100 122 q8 8 15 2" stroke={c('#8F5A2E')} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
  </g>
);

// SHIRIN kuchukcha — bolalarbop uslub (katta bosh, yaltiroq ko'zlar,
// tabassum, 4 oyoq, gajak dum). Render qilib vizual tasdiqlangan.
const LLRealDog = () => (
  <g>
    <ellipse cx="105" cy="228" rx="80" ry="9" fill="rgba(60,45,20,0.15)"/>
    {/* gajak dum */}
    <path d="M38 150 C 22 142, 18 124, 30 116 C 40 110, 50 118, 46 128 C 44 122, 36 122, 34 128 C 32 136, 40 142, 50 142 Z" fill="#C98A4B"/>
    {/* narigi tomon oyoqlari */}
    <rect x="58" y="180" width="20" height="44" rx="10" fill="#B8793A"/>
    <rect x="128" y="180" width="20" height="44" rx="10" fill="#B8793A"/>
    {/* tana + qorincha */}
    <ellipse cx="102" cy="172" rx="56" ry="42" fill="#D9A25F"/>
    <ellipse cx="112" cy="184" rx="32" ry="24" fill="#F5DEB8"/>
    {/* beri tomon oyoqlari + panjalar */}
    <rect x="70" y="188" width="22" height="40" rx="11" fill="#D9A25F"/>
    <rect x="116" y="188" width="22" height="40" rx="11" fill="#D9A25F"/>
    <ellipse cx="81" cy="226" rx="14" ry="7" fill="#C98A4B"/>
    <ellipse cx="127" cy="226" rx="14" ry="7" fill="#C98A4B"/>
    <ellipse cx="68" cy="222" rx="12" ry="6" fill="#A5682F"/>
    <ellipse cx="138" cy="222" rx="12" ry="6" fill="#A5682F"/>
    {/* katta bosh */}
    <circle cx="130" cy="92" r="52" fill="#D9A25F"/>
    {/* shalpang quloqlar */}
    <path d="M86 62 C 72 66, 66 88, 72 108 C 76 122, 88 126, 96 118 C 100 104, 98 80, 94 68 C 92 62, 89 61, 86 62 Z" fill="#A5682F"/>
    <path d="M174 62 C 188 66, 194 88, 188 108 C 184 122, 172 126, 164 118 C 160 104, 162 80, 166 68 C 168 62, 171 61, 174 62 Z" fill="#A5682F"/>
    {/* yuz krem qismi */}
    <ellipse cx="130" cy="112" rx="26" ry="20" fill="#F5DEB8"/>
    {/* katta yaltiroq ko'zlar */}
    <circle cx="112" cy="86" r="11" fill="#3D3A50"/>
    <circle cx="116" cy="82" r="4" fill="#FFFFFF"/>
    <circle cx="109" cy="90" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    <circle cx="148" cy="86" r="11" fill="#3D3A50"/>
    <circle cx="152" cy="82" r="4" fill="#FFFFFF"/>
    <circle cx="145" cy="90" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    {/* burun + tabassum */}
    <ellipse cx="130" cy="104" rx="8" ry="6" fill="#5C4033"/>
    <path d="M130 110 L130 116" stroke="#5C4033" strokeWidth="3" strokeLinecap="round"/>
    <path d="M118 118 Q124 124 130 118 Q136 124 142 118" stroke="#5C4033" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
    {/* yonoq qizilliklari + boshdagi dog' */}
    <circle cx="96" cy="104" r="8" fill="#F2A9C4" opacity="0.6"/>
    <circle cx="164" cy="104" r="8" fill="#F2A9C4" opacity="0.6"/>
    <ellipse cx="148" cy="54" rx="13" ry="9" fill="#C98A4B" opacity="0.8"/>
  </g>
);

// SHIRIN jo'ja — bolalarbop uslub (katta bosh, paxmoq patcha,
// tabassumli tumshuqcha). Render qilib vizual tasdiqlangan.
const LLRealDuck = () => (
  <g>
    <ellipse cx="100" cy="228" rx="66" ry="8" fill="rgba(90,70,15,0.15)"/>
    {/* dumcha patchalari */}
    <path d="M42 158 C 30 150, 28 136, 38 130 C 44 138, 48 146, 52 152 Z" fill="#F5B92E"/>
    <path d="M50 148 C 42 138, 44 126, 54 124 C 56 132, 58 142, 60 148 Z" fill="#FFD24D"/>
    {/* tana + qorincha */}
    <ellipse cx="98" cy="172" rx="48" ry="40" fill="#FFD24D"/>
    <ellipse cx="104" cy="184" rx="28" ry="22" fill="#FFF0C2"/>
    {/* qanotcha */}
    <ellipse cx="62" cy="168" rx="16" ry="24" fill="#F5B92E" transform="rotate(18 62 168)"/>
    {/* oyoqlar + parda panjalar */}
    <rect x="80" y="204" width="9" height="20" rx="4.5" fill="#FF9E2E"/>
    <rect x="106" y="204" width="9" height="20" rx="4.5" fill="#FF9E2E"/>
    <path d="M72 224 C 77 216, 90 216, 95 224 L 93 228 L 74 228 Z" fill="#FF9E2E"/>
    <path d="M98 224 C 103 216, 116 216, 121 224 L 119 228 L 100 228 Z" fill="#FF9E2E"/>
    {/* katta bosh + paxmoq patcha */}
    <circle cx="112" cy="90" r="48" fill="#FFD24D"/>
    <path d="M100 44 C 98 34, 106 28, 112 34 C 116 28, 124 32, 122 42 C 118 38, 112 40, 112 46 C 108 40, 102 40, 100 44 Z" fill="#F5B92E"/>
    {/* katta yaltiroq ko'zlar */}
    <circle cx="96" cy="86" r="10" fill="#3D3A50"/>
    <circle cx="100" cy="82" r="3.6" fill="#FFFFFF"/>
    <circle cx="93" cy="90" r="1.6" fill="#FFFFFF" opacity="0.7"/>
    <circle cx="128" cy="86" r="10" fill="#3D3A50"/>
    <circle cx="132" cy="82" r="3.6" fill="#FFFFFF"/>
    <circle cx="125" cy="90" r="1.6" fill="#FFFFFF" opacity="0.7"/>
    {/* tabassumli tumshuqcha */}
    <path d="M100 102 Q112 96 124 102 Q118 112 112 112 Q106 112 100 102 Z" fill="#FF9E2E"/>
    <path d="M104 108 Q112 114 120 108" stroke="#E8871F" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    {/* yonoq qizilliklari */}
    <circle cx="82" cy="102" r="7" fill="#FFB48A" opacity="0.7"/>
    <circle cx="142" cy="102" r="7" fill="#FFB48A" opacity="0.7"/>
  </g>
);


// SHIRIN mushukcha — bolalarbop uslub, 4 oyoqli (kuchukcha bilan bir
// oilada). Render qilib vizual tasdiqlangan. 9-sahifa (tungi farq-top).
const LLRealCat = () => (
  <g>
    <ellipse cx="105" cy="228" rx="80" ry="9" fill="rgba(40,30,10,0.2)"/>
    {/* gajak dum */}
    <path d="M40 160 C 24 150, 18 128, 32 118 C 44 110, 56 120, 50 132 C 46 126, 38 128, 38 136 C 38 146, 46 152, 56 150 Z" fill="#DE6E2C"/>
    {/* narigi tomon oyoqlari */}
    <rect x="58" y="180" width="20" height="44" rx="10" fill="#DE6E2C"/>
    <rect x="128" y="180" width="20" height="44" rx="10" fill="#DE6E2C"/>
    {/* tana + qorincha */}
    <ellipse cx="102" cy="172" rx="56" ry="42" fill="#F1863F"/>
    <ellipse cx="112" cy="184" rx="32" ry="24" fill="#FFC9A0"/>
    {/* beri tomon oyoqlari + panjalar */}
    <rect x="70" y="188" width="22" height="40" rx="11" fill="#F1863F"/>
    <rect x="116" y="188" width="22" height="40" rx="11" fill="#F1863F"/>
    <ellipse cx="81" cy="226" rx="14" ry="7" fill="#DE6E2C"/>
    <ellipse cx="127" cy="226" rx="14" ry="7" fill="#DE6E2C"/>
    <ellipse cx="68" cy="222" rx="12" ry="6" fill="#C25A1F"/>
    <ellipse cx="138" cy="222" rx="12" ry="6" fill="#C25A1F"/>
    {/* katta bosh + uchli quloqlar */}
    <circle cx="130" cy="92" r="50" fill="#F1863F"/>
    <path d="M92 58 L84 18 L122 40 Z" fill="#F1863F"/>
    <path d="M168 58 L176 18 L138 40 Z" fill="#F1863F"/>
    <path d="M96 52 L91 28 L114 42 Z" fill="#FFC9A0"/>
    <path d="M164 52 L169 28 L146 42 Z" fill="#FFC9A0"/>
    {/* peshona chiziqchalari */}
    <g stroke="#DE6E2C" strokeWidth="4" strokeLinecap="round">
      <line x1="122" y1="52" x2="122" y2="62"/>
      <line x1="130" y1="50" x2="130" y2="62"/>
      <line x1="138" y1="52" x2="138" y2="62"/>
    </g>
    {/* tumshuq oq qismi */}
    <ellipse cx="130" cy="112" rx="24" ry="17" fill="#FFC9A0"/>
    {/* katta yaltiroq ko'zlar */}
    <circle cx="112" cy="88" r="11" fill="#3D3A50"/>
    <circle cx="116" cy="84" r="4" fill="#FFFFFF"/>
    <circle cx="109" cy="92" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    <circle cx="148" cy="88" r="11" fill="#3D3A50"/>
    <circle cx="152" cy="84" r="4" fill="#FFFFFF"/>
    <circle cx="145" cy="92" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    {/* pushti burun + og'iz */}
    <path d="M124 104 L136 104 L130 111 Z" fill="#E88AA0"/>
    <path d="M130 111 L130 116" stroke="#C25A1F" strokeWidth="3" strokeLinecap="round"/>
    <path d="M118 118 Q124 124 130 118 Q136 124 142 118" stroke="#C25A1F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
    {/* mo'ylovlar */}
    <g stroke="#FFE5CE" strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
      <line x1="104" y1="106" x2="78" y2="100"/>
      <line x1="104" y1="112" x2="76" y2="112"/>
      <line x1="156" y1="106" x2="182" y2="100"/>
      <line x1="156" y1="112" x2="184" y2="112"/>
    </g>
    {/* yonoq qizilliklari */}
    <circle cx="98" cy="106" r="7" fill="#F2A9C4" opacity="0.55"/>
    <circle cx="162" cy="106" r="7" fill="#F2A9C4" opacity="0.55"/>
  </g>
);


// SHIRIN quyoncha — bolalarbop uslub, 4 oyoqli (kuchukcha oilasi).
// Render qilib vizual tasdiqlangan. 10-sahifa (rang o'zgardi).
const LLRealRabbit = () => (
  <g transform="translate(4 0) scale(0.96)">
    <ellipse cx="105" cy="238" rx="80" ry="9" fill="rgba(60,45,20,0.15)"/>
    <circle cx="46" cy="178" r="15" fill="#EDE9E2"/>
    <rect x="58" y="190" width="20" height="44" rx="10" fill="#A69F94"/>
    <rect x="128" y="190" width="20" height="44" rx="10" fill="#A69F94"/>
    <ellipse cx="102" cy="182" rx="56" ry="42" fill="#BFBAB2"/>
    <ellipse cx="112" cy="194" rx="32" ry="24" fill="#EDE9E2"/>
    <rect x="70" y="198" width="22" height="40" rx="11" fill="#BFBAB2"/>
    <rect x="116" y="198" width="22" height="40" rx="11" fill="#BFBAB2"/>
    <ellipse cx="81" cy="236" rx="14" ry="7" fill="#A69F94"/>
    <ellipse cx="127" cy="236" rx="14" ry="7" fill="#A69F94"/>
    <ellipse cx="68" cy="232" rx="12" ry="6" fill="#93897B"/>
    <ellipse cx="138" cy="232" rx="12" ry="6" fill="#93897B"/>
    {/* uzun quloqlar (ichi pushti) */}
    <ellipse cx="108" cy="38" rx="14" ry="36" fill="#BFBAB2" transform="rotate(-8 108 38)"/>
    <ellipse cx="152" cy="38" rx="14" ry="36" fill="#BFBAB2" transform="rotate(8 152 38)"/>
    <ellipse cx="108" cy="42" rx="7.5" ry="26" fill="#EFB9C7" transform="rotate(-8 108 42)"/>
    <ellipse cx="152" cy="42" rx="7.5" ry="26" fill="#EFB9C7" transform="rotate(8 152 42)"/>
    <circle cx="130" cy="102" r="50" fill="#BFBAB2"/>
    <ellipse cx="130" cy="122" rx="24" ry="17" fill="#EDE9E2"/>
    <circle cx="112" cy="98" r="11" fill="#3D3A50"/>
    <circle cx="116" cy="94" r="4" fill="#FFFFFF"/>
    <circle cx="109" cy="102" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    <circle cx="148" cy="98" r="11" fill="#3D3A50"/>
    <circle cx="152" cy="94" r="4" fill="#FFFFFF"/>
    <circle cx="145" cy="102" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    {/* burun + og'iz + tishchalar */}
    <path d="M124 114 L136 114 L130 121 Z" fill="#E88AA0"/>
    <path d="M130 121 L130 126" stroke="#93897B" strokeWidth="3" strokeLinecap="round"/>
    <path d="M118 128 Q124 134 130 128 Q136 134 142 128" stroke="#93897B" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
    <rect x="125" y="128" width="10" height="8" rx="2.5" fill="#FFFFFF"/>
    <line x1="130" y1="128" x2="130" y2="136" stroke="#D9D2C4" strokeWidth="1.5"/>
    <g stroke="#D9D2C4" strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
      <line x1="104" y1="116" x2="80" y2="110"/>
      <line x1="104" y1="122" x2="78" y2="122"/>
      <line x1="156" y1="116" x2="180" y2="110"/>
      <line x1="156" y1="122" x2="182" y2="122"/>
    </g>
    <circle cx="98" cy="116" r="7" fill="#F2A9C4" opacity="0.55"/>
    <circle cx="162" cy="116" r="7" fill="#F2A9C4" opacity="0.55"/>
  </g>
);

// SHIRIN sigircha — bolalarbop uslub, 4 oyoqli, shox-tuyoqli.
// Render qilib vizual tasdiqlangan. 10-sahifa (rang o'zgardi).
const LLRealCow = () => (
  <g transform="translate(4 0) scale(0.96)">
    <ellipse cx="105" cy="238" rx="80" ry="9" fill="rgba(60,45,20,0.15)"/>
    {/* dum popukli */}
    <path d="M40 170 C 28 164, 24 150, 32 142 L 38 148 C 34 154, 36 160, 44 164 Z" fill="#E2DACB"/>
    <circle cx="33" cy="142" r="7" fill="#6B4A33"/>
    <rect x="58" y="190" width="20" height="44" rx="10" fill="#E2DACB"/>
    <rect x="128" y="190" width="20" height="44" rx="10" fill="#E2DACB"/>
    <ellipse cx="102" cy="182" rx="56" ry="42" fill="#F7F3EA"/>
    <ellipse cx="112" cy="194" rx="32" ry="24" fill="#FFFFFF"/>
    {/* dog'lar */}
    <ellipse cx="70" cy="162" rx="16" ry="12" fill="#6B4A33" opacity="0.9"/>
    <ellipse cx="128" cy="158" rx="12" ry="9" fill="#6B4A33" opacity="0.9"/>
    <rect x="70" y="198" width="22" height="40" rx="11" fill="#F7F3EA"/>
    <rect x="116" y="198" width="22" height="40" rx="11" fill="#F7F3EA"/>
    {/* tuyoqlar */}
    <ellipse cx="81" cy="236" rx="14" ry="7" fill="#6B4A33"/>
    <ellipse cx="127" cy="236" rx="14" ry="7" fill="#6B4A33"/>
    <ellipse cx="68" cy="232" rx="12" ry="6" fill="#54382B"/>
    <ellipse cx="138" cy="232" rx="12" ry="6" fill="#54382B"/>
    {/* shoxchalar + yon quloqlar */}
    <path d="M100 48 C 94 36, 98 26, 108 26 C 106 34, 106 42, 108 50 Z" fill="#C9B08E"/>
    <path d="M160 48 C 166 36, 162 26, 152 26 C 154 34, 154 42, 152 50 Z" fill="#C9B08E"/>
    <ellipse cx="82" cy="88" rx="16" ry="10" fill="#E2DACB" transform="rotate(-18 82 88)"/>
    <ellipse cx="178" cy="88" rx="16" ry="10" fill="#E2DACB" transform="rotate(18 178 88)"/>
    <circle cx="130" cy="94" r="50" fill="#F7F3EA"/>
    {/* peshona kokili + bosh dog'i */}
    <ellipse cx="130" cy="52" rx="16" ry="9" fill="#6B4A33"/>
    <ellipse cx="98" cy="70" rx="13" ry="10" fill="#6B4A33" opacity="0.9"/>
    <circle cx="112" cy="88" r="11" fill="#3D3A50"/>
    <circle cx="116" cy="84" r="4" fill="#FFFFFF"/>
    <circle cx="109" cy="92" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    <circle cx="148" cy="88" r="11" fill="#3D3A50"/>
    <circle cx="152" cy="84" r="4" fill="#FFFFFF"/>
    <circle cx="145" cy="92" r="1.8" fill="#FFFFFF" opacity="0.7"/>
    {/* katta pushti tumshuq */}
    <ellipse cx="130" cy="118" rx="27" ry="16" fill="#F2B8C6"/>
    <ellipse cx="120" cy="118" rx="4.5" ry="6" fill="#D67F98"/>
    <ellipse cx="140" cy="118" rx="4.5" ry="6" fill="#D67F98"/>
    <path d="M122 130 Q130 135 138 130" stroke="#D67F98" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <circle cx="96" cy="106" r="7" fill="#F2A9C4" opacity="0.5"/>
    <circle cx="164" cy="106" r="7" fill="#F2A9C4" opacity="0.5"/>
  </g>
);

const LL_KINDS = {
  cat: LLCat, dog: LLDog, rabbit: LLRabbit, duck: LLDuck, rooster: LLRooster,
  cow: LLCow, pig: LLPig, horse: LLHorse, sheep: LLSheep, turtle: LLTurtle,
  elephant: LLElephant, giraffe: LLGiraffe, monkey: LLMonkey, lion: LLLion,
  realDog: LLRealDog, realDuck: LLRealDuck, realCat: LLRealCat,
  realRabbit: LLRealRabbit, realCow: LLRealCow,
};
// kind -> jonivor; sil=true — soya (hamma qism bir xil quyuq rang);
// silColor — soya rangini almashtirish (sahifaga mos yumshoq tus uchun)
const LLCritter = ({ kind, sil = false, silColor = LL_SIL }) => {
  const c = (col) => (sil ? silColor : col);
  const K = LL_KINDS[kind] || LLCat;
  return (
    <svg viewBox="0 0 200 240" className="d1-llc" aria-hidden="true">
      {!sil && <ellipse cx="100" cy="232" rx="52" ry="8" fill="rgba(40, 90, 25, 0.22)"/>}
      <K c={c}/>
    </svg>
  );
};

// LogicLike uslubidagi o'rmon foni: tekis yashil + burchaklarda katta
// barg siluetlari + yerda mayda do'ngchalar (image_2.png ruhida)
const LLJungleBg = () => (
  <div className="d1-theme d1-lljungle" aria-hidden="true">
    <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice">
      <rect width="1000" height="620" fill="#8CC94F"/>
      <g fill="#7CBB45">
        <path d="M-40 -20 Q120 10 190 150 Q60 140 -40 40 Z"/>
        <path d="M150 -30 Q260 60 180 170 Q120 60 150 -30 Z"/>
        <path d="M1040 -20 Q880 10 810 150 Q940 140 1040 40 Z"/>
        <path d="M850 -30 Q740 60 820 170 Q880 60 850 -30 Z"/>
        <path d="M-30 640 Q30 520 150 560 Q80 640 -30 640 Z"/>
        <path d="M1030 640 Q970 520 850 560 Q920 640 1030 640 Z"/>
      </g>
      <g fill="#79B540">
        <ellipse cx="180" cy="560" rx="26" ry="8"/>
        <ellipse cx="120" cy="540" rx="14" ry="6"/>
        <ellipse cx="840" cy="575" rx="30" ry="9"/>
        <ellipse cx="520" cy="595" rx="18" ry="6"/>
      </g>
    </svg>
  </div>
);

// ============================================================
// LL_OBJ — NARSALAR registri (100x100 yassi SVG, LogicLike uslubi).
// t — ixtiyoriy asosiy rang: rang-parametrik shakllar shu rangga
// bo'yaladi, berilmasa o'z odatiy rangida chiziladi.
// ============================================================
// rangni biroz to'qlashtirish — ayiqcha qo'l-oyoqlari tanadan ajralib
// turishi uchun (tint berilganda ham mos tusda bo'ladi)
const darkenHex = (hex, f = 0.88) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const LLBearIcon = ({ t }) => {
  const limb = t ? darkenHex(t) : '#B8793A';
  return (
    <g>
      <circle cx="30" cy="24" r="12" fill={t || '#C98A4B'}/><circle cx="70" cy="24" r="12" fill={t || '#C98A4B'}/>
      <circle cx="30" cy="24" r="6" fill="#E8B888"/><circle cx="70" cy="24" r="6" fill="#E8B888"/>
      {/* uzun dumaloq qo'llar — yelkadan pastga osilib turadi */}
      <ellipse cx="25" cy="68" rx="6.5" ry="16" fill={limb} transform="rotate(14 25 68)"/>
      <ellipse cx="75" cy="68" rx="6.5" ry="16" fill={limb} transform="rotate(-14 75 68)"/>
      {/* qo'l kaftchalari */}
      <circle cx="21" cy="82" r="5" fill="#E8B888"/>
      <circle cx="79" cy="82" r="5" fill="#E8B888"/>
      {/* oyoqlar — ayiqnikidek: tik oyoq + oldga qaragan katta tovon */}
      <ellipse cx="37" cy="82" rx="8" ry="13" fill={limb}/>
      <ellipse cx="63" cy="82" rx="8" ry="13" fill={limb}/>
      <ellipse cx="36" cy="93" rx="10" ry="6" fill={limb}/>
      <ellipse cx="64" cy="93" rx="10" ry="6" fill={limb}/>
      <ellipse cx="50" cy="70" rx="25" ry="21" fill={t || '#C98A4B'}/>
      <ellipse cx="50" cy="76" rx="13" ry="11" fill="#E8B888"/>
      {/* tovon yostiqchalari */}
      <ellipse cx="36" cy="93" rx="6.5" ry="3.8" fill="#E8B888"/>
      <ellipse cx="64" cy="93" rx="6.5" ry="3.8" fill="#E8B888"/>
      <circle cx="50" cy="38" r="26" fill={t || '#C98A4B'}/>
      <ellipse cx="50" cy="47" rx="12" ry="9" fill="#E8B888"/>
      <circle cx="41" cy="34" r="4" fill="#2E3140"/><circle cx="59" cy="34" r="4" fill="#2E3140"/>
      <ellipse cx="50" cy="44" rx="4.5" ry="3.5" fill="#2E3140"/>
    </g>
  );
};
const LLFishArt = ({ main, dark, deco }) => (
  <g>
    <path d="M70 50 L92 32 q4 18 0 36 Z" fill={dark}/>
    <path d="M38 28 q10 -12 22 -2 l-10 12 Z" fill={dark}/>
    <ellipse cx="44" cy="52" rx="32" ry="24" fill={main}/>
    {deco}
    <circle cx="26" cy="46" r="6" fill="#FFFFFF"/><circle cx="25" cy="46" r="3" fill="#2E3140"/>
    <path d="M18 60 q6 5 12 2" stroke="#2E3140" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  </g>
);

const LL_OBJ = {
  sun: () => (
    <g>
      <g stroke="#FFC23C" strokeWidth="7" strokeLinecap="round">
        <line x1="50" y1="8" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="92"/>
        <line x1="8" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="92" y2="50"/>
        <line x1="20" y1="20" x2="28" y2="28"/><line x1="72" y1="72" x2="80" y2="80"/>
        <line x1="80" y1="20" x2="72" y2="28"/><line x1="28" y1="72" x2="20" y2="80"/>
      </g>
      <circle cx="50" cy="50" r="24" fill="#FFD34D"/>
      <circle cx="43" cy="43" r="7" fill="#FFE9A8"/>
    </g>
  ),
  cloud: ({ t }) => (
    <g fill={t || '#FFFFFF'}>
      <ellipse cx="50" cy="62" rx="38" ry="18"/>
      <circle cx="34" cy="48" r="16"/><circle cx="56" cy="42" r="20"/><circle cx="74" cy="52" r="13"/>
    </g>
  ),
  tree: ({ t }) => (
    <g>
      <rect x="44" y="58" width="12" height="34" rx="5" fill="#8F5A2E"/>
      <circle cx="50" cy="34" r="24" fill={t || '#43A047'}/>
      <circle cx="30" cy="48" r="16" fill={t || '#43A047'}/>
      <circle cx="70" cy="48" r="16" fill={t || '#43A047'}/>
    </g>
  ),
  snowtree: () => (
    <g>
      <rect x="44" y="76" width="12" height="18" rx="5" fill="#8F5A2E"/>
      <path d="M50 8 L74 42 H26 Z" fill="#2E7D4F"/>
      <path d="M50 28 L80 66 H20 Z" fill="#2E7D4F"/>
      <path d="M50 48 L88 88 H12 Z" fill="#2E7D4F"/>
      <circle cx="50" cy="8" r="6" fill="#FFD34D"/>
      <path d="M38 40 q12 8 24 0" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M32 64 q18 10 36 0" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </g>
  ),
  flower: ({ t }) => (
    <g>
      <rect x="47" y="58" width="6" height="34" rx="3" fill="#43A047"/>
      <g fill={t || '#F2A9C4'}>
        <circle cx="50" cy="18" r="12"/><circle cx="27" cy="32" r="12"/><circle cx="73" cy="32" r="12"/>
        <circle cx="32" cy="56" r="12"/><circle cx="68" cy="56" r="12"/>
      </g>
      <circle cx="50" cy="38" r="12" fill="#FFD34D"/>
    </g>
  ),
  mushroom: ({ t }) => (
    <g>
      <path d="M50 12 q38 0 40 34 l-80 0 q2 -34 40 -34 Z" fill={t || '#FF5A4E'}/>
      <rect x="38" y="46" width="24" height="42" rx="11" fill="#FFEFD6"/>
      <circle cx="34" cy="32" r="6" fill="#FFFFFF"/><circle cx="58" cy="24" r="5" fill="#FFFFFF"/><circle cx="68" cy="38" r="4.5" fill="#FFFFFF"/>
    </g>
  ),
  seaweed: ({ t }) => (
    <g stroke={t || '#2FA45C'} strokeWidth="9" fill="none" strokeLinecap="round">
      <path d="M30 94 q-10 -26 6 -46 q10 -14 4 -28"/>
      <path d="M52 94 q12 -22 -2 -44 q-8 -14 2 -30"/>
      <path d="M74 94 q10 -20 -2 -38 q-8 -14 0 -26"/>
    </g>
  ),
  butterfly: ({ t }) => (
    <g>
      <g fill={t || '#B48CE0'}>
        <ellipse cx="30" cy="34" rx="20" ry="18"/><ellipse cx="70" cy="34" rx="20" ry="18"/>
        <ellipse cx="33" cy="66" rx="15" ry="13"/><ellipse cx="67" cy="66" rx="15" ry="13"/>
      </g>
      <circle cx="30" cy="34" r="7" fill="#FFFFFF" opacity="0.6"/><circle cx="70" cy="34" r="7" fill="#FFFFFF" opacity="0.6"/>
      <rect x="45" y="26" width="10" height="52" rx="5" fill="#4A3B60"/>
      <path d="M46 22 q-8 -10 -14 -12 M54 22 q8 -10 14 -12" stroke="#4A3B60" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </g>
  ),
  star5: ({ t }) => (
    <path d="M50 5 L61 37 L95 37 L67 57 L77 91 L50 71 L23 91 L33 57 L5 37 L39 37 Z" fill={t || '#FFD34D'}/>
  ),
  heart: ({ t }) => (
    <path d="M50 88 C24 66 10 48 10 33 C10 19 21 10 33 10 C42 10 48 15 50 23 C52 15 58 10 67 10 C79 10 90 19 90 33 C90 48 76 66 50 88 Z" fill={t || '#FF5A8A'}/>
  ),
  dot: ({ t }) => (
    <g>
      <circle cx="50" cy="50" r="37" fill={t || '#FF5A4E'}/>
      <ellipse cx="38" cy="36" rx="10" ry="7" fill="#FFFFFF" opacity="0.4" transform="rotate(-30 38 36)"/>
    </g>
  ),
  square: ({ t }) => (
    <g>
      <rect x="13" y="13" width="74" height="74" rx="14" fill={t || '#FF5A4E'}/>
      <rect x="24" y="22" width="20" height="10" rx="5" fill="#FFFFFF" opacity="0.35"/>
    </g>
  ),
  apple: ({ t }) => (
    <g>
      <path d="M50 30 q-4 -10 -12 -12" stroke="#8F5A2E" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <ellipse cx="66" cy="20" rx="12" ry="7" fill="#43A047" transform="rotate(-24 66 20)"/>
      <path d="M50 30 C24 22 12 42 16 62 C20 82 36 94 50 92 C64 94 80 82 84 62 C88 42 76 22 50 30 Z" fill={t || '#FF5A4E'}/>
      <ellipse cx="36" cy="48" rx="8" ry="12" fill="#FFFFFF" opacity="0.3" transform="rotate(14 36 48)"/>
    </g>
  ),
  pear: ({ t }) => (
    <g>
      <path d="M50 22 q0 -10 8 -14" stroke="#8F5A2E" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M50 20 C42 20 40 32 38 44 C24 50 20 66 26 78 C32 90 68 90 74 78 C80 66 76 50 62 44 C60 32 58 20 50 20 Z" fill={t || '#A8CC5A'}/>
      <ellipse cx="40" cy="66" rx="7" ry="11" fill="#FFFFFF" opacity="0.3"/>
    </g>
  ),
  orange: ({ t }) => (
    <g>
      <ellipse cx="64" cy="16" rx="12" ry="7" fill="#43A047" transform="rotate(-20 64 16)"/>
      <circle cx="50" cy="56" r="36" fill={t || '#F5A125'}/>
      <circle cx="38" cy="44" r="8" fill="#FFFFFF" opacity="0.3"/>
      <circle cx="62" cy="70" r="3" fill="#E08A12"/><circle cx="52" cy="76" r="2.5" fill="#E08A12"/><circle cx="68" cy="60" r="2.5" fill="#E08A12"/>
    </g>
  ),
  grape: ({ t }) => (
    <g>
      <path d="M50 20 q2 -10 12 -12" stroke="#8F5A2E" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <ellipse cx="34" cy="18" rx="12" ry="7" fill="#43A047" transform="rotate(18 34 18)"/>
      <g fill={t || '#8E5AE8'}>
        <circle cx="34" cy="38" r="13"/><circle cx="66" cy="38" r="13"/><circle cx="50" cy="34" r="13"/>
        <circle cx="38" cy="60" r="13"/><circle cx="62" cy="60" r="13"/><circle cx="50" cy="80" r="13"/>
      </g>
      <circle cx="46" cy="30" r="4" fill="#FFFFFF" opacity="0.4"/>
    </g>
  ),
  rubberduck: () => (
    <g>
      {/* REZINA O'RDAKCHA — vanna o'yinchog'i: do'mboq tana, yaltirash */}
      <path d="M24 60 C 12 52, 14 38, 26 36 C 28 44, 32 52, 38 57 Z" fill="#FFCE2E"/>
      <ellipse cx="52" cy="66" rx="34" ry="23" fill="#FFCE2E"/>
      <path d="M36 66 C 44 59, 56 59, 63 66" stroke="#E8A21F" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <circle cx="66" cy="33" r="19" fill="#FFCE2E"/>
      <path d="M83 30 C 93 29, 98 33, 98 38 C 98 42, 93 45, 84 44 C 81 40, 81 34, 83 30 Z" fill="#FF9E2E"/>
      <path d="M84 37 q 6 2 12 0" stroke="#E8871F" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <circle cx="71" cy="27" r="4.5" fill="#2E3140"/>
      <circle cx="72.5" cy="25.5" r="1.6" fill="#FFFFFF"/>
      <ellipse cx="40" cy="58" rx="10" ry="6" fill="#FFF3C4" opacity="0.85" transform="rotate(-15 40 58)"/>
      <circle cx="59" cy="26" r="5.5" fill="#FFF3C4" opacity="0.85"/>
      <ellipse cx="52" cy="90" rx="30" ry="4" fill="rgba(160,110,20,0.18)"/>
    </g>
  ),
  comet: () => (
    <g>
      {/* KOMETA — yorqin bosh + ikki qavat dum + uchqunlar */}
      <path d="M62 54 C 42 64, 22 78, 5 93 C 28 86, 48 74, 66 61 Z" fill="#8FD4FF" opacity="0.85"/>
      <path d="M64 46 C 46 56, 28 70, 13 84 C 34 75, 52 64, 68 55 Z" fill="#FFE9A8" opacity="0.9"/>
      <circle cx="68" cy="40" r="17" fill="#FFD34D"/>
      <circle cx="63" cy="35" r="6" fill="#FFF3C4"/>
      <circle cx="30" cy="62" r="2.5" fill="#FFF3C4"/>
      <circle cx="20" cy="78" r="2" fill="#8FD4FF"/>
      <circle cx="44" cy="68" r="2" fill="#FFD34D"/>
    </g>
  ),
  banana: ({ t }) => (
    <g>
      {/* pishgan BOSH banan: uchtasi tepada bitta bandga yopishgan */}
      {/* orqa banan (eng to'q) */}
      <path d="M 70 16 C 64 32, 62 56, 70 82 C 73 90, 84 88, 84 80 C 78 58, 80 40, 85 26 Z" fill={t ? darkenHex(t, 0.86) : '#E8AF2E'}/>
      <ellipse cx="76" cy="84" rx="4" ry="3.2" fill="#8F5A2E" transform="rotate(20 76 84)"/>
      {/* o'rta banan */}
      <path d="M 63 15 C 50 30, 43 56, 50 84 C 53 93, 64 92, 65 83 C 61 60, 66 38, 76 24 Z" fill={t ? darkenHex(t, 0.94) : '#F5C043'}/>
      <ellipse cx="56" cy="87" rx="4.5" ry="3.4" fill="#8F5A2E" transform="rotate(28 56 87)"/>
      {/* old banan (eng yorqin) */}
      <path d="M 56 16 C 35 25, 21 50, 26 78 C 28 88, 40 89, 43 80 C 43 57, 52 37, 66 27 Z" fill={t || '#FFD34D'}/>
      <ellipse cx="34" cy="83" rx="4.8" ry="3.6" fill="#8F5A2E" transform="rotate(40 34 83)"/>
      {/* qirra chizig'i + yaltirash */}
      <path d="M 34 40 C 28 52, 27 64, 32 75" stroke="#F0B429" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
      <path d="M 44 36 C 37 49, 36 62, 39 73" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.4"/>
      {/* umumiy band — tepada birlashtiruvchi */}
      <path d="M 53 20 C 55 11, 75 9, 81 18 C 83 22, 81 25, 77 26 L 61 27 C 55 26, 52 24, 53 20 Z" fill="#A5682F"/>
      <rect x="63" y="5" width="9" height="11" rx="4" fill="#8F5A2E"/>
      <path d="M 57 21 C 63 17, 72 17, 77 21" stroke="#8F5A2E" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"/>
    </g>
  ),
  basket: ({ t }) => (
    <g>
      <path d="M26 40 q24 -24 48 0" stroke={t || '#C98A4B'} strokeWidth="7" fill="none" strokeLinecap="round"/>
      <path d="M14 44 h72 l-8 40 q-2 8 -10 8 h-36 q-8 0 -10 -8 Z" fill={t || '#C98A4B'}/>
      <g stroke="#A96F3F" strokeWidth="4">
        <line x1="30" y1="48" x2="34" y2="88"/><line x1="50" y1="48" x2="50" y2="90"/><line x1="70" y1="48" x2="66" y2="88"/>
        <line x1="18" y1="62" x2="82" y2="62"/><line x1="20" y1="76" x2="80" y2="76"/>
      </g>
      <rect x="12" y="40" width="76" height="10" rx="5" fill="#A96F3F"/>
    </g>
  ),
  candy: ({ t }) => (
    <g>
      <path d="M24 36 L8 26 Q16 50 8 74 L24 64 Z" fill={t || '#FF5A8A'}/>
      <path d="M76 36 L92 26 Q84 50 92 74 L76 64 Z" fill={t || '#FF5A8A'}/>
      <circle cx="50" cy="50" r="27" fill={t || '#FF5A8A'}/>
      <path d="M32 38 q18 -8 36 0 M30 58 q20 10 40 0" stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.7"/>
    </g>
  ),
  icecream: ({ t }) => (
    <g>
      <path d="M30 44 H70 L50 94 Z" fill="#E8B04B"/>
      <g stroke="#C98A3B" strokeWidth="2.5">
        <line x1="36" y1="52" x2="58" y2="78"/><line x1="46" y1="46" x2="62" y2="66"/>
        <line x1="64" y1="52" x2="44" y2="76"/><line x1="54" y1="46" x2="38" y2="64"/>
      </g>
      <circle cx="38" cy="34" r="15" fill={t || '#F2A9C4'}/>
      <circle cx="62" cy="34" r="15" fill="#FFF6E8"/>
      <circle cx="50" cy="24" r="15" fill={t || '#F2A9C4'}/>
    </g>
  ),
  cookie: ({ t }) => (
    <g>
      <circle cx="50" cy="50" r="37" fill={t || '#D9A25F'}/>
      <g fill="#8F5A2E">
        <circle cx="36" cy="38" r="6"/><circle cx="62" cy="32" r="5"/><circle cx="68" cy="58" r="6"/>
        <circle cx="44" cy="64" r="5"/><circle cx="52" cy="48" r="4"/><circle cx="30" cy="56" r="4"/>
      </g>
    </g>
  ),
  ball: ({ t }) => (
    <g>
      <circle cx="50" cy="50" r="37" fill="#FFFFFF"/>
      <path d="M20 26 q30 18 60 0 l0 12 q-30 16 -60 0 Z" fill={t || '#FF5A4E'}/>
      <path d="M20 74 q30 -18 60 0 l0 -12 q-30 -16 -60 0 Z" fill="#4A90E2"/>
      <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(60,60,90,0.15)" strokeWidth="3"/>
    </g>
  ),
  cube: ({ t }) => (
    <g>
      <rect x="16" y="16" width="68" height="68" rx="12" fill={t || '#4A90E2'}/>
      <rect x="28" y="28" width="44" height="44" rx="8" fill="#FFFFFF" opacity="0.85"/>
      <circle cx="50" cy="50" r="12" fill={t || '#4A90E2'}/>
    </g>
  ),
  bear: ({ t }) => <LLBearIcon t={t}/>,
  bowbear: ({ t }) => (
    <g>
      <LLBearIcon t={t}/>
      <path d="M50 60 l-13 -7 q-6 9 0 15 Z" fill="#FF5A8A"/>
      <path d="M50 60 l13 -7 q6 9 0 15 Z" fill="#FF5A8A"/>
      <circle cx="50" cy="62" r="4.5" fill="#E84A76"/>
    </g>
  ),
  doll: () => (
    <g>
      <path d="M50 40 q30 4 30 40 q0 14 -30 14 q-30 0 -30 -14 q0 -36 30 -40 Z" fill="#E86A8A"/>
      <circle cx="50" cy="26" r="18" fill="#FFDDC2"/>
      <path d="M32 22 q4 -14 18 -14 q14 0 18 14 q-8 -6 -18 -6 q-10 0 -18 6 Z" fill="#8F5A2E"/>
      <circle cx="43" cy="26" r="3" fill="#2E3140"/><circle cx="57" cy="26" r="3" fill="#2E3140"/>
      <path d="M45 33 q5 4 10 0" stroke="#2E3140" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="50" cy="74" rx="12" ry="13" fill="#FFF1F5"/>
    </g>
  ),
  balloon: ({ t }) => (
    <g>
      <ellipse cx="50" cy="38" rx="26" ry="30" fill={t || '#FF8FB3'}/>
      <ellipse cx="40" cy="26" rx="8" ry="11" fill="#FFFFFF" opacity="0.4"/>
      <path d="M46 66 L54 66 L50 74 Z" fill={t || '#FF8FB3'}/>
      <path d="M50 74 q-6 10 2 20" stroke="#8A8FA6" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </g>
  ),
  gift: ({ t }) => (
    <g>
      <rect x="16" y="38" width="68" height="52" rx="8" fill={t || '#B06BFF'}/>
      <rect x="12" y="30" width="76" height="16" rx="8" fill={t || '#B06BFF'}/>
      <rect x="44" y="30" width="12" height="60" fill="#FFD34D"/>
      <path d="M50 28 q-16 -14 -8 -20 q8 -4 8 12 q0 -16 8 -12 q8 6 -8 20 Z" fill="#FFD34D"/>
    </g>
  ),
  pyramid: ({ t }) => (
    <g>
      <rect x="20" y="74" width="60" height="16" rx="8" fill={t || '#43C465'}/>
      <rect x="27" y="56" width="46" height="16" rx="8" fill="#4A90E2"/>
      <rect x="34" y="38" width="32" height="16" rx="8" fill="#FFD34D"/>
      <rect x="41" y="22" width="18" height="14" rx="7" fill="#FF5A4E"/>
      <circle cx="50" cy="14" r="7" fill="#B06BFF"/>
    </g>
  ),
  frame: ({ t }) => (
    <g>
      <rect x="14" y="14" width="72" height="72" rx="10" fill={t || '#5AC8FA'}/>
      <rect x="26" y="26" width="48" height="48" rx="5" fill="#FFF9EC"/>
      <circle cx="40" cy="42" r="7" fill="#FFD34D"/>
      <path d="M28 70 L46 52 L58 64 L66 56 L74 64 L74 72 L28 72 Z" fill="#43A047"/>
    </g>
  ),
  car: ({ t }) => (
    <g>
      <path d="M14 62 q0 -14 12 -16 l6 -12 q2 -6 10 -6 h18 q8 0 10 6 l6 12 q12 2 12 16 v8 q0 6 -8 6 h-58 q-8 0 -8 -6 Z" fill={t || '#F5C518'}/>
      <path d="M38 34 h12 v12 h-16 Z" fill="#CDEFFF"/>
      <path d="M54 34 h8 l6 12 h-14 Z" fill="#CDEFFF"/>
      <circle cx="32" cy="76" r="10" fill="#3A3F52"/><circle cx="68" cy="76" r="10" fill="#3A3F52"/>
      <circle cx="32" cy="76" r="4" fill="#C9D4E8"/><circle cx="68" cy="76" r="4" fill="#C9D4E8"/>
    </g>
  ),
  house: ({ t }) => (
    <g>
      {/* mo'ri — tom ortidan chiqib turadi */}
      <rect x="62" y="12" width="11" height="20" rx="2" fill="#C96B4E"/>
      <rect x="60" y="10" width="15" height="6" rx="3" fill="#A85540"/>
      {/* tana */}
      <rect x="18" y="44" width="64" height="46" rx="5" fill={t || '#F2A45E'}/>
      {/* tom — chetlari chiqib turgan, ostida soya chizig'i */}
      <path d="M50 6 Q52 6 54 8 L90 38 Q94 42 88 44 H12 Q6 42 10 38 L46 8 Q48 6 50 6 Z" fill="#E8573F"/>
      <rect x="14" y="42" width="72" height="5" rx="2.5" fill="#C94B36"/>
      {/* eshik — usti dumaloq, tutqichli, ostida ostona */}
      <path d="M42 90 V70 q0 -9 8 -9 q8 0 8 9 v20 Z" fill="#8F5A2E"/>
      <circle cx="54" cy="78" r="1.8" fill="#E8B888"/>
      <rect x="39" y="88" width="22" height="4" rx="2" fill="#C98A4B"/>
      {/* romli derazalar */}
      <rect x="24" y="54" width="15" height="15" rx="3" fill="#BEE3F8" stroke="#FFFFFF" strokeWidth="2.5"/>
      <path d="M31.5 54 v15 M24 61.5 h15" stroke="#FFFFFF" strokeWidth="2"/>
      <rect x="64" y="54" width="15" height="15" rx="3" fill="#BEE3F8" stroke="#FFFFFF" strokeWidth="2.5"/>
      <path d="M71.5 54 v15 M64 61.5 h15" stroke="#FFFFFF" strokeWidth="2"/>
    </g>
  ),
  lamp: () => (
    <g>
      <circle cx="50" cy="42" r="28" fill="#FFE9A8"/>
      <circle cx="50" cy="42" r="28" fill="none" stroke="#F5C518" strokeWidth="4"/>
      <path d="M42 40 q8 10 16 0" stroke="#E8A21F" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <rect x="40" y="68" width="20" height="8" rx="4" fill="#9AA3B8"/>
      <rect x="42" y="76" width="16" height="6" rx="3" fill="#7A8296"/>
      <rect x="44" y="82" width="12" height="6" rx="3" fill="#9AA3B8"/>
    </g>
  ),
  bird: ({ t }) => (
    <g>
      <path d="M84 50 L96 46 L88 56 Z" fill="#F5A125"/>
      <ellipse cx="50" cy="54" rx="34" ry="26" fill={t || '#5AC8FA'}/>
      <path d="M44 54 q-16 -8 -12 -24 q16 2 20 16 Z" fill="#3FA8E0"/>
      <circle cx="70" cy="44" r="5" fill="#2E3140"/>
      <path d="M32 78 l-4 12 M44 80 l0 12" stroke="#F5A125" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),
  moon: ({ t }) => (
    <path d="M64 8 A44 44 0 1 0 92 62 A34 34 0 1 1 64 8 Z" fill={t || '#FFE9A8'}/>
  ),
  planet: ({ t }) => (
    <g>
      <circle cx="50" cy="50" r="26" fill={t || '#3CE0C8'}/>
      <ellipse cx="50" cy="54" rx="44" ry="12" fill="none" stroke="#F2C14E" strokeWidth="7"/>
      <circle cx="40" cy="42" r="7" fill="#FFFFFF" opacity="0.35"/>
    </g>
  ),
  planetPlain: () => (
    <g>
      <circle cx="50" cy="50" r="34" fill="#6FA8DC"/>
      <circle cx="38" cy="40" r="9" fill="#5A93C8"/><circle cx="62" cy="58" r="11" fill="#5A93C8"/><circle cx="50" cy="72" r="6" fill="#5A93C8"/>
    </g>
  ),
  rocket: ({ t }) => (
    <g>
      <path d="M50 4 q20 16 20 46 l0 18 h-40 l0 -18 q0 -30 20 -46 Z" fill={t || '#FF5A4E'}/>
      <circle cx="50" cy="42" r="10" fill="#CDEFFF" stroke="#3A3F52" strokeWidth="3"/>
      <path d="M30 52 q-14 8 -12 26 l12 -8 Z" fill="#4A90E2"/>
      <path d="M70 52 q14 8 12 26 l-12 -8 Z" fill="#4A90E2"/>
      <path d="M42 72 q8 20 16 0 q-4 16 -8 22 q-4 -6 -8 -22 Z" fill="#FFB03A"/>
    </g>
  ),
  fishA: () => (
    <LLFishArt main="#FF8A3C" dark="#E86A1E" deco={(
      <g stroke="#E86A1E" strokeWidth="6" fill="none" strokeLinecap="round">
        <path d="M42 32 q6 18 0 38"/><path d="M56 34 q6 16 0 34"/>
      </g>
    )}/>
  ),
  fishB: () => (
    <LLFishArt main="#5AC8FA" dark="#3FA8E0" deco={(
      <g fill="#3FA8E0">
        <circle cx="42" cy="44" r="5"/><circle cx="56" cy="54" r="5"/><circle cx="42" cy="62" r="4"/>
      </g>
    )}/>
  ),
  fishC: () => (
    <LLFishArt main="#F58FB0" dark="#E86A8A" deco={(
      <ellipse cx="48" cy="64" rx="16" ry="8" fill="#FCC9D8"/>
    )}/>
  ),
  medal: () => (
    <g>
      <path d="M34 6 h14 l-4 26 h-12 Z" fill="#E8573F"/>
      <path d="M66 6 h-14 l4 26 h12 Z" fill="#4A90E2"/>
      <circle cx="50" cy="62" r="27" fill="#FFC23C"/>
      <circle cx="50" cy="62" r="19" fill="#FFD34D"/>
      <path d="M50 48 L54 59 L65 59 L56 66 L60 77 L50 70 L40 77 L44 66 L35 59 L46 59 Z" fill="#E8A21F"/>
    </g>
  ),
  box: () => (
    <g>
      <path d="M12 36 L28 22 h44 l16 14 Z" fill="#D9A25F"/>
      <path d="M14 38 h72 v44 q0 8 -8 8 h-56 q-8 0 -8 -8 Z" fill="#C98A4B"/>
      <rect x="14" y="38" width="72" height="10" fill="#B87A3C"/>
    </g>
  ),
  lens: () => (
    <g>
      <circle cx="42" cy="42" r="26" fill="rgba(205,239,255,0.55)" stroke="#4A90E2" strokeWidth="8"/>
      <rect x="66" y="60" width="30" height="14" rx="7" transform="rotate(45 66 60)" fill="#F5A125"/>
    </g>
  ),
};

// Rang-parametrik turlar — `c` bevosita asosiy rang bo'lib qo'llanadi
const LL_TINTABLE = new Set([
  'star5', 'heart', 'dot', 'square', 'apple', 'flower', 'balloon', 'gift',
  'cube', 'mushroom', 'cloud', 'moon', 'planet', 'rocket', 'house', 'car',
  'seaweed', 'butterfly', 'frame', 'pyramid', 'candy', 'tree', 'ball',
  'bear', 'bowbear', 'icecream', 'cookie', 'grape', 'banana', 'pear',
  'orange', 'basket', 'bird',
]);

// Universal belgicha: kind bo'yicha jonivor (LL_KINDS) yoki narsa (LL_OBJ)
const ObjIcon = ({ kind, c, style }) => {
  const K = LL_KINDS[kind];
  if (K) {
    const cc = (col) => col;
    return (
      <svg viewBox="0 0 200 240" className="d1-llo" style={style} aria-hidden="true">
        <K c={cc}/>
      </svg>
    );
  }
  const O = LL_OBJ[kind] || LL_OBJ.star5;
  return (
    <svg viewBox="0 0 100 100" className="d1-llo" style={style} aria-hidden="true">
      {O({ t: c })}
    </svg>
  );
};
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
  <svg viewBox="0 0 100 100" className="d1-llo" aria-hidden="true">
    <path d="M50 5 L61 37 L95 37 L67 57 L77 91 L50 71 L23 91 L33 57 L5 37 L39 37 Z"
      fill="#FFD34D" stroke="#E8A21F" strokeWidth="4" strokeLinejoin="round"/>
  </svg>
);

// ============================================================
// SAHIFA YECHILDI BAYRAMI — katta oltin yulduz ekran MARKAZIGA
// uchib keladi, atrofida salyut portlashlari + "Barakalla!" yozuvi.
// ~2.4 s davom etib o'zi so'nadi; bosishga xalaqit bermaydi
// (pointer-events yo'q), bola "Keyingi" ni o'zi bosadi.
// ============================================================
// 3 raketa: pastdan uchib chiqib, belgilangan nuqtada portlaydi.
// x/y — portlash nuqtasi (markazga nisbatan), d — otilish kechikishi.
const CELEB_FW = [
  { x: 0,    y: -60, d: 0,    c: '#FFD34D' },
  { x: -175, y: -15, d: 0.4,  c: '#FF5A8A' },
  { x: 180,  y: -40, d: 0.7,  c: '#5AC8FA' },
];
const CELEB_FLIGHT = 0.55;   // raketaning uchish vaqti (s)
const CelebrationFx = () => (
  <div className="d1-celeb" aria-hidden="true">
    <div className="d1-celeb-inner">
      {CELEB_FW.map((f, i) => (
        <React.Fragment key={i}>
          {/* raketa — yorug' iz bilan tepaga uchadi */}
          <span className="d1-celeb-rocket"
            style={{ left: f.x, top: f.y, background: f.c, '--glow': f.c, animationDelay: `${f.d}s` }}/>
          {/* portlash chaqnashi */}
          <span className="d1-celeb-flash" style={{ left: f.x, top: f.y, animationDelay: `${f.d + CELEB_FLIGHT}s` }}/>
          {/* uchqunlar — ikki halqa bo'lib KATTA yoyiladi, so'ng pastga sochiladi */}
          <span className="d1-celeb-burst" style={{ left: f.x, top: f.y }}>
            {[6.2, 3.9].map((mult, ring) =>
              BURST.map(({ a, d, cl }, j) => {
                const rad = ((a + ring * 15) * Math.PI) / 180;
                return (
                  <i key={`${ring}-${j}`} style={{
                    background: j % 3 === 0 ? f.c : cl,
                    '--bx': `${(Math.cos(rad) * d * mult).toFixed(1)}px`,
                    '--by': `${(Math.sin(rad) * d * mult).toFixed(1)}px`,
                    animationDelay: `${f.d + CELEB_FLIGHT + ring * 0.06 + (j % 4) * 0.02}s`,
                  }}/>
                );
              })
            )}
          </span>
        </React.Fragment>
      ))}
      <span className="d1-celeb-txt">Barakalla!</span>
    </div>
  </div>
);
// ============================================================
// YULDUZ PARVOZI API — GamePage to'g'ri javob nuqtasini ildizga uzatadi
// ============================================================
const FlightCtx = React.createContext({ onCorrect: () => {} });
const useFlightApi = () => React.useContext(FlightCtx);
// ============================================================
// SAHIFA 2 — Format 3: SOYA TOPISH (o'tloqdagi quyon)
// Yashil o'tloq taxtasi ustida yarim-realistik quyon, pastda yashil
// ramkali oq kartalarda 3 ta qora soya: mushuk, xo'roz, quyon.
// ============================================================
const SHADOW_CAT_VOICE = "Do'stimizning soyasi qaysi? Mos soyani topib bosing!";


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
          // --dx: mobil CSS chetdagi belgichalarni karta ichiga surish uchun
          left: `${d.x}%`, top: `${d.y}%`, '--dx': `${d.x}%`,
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
// SAHIFA FONLARI — har bir sahifa O'Z mavzusiga mos fonga ega:
// mevalar bog'i, o'yin xonasi, o'tloq, shakllar, tun, kosmos, shirinliklar.
// ============================================================
// Mevalar bog'i (saralash-meva, savat, sanoq-meva)
const FRUITS_THEME = {
  bg: 'linear-gradient(180deg, #FFF6D9 0%, #F0F7D8 55%, #D9EFC0 100%)',
  decor: [
    { kind: 'sun',       c: '#FFD34D', x: 7,  y: 10, s: 64, o: 0.45 },
    { kind: 'cloud',     c: '#FFFFFF', x: 30, y: 6,  s: 60, o: 0.65 },
    { kind: 'apple',     c: '#FF5A4E', x: 55, y: 9,  s: 34, o: 0.4 },
    { kind: 'cloud',     c: '#FFFFFF', x: 78, y: 10, s: 66, o: 0.6 },
    { kind: 'pear',      c: '#A8CC5A', x: 95, y: 15, s: 34, o: 0.4 },
    { kind: 'grape',     c: '#8E5AE8', x: 4,  y: 54, s: 34, o: 0.35 },
    { kind: 'orange',    c: '#F5A125', x: 96, y: 52, s: 32, o: 0.35 },
    { kind: 'flower',    c: '#F2A9C4', x: 6,  y: 92, s: 36, o: 0.45 },
    { kind: 'apple',     c: '#A8CC5A', x: 28, y: 96, s: 30, o: 0.4 },
    { kind: 'butterfly', c: '#B48CE0', x: 72, y: 95, s: 32, o: 0.4 },
    { kind: 'flower',    c: '#F6C45A', x: 93, y: 93, s: 34, o: 0.45 },
  ],
};
// Yam-yashil o'tloq (naqsh-hayvonlar, rang o'zgartirish)
const MEADOW_THEME = {
  bg: 'linear-gradient(180deg, #CDEFFF 0%, #E3F6E3 55%, #BCE49C 100%)',
  decor: [
    { kind: 'sun',       c: '#FFD34D', x: 8,  y: 10, s: 66, o: 0.5 },
    { kind: 'cloud',     c: '#FFFFFF', x: 32, y: 6,  s: 62, o: 0.7 },
    { kind: 'butterfly', c: '#F2A9C4', x: 55, y: 10, s: 30, o: 0.45 },
    { kind: 'cloud',     c: '#FFFFFF', x: 78, y: 9,  s: 68, o: 0.65 },
    { kind: 'tree',      c: '#43A047', x: 4,  y: 52, s: 44, o: 0.4 },
    { kind: 'tree',      c: '#43A047', x: 96, y: 50, s: 40, o: 0.4 },
    { kind: 'flower',    c: '#F2A9C4', x: 7,  y: 92, s: 34, o: 0.5 },
    { kind: 'flower',    c: '#FF5A4E', x: 30, y: 96, s: 28, o: 0.45 },
    { kind: 'flower',    c: '#F6C45A', x: 70, y: 95, s: 30, o: 0.45 },
    { kind: 'flower',    c: '#B48CE0', x: 93, y: 92, s: 34, o: 0.5 },
  ],
};
// Rang-barang shakllar (naqsh-shakl, naqsh-rang, ortiqchasini top)
const SHAPES_THEME = {
  bg: 'linear-gradient(180deg, #F3EFFF 0%, #FFF3F8 55%, #E8F4FF 100%)',
  decor: [
    { kind: 'star5',  c: '#FFD34D', x: 7,  y: 10, s: 40, o: 0.45 },
    { kind: 'dot',    c: '#5AC8FA', x: 28, y: 6,  s: 30, o: 0.4 },
    { kind: 'heart',  c: '#FF8FB3', x: 52, y: 9,  s: 34, o: 0.45 },
    { kind: 'square', c: '#43C465', x: 76, y: 7,  s: 28, o: 0.4 },
    { kind: 'star5',  c: '#B48CE0', x: 94, y: 13, s: 32, o: 0.45 },
    { kind: 'dot',    c: '#FFB03A', x: 4,  y: 54, s: 26, o: 0.35 },
    { kind: 'heart',  c: '#8E5AE8', x: 96, y: 52, s: 28, o: 0.35 },
    { kind: 'square', c: '#5AC8FA', x: 7,  y: 93, s: 30, o: 0.4 },
    { kind: 'star5',  c: '#FF8FB3', x: 30, y: 96, s: 26, o: 0.4 },
    { kind: 'dot',    c: '#43C465', x: 72, y: 95, s: 28, o: 0.4 },
    { kind: 'heart',  c: '#FFB03A', x: 93, y: 92, s: 30, o: 0.4 },
  ],
};
// Kechki osmon (sehrli fonar sahifasi)
const NIGHT_THEME = {
  bg: 'linear-gradient(180deg, #46549E 0%, #39468C 55%, #2C3878 100%)',
  decor: [
    { kind: 'moon',  c: '#FFE9A8', x: 8,  y: 12, s: 56, o: 0.55 },
    { kind: 'star5', c: '#FFD34D', x: 30, y: 7,  s: 26, o: 0.5 },
    { kind: 'cloud', c: '#8FA3D8', x: 55, y: 9,  s: 54, o: 0.4 },
    { kind: 'star5', c: '#FFF3C4', x: 78, y: 8,  s: 22, o: 0.5 },
    { kind: 'star5', c: '#FFD34D', x: 94, y: 14, s: 28, o: 0.5 },
    { kind: 'star5', c: '#FFF3C4', x: 4,  y: 54, s: 20, o: 0.4 },
    { kind: 'star5', c: '#FFD34D', x: 96, y: 52, s: 20, o: 0.4 },
    { kind: 'star5', c: '#FFF3C4', x: 8,  y: 93, s: 22, o: 0.4 },
    { kind: 'cloud', c: '#8FA3D8', x: 30, y: 96, s: 44, o: 0.35 },
    { kind: 'cloud', c: '#8FA3D8', x: 72, y: 95, s: 48, o: 0.35 },
    { kind: 'star5', c: '#FFD34D', x: 93, y: 92, s: 24, o: 0.4 },
  ],
};
// Kosmos (farq-top kosmos sahifasi)
const SPACE_THEME = {
  bg: 'linear-gradient(180deg, #4A3F96 0%, #3A3480 55%, #2A2460 100%)',
  decor: [
    { kind: 'star5',       c: '#FFD34D', x: 6,  y: 10, s: 28, o: 0.5 },
    { kind: 'planet',      c: '#3CE0C8', x: 28, y: 7,  s: 44, o: 0.45 },
    { kind: 'star5',       c: '#FFF3C4', x: 52, y: 10, s: 22, o: 0.5 },
    { kind: 'moon',        c: '#FFE9A8', x: 76, y: 8,  s: 40, o: 0.5 },
    { kind: 'star5',       c: '#FFD34D', x: 94, y: 14, s: 26, o: 0.5 },
    { kind: 'star5',       c: '#FFF3C4', x: 4,  y: 54, s: 18, o: 0.4 },
    { kind: 'star5',       c: '#FFD34D', x: 96, y: 52, s: 18, o: 0.4 },
    { kind: 'rocket',      c: '#FF5A4E', x: 8,  y: 92, s: 40, o: 0.45 },
    { kind: 'star5',       c: '#FFF3C4', x: 30, y: 96, s: 20, o: 0.4 },
    { kind: 'planetPlain', c: '',        x: 72, y: 95, s: 36, o: 0.4 },
    { kind: 'star5',       c: '#FFD34D', x: 93, y: 91, s: 24, o: 0.45 },
  ],
};
// Shirinliklar (sanoq-shirinlik sahifasi)
const CANDY_THEME = {
  bg: 'linear-gradient(180deg, #FFEFF5 0%, #FFF6E8 55%, #FFE3EC 100%)',
  decor: [
    { kind: 'candy',    c: '#FF5A8A', x: 7,  y: 10, s: 40, o: 0.45 },
    { kind: 'cloud',    c: '#FFFFFF', x: 30, y: 6,  s: 56, o: 0.6 },
    { kind: 'icecream', c: '#F2A9C4', x: 54, y: 9,  s: 36, o: 0.4 },
    { kind: 'cloud',    c: '#FFFFFF', x: 77, y: 9,  s: 60, o: 0.55 },
    { kind: 'candy',    c: '#B48CE0', x: 95, y: 14, s: 34, o: 0.4 },
    { kind: 'heart',    c: '#FF8FB3', x: 4,  y: 54, s: 26, o: 0.35 },
    { kind: 'heart',    c: '#FFB03A', x: 96, y: 52, s: 26, o: 0.35 },
    { kind: 'cookie',   c: '#D9A25F', x: 7,  y: 93, s: 34, o: 0.45 },
    { kind: 'candy',    c: '#43C465', x: 30, y: 96, s: 28, o: 0.4 },
    { kind: 'icecream', c: '#F2A9C4', x: 72, y: 95, s: 32, o: 0.4 },
    { kind: 'cookie',   c: '#D9A25F', x: 93, y: 92, s: 32, o: 0.45 },
  ],
};
// O'yin xonasi (saralash-o'yinchoq, farq-top o'yinchoq, berkinmachoq, polka)
const TOYS_THEME = {
  bg: 'linear-gradient(180deg, #FFF3DA 0%, #FFE9C6 55%, #F7D9AE 100%)',
  decor: [
    { kind: 'balloon', c: '#FF8FB3', x: 6,  y: 12, s: 56, o: 0.5 },
    { kind: 'star5',   c: '#F6C45A', x: 26, y: 7,  s: 30, o: 0.45 },
    { kind: 'star5',   c: '#B48CE0', x: 52, y: 9,  s: 26, o: 0.4 },
    { kind: 'balloon', c: '#5AC8FA', x: 75, y: 10, s: 48, o: 0.45 },
    { kind: 'star5',   c: '#FF8FB3', x: 94, y: 14, s: 28, o: 0.45 },
    { kind: 'cube',    c: '#43C465', x: 4,  y: 55, s: 34, o: 0.4 },
    { kind: 'ball',    c: '#FF5A4E', x: 96, y: 52, s: 34, o: 0.4 },
    { kind: 'cube',    c: '#FFB03A', x: 7,  y: 92, s: 36, o: 0.45 },
    { kind: 'pyramid', c: '#43C465', x: 28, y: 95, s: 34, o: 0.4 },
    { kind: 'ball',    c: '#4A90E2', x: 72, y: 95, s: 32, o: 0.4 },
    { kind: 'gift',    c: '#B06BFF', x: 93, y: 92, s: 36, o: 0.45 },
  ],
};

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
// FORMAT 3 — SOYA TOPISH: rangli qahramon + 3 soya. Sahna QAT'IY:
// cfg.fixed = { hero, options } — qahramon va soyalar tartibi hech
// qachon o'zgarmaydi (barcha bolalar uchun bir xil o'yin).
// ============================================================
const ShadowGamePage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const [shaking, shake] = useShake();
  const heroE = cfg.fixed.hero;
  const order = cfg.fixed.options.map((e) => ({ id: e, e, correct: e === cfg.fixed.hero }));

  const pick = (item, el) => {
    if (solved) return;
    if (item.correct) {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      shake();
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d1-shadow-card themed ll ${shaking ? 'd1-shake' : ''}`}>
        <LLJungleBg/>
        <div className="d1-shadow-hero">
          <LLCritter kind={heroE}/>
        </div>
        <div className="d1-shadow-row">
          {order.map((item) => {
            const hit = solved && item.correct;
            return (
              <button key={item.id} type="button" className={`d1-sil ${hit ? 'ok' : ''}`} disabled={solved}
                onClick={(e) => pick(item, e.currentTarget)} aria-label="Soya varianti">
                <LLCritter kind={item.e} sil/>
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

// ============================================================
// 2-SAHIFA (yangi dizayn) — O'TLOQDAGI QUYON:
//  · fon: dumaloq yashil o'tloq taxtasi, burchaklarda yumshoq barglar,
//    tepadan iliq yorug'lik; ramka tashqarisi sariq→ko'k gradient (d1-root);
//  · markazda yarim-realistik quyon (kulrang-jigarrang jun, pushti quloq
//    ichi, yiltiroq ko'z, mo'ylov, oppoq paxmoq dum, tabiiy o'tirish);
//  · pastda yashil ramkali OQ kartalar ichida yassi QORA soyalar:
//    mushuk, xo'roz, quyon; kartalar orqasida xira slot konturlari.
// Mexanika o'zgarmagan: to'g'ri → konfetti + yulduz; xato → silkinish.
// ============================================================

// O'tloq foni — yumshoq yashil gradient, do'ngliklar, burchak barglari,
// mayda gullar va o't tutamlari (bosib bo'lmaydi, .d1-theme qatlami)
const MeadowBg = () => (
  <div className="d1-theme d1-meadow-bg" aria-hidden="true">
    <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="d1mdSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DFF3C2"/>
          <stop offset="0.5" stopColor="#B7E18C"/>
          <stop offset="1" stopColor="#8FCB61"/>
        </linearGradient>
      </defs>
      <rect width="1000" height="620" fill="url(#d1mdSky)"/>
      {/* tepadan tushayotgan iliq yorug'lik */}
      <ellipse cx="500" cy="40" rx="460" ry="170" fill="#FFF6D9" opacity="0.4"/>
      <ellipse cx="500" cy="10" rx="300" ry="110" fill="#FFFDF2" opacity="0.35"/>
      {/* orqa do'ngliklar */}
      <path d="M-20 470 Q180 400 420 455 Q700 510 1020 440 L1020 640 L-20 640 Z" fill="#9ED573" opacity="0.85"/>
      <path d="M-20 530 Q260 470 520 520 Q780 565 1020 515 L1020 640 L-20 640 Z" fill="#82C155"/>
      {/* yumshoq oq bulutchalar — o'ng-chapga ohista suzadi */}
      <g className="d1-md-cloud" fill="#FFFFFF" opacity="0.85">
        <ellipse cx="290" cy="92" rx="62" ry="20"/>
        <circle cx="262" cy="80" r="21"/><circle cx="300" cy="72" r="26"/><circle cx="334" cy="82" r="18"/>
      </g>
      <g className="d1-md-cloud slow" fill="#FFFFFF" opacity="0.85">
        <ellipse cx="742" cy="118" rx="52" ry="17"/>
        <circle cx="720" cy="108" r="17"/><circle cx="752" cy="100" r="21"/><circle cx="778" cy="110" r="14"/>
      </g>
      {/* CHAP mevali daraxt — o'tloq chetida */}
      <g>
        <ellipse cx="132" cy="466" rx="58" ry="10" fill="rgba(47, 84, 28, 0.18)"/>
        <rect x="119" y="372" width="26" height="92" rx="12" fill="#8F5A2E"/>
        <path d="M132 392 q-16 -18 -34 -22" stroke="#8F5A2E" strokeWidth="10" fill="none" strokeLinecap="round"/>
        <circle cx="132" cy="316" r="58" fill="#4E9C48"/>
        <circle cx="92" cy="344" r="38" fill="#43A047"/>
        <circle cx="172" cy="344" r="38" fill="#43A047"/>
        <circle cx="112" cy="296" r="10" fill="#A8D96A" opacity="0.75"/>
        <circle cx="154" cy="326" r="7" fill="#A8D96A" opacity="0.65"/>
        <circle cx="104" cy="334" r="8" fill="#FF5A4E"/>
        <circle cx="150" cy="304" r="8" fill="#FF5A4E"/>
        <circle cx="132" cy="352" r="8" fill="#FF5A4E"/>
      </g>
      {/* O'NG mevali daraxt */}
      <g>
        <ellipse cx="868" cy="466" rx="58" ry="10" fill="rgba(47, 84, 28, 0.18)"/>
        <rect x="855" y="372" width="26" height="92" rx="12" fill="#8F5A2E"/>
        <path d="M868 392 q16 -18 34 -22" stroke="#8F5A2E" strokeWidth="10" fill="none" strokeLinecap="round"/>
        <circle cx="868" cy="316" r="58" fill="#4E9C48"/>
        <circle cx="828" cy="344" r="38" fill="#43A047"/>
        <circle cx="908" cy="344" r="38" fill="#43A047"/>
        <circle cx="888" cy="296" r="10" fill="#A8D96A" opacity="0.75"/>
        <circle cx="846" cy="326" r="7" fill="#A8D96A" opacity="0.65"/>
        <circle cx="896" cy="334" r="8" fill="#FF5A4E"/>
        <circle cx="850" cy="304" r="8" fill="#FF5A4E"/>
        <circle cx="868" cy="352" r="8" fill="#FF5A4E"/>
      </g>
      {/* butalar — do'ngliklar ustida */}
      <g fill="#6FB247">
        <ellipse cx="262" cy="472" rx="44" ry="20"/>
        <ellipse cx="300" cy="466" rx="30" ry="15"/>
        <ellipse cx="742" cy="478" rx="40" ry="18"/>
        <ellipse cx="706" cy="472" rx="26" ry="13"/>
      </g>
      {/* kapalaklar — sokin suzib, qanot qoqib turadi */}
      <g transform="translate(330 205) rotate(-14)">
        <g className="d1-md-btf">
          <ellipse className="d1-btf-wl" cx="-8" cy="0" rx="10" ry="14" fill="#F2A9C4"/>
          <ellipse className="d1-btf-wr" cx="8" cy="0" rx="10" ry="14" fill="#B48CE0"/>
          <rect x="-2.5" y="-11" width="5" height="22" rx="2.5" fill="#5C4033"/>
        </g>
      </g>
      <g transform="translate(688 180) rotate(12)">
        <g className="d1-md-btf b2">
          <ellipse className="d1-btf-wl" cx="-7" cy="0" rx="9" ry="12" fill="#FFD34D"/>
          <ellipse className="d1-btf-wr" cx="7" cy="0" rx="9" ry="12" fill="#F2A9C4"/>
          <rect x="-2" y="-9" width="4" height="18" rx="2" fill="#5C4033"/>
        </g>
      </g>
      {/* pastki burchak barglari (tepadagi katta barglar olib tashlangan) */}
      <g fill="#6FB247" opacity="0.55">
        <path d="M-30 640 Q40 500 170 540 Q90 630 -30 640 Z"/>
        <path d="M1030 640 Q960 500 830 540 Q910 630 1030 640 Z"/>
      </g>
      <g stroke="#5E9C3A" strokeWidth="5" fill="none" opacity="0.4" strokeLinecap="round">
        <path d="M30 615 Q80 560 140 545"/>
        <path d="M970 615 Q920 560 860 545"/>
      </g>
      {/* o't tutamlari */}
      <g stroke="#5E9C3A" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M150 585 q-4 -18 2 -30 M162 585 q2 -16 12 -24 M140 585 q-10 -12 -18 -16"/>
        <path d="M846 590 q-4 -18 2 -30 M858 590 q2 -16 12 -24 M836 590 q-10 -12 -18 -16"/>
        <path d="M505 600 q-4 -14 2 -24 M516 600 q3 -12 10 -18"/>
      </g>
      {/* mayda gullar */}
      <g>
        <circle cx="230" cy="560" r="9" fill="#FFFFFF" opacity="0.9"/><circle cx="230" cy="560" r="4" fill="#FFD34D"/>
        <circle cx="775" cy="555" r="9" fill="#FFFFFF" opacity="0.9"/><circle cx="775" cy="555" r="4" fill="#FFD34D"/>
        <circle cx="90" cy="480" r="7" fill="#FFFFFF" opacity="0.75"/><circle cx="90" cy="480" r="3" fill="#FFD34D"/>
        <circle cx="915" cy="475" r="7" fill="#FFFFFF" opacity="0.75"/><circle cx="915" cy="475" r="3" fill="#FFD34D"/>
        <circle cx="400" cy="590" r="8" fill="#FFFFFF" opacity="0.85"/><circle cx="400" cy="590" r="3.5" fill="#F2A9C4"/>
        <circle cx="618" cy="575" r="8" fill="#FFFFFF" opacity="0.85"/><circle cx="618" cy="575" r="3.5" fill="#FFD34D"/>
      </g>
    </svg>
  </div>
);

// ============================================================
// ODDIY MAVZULI FONLAR (3-5-sahifalar) — manzarasiz, yengil:
// yumshoq gradient + burchaklarda shaffof doiralar + sahifa mavzusiga
// ishora qiluvchi juda och suvbelgi va siyrak bezaklar.
// Diqqatni tortmaydi — o'yin kartalari yaqqol ajralib turadi.
// ============================================================

// 3-sahifa ("Xuddi shundayini top") foni — darsning TABIIY ThemeBg
// tizimida: sahifaning O'Z o'yin narsalari (olma, yulduz, shar, mashina,
// uzum, apelsin) chetlarda och siluet bo'lib turadi. Markaz bo'sh.
const SAME_THEME = {
  bg: 'linear-gradient(180deg, #EAF9E1 0%, #D9F2CB 55%, #C4E8AD 100%)',
  decor: [
    { kind: 'star5',   c: '#FFD34D', x: 7,  y: 12, s: 46, o: 0.4 },
    { kind: 'apple',   c: '#FF5A4E', x: 27, y: 7,  s: 38, o: 0.35 },
    { kind: 'balloon', c: '#5AC8FA', x: 52, y: 9,  s: 42, o: 0.35 },
    { kind: 'orange',  c: '#FFB03A', x: 76, y: 7,  s: 36, o: 0.35 },
    { kind: 'star5',   c: '#B48CE0', x: 94, y: 13, s: 40, o: 0.4 },
    { kind: 'grape',   c: '#8E5AE8', x: 5,  y: 52, s: 38, o: 0.3 },
    { kind: 'car',     c: '#F5C518', x: 95, y: 52, s: 44, o: 0.3 },
    { kind: 'apple',   c: '#A8CC5A', x: 7,  y: 90, s: 36, o: 0.35 },
    { kind: 'banana',  c: '#FFD34D', x: 28, y: 95, s: 38, o: 0.35 },
    { kind: 'balloon', c: '#FF8FB3', x: 72, y: 94, s: 40, o: 0.35 },
    { kind: 'star5',   c: '#43C465', x: 92, y: 91, s: 38, o: 0.4 },
  ],
};

// 4-sahifa (meva saralash) foni — ThemeBg tizimida: sahifaning O'Z
// mevalari (uzum, apelsin, olma + boshqa mevalar) chetlarda och siluet,
// iliq sariq-krem gradient. Markaz bo'sh — qutilar va drag'ga xalaqit yo'q.
const SORT_FRUITS_THEME = {
  bg: 'linear-gradient(180deg, #FFF6D9 0%, #FBEFC6 55%, #F5E2AC 100%)',
  decor: [
    { kind: 'apple',  c: '#FF5A4E', x: 7,  y: 12, s: 42, o: 0.4 },
    { kind: 'grape',  c: '#8E5AE8', x: 27, y: 7,  s: 40, o: 0.35 },
    { kind: 'orange', c: '#FFB03A', x: 52, y: 9,  s: 40, o: 0.35 },
    { kind: 'pear',   c: '#A8CC5A', x: 76, y: 7,  s: 38, o: 0.35 },
    { kind: 'apple',  c: '#A8CC5A', x: 94, y: 13, s: 40, o: 0.4 },
    { kind: 'banana', c: '#FFD34D', x: 5,  y: 52, s: 40, o: 0.3 },
    { kind: 'orange', c: '#FFB03A', x: 95, y: 52, s: 38, o: 0.3 },
    { kind: 'grape',  c: '#8E5AE8', x: 7,  y: 90, s: 38, o: 0.35 },
    { kind: 'apple',  c: '#FF5A4E', x: 28, y: 95, s: 36, o: 0.35 },
    { kind: 'pear',   c: '#A8CC5A', x: 72, y: 94, s: 38, o: 0.35 },
    { kind: 'banana', c: '#FFD34D', x: 92, y: 91, s: 40, o: 0.4 },
  ],
};

// 5-sahifa (o'yinchoq saralash) foni — sahifaning O'Z shakllari
// (yulduz, kvadrat, doira + koptok, shar) chetlarda; och moviy gradient
const SORT_TOYS_THEME = {
  bg: 'linear-gradient(180deg, #E4F1FF 0%, #EDF0FF 55%, #DDE9FA 100%)',
  decor: [
    { kind: 'star5',   c: '#FFD34D', x: 7,  y: 12, s: 44, o: 0.4 },
    { kind: 'dot',     c: '#4A90E2', x: 27, y: 7,  s: 34, o: 0.35 },
    { kind: 'square',  c: '#FF5A4E', x: 52, y: 9,  s: 36, o: 0.35 },
    { kind: 'balloon', c: '#FF8FB3', x: 76, y: 8,  s: 42, o: 0.35 },
    { kind: 'star5',   c: '#B48CE0', x: 94, y: 13, s: 40, o: 0.4 },
    { kind: 'ball',    c: '#43C465', x: 5,  y: 52, s: 38, o: 0.3 },
    { kind: 'square',  c: '#5AC8FA', x: 95, y: 52, s: 34, o: 0.3 },
    { kind: 'dot',     c: '#FFB03A', x: 7,  y: 90, s: 34, o: 0.35 },
    { kind: 'star5',   c: '#43C465', x: 28, y: 95, s: 36, o: 0.35 },
    { kind: 'ball',    c: '#FF5A4E', x: 72, y: 94, s: 36, o: 0.35 },
    { kind: 'square',  c: '#FFD34D', x: 92, y: 91, s: 36, o: 0.4 },
  ],
};

// 6-sahifa (ketma-ketlik: kuchukcha-jo'ja) foni — och osmon-yashil,
// hayvonchalar yashaydigan muhit: quyosh, bulut, daraxt, gul, kapalak
const SEQ_ANIM_THEME = {
  bg: 'linear-gradient(180deg, #D8F1FF 0%, #E8F7E4 55%, #CFEDBD 100%)',
  decor: [
    { kind: 'sun',       c: '#FFD34D', x: 7,  y: 12, s: 52, o: 0.45 },
    { kind: 'cloud',     c: '#FFFFFF', x: 30, y: 7,  s: 52, o: 0.6 },
    { kind: 'butterfly', c: '#F2A9C4', x: 55, y: 10, s: 30, o: 0.4 },
    { kind: 'cloud',     c: '#FFFFFF', x: 78, y: 8,  s: 56, o: 0.55 },
    { kind: 'tree',      c: '#43A047', x: 95, y: 15, s: 40, o: 0.35 },
    { kind: 'tree',      c: '#43A047', x: 4,  y: 52, s: 42, o: 0.35 },
    { kind: 'butterfly', c: '#B48CE0', x: 96, y: 54, s: 28, o: 0.35 },
    { kind: 'flower',    c: '#F2A9C4', x: 7,  y: 91, s: 34, o: 0.4 },
    { kind: 'flower',    c: '#FF5A4E', x: 30, y: 95, s: 30, o: 0.35 },
    { kind: 'flower',    c: '#F6C45A', x: 71, y: 94, s: 30, o: 0.35 },
    { kind: 'flower',    c: '#B06BFF', x: 93, y: 91, s: 32, o: 0.4 },
  ],
};

// 7-sahifa (ketma-ketlik: doira-kvadrat) foni — sahifaning O'Z shakllari
// (qizil doira, ko'k kvadrat) chetlarda; och binafsha-pushti gradient
const SEQ_SHAPES_THEME = {
  bg: 'linear-gradient(180deg, #F3EFFF 0%, #FDF1F7 55%, #ECE4FA 100%)',
  decor: [
    { kind: 'dot',    c: '#FF5A4E', x: 7,  y: 12, s: 36, o: 0.4 },
    { kind: 'square', c: '#4A90E2', x: 27, y: 7,  s: 36, o: 0.35 },
    { kind: 'dot',    c: '#FF5A4E', x: 52, y: 9,  s: 30, o: 0.3 },
    { kind: 'square', c: '#4A90E2', x: 76, y: 8,  s: 32, o: 0.35 },
    { kind: 'dot',    c: '#FF5A4E', x: 94, y: 13, s: 34, o: 0.4 },
    { kind: 'square', c: '#4A90E2', x: 5,  y: 52, s: 30, o: 0.28 },
    { kind: 'dot',    c: '#FF5A4E', x: 95, y: 52, s: 30, o: 0.28 },
    { kind: 'square', c: '#4A90E2', x: 7,  y: 90, s: 34, o: 0.35 },
    { kind: 'dot',    c: '#FF5A4E', x: 28, y: 95, s: 30, o: 0.35 },
    { kind: 'square', c: '#4A90E2', x: 72, y: 94, s: 32, o: 0.35 },
    { kind: 'dot',    c: '#FF5A4E', x: 92, y: 91, s: 34, o: 0.4 },
  ],
};

// Yarim-realistik quyon — tabiiy kulrang-jigarrang jun (gradient + jun
// shtrixlari), pushti quloq ichi, yiltiroq qora ko'z, nozik mo'ylovlar,
// paxmoq oq dum, tabiiy o'tirgan holat, ostida kontakt soyasi.
// sil=true — butun figura yaxlit quyuq soya (karta varianti uchun);
// soya konturlari qahramon bilan AYNAN bir xil bo'ladi.
const RealRabbit = ({ sil = false, silColor = LL_SIL }) => {
  const c = (col) => (sil ? silColor : col);
  const B = sil ? silColor : 'url(#d1rbBody)';
  const H = sil ? silColor : 'url(#d1rbHead)';
  return (
    <svg viewBox="0 0 260 240" className="d1-llc" aria-hidden="true">
      {!sil && (
        <defs>
          <linearGradient id="d1rbBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C7B7A2"/>
            <stop offset="0.55" stopColor="#AC9A84"/>
            <stop offset="1" stopColor="#93806B"/>
          </linearGradient>
          <linearGradient id="d1rbHead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#CFC0AB"/>
            <stop offset="1" stopColor="#A5927C"/>
          </linearGradient>
        </defs>
      )}
      {/* kontakt soyasi — o't ustida */}
      {!sil && <ellipse cx="132" cy="222" rx="98" ry="14" fill="rgba(47, 84, 28, 0.16)"/>}
      {!sil && <ellipse cx="132" cy="221" rx="80" ry="11" fill="rgba(47, 84, 28, 0.24)"/>}
      {/* uzoq quloq (orqada, quyuqroq) */}
      <ellipse cx="155" cy="40" rx="11" ry="37" fill={c('#98866F')} transform="rotate(-16 155 40)"/>
      {!sil && <ellipse cx="155" cy="44" rx="5.5" ry="27" fill="#C9A7B2" opacity="0.7" transform="rotate(-16 155 44)"/>}
      {/* paxmoq oq dum */}
      <circle cx="47" cy="170" r="16" fill={c('#F4F0E7')}/>
      {!sil && <circle cx="43" cy="165" r="8" fill="#FFFFFF"/>}
      {/* katta orqa son */}
      <ellipse cx="96" cy="162" rx="62" ry="58" fill={B} transform="rotate(-6 96 162)"/>
      {/* oldinga cho'zilgan orqa panja */}
      <ellipse cx="126" cy="215" rx="36" ry="11" fill={c('#9E8B75')}/>
      {/* gavda-ko'krak */}
      <ellipse cx="152" cy="148" rx="46" ry="58" fill={B} transform="rotate(10 152 148)"/>
      {/* son ustidagi yumshoq quyuq qavat */}
      {!sil && <ellipse cx="88" cy="178" rx="42" ry="34" fill="#8A7863" opacity="0.45"/>}
      {/* krem ko'krak-qorincha */}
      <ellipse cx="164" cy="172" rx="20" ry="28" fill={c('#E9E0CF')}/>
      {/* oldingi oyoqlar + panjalar */}
      <rect x="149" y="178" width="15" height="40" rx="7" fill={c('#A5927C')}/>
      <rect x="176" y="176" width="15" height="42" rx="7" fill={c('#AC9A84')}/>
      <ellipse cx="158" cy="218" rx="13" ry="7.5" fill={c('#B4A28C')}/>
      <ellipse cx="186" cy="217" rx="13" ry="7.5" fill={c('#B4A28C')}/>
      {/* yaqin quloq — ichida pushti */}
      <ellipse cx="187" cy="32" rx="13" ry="41" fill={H} transform="rotate(8 187 32)"/>
      {!sil && <ellipse cx="187" cy="37" rx="7" ry="30" fill="#EFB9C7" transform="rotate(8 187 37)"/>}
      {!sil && <ellipse cx="187" cy="37" rx="3.4" ry="24" fill="#E39DB0" opacity="0.6" transform="rotate(8 187 37)"/>}
      {/* bosh */}
      <ellipse cx="176" cy="86" rx="33" ry="30" fill={H}/>
      {/* tumshuq */}
      <ellipse cx="197" cy="99" rx="15" ry="13" fill={c('#C7B7A2')}/>
      {!sil && <ellipse cx="197" cy="104" rx="10" ry="7" fill="#E9E0CF"/>}
      {!sil && (
        <g>
          {/* jun shtrixlari — son, ko'krak va boshda */}
          <g stroke="#8A7863" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4">
            <path d="M62 140 q4 7 0 13"/><path d="M76 128 q4 7 0 13"/><path d="M92 122 q4 7 0 13"/>
            <path d="M70 168 q4 7 0 13"/><path d="M56 158 q4 6 0 12"/><path d="M86 150 q4 7 0 13"/>
            <path d="M108 138 q4 7 0 13"/><path d="M100 176 q4 6 0 12"/>
            <path d="M160 64 q4 6 0 11"/><path d="M172 58 q4 6 0 11"/>
            <path d="M138 120 q4 6 0 12"/><path d="M146 104 q4 6 0 12"/>
          </g>
          <g stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4">
            <path d="M160 158 q3 6 0 11"/><path d="M167 148 q3 6 0 11"/><path d="M170 186 q3 5 0 10"/>
          </g>
          {/* yumshoq nur — tepadan iliq yorug'lik aksi */}
          <ellipse cx="150" cy="52" rx="92" ry="40" fill="#FFF6D9" opacity="0.16"/>
          {/* ko'z — yiltiroq qora, nur nuqtasi bilan */}
          <circle cx="180" cy="80" r="7.4" fill="#33291F"/>
          <circle cx="183" cy="77" r="2.5" fill="#FFFFFF"/>
          <circle cx="178" cy="83" r="1.1" fill="#FFFFFF" opacity="0.6"/>
          {/* pushti burun + og'iz */}
          <path d="M204 91 q6 -2 9 2 q-1 6 -7 6 q-5 -3 -2 -8 Z" fill="#D89AAC"/>
          <path d="M208 99 q-2 6 -10 6" stroke="#8F7F6A" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          {/* nozik mo'ylovlar */}
          <g stroke="#B9AC97" strokeWidth="1.7" strokeLinecap="round" opacity="0.9">
            <line x1="206" y1="98" x2="236" y2="90"/>
            <line x1="207" y1="102" x2="238" y2="101"/>
            <line x1="205" y1="106" x2="234" y2="112"/>
            <line x1="188" y1="100" x2="166" y2="96"/>
            <line x1="188" y1="104" x2="167" y2="105"/>
          </g>
        </g>
      )}
    </svg>
  );
};

// Kartadagi soyalar. Soya rangi QORA EMAS — o'tloqqa mos yumshoq
// to'q moviy-binafsha (kechki soya tusi). UCHALASI ham bir uslubda:
// haqiqiy hayvon qiyofasi, YONBOSHDAN (quyon soyasi bilan uyg'un) —
// mushuk 4 oyoqli o'tirgan holatda, xo'roz tabiiy 2 oyoqli qush shaklida.
const MEADOW_SIL = '#4E5490';

// O'tirgan mushuk — yonboshdan siluet: katta orqa son, oldingi 2 tik oyoq,
// uchli quloqlar, uzun egilgan dum (haqiqiy mushuk soyasi kabi)
const CatSilArt = ({ color = MEADOW_SIL }) => (
  <svg viewBox="0 0 240 240" className="d1-llc" aria-hidden="true">
    <g fill={color}>
      {/* dum — yerda old tomonga o'ralgan */}
      <path d="M56 214 Q16 212 12 182 Q10 160 30 156 Q24 178 40 190 Q50 198 68 200 Z"/>
      {/* orqa son */}
      <ellipse cx="78" cy="166" rx="52" ry="54"/>
      {/* gavda-ko'krak (oldinga engashgan) */}
      <ellipse cx="128" cy="148" rx="40" ry="50" transform="rotate(10 128 148)"/>
      {/* oldingi tik oyoqlar */}
      <rect x="120" y="150" width="17" height="68" rx="8"/>
      <rect x="147" y="152" width="17" height="66" rx="8"/>
      {/* panjalar */}
      <ellipse cx="102" cy="218" rx="28" ry="8"/>
      <ellipse cx="130" cy="219" rx="13" ry="6.5"/>
      <ellipse cx="157" cy="219" rx="13" ry="6.5"/>
      {/* bosh */}
      <circle cx="158" cy="80" r="34"/>
      {/* uchli quloqlar */}
      <path d="M134 60 L122 20 L158 42 Z"/>
      <path d="M176 46 L198 14 L200 52 Z"/>
      {/* tumshuqcha */}
      <ellipse cx="190" cy="92" rx="13" ry="10"/>
    </g>
  </svg>
);

// Xo'roz — yonboshdan siluet: katta yoy dum patlari, tik bo'yin, tojli
// bosh, tumshuq, soqolcha va 2 ta tabiiy oyoq-panja
const RoosterSilArt = ({ color = MEADOW_SIL }) => (
  <svg viewBox="0 0 240 240" className="d1-llc" aria-hidden="true">
    <g fill={color}>
      {/* dum patlari — orqaga yoyilgan yoy */}
      <path d="M66 130 Q22 92 34 48 Q58 76 80 104 Z"/>
      <path d="M60 146 Q10 128 10 84 Q44 106 72 128 Z"/>
      <path d="M62 162 Q16 166 4 132 Q44 138 68 150 Z"/>
      {/* tana */}
      <ellipse cx="110" cy="158" rx="56" ry="44" transform="rotate(-8 110 158)"/>
      {/* bo'yin-ko'krak */}
      <path d="M118 134 Q128 90 148 64 L176 86 Q168 126 152 156 Z"/>
      {/* bosh */}
      <circle cx="160" cy="64" r="24"/>
      {/* toj */}
      <circle cx="148" cy="38" r="8"/>
      <circle cx="160" cy="32" r="9"/>
      <circle cx="172" cy="38" r="8"/>
      {/* tumshuq */}
      <path d="M182 58 L204 68 L182 78 Z"/>
      {/* soqolcha */}
      <ellipse cx="174" cy="92" rx="8" ry="12"/>
      {/* oyoqlar */}
      <rect x="96" y="196" width="9" height="26" rx="4"/>
      <rect x="122" y="198" width="9" height="24" rx="4"/>
      {/* panjalar */}
      <path d="M86 222 q4 -4 12 -3 l10 1 q4 1 4 4 l0 2 l-26 0 Z"/>
      <path d="M112 224 q4 -4 12 -3 l10 1 q4 1 4 4 l0 1 l-26 0 Z"/>
    </g>
  </svg>
);

const MeadowSil = ({ kind }) => (
  kind === 'rabbit' ? <RealRabbit sil silColor={MEADOW_SIL}/>
    : kind === 'cat' ? <CatSilArt/>
    : <RoosterSilArt/>
);

// 2-sahifa DOIM BIR XIL: qahramon — quyon; soyalar chapdan-o'ngga:
// mushuk, xo'roz, quyon. Aralashtirish YO'Q (barcha bolalar uchun bir xil).
const MEADOW_OPTIONS = [
  { id: 'cat', correct: false },
  { id: 'rooster', correct: false },
  { id: 'rabbit', correct: true },
];

const MeadowShadowPage = ({ onBack, onNext }) => {
  const voice = useVoice(SHADOW_CAT_VOICE);
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const [shaking, shake] = useShake();

  const pick = (item, el) => {
    if (solved) return;
    if (item.correct) {
      setSolved(true);
      sfxDingDing();
      const r = el.getBoundingClientRect();
      onCorrect({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    } else {
      shake();
    }
  };

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className={`d1-shadow-card themed meadow ${shaking ? 'd1-shake' : ''}`}>
        <MeadowBg/>
        <div className="d1-shadow-hero">
          <RealRabbit/>
        </div>
        <div className="d1-shadow-row">
          {MEADOW_OPTIONS.map((item) => {
            const hit = solved && item.correct;
            return (
              <div key={item.id} className="d1-slotwrap">
                <button type="button" className={`d1-sil ${hit ? 'ok' : ''}`} disabled={solved}
                  onClick={(e) => pick(item, e.currentTarget)} aria-label="Soya varianti">
                  <MeadowSil kind={item.id}/>
                  {hit && <ConfettiBurst/>}
                </button>
              </div>
            );
          })}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};
const SHADOW_CFG_BUNNY = {
  voice: "Bu do'stimiz soyasini yo'qotib qo'ydi. Mos soyani topib bosing!",
  // 3-sahifa DOIM BIR XIL: qahramon — shercha; soyalar chapdan-o'ngga:
  // jirafa, shercha, maymun (to'g'ri javob o'rtada)
  fixed: { hero: 'lion', options: ['giraffe', 'lion', 'monkey'] },
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
  // narsalar qatori QAT'IY — konfigda yozilgan tartibda, har doim bir xil
  const items = cfg.items;
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card d1-sort-card ${cfg.theme || cfg.bgc ? 'themed' : ''}`}>
        {/* bgc — to'liq manzarali fon komponenti; bo'lmasa dekor-belgili tema */}
        {cfg.bgc ? <cfg.bgc/> : (cfg.theme && <ThemeBg theme={cfg.theme}/>)}
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
  voice: "Har bir mevani rangiga qarab o'z uychasiga joylashtiring!",
  boxes: [{ color: '#43C465' }, { color: '#8E5AE8' }, { color: '#FFB03A' }],
  // tartib QAT'IY: qutilar bilan to'g'ridan-to'g'ri mos kelmasin deb aralash yozilgan
  items: [
    { id: 'grape',  kind: 'grape',  color: '#8E5AE8' },
    { id: 'orange', kind: 'orange', color: '#FFB03A' },
    { id: 'apple',  kind: 'apple',  color: '#43C465' },
  ],
  // sahifaning o'z mevalaridan yig'ilgan fon
  theme: SORT_FRUITS_THEME,
};
const SORT_CFG_TOYS = {
  voice: "Har bir o'yinchoqni o'z rangidagi qutichaga joylashtiring!",
  boxes: [{ color: '#FF5A4E' }, { color: '#4A90E2' }, { color: '#FFD34D' }],
  // tartib QAT'IY: qutilar bilan to'g'ridan-to'g'ri mos kelmasin deb aralash yozilgan
  items: [
    { id: 'star',     kind: 'star5',    color: '#FFD34D' },
    { id: 'cube',     kind: 'square',   color: '#FF5A4E' },
    { id: 'circle',   kind: 'dot',      color: '#4A90E2' },
  ],
  // sahifaning o'z shakllaridan yig'ilgan fon
  theme: SORT_TOYS_THEME,
};

// ============================================================
// FORMAT 4 — KETMA-KETLIK (6, 7, 18-sahifalar).
// Naqsh qatori + bo'sh punktir uya; pastda variantlar. To'g'risi
// uyaga joylashadi + yulduz + avto-o'tish.
// ============================================================
const SequencePage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // Naqsh QAT'IY: cfg.cycle konfigda yozilganidek takrorlanadi, javob va
  // variantlar tartibi (cfg.options) ham har doim bir xil.
  const { pattern, options } = React.useMemo(() => {
    const cycle = cfg.cycle;
    const ans = cycle[cfg.len % cycle.length];
    return {
      pattern: Array.from({ length: cfg.len }, (_, i) => cycle[i % cycle.length]),
      options: cfg.options.map((o) => ({ ...o, correct: o.kind === ans.kind && o.c === ans.c })),
    };
  }, [cfg]);
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
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
  voice: "Hayvonchalar navbat bilan kelyapti. So'roq o'rnida qaysi hayvoncha turadi? Topib bosing!",
  // QAT'IY naqsh: kuchukcha va jo'ja almashib keladi; javob — kuchukcha.
  // HAYOTIY ko'rinish: yonboshdan, it 4 oyoqli (realDog/realDuck)
  cycle: [{ kind: 'realDog' }, { kind: 'realDuck' }],
  options: [{ kind: 'realDuck' }, { kind: 'realDog' }],
  len: 4,
  // hayvonchalar muhiti: osmon-o'tloq, quyosh, daraxt, gullar
  theme: SEQ_ANIM_THEME,
};
const SEQ_CFG_SHAPES = {
  voice: "Naqshga qarang: shakllar navbat bilan kelyapti. Keyingi shakl qaysi? Topib bosing!",
  // QAT'IY naqsh: qizil doira va ko'k kvadrat; javob — qizil doira
  cycle: [{ kind: 'dot', c: '#FF5A4E' }, { kind: 'square', c: '#4A90E2' }],
  options: [{ kind: 'square', c: '#4A90E2' }, { kind: 'dot', c: '#FF5A4E' }],
  len: 4,
  // sahifaning o'z shakllaridan yig'ilgan fon
  theme: SEQ_SHAPES_THEME,
};
// 18-sahifa foni — mashinachalar mavzusiga mos "shaharcha":
// chetlarda uychalar, daraxtlar, mashinachalar, bulut va quyosh
const SEQ_CARS_THEME = {
  bg: 'linear-gradient(180deg, #E0F1FF 0%, #EDF4F7 55%, #DDE9EF 100%)',
  decor: [
    { kind: 'sun',   c: '#FFD34D', x: 7,  y: 12, s: 48, o: 0.45 },
    { kind: 'cloud', c: '#FFFFFF', x: 28, y: 7,  s: 52, o: 0.65 },
    { kind: 'house', c: '#F2A45E', x: 52, y: 9,  s: 44, o: 0.35 },
    { kind: 'cloud', c: '#FFFFFF', x: 76, y: 8,  s: 56, o: 0.6 },
    { kind: 'tree',  c: '#43A047', x: 94, y: 14, s: 40, o: 0.35 },
    { kind: 'car',   c: '#43C465', x: 5,  y: 52, s: 44, o: 0.3 },
    { kind: 'car',   c: '#B06BFF', x: 95, y: 52, s: 44, o: 0.3 },
    { kind: 'house', c: '#5AC8FA', x: 7,  y: 90, s: 42, o: 0.35 },
    { kind: 'tree',  c: '#43A047', x: 28, y: 95, s: 36, o: 0.35 },
    { kind: 'car',   c: '#FF8FB3', x: 72, y: 94, s: 40, o: 0.35 },
    { kind: 'house', c: '#F6C45A', x: 93, y: 91, s: 40, o: 0.35 },
  ],
};

const SEQ_CFG_COLORS = {
  voice: "Mashinachalar naqshiga qarang. Keyingi mashinacha qaysi rangda? Topib bosing!",
  // QAT'IY naqsh: qizil-sariq-ko'k mashinachalar; javob — ko'k mashinacha
  cycle: [
    { kind: 'car', c: '#FF5A4E' },
    { kind: 'car', c: '#FFD34D' },
    { kind: 'car', c: '#4A90E2' },
  ],
  options: [
    { kind: 'car', c: '#FFD34D' },
    { kind: 'car', c: '#4A90E2' },
    { kind: 'car', c: '#FF5A4E' },
  ],
  len: 5,
  // mashinachalar mavzusiga mos "shaharcha" foni
  theme: SEQ_CARS_THEME,
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
    {/* XONA foni (scene.room): iliq devor + yog'och pol + yashil gilamcha —
        o'yinchoqlar polda turgandek ko'rinadi */}
    {scene.room && (
      <svg className="d1-panel-room" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="100" height="72" fill="#FFF0CE"/>
        <rect x="0" y="70" width="100" height="3" fill="#EDD3A0"/>
        <rect x="0" y="73" width="100" height="27" fill="#F0C27E"/>
        <g stroke="#E0AC60" strokeWidth="0.8">
          <line x1="0" y1="80" x2="100" y2="80"/>
          <line x1="0" y1="87" x2="100" y2="87"/>
          <line x1="0" y1="94" x2="100" y2="94"/>
          <line x1="18" y1="73" x2="18" y2="80"/><line x1="52" y1="73" x2="52" y2="80"/><line x1="84" y1="73" x2="84" y2="80"/>
          <line x1="34" y1="80" x2="34" y2="87"/><line x1="68" y1="80" x2="68" y2="87"/>
          <line x1="10" y1="87" x2="10" y2="94"/><line x1="44" y1="87" x2="44" y2="94"/><line x1="76" y1="87" x2="76" y2="94"/>
          <line x1="26" y1="94" x2="26" y2="100"/><line x1="60" y1="94" x2="60" y2="100"/><line x1="90" y1="94" x2="90" y2="100"/>
        </g>
        <ellipse cx="42" cy="84" rx="27" ry="8.5" fill="#A8D96A"/>
        <ellipse cx="42" cy="84" rx="19" ry="6" fill="#96CC55"/>
      </svg>
    )}
    {scene.objects.map((o, i) => {
      const isDiff = !!o.alt;
      const isFound = found && found.has(i);
      const style = { left: `${o.x}%`, top: `${o.y}%`, width: `${o.s}%`, animationDelay: `${(i % 5) * 0.35}s` };
      // faqat o'ng rasmda alt qo'llanadi; g'oyib bo'lgan ob'ekt chapda ko'rinadi
      const ghost = altered && isDiff && o.alt.ghost;
      const kind = altered && isDiff && o.alt.kind ? o.alt.kind : o.kind;
      const color = altered && isDiff && o.alt.c ? o.alt.c : o.c;
      // rang o'zgargan, lekin tur rang-parametrik emas (masalan, jonivor) —
      // butun rasm rang filtri bilan bo'yaladi
      const tint = altered && isDiff && o.alt.c && !o.alt.kind && !LL_TINTABLE.has(kind)
        ? { filter: tintFilter(o.alt.c) } : null;
      return (
        <button key={i} type="button"
          className={`d1-obj d1-obj-btn ${isFound ? 'd1-hit-ok' : ''} ${ghost && !isFound ? 'd1-ghost' : ''}`}
          style={style}
          disabled={isFound}
          onClick={(e) => onPick(i, e.currentTarget)}
          aria-label={o.kind}>
          {/* g'oyib bo'lgan ob'ekt: topilgach xira ko'rinadi, aks holda ko'rinmas tugma */}
          {ghost ? (isFound && <span style={{ opacity: 0.35, display: 'block', width: '100%', height: '100%' }}><ObjIcon kind={o.kind} c={o.c}/></span>)
                 : <ObjIcon kind={kind} c={color} style={tint}/>}
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

const DiffPage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // sahna QAT'IY: farqlar konfigda `alt` bilan belgilangan, o'zgarmaydi
  const scene = cfg.scene;
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allFound}>
      <div className={`d1-shadow-card d1-diff-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        <div className="d1-pair">
          <DiffPanel scene={scene} altered={false} found={found} shaking={shaking} onPick={pick} label="1"
            lanternMode={cfg.lantern} dark={darkSide === 'left'} onClaimDark={() => setDarkSide('left')}/>
          <div className="d1-vs" aria-hidden="true"><ObjIcon kind="lens"/></div>
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
  voice: "Ikki rasmni solishtiring va uchta farqni topib bosing!",
  // sahna QAT'IY — 3 farq: surat -> lampochka, JIGARRANG ayiqcha OQ
  // (oppoq ayiqcha) bo'lib qolgan, yuqoridagi koptok g'oyib bo'lgan.
  // Ranglar hayotiy: ayiqcha jigarrang — xuddi haqiqiy o'yinchoqdek.
  scene: {
    bg: ['#FFF0CE', '#F0C27E'],
    room: true,
    objects: [
      { kind: 'frame',   x: 28, y: 16, s: 26, c: '#5AC8FA', alt: { kind: 'lamp', c: '#FFD34D' } },
      { kind: 'bowbear', x: 25, y: 60, s: 38, c: '#C98A4B', alt: { c: '#EDE7DC' } },
      { kind: 'pyramid', x: 58, y: 77, s: 28, c: '#43C465' },
      { kind: 'cube',    x: 78, y: 40, s: 23, c: '#4A90E2' },
      { kind: 'cube',    x: 84, y: 75, s: 23, c: '#FF5A4E' },
      { kind: 'ball',    x: 55, y: 37, s: 18, c: '#FF5A4E', alt: { ghost: true } },
    ],
  },
  // o'yinchoqlar sahifasining O'ZIGA MOS foni (o'yin xonasi)
  theme: TOYS_THEME,
};
// ============================================================
// SAHIFA 3 (yangi format) — XUDDI SHUNDAYINI TOP (namunaga qarab).
// Sof diqqat mashqi, o'qish talab qilmaydi, boshqa darslarda YO'Q format:
// tepada oltin ramkali NAMUNA kartochka (2 narsali rasm), pastda 4 ta
// juda o'xshash variant — faqat BITTASI namuna bilan aynan bir xil,
// qolganlarida bitta detal boshqacha (rang yoki narsaning o'zi almashgan).
// 3 raund = 3 yulduz. Xato: butun ekran silkinadi + "hmm".
// Oxirgi raund: markaziy yulduz + salyut + avto-o'tish (umumiy tizim).
// ============================================================
const SAME_VOICE = "Tepadagi namunaga diqqat bilan qarang. Pastdan xuddi shunday kartochkani topib bosing!";
// 3 raund QAT'IY; to'g'ri javob o'rni har raundda boshqa joyda
const SAME_ROUNDS = [
  { // 1-raund: mevalar
    sample: [{ kind: 'apple', c: '#FF5A4E' }, { kind: 'star5', c: '#FFD34D' }],
    options: [
      [{ kind: 'apple', c: '#FF5A4E' }, { kind: 'star5', c: '#5AC8FA' }],
      [{ kind: 'apple', c: '#A8CC5A' }, { kind: 'star5', c: '#FFD34D' }],
      [{ kind: 'apple', c: '#FF5A4E' }, { kind: 'star5', c: '#FFD34D' }],
      [{ kind: 'pear',  c: '#A8CC5A' }, { kind: 'star5', c: '#FFD34D' }],
    ],
    correct: 2,
  },
  { // 2-raund: mashina va havo shari
    sample: [{ kind: 'car', c: '#FF5A4E' }, { kind: 'balloon', c: '#5AC8FA' }],
    options: [
      [{ kind: 'car', c: '#FF5A4E' }, { kind: 'gift',    c: '#5AC8FA' }],
      [{ kind: 'car', c: '#FF5A4E' }, { kind: 'balloon', c: '#5AC8FA' }],
      [{ kind: 'car', c: '#4A90E2' }, { kind: 'balloon', c: '#5AC8FA' }],
      [{ kind: 'car', c: '#FF5A4E' }, { kind: 'balloon', c: '#F2A9C4' }],
    ],
    correct: 1,
  },
  { // 3-raund: mevalar (o'tloq-bog' olamiga mos: uzum va apelsin)
    sample: [{ kind: 'grape', c: '#8E5AE8' }, { kind: 'orange', c: '#FFB03A' }],
    options: [
      [{ kind: 'grape', c: '#8E5AE8' }, { kind: 'orange', c: '#FFB03A' }],
      [{ kind: 'grape', c: '#A8CC5A' }, { kind: 'orange', c: '#FFB03A' }],
      [{ kind: 'grape', c: '#8E5AE8' }, { kind: 'banana', c: '#FFD34D' }],
      [{ kind: 'grape', c: '#8E5AE8' }, { kind: 'orange', c: '#A8CC5A' }],
    ],
    correct: 0,
  },
];

const SamePicturePage = ({ onBack, onNext }) => {
  const voice = useVoice(SAME_VOICE);
  const { onCorrect } = useFlightApi();
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(0);
  const [okIdx, setOkIdx] = useState(null);
  const [shaking, shake] = useShake();          // xatoda butun ekran silkinadi
  const [shakeIdx, setShakeIdx] = useState(null);
  const shakeTimer = useRef(null);
  const nextTimer = useRef(null);
  useEffect(() => () => { clearTimeout(shakeTimer.current); clearTimeout(nextTimer.current); }, []);

  const allDone = done === SAME_ROUNDS.length;
  const r = SAME_ROUNDS[round];

  const pick = (i, el) => {
    if (okIdx !== null || allDone) return;
    if (i === r.correct) {
      setOkIdx(i);
      setDone(d => d + 1);
      sfxDingDing();
      const rect = el.getBoundingClientRect();
      const last = round === SAME_ROUNDS.length - 1;
      onCorrect({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, last);
      if (!last) {
        nextTimer.current = setTimeout(() => { setRound(v => v + 1); setOkIdx(null); }, 1100);
      }
    } else {
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card themed ${shaking ? 'd1-shake' : ''}`}>
        <ThemeBg theme={SAME_THEME}/>
        <div key={round} className="d1-same-wrap fade-up">
          {/* namuna — oltin ramkali kartochka, lupali belgisi bilan */}
          <div className="d1-same-sample">
            <span className="d1-same-lens" aria-hidden="true"><ObjIcon kind="lens"/></span>
            {r.sample.map((it, j) => (
              <span key={j} className="d1-same-ic big"><ObjIcon kind={it.kind} c={it.c}/></span>
            ))}
          </div>
          {/* 4 variant */}
          <div className="d1-same-opts">
            {r.options.map((pair, i) => (
              <button key={i} type="button"
                className={`d1-same-opt ${okIdx === i ? 'ok' : ''} ${shakeIdx === i ? 'd1-shake' : ''}`}
                disabled={okIdx !== null}
                onClick={(e) => pick(i, e.currentTarget)} aria-label={`Variant ${i + 1}`}>
                {pair.map((it, j) => (
                  <span key={j} className="d1-same-ic"><ObjIcon kind={it.kind} c={it.c}/></span>
                ))}
                {okIdx === i && <ConfettiBurst/>}
              </button>
            ))}
          </div>
        </div>
        {/* raundlar progressi */}
        <div className="d1-diff-dots" aria-label={`${done} / ${SAME_ROUNDS.length} raund yakunlandi`}>
          {SAME_ROUNDS.map((_, i) => (
            <span key={i} className={`d1-diff-dot ${i < done ? 'on' : ''}`}>{i < done ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// SAHIFA 9 — SEHRLI FONAR (yengil variant, 6-7 yosh): o'ng rasmda "kech
// kirgan" — yarim shaffof qorong'ilik, rasm xira ko'rinib turadi; barmoq
// yurgizilganda katta fonar nuri ergashib, o'sha joyni yop-yorug' qiladi.
// FARQLAR FAQAT YIRIK VA ANIQ: butunlay boshqa narsaga aylanish yoki
// keskin rang o'zgarishi. Mayda yulduz/bulutlarga farq qo'yilmaydi,
// "g'oyib bo'lish" ham yo'q — 6-7 yosh bola bemalol ko'radi.
const DIFF_CFG_NIGHT = {
  voice: "Voy, qorong'u tushdi! Sehrli fonarni rasm ustida yuriting va to'rtta farqni topib bosing!",
  lantern: true,
  // sahna QAT'IY — 4 farq, hammasi HAYOTIY ranglarda:
  //  uy sariq-qumrangdan OQ uyga, yashil daraxt KUZGI SARIQ daraxtga,
  //  malla mushukcha KULRANG mushukchaga, qo'ziqorin -> gul
  scene: {
    bg: ['#3A4A9C', '#28356F'],
    objects: [
      { kind: 'moon',     x: 14, y: 15, s: 20, c: '#FFE9A8' },
      { kind: 'star5',    x: 42, y: 12, s: 14, c: '#FFD34D' },
      { kind: 'cloud',    x: 82, y: 11, s: 18, c: '#8FA3D8' },
      { kind: 'house',    x: 76, y: 42, s: 30, c: '#F2A45E', alt: { c: '#E8EEF4' } },
      { kind: 'tree',     x: 11, y: 52, s: 30, c: '#2E7D4F', alt: { c: '#E8A63C' } },
      { kind: 'realCat',  x: 32, y: 72, s: 26, c: '#F2A45E', alt: { c: '#A8A8A8' } },
      { kind: 'mushroom', x: 56, y: 82, s: 20, c: '#FF5A4E', alt: { kind: 'flower' } },
      { kind: 'rabbit',   x: 89, y: 76, s: 20, c: '#EDE7DC' },
    ],
  },
  // sahifaning o'z mavzusiga mos fon
  theme: NIGHT_THEME,
};
// SAHIFA 16 — KOSMOS: farqlar faqat YIRIK va ANIQ — narsa butunlay
// boshqa narsaga aylanadi (yulduz -> yurakcha, yulduz -> sayyora...)
// yoki keskin rang oladi. "G'oyib bo'lish" yo'q, mayda farqlar yo'q.
const DIFF_CFG_SPACE = {
  voice: "Kosmosdamiz! Ikki rasmdagi to'rtta farqni topib bosing!",
  // sahna QAT'IY — 4 farq: chap yulduz -> sayyora, halqali sayyora pushti
  // rangga, raketa yashil rangga, o'rta yulduz -> yurakcha
  scene: {
    bg: ['#3A3480', '#241F52'],
    objects: [
      { kind: 'star5',  x: 12, y: 18, s: 16, c: '#FFD34D', alt: { kind: 'planetPlain' } },
      { kind: 'moon',   x: 50, y: 12, s: 18, c: '#FFE9A8' },
      { kind: 'star5',  x: 86, y: 14, s: 13, c: '#FFF3C4' },
      { kind: 'planet', x: 78, y: 38, s: 30, c: '#3CE0C8', alt: { c: '#FF8FB3' } },
      { kind: 'rocket', x: 28, y: 52, s: 34, c: '#FF5A4E', alt: { c: '#43C465' } },
      { kind: 'star5',  x: 55, y: 42, s: 15, c: '#FFD34D', alt: { kind: 'comet' } },
      { kind: 'planet', x: 14, y: 80, s: 26, c: '#B06BFF' },
      { kind: 'moon',   x: 88, y: 74, s: 22, c: '#FFE9A8' },
      { kind: 'star5',  x: 60, y: 84, s: 15, c: '#FFD34D' },
    ],
  },
  // sahifaning o'z mavzusiga mos fon
  theme: SPACE_THEME,
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
const ODDOUT_VOICE = "Bittasi bu yerga to'g'ri kelmaydi. Ortiqchasini topib bosing!";
// 4 ekran QAT'IY — tarkib va tartib hech qachon o'zgarmaydi:
//  1) mevalar orasida koptok  2) jonivorlar orasida mashina
//  3) ko'k shakllar orasida sariq yurak  4) katta ayiqlar orasida kichkinasi
const buildOddRounds = () => [
  { items: [
    { kind: 'apple',  c: '#FF5A4E' },
    { kind: 'banana', c: '#FFD34D' },
    { kind: 'ball',   c: '#FF5A4E', odd: true },
    { kind: 'pear',   c: '#A8CC5A' },
  ] },
  { items: [
    { kind: 'realCat' },
    { kind: 'realRabbit' },
    { kind: 'car', c: '#F5C518', odd: true },
    { kind: 'realDog' },
  ] },
  { items: [
    { kind: 'dot',    c: '#4A90E2' },
    { kind: 'heart',  c: '#FFB03A', odd: true },
    { kind: 'square', c: '#4A90E2' },
    { kind: 'heart',  c: '#4A90E2' },
  ] },
  { items: [
    { kind: 'bear', c: '#C98A4B' },
    { kind: 'bear', c: '#C98A4B', small: true, odd: true },
    { kind: 'bear', c: '#C98A4B' },
    { kind: 'bear', c: '#C98A4B' },
  ] },
];
// sahifaning O'Z narsalaridan yig'ilgan fon (mevalar, o'yinchoqlar,
// shakllar — o'yin raundlaridagi narsalarning och siluetlari)
const ODDOUT_THEME = {
  bg: 'linear-gradient(180deg, #FFF0E0 0%, #FFEAEE 55%, #F3E8FA 100%)',
  decor: [
    { kind: 'apple',  c: '#FF5A4E', x: 7,  y: 12, s: 40, o: 0.4 },
    { kind: 'star5',  c: '#FFD34D', x: 27, y: 7,  s: 38, o: 0.35 },
    { kind: 'ball',   c: '#4A90E2', x: 52, y: 9,  s: 36, o: 0.35 },
    { kind: 'banana', c: '#FFD34D', x: 76, y: 8,  s: 40, o: 0.35 },
    { kind: 'heart',  c: '#FF8FB3', x: 94, y: 13, s: 36, o: 0.4 },
    { kind: 'pear',   c: '#A8CC5A', x: 5,  y: 52, s: 36, o: 0.3 },
    { kind: 'dot',    c: '#43C465', x: 95, y: 52, s: 30, o: 0.3 },
    { kind: 'square', c: '#5AC8FA', x: 7,  y: 90, s: 34, o: 0.35 },
    { kind: 'ball',   c: '#FF5A4E', x: 28, y: 95, s: 34, o: 0.35 },
    { kind: 'apple',  c: '#A8CC5A', x: 72, y: 94, s: 36, o: 0.35 },
    { kind: 'star5',  c: '#B48CE0', x: 92, y: 91, s: 36, o: 0.4 },
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
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
const CC_VOICE = "Do'stlarni yaxshilab yodlab oling!";
const CC_QUESTION = "Qaysi biri o'zgarib qoldi? Topib bosing!";
// 4 do'st — TO'LIQ tanali LL jonivorlar (SVG); SIR QAT'IY va HAYOTIY:
// har doim och kulrang QUYONCHA QORA quyonchaga aylanadi
// (qora quyonlar hayotda bor — rang haqiqiy, farq esa aniq ko'rinadi)
const CC_ANIMALS = [
  { id: 'rabbit', kind: 'realRabbit' },
  { id: 'cat',    kind: 'realCat' },
  { id: 'dog',    kind: 'realDog' },
  { id: 'cow',    kind: 'realCow' },
];
const CC_SECRET = { id: 'rabbit', kind: 'realRabbit', c: '#3A3A3A' };
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

// sahifaning o'z mavzusiga mos fon
const CC_THEME = MEADOW_THEME;

// Lampochka-taymer: yonganda sariq nur taratadi, o'chganda kulranglashadi
const BulbIcon = ({ on }) => <ObjIcon kind="lamp" style={on ? null : { filter: 'grayscale(1) opacity(0.6)' }}/>;

const ColorChangePage = ({ onBack, onNext }) => {
  const voice = useVoice(CC_VOICE);
  const { onCorrect } = useFlightApi();
  // sir QAT'IY: har doim bir xil do'st, bir xil rang
  const secret = CC_SECRET;
  const [lamps, setLamps] = useState(3);          // yonib turgan lampochkalar soni
  const [phase, setPhase] = useState('show');     // show -> quiz
  const [solved, setSolved] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  // sanoq va lampochkalar AYNI paytda: "uch!" — 3 lampochka, "ikki!" — 2, "bir!" — 1
  useMemorizeCountdown({
    voice,
    question: CC_QUESTION,
    onTick: (n) => setLamps(n),
    onDone: () => { setLamps(0); setPhase('quiz'); },
  });
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

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
    <PageShell
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
                  <ObjIcon kind={a.kind} style={changed ? { filter: tintFilter(secret.c) } : null}/>
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
                <ObjIcon kind={a.kind}/>
              </button>
            ))}
          </div>
        )}
        {solved && (
          <div className="d1-seq-opts">
            <span className="d1-seq-opt ok" style={{ position: 'relative' }}>
              <ObjIcon kind={secret.kind} style={{ filter: tintFilter(secret.c) }}/>
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
const MOTIV_VOICE = "Barakalla! Juda chiroyli bajardingiz! Davom etamizmi?";

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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
const MEMORY_VOICE = "Savatdagi mevalarni yaxshilab yodlab oling!";
const MEMORY_QUESTION = "Savatdan nima yo'qoldi? Topib bosing!";
const MEMORY_FRUITS = [
  { id: 'apple',  kind: 'apple',  c: '#FF5A4E' },
  { id: 'banana', kind: 'banana', c: '#FFD34D' },
  { id: 'grape',  kind: 'grape',  c: '#8E5AE8' },
  { id: 'pear',   kind: 'pear',   c: '#A8CC5A' },
];
// sahifaning o'z mavzusiga mos fon
const MEMORY_THEME = FRUITS_THEME;

const MemoryBasketPage = ({ onBack, onNext }) => {
  const voice = useVoice(MEMORY_VOICE);
  const { onCorrect } = useFlightApi();
  // sahna QAT'IY: mevalar tartibi va yo'qoladigan meva (uzum) doim bir xil;
  // savol bosqichida qolgan mevalar boshqa tartibda ko'rsatiladi —
  // bola joyiga qarab emas, eslab topishi kerak
  const fruits = MEMORY_FRUITS;
  const missing = MEMORY_FRUITS[2];                                     // uzum
  const quizFruits = [MEMORY_FRUITS[3], MEMORY_FRUITS[0], MEMORY_FRUITS[1]];
  const [phase, setPhase] = useState('show');     // show -> countdown -> quiz
  const [count, setCount] = useState(null);       // 3,2,1
  const [solved, setSolved] = useState(false);
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  // sanoq va ekran raqami AYNI paytda: "uch!" — 3, "ikki!" — 2, "bir!" — 1
  useMemorizeCountdown({
    voice,
    question: MEMORY_QUESTION,
    onTick: setCount,
    onDone: () => { setCount(null); setPhase('quiz'); },
  });
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

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
    <PageShell
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
const SWAP_VOICE = "O'yinchoqlar tartibini yaxshilab yodlab oling!";
const SWAP_QUESTION = "Qaysi ikkitasi joy almashdi? Topib bosing!";
const SWAP_POOL = [
  { id: 'car',     kind: 'car',     c: '#F5C518' },
  { id: 'cube',    kind: 'cube',    c: '#4A90E2' },
  { id: 'bear',    kind: 'bear',    c: '#C98A5B' },
  { id: 'ball',    kind: 'ball',    c: '#43C465' },
  { id: 'doll',    kind: 'doll',    c: '#E86A8A' },
  { id: 'gift',    kind: 'gift',    c: '#B06BFF' },
  { id: 'balloon', kind: 'balloon', c: '#FF8FB3' },
];
// sahifaning o'z mavzusiga mos fon
const SWAP_THEME = TOYS_THEME;

const SwapShelfPage = ({ onBack, onNext }) => {
  const voice = useVoice(SWAP_VOICE);
  const { onCorrect } = useFlightApi();
  // sahna QAT'IY: 4 o'yinchoq va almashuvchi juftlik doim bir xil —
  // mashina bilan koptok joy almashadi
  const toys = [SWAP_POOL[0], SWAP_POOL[2], SWAP_POOL[3], SWAP_POOL[5]];
  const pair = ['car', 'ball'];
  const [phase, setPhase] = useState('show');
  const [count, setCount] = useState(null);
  const [found, setFound] = useState(() => new Set());
  const [shakeId, setShakeId] = useState(null);
  const shakeTimer = useRef(null);

  // sanoq va ekran raqami AYNI paytda: "uch!" — 3, "ikki!" — 2, "bir!" — 1;
  // savol ekrani savol ovozi bilan birga ochiladi
  useMemorizeCountdown({
    voice,
    question: SWAP_QUESTION,
    onTick: setCount,
    onDone: () => { setCount(null); setPhase('quiz'); },
  });
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

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
    <PageShell
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
// SANOQ KARTASI: toza oq kartada n dona BIR XIL mahsulot — orqa fonda
// hech narsa yo'q, mahsulotlar to'liq ko'rinib turadi va sanash oson.
// O'lcham mahsulot soniga qarab: kam bo'lsa KATTA, 5 ta bo'lsa sig'adigan.
const CountArt = ({ n, kind, c }) => {
  const w = n <= 2 ? '44%' : n <= 4 ? '40%' : '31%';
  return (
    <span className="d1-count-art">
      <span className="d1-count-items">
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} style={{ width: w }}><ObjIcon kind={kind} c={c}/></span>
        ))}
      </span>
    </span>
  );
};

const CountPage = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  // o'yin QAT'IY: kartalar va raqamlar tartibi konfigda yozilganidek
  const { groups, numbers } = cfg;
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className={`d1-shadow-card ${cfg.theme ? 'themed' : ''}`}>
        {cfg.theme && <ThemeBg theme={cfg.theme}/>}
        <div className="d1-count-row">
          {groups.map((g, i) => (
            <div key={i} className={`d1-count-card ${i === active ? 'active' : ''} ${answered[i] ? 'done' : ''}`}>
              <CountArt n={g.n} kind={g.kind} c={g.c}/>
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
  voice: "Nechta meva bor? Sanab, to'g'ri raqamni bosing!",
  // QAT'IY: 3 olma, 2 nok, 4 qo'ziqorin; raqamlar tartibi ham doim shu
  groups: [
    { n: 3, kind: 'apple',    c: '#FF5A4E' },
    { n: 2, kind: 'pear',     c: '#A8CC5A' },
    { n: 4, kind: 'mushroom', c: '#FF5A4E' },
  ],
  numbers: [2, 4, 3],
  // sahifaning o'z mavzusiga mos fon
  theme: FRUITS_THEME,
};
const COUNT_CFG_CANDY = {
  voice: "Nechta shirinlik bor? Sanab, to'g'ri raqamni bosing!",
  // QAT'IY: 4 konfet, 3 muzqaymoq, 5 pechenye; raqamlar tartibi ham doim shu
  groups: [
    { n: 4, kind: 'candy',    c: '#FF5A8A' },
    { n: 3, kind: 'icecream', c: '#F2A9C4' },
    { n: 5, kind: 'cookie',   c: '#D9A25F' },
  ],
  numbers: [3, 5, 4],
  // sahifaning o'z mavzusiga mos fon
  theme: CANDY_THEME,
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
const FISH_VOICE = "Bir xil baliqchalarni topib, juftlarini birlashtiring!";
// 2 qator x 3 ustun slot koordinatalari (% da)
const FISH_SLOTS = [
  { x: 18, y: 27 }, { x: 50, y: 27 }, { x: 82, y: 27 },
  { x: 18, y: 73 }, { x: 50, y: 73 }, { x: 82, y: 73 },
];
// joylashuv QAT'IY: 3 juft baliqcha (chiziqli-to'q sariq, nuqtali-ko'k,
// pushti), juftlari hech qachon yonma-yon boshlanmaydi
const FISH_FIXED = [
  { id: 'f0a', pair: 0, kind: 'fishA' },
  { id: 'f1a', pair: 1, kind: 'fishB' },
  { id: 'f2a', pair: 2, kind: 'fishC' },
  { id: 'f1b', pair: 1, kind: 'fishB' },
  { id: 'f2b', pair: 2, kind: 'fishC' },
  { id: 'f0b', pair: 0, kind: 'fishA' },
];

const FishPairPage = ({ onBack, onNext }) => {
  const voice = useVoice(FISH_VOICE);
  const { onCorrect } = useFlightApi();
  const fishes = FISH_FIXED;
  const [slots] = useState(() => Object.fromEntries(fishes.map((f, i) => [f.id, i])));
  const [sel, setSel] = useState(null);          // birinchi bosilgan baliq
  const [matched, setMatched] = useState({});    // id -> true
  const [exits, setExits] = useState({});        // id -> { x, y, flip } — suzib ketish nishoni
  const [shakeIds, setShakeIds] = useState([]);
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  // SUZISH DVIJOKI (JS): har baliq o'z maromida keng radiusda suzib yuradi.
  // CSS emas, requestAnimationFrame — "reduced motion" sozlamasida ham ishlaydi.
  const btnRefs = useRef({});
  const exitsRef = useRef({});
  useEffect(() => { exitsRef.current = exits; }, [exits]);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const PH = [0, 1.3, 2.6, 3.9, 5.2, 6.5];   // har baliqning o'z fazasi
    // MOBIL (<=600px): suzish radiusi kichraytiriladi — baliqlar tor kartadan
    // chiqib ketmasin; keng ekranlarda (planshet/laptop) amp=1, o'zgarish yo'q
    const amp = (typeof window !== 'undefined' && window.innerWidth <= 600) ? 0.3 : 1;
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      fishes.forEach((f, i) => {
        const el = btnRefs.current[f.id];
        if (!el) return;
        if (exitsRef.current[f.id]) {
          // chiqib ketayotgan baliq — tez dum qoqib "shoshadi"
          el.style.transform = `translate(-50%, -50%) rotate(${(Math.sin(t * 16 + i) * 5).toFixed(2)}deg)`;
        } else {
          const p = PH[i];
          const dx = (Math.sin(t * 0.45 + p) * 46 + Math.sin(t * 0.23 + p * 2) * 26) * amp;
          const dy = (Math.sin(t * 0.6 + p * 1.7) * 18 + Math.cos(t * 0.31 + p) * 10) * amp;
          const rot = Math.sin(t * 0.5 + p) * 6;
          el.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
        }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const allDone = Object.keys(matched).length === 6;

  // juft topildi: ikkalasi IKKI TOMONGA qarab tez suzib chiqib ketadi —
  // chaproqdagisi chapga, o'ngroqdagisi o'ngga (yuzi ketish tomoniga qaraydi)
  const swimAway = (aId, bId) => {
    const ax = FISH_SLOTS[slots[aId]].x;
    const bx = FISH_SLOTS[slots[bId]].x;
    const [leftId, rightId] = ax <= bx ? [aId, bId] : [bId, aId];
    setExits(prev => ({
      ...prev,
      [leftId]:  { x: -24, y: FISH_SLOTS[slots[leftId]].y + 8,  flip: false },
      [rightId]: { x: 124, y: FISH_SLOTS[slots[rightId]].y - 8, flip: true },
    }));
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
      swimAway(sel, f.id);
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className="d1-shadow-card themed d1-fish-card">
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
          {fishes.map((f, i) => {
            const s = FISH_SLOTS[slots[f.id]];
            const ex = exits[f.id];
            const flip = ex ? ex.flip : i % 2 === 1;
            return (
              <button key={f.id} type="button"
                ref={(el) => { btnRefs.current[f.id] = el; }}
                className={`d1-fish ${matched[f.id] ? 'ok' : ''} ${ex ? 'away' : ''} ${sel === f.id ? 'sel' : ''} ${shakeIds.includes(f.id) ? 'd1-shake' : ''}`}
                style={{ left: `${ex ? ex.x : s.x}%`, top: `${ex ? ex.y : s.y}%` }}
                onClick={(e) => pick(f, e.currentTarget)} aria-label="baliqcha">
                {/* har xil tomonga qaragan baliqlar; ketayotganda yuzi yo'nalishga qaraydi */}
                <span className={`d1-fish-inner ${flip ? 'flip' : ''}`}>
                  <ObjIcon kind={f.kind}/>
                </span>
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
// halqa piramida. Ularning orqasida 3 ta sariq o'rdakcha yashiringan,
// lekin BOSHI har doim o'yinchoq tepasidan chiqib ko'rinib turadi
// (6-7 yosh uchun oson topiladi). Tepada 3 ta bo'sh siluet — hisob.
// O'rdakcha bosilsa: yulduz + yashil doira + siluet to'ladi.
// Boshqa joy bosilsa: "hmm" + sahna silkinadi. 3 tasi = sahifa tugadi.
// Har kirganda: 6 ta yashirinish joyidan tasodifiy 3 tasi tanlanadi.
// ============================================================
const DUCK_VOICE = "Uchta o'rdakcha berkinib oldi. Ularni topib bosing!";
// kichkina sariq o'rdakcha; sil=true — kulrang siluet (hisob qatori uchun)
const DuckArt = ({ sil }) => (
  <ObjIcon kind="rubberduck" style={sil ? { filter: 'grayscale(1) opacity(0.55)' } : null}/>
);
// katta ochiq o'yinchoq qutisi
const ToyBoxSVG = () => <ObjIcon kind="box"/>;
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
// z — oldidagi o'yinchoqdan bitta PASTROQ: tanasi o'yinchoq orqasida
// berkinadi, lekin BOSHI har doim o'yinchoq tepasidan chiqib turadi.
// jx/jy — joy ichida tasodifiy siljish chegarasi (%): kichik qilingan,
// shunda o'rdakcha siljisa ham boshi hech qachon butunlay berkinmaydi.
const DUCK_SPOTS = [
  { x: 22, y: 60, w: 11, z: 5, jx: 2,   jy: 1.5 },              // kubiklar orqasidan boshi chiqib turibdi
  { x: 60, y: 37, w: 11, z: 3, jx: 2,   jy: 1.5 },              // qutining orqasidan mo'ralaydi
  { x: 44, y: 78, w: 11, z: 4, jx: 2,   jy: 1.5 },              // mashina orqasidan boshi ko'rinadi
  { x: 13, y: 45, w: 11, z: 2, jx: 1.5, jy: 1.5, flip: true },  // ayiqchaning yelkasidan mo'ralaydi
  { x: 62, y: 66, w: 11, z: 2, jx: 1.5, jy: 1.5, flip: true },  // koptok ortidan boshi chiqib turibdi
  { x: 87, y: 65, w: 11, z: 3, jx: 1.5, jy: 1.5 },              // piramida ortidan boshi ko'rinadi
];
// sahifaning o'z mavzusiga mos fon
const DUCK_THEME = TOYS_THEME;

const HiddenDuckPage = ({ onBack, onNext }) => {
  const voice = useVoice(DUCK_VOICE);
  const { onCorrect } = useFlightApi();
  const [shaking, shake] = useShake();
  // joylar QAT'IY: o'rdakchalar doim bir xil 3 joyda turadi —
  // kubiklar orqasida, quti orqasida va piramida ortida
  const spots = [DUCK_SPOTS[0], DUCK_SPOTS[1], DUCK_SPOTS[5]];
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
    <PageShell onBack={onBack} onNext={onNext} nextOk={allFound}>
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
const CERT_VOICE = "Tabriklayman! Barcha topshiriqlarni bajardingiz. Siz — haqiqiy Diqqat chempionisiz!";

const RAIN = [
  { x: 4,  d: 0,   c: '#FF5A8A' }, { x: 12, d: 1.4, c: '#FFD34D' },
  { x: 22, d: 0.6, c: '#5AC8FA' }, { x: 30, d: 2.0, c: '#43C465' },
  { x: 40, d: 0.2, c: '#8E5AE8' }, { x: 48, d: 1.7, c: '#FF7043' },
  { x: 58, d: 0.9, c: '#FFD34D' }, { x: 66, d: 2.3, c: '#FF5A8A' },
  { x: 76, d: 0.4, c: '#43C465' }, { x: 84, d: 1.2, c: '#5AC8FA' },
  { x: 92, d: 1.9, c: '#8E5AE8' }, { x: 97, d: 0.7, c: '#FF7043' },
];

// Oltin medal (tulkichaga taqiladi)
const MedalSVG = () => <ObjIcon kind="medal"/>;

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
        <h1 className="d1-cert-title">Tabriklaymiz!</h1>
        <div className="d1-cert-fox">
          <FoxSVG mood="cheer"/>
          <span className="d1-cert-medal"><MedalSVG/></span>
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
// ILDIZ KOMPONENT — 21 sahifa (spets: 1_darslik.pdf / .md):
//  0 Muqova · 1 Soya-quyoncha · 2 Xuddi-shundayini-top · 3 Saralash-meva ·
//  4 Saralash-o'yinchoq · 5 Ketma-ketlik-hayvon · 6 Ketma-ketlik-shakl ·
//  7-9 Farq-top (o'yinchoq/bog'/o'rmon) · 10 Motivatsiya · 11 Yodlash-savat ·
//  12 Sanoq-pitsa · 13 Sanoq-konfet · 14 Juftini-top (baliqchalar) ·
//  15 Farq-top (kosmos) ·
//  16 Berkinmachoq (o'rdakchalar) · 17 Ketma-ketlik-rang · 18 Almashinuv-polka ·
//  19 Ortiqchasini-top (4 ekran) · 20 Sertifikat.
// Yulduz parvozi: pop -> hisoblagichga uchadi -> +1 (sahifa limiti bilan);
// advance=true bo'lsa qisqa pauzadan keyin avto-o'tish.
// ============================================================
// Har sahifada nechta yulduz olish mumkin (qayta yechishda ortmasin)
const PAGE_MAX = { 1: 1, 2: 3, 3: 3, 4: 3, 5: 1, 6: 1, 7: 3, 8: 4, 9: 1, 10: 0, 11: 1, 12: 3, 13: 3, 14: 3, 15: 4, 16: 3, 17: 1, 18: 2, 19: 4, 20: 0 };
const TOTAL_STARS = Object.values(PAGE_MAX).reduce((a, b) => a + b, 0); // 44
const LAST_PAGE = 20;

export default function Dars01({ ttsApiBase, voiceGender, onFinished }) {
  configureLesson({ ttsApiBase: ttsApiBase || '', voiceGender: voiceGender || 'f' });

  // DEV/TEST: ?p=N bilan istalgan sahifadan boshlash (masalan /?p=7)
  const [page, setPage] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const n = parseInt(new URLSearchParams(window.location.search).get('p') || '0', 10);
    return Number.isFinite(n) ? Math.min(LAST_PAGE, Math.max(0, n)) : 0;
  });
  const [stars, setStars] = useState(0);
  const [flight, setFlight] = useState(null);   // { x, y, phase:'init'|'pop'|'go', tx, ty }
  const [bump, setBump] = useState(false);
  const [celeb, setCeleb] = useState(false);    // sahifa yechildi bayrami (markaziy yulduz + salyut)
  const counterRef = useRef(null);
  const timersRef = useRef([]);
  const pageRef = useRef(0);
  const starsByRef = useRef({});                // sahifa -> olingan yulduzlar (limit uchun)
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Yulduz parvozi: pt — bosilgan nuqta.
  // solved=true (sahifadagi OXIRGI to'g'ri javob) — markaziy yulduz + salyut,
  // bayram tugagach sahifa AVTOMATIK keyingisiga o'tadi ("Keyingi" tugmasi
  // baribir qoladi — bola kutmasdan o'zi ham bosa oladi).
  const startFlight = useCallback((pt, solved) => {
    // yulduz QAYSI sahifada topilgan bo'lsa — o'sha sahifa hisobiga yoziladi
    // (parvoz tugaguncha bola keyingi sahifaga o'tib ketsa ham adashmaydi)
    const startPage = pageRef.current;
    if (solved) {
      later(() => { setCeleb(true); sfxSalute(); }, 520);
      later(() => setCeleb(false), 3000);
      // avto-o'tish: bola hali shu sahifada bo'lsa (o'zi o'tib ketmagan bo'lsa)
      later(() => {
        if (pageRef.current === startPage) {
          setPage(p => Math.min(LAST_PAGE, p + 1));
        }
      }, 3080);
    }
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
      const p = startPage;
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

  // 21 sahifalik xarita
  const view = (() => {
    switch (page) {
      case 0:  return <CoverPage onStart={() => setPage(1)}/>;
      case 1:  return <MeadowShadowPage key={page} {...nav}/>;
      case 2:  return <SamePicturePage key={page} {...nav}/>;
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
              <span className="d1-brand-txt">
                <span className="d1-brand-t1">Zukko</span>
                <span className="d1-brand-t2">ko'zlar</span>
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

        {/* sahifa yechildi — markaziy yulduz + salyut bayrami */}
        {celeb && <CelebrationFx/>}
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
  /* yagona fon: muqova palitrasiga mos yumshoq gradient */
  background: linear-gradient(180deg, #FFE9A8 0%, #FFF6D9 40%, #CDEFFF 100%);
  display: flex;
  flex-direction: column;
}
.d1-root h1, .d1-root h2, .d1-root p { margin: 0; }
.d1-root button { -webkit-tap-highlight-color: transparent; }

@keyframes d1fadeup { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: d1fadeup 0.45s ease-out both; }

/* sanoq kartalari: toza karta, faqat sanaladigan mahsulotlar — katta va aniq */
.d1-count-art { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.d1-count-items {
  position: relative; z-index: 1;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
  gap: clamp(6px, 1.2vh, 12px); width: 92%;
}
/* har bir sanaladigan mahsulot — karta enining ~uchdan bir qismi */
.d1-count-items > span { width: 29%; aspect-ratio: 1; display: inline-flex; }

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
/* sahifa soni: 07 / 21 */
.d1-pagenum {
  font-weight: 800; font-size: clamp(13px, 2vh, 16px);
  letter-spacing: 0.08em; color: #6E6A85;
  background: #FFFFFF; border-radius: 999px;
  padding: clamp(7px, 1.2vh, 10px) clamp(12px, 1.8vw, 18px);
  box-shadow: 0 6px 16px -6px rgba(61, 58, 80, 0.2);
  white-space: nowrap;
}
.d1-brand { display: flex; align-items: center; gap: 8px; }
/* LOGOTIP — tinch, professional: oq doira nishondagi tulkicha +
   ikki rangli yozuv. Animatsiya YO'Q. */
.d1-brand-fox {
  width: clamp(36px, 5vw, 46px); height: clamp(36px, 5vw, 46px);
  display: inline-flex; align-items: center; justify-content: center;
  background: #FFFFFF; border-radius: 50%;
  box-shadow: 0 3px 10px rgba(122, 82, 48, 0.18);
  padding: 4px;
}
.d1-brand-txt {
  font-weight: 900; font-size: clamp(16px, 2.2vw, 20px);
  letter-spacing: 0.01em; display: inline-flex; gap: 6px;
}
.d1-brand-t1 { color: #3D3A50; }
.d1-brand-t2 { color: #FF7043; }
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
.d1-panel-room { position: absolute; inset: 0; width: 100%; height: 100%; }
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

/* ===== SAHIFA YECHILDI BAYRAMI: markaziy yulduz + salyut ===== */
.d1-celeb {
  position: fixed; inset: 0; z-index: 85;
  pointer-events: none;
  display: flex; align-items: center; justify-content: center;
  animation: d1CelebFade 2.45s ease both;
}
@keyframes d1CelebFade {
  0% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; }
}
.d1-celeb-inner { position: relative; width: 0; height: 0; }
.d1-celeb-rocket {
  position: absolute;
  width: 10px; height: 28px; border-radius: 6px;
  opacity: 0;
  box-shadow: 0 0 14px 4px var(--glow);
  /* forwards: kechikish paytida KO'RINMAYDI (asos opacity 0) */
  animation: d1CelebRocket 0.55s ease-out forwards;
}
.d1-celeb-rocket::after {
  content: '';
  position: absolute; left: 50%; top: 100%;
  transform: translateX(-50%);
  width: 4px; height: 52px; border-radius: 4px;
  background: linear-gradient(180deg, var(--glow), transparent);
  opacity: 0.85;
}
@keyframes d1CelebRocket {
  0%   { transform: translate(-50%, calc(-50% + 58vh)) scaleY(1.25); opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translate(-50%, -50%) scaleY(1); opacity: 0; }
}
.d1-celeb-flash {
  position: absolute;
  width: 160px; height: 160px;
  margin-left: -80px; margin-top: -80px;
  border-radius: 50%;
  background: radial-gradient(circle, #FFFDF0 0%, #FFE9A8 40%, rgba(255, 211, 77, 0) 70%);
  opacity: 0; transform: scale(0.2);
  animation: d1CelebFlash 0.65s ease-out forwards;
}
@keyframes d1CelebFlash {
  0%   { opacity: 0; transform: scale(0.15); }
  18%  { opacity: 1; }
  100% { opacity: 0; transform: scale(3); }
}
.d1-celeb-txt {
  position: absolute; left: 0; top: clamp(78px, 15vw, 118px);
  transform: translateX(-50%);
  font-weight: 900; font-size: clamp(26px, 5vw, 40px); color: #FF7043;
  white-space: nowrap;
  text-shadow: 0 3px 0 #FFFFFF, 0 8px 18px rgba(122, 82, 48, 0.35);
  animation: d1CelebTxt 2.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes d1CelebTxt {
  0%, 20% { transform: translateX(-50%) scale(0); opacity: 0; }
  38% { transform: translateX(-50%) scale(1.15); opacity: 1; }
  50%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
}
.d1-celeb-burst { position: absolute; width: 0; height: 0; }
.d1-celeb-burst i {
  position: absolute; left: 0; top: 0;
  width: 18px; height: 18px; border-radius: 50%;
  opacity: 0;
  box-shadow: 0 0 14px 4px rgba(255, 236, 160, 0.6);
  /* forwards: portlashgacha ko'rinmaydi — "kutayotgan nuqta" bo'lmaydi */
  animation: d1CelebP 1.3s ease-out forwards;
}
@keyframes d1CelebP {
  0%  { transform: translate(0, 0) scale(1.2); opacity: 1; }
  70% { opacity: 1; }
  /* uchqun yoyilib, oxirida og'irlik bilan pastga tushadi */
  100% { transform: translate(var(--bx), calc(var(--by) + 70px)) scale(0.25); opacity: 0; }
}

/* ===== XUDDI SHUNDAYINI TOP (namuna + 4 variant) ===== */
.d1-same-wrap {
  position: relative; z-index: 2;
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: clamp(12px, 3vh, 30px);
  padding: clamp(8px, 2vh, 18px) 12px;
}
.d1-same-sample {
  position: relative;
  display: flex; align-items: center; gap: clamp(10px, 2vw, 20px);
  background: #FFFDF6;
  border: 4px solid #FFD34D;
  outline: 3px solid #E8A21F;
  border-radius: 24px;
  padding: clamp(10px, 2.2vh, 20px) clamp(22px, 3.5vw, 38px);
  box-shadow: 0 10px 26px rgba(122, 82, 48, 0.24);
}
.d1-same-lens {
  position: absolute; top: -20px; left: -22px;
  width: clamp(38px, 6vh, 52px); height: clamp(38px, 6vh, 52px);
  filter: drop-shadow(0 3px 6px rgba(61, 58, 80, 0.3));
}
.d1-same-ic {
  position: relative; display: block;
  width: clamp(44px, 8vh, 78px); aspect-ratio: 1;
}
.d1-same-ic.big { width: clamp(58px, 11vh, 104px); }
.d1-same-opts {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: clamp(10px, 1.8vw, 20px);
}
.d1-same-opt {
  position: relative;
  display: flex; align-items: center; gap: clamp(6px, 1vw, 12px);
  background: #FFFFFF;
  border: 4px solid #B9E3B0;
  border-radius: 20px;
  padding: clamp(8px, 1.8vh, 16px) clamp(12px, 2vw, 20px);
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(61, 58, 80, 0.15);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.d1-same-opt:hover:not(:disabled) { transform: translateY(-3px) scale(1.03); }
.d1-same-opt:disabled { cursor: default; }
.d1-same-opt.ok {
  border-color: #2FA45C;
  background: #EAF9EF;
  box-shadow: 0 6px 18px rgba(47, 164, 92, 0.35);
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
/* bosh jonivor "jonli" ko'rinadi: yumshoq soya + mayin suzish */
.d1-shadow-hero .d1-llc {
  filter: drop-shadow(0 12px 16px rgba(61, 58, 80, 0.3));
  animation: d1ccfloat 3s ease-in-out infinite;
}
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
/* Universal SVG belgicha — konteynerini to'liq to'ldiradi */
.d1-llo { display: block; width: 100%; height: 100%; }

/* ===== LOGICLIKE USLUBI (2-sahifa): yashil o'rmon + qalin plitkalar ===== */
.d1-lljungle svg { display: block; width: 100%; height: 100%; }
.d1-shadow-card.ll { background: #8CC94F; }
.d1-llc { display: block; width: 100%; height: auto; }
/* plitka ichida soya kvadratga sig'sin */
.d1-sil .d1-llc { width: auto; height: 100%; margin: 0 auto; }
.d1-shadow-card.ll .d1-shadow-hero { animation: d1ccfloat 3s ease-in-out infinite; }
/* plitka: oq ichlik + qalin yashil ramka + ostida to'q yashil "3D" lab */
.d1-shadow-card.themed.ll .d1-sil {
  background: #FFFFFF;
  border: clamp(5px, 0.9vw, 8px) solid #4E9E2A;
  border-radius: clamp(18px, 2.6vw, 26px);
  box-shadow: 0 clamp(6px, 1.1vh, 10px) 0 #3A7E1D, 0 16px 26px -14px rgba(30, 70, 15, 0.5);
  padding: clamp(8px, 1.6vh, 14px);
}
.d1-shadow-card.themed.ll .d1-sil:not(:disabled):hover {
  background: #FFFFFF;
  transform: translateY(-3px);
  box-shadow: 0 clamp(9px, 1.5vh, 13px) 0 #3A7E1D, 0 18px 28px -14px rgba(30, 70, 15, 0.5);
}
.d1-shadow-card.themed.ll .d1-sil:not(:disabled):active {
  transform: translateY(2px);
  box-shadow: 0 3px 0 #3A7E1D, 0 10px 18px -12px rgba(30, 70, 15, 0.5);
}
/* to'g'ri javob: oltin ramka + yorug' nur (mexanika o'zgarmagan) */
.d1-shadow-card.themed.ll .d1-sil.ok {
  background: #FFF6DC;
  border-color: #FFC23C;
  box-shadow: 0 clamp(6px, 1.1vh, 10px) 0 #D89A1D, 0 0 26px 6px rgba(255, 214, 90, 0.75);
}

/* ===== 2-SAHIFA: O'TLOQ USLUBI (yarim-realistik quyon) ===== */
.d1-meadow-bg svg { display: block; width: 100%; height: 100%; }
/* to'liq manzarali fonlar (mevali bog', bolalar xonasi) */
.d1-scenebg svg { display: block; width: 100%; height: 100%; }
/* 2-sahifa foni jonlantirishlari: bulut suzadi, qush va kapalak qanot qoqadi */
.d1-md-cloud { animation: d1MdCloud 9s ease-in-out infinite alternate; }
.d1-md-cloud.slow { animation-duration: 13s; animation-delay: -4s; }
@keyframes d1MdCloud {
  from { transform: translateX(-14px); }
  to { transform: translateX(16px); }
}
.d1-md-btf { transform-box: fill-box; transform-origin: center; animation: d1MdBtf 3.6s ease-in-out infinite; }
.d1-md-btf.b2 { animation-duration: 4.4s; animation-delay: -1.6s; }
@keyframes d1MdBtf {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-11px) rotate(5deg); }
}
.d1-btf-wl, .d1-btf-wr { transform-box: fill-box; animation: d1BtfFlap 0.55s ease-in-out infinite alternate; }
.d1-btf-wl { transform-origin: right center; }
.d1-btf-wr { transform-origin: left center; }
@keyframes d1BtfFlap {
  from { transform: scaleX(1); }
  to { transform: scaleX(0.5); }
}
/* dumaloq yashil taxta — oq ramka ichida (ramka tashqarisi d1-root gradienti) */
.d1-shadow-card.meadow { background: #A9DB7E; }
/* karta + orqasidagi slot konturi bitta ustunda turadi */
.d1-slotwrap {
  position: relative; z-index: 1;
  flex: 1; max-width: 190px; min-width: 0;
}
.d1-slotwrap .d1-sil { width: 100%; max-width: none; }
/* xira "javob shu yerga" slot konturi — karta orqasidan chiqib turadi */
.d1-slot {
  position: absolute;
  left: 7%; right: 7%; top: clamp(-16px, -2vh, -10px); bottom: 40%;
  border: 3px dashed rgba(255, 255, 255, 0.8);
  border-radius: clamp(14px, 2vw, 20px);
  background: rgba(255, 255, 255, 0.16);
  pointer-events: none;
}
/* karta: oq ichlik + yashil ramka (dizayn: white cards, green borders) */
.d1-shadow-card.themed.meadow .d1-sil {
  background: #FFFFFF;
  border: clamp(4px, 0.8vw, 7px) solid #58A83A;
  border-radius: clamp(16px, 2.4vw, 24px);
  box-shadow: 0 clamp(5px, 1vh, 8px) 0 #3F8526, 0 14px 24px -12px rgba(30, 70, 15, 0.45);
  padding: clamp(8px, 1.6vh, 14px);
}
.d1-shadow-card.themed.meadow .d1-sil:not(:disabled):hover {
  background: #FFFFFF;
  transform: translateY(-3px);
  box-shadow: 0 clamp(8px, 1.4vh, 11px) 0 #3F8526, 0 16px 26px -12px rgba(30, 70, 15, 0.45);
}
.d1-shadow-card.themed.meadow .d1-sil:not(:disabled):active {
  transform: translateY(2px);
  box-shadow: 0 3px 0 #3F8526, 0 10px 16px -10px rgba(30, 70, 15, 0.45);
}
/* to'g'ri javob: yashil yorqin ramka (umumiy mexanika 1-bandi) */
.d1-shadow-card.themed.meadow .d1-sil.ok {
  background: #E0F6E8;
  border-color: #2FA45C;
  box-shadow: 0 clamp(5px, 1vh, 8px) 0 #237A44, 0 0 0 6px rgba(47, 164, 92, 0.3), 0 0 26px 6px rgba(80, 220, 130, 0.7);
}
/* quyonning o'z kontakt soyasi bor — umumiy drop-shadow filtri olib tashlanadi */
.d1-shadow-card.meadow .d1-shadow-hero .d1-llc { filter: none; }
@media (max-height: 720px) {
  .d1-slotwrap { max-width: 150px; }
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
  background: linear-gradient(180deg, #FFE9A8 0%, #FFF6D9 40%, #CDEFFF 100%);
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
  .d1-brand-fox,
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
  width: clamp(84px, 16.5vh, 132px);
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
  width: clamp(130px, 24vh, 205px); aspect-ratio: 100 / 72;
  border: none; padding: clamp(5px, 1vh, 10px); cursor: pointer;
  background: transparent; border-radius: clamp(16px, 3vh, 26px);
  filter: drop-shadow(0 8px 12px rgba(20, 60, 90, 0.28));
  transition: left 0.8s cubic-bezier(0.45, 0, 0.25, 1), top 0.8s cubic-bezier(0.45, 0, 0.25, 1),
    background 0.25s, box-shadow 0.25s;
}
/* suzish harakati JS (requestAnimationFrame) orqali — reduced-motion
   sozlamasida ham ishlaydi; CSS animatsiya ishlatilmaydi */
/* juft topildi — IKKI TOMONGA tez suzib, fon chegarasidan chiqishda
   asta yo'q bo'lib ketadi */
.d1-fish.away {
  transition:
    left 1.5s cubic-bezier(0.5, 0, 0.85, 1),
    top 1.5s cubic-bezier(0.5, 0, 0.85, 1),
    opacity 0.7s ease 0.8s;
  opacity: 0;
  pointer-events: none;
}
/* baliq kartasi suzib chiqqan baliqlarni chetida qirqib tashlaydi */
.d1-fish-card { overflow: hidden; }
/* baliq ichki qatlami: har xil tomonga qarash uchun */
.d1-fish-inner { display: block; width: 100%; height: 100%; position: relative; }
.d1-fish-inner.flip { transform: scaleX(-1); }
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
  /* oq nur halqasi — o'rdakcha fondan ajralib, bittada ko'zga tushadi */
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.95)) drop-shadow(0 4px 8px rgba(120, 70, 20, 0.3));
}
.d1-duck-btn:not(.ok) .d1-llo { animation: d1duckbob 1.6s ease-in-out infinite; }
@keyframes d1duckbob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7%); }
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
  .d1-count-card.active, .d1-num, .d1-sea-weed, .d1-sea-bubble, .d1-seq-cell,
  .d1-shelf-toy, .d1-oddout-item, .d1-shadow-hero .d1-llc,
  .d1-nav-next:not(:disabled) { animation: none !important; }
}

/* ============================================================
   MOBIL MOSLASHUV (<= 600px) — faqat telefonlar uchun.
   Planshet (>= 768px) va laptoplarga MUTLAQO ta'sir qilmaydi:
   barcha qoidalar shu bitta media-blok ichida.
   ============================================================ */
@media (max-width: 600px) {
  /* --- MUQOVA: sarlavha karnaycha tugmasi ostida qolmasin --- */
  .d1-cover-title { font-size: clamp(26px, 8.5vw, 40px); }
  .d1-cover-top { padding-top: clamp(74px, 11vh, 96px); }

  /* --- Karnaycha tugmalari telefonda ixchamroq --- */
  .d1-voice-btn { width: clamp(40px, 11vw, 46px); }
  .d1-voice-btn.bl { width: clamp(38px, 10.5vw, 44px); }

  /* --- TEMATIK FON dekorlari: chetda yarim kesilib qolmasin ---
     inline left o'rniga --dx (ThemeBg beradi) chekkadan 18px ichkariga
     qisiladi; desktopda bu qoida ishlamaydi (media tashqarisida emas) */
  .d1-theme-ic { left: clamp(18px, var(--dx, 50%), calc(100% - 18px)) !important; }

  /* --- 2-SAHIFA (Xuddi shundayini top): kartalar 2x2 bo'lib sig'sin,
     namuna yuqori panel ustiga chiqmasin, nuqtalar ko'rinsin --- */
  .d1-same-wrap { gap: clamp(10px, 2vh, 16px); }
  .d1-same-sample { padding: clamp(8px, 1.6vh, 14px) clamp(16px, 5vw, 26px); }
  .d1-same-ic { width: clamp(32px, 11.5vw, 46px); }
  .d1-same-ic.big { width: clamp(42px, 14vw, 58px); }
  .d1-same-lens { top: -14px; left: -14px; width: 34px; height: 34px; }
  .d1-same-opt { padding: clamp(7px, 1.4vh, 12px) clamp(10px, 3vw, 16px); }

  /* --- FARQ-TOP (7, 8, 15): rasmlar yonma-yon emas, USTMA-UST —
     har biri deyarli ikki baravar katta ko'rinadi --- */
  .d1-diff-card .d1-pair { flex-direction: column; gap: 4px; }
  .d1-diff-card .d1-panel {
    flex: 1 1 0; min-height: 0;
    width: auto; max-width: 100%;
    aspect-ratio: 1 / 1.02;
  }
  .d1-diff-card .d1-vs { width: 28px; }

  /* --- 11-SAHIFA (Yodlash-savat): 4 meva ekranga to'liq sig'sin --- */
  .d1-mem-fruits { gap: clamp(6px, 2.2vw, 10px); }
  .d1-mem-fruit { width: clamp(52px, 17vw, 72px); }
  .d1-mem-basket { width: min(62vw, 240px); }
  .d1-mem-count { font-size: clamp(52px, 18vw, 80px); }

  /* --- 18-SAHIFA (Polka): 4 o'yinchoq ekranga to'liq sig'sin --- */
  .d1-shelf-row { gap: clamp(8px, 2.6vw, 14px); padding: 0 4px; }
  .d1-shelf-toy { width: clamp(48px, 16vw, 68px); }

  /* --- 19-SAHIFA (Ortiqchasini top): ustun emas, 2x2 setka --- */
  .d1-oddout-row {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-content: center;
    gap: clamp(10px, 3.4vw, 16px);
  }
  .d1-oddout-item { width: min(36vw, 150px); }

  /* --- 12-13-SAHIFALAR (Sanoq): "?" belgisi mahsulotlarni to'smasin --- */
  .d1-count-badge {
    width: clamp(24px, 7.5vw, 30px);
    font-size: clamp(13px, 4vw, 16px);
    right: -5px; top: -5px;
  }
  .d1-count-row { gap: clamp(8px, 2.6vw, 12px); }

  /* --- 14-SAHIFA (Baliqchalar): baliqlar tor kartada kichikroq —
     chetga suzib yarim kesilib qolmaydi (JS amplituda ham kichraygan) --- */
  .d1-fish { width: clamp(84px, 27vw, 110px); }

  /* --- Variant qatorlari (savat/polka/sanoq javoblari) torroq gap --- */
  .d1-seq-opts { gap: clamp(8px, 2.6vw, 14px); }
  .d1-seq-opt { width: clamp(64px, 19vw, 88px); }
  .d1-num { width: clamp(56px, 17vw, 76px); }

  /* --- Umumiy: karta ichki maydonidan maksimal foydalanish --- */
  .d1-shadow { padding-left: 10px; padding-right: 10px; }
  .d1-shadow-card { padding-left: clamp(8px, 2.6vw, 14px); padding-right: clamp(8px, 2.6vw, 14px); }
}
`;
