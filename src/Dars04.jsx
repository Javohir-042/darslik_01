import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';

// ============================================================================
// ░░ 1-SINF · Dars04 — "10 gacha sonlarni taqqoslash" (num-1-04-v1) · syujet:
// Ra'no va Anvar hovlida meva yig'ishdi; kimda ko'p? — sanab taqqoslash (katta/kichik/teng)
// va > < = belgilari. Oxirida mevalarni teng bo'lib olishadi. ░░
// Dars03 (Sonlar 6–10 va 0) etaloniga 1:1 mos qurildi: infratuzilma + ETALON KIT +
// Dars02/03 vizualizatorlari (TenFrame/BasketArt/DoorCard...) BYTE-FOR-BYTE ko'chirildi.
// YANGI vizualizatorlar (Dars04): TwoBaskets (ikki savat), CompareFrames (ikki ramka),
// CompareSign (> < = belgisi — ochiq tomoni katta songa qaraydi).
//
// Cast: Bit (boshlovchi) + Ra'no + Anvar. Yangi personaj yo'q.
// ETALON KIT bloklari Dars03 dan o'zgarishsiz (grep: "ETALON KIT ·").
// ============================================================================

// ============================================================
// ПАЛИТРА
// ============================================================
const T = {
  bg: '#F6F4EF',
  ink: '#0E0E10',
  ink2: '#5A5A60',
  ink3: '#A7A6A2',
  paper: '#FFFFFF',
  accent: '#FF4F28',
  accentSoft: '#FFE8E1',
  success: '#1F7A4D',
  successSoft: '#E3F0E8',
  blue: '#019ACB',
  shadowBase: '58, 53, 48'
};

// ============================================================
// КОНФИГ УРОКА (props от LMS) — модульный, ставится корневым компонентом.
// Движок/SFX/AI читают отсюда; экраны не нужно перепровязывать.
// ============================================================
let ttsConfig = { ttsApiBase: '', correctSoundUrl: '', wrongSoundUrl: '', aiGradingEndpoint: '', studentName: '', voiceGender: 'f' };
const configureLesson = (cfg) => { ttsConfig = { ...ttsConfig, ...cfg }; };

// Slaydlararo o'tish blokirovkasi (production): "Davom" javob/ovoz tugagach ochiladi,
// javob faqat ovoz tugagach tanlanadi. (Test paytida vaqtincha true qilingan edi.)
const FREE_NAV = false; // PRODUCTION — slayd gating YOQILGAN

// ============================================================
// TTS-ТЕГИ (язык/тон) — внутри text, в квадратных скобках; на экран НЕ показываются.
// ============================================================
const LANG_TAG = {
  ru: '[Русское произношение]',
  uz: "[O'zbekcha tallaffuz]",
  en: '[English pronunciation]',
};
const END_TAG = '[end]';
const TAG_RE = /\[(Русское произношение|O'zbekcha tallaffuz|English pronunciation|end)\]/g;

const stripAudioTags = (s) => typeof s === 'string'
  ? s.replace(/\[(Русское произношение|O'zbekcha tallaffuz|English pronunciation|end)\]\s*/g, '')
      .replace(/\[[a-zа-яё][^\]]*\]\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
  : s;

// HTTP TTS v5.2: {base}/api/tts?text=<encoded>&g=m|f — ТОЛЬКО text + g.
// Язык — маркерами внутри text (только смешанные строки языковых курсов); math шлёт без маркеров,
// сервер определяет язык сам (ru=кириллица, uz=латиница). Движок свой тег НЕ добавляет.
function buildTtsUrl(base, text, gender) {
  const raw = String(text);
  const enc = encodeURIComponent(raw.slice(0, 1000)).replace(/%5B/g, '[').replace(/%5D/g, ']');
  const g = gender === 'f' ? 'f' : 'm';
  return `${base}/api/tts?text=${enc}&g=${g}`;
}

// SFX — короткие звуки верно/неверно, URL из ttsConfig (correctSoundUrl/wrongSoundUrl).
function useSfx() {
  const correctRef = useRef(null);
  const wrongRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { correctSoundUrl, wrongSoundUrl } = ttsConfig;
    if (correctSoundUrl) { const a = new Audio(correctSoundUrl); a.preload = 'auto'; a.volume = 0.6; correctRef.current = a; }
    if (wrongSoundUrl)   { const a = new Audio(wrongSoundUrl);   a.preload = 'auto'; a.volume = 0.6; wrongRef.current = a; }
    return () => {
      try { correctRef.current && correctRef.current.pause(); } catch (e) {}
      try { wrongRef.current && wrongRef.current.pause(); } catch (e) {}
      correctRef.current = null; wrongRef.current = null;
    };
  }, []);
  const play = useCallback((kind) => {
    const ref = kind === 'correct' ? correctRef : wrongRef;
    const a = ref.current; if (!a) { playChime(kind === 'correct'); return; }
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }, []);
  return { playCorrect: () => play('correct'), playWrong: () => play('wrong') };
}

// Неречевой сигнал (фолбэк SFX в preview / игры закрепления).
let _chimeCtx = null;
function playChime(ok) {
  try {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    _chimeCtx = _chimeCtx || new AC();
    const ctx = _chimeCtx; if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = ok ? [660, 880] : [320, 240];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.2);
    });
  } catch (e) { /* no-op */ }
}

// AI-проверка открытых ответов — единственный разрешённый fetch (кроме <audio>.src).
// Возвращает { correct, feedback, transcript? } или бросает.
async function gradeAnswer({ screenIdx, question, rubric, lang, mode, answerText, audioBlob }) {
  const endpoint = ttsConfig.aiGradingEndpoint;
  if (!endpoint) throw new Error('No grading endpoint configured');
  const lessonId = (typeof LESSON_META !== 'undefined' && LESSON_META.lessonId) || '';
  let res;
  if (mode === 'voice') {
    const fd = new FormData();
    fd.append('lessonId', lessonId); fd.append('screenIdx', String(screenIdx));
    fd.append('question', question || ''); fd.append('rubric', rubric || '');
    fd.append('lang', lang); fd.append('mode', 'voice');
    if (audioBlob) fd.append('audio', audioBlob, 'answer.webm');
    res = await fetch(endpoint, { method: 'POST', body: fd });
  } else {
    res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId, screenIdx, question: question || '', rubric: rubric || '', lang, mode: 'text', answerText: answerText || '' }),
    });
  }
  if (!res.ok) throw new Error(`Grading failed: ${res.status}`);
  const data = await res.json();
  if (typeof data.correct !== 'boolean' || typeof data.feedback !== 'string') throw new Error('Malformed grading response');
  return data;
}

// ============================================================
// LANGUAGE CONTEXT + useT
// ============================================================
const LangContext = createContext('ru');
const useLang = () => useContext(LangContext);

// Yulduz-kopilka: to'g'ri javoblar soni (test ekranlari) — yuqorida to'planib boradi.
const ProgressContext = createContext({ stars: 0, total: 0 });

const useT = () => {
  const lang = useLang();
  return useCallback((node) => {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string') return stripAudioTags(node);
    if (React.isValidElement(node)) return node;
    if (node[lang] !== undefined) return stripAudioTags(node[lang]);
    return stripAudioTags(node.ru ?? '');
  }, [lang]);
};

// ============================================================
// useIsMobile (design_system 5.0)
// ============================================================
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

// ============================================================
// useMobileZoom — mobil yagona masshtab qatlami (etalon kenglik 390px).
// <640px: butun urok 390px kenglikda joylashadi va real ekranga zoom bilan
// fotografik masshtablanadi — barcha telefonlarda BIR XIL ko'rinish, QA faqat
// 390px da. Desktop (>=640px): --g1z=1, hech narsa o'zgarmaydi.
// Balandlik JS'da o'lchanmaydi: .lesson-root position:fixed + inset:0 —
// brauzer viewport o'zgarishini (URL-panel) o'zi kuzatadi.
// ============================================================
const MOBILE_DESIGN_W = 390;
function useMobileZoom(breakpoint = 640) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const apply = () => {
      const z = window.innerWidth < breakpoint ? window.innerWidth / MOBILE_DESIGN_W : 1;
      root.style.setProperty('--g1z', String(z));
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      root.style.removeProperty('--g1z');
    };
  }, [breakpoint]);
}

// ============================================================
// AUDIO ENGINE
// ============================================================
class AudioEngine {
  constructor() {
    this.queue = [];
    this.currentIdx = 0;
    this.isPlaying = false;
    this.onStateChange = null;
    this.waitingFor = null;
    this.currentLang = 'ru';
    this.gender = 'f';
    this.autoplayBlocked = false;
    this.audioEl = null;
  }

  ensureEl() {
    if (this.audioEl || typeof window === 'undefined') return this.audioEl;
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    this.audioEl = el;
    return el;
  }

  setLang(lang) { this.currentLang = lang; }              // только preview Web Speech
  setGender(g) { this.gender = g === 'f' ? 'f' : 'm'; }   // дефолтный пол голоса (v5.2); segment.g переопределяет

  loadQueue(segments) {
    this.stop();
    this.queue = segments || [];
    this.currentIdx = 0;
    this.waitingFor = null;
  }

  playSegment(segment) {
    if (!segment) return;
    const base = ttsConfig.ttsApiBase;
    // Нет текста → пропускаем (логика очереди сохраняется).
    if (!segment.text) {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      setTimeout(() => this.handleSegmentEnd(segment), 0);
      return;
    }
    // База НЕ пришла от LMS → этап разработки (artifacts). Озвучка через браузерный
    // Web Speech (preview-стендин, «корявый» голос). На платформе эта ветка мёртвая:
    // LMS всегда передаёт ttsApiBase, и тогда идёт HTTP-ветка ниже.
    // speechSynthesis запрещён контрактом в БОЕВОЙ ветке (platform_contract §4);
    // здесь он допустим как preview-стендин — согласовано с разработчиком платформы (июнь 2026).
    if (!base) { this.playSegmentPreview(segment); return; }
    const el = this.ensureEl();
    if (!el) { setTimeout(() => this.handleSegmentEnd(segment), 0); return; }

    el.onended = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      this.handleSegmentEnd(segment);
    };
    el.onerror = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      this.handleSegmentEnd(segment);
    };

    const gender = segment.g || this.gender;
    el.src = buildTtsUrl(base, segment.text, gender);
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        this.autoplayBlocked = false;
        this.isPlaying = true;
        if (this.onStateChange) this.onStateChange({ isPlaying: true, currentSegment: segment.id });
      }).catch(() => {
        // автоплей заблокирован браузером — ждём первого жеста
        this.autoplayBlocked = true;
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      });
    }
  }

  // PREVIEW-ВЕТКА (только при пустом ttsApiBase, т.е. вне LMS): браузерный Web Speech.
  // НЕ копировать как боевой транспорт — на платформе всегда идёт HTTP-ветка playSegment.
  playSegmentPreview(segment) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setTimeout(() => this.handleSegmentEnd(segment), 0); return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    // тег языка/настроения на экран и в Web Speech не нужен — снимаем
    const clean = stripAudioTags(String(segment.text));
    const u = new SpeechSynthesisUtterance(clean);
    const lang = segment.lang || this.currentLang;
    u.lang = lang === 'uz' ? 'uz-UZ' : (lang === 'en' ? 'en-GB' : 'ru-RU');
    u.rate = 0.95; u.pitch = 1.0;
    u.onstart = () => {
      this.isPlaying = true;
      if (this.onStateChange) this.onStateChange({ isPlaying: true, currentSegment: segment.id });
    };
    u.onend = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      this.handleSegmentEnd(segment);
    };
    u.onerror = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      this.handleSegmentEnd(segment);
    };
    this.previewUtterance = u;
    setTimeout(() => { try { synth.speak(u); } catch (e) { this.handleSegmentEnd(segment); } }, 60);
  }

  // Возобновление после блокировки автоплея (по первому жесту).
  resumeIfBlocked() {
    if (!this.autoplayBlocked) return;
    this.autoplayBlocked = false;
    this.playSegment(this.queue[this.currentIdx]);
  }

  handleSegmentEnd(segment) {
    if (segment && segment.waits_for) {
      this.waitingFor = segment.waits_for;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, waitingFor: segment.waits_for });
    } else {
      this.currentIdx++;
      this.playNext();
    }
  }

  playNext() {
    if (this.currentIdx >= this.queue.length) return;
    this.playSegment(this.queue[this.currentIdx]);
  }

  start() {
    this.currentIdx = 0;
    this.waitingFor = null;
    this.playNext();
  }

  triggerEvent(eventType, target) {
    if (!this.waitingFor) return;
    const matches = this.waitingFor.type === eventType &&
                   (this.waitingFor.target === target || !this.waitingFor.target);
    if (matches) {
      this.waitingFor = null;
      this.currentIdx++;
      this.playNext();
    }
  }

  triggerInternalEvent(eventName) {
    const nextIdx = this.queue.findIndex((s, i) => i >= this.currentIdx && s.trigger === `on_event:${eventName}`);
    if (nextIdx !== -1) {
      this.currentIdx = nextIdx;
      this.waitingFor = null;
      this.playNext();
    }
  }

  pushOneOff(text, gender) {
    if (!text) return;
    this.queue.push({ id: `oneoff_${Date.now()}`, text, trigger: 'manual', waits_for: null, g: gender });
    this.currentIdx = this.queue.length - 1;
    this.playNext();
  }

  replay() {
    if (this.currentIdx > 0) this.currentIdx--;
    this.waitingFor = null;
    this.playNext();
  }

  stop() {
    if (this.audioEl) {
      try { this.audioEl.pause(); this.audioEl.onended = null; this.audioEl.onerror = null; } catch (e) {}
    }
    // preview-ветка: гасим браузерную озвучку
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
  }
}

let audioEngineInstance = null;
const getAudioEngine = () => {
  if (typeof window === 'undefined') return null;
  if (!audioEngineInstance) audioEngineInstance = new AudioEngine();
  return audioEngineInstance;
};

function useAudio(segments) {
  const lang = useLang();
  const [state, setState] = useState({ isPlaying: false, currentSegment: null, waitingFor: null, muted: false });
  const engineRef = useRef(null);

  // Стабилизация segments по содержимому, не по ссылке (без этого cancel-loop, звук молчит)
  const segmentsRef = useRef(segments);
  const segmentsKey = segments ? JSON.stringify(segments) : '';
  const prevKeyRef = useRef(segmentsKey);
  if (prevKeyRef.current !== segmentsKey) {
    segmentsRef.current = segments;
    prevKeyRef.current = segmentsKey;
  }
  const stableSegments = segmentsRef.current;

  useEffect(() => {
    const engine = getAudioEngine();
    if (!engine) return;
    engineRef.current = engine;
    engine.setLang(lang);
    engine.setGender(ttsConfig.voiceGender || 'f');
    engine.onStateChange = (s) => setState(prev => ({ ...prev, ...s }));
    // Возобновление по первому жесту, если браузер заблокировал автоплей.
    const resume = () => { if (engineRef.current) engineRef.current.resumeIfBlocked(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    if (stableSegments && stableSegments.length > 0 && !state.muted) {
      engine.loadQueue(stableSegments);
      const timer = setTimeout(() => engine.start(), 300);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
        engine.stop();
      };
    }
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      engine.stop();
    };
  // eslint-disable-next-line
  }, [stableSegments, lang]);

  const triggerEvent = useCallback((type, target) => {
    if (engineRef.current) engineRef.current.triggerEvent(type, target);
  }, []);
  const triggerInternal = useCallback((eventName) => {
    if (engineRef.current) engineRef.current.triggerInternalEvent(eventName);
  }, []);
  const replay = useCallback(() => {
    if (engineRef.current) engineRef.current.replay();
  }, []);
  const toggleMute = useCallback(() => {
    setState(prev => {
      const newMuted = !prev.muted;
      if (newMuted && engineRef.current) engineRef.current.stop();
      return { ...prev, muted: newMuted };
    });
  }, []);

  return { ...state, triggerEvent, triggerInternal, replay, toggleMute };
}

// Хелпер: построить audio-segments для экрана из CONTENT
const makeAudioSegments = (screenContent, lang) => {
  if (Array.isArray(screenContent.audio?.[lang])) {
    return screenContent.audio[lang].map((text, i) => ({
      id: `aud_${i}`,
      text,
      trigger: i === 0 ? 'on_mount' : (i === 1 ? 'after_previous' : `on_event:step_${i - 1}`),
      waits_for: i < screenContent.audio[lang].length - 1
        ? { type: 'button_click', target: 'step' }
        : { type: 'button_click', target: 'next' }
    }));
  }
  const text = screenContent.audio?.[lang];
  if (!text) return [];
  return [{ id: 'aud_0', text, trigger: 'on_mount', waits_for: null }];
};

// Avto-zanjir segmentlar: barcha bo'laklar ketma-ket O'ZI yangraydi (step-tugmasiz).
// Interaktiv bo'lmagan tushuntirish slaydlari uchun (s1, s5, s6).
const makeAutoSegments = (screenContent, lang) => {
  const a = screenContent.audio?.[lang];
  const arr = Array.isArray(a) ? a : (a ? [a] : []);
  return arr.map((text, i) => ({ id: `aud_${i}`, text, trigger: i === 0 ? 'on_mount' : 'after_previous', waits_for: null }));
};

// useCanAnswer — javob tanlash faqat ovoz tugagandan keyin (bola avval tinglaydi).
// Ovoz yangrayotganda yoki hali boshlanmaganda -> false. Mute -> true. 12s himoya (bloklanmasin).
function useCanAnswer(audio) {
  const [hasPlayed, setHasPlayed] = useState(false);
  useEffect(() => {
    if (audio.isPlaying && !hasPlayed) { const id = setTimeout(() => setHasPlayed(true), 0); return () => clearTimeout(id); }
    return undefined;
  }, [audio.isPlaying, hasPlayed]);
  useEffect(() => { const id = setTimeout(() => setHasPlayed(true), 12000); return () => clearTimeout(id); }, []);
  return FREE_NAV || audio.muted || (hasPlayed && !audio.isPlaying);
}

// useAdvanceGate — "Davom" faqat javobdan keyingi izoh ovozi TUGAGACH ochiladi
// (o'quvchi tushuntirishni oxirigacha eshitsin). Mute -> darrov. 6s himoya.
function useAdvanceGate(solved, audio) {
  const [fbStarted, setFbStarted] = useState(false);
  useEffect(() => {
    if (solved && audio.isPlaying && !fbStarted) { const id = setTimeout(() => setFbStarted(true), 0); return () => clearTimeout(id); }
    return undefined;
  }, [solved, audio.isPlaying, fbStarted]);
  useEffect(() => {
    if (!solved) return undefined;
    const id = setTimeout(() => setFbStarted(true), 6000);
    return () => clearTimeout(id);
  }, [solved]);
  if (!solved) return false;
  if (audio.muted) return true;
  return fbStarted && !audio.isPlaying;
}

// ============================================================
// БАЗОВЫЕ КОМПОНЕНТЫ
// ============================================================
const Op = React.memo(({ children, size = 'mid' }) => {
  const fontSize = size === 'big' ? 'clamp(25px, 4.7vw, 38px)' :
                   size === 'mid' ? 'clamp(24px, 5vw, 34px)' :
                   'clamp(12px, 2.1vw, 18px)';
  return <span className="mop" style={{ fontSize }}>{children}</span>;
});

const Frac = React.memo(({ n, d, color, size = 'sm' }) => (
  <span className={`frac frac-${size}`} style={{ color }}>
    <span className="n">{n}</span>
    <span className="bar"/>
    <span className="d">{d}</span>
  </span>
));

// mt: рендерит текст, заменяя «a/b» (и «?/b») настоящей дробью Frac — без слэша.
// Если дробей нет, возвращает строку как есть. Применяется во всех видимых текстах.
const FRAC_RE = /(\d+|\?)\/(\d+)/g;
const mt = (str) => {
  const s = typeof str === 'string' ? str : String(str ?? '');
  if (s.indexOf('/') === -1) return s;
  const out = []; let last = 0; let m; let key = 0;
  FRAC_RE.lastIndex = 0;
  while ((m = FRAC_RE.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<Frac key={`mtf${key}`} n={m[1]} d={m[2]} size="sm"/>);
    key += 1;
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
};

const AudioIndicator = ({ audioState }) => {
  const { isPlaying, muted, replay, toggleMute } = audioState;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={toggleMute} title={muted ? 'Sound on' : 'Sound off'}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: muted ? T.ink3 : (isPlaying ? T.accent : T.ink2) }}>
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        ) : isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        )}
      </button>
      {!muted && (
        <button onClick={replay} title="Replay"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: T.ink2 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      )}
    </div>
  );
};

// autoScrollTo — yangi paydo bo'lgan kontentni ko'rinish zonasiga olib keladi.
// 'nearest' — element ko'rinib turgan bo'lsa sakramaydi; reduced-motion'da silliqsiz.
const autoScrollTo = (el, block = 'nearest') => {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
};

// useRevealScroll — active=true bo'lganda (kontent paydo bo'lganda) unga avtoskroll.
// FeedbackBlock naqshi: double-rAF + kechikish (fade-up animatsiyasi joylashgach).
function useRevealScroll(active, delay = 350, block = 'nearest') {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    let tid;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      tid = setTimeout(() => autoScrollTo(ref.current, block), delay);
    }));
    return () => { cancelAnimationFrame(raf); clearTimeout(tid); };
  }, [active, delay, block]);
  return ref;
}

const FeedbackBlock = ({ show, isCorrect, wrongClass, children }) => {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (show) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVisible(true);
        setTimeout(() => {
          if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }, 350);
      }));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(timer);
    }
  }, [show]);
  if (!mounted) return null;
  return (
    <div ref={ref} className={`feedback-block ${visible ? 'visible' : ''}`}>
      <div className={isCorrect ? 'frame-success' : (wrongClass || 'frame-soft')}>{children}</div>
    </div>
  );
};

// Slider — компонент v15 с track-wrap + track-bg + track-fill + glow
const Slider = ({ value, min, max, step = 1, onChange, disabled = false }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="track-wrap">
      <div className="track-bg"/>
      <div className="track-fill" style={{ width: `${pct}%` }}/>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input"
      />
    </div>
  );
};

// Stage — progress + chrome вынесены в отдельный stage-header (sticky, flex-shrink: 0)
const Stage = ({ children, eyebrow, screen, totalScreens, navContent, audioState }) => {
  const t = useT();
  const isMobile = useIsMobile();
  const padH = isMobile ? 12 : 100;
  return (
    <div className="stage">
      <div className="stage-header" style={{ paddingLeft: padH, paddingRight: padH }}>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${((screen + 1) / totalScreens) * 100}%` }}/>
        </div>
        <div className="chrome">
          <div className="chrome-left eyebrow">
            <span className="dot"/>
            <span>{t(eyebrow)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {audioState && <AudioIndicator audioState={audioState}/>}
            <div className="mono small" style={{ color: T.ink, fontWeight: 700, fontSize: 14 }}>
              {String(screen + 1).padStart(2, '0')} / {String(totalScreens).padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>
      <div className="stage-content" style={{ paddingLeft: padH, paddingRight: padH }}>
        {children}
      </div>
      {navContent && <div className="stage-nav" style={{ paddingLeft: padH, paddingRight: padH }}>{navContent}</div>}
    </div>
  );
};

const NavBack = ({ onPrev, label = 'Назад' }) => (
  <button className="btn-ghost" onClick={onPrev}
    style={{ padding: 'clamp(10px, 1.7vw, 12px) clamp(15px, 2.1vw, 20px)', fontSize: 'clamp(12px, 1.5vw, 14px)' }}>
    {label}
  </button>
);

const NavNext = ({ disabled, label, onClick }) => (
  <button className="btn-white-accent" disabled={FREE_NAV ? false : disabled} onClick={onClick}
    style={{ padding: 'clamp(10px, 1.7vw, 12px) clamp(20px, 2.5vw, 27px)', fontSize: 'clamp(12px, 1.5vw, 14px)', marginLeft: 'auto' }}>
    {label}
  </button>
);

const NextLabel = () => {
  const lang = useLang();
  return lang === 'uz' ? 'Davom etish' : 'Дальше';
};

const BackLabel = () => {
  const lang = useLang();
  return lang === 'uz' ? 'Orqaga' : 'Назад';
};

// ============================================================
// QUESTION SCREEN — универсальный MC-компонент под формат audio: { intro, on_correct, on_wrong }
// ============================================================
const QuestionScreen = ({ screen, idx, totalScreens, screenMeta, screenContent, question, options, correctIdx, storedAnswer, onAnswer, onNext, onPrev, factOnCorrect, figure, celebrateOnCorrect, mascot = true }) => {
  const lang = useLang();
  const c = screenContent;
  const sfx = useSfx();

  const audio = useAudio([{
    id: `s${idx}_intro`,
    text: c.audio.intro[lang],
    trigger: 'on_mount',
    waits_for: { type: 'option_picked' }
  }]);
  const canAns = useCanAnswer(audio);   // javob faqat ovoz tugagach

  // Веди-до-верного: экран НЕ блокируется на первом ответе.
  // Неверный гаснет и отключается, остальные активны, «Дальше» — только когда выбран верный.
  const wasSolved = storedAnswer?.solved === true || storedAnswer?.correct === true;
  const [solved, setSolved] = useState(wasSolved);
  const [picked, setPicked] = useState(wasSolved ? correctIdx : null);  // текущий показываемый вариант
  const [wrong, setWrong]   = useState(() => new Set());                // погашенные неверные
  const firstTryRef = useRef(storedAnswer ? (storedAnswer.firstTry ?? storedAnswer.correct ?? null) : null);
  const firstIdxRef = useRef(storedAnswer?.studentAnswerIndex ?? null);
  const attemptsRef = useRef(storedAnswer?.attempts ?? (wasSolved ? 1 : 0));
  const introAdvancedRef = useRef(wasSolved);
  const [praiseWord, setPraiseWord] = useState('');   // navbatdagi maqtov so'zi (reaktsiya uchun)
  const [encWord, setEncWord] = useState('');         // navbatdagi UNIKAL rag'bat (xato javob)
  const praiseRef = useRef('');

  const pick = (i) => {
    if (!canAns) return;       // ovoz tugamaguncha javob yo'q
    if (solved) return;        // после верного — заблокировано
    if (wrong.has(i)) return;  // уже погашенный неверный — игнор
    const isCorrect = i === correctIdx;

    if (firstTryRef.current === null) {   // фиксируем первую попытку (аналитика)
      firstTryRef.current = isCorrect;
      firstIdxRef.current = i;
    }
    attemptsRef.current += 1;
    setPicked(i);

    if (!introAdvancedRef.current) {      // продвинуть intro-очередь один раз
      introAdvancedRef.current = true;
      audio.triggerEvent('option_picked');
    }

    if (isCorrect) {
      setSolved(true);
      sfx.playCorrect();
      const pw = nextPraise(lang); praiseRef.current = pw; setPraiseWord(pw);
      onAnswer({
        stage: screenMeta?.scope ?? null,
        screenIdx: idx,
        question: typeof question === 'string' ? question : null,
        options: options.map(o => typeof o === 'string' ? o : null),
        correctIndex: correctIdx,
        correctAnswer: typeof options[correctIdx] === 'string' ? options[correctIdx] : null,
        studentAnswerIndex: firstIdxRef.current,                                   // ПЕРВЫЙ выбор
        studentAnswer: typeof options[firstIdxRef.current] === 'string' ? options[firstIdxRef.current] : null,
        correct: firstTryRef.current,                                              // верность ПЕРВОЙ попытки
        firstTry: firstTryRef.current,
        attempts: attemptsRef.current,
        solved: true
      });
    } else {
      sfx.playWrong();
      setEncWord(nextEncourage(lang));   // har xatoda boshqa pozitiv so'z
      setWrong(prev => { const n = new Set(prev); n.add(i); return n; });
    }

    if (!audio.muted) {
      setTimeout(() => {
        const engine = getAudioEngine();
        if (engine && !audio.muted) {
          const wrongVoice = (c[`audio_hint_${i}`] && c[`audio_hint_${i}`][lang]) || (c[`hint_${i}`] && c[`hint_${i}`][lang]) || (c[`wrong_${i}`] && c[`wrong_${i}`][lang]) || c.audio.on_wrong[lang];
          if (isCorrect) { engine.pushOneOff(praiseRef.current); engine.pushOneOff(c.audio.on_correct[lang]); }   // maqtov so'zi + izoh
          else engine.pushOneOff(wrongVoice);
          if (isCorrect && c.fact_audio && c.fact_audio[lang]) engine.pushOneOff(c.fact_audio[lang]);  // FactCard ovozlanadi (TTS-toza)
        }
      }, 300);
    }
  };

  const canAdv = useAdvanceGate(solved, audio);   // izoh ovozi tugagach Davom
  const factRef = useRevealScroll(solved && !!factOnCorrect, 900);   // feedback skrollidan keyin fakt ham ko'rinadi
  const navContent = (
    <>
      <NavBack onPrev={onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canAdv} onClick={onNext} label={<NextLabel/>}/>
    </>
  );

  return (
    <Stage eyebrow={c.eyebrow} screen={screen} totalScreens={totalScreens} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2.6vw, 18px)' }}>
        <div className="fade-up">{question}</div>
        {figure && <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(12px, 2.4vw, 18px)' }}>{figure(solved)}</div>}
        {!solved && (
        <div className="fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {options.map((opt, i) => {
            const isWrongPicked = wrong.has(i);
            const cls = `option${isWrongPicked ? ' option-picked-wrong' : ''}`;
            const disabled = isWrongPicked || !canAns;   // ovoz tugamaguncha + погашенный неверный
            return (
              <button key={i} className={cls} disabled={disabled} onClick={() => pick(i)}
                style={{ padding: 'clamp(10px, 1.5vw, 12px) clamp(14px, 2.1vw, 19px)', fontSize: 'clamp(16px, 2.1vw, 18px)', minHeight: 'clamp(48px, 7vw, 58px)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="mono small" style={{ minWidth: 20, color: isWrongPicked ? '#D8A93A' : T.ink3 }}>
                  {isWrongPicked ? '↺' : String.fromCharCode(65 + i)}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>{opt}</span>
              </button>
            );
          })}
        </div>
        )}
        {/* to'g'ri javobdan keyin: faqat to'g'ri variant qoladi (noto'g'rilari yo'qoladi). celebrateOnCorrect bo'lsa -> animatsiya */}
        {solved && !celebrateOnCorrect && (
          <div className="fade-up" style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="option option-correct" disabled
              style={{ padding: 'clamp(10px, 1.5vw, 12px) clamp(16px, 2.4vw, 22px)', fontSize: 'clamp(16px, 2.1vw, 18px)', minHeight: 'clamp(48px, 7vw, 58px)', minWidth: 'clamp(120px, 40vw, 220px)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono small" style={{ minWidth: 20, color: T.success }}>✓</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>{options[correctIdx]}</span>
            </button>
          </div>
        )}
        {solved && celebrateOnCorrect && <div className="fade-up" style={{ display: 'flex', justifyContent: 'center' }}>{typeof celebrateOnCorrect === 'function' ? celebrateOnCorrect() : celebrateOnCorrect}</div>}
        <FeedbackBlock show={picked !== null} isCorrect={solved} wrongClass="frame-tip">
          <Reaction state={solved ? 'correct' : 'wrong'} praise={solved ? praiseWord : encWord} mascot={mascot}/>
        </FeedbackBlock>
        {solved && factOnCorrect && <div ref={factRef}>{factOnCorrect}</div>}
      </div>
    </Stage>
  );
};

// ============================================================
// --- POD UROK: num_1_01 — Predmetlarni sanash va 1–5 sonlar (1-sinf, Dars01) ---
// 1-sinf (6–7 yosh): ovoz yetakchi kanal, typing YO'Q (tap/drag), concrete ustun,
// bar model YO'Q. Manba: 1sinf_metodologiya.md (§4, §6, §7 Б1) + DIZAYN_STANDART_1SINF.md.
// Misconception'lar: M1 kardinallik yo'q · M2 miscount (sakrab/ikki marta) · M3 raqam↔miqdor.
// ============================================================

const TOTAL_SCREENS = 16;
const LESSON_META = {
  lessonId: 'num-1-04-v1',
  lessonTitle: { ru: 'Сравнение чисел до 10', uz: "10 gacha sonlarni taqqoslash" }
};
const SCREEN_META = [
  { id: 'sIntro', type: 'hook',        template: 'custom',   scored: false, scope: null },            // syujet: Ra'no/Anvar hovlida meva yig'ishdi, kimda ko'p?
  { id: 's0',     type: 'hook',        template: 'custom',   scored: false, scope: 'hook' },          // jumboq: ko'z bilan baho (tuzoq: kam meva keng yoyilgan)
  { id: 's1',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // har savatni TenFrame ga sanab solish (4 va 7)
  { id: 's2',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // ikki ramka yonma-yon: kimda ko'proq to'lgan
  { id: 's3',     type: 'rule',        template: 'custom',   scored: false, scope: null },            // taqqoslash = katta / kichik / teng
  { id: 's4',     type: 'test',        template: 'MCScreen', scored: true,  scope: 'module-mikro' },  // qaysida ko'p? (6 vs 9) sonni tanla
  { id: 's5',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // YANGI belgi: ochiq tomon katta songa qaraydi (7 > 4)
  { id: 's6',     type: 'rule',        template: 'custom',   scored: false, scope: null },            // uchta belgi: > < =
  { id: 's7',     type: 'test',        template: 'custom',   scored: true,  scope: 'module-mikro' },  // belgini joyiga qo'y (8 _ 5 -> >)
  { id: 's8',     type: 'test',        template: 'MCScreen', scored: true,  scope: 'module-mikro' },  // ha/yo'q: 6 va 6 teng, "Anvarda ko'p" to'g'rimi?
  { id: 's9',     type: 'test',        template: 'MCScreen', scored: true,  scope: 'module-mikro' },  // predmetsiz: 7 yoki 4 — qaysi katta?
  { id: 's10',    type: 'test',        template: 'custom',   scored: true,  scope: 'module-mikro' },  // savatlarni kichikdan kattaga tartiblash (3,5,8)
  { id: 'sd',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // mini-o'yin: ko'proq savatni bos (ball yo'q)
  { id: 'sGuest', type: 'hook',        template: 'custom',   scored: false, scope: null },            // syujet ko'prik: mevalarni teng bo'lib olishdi
  { id: 's11',    type: 'test',        template: 'MCScreen', scored: true,  scope: 'final' },         // final: 8 va 8 — qaysi belgi? (=) + fakt
  { id: 's12',    type: 'summary',     template: 'custom',   scored: false, scope: null }             // yakun + can-do + ConnectionsBlock
];

// Sonlar — so'z bilan (audio_rules: audioda raqam emas, so'z). Indeks = son.
const NUM_WORDS = {
  ru: ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять'],
  uz: ['nol', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz", "o'n"]
};

// Fisher-Yates (brauzerda Math.random — faqat hodisalarda/effektda, render'da emas).
const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; };

const CONTENT = {
  sIntro: {
    eyebrow: { ru: 'История', uz: 'Hikoya' },
    title: { ru: 'У кого больше фруктов?', uz: "Kimda meva ko'p?" },
    body: {
      ru: 'В прошлый раз мы навели порядок на улице и узнали числа до десяти. Сегодня Рано и Анвар с корзинами фруктов пришли отдохнуть на берег озера. А в озере живёт большой крокодил. Он немного голодный и всё смотрит, где фруктов больше. Рано говорит, что больше у неё, Анвар — что у него. Давай посчитаем и сравним по-честному, а крокодил поможет нам увидеть, где больше.',
      uz: "O'tgan safar ko'chada tartib o'rnatdik va o'ngacha sonlarni o'rgandik. Bugun Ra'no va Anvar meva savatlari bilan ko'l bo'yiga dam olgani kelishdi. Ko'lda esa katta timsoh yashaydi. U bir oz och va doim qayerda meva ko'proq ekaniga qaraydi. Ra'no menda ko'p deydi, Anvar esa menda deydi. Keling, sanaymiz va halol taqqoslaymiz, timsoh esa qayerda ko'proq ekanini ko'rsatishga yordam beradi."
    },
    bit_label: { ru: 'Бит', uz: 'Bit' },
    rano_label: { ru: 'Рано', uz: "Ra'no" },
    anvar_label: { ru: 'Анвар', uz: 'Anvar' },
    audio: {
      ru: [
        'Привет, друг! В прошлый раз мы навели порядок на улице и узнали числа до десяти.',
        'Сегодня Рано и Анвар с корзинами фруктов пришли отдохнуть на берег озера.',
        'А в озере живёт большой крокодил. Он немного голодный и всё смотрит, где фруктов больше.',
        'Рано думает, что больше у неё. Анвар думает, что больше у него.',
        'Давай посчитаем и сравним по-честному. А крокодил поможет нам увидеть, где больше. Слушай меня и нажимай кнопку дальше.'
      ],
      uz: [
        "Salom, do'stim! O'tgan safar ko'chada tartib o'rnatdik va o'ngacha sonlarni o'rgandik.",
        "Bugun Ra'no va Anvar meva savatlari bilan ko'l bo'yiga dam olgani kelishdi.",
        "Ko'lda esa katta timsoh yashaydi. U bir oz och va doim qayerda meva ko'proq ekaniga qaraydi.",
        "Ra'no menda ko'p deb o'ylaydi. Anvar esa menda ko'p deb o'ylaydi.",
        "Keling, sanaymiz va halol taqqoslaymiz. Timsoh esa qayerda ko'proq ekanini ko'rsatadi. Meni tinglang va davom tugmasini bosing."
      ]
    }
  },
  s0: {
    eyebrow: { ru: 'Загадка', uz: 'Topishmoq' },
    title_part1: { ru: '', uz: '' },
    title_part2_em: { ru: 'Где больше?', uz: "Qayerda ko'p?" },
    title_part3: { ru: '', uz: '' },
    question: { ru: 'Как тебе кажется — где фруктов больше?', uz: "Sizningcha — qayerda meva ko'p?" },
    opt0: { ru: 'У Рано', uz: "Ra'noda" },
    opt1: { ru: 'У Анвара', uz: 'Anvarda' },
    opt2: { ru: 'Трудно сказать', uz: 'Aytish qiyin' },
    audio: {
      intro: {
        ru: 'У Рано манго крупные, и кажется, что их больше. А у Анвара виноградинки мелкие. Даже крокодил засмотрелся и не поймёт, где больше. Как думаешь? Нажми любой ответ, потом посчитаем.',
        uz: "Ra'noning mangolari yirik, ko'pdek tuyuladi. Anvarning uzumlari esa mayda. Timsoh ham dovdirab qoldi, qayerda ko'p ekanini bilmayapti. Sizningcha qayerda ko'p? Qaysi javob bo'lsa ham bosing, keyin sanaymiz."
      },
      on_correct: { ru: 'Глазам можно поверить не всегда. Сейчас посчитаем точно.', uz: "Ko'zga doim ishonib bo'lmaydi. Endi aniq sanaymiz." },
      on_wrong: { ru: 'Глазам можно поверить не всегда. Сейчас посчитаем точно.', uz: "Ko'zga doim ishonib bo'lmaydi. Endi aniq sanaymiz." }
    }
  },
  s1: {
    eyebrow: { ru: 'Считаем', uz: 'Sanaymiz' },
    instruction: { ru: 'Нажимай фрукты.', uz: 'Mevalarni bosing.' },
    count_label: { ru: 'Сосчитали', uz: 'Sanaldi' },
    done_text: { ru: 'У Рано четыре, у Анвара семь.', uz: "Ra'noda to'rtta, Anvarda yettita." },
    done_audio: { ru: 'Готово. У Рано получилось четыре, а у Анвара семь.', uz: "Tayyor. Ra'noda to'rtta, Anvarda esa yettita chiqdi." },
    frame_note: { ru: 'Каждый фрукт — в одну клетку.', uz: "Har meva bitta katakka." },
    audio: {
      ru: [
        'Посчитаем корзину Рано. Нажимай каждый фрукт по одному.',
        'Теперь корзина Анвара. Нажимай дальше. У Анвара клеток заполнено больше.'
      ],
      uz: [
        "Ra'no savatini sanaymiz. Har mevani bittadan bosing.",
        "Endi Anvar savati. Bosishda davom eting. Anvarda katak ko'proq to'ladi."
      ]
    }
  },
  s2: {
    eyebrow: { ru: 'Сравниваем', uz: 'Taqqoslaymiz' },
    instruction: { ru: 'Где заполнено больше?', uz: "Qayerda ko'proq to'lgan?" },
    done_text: { ru: 'Семь больше четырёх.', uz: "Yetti to'rtdan katta." },
    audio: {
      ru: [
        'Поставим клетки рядом. У Рано четыре, у Анвара семь.',
        'При счёте семь идёт после четырёх. Значит, семь больше. А четыре меньше. У Анвара больше фруктов.'
      ],
      uz: [
        "Kataklarni yonma-yon qo'yamiz. Ra'noda to'rt, Anvarda yetti.",
        "Sanaganda yetti to'rtdan keyin keladi. Demak, yetti katta. To'rt esa kichik. Anvarda meva ko'proq."
      ]
    }
  },
  s3: {
    eyebrow: { ru: 'Запомним', uz: 'Eslab qolamiz' },
    title_part1: { ru: '', uz: '' },
    title_part2_em: { ru: 'Больше, меньше, поровну', uz: 'Katta, kichik, teng' },
    tip: { ru: 'Поровну — числа равны.', uz: "Teng — sonlar teng." },
    audio: {
      ru: 'Сравнить два числа значит узнать, какое больше, какое меньше, или они равны. Считаем предметы. У кого больше, то число больше. Если предметов поровну, числа равны.',
      uz: "Ikki sonni taqqoslash, ya'ni qaysi biri katta, qaysi biri kichik, yoki teng ekanini bilishdir. Predmetlarni sanaymiz. Kimda ko'p bo'lsa, o'sha son katta. Predmet barobar bo'lsa, sonlar teng."
    }
  },
  s4: {
    eyebrow: { ru: 'Тренировка · 1 / 5', uz: 'Mashq · 1 / 5' },
    title: { ru: 'Где больше?', uz: "Qayerda ko'p?" },
    correct_text: { ru: 'Верно. Девять больше, чем шесть.', uz: "To'g'ri. To'qqiz oltidan katta." },
    wrong_0: { ru: 'Это меньшая корзина. Посчитай обе по одному и выбери ту, где число больше.', uz: "Bu kamroq savat. Ikkalasini bittadan sanang va son kattaroq bo'lganini tanlang." },
    wrong_2: { ru: 'Здесь фруктов не поровну. В одной корзине заметно больше. Посчитай ещё раз.', uz: "Bu yerda meva teng emas. Bir savatda sezilarli ko'p. Yana sanang." },
    wrong_default: { ru: 'Не совсем. Сосчитай предметы в каждой корзине и сравни числа.', uz: "Unchalik emas. Har savatdagi predmetni sanang va sonlarni taqqoslang." },
    audio: {
      intro: { ru: 'Сосчитай фрукты в каждой корзине. В какой больше? Нажми это число.', uz: "Har savatdagi mevani sanang. Qaysida ko'p? O'sha sonni bosing." },
      on_correct: { ru: 'Верно. Их девять, это больше.', uz: "To'g'ri. Ular to'qqizta, bu ko'proq." },
      on_wrong: { ru: 'Не совсем. Посчитай обе корзины ещё раз.', uz: "Unchalik emas. Ikkala savatni yana sanang." }
    }
  },
  s5: {
    eyebrow: { ru: 'Знак-крокодил', uz: 'Timsoh belgisi' },
    instruction: { ru: 'Рот — к большему числу.', uz: "Og'iz — kattaroq songa." },
    done_text: { ru: 'Рот крокодила открыт к большему числу.', uz: "Timsohning og'zi kattaroq songa ochilgan." },
    audio: {
      ru: [
        'Помнишь нашего друга крокодила? Он голодный и всегда поворачивается открытым ртом туда, где больше.',
        'Так он показывает большее число. Семь больше четырёх. Значит, рот открыт к семи.'
      ],
      uz: [
        "Do'stimiz timsohni eslaysizmi? U och va doim og'zini ko'p tomonga ochib qaraydi.",
        "Shunday qilib u kattaroq sonni ko'rsatadi. Yetti to'rtdan katta. Demak og'iz yettiga ochilgan."
      ]
    }
  },
  s6: {
    eyebrow: { ru: 'Запомним', uz: 'Eslab qolamiz' },
    title_part1: { ru: '', uz: '' },
    title_part2_em: { ru: 'Рот — к большему, равно — закрыт', uz: "Og'iz kattaga, teng — yopiq" },
    tip: { ru: 'Поровну — рот закрыт.', uz: "Teng — og'iz yopiq." },
    audio: {
      ru: 'У крокодила рот всегда открыт к большему числу. Если слева больше, рот открыт влево. Если справа больше, рот открыт вправо. А если поровну, крокодил спокоен и держит рот закрытым. Получаются две ровные чёрточки, это равно.',
      uz: "Timsohning og'zi doim kattaroq songa ochiladi. Chapda ko'p bo'lsa, og'iz chapga ochiladi. O'ngda ko'p bo'lsa, o'ngga ochiladi. Teng bo'lsa, timsoh tinch turadi va og'zini yopadi. Ikkita tekis chiziq hosil bo'ladi, bu teng."
    }
  },
  s7: {
    eyebrow: { ru: 'Тренировка · 2 / 5', uz: 'Mashq · 2 / 5' },
    instruction: { ru: 'Какой крокодил подходит?', uz: 'Qaysi timsoh mos?' },
    correct_text: { ru: 'Верно. Восемь больше пяти — рот открыт к восьми.', uz: "To'g'ri. Sakkiz beshdan katta — og'iz sakkizga ochilgan." },
    done_text: { ru: 'Молодец! Крокодил смотрит на большее число.', uz: "Barakalla! Timsoh kattaroq songa qaragan." },
    wrong_default: { ru: 'Посмотри, какое число больше. Рот крокодила должен открыться к нему.', uz: "Qaysi son katta ekaniga qarang. Timsoh og'zi o'shanga ochilishi kerak." },
    audio: {
      intro: { ru: 'Поставь крокодила между восемью и пятью. К какому числу он откроет рот?', uz: "Timsohni sakkiz va besh orasiga qo'ying. Og'zini qaysi songa ochadi?" },
      on_correct: { ru: 'Верно. Рот открыт к восьми.', uz: "To'g'ri. Og'iz sakkizga ochilgan." },
      on_wrong: { ru: 'Не совсем. Рот открывается к большему числу.', uz: "Unchalik emas. Og'iz kattaroq songa ochiladi." }
    }
  },
  s8: {
    eyebrow: { ru: 'Тренировка · 3 / 5', uz: 'Mashq · 3 / 5' },
    title: { ru: 'Анвар прав?', uz: 'Anvar haqmi?' },
    opt0: { ru: 'Да, верно', uz: "Ha, to'g'ri" },
    opt1: { ru: 'Нет, неверно', uz: "Yo'q, noto'g'ri" },
    correct_text: { ru: 'Верно. У обоих по шесть — это поровну. Ни у кого не больше, числа равны.', uz: "To'g'ri. Ikkalasida ham oltitadan — bu teng. Hech kimda ko'p emas, sonlar teng." },
    wrong_0: { ru: 'Посчитай обе корзины. И там, и там по шесть. Если поровну, никто не больше, числа равны.', uz: "Ikkala savatni sanang. U yerda ham, bu yerda ham oltitadan. Teng bo'lsa, hech kim ko'p emas, sonlar teng." },
    wrong_default: { ru: 'Сравни числа ещё раз. Если предметов поровну, то они равны.', uz: "Sonlarni yana taqqoslang. Predmet barobar bo'lsa, ular teng." },
    audio: {
      intro: { ru: 'У Рано шесть манго и у Анвара шесть манго. Анвар сказал, что у него больше. Подумай, это верно? Нажми да или нет.', uz: "Ra'noda olti mango va Anvarda olti mango. Anvar menda ko'p dedi. O'ylab ko'ring, bu to'g'rimi? Ha yoki yo'q ni bosing." },
      on_correct: { ru: 'Верно. Их поровну.', uz: "To'g'ri. Ular teng." },
      on_wrong: { ru: 'Не совсем. Посчитай обе корзины.', uz: "Unchalik emas. Ikkala savatni sanang." }
    }
  },
  s9: {
    eyebrow: { ru: 'Тренировка · 4 / 5', uz: 'Mashq · 4 / 5' },
    title: { ru: 'Какое число больше?', uz: 'Qaysi son katta?' },
    correct_text: { ru: 'Верно. При счёте семь идёт после четырёх, значит, семь больше.', uz: "To'g'ri. Sanaganda yetti to'rtdan keyin keladi, demak yetti katta." },
    wrong_1: { ru: 'При счёте мы говорим четыре раньше, чем семь. То, что идёт дальше, и есть больше.', uz: "Sanaganda to'rtni yettidan oldin aytamiz. Keyin kelgani kattaroq bo'ladi." },
    wrong_default: { ru: 'Вспомни счёт по порядку. Какое число называем дальше, то и больше.', uz: "Tartib bilan sanashni eslang. Qaysi sonni keyinroq aytsak, o'sha katta." },
    audio: {
      intro: { ru: 'Сравни два числа без предметов. Семь или четыре, какое больше? Нажми его.', uz: "Ikki sonni predmetsiz taqqoslang. Yetti yoki to'rt, qaysi katta? O'shani bosing." },
      on_correct: { ru: 'Верно. Семь больше.', uz: "To'g'ri. Yetti katta." },
      on_wrong: { ru: 'Не совсем. Вспомни порядок счёта.', uz: "Unchalik emas. Sanash tartibini eslang." }
    }
  },
  s10: {
    eyebrow: { ru: 'Тренировка · 5 / 5', uz: 'Mashq · 5 / 5' },
    instruction: { ru: 'Расставь от меньшей к большей.', uz: 'Kichikdan kattaga tartiblang.' },
    correct_text: { ru: 'Верно, дальше.', uz: "To'g'ri, davom eting." },
    done_text: { ru: 'Молодец! От меньшего к большему получается три, пять, восемь.', uz: "Barakalla! Kichikdan kattaga uch, besh, sakkiz bo'ladi." },
    wrong_default: { ru: 'Это пока не самая маленькая. Сначала найди корзину, где предметов меньше всего.', uz: "Bu hali eng kichigi emas. Avval predmet eng kam savatni toping." },
    audio: {
      intro: { ru: 'Расставь корзины по порядку. Начни с той, где фруктов меньше всего, и иди к самой большой.', uz: "Savatlarni tartibga soling. Meva eng kam bo'lganidan boshlang va eng kattasiga boring." },
      on_correct: { ru: 'Верно.', uz: "To'g'ri." },
      on_wrong: { ru: 'Не совсем. Где предметов меньше всего?', uz: "Unchalik emas. Predmet eng kam qayerda?" }
    }
  },
  sd: {
    eyebrow: { ru: 'Игра', uz: "O'yin" },
    instruction: { ru: 'Где больше?', uz: "Qayerda ko'p?" },
    correct_text: { ru: 'Верно! Дальше.', uz: "To'g'ri! Davom etamiz." },
    done_text: { ru: 'Молодец! Ты быстро находишь, где больше.', uz: "Barakalla! Qayerda ko'p ekanini tez topasiz." },
    retry_audio: { ru: 'Ничего страшного. Посчитай и нажми снова.', uz: "Zarari yo'q. Sanang va yana bosing." },
    audio: {
      intro: { ru: 'Немного поиграем. Я показываю две корзины. Нажимай ту, где фруктов больше. Можно посчитать.', uz: "Biroz o'ynaymiz. Men ikki savat ko'rsataman. Meva ko'proq bo'lganini bosing. Sanasangiz bo'ladi." }
    }
  },
  sGuest: {
    eyebrow: { ru: 'По-честному', uz: 'Adolat bilan' },
    title: { ru: 'Поделились по-дружески', uz: "Do'stona bo'lishdi" },
    body: {
      ru: 'У Анвара фруктов было больше, у Рано меньше. Друзья не стали спорить. Они поделили фрукты поровну и угостили друг друга, а голодному крокодилу тоже дали фрукт. Теперь у всех поровну, крокодил довольно закрыл рот — получился знак равно. Все рады. А в следующий раз посмотрим, из каких частей складывается число.',
      uz: "Anvarda meva ko'proq, Ra'noda kamroq edi. Do'stlar tortishmadi. Mevani teng bo'lishib, bir-birini mehmon qilishdi, och timsohga ham meva berishdi. Endi hammada teng, timsoh mamnun og'zini yopdi — teng belgisi chiqdi. Hamma xursand. Keyingi safar son qaysi qismlardan tuzilishini ko'ramiz."
    },
    rano_label: { ru: 'Рано', uz: "Ra'no" },
    anvar_label: { ru: 'Анвар', uz: 'Anvar' },
    audio: {
      ru: [
        'У Анвара фруктов было больше, у Рано меньше.',
        'Друзья не стали спорить. Они поделили фрукты поровну и угостили друг друга, а голодному крокодилу тоже дали фрукт.',
        'Теперь у всех поровну. Крокодил довольно закрыл рот, получился знак равно. Все рады.',
        'А в следующий раз узнаем, из каких частей складывается число.'
      ],
      uz: [
        "Anvarda meva ko'proq, Ra'noda kamroq edi.",
        "Do'stlar tortishmadi. Mevani teng bo'lishib, bir-birini mehmon qilishdi, och timsohga ham meva berishdi.",
        "Endi hammada teng. Timsoh mamnun og'zini yopdi, teng belgisi chiqdi. Hamma xursand.",
        "Keyingi safar son qaysi qismlardan tuzilishini bilib olamiz."
      ]
    }
  },
  s11: {
    eyebrow: { ru: 'Итог', uz: 'Yakun' },
    title: { ru: 'Что сделает крокодил?', uz: 'Timsoh nima qiladi?' },
    correct_text: { ru: 'Верно. Восемь и восемь — поровну, крокодил закрыл рот. Это равно.', uz: "To'g'ri. Sakkiz va sakkiz — teng, timsoh og'zini yopdi. Bu teng." },
    wrong_0: { ru: 'Числа одинаковые, большего нет, крокодилу нечего есть. Рот закрыт, это равно.', uz: "Sonlar bir xil, katta yo'q, timsohga yeyishga narsa yo'q. Og'iz yopiq, bu teng." },
    wrong_1: { ru: 'Оба числа равны, меньшего тоже нет. Крокодил держит рот закрытым, равно.', uz: "Ikkala son teng, kichik ham yo'q. Timsoh og'zini yopadi, teng." },
    wrong_default: { ru: 'Сосчитай обе корзины. Если поровну, рот закрыт, равно.', uz: "Ikkala savatni sanang. Teng bo'lsa, og'iz yopiq, teng." },
    fact_badge: { ru: 'А знаешь? · Дружба', uz: "Bilasizmi? · Do'stlik" },
    fact_text: { ru: 'Когда делят поровну, все довольны. Поэтому друзья и делят по-честному — чтобы никто не обижался.', uz: "Teng bo'linganda hamma rozi bo'ladi. Shuning uchun do'stlar halol — teng bo'lishadi, hech kim xafa bo'lmasin." },
    fact_audio: { ru: 'А знаешь, когда делят поровну, все довольны. Поэтому друзья делят по-честному.', uz: "Bilasizmi, teng bo'linganda hamma rozi bo'ladi. Shuning uchun do'stlar halol bo'lishadi." },
    audio: {
      intro: { ru: 'У Рано восемь манго и у Анвара восемь. Поровну или у кого-то больше? Что сделает крокодил?', uz: "Ra'noda sakkiz mango va Anvarda sakkiz. Tengmi yoki kimdadir ko'pmi? Timsoh nima qiladi?" },
      on_correct: { ru: 'Верно. Поровну, рот закрыт, равно.', uz: "To'g'ri. Teng, og'iz yopiq, teng." },
      on_wrong: { ru: 'Не совсем. Посчитай обе корзины.', uz: "Unchalik emas. Ikkala savatni sanang." }
    }
  },
  s12: {
    eyebrow: { ru: 'Готово', uz: 'Tayyor' },
    praise: { ru: 'Молодец!', uz: 'Barakalla!' },
    main_1: { ru: 'Теперь ты', uz: 'Endi siz' },
    main_2_em: { ru: 'умеешь сравнивать числа до десяти', uz: "o'ngacha sonlarni taqqoslay olasiz" },
    rano_label: { ru: 'Рано', uz: "Ra'no" },
    anvar_label: { ru: 'Анвар', uz: 'Anvar' },
    connections_title: { ru: 'Что дальше', uz: 'Keyin nima' },
    conn_label_refs: { ru: 'Опирается на', uz: 'Tayanadi' },
    conn_refs: { ru: 'Числа 6–10 и ноль', uz: "Sonlar 6–10 va nol" },
    conn_label_next: { ru: 'Следующий урок', uz: 'Keyingi dars' },
    conn_next: { ru: 'Состав числа 2–5.', uz: "Son tarkibi 2–5." },
    audio: {
      ru: 'Сегодня Рано и Анвар сравнили свои корзины и вместе поделили фрукты, угостили друг друга и крокодила. А ты научился сравнивать числа до десяти. Ты видишь, где больше, где меньше, а где поровну. И узнал знак крокодила. Рот открыт к большему, а когда поровну — рот закрыт, это равно. На следующем уроке узнаем, из каких частей складываются числа.',
      uz: "Bugun Ra'no va Anvar savatlarini taqqoslashdi va mevani birga bo'lishib, bir-birini va timsohni ham mehmon qilishdi. Siz esa o'ngacha sonlarni taqqoslashni o'rgandingiz. Qayerda ko'p, qayerda kam, qayerda teng ekanini ko'rasiz. Va timsoh belgisini bildingiz. Og'iz kattaga ochiladi, teng bo'lsa og'iz yopiq, bu teng. Keyingi darsda sonlar qaysi qismlardan tuzilishini bilib olamiz."
    }
  }
};

// ============================================================
// 1-SINF ANIMATSION KIT (etalon — keyingi darslar shundan meros oladi)
// Barcha sikllar prefers-reduced-motion bilan to'xtaydi (CSS @media + usePrefersReducedMotion).
// ============================================================

// Reduced-motion holatini kuzatadi — JS sikllarini ham to'xtatish uchun.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', apply); else mq.removeListener(apply); };
  }, []);
  return reduced;
}

// 0..max gacha sanaydi (sekin, ovoz tempida). loop=false -> max da to'xtaydi (PM audit);
// loop=true -> max da holdMs kutib qaytadan boshlaydi (summary qo'li uchun).
// reduced-motion -> darrov max.
function useCountOnce(max, { stepMs = 1300, startDelay = 600, loop = false, holdMs = 1600 } = {}) {
  const reduced = usePrefersReducedMotion();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduced) { const id = setTimeout(() => setK(max), 0); return () => clearTimeout(id); }
    let alive = true; let timer;
    let val = 0;
    const tick = () => {
      if (!alive) return;
      setK(val);
      if (val >= max) {
        if (!loop) return;                       // bir martalik: to'xtaydi
        timer = setTimeout(() => { val = 0; tick(); }, holdMs);  // loop: qaytadan
        return;
      }
      val += 1;
      timer = setTimeout(tick, val === 1 ? startDelay : stepMs);
    };
    timer = setTimeout(tick, startDelay);
    return () => { alive = false; clearTimeout(timer); };
  }, [max, stepMs, startDelay, loop, holdMs, reduced]);
  return k;
}

// Umumiy gradientlar — bir marta hujjatga qo'yiladi; ObjSvg va barcha sahnalar shu id'larga murojaat qiladi.
const GradientDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <radialGradient id="g1apA" cx="36%" cy="28%" r="74%">
        <stop offset="0%" stopColor="#FF7A63"/><stop offset="48%" stopColor="#E5301C"/><stop offset="100%" stopColor="#9C1008"/>
      </radialGradient>
      <radialGradient id="g1chrG" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#FF6A66"/><stop offset="50%" stopColor="#C8102E"/><stop offset="100%" stopColor="#7A0820"/>
      </radialGradient>
      <radialGradient id="g1mangoG" cx="34%" cy="28%" r="76%">
        <stop offset="0%" stopColor="#FFE07A"/><stop offset="50%" stopColor="#F7A81E"/><stop offset="100%" stopColor="#DE7A10"/>
      </radialGradient>
      <radialGradient id="g1grapeG" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#C29BE0"/><stop offset="52%" stopColor="#8E4FC4"/><stop offset="100%" stopColor="#5A2C8E"/>
      </radialGradient>
      <radialGradient id="g1nonG" cx="40%" cy="33%" r="72%">
        <stop offset="0%" stopColor="#F0CC86"/><stop offset="58%" stopColor="#D9A35A"/><stop offset="100%" stopColor="#B07734"/>
      </radialGradient>
      <radialGradient id="g1teaG" cx="36%" cy="28%" r="82%">
        <stop offset="0%" stopColor="#46BEE8"/><stop offset="68%" stopColor="#019ACB"/><stop offset="100%" stopColor="#016E93"/>
      </radialGradient>
      <radialGradient id="g1starG" cx="42%" cy="32%" r="70%">
        <stop offset="0%" stopColor="#FFE08A"/><stop offset="55%" stopColor="#FFC23C"/><stop offset="100%" stopColor="#EE9A1E"/>
      </radialGradient>
      <radialGradient id="g1fishG" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#5FCAEF"/><stop offset="65%" stopColor="#019ACB"/><stop offset="100%" stopColor="#0179A0"/>
      </radialGradient>
      <radialGradient id="g1flwG" cx="40%" cy="32%" r="75%">
        <stop offset="0%" stopColor="#FFA6C6"/><stop offset="55%" stopColor="#FF6FA0"/><stop offset="100%" stopColor="#E0497E"/>
      </radialGradient>
    </defs>
  </svg>
);

// Tabiiy shakllar (bolalar taniydigan). viewBox 0 0 40 40. Mevalar (apple/cherry) — realniy, gradientli.
const ICON = {
  apple: <g transform="translate(20 21)"><path d="M0 -7 C -5 -13 -11 -13 -13.5 -8 C -16.5 -2 -15.5 9 -8 14.5 C -4 17 -1.5 16.5 0 14.5 C 1.5 16.5 4 17 8 14.5 C 15.5 9 16.5 -2 13.5 -8 C 11 -13 5 -13 0 -7 Z" fill="url(#g1apA)"/><circle cx="0" cy="14.2" r="1.5" fill="rgba(110,40,20,0.45)"/><path d="M0 -8 Q1 -16 5 -18" stroke="#6E3A20" strokeWidth="2.4" fill="none" strokeLinecap="round"/><ellipse cx="9" cy="-16" rx="6" ry="3.4" fill="#2C9A57" transform="rotate(-18 9 -16)"/><ellipse cx="-6.5" cy="-1" rx="2.8" ry="6.2" fill="rgba(255,255,255,0.55)" transform="rotate(-16 -6.5 -1)"/><circle cx="-3.5" cy="-7" r="1.8" fill="rgba(255,255,255,0.7)"/></g>,
  star: <g><path d="M20 3 L24.9 14.7 L37.5 15.8 L28 24.2 L30.9 36.5 L20 29.8 L9.1 36.5 L12 24.2 L2.5 15.8 L15.1 14.7 Z" fill="url(#g1starG)" stroke="#E0992A" strokeWidth="0.8" strokeLinejoin="round"/><path d="M20 9 L22.4 15.4 L20 20 L17.6 15.4 Z" fill="rgba(255,255,255,0.38)"/></g>,
  fish: <g><path d="M26 20 L39 9 L39 31 Z" fill="url(#g1fishG)"/><ellipse cx="16" cy="20" rx="15" ry="12" fill="url(#g1fishG)"/><path d="M11 11 Q16 6 21 11" stroke="#0179A0" strokeWidth="1.8" fill="none" strokeLinecap="round"/><ellipse cx="12" cy="14.5" rx="5" ry="2.7" fill="rgba(255,255,255,0.4)"/><circle cx="8.5" cy="18" r="2.4" fill="#FFFFFF"/><circle cx="8" cy="18" r="1.2" fill="#0E0E10"/></g>,
  flower: <g><g fill="url(#g1flwG)"><ellipse cx="20" cy="10" rx="5.5" ry="8"/><ellipse cx="20" cy="10" rx="5.5" ry="8" transform="rotate(72 20 20)"/><ellipse cx="20" cy="10" rx="5.5" ry="8" transform="rotate(144 20 20)"/><ellipse cx="20" cy="10" rx="5.5" ry="8" transform="rotate(216 20 20)"/><ellipse cx="20" cy="10" rx="5.5" ry="8" transform="rotate(288 20 20)"/></g><circle cx="20" cy="20" r="6" fill="#FFC23C" stroke="#E8A92A" strokeWidth="0.8"/><circle cx="17.6" cy="17.6" r="1.8" fill="rgba(255,255,255,0.45)"/></g>,
  balloon: <g><path d="M20 27 L20 36" stroke="#A7A6A2" strokeWidth="1.4" fill="none"/><ellipse cx="20" cy="15" rx="10" ry="12" fill="#FF4F28"/><path d="M17.6 26 L22.4 26 L20 29 Z" fill="#FF4F28"/><ellipse cx="16" cy="11" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.4)"/></g>,
  cherry: <g><path d="M20 12 Q21.5 20 20 27" stroke="#3E7D2A" strokeWidth="2" fill="none" strokeLinecap="round"/><path d="M19 12 Q24 4 31.5 7.5 Q25.5 13 19 12 Z" fill="#3E9B3A"/><path d="M20.5 11 Q24.5 9 29 11" stroke="#2C7A2E" strokeWidth="0.8" fill="none" strokeLinecap="round"/><circle cx="20" cy="28" r="9" fill="url(#g1chrG)"/><ellipse cx="16.5" cy="24.5" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.6)" transform="rotate(-18 16.5 24.5)"/><circle cx="15.5" cy="22.5" r="1.4" fill="rgba(255,255,255,0.72)"/></g>,
  mango: <g><path d="M20 8 q2 -4 5 -4" stroke="#5A7D25" strokeWidth="2" fill="none" strokeLinecap="round"/><ellipse cx="26" cy="7" rx="4.5" ry="2.6" fill="#3E9B3A" transform="rotate(-20 26 7)"/><path d="M20 9 C 11 9 7 16 8 24 C 9 31 14 35 20 35 C 26 35 31 31 32 23 C 33 15 29 9 20 9 Z" fill="url(#g1mangoG)"/><ellipse cx="14" cy="17" rx="2.8" ry="6" fill="rgba(255,255,255,0.5)" transform="rotate(-18 14 17)"/><circle cx="13" cy="14" r="1.9" fill="rgba(255,255,255,0.7)"/></g>,
  grape: <g><path d="M20 11 q1 -4 4 -5" stroke="#5A7D25" strokeWidth="1.8" fill="none" strokeLinecap="round"/><ellipse cx="24" cy="7" rx="3.4" ry="2" fill="#3E9B3A" transform="rotate(-20 24 7)"/><circle cx="20" cy="24" r="9.5" fill="url(#g1grapeG)"/><ellipse cx="16" cy="20" rx="2.4" ry="3.6" fill="rgba(255,255,255,0.5)" transform="rotate(-18 16 20)"/><circle cx="15" cy="18" r="1.5" fill="rgba(255,255,255,0.72)"/></g>
};
const KIND_ORDER = ['apple', 'star', 'fish', 'flower', 'balloon'];

const ObjSvg = ({ kind }) => (
  <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">{ICON[kind] || ICON.apple}</svg>
);

const Obj = ({ kind = 'apple', i = 0, anim = 'bob' }) => (
  <span className={`g1-obj ${anim ? 'g1-' + anim : ''}`} style={{ animationDelay: `${(i % 5) * 0.16}s` }}>
    <ObjSvg kind={kind}/>
  </span>
);

// Pips — statik pips o'rniga animatsion (idle bob/twinkle). API saqlangan (n, kind).
// wrap=true -> ko'p qatorga o'raladi (tor idishda skrol bo'lmasin); aks holda bitta qator (sanash uchun).
const Pips = ({ n, kind = 'apple', anim = 'bob', wrap = false }) => (
  <div className={`g1-pips ${wrap ? 'g1-pips-wrap' : ''}`}>
    {Array.from({ length: n }).map((_, i) => <Obj key={i} kind={kind} i={i} anim={anim}/>)}
  </div>
);

// ============================================================
// ETALON KIT · BIT-KARTOCHKA + RAG'BAT — yagona reaktsiya (Bit + maqtov) barcha javob ekranlarida
// ============================================================
// Maqtov so'zlari navbat bilan (monoton bo'lmasin)
const PRAISE = { ru: ['Молодец!', 'Отлично!', 'Здорово!', 'Умница!'], uz: ['Barakalla!', 'Ajoyib!', "Zo'r!", 'Ofarin!'] };
// Rag'bat — xato javobda navbat bilan UNIKAL, to'g'ri javobga YO'NALTIRUVCHI so'z
// (javobni OCHIB QO'YMAYDI — faqat usulni ko'rsatadi: qaytadan/bittadan/diqqat bilan sana).
const ENCOURAGE = {
  ru: [
    'Почти! Посчитай ещё раз, по одному.',
    'Уже близко! Посмотри внимательно и сосчитай снова.',
    'Хорошая попытка! Считай не спеша, по порядку.',
    'Ещё чуть-чуть! Дотронься до каждого и посчитай.',
    'Молодец! Начни счёт сначала, спокойно.'
  ],
  uz: [
    'Sal qoldi! Yana bir bor, bittadan sanang.',
    'Yaqin qoldingiz! Diqqat bilan qaytadan sanang.',
    'Yaxshi urinish! Shoshmasdan, tartib bilan sanang.',
    'Ozgina qoldi! Har biriga qarab, bittadan sanang.',
    "Zo'r harakat! Sanashni boshidan, sekin boshlang."
  ]
};
let _encIdx = 0;
const nextEncourage = (lang) => { const a = ENCOURAGE[lang] || ENCOURAGE.ru; const p = a[_encIdx % a.length]; _encIdx += 1; return p; };
let _praiseIdx = 0;
const nextPraise = (lang) => { const a = PRAISE[lang] || PRAISE.ru; const p = a[_praiseIdx % a.length]; _praiseIdx += 1; return p; };

// ============================================================
// ETALON KIT · PERSONAJLAR — koddan SVG (Ra'no + Anvar + Bit). Yangi personaj — shu uslubda chiziladi.
// Uslub: sayqalli flat-vector (fotorealizm emas). Ko'z pirpiratish/qo'l silkitish — CSS animatsiya.
// Pilot: keyingi darslarga ko'chsa, shared/ ga chiqariladi.
// ============================================================

// Ra'no — KANONIK o'zbek qizcha (butun darsda bitta xil ko'rinish; DressStars ham shuni ishlatadi).
// mood: pointing | happy | encourage | celebrate. stars=true -> ko'ylakda 3 yulduz (s4 mashqi).
// Gradient soya + panjalar + oyoq soyasi (realroq). g1-eyes -> pirpiratish.
const RanoSVG = ({ mood = 'pointing', className = '', stars = false, headOnly = false }) => {
  const big = mood === 'happy' || mood === 'celebrate';
  return (
    <svg className={`g1-char g1-char-rano ${className}`} viewBox={headOnly ? '35 6 60 56' : '0 0 130 190'} aria-hidden="true">
      <defs>
        <radialGradient id="g1mskin" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#F8CBA0"/><stop offset="100%" stopColor="#E0A06E"/></radialGradient>
        <linearGradient id="g1mdress" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF92B8"/><stop offset="100%" stopColor="#E84F86"/></linearGradient>
        <linearGradient id="g1mhair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5A3A22"/><stop offset="100%" stopColor="#3A2516"/></linearGradient>
      </defs>
      <ellipse cx="64" cy="178" rx="34" ry="5" fill="rgba(58,53,48,0.13)"/>
      {/* oyoqlar + tufli */}
      <rect x="57" y="140" width="7.5" height="28" rx="3.7" fill="url(#g1mskin)"/>
      <rect x="65.5" y="140" width="7.5" height="28" rx="3.7" fill="url(#g1mskin)"/>
      <ellipse cx="60" cy="170" rx="8" ry="4.2" fill="#C23B63"/>
      <ellipse cx="70" cy="170" rx="8" ry="4.2" fill="#C23B63"/>
      {/* soch (orqa, uzun) */}
      <path d="M43 36 Q43 11 65 11 Q87 11 87 36 L87 80 Q82 66 77 62 L77 40 Q77 27 65 27 Q53 27 53 40 L53 62 Q48 66 43 80 Z" fill="url(#g1mhair)"/>
      {/* qo'llar — kayfiyatga qarab (panjalar bilan) */}
      {big ? (
        <g>
          <path d="M53 58 Q45 42 41 28" stroke="url(#g1mskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="41" cy="27" r="4.6" fill="url(#g1mskin)"/>
          <path d="M77 58 Q85 42 89 28" stroke="url(#g1mskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="89" cy="27" r="4.6" fill="url(#g1mskin)"/>
        </g>
      ) : (
        <g>
          <path d="M53 58 Q46 74 43 91" stroke="url(#g1mskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="43" cy="92" r="4.6" fill="url(#g1mskin)"/>
          <path d="M77 58 Q84 74 87 91" stroke="url(#g1mskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="87" cy="92" r="4.6" fill="url(#g1mskin)"/>
        </g>
      )}
      {/* ko'ylak + jiyak + yenglar + yoqa + belbog' */}
      <path d="M50 56 Q52 50 58 49 L72 49 Q78 50 80 56 L94 146 Q65 155 36 146 Z" fill="url(#g1mdress)"/>
      <path d="M37 140 Q65 149 93 140 L94 146 Q65 155 36 146 Z" fill="rgba(255,255,255,0.28)"/>
      <ellipse cx="51" cy="57" rx="7" ry="6" fill="url(#g1mdress)"/>
      <ellipse cx="79" cy="57" rx="7" ry="6" fill="url(#g1mdress)"/>
      <path d="M58 50 Q65 57 72 50 Q68 54 65 54 Q62 54 58 50 Z" fill="#FFFFFF"/>
      <path d="M46 67 Q65 72 84 67 L85 73 Q65 78 45 73 Z" fill="#D43E74"/>
      <circle cx="65" cy="70" r="2.6" fill="#FFD86B" stroke="#C99A2E" strokeWidth="0.8"/>
      {stars && <><DStar x={55} y={88} sc={0.46}/><DStar x={80} y={104} sc={0.46}/><DStar x={53} y={126} sc={0.46}/></>}
      {/* bosh + pigtaylar + bantik + peshona sochi */}
      <circle cx="65" cy="37" r="16.5" fill="url(#g1mskin)"/>
      <ellipse cx="45" cy="44" rx="7.5" ry="11" fill="url(#g1mhair)"/>
      <ellipse cx="85" cy="44" rx="7.5" ry="11" fill="url(#g1mhair)"/>
      <circle cx="48.5" cy="35" r="2.4" fill="#FF4F8B"/>
      <circle cx="81.5" cy="35" r="2.4" fill="#FF4F8B"/>
      <path d="M49 37 Q50 18 65 17 Q80 18 81 37 Q74 27 65 26 Q56 27 49 37 Z" fill="url(#g1mhair)"/>
      <path d="M65 16 L58 12 Q56 17 62 18 Z M65 16 L72 12 Q74 17 68 18 Z" fill="#FF4F8B"/>
      <circle cx="65" cy="16.5" r="2" fill="#E03A78"/>
      {/* yuz */}
      <g className="g1-eyes">
        <circle cx="59" cy="37" r="2.1" fill="#3A2A1E"/><circle cx="71" cy="37" r="2.1" fill="#3A2A1E"/>
        <path d="M56 33.6 Q59 32.2 61.4 33.6" stroke="#3A2A1E" strokeWidth="1" fill="none" strokeLinecap="round"/>
        <path d="M68.6 33.6 Q71 32.2 74 33.6" stroke="#3A2A1E" strokeWidth="1" fill="none" strokeLinecap="round"/>
      </g>
      <path d="M64.6 39 Q65 41 65.9 41" stroke="#C98A6A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {big
        ? <path d="M59 43 Q65 51 71 43 Q65 47 59 43 Z" fill="#C0392B"/>
        : <path d="M60 44 Q65 48 70 44" stroke="#C0392B" strokeWidth="2" fill="none" strokeLinecap="round"/>}
      <ellipse cx="54" cy="44" rx="3" ry="2" fill="rgba(255,120,120,0.4)"/>
      <ellipse cx="76" cy="44" rx="3" ry="2" fill="rgba(255,120,120,0.4)"/>
    </svg>
  );
};

// Anvar — o'zbek bolakay (Ra'no bilan bir xil uslub: gradient soya, panjalar, oyoq soyasi).
// pose: coming (yo'lda + sovg'a sumkasi) | door (qo'l silkitadi) | happy (savat + qo'l yuqori)
const AnvarSVG = ({ pose = 'coming', className = '', headOnly = false }) => {
  const happy = pose === 'happy';
  const door = pose === 'door';
  return (
    <svg className={`g1-char g1-char-anvar ${className}`} viewBox={headOnly ? '26 6 68 56' : '0 0 130 190'} aria-hidden="true">
      <defs>
        <radialGradient id="g1askin" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#F8CBA0"/><stop offset="100%" stopColor="#E0A06E"/></radialGradient>
        <linearGradient id="g1ashirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4C90E6"/><stop offset="100%" stopColor="#2C63B0"/></linearGradient>
        <linearGradient id="g1ahair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3A2E26"/><stop offset="100%" stopColor="#211915"/></linearGradient>
      </defs>
      <ellipse cx="64" cy="178" rx="32" ry="5" fill="rgba(58,53,48,0.13)"/>
      {/* oyoqlar (shim) + tufli */}
      <rect x="57" y="120" width="8" height="48" rx="3.5" fill="#46566B"/>
      <rect x="65" y="120" width="8" height="48" rx="3.5" fill="#3C4A5C"/>
      <ellipse cx="60" cy="170" rx="8" ry="4.2" fill="#22303F"/>
      <ellipse cx="70" cy="170" rx="8" ry="4.2" fill="#22303F"/>
      {/* qo'llar pozaga qarab (panjalar bilan) */}
      {pose === 'coming' && (
        <g>
          <path d="M52 60 Q46 78 44 95" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="44" cy="96" r="4.6" fill="url(#g1askin)"/>
          <path d="M78 60 Q84 78 86 95" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="86" cy="96" r="4.6" fill="url(#g1askin)"/>
        </g>
      )}
      {door && (
        <g>
          <path d="M52 60 Q46 78 44 95" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="44" cy="96" r="4.6" fill="url(#g1askin)"/>
          <g className="g1-anvar-wave">
            <path d="M78 58 Q88 44 90 30" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="90" cy="29" r="4.6" fill="url(#g1askin)"/>
          </g>
        </g>
      )}
      {happy && (
        <g>
          <path d="M52 58 Q44 42 40 28" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="40" cy="27" r="4.6" fill="url(#g1askin)"/>
          <path d="M78 58 Q86 42 90 28" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="90" cy="27" r="4.6" fill="url(#g1askin)"/>
        </g>
      )}
      {/* idle — ikkala qo'l pastga osilgan, qo'lda HECH NARSA yo'q (yerdagi savat yetarli) */}
      {pose === 'idle' && (
        <g>
          <path d="M52 60 Q46 78 44 95" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="44" cy="96" r="4.6" fill="url(#g1askin)"/>
          <path d="M78 60 Q84 78 86 95" stroke="url(#g1askin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="86" cy="96" r="4.6" fill="url(#g1askin)"/>
        </g>
      )}
      {/* futbolka + yenglar + yoqa */}
      <path d="M51 56 Q53 50 60 49 L70 49 Q77 50 79 56 L86 118 Q65 124 44 118 Z" fill="url(#g1ashirt)"/>
      <ellipse cx="52" cy="57" rx="6.5" ry="5.5" fill="url(#g1ashirt)"/>
      <ellipse cx="78" cy="57" rx="6.5" ry="5.5" fill="url(#g1ashirt)"/>
      <path d="M58 50 Q65 56 72 50 Q68 54 65 54 Q62 54 58 50 Z" fill="#1F4E8C"/>
      {/* quloq */}
      <ellipse cx="50" cy="39" rx="2.6" ry="3.6" fill="url(#g1askin)"/>
      <ellipse cx="80" cy="39" rx="2.6" ry="3.6" fill="url(#g1askin)"/>
      {/* bosh */}
      <circle cx="65" cy="37" r="16" fill="url(#g1askin)"/>
      {/* kalta soch (kepka ostidan, yon va orqada ozgina) */}
      <path d="M49 39 Q48 32 54 30 L56 37 Q52 38 50 41 Z" fill="url(#g1ahair)"/>
      <path d="M81 39 Q82 32 76 30 L74 37 Q78 38 80 41 Z" fill="url(#g1ahair)"/>
      {/* KEPKA (sport) — gumbaz + band + tugma + kozirek (o'g'il bola) */}
      <path d="M47 34 Q47 15 65 14 Q83 15 83 34 Q65 28 47 34 Z" fill="#2C7BD6"/>
      <path d="M47 34 Q49 20 60 15 Q55 19 52 25 Q49 30 49 35 Z" fill="#2569B8"/>
      <rect x="47" y="32" width="36" height="4" rx="2" fill="#2569B8"/>
      <circle cx="65" cy="14.5" r="2.2" fill="#2569B8"/>
      <path d="M47 35 Q31 36 27 42 Q42 45 50 39 Z" fill="#2569B8"/>
      <path d="M47 35 Q34 36 29 41 Q42 42 49 38 Z" fill="#1E5599"/>
      {/* qosh (kiprik emas — o'g'il bola) */}
      <g stroke="#3A2A1E" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M55 36 Q59 34.6 62.5 36"/>
        <path d="M67.5 36 Q71 34.6 75 36"/>
      </g>
      {/* ko'zlar */}
      <g className="g1-eyes">
        <circle cx="59" cy="39" r="2.2" fill="#3A2A1E"/><circle cx="71" cy="39" r="2.2" fill="#3A2A1E"/>
        <circle cx="59.8" cy="38.2" r="0.7" fill="#fff"/><circle cx="71.8" cy="38.2" r="0.7" fill="#fff"/>
      </g>
      <path d="M64.6 39 Q65 41 65.9 41" stroke="#C98A6A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {happy
        ? <path d="M59 43 Q65 51 71 43 Q65 47 59 43 Z" fill="#C0392B"/>
        : <path d="M60 44 Q65 48 70 44" stroke="#C0392B" strokeWidth="2" fill="none" strokeLinecap="round"/>}
      <ellipse cx="54" cy="44" rx="3" ry="2" fill="rgba(255,120,120,0.34)"/>
      <ellipse cx="76" cy="44" rx="3" ry="2" fill="rgba(255,120,120,0.34)"/>
      {/* coming: sovg'a sumkasi (qo'lда) */}
      {pose === 'coming' && <g><rect x="30" y="98" width="22" height="20" rx="3" fill="#E0563B"/><path d="M30 105 h22" stroke="#fff" strokeWidth="2"/><path d="M37 98 q4 -7 8 0" stroke="#B23A26" strokeWidth="2.4" fill="none"/></g>}
      {/* happy: olma savati — to'qimali, gardishli, dastali */}
      {happy && (
        <g>
          {/* tana (konus) */}
          <path d="M44 153 h42 l-5 27 a4 4 0 0 1 -4 3 h-24 a4 4 0 0 1 -4 -3 Z" fill="#C8893E"/>
          {/* to'qima: gorizontal qatorlar + vertikal o'rim */}
          <g stroke="#8F5E26" strokeWidth="0.9" opacity="0.55" fill="none" strokeLinecap="round">
            <path d="M46 161 h38 M47 169 h36 M48 177 h34"/>
            <path d="M53 154 l-1.5 30 M61 154 v30 M69 154 v30 M77 154 l1.5 30"/>
          </g>
          {/* gardish */}
          <rect x="42" y="149" width="46" height="6.5" rx="3.2" fill="#B07636"/>
          {/* dasta */}
          <path d="M51 150 q14 -15 28 0" stroke="#9A6428" strokeWidth="3.2" fill="none" strokeLinecap="round"/>
          {/* olmalar (gardishdan ko'rinadi) */}
          <circle cx="55" cy="147" r="5" fill="#E0563B"/><circle cx="65" cy="145" r="5.5" fill="#E0563B"/><circle cx="75" cy="147" r="5" fill="#E0563B"/>
          <ellipse cx="63" cy="143.5" rx="1.6" ry="2.4" fill="rgba(255,255,255,0.5)"/>
          <path d="M65 140 q1.5 -3 4 -2.5" stroke="#1F7A4D" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        </g>
      )}
    </svg>
  );
};

// Bit — robot-yordamchi/boshlovchi (gradient korpus, panjalar, oyoq soyasi, ekran porlashi).
// state: present (salomlashadi) | happy (to'g'ri javob) | hint (xato/yordam)
const BitSVG = ({ state = 'present', className = '' }) => (
  <svg className={`g1-char g1-char-bit ${className}`} viewBox="0 0 120 150" aria-hidden="true">
    <defs>
      <linearGradient id="g1bbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E2ECF2"/><stop offset="100%" stopColor="#B6C7D2"/></linearGradient>
      <linearGradient id="g1bhead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EBF2F6"/><stop offset="100%" stopColor="#C4D3DC"/></linearGradient>
    </defs>
    <ellipse cx="60" cy="140" rx="30" ry="5" fill="rgba(58,53,48,0.13)"/>
    {/* antenna */}
    <g className="g1-bit-ant">
      <path d="M60 30 V14" stroke="#9FB3BF" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="60" cy="11" r="6" fill="#FF4F28"/>
      <circle cx="58" cy="9" r="2" fill="#FFB9A6"/>
    </g>
    {/* oyoqchalar */}
    <rect x="44" y="118" width="12" height="16" rx="5" fill="#9FB3BF"/>
    <rect x="64" y="118" width="12" height="16" rx="5" fill="#9FB3BF"/>
    {/* tana */}
    <rect x="34" y="60" width="52" height="62" rx="18" fill="url(#g1bbody)" stroke="#A9BCC8" strokeWidth="2"/>
    <rect x="44" y="104" width="32" height="10" rx="5" fill="#A9BCC8" opacity="0.5"/>
    {/* qo'llar + panjalar (state) */}
    {state === 'happy' && (
      <g>
        <path d="M36 74 C 26 66 22 56 22 48" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="22" cy="47" r="5" fill="#B6C7D2"/>
        <path d="M84 74 C 94 66 98 56 98 48" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="98" cy="47" r="5" fill="#B6C7D2"/>
      </g>
    )}
    {state === 'present' && (
      <g>
        <path d="M36 76 C 28 84 26 94 30 102" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="30" cy="103" r="5" fill="#B6C7D2"/>
        <g className="g1-bit-wave"><path d="M84 74 C 96 66 100 54 98 44" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="98" cy="43" r="5" fill="#B6C7D2"/></g>
      </g>
    )}
    {state === 'hint' && (
      <g>
        <path d="M36 76 C 28 84 26 94 30 102" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="30" cy="103" r="5" fill="#B6C7D2"/>
        <path d="M84 74 C 92 64 96 54 95 46" stroke="#9FB3BF" strokeWidth="7" strokeLinecap="round" fill="none"/><circle cx="95" cy="45" r="5" fill="#B6C7D2"/>
      </g>
    )}
    {/* bosh */}
    <rect x="28" y="28" width="64" height="46" rx="16" fill="url(#g1bhead)" stroke="#A9BCC8" strokeWidth="2"/>
    {/* ekran-yuz + porlash */}
    <rect x="36" y="36" width="48" height="30" rx="10" fill="#16242C"/>
    <path d="M40 40 h18 a4 4 0 0 1 -4 8 h-14 Z" fill="rgba(255,255,255,0.08)"/>
    <g className="g1-eyes" fill="#5BD6F2">
      {state === 'hint'
        ? <><circle cx="50" cy="50" r="4.5"/><circle cx="70" cy="49" r="5.5"/></>
        : <><circle cx="50" cy="50" r="5"/><circle cx="70" cy="50" r="5"/></>}
    </g>
    {state === 'happy' && <path d="M50 58 Q60 65 70 58" stroke="#5BD6F2" strokeWidth="2.6" fill="none" strokeLinecap="round"/>}
    {state === 'present' && <path d="M52 58 h16" stroke="#5BD6F2" strokeWidth="2.6" strokeLinecap="round"/>}
    {state === 'hint' && <circle cx="60" cy="59" r="2.4" fill="#5BD6F2"/>}
    {/* hint: yordam belgisi */}
    {state === 'hint' && <g><circle cx="99" cy="38" r="9" fill="#FFC23C"/><text x="99" y="42.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#5A3A00">?</text></g>}
  </svg>
);

// Personaj holatini butun urok darajasida boshqaruvchi kontekst.
// Har bir ekran o'z holatini e'lon qiladi (useHero), bitta doimiy overlay ko'rsatadi.
const HeroContext = createContext({ setMood: () => {} });
const useHero = (mood) => {
  const { setMood } = useContext(HeroContext);
  useEffect(() => { setMood(mood); }, [mood, setMood]);
};
// Overlay personaj (pastki-chap): o'quv ekranlarida Ra'no (syujet ichi), ramkada Bit (boshlovchi).
// 'present' — Bit BOSHLOVCHI (sIntro/sGuest/s11). Reaksiyada Bit endi OVERLAY emas, KARTOCHKADA (Reaction).
// Overlay faqat BIT (boshlovchi, 'present' — ramka ekranlari). Ra'no overlay olib tashlandi
// (metodist talabi): Ra'no endi faqat frame ichidagi cast'da; reaksiya — Bit-kartochkada.
const StageHero = ({ mood }) => {
  if (mood !== 'present') return null;
  return (
    <div className="g1-stage-hero g1-sh-present" aria-hidden="true">
      <BitSVG state="present" className="g1-hero-bit"/>
    </div>
  );
};

// Confetti — bayram bo'laklari (qayta ishlatiladigan)
const Confetti = () => (
  <>
    <span className="g1-conf g1-conf1"/><span className="g1-conf g1-conf2"/><span className="g1-conf g1-conf3"/>
    <span className="g1-conf g1-conf4"/><span className="g1-conf g1-conf5"/><span className="g1-conf g1-conf6"/>
  </>
);

// Reaction — javob otkligi: Bit-KARTOCHKA (matn + o'ngda animatsion Bit), 5-sinf fakt-kartochka uslubi.
// To'g'ri -> Bit happy (sakraydi); xato -> Bit hint (yordam, qiyshayadi). Ra'no overlay ham reaksiya qiladi.
const Reaction = ({ state, praise }) => {
  const ok = state === 'correct';
  useHero(ok ? 'happy' : 'encourage');
  return (
    <div className={`g1-bitcard ${ok ? 'g1-bitcard-ok' : 'g1-bitcard-enc'}`}>
      <div className="g1-bitcard-fig"><BitSVG state={ok ? 'happy' : 'hint'}/></div>
      <div className="g1-bitcard-body"><span className="g1-bitcard-txt">{praise}</span></div>
    </div>
  );
};

// CountDemo — jonli sanash: narsalar birma-bir paydo (loop), katta son. variety=har xil narsa.
const CountDemo = ({ max = 5, kind = 'apple', variety = false, highlightLast = false, stepMs = 1300, onDone, showNumbers = true }) => {
  const k = useCountOnce(max, { stepMs });
  const firedRef = useRef(false);
  useEffect(() => { if (k >= max && !firedRef.current) { firedRef.current = true; if (onDone) onDone(); } }, [k, max, onDone]);
  return (
    <div className="g1-demo">
      <div className="g1-demo-row">
        {Array.from({ length: max }).map((_, i) => {
          const on = i < k;
          const isLast = i === k - 1;
          const kk = variety ? KIND_ORDER[i % KIND_ORDER.length] : kind;
          return (
            <span key={i} className={`g1-demo-cell ${on ? 'on' : ''} ${on && isLast && highlightLast ? 'pulse' : ''}`}>
              <ObjSvg kind={kk}/>
              {on && showNumbers && <span className="g1-demo-tag mono">{i + 1}</span>}
            </span>
          );
        })}
      </div>
      {showNumbers && <div className={`g1-demo-num mono ${highlightLast ? 'big' : ''}`}>{k}</div>}
    </div>
  );
};

// CountExamples — bir nechta misolni ketma-ket sanaydi (har xil narsa), so'ng onDone.
// "Sonlar bilan hamma narsani sanaymiz" g'oyasi uchun. reduced-motion -> oxirgi misol + onDone.
const S1_EXAMPLES = [{ n: 2, kind: 'flower' }, { n: 3, kind: 'apple' }, { n: 4, kind: 'star' }, { n: 5, kind: 'fish' }];
const CountExamples = ({ examples, onDone, stepMs = 680, pauseMs = 1100 }) => {
  const reduced = usePrefersReducedMotion();
  const [ei, setEi] = useState(0);
  const [k, setK] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (reduced) {
      const id = setTimeout(() => { setEi(examples.length - 1); setK(examples[examples.length - 1].n); if (onDone) onDone(); }, 0);
      return () => clearTimeout(id);
    }
    let alive = true; let timer; let e = 0; let c = 0;
    const tick = () => {
      if (!alive) return;
      setEi(e); setK(c);
      const n = examples[e].n;
      if (c < n) { c += 1; timer = setTimeout(tick, stepMs); return; }
      if (e < examples.length - 1) { e += 1; c = 0; timer = setTimeout(tick, pauseMs); return; }
      if (!doneRef.current) { doneRef.current = true; if (onDone) onDone(); }
    };
    timer = setTimeout(tick, 550);
    return () => { alive = false; clearTimeout(timer); };
  }, [examples, onDone, reduced, stepMs, pauseMs]);
  const cur = examples[ei];
  return (
    <div className="g1-demo">
      <div className="g1-demo-row">
        {Array.from({ length: cur.n }).map((_, i) => {
          const on = i < k;
          return (
            <span key={i} className={`g1-demo-cell ${on ? 'on' : ''}`}>
              <ObjSvg kind={cur.kind}/>
              {on && <span className="g1-demo-tag mono">{i + 1}</span>}
            </span>
          );
        })}
      </div>
      <div className="g1-demo-num mono">{k}</div>
    </div>
  );
};

// CountTrack — son qatori: belgi oldinga (1->5), 5 da pauza, keyin orqaga (5->1).
// speak=true bo'lsa, har songa kelganda o'sha son ovozda aytiladi (vizual bilan sinxron).
// Yo'nalish yorlig'i ko'rinadi; demo kuzatish uchun takrorlanadi. reduced-motion -> statik.
const CountTrack = ({ max = 5, speak = false, muted = false, startDelay = 650, onDone, started = true }) => {
  const lang = useLang();
  const reduced = usePrefersReducedMotion();
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState(0);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    if (!started) return;   // "Boshlash" bosilmaguncha turadi (statik qator)
    if (reduced) { const id = setTimeout(() => { setPos(0); setDir(0); if (onDone) onDone(); }, 0); return () => clearTimeout(id); }
    const steps = [];
    for (let n = 1; n <= max; n += 1) steps.push({ n, d: 1 });
    for (let n = max - 1; n >= 1; n -= 1) steps.push({ n, d: -1 });
    let alive = true; let timer; let i = 0; let fired = false;
    const tick = () => {
      if (!alive) return;
      if (i >= steps.length) {
        if (!fired) { fired = true; if (onDone) onDone(); }   // birinchi sweep tugadi
        setPos(0); setDir(0); timer = setTimeout(() => { i = 0; tick(); }, 1700); return;
      }
      const s = steps[i];
      setPos(s.n); setDir(s.d);
      if (speak && !mutedRef.current) { const e = getAudioEngine(); if (e) e.pushOneOff(NUM_WORDS[lang][s.n]); }
      const atPeak = s.n === max && s.d === 1;   // 5 da pauza
      i += 1;
      timer = setTimeout(tick, atPeak ? 1500 : 900);
    };
    timer = setTimeout(tick, startDelay);
    return () => { alive = false; clearTimeout(timer); };
  }, [max, reduced, speak, lang, startDelay, onDone, started]);
  const label = dir > 0 ? (lang === 'uz' ? 'Oldinga' :'Вперёд') : dir < 0 ? (lang === 'uz' ? 'Orqaga' :'Назад') : ' ';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(10px, 2vw, 14px)' }}>
      <div className={`g1-track-label mono ${dir < 0 ? 'back' : ''}`}>
        {dir > 0 ? '→ ' : dir < 0 ? '← ' : ''}{label}
      </div>
      <div className="g1-track">
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const active = pos === n;
          return <div key={n} className={`g1-track-tile ${active ? 'active ' + (dir > 0 ? 'fwd' : 'back') : ''}`}><span className="mono">{n}</span></div>;
        })}
      </div>
    </div>
  );
};

// MissingTrack — son qatori bo'sh joy bilan (figura: 1 2 ? 4 5).
// solved bo'lsa, bo'sh joyga javob (yashil) paydo bo'ladi.
const MissingTrack = ({ seq, answer, solved }) => (
  <div className="g1-track">
    {seq.map((v, i) => {
      if (v === '?' && solved && answer != null) {
        return <div key={i} className="g1-track-tile g1-track-filled g1-pop-in"><span className="mono">{answer}</span></div>;
      }
      return <div key={i} className={`g1-track-tile ${v === '?' ? 'gap' : ''}`}><span className="mono">{v}</span></div>;
    })}
  </div>
);

// CountingHand — realroq qo'l: teri rangli kaft + yumaloq barmoqlar (cho'zilgan/bukilgan).
// Barmoqlar 1..max bir marta ko'tariladi (5 da bosh barmoq ham). Darslik 2-bob 13-dars.
const CountingHand = ({ max = 5, big = false, loop = false }) => {
  const k = useCountOnce(max, { stepMs: 950, loop, holdMs: 1700 });
  const SKIN = '#F4BC8E', SKIN2 = '#E3A678', NAIL = '#FCE6D6';
  const palmTop = 86, bottom = 124;
  const fingers = [
    { x: 42, up: 50 },  // ko'rsatkich
    { x: 63, up: 62 },  // o'rta (eng uzun)
    { x: 84, up: 52 },  // nomsiz
    { x: 105, up: 40 }, // jimjiloq
  ];
  const upCount = Math.min(k, 4);
  const thumbUp = k >= 5;
  const ftrans = { transition: 'y 0.32s cubic-bezier(0.34,1.4,0.64,1), height 0.32s cubic-bezier(0.34,1.4,0.64,1), fill 0.3s ease' };
  return (
    <div className={`g1-hand ${big ? 'g1-hand-big' : ''}`}>
      <svg viewBox="0 0 162 184" width="100%" height="100%" aria-hidden="true">
        {/* bilak */}
        <rect x="60" y="150" width="46" height="32" rx="14" fill={SKIN2}/>
        {/* barmoqlar (bukilgan = kalta + to'qroq) */}
        {fingers.map((f, i) => {
          const up = i < upCount;
          const tip = palmTop - (up ? f.up : 18);
          return (
            <g key={i}>
              <rect x={f.x} y={tip} width="17" height={bottom - tip} rx="8.5" fill={up ? SKIN : SKIN2} style={ftrans}/>
              {up && <rect x={f.x + 3.5} y={tip + 6} width="10" height="13" rx="5" fill={NAIL}/>}
            </g>
          );
        })}
        {/* kaft */}
        <rect x="34" y="82" width="94" height="80" rx="34" fill={SKIN}/>
        <path d="M52 118 q29 11 56 0" stroke={SKIN2} strokeWidth="2.4" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M58 134 q23 8 46 0" stroke={SKIN2} strokeWidth="2.2" fill="none" opacity="0.42" strokeLinecap="round"/>
        {/* bosh barmoq (5 da chiqadi) */}
        <g transform={thumbUp ? 'rotate(-42 44 124)' : ''} style={{ transition: 'transform 0.32s ease' }}>
          <rect x={thumbUp ? 14 : 30} y={thumbUp ? 92 : 108} width="18" height={thumbUp ? 50 : 18} rx="9" fill={thumbUp ? SKIN : SKIN2} style={{ transition: 'fill 0.3s ease' }}/>
          {thumbUp && <rect x="18" y="97" width="10" height="13" rx="5" fill={NAIL}/>}
        </g>
      </svg>
      <div className="g1-hand-num mono">{k}</div>
    </div>
  );
};

// DressStars — Ra'no yulduzli ko'ylakda; 3 yulduz ko'ylak ichida sochilgan.
// happy=true (to'g'ri javob): qiz qo'llarini ko'taradi, sakraydi, "Molodec/Ajoyib" chiqadi.
const DStar = ({ x, y, sc }) => (
  <g transform={`translate(${x} ${y}) scale(${sc})`}>
    <g transform="translate(-20 -21)">
      <path d="M20 3 L24.9 14.7 L37.5 15.8 L28 24.2 L30.9 36.5 L20 29.8 L9.1 36.5 L12 24.2 L2.5 15.8 L15.1 14.7 Z" fill="url(#g1starG)" stroke="#E0992A" strokeWidth="0.8" strokeLinejoin="round"/>
      <path d="M20 9 L22.4 15.4 L20 20 L17.6 15.4 Z" fill="rgba(255,255,255,0.38)"/>
    </g>
  </g>
);
// DressStars — s4 mashqi: kanonik Ra'no (xush holatda) + ko'ylakda 3 yulduz + xursand uchqunlari.
// Yagona Ra'no manbai — RanoSVG (boshqa joydagi Ra'no bilan AYNAN bir xil).
// DressStars — s4 figura: boshqa slaydlarda ISHLAYOTGAN cast tuzilishini aynan ishlatadi
// (g1-cast + g1-cast-fig idle). Shu sabab animatsiya kafolatli (xuddi slayd 1/13/15 dagidek).
const DressStars = ({ happy = false }) => (
  <div className="g1-cast in" style={{ position: 'relative' }}>
    <div className="g1-cast-fig" style={{ height: 'clamp(160px, 40vw, 250px)' }}>
      <RanoSVG mood={happy ? 'happy' : 'pointing'} stars className="g1-cast-svg"/>
    </div>
    {happy && (
      <>
        <span className="g1-spark g1-spark1"/><span className="g1-spark g1-spark2"/><span className="g1-spark g1-spark3"/>
        <span className="g1-conf g1-conf1"/><span className="g1-conf g1-conf2"/><span className="g1-conf g1-conf3"/>
        <span className="g1-conf g1-conf4"/><span className="g1-conf g1-conf5"/><span className="g1-conf g1-conf6"/>
      </>
    )}
  </div>
);

// ETALON KIT · WIDGET · BasketArt — chinakam SVG savat (egma dasta + konus tana + egri to'qima + oval gardish).
// Olmalar buning ustiga (g1-rb-bowl) qo'yiladi — gardishdan ko'rinib turadi.
const BasketArt = () => (
  <svg className="g1-rb-svg" viewBox="0 0 220 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs>
      <linearGradient id="g1baskBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D89A4C"/><stop offset="100%" stopColor="#B0712C"/></linearGradient>
    </defs>
    {/* dasta */}
    <path d="M62 86 Q110 14 158 86" fill="none" stroke="#90591D" strokeWidth="12" strokeLinecap="round"/>
    <path d="M62 86 Q110 22 158 86" fill="none" stroke="#C68E42" strokeWidth="4.5" strokeLinecap="round" opacity="0.7"/>
    {/* tana (konus, yumaloq tag) */}
    <path d="M30 84 Q110 72 190 84 L173 144 Q170 156 158 158 Q110 164 62 158 Q50 156 47 144 Z" fill="url(#g1baskBody)" stroke="#8A561B" strokeWidth="2"/>
    {/* to'qima — gorizontal egri qatorlar */}
    <g fill="none" stroke="#8A561B" strokeWidth="1.6" opacity="0.45">
      <path d="M41 100 Q110 89 179 100"/>
      <path d="M44 114 Q110 104 176 114"/>
      <path d="M47 128 Q110 119 173 128"/>
      <path d="M50 142 Q110 134 170 142"/>
    </g>
    {/* to'qima — vertikal o'rim */}
    <g fill="none" stroke="#8A561B" strokeWidth="1.2" opacity="0.32">
      <path d="M72 86 L68 152"/><path d="M91 84 L89 156"/><path d="M110 83 V158"/><path d="M129 84 L131 156"/><path d="M148 86 L152 152"/>
    </g>
    {/* gardish (oval old lab) */}
    <path d="M28 82 Q110 98 192 82 L192 94 Q110 110 28 94 Z" fill="#B5793A" stroke="#8A561B" strokeWidth="1.5"/>
    <path d="M32 84 Q110 98 188 84" fill="none" stroke="#EAB97A" strokeWidth="2" opacity="0.6"/>
  </svg>
);

// BasketRimFront — savatning faqat OLD labi (gardish), mevalar USTIga chiziladi -> mevalar
// savat ichida "tiqilgan" ko'rinadi (yon ko'rinish sahna savatlari uchun). viewBox BasketArt bilan bir xil.
const BasketRimFront = () => (
  <svg className="d4-rimfront" viewBox="0 0 220 170" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <path d="M28 82 Q110 98 192 82 L192 94 Q110 110 28 94 Z" fill="#B5793A" stroke="#8A561B" strokeWidth="1.5"/>
    <path d="M32 84 Q110 98 188 84" fill="none" stroke="#EAB97A" strokeWidth="2" opacity="0.6"/>
  </svg>
);

// BasketCelebration — yakuniy testда to'g'ri javobdan keyin: savat ko'tariladi, olmalar
// birma-bir sekin tushadi (ko'z charchamaydi). reduced-motion -> darrov.
const BasketCelebration = ({ n = 5 }) => (
  <div className="g1-celebrate" style={{ position: 'relative' }}>
    <Confetti/>
    <div className="g1-realbasket g1-celebrate-basket">
      <BasketArt/>
      <div className="g1-rb-bowl">
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className="g1-token-obj g1-celebrate-apple" style={{ animationDelay: `${0.6 + i * 0.45}s` }}><ObjSvg kind="mango"/></span>
        ))}
      </div>
    </div>
  </div>
);

// AmbientBg — bo'sh joyni to'ldiruvchi yengil suzuvchi shakllar (dekor, reduced-motion bilan o'chadi).
const AmbientBg = () => (
  <div className="amb" aria-hidden="true">
    <div className="amb-o amb-o1"/>
    <div className="amb-o amb-o2"/>
    <div className="amb-o amb-o3"/>
  </div>
);

// ============================================================
// GameDrill — drag+tap o'yin bloki (4 mashq): olma yig'ish / pazl / juftlash / tartiblash.
// Drag (pointer events, touch'da ishlaydi) + TAP-zaxira (tok bos -> zona bos). Ball yo'q.
// ============================================================
const PIECE_COLORS = ['#FF4F28', '#019ACB', '#1F7A4D', '#FFC23C', '#FF7AA8'];
const FLOWER_POS = [[50, 14], [82, 40], [69, 80], [31, 80], [18, 40]];   // 5 bargcha joylashuvi (% )
const GAME_EX = [
  // savat: chalg'ituvchilar orasidan kerakli narsalarni topib sanab solish
  { type: 'basket', targets: { apple: 3, cherry: 2 }, tray: [{ kind: 'apple', count: 5 }, { kind: 'cherry', count: 4 }, { kind: 'star', count: 3 }, { kind: 'fish', count: 2 }] },
  { type: 'puzzle', n: 5 },
  { type: 'match', groups: [2, 4, 5] },
  { type: 'order', n: 5 },
];
const kindOfId = (id) => id.replace(/[0-9]+$/, '');
const exTokens = (ex) => {
  if (ex.type === 'basket') {
    const toks = [];
    ex.tray.forEach((g) => { for (let i = 0; i < g.count; i += 1) toks.push({ id: `${g.kind}${i}`, kind: g.kind }); });
    return toks;
  }
  if (ex.type === 'puzzle') return Array.from({ length: ex.n }, (_, i) => ({ id: `p${i}`, color: PIECE_COLORS[i % PIECE_COLORS.length] }));
  if (ex.type === 'match') return ex.groups.map((v) => ({ id: `n${v}`, value: v }));
  return [1, 2, 3, 4, 5].map((v) => ({ id: `o${v}`, value: v }));   // order (natural; tray aralashadi)
};
const exZones = (ex) => {
  if (ex.type === 'basket') return [{ id: 'basket' }];
  if (ex.type === 'puzzle') return Array.from({ length: ex.n }, (_, i) => ({ id: `s${i}` }));
  if (ex.type === 'match') return ex.groups.map((v) => ({ id: `b${v}`, count: v }));
  return [1, 2, 3, 4, 5].map((i) => ({ id: `z${i}`, order: i }));
};
const exComplete = (ex, placement) => {
  if (ex.type === 'basket') {
    const cnt = (k) => Object.keys(placement).filter((tid) => placement[tid] === 'basket' && kindOfId(tid) === k).length;
    return Object.keys(ex.targets).every((k) => cnt(k) === ex.targets[k]);
  }
  return exTokens(ex).every((tk) => placement[tk.id] != null);
};

// useDnd — pointer-drag + tap. onDrop(tokenId, zoneId|null). Tap: tok bos -> sel; zona bos -> joylash.
function useDnd(onDrop) {
  const [drag, setDrag] = useState(null);   // { id, x, y }
  const [sel, setSel] = useState(null);
  const startRef = useRef(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; }, [onDrop]);
  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => {
      const s = startRef.current;
      if (s && (Math.abs(e.clientX - s.sx) > 6 || Math.abs(e.clientY - s.sy) > 6)) s.moved = true;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : null));
    };
    const up = (e) => {
      const s = startRef.current;
      startRef.current = null;
      setDrag(null);
      if (!s) return;
      if (!s.moved) { setSel(s.id); return; }   // tap -> tanlash
      const el = (typeof document !== 'undefined') ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const z = el && el.closest ? el.closest('[data-zone]') : null;
      onDropRef.current(s.id, z ? z.getAttribute('data-zone') : null);
      setSel(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag]);
  const startDrag = (e, id) => {
    if (e.button != null && e.button !== 0) return;
    startRef.current = { id, sx: e.clientX, sy: e.clientY, moved: false };
    setDrag({ id, x: e.clientX, y: e.clientY });
  };
  const tapZone = (zoneId) => { if (sel != null) { onDropRef.current(sel, zoneId); setSel(null); } };
  return { drag, sel, startDrag, tapZone };
}

// Savatga meva qo'yishni ko'rsatuvchi qo'l-demo (mevani olib savatga tashlaydi, sikl).
const HandSvg = () => (
  <svg className="g1-bhd-hand" viewBox="0 0 24 24" fill="#FFFFFF" stroke="#5A5A60" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 9.5V4a2 2 0 0 0-4 0v10"/>
    <path d="M14 10V9a2 2 0 0 0-4 0v1"/>
    <path d="M18 11v-1a2 2 0 0 0-4 0v1"/>
    <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
  </svg>
);
const BasketHandDemo = ({ piece }) => (
  <div className="g1-bhd" aria-hidden="true">
    <div className="g1-bhd-move">
      {piece}
      <HandSvg/>
    </div>
  </div>
);

const GameDrill = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sd;
  const sfx = useSfx();
  const audio = useAudio([{ id: 'sd_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const total = GAME_EX.length;
  const [exIdx, setExIdx] = useState(0);
  const [placement, setPlacement] = useState({});   // tokenId -> zoneId
  const [solvedItem, setSolvedItem] = useState(false);
  const [wrongZone, setWrongZone] = useState(null);   // noto'g'ri sudralganda zona yumshoq tebranadi
  const [bounceTok, setBounceTok] = useState(null);   // noto'g'ri token tray'ga sakrab qaytadi
  const [demoOff, setDemoOff] = useState(false);   // qo'l-demo birinchi harakatdan keyin so'nadi
  const revealRef = useRevealScroll(solvedItem);
  const ex = GAME_EX[exIdx];
  const tokens = exTokens(ex);
  const zones = exZones(ex);
  const allDone = exIdx >= total - 1 && solvedItem;
  const tokenById = (id) => tokens.find((tk) => tk.id === id);
  const tokenInZone = (zid) => Object.keys(placement).find((tid) => placement[tid] === zid);
  const promptText = c[`q_${ex.type}`] ? t(c[`q_${ex.type}`]) : '';

  const [displayOrder, setDisplayOrder] = useState(() => exTokens(GAME_EX[0]).map((tk) => tk.id));
  const [praiseWord, setPraiseWord] = useState('');
  const shuffledRef = useRef(false);
  useEffect(() => {
    if (shuffledRef.current) return undefined;
    shuffledRef.current = true;
    const id = setTimeout(() => setDisplayOrder(shuffleArr(exTokens(GAME_EX[exIdx]).map((tk) => tk.id))), 0);
    return () => clearTimeout(id);
  }, [exIdx]);

  // har mashq savolini ovozli aytish
  const prevRef = useRef(-1);
  useEffect(() => {
    if (exIdx !== prevRef.current) {
      prevRef.current = exIdx;
      if (!audio.muted) { const e = getAudioEngine(); if (e && c[`q_${GAME_EX[exIdx].type}`]) e.pushOneOff(c[`q_${GAME_EX[exIdx].type}`][lang]); }
    }
  }, [exIdx, audio.muted, lang, c]);

  const placedKind = (kind) => Object.keys(placement).filter((tid) => placement[tid] === 'basket' && kindOfId(tid) === kind).length;
  const accept = (tokenId, zoneId) => {
    const tok = tokenById(tokenId);
    if (!tok) return false;
    if (ex.type === 'basket') return zoneId === 'basket' && (ex.targets[tok.kind] || 0) > placedKind(tok.kind);
    if (ex.type === 'puzzle') return zones.some((z) => z.id === zoneId) && tokenInZone(zoneId) == null;
    if (ex.type === 'match') { const z = zones.find((zz) => zz.id === zoneId); return !!z && z.count === tok.value; }
    const zo = zones.find((zz) => zz.id === zoneId);
    return !!zo && zo.order === tok.value && tokenInZone(zoneId) == null;
  };
  const handleDrop = useCallback((tokenId, zoneId) => {
    if (solvedItem || !zoneId) return;   // darrov ishlaydi (canAns darvozasi yo'q)
    if (placement[tokenId]) return;
    if (!accept(tokenId, zoneId)) {   // yumshoq: token tray'ga sakrab qaytadi, zona tebranadi, ovoz "yana sana"
      sfx.playWrong();
      setBounceTok(tokenId); setTimeout(() => setBounceTok(null), 500);
      setWrongZone(zoneId); setTimeout(() => setWrongZone(null), 450);
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.retry_audio[lang]); }
      return;
    }
    setPlacement((prev) => ({ ...prev, [tokenId]: zoneId }));
    if (!audio.muted) {
      const e = getAudioEngine();
      if (e) {
        if (ex.type === 'basket') { const tk = tokenById(tokenId); if (tk) e.pushOneOff(NUM_WORDS[lang][placedKind(tk.kind) + 1] || ''); }   // shu turdan nechinchi
        else if (ex.type === 'match' || ex.type === 'order') { const tk = tokenById(tokenId); if (tk && tk.value) e.pushOneOff(NUM_WORDS[lang][tk.value] || ''); }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solvedItem, placement, exIdx, audio.muted, lang]);
  const dnd = useDnd(handleDrop);

  // tugallanganini aniqlash
  useEffect(() => {
    if (solvedItem) return undefined;
    const done = exComplete(GAME_EX[exIdx], placement);
    if (!done) return undefined;
    const tm = setTimeout(() => {
      setSolvedItem(true);
      sfx.playCorrect();
      const pw = nextPraise(lang); setPraiseWord(pw);
      if (!audio.muted) { const e = getAudioEngine(); if (e) { e.pushOneOff(pw); e.pushOneOff((exIdx >= total - 1 ? c.done_text : c.correct_text)[lang]); } }
    }, 0);
    return () => clearTimeout(tm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, solvedItem, exIdx]);

  const nextItem = () => {
    const ni = exIdx + 1;
    setExIdx(ni);
    setDisplayOrder(shuffleArr(exTokens(GAME_EX[ni]).map((tk) => tk.id)));
    setPlacement({});
    setSolvedItem(false);
    setDemoOff(false);   // har mashqда qo'l-demo qayta ko'rinadi (q1 savat, q2 pazl)
  };

  const tokenVisual = (tok) => {
    if (ex.type === 'basket') return <span className="g1-token-obj"><ObjSvg kind={tok.kind}/></span>;
    if (ex.type === 'puzzle') return <span className="g1-petal"/>;
    return <span className="g1-token-num mono">{tok.value}</span>;
  };
  const trayTokens = displayOrder.map(tokenById).filter((tk) => tk && !placement[tk.id]);

  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!allDone} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <p className="h-sub title fade-up">{promptText} <span className="mono small" style={{ color: T.ink3 }}>{exIdx + 1} / {total}</span></p>

        {/* nishon (zonalar) */}
        <div className="frame fade-up delay-1" style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: 'clamp(12px, 2.4vw, 18px)' }}>
          {(ex.type === 'basket' || ex.type === 'puzzle') && exIdx <= 1 && !demoOff && !solvedItem && Object.keys(placement).length === 0 && (
            <BasketHandDemo piece={ex.type === 'basket'
              ? <span className="g1-bhd-apple"><ObjSvg kind="mango"/></span>
              : <span className="g1-bhd-petal"/>}/>
          )}
          {ex.type === 'basket' && (
            <div className="g1-basketwrap">
              <div className="g1-recipe">
                {Object.keys(ex.targets).map((k) => (
                  <span key={k} className="g1-recipe-item">
                    <span className="g1-recipe-ic"><ObjSvg kind={k}/></span>
                    <span className="g1-recipe-cnt mono">{placedKind(k)} / {ex.targets[k]}</span>
                  </span>
                ))}
              </div>
              <div className={`g1-realbasket g1-dropzone ${wrongZone === 'basket' ? 'g1-nudge' : ''}`} data-zone="basket" onClick={() => dnd.tapZone('basket')}>
                <BasketArt/>
                <div className="g1-rb-bowl">
                  {Object.keys(placement).map((tid) => <span key={tid} className="g1-token-obj"><ObjSvg kind={kindOfId(tid)}/></span>)}
                </div>
              </div>
            </div>
          )}
          {ex.type === 'puzzle' && (
            <div className="g1-flowerwrap">
              <div className={`g1-flower ${solvedItem ? 'g1-flower-spin' : ''}`}>
                <div className="g1-flower-center"/>
                {zones.map((z, i) => {
                  const tid = tokenInZone(z.id);
                  return <div key={z.id} className={`g1-petal-slot g1-dropzone ${tid ? 'filled' : ''} ${wrongZone === z.id ? 'g1-nudge' : ''}`} data-zone={z.id}
                    style={{ left: `${FLOWER_POS[i][0]}%`, top: `${FLOWER_POS[i][1]}%` }} onClick={() => dnd.tapZone(z.id)}>
                    {tid && <span className="g1-petal g1-pop-in"/>}
                  </div>;
                })}
              </div>
              <span className="g1-basket-count mono">{Object.keys(placement).length} / {ex.n}</span>
            </div>
          )}
          {ex.type === 'match' && (
            <div className="g1-mbaskets">
              {zones.map((z) => {
                const tid = tokenInZone(z.id);
                return <div key={z.id} className={`g1-mbasket g1-dropzone ${wrongZone === z.id ? 'g1-nudge' : ''}`} data-zone={z.id} onClick={() => dnd.tapZone(z.id)}>
                  <div className="g1-mbasket-num mono">{tid ? tokenById(tid).value : ''}</div>
                  <Pips n={z.count} kind="mango"/>
                </div>;
              })}
            </div>
          )}
          {ex.type === 'order' && (
            <div className="g1-order">
              {zones.map((z) => {
                const tid = tokenInZone(z.id);
                return <div key={z.id} className={`g1-pos g1-dropzone ${tid ? 'filled' : ''} ${wrongZone === z.id ? 'g1-nudge' : ''}`} data-zone={z.id} onClick={() => dnd.tapZone(z.id)}>
                  {tid && <span className="g1-token-num mono">{tokenById(tid).value}</span>}
                </div>;
              })}
            </div>
          )}
        </div>

        {/* tray (sudraladigan tokenlar) */}
        {!solvedItem && (
          <div className="g1-tray fade-up delay-2">
            {trayTokens.map((tok) => (
              <div key={tok.id} className={`g1-token ${dnd.sel === tok.id ? 'g1-token-sel' : ''} ${bounceTok === tok.id ? 'g1-bounceback' : ''}`}
                onPointerDown={(e) => { if (!solvedItem) { e.preventDefault(); setDemoOff(true); dnd.startDrag(e, tok.id); } }}>
                {tokenVisual(tok)}
              </div>
            ))}
          </div>
        )}

        {solvedItem && (
          <div ref={revealRef} className="frame-success fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Reaction state="correct" praise={praiseWord}/>
            {!allDone && (
              <button className="btn-white-accent" onClick={nextItem}
                style={{ padding: 'clamp(8px, 1.4vw, 11px) clamp(16px, 2.2vw, 22px)', fontSize: 'clamp(12px, 1.5vw, 14px)' }}>
                {lang === 'uz' ? 'Keyingisi' : 'Дальше'}
              </button>
            )}
          </div>
        )}

        {/* drag arvohi */}
        {dnd.drag && tokenById(dnd.drag.id) && (
          <div className="g1-ghost" style={{ left: `calc(${dnd.drag.x}px / var(--g1z, 1))`, top: `calc(${dnd.drag.y}px / var(--g1z, 1))` }}>{tokenVisual(tokenById(dnd.drag.id))}</div>
        )}
      </div>
    </Stage>
  );
};

// ============================================================
// EKRANLAR
// ============================================================

// ============================================================
// SYUJET (hikoya) slaydlari — interaktiv emas: sahna + matn + audio + Davom.
// "Ra'no mehmon kutmoqda" syujetining kirish va ko'prik lahzalari.
// ============================================================

// Dasturxon sahnasi — krem dasturxon BUTUN stolni yopadi (taxta ko'rinmaydi),
// haqiqiy olma shakli, aniq choynak (qopqoq + C-dasta + jo'mrak), bug' jo'mrakdan.
const DasturxonScene = () => (
  <div className="g1-table-scene">
    <svg className="g1-table-svg" viewBox="0 0 280 200" aria-hidden="true">
      <defs>
        <linearGradient id="g1clothT" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FCF6E6"/><stop offset="100%" stopColor="#F0E2C2"/>
        </linearGradient>
        <linearGradient id="g1clothS" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4E8CB"/><stop offset="100%" stopColor="#E7D5AA"/>
        </linearGradient>
        <linearGradient id="g1woodG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C68A45"/><stop offset="100%" stopColor="#8A5A28"/>
        </linearGradient>
        <linearGradient id="g1gleam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0"/>
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.75"/>
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="g1bandSh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22"/>
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0"/>
          <stop offset="100%" stopColor="#003A52" stopOpacity="0.3"/>
        </linearGradient>
        <clipPath id="g1clothClip">
          <ellipse cx="140" cy="108" rx="130" ry="19"/>
          <path d="M12 108 V148 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 V108 Z"/>
        </clipPath>
      </defs>
      {/* pol soyasi */}
      <ellipse cx="140" cy="190" rx="110" ry="6" fill="rgba(58,53,48,0.10)"/>
      {/* stol oyoqlari (dasturxon ostidan ko'rinadi) */}
      <ellipse cx="64" cy="188" rx="11" ry="3" fill="rgba(58,53,48,0.16)"/>
      <ellipse cx="216" cy="188" rx="11" ry="3" fill="rgba(58,53,48,0.16)"/>
      <rect x="57" y="144" width="14" height="42" rx="4" fill="url(#g1woodG)"/>
      <rect x="209" y="144" width="14" height="42" rx="4" fill="url(#g1woodG)"/>
      <rect x="55" y="182" width="18" height="5" rx="2.5" fill="#7A4E22"/>
      <rect x="207" y="182" width="18" height="5" rx="2.5" fill="#7A4E22"/>
      {/* dasturxon etagi (butun old yuzni yopadi, to'lqinli) */}
      <path d="M12 108 V148 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 q16 12 32 0 V108 Z" fill="url(#g1clothS)"/>
      {/* MILLIY NAQSH bezak chizig'i: ko'k zamin + oltin jiyak + romb-nuqta takrori */}
      <rect x="12" y="127" width="256" height="15" fill="#0E86B4"/>
      <rect x="12" y="127" width="256" height="15" fill="url(#g1bandSh)"/>
      <rect x="12" y="126.5" width="256" height="2" fill="#E8B24A"/>
      <rect x="12" y="140.5" width="256" height="2" fill="#E8B24A"/>
      <rect x="12" y="124.5" width="256" height="1.2" fill="#F4E8CB"/>
      {[24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264].map((x) => (
        <g key={x} transform={`translate(${x} 134.5)`}>
          {/* romb (oq jiyakli) + ko'k markaz */}
          <rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1" fill="#FCF6E6" transform="rotate(45)"/>
          <rect x="-2.4" y="-2.4" width="4.8" height="4.8" fill="#0E86B4" transform="rotate(45)"/>
          <circle r="1.1" fill="#FCF6E6"/>
        </g>
      ))}
      {[36, 60, 84, 108, 132, 156, 180, 204, 228, 252].map((x) => (
        <circle key={x} cx={x} cy="134.5" r="1.4" fill="#E8B24A"/>
      ))}
      {/* dasturxon usti (krem sirt) */}
      <ellipse cx="140" cy="108" rx="130" ry="19" fill="url(#g1clothT)" stroke="#E3D2A6" strokeWidth="1.5"/>
      <ellipse cx="116" cy="103" rx="66" ry="7" fill="rgba(255,255,255,0.32)"/>
      {/* suzib o'tuvchi yorug'lik (dasturxon ustida) */}
      <g clipPath="url(#g1clothClip)">
        <rect className="g1-table-sweep" x="0" y="86" width="30" height="70" fill="url(#g1gleam)"/>
      </g>
      {/* narsa soyalari */}
      <ellipse cx="74" cy="111" rx="27" ry="5.5" fill="rgba(58,53,48,0.11)"/>
      <ellipse cx="143" cy="113" rx="27" ry="6" fill="rgba(58,53,48,0.11)"/>
      <ellipse cx="214" cy="113" rx="26" ry="5.5" fill="rgba(58,53,48,0.11)"/>
      {/* NON (lochira: jiyak + bosma markaz + kunjut) */}
      <g className="g1-table-non">
        <ellipse cx="74" cy="90" rx="27" ry="22" fill="url(#g1nonG)" stroke="#A86B28" strokeWidth="1.6"/>
        <ellipse cx="74" cy="90" rx="13" ry="10.5" fill="#C9923F"/>
        <ellipse cx="74" cy="90" rx="13" ry="10.5" fill="none" stroke="#A86B28" strokeWidth="1.2" strokeDasharray="2 3"/>
        <g fill="#A06A28">
          <circle cx="74" cy="71.5" r="1.4"/><circle cx="58" cy="80" r="1.4"/><circle cx="55" cy="93" r="1.4"/>
          <circle cx="62" cy="103" r="1.4"/><circle cx="86" cy="103" r="1.4"/><circle cx="93" cy="93" r="1.4"/><circle cx="90" cy="80" r="1.4"/>
        </g>
        <ellipse cx="64" cy="80" rx="7" ry="3.4" fill="rgba(255,255,255,0.20)"/>
      </g>
      {/* CHOYNAK: dasta (orqada) -> tana -> jo'mrak -> qopqoq */}
      <g>
        <path d="M123 80 C 104 82 104 106 123 106" stroke="url(#g1teaG)" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
        <ellipse cx="143" cy="93" rx="24" ry="20" fill="url(#g1teaG)"/>
        <path d="M163 83 Q177 81 181 69 L186 72 Q182 86 166 94 Z" fill="url(#g1teaG)"/>
        <ellipse cx="143" cy="75" rx="15" ry="5" fill="#0892C2"/>
        <ellipse cx="143" cy="75" rx="15" ry="5" fill="none" stroke="#016E93" strokeWidth="1"/>
        <circle cx="143" cy="69" r="4" fill="#016E93"/>
        <ellipse cx="133" cy="85" rx="7.5" ry="4.5" fill="rgba(255,255,255,0.42)"/>
        <path d="M127 99 Q143 105 159 99" stroke="rgba(255,255,255,0.45)" strokeWidth="2.6" fill="none"/>
      </g>
      {/* OLMALAR (qizil, yelkali shakl, cho'qqi botig'i + band/barg + yaltiroq) */}
      <g className="g1-table-apples">
        <g transform="translate(224 92)">
          <path d="M0 -7 C -5 -13 -11 -13 -13.5 -8 C -16.5 -2 -15.5 9 -8 14.5 C -4 17 -1.5 16.5 0 14.5 C 1.5 16.5 4 17 8 14.5 C 15.5 9 16.5 -2 13.5 -8 C 11 -13 5 -13 0 -7 Z" fill="url(#g1apA)"/>
          <circle cx="0" cy="14.2" r="1.5" fill="rgba(110,40,20,0.45)"/>
          <path d="M0 -8 Q1 -16 5 -18" stroke="#6E3A20" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
          <ellipse cx="9" cy="-16" rx="6" ry="3.4" fill="#2C9A57" transform="rotate(-18 9 -16)"/>
          <ellipse cx="-6" cy="-1" rx="2.6" ry="6" fill="rgba(255,255,255,0.5)" transform="rotate(-16 -6 -1)"/>
          <circle cx="-3" cy="-7" r="1.7" fill="rgba(255,255,255,0.65)"/>
        </g>
        <g transform="translate(205 97)">
          <path d="M0 -7 C -5 -13 -11 -13 -13.5 -8 C -16.5 -2 -15.5 9 -8 14.5 C -4 17 -1.5 16.5 0 14.5 C 1.5 16.5 4 17 8 14.5 C 15.5 9 16.5 -2 13.5 -8 C 11 -13 5 -13 0 -7 Z" fill="url(#g1apA)"/>
          <circle cx="0" cy="14.2" r="1.5" fill="rgba(110,40,20,0.45)"/>
          <path d="M0 -8 Q1 -16 5 -18" stroke="#6E3A20" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
          <ellipse cx="9" cy="-16" rx="6" ry="3.4" fill="#2C9A57" transform="rotate(-18 9 -16)"/>
          <ellipse cx="-6.5" cy="-1" rx="2.8" ry="6.2" fill="rgba(255,255,255,0.55)" transform="rotate(-16 -6.5 -1)"/>
          <circle cx="-3.5" cy="-7" r="1.8" fill="rgba(255,255,255,0.7)"/>
        </g>
      </g>
      {/* bug' (jo'mrak uchidan) — 3 ingichka tabiiy girdob, ko'tarilib tarqaydi */}
      <g className="g1-steam"><path d="M181 64 q-6 -8 0 -15 q6 -8 0 -16 q-5 -6 -1 -12" stroke="#CBD9DF" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.85"/></g>
      <g className="g1-steam g1-steam2"><path d="M188 62 q6 -8 0 -15 q-6 -8 0 -16 q5 -6 1 -12" stroke="#D8E2E7" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8"/></g>
      <g className="g1-steam g1-steam3"><path d="M184 60 q-5 -7 0 -14 q5 -7 0 -15" stroke="#E2EAEE" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"/></g>
      {/* tayyor dasturxon uchqunlari */}
      <g fill="#FFD86B">
        <path className="g1-table-spark" style={{ animationDelay: '0s' }} d="M0,-5 L1.4,-1.4 L5,0 L1.4,1.4 L0,5 L-1.4,1.4 L-5,0 L-1.4,-1.4 Z" transform="translate(70 66)"/>
        <path className="g1-table-spark" style={{ animationDelay: '0.55s' }} d="M0,-5 L1.4,-1.4 L5,0 L1.4,1.4 L0,5 L-1.4,1.4 L-5,0 L-1.4,-1.4 Z" transform="translate(143 60) scale(0.85)"/>
        <path className="g1-table-spark" style={{ animationDelay: '1s' }} d="M0,-5 L1.4,-1.4 L5,0 L1.4,1.4 L0,5 L-1.4,1.4 L-5,0 L-1.4,-1.4 Z" transform="translate(228 74) scale(0.8)"/>
      </g>
    </svg>
  </div>
);

// Mehmon sahnasi — gradientli eshik + choponli, yuzli mehmon (qo'l silkitadi, sovg'ali) + "taq-taq".
const GuestScene = () => (
  <div className="g1-guest-scene">
    <svg viewBox="0 0 240 200" aria-hidden="true">
      <defs>
        <linearGradient id="g1doorS" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B5793C"/><stop offset="100%" stopColor="#9A6430"/>
        </linearGradient>
        <linearGradient id="g1doorF" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#CE9351"/><stop offset="100%" stopColor="#A86B28"/>
        </linearGradient>
        <radialGradient id="g1skin" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F8CBA0"/><stop offset="100%" stopColor="#E0A06E"/>
        </radialGradient>
        <linearGradient id="g1robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A93DE"/><stop offset="100%" stopColor="#275FA8"/>
        </linearGradient>
        <radialGradient id="g1warm" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#FFE7AE" stopOpacity="0.9"/>
          <stop offset="60%" stopColor="#FFD27A" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#FFD27A" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* pol soyalari */}
      <ellipse cx="66" cy="178" rx="48" ry="5.5" fill="rgba(58,53,48,0.12)"/>
      <ellipse cx="170" cy="170" rx="34" ry="5" fill="rgba(58,53,48,0.12)"/>
      {/* gilamcha (ostona oldida) */}
      <ellipse cx="68" cy="183" rx="42" ry="7.5" fill="#C4452F"/>
      <ellipse cx="68" cy="183" rx="34" ry="5.2" fill="none" stroke="#F0D9A0" strokeWidth="1.4" strokeDasharray="3 3"/>
      {/* ESHIK: ramka + ichki soya + tabaqa */}
      <rect x="22" y="18" width="92" height="160" rx="6" fill="url(#g1doorF)"/>
      <rect x="28" y="24" width="80" height="154" rx="4" fill="#704626"/>
      <rect x="31" y="27" width="74" height="151" rx="4" fill="url(#g1doorS)"/>
      {/* yog'och tola chiziqlari */}
      <g stroke="#7A4E22" strokeWidth="0.8" opacity="0.38">
        <line x1="46" y1="30" x2="46" y2="175"/>
        <line x1="68" y1="30" x2="68" y2="175"/>
        <line x1="90" y1="30" x2="90" y2="175"/>
      </g>
      {/* panellar — bevel: tashqi quyuq ramka + ichki yorqin yuza */}
      <rect x="38" y="36" width="58" height="54" rx="5" fill="#8A5826" stroke="#6E4520" strokeWidth="1.5"/>
      <rect x="41" y="39" width="52" height="48" rx="4" fill="#A06A2E" stroke="rgba(255,255,255,0.16)" strokeWidth="1"/>
      <rect x="38" y="98" width="58" height="68" rx="5" fill="#8A5826" stroke="#6E4520" strokeWidth="1.5"/>
      <rect x="41" y="101" width="52" height="62" rx="4" fill="#A06A2E" stroke="rgba(255,255,255,0.16)" strokeWidth="1"/>
      {/* dasta: plastinka + dumaloq tutqich */}
      <rect x="93" y="97" width="6" height="20" rx="3" fill="#C98E33"/>
      <circle cx="96" cy="107" r="4.6" fill="#F0C24A" stroke="#B8862E" strokeWidth="1.2"/>
      <circle cx="94.5" cy="105.5" r="1.4" fill="rgba(255,255,255,0.6)"/>
      {/* ostona */}
      <rect x="20" y="176" width="96" height="5" rx="2" fill="#8A5A28"/>
      {/* iliq kutib-olish nuri (eshikdan) */}
      <ellipse className="g1-doorglow" cx="67" cy="100" rx="62" ry="78" fill="url(#g1warm)"/>
      {/* taq-taq tovush yoylari */}
      <g className="g1-knock" stroke="#8A8780" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M120 64 q7 10 0 22"/>
        <path d="M127 58 q11 16 0 34"/>
      </g>
      {/* MEHMON */}
      <g className="g1-guest">
        <path d="M152 100 Q150 95 157 93 L181 93 Q188 95 186 100 L193 156 Q195 163 186 163 L152 163 Q143 163 145 156 Z" fill="url(#g1robe)"/>
        <path d="M169 96 L169 160" stroke="rgba(0,0,0,0.12)" strokeWidth="2"/>
        <path d="M161 94 L169 102 L177 94" fill="#275FA8"/>
        {/* poyabzal (chopon etagidan ko'rinadi) */}
        <ellipse cx="160" cy="164" rx="8.5" ry="3.6" fill="#3A2A1E"/>
        <ellipse cx="178" cy="164" rx="8.5" ry="3.6" fill="#3A2A1E"/>
        <ellipse cx="158" cy="163" rx="4" ry="1.4" fill="rgba(255,255,255,0.18)"/>
        {/* pastki qo'l + sovg'a quticha */}
        <path d="M156 102 Q149 120 153 137" stroke="url(#g1robe)" strokeWidth="10" fill="none" strokeLinecap="round"/>
        <g>
          <rect x="143" y="139" width="20" height="15" rx="2.5" fill="#E8557A"/>
          <rect x="151" y="139" width="4" height="15" fill="#FBE3CF"/>
          <rect x="143" y="145" width="20" height="4" fill="#FBE3CF"/>
          <ellipse cx="149" cy="138" rx="4" ry="3" fill="#FBE3CF"/><ellipse cx="157" cy="138" rx="4" ry="3" fill="#FBE3CF"/><circle cx="153" cy="138" r="2" fill="#F0C9A0"/>
        </g>
        <circle cx="153" cy="138" r="5.5" fill="url(#g1skin)"/>
        {/* sovg'a ustida uchqunlar */}
        <g fill="#FFD86B">
          <path className="g1-giftspark" style={{ animationDelay: '0s' }} d="M0,-4 L1.1,-1.1 L4,0 L1.1,1.1 L0,4 L-1.1,1.1 L-4,0 L-1.1,-1.1 Z" transform="translate(138 131)"/>
          <path className="g1-giftspark" style={{ animationDelay: '0.5s' }} d="M0,-4 L1.1,-1.1 L4,0 L1.1,1.1 L0,4 L-1.1,1.1 L-4,0 L-1.1,-1.1 Z" transform="translate(168 134) scale(0.8)"/>
          <path className="g1-giftspark" style={{ animationDelay: '0.9s' }} d="M0,-4 L1.1,-1.1 L4,0 L1.1,1.1 L0,4 L-1.1,1.1 L-4,0 L-1.1,-1.1 Z" transform="translate(153 123) scale(0.7)"/>
        </g>
        {/* silkiydigan qo'l */}
        <g className="g1-guest-hand">
          <path d="M184 100 Q202 88 208 70" stroke="url(#g1robe)" strokeWidth="10" fill="none" strokeLinecap="round"/>
          <circle cx="209" cy="67" r="6.5" fill="url(#g1skin)"/>
        </g>
        {/* bo'yin + bosh */}
        <rect x="164" y="84" width="10" height="10" fill="#E0A06E"/>
        <circle cx="169" cy="72" r="16.5" fill="url(#g1skin)"/>
        {/* soch (chakka) */}
        <path d="M152 73 Q154 62 159 60 Q156 68 158 74 Z" fill="#3A2517"/>
        <path d="M186 73 Q184 62 179 60 Q182 68 180 74 Z" fill="#3A2517"/>
        {/* DOPPI (milliy bosh kiyim): gumbaz + jiyak + oq naqsh */}
        <path d="M151 61 Q169 39 187 61 Q169 67 151 61 Z" fill="#1E2A33"/>
        <path d="M151 61 Q169 67 187 61 L187 65 Q169 73 151 65 Z" fill="#121A22"/>
        {/* qalampir motivlari (gumbazda): oq, to'q jiyakli, markaziy tomirli */}
        <g fill="#F2F0EA" stroke="#121A22" strokeWidth="0.5" strokeLinejoin="round">
          <g transform="translate(169 56.5)"><path d="M0 1 C -2.7 -1.6 -2.7 -6.2 0 -9.4 C 2.7 -6.2 2.7 -1.6 0 1 Z"/><path d="M0 -0.5 V-8" fill="none"/></g>
          <g transform="translate(159.5 58) rotate(-26)"><path d="M0 1 C -2.3 -1.4 -2.3 -5.6 0 -8.4 C 2.3 -5.6 2.3 -1.4 0 1 Z"/><path d="M0 -0.5 V-7" fill="none"/></g>
          <g transform="translate(178.5 58) rotate(26)"><path d="M0 1 C -2.3 -1.4 -2.3 -5.6 0 -8.4 C 2.3 -5.6 2.3 -1.4 0 1 Z"/><path d="M0 -0.5 V-7" fill="none"/></g>
        </g>
        {/* band jiyagi: an'anaviy mayda kamarchalar */}
        <g fill="none" stroke="#F2F0EA" strokeWidth="0.9" strokeLinecap="round">
          <path d="M154 64.2 q1.8 -2.5 3.6 0 M159.6 64.4 q1.8 -2.5 3.6 0 M165.2 64.5 q1.8 -2.5 3.6 0 M170.8 64.5 q1.8 -2.5 3.6 0 M176.4 64.4 q1.8 -2.5 3.6 0 M182 64.2 q1.8 -2.5 3.6 0"/>
        </g>
        {/* yuz */}
        <circle cx="163" cy="71" r="1.9" fill="#3A2A1E"/>
        <circle cx="175" cy="71" r="1.9" fill="#3A2A1E"/>
        <path d="M163 78 Q169 84 175 78" stroke="#3A2A1E" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <ellipse cx="159" cy="78" rx="3" ry="2" fill="rgba(255,120,120,0.32)"/>
        <ellipse cx="179" cy="78" rx="3" ry="2" fill="rgba(255,120,120,0.32)"/>
      </g>
    </svg>
  </div>
);

// useStoryReveal — auto-zanjir audio segmentlariga bog'langan bosqichma-bosqich ochilish.
// Qaytaradi: boshlangan segmentlar soni (1-asosli). aud_0 -> 1, aud_1 -> 2, ...
// Mute yoki autoplay bloklansa / kechiksa -> hammasi ko'rinadi (personaj qotib qolmasin).
function useStoryReveal(audio, total) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (audio.muted) { setStep(total); return; }
    const cs = audio.currentSegment;
    if (!cs) return;
    const m = /(\d+)/.exec(cs);
    if (m) setStep((s) => Math.max(s, parseInt(m[1], 10) + 1));
  }, [audio.currentSegment, audio.muted, total]);
  useEffect(() => { const id = setTimeout(() => setStep((s) => Math.max(s, total)), 16000); return () => clearTimeout(id); }, [total]);
  return step;
}

// AnvarFig — Anvar SVG'ga ingichka wrapper (variant -> pose). Eski PNG placeholder olib tashlandi.
const AnvarFig = ({ variant = 'coming' }) => <AnvarSVG pose={variant} className="g1-cast-svg"/>;

// ETALON KIT · SAHNALAR · SceneBg — hikoya ekranlari uchun ORQA SAHNA (xona/eshik), personajlar oldida.
// variant: room (sIntro/s11 — deraza, parda, stol, gilam) | door (sGuest — eshik, payoff).
const SceneBg = ({ variant = 'room' }) => (
  <svg className="g1-scene-bg" viewBox="0 0 400 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect x="0" y="0" width="400" height="178" fill="#FBEFE0"/>
    <rect x="0" y="178" width="400" height="52" fill="#EAD8C2"/>
    <line x1="0" y1="178" x2="400" y2="178" stroke="#D8C2A6" strokeWidth="2"/>
    <ellipse cx="200" cy="206" rx="170" ry="14" fill="#F2D7A8" opacity="0.55"/>
    {variant === 'room' && (
      <>
        {/* deraza + parda (kichikroq, real) */}
        <rect x="34" y="40" width="66" height="56" rx="5" fill="#CBEAF5" stroke="#B9986F" strokeWidth="3"/>
        <line x1="67" y1="40" x2="67" y2="96" stroke="#B9986F" strokeWidth="2.5"/>
        <line x1="34" y1="68" x2="100" y2="68" stroke="#B9986F" strokeWidth="2.5"/>
        <circle cx="84" cy="55" r="6" fill="#FFE9A8"/>
        <path d="M28 37 q7 32 0 62 l9 0 q-6 -32 0 -62 Z" fill="#F2B8C6"/>
        <path d="M106 37 q-7 32 0 62 l-9 0 q6 -32 0 -62 Z" fill="#F2B8C6"/>
        {/* devordagi rasm — MUSHUK */}
        <rect x="306" y="42" width="54" height="50" rx="5" fill="#FFFFFF" stroke="#B9986F" strokeWidth="3"/>
        <rect x="312" y="48" width="42" height="38" rx="4" fill="#FBF1E2"/>
        <path d="M324 62 L321 52 L330 59 Z" fill="#E89A4C"/><path d="M342 62 L345 52 L336 59 Z" fill="#E89A4C"/>
        <path d="M324.5 60 L323 55.5 L327 58 Z" fill="#F4C39A"/><path d="M341.5 60 L343 55.5 L339 58 Z" fill="#F4C39A"/>
        <ellipse cx="333" cy="68" rx="13" ry="11" fill="#E89A4C"/>
        <path d="M333 58 v5 M328 59 l1 4 M338 59 l-1 4" stroke="#C97A2E" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
        <ellipse cx="328" cy="67" rx="2" ry="2.6" fill="#3A7D44"/><ellipse cx="338" cy="67" rx="2" ry="2.6" fill="#3A7D44"/>
        <circle cx="328" cy="66.3" r="0.6" fill="#fff"/><circle cx="338" cy="66.3" r="0.6" fill="#fff"/>
        <path d="M331.6 71 h2.8 l-1.4 1.6 Z" fill="#D86B6B"/>
        <path d="M333 72.6 v1.2" stroke="#9A5A2E" strokeWidth="0.9" strokeLinecap="round"/>
        <g stroke="#C97A2E" strokeWidth="0.7" strokeLinecap="round"><path d="M327 71 l-7 -1 M327 73 l-7 1"/><path d="M339 71 l7 -1 M339 73 l7 1"/></g>
        {/* stol — alohida DasturxonScene bilan qo'yiladi (g1-scene-table) */}
      </>
    )}
    {variant === 'door' && (
      <>
        {/* eshik (markazda) — pastroq/qisqaroq (tepaga cho'zilmaydi) */}
        <rect x="178" y="66" width="52" height="112" rx="5" fill="#C68B5B" stroke="#9A6738" strokeWidth="3"/>
        <rect x="185" y="78" width="38" height="42" rx="3" fill="#B97C4C"/>
        <rect x="185" y="126" width="38" height="42" rx="3" fill="#B97C4C"/>
        <circle cx="223" cy="146" r="3.5" fill="#FFD86B"/>
        <path d="M178 66 h52 v6 h-52 Z" fill="#9A6738"/>
        {/* KIYIM SHKAFI (chapda) */}
        <rect x="36" y="66" width="78" height="112" rx="4" fill="#C99A6A" stroke="#9A6738" strokeWidth="3"/>
        <line x1="75" y1="70" x2="75" y2="174" stroke="#9A6738" strokeWidth="2.5"/>
        <rect x="43" y="74" width="28" height="46" rx="2" fill="#BB8C54"/>
        <rect x="79" y="74" width="28" height="46" rx="2" fill="#BB8C54"/>
        <rect x="43" y="126" width="28" height="46" rx="2" fill="#BB8C54"/>
        <rect x="79" y="126" width="28" height="46" rx="2" fill="#BB8C54"/>
        <circle cx="71" cy="123" r="2.4" fill="#5E3F1E"/><circle cx="79" cy="123" r="2.4" fill="#5E3F1E"/>
        {/* devor ilgichi + kepka osilgan */}
        <rect x="250" y="50" width="58" height="6" rx="3" fill="#9A6738"/>
        <circle cx="262" cy="58" r="2" fill="#9A6738"/><circle cx="296" cy="58" r="2" fill="#9A6738"/>
        <path d="M256 60 Q254 70 262 72 Q270 70 268 60 Q262 64 256 60 Z" fill="#2C7BD6"/>
        {/* devordagi rasm — MUSHUK */}
        <rect x="318" y="64" width="46" height="36" rx="3" fill="#FFFFFF" stroke="#B9986F" strokeWidth="3"/>
        <rect x="322" y="68" width="38" height="28" rx="2" fill="#FBF1E2"/>
        <path d="M334 80 L331 71 L339 77 Z" fill="#E89A4C"/><path d="M348 80 L351 71 L343 77 Z" fill="#E89A4C"/>
        <path d="M334.5 78 L333 73.5 L337 76 Z" fill="#F4C39A"/><path d="M347.5 78 L349 73.5 L345 76 Z" fill="#F4C39A"/>
        <ellipse cx="341" cy="84" rx="11" ry="9" fill="#E89A4C"/>
        <path d="M341 76 v4 M337 77 l1 3 M345 77 l-1 3" stroke="#C97A2E" strokeWidth="1.1" strokeLinecap="round" fill="none"/>
        <ellipse cx="337" cy="83" rx="1.7" ry="2.2" fill="#3A7D44"/><ellipse cx="345" cy="83" rx="1.7" ry="2.2" fill="#3A7D44"/>
        <path d="M339.8 86.5 h2.4 l-1.2 1.4 Z" fill="#D86B6B"/>
        <g stroke="#C97A2E" strokeWidth="0.6" strokeLinecap="round"><path d="M336 86 l-6 -1 M336 88 l-6 1"/><path d="M346 86 l6 -1 M346 88 l6 1"/></g>
        {/* gul tuvak (o'ngda, polда) */}
        <path d="M338 178 l3 -22 h26 l3 22 Z" fill="#D98C4A"/><rect x="338" y="154" width="32" height="4" fill="#B86F2E"/>
        <path d="M354 154 Q344 134 352 118 Q357 134 354 154 Z" fill="#3FA45C"/>
        <path d="M354 154 Q366 138 362 122 Q356 138 354 154 Z" fill="#4FB56A"/>
        <path d="M354 154 Q348 140 350 126 Q356 140 354 154 Z" fill="#349152"/>
        {/* gilamcha eshik oldida */}
        <ellipse cx="204" cy="196" rx="70" ry="10" fill="#E9B7C2" opacity="0.6"/>
        <ellipse cx="204" cy="196" rx="48" ry="6" fill="#F2CBD6" opacity="0.7"/>
      </>
    )}
  </svg>
);

// ============================================================
// RAQAM VIZUALIZATORLARI (Dars02 — raqamli uylar / eshiklar, 1-5)
// Uslub: Dars01 etaloni kabi sayqalli flat-vector (gradient soya, yorug'lik, soyalar).
// ============================================================

// HouseDefs — barcha uy/buyum/ko'cha gradientlari (hujjatga bir marta qo'yiladi, root'da).
const HouseDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <linearGradient id="d2wall0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FCEAD0"/><stop offset="100%" stopColor="#E7C794"/></linearGradient>
      <linearGradient id="d2wall1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FBE0CC"/><stop offset="100%" stopColor="#E8BE94"/></linearGradient>
      <linearGradient id="d2wall2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#DCEFD9"/><stop offset="100%" stopColor="#B6D9AE"/></linearGradient>
      <linearGradient id="d2wall3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#DCE7F2"/><stop offset="100%" stopColor="#B6C8DC"/></linearGradient>
      <linearGradient id="d2wall4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F7DEE6"/><stop offset="100%" stopColor="#E6BCCB"/></linearGradient>
      <linearGradient id="d2roof0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E4724E"/><stop offset="100%" stopColor="#A8381F"/></linearGradient>
      <linearGradient id="d2roof1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CE9460"/><stop offset="100%" stopColor="#8A5A2E"/></linearGradient>
      <linearGradient id="d2roof2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#54AEB8"/><stop offset="100%" stopColor="#2E737B"/></linearGradient>
      <linearGradient id="d2roof3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#828FA8"/><stop offset="100%" stopColor="#535F77"/></linearGradient>
      <linearGradient id="d2roof4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0574A"/><stop offset="100%" stopColor="#A8281F"/></linearGradient>
      <linearGradient id="d2door" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C2864F"/><stop offset="100%" stopColor="#8A5A28"/></linearGradient>
      <linearGradient id="d2win" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#DCF1F9"/><stop offset="100%" stopColor="#A6D6EC"/></linearGradient>
      <radialGradient id="d2ball" cx="38%" cy="30%" r="72%"><stop offset="0%" stopColor="#FF8A6B"/><stop offset="55%" stopColor="#F0492E"/><stop offset="100%" stopColor="#C42316"/></radialGradient>
      <linearGradient id="d2cubeT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7FB3F2"/><stop offset="100%" stopColor="#5E9CEC"/></linearGradient>
      <linearGradient id="d2cubeL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4C90E6"/><stop offset="100%" stopColor="#3877C9"/></linearGradient>
      <linearGradient id="d2cubeR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#346FBE"/><stop offset="100%" stopColor="#24508F"/></linearGradient>
      <linearGradient id="d2pot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0945A"/><stop offset="100%" stopColor="#B06A2E"/></linearGradient>
      <linearGradient id="d2leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5FC47C"/><stop offset="100%" stopColor="#2E8B4E"/></linearGradient>
      <linearGradient id="d2sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#BDE7F6"/><stop offset="100%" stopColor="#EAF7FC"/></linearGradient>
      <linearGradient id="d2grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#BCE08F"/><stop offset="100%" stopColor="#97C96A"/></linearGradient>
      <linearGradient id="d2walk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D6CEBF"/><stop offset="100%" stopColor="#BEB4A1"/></linearGradient>
    </defs>
  </svg>
);

// DigitGlyph — yirik raqam belgisi (display shrift). Eshik plitasi/raqam tokeni uchun.
const DigitGlyph = ({ d, tone = 'ink', size = 'mid' }) => (
  <span className={`g1-digit g1-digit-${size} g1-digit-${tone}`} aria-hidden="true">{d}</span>
);

// Buyum ikonlari (meva emas): koptok / kubik / gultuvak — gradientli, soyali, real. viewBox 0 0 40 40.
const ITEM2 = {
  ball: (
    <g>
      <ellipse cx="20" cy="35.5" rx="11" ry="2.8" fill="rgba(58,53,48,0.18)"/>
      <circle cx="20" cy="21" r="14" fill="url(#d2ball)"/>
      <path d="M6.4 17.5 Q20 11.5 33.6 17.5" stroke="#FFFFFF" strokeWidth="2.3" fill="none" opacity="0.85"/>
      <path d="M7 26 Q20 32 33 26" stroke="#FFFFFF" strokeWidth="2.1" fill="none" opacity="0.7"/>
      <path d="M20 7.1 Q13.5 21 20 34.9" stroke="rgba(150,20,8,0.4)" strokeWidth="1.4" fill="none"/>
      <ellipse cx="14.5" cy="14.5" rx="4.3" ry="2.9" fill="rgba(255,255,255,0.6)"/>
    </g>
  ),
  cube: (
    <g>
      <ellipse cx="20" cy="35.5" rx="10.5" ry="2.6" fill="rgba(58,53,48,0.18)"/>
      <path d="M20 6 L33 13 L20 20 L7 13 Z" fill="url(#d2cubeT)"/>
      <path d="M7 13 L20 20 L20 34 L7 27 Z" fill="url(#d2cubeL)"/>
      <path d="M33 13 L20 20 L20 34 L33 27 Z" fill="url(#d2cubeR)"/>
      <path d="M11 14.6 L18.5 18.7" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M20 6 L33 13 L20 20 L7 13 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
    </g>
  ),
  pot: (
    <g>
      <ellipse cx="20" cy="36" rx="10" ry="2.6" fill="rgba(58,53,48,0.18)"/>
      <path d="M20 23 Q13.5 13 20 5 Q26.5 13 20 23 Z" fill="url(#d2leaf)"/>
      <path d="M20 22 Q11.5 18.5 9.5 10 Q17.5 13 20 22 Z" fill="#5BC078"/>
      <path d="M20 22 Q28.5 18.5 30.5 10 Q22.5 13 20 22 Z" fill="#3E9B57"/>
      <circle cx="20" cy="6.5" r="2.5" fill="#FFC23C" stroke="#E8A92A" strokeWidth="0.6"/>
      <path d="M12 24 h16 l-1.7 10 a2 2 0 0 1 -2 1.6 h-8.6 a2 2 0 0 1 -2 -1.6 Z" fill="url(#d2pot)"/>
      <rect x="10.4" y="21.4" width="19.2" height="4.8" rx="2.4" fill="#C2783A"/>
      <ellipse cx="15" cy="28.5" rx="2.4" ry="4" fill="rgba(255,255,255,0.2)"/>
    </g>
  ),
};
const ItemSvg = ({ kind = 'ball' }) => (
  <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">{ITEM2[kind] || ITEM2.ball}</svg>
);
// Pip — bitta sanaladigan buyum (kit g1-obj animatsiyasi).
const Pip = ({ kind, anim, d }) => (
  <span className={`g1-obj ${anim ? 'g1-' + anim : ''}`} style={{ animationDelay: `${d * 0.16}s` }}><ItemSvg kind={kind}/></span>
);
// ItemRow — sanaladigan buyumlar qatori. n>5 bo'lsa "5 talik guruh + yana qolgani" ko'rinishi
// (g1-five-grp va g1-more-grp orasida bo'shliq) — bola 6–10 ni "besh va yana" deb o'qiydi.
const ItemRow = ({ n, kind = 'ball', anim = 'bob', wrap = false }) => {
  if (n > 5) {
    const more = n - 5;
    return (
      <div className={`g1-pips g1-pips-five ${wrap ? 'g1-pips-wrap' : ''}`}>
        <span className="g1-five-grp">
          {Array.from({ length: 5 }).map((_, i) => <Pip key={i} kind={kind} anim={anim} d={i % 5}/>)}
        </span>
        <span className="g1-more-grp">
          {Array.from({ length: more }).map((_, i) => <Pip key={i} kind={kind} anim={anim} d={i % 5}/>)}
        </span>
      </div>
    );
  }
  return (
    <div className={`g1-pips ${wrap ? 'g1-pips-wrap' : ''}`}>
      {Array.from({ length: n }).map((_, i) => <Pip key={i} kind={kind} anim={anim} d={i % 5}/>)}
    </div>
  );
};

// DoorCard — eshik (raqam plitasi bilan). Raqamga e'tibor qaratiladigan ekranlar uchun.
const DoorCard = ({ d, tone = 'ink', size = 'sm' }) => (
  <span className="g1-door" aria-hidden="true">
    <span className="g1-door-panel"/>
    <span className="g1-door-plate"><DigitGlyph d={d} size={size} tone={tone}/></span>
    <span className="g1-door-knob"/>
  </span>
);

// HouseSVG — IKKI QAVATLI uy, BALAND eshik (odam eshikdan o'tadi — real proporsiya). viewBox 0 0 120 184.
// v = rang varianti (0..4). digit=null -> bo'sh plita. open -> eshik ochiq (final 5-uy).
const HouseSVG = ({ digit = null, open = false, v = null, className = '' }) => {
  // Rang RAQAMga bog'langan (v berilmasa): har raqamli uy butun darsda bir xil rangda.
  const base = (v == null) ? (digit == null ? 0 : digit - 1) : v;
  const wv = ((base % 5) + 5) % 5;
  return (
  <svg className={`g1-house-svg ${className}`} viewBox="0 0 120 184" aria-hidden="true">
    <ellipse cx="60" cy="179" rx="46" ry="5" fill="rgba(58,53,48,0.14)"/>
    {/* mo'ri */}
    <rect x="80" y="16" width="11" height="24" rx="1.5" fill="#7A4A30"/>
    <rect x="78" y="14" width="15" height="6" rx="2" fill="#5E3522"/>
    {/* tom */}
    <path d="M8 62 L60 18 L112 62 Z" fill={`url(#d2roof${wv})`} stroke="#7A3018" strokeWidth="2" strokeLinejoin="round"/>
    <g stroke="rgba(60,20,10,0.35)" strokeWidth="1" opacity="0.5" fill="none"><path d="M20 56 L100 56"/><path d="M30 48 L90 48"/><path d="M42 40 L78 40"/></g>
    <path d="M60 18 L112 62 L104 62 L60 25 Z" fill="rgba(0,0,0,0.13)"/>
    <path d="M8 62 L60 18 L63 20 L14 62 Z" fill="rgba(255,255,255,0.15)"/>
    {/* devor — 2 qavat */}
    <rect x="22" y="60" width="76" height="116" rx="3" fill={`url(#d2wall${wv})`} stroke="#C9A877" strokeWidth="2"/>
    <g stroke="rgba(120,90,40,0.18)" strokeWidth="0.8" fill="none"><path d="M22 82 h76 M22 100 h76 M22 138 h76 M22 158 h76"/></g>
    <rect x="22" y="116" width="76" height="2.5" fill="rgba(120,90,40,0.28)"/>
    {/* yuqori qavat — 2 deraza */}
    <g>
      <rect x="33" y="72" width="20" height="22" rx="2" fill="url(#d2win)" stroke="#8A5A28" strokeWidth="2.2"/>
      <line x1="43" y1="72" x2="43" y2="94" stroke="#8A5A28" strokeWidth="1.3"/><line x1="33" y1="83" x2="53" y2="83" stroke="#8A5A28" strokeWidth="1.3"/>
      <path d="M36 75 l5 0 -7 7 0 -5 Z" fill="rgba(255,255,255,0.5)"/>
      <rect x="67" y="72" width="20" height="22" rx="2" fill="url(#d2win)" stroke="#8A5A28" strokeWidth="2.2"/>
      <line x1="77" y1="72" x2="77" y2="94" stroke="#8A5A28" strokeWidth="1.3"/><line x1="67" y1="83" x2="87" y2="83" stroke="#8A5A28" strokeWidth="1.3"/>
      <path d="M70 75 l5 0 -7 7 0 -5 Z" fill="rgba(255,255,255,0.5)"/>
    </g>
    {/* pastki qavat — BALAND eshik (markaz) + ikki yon deraza */}
    <rect x="26" y="128" width="15" height="22" rx="2" fill="url(#d2win)" stroke="#8A5A28" strokeWidth="2"/>
    <line x1="26" y1="139" x2="41" y2="139" stroke="#8A5A28" strokeWidth="1.2"/>
    <rect x="79" y="128" width="15" height="22" rx="2" fill="url(#d2win)" stroke="#8A5A28" strokeWidth="2"/>
    <line x1="79" y1="139" x2="94" y2="139" stroke="#8A5A28" strokeWidth="1.2"/>
    {open ? (
      <g>
        <rect x="45" y="118" width="30" height="58" rx="2" fill="#3E2715"/>
        <path d="M45 118 L31 112 L31 170 L45 176 Z" fill="url(#d2door)" stroke="#7A4E22" strokeWidth="1.5"/>
        <circle cx="36" cy="146" r="2" fill="#FFD86B"/>
      </g>
    ) : (
      <g>
        <rect x="45" y="118" width="30" height="58" rx="3" fill="url(#d2door)" stroke="#7A4E22" strokeWidth="2"/>
        <rect x="49" y="124" width="22" height="22" rx="2" fill="rgba(0,0,0,0.12)"/>
        <rect x="49" y="150" width="22" height="20" rx="2" fill="rgba(0,0,0,0.12)"/>
        <circle cx="69" cy="150" r="2.8" fill="#FFD86B" stroke="#B8862E" strokeWidth="0.8"/>
      </g>
    )}
    <rect x="41" y="174" width="38" height="4" rx="1.5" fill="#9A6738"/>
    {/* raqam plitasi (eshik tepasida) */}
    <rect x="47" y="100" width="26" height="15" rx="3" fill="#FCFAF5" stroke="#C9A877" strokeWidth="1.6"/>
    <circle cx="50.5" cy="103" r="1" fill="#C9A877"/><circle cx="69.5" cy="103" r="1" fill="#C9A877"/>
    {digit != null && <text x="60" y="112" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="14" fill="#FF4F28">{digit}</text>}
    {/* buta */}
    <g><ellipse cx="29" cy="170" rx="8.5" ry="6.5" fill="#5BA85C"/><ellipse cx="35" cy="172" rx="6.5" ry="5" fill="#4F9A50"/><ellipse cx="26" cy="167" rx="3" ry="2" fill="rgba(255,255,255,0.18)"/></g>
  </svg>
  );
};

// HouseFig — uy + oldida buyumlar (miqdor). Miqdor-kontekstli ekranlar uchun.
const HouseFig = ({ digit = null, n = 0, kind = 'ball', className = '' }) => (
  <div className={`g1-housefig ${className}`}>
    <HouseSVG digit={digit}/>
    {n > 0 && <div className="g1-yard"><ItemRow n={n} kind={kind} anim="bob"/></div>}
  </div>
);

// BitSays — qoida/izoh kartochkasi: CHAPDA animatsion Bit, o'ngda matn (Bit "gapiradi").
// Etalon Bit-kartochka uslubi (g1-bitcard), neytral frame-tip ichida.
const BitSays = ({ text }) => (
  <div className="frame-tip fade-up delay-1">
    <div className="g1-bitcard">
      <div className="g1-bitcard-fig"><BitSVG state="present"/></div>
      <div className="g1-bitcard-body"><span className="g1-bitcard-txt">{text}</span></div>
    </div>
  </div>
);

// TenFrame — "besh-besh ramka": 2x5 katak. Pastki qator = besh (asos guruh), tepa qator =
// ortiqcha (n-5). 6–10 ni "besh va yana N" sifatida ko'rsatadi; n=0 -> butunlay bo'sh ramka.
// anim=true -> kataklar ketma-ket "pop" bilan to'ladi (avval besh, keyin ortiqchasi). CSS: .g1-tf-*
const tenFrameRow = (count, base, anim, kind = 'apple') => (
  <div className={`g1-tf-row ${base ? 'g1-tf-base' : ''}`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <span key={i} className={`g1-tf-cell ${i < count ? 'on' : ''} ${anim && i < count ? 'g1-tf-pop' : ''}`}
        style={anim ? { animationDelay: `${(base ? i : 5 + i) * 0.12}s` } : undefined}>
        {i < count ? <span className="g1-tf-fruit"><TopFruitSvg kind={kind}/></span> : null}
      </span>
    ))}
  </div>
);
const TenFrame = ({ n = 0, anim = false, kind = 'apple' }) => {
  const top = Math.max(0, Math.min(5, n - 5));     // tepa qator: ortiqcha (n-5)
  const bottom = Math.max(0, Math.min(5, n));      // pastki qator: besh asos
  return (
    <div className="g1-tenframe" aria-hidden="true">
      {tenFrameRow(top, false, anim, kind)}
      {tenFrameRow(bottom, true, anim, kind)}
    </div>
  );
};

// StreetBg — ko'cha foni (osmon, quyosh, bulutlar, daraxtlar, maysa, trotuar, fonar).
const StreetBg = () => (
  <svg className="g1-street-bg" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="220" fill="url(#d2sky)"/>
    {/* quyosh + nurlar */}
    <g><circle cx="352" cy="40" r="20" fill="#FFE08A"/><g stroke="#FFD86B" strokeWidth="3" strokeLinecap="round"><path d="M352 8 v-7 M352 79 v7 M320 40 h-7 M384 40 h7 M329 17 l-5 -5 M375 63 l5 5 M375 17 l5 -5 M329 63 l-5 5"/></g></g>
    {/* bulutlar */}
    <g fill="#FFFFFF" opacity="0.95"><ellipse cx="80" cy="40" rx="26" ry="13"/><ellipse cx="104" cy="44" rx="20" ry="11"/><ellipse cx="60" cy="46" rx="18" ry="10"/></g>
    <g fill="#FFFFFF" opacity="0.85"><ellipse cx="220" cy="28" rx="20" ry="10"/><ellipse cx="240" cy="32" rx="15" ry="8"/></g>
    {/* uzoq daraxtlar (devor ortida) */}
    <g><ellipse cx="150" cy="150" rx="26" ry="22" fill="#7FB86A"/><rect x="146" y="150" width="8" height="20" fill="#8A5A33"/></g>
    <g><ellipse cx="300" cy="150" rx="22" ry="19" fill="#6FAE5C"/><rect x="296" y="150" width="7" height="20" fill="#8A5A33"/></g>
    {/* maysa */}
    <rect x="0" y="150" width="400" height="34" fill="url(#d2grass)"/>
    {/* trotuar */}
    <rect x="0" y="182" width="400" height="38" fill="url(#d2walk)"/>
    <line x1="0" y1="182" x2="400" y2="182" stroke="#A99E89" strokeWidth="2"/>
    <g stroke="#B3A893" strokeWidth="2" opacity="0.7"><path d="M60 184 v34 M150 184 v34 M240 184 v34 M330 184 v34"/></g>
    {/* fonar */}
    <g><rect x="22" y="120" width="4" height="64" fill="#5A6470"/><rect x="14" y="116" width="20" height="8" rx="3" fill="#FFD86B" stroke="#5A6470" strokeWidth="1.5"/></g>
  </svg>
);

// Zuhra — YANGI o'zbek qizcha. Ra'nodan KESKIN ajralib turadi: jingalak (bulutsimon)
// to'q soch, dumaloq ko'k ko'zoynak, amber-sariq ko'ylak, yon gul qisqich. Yangi
// qurilgan uyga ko'chib keladigan do'st. g1-eyes -> pirpiratish.
const ZuhraSVG = ({ mood = 'pointing', className = '' }) => {
  const big = mood === 'happy' || mood === 'celebrate';
  return (
    <svg className={`g1-char g1-char-zuhra ${className}`} viewBox="0 0 130 190" aria-hidden="true">
      <defs>
        <radialGradient id="g1uskin" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#F8CBA0"/><stop offset="100%" stopColor="#E0A06E"/></radialGradient>
        <linearGradient id="g1udress" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFC24B"/><stop offset="100%" stopColor="#EF8E22"/></linearGradient>
        <linearGradient id="g1uhair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3E2A1A"/><stop offset="100%" stopColor="#241307"/></linearGradient>
      </defs>
      <ellipse cx="64" cy="178" rx="34" ry="5" fill="rgba(58,53,48,0.13)"/>
      {/* oyoqlar + tufli */}
      <rect x="57" y="140" width="7.5" height="28" rx="3.7" fill="url(#g1uskin)"/>
      <rect x="65.5" y="140" width="7.5" height="28" rx="3.7" fill="url(#g1uskin)"/>
      <ellipse cx="60" cy="170" rx="8" ry="4.2" fill="#C26A12"/>
      <ellipse cx="70" cy="170" rx="8" ry="4.2" fill="#C26A12"/>
      {/* soch (orqa, jingalak bulut — bosh aylanasi ostida) + yon jingalaklar */}
      <path d="M38 46 Q33 32 41 24 Q41 13 53 14 Q57 5 66 9 Q75 5 80 14 Q92 14 91 26 Q98 34 92 47 Q97 60 87 68 L87 50 Q87 30 64 30 Q43 30 43 50 L43 68 Q33 60 38 46 Z" fill="url(#g1uhair)"/>
      <circle cx="42" cy="50" r="7.5" fill="url(#g1uhair)"/>
      <circle cx="88" cy="50" r="7.5" fill="url(#g1uhair)"/>
      <circle cx="40" cy="40" r="6" fill="url(#g1uhair)"/>
      <circle cx="90" cy="40" r="6" fill="url(#g1uhair)"/>
      {/* qo'llar — kayfiyatga qarab */}
      {big ? (
        <g>
          <path d="M53 58 Q45 42 41 28" stroke="url(#g1uskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="41" cy="27" r="4.6" fill="url(#g1uskin)"/>
          <path d="M77 58 Q85 42 89 28" stroke="url(#g1uskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="89" cy="27" r="4.6" fill="url(#g1uskin)"/>
        </g>
      ) : (
        <g>
          <path d="M53 58 Q46 74 43 91" stroke="url(#g1uskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="43" cy="92" r="4.6" fill="url(#g1uskin)"/>
          <path d="M77 58 Q84 74 87 91" stroke="url(#g1uskin)" strokeWidth="7" fill="none" strokeLinecap="round"/><circle cx="87" cy="92" r="4.6" fill="url(#g1uskin)"/>
        </g>
      )}
      {/* ko'ylak + jiyak + yenglar + yoqa + belbog' */}
      <path d="M50 56 Q52 50 58 49 L72 49 Q78 50 80 56 L94 146 Q65 155 36 146 Z" fill="url(#g1udress)"/>
      <path d="M37 140 Q65 149 93 140 L94 146 Q65 155 36 146 Z" fill="rgba(255,255,255,0.28)"/>
      <ellipse cx="51" cy="57" rx="7" ry="6" fill="url(#g1udress)"/>
      <ellipse cx="79" cy="57" rx="7" ry="6" fill="url(#g1udress)"/>
      <path d="M58 50 Q65 57 72 50 Q68 54 65 54 Q62 54 58 50 Z" fill="#FFFFFF"/>
      <path d="M46 67 Q65 72 84 67 L85 73 Q65 78 45 73 Z" fill="#D9781A"/>
      <circle cx="65" cy="70" r="2.6" fill="#FFF1C2" stroke="#C99A2E" strokeWidth="0.8"/>
      {/* bosh + jingalak peshona sochi + yon gul qisqich */}
      <circle cx="65" cy="37" r="16.5" fill="url(#g1uskin)"/>
      <path d="M48 39 Q47 24 56 22 Q59 17 65 21 Q71 17 74 22 Q83 24 82 39 Q79 31 74 32 Q71 27 67 31 Q64 26 60 31 Q56 27 53 32 Q50 31 48 39 Z" fill="url(#g1uhair)"/>
      <g>
        <circle cx="50" cy="27" r="2.6" fill="#FF7AA8"/>
        <circle cx="50" cy="22" r="2.3" fill="#FF9CC0"/><circle cx="54.5" cy="25" r="2.3" fill="#FF9CC0"/><circle cx="52.5" cy="30" r="2.3" fill="#FF9CC0"/><circle cx="46.5" cy="29" r="2.3" fill="#FF9CC0"/><circle cx="45.5" cy="24" r="2.3" fill="#FF9CC0"/>
        <circle cx="50" cy="26" r="1.5" fill="#FFD86B"/>
      </g>
      {/* yuz */}
      <g className="g1-eyes">
        <circle cx="59" cy="37" r="2.1" fill="#3A2A1E"/><circle cx="71" cy="37" r="2.1" fill="#3A2A1E"/>
        <path d="M55.5 33 Q59 31.4 62 33" stroke="#3A2A1E" strokeWidth="1" fill="none" strokeLinecap="round"/>
        <path d="M68 33 Q71 31.4 74.5 33" stroke="#3A2A1E" strokeWidth="1" fill="none" strokeLinecap="round"/>
      </g>
      {/* dumaloq ko'k ko'zoynak */}
      <g fill="none" stroke="#2B7CD3" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="59" cy="37" r="5"/>
        <circle cx="71" cy="37" r="5"/>
        <path d="M64 37 Q65 35.8 66 37"/>
        <path d="M54 36 L49.5 34.5"/>
        <path d="M76 36 L80.5 34.5"/>
      </g>
      <path d="M64.6 39 Q65 41 65.9 41" stroke="#C98A6A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {big
        ? <path d="M59 44 Q65 52 71 44 Q65 48 59 44 Z" fill="#C0392B"/>
        : <path d="M60 45 Q65 49 70 45" stroke="#C0392B" strokeWidth="2" fill="none" strokeLinecap="round"/>}
      <ellipse cx="53" cy="45" rx="3" ry="2" fill="rgba(255,120,120,0.4)"/>
      <ellipse cx="77" cy="45" rx="3" ry="2" fill="rgba(255,120,120,0.4)"/>
    </svg>
  );
};

// StreetScene — ko'cha: fon + 5 uy (6–10, trotuarda) + Anvar (+ final'da Ra'no/Zuhra 10-uy oldida).
// Dars02 metodi: ko'cha raqamlari ARALASH ko'rinadi (syujet — taxtachalar aralashib ketgan).
// 10 o'rtada (target/eng katta), Dars02 dagi [3,1,5,2,4] bilan bir xil uslub.
const STREET_NUMS = [8, 6, 10, 7, 9];
const StreetScene = ({ step = 9, final = false }) => {
  const t = useT();
  return (
    <div className={`g1-street ${final ? 'g1-street-final' : ''}`}>
      <StreetBg/>
      <div className="g1-street-houses">
        {STREET_NUMS.map((n, i) => (
          <div key={n} className={`g1-street-house ${step >= 2 ? 'in' : ''}`} style={{ transitionDelay: `${i * 0.1}s` }}>
            <HouseSVG digit={n}/>
          </div>
        ))}
        {/* ko'cha oxiridagi YANGI, raqamsiz uy — bo'sh (=0); final'da Zuhra ko'chib keladi (eshik ochiq + porlash) */}
        <div className={`g1-street-house g1-street-new ${final ? 'g1-street-target' : ''} ${step >= 2 ? 'in' : ''}`} style={{ transitionDelay: '0.5s' }}>
          <HouseSVG digit={null} open={final} v={1}/>
        </div>
      </div>
      <div className={`g1-street-anvar ${step >= 3 ? 'in' : ''}`}>
        <AnvarSVG pose={final ? 'happy' : 'coming'} className="g1-cast-svg"/>
        <span className="g1-cast-name g1-cast-sub">{t(CONTENT.sIntro.anvar_label)}</span>
      </div>
      {final && (
        <>
          <div className="g1-street-rano in">
            <RanoSVG mood="happy" className="g1-cast-svg"/>
            <span className="g1-cast-name">{t(CONTENT.sIntro.rano_label)}</span>
          </div>
          <div className="g1-street-zuhra in">
            <ZuhraSVG mood="happy" className="g1-cast-svg"/>
            <span className="g1-cast-name">{t(CONTENT.sIntro.zuhra_label)}</span>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// YANGI VIZUALIZATORLAR — Dars04 (taqqoslash: ikki savat / ikki ramka / belgi)
// ============================================================

// D4_SCATTER — determinli (Math.random YO'Q) burilish + kichik siljish, indeks bo'yicha.
// Mevalar zich, tabiiy, biroz tartibsiz ko'rinadi, lekin har biri to'liq ko'rinadi va sanaladi.
const D4_SCATTER = [
  { r: -8, x: 0, y: 2 }, { r: 7, x: -2, y: -3 }, { r: -4, x: 2, y: 1 },
  { r: 9, x: 0, y: -2 }, { r: -9, x: -1, y: -4 }, { r: 4, x: 1, y: 2 },
  { r: -6, x: -2, y: 0 }, { r: 8, x: 2, y: -4 }, { r: -3, x: 0, y: 1 },
];
const scatterStyle = (i) => {
  const s = D4_SCATTER[i % D4_SCATTER.length];
  return { transform: `rotate(${s.r}deg)` };   // faqat yengil burilish — siljish YO'Q (mevalar orasida bo'sh joy bo'lmasin)
};

// fruitGrid — meva soniga qarab ustun/qator: kam meva -> yirik, ko'p meva -> mayda (savatga sig'adi).
// cqw/cqh bilan birga: har meva = min(100cqw/cols, 100cqh/rows) -> doim savat ichiga sig'adi, orada bo'sh joy yo'q.
const fruitGrid = (n) => {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 8) return { cols: Math.ceil(n / 2), rows: 2 };
  return { cols: Math.ceil(n / 3), rows: 3 };
};

// D4Fruit — savatdagi bitta meva. Tashqi = yengil burilish (static), ichki = bob (animatsiya).
// O'lcham CSS'da cqw/cqh + --cols/--rows orqali avtomatik (bowl container'iga moslab kichrayadi).
const D4Fruit = ({ kind = 'apple', i = 0 }) => (
  <span className="d4-fruit" style={scatterStyle(i)}>
    <span className="d4-fruit-bob" style={{ animationDelay: `${(i % 5) * 0.16}s` }}><ObjSvg kind={kind}/></span>
  </span>
);

// D4Basket — bitta savat (BasketArt) + ichida n ta meva. Mevalar zich, savat ichida, soniga qarab kichrayadi.
// n===0 -> faqat bo'sh savat (to'qima), meva bowl'i va old lab overlay'isiz (toza, ikkilangan gardishsiz).
const D4Basket = ({ n = 0, kind = 'apple', mountCls = '' }) => {
  const g = fruitGrid(n);
  return (
    <div className={`d4-basket ${mountCls}`}>
      <BasketArt/>
      {n > 0 && (
        <>
          <div className="d4-bowl" style={{ '--cols': g.cols, '--rows': g.rows }}>
            {Array.from({ length: n }).map((_, i) => <D4Fruit key={i} kind={kind} i={i}/>)}
          </div>
          <BasketRimFront/>
        </>
      )}
    </div>
  );
};

// TopFruitSvg — USTDAN ko'rinish (qush parvozi) meva tokeni. viewBox 0 0 40 40. g1apA/g1chrG root'da.
const TopFruitSvg = ({ kind = 'apple' }) => (
  <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">
    {kind === 'mango' ? (
      <g>
        {/* mango (katta, oltinrang, cho'ziq) — USTDAN ko'rinish */}
        <ellipse cx="20" cy="34" rx="15" ry="3.2" fill="rgba(58,53,48,0.15)"/>
        <path d="M8 22 C 8 13 16 9 24 10 C 33 11 34 20 31 26 C 28 31 20 33 14 31 C 9.5 29 8 26 8 22 Z" fill="url(#g1mangoG)"/>
        <path d="M23 9.5 q3 -3 6 -1" stroke="#5A7D25" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <ellipse cx="15" cy="17" rx="4" ry="6" fill="rgba(255,255,255,0.5)" transform="rotate(-24 15 17)"/>
        <circle cx="13.5" cy="14.5" r="1.8" fill="rgba(255,255,255,0.7)"/>
      </g>
    ) : kind === 'grape' ? (
      <g>
        {/* uzum (kichik, siyohrang bitta g'uja) — USTDAN ko'rinish */}
        <ellipse cx="20" cy="29" rx="8" ry="2.4" fill="rgba(58,53,48,0.15)"/>
        <circle cx="20" cy="22" r="8" fill="url(#g1grapeG)"/>
        <path d="M20 14 q2 -3 5 -3" stroke="#5A7D25" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
        <ellipse cx="17" cy="19" rx="2.1" ry="3" fill="rgba(255,255,255,0.5)" transform="rotate(-20 17 19)"/>
        <circle cx="16" cy="17.5" r="1.2" fill="rgba(255,255,255,0.7)"/>
      </g>
    ) : kind === 'cherry' ? (
      <g>
        {/* gilos — BITTA shar + poyacha + bitta barg (USTDAN ko'rinish). Olma emas: kichikroq, to'qroq qizil, ingichka poyacha. */}
        <ellipse cx="20" cy="34" rx="11" ry="2.6" fill="rgba(58,53,48,0.15)"/>
        <path d="M20 15 Q22 8 27 5" stroke="#5A7D25" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M26 5 Q31 1.5 34.5 6 Q30 9.5 26 5 Z" fill="#3E9B3A"/>
        <path d="M27 6 Q30.5 5.5 33 7" stroke="#2C7A2E" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
        <circle cx="20" cy="24" r="11" fill="url(#g1chrG)"/>
        <ellipse cx="16" cy="20" rx="2.8" ry="1.9" fill="rgba(255,255,255,0.55)"/>
        <circle cx="15" cy="18.5" r="1.3" fill="rgba(255,255,255,0.72)"/>
      </g>
    ) : (
      <g>
        <ellipse cx="20" cy="35" rx="14" ry="3" fill="rgba(58,53,48,0.15)"/>
        <circle cx="20" cy="21" r="15" fill="url(#g1apA)"/>
        <circle cx="20" cy="11" r="1.8" fill="#6E3A20"/>
        <ellipse cx="25" cy="11" rx="3.6" ry="2" fill="#2C9A57" transform="rotate(-18 25 11)"/>
        <ellipse cx="13.5" cy="16" rx="3" ry="5" fill="rgba(255,255,255,0.5)" transform="rotate(-18 13.5 16)"/>
        <circle cx="15.5" cy="13.5" r="2" fill="rgba(255,255,255,0.65)"/>
      </g>
    )}
  </svg>
);

// TopRim — savatning USTDAN ko'rinishi: to'qima gardish (konsentrik halqalar + radial nurlar) + ichki interyer.
const TopRim = () => (
  <svg className="d4-toprim" viewBox="0 0 200 180" aria-hidden="true">
    <defs>
      <radialGradient id="d4topint" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stopColor="#EBD4AB"/><stop offset="100%" stopColor="#C7A573"/>
      </radialGradient>
    </defs>
    {/* tashqi gardish (to'qima asosi) */}
    <ellipse cx="100" cy="90" rx="96" ry="82" fill="#A9763C"/>
    <ellipse cx="100" cy="90" rx="96" ry="82" fill="none" stroke="#7A4E22" strokeWidth="3"/>
    <ellipse cx="100" cy="90" rx="88" ry="74" fill="none" stroke="#8A5A28" strokeWidth="2" opacity="0.5"/>
    {/* radial to'qima nurlari (gardish bandida) */}
    <g stroke="#7A4E22" strokeWidth="1.6" opacity="0.5">
      {Array.from({ length: 28 }).map((_, k) => {
        const a = (k / 28) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        return <line key={k} x1={100 + c * 74} y1={90 + s * 62} x2={100 + c * 95} y2={90 + s * 81}/>;
      })}
    </g>
    {/* ichki interyer (chuqurroq, ochroq) — nurlarning ichki uchini berkitadi */}
    <ellipse cx="100" cy="88" rx="74" ry="62" fill="url(#d4topint)"/>
    <ellipse cx="100" cy="88" rx="74" ry="62" fill="none" stroke="#B08A50" strokeWidth="2.5"/>
  </svg>
);

// TopBasket — USTDAN ko'rinish savat: mevalar aniq RIM ichida, zich, sanaladigan, hech qachon to'kilmaydi.
// onTap berilsa -> TAP rejimi (s1); aks holda dekorativ. count===n -> done.
const TopBasket = ({ n = 0, kind = 'apple', count = null, active = false, onTap = null, mountCls = '' }) => {
  const g = fruitGrid(n);
  return (
    <div className={`d4-topbasket ${mountCls}${active ? ' d4-topbasket-on' : ''}${count === n ? ' d4-topbasket-done' : ''}`}>
      <TopRim/>
      <div className="d4-topbowl" style={{ '--cols': g.cols, '--rows': g.rows }}>
        {Array.from({ length: n }).map((_, i) => {
          if (onTap) {
            const counted = i < count;
            return (
              <button key={i} type="button" className={`d4-tfruit d4-tapfruit ${counted ? 'd4-tapfruit-done' : ''}`}
                style={scatterStyle(i)} disabled={!active || counted} onClick={onTap}>
                <span className="d4-tfruit-bob"><TopFruitSvg kind={kind}/></span>
                {counted && <span className="d4-tapcheck" aria-hidden="true">✓</span>}
              </button>
            );
          }
          return (
            <span key={i} className="d4-tfruit" style={scatterStyle(i)}>
              <span className="d4-tfruit-bob" style={{ animationDelay: `${(i % 5) * 0.16}s` }}><TopFruitSvg kind={kind}/></span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// TwoBaskets — ikki savat yonma-yon (USTDAN ko'rinish). mount=true -> ekran ochilganda suzib kiradi (s0).
const TwoBaskets = ({ left, right, leftKind = 'apple', rightKind = 'cherry', mount = false, compact = false }) => (
  <div className={`d4-baskets ${compact ? 'd4-baskets-sm' : ''}`}>
    <TopBasket n={left} kind={leftKind} mountCls={mount ? 'd4-mount' : ''}/>
    <TopBasket n={right} kind={rightKind} mountCls={mount ? 'd4-mount-r' : ''}/>
  </div>
);

// YardBg — hovli/bog' orqa sahnasi (osmon, quyosh, bulutlar, daraxtlar, buta, maysa, panjara).
// SceneBg bilan TO'LIQ moslik: g1-scene-bg, viewBox 0 0 400 230, xMidYMax slice, yer chizig'i y=178
// (Ra'no/Anvar shu chiziqda turadi). variant='door' -> qo'shimcha kichik darvoza detali.
const YardBg = ({ variant = 'room' }) => (
  <svg className="g1-scene-bg" viewBox="0 0 400 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    {/* osmon */}
    <rect x="0" y="0" width="400" height="178" fill="url(#d2sky)"/>
    {/* quyosh + nurlar */}
    <g><circle cx="58" cy="40" r="19" fill="#FFE08A"/><g stroke="#FFD86B" strokeWidth="3" strokeLinecap="round"><path d="M58 9 v-6 M58 77 v6 M27 40 h-6 M89 40 h6 M36 18 l-4 -4 M80 62 l4 4 M80 18 l4 -4 M36 62 l-4 4"/></g></g>
    {/* bulutlar */}
    <g fill="#FFFFFF" opacity="0.95"><ellipse cx="150" cy="34" rx="24" ry="12"/><ellipse cx="172" cy="38" rx="18" ry="10"/><ellipse cx="132" cy="40" rx="16" ry="9"/></g>
    <g fill="#FFFFFF" opacity="0.85"><ellipse cx="300" cy="26" rx="19" ry="9"/><ellipse cx="318" cy="30" rx="14" ry="7"/></g>
    {/* daraxtlar (devor/yer ortida) */}
    <g><rect x="110" y="120" width="9" height="60" rx="3" fill="#8A5A33"/><ellipse cx="114" cy="112" rx="34" ry="30" fill="#6FAE5C"/><ellipse cx="100" cy="122" rx="20" ry="17" fill="#7FB86A"/><ellipse cx="128" cy="122" rx="20" ry="17" fill="#7FB86A"/></g>
    <g><rect x="312" y="128" width="8" height="52" rx="3" fill="#8A5A33"/><ellipse cx="316" cy="120" rx="28" ry="25" fill="#62A552"/><ellipse cx="332" cy="130" rx="16" ry="14" fill="#7FB86A"/></g>
    {/* buta */}
    <g><ellipse cx="230" cy="160" rx="26" ry="18" fill="#74B262"/><ellipse cx="212" cy="166" rx="16" ry="12" fill="#82BD6F"/><ellipse cx="248" cy="166" rx="16" ry="12" fill="#82BD6F"/></g>
    {variant === 'door' && (
      <>
        {/* kichik bog' darvozasi (markazda, yer ortida) */}
        <rect x="186" y="138" width="36" height="40" rx="3" fill="#C68B5B" stroke="#9A6738" strokeWidth="2.5"/>
        <line x1="204" y1="138" x2="204" y2="178" stroke="#9A6738" strokeWidth="2"/>
        <path d="M186 138 q18 -10 36 0" fill="none" stroke="#9A6738" strokeWidth="2.5"/>
      </>
    )}
    {/* maysa polosasi */}
    <rect x="0" y="160" width="400" height="18" fill="url(#d2grass)"/>
    {/* yer (personajlar shu chiziqda turadi — SceneBg bilan bir xil y=178) */}
    <rect x="0" y="178" width="400" height="52" fill="#CFE6A8"/>
    <line x1="0" y1="178" x2="400" y2="178" stroke="#A7C97B" strokeWidth="2"/>
    <ellipse cx="200" cy="206" rx="170" ry="14" fill="#B7DC8A" opacity="0.55"/>
    {/* past yog'och panjara */}
    <g stroke="#B9925E" strokeWidth="4" strokeLinecap="round"><path d="M14 166 v18 M44 166 v18 M74 166 v18 M104 166 v18 M134 166 v18 M164 166 v18 M236 166 v18 M266 166 v18 M296 166 v18 M326 166 v18 M356 166 v18 M386 166 v18"/></g>
    <g stroke="#CDA873" strokeWidth="4" strokeLinecap="round"><path d="M0 170 h170 M232 170 h168 M0 180 h170 M232 180 h168"/></g>
  </svg>
);

// LakeBg — ko'l bo'yi sahnasi (osmon, quyosh, palma+qamish, ko'l suvi, old plan qumli qirg'oq).
// Timsoh tabiiy makonida: bolalar qirg'oqda (y=178), suv ortda, timsoh (D4CrocReal) old planda suv chetida.
// viewBox 0 0 400 230, xMidYMax slice, yer chizig'i y=178 (YardBg bilan bir xil).
const LakeBg = ({ variant = 'room' }) => (
  <svg className="g1-scene-bg" viewBox="0 0 400 230" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="d4sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#A9E1F2"/><stop offset="65%" stopColor="#DAF1F8"/><stop offset="100%" stopColor="#EEF9FC"/>
      </linearGradient>
      <linearGradient id="d4lake" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C6ECF3"/><stop offset="18%" stopColor="#6FC6DE"/><stop offset="100%" stopColor="#2580AB"/>
      </linearGradient>
      <linearGradient id="d4sand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F4E4B4"/><stop offset="100%" stopColor="#DABE77"/>
      </linearGradient>
      <linearGradient id="d4trunk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#B58248"/><stop offset="55%" stopColor="#8A5A30"/><stop offset="100%" stopColor="#6C4522"/>
      </linearGradient>
      <linearGradient id="d4frond" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#63B44F"/><stop offset="100%" stopColor="#3B8535"/>
      </linearGradient>
      <radialGradient id="d4sun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFBE2"/><stop offset="55%" stopColor="#FFE990"/><stop offset="100%" stopColor="#FFD65C"/>
      </radialGradient>
    </defs>
    {/* osmon */}
    <rect x="0" y="0" width="400" height="126" fill="url(#d4sky)"/>
    {/* quyosh (yumshoq halo bilan) */}
    <circle cx="330" cy="40" r="34" fill="#FFEFA8" opacity="0.35"/>
    <circle cx="330" cy="40" r="20" fill="url(#d4sun)"/>
    <g stroke="#FFDE7A" strokeWidth="2.4" strokeLinecap="round" opacity="0.55"><path d="M330 10 v-5 M330 70 v5 M300 40 h-5 M360 40 h5 M309 19 l-3.5 -3.5 M351 61 l3.5 3.5 M351 19 l3.5 -3.5 M309 61 l-3.5 3.5"/></g>
    {/* qushlar (uzoqda, sekin uchadi) */}
    <g className="d4-bird" stroke="#5E5E66" strokeWidth="1.8" fill="none" strokeLinecap="round"><path d="M112 42 q6 -5.5 12 0 q6 -5.5 12 0"/></g>
    <g className="d4-bird" style={{ animationDelay: '2.4s' }} stroke="#6B6B72" strokeWidth="1.5" fill="none" strokeLinecap="round"><path d="M150 56 q5 -4.5 10 0 q5 -4.5 10 0"/></g>
    {/* bulutlar — puxta kumulus (yassi tag) */}
    <g className="d4-cloud"><g fill="#FFFFFF"><ellipse cx="86" cy="34" rx="22" ry="13"/><ellipse cx="104" cy="30" rx="16" ry="12"/><ellipse cx="68" cy="38" rx="14" ry="9"/><ellipse cx="118" cy="39" rx="12" ry="8"/><rect x="55" y="38" width="74" height="9" rx="4.5"/></g><ellipse cx="90" cy="46" rx="38" ry="3.5" fill="#D6E7EF" opacity="0.5"/></g>
    <g className="d4-cloud2"><g fill="#FFFFFF"><ellipse cx="236" cy="26" rx="18" ry="10"/><ellipse cx="252" cy="24" rx="13" ry="9"/><rect x="220" y="28" width="44" height="7" rx="3.5"/></g></g>
    {/* uzoq tepaliklar — 3 qatlam (atmosfera perspektivasi) */}
    <path d="M0 108 Q80 90 172 104 Q280 120 400 98 L400 124 L0 124 Z" fill="#BCDBA6"/>
    <path d="M0 115 Q110 99 220 112 Q320 122 400 108 L400 126 L0 126 Z" fill="#9AC982"/>
    <path d="M0 120 Q90 111 182 119 Q300 129 400 116 L400 127 L0 127 Z" fill="#79B268"/>
    <g fill="#6BA65C"><ellipse cx="120" cy="119" rx="16" ry="8"/><ellipse cx="210" cy="121" rx="14" ry="7"/><ellipse cx="60" cy="121" rx="12" ry="6"/></g>
    {/* palma (o'ngda) — segmentli tana, egilgan barglar, kokoslar */}
    <g>
      <path d="M349 122 Q343 94 351 65 L360 66 Q355 95 359 122 Z" fill="url(#d4trunk)"/>
      <g stroke="#6C4522" strokeWidth="1" opacity="0.5" fill="none"><path d="M350 114 q5 2 9 0"/><path d="M350 104 q5 2 9 0"/><path d="M351 93 q5 2 8 0"/><path d="M351 82 q4 2 7 0"/><path d="M352 73 q3 2 6 0"/></g>
      <g fill="url(#d4frond)">
        <path d="M355 65 Q322 58 300 67 Q325 65 355 70 Z"/>
        <path d="M355 65 Q388 58 410 67 Q385 65 355 70 Z"/>
        <path d="M355 65 Q330 45 314 30 Q347 50 358 66 Z"/>
        <path d="M355 65 Q380 45 396 30 Q363 50 353 66 Z"/>
        <path d="M355 67 Q328 76 310 90 Q343 71 357 69 Z"/>
        <path d="M355 67 Q382 76 400 90 Q367 71 354 69 Z"/>
      </g>
      <g stroke="#2E6E2C" strokeWidth="1" opacity="0.45" fill="none"><path d="M355 67 Q330 63 305 68"/><path d="M355 67 Q380 63 405 68"/><path d="M355 66 Q334 50 318 34"/><path d="M355 66 Q376 50 392 34"/><path d="M355 68 Q333 75 314 88"/><path d="M355 68 Q377 75 396 88"/></g>
      <g fill="#7A4B22" stroke="#5E3A1A" strokeWidth="0.6"><circle cx="351" cy="68" r="3.2"/><circle cx="358" cy="69" r="3.2"/><circle cx="354" cy="72" r="3"/></g>
    </g>
    {/* qamishlar + o'tlar (chapda, tebranadi) */}
    <g className="d4-reed" fill="none" stroke="#5A9E3E" strokeWidth="2.4" strokeLinecap="round"><path d="M28 124 Q26 106 31 91"/></g>
    <g className="d4-reed2"><path d="M40 124 Q38 100 43 82" fill="none" stroke="#4F8E36" strokeWidth="2.6" strokeLinecap="round"/><rect x="40.5" y="78" width="5" height="15" rx="2.5" fill="#8A5A2C"/><path d="M43 78 v-4" stroke="#8A5A2C" strokeWidth="2" strokeLinecap="round"/></g>
    <g className="d4-reed" style={{ animationDelay: '1s' }} fill="none" stroke="#66AD46" strokeWidth="2.2" strokeLinecap="round"><path d="M50 124 Q52 108 47 95"/></g>
    <g stroke="#5FA043" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M24 124 q1 -8 4 -12 M33 124 q0 -9 3 -13 M56 124 q1 -8 5 -12"/></g>
    {/* ninachi (qamish tepasida uchadi) */}
    <g className="d4-dragon"><g transform="translate(66 90)"><ellipse cx="0" cy="0" rx="1.5" ry="6" fill="#0E86B4"/><circle cx="0" cy="-6" r="1.6" fill="#0A6E96"/><ellipse cx="-4.5" cy="-2" rx="5" ry="1.7" fill="#7FD0E8" opacity="0.85"/><ellipse cx="4.5" cy="-2" rx="5" ry="1.7" fill="#7FD0E8" opacity="0.85"/><ellipse cx="-4" cy="1.5" rx="4" ry="1.4" fill="#A6E0F0" opacity="0.75"/><ellipse cx="4" cy="1.5" rx="4" ry="1.4" fill="#A6E0F0" opacity="0.75"/></g></g>
    {/* ko'l suvi */}
    <rect x="0" y="122" width="400" height="58" fill="url(#d4lake)"/>
    {/* ufq yorug' zolagi (aks) */}
    <rect x="0" y="122" width="400" height="6" fill="#E8F8FC" opacity="0.7"/>
    {/* palma aksi suvda */}
    <path d="M350 124 Q353 142 350 158" stroke="#3B8535" strokeWidth="7" strokeLinecap="round" opacity="0.16" fill="none"/>
    {/* quyosh aksi (suvda porlash — buzilgan yaltirashlar) */}
    <g className="d4-shimmer" fill="#FFF6D0" opacity="0.55"><ellipse cx="329" cy="130" rx="14" ry="2.2"/><ellipse cx="333" cy="138" rx="22" ry="3"/><ellipse cx="327" cy="147" rx="16" ry="2.4"/><ellipse cx="332" cy="158" rx="26" ry="3.4"/><ellipse cx="329" cy="168" rx="20" ry="2.8"/></g>
    {/* to'lqin chiziqlari (yumshoq) */}
    <g stroke="#E4F6FB" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" fill="none"><path d="M44 138 q10 -3 20 0 q10 3 20 0"/><path d="M120 150 q12 -3 24 0 q12 3 24 0"/><path d="M206 135 q10 -3 20 0 q10 3 20 0"/><path d="M66 168 q10 -3 20 0"/><path d="M150 172 q12 -3 24 0"/></g>
    {/* nilufar barglari (o'yiqli, tomirli) + lotus (suzadi) */}
    <g className="d4-lily">
      <ellipse cx="92" cy="162" rx="18" ry="7" fill="#4FA85C"/>
      <ellipse cx="92" cy="160.5" rx="18" ry="6.4" fill="#5FB86A"/>
      <path d="M92 162 L106 158.5 L106 165.5 Z" fill="url(#d4lake)"/>
      <g stroke="#2E7D42" strokeWidth="0.8" opacity="0.5" fill="none"><path d="M92 162 L78 159"/><path d="M92 162 L79 164"/><path d="M92 162 L86 156"/><path d="M92 162 L86 168"/></g>
      <g transform="translate(96 156)"><g fill="#FF8FB0"><ellipse cx="0" cy="-3.4" rx="2.6" ry="4.4"/><ellipse cx="-3.2" cy="-1" rx="2.6" ry="4.4" transform="rotate(-44)"/><ellipse cx="3.2" cy="-1" rx="2.6" ry="4.4" transform="rotate(44)"/></g><g fill="#FFB3CB"><ellipse cx="-1.6" cy="-2.6" rx="1.9" ry="3.4" transform="rotate(-22)"/><ellipse cx="1.6" cy="-2.6" rx="1.9" ry="3.4" transform="rotate(22)"/></g><circle cx="0" cy="-1.4" r="1.9" fill="#FFD25A"/></g>
    </g>
    <g className="d4-lily" style={{ animationDelay: '1.7s' }}><ellipse cx="252" cy="170" rx="15" ry="6" fill="#4FA85C"/><ellipse cx="252" cy="168.6" rx="15" ry="5.4" fill="#5FB86A"/><path d="M252 170 L264 167 L264 173 Z" fill="url(#d4lake)"/></g>
    {variant === 'door' && (<g className="d4-lily" style={{ animationDelay: '0.8s' }}><ellipse cx="176" cy="150" rx="13" ry="5" fill="#4FA85C"/><path d="M176 150 L186 147.5 L186 152.5 Z" fill="url(#d4lake)"/></g>)}
    {/* qumli qirg'oq (old plan, personajlar y=178 da turadi) */}
    <rect x="0" y="176" width="400" height="54" fill="url(#d4sand)"/>
    {/* nam qum (suvga yaqin, quyuqroq) */}
    <path d="M0 176 Q110 172 210 179 Q310 185 400 176 L400 185 L0 185 Z" fill="#CDB06E" opacity="0.55"/>
    {/* quruq qum yorug'i */}
    <path d="M0 188 Q120 184 240 189 Q330 192 400 186 L400 200 L0 200 Z" fill="#F4E7BE" opacity="0.6"/>
    {/* suv chekkasi (nam chiziq) */}
    <path d="M0 177 Q110 173 210 180 Q310 186 400 177" fill="none" stroke="#CFF0F5" strokeWidth="2" opacity="0.7"/>
    {/* qum toshlari (yorug' bilan) + o'tlar */}
    <g><ellipse cx="52" cy="206" rx="10" ry="4" fill="#C6A96C"/><ellipse cx="49" cy="204.5" rx="4" ry="1.5" fill="#E8D6A6" opacity="0.7"/></g>
    <g><ellipse cx="344" cy="211" rx="12" ry="4.6" fill="#BE9F60"/><ellipse cx="340" cy="209" rx="5" ry="1.8" fill="#E8D6A6" opacity="0.7"/></g>
    <ellipse cx="150" cy="216" rx="6" ry="2.5" fill="#CBAE70"/>
    <g stroke="#7FB35E" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M112 192 q2 -7 6 -10 M118 192 q0 -8 3 -12 M124 192 q2 -7 5 -10 M300 197 q2 -7 6 -10 M306 197 q0 -7 3 -11"/></g>
  </svg>
);

// CompareFrames — ikki "besh-besh ramka" yonma-yon (s2/s3: 4 va 7 ni solishtirish).
const CompareFrames = ({ left, right, anim = true, leftKind = 'apple', rightKind = 'cherry' }) => (
  <div className="d4-frames">
    <div className="d4-frame-col"><TenFrame n={left} anim={anim} kind={leftKind}/></div>
    <div className="d4-frame-col"><TenFrame n={right} anim={anim} kind={rightKind}/></div>
  </div>
);

// FruitBubble — "o'ylov pufakchasi": savat ustida, ichida USTDAN ko'rinish savat (TopBasket) bilan
// nima borligini ko'rsatadi. Pastda ikkita kichik dumcha (klassik o'ylov pufakchasi).
const FruitBubble = ({ n, kind }) => (
  <div className="d4-bubble" aria-hidden="true">
    <div className="d4-bubble-body"><TopBasket n={n} kind={kind}/></div>
    <div className="d4-bubble-tail">
      <span className="d4-bubble-dot d4-bubble-dot1"/>
      <span className="d4-bubble-dot d4-bubble-dot2"/>
    </div>
  </div>
);

// D4TapHand — "shu yerga bos" ko'rsatkichi: faol savat ustida (faqat 0 sanalganda), birinchi bosishdan keyin yo'qoladi.
const D4TapHand = () => (
  <div className="d4-taphand" aria-hidden="true"><HandSvg/></div>
);

// D4TapBasket — sanash uchun USTDAN ko'rinish savat (s1): har bir meva alohida bosiladi.
// active -> bosish mumkin, count ta meva "sanaldi" (so'nadi + chek), done -> savat to'liq sanaldi.
// showHand -> faol savat ustida tap ko'rsatkichini ko'rsatadi (count===0 paytida).
const D4TapBasket = ({ n, kind, count, active, onTap, showHand = false }) => (
  <div className="d4-counttop d4-tapwrap">
    <TopBasket n={n} kind={kind} count={count} active={active} onTap={onTap}/>
    {showHand && <D4TapHand/>}
  </div>
);

// CompareSign — TIMSOH usuli: belgi do'stona, real timsohga aylanadi. Och timsoh og'zini KATTA songa ochadi
// (yeydi). Teng bo'lsa — timsoh tinch, og'zi yopiq: ikkita teng chiziq (=). dir: gt | lt | eq, big — kattaroq.
// CrocDefs — timsoh gradientlari (har svg ichida; bir xil id -> bir xil gradient, mos).
const CrocDefs = () => (
  <defs>
    <linearGradient id="crocG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#7FD37F"/><stop offset="52%" stopColor="#52B95B"/><stop offset="100%" stopColor="#3C9A45"/>
    </linearGradient>
    <linearGradient id="crocBelly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#E3F3C4"/><stop offset="100%" stopColor="#B6DE92"/>
    </linearGradient>
  </defs>
);
// CrocOpen — og'zi ochiq REAL timsoh (gt: bosh/ko'z O'NGda, og'iz CHAPga keng ochilgan -> '>'). lt = ko'zgu.
const CrocOpen = () => (
  <g>
    {/* dum (uzoq o'ng) */}
    <path d="M52 19 Q59 16 58 22 Q59 28 52 25 Q54 22 52 19 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
    {/* bosh/orqa (o'ngda, jag'lar shu yerda tutashadi) */}
    <path d="M37 14 Q56 12.5 55 23 Q54 34 37 29.5 Q41.5 22 37 14 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1.3"/>
    {/* orqa qabariq tangachalar */}
    <g fill="#3F9A42" opacity="0.85"><path d="M44 11.5 q1.6 -3 3.2 0 Z"/><path d="M49 12 q1.4 -2.6 2.8 0 Z"/></g>
    {/* old oyoq (pastda, qisqa) */}
    <path d="M43 29 q0.6 4.5 4.5 5 q-1.4 -2.5 -1 -4.6 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="0.9"/>
    {/* yuqori jag' (uchi chap-yuqorida; burun) */}
    <path d="M40 17 Q22 8 6 9 Q2 9 3 12.5 Q22 16 40 21.5 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1.3" strokeLinejoin="round"/>
    {/* pastki jag' (uchi chap-pastda) */}
    <path d="M40 27 Q22 36 6 35 Q2 35 3 31.5 Q22 28 40 22.5 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1.3" strokeLinejoin="round"/>
    {/* pastki jag' ochroq qorin */}
    <path d="M7 33 Q22 33.4 38 27.6 Q23 31 8.5 31 Z" fill="url(#crocBelly)" opacity="0.9"/>
    {/* yuqori tishlar (og'iz ichiga pastga) */}
    <g fill="#FFFFFF" stroke="#CFE3CF" strokeWidth="0.3">
      <path d="M8 13.4 L11 13.4 L9.5 16.6 Z"/><path d="M15 15.2 L18 15.2 L16.5 18.4 Z"/><path d="M22 17 L25 17 L23.5 20.2 Z"/><path d="M29 18.7 L32 18.7 L30.5 21.6 Z"/>
    </g>
    {/* pastki tishlar (yuqoriga) */}
    <g fill="#FFFFFF" stroke="#CFE3CF" strokeWidth="0.3">
      <path d="M8 30.6 L11 30.6 L9.5 27.4 Z"/><path d="M15 28.8 L18 28.8 L16.5 25.6 Z"/><path d="M22 27 L25 27 L23.5 23.8 Z"/><path d="M29 25.3 L32 25.3 L30.5 22.4 Z"/>
    </g>
    {/* burun teshiklari (uchda) */}
    <ellipse cx="6.5" cy="10.6" rx="0.9" ry="0.7" fill="#2E7D32"/><ellipse cx="9" cy="11.1" rx="0.9" ry="0.7" fill="#2E7D32"/>
    {/* ikki ko'z (bosh ustida ko'tarilgan) */}
    <g>
      <circle cx="49" cy="12.5" r="3.9" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
      <circle cx="49" cy="12.1" r="2" fill="#FFFFFF"/><circle cx="49.5" cy="12.1" r="1" fill="#23303A"/><circle cx="49.9" cy="11.5" r="0.4" fill="#fff"/>
      <circle cx="42" cy="11.2" r="4.6" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
      <circle cx="42" cy="10.7" r="2.4" fill="#FFFFFF"/><circle cx="42.7" cy="10.7" r="1.2" fill="#23303A"/><circle cx="43.2" cy="10" r="0.5" fill="#fff"/>
    </g>
  </g>
);
// CrocCalm — tinch, mamnun timsoh; og'iz YOPIQ: ikkita TENG chiziq (=).
const CrocCalm = () => (
  <g>
    {/* dum (chapda) */}
    <path d="M5 19 Q-1 16 0 22 Q-1 28 5 25 Q3 22 5 19 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
    {/* tana (gorizontal; burun o'ngda) */}
    <path d="M9 15 Q5 15 5 22 Q5 29 9 29 L48 29 Q55 28 55 22 Q55 16 48 15 Z" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1.3"/>
    {/* ochroq qorin */}
    <path d="M10 27 Q28 28 48 27 Q28 30.5 10 29 Z" fill="url(#crocBelly)" opacity="0.85"/>
    {/* orqa tangachalar */}
    <g fill="#3F9A42" opacity="0.85"><path d="M16 14 q1.5 -2.6 3 0 Z"/><path d="M22 14 q1.5 -2.6 3 0 Z"/></g>
    {/* ikkita TENG parallel chiziq = yopiq og'iz = teng */}
    <rect x="14" y="20" width="30" height="2.6" rx="1.3" fill="#2E7D32"/>
    <rect x="14" y="24.4" width="30" height="2.6" rx="1.3" fill="#2E7D32"/>
    {/* burun teshiklari (o'ng uch) */}
    <ellipse cx="50" cy="20.5" rx="0.9" ry="0.7" fill="#2E7D32"/><ellipse cx="50" cy="23.5" rx="0.9" ry="0.7" fill="#2E7D32"/>
    {/* ikki ko'z (bosh ustida, mamnun) */}
    <g>
      <circle cx="41" cy="12.5" r="3.8" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
      <circle cx="41" cy="12.1" r="1.9" fill="#FFFFFF"/><circle cx="41" cy="12.1" r="0.95" fill="#23303A"/>
      <circle cx="47.5" cy="13" r="3.4" fill="url(#crocG)" stroke="#3F9A42" strokeWidth="1"/>
      <circle cx="47.5" cy="12.6" r="1.7" fill="#FFFFFF"/><circle cx="47.5" cy="12.6" r="0.85" fill="#23303A"/>
    </g>
  </g>
);
const CompareSign = ({ dir = 'gt', big = false }) => (
  <span className={`d4-sign d4-croc ${big ? 'd4-sign-big' : ''} d4-croc-anim`} aria-hidden="true">
    <svg viewBox="0 0 60 44" preserveAspectRatio="xMidYMid meet">
      <CrocDefs/>
      {dir === 'eq'
        ? <CrocCalm/>
        : dir === 'lt'
          ? <g transform="translate(60,0) scale(-1,1)"><CrocOpen/></g>
          : <CrocOpen/>}
    </svg>
  </span>
);

// CrocChase — TO'G'RI javobdan keyin MUKOFOT: timsoh kattaroq songa yuguradi, og'zini ochib "yeydi".
// Bola qaysi son to'g'ri ekanini ko'rishi uchun TARGET son yirik ko'rsatiladi. reduced-motion: yugurmaydi.
const CrocChase = ({ target }) => (
  <div className="d4-chase" aria-hidden="true">
    <span className="d4-chase-croc">
      <svg viewBox="0 0 60 44" preserveAspectRatio="xMidYMid meet">
        <CrocDefs/>
        <g transform="translate(60,0) scale(-1,1)"><CrocOpen/></g>
      </svg>
    </span>
    <span className="d4-chase-num d4-numwiggle">{target}</span>
  </div>
);

// D4CrocReal — SYUJET timsohi: TO'LIQ, real (tanasi, dumi, oyoqlari, uzun tumshug'i). Katta sahnalar uchun.
// mood='curious' -> og'iz ochiq, ko'z hushyor (kirish); mood='happy' -> og'iz yopiq, jilmayadi (ko'prik/yakun).
// Savollarda EMAS — u yerda faqat belgi-bosh (CompareSign/CrocOpen/CrocCalm) ishlatiladi.
const D4CrocReal = ({ mood = 'curious' }) => {
  const open = mood === 'curious';
  return (
    <svg className="d4-crocreal-svg" viewBox="0 0 224 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="d4crBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#84D06F"/><stop offset="55%" stopColor="#4FA24A"/><stop offset="100%" stopColor="#357C34"/>
        </linearGradient>
        <linearGradient id="d4crWet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6FCBE0"/><stop offset="100%" stopColor="#2E88AE"/>
        </linearGradient>
      </defs>
      {/* timsohning suv yamog'i (atrofidagi ko'l yuzasi) */}
      <ellipse cx="112" cy="64" rx="110" ry="26" fill="url(#d4crWet)" opacity="0.45"/>
      {/* suv osti tanasi (xira, yumaloq) */}
      <g opacity="0.38" fill="#3E8F52">
        <ellipse cx="114" cy="66" rx="82" ry="16"/>
        <ellipse cx="70" cy="78" rx="8" ry="5"/><ellipse cx="152" cy="78" rx="8" ry="5"/>
      </g>
      {/* suv yuzasi porlashi */}
      <ellipse cx="112" cy="55" rx="104" ry="6" fill="#DCF5FB" opacity="0.4"/>
      {/* DUM UCHI (yumaloq) */}
      <path d="M18 56 Q20 44 34 46 Q45 48 43 54 Q41 59 30 59 Q21 59 18 56 Z" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="2" strokeLinejoin="round"/>
      {/* ORQA (yumaloq, past-yassi) */}
      <path d="M42 57 Q100 40 152 51 Q158 54 152 58 Q100 51 44 60 Q39 58 42 57 Z" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="2" strokeLinejoin="round"/>
      {/* orqa do'ngchalar — mayin yumaloq (uchburchaksiz) */}
      <g fill="#3C8F3E"><path d="M60 51 q5 -5 10 0 Z"/><path d="M76 49 q5 -5 10 0 Z"/><path d="M92 48 q5 -5 10 0 Z"/><path d="M108 49 q5 -5 10 0 Z"/></g>
      {/* TUMSHUQ — yumaloq, do'stona (TISHSIZ) */}
      {open ? (
        <>
          <path d="M170 57 Q188 57 204 59 Q190 62 172 61 Q168 59 170 57 Z" fill="#E8899B"/>
          <path d="M150 50 Q189 45 211 51 Q221 53 214 57 Q192 57 152 57 Q147 53 150 50 Z" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M152 60 Q187 64 211 60 Q219 60 214 63 Q192 66 154 63 Q149 62 152 60 Z" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="2" strokeLinejoin="round"/>
        </>
      ) : (
        <>
          <path d="M150 51 Q190 46 212 52 Q221 54 214 58 Q192 62 152 58 Q147 54 150 51 Z" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M162 57 Q187 60 208 55" stroke="#2F6E30" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        </>
      )}
      {/* burun teshigi (yumaloq) */}
      <ellipse cx="208" cy="52" rx="2.2" ry="1.6" fill="#2F6E30"/>
      {/* do'stona qizg'ish yonoq */}
      <ellipse cx="165" cy="52" rx="5" ry="3" fill="#FF9BB0" opacity="0.38"/>
      {/* KO'Z DO'NGI + KATTA shirin ko'z */}
      <circle cx="150" cy="43" r="10" fill="url(#d4crBody)" stroke="#2F6E30" strokeWidth="1.6"/>
      {open ? (
        <>
          <circle cx="150" cy="43" r="5.4" fill="#FFFFFF"/>
          <circle cx="151.4" cy="43.3" r="3" fill="#23303A"/>
          <circle cx="152.6" cy="41.6" r="1.2" fill="#FFFFFF"/>
        </>
      ) : (
        <path d="M144 44 Q150 38 156 44" stroke="#23303A" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      )}
      {/* SUV HALQALARI */}
      <g fill="none" stroke="#EAF8FB" strokeWidth="1.6" opacity="0.7">
        <ellipse cx="150" cy="58" rx="22" ry="4"/>
        <ellipse cx="150" cy="59" rx="33" ry="6" opacity="0.5"/>
        <ellipse cx="62" cy="60" rx="16" ry="3.4"/>
      </g>
    </svg>
  );
};

// D4NumTile — yirik raqam tokeni (taqqoslashda son; belgisiz, faqat vizual).
const D4NumTile = ({ d }) => <span className="d4-numtile" aria-hidden="true">{d}</span>;

// ============================================================
// EKRANLAR — Dars04 (10 gacha taqqoslash)
// ============================================================

// OnboardHint — "ovozni oxirigacha tinglang -> Davom" maslahati (etalon infra, Dars03 dan).
const OnboardHint = () => {
  const lang = useLang();
  return (
    <div className="g1-onboard fade-up delay-2">
      <svg className="g1-onboard-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#019ACB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>
      </svg>
      <span className="g1-onboard-txt">{lang === 'uz' ? 'Ovozni oxirigacha tinglang' : 'Дослушай до конца'}</span>
      <span className="g1-onboard-arrow" aria-hidden="true">→</span>
      <span className="g1-onboard-pill">{lang === 'uz' ? 'Davom' : 'Дальше'}</span>
    </div>
  );
};

// D4Story — hikoya slaydi (sIntro / sGuest): SceneBg + Ra'no/Anvar + dekorativ ikki savat.
// NavNext ovoz tugagach ochiladi (bola hikoyani oxirigacha tinglaydi).
const D4Story = ({ props, c, variant = 'room', leftN = 4, rightN = 7, leftKind = 'apple', rightKind = 'cherry', crocMood = 'curious' }) => {
  const lang = useLang();
  const t = useT();
  const audio = useAudio(makeAutoSegments(c, lang));
  useHero('present');
  const total = Array.isArray(c.audio?.[lang]) ? c.audio[lang].length : 3;
  const step = useStoryReveal(audio, total);
  const canGo = useCanAnswer(audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(12px, 2.4vw, 16px)' }}>
        <h1 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.title)}</h1>
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(22px, 4.4vw, 32px)' }}>
          <div className="g1-scene d4-scene">
            <LakeBg variant={variant}/>
            <div className="g1-cast-row">
              <div className={`g1-cast ${step >= 1 ? 'in' : ''}`}>
                <div className="d4-castpair">
                  <div className="g1-cast-fig"><RanoSVG mood={step >= total ? 'happy' : 'pointing'} className="g1-cast-svg"/></div>
                  <div className="d4-basketstack">
                    <FruitBubble n={leftN} kind={leftKind}/>
                    <div className="d4-scenebasket"><D4Basket n={0}/></div>
                  </div>
                </div>
                <span className="g1-cast-name">{t(c.rano_label)}</span>
              </div>
              <div className={`g1-cast ${step >= 2 ? 'in' : ''}`}>
                <div className="d4-castpair">
                  <div className="g1-cast-fig"><AnvarSVG pose="idle" className="g1-cast-svg"/></div>
                  <div className="d4-basketstack">
                    <FruitBubble n={rightN} kind={rightKind}/>
                    <div className="d4-scenebasket"><D4Basket n={0}/></div>
                  </div>
                </div>
                <span className="g1-cast-name">{t(c.anvar_label)}</span>
              </div>
            </div>
            {/* Syujet personaji: to'liq real timsoh — kirishda qiziquvchan (og'zi ochiq), ko'prikda mamnun (jilmayadi). */}
            <div className={`d4-crocscene ${step >= 2 ? 'in' : ''}`} aria-hidden="true">
              <D4CrocReal mood={crocMood === 'happy' ? 'happy' : 'curious'}/>
            </div>
          </div>
        </div>
        <OnboardHint/>
      </div>
    </Stage>
  );
};

// sIntro — SYUJET KIRISH: Ra'no (4 olma) va Anvar (7 gilos) hovlida meva yig'ishdi.
const ScreenIntro = (props) => (
  <D4Story props={props} c={CONTENT.sIntro} variant="room" leftN={4} rightN={7} leftKind="mango" rightKind="grape"/>
);

// s0 — HOOK: ko'z bilan baho (tuzoq: 4 olma keng yoyilgan -> kattaroq ko'rinadi). To'g'ri javob yo'q.
const Screen0 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s0;
  const audio = useAudio([{ id: 's0_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [picked, setPicked] = useState(null);
  const [praiseWord, setPraiseWord] = useState('');
  const pick = (i) => {
    if (picked !== null) return;
    setPicked(i);
    const right = i === 1;
    if (right) sfx.playCorrect();
    const pw = nextPraise(lang); setPraiseWord(pw);
    if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff((right ? c.audio.on_correct : c.audio.on_wrong)[lang]); }
  };
  const opts = [c.opt0, c.opt1, c.opt2];
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={picked === null} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <h1 className="title h-sub fade-up">
          {t(c.title_part1) && <>{t(c.title_part1)} </>}<span className="italic" style={{ color: T.accent }}>{t(c.title_part2_em)}</span>{t(c.title_part3)}
        </h1>
        {/* Slayd 2: personaj boshi (statik) savatning YON tomonida — Ra'no (4) chapda, Anvar (7) o'ngda. */}
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(14px, 3vw, 22px)' }}>
          <div className="d4-s0row">
            <div className="d4-s0pair">
              <div className="d4-s0char">
                <div className="d4-s0head"><RanoSVG headOnly className="g1-cast-svg"/></div>
                <span className="g1-cast-name">{t(CONTENT.sIntro.rano_label)}</span>
              </div>
              <TopBasket n={4} kind="mango" mountCls="d4-mount"/>
            </div>
            <div className="d4-s0pair">
              <TopBasket n={7} kind="grape" mountCls="d4-mount-r"/>
              <div className="d4-s0char">
                <div className="d4-s0head"><AnvarSVG headOnly className="g1-cast-svg"/></div>
                <span className="g1-cast-name">{t(CONTENT.sIntro.anvar_label)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {opts.map((o, i) => (
            <button key={i} className={`g1-tile ${picked === i && i === 1 ? 'g1-tile-ok' : ''} ${picked === i && i !== 1 ? 'g1-tile-used' : ''}`} disabled={picked !== null} onClick={() => pick(i)} style={{ width: '100%', fontSize: 'clamp(14px, 1.9vw, 17px)' }}>
              {t(o)}
            </button>
          ))}
        </div>
        {picked !== null && (
          <FeedbackBlock show={true} isCorrect={picked === 1} wrongClass="frame-tip">
            <Reaction state={picked === 1 ? 'correct' : 'wrong'} praise={picked === 1 ? praiseWord : t(c.audio.on_wrong)}/>
          </FeedbackBlock>
        )}
      </div>
    </Stage>
  );
};

// s1 — EXPLORATION: har savatni TenFrame ga sanab solish. Avval Ra'no (4), keyin Anvar (7).
const Screen1 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s1;
  const audio = useAudio(makeAutoSegments(c, lang));
  const [rcount, setRcount] = useState(0); // Ra'no savatida sanalgan meva (0..4)
  const [acount, setAcount] = useState(0); // Anvar savatida sanalgan meva (0..7)
  const ranoDone = rcount === 4;
  const allDone = ranoDone && acount === 7;
  const revealRef = useRevealScroll(allDone);
  const tapRano = () => {
    if (rcount >= 4) return;
    const nc = rcount + 1; setRcount(nc);
    if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(NUM_WORDS[lang][nc]); }
  };
  const tapAnvar = () => {
    if (!ranoDone || acount >= 7) return;
    const nc = acount + 1; setAcount(nc);
    if (!audio.muted) { const e = getAudioEngine(); if (e) { e.pushOneOff(NUM_WORDS[lang][nc]); if (nc === 7) e.pushOneOff(c.done_audio[lang]); } }
  };
  // sanash ramkasi nima ekanini bir marta ovozli tushuntirish (ru/uz audio massivlariga tegmaydi)
  useEffect(() => {
    const id = setTimeout(() => {
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.frame_note[lang]); }
    }, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!allDone} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)}</p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 'clamp(16px, 5vw, 44px)', flexWrap: 'wrap', padding: 'clamp(14px, 2.6vw, 22px)' }}>
          <div className="d4-tapcol">
            <D4TapBasket n={4} kind="mango" count={rcount} active={!ranoDone} onTap={tapRano} showHand={!ranoDone && rcount === 0}/>
            <TenFrame n={rcount} kind="mango"/>
          </div>
          <div className="d4-tapcol">
            <D4TapBasket n={7} kind="grape" count={acount} active={ranoDone && acount < 7} onTap={tapAnvar} showHand={ranoDone && acount === 0}/>
            <TenFrame n={acount} kind="grape"/>
          </div>
        </div>
        <div className="g1-count-line fade-up delay-1">
          <span className="g1-count-label">{t(c.count_label)}</span>
          <span className="g1-count-val mono">{rcount} / 4 · {acount} / 7</span>
        </div>
        {allDone && (
          <div ref={revealRef} className="frame-success fade-up">
            <Reaction state="correct" praise={t(c.done_text)}/>
          </div>
        )}
      </div>
    </Stage>
  );
};

// s2 — EXPLORATION: ikki ramka yonma-yon (4 va 7). 7 ko'proq to'lgan -> kattaroq.
const Screen2 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s2;
  const audio = useAudio(makeAutoSegments(c, lang));
  const canGo = useCanAnswer(audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)}</p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px, 3vw, 26px)', padding: 'clamp(16px, 3vw, 26px)', flexWrap: 'wrap' }}>
          <CompareFrames left={4} right={7} leftKind="mango" rightKind="grape"/>
        </div>
        <BitSays text={t(c.done_text)}/>
      </div>
    </Stage>
  );
};

// s3 — RULE: taqqoslash = katta / kichik / teng.
const Screen3 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s3;
  const audio = useAudio([{ id: 's3', text: c.audio[lang], trigger: 'on_mount', waits_for: null }]);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={false} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <h1 className="title h-sub fade-up">
          {t(c.title_part1) && <>{t(c.title_part1)} </>}<span className="italic" style={{ color: T.accent }}>{t(c.title_part2_em)}</span>
        </h1>
        <div className="frame fade-up delay-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px, 3vw, 24px)', padding: 'clamp(16px, 3vw, 26px)', flexWrap: 'wrap' }}>
          <CompareFrames left={5} right={5} leftKind="mango" rightKind="grape"/>
        </div>
        <BitSays text={t(c.tip)}/>
      </div>
    </Stage>
  );
};

// s4 — TEST MC: qaysida ko'p? (6 vs 9). Variantlar = son tokenlari + teng belgisi. To'g'ri idx1 (9).
const Screen4 = (props) => {
  const c = CONTENT.s4;
  const t = useT();
  return (
    <QuestionScreen
      screen={props.screen} idx={props.screen} totalScreens={TOTAL_SCREENS}
      screenMeta={SCREEN_META[props.screen]} screenContent={c}
      question={<h2 className="title h-sub">{t(c.title)}</h2>}
      figure={() => <TwoBaskets left={6} right={9} leftKind="mango" rightKind="grape" compact/>}
      options={[<D4NumTile d={6}/>, <D4NumTile d={9}/>]}
      correctIdx={1}
      celebrateOnCorrect={() => <CrocChase target={9}/>}
      mascot={false}
      storedAnswer={props.storedAnswer} onAnswer={props.onAnswer}
      onNext={props.onNext} onPrev={props.onPrev}
    />
  );
};

// s5 — EXPLORATION (yangi belgi): 7 > 4. Ochiq tomon kattaga (7) qaraydi.
const Screen5 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s5;
  const audio = useAudio(makeAutoSegments(c, lang));
  const canGo = useCanAnswer(audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)}</p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px, 3vw, 26px)', padding: 'clamp(22px, 4vw, 34px)' }}>
          <D4NumTile d={7}/>
          <CompareSign dir="gt" big/>
          <D4NumTile d={4}/>
        </div>
      </div>
    </Stage>
  );
};

// s6 — RULE: uchta belgi > < =. Misollar bilan (faqat raqam + belgi, matnsiz).
const Screen6 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s6;
  const audio = useAudio([{ id: 's6', text: c.audio[lang], trigger: 'on_mount', waits_for: null }]);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={false} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <h1 className="title h-sub fade-up">
          {t(c.title_part1) && <>{t(c.title_part1)} </>}<span className="italic" style={{ color: T.accent }}>{t(c.title_part2_em)}</span>
        </h1>
        <div className="frame fade-up delay-1" style={{ padding: 'clamp(16px, 3vw, 26px)' }}>
          <div className="d4-signrow">
            <div className="d4-signex"><D4NumTile d={7}/><CompareSign dir="gt"/><D4NumTile d={4}/></div>
            <div className="d4-signex"><D4NumTile d={4}/><CompareSign dir="lt"/><D4NumTile d={7}/></div>
            <div className="d4-signex"><D4NumTile d={5}/><CompareSign dir="eq"/><D4NumTile d={5}/></div>
          </div>
        </div>
        <BitSays text={t(c.tip)}/>
      </div>
    </Stage>
  );
};

// s7 — TEST (belgini joyiga qo'y): 8 _ 5 -> belgi chiplaridan to'g'risini bos (>). Veди-do-верного.
const S7_SIGNS = ['lt', 'eq', 'gt'];
const Screen7 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s7;
  const sfx = useSfx();
  const audio = useAudio([{ id: 's7_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const canAns = useCanAnswer(audio);
  const wasSolved = props.storedAnswer?.solved === true;
  const [placed, setPlaced] = useState(wasSolved ? 'gt' : null);
  const [solved, setSolved] = useState(wasSolved);
  const [wrong, setWrong] = useState(() => new Set());
  const [praiseWord, setPraiseWord] = useState('');
  const [encWord, setEncWord] = useState('');
  const firstTryRef = useRef(props.storedAnswer ? (props.storedAnswer.firstTry ?? null) : null);
  const attemptsRef = useRef(props.storedAnswer?.attempts ?? 0);
  const CORRECT = 'gt';
  const place = (sign) => {
    if (solved || !canAns || wrong.has(sign)) return;
    attemptsRef.current += 1;
    if (sign === CORRECT) {
      setPlaced('gt'); setSolved(true); sfx.playCorrect();
      const pw = nextPraise(lang); setPraiseWord(pw);
      if (!audio.muted) { const e = getAudioEngine(); if (e) { e.pushOneOff(pw); e.pushOneOff(c.audio.on_correct[lang]); } }
      const ft = firstTryRef.current !== false;
      props.onAnswer({
        stage: SCREEN_META[props.screen].scope, screenIdx: props.screen,
        question: null, options: null, correctIndex: null, correctAnswer: null,
        studentAnswerIndex: null, studentAnswer: null,
        correct: ft, firstTry: ft, attempts: attemptsRef.current, solved: true
      });
    } else {
      firstTryRef.current = false;
      setWrong((p) => { const s = new Set(p); s.add(sign); return s; });
      setEncWord(nextEncourage(lang));
      sfx.playWrong();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff((c.wrong_default || c.audio.on_wrong)[lang]); }
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!solved} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)}</p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(10px, 3vw, 22px)', padding: 'clamp(20px, 4vw, 32px)' }}>
          <span className={solved ? 'd4-numwiggle' : ''} style={{ display: 'inline-flex' }}><D4NumTile d={8}/></span>
          <span className={`d4-slot ${solved ? 'd4-slot-ok' : ''}`}>
            {placed
              ? <span className={solved ? 'd4-slotchase' : ''} style={{ display: 'inline-flex' }}><CompareSign dir={placed} big/></span>
              : <span className="d4-slot-empty" aria-hidden="true">?</span>}
          </span>
          <D4NumTile d={5}/>
        </div>
        {!solved && (
          <div className="d4-tray fade-up delay-2">
            {S7_SIGNS.map((s) => (
              <button key={s} className={`d4-chip ${wrong.has(s) ? 'd4-chip-wrong' : ''}`} disabled={!canAns || wrong.has(s)} onClick={() => place(s)}>
                <CompareSign dir={s}/>
              </button>
            ))}
          </div>
        )}
        {solved && (
          <FeedbackBlock show={true} isCorrect={true} wrongClass="frame-tip">
            <Reaction state="correct" praise={praiseWord}/>
          </FeedbackBlock>
        )}
        {!solved && wrong.size > 0 && (
          <FeedbackBlock show={true} isCorrect={false} wrongClass="frame-tip">
            <Reaction state="wrong" praise={encWord}/>
          </FeedbackBlock>
        )}
      </div>
    </Stage>
  );
};

// s8 — TEST MC (ha/yo'q): 6 va 6 teng. "Anvarda ko'p" to'g'rimi? To'g'ri = Yo'q (idx1).
const Screen8 = (props) => {
  const c = CONTENT.s8;
  const t = useT();
  return (
    <QuestionScreen
      screen={props.screen} idx={props.screen} totalScreens={TOTAL_SCREENS}
      screenMeta={SCREEN_META[props.screen]} screenContent={c}
      question={<h2 className="title h-sub">{t(c.title)}</h2>}
      figure={() => <TwoBaskets left={6} right={6} leftKind="mango" rightKind="mango" compact/>}
      options={[<span className="d4-opt-txt">{t(c.opt0)}</span>, <span className="d4-opt-txt">{t(c.opt1)}</span>]}
      correctIdx={1}
      mascot={false}
      storedAnswer={props.storedAnswer} onAnswer={props.onAnswer}
      onNext={props.onNext} onPrev={props.onPrev}
    />
  );
};

// s9 — TEST MC (predmetsiz): 7 yoki 4 — qaysi katta? To'g'ri = 7 (idx0).
const Screen9 = (props) => {
  const c = CONTENT.s9;
  const t = useT();
  return (
    <QuestionScreen
      screen={props.screen} idx={props.screen} totalScreens={TOTAL_SCREENS}
      screenMeta={SCREEN_META[props.screen]} screenContent={c}
      question={<h2 className="title h-sub">{t(c.title)}</h2>}
      options={[<D4NumTile d={7}/>, <D4NumTile d={4}/>]}
      correctIdx={0}
      celebrateOnCorrect={() => <CrocChase target={7}/>}
      mascot={false}
      storedAnswer={props.storedAnswer} onAnswer={props.onAnswer}
      onNext={props.onNext} onPrev={props.onPrev}
    />
  );
};

// s10 — TEST (tartiblash, tap): savatlarni kichikdan kattaga bos (3 -> 5 -> 8).
const S10_BASKETS = [{ id: 'b8', n: 8, kind: 'cherry' }, { id: 'b3', n: 3, kind: 'apple' }, { id: 'b5', n: 5, kind: 'flower' }];
const S10_ORDER = [3, 5, 8];
const Screen10 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s10;
  const sfx = useSfx();
  const audio = useAudio([{ id: 's10_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const canAns = useCanAnswer(audio);
  const wasSolved = props.storedAnswer?.solved === true;
  const [idx, setIdx] = useState(wasSolved ? S10_ORDER.length : 0);
  const [nudge, setNudge] = useState(null);
  const [praiseWord, setPraiseWord] = useState('');
  const firstTryRef = useRef(props.storedAnswer ? (props.storedAnswer.firstTry ?? null) : null);
  const attemptsRef = useRef(props.storedAnswer?.attempts ?? 0);
  const allDone = idx >= S10_ORDER.length;
  const revealRef = useRevealScroll(allDone);
  const tap = (b) => {
    if (allDone || !canAns) return;
    if (S10_ORDER.indexOf(b.n) < idx) return;
    attemptsRef.current += 1;
    if (b.n === S10_ORDER[idx]) {
      const ni = idx + 1; setIdx(ni); sfx.playCorrect();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(NUM_WORDS[lang][b.n]); }
      if (ni >= S10_ORDER.length) {
        const pw = nextPraise(lang); setPraiseWord(pw);
        if (!audio.muted) { const e = getAudioEngine(); if (e) { e.pushOneOff(pw); e.pushOneOff(c.done_text[lang]); } }
        const ft = firstTryRef.current !== false;
        props.onAnswer({
          stage: SCREEN_META[props.screen].scope, screenIdx: props.screen,
          question: null, options: null, correctIndex: null, correctAnswer: null,
          studentAnswerIndex: null, studentAnswer: null,
          correct: ft, firstTry: ft, attempts: attemptsRef.current, solved: true
        });
      }
    } else {
      firstTryRef.current = false;
      setNudge(b.id); setTimeout(() => setNudge(null), 450);
      sfx.playWrong();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff((c.wrong_default || c.audio.on_wrong)[lang]); }
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!allDone} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)} <span className="mono small" style={{ color: T.ink3 }}>{idx} / {S10_ORDER.length}</span></p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(16px, 3vw, 24px)' }}>
          <div className="d4-orderrow">
            {S10_BASKETS.map((b) => {
              const done = S10_ORDER.indexOf(b.n) < idx;
              return (
                <button key={b.id} className={`g1-housebtn ${done ? 'g1-housebtn-ok' : ''} ${nudge === b.id ? 'g1-nudge' : ''}`} disabled={done || allDone || !canAns} onClick={() => tap(b)}>
                  <div className="d4-ordertop"><TopBasket n={b.n} kind={b.kind}/></div>
                  {done && <span className="d4-rank mono">{S10_ORDER.indexOf(b.n) + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {allDone && (
          <div ref={revealRef} className="frame-success fade-up">
            <Reaction state="correct" praise={praiseWord}/>
          </div>
        )}
      </div>
    </Stage>
  );
};

// sd — MINI-O'YIN (ball yo'q): ikki savatdan ko'prog'ini bos. Belgilangan deck (Math.random yo'q).
const SD_ROUNDS = [[3, 6], [7, 4], [8, 5], [2, 7]];
const ScreenD = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sd;
  const sfx = useSfx();
  const audio = useAudio([{ id: 'sd_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const canAns = useCanAnswer(audio);
  const total = SD_ROUNDS.length;
  const [ri, setRi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [wrongSide, setWrongSide] = useState(null);
  const [done, setDone] = useState(false);
  const [praiseWord, setPraiseWord] = useState('');
  const revealRef = useRevealScroll(done);
  const round = SD_ROUNDS[ri];
  const moreSide = round[0] > round[1] ? 0 : 1;
  const pick = (side) => {
    if (!canAns || picked !== null || done) return;
    if (side === moreSide) {
      setPicked(side); sfx.playCorrect();
      if (ri >= total - 1) {
        setDone(true);
        const pw = nextPraise(lang); setPraiseWord(pw);
        if (!audio.muted) { const e = getAudioEngine(); if (e) { e.pushOneOff(pw); e.pushOneOff(c.done_text[lang]); } }
      } else {
        if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.correct_text[lang]); }
        setTimeout(() => { setPicked(null); setWrongSide(null); setRi((v) => v + 1); }, 900);
      }
    } else {
      setWrongSide(side); setTimeout(() => setWrongSide(null), 450); sfx.playWrong();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.retry_audio[lang]); }
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!done} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <p className="h-sub title fade-up">{t(c.instruction)} <span className="mono small" style={{ color: T.ink3 }}>{Math.min(ri + 1, total)} / {total}</span></p>
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 'clamp(16px, 6vw, 56px)', flexWrap: 'wrap', padding: 'clamp(16px, 3vw, 24px)' }}>
          {round.map((n, side) => (
            <button key={side} className={`g1-housebtn ${picked === side ? 'g1-housebtn-ok' : ''} ${wrongSide === side ? 'g1-nudge' : ''}`} disabled={!canAns || picked !== null || done} onClick={() => pick(side)}>
              <div className="d4-sdtop"><TopBasket n={n} kind={side === 0 ? 'apple' : 'cherry'}/></div>
            </button>
          ))}
        </div>
        {done && (
          <div ref={revealRef} className="frame-success fade-up">
            <Reaction state="correct" praise={praiseWord}/>
          </div>
        )}
      </div>
    </Stage>
  );
};

// sGuest — SYUJET KO'PRIK: do'stona bo'lishdi (premise bilan mos: Ra'no 4, Anvar 7 — teng emas).
const ScreenGuest = (props) => (
  <D4Story props={props} c={CONTENT.sGuest} variant="door" leftN={4} rightN={7} leftKind="mango" rightKind="grape" crocMood="happy"/>
);

// s11 — TEST final + FactCard: 8 va 8 -> qaysi belgi? To'g'ri = teng (idx2).
const Screen11 = (props) => {
  const c = CONTENT.s11;
  const t = useT();
  return (
    <QuestionScreen
      screen={props.screen} idx={props.screen} totalScreens={TOTAL_SCREENS}
      screenMeta={SCREEN_META[props.screen]} screenContent={c}
      question={<h2 className="title h-sub">{t(c.title)}</h2>}
      figure={() => <TwoBaskets left={8} right={8} leftKind="mango" rightKind="mango" compact/>}
      options={[<CompareSign dir="gt"/>, <CompareSign dir="lt"/>, <CompareSign dir="eq"/>]}
      correctIdx={2}
      mascot={false}
      factOnCorrect={(
        <div className="fact-card fade-up" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="fact-badge">{t(c.fact_badge)}</span>
          <p className="fact-text">{t(c.fact_text)}</p>
        </div>
      )}
      storedAnswer={props.storedAnswer} onAnswer={props.onAnswer}
      onNext={props.onNext} onPrev={props.onPrev}
    />
  );
};

// s12 — SUMMARY: reyting + can-do + ConnectionsBlock + yakuniy sahna (Ra'no + Anvar quvonadi).
const Screen12 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s12;
  useHero('present');
  const audio = useAudio(makeAutoSegments(c, lang));
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={false} onClick={props.finishLesson} label={lang === 'uz' ? 'Yakunlash' : 'Завершить'}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vw, 14px)' }}>
        <div className="g1-rating fade-up">
          <div className="g1-rating-stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className="g1-rating-star g1-pop-in" style={{ animationDelay: `${0.15 + i * 0.22}s` }}>
                <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L25.2 14.6 L38 16 L28.5 24.6 L31.2 37 L20 30.4 L8.8 37 L11.5 24.6 L2 16 L14.8 14.6 Z" fill="#FFC23C"/></svg>
              </span>
            ))}
          </div>
          <p className="g1-rating-praise">{t(c.praise)}</p>
        </div>
        <div className="frame-success fade-up delay-1">
          <h2 className="title h-sub" style={{ margin: 0 }}>
            {t(c.main_1)} <span className="italic" style={{ color: T.success }}>{t(c.main_2_em)}</span>
          </h2>
        </div>
        <div className="frame g1-conn fade-up delay-1" style={{ padding: 'clamp(10px, 1.8vw, 14px)' }}>
          <h3 className="g1-conn-title">{t(c.connections_title)}</h3>
          <div className="g1-conn-row"><span className="g1-conn-tag g1-conn-ref">{t(c.conn_label_refs)}</span><span className="g1-conn-txt">{t(c.conn_refs)}</span></div>
          <div className="g1-conn-row"><span className="g1-conn-tag g1-conn-next">{t(c.conn_label_next)}</span><span className="g1-conn-txt">{t(c.conn_next)}</span></div>
        </div>
        <div className="frame fade-up delay-1" style={{ padding: 'clamp(8px, 1.8vw, 14px)', overflow: 'hidden' }}>
          <div className="g1-scene d4-scene d4-scene-sum" style={{ minHeight: 'clamp(140px, 26vw, 200px)' }}>
            <LakeBg variant="room"/>
            <div className="d4-crocscene in" aria-hidden="true"><D4CrocReal mood="happy"/></div>
            <div className="g1-cast-row">
              <div className="g1-cast in">
                <div className="d4-castpair">
                  <div className="g1-cast-fig"><RanoSVG mood="happy" stars className="g1-cast-svg"/></div>
                  <div className="d4-basketstack">
                    <FruitBubble n={4} kind="mango"/>
                    <div className="d4-scenebasket"><D4Basket n={0}/></div>
                  </div>
                </div>
                <span className="g1-cast-name">{t(c.rano_label)}</span>
              </div>
              <div className="g1-cast in">
                <div className="d4-castpair">
                  <div className="g1-cast-fig"><AnvarSVG pose="idle" className="g1-cast-svg"/></div>
                  <div className="d4-basketstack">
                    <FruitBubble n={7} kind="grape"/>
                    <div className="d4-scenebasket"><D4Basket n={0}/></div>
                  </div>
                </div>
                <span className="g1-cast-name">{t(c.anvar_label)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
};

// ============================================================
// KORNEVOY KOMPONENT (shablon: infrastructure_v1)
// ============================================================
export default function CompareLesson({
  studentName, lang: langProp, ttsApiBase, voiceGender,
  correctSoundUrl, wrongSoundUrl, aiGradingEndpoint, onFinished,
}) {
  useMobileZoom();
  const isPreview = (langProp === undefined || langProp === null);
  const [previewLang, setPreviewLang] = useState('ru');
  const lang = langProp || previewLang;
  const safeName = studentName || (lang === 'uz' ? "O'quvchi" : 'Ученик');
  configureLesson({ ttsApiBase: ttsApiBase || '', correctSoundUrl: correctSoundUrl || '', wrongSoundUrl: wrongSoundUrl || '', aiGradingEndpoint: aiGradingEndpoint || '', studentName: safeName, voiceGender: voiceGender || 'f' });
  const safeOnFinished = onFinished || ((payload) => {
    // eslint-disable-next-line no-console
    console.log('[Preview] onFinished payload:', payload);
  });

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [heroMood, setHeroMood] = useState('pointing');   // personaj holati (butun urok bo'ylab bitta overlay)
  const heroCtx = React.useMemo(() => ({ setMood: setHeroMood }), []);
  const startTimeRef = useRef(Date.now());

  const recordAnswer = useCallback((screenIdx, data) => {
    setAnswers(prev => { const next = [...prev]; next[screenIdx] = data; return next; });
  }, []);

  const reset = useCallback(() => { setAnswers([]); setCurrent(0); setHeroMood('pointing'); startTimeRef.current = Date.now(); }, []);

  const finishLesson = useCallback(() => {
  const scored = SCREEN_META.filter(s => s.scored);
  const finalScreens = scored.filter(s => s.scope === 'final');
  const correctCount = answers.filter((a, i) => a && SCREEN_META[i]?.scored && a.correct).length;
  const finalCorrect = answers.filter((a, i) => a && SCREEN_META[i]?.scope === 'final' && a.correct).length;
  const checked = answers.filter(a => a && typeof a.firstTry === 'boolean');
  const payload = {
    lessonId: LESSON_META.lessonId,
    lessonTitle: LESSON_META.lessonTitle,
    durationSec: Math.floor((Date.now() - startTimeRef.current) / 1000),
    totalQuestions: scored.length,
    correctAnswers: correctCount,
    scorePercent: scored.length > 0 ? Math.round((correctCount / scored.length) * 100) : 0,
    finalScore: finalCorrect,
    finalTotal: finalScreens.length,
    passed: finalScreens.length > 0 ? finalCorrect / finalScreens.length >= 0.6 : (scored.length > 0 ? correctCount / scored.length >= 0.6 : false),
    firstTryStats: { total: checked.length, firstTryCorrect: checked.filter(a => a.firstTry === true).length },
    answers: answers.filter(Boolean)
  };
  safeOnFinished(payload);
}, [answers, safeOnFinished]);

  const screens = [ScreenIntro, Screen0, Screen1, Screen2, Screen3, Screen4, Screen5, Screen6, Screen7, Screen8, Screen9, Screen10, ScreenD, ScreenGuest, Screen11, Screen12];
  const CurrentScreen = screens[current];

  // Ekran almashganda personajni "ko'rsatadi" (pointing) holatiga qaytaramiz;
  // javobdan keyin Reaction uni happy/encourage'ga o'zgartiradi.
  const next = () => { setHeroMood('pointing'); setCurrent(s => Math.min(s + 1, TOTAL_SCREENS - 1)); };
  const prev = () => { setHeroMood('pointing'); setCurrent(s => Math.max(s - 1, 0)); };

  const handleAnswer = useCallback((data) => { recordAnswer(current, data); }, [current, recordAnswer]);

  const starTotal = SCREEN_META.filter((s) => s.scored).length;
  const starsEarned = answers.filter((a, i) => a && SCREEN_META[i] && SCREEN_META[i].scored && a.correct).length;

  return (
    <LangContext.Provider value={lang}>
      <ProgressContext.Provider value={{ stars: starsEarned, total: starTotal }}>
      <HeroContext.Provider value={heroCtx}>
      <style>{STYLES}</style>
      <div className="lesson-root">
        <GradientDefs/>
        <HouseDefs/>
        <AmbientBg/>
        <StageHero mood={heroMood}/>
        {isPreview && (
          <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 4, background: '#FFFFFF', borderRadius: 99, padding: 4, boxShadow: '0 4px 12px -4px rgba(58, 53, 48, 0.25)' }}>
            {['ru', 'uz'].map(l => (
              <button key={l} onClick={() => setPreviewLang(l)}
                style={{ border: 'none', cursor: 'pointer', borderRadius: 99, padding: '4px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                         background: previewLang === l ? '#FF4F28' : 'transparent', color: previewLang === l ? '#FFFFFF' : '#5A5A60' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <CurrentScreen screen={current} studentName={safeName} storedAnswer={answers[current]} answers={answers} onAnswer={handleAnswer} onNext={next} onPrev={prev} onReset={reset} finishLesson={finishLesson}/>
      </div>
      </HeroContext.Provider>
      </ProgressContext.Provider>
    </LangContext.Provider>
  );
}

const STYLES = `
html, body { margin: 0; padding: 0; }
.lesson-root, .lesson-root * { box-sizing: border-box; }
/* position: fixed + inset: 0 — dars oqimdan chiqib, doim aynan KO'RINADIGAN
   viewport'ga mixlanadi. Host (LessonPage/LMS) 100vh bilan balandroq bo'lsa ham
   body-skroll darsga ta'sir qilmaydi, "Davom" tugmasi joyidan siljimaydi.
   URL-panel ochilib-yopilganda balandlikni brauzer o'zi kuzatadi (JS o'lchovsiz). */
.lesson-root {
  font-family: 'Manrope', system-ui, sans-serif;
  color: #0E0E10;
  background: #F6F4EF;
  position: fixed;
  inset: 0;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01","cv11";
  zoom: var(--g1z, 1);
}
/* Mobil yagona masshtab (useMobileZoom): layout doim 390px, zoom real ekranga
   moslaydi — barcha telefonlarda aynan bir xil ko'rinish. Desktop tegilmaydi. */
@media (max-width: 639.98px) {
  .lesson-root { width: 390px; }
}

/* Reset margins для типографики внутри урока */
.lesson-root h1,
.lesson-root h2,
.lesson-root h3,
.lesson-root h4,
.lesson-root h5,
.lesson-root h6,
.lesson-root p,
.lesson-root ul,
.lesson-root ol { margin: 0; padding: 0; }

.title { font-family: 'Source Serif 4', serif; font-weight: 600; line-height: 1.1; letter-spacing: -0.005em; font-variation-settings: "opsz" 60; }
.display { font-family: 'Source Serif 4', serif; font-weight: 600; line-height: 1.0; letter-spacing: -0.01em; font-variation-settings: "opsz" 60; }
.italic { font-family: 'Source Serif 4', serif; font-style: italic; font-weight: 500; font-variation-settings: "opsz" 60; }
.mono { font-family: 'JetBrains Mono', monospace; }
.mop { font-family: 'Manrope', sans-serif; font-weight: 600; color: #0E0E10; display: inline-block; padding: 0 0.06em; }

.frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; line-height: 1; margin: 0 0.08em; font-family: 'Fraunces', serif; font-variation-settings: "opsz" 144; font-weight: 400; }
.frac .n, .frac .d { padding: 0 0.12em; }
.frac .bar { height: 0.08em; background: currentColor; width: 100%; margin: 0.08em 0; border-radius: 2px; }

@keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: fade-in-up 0.4s ease-out forwards; opacity: 0; }
.delay-1 { animation-delay: 0.12s; } .delay-2 { animation-delay: 0.24s; }
.delay-3 { animation-delay: 0.36s; } .delay-4 { animation-delay: 0.48s; }

.feedback-block { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.4s ease-out, opacity 0.3s ease-out 0.1s, margin-top 0.4s ease-out; margin-top: 0; }
.feedback-block.visible { max-height: 800px; opacity: 1; margin-top: clamp(14px, 2vw, 20px); }

/* === КНОПКИ v15 (тени вместо рамок) === */
.btn {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: #0E0E10;
  color: #F6F4EF;
  letter-spacing: 0.01em;
  border-radius: 12px;
  border: none;
  box-shadow: 0 6px 18px -4px rgba(58, 53, 48, 0.32);
}
.btn:hover:not(:disabled) {
  background: #FF4F28;
  box-shadow: 0 10px 24px -4px rgba(255, 79, 40, 0.45);
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

.btn-white-accent {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: #FFFFFF;
  color: #FF4F28;
  letter-spacing: 0.01em;
  border-radius: 12px;
  border: none;
  box-shadow: 0 8px 22px -4px rgba(255, 79, 40, 0.35), 0 0 0 1px rgba(255, 79, 40, 0.12);
}
.btn-white-accent:hover:not(:disabled) {
  background: #FF4F28;
  color: #FFFFFF;
  box-shadow: 0 12px 28px -6px rgba(255, 79, 40, 0.55);
}
.btn-white-accent:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: 0 4px 12px -4px rgba(58, 53, 48, 0.14); }

.btn-ghost {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
  color: #0E0E10;
  letter-spacing: 0.01em;
  border-radius: 12px;
  border: none;
  box-shadow: none;
}
.btn-ghost:hover:not(:disabled) {
  background: #FFFFFF;
  box-shadow: 0 6px 18px -6px rgba(58, 53, 48, 0.18);
}
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

/* === ОПЦИИ v15 (без рамок, на тенях) === */
.option {
  background: #FFFFFF;
  cursor: pointer;
  transition: all 0.2s;
  font-family: 'Manrope', sans-serif;
  font-weight: 500;
  text-align: left;
  border-radius: 12px;
  width: 100%;
  border: none;
  color: #0E0E10;
  box-shadow: 0 6px 16px -6px rgba(58, 53, 48, 0.14);
}
.option:hover:not(:disabled) {
  background: #FDFBF7;
  box-shadow: 0 10px 22px -6px rgba(58, 53, 48, 0.22);
}
.option:disabled { cursor: default; }
.option-correct {
  background: #E3F0E8 !important;
  color: #1F7A4D !important;
  box-shadow: 0 8px 22px -6px rgba(31, 122, 77, 0.32) !important;
}
.option-wrong {
  background: #FFFFFF !important;
  color: #A7A6A2 !important;
  opacity: 0.32 !important;
  box-shadow: 0 4px 12px -6px rgba(58, 53, 48, 0.06) !important;
}
.option-picked-wrong {
  background: #FBF3D6 !important;
  color: #C99A2E !important;
  box-shadow: 0 8px 22px -6px rgba(216, 169, 58, 0.32) !important;
}

/* === ТИПОГРАФИКА v15 (× 0.85 upper bounds) === */
.h-title { font-size: clamp(22px, 4vw, 30px); }
.h-sub { font-size: clamp(20px, 3.2vw, 23px); }
.body { font-size: clamp(15px, 1.9vw, 15px); line-height: 1.42; }
.eyebrow { font-size: clamp(11px, 1.3vw, 11px); letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; }
.small { font-size: clamp(13px, 1.5vw, 13px); }
.frac-display { font-size: clamp(45px, 9vw, 75px); }
.frac-mid { font-size: clamp(24px, 5vw, 24px); }
.frac-sm { font-size: clamp(16px, 2.5vw, 20px); }

/* === STAGE v15 (sticky stage-header) === */
.stage { max-width: 936px; margin: 0 auto; height: 100%; display: flex; flex-direction: column; position: relative; z-index: 1; }
.stage-header {
  flex-shrink: 0;
  background: #F6F4EF;
  padding-top: clamp(11px, 2vw, 11px);
  padding-bottom: clamp(8px, 1.5vw, 12px);
}
.stage-content {
  flex: 1;
  padding-top: clamp(8px, 1.5vw, 11px);
  padding-bottom: clamp(11px, 2.4vw, 15px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.stage-nav {
  flex-shrink: 0;
  background: #F6F4EF;
  border-top: 1px solid rgba(167, 166, 162, 0.25);
  padding-top: clamp(11px, 2vw, 11px);
  padding-bottom: clamp(11px, 2vw, 11px);
  display: flex;
  gap: 12px;
}

.chrome { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0; }
.chrome-left { display: flex; align-items: center; gap: 10px; color: #5A5A60; }
/* yulduz-kopilka (yuqorida): to'g'ri javoblar to'planadi */
.g1-stars { display: flex; gap: clamp(2px,0.8vw,5px); align-items: center; }
.g1-star-slot { font-size: clamp(13px,1.9vw,17px); line-height: 1; color: rgba(167,166,162,0.4); }
.g1-star-slot.on { color: #FFC23C; animation: g1starpop 0.45s cubic-bezier(0.34,1.6,0.64,1); }
@keyframes g1starpop { 0% { transform: scale(0.3); } 60% { transform: scale(1.35); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .g1-star-slot.on { animation: none; } }
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FF4F28;
  box-shadow: 0 0 8px rgba(255, 79, 40, 0.55);
}

/* === PROGRESS v15 (с orange glow) === */
.progress-track {
  height: 6px;
  background: rgba(167, 166, 162, 0.25);
  width: 100%;
  margin-bottom: 12px;
  border-radius: 99px;
  overflow: visible;
}
.progress-bar {
  height: 100%;
  background: #FF4F28;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 99px;
  box-shadow: 0 0 10px rgba(255, 79, 40, 0.55), 0 0 3px rgba(255, 79, 40, 0.40);
}

/* === SLIDER v15 === */
.track-wrap {
  position: relative;
  height: 26px;
  margin: 18px 0;
  display: flex;
  align-items: center;
}
.track-bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  background: rgba(167, 166, 162, 0.30);
  border-radius: 99px;
  pointer-events: none;
}
.track-fill {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  background: #FF4F28;
  border-radius: 99px;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(255, 79, 40, 0.50), 0 0 2px rgba(255, 79, 40, 0.40);
  transition: width 0.15s ease-out;
}
.slider-input {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  width: 100%;
  height: 24px;
  background: transparent;
  outline: none;
  margin: 0;
  cursor: grab;
  z-index: 2;
}
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: #FF4F28;
  border-radius: 50%;
  cursor: grab;
  transition: transform 0.1s;
  border: none;
  box-shadow: 0 0 0 4px #F6F4EF, 0 0 12px 0 rgba(255, 79, 40, 0.55);
}
.slider-input::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: #FF4F28;
  border-radius: 50%;
  cursor: grab;
  border: none;
  box-shadow: 0 0 0 4px #F6F4EF, 0 0 12px 0 rgba(255, 79, 40, 0.55);
}
.slider-input::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.12); }
.slider-input:disabled { cursor: not-allowed; }
.slider-input:disabled::-webkit-slider-thumb { opacity: 0.5; cursor: not-allowed; }

/* === INPUT v15 === */
.answer-input {
  font-family: 'Fraunces', serif;
  font-size: clamp(22px, 4vw, 27px);
  font-weight: 400;
  text-align: center;
  border-radius: 12px;
  background: #FFFFFF;
  padding: 8px 12px;
  outline: none;
  border: none;
  color: #0E0E10;
  transition: all 0.2s;
  box-shadow: 0 6px 16px -6px rgba(58, 53, 48, 0.14);
}
.answer-input:focus {
  box-shadow: 0 10px 22px -6px rgba(255, 79, 40, 0.30), 0 0 0 1px rgba(255, 79, 40, 0.20);
}
.answer-input.correct {
  background: #E3F0E8;
  color: #1F7A4D;
  box-shadow: 0 8px 20px -6px rgba(31, 122, 77, 0.30);
}
.answer-input.wrong {
  background: #FFE8E1;
  color: #FF4F28;
  box-shadow: 0 8px 20px -6px rgba(255, 79, 40, 0.36);
}

/* === FRAMES v15 === */
.frame {
  background: #FFFFFF;
  border-radius: 16px;
  padding: clamp(20px, 4.2vw, 24px);
  border: none;
  box-shadow: 0 8px 22px -6px rgba(58, 53, 48, 0.14);
  overflow: hidden;
}
.frame-soft {
  background: #FFE8E1;
  border-left: 4px solid #FF4F28;
  border-radius: 12px;
  padding: clamp(14px, 2.5vw, 14px);
  box-shadow: 0 6px 16px -6px rgba(255, 79, 40, 0.22);
}
.frame-success {
  background: #E3F0E8;
  border-left: 4px solid #1F7A4D;
  border-radius: 12px;
  padding: clamp(14px, 2.5vw, 14px);
  box-shadow: 0 6px 16px -6px rgba(31, 122, 77, 0.22);
}
/* MATH: бледно-жёлтый callout для справочного (подсказки, выводы). */
.frame-tip { background: #FBF3D6; border-left: 4px solid #D8A93A; border-radius: 12px; padding: clamp(14px, 2.5vw, 14px); box-shadow: 0 6px 16px -6px rgba(180, 138, 30, 0.22); }
/* MATH: ФАКТ-БЛОК — синяя карта, КРУПНАЯ анимация + мало текста. */
.fact-card { display: flex; gap: clamp(12px, 2.5vw, 18px); align-items: center; background: #EAF6FB; border-left: 4px solid #019ACB; border-radius: 12px; padding: clamp(12px, 2.2vw, 16px); box-shadow: 0 6px 16px -6px rgba(1, 154, 203, 0.22); }
.fact-anim { flex-shrink: 0; width: clamp(90px, 18vw, 130px); height: clamp(70px, 14vw, 96px); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.fact-body { flex: 1; }
.fact-badge { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-family: 'JetBrains Mono', monospace; font-size: clamp(10px, 1.2vw, 11px); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #019ACB; }
.fact-dot { width: 7px; height: 7px; border-radius: 50%; background: #019ACB; box-shadow: 0 0 8px rgba(1, 154, 203, 0.55); }
.fact-text { margin: 0; font-size: clamp(12px, 1.5vw, 13px); line-height: 1.4; color: #0E0E10; }

/* MATH: ambient — мягкие плавающие круги на разрежённых экранах (декор). */
.amb { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.amb-o { position: absolute; border-radius: 50%; opacity: 0.7; animation: ambFloat 15s ease-in-out infinite; background: radial-gradient(circle at 30% 30%, rgba(255, 79, 40, 0.10), rgba(255, 79, 40, 0.02)); }
.amb-o1 { width: 90px; height: 90px; left: 5%; top: 10%; animation-delay: 0s; }
.amb-o2 { width: 130px; height: 130px; right: 3%; bottom: 6%; animation-delay: -5s; background: radial-gradient(circle at 30% 30%, rgba(1, 154, 203, 0.10), rgba(1, 154, 203, 0.02)); }
.amb-o3 { width: 58px; height: 58px; left: 42%; top: 62%; animation-delay: -9s; }
@keyframes ambFloat { 0%, 100% { transform: translateY(0) translateX(0); } 33% { transform: translateY(-14px) translateX(8px); } 66% { transform: translateY(8px) translateX(-10px); } }

/* Accessibility: prefers-reduced-motion — гасим декоративные циклы. */
@media (prefers-reduced-motion: reduce) {
  .lesson-root, .lesson-root *, .lesson-root *::before, .lesson-root *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

/* === GRADE1 num_1_01 — sanash vizuallari (animatsion to'plam) === */
.g1-listen-hint { margin: 0; color: #019ACB; font-weight: 600; letter-spacing: 0.04em; opacity: 0.9; animation: g1twinkle 1.8s ease-in-out infinite; }
.g1-pips { display: flex; flex-wrap: nowrap; gap: clamp(4px, 1.2vw, 9px); justify-content: center; align-items: center; max-width: 100%; }
.g1-pips-wrap { flex-wrap: wrap; }
.g1-obj { width: clamp(36px, 8.5vw, 58px); aspect-ratio: 1 / 1; height: auto; min-width: 0; display: inline-flex; flex-shrink: 1; filter: drop-shadow(0 4px 7px rgba(58,53,48,0.18)); }
.g1-bob { animation: g1bob 3s ease-in-out infinite; }
.g1-twinkle { animation: g1twinkle 2s ease-in-out infinite; }
@keyframes g1bob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-7px) rotate(3deg); } }
@keyframes g1twinkle { 0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); } 50% { opacity: 0.5; transform: scale(0.82) rotate(8deg); } }
@keyframes g1pop { 0% { opacity: 0; transform: scale(0.4); } 60% { transform: scale(1.12); } 100% { opacity: 1; transform: scale(1); } }
@keyframes g1drop { 0% { opacity: 0; transform: translateY(-30px); } 72% { transform: translateY(3px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes g1pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
@keyframes g1gap { 0%, 100% { transform: scale(1); box-shadow: 0 6px 16px -6px rgba(255,79,40,0.30); } 50% { transform: scale(1.06); box-shadow: 0 10px 22px -6px rgba(255,79,40,0.5); } }

/* CountDemo — jonli sanash */
.g1-demo { display: flex; flex-direction: column; align-items: center; gap: clamp(10px, 2.4vw, 16px); }
.g1-demo-row { display: flex; gap: clamp(12px, 3vw, 20px); justify-content: center; align-items: flex-end; min-height: clamp(60px, 13vw, 86px); }
.g1-demo-cell { position: relative; width: clamp(52px, 11vw, 78px); height: clamp(52px, 11vw, 78px); opacity: 0; }
.g1-demo-cell.on { opacity: 1; animation: g1pop 0.45s ease-out; }
.g1-demo-cell.pulse { animation: g1pop 0.45s ease-out, g1pulse 1.7s ease-in-out 0.5s infinite; }
.g1-demo-cell svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 7px rgba(58,53,48,0.18)); }
.g1-demo-tag { position: absolute; top: -8px; right: -6px; background: #1F7A4D; color: #fff; font-weight: 800; font-size: clamp(11px, 1.6vw, 13px); min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.g1-demo-num { font-weight: 800; font-size: clamp(40px, 9vw, 62px); color: #FF4F28; line-height: 1; }
.g1-demo-num.big { font-size: clamp(52px, 13vw, 86px); }

/* TenFrame — bo'sh kataklar */
.g1-tenframe { display: flex; gap: clamp(7px, 1.8vw, 12px); justify-content: center; }
.g1-cell { width: clamp(64px, 14vw, 94px); height: clamp(64px, 14vw, 94px); border-radius: 14px; display: flex; align-items: center; justify-content: center; transition: background 0.25s, box-shadow 0.25s; }
.g1-cell-target { background: #FFFFFF; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.45); }
.g1-cell-filled { background: #E3F0E8; box-shadow: inset 0 0 0 2px #1F7A4D; }
.g1-cell-empty { background: #FBF3D6; box-shadow: inset 0 0 0 2px #D8A93A; }
.g1-cell-obj { width: 74%; height: 74%; display: inline-flex; animation: g1drop 0.4s ease-out; }
.g1-cell-obj svg { width: 100%; height: 100%; filter: drop-shadow(0 3px 6px rgba(58,53,48,0.18)); }
/* interaktiv ten-frame (s5): bosiladigan kataklar */
.g1-cell-btn { position: relative; width: clamp(64px, 14vw, 94px); height: clamp(64px, 14vw, 94px); border: none; border-radius: 14px; cursor: pointer; background: #FFFFFF; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.45); display: flex; align-items: center; justify-content: center; transition: background 0.2s, box-shadow 0.2s, transform 0.15s; }
.g1-cell-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: inset 0 0 0 2px #019ACB; }
.g1-cell-btn.filled { background: #E3F0E8; box-shadow: inset 0 0 0 2px #1F7A4D; cursor: default; }
.g1-cell-num { position: absolute; top: 3px; right: 6px; font-weight: 800; font-size: clamp(12px, 1.7vw, 15px); color: #1F7A4D; }

/* CountTrack / MissingTrack — son qatori */
.g1-track-label { font-weight: 800; font-size: clamp(14px, 2vw, 17px); color: #FF4F28; letter-spacing: 0.02em; min-height: 1.3em; transition: color 0.25s; }
.g1-track-label.back { color: #019ACB; }
.g1-track { display: flex; gap: clamp(7px, 1.8vw, 12px); justify-content: center; }
.g1-track-tile { width: clamp(52px, 11.5vw, 72px); height: clamp(56px, 13vw, 80px); background: #FFFFFF; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px -6px rgba(58,53,48,0.16); transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.25s, color 0.25s, box-shadow 0.25s; }
.g1-track-tile span { font-weight: 800; font-size: clamp(28px, 6.5vw, 42px); color: #0E0E10; }
.g1-track-tile.active { background: #FF4F28; transform: translateY(-7px); box-shadow: 0 12px 26px -6px rgba(255,79,40,0.5); }
.g1-track-tile.active span { color: #FFFFFF; }
.g1-track-tile.gap { background: #FBF3D6; box-shadow: inset 0 0 0 2px #D8A93A; animation: g1gap 1.4s ease-in-out infinite; }
.g1-track-tile.gap span { color: #D8A93A; }
.g1-track-tile.g1-track-filled { background: #1F7A4D; box-shadow: 0 12px 26px -6px rgba(31,122,77,0.5); }
.g1-track-tile.g1-track-filled span { color: #FFFFFF; }
/* count javob badge'i (sanagandan keyin son paydo bo'ladi) */
.g1-countfig { display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.8vw, 12px); }
.g1-countfig-ans { font-weight: 800; font-size: clamp(30px, 7vw, 46px); color: #1F7A4D; }
/* BigNumberCue (keyingi/oldingi savol uchun tayanch son) */
.g1-cue { display: flex; align-items: center; justify-content: center; gap: clamp(10px, 3vw, 22px); }
.g1-cue-num { width: clamp(82px, 20vw, 124px); height: clamp(82px, 20vw, 124px); background: #FF4F28; color: #FFFFFF; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(44px, 10vw, 68px); box-shadow: 0 12px 26px -6px rgba(255,79,40,0.5); }
.g1-cue-arrow { font-size: clamp(44px, 11vw, 70px); font-weight: 800; color: #A7A6A2; }
.g1-cue-num.g1-cue-ans { background: #1F7A4D; box-shadow: 0 12px 26px -6px rgba(31,122,77,0.5); }
.g1-pop-in { animation: g1pop 0.4s cubic-bezier(0.34,1.56,0.64,1); }

/* CountingHand — sanaydigan qo'l */
.g1-hand { position: relative; width: clamp(143px, 32vw, 218px); height: clamp(135px, 30vw, 204px); display: flex; align-items: center; justify-content: center; }
.g1-hand-big { width: clamp(200px, 50vw, 300px); height: clamp(190px, 48vw, 280px); }
.g1-hand svg { width: 100%; height: 100%; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.2)); }
.g1-hand-num { position: absolute; top: -2px; right: 2px; background: #1F7A4D; color: #fff; font-weight: 800; font-size: clamp(15px, 2.4vw, 20px); min-width: 28px; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px -4px rgba(31,122,77,0.5); }

/* s5 dasturxon: tepadan ko'rilgan stol (naqshli) + non/choynak + likobchalar */
.g1-dasturxon { position: relative; background: #FBF3DE; border-radius: 18px; border: clamp(6px,1.6vw,9px) solid #019ACB; padding: clamp(12px,2.6vw,18px) clamp(12px,2.6vw,18px) clamp(14px,3vw,20px); display: flex; flex-direction: column; align-items: center; gap: clamp(10px,2.2vw,15px); box-shadow: 0 8px 22px -6px rgba(58,53,48,0.18); }
.g1-dasturxon::before { content: ''; position: absolute; inset: clamp(4px,1vw,6px); border: 2px dashed rgba(1,154,203,0.45); border-radius: 12px; pointer-events: none; }
.g1-dx-decor { display: flex; align-items: flex-end; justify-content: center; gap: clamp(8px,2vw,16px); position: relative; z-index: 1; }
.g1-dx-non { width: clamp(34px,8vw,48px); height: clamp(34px,8vw,48px); filter: drop-shadow(0 3px 5px rgba(58,53,48,0.18)); }
.g1-dx-teapot { width: clamp(44px,10vw,60px); height: clamp(34px,8vw,46px); filter: drop-shadow(0 3px 5px rgba(58,53,48,0.18)); }
/* SYUJET (hikoya) sahnalari — kirish (dasturxon) va ko'prik (mehmon) */
.g1-table-scene { display: flex; justify-content: center; width: 100%; }
.g1-table-svg { width: clamp(280px, 72vw, 430px); height: auto; filter: drop-shadow(0 8px 16px rgba(58,53,48,0.16)); }
/* ovqat: realroq — joyida turadi, faqat sezilmas vertikal "nafas" (aylanishsiz) */
.g1-table-non { animation: g1float 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom; }
.g1-table-apples { animation: g1float 4s ease-in-out 0.7s infinite; transform-box: fill-box; transform-origin: center bottom; }
@keyframes g1float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
.g1-steam { transform-box: fill-box; transform-origin: center bottom; animation: g1steam 2.9s ease-in-out infinite; }
.g1-steam2 { animation-delay: 0.95s; }
.g1-steam3 { animation-delay: 1.7s; }
@keyframes g1steam { 0% { opacity: 0; transform: translateY(6px) scale(0.8); } 35% { opacity: 0.85; } 70% { opacity: 0.5; } 100% { opacity: 0; transform: translateY(-24px) scale(1.18); } }
/* dasturxon ustidan suzib o'tuvchi yorug'lik (chap->o'ng) — "tayyor, chiroyli" */
.g1-table-sweep { animation: g1tsweep 3.6s ease-in-out infinite; }
@keyframes g1tsweep { 0% { transform: translateX(-110px) skewX(-20deg); opacity: 0; } 22% { opacity: 0.9; } 78% { opacity: 0.9; } 100% { transform: translateX(300px) skewX(-20deg); opacity: 0; } }
/* tayyorlangan dasturxon ustidagi uchqunlar */
.g1-table-spark { animation: g1tspark 1.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes g1tspark { 0%, 100% { opacity: 0.15; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .g1-table-non, .g1-table-apples, .g1-steam, .g1-table-sweep, .g1-table-spark { animation: none; } }
.g1-guest-scene svg { width: clamp(275px, 68vw, 420px); height: auto; }
/* yo'riqnoma chipi (1-slayd): tingla -> Davom */
.g1-onboard { display: flex; align-items: center; justify-content: center; gap: clamp(8px,1.6vw,12px); align-self: center; background: #EAF6FB; border: 1px solid rgba(1,154,203,0.3); border-radius: 99px; padding: clamp(8px,1.5vw,11px) clamp(14px,2.6vw,20px); }
.g1-onboard-ic { flex-shrink: 0; animation: g1twinkle 1.8s ease-in-out infinite; }
.g1-onboard-txt { font-family: 'Manrope', sans-serif; font-weight: 600; font-size: clamp(13px,1.7vw,15px); color: #017BA3; }
.g1-onboard-arrow { color: #A7A6A2; font-weight: 800; font-size: clamp(15px,2vw,18px); }
.g1-onboard-pill { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(12px,1.5vw,13px); color: #FFFFFF; background: #FF4F28; border-radius: 99px; padding: clamp(5px,1vw,7px) clamp(12px,2.2vw,16px); }
/* mehmon: o'ngdan kirib keladi (1x), keyin yengil tebranadi */
.g1-guest { animation: g1guestEnter 0.85s cubic-bezier(0.34,1.5,0.6,1) both, g1guestBob 2.6s ease-in-out 0.9s infinite; }
.g1-guest-hand { animation: g1wave 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom left; }
.g1-knock { transform-box: fill-box; transform-origin: left center; animation: g1knock 1.5s ease-in-out infinite; }
.g1-doorglow { animation: g1glow 2.2s ease-in-out infinite; }
.g1-giftspark { animation: g1giftspark 1.4s ease-in-out infinite; }
@keyframes g1guestEnter { 0% { opacity: 0; transform: translateX(48px); } 100% { opacity: 1; transform: translateX(0); } }
@keyframes g1guestBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes g1wave { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-14deg); } }
@keyframes g1knock { 0% { opacity: 0; transform: translateX(-4px) scale(0.85); } 45% { opacity: 1; } 100% { opacity: 0; transform: translateX(6px) scale(1.14); } }
@keyframes g1glow { 0%,100% { opacity: 0.22; } 50% { opacity: 0.6; } }
@keyframes g1giftspark { 0%,100% { opacity: 0.1; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .g1-guest, .g1-guest-hand, .g1-knock, .g1-doorglow, .g1-giftspark { animation: none; } }
.g1-tablescene { display: flex; flex-direction: column; align-items: center; width: 100%; }
.g1-plates { display: flex; gap: clamp(6px,1.8vw,12px); justify-content: center; position: relative; z-index: 1; flex-wrap: wrap; }
.g1-plate { position: relative; width: clamp(62px,14vw,90px); height: clamp(62px,14vw,90px); border-radius: 50%; border: clamp(3px,0.8vw,4px) solid #5FBFE0; cursor: pointer; background: radial-gradient(circle at 50% 36%, #FFFFFF 0%, #FBFAF5 54%, #E6DDCB 100%); box-shadow: 0 7px 16px -6px rgba(58,53,48,0.4), inset 0 7px 12px -5px rgba(58,53,48,0.22); display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
.g1-plate::before { content: ''; position: absolute; inset: clamp(6px,1.5vw,9px); border-radius: 50%; border: 1.5px dashed rgba(1,154,203,0.5); pointer-events: none; }
.g1-plate:hover:not(:disabled) { transform: translateY(-2px); }
.g1-plate.filled { cursor: default; }
.g1-plate-obj { width: 62%; height: 62%; display: inline-flex; }
.g1-plate-obj svg { width: 100%; height: 100%; filter: drop-shadow(0 3px 5px rgba(58,53,48,0.2)); }
.g1-plate-num { position: absolute; bottom: -2px; right: -2px; background: #1F7A4D; color: #fff; font-weight: 800; font-size: clamp(11px,1.6vw,14px); min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.g1-tabletop { width: clamp(230px,60vw,380px); height: clamp(20px,4.4vw,30px); background: linear-gradient(#C8893E, #B17B34); border-radius: 7px; box-shadow: 0 8px 16px -6px rgba(58,53,48,0.35); position: relative; z-index: 0; }

/* s4 figura (TOZA): idle animatsiya HTML div'da — kafolatli ishlaydi */
.g1-s4fig { position: relative; display: inline-block; line-height: 0; animation: g1idle 3.2s ease-in-out infinite; transform-origin: center bottom; }
.g1-s4fig-svg { width: clamp(150px,38vw,200px); height: auto; display: block; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.18)); }
.g1-s4fig-happy { animation: g1jump 0.7s ease, g1idle 3.2s ease-in-out 0.7s infinite; }

/* DressStars (s4) eski meros — endi ishlatilmaydi (saqlangan, zararsiz) */
.g1-dress { position: relative; display: inline-flex; }
.g1-dress-svg { width: clamp(150px,38vw,200px); height: auto; display: block; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.18)); }
.g1-arm-up { opacity: 0; transition: opacity 0.35s; }
.g1-arm-dn { opacity: 1; transition: opacity 0.35s; }
.g1-dress-happy .g1-arm-up { opacity: 1; }
.g1-dress-happy .g1-arm-dn { opacity: 0; }
.g1-dress-happy .g1-dress-svg { animation: g1jump 0.7s ease; transform-origin: center bottom; }
@keyframes g1jump { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-14px); } 70% { transform: translateY(0); } }
.g1-mouth-happy { opacity: 0; }
.g1-dress-happy .g1-mouth-happy { opacity: 1; }
.g1-dress-happy .g1-mouth { opacity: 0; }
.g1-spark { position: absolute; width: 14px; height: 14px; background: radial-gradient(circle, #FFD86B 0%, rgba(255,216,107,0) 70%); border-radius: 50%; pointer-events: none; }
.g1-spark1 { left: 8%; top: 22%; animation: g1spark 0.9s ease-out 0s infinite; }
.g1-spark2 { right: 6%; top: 30%; animation: g1spark 0.9s ease-out 0.3s infinite; }
.g1-spark3 { left: 16%; top: 52%; animation: g1spark 0.9s ease-out 0.6s infinite; }
@keyframes g1spark { 0% { opacity: 0; transform: scale(0.4); } 40% { opacity: 1; transform: scale(1.15); } 100% { opacity: 0; transform: scale(0.5); } }
.g1-conf { position: absolute; top: -8%; width: 8px; height: 12px; border-radius: 2px; pointer-events: none; }
.g1-conf1 { left: 16%; background: #FF4F28; animation: g1conf 1.1s ease-in 0s infinite; }
.g1-conf2 { left: 34%; background: #019ACB; animation: g1conf 1.3s ease-in 0.2s infinite; }
.g1-conf3 { left: 50%; background: #FFC23C; animation: g1conf 1.0s ease-in 0.45s infinite; }
.g1-conf4 { left: 64%; background: #1F7A4D; animation: g1conf 1.25s ease-in 0.1s infinite; }
.g1-conf5 { left: 80%; background: #FF7AA8; animation: g1conf 1.15s ease-in 0.55s infinite; }
.g1-conf6 { left: 26%; background: #9B5DE5; animation: g1conf 1.2s ease-in 0.75s infinite; }
@keyframes g1conf { 0% { opacity: 0; transform: translateY(0) rotate(0deg); } 12% { opacity: 1; } 100% { opacity: 0; transform: translateY(190px) rotate(420deg); } }
/* Reaction — yagona emotsional otklik (maskot + maqtov) */
.g1-react { display: flex; align-items: center; gap: clamp(8px,1.8vw,12px); }
/* === PNG personaj overlay — butun urok bo'ylab bitta doimiy element (personaj.md) ===
   Doimiy joylashuv (sakramaydi), pastki chap burchak, nav ustida; pointer-events yo'q
   (taplar o'tib ketadi, tugma/predmetlarni bloklamaydi). */
.g1-hero { width: auto; display: block; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.24)); }
/* SVG personajlar (Ra'no/Anvar/Bit): bazaviy o'lcham + jonlanish */
.g1-char { display: block; height: 100%; width: auto; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.22)); }
.g1-eyes { transform-box: fill-box; transform-origin: center; animation: g1blink 4.4s infinite; }
@keyframes g1blink { 0%, 93%, 100% { transform: scaleY(1); } 96.5% { transform: scaleY(0.12); } }
.g1-bit-ant { transform-box: fill-box; transform-origin: bottom center; animation: g1antbob 2.2s ease-in-out infinite; }
@keyframes g1antbob { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } }
.g1-bit-wave, .g1-anvar-wave { transform-box: fill-box; transform-origin: bottom left; animation: g1wavebig 1s ease-in-out infinite; }
@keyframes g1wavebig { 0%,100% { transform: rotate(2deg); } 50% { transform: rotate(-26deg); } }
@keyframes g1bitfloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
/* idle — Ra'no/Anvar figuralar (cast + s4 ko'ylak) sezilarli nafas/tebranish (#8: kattaroq) */
/* idle — HTML o'rovchida (svg ildizida emas; ishonchli va yaqqol ko'rinadi) */
.g1-cast-fig, .g1-dress { animation: g1idle 3.2s ease-in-out infinite; transform-origin: center bottom; }
@keyframes g1idle { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(3deg); } }
.g1-stage-hero { position: absolute; left: clamp(2px,1.6vw,28px); bottom: clamp(72px,11vh,104px); z-index: 6; pointer-events: none; display: flex; align-items: flex-end; gap: clamp(2px,1vw,8px); }
.g1-stage-hero .g1-hero { transform-origin: bottom center; }
.g1-stage-hero .g1-hero-rano { height: clamp(104px,22vh,208px); }
.g1-stage-hero .g1-hero-bit { height: clamp(80px,17vh,156px); }   /* Bit Ra'nodan kichikroq */
/* Mobil (tor ekran): personaj kichikroq va burchakka, kontentni kamroq yopadi */
@media (max-width: 640px) {
  .g1-stage-hero { left: 0; bottom: clamp(62px,9vh,84px); gap: 0; }
  .g1-stage-hero .g1-hero-rano { height: clamp(78px,14vh,116px); }
  .g1-stage-hero .g1-hero-bit { height: clamp(62px,11vh,92px); }
}
.g1-sh-pointing .g1-hero-rano { animation: g1heroIn 0.45s ease; }
.g1-sh-happy .g1-hero-rano { animation: g1mhop 0.6s ease; }
.g1-sh-encourage .g1-hero-rano { animation: g1mtilt 0.7s ease; }
.g1-sh-encourage .g1-hero-bit { animation: g1heroIn 0.45s ease 0.1s both; }
.g1-sh-celebrate .g1-hero-rano { animation: g1mhop 0.9s ease; }
/* Bit BOSHLOVCHI (present) — ramka ekranlarida diktor, Ra'no o'lchamida (kirish + suzish) */
.g1-sh-present .g1-hero-bit { height: clamp(104px,22vh,200px); animation: g1heroIn 0.45s ease, g1bitfloat 3.2s ease-in-out 0.45s infinite; }
@media (max-width: 640px) { .g1-sh-present .g1-hero-bit { height: clamp(76px,14vh,112px); } }
/* Story cast (frame ichi): Ra'no + Anvar, bosqichma-bosqich ochiladi (useStoryReveal) */
/* Orqa sahna (xona/eshik) — personajlar oldida, REAL masshtab (personaj katta, jihoz proporsional) */
.g1-scene { position: relative; width: 100%; display: flex; align-items: flex-end; justify-content: center; min-height: clamp(200px,44vw,340px); overflow: hidden; border-radius: 14px; }
.g1-scene-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
.g1-scene > .g1-cast-row { position: relative; z-index: 1; padding-bottom: clamp(8px,2.4vw,18px); }
.g1-scene .g1-cast-fig { height: clamp(132px,32vw,230px); }   /* sahnada personaj kattaroq */
/* slayd 1 dasturxon (chiroyli stol) — personajlar orqasida, polda */
.g1-scene-table { position: absolute; left: 50%; bottom: clamp(2px,1.4vw,12px); transform: translateX(-50%); width: clamp(230px,60vw,420px); z-index: 0; pointer-events: none; }
.g1-scene-table .g1-table-svg { width: 100%; filter: drop-shadow(0 8px 16px rgba(58,53,48,0.14)); }
.g1-scene-intro .g1-cast-row { gap: clamp(80px,30vw,260px); }   /* personajlar dasturxon yon tomonlarida */
.g1-cast-row { display: flex; align-items: flex-end; justify-content: center; gap: clamp(18px,5vw,48px); flex-wrap: wrap; }
.g1-cast { display: flex; flex-direction: column; align-items: center; gap: clamp(6px,1.4vw,10px); opacity: 0; transform: translateY(10px) scale(0.96); transition: opacity 0.5s ease, transform 0.5s ease; }
.g1-cast.in { opacity: 1; transform: translateY(0) scale(1); }
.g1-cast-fig { height: clamp(96px,20vw,150px); display: flex; align-items: flex-end; justify-content: center; }
.g1-cast-sm .g1-cast-fig { height: clamp(72px,15vw,110px); }
.g1-cast-img { height: 100%; width: auto; display: block; filter: drop-shadow(0 6px 12px rgba(58,53,48,0.22)); }
.g1-cast-name { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(13px,1.8vw,16px); color: #5A5A60; }
.g1-cast-sub { color: #A7A6A2; font-weight: 600; }
/* Anvar PLACEHOLDER (rasm hali yo'q): punktir ramka -> "rasm tez orada keladi" signali */
.g1-anvar-ph { height: 100%; aspect-ratio: 2 / 3; display: flex; align-items: center; justify-content: center; padding: clamp(6px,1.4vw,10px); border: 2px dashed rgba(1,154,203,0.55); border-radius: 16px; background: rgba(205,231,241,0.18); }
.g1-anvar-coming { opacity: 0.92; }
.g1-anvar-door { animation: g1pulse 1.8s ease-in-out infinite; }
.g1-anvar-happy { animation: g1mhop 0.9s ease; }
/* s10/s11 final bayram: savat + Anvar yonma-yon */
.g1-final-cel { display: flex; align-items: center; justify-content: center; gap: clamp(12px,3vw,28px); flex-wrap: wrap; }
/* s10 fakt: 5 barmoqli qo'l + matn (barmoqlar ko'rsatiladi) */
.g1-handfact { display: flex; align-items: center; gap: clamp(12px,2.6vw,18px); background: #EAF6FB; border-left: 4px solid #019ACB; border-radius: 12px; padding: clamp(12px,2.2vw,16px); box-shadow: 0 6px 16px -6px rgba(1,154,203,0.22); margin-top: clamp(10px,2vw,14px); }
.g1-handfact-hand { flex-shrink: 0; }
.g1-handfact-hand .g1-hand { width: clamp(96px,22vw,150px); height: clamp(92px,21vw,142px); }
.g1-handfact-txt { margin: 0; font-family: 'Source Serif 4', serif; font-weight: 600; font-size: clamp(14px,2vw,18px); color: #0E5F7F; }
@media (prefers-reduced-motion: reduce) { .g1-cast { transition: none; } .g1-anvar-door, .g1-anvar-happy, .g1-cast-fig, .g1-dress { animation: none; } }
@keyframes g1heroIn { 0% { opacity: 0; transform: translateY(10px) scale(0.94); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes g1mhop { 0%,100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-13px) scale(1.14); } 55% { transform: translateY(0) scale(1); } 70% { transform: translateY(-6px) scale(1.07); } }
@keyframes g1mtilt { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-11deg); } 55% { transform: rotate(8deg); } 80% { transform: rotate(-4deg); } }
.g1-react-txt { font-family: 'Source Serif 4', serif; font-weight: 700; font-size: clamp(16px,2.6vw,22px); }
.g1-react-ok .g1-react-txt { color: #1F7A4D; }
.g1-react-enc .g1-react-txt { color: #D8A93A; }
/* Bit-KARTOCHKA (har javobda): matn chap, animatsion Bit o'ng — 5-sinf fakt-kartochka uslubi */
.g1-bitcard { display: flex; align-items: center; gap: clamp(10px,2.4vw,16px); width: 100%; }
.g1-bitcard-body { flex: 1; min-width: 0; }
.g1-bitcard-txt { font-family: 'Source Serif 4', serif; font-weight: 700; font-size: clamp(16px,2.6vw,22px); }
.g1-bitcard-ok .g1-bitcard-txt { color: #1F7A4D; }
.g1-bitcard-enc .g1-bitcard-txt { color: #D8A93A; }
.g1-bitcard-fig { flex-shrink: 0; height: clamp(48px,11vw,68px); }
.g1-bitcard-ok .g1-bitcard-fig .g1-char { animation: g1mhop 0.7s ease; }
.g1-bitcard-enc .g1-bitcard-fig .g1-char { animation: g1mtilt 0.7s ease; }
@media (prefers-reduced-motion: reduce) {
  .g1-hero, .g1-char, .g1-eyes, .g1-bit-ant, .g1-bit-wave, .g1-anvar-wave { animation: none !important; }
  .g1-sh-present .g1-hero-bit, .g1-bitcard-ok .g1-bitcard-fig .g1-char, .g1-bitcard-enc .g1-bitcard-fig .g1-char { animation: none !important; }
}
@media (prefers-reduced-motion: reduce) { .g1-s4fig, .g1-s4fig-happy, .g1-dress-happy .g1-dress-svg, .g1-spark1, .g1-spark2, .g1-spark3, .g1-conf1, .g1-conf2, .g1-conf3, .g1-conf4, .g1-conf5, .g1-conf6 { animation: none; } }
/* yakuniy reyting (rag'bat): 3 yulduz + maqtov */
.g1-rating { display: flex; flex-direction: column; align-items: center; gap: clamp(4px,1vw,8px); }
.g1-rating-stars { display: flex; gap: clamp(6px,1.6vw,12px); }
.g1-rating-star { width: clamp(50px,11vw,72px); height: clamp(50px,11vw,72px); display: inline-flex; }
.g1-rating-star svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 8px rgba(255,194,60,0.55)); }
.g1-rating-praise { margin: 0; font-family: 'Source Serif 4', serif; font-weight: 700; font-size: clamp(22px,5vw,32px); color: #FF4F28; }

/* === GameDrill (drag+tap o'yin bloki) === */
.g1-tray { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(6px,1.7vw,12px); padding: clamp(7px,1.7vw,11px); min-height: clamp(48px,10vw,68px); background: #FBF9F4; border-radius: 14px; }
.g1-token { background: #FFFFFF; border-radius: 12px; box-shadow: 0 6px 16px -6px rgba(58,53,48,0.2); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; display: flex; align-items: center; justify-content: center; padding: clamp(8px,1.8vw,12px); min-width: clamp(58px,13vw,78px); min-height: clamp(58px,13vw,78px); transition: transform 0.15s, box-shadow 0.15s; }
.g1-token:active { cursor: grabbing; transform: scale(1.05); }
.g1-token-sel { box-shadow: 0 0 0 3px #FF4F28, 0 8px 20px -6px rgba(255,79,40,0.4); }
/* noto'g'ri sudralganda: token yumshoq sakrab qaytadi (jazo emas) */
.g1-bounceback { animation: g1bounceback 0.5s ease; }
@keyframes g1bounceback { 0% { transform: translateY(0) scale(1); } 28% { transform: translateY(-9px) scale(1.1); } 55% { transform: translateY(0) scale(0.97); } 78% { transform: translateY(-3px) scale(1.02); } 100% { transform: translateY(0) scale(1); } }
/* savatga qo'yishni ko'rsatuvchi qo'l-demo */
.g1-bhd { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; z-index: 7; padding-bottom: clamp(6px,1.6vw,12px); }
.g1-bhd-move { display: flex; flex-direction: column; align-items: center; animation: g1bhd 2.6s ease-in-out infinite; filter: drop-shadow(0 8px 14px rgba(58,53,48,0.28)); }
.g1-bhd-apple { width: clamp(30px,7vw,42px); height: clamp(30px,7vw,42px); display: inline-flex; }
.g1-bhd-apple svg { width: 100%; height: 100%; }
.g1-bhd-petal { width: clamp(26px,6vw,36px); height: clamp(32px,7.5vw,46px); border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%; background: linear-gradient(155deg, #FFB6CE 0%, #FF6FA0 52%, #DA4A82 100%); display: inline-block; }
.g1-bhd-hand { width: clamp(28px,6.5vw,38px); height: auto; margin-top: -4px; }
@keyframes g1bhd { 0% { transform: translateY(12px); opacity: 0; } 12% { opacity: 1; } 46% { transform: translateY(-58px); opacity: 1; } 58% { transform: translateY(-58px) scale(0.94); } 74% { opacity: 1; } 88% { transform: translateY(-64px); opacity: 0; } 100% { transform: translateY(-64px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .g1-bounceback, .g1-bhd-move { animation: none; } }
.g1-token-obj { width: clamp(40px,9vw,56px); height: clamp(40px,9vw,56px); display: inline-flex; pointer-events: none; }
.g1-token-obj svg { width: 100%; height: 100%; }
.g1-token-num { font-weight: 800; font-size: clamp(32px,7vw,44px); color: #0E0E10; pointer-events: none; }
.g1-piece { width: clamp(30px,7vw,44px); height: clamp(30px,7vw,44px); border-radius: 8px; display: inline-block; pointer-events: none; }
.g1-dropzone { transition: background 0.2s, box-shadow 0.2s; cursor: pointer; }
/* noto'g'ri sudralganda: yumshoq sariq puls (jazo emas, "yana sana") */
.g1-nudge { animation: g1nudge 0.45s ease; }
@keyframes g1nudge { 0%, 100% { outline: 2px solid rgba(216,169,58,0); outline-offset: 2px; } 45% { outline: 3px solid rgba(216,169,58,0.75); outline-offset: 3px; } }
@media (prefers-reduced-motion: reduce) { .g1-nudge { animation: none; } }
.g1-basket { min-width: clamp(150px,42vw,280px); min-height: clamp(80px,16vw,112px); background: #FBF3D6; border-radius: 16px; box-shadow: inset 0 0 0 2px #D8A93A; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: clamp(10px,2vw,14px); }
.g1-basket-objs { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(5px,1.4vw,9px); }
.g1-basket-objs .g1-token-obj { width: clamp(26px,6vw,38px); height: clamp(26px,6vw,38px); }
.g1-basket-count { font-weight: 800; font-size: clamp(20px,3.4vw,26px); color: #1F7A4D; }
.g1-puzzle { display: flex; gap: clamp(5px,1.4vw,8px); }
.g1-slot { width: clamp(34px,8vw,52px); height: clamp(46px,10vw,66px); border-radius: 10px; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.5); display: flex; align-items: center; justify-content: center; }
.g1-slot.filled { box-shadow: none; }
.g1-slot .g1-piece { width: 82%; height: 86%; }
/* match: har variant (2/4/5 olma) o'z qatorida — raqam-uyasi chapda, olmalar bitta qatorda o'ngda */
.g1-mbaskets { display: flex; flex-direction: column; gap: clamp(8px,1.8vw,12px); align-items: stretch; width: 100%; max-width: clamp(280px,90vw,460px); margin: 0 auto; }
.g1-mbasket { background: #FFFFFF; border-radius: 14px; box-shadow: 0 6px 16px -6px rgba(58,53,48,0.16); padding: clamp(8px,1.8vw,12px) clamp(12px,2.6vw,18px); display: flex; flex-direction: row; align-items: center; gap: clamp(12px,3vw,20px); min-width: 0; }
.g1-mbasket-num { flex-shrink: 0; width: clamp(46px,10vw,60px); height: clamp(46px,9vw,58px); border-radius: 12px; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.5); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(30px,6.5vw,40px); color: #1F7A4D; }
.g1-order { display: flex; gap: clamp(6px,1.6vw,10px); justify-content: center; }
.g1-pos { width: clamp(56px,12vw,74px); height: clamp(60px,13vw,80px); border-radius: 12px; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.5); display: flex; align-items: center; justify-content: center; background: #FFFFFF; }
.g1-pos.filled { box-shadow: 0 6px 16px -6px rgba(31,122,77,0.3); background: #E3F0E8; }
.g1-pos .g1-token-num { color: #1F7A4D; }
.g1-ghost { position: fixed; transform: translate(-50%,-50%); z-index: 999; pointer-events: none; background: #FFFFFF; border-radius: 12px; box-shadow: 0 12px 28px -6px rgba(58,53,48,0.35); padding: clamp(6px,1.4vw,10px); display: flex; align-items: center; justify-content: center; }
/* pazl = gul yig'ish */
.g1-flowerwrap { display: flex; flex-direction: column; align-items: center; gap: clamp(8px,1.8vw,12px); }
.g1-flower { position: relative; width: clamp(210px,50vw,290px); height: clamp(210px,50vw,290px); }
.g1-flower-center { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: clamp(40px,10vw,58px); height: clamp(40px,10vw,58px); border-radius: 50%; background: #FFC23C; box-shadow: 0 4px 10px -4px rgba(180,138,30,0.5); }
.g1-petal-slot { position: absolute; transform: translate(-50%,-50%); width: clamp(54px,13vw,76px); height: clamp(54px,13vw,76px); border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(167,166,162,0.5); display: flex; align-items: center; justify-content: center; }
.g1-petal-slot.filled { box-shadow: none; }
.g1-petal { width: clamp(38px,9vw,56px); height: clamp(48px,11vw,68px); border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%; background: linear-gradient(155deg, #FFB6CE 0%, #FF6FA0 52%, #DA4A82 100%); box-shadow: 0 4px 9px -4px rgba(218,74,130,0.55), inset 0 2px 5px rgba(255,255,255,0.4); display: inline-block; pointer-events: none; }
.g1-petal-slot .g1-petal { width: 80%; height: 88%; }
/* gul yig'ilib bo'lgach: bir marta sakrab, keyin sekin aylanadi */
.g1-flower-spin { animation: g1flowerPop 0.55s ease-out, g1spin 5s linear 0.55s infinite; }
@keyframes g1flowerPop { 0% { transform: scale(1) rotate(0deg); } 45% { transform: scale(1.14) rotate(18deg); } 100% { transform: scale(1) rotate(0deg); } }
@keyframes g1spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
/* savat (3 olma + 2 gilos) */
.g1-basketwrap { display: flex; flex-direction: column; align-items: center; gap: clamp(8px,1.8vw,12px); width: 100%; }
.g1-recipe { display: flex; gap: clamp(12px,3vw,22px); }
.g1-recipe-item { display: flex; align-items: center; gap: 6px; background: #FFFFFF; border-radius: 10px; padding: 5px 10px; box-shadow: 0 4px 12px -6px rgba(58,53,48,0.16); }
.g1-recipe-ic { width: clamp(22px,4.5vw,30px); height: clamp(22px,4.5vw,30px); display: inline-flex; }
.g1-recipe-ic svg { width: 100%; height: 100%; }
.g1-recipe-cnt { font-weight: 800; font-size: clamp(14px,2vw,17px); color: #1F7A4D; }
/* SVG savat (BasketArt) + ustidan olmalar (gardishdan ko'rinadi) */
.g1-realbasket { position: relative; width: clamp(230px,60vw,356px); aspect-ratio: 220 / 170; cursor: pointer; }
.g1-rb-svg { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 9px 18px rgba(58,53,48,0.34)); }
.g1-rb-bowl {
  position: absolute; left: 16%; right: 16%; top: 14%; bottom: 48%; z-index: 1;
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: center; gap: clamp(3px,1.2vw,7px);
}
.g1-rb-bowl .g1-token-obj { width: clamp(24px,5.5vw,36px); height: clamp(24px,5.5vw,36px); animation: g1drop 0.5s ease-out; }
/* yakuniy test: savat ko'tarilib, olmalar sekin tushadi */
.g1-celebrate { display: flex; justify-content: center; }
.g1-celebrate-basket { animation: g1rise 0.6s ease-out; }
.g1-celebrate-apple { animation: g1fallin 0.7s ease-in both; }
@keyframes g1rise { from { transform: translateY(70px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes g1fallin { 0% { transform: translateY(-80px); opacity: 0; } 70% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }

.g1-count-grid { display: flex; flex-wrap: wrap; gap: clamp(10px, 2.5vw, 18px); justify-content: center; }
.g1-item { position: relative; background: #FFFFFF; border: none; border-radius: 16px; cursor: pointer; padding: clamp(16px, 3.4vw, 24px); box-shadow: 0 6px 16px -6px rgba(58,53,48,0.16); transition: transform 0.18s, background 0.18s, box-shadow 0.18s; display: flex; align-items: center; justify-content: center; }
.g1-item:hover { transform: translateY(-2px); }
.g1-item-on { background: #E3F0E8; box-shadow: 0 8px 20px -6px rgba(31,122,77,0.3); }
.g1-item-num { position: absolute; top: 4px; right: 8px; font-weight: 800; font-size: clamp(14px, 2vw, 18px); color: #1F7A4D; }
.g1-item-icon { width: clamp(40px, 9vw, 60px); height: clamp(40px, 9vw, 60px); display: inline-flex; }
.g1-item-icon svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 7px rgba(58,53,48,0.18)); }
.g1-bigcount { text-align: center; margin-top: 14px; font-weight: 800; font-size: clamp(22px, 3.4vw, 28px); color: #0E0E10; }

.g1-numrow { display: flex; align-items: center; gap: clamp(12px, 3vw, 20px); padding: clamp(5px, 1.3vw, 9px) clamp(8px, 1.6vw, 12px); border-radius: 12px; transition: background 0.3s ease; }
.g1-numrow-on { background: #FFE8E1; }
.g1-digit { font-weight: 800; font-size: clamp(36px, 8vw, 58px); color: #FF4F28; min-width: 1.2em; text-align: center; transition: transform 0.3s cubic-bezier(0.34,1.4,0.64,1); }
.g1-numrow-on .g1-digit { transform: scale(1.18); }

/* tap-pair (s5) */
.g1-groups { display: flex; gap: clamp(8px, 2vw, 16px); justify-content: center; flex-wrap: wrap; }
.g1-group { flex: 1; min-width: clamp(88px, 26vw, 150px); background: #FFFFFF; border: 2px dashed #A7A6A2; border-radius: 16px; padding: clamp(10px, 2vw, 16px); display: flex; flex-direction: column; align-items: center; gap: 10px; transition: border-color 0.18s, background 0.18s; cursor: pointer; }
.g1-group-armed { border-color: #019ACB; background: #EAF6FB; }
.g1-group-ok { border-style: solid; border-color: #1F7A4D; background: #E3F0E8; cursor: default; }
.g1-group-wrong { border-color: #D8A93A; background: #FBF3D6; }
.g1-group-faded { opacity: 0.3; cursor: default; }
.g1-slot { min-height: clamp(38px, 7vw, 50px); display: flex; align-items: center; justify-content: center; }
.g1-slot-num { font-weight: 800; font-size: clamp(34px, 8vw, 52px); color: #1F7A4D; }
.g1-tiles { display: flex; gap: clamp(8px, 2vw, 14px); justify-content: center; flex-wrap: wrap; margin-top: 4px; }
.g1-tile { background: #FFFFFF; border: none; border-radius: 14px; cursor: pointer; padding: clamp(13px, 2.6vw, 21px) clamp(21px, 4vw, 31px); font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(32px, 7vw, 46px); color: #0E0E10; box-shadow: 0 6px 16px -6px rgba(58,53,48,0.18); transition: transform 0.18s, background 0.18s, box-shadow 0.18s, color 0.18s; }
.g1-tile:hover:not(:disabled) { transform: translateY(-2px); }
.g1-tile-sel { background: #FF4F28; color: #FFFFFF; box-shadow: 0 10px 24px -6px rgba(255,79,40,0.5); }
.g1-tile-ok { background: #E3F0E8; color: #1F7A4D; box-shadow: 0 10px 24px -6px rgba(31,122,77,0.4); }
.g1-tile-used { opacity: 0.3; cursor: default; }
.g1-tile:disabled { cursor: default; }

/* ===== Dars02 — RAQAMLI UYLAR (digit / house / street) ===== */
.g1-digit { font-family: 'Manrope', sans-serif; font-weight: 800; line-height: 1; color: #3A3530; display: inline-flex; align-items: center; justify-content: center; }
.g1-digit-ink { color: #3A3530; }
.g1-digit-accent { color: #FF4F28; }
.g1-digit-success { color: #1F7A4D; }
.g1-digit-sm { font-size: clamp(26px, 5.2vw, 38px); }
.g1-digit-mid { font-size: clamp(40px, 8vw, 60px); }
.g1-digit-big { font-size: clamp(60px, 13vw, 104px); }

/* hook — sochilgan uy raqamlari */
.g1-scatter { position: relative; width: 100%; max-width: 360px; height: clamp(150px, 26vw, 200px); }
.g1-scatter-d { position: absolute; animation: g1Float 3.4s ease-in-out infinite; filter: drop-shadow(0 4px 8px rgba(58,53,48,0.18)); }
@keyframes g1Float { 0%,100% { transform: translateY(0) rotate(var(--r,0deg)); } 50% { transform: translateY(-9px) rotate(var(--r,0deg)); } }

/* savol / izoh matni */
.g1-q { font-size: clamp(15px, 2vw, 18px); font-weight: 600; color: #3A3530; margin: 0; }
.g1-hint-txt { font-size: clamp(13px, 1.7vw, 15px); color: #8A8780; }
.g1-arrow { font-size: clamp(28px, 5vw, 44px); color: #8A8780; }
.g1-tip-txt { font-size: clamp(14px, 1.8vw, 16px); color: #3A3530; line-height: 1.45; }

/* qator konteyner + sanagich */
.g1-drow { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(8px, 1.8vw, 14px); }
.g1-dpips { min-height: clamp(92px, 18vw, 128px); display: flex; align-items: center; justify-content: center; }

/* TenFrame — "besh-besh ramka": pastki qator (besh) qizil, tepa qator (ortiqcha) ko'k */
.g1-tenframe { display: inline-flex; flex-direction: column; gap: clamp(5px, 1vw, 8px); padding: clamp(7px, 1.5vw, 11px); background: #FFFFFF; border-radius: 16px; box-shadow: 0 5px 16px -9px rgba(58, 53, 48, 0.4); }
.g1-tf-row { display: flex; gap: clamp(5px, 1vw, 8px); }
.g1-tf-cell { width: clamp(26px, 5.2vw, 38px); height: clamp(26px, 5.2vw, 38px); border-radius: 9px; border: 2px solid #E6E1D6; background: #F6F4EF; display: flex; align-items: center; justify-content: center; }
.g1-tf-base .g1-tf-cell { border-color: #FFD2C6; }
.g1-tf-dot { width: 56%; height: 56%; border-radius: 50%; background: transparent; }
.g1-tf-cell.on { background: #FFE8E1; border-color: #FF4F28; }
.g1-tf-cell.on .g1-tf-dot { background: #FF4F28; }
.g1-tf-row:not(.g1-tf-base) .g1-tf-cell.on { background: #E3F2FB; border-color: #019ACB; }
.g1-tf-row:not(.g1-tf-base) .g1-tf-cell.on .g1-tf-dot { background: #019ACB; }
/* to'lgan katak = meva tokeni (savatlardagi USTDAN ko'rinish meva bilan bir xil) */
.g1-tf-fruit { width: 76%; height: 76%; display: inline-flex; align-items: center; justify-content: center; }
.g1-tf-fruit svg { width: 100%; height: 100%; }
@keyframes g1tfPop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
.g1-tf-pop .g1-tf-dot, .g1-tf-pop .g1-tf-fruit { animation: g1tfPop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }
@media (prefers-reduced-motion: reduce) { .g1-tf-pop .g1-tf-dot, .g1-tf-pop .g1-tf-fruit { animation: none; } }
.g1-count-line { display: flex; align-items: center; justify-content: center; gap: 10px; }
.g1-count-label { font-size: clamp(13px, 1.7vw, 15px); color: #8A8780; }
.g1-count-val { font-size: clamp(16px, 2.2vw, 20px); font-weight: 800; color: #FF4F28; }

/* ESHIK (raqam plitasi bilan) */
.g1-door { position: relative; display: inline-flex; flex-direction: column; align-items: center; width: clamp(54px, 11.5vw, 76px); height: clamp(78px, 16.5vw, 106px); background: repeating-linear-gradient(90deg, rgba(122,78,34,0) 0, rgba(122,78,34,0.12) 5px, rgba(255,255,255,0.05) 9px, rgba(122,78,34,0) 13px), linear-gradient(180deg, #C2864F, #9A6738); border: 2px solid #7A4E22; border-radius: 11px 11px 4px 4px; box-shadow: inset 0 2px 0 rgba(255,255,255,0.18), 0 4px 10px -5px rgba(58,53,48,0.35); overflow: hidden; }
.g1-door-panel { position: absolute; left: 16%; right: 16%; top: 34%; bottom: 9%; border: 2px solid rgba(0,0,0,0.16); border-radius: 4px; background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.07)); }
.g1-door-plate { position: relative; z-index: 2; margin-top: clamp(5px, 1.4vw, 9px); background: #FCFAF5; border: 1.5px solid #C9A877; border-radius: 6px; padding: 0 clamp(6px, 1.4vw, 10px); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.g1-door-knob { position: absolute; right: clamp(7px, 1.6vw, 10px); top: 56%; width: 7px; height: 7px; border-radius: 50%; background: #FFD86B; box-shadow: 0 0 0 1px #B8862E; z-index: 2; }
.g1-doorbtn { background: transparent; border: none; padding: 5px; cursor: pointer; border-radius: 12px; transition: transform 0.15s ease; }
.g1-doorbtn:hover:not(:disabled) { transform: translateY(-3px); }
.g1-doorbtn.active .g1-door { border-color: #FF4F28; box-shadow: 0 0 0 3px #FFD3C7, inset 0 2px 0 rgba(255,255,255,0.18); }
.g1-doorbtn.seen .g1-door { border-color: #1F7A4D; }
.g1-doorbtn.used { opacity: 0.4; }
.g1-doorbtn.placed { opacity: 0.45; }
.g1-doorbtn:disabled { cursor: default; }

/* UY (svg) + hovli */
.g1-house-svg { width: clamp(92px, 19vw, 126px); height: auto; display: block; }
.g1-housefig { display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1.4vw, 10px); }
.g1-yard { display: flex; justify-content: center; }
.g1-s2house .g1-house-svg { width: clamp(92px, 19vw, 122px); }
.g1-opt-house { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.g1-opt-house .g1-house-svg { width: clamp(62px, 13vw, 86px); }

/* s8 / s9 — uy tugmalari */
.g1-houses { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(10px, 2.2vw, 18px); }
.g1-housebtn { background: #FFFFFF; border: 2px solid #E7E1D6; border-radius: 18px; padding: clamp(8px, 1.8vw, 13px); display: flex; flex-direction: column; align-items: center; gap: clamp(4px, 1vw, 8px); cursor: pointer; transition: transform 0.15s ease, border-color 0.2s ease, opacity 0.2s ease; }
.g1-housebtn:hover:not(:disabled) { transform: translateY(-2px); }
.g1-housebtn-ok { border-color: #1F7A4D; background: #EFF7F1; }
.g1-housebtn-faded { opacity: 0.4; }
.g1-housebtn:disabled { cursor: default; }
.g1-housebtn .g1-house-svg { width: clamp(64px, 13.5vw, 92px); }

/* s9 — juftlash tartibi */
.g1-match { display: flex; flex-direction: column; gap: clamp(12px, 2.4vw, 18px); }
.g1-match-digits { display: flex; justify-content: center; flex-wrap: wrap; gap: clamp(8px, 2vw, 14px); }
.g1-match-houses { display: flex; justify-content: center; flex-wrap: wrap; gap: clamp(10px, 2.2vw, 16px); }

/* s5 — shakl belgisi */
.g1-feature { display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: clamp(90px, 18vw, 130px); justify-content: center; }
.g1-feature-txt { font-size: clamp(14px, 1.9vw, 17px); font-weight: 600; color: #FF4F28; }

/* s2 — joylash katakchalari */
.g1-tapgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: clamp(8px, 1.6vw, 12px); }
.g1-tapcell { position: relative; background: #FFFFFF; border: 2px solid #E7E1D6; border-radius: 14px; width: clamp(50px, 10vw, 64px); height: clamp(50px, 10vw, 64px); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.15s ease, border-color 0.2s ease; }
.g1-tapcell svg { width: 64%; height: 64%; opacity: 0.5; transition: opacity 0.2s ease; }
.g1-tapcell.on { border-color: #1F7A4D; background: #EFF7F1; }
.g1-tapcell.on svg { opacity: 1; }
.g1-tapcell-tag { position: absolute; top: 2px; right: 5px; font-size: 12px; color: #1F7A4D; font-weight: 700; }
.g1-tapcell:disabled { cursor: default; }

/* sd — o'yin: uy oldiga buyum torting */
.g1-collecthouse { position: relative; display: flex; flex-direction: column; align-items: center; gap: clamp(4px, 1vw, 8px); padding: clamp(8px, 1.8vw, 14px); border-radius: 18px; border: 2px dashed #D8CFBF; transition: border-color 0.2s ease, background 0.2s ease; }
.g1-collecthouse.g1-dropzone { background: #FCF7EE; }
.g1-yard-drop { min-height: clamp(40px, 8vw, 54px); align-items: center; }

/* KO'CHA sahnasi — fon + ustiga uylar/personajlar (proporsiya qulflangan) */
.g1-street { position: relative; width: 100%; max-width: 560px; margin: 0 auto; aspect-ratio: 400 / 218; container-type: size; border-radius: 14px; overflow: hidden; }
.g1-street-bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.g1-street-houses { position: absolute; left: 2%; right: 2%; bottom: 13%; display: flex; justify-content: center; align-items: flex-end; gap: 1cqw; }
.g1-street-house { opacity: 0; transform: translateY(8%); transition: opacity 0.5s ease, transform 0.5s ease; }
.g1-street-house.in { opacity: 1; transform: none; }
.g1-street-house .g1-house-svg { width: 15cqw; }   /* 6 uy (5 raqamli + 1 bo'sh) sig'ishi uchun ozroq tor */
.g1-street-new { margin-left: 2.5cqw; }            /* yangi bo'sh uy — ko'cha oxirida ajralib turadi */
.g1-street-target .g1-house-svg { filter: drop-shadow(0 0 7px rgba(255,79,40,0.8)); }
.g1-street-anvar, .g1-street-rano, .g1-street-zuhra { position: absolute; display: flex; flex-direction: column; align-items: center; opacity: 0; transition: opacity 0.5s ease; z-index: 3; }
.g1-street-anvar.in, .g1-street-rano.in, .g1-street-zuhra.in { opacity: 1; }
/* personajlar OLD PLANDA, kichik (eshik bo'yida) — real proporsiya + chuqurlik */
.g1-street-anvar { left: 6%; bottom: 0; }
.g1-street-rano { right: 11%; bottom: 6%; }
.g1-street-zuhra { right: 4%; bottom: 0; }
.g1-street-anvar .g1-char, .g1-street-rano .g1-char, .g1-street-zuhra .g1-char { width: 6cqw; height: auto; }
.g1-street .g1-cast-name { display: none; }
.g1-street-final .g1-street-anvar { left: auto; right: 27%; bottom: 0; }
.g1-street-final .g1-street-rano { right: 15%; bottom: 4%; }
.g1-street-final .g1-street-zuhra { right: 3%; bottom: 6%; }
/* Anvar YURIB keladi (chapdan o'z joyiga) */
@keyframes g1WalkIn {
  0%   { transform: translateX(-260%) translateY(0)    rotate(0deg); }
  18%  { transform: translateX(-205%) translateY(-5%)  rotate(2.5deg); }
  36%  { transform: translateX(-150%) translateY(0)    rotate(-2.5deg); }
  54%  { transform: translateX(-100%) translateY(-5%)  rotate(2.5deg); }
  72%  { transform: translateX(-55%)  translateY(0)    rotate(-2.5deg); }
  88%  { transform: translateX(-16%)  translateY(-3%)  rotate(1.5deg); }
  100% { transform: translateX(0)     translateY(0)    rotate(0deg); }
}
.g1-street-anvar.in { animation: g1WalkIn 2.6s ease-out both; }

/* "5 va yana" — 5 talik guruh + qolgani orasida bo'shliq (6-10 ni o'qish uchun) */
.g1-pips-five { gap: 0; }
.g1-five-grp, .g1-more-grp { display: inline-flex; flex-wrap: nowrap; gap: clamp(4px, 1.2vw, 9px); align-items: center; }
.g1-five-grp { padding-right: clamp(8px, 2.4vw, 18px); border-right: 2px dashed rgba(58,53,48,0.16); margin-right: clamp(8px, 2.4vw, 18px); }
.g1-pips-wrap.g1-pips-five { flex-wrap: wrap; row-gap: clamp(4px, 1.2vw, 9px); }

/* s2 — "5 ta tayyor" kataklari (bosib bo'lmaydi, yengil ko'rsatilgan) */
.g1-tapcell-base { border-color: #D8D0C2; background: #F4F1EA; cursor: default; }
.g1-tapcell-base svg { opacity: 0.78; }

/* final / summary — rasm + matn YONMA-YON (skrolsiz) */
.g1-final-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: clamp(12px, 2.6vw, 22px); width: 100%; }
.g1-final-row .g1-final-street { flex: 1 1 280px; max-width: 420px; }
.g1-final-row .g1-handfact { flex: 1 1 200px; max-width: 320px; display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.8vw, 12px); }
.g1-sum-row { display: flex; flex-wrap: wrap; align-items: center; gap: clamp(12px, 2.6vw, 22px); }
.g1-sum-row .g1-final-street { flex: 1 1 300px; max-width: 440px; }
.g1-sum-col { flex: 1 1 240px; min-width: 230px; display: flex; flex-direction: column; gap: clamp(10px, 2vw, 14px); }
.g1-final-street { width: 100%; }

/* s11 — final fakt: 1-5 raqamlari qatori */
.g1-factdigits { display: flex; justify-content: center; gap: clamp(6px, 1.6vw, 12px); }
.g1-handfact-txt { font-size: clamp(13px, 1.7vw, 15px); color: #3A3530; line-height: 1.4; text-align: center; margin: 0; }

/* summary — ball + bog'lanishlar */
.g1-score { font-size: clamp(18px, 2.6vw, 24px); font-weight: 800; color: #1F7A4D; margin: 6px 0 0; }
.g1-conn { display: flex; flex-direction: column; gap: 8px; }
.g1-conn-title { font-size: clamp(14px, 1.8vw, 16px); font-weight: 800; color: #3A3530; margin: 0 0 2px; }
.g1-conn-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.g1-conn-tag { font-size: clamp(11px, 1.4vw, 13px); font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
.g1-conn-ref { background: #EAF6FB; color: #017CA3; }
.g1-conn-next { background: #FFF1EC; color: #D63E18; }
.g1-conn-txt { font-size: clamp(13px, 1.7vw, 15px); color: #5A5A60; }

@media (prefers-reduced-motion: reduce) {
  .g1-scatter-d { animation: none; }
  .g1-street-house, .g1-street-anvar, .g1-street-rano, .g1-street-zuhra { transition: none; }
  .g1-street-anvar.in { animation: none; }
}


/* === Dars04 — taqqoslash vizuallari (TwoBaskets / CompareFrames / CompareSign) === */
.d4-baskets { display: flex; align-items: flex-end; justify-content: center; gap: clamp(20px, 7vw, 64px); flex-wrap: wrap; }
/* s0 (slayd 2): personaj boshi savatning yon tomonida, STATIK, BITTA qatorda */
.d4-s0row { display: flex; align-items: center; justify-content: center; gap: clamp(6px, 2.6vw, 32px); flex-wrap: nowrap; }
.d4-s0pair { display: flex; align-items: center; gap: clamp(4px, 1.6vw, 14px); flex: 0 1 auto; min-width: 0; }
.d4-s0char { display: flex; flex-direction: column; align-items: center; gap: clamp(3px, 1vw, 7px); }
.d4-s0head { height: clamp(58px, 13vw, 104px); display: flex; align-items: flex-end; justify-content: center; }
.d4-s0pair .d4-topbasket { width: clamp(84px, 22vw, 150px); }   /* bitta qatorga sig'sin */
.d4-s0head .g1-char { animation: none; }        /* idle tebranish yo'q */
.d4-s0head .g1-eyes { animation: none; }         /* ko'z pirpirashi yo'q */
.d4-basket { position: relative; width: clamp(140px, 32vw, 200px); aspect-ratio: 220 / 170; }
.d4-basket .g1-rb-svg { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 8px 16px rgba(58,53,48,0.3)); }
/* old lab (gardish) mevalar USTIda -> mevalar savat ichida tiqilgan ko'rinadi (yon ko'rinish) */
.d4-rimfront { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
/* bowl = container; mevalar savat OG'ZI ichida heap bo'lib turadi, gap YO'Q, soniga qarab avto-kichrayadi */
.d4-bowl { position: absolute; left: 14%; right: 14%; top: 24%; bottom: 42%; container-type: size; display: flex; flex-wrap: wrap; align-items: center; align-content: flex-end; justify-content: center; gap: 0; }
.d4-fruit { flex: 0 0 auto; width: min(calc(100cqw / var(--cols, 3)), calc(100cqh / var(--rows, 2))); height: min(calc(100cqw / var(--cols, 3)), calc(100cqh / var(--rows, 2))); display: inline-flex; align-items: center; justify-content: center; position: relative; }
.d4-fruit-bob { width: 100%; height: 100%; display: inline-flex; animation: d4bob 2.8s ease-in-out infinite; }
.d4-fruit svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 7px rgba(58,53,48,0.18)); }
@keyframes d4bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.d4-mount { animation: d4slidein 0.6s cubic-bezier(0.34,1.2,0.64,1) both; }
.d4-mount-r { animation: d4slideinr 0.6s cubic-bezier(0.34,1.2,0.64,1) both; }
@keyframes d4slidein { from { opacity: 0; transform: translateX(-30px) scale(0.94); } to { opacity: 1; transform: translateX(0) scale(1); } }
@keyframes d4slideinr { from { opacity: 0; transform: translateX(30px) scale(0.94); } to { opacity: 1; transform: translateX(0) scale(1); } }

/* kichik savatlar (sahna / sanash / tartiblash) — d4-basket o'lchamini parent boshqaradi */
.d4-scenebasket .d4-basket, .d4-countbasket .d4-basket, .d4-orderbasket .d4-basket { width: 100%; }
.d4-scenebasket { width: clamp(50px, 13vw, 78px); }
/* hikoya sahnasida (sIntro/sGuest) personajni kichraytirish — bulutcha qo'shilgani uchun scrollni oldini olish; summary o'z rulei (d4-scene-sum) bilan baribir kichikroq */
.d4-scene .g1-cast-fig { height: clamp(100px, 22vw, 166px); }
.d4-countbasket { width: clamp(84px, 20vw, 120px); }
.d4-orderbasket { width: clamp(92px, 22vw, 132px); }
/* meva o'lchami endi bowl container'idan (cqw/cqh + --cols/--rows) avtomatik — qat'iy override YO'Q */

/* ikki "besh-besh ramka" */
.d4-frames { display: flex; align-items: flex-end; justify-content: center; gap: clamp(16px, 5vw, 44px); flex-wrap: wrap; }
.d4-frame-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }

/* belgi-timsoh > < = (och timsoh og'zini katta songa ochadi; teng -> og'iz yopiq, ikkita teng chiziq) */
.d4-sign { font-family: 'Manrope', sans-serif; font-weight: 800; line-height: 1; color: #FF4F28; font-size: clamp(38px, 8vw, 58px); display: inline-flex; align-items: center; justify-content: center; }
.d4-sign-big { font-size: clamp(52px, 12vw, 86px); }
/* timsoh SVG o'lchami font-size (em) ga bog'liq -> mavjud joylarga (slot/chip/variant/misol) mos keladi */
.d4-croc svg { width: 1.55em; height: 1.18em; overflow: visible; filter: drop-shadow(0 3px 6px rgba(58,53,48,0.22)); }
/* ochilish: jag'lar mount'da ochiladi (scaleX) + yengil joyida nafas. KO'CHMAYDI. */
.d4-croc-anim { animation: d4crocopen 0.5s cubic-bezier(0.34,1.5,0.64,1) both, d4crocbreathe 2.8s ease-in-out 0.55s infinite; transform-origin: center; }
@keyframes d4crocopen { 0% { opacity: 0; transform: scaleX(0.5); } 100% { opacity: 1; transform: scaleX(1); } }
@keyframes d4crocbreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }

/* Syujet timsohi — ko'l SUVIDA suzadi (personajlar ortida, suv bandida). z-index:0 -> bolalar oldinda. */
.d4-crocscene { position: absolute; left: 50%; bottom: clamp(58px, 26%, 132px); transform: translateX(-50%) translateY(8px); width: clamp(148px, 40vw, 274px); opacity: 0; transition: opacity 0.6s ease, transform 0.6s ease; z-index: 0; pointer-events: none; }
.d4-crocscene.in { opacity: 1; transform: translateX(-50%) translateY(0); }
.d4-crocscene svg { width: 100%; height: auto; overflow: visible; filter: drop-shadow(0 4px 7px rgba(46,134,168,0.22)); animation: d4crocfloat 4.2s ease-in-out infinite; transform-origin: center; }
@keyframes d4crocfloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .d4-crocscene svg { animation: none; } }

/* Ko'l bo'yi sahnasi — jonli elementlar (bulut, qush, qamish, ninachi, nilufar, porlash) */
@keyframes d4cloudDrift { 0% { transform: translateX(0); } 100% { transform: translateX(26px); } }
@keyframes d4birdFly { 0% { transform: translate(0,0); } 100% { transform: translate(-44px,-7px); } }
@keyframes d4reedSway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes d4dragon { 0%, 100% { transform: translate(0,0); } 25% { transform: translate(7px,-5px); } 50% { transform: translate(12px,2px); } 75% { transform: translate(4px,6px); } }
@keyframes d4lilyBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes d4shimmer { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
.d4-cloud { animation: d4cloudDrift 9s ease-in-out infinite alternate; }
.d4-cloud2 { animation: d4cloudDrift 13s ease-in-out infinite alternate; }
.d4-bird { animation: d4birdFly 15s linear infinite alternate; }
.d4-reed { transform-box: fill-box; transform-origin: bottom center; animation: d4reedSway 4s ease-in-out infinite; }
.d4-reed2 { transform-box: fill-box; transform-origin: bottom center; animation: d4reedSway 5.2s ease-in-out infinite; }
.d4-dragon { animation: d4dragon 6s ease-in-out infinite; }
.d4-lily { transform-box: fill-box; transform-origin: center; animation: d4lilyBob 5s ease-in-out infinite; }
.d4-shimmer { animation: d4shimmer 4.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .d4-cloud, .d4-cloud2, .d4-bird, .d4-reed, .d4-reed2, .d4-dragon, .d4-lily, .d4-shimmer { animation: none; } }

/* CHASE & EAT mukofoti (s4/s9): timsoh kattaroq songa yuguradi va "yeydi"; son xursand chayqaladi */
.d4-chase { display: inline-flex; align-items: center; gap: clamp(2px, 1.2vw, 10px); padding: clamp(4px, 1vw, 8px); }
.d4-chase-croc { display: inline-flex; width: clamp(58px, 16vw, 96px); animation: d4chaserun 1.45s cubic-bezier(0.4, 0.9, 0.4, 1) both; transform-origin: center; }
.d4-chase-croc svg { width: 100%; height: auto; overflow: visible; filter: drop-shadow(0 3px 6px rgba(58,53,48,0.22)); }
.d4-chase-num { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(42px, 11vw, 66px); line-height: 1; color: #1F7A4D; display: inline-flex; }
.d4-numwiggle { animation: d4numwiggle 0.7s ease-in-out 0.6s both; transform-origin: center; }
/* s7: slotdagi timsoh kattaroq son (8, chapda) tomon hujum qiladi */
.d4-slotchase { animation: d4slotchase 1.3s ease-in-out both; transform-origin: center; }
@keyframes d4chaserun {
  0% { transform: translateX(-46px) scaleX(0.9); opacity: 0.25; }
  46% { transform: translateX(0) scaleX(1); opacity: 1; }
  60% { transform: translateX(3px) scale(1.1); }
  73% { transform: translateX(0) scale(0.94); }
  100% { transform: translateX(0) scale(1); }
}
@keyframes d4numwiggle {
  0%, 100% { transform: scale(1) rotate(0deg); }
  28% { transform: scale(1.28) rotate(-7deg); }
  52% { transform: scale(0.9) rotate(6deg); }
  76% { transform: scale(1.1) rotate(-3deg); }
}
@keyframes d4slotchase {
  0% { transform: translateX(0) scaleX(1); }
  45% { transform: translateX(-9px) scaleX(1.06); }
  60% { transform: translateX(-7px) scaleX(0.9); }
  100% { transform: translateX(-5px) scaleX(1); }
}

/* son tokeni */
.d4-numtile { font-family: 'Manrope', sans-serif; font-weight: 800; color: #0E0E10; font-size: clamp(40px, 9vw, 64px); line-height: 1; display: inline-flex; align-items: center; justify-content: center; min-width: 1.1em; }
.d4-opt-txt { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(14px, 1.9vw, 17px); }

/* s6 — uchta belgi misollari */
.d4-signrow { display: flex; align-items: center; justify-content: center; gap: clamp(16px, 6vw, 56px); flex-wrap: wrap; }
.d4-signex { display: flex; align-items: center; gap: clamp(6px, 1.6vw, 12px); }
.d4-signex .d4-numtile { font-size: clamp(28px, 6vw, 42px); }

/* s7 — slot + belgi chiplari */
.d4-slot { min-width: clamp(56px, 14vw, 86px); min-height: clamp(56px, 14vw, 86px); display: inline-flex; align-items: center; justify-content: center; background: #FFFFFF; border-radius: 16px; box-shadow: inset 0 0 0 2px #E4DED4; }
.d4-slot-ok { box-shadow: inset 0 0 0 2px #1F7A4D; background: #E3F0E8; }
.d4-slot-empty { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(34px, 8vw, 52px); color: #C7C0B4; }
.d4-tray { display: flex; gap: clamp(10px, 2.6vw, 18px); justify-content: center; flex-wrap: wrap; }
.d4-chip { background: #FFFFFF; border: none; border-radius: 16px; cursor: pointer; padding: clamp(8px, 1.8vw, 14px) clamp(16px, 3vw, 24px); box-shadow: 0 6px 16px -6px rgba(58,53,48,0.2); transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s; }
.d4-chip:hover:not(:disabled) { transform: translateY(-2px); }
.d4-chip:disabled { cursor: default; }
.d4-chip-wrong { opacity: 0.32; }

/* s10 — tartiblash rozetkasi */
.d4-orderrow { display: flex; align-items: flex-end; justify-content: center; gap: clamp(12px, 4vw, 36px); flex-wrap: wrap; }
.d4-orderrow .g1-housebtn { position: relative; }
.d4-rank { position: absolute; top: 6px; right: 8px; background: #1F7A4D; color: #FFFFFF; font-weight: 800; font-size: clamp(13px, 1.8vw, 16px); width: 1.7em; height: 1.7em; border-radius: 99px; display: flex; align-items: center; justify-content: center; }

/* kichik savat varianti (MC test ekranlarida balandlikni kamaytirish: s4 / s8 / s11) */
.d4-baskets-sm .d4-basket { width: clamp(92px, 22vw, 132px); }

/* s1 — har bir meva alohida bosiladi (sanash) */
.d4-tapcol { display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1.4vw, 10px); }
.d4-tapbasket { transition: filter 0.2s, transform 0.2s; }
.d4-tapbasket-on { filter: drop-shadow(0 0 0 rgba(31,122,77,0)); }
.d4-tapbasket-on .d4-basket .g1-rb-svg { filter: drop-shadow(0 8px 16px rgba(31,122,77,0.35)); }
.d4-tapbasket-done .d4-basket .g1-rb-svg { filter: drop-shadow(0 6px 12px rgba(31,122,77,0.45)); }
/* tugma-meva: scatter tashqi tugmada (static), pulse/bob ichki .d4-fruit-bob da */
.d4-tapfruit { background: none; border: none; padding: 0; position: relative; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.d4-tapfruit:not(:disabled) .d4-fruit-bob { animation: d4tappulse 1.8s ease-in-out infinite; }
.d4-tapfruit-done { opacity: 0.34; cursor: default; }
.d4-tapfruit-done .d4-fruit-bob { animation: none; }
.d4-tapcheck { position: absolute; right: -2px; bottom: -2px; font-size: 0.7em; font-weight: 800; color: #1F7A4D; line-height: 1; }
@keyframes d4tappulse { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }

/* hovli sahnasi (sIntro/sGuest/s12): personaj + savat YONMA-YON, yerda; markaz bo'sh emas */
.d4-scene .g1-cast-row { gap: clamp(20px, 7vw, 80px); }
.d4-castpair { display: flex; align-items: flex-end; gap: clamp(2px, 1.4vw, 10px); }

/* === USTDAN ko'rinish savat (s0/s1/s4/s8/s10/s11/sd) — mevalar aniq rim ichida, zich, sanaladigan === */
.d4-topbasket { position: relative; width: clamp(128px, 30vw, 188px); aspect-ratio: 1 / 0.9; }
.d4-baskets-sm .d4-topbasket { width: clamp(96px, 23vw, 134px); }
.d4-toprim { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 8px 16px rgba(58,53,48,0.28)); }
.d4-topbowl { position: absolute; left: 18%; right: 18%; top: 19%; bottom: 23%; container-type: size; display: flex; flex-wrap: wrap; align-items: center; align-content: center; justify-content: center; gap: 0; }
.d4-tfruit { flex: 0 0 auto; width: min(calc(100cqw / var(--cols, 3)), calc(100cqh / var(--rows, 2))); height: min(calc(100cqw / var(--cols, 3)), calc(100cqh / var(--rows, 2))); display: inline-flex; align-items: center; justify-content: center; position: relative; }
.d4-tfruit-bob { width: 100%; height: 100%; display: inline-flex; animation: d4bob 2.8s ease-in-out infinite; }
.d4-tfruit svg { width: 100%; height: 100%; filter: drop-shadow(0 3px 6px rgba(58,53,48,0.18)); }
.d4-tapfruit:not(:disabled) .d4-tfruit-bob { animation: d4tappulse 1.8s ease-in-out infinite; }
.d4-tapfruit-done .d4-tfruit-bob { animation: none; }
.d4-counttop { width: clamp(96px, 24vw, 140px); }
.d4-ordertop { width: clamp(100px, 24vw, 142px); }
.d4-sdtop { width: clamp(112px, 27vw, 162px); }
.d4-counttop .d4-topbasket, .d4-ordertop .d4-topbasket, .d4-sdtop .d4-topbasket { width: 100%; }
.d4-topbasket-on .d4-toprim { filter: drop-shadow(0 8px 16px rgba(31,122,77,0.40)); }
.d4-topbasket-done .d4-toprim { filter: drop-shadow(0 6px 12px rgba(31,122,77,0.50)); }

/* pufakcha TO'G'RIDAN-TO'G'RI bo'sh savat ustida turadi; personaj yonida */
.d4-basketstack { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: clamp(2px, 1vw, 6px); }

/* o'ylov pufakchasi (sIntro/sGuest/s12): savat ustida, ichida USTDAN ko'rinish */
.d4-bubble { position: relative; display: flex; flex-direction: column; align-items: center; }
.d4-bubble-body { background: #FFFFFF; border-radius: 50% / 44%; box-shadow: 0 6px 18px -6px rgba(58,53,48,0.28); padding: clamp(6px,1.6vw,12px); display: flex; align-items: center; justify-content: center; }
.d4-bubble-body .d4-topbasket { width: clamp(46px, 12vw, 74px); }
.d4-bubble-tail { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 2px; }
.d4-bubble-dot { background: #FFFFFF; border-radius: 50%; box-shadow: 0 2px 5px -1px rgba(58,53,48,0.25); }
.d4-bubble-dot1 { width: 10px; height: 10px; }
.d4-bubble-dot2 { width: 6px; height: 6px; }
/* yig'ish sahnasida pufakcha savatining ichki to'lishi (s12 ham) */
.d4-scene-sum .g1-cast-fig { height: clamp(96px, 22vw, 168px); }

/* s1 — qisqa izoh chizig'i (BitSays karta o'rniga) */
.d4-framenote { margin: 0; font-family: 'Manrope', sans-serif; font-weight: 600; font-size: clamp(13px, 1.8vw, 15px); color: #8A8780; }

/* s1 — "shu yerga bos" qo'l ko'rsatkichi (faol savat ustida, 0 sanalganda) */
.d4-tapwrap { position: relative; }
.d4-taphand { position: absolute; right: 6%; bottom: 8%; width: clamp(30px, 7vw, 46px); pointer-events: none; z-index: 3; animation: d4taphand 1.3s ease-in-out infinite; filter: drop-shadow(0 3px 6px rgba(58,53,48,0.3)); }
.d4-taphand svg { width: 100%; height: auto; display: block; }
@keyframes d4taphand { 0%, 100% { transform: translate(0, 0) rotate(-6deg); } 50% { transform: translate(-3px, -6px) rotate(-6deg); } }

@media (prefers-reduced-motion: reduce) {
  .d4-mount, .d4-mount-r, .d4-croc-anim, .d4-fruit-bob, .d4-tapfruit, .d4-fruit, .d4-tfruit-bob, .d4-tfruit, .d4-taphand, .d4-chase-croc, .d4-numwiggle, .d4-slotchase { animation: none; }
}
`;
