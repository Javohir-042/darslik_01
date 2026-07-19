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
    u.onerror = (e) => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentSegment: null });
      const err = e && e.error;
      // Avtoplay bloklangan (jestgacha speak taqiqlangan) — navbatni KUYDIRMAYMIZ,
      // birinchi pointerdown/keydown'da resumeIfBlocked shu segmentdan davom etadi.
      if (err === 'not-allowed') { this.autoplayBlocked = true; return; }
      // O'zimiz cancel qilganmiz (stop yoki yangi ekran) — oldinga surish shart emas.
      if (err === 'canceled' || err === 'interrupted') return;
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

const TOTAL_SCREENS = 15;
const LESSON_META = {
  lessonId: 'ai-1-01-v1',
  lessonTitle: { ru: 'Как учится искусственный интеллект', uz: "Sun'iy intellekt qanday o'rganadi" }
};
const SCREEN_META = [
  { id: 'sIntro', type: 'hook',        template: 'custom',   scored: false, scope: null },            // syujet: Bit yangi robot, hech narsa bilmaydi; Ra'no/Anvar uni o'rgatmoqchi
  { id: 's0',     type: 'hook',        template: 'custom',   scored: false, scope: 'hook' },          // jumboq: "Muzqaymoq" buyrug'iga AI nima qiladi? (to'g'ri: raqamli tasvir yaratadi)
  { id: 'sAis',   type: 'exploration', template: 'custom',   scored: false, scope: null },            // TANISHUV: eng mashhur 3 matnli AI — ChatGPT/Gemini/Claude kartochkalari ochiladi
  { id: 's1',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // PROMPT yig'ish: [Menga]+[yashil]+[fon o'rnat] -> terminal -> #00FF00 kod
  { id: 'sDes',   type: 'exploration', template: 'custom',   scored: false, scope: null },            // DIZAYN-AI: Gamma (prezentatsiya) va Canva (rasm/dizayn) kartochkalari
  { id: 's2',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // DIZAYN-BUYRUQLAR: [Okean foni]/[Kosmos foni] -> AI sahna dizaynini almashtiradi
  { id: 'sQg',    type: 'test',        template: 'custom',   scored: true,  scope: 'module-mikro' },  // test (kartochkali): tezkor prezentatsiya uchun qaysi AI? (Canva emas, Gamma)
  { id: 's3',     type: 'rule',        template: 'custom',   scored: false, scope: null },            // QOIDA: PROMPT — AI uchun matnli buyruq (Bit panelda ko'rsatadi)
  { id: 's4',     type: 'test',        template: 'custom',   scored: true,  scope: 'module-mikro' },  // aniq prompt tanlash: qizil olma uchun to'g'ri buyruq = B (tafsilotli)
  { id: 's5',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // OB'EKT TAHRIRI: oq mushuk + 2 prompt -> AI rang/aksessuarni almashtiradi
  { id: 's6',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // PROMPT YIG' (tartib): 3 chipni to'g'ri ketma-ketlikda uyaga joylash (Kosmos->Rasm->Yarat)
  { id: 's7',     type: 'exploration', template: 'custom',   scored: false, scope: null },            // AMALIY (drill): xona maketi + tokchadan 4 prompt: devor yashil -> chiroq -> kitob -> gilam
  { id: 'sQm',    type: 'test',        template: 'custom',   scored: true,  scope: 'module-mikro' },  // test (kartochkali): promptdan musiqa bastalaydigan AI? (Gamma emas, Suno)
  { id: 'sMus',   type: 'exploration', template: 'custom',   scored: false, scope: null },            // AI MUSIQASI: Suno pleyeri — [Rep 🎤]/[Kosmik 🪐] prompti WebAudio ohang chaladi
  { id: 'sFin',   type: 'summary',     template: 'custom',   scored: false, scope: null }             // YAKUN: 3 oltin yulduz + loyiha statistikasi (to'g'ri/xato/vaqt) + Yakunlash
];

// Fisher-Yates (brauzerda Math.random — faqat hodisalarda/effektda, render'da emas).
const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; };

const CONTENT = {
  sIntro: {
    eyebrow: { ru: 'История', uz: 'Hikoya' },
    title: { ru: 'Как работает AI?', uz: 'AI qanday ishlaydi?' },
    bit_label: { ru: 'Бит', uz: 'Bit' },
    rano_label: { ru: 'Рано', uz: "Ra'no" },
    anvar_label: { ru: 'Анвар', uz: 'Anvar' },
    audio: {
      ru: [
        'Привет! Сегодня мы с тобой узнаем, как работает AI — искусственный интеллект.',
        'AI — это очень умная система внутри компьютера: она знает миллиарды книг, языков и данных из интернета.',
        'О чём ни попросишь — она выполнит это в один миг.',
        'Сейчас она готова начать с тобой один проект. Нажми кнопку «Дальше»!'
      ],
      uz: [
        "Salom! Bugun biz sen bilan AI, ya'ni Sun'iy Intellekt dasturi qanday ishlashini o'rganamiz.",
        "AI — bu kompyuter ichidagi juda aqlli tizim bo'lib, u internetdagi milliardlab kitoblar, tillar va ma'lumotlarni biladi.",
        "Undan nimani so'rasang, o'shani bir zumda bajaradi.",
        "Hozir u sen bilan bitta loyihani boshlashga tayyor. Davom etish tugmasini bos!"
      ]
    }
  },
  sAis: {
    eyebrow: { ru: 'Знакомство', uz: 'Tanishuv' },
    instruction: { ru: 'Нажимай на карточки и знакомься с самыми известными AI.', uz: 'Kartochkalarni bosib, eng mashhur AI tizimlari bilan tanish.' },
    tap_hint: { ru: 'Нажми', uz: 'Bos' },
    gpt_by: { ru: 'Компания: OpenAI', uz: 'Kompaniya: OpenAI' },
    gpt_desc: { ru: 'Мастер любых творческих текстов и общения.', uz: 'Har qanday ijodiy matn yozish va suhbatlashish ustasi.' },
    gem_by: { ru: 'Компания: Google', uz: 'Kompaniya: Google' },
    gem_desc: { ru: 'Очень быстро находит новейшую информацию и картинки в интернете.', uz: "Internetdagi eng yangi ma'lumotlar va rasmlarni juda tez topadi." },
    cla_by: { ru: 'Компания: Anthropic', uz: 'Kompaniya: Anthropic' },
    cla_desc: { ru: 'Самый умный в чтении книг, анализе длинных текстов и подготовке уроков.', uz: "Kitob o'qish, uzun matn tahlili va dars tayyorlashda eng aqllisi." },
    done_text: { ru: 'Отлично! Теперь ты знаешь три самых известных AI.', uz: "Zo'r! Endi eng mashhur uchta AI tizimini bilasan." },
    audio: {
      intro: {
        ru: 'Самые известные в мире AI-системы, работающие с текстовыми промптами, — это ChatGPT, Google Gemini и Claude AI. У каждой из них свои сильные стороны. Нажимай на карточки и познакомься с ними.',
        uz: "Dunyoda matnli promptlar bilan ishlaydigan eng mashhur AI tizimlari — bu ChatGPT, Google Gemini va Claude AI hisoblanadi. Ularning har biri o'zining kuchli yo'nalishlariga ega. Kartochkalarni bosib, ular bilan tanishib chiq."
      }
    }
  },
  sDes: {
    eyebrow: { ru: 'Дизайн-AI', uz: 'Dizayn-AI' },
    instruction: { ru: 'Нажимай на карточки — самые сильные AI для дизайна.', uz: "Kartochkalarni bos — dizayn bo'yicha eng kuchli AI'lar." },
    tap_hint: { ru: 'Нажми', uz: 'Bos' },
    gam_role: { ru: 'Мастер презентаций', uz: 'Prezentatsiya ustasi' },
    gam_desc: { ru: 'Напиши один промпт — и он в тот же миг соберёт готовую презентацию из красивых слайдов.', uz: "Bitta prompt yozsang — o'sha soniyada chiroyli slaydlardan iborat tayyor prezentatsiya tuzib beradi." },
    can_role: { ru: 'Мастер дизайна', uz: 'Dizayn ustasi' },
    can_desc: { ru: 'Мастер редактирования картинок, рисования логотипов и изменения готовых дизайн-элементов с помощью промпта.', uz: "Rasmlarni tahrirlash, logotiplar chizish va tayyor dizayn elementlarini prompt yordamida o'zgartirish ustasi." },
    done_text: { ru: 'Отлично! Теперь ты знаешь и AI-помощников для дизайна.', uz: "Ajoyib! Endi dizayn yaratadigan AI yordamchilarni ham bilasan." },
    audio: {
      intro: {
        ru: 'AI создаёт не только тексты, но и визуальный дизайн. Gamma — сильнейший AI-помощник для создания презентаций, а Canva — для работы с картинками и дизайном. Изучи их.',
        uz: "AI nafaqat matn yozadi, balki sirtqi ko'rinishlarni ham yaratadi. Gamma dasturi prezentatsiyalar tuzishda, Canva esa rasmlar va dizaynlar bilan ishlashda eng kuchli AI yordamchilaridir. Ularni o'rganib chiq."
      }
    }
  },
  sQg: {
    eyebrow: { ru: 'Проверка', uz: 'Tekshiruv' },
    title: {
      ru: 'Тебе нужно по одному промпту быстро подготовить презентацию (слайды) для урока. Каким AI лучше воспользоваться?',
      uz: "Darsing uchun bitta prompt yordamida tezkor prezentatsiya (slayd) tayyorlashing kerak. Qaysi AI dasturidan foydalanganing ma'qul?"
    },
    tap_hint: { ru: 'Нажми', uz: 'Bosish' },
    correct_text: { ru: 'Молодец! Gamma AI по одной твоей команде сам нарисует и подготовит все слайды. Теперь ты хорошо знаешь и помощников по дизайну!', uz: "Ofarin! Gamma AI sening bitta buyrug'ing bilan barcha slaydlarni o'zi chizib, tayyorlab beradi. Endi sen dizayn yordamchilarini ham yaxshi taniysan!" },
    wrong_default: { ru: 'Не совсем. Canva — мастер картинок и дизайна. Презентацию по одному промпту готовит Gamma AI.', uz: "Unchalik emas. Canva — rasm va dizayn ustasi. Slaydlarni bitta prompt bilan Gamma AI tayyorlab beradi." },
    audio: {
      intro: {
        ru: 'Какой AI первым придёт на помощь в автоматическом создании слайдов и презентаций? Нажимай на карточки — самые сильные AI-помощники для дизайна!',
        uz: "Slaydlar va taqdimotlarni avtomatik yaratishda qaysi AI eng birinchi yordamga keladi? Kartochkalarga bosing — dizayn uchun eng kuchli AI yordamchilari!"
      },
      on_correct: { ru: 'Молодец! Gamma AI по одной твоей команде сам нарисует и подготовит все слайды. Теперь ты хорошо знаешь и помощников по дизайну!', uz: "Ofarin! Gamma AI sening bitta buyrug'ing bilan barcha slaydlarni o'zi chizib, tayyorlab beradi. Endi sen dizayn yordamchilarini ham yaxshi taniysan!" },
      on_wrong: { ru: 'Не совсем. Canva — мастер картинок и дизайна. Презентацию по одному промпту готовит Gamma AI.', uz: "Unchalik emas. Canva — rasm va dizayn ustasi. Slaydlarni bitta prompt bilan Gamma AI tayyorlab beradi." }
    }
  },
  s0: {
    eyebrow: { ru: 'Загадка', uz: 'Topishmoq' },
    title_part1: { ru: '', uz: '' },
    title_part2_em: { ru: 'Что сделает AI?', uz: 'AI nima qiladi?' },
    title_part3: { ru: '', uz: '' },
    question: { ru: 'Если дать программе AI команду «Мороженое» — какой результат она выдаст?', uz: 'AI dasturiga "Muzqaymoq" deb buyruq bersak, u qanday natija chiqaradi?' },
    opt0: { ru: 'Создаст цифровую картинку мороженого', uz: 'Muzqaymoqning raqamli tasvirini yaratadi' },
    opt1: { ru: 'Достанет настоящее мороженое из компьютера', uz: 'Kompyuter ichidan haqiqiy muzqaymoq chiqaradi' },
    opt2: { ru: 'Не поймёт команду', uz: 'Buyruqni tushunmaydi' },
    audio: {
      intro: {
        ru: 'Искусственный интеллект умеет работать с картинками. Как думаешь, если написать ему «Мороженое» — что он сделает? Выбери правильный ответ!',
        uz: "Sun'iy Intellekt tasvirlar bilan ishlay oladi. Nima deb o'ylaysan, unga Muzqaymoq deb yozsak, u nima qiladi? To'g'ri javobni tanla!"
      },
      on_correct: { ru: 'Верно! AI проанализирует данные в своей памяти и за несколько секунд нарисует тебе цифровую картинку мороженого.', uz: "To'g'ri! AI o'z xotirasidagi ma'lumotlarni tahlil qilib, senga bir necha soniyada muzqaymoqning raqamli rasmini chizib beradi." },
      on_wrong: { ru: 'Нет, не так. AI не достаёт настоящие вещи — но он понимает команду и в один миг нарисует цифровую картинку мороженого. Смотри!', uz: "Yo'q, unday emas. AI haqiqiy narsalarni chiqara olmaydi — lekin u buyruqni tushunadi va bir zumda muzqaymoqning raqamli rasmini chizib beradi. Qara!" }
    }
  },
  s1: {
    eyebrow: { ru: 'Собираем промпт', uz: "Prompt yig'amiz" },
    instruction: { ru: 'Нажимай слова по порядку и собери команду для AI.', uz: "So'zlarni ketma-ket bosib, AI uchun buyruq tuz." },
    word0: { ru: 'Сделай', uz: 'Menga' },
    word1: { ru: 'зелёный', uz: 'yashil' },
    word2: { ru: 'фон', uz: "fon o'rnat" },
    preview_label: { ru: 'ФОН', uz: 'FON' },
    done_text: { ru: 'Готово! AI прочитал промпт и перевёл его в понятный компьютеру код цвета #00FF00.', uz: "Tayyor! AI promptni o'qib, uni kompyuter tushunadigan #00FF00 rang kodiga o'girdi." },
    audio: {
      intro: {
        ru: 'Чтобы дать команду AI, нажимай слова по порядку. Текст, который отправляется компьютерной программе, называется ПРОМПТ, то есть команда. AI прочитает его и переведёт на язык компьютера.',
        uz: "AI-ga buyruq berish uchun so'zlarni ketma-ket bosing. Kompyuter dasturiga yuboriladigan ushbu matn PROMPT, ya'ni buyruq deyiladi. AI uni o'qiydi va kompyuter tiliga o'giradi."
      }
    }
  },
  s2: {
    eyebrow: { ru: 'Дизайн-команды', uz: 'Dizayn-buyruqlar' },
    instruction: { ru: 'Отправь AI команду и смотри, как меняется дизайн.', uz: "AI-ga buyruq yubor va dizayn qanday o'zgarishini kuzat." },
    btn_ocean: { ru: 'Фон «Океан»', uz: 'Okean foni' },
    btn_space: { ru: 'Фон «Космос»', uz: 'Kosmos foni' },
    cmd_ocean: { ru: 'Установи фон «Океан»', uz: "Okean fonini o'rnat" },
    cmd_space: { ru: 'Установи фон «Космос»', uz: "Kosmos fonini o'rnat" },
    hint: { ru: 'Выбери команду…', uz: 'Buyruqni tanla…' },
    done_ocean: { ru: 'AI прочитал промпт и включил океан: тёмно-синий и бирюзовый цвета!', uz: "AI promptni o'qib, okeanni yoqdi: to'q ko'k va firuza ranglar!" },
    done_space: { ru: 'AI прочитал промпт и включил космос: фиолетовый цвет и звёзды!', uz: "AI promptni o'qib, kosmosni yoqdi: binafsha rang va yulduzlar!" },
    audio: {
      intro: {
        ru: 'Ты только что кнопками отправил AI текстовую команду, и система изменила дизайн страницы. Нажми любой вариант и посмотри, как работает система.',
        uz: "Sen hozir tugmalar orqali AI-ga matnli buyruq yubording va tizim sahifaning dizaynini o'zgartirdi. Xohlagan variantingni bos va tizim qanday ishlashini kuzat."
      }
    }
  },
  s3: {
    eyebrow: { ru: 'Запомним', uz: 'Eslab qolamiz' },
    title_part2_em: { ru: 'PROMPT — команда для AI', uz: 'PROMPT — AI uchun buyruq' },
    rule: {
      ru: 'Текстовая инструкция или команда, которую пишут системе искусственного интеллекта (AI) для выполнения задания, называется ПРОМПТ.',
      uz: "Sun'iy Intellekt (AI) tizimiga topshiriqni bajarish uchun yoziladigan matnli ko'rsatma yoki buyruq — PROMPT deb ataladi."
    },
    tip: { ru: 'Чем точнее команда — тем точнее результат.', uz: "Buyruq qanchalik aniq bo'lsa — natija shunchalik aniq bo'ladi." },
    audio: {
      ru: 'Запомним! Текстовая команда, которую пишут искусственному интеллекту, чтобы он выполнил задачу, называется промпт. Чем точнее написана команда, тем точнее программа выполнит результат.',
      uz: "Eslab qolamiz! Sun'iy Intellektdan biror vazifani talab qilish uchun yoziladigan matnli buyruq prompt deyiladi. Buyruq qanchalik aniq yozilsa, dastur natijani shunchalik xatosiz bajaradi."
    }
  },
  s4: {
    eyebrow: { ru: 'Проверка', uz: 'Tekshiruv' },
    question: {
      ru: 'Чтобы AI не запутался и создал именно это красное яблоко — какой промпт правильный?',
      uz: "AI adashib ketmasligi va bizga aynan mana shu qizil olmani yaratib berishi uchun qaysi prompt to'g'ri hisoblanadi?"
    },
    opt0: { ru: 'Нарисуй мне один фрукт', uz: 'Menga bitta meva chizib ber' },
    opt1: { ru: 'Создай картинку блестящего красного яблока с зелёным листиком', uz: "Menga yashil bargli, yaltiraydigan qizil olma tasvirini yaratib ber" },
    audio: {
      intro: {
        ru: 'Если просто сказать AI «нарисуй фрукт», он может нарисовать другой фрукт. Нужно точно написать ему параметры. Какая команда правильная? Выбирай!',
        uz: "AI dasturiga shunchaki 'meva chiz' desang, u boshqa mevani chizishi mumkin. Biz unga parametrlarini aniq yozishimiz kerak. Qaysi buyruq to'g'ri? Tanla!"
      },
      on_correct: { ru: 'Верно! Во втором промпте все детали написаны точно. Теперь AI сработает без ошибок.', uz: "To'g'ri! Ikkinchi promptda barcha tafsilotlar aniq yozilgan. AI endi xatosiz ishlaydi." },
      on_wrong: { ru: 'Эта команда слишком общая — AI может нарисовать банан или грушу. Выбери промпт, где точно написаны все детали.', uz: "Bu buyruq juda umumiy — AI banan yoki nok chizib qo'yishi ham mumkin. Barcha tafsilotlar aniq yozilgan promptni tanla." }
    }
  },
  s5: {
    eyebrow: { ru: 'Обработка картинки', uz: 'Rasmni qayta ishlash' },
    instruction: { ru: 'Отправь AI промпт и смотри, как меняется дизайн кошки.', uz: "AI-ga prompt yubor va mushuk dizayni qanday o'zgarishini kuzat." },
    btn_black: { ru: 'Измени цвет кошки на чёрный и добавь очки', uz: "Mushuk rangini qoraga o'zgartir va ko'zoynak qo'sh" },
    btn_yellow: { ru: 'Измени цвет кошки на жёлтый и добавь кепку', uz: "Mushuk rangini sariqqa o'zgartir va kepka qo'sh" },
    hint: { ru: 'Выбери промпт…', uz: 'Promptni tanla…' },
    done_black: { ru: 'AI обработал картинку: кошка стала чёрной и надела крутые очки!', uz: "AI rasmni qayta ishladi: mushuk qora rangga kirdi va zo'r ko'zoynak taqdi!" },
    done_yellow: { ru: 'AI обработал картинку: кошка стала жёлтой и надела кепку!', uz: "AI rasmni qayta ishladi: mushuk sariq rangga kirdi va kepka kiydi!" },
    audio: {
      intro: {
        ru: 'AI не только задаёт цвета, но и умеет обрабатывать объекты на картинке. Отправь программе промпт и посмотри, как изменится дизайн элементов.',
        uz: "AI nafaqat rang beradi, balki rasmdagi ob'ektlarni qayta ishlay oladi. Dasturga prompt yubor va elementlarning dizayni qanday o'zgarishini ko'r."
      }
    }
  },
  s6: {
    eyebrow: { ru: 'Собери промпт', uz: "Promptni yig'" },
    instruction: { ru: 'Расставь чипы по порядку, чтобы получилась правильная команда.', uz: "To'g'ri buyruq hosil bo'lishi uchun chiplarni tartib bilan joylashtir." },
    // chips — ekrandagi chiplar (A/B/C); order — to'g'ri ketma-ketlikdagi chip indekslari.
    chips: { ru: ['Картинку', 'Создай', 'Космос'], uz: ['Rasm', 'Yarat', 'Kosmos'] },
    order: { ru: [1, 0, 2], uz: [2, 0, 1] },
    made_label: { ru: 'КАРТИНКА СОЗДАНА', uz: 'RASM YARATILDI' },
    done_text: { ru: 'Отлично! Промпт готов: «Создай картинку Космос» — AI понял команду и сразу создал картинку!', uz: "Zo'r! Prompt tayyor: «Kosmos rasm yarat» — AI buyruqni tushunib, darhol rasm yaratdi!" },
    audio: {
      intro: {
        ru: 'Собери слова команды в правильном порядке, чтобы система тебя поняла. Поставь чипы на свои места, и получится промпт.',
        uz: "Tizim tushunishi uchun buyruq so'zlarini to'g'ri ketma-ketlikda yig'. Prompt hosil qilish uchun chiplarni joyiga qo'ying."
      }
    }
  },
  s7: {
    eyebrow: { ru: 'Практика', uz: 'Amaliy topshiriq' },
    instruction: { ru: 'Отправляй AI промпты с полки и обустрой комнату.', uz: 'Tokchadagi promptlarni AI-ga yuborib, xonani jihozla.' },
    shelf_label: { ru: 'ПОЛКА ПРОМПТОВ', uz: 'PROMPT TOKCHASI' },
    chip_wall: { ru: 'Сделай стену зелёной', uz: 'Devor rangini yashil qil' },
    chip_lamp: { ru: 'Включи лампу 💡', uz: 'Chiroqni yoq 💡' },
    chip_book: { ru: 'Положи книгу на стол 📚', uz: "Stol ustiga kitob qo'sh 📚" },
    chip_rug: { ru: 'Постели ковёр на пол 🧶', uz: "Polga gilam to'sha 🧶" },
    done_text: { ru: 'Отлично! AI выполнил все четыре промпта — дизайн комнаты готов!', uz: "Ajoyib! AI to'rttala promptni ham bajardi — xona dizayni tayyor!" },
    audio: {
      intro: {
        ru: 'А теперь практическое задание. Отправляй промпт-команды с полки в комнату и смотри, как AI принимает их и меняет дизайн комнаты.',
        uz: "Endi amaliy topshiriq. Tokchadagi prompt buyruqlarini xonaga joylashtir va AI ularni qanday qabul qilib, xona dizaynini o'zgartirishini tomosha qil."
      }
    }
  },
  sQm: {
    eyebrow: { ru: 'Проверка', uz: 'Tekshiruv' },
    title: {
      ru: 'Какая программа искусственного интеллекта сочиняет песни и мелодии в любом стиле по промпту (текстовой команде)?',
      uz: "Prompt (matnli buyruq) yordamida o'zing xohlagan uslubda qo'shiq va ohanglar bastalaydigan Sun'iy Intellekt dasturi qaysi?"
    },
    tap_hint: { ru: 'Нажми', uz: 'Bosish' },
    correct_text: { ru: 'Молодец! Suno AI превращает текстовую команду в настоящую музыку.', uz: 'Ofarin! Suno AI matnli buyruqni haqiqiy musiqaga aylantiradi.' },
    wrong_default: { ru: 'Не совсем. Gamma AI готовит презентации. Музыку по промпту сочиняет Suno AI.', uz: 'Unchalik emas. Gamma AI prezentatsiyalar tayyorlaydi. Promptdan musiqani Suno AI bastalaydi.' },
    audio: {
      intro: {
        ru: 'Итак, как называется AI-система, которая превращает текстовую команду в музыку? Нажми карточку с правильным ответом!',
        uz: "Xo'sh, matnli buyruqni musiqaga aylantiradigan AI tizimining nomi nima edi? To'g'ri javob aks etgan kartochkani bosing!"
      },
      on_correct: { ru: 'Молодец! Suno AI превращает текстовую команду в настоящую музыку.', uz: 'Ofarin! Suno AI matnli buyruqni haqiqiy musiqaga aylantiradi.' },
      on_wrong: { ru: 'Не совсем. Gamma AI готовит презентации. Музыку по промпту сочиняет Suno AI.', uz: 'Unchalik emas. Gamma AI prezentatsiyalar tayyorlaydi. Promptdan musiqani Suno AI bastalaydi.' }
    }
  },
  sMus: {
    eyebrow: { ru: 'Музыка от AI', uz: 'AI musiqasi' },
    instruction: { ru: 'Нажми промпт на плеере — и AI сочинит мелодию.', uz: 'Pleyerdagi promptni bos — AI ohang bastalab beradi.' },
    btn_rap: { ru: 'Реп-музыка 🎤', uz: 'Rep musiqa 🎤' },
    btn_space: { ru: 'Космическая спокойная музыка 🪐', uz: 'Kosmik sokin musiqa 🪐' },
    hint: { ru: 'Выбери жанр…', uz: 'Janrni tanla…' },
    playing_label: { ru: 'AI ИГРАЕТ', uz: 'AI IJRO ETMOQDA' },
    done_text: { ru: 'AI превратил твой текст в музыку! Suno AI по одному промпту сочиняет целые песни.', uz: "AI matningni musiqaga aylantirdi! Suno AI bitta prompt bilan butun qo'shiqlar bastalaydi." },
    audio: {
      intro: {
        ru: 'AI создаёт не только картинки и тексты, но и музыку! Напиши программе Suno AI, какую песню хочешь, — и она сама сочинит мелодию. Нажимай промпты на плеере и слушай.',
        uz: "AI faqat rasm yoki matn emas, balki musiqa ham yarata oladi! Suno AI dasturiga qanday qo'shiq xohlashingni yozsang, u ohangni o'zi bastalab beradi. Pleyerdagi prompt tugmalarini bosib, tinglab ko'r."
      }
    }
  },
  sFin: {
    eyebrow: { ru: 'Финал', uz: 'Yakun' },
    title: { ru: 'Результаты твоего проекта', uz: 'Sening Loyihang Natijalari' },
    stat_ok: { ru: 'Успешные задания:', uz: 'Muvaffaqiyatli topshiriqlar:' },
    stat_ok_sub: { ru: 'Правильно с первой попытки', uz: "Birinchi urinishda to'g'ri topilganlar" },
    stat_err: { ru: 'Допущенные ошибки:', uz: "Yo'l qo'yilgan xatolar:" },
    stat_err_sub: { ru: 'Промахи среди всех попыток', uz: 'Jami urinishlar ichidagi adashishlar soni' },
    stat_time: { ru: 'Длительность проекта:', uz: 'Loyiha davomiyligi:' },
    unit_pc: { ru: '', uz: 'ta' },
    unit_min: { ru: 'мин', uz: 'daqiqa' },
    finish_btn: { ru: 'Завершить проект', uz: 'Loyihani yakunlash' },
    audio: {
      intro: {
        ru: 'Система успешно завершена! Ты выполнил все практические задания. Сегодня ты узнал, что такое AI и как управлять им с помощью промпта. Ты освоил работу с дизайном и данными. До встречи на следующем уроке, пока!',
        uz: "Tizim muvaffaqiyatli yakunlandi! Sen barcha amaliy topshiriqlarni bajarding. Bugun AI nima ekanligini va uni Prompt yordamida qanday boshqarishni o'rganding. Sirtqi dizayn va ma'lumotlar bilan ishlashni o'zlashtirding. Keyingi darsda uchrashguncha, xayr!"
      }
    }
  },
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
// ============================================================
// AmbientBg — suzuvchi yumshoq dog'lar (orqa fon)
// ============================================================
const AmbientBg = () => (
  <div className="amb" aria-hidden="true">
    <div className="amb-o amb-o1"/>
    <div className="amb-o amb-o2"/>
    <div className="amb-o amb-o3"/>
  </div>
);

// CyberRain — 1-sahifa (kiber-tema) foni: och ko'k 0/1 ustunlari pastga
// sekin oqadi (Matrix-yomg'ir). Pozitsiya/tezliklar deterministik (render'da
// Math.random YO'Q). Ikki nusxa ketma-ket — uzluksiz sikl.
const CY_COLS = [
  { left: '2%',  dur: 22, delay: 0,   fs: 12, op: 0.20 },
  { left: '9%',  dur: 17, delay: -6,  fs: 10, op: 0.13 },
  { left: '16%', dur: 26, delay: -12, fs: 13, op: 0.17 },
  { left: '24%', dur: 19, delay: -3,  fs: 11, op: 0.12 },
  { left: '31%', dur: 24, delay: -15, fs: 12, op: 0.19 },
  { left: '39%', dur: 16, delay: -8,  fs: 10, op: 0.11 },
  { left: '47%', dur: 21, delay: -1,  fs: 13, op: 0.16 },
  { left: '55%', dur: 27, delay: -10, fs: 11, op: 0.13 },
  { left: '63%', dur: 18, delay: -5,  fs: 12, op: 0.20 },
  { left: '71%', dur: 23, delay: -14, fs: 10, op: 0.12 },
  { left: '79%', dur: 20, delay: -7,  fs: 13, op: 0.17 },
  { left: '86%', dur: 25, delay: -2,  fs: 11, op: 0.13 },
  { left: '93%', dur: 18, delay: -11, fs: 12, op: 0.19 },
  { left: '98%', dur: 28, delay: -4,  fs: 10, op: 0.11 },
];
const CyberRain = () => (
  <div className="d5cy-rain" aria-hidden="true">
    {CY_COLS.map(({ left, dur, delay, fs, op }, i) => (
      <div key={i} className="d5cy-col mono" style={{ left, fontSize: fs, opacity: op }}>
        <div className="d5cy-col-in" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
          {[0, 1].map((copy) => (
            <span key={copy} className="d5cy-copy">
              {RAIN_BITS.concat(RAIN_BITS).map((b, j) => <i key={j}>{(j + i) % 3 === 0 ? (b === '1' ? '0' : '1') : b}</i>)}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// HouseDefs — root chaqiradigan umumiy SVG gradient/filtrlar (AI vizuallari uchun).
const HouseDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <defs>
      <linearGradient id="aiMeter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#019ACB"/><stop offset="55%" stopColor="#22B7E0"/><stop offset="100%" stopColor="#1F7A4D"/>
      </linearGradient>
      <radialGradient id="aiScan" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stopColor="rgba(1,154,203,0.30)"/><stop offset="100%" stopColor="rgba(1,154,203,0)"/>
      </radialGradient>
      <linearGradient id="aiSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EAF6FB"/><stop offset="100%" stopColor="#F6F4EF"/>
      </linearGradient>
    </defs>
  </svg>
);

// useStoryReveal — hikoya bo'laklarini ovoz segmentiga qarab ochib boradi (0..total).
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

// bilingual helper: {ru,uz}
const L = (ru, uz) => ({ ru, uz });

// DStar — kichik yulduz (RanoSVG ko'ylagidagi yulduzlar uchun).
const DStar = ({ x, y, sc }) => (
  <g transform={`translate(${x} ${y}) scale(${sc})`}>
    <g transform="translate(-20 -21)">
      <path d="M20 3 L24.9 14.7 L37.5 15.8 L28 24.2 L30.9 36.5 L20 29.8 L9.1 36.5 L12 24.2 L2.5 15.8 L15.1 14.7 Z" fill="url(#g1starG)" stroke="#E0992A" strokeWidth="0.8" strokeLinejoin="round"/>
      <path d="M20 9 L22.4 15.4 L20 20 L17.6 15.4 Z" fill="rgba(255,255,255,0.38)"/>
    </g>
  </g>
);

// ============================================================
// AI VIZUALIZATORLARI (Dars05 — "Bit qanday o'rganadi")
// Barchasi koddan SVG (flat-vector uslub, Rano/Anvar/Bit bilan bir xil).
// ============================================================

// PicSvg — rasm tokeni: mushuk (rang variantlari) / it / qush / koptok / daraxt / baliq.
// showParts=true -> mushuk belgilari (quloq/mo'ylov/dum) yoritiladi (s2).
const CAT_TONES = ['#F2A65A', '#C9C4BC', '#3B3B44', '#E8C07A', '#B08968'];
const PicSvg = ({ kind = 'cat', tone = 0, showParts = false }) => {
  const fur = CAT_TONES[tone % CAT_TONES.length];
  if (kind === 'cat') {
    return (
      <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
        {/* dum */}
        <path className={showParts ? 'ai-part ai-part-tail' : ''} d="M78 74 Q95 70 92 52 Q90 42 82 44" stroke={fur} strokeWidth="7" fill="none" strokeLinecap="round"/>
        {/* tana */}
        <ellipse cx="50" cy="72" rx="24" ry="18" fill={fur}/>
        {/* quloqlar */}
        <path className={showParts ? 'ai-part ai-part-ear' : ''} d="M32 34 L28 14 L46 27 Z" fill={fur}/>
        <path className={showParts ? 'ai-part ai-part-ear' : ''} d="M68 34 L72 14 L54 27 Z" fill={fur}/>
        <path d="M33 30 L31 20 L41 27 Z" fill="#FF9BB0"/>
        <path d="M67 30 L69 20 L59 27 Z" fill="#FF9BB0"/>
        {/* bosh */}
        <circle cx="50" cy="44" r="20" fill={fur}/>
        {/* ko'z */}
        <ellipse cx="42" cy="43" rx="3.4" ry="4.4" fill="#22303A"/>
        <ellipse cx="58" cy="43" rx="3.4" ry="4.4" fill="#22303A"/>
        <circle cx="43" cy="41.5" r="1" fill="#fff"/><circle cx="59" cy="41.5" r="1" fill="#fff"/>
        {/* burun + og'iz */}
        <path d="M47 50 L53 50 L50 53 Z" fill="#FF7A9A"/>
        <path d="M50 53 Q46 57 42 55 M50 53 Q54 57 58 55" stroke="#22303A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        {/* mo'ylov */}
        <g className={showParts ? 'ai-part ai-part-wh' : ''} stroke="#5A5A60" strokeWidth="1.1" strokeLinecap="round">
          <path d="M40 50 L24 47 M40 53 L25 54 M60 50 L76 47 M60 53 L75 54"/>
        </g>
      </svg>
    );
  }
  if (kind === 'dog') {
    return (
      <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
        <path d="M76 76 Q90 74 88 60" stroke="#B98A5A" strokeWidth="7" fill="none" strokeLinecap="round"/>
        <ellipse cx="50" cy="74" rx="25" ry="18" fill="#C79A66"/>
        {/* osilgan quloqlar */}
        <ellipse cx="30" cy="46" rx="8" ry="16" fill="#9A6E42"/>
        <ellipse cx="70" cy="46" rx="8" ry="16" fill="#9A6E42"/>
        <circle cx="50" cy="42" r="20" fill="#C79A66"/>
        {/* tumshuq */}
        <ellipse cx="50" cy="54" rx="11" ry="9" fill="#E4C79B"/>
        <ellipse cx="50" cy="49" rx="3.6" ry="2.8" fill="#3A2A1E"/>
        <ellipse cx="43" cy="40" rx="3.2" ry="4" fill="#22303A"/>
        <ellipse cx="57" cy="40" rx="3.2" ry="4" fill="#22303A"/>
        <path d="M50 52 Q50 58 46 59 M50 52 Q50 58 54 59" stroke="#3A2A1E" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        <path d="M47 61 Q50 63 53 61" stroke="#C0392B" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      </svg>
    );
  }
  if (kind === 'bird') {
    return (
      <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
        <ellipse cx="52" cy="58" rx="22" ry="24" fill="#4C90E6"/>
        <circle cx="46" cy="38" r="15" fill="#5BA0F0"/>
        <path d="M60 40 L74 36 L60 46 Z" fill="#FFC23C"/>
        <circle cx="44" cy="36" r="3" fill="#22303A"/><circle cx="45" cy="35" r="1" fill="#fff"/>
        <path d="M40 60 Q28 54 26 66 Q36 68 46 62 Z" fill="#3B7BD0"/>
        <path d="M48 82 L45 90 M56 82 L59 90" stroke="#FFC23C" strokeWidth="2.4" strokeLinecap="round"/>
      </svg>
    );
  }
  if (kind === 'ball') {
    return (
      <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
        <circle cx="50" cy="52" r="30" fill="#FFFFFF" stroke="#0E0E10" strokeWidth="2"/>
        <path d="M50 34 L63 44 L58 60 H42 L37 44 Z" fill="#0E0E10"/>
        <path d="M50 22 L50 34 M28 44 L37 44 M72 44 L63 44 M42 60 L36 74 M58 60 L64 74" stroke="#0E0E10" strokeWidth="2"/>
      </svg>
    );
  }
  if (kind === 'tree') {
    return (
      <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
        <rect x="45" y="60" width="10" height="26" rx="3" fill="#9A6428"/>
        <circle cx="50" cy="42" r="20" fill="#3FA35B"/>
        <circle cx="34" cy="52" r="14" fill="#4CB56A"/>
        <circle cx="66" cy="52" r="14" fill="#4CB56A"/>
        <circle cx="44" cy="38" r="4" fill="#7ED89A" opacity="0.6"/>
      </svg>
    );
  }
  // fish
  return (
    <svg viewBox="0 0 100 100" className="ai-pic-svg" aria-hidden="true">
      <ellipse cx="46" cy="52" rx="26" ry="17" fill="#FF7A59"/>
      <path d="M70 52 L90 40 L88 64 Z" fill="#F2603C"/>
      <circle cx="34" cy="48" r="3.4" fill="#22303A"/><circle cx="35" cy="47" r="1" fill="#fff"/>
      <path d="M40 44 Q52 38 60 46" stroke="#F2603C" strokeWidth="1.6" fill="none"/>
    </svg>
  );
};

// PicCard — ramkali rasm kartochkasi. state: '', 'on', 'ok', 'x', 'scan'. label ixtiyoriy.
const PicCard = ({ kind, tone = 0, state = '', label, showParts = false, onClick, disabled, size = 'md' }) => (
  <button
    type="button"
    className={`ai-card ai-card-${size} ai-card-${state || 'idle'}`}
    onClick={onClick}
    disabled={disabled || !onClick}
    aria-hidden={!onClick}
  >
    <div className="ai-card-pic">
      <PicSvg kind={kind} tone={tone} showParts={showParts}/>
      {state === 'scan' && <span className="ai-scanline"/>}
      {state === 'ok' && <span className="ai-badge ai-badge-ok">✓</span>}
      {state === 'x' && <span className="ai-badge ai-badge-x">✕</span>}
    </div>
    {label && <span className="ai-card-label">{label}</span>}
  </button>
);

// LearnMeter — Bit xotirasi/o'rganish darajasi. value/max segment.
const LearnMeter = ({ value, max, label }) => {
  const pct = Math.round((value / max) * 100);
  const face = pct >= 100 ? 'happy' : pct > 0 ? 'present' : 'hint';
  return (
    <div className="ai-meter fade-up">
      <div className="ai-meter-bit"><BitSVG state={face} className="ai-meter-bitsvg"/></div>
      <div className="ai-meter-body">
        <div className="ai-meter-top">
          <span className="ai-meter-label">{label}</span>
          <span className="mono ai-meter-val">{value} / {max}</span>
        </div>
        <div className="ai-meter-track">
          {Array.from({ length: max }).map((_, i) => (
            <span key={i} className={`ai-meter-seg ${i < value ? 'on' : ''}`}/>
          ))}
        </div>
      </div>
    </div>
  );
};

// BitScan — Bit bitta rasmga qaraydi (skan chizig'i). verdict: null | 'cat' | 'dog'
const BitScan = ({ kind, tone = 0, verdict = null, said }) => (
  <div className="ai-scanwrap">
    <div className="ai-scan-bit"><BitSVG state={verdict ? 'happy' : 'present'} className="ai-scan-bitsvg"/></div>
    <div className="ai-scan-beam" aria-hidden="true"/>
    <PicCard kind={kind} tone={tone} state={verdict ? 'scan' : 'scan'}/>
    {said && <div className="ai-bubble">{said}</div>}
  </div>
);

// LabBg — hikoya sahnasi orqa foni (yumshoq xona/laboratoriya).
const LabBg = () => (
  <svg className="ai-labbg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="200" fill="url(#aiSky)"/>
    <rect x="0" y="150" width="400" height="50" fill="#EDE7DC"/>
    <g opacity="0.5" stroke="#D8D2C6" strokeWidth="2" fill="none">
      <circle cx="60" cy="50" r="20"/><circle cx="60" cy="50" r="10"/>
      <rect x="320" y="34" width="46" height="34" rx="6"/>
      <path d="M330 46 h26 M330 54 h20"/>
    </g>
    <g className="ai-bg-float"><circle cx="200" cy="40" r="6" fill="#FFC23C" opacity="0.6"/></g>
    <g className="ai-bg-float2"><circle cx="150" cy="70" r="5" fill="#019ACB" opacity="0.5"/></g>
  </svg>
);

// OnboardHint — "ovozni oxirigacha tinglang -> Davom".
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

// AiStory — hikoya slaydi (sIntro / sGuest): LabBg + Bit(katta) + Ra'no/Anvar.
const AiStory = ({ props, c, showRealLife = false }) => {
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
        {c.title && <h1 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.title)}</h1>}
        <div className="frame fade-up delay-1" style={{ padding: 'clamp(18px, 3.6vw, 28px)', overflow: 'hidden' }}>
          <div className="ai-scene">
            <LabBg/>
            <div className={`ai-hero-bit ${step >= 1 ? 'in' : ''}`}><BitSVG state={step >= total ? 'happy' : 'present'} className="ai-hero-bitsvg"/></div>
            <div className="ai-cast-row">
              <div className={`g1-cast ${step >= 2 ? 'in' : ''}`}>
                <div className="g1-cast-fig"><RanoSVG mood={step >= total ? 'happy' : 'pointing'} className="g1-cast-svg"/></div>
                <span className="g1-cast-name">{t(c.rano_label)}</span>
              </div>
              <div className={`g1-cast ${step >= 2 ? 'in' : ''}`}>
                <div className="g1-cast-fig"><AnvarSVG pose={step >= total ? 'happy' : 'idle'} className="g1-cast-svg"/></div>
                <span className="g1-cast-name">{t(c.anvar_label)}</span>
              </div>
            </div>
          </div>
          {showRealLife && (
            <div className={`ai-reallife ${step >= 2 ? 'in' : ''}`}>
              <div className="ai-rl-item"><span className="ai-rl-ic">📷</span><span>{lang === 'uz' ? 'Kamera yuzni taniydi' : 'Камера узнаёт лицо'}</span></div>
              <div className="ai-rl-item"><span className="ai-rl-ic">🎤</span><span>{lang === 'uz' ? 'Yordamchi nutqni tushunadi' : 'Помощник понимает речь'}</span></div>
            </div>
          )}
        </div>
        <OnboardHint/>
      </div>
    </Stage>
  );
};

// ============================================================
// INTRO-KINO (sIntro) — kinematik robot-laboratoriya sahnasi.
// Kompozitsiya: CHAPDA Bit (podiumda), MARKAZDA AiMonitor — ma'lumotlar va
// kodlar aylanayotgan tizim ekrani (matritsa-yomg'ir, neyro-yadro, kod
// satrlari). Ovoz bosqichlariga bog'langan "kadrlar":
//   1-segment: teleport nuri -> Bit paydo bo'ladi, AI-monitor yonadi
//   2-segment: bilim chiplari — milliardlab kitoblar, tillar, ma'lumotlar
//   3-segment: so'rov -> javob (bir zumda bajaradi)
//   4-segment (final): "LOYIHA TAYYOR" + nur portlashi + konfetti + nishon
// Fon doim jonli: miltillovchi server LEDlari, deraza ortida tungi shahar
// (yulduzlar, uchar yulduz, oy, chiroqlar), muallaq chang zarralari, radar
// to'lqinli podium, proyektor nuri. Hammasi koddan SVG.
// ============================================================

// BounceTitle — sarlavha harflari multfilmdagidek birma-bir sakrab chiqadi.
const BounceTitle = ({ text }) => {
  const words = String(text).split(' ');
  let li = 0;
  return (
    <h1 className="title h-sub d5-title" style={{ textAlign: 'center' }} aria-label={String(text)}>
      {words.map((w, wi) => (
        <span key={wi} className="d5-word" aria-hidden="true">
          {w.split('').map((ch, ci) => {
            const d = 0.12 + (li++) * 0.045;
            return <span key={ci} className="d5-tl" style={{ animationDelay: `${d}s` }}>{ch}</span>;
          })}
          {wi < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </h1>
  );
};

// LabCinemaBg — tungi robot-laboratoriya: deraza ortida real shahar, server
// shkafi, monitor, proyektor nuri, radar-to'lqinli podium, muallaq zarralar.
const LabCinemaBg = ({ fin }) => (
  <svg className="d5-bg" viewBox="0 0 460 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="d5wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#20415C"/><stop offset="100%" stopColor="#132C41"/>
      </linearGradient>
      <linearGradient id="d5floorg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#102536"/><stop offset="100%" stopColor="#0A1A29"/>
      </linearGradient>
      <linearGradient id="d5winsky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0B2038"/><stop offset="100%" stopColor="#1B4A6E"/>
      </linearGradient>
      <radialGradient id="d5podg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(91,214,242,0.5)"/><stop offset="100%" stopColor="rgba(91,214,242,0)"/>
      </radialGradient>
      <linearGradient id="d5spotg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(170,230,255,0.30)"/><stop offset="100%" stopColor="rgba(170,230,255,0)"/>
      </linearGradient>
      <radialGradient id="d5burstg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(255,230,150,0.5)"/><stop offset="60%" stopColor="rgba(255,180,90,0.14)"/><stop offset="100%" stopColor="rgba(255,180,90,0)"/>
      </radialGradient>
      <filter id="d5blur3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id="d5blur6" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    {/* devor + panellar */}
    <rect width="460" height="200" fill="url(#d5wall)"/>
    <path d="M115 0 V200 M345 0 V200" stroke="rgba(255,255,255,0.05)" strokeWidth="1.4"/>
    {/* shift LED chizig'i */}
    <rect x="0" y="34" width="460" height="2.4" fill="#2E6A8F"/>
    <rect className="d5-ledline" x="0" y="34" width="460" height="2.4" fill="#5BD6F2" opacity="0.5" filter="url(#d5blur3)"/>
    {/* deraza — tungi shahar */}
    <g>
      <rect x="44" y="50" width="148" height="104" rx="10" fill="#0A1B2C"/>
      <rect x="50" y="56" width="136" height="92" rx="6" fill="url(#d5winsky)"/>
      <g fill="#DFF3FF">
        <circle className="d5-star d5-st1" cx="66" cy="70" r="1.6"/>
        <circle className="d5-star d5-st2" cx="96" cy="64" r="1.2"/>
        <circle className="d5-star d5-st3" cx="128" cy="72" r="1.5"/>
        <circle className="d5-star d5-st4" cx="158" cy="62" r="1.2"/>
        <circle className="d5-star d5-st2" cx="172" cy="82" r="1.4"/>
        <circle className="d5-star d5-st3" cx="82" cy="88" r="1.1"/>
      </g>
      {/* oy (kraterli) */}
      <circle cx="160" cy="78" r="10" fill="#F4E9C8"/>
      <circle cx="156" cy="75" r="2.2" fill="#E2D3A8"/>
      <circle cx="163" cy="82" r="1.6" fill="#E2D3A8"/>
      <circle cx="160" cy="78" r="13" fill="#F4E9C8" opacity="0.18" filter="url(#d5blur3)"/>
      {/* uchar yulduz */}
      <path className="d5-shoot" d="M60 62 l16 8" stroke="#CFEFFF" strokeWidth="1.6" strokeLinecap="round"/>
      {/* shahar silueti + chiroqlar */}
      <path d="M50 148 V122 h14 v-14 h12 v10 h16 v-22 h14 v16 h12 v-9 h16 v17 h12 v-12 h14 v14 h12 v-8 h14 v36 Z" fill="#0C2438"/>
      <g fill="#FFD86B">
        <rect className="d5-citylite d5-cl1" x="70" y="128" width="3" height="3"/>
        <rect className="d5-citylite d5-cl2" x="98" y="132" width="3" height="3"/>
        <rect className="d5-citylite d5-cl3" x="120" y="120" width="3" height="3"/>
        <rect className="d5-citylite d5-cl1" x="146" y="134" width="3" height="3"/>
        <rect className="d5-citylite d5-cl2" x="166" y="126" width="3" height="3"/>
      </g>
      <rect x="44" y="50" width="148" height="104" rx="10" fill="none" stroke="#2E5B7E" strokeWidth="4"/>
      <path d="M118 52 V152" stroke="#2E5B7E" strokeWidth="3"/>
    </g>
    {/* server shkafi — miltillovchi LEDlar */}
    <g>
      <rect x="366" y="108" width="62" height="88" rx="6" fill="#152F45" stroke="#28506F" strokeWidth="2"/>
      <rect x="372" y="118" width="50" height="12" rx="3" fill="#0E2436"/>
      <rect x="372" y="136" width="50" height="12" rx="3" fill="#0E2436"/>
      <rect x="372" y="154" width="50" height="12" rx="3" fill="#0E2436"/>
      <rect x="372" y="172" width="50" height="12" rx="3" fill="#0E2436"/>
      <circle className="d5-led d5-led1" cx="380" cy="124" r="2.2" fill="#7BE495"/>
      <circle className="d5-led d5-led2" cx="388" cy="124" r="2.2" fill="#5BD6F2"/>
      <circle className="d5-led d5-led3" cx="380" cy="142" r="2.2" fill="#FFB84D"/>
      <circle className="d5-led d5-led2" cx="388" cy="160" r="2.2" fill="#7BE495"/>
      <circle className="d5-led d5-led1" cx="380" cy="178" r="2.2" fill="#5BD6F2"/>
      <path d="M400 124 h16 M400 142 h16 M400 160 h16 M400 178 h16" stroke="#28506F" strokeWidth="2" strokeLinecap="round"/>
    </g>
    {/* pol + perspektiva chiziqlari */}
    <rect y="196" width="460" height="64" fill="url(#d5floorg)"/>
    <rect y="195" width="460" height="2" fill="rgba(91,214,242,0.28)"/>
    <path d="M40 260 L120 196 M160 260 L185 196 M300 260 L275 196 M420 260 L340 196" stroke="rgba(255,255,255,0.05)" strokeWidth="1.2"/>
    {/* proyektor nuri — Bit (chap) tepasida */}
    <polygon className="d5-spot" points="72,0 138,0 188,236 22,236" fill="url(#d5spotg)" filter="url(#d5blur6)"/>
    {/* podium — radar to'lqinlari bilan (chapda) */}
    <ellipse className="d5-podglow" cx="105" cy="232" rx="90" ry="22" fill="url(#d5podg)"/>
    <ellipse cx="105" cy="232" rx="58" ry="13" fill="#0D2B41" stroke="rgba(91,214,242,0.75)" strokeWidth="2"/>
    <ellipse cx="105" cy="229" rx="44" ry="9" fill="#123650" opacity="0.9"/>
    <ellipse className="d5-ripple d5-rp1" cx="105" cy="232" rx="58" ry="13" fill="none" stroke="rgba(91,214,242,0.55)" strokeWidth="1.6"/>
    <ellipse className="d5-ripple d5-rp2" cx="105" cy="232" rx="58" ry="13" fill="none" stroke="rgba(91,214,242,0.55)" strokeWidth="1.6"/>
    {/* muallaq chang zarralari */}
    <g fill="#8FD9F5">
      <circle className="d5-mote d5-m1" cx="120" cy="120" r="2.4" opacity="0.35"/>
      <circle className="d5-mote d5-m2" cx="260" cy="90" r="1.8" opacity="0.3"/>
      <circle className="d5-mote d5-m3" cx="320" cy="150" r="2.8" opacity="0.25" filter="url(#d5blur3)"/>
      <circle className="d5-mote d5-m2" cx="70" cy="170" r="2" opacity="0.3"/>
      <circle className="d5-mote d5-m1" cx="210" cy="60" r="2.2" opacity="0.3" filter="url(#d5blur3)"/>
    </g>
    {/* final: iliq nur portlashi (Bit atrofida) */}
    <g className={`d5-burst ${fin ? 'show' : ''}`}>
      <circle cx="105" cy="168" r="115" fill="url(#d5burstg)"/>
      <g stroke="rgba(255,225,150,0.5)" strokeWidth="3" strokeLinecap="round">
        <path d="M105 64 V36"/>
        <path d="M158 84 L176 58"/>
        <path d="M52 84 L34 58"/>
        <path d="M196 132 L226 120"/>
        <path d="M42 138 L26 130"/>
      </g>
    </g>
  </svg>
);

// MonIcon — AiMonitor bilim chiplari uchun mini-ikonlar (kitob/til/ma'lumot).
const MonIcon = ({ kind }) => {
  if (kind === 'book') {
    return (
      <svg viewBox="0 0 24 24" className="d5-kicon" aria-hidden="true">
        <path d="M12 5 Q8 2.6 3.5 3.4 V18.4 Q8 17.6 12 20 Q16 17.6 20.5 18.4 V3.4 Q16 2.6 12 5 Z" fill="rgba(91,214,242,0.15)" stroke="#5BD6F2" strokeWidth="1.6"/>
        <path d="M12 5 V20" stroke="#5BD6F2" strokeWidth="1.4"/>
      </svg>
    );
  }
  if (kind === 'globe') {
    return (
      <svg viewBox="0 0 24 24" className="d5-kicon" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="rgba(91,214,242,0.15)" stroke="#5BD6F2" strokeWidth="1.6"/>
        <path d="M3 12 h18 M12 3 a13 13 0 0 1 0 18 M12 3 a13 13 0 0 0 0 18" fill="none" stroke="#5BD6F2" strokeWidth="1.2"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="d5-kicon" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="rgba(91,214,242,0.15)" stroke="#5BD6F2" strokeWidth="1.6"/>
      <path d="M9 3 v3 M15 3 v3 M9 18 v3 M15 18 v3 M3 9 h3 M3 15 h3 M18 9 h3 M18 15 h3" stroke="#5BD6F2" strokeWidth="1.3"/>
      <rect x="10" y="10" width="4" height="4" fill="#5BD6F2"/>
    </svg>
  );
};

// AiMonitor — markaziy tizim ekrani: matritsa-yomg'ir (0/1), neyro-yadro
// (orbitadagi elektronlar), yozilayotgan kod satrlari. Ovoz bosqichlarida:
// bilim chiplari (2), so'rov->javob (3), final "LOYIHA TAYYOR" holati.
const RAIN_BITS = '1011010010110010110100101101'.split('');
const AiMonitor = ({ step, fin, lang }) => {
  const uz = lang === 'uz';
  return (
    <div className={`d5-mon ${step >= 1 ? 'on' : ''}`} aria-hidden="true">
      <div className="d5-mon-head">
        <span className="d5-mon-dots"><i/><i/><i/></span>
        <span className="d5-mon-title">{uz ? "AI · SUN'IY INTELLEKT" : 'AI · ИСКУССТВЕННЫЙ ИНТЕЛЛЕКТ'}</span>
        <span className="d5-mon-live"/>
      </div>
      <div className="d5-mon-body">
        {/* matritsa-yomg'ir: oqayotgan 0/1 ustunlari */}
        <div className="d5-rains">
          {[0, 1, 2, 3].map((col) => (
            <div key={col} className={`d5-rain d5-rain${col}`}>
              {RAIN_BITS.concat(RAIN_BITS).map((b, j) => <span key={j}>{b}</span>)}
            </div>
          ))}
        </div>
        <div className="d5-mon-mid">
          {/* yozilayotgan kod satrlari */}
          <div className="d5-code">
            <span className="d5-cl" style={{ width: '84%' }}/>
            <span className="d5-cl d5-cl-g" style={{ width: '58%' }}/>
            <span className="d5-cl" style={{ width: '72%' }}/>
            <span className="d5-cl d5-cl-o" style={{ width: '46%' }}/>
            <span className="d5-cl d5-cl-g" style={{ width: '64%' }}/>
            <span className="d5-cl d5-cursor" style={{ width: '32%' }}/>
          </div>
          {/* neyro-yadro: AI o'zagi + orbitadagi elektronlar */}
          <svg className="d5-core" viewBox="0 0 140 140">
            <ellipse cx="70" cy="70" rx="58" ry="24" fill="none" stroke="rgba(91,214,242,0.35)" strokeWidth="1.4"/>
            <ellipse cx="70" cy="70" rx="58" ry="24" fill="none" stroke="rgba(91,214,242,0.25)" strokeWidth="1.4" transform="rotate(60 70 70)"/>
            <ellipse cx="70" cy="70" rx="58" ry="24" fill="none" stroke="rgba(91,214,242,0.25)" strokeWidth="1.4" transform="rotate(-60 70 70)"/>
            <g transform="translate(70 70) scale(1 0.414)">
              <g className="d5-el d5-el1"><circle cx="58" cy="0" r="5.5" fill="#7BE495"/></g>
            </g>
            <g transform="translate(70 70) rotate(60) scale(1 0.414)">
              <g className="d5-el d5-el2"><circle cx="58" cy="0" r="5" fill="#FFB84D"/></g>
            </g>
            <g transform="translate(70 70) rotate(-60) scale(1 0.414)">
              <g className="d5-el d5-el3"><circle cx="58" cy="0" r="5" fill="#FF7AA8"/></g>
            </g>
            <circle className="d5-corec" cx="70" cy="70" r="25" fill="rgba(91,214,242,0.14)" stroke="#5BD6F2" strokeWidth="2.4"/>
            <text x="70" y="79" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="25" fill="#5BD6F2">AI</text>
          </svg>
        </div>
        {/* bilim chiplari: milliardlab kitoblar / tillar / ma'lumotlar */}
        {step >= 2 && (
          <div className="d5-know">
            <span className="d5-kchip"><MonIcon kind="book"/><span>{uz ? 'Kitoblar' : 'Книги'}</span><b>{uz ? '1 mlrd+' : '1 млрд+'}</b></span>
            <span className="d5-kchip d5-kchip2"><MonIcon kind="globe"/><span>{uz ? 'Tillar' : 'Языки'}</span><b>100+</b></span>
            <span className="d5-kchip d5-kchip3"><MonIcon kind="chip"/><span>{uz ? "Ma'lumotlar" : 'Данные'}</span><b>∞</b></span>
          </div>
        )}
        {/* so'rov -> javob: bir zumda bajaradi */}
        {step >= 3 && (
          <div className="d5-query">
            <span className="d5-q-ask">{uz ? "So'rov" : 'Запрос'} <b>?</b></span>
            <span className="d5-q-arrow">→</span>
            <span className="d5-q-ans">{uz ? 'Bajarildi' : 'Готово'} <b>✓</b></span>
            <span className="d5-q-time">0.1 s</span>
          </div>
        )}
        {/* final holati */}
        {fin && (
          <div className="d5-status">
            <span className="d5-status-bar"><i/></span>
            <span className="d5-status-txt">{uz ? 'LOYIHA TAYYOR' : 'ПРОЕКТ ГОТОВ'} ✓</span>
          </div>
        )}
      </div>
    </div>
  );
};

// IntroCinema — sIntro ekrani: Stage + audio-bosqichli multfilm sahnasi.
const IntroCinema = ({ props, c }) => {
  const lang = useLang();
  const t = useT();
  const audio = useAudio(makeAutoSegments(c, lang));
  useHero('none'); // sahnada Bit katta — burchakdagi overlay dublni yashiramiz
  const total = Array.isArray(c.audio?.[lang]) ? c.audio[lang].length : 4;
  const step = useStoryReveal(audio, total);
  const fin = step >= total;
  const canGo = useCanAnswer(audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(10px, 2vw, 16px)' }}>
        <BounceTitle text={t(c.title)}/>
        <div className="frame fade-up delay-1 d5-frame">
          <div className="d5-scene">
            <LabCinemaBg fin={fin}/>
            {/* teleport nuri (chapda) */}
            <div className={`d5-beam ${step >= 1 ? 'in' : ''}`} aria-hidden="true"/>
            {/* Bit — chapda, podiumda paydo bo'ladi */}
            <div className={`d5-bit ${step >= 1 ? 'in' : ''}`} aria-hidden="true">
              <BitSVG state={fin ? 'happy' : 'present'} className="d5-bitsvg"/>
            </div>
            {/* markazda: AI tizim ekrani (ma'lumotlar va kodlar aylanadi) */}
            <AiMonitor step={step} fin={fin} lang={lang}/>
            {/* final: konfetti + chaqiruv nishoni */}
            {fin && <div className="d5-confetti" aria-hidden="true"><Confetti/></div>}
            {fin && (
              <div className="d5-badge">
                <span className="d5-badge-star" aria-hidden="true">⭐</span>
                {lang === 'uz' ? 'Loyihani boshlaymiz!' : 'Начинаем проект!'}
              </div>
            )}
          </div>
        </div>
        <OnboardHint/>
      </div>
    </Stage>
  );
};

// ============================================================
// EKRANLAR — Dars05 (Sun'iy intellekt qanday o'rganadi)
// ============================================================

// sIntro — SYUJET KIRISH: multfilm-kino sahnasi (IntroCinema).
const ScreenIntro = (props) => <IntroCinema props={props} c={CONTENT.sIntro}/>;

// --- sAis logotiplari (koddan SVG, soddalashtirilgan uslub) ---
// ChatGPT — OpenAI tuguni (6 ta aylantirilgan bo'g'in, yashil).
const GptLogo = () => (
  <svg viewBox="0 0 64 64" className="d5g-logo" aria-hidden="true">
    <g stroke="#10A37F" strokeWidth="4.6" fill="none" strokeLinejoin="round" strokeLinecap="round">
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <path key={r} transform={`rotate(${r} 32 32)`} d="M32 9 L46 17 L46 33"/>
      ))}
    </g>
  </svg>
);
// Gemini — to'rt uchli uchqun-yulduz (ko'k-binafsha gradient).
const GeminiLogo = () => (
  <svg viewBox="0 0 64 64" className="d5g-logo" aria-hidden="true">
    <defs>
      <linearGradient id="d5gGem" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4285F4"/>
        <stop offset="55%" stopColor="#9B72CB"/>
        <stop offset="100%" stopColor="#D96570"/>
      </linearGradient>
    </defs>
    <path d="M32 4 C34.4 19.2 44.8 29.6 60 32 C44.8 34.4 34.4 44.8 32 60 C29.6 44.8 19.2 34.4 4 32 C19.2 29.6 29.6 19.2 32 4 Z" fill="url(#d5gGem)"/>
  </svg>
);
// Claude — terrakota quyosh-nur (har xil uzunlikdagi 12 nur).
const ClaudeLogo = () => (
  <svg viewBox="0 0 64 64" className="d5g-logo" aria-hidden="true">
    <g stroke="#D97757" strokeWidth="5" strokeLinecap="round">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const r2 = i % 2 === 0 ? 25 : 18;
        return <line key={i} x1={32 + Math.cos(a) * 7} y1={32 + Math.sin(a) * 7} x2={32 + Math.cos(a) * r2} y2={32 + Math.sin(a) * r2}/>;
      })}
    </g>
  </svg>
);

// sAis — TANISHUV: eng mashhur 3 matnli AI (ChatGPT / Gemini / Claude).
// Kartochka bosilganda 3D ag'darilib, kompaniya va kuchli tomonini ochadi.
// Uchchalasi ham ochilgach (va ovoz tugagach) Davom ochiladi.
const AIS_CARDS = [
  { key: 'gpt', name: 'ChatGPT',   by: 'gpt_by', desc: 'gpt_desc', Logo: GptLogo },
  { key: 'gem', name: 'Gemini AI', by: 'gem_by', desc: 'gem_desc', Logo: GeminiLogo },
  { key: 'cla', name: 'Claude AI', by: 'cla_by', desc: 'cla_desc', Logo: ClaudeLogo },
];
const ScreenAis = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sAis;
  const audio = useAudio([{ id: 'sais_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [flipped, setFlipped] = useState({});   // key -> hozir ochiqmi (toggle)
  const [seen, setSeen] = useState({});         // key -> hech ochilganmi (gating)
  const allSeen = Object.keys(seen).length >= AIS_CARDS.length;
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(allSeen, 450);
  const tapCard = (key) => {
    setFlipped((f) => ({ ...f, [key]: !f[key] }));
    if (!seen[key]) {
      sfx.playCorrect();
      setSeen((s) => ({ ...s, [key]: true }));
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(allSeen && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        <div className="d5g-grid fade-up delay-1">
          {AIS_CARDS.map(({ key, name, by, desc, Logo }) => (
            <button key={key} type="button" className={`d5g-card ${flipped[key] ? 'open' : ''}`} onClick={() => tapCard(key)}>
              <div className="d5g-inner">
                <div className="d5g-face d5g-front">
                  <Logo/>
                  <span className="d5g-name">{name}</span>
                  <span className="d5g-tap">{t(c.tap_hint)} 👆</span>
                </div>
                <div className="d5g-face d5g-back">
                  <span className="d5g-backname">{name}</span>
                  <span className="d5g-by">{t(c[by])}</span>
                  <span className="d5g-desc">{t(c[desc])}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {allSeen && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// --- sDes logotiplari va mini-vizuallar (koddan SVG) ---
// Gamma — binafsha-pushti gradient kvadrat, oq "G".
const GammaLogo = () => (
  <svg viewBox="0 0 64 64" className="d5g-logo" aria-hidden="true">
    <defs>
      <linearGradient id="d5gGam" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7C5CFF"/>
        <stop offset="100%" stopColor="#FF7AC3"/>
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="52" height="52" rx="15" fill="url(#d5gGam)"/>
    <text x="32" y="43" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="30" fill="#FFFFFF">G</text>
  </svg>
);
// Canva — firuza-ko'k gradient yumaloq kvadrat, oq "C".
const CanvaLogo = () => (
  <svg viewBox="0 0 64 64" className="d5g-logo" aria-hidden="true">
    <defs>
      <linearGradient id="d5gCan" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#00C4CC"/>
        <stop offset="100%" stopColor="#2A78E8"/>
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="52" height="52" rx="15" fill="url(#d5gCan)"/>
    <text x="32" y="43" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="30" fill="#FFFFFF">C</text>
  </svg>
);
// Gamma mini: prompt'dan chiqqan slaydlar dastasi.
const GammaMini = () => (
  <svg viewBox="0 0 90 44" className="d5g-mini" aria-hidden="true">
    <rect x="24" y="1" width="44" height="28" rx="4" fill="#FFFFFF" opacity="0.3" transform="rotate(-5 46 15)"/>
    <rect x="20" y="8" width="50" height="32" rx="4" fill="#FFFFFF"/>
    <rect x="26" y="14" width="22" height="4.5" rx="2" fill="#7C5CFF"/>
    <rect x="26" y="23" width="38" height="3" rx="1.5" fill="#C9BFF5"/>
    <rect x="26" y="29" width="30" height="3" rx="1.5" fill="#C9BFF5"/>
  </svg>
);
// Canva mini: rang-barang dizayn shakllari.
const CanvaMini = () => (
  <svg viewBox="0 0 90 44" className="d5g-mini" aria-hidden="true">
    <rect x="12" y="8" width="26" height="26" rx="6" fill="#00C4CC"/>
    <circle cx="52" cy="21" r="13" fill="#7D2AE8" opacity="0.92"/>
    <path d="M64 34 L75 13 L86 34 Z" fill="#FF7AC3"/>
  </svg>
);

// sDes — DIZAYN-AI: Gamma (prezentatsiya) va Canva (rasm/dizayn) — 2 ta
// flip-kartochka; orqasida rol-chip, mini-vizual va ta'rif. Ikkalasi ham
// ochilgach (va ovoz tugagach) Davom ochiladi.
const DES_CARDS = [
  { key: 'gam', name: 'Gamma AI', role: 'gam_role', desc: 'gam_desc', Logo: GammaLogo, Mini: GammaMini },
  { key: 'can', name: 'Canva AI', role: 'can_role', desc: 'can_desc', Logo: CanvaLogo, Mini: CanvaMini },
];
const ScreenDes = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sDes;
  const audio = useAudio([{ id: 'sdes_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [flipped, setFlipped] = useState({});
  const [seen, setSeen] = useState({});
  const allSeen = Object.keys(seen).length >= DES_CARDS.length;
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(allSeen, 450);
  const tapCard = (key) => {
    setFlipped((f) => ({ ...f, [key]: !f[key] }));
    if (!seen[key]) {
      sfx.playCorrect();
      setSeen((s) => ({ ...s, [key]: true }));
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(allSeen && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        <div className="d5g-grid d5g-grid-2 fade-up delay-1">
          {DES_CARDS.map(({ key, name, role, desc, Logo, Mini }) => (
            <button key={key} type="button" className={`d5g-card ${flipped[key] ? 'open' : ''}`} onClick={() => tapCard(key)}>
              <div className="d5g-inner">
                <div className="d5g-face d5g-front">
                  <Logo/>
                  <span className="d5g-name">{name}</span>
                  <span className="d5g-tap">{t(c.tap_hint)} 👆</span>
                </div>
                <div className="d5g-face d5g-back">
                  <span className="d5g-backname">{name}</span>
                  <span className="d5g-by">{t(c[role])}</span>
                  <Mini/>
                  <span className="d5g-desc">{t(c[desc])}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {allSeen && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// IceCreamSVG — AI "chizib bergan" muzqaymoq (s0 generatsiya natijasi).
const IceCreamSVG = () => (
  <svg viewBox="0 0 90 120" className="d5p-ice" aria-hidden="true">
    {/* vafli konus */}
    <path d="M25 54 L45 112 L65 54 Z" fill="#E8A85C" stroke="#C9853B" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M29 62 h32 M33 74 h24 M37 86 h16 M41 98 h8" stroke="#C9853B" strokeWidth="1.5"/>
    <path d="M31 57 L43 106 M59 57 L47 106" stroke="#C9853B" strokeWidth="1.1" opacity="0.7"/>
    {/* sharlar: qulupnay + pista + vanil */}
    <circle cx="31" cy="44" r="15" fill="#FF9EBB"/>
    <circle cx="59" cy="44" r="15" fill="#B8E6C3"/>
    <circle cx="45" cy="30" r="16" fill="#FFF3D6"/>
    <ellipse cx="40" cy="24" rx="5" ry="3.4" fill="rgba(255,255,255,0.6)"/>
    <ellipse cx="26" cy="39" rx="4" ry="2.8" fill="rgba(255,255,255,0.45)"/>
    {/* sepmalar */}
    <g strokeLinecap="round" strokeWidth="2.2">
      <path d="M38 34 l4 2" stroke="#FF4F28"/>
      <path d="M50 22 l4 -1" stroke="#019ACB"/>
      <path d="M44 40 l4 1" stroke="#1F7A4D"/>
      <path d="M54 33 l3 3" stroke="#FFB84D"/>
      <path d="M33 50 l4 1" stroke="#9B5DE5"/>
      <path d="M60 50 l4 -2" stroke="#FF4F28"/>
    </g>
    {/* gilos */}
    <circle cx="45" cy="12" r="5" fill="#E0392B"/>
    <ellipse cx="43.4" cy="10.4" rx="1.6" ry="1.1" fill="rgba(255,255,255,0.55)"/>
    <path d="M45 7 q3 -4 7 -5" stroke="#1F7A4D" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
  </svg>
);

// sQg — TEST (kartochkali MC): tezkor prezentatsiya (slayd) uchun qaysi AI?
// Ikkita yirik vizual kartochka (oq fon, silliq soya, logo + nom + "Bosish 👆").
// Vedi-do-vernogo: xato kartochka silkinib xiralashadi; to'g'risi (Gamma)
// yashil bo'lib, Bit-kartochkali FeedbackBlock silliq ochiladi.
const QG_CARDS = [
  { key: 'gam', name: 'Gamma AI', Logo: GammaLogo },
  { key: 'can', name: 'Canva AI', Logo: CanvaLogo },
];
const QG_CORRECT = 0;
const ScreenQg = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sQg;
  const sfx = useSfx();
  const audio = useAudio([{ id: 'sqg_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: { type: 'option_picked' } }]);
  const canAns = useCanAnswer(audio);
  const wasSolved = props.storedAnswer?.solved === true || props.storedAnswer?.correct === true;
  const [solved, setSolved] = useState(wasSolved);
  const [picked, setPicked] = useState(wasSolved ? QG_CORRECT : null);
  const [wrongSet, setWrongSet] = useState(() => new Set());
  const [shakeIdx, setShakeIdx] = useState(null);
  const firstTryRef = useRef(props.storedAnswer ? (props.storedAnswer.firstTry ?? props.storedAnswer.correct ?? null) : null);
  const firstIdxRef = useRef(props.storedAnswer?.studentAnswerIndex ?? null);
  const attemptsRef = useRef(props.storedAnswer?.attempts ?? (wasSolved ? 1 : 0));
  const introAdvRef = useRef(wasSolved);
  const doneRef = useRevealScroll(picked !== null, 450);
  const pick = (i) => {
    if (!canAns || solved || wrongSet.has(i)) return;
    if (firstTryRef.current === null) { firstTryRef.current = i === QG_CORRECT; firstIdxRef.current = i; }
    attemptsRef.current += 1;
    setPicked(i);
    if (!introAdvRef.current) { introAdvRef.current = true; audio.triggerEvent('option_picked'); }
    if (i === QG_CORRECT) {
      setSolved(true);
      sfx.playCorrect();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_correct[lang]); }
      props.onAnswer({
        stage: SCREEN_META[props.screen]?.scope ?? null,
        screenIdx: props.screen,
        question: c.title.ru,
        options: QG_CARDS.map((x) => x.name),
        correctIndex: QG_CORRECT,
        correctAnswer: QG_CARDS[QG_CORRECT].name,
        studentAnswerIndex: firstIdxRef.current,
        studentAnswer: QG_CARDS[firstIdxRef.current]?.name ?? null,
        correct: firstTryRef.current,
        firstTry: firstTryRef.current,
        attempts: attemptsRef.current,
        solved: true
      });
    } else {
      sfx.playWrong();
      setWrongSet((s) => new Set(s).add(i));
      setShakeIdx(i);
      setTimeout(() => setShakeIdx(null), 500);
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_wrong[lang]); }
    }
  };
  const canAdv = useAdvanceGate(solved, audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canAdv} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(14px, 2.6vw, 20px)' }}>
        <h1 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.title)}</h1>
        <div className="d5q-cards fade-up delay-1">
          {QG_CARDS.map(({ key, name, Logo }, i) => (
            <button key={key} type="button"
              className={`d5q-card ${solved && i === QG_CORRECT ? 'ok' : ''} ${wrongSet.has(i) || (solved && i !== QG_CORRECT) ? 'off' : ''} ${shakeIdx === i ? 'shake' : ''}`}
              disabled={!canAns || solved || wrongSet.has(i)} onClick={() => pick(i)}>
              <Logo/>
              <span className="d5g-name">{name}</span>
              {!solved && !wrongSet.has(i) && <span className="d5g-tap">{t(c.tap_hint)} 👆</span>}
            </button>
          ))}
        </div>
        {picked !== null && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={solved} wrongClass="frame-tip">
              <Reaction state={solved ? 'correct' : 'wrong'} praise={t(solved ? c.correct_text : c.wrong_default)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// AiPromptScreen — s0 vizuali: AI ekraniga "Muzqaymoq" buyrug'i teriladi;
// javobdan keyin AI rasmni "generatsiya qiladi" (blur -> aniq + skan chizig'i).
const AiPromptScreen = ({ lang, done }) => {
  const uz = lang === 'uz';
  return (
    <div className="d5p" aria-hidden="true">
      <div className="d5-mon-head">
        <span className="d5-mon-dots"><i/><i/><i/></span>
        <span className="d5-mon-title">{uz ? 'AI · TASVIR GENERATORI' : 'AI · ГЕНЕРАТОР КАРТИНОК'}</span>
        <span className="d5-mon-live"/>
      </div>
      <div className="d5p-body">
        <div className="d5p-promptrow">
          <span className="d5p-gt">&gt;</span>
          <span className="d5p-typed">{uz ? 'Muzqaymoq' : 'Мороженое'}</span>
          <span className="d5p-caret"/>
        </div>
        <div className={`d5p-result ${done ? 'done' : ''}`}>
          {done ? (
            <div className="d5p-genwrap">
              <IceCreamSVG/>
              <span className="d5p-scan"/>
              <span className="d5p-file">{uz ? 'muzqaymoq.png' : 'morozhenoe.png'} ✓</span>
            </div>
          ) : (
            <div className="d5p-think">
              <span className="d5p-q">?</span>
              <span className="d5p-dots"><i/><i/><i/></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// s0 — HOOK: "Muzqaymoq" buyrug'iga AI nima qiladi? To'g'ri = A (raqamli tasvir).
const Screen0 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s0;
  const audio = useAudio([{ id: 's0_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [picked, setPicked] = useState(null);
  const correct = 0;
  const pick = (i) => {
    if (picked !== null) return;
    setPicked(i);
    const right = i === correct;
    if (right) sfx.playCorrect(); else sfx.playWrong();
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
        <p className="fade-up delay-1" style={{ color: '#C7DBEC', fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.5 }}>{t(c.question)}</p>
        <div className="fade-up delay-1">
          <AiPromptScreen lang={lang} done={picked !== null}/>
        </div>
        <div className="fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {opts.map((o, i) => (
            <button key={i} className={`g1-tile ${picked === i && i === correct ? 'g1-tile-ok' : ''} ${picked === i && i !== correct ? 'g1-tile-used' : ''}`} disabled={picked !== null} onClick={() => pick(i)} style={{ width: '100%', fontSize: 'clamp(13px, 1.8vw, 16px)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 10 }}>
              <span className="d5p-optl">{['A', 'B', 'C'][i]}</span>
              {t(o)}
            </button>
          ))}
        </div>
        {picked !== null && (
          <FeedbackBlock show={true} isCorrect={picked === correct} wrongClass="frame-tip">
            <Reaction state={picked === correct ? 'correct' : 'wrong'} praise={t(picked === correct ? c.audio.on_correct : c.audio.on_wrong)}/>
          </FeedbackBlock>
        )}
      </div>
    </Stage>
  );
};

// PromptConsole — terminal oynasi (AiMonitor sarlavha uslubida), ichiga
// istalgan kontent joylanadi (prompt qatori, kompilyatsiya, preview).
const PromptConsole = ({ title, children }) => (
  <div className="d5p" aria-hidden="true">
    <div className="d5-mon-head">
      <span className="d5-mon-dots"><i/><i/><i/></span>
      <span className="d5-mon-title">{title}</span>
      <span className="d5-mon-live"/>
    </div>
    <div className="d5p-body">{children}</div>
  </div>
);

// s1 — PROMPT YIG'ISH: [Menga]+[yashil]+[fon o'rnat] tugmalari ketma-ket
// bosiladi, so'zlar terminalda yig'iladi ("Menga yashil fon o'rnat"), so'ng
// matn kompyuter tushunadigan #00FF00 kodiga aylanishi vizual ko'rsatiladi.
const Screen1 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s1;
  const uz = lang === 'uz';
  const audio = useAudio([{ id: 's1_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const words = [t(c.word0), t(c.word1), t(c.word2)];
  const [step, setStep] = useState(0);          // nechta so'z bosildi
  const done = step >= words.length;
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(done, 450);
  const tap = (i) => {
    if (i !== step || done) return;
    sfx.playCorrect();
    setStep((s) => s + 1);
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(done && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        {/* so'z tugmalari — navbatdagisi pulslanadi */}
        <div className="fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {words.map((w, i) => (
            <button key={i} type="button"
              className={`g1-tile ${i < step ? 'g1-tile-used' : ''} ${i === step && !done ? 'd5w-next' : ''}`}
              disabled={i !== step || done} onClick={() => tap(i)}
              style={{ fontSize: 'clamp(15px, 2.2vw, 19px)', padding: 'clamp(10px, 2vw, 14px) clamp(16px, 3vw, 24px)' }}>
              {w}
            </button>
          ))}
        </div>
        {/* terminal: prompt yig'iladi + matn -> #00FF00 kod */}
        <div className="fade-up delay-1">
          <PromptConsole title={uz ? 'AI · PROMPT TERMINALI' : 'AI · ТЕРМИНАЛ ПРОМПТА'}>
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{words.slice(0, step).join(' ')}</span>
              <span className="d5p-caret"/>
            </div>
            {done && (
              <div className="d5w-compile">
                <span className="d5w-src">"{words.join(' ')}"</span>
                <span className="d5w-flow"><i/><i/><i/><i/></span>
                <span className="d5w-hex mono">#00FF00</span>
                <span className="d5w-swatch"/>
              </div>
            )}
            <div className={`d5w-preview ${done ? 'on' : ''}`}>
              <span className="d5w-preview-label mono">{t(c.preview_label)}</span>
            </div>
          </PromptConsole>
        </div>
        {done && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// s2 — DIZAYN-BUYRUQLAR: [Okean foni 🌊] / [Kosmos foni 🚀] tugmasi bosilganda
// AI promptni "o'qiydi" va sahna dizaynini almashtiradi: okean — to'q ko'k va
// firuza (to'lqin + pufakcha + baliqlar); kosmos — binafsha va to'q kulrang
// (miltillovchi yulduzlar + sayyora + raketa). Ikkalasini ham sinash mumkin.
const S2_STARS = [[12, 18], [30, 8], [48, 26], [64, 12], [80, 28], [90, 12], [22, 58], [72, 62]];
const Screen2 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s2;
  const uz = lang === 'uz';
  const audio = useAudio([{ id: 's2_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [theme, setTheme] = useState(null);   // null | 'ocean' | 'space'
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(theme !== null, 450);
  const apply = (th) => {
    if (th === theme) return;
    sfx.playCorrect();
    setTheme(th);
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(theme && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        {/* buyruq tugmalari */}
        <div className="d5f-btns fade-up delay-1">
          <button type="button" className={`d5f-btn d5f-btn-ocean ${theme === 'ocean' ? 'sel' : ''}`} onClick={() => apply('ocean')}>
            <span className="d5f-ic" aria-hidden="true">🌊</span>{t(c.btn_ocean)}
          </button>
          <button type="button" className={`d5f-btn d5f-btn-space ${theme === 'space' ? 'sel' : ''}`} onClick={() => apply('space')}>
            <span className="d5f-ic" aria-hidden="true">🚀</span>{t(c.btn_space)}
          </button>
        </div>
        {/* terminal: yuborilgan prompt + jonli sahna */}
        <div className="fade-up delay-1">
          <PromptConsole title={uz ? 'AI · DIZAYN TIZIMI' : 'AI · ДИЗАЙН-СИСТЕМА'}>
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{theme ? t(theme === 'ocean' ? c.cmd_ocean : c.cmd_space) : ''}</span>
              <span className="d5p-caret"/>
            </div>
            <div className={`d5f-stage ${theme ? `d5f-${theme}` : ''}`}>
              {theme === 'ocean' && (
                <div className="d5f-layer" key="ocean">
                  <span className="d5f-wave d5f-wave1"/>
                  <span className="d5f-wave d5f-wave2"/>
                  <span className="d5f-bub d5f-bub1"/><span className="d5f-bub d5f-bub2"/>
                  <span className="d5f-bub d5f-bub3"/><span className="d5f-bub d5f-bub4"/>
                  <span className="d5f-fish" aria-hidden="true">🐠</span>
                  <span className="d5f-fish d5f-fish2" aria-hidden="true">🐟</span>
                </div>
              )}
              {theme === 'space' && (
                <div className="d5f-layer" key="space">
                  {S2_STARS.map(([sx, sy], i) => (
                    <span key={i} className="d5f-star" style={{ left: `${sx}%`, top: `${sy}%`, animationDelay: `${(i % 4) * 0.45}s` }}/>
                  ))}
                  <span className="d5f-planet"/>
                  <span className="d5f-rocket" aria-hidden="true">🚀</span>
                </div>
              )}
              {!theme && <span className="d5f-hint">{t(c.hint)}</span>}
            </div>
          </PromptConsole>
        </div>
        {theme && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(theme === 'ocean' ? c.done_ocean : c.done_space)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// RuleCard — qoida slaydi (s3, s6): katta sarlavha + tip + figure.
const RuleCard = ({ props, c, figure }) => {
  const t = useT();
  const audio = useAudio(makeAutoSegments(c, useLang()));
  const canGo = useCanAnswer(audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(16px, 3vw, 22px)' }}>
        <div className="frame-tip fade-up" style={{ textAlign: 'center', padding: 'clamp(20px, 4vw, 32px)' }}>
          <h1 className="title" style={{ fontSize: 'clamp(24px, 4.4vw, 38px)' }}>
            <span className="italic" style={{ color: T.accent }}>{t(c.title_part2_em)}</span>
          </h1>
        </div>
        {figure && <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(14px, 2.8vw, 22px)' }}>{figure}</div>}
        <div className="fade-up delay-2" style={{ textAlign: 'center', color: T.ink2, fontSize: 'clamp(15px, 2.1vw, 19px)', fontWeight: 600 }}>{t(c.tip)}</div>
      </div>
    </Stage>
  );
};

// s3 — QOIDA: PROMPT nima? Bit qo'lida "PROMPT" yozilgan texnik panelni
// ushlab turibdi; pastda frame-tip ichida qat'iy qoida matni.
const Screen3 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s3;
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(14px, 2.6vw, 20px)' }}>
        <h1 className="title h-sub fade-up" style={{ textAlign: 'center' }}>
          <span className="italic" style={{ color: T.accent }}>{t(c.title_part2_em)}</span>
        </h1>
        {/* Bit "PROMPT" panelini ushlab turibdi */}
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(16px, 3vw, 26px)' }}>
          <div className="d5r-fig" aria-hidden="true">
            <BitSVG state="present" className="d5r-bit"/>
            <div className="d5r-panel">
              <span className="d5r-title mono">PROMPT</span>
              <span className="d5r-line" style={{ width: '88%' }}/>
              <span className="d5r-line d5r-line-g" style={{ width: '64%' }}/>
              <span className="d5r-line" style={{ width: '76%' }}/>
              <span className="d5r-line d5r-line-o" style={{ width: '52%' }}/>
            </div>
          </div>
        </div>
        {/* qat'iy qoida */}
        <div className="frame-tip fade-up delay-2" style={{ padding: 'clamp(16px, 3vw, 24px)', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(15px, 2.2vw, 19px)', lineHeight: 1.6, color: T.ink }}>{t(c.rule)}</p>
          <p style={{ margin: '10px 0 0', fontWeight: 600, fontSize: 'clamp(13px, 1.9vw, 16px)', color: T.ink2 }}>{t(c.tip)}</p>
        </div>
      </div>
    </Stage>
  );
};

// s4 — TEST (baholi): aniq prompt tanlash. Ekranda qizil olma; to'g'ri = B
// (tafsilotli prompt). Vedi-do-vernogo: xato variant o'chadi, bola to'g'risini
// topguncha davom etadi; birinchi urinish natijasi ballga yoziladi.
const Screen4 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s4;
  const audio = useAudio([{ id: 's4_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const canAns = useCanAnswer(audio);
  const correct = 1;
  const wasSolved = props.storedAnswer?.solved === true;
  const [solved, setSolved] = useState(wasSolved);
  const [wrongSet, setWrongSet] = useState(() => new Set());
  const firstRef = useRef(props.storedAnswer ? (props.storedAnswer.firstTry ?? null) : null);
  const attemptsRef = useRef(props.storedAnswer?.attempts ?? 0);
  const pick = (i) => {
    if (!canAns || solved || wrongSet.has(i)) return;
    attemptsRef.current += 1;
    const right = i === correct;
    if (firstRef.current === null) firstRef.current = right;
    if (right) {
      setSolved(true);
      sfx.playCorrect();
      props.onAnswer({ stage: SCREEN_META[props.screen]?.scope ?? null, screenIdx: props.screen, correct: firstRef.current, firstTry: firstRef.current, attempts: attemptsRef.current, solved: true });
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_correct[lang]); }
    } else {
      sfx.playWrong();
      setWrongSet((prev) => { const n = new Set(prev); n.add(i); return n; });
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_wrong[lang]); }
    }
  };
  const canAdv = useAdvanceGate(solved, audio);
  const opts = [c.opt0, c.opt1];
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canAdv} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2.4vw, 18px)' }}>
        <h1 className="title h-sub fade-up">{t(c.question)}</h1>
        {/* maqsad: aynan mana shu qizil olma */}
        <div className="frame fade-up delay-1" style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(14px, 2.8vw, 22px)' }}>
          <div className="d5a-apple" aria-hidden="true"><ObjSvg kind="apple"/></div>
        </div>
        <div className="fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {opts.map((o, i) => (
            <button key={i}
              className={`g1-tile ${solved && i === correct ? 'g1-tile-ok' : ''} ${wrongSet.has(i) || (solved && i !== correct) ? 'g1-tile-used' : ''}`}
              disabled={!canAns || solved || wrongSet.has(i)} onClick={() => pick(i)}
              style={{ width: '100%', fontSize: 'clamp(13px, 1.8vw, 16px)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 10 }}>
              <span className="d5p-optl">{['A', 'B'][i]}</span>
              {t(o)}
            </button>
          ))}
        </div>
        {(solved || wrongSet.size > 0) && (
          <FeedbackBlock show={true} isCorrect={solved} wrongClass="frame-tip">
            <Reaction state={solved ? 'correct' : 'wrong'} praise={t(solved ? c.audio.on_correct : c.audio.on_wrong)}/>
          </FeedbackBlock>
        )}
      </div>
    </Stage>
  );
};

// StyleCatSvg — s5 mushugi: look=null (neytral oq) | 'black' (+ko'zoynak) | 'yellow' (+kepka).
const CAT_LOOKS = {
  base:   { fur: '#F2F0EA', inner: '#FFB9C8', line: '#8B8B93' },
  black:  { fur: '#33333C', inner: '#FF9BB0', line: '#D8D8DE' },
  yellow: { fur: '#F6C445', inner: '#FF9BB0', line: '#7A6A3A' },
};
const StyleCatSvg = ({ look }) => {
  const L = CAT_LOOKS[look || 'base'];
  return (
    <svg viewBox="0 0 100 100" className="d5c-cat" aria-hidden="true">
      {/* dum */}
      <path d="M78 74 Q95 70 92 52 Q90 42 82 44" stroke={L.fur} strokeWidth="7" fill="none" strokeLinecap="round"/>
      {/* tana */}
      <ellipse cx="50" cy="72" rx="24" ry="18" fill={L.fur}/>
      {/* quloqlar */}
      <path d="M32 34 L28 14 L46 27 Z" fill={L.fur}/>
      <path d="M68 34 L72 14 L54 27 Z" fill={L.fur}/>
      <path d="M33 30 L31 20 L41 27 Z" fill={L.inner}/>
      <path d="M67 30 L69 20 L59 27 Z" fill={L.inner}/>
      {/* bosh */}
      <circle cx="50" cy="44" r="20" fill={L.fur}/>
      {/* ko'zlar (qora lukda ko'zoynak yopadi) */}
      {look !== 'black' && (
        <>
          <ellipse cx="42" cy="43" rx="3.4" ry="4.4" fill="#22303A"/>
          <ellipse cx="58" cy="43" rx="3.4" ry="4.4" fill="#22303A"/>
          <circle cx="43" cy="41.5" r="1" fill="#fff"/><circle cx="59" cy="41.5" r="1" fill="#fff"/>
        </>
      )}
      {/* burun + og'iz */}
      <path d="M47 50 L53 50 L50 53 Z" fill="#FF7A9A"/>
      <path d="M50 53 Q46 57 42 55 M50 53 Q54 57 58 55" stroke={L.line} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* mo'ylov */}
      <g stroke={L.line} strokeWidth="1.1" strokeLinecap="round">
        <path d="M40 50 L24 47 M40 53 L25 54 M60 50 L76 47 M60 53 L75 54"/>
      </g>
      {/* aksessuar: qora ko'zoynak */}
      {look === 'black' && (
        <g className="d5c-acc">
          <path d="M35 42 L29 39 M65 42 L71 39" stroke="#5BD6F2" strokeWidth="1.6" strokeLinecap="round"/>
          <rect x="35" y="37" width="14" height="11" rx="5" fill="#14161C" stroke="#5BD6F2" strokeWidth="1.4"/>
          <rect x="51" y="37" width="14" height="11" rx="5" fill="#14161C" stroke="#5BD6F2" strokeWidth="1.4"/>
          <path d="M49 42 Q50 40.5 51 42" stroke="#5BD6F2" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          <path d="M38 40.5 L43 40.5 M54 40.5 L59 40.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
        </g>
      )}
      {/* aksessuar: qizil kepka */}
      {look === 'yellow' && (
        <g className="d5c-acc">
          <path d="M33 32 Q33 14 50 13 Q67 14 67 32 Q50 25 33 32 Z" fill="#E24A3B"/>
          <path d="M63 29 Q80 26 85 33 Q76 39 62 35 Z" fill="#C03A2E"/>
          <circle cx="50" cy="13" r="2.6" fill="#FFD34D"/>
          <path d="M50 13 Q50 22 50 27" stroke="#C03A2E" strokeWidth="1.4" fill="none"/>
        </g>
      )}
    </svg>
  );
};

// s5 — OB'EKT TAHRIRI: ekranda neytral oq mushuk; bola ikkita promptdan birini
// yuboradi va AI mushukning rangi hamda aksessuarlarini jonli almashtiradi.
const Screen5 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s5;
  const uz = lang === 'uz';
  const audio = useAudio([{ id: 's5_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [look, setLook] = useState(null);   // null | 'black' | 'yellow'
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(look !== null, 450);
  const apply = (lk) => {
    if (lk === look) return;
    sfx.playCorrect();
    setLook(lk);
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(look && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        {/* prompt tugmalari */}
        <div className="d5f-btns fade-up delay-1">
          <button type="button" className={`d5f-btn d5f-btn-cblack ${look === 'black' ? 'sel' : ''}`} onClick={() => apply('black')}>
            <span className="d5f-ic" aria-hidden="true">🕶</span>{t(c.btn_black)}
          </button>
          <button type="button" className={`d5f-btn d5f-btn-cyellow ${look === 'yellow' ? 'sel' : ''}`} onClick={() => apply('yellow')}>
            <span className="d5f-ic" aria-hidden="true">🧢</span>{t(c.btn_yellow)}
          </button>
        </div>
        {/* terminal: yuborilgan prompt + jonli mushuk */}
        <div className="fade-up delay-1">
          <PromptConsole title={uz ? 'AI · RASM TAHRIRI' : 'AI · РЕДАКТОР КАРТИНКИ'}>
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{look ? t(look === 'black' ? c.btn_black : c.btn_yellow) : ''}</span>
              <span className="d5p-caret"/>
            </div>
            <div className={`d5f-stage ${look ? `d5c-${look}` : ''}`}>
              <StyleCatSvg key={look || 'base'} look={look}/>
              {!look && <span className="d5f-hint d5c-hint">{t(c.hint)}</span>}
            </div>
          </PromptConsole>
        </div>
        {look && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(look === 'black' ? c.done_black : c.done_yellow)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// s6 — PROMPTNI YIG' (tartib): 3 bo'sh uya + 3 chip [A: Rasm][B: Yarat][C: Kosmos].
// To'g'ri ketma-ketlik: Kosmos -> Rasm -> Yarat ("vedi do vernogo": xato chip
// silkinib joyida qoladi). Hammasi joylashgach AI kosmos rasmini "yaratadi".
const S6_TAGS = ['A', 'B', 'C'];
const Screen6 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s6;
  const uz = lang === 'uz';
  const audio = useAudio([{ id: 's6_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const chips = c.chips[lang];
  const order = c.order[lang];
  const [placed, setPlaced] = useState(0);        // nechta uya to'ldi
  const [shakeIdx, setShakeIdx] = useState(null);
  const done = placed >= chips.length;
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(done, 450);
  const usedSet = new Set(order.slice(0, placed));
  const tap = (i) => {
    if (done || usedSet.has(i)) return;
    if (i === order[placed]) {
      sfx.playCorrect();
      setPlaced((p) => p + 1);
    } else {
      sfx.playWrong();
      setShakeIdx(i);
      setTimeout(() => setShakeIdx(null), 500);
    }
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(done && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        {/* terminal: uyalar + yig'ilayotgan prompt + tayyor rasm */}
        <div className="fade-up delay-1">
          <PromptConsole title={uz ? "AI · PROMPT YIG'UVCHI" : 'AI · СБОРЩИК ПРОМПТА'}>
            <div className="d5o-slots">
              {order.map((chipIdx, k) => (
                <span key={k} className={`d5o-slot ${k < placed ? 'full' : ''}`}>
                  {k < placed ? chips[chipIdx] : k + 1}
                </span>
              ))}
            </div>
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{order.slice(0, placed).map((i) => chips[i]).join(' ')}</span>
              <span className="d5p-caret"/>
            </div>
            {done && (
              <div className="d5f-stage d5f-space" style={{ minHeight: 'clamp(110px, 20vw, 160px)' }}>
                <div className="d5f-layer">
                  {S2_STARS.map(([sx, sy], i) => (
                    <span key={i} className="d5f-star" style={{ left: `${sx}%`, top: `${sy}%`, animationDelay: `${(i % 4) * 0.45}s` }}/>
                  ))}
                  <span className="d5f-planet"/>
                  <span className="d5f-rocket" aria-hidden="true">🚀</span>
                </div>
                <span className="d5o-made mono">{t(c.made_label)}</span>
              </div>
            )}
          </PromptConsole>
        </div>
        {/* prompt chiplari */}
        <div className="d5o-chips fade-up delay-1">
          {chips.map((w, i) => (
            <button key={i} type="button"
              className={`g1-tile d5o-chip ${usedSet.has(i) ? 'used' : ''} ${shakeIdx === i ? 'shake' : ''}`}
              disabled={done || usedSet.has(i)} onClick={() => tap(i)}>
              <span className="d5o-tag">{S6_TAGS[i]}</span>{w}
            </button>
          ))}
        </div>
        {done && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// RoomSvg — s7 xona maketi: devor/pol, deraza, torsher, stol. Promptlarga
// qarab devor silliq yashil bo'ladi, chiroq glow beradi, stolga kitob va
// polga gilam "pop" bilan qo'shiladi.
const RoomSvg = ({ wall, lamp, book, rug }) => (
  <svg viewBox="0 0 220 130" className={`d5m-room ${wall ? 'on-wall' : ''} ${lamp ? 'on-lamp' : ''}`} aria-hidden="true">
    <defs>
      <radialGradient id="d5mGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFE9A8" stopOpacity="0.95"/>
        <stop offset="100%" stopColor="#FFE9A8" stopOpacity="0"/>
      </radialGradient>
    </defs>
    {/* devor + pol */}
    <rect className="d5m-wall" x="0" y="0" width="220" height="97"/>
    <rect x="0" y="97" width="220" height="33" fill="#C9B492"/>
    <rect x="0" y="95" width="220" height="3" fill="#B39F7C"/>
    {/* deraza */}
    <rect x="18" y="16" width="46" height="36" rx="3" fill="#BBDFF5" stroke="#FFFFFF" strokeWidth="3"/>
    <path d="M41 16 V52 M18 34 H64" stroke="#FFFFFF" strokeWidth="2.4"/>
    {/* gilam */}
    {rug && (
      <g className="d5m-pop">
        <ellipse cx="112" cy="112" rx="46" ry="11" fill="#C0563F"/>
        <ellipse cx="112" cy="112" rx="34" ry="7.6" fill="none" stroke="#E8A28F" strokeWidth="2" strokeDasharray="6 4"/>
      </g>
    )}
    {/* stol */}
    <rect x="80" y="74" width="64" height="7" rx="3" fill="#8A5A33"/>
    <rect x="86" y="81" width="5" height="24" fill="#7A4E2B"/>
    <rect x="133" y="81" width="5" height="24" fill="#7A4E2B"/>
    {/* kitoblar */}
    {book && (
      <g className="d5m-pop">
        <rect x="98" y="68" width="24" height="5.5" rx="1.5" fill="#D9534F"/>
        <rect x="101" y="63" width="20" height="5.5" rx="1.5" fill="#4C90E6"/>
        <path d="M99 70.5 H121 M102 65.5 H120" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
      </g>
    )}
    {/* torsher */}
    <ellipse cx="182" cy="104" rx="12" ry="3.4" fill="#5A5148"/>
    <rect x="180.6" y="52" width="3" height="52" fill="#6B6157"/>
    <ellipse className="d5m-glow" cx="182" cy="46" rx="36" ry="32" fill="url(#d5mGlow)"/>
    <path className="d5m-shade" d="M168 52 L172 32 H192 L196 52 Z"/>
    <circle className="d5m-bulb" cx="182" cy="49" r="3"/>
    {/* chiroq yoqilganda butun xonaga iliq tus */}
    <rect className="d5m-warm" x="0" y="0" width="220" height="130" fill="#FFC96B"/>
  </svg>
);

// s7 — AMALIY (drill): tokchadagi 4 prompt chipi ketma-ket xonaga yuboriladi:
// devor yashil -> chiroq glow -> stolga kitob -> polga gilam. Navbatdagi chip
// pulslanadi, yuborilgani xiralashadi; hammasi bajarilgach maqtov.
const S7_CHIPS = [
  { key: 'wall', label: 'chip_wall' },
  { key: 'lamp', label: 'chip_lamp' },
  { key: 'book', label: 'chip_book' },
  { key: 'rug',  label: 'chip_rug' },
];
const Screen7 = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.s7;
  const uz = lang === 'uz';
  const audio = useAudio([{ id: 's7_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const sfx = useSfx();
  const [step, setStep] = useState(0);      // nechta prompt yuborildi
  const done = step >= S7_CHIPS.length;
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(done, 450);
  const send = (i) => {
    if (i !== step || done) return;
    sfx.playCorrect();
    setStep((s) => s + 1);
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(done && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        {/* terminal: oxirgi prompt + jonli xona */}
        <div className="fade-up delay-1">
          <PromptConsole title={uz ? 'AI · XONA DIZAYNI' : 'AI · ДИЗАЙН КОМНАТЫ'}>
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{step > 0 ? t(c[S7_CHIPS[step - 1].label]) : ''}</span>
              <span className="d5p-caret"/>
            </div>
            <div className="d5f-stage" style={{ padding: 'clamp(8px, 1.6vw, 12px)' }}>
              <RoomSvg wall={step > 0} lamp={step > 1} book={step > 2} rug={step > 3}/>
            </div>
          </PromptConsole>
        </div>
        {/* prompt tokchasi */}
        <div className="d5m-shelf fade-up delay-1">
          <span className="d5m-shelf-label mono">{t(c.shelf_label)}</span>
          <div className="d5m-chips">
            {S7_CHIPS.map((ch, i) => (
              <button key={ch.key} type="button"
                className={`g1-tile d5o-chip d5m-chip ${i < step ? 'used' : ''} ${i === step && !done ? 'd5w-next' : ''}`}
                disabled={i !== step || done} onClick={() => send(i)}>
                {t(c[ch.label])}
              </button>
            ))}
          </div>
        </div>
        {done && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// SunoLogo — marjon-binafsha gradient yumaloq kvadrat ichida oq ekvalayzer.
const SunoLogo = () => (
  <svg viewBox="0 0 64 64" className="d5s-logo" aria-hidden="true">
    <defs>
      <linearGradient id="d5sSun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FF7A59"/>
        <stop offset="100%" stopColor="#8E5DBF"/>
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="52" height="52" rx="15" fill="url(#d5sSun)"/>
    <g fill="#FFFFFF">
      <rect x="17" y="26" width="5" height="12" rx="2.5"/>
      <rect x="26" y="18" width="5" height="28" rx="2.5"/>
      <rect x="35" y="22" width="5" height="20" rx="2.5"/>
      <rect x="44" y="28" width="5" height="8" rx="2.5"/>
    </g>
  </svg>
);

// d5sPlayMelody — janrga mos qisqa ohang (WebAudio, tashqi audio faylsiz).
// 'rap': kik + snare + hi-hat + bas chizig'i; 'space': yumshoq pad-arpejio.
// Davomiylikni (soniya) qaytaradi — ekvalayzer shuncha vaqt jonlanadi.
let d5sMusCtx = null;
function d5sPlayMelody(kind) {
  try {
    if (typeof window === 'undefined') return 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return 0;
    try { if (d5sMusCtx) d5sMusCtx.close(); } catch (e) { /* no-op */ }
    const ctx = new AC();
    d5sMusCtx = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.06;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const noise = (t, dur, vol, hp) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master); src.start(t);
    };
    if (kind === 'rap') {
      const step = 0.16, steps = 16;
      for (let i = 0; i < steps; i++) {
        const t = t0 + i * step;
        if (i % 4 === 0) {          // kik
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(150, t);
          o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          g.gain.setValueAtTime(0.9, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
        }
        if (i % 8 === 4) noise(t, 0.09, 0.35, 1400);   // snare
        noise(t, 0.03, 0.07, 6000);                     // hi-hat
      }
      const bass = [110, 110, 130.8, 146.8];            // A2 A2 C3 D3
      bass.forEach((f, k) => {
        const t = t0 + k * step * 4;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + step * 3.4);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + step * 3.6);
      });
      return steps * step + 0.3;
    }
    // 'space' — sokin kosmik pad-arpejio + shimmer
    const chord = [220, 277.2, 329.6, 440];             // A3 C#4 E4 A4
    chord.forEach((f, k) => {
      const t = t0 + k * 0.55;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.5);
    });
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(880, t0);
    o2.frequency.linearRampToValueAtTime(1174.7, t0 + 3.2);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(0.05, t0 + 1);
    g2.gain.exponentialRampToValueAtTime(0.001, t0 + 3.6);
    o2.connect(g2); g2.connect(master); o2.start(t0); o2.stop(t0 + 3.7);
    return 4.0;
  } catch (e) { return 0; }
}

// sQm — TEST (kartochkali MC): promptdan musiqa bastalaydigan AI qaysi?
// Ikkita yirik oq vizual kartochka (sQg dizayn-standarti): Gamma AI va Suno AI.
// Vedi-do-vernogo: xato silkinib xiralashadi, to'g'risi (Suno) yashil ochiladi.
const QM_CARDS = [
  { key: 'gam', name: 'Gamma AI', Logo: GammaLogo },
  { key: 'sun', name: 'Suno AI',  Logo: SunoLogo },
];
const QM_CORRECT = 1;
const ScreenQm = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sQm;
  const sfx = useSfx();
  const audio = useAudio([{ id: 'sqm_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: { type: 'option_picked' } }]);
  const canAns = useCanAnswer(audio);
  const wasSolved = props.storedAnswer?.solved === true || props.storedAnswer?.correct === true;
  const [solved, setSolved] = useState(wasSolved);
  const [picked, setPicked] = useState(wasSolved ? QM_CORRECT : null);
  const [wrongSet, setWrongSet] = useState(() => new Set());
  const [shakeIdx, setShakeIdx] = useState(null);
  const firstTryRef = useRef(props.storedAnswer ? (props.storedAnswer.firstTry ?? props.storedAnswer.correct ?? null) : null);
  const firstIdxRef = useRef(props.storedAnswer?.studentAnswerIndex ?? null);
  const attemptsRef = useRef(props.storedAnswer?.attempts ?? (wasSolved ? 1 : 0));
  const introAdvRef = useRef(wasSolved);
  const doneRef = useRevealScroll(picked !== null, 450);
  const pick = (i) => {
    if (!canAns || solved || wrongSet.has(i)) return;
    if (firstTryRef.current === null) { firstTryRef.current = i === QM_CORRECT; firstIdxRef.current = i; }
    attemptsRef.current += 1;
    setPicked(i);
    if (!introAdvRef.current) { introAdvRef.current = true; audio.triggerEvent('option_picked'); }
    if (i === QM_CORRECT) {
      setSolved(true);
      sfx.playCorrect();
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_correct[lang]); }
      props.onAnswer({
        stage: SCREEN_META[props.screen]?.scope ?? null,
        screenIdx: props.screen,
        question: c.title.ru,
        options: QM_CARDS.map((x) => x.name),
        correctIndex: QM_CORRECT,
        correctAnswer: QM_CARDS[QM_CORRECT].name,
        studentAnswerIndex: firstIdxRef.current,
        studentAnswer: QM_CARDS[firstIdxRef.current]?.name ?? null,
        correct: firstTryRef.current,
        firstTry: firstTryRef.current,
        attempts: attemptsRef.current,
        solved: true
      });
    } else {
      sfx.playWrong();
      setWrongSet((s) => new Set(s).add(i));
      setShakeIdx(i);
      setTimeout(() => setShakeIdx(null), 500);
      if (!audio.muted) { const e = getAudioEngine(); if (e) e.pushOneOff(c.audio.on_wrong[lang]); }
    }
  };
  const canAdv = useAdvanceGate(solved, audio);
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canAdv} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(14px, 2.6vw, 20px)' }}>
        <h1 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.title)}</h1>
        <div className="d5q-cards fade-up delay-1">
          {QM_CARDS.map(({ key, name, Logo }, i) => (
            <button key={key} type="button"
              className={`d5q-card ${solved && i === QM_CORRECT ? 'ok' : ''} ${wrongSet.has(i) || (solved && i !== QM_CORRECT) ? 'off' : ''} ${shakeIdx === i ? 'shake' : ''}`}
              disabled={!canAns || solved || wrongSet.has(i)} onClick={() => pick(i)}>
              <Logo/>
              <span className="d5g-name">{name}</span>
              {!solved && !wrongSet.has(i) && <span className="d5g-tap">{t(c.tap_hint)} 👆</span>}
            </button>
          ))}
        </div>
        {picked !== null && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={solved} wrongClass="frame-tip">
              <Reaction state={solved ? 'correct' : 'wrong'} praise={t(solved ? c.correct_text : c.wrong_default)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// sMus — AI MUSIQASI: Suno pleyeri. Bola tayyor prompt tugmalarini bosadi
// ([Rep 🎤] / [Kosmik sokin 🪐]) — janrga mos qisqa ohang yangraydi va
// ekvalayzer jonlanadi. AI matnni musiqaga o'girishini his qiladi.
const ScreenMus = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sMus;
  const audio = useAudio([{ id: 'smus_intro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const [genre, setGenre] = useState(null);       // null | 'rap' | 'space'
  const [playing, setPlaying] = useState(false);
  const playedRef = useRef(false);
  const [anyPlayed, setAnyPlayed] = useState(false);
  const timerRef = useRef(null);
  const canGo = useCanAnswer(audio);
  const doneRef = useRevealScroll(anyPlayed, 450);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try { if (d5sMusCtx) { d5sMusCtx.close(); d5sMusCtx = null; } } catch (e) { /* no-op */ }
  }, []);
  const play = (kind) => {
    if (!canGo) return;
    setGenre(kind);
    const dur = d5sPlayMelody(kind);
    setPlaying(dur > 0);
    if (!playedRef.current) { playedRef.current = true; setAnyPlayed(true); }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dur > 0) timerRef.current = setTimeout(() => setPlaying(false), dur * 1000);
  };
  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!(anyPlayed && canGo)} onClick={props.onNext} label={<NextLabel/>}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(12px, 2.2vw, 16px)' }}>
        <h2 className="title h-sub fade-up" style={{ textAlign: 'center' }}>{t(c.instruction)}</h2>
        <div className="d5s-wrap fade-up delay-1">
          {/* Suno logotipi pleyer ustida */}
          <div className="d5s-head">
            <SunoLogo/>
            <span className="d5s-brand">Suno AI</span>
          </div>
          {/* pleyer */}
          <div className="d5s-player">
            <div className="d5p-promptrow">
              <span className="d5p-gt">&gt;</span>
              <span className="d5w-line">{genre ? t(genre === 'rap' ? c.btn_rap : c.btn_space) : ''}</span>
              <span className="d5p-caret"/>
            </div>
            <div className="d5s-screen">
              {genre ? (
                <div className={`d5s-eq ${playing ? 'on' : ''}`}>
                  {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 5) * 0.09}s` }}/>)}
                </div>
              ) : (
                <span className="d5f-hint">{t(c.hint)}</span>
              )}
              {genre && playing && <span className="d5s-status mono">▶ {t(c.playing_label)}</span>}
            </div>
          </div>
          {/* prompt tugmalari */}
          <div className="d5f-btns">
            <button type="button" className={`d5f-btn d5f-btn-rap ${genre === 'rap' ? 'sel' : ''}`} onClick={() => play('rap')}>
              {t(c.btn_rap)}
            </button>
            <button type="button" className={`d5f-btn d5f-btn-space ${genre === 'space' ? 'sel' : ''}`} onClick={() => play('space')}>
              {t(c.btn_space)}
            </button>
          </div>
        </div>
        {anyPlayed && (
          <div ref={doneRef}>
            <FeedbackBlock show={true} isCorrect={true}>
              <Reaction state="correct" praise={t(c.done_text)}/>
            </FeedbackBlock>
          </div>
        )}
      </div>
    </Stage>
  );
};

// ============================================================
// sFin — YAKUNIY NATIJALAR (15-sahifa): tepada 3 oltin reyting yulduzi
// sakrab chiqadi (pop-in), havodan AI logolari (ChatGPT/Gemini/Claude/
// Gamma/Canva/Suno) sekin yog'ilib turadi. Markazda oq "frame" panel —
// loyiha statistikasi (birinchi urinishda to'g'ri / xatolar / davomiylik).
// Pastda Bit + AI mini-ekrani xursand tebranadi (idle-bob). O'ng pastda
// "Loyihani yakunlash" tugmasi finishLesson'ni chaqiradi.
// ============================================================

// Oltin reyting yulduzi (gradient + porloq soya).
const FinStar = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="d5finGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFE27A"/>
        <stop offset="55%" stopColor="#FFC23C"/>
        <stop offset="100%" stopColor="#F5A623"/>
      </linearGradient>
    </defs>
    <path d="M32 4 L40.8 22.4 L61 25.2 L46.4 39.3 L50 59.4 L32 49.8 L14 59.4 L17.6 39.3 L3 25.2 L23.2 22.4 Z"
      fill="url(#d5finGold)" stroke="#D8891A" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M32 12 L37.4 23.6 L50 25.4 L40.8 34.2 L43 46.8 L32 40.8 Z" fill="rgba(255,255,255,0.35)"/>
  </svg>
);

// Havodan tushib turadigan AI logolari (dekor, pointer-events yo'q).
const FIN_DROPS = [
  { Logo: GptLogo,    left: '4%',  delay: 0,   dur: 8.5 },
  { Logo: GeminiLogo, left: '15%', delay: 3.2, dur: 9.6 },
  { Logo: ClaudeLogo, left: '27%', delay: 6.1, dur: 8.0 },
  { Logo: GammaLogo,  left: '43%', delay: 1.6, dur: 10.2 },
  { Logo: CanvaLogo,  left: '58%', delay: 4.7, dur: 8.8 },
  { Logo: SunoLogo,   left: '72%', delay: 0.9, dur: 9.2 },
  { Logo: GptLogo,    left: '86%', delay: 5.5, dur: 8.2 },
  { Logo: GeminiLogo, left: '94%', delay: 2.4, dur: 10.6 },
];
const FinRain = () => (
  <div className="d5fin-rain" aria-hidden="true">
    {FIN_DROPS.map(({ Logo, left, delay, dur }, i) => (
      <span key={i} className="d5fin-drop" style={{ left, animationDelay: `${delay}s`, animationDuration: `${dur}s` }}>
        <Logo/>
      </span>
    ))}
  </div>
);

// AI mini-ekrani — xursand yuz + "LOYIHA TAYYOR" holati.
const FinMonitor = ({ lang }) => (
  <div className="d5fin-mon" aria-hidden="true">
    <div className="d5-mon-head">
      <span className="d5-mon-dots"><i/><i/><i/></span>
      <span className="d5-mon-title">AI</span>
      <span className="d5-mon-live"/>
    </div>
    <div className="d5fin-mon-body">
      <span className="d5fin-face mono">^‿^</span>
      <span className="d5fin-mon-txt mono">{lang === 'uz' ? 'LOYIHA TAYYOR' : 'ПРОЕКТ ГОТОВ'} ✓</span>
    </div>
  </div>
);

const ScreenFin = (props) => {
  const lang = useLang();
  const t = useT();
  const c = CONTENT.sFin;
  const audio = useAudio([{ id: 'sfin_outro', text: c.audio.intro[lang], trigger: 'on_mount', waits_for: null }]);
  const canGo = useCanAnswer(audio);
  useHero('none'); // Bit sahnaning o'zida — burchakdagi overlay dublni yashiramiz

  // Statistika javoblar tarixidan: firstTry=true — birinchi urinishda to'g'ri;
  // xatolar = har topshiriqdagi (attempts - 1), chunki oxirgi urinish doim to'g'ri.
  const graded = (props.answers || []).filter(a => a && typeof a.firstTry === 'boolean');
  const correctCount = graded.filter(a => a.firstTry === true).length;
  const wrongCount = graded.reduce((s, a) => s + Math.max(0, (a.attempts ?? 1) - 1), 0);
  // Davomiylik bir marta, ekran ochilganda o'lchanadi (render'da qayta hisoblanmaydi).
  const [durationMin] = useState(() => Math.max(1, Math.round((Date.now() - (props.startTime || Date.now())) / 60000)));

  const stats = [
    { key: 'ok',   icon: '🟢', label: c.stat_ok,   sub: c.stat_ok_sub,  value: `${correctCount} ${t(c.unit_pc)}`.trim() },
    { key: 'err',  icon: '🔴', label: c.stat_err,  sub: c.stat_err_sub, value: `${wrongCount} ${t(c.unit_pc)}`.trim() },
    { key: 'time', icon: '⏱', label: c.stat_time, sub: null,           value: `${durationMin} ${t(c.unit_min)}` },
  ];

  const navContent = (
    <>
      <NavBack onPrev={props.onPrev} label={<BackLabel/>}/>
      <NavNext disabled={!canGo} onClick={props.finishLesson} label={t(c.finish_btn)}/>
    </>
  );
  return (
    <Stage eyebrow={c.eyebrow} screen={props.screen} totalScreens={TOTAL_SCREENS} navContent={navContent} audioState={audio}>
      <div className="d5fin-wrap">
        <FinRain/>
        {/* 3 oltin reyting yulduzi — birma-bir sakrab chiqadi */}
        <div className="d5fin-stars" aria-hidden="true">
          <span className="d5fin-star d5fin-star1"><FinStar/></span>
          <span className="d5fin-star d5fin-star2"><FinStar/></span>
          <span className="d5fin-star d5fin-star3"><FinStar/></span>
        </div>
        {/* natijalar paneli */}
        <div className="frame d5fin-panel fade-up delay-2">
          <h2 className="title d5fin-title">{t(c.title)}</h2>
          <div className="d5fin-stats">
            {stats.map(({ key, icon, label, sub, value }) => (
              <div key={key} className="d5fin-stat">
                <span className="d5fin-stat-icon" aria-hidden="true">{icon}</span>
                <div className="d5fin-stat-body">
                  <span className="d5fin-stat-label">{t(label)}</span>
                  {sub && <span className="d5fin-stat-sub">{t(sub)}</span>}
                </div>
                <span className="d5fin-stat-val mono">{value}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Bit + AI ekrani — xursand, yengil tebranib turadi */}
        <div className="d5fin-cast fade-up delay-3">
          <div className="d5fin-bob"><BitSVG state="happy" className="d5fin-bit"/></div>
          <div className="d5fin-bob d5fin-bob2"><FinMonitor lang={lang}/></div>
        </div>
      </div>
    </Stage>
  );
};

export default function AiLesson({
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

  const screens = [ScreenIntro, Screen0, ScreenAis, Screen1, ScreenDes, Screen2, ScreenQg, Screen3, Screen4, Screen5, Screen6, Screen7, ScreenQm, ScreenMus, ScreenFin];
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
      <div className={`lesson-root d5cy${current === 0 ? ' d5cy-lite' : ''}`}>
        <GradientDefs/>
        <HouseDefs/>
        <AmbientBg/>
        <CyberRain/>
        <StageHero mood={heroMood}/>
        {isPreview && (
          <div className="d5lang">
            {['ru', 'uz'].map(l => (
              <button key={l} onClick={() => setPreviewLang(l)} className={`d5lang-btn${previewLang === l ? ' on' : ''}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <CurrentScreen screen={current} studentName={safeName} storedAnswer={answers[current]} answers={answers} startTime={startTimeRef.current} onAnswer={handleAnswer} onNext={next} onPrev={prev} onReset={reset} finishLesson={finishLesson}/>
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

/* ============================================================
   === Dars05 — AI vizuallari (rasm kartochkalari / meter / skan / sarala / o'yin) ===
   ============================================================ */

/* --- Hikoya sahnasi (AiStory) --- */
.ai-scene { position: relative; width: 100%; min-height: clamp(190px, 42vw, 300px); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.ai-labbg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
.ai-hero-bit { position: relative; z-index: 2; height: clamp(120px, 26vw, 190px); margin-bottom: -6px; opacity: 0; transform: translateY(14px) scale(0.9); transition: opacity 0.5s ease, transform 0.5s ease; animation: g1bitfloat 3.4s ease-in-out infinite; }
.ai-hero-bit.in { opacity: 1; transform: translateY(0) scale(1); }
.ai-hero-bitsvg { height: 100%; width: auto; }
.ai-cast-row { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: center; gap: clamp(26px, 9vw, 70px); padding-bottom: clamp(8px, 2.2vw, 16px); }
.ai-scene .g1-cast-fig { height: clamp(92px, 21vw, 150px); }
.ai-scene-sum { min-height: clamp(150px, 30vw, 220px); }
.ai-reallife { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(8px, 2vw, 14px); margin-top: clamp(10px, 2vw, 14px); opacity: 0; transform: translateY(8px); transition: opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s; }
.ai-reallife.in { opacity: 1; transform: translateY(0); }
.ai-rl-item { display: flex; align-items: center; gap: 8px; background: #EAF6FB; border: 1px solid rgba(1,154,203,0.28); border-radius: 99px; padding: clamp(7px,1.4vw,10px) clamp(12px,2.4vw,18px); font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(12px,1.7vw,15px); color: #0E0E10; }
.ai-rl-ic { font-size: clamp(16px,2.6vw,22px); line-height: 1; }

/* --- Rasm SVG + kartochka --- */
.ai-pic-svg { width: 100%; height: 100%; display: block; }
.ai-card { -webkit-appearance: none; appearance: none; border: 2px solid transparent; background: #FFFFFF; border-radius: 16px; padding: clamp(6px,1.4vw,10px); display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: default; box-shadow: 0 6px 16px -8px rgba(58,53,48,0.28); transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s, background 0.2s; }
.ai-card[disabled] { cursor: default; }
.ai-card-pic { position: relative; width: clamp(56px, 15vw, 86px); height: clamp(56px, 15vw, 86px); overflow: hidden; border-radius: 12px; }
.ai-card-md .ai-card-pic { width: clamp(56px, 15vw, 86px); height: clamp(56px, 15vw, 86px); }
.ai-card-label { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(11px,1.6vw,14px); color: #5A5A60; }
.ai-card-next { border-color: #FF4F28; cursor: pointer; animation: aiPulse 1.4s ease-in-out infinite; }
.ai-card-next:hover { transform: translateY(-3px); }
.ai-card-on { border-color: #1F7A4D; background: #E3F0E8; }
.ai-card-ok { border-color: #1F7A4D; }
.ai-card-x { border-color: #FF4F28; }
.ai-picrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: clamp(8px, 2vw, 14px); }
@keyframes aiPulse { 0%,100% { box-shadow: 0 6px 16px -8px rgba(255,79,40,0.3), 0 0 0 0 rgba(255,79,40,0.35); } 50% { box-shadow: 0 8px 20px -6px rgba(255,79,40,0.5), 0 0 0 6px rgba(255,79,40,0); } }

/* skan chizig'i + belgilar */
.ai-scanline { position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, transparent, #019ACB, transparent); box-shadow: 0 0 10px 2px rgba(1,154,203,0.6); animation: aiScanMove 1.8s ease-in-out infinite; }
@keyframes aiScanMove { 0% { top: 4%; } 50% { top: 92%; } 100% { top: 4%; } }
.ai-badge { position: absolute; right: 4px; top: 4px; width: clamp(20px,4vw,26px); height: clamp(20px,4vw,26px); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(13px,2.4vw,16px); color: #fff; animation: g1pop 0.4s ease both; }
.ai-badge-ok { background: #1F7A4D; }
.ai-badge-x { background: #FF4F28; }

/* --- LearnMeter --- */
.ai-meter { display: flex; align-items: center; gap: clamp(10px,2vw,16px); background: #FFFFFF; border-radius: 16px; padding: clamp(10px,2vw,15px) clamp(12px,2.4vw,18px); box-shadow: 0 6px 18px -8px rgba(58,53,48,0.24); }
.ai-meter-bit { flex-shrink: 0; height: clamp(46px, 11vw, 64px); }
.ai-meter-bitsvg { height: 100%; width: auto; }
.ai-meter-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.ai-meter-top { display: flex; align-items: baseline; justify-content: space-between; }
.ai-meter-label { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(13px,1.9vw,16px); color: #0E0E10; }
.ai-meter-val { font-weight: 700; font-size: clamp(13px,1.9vw,16px); color: #019ACB; }
.ai-meter-track { display: flex; gap: 5px; }
.ai-meter-seg { flex: 1; height: clamp(12px,2.4vw,16px); border-radius: 6px; background: #EDE7DC; transition: background 0.3s; }
.ai-meter-seg.on { background: linear-gradient(90deg, #019ACB, #1F7A4D); animation: aiSegPop 0.4s ease both; }
@keyframes aiSegPop { 0% { transform: scaleY(0.3); opacity: 0.4; } 60% { transform: scaleY(1.15); } 100% { transform: scaleY(1); opacity: 1; } }

/* --- BitScan (Bit rasmga qaraydi) --- */
.ai-scanwrap { display: flex; align-items: center; justify-content: center; gap: clamp(10px,3vw,26px); position: relative; }
.ai-scan-bit { height: clamp(84px, 20vw, 128px); flex-shrink: 0; }
.ai-scan-bitsvg { height: 100%; width: auto; }
.ai-scan-beam { position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; }
.ai-bubble { position: absolute; top: -6px; right: clamp(4px, 6vw, 40px); background: #FF4F28; color: #fff; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(13px,2vw,17px); padding: 6px 14px; border-radius: 14px; box-shadow: 0 6px 14px -4px rgba(255,79,40,0.5); animation: g1drop 0.5s ease both; }
.ai-bubble::after { content: ''; position: absolute; left: 22px; bottom: -6px; border-width: 7px 7px 0; border-style: solid; border-color: #FF4F28 transparent transparent; }

/* --- s2 pattern --- */
.ai-pattern-pic { width: clamp(150px, 40vw, 230px); height: clamp(150px, 40vw, 230px); }
.ai-part { transform-box: fill-box; transform-origin: center; }
.ai-pattern.show .ai-part { animation: aiPartGlow 2.2s ease-in-out infinite; }
.ai-pattern.show .ai-part-ear { animation-delay: 0s; }
.ai-pattern.show .ai-part-wh { animation-delay: 0.5s; }
.ai-pattern.show .ai-part-tail { animation-delay: 1s; }
@keyframes aiPartGlow { 0%,100% { filter: none; } 50% { filter: drop-shadow(0 0 6px #FF4F28); } }
.ai-chip { display: inline-flex; align-items: center; background: #FFE8E1; color: #FF4F28; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(13px,2vw,17px); padding: 8px 18px; border-radius: 99px; opacity: 0; }
.ai-chip.in { animation: g1pop 0.5s ease both; }

/* --- Qoida flow (s3/s6/s8/s11 figure) --- */
.ai-rule-flow { display: flex; align-items: center; justify-content: center; gap: clamp(10px,3vw,22px); flex-wrap: wrap; }
.ai-rule-ex { display: flex; gap: clamp(4px,1.4vw,10px); }
.ai-rule-mini { width: clamp(44px, 11vw, 64px); height: clamp(44px, 11vw, 64px); display: block; }
.ai-rule-arrow { font-size: clamp(24px,5vw,38px); color: #FF4F28; font-weight: 800; }
.ai-rule-bit { height: clamp(74px, 17vw, 112px); }
.ai-rule-bit svg { height: 100%; width: auto; }
.ai-teach { height: clamp(74px, 17vw, 112px) !important; }

/* --- s7 sarala --- */
.ai-sort-zones { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(8px,2vw,14px); }
.ai-sort-zone { -webkit-appearance: none; appearance: none; background: #FFFFFF; border: 2px dashed #CFC8BC; border-radius: 16px; padding: clamp(10px,2vw,14px); min-height: clamp(90px,20vw,120px); display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: default; transition: border-color 0.2s, background 0.2s, transform 0.15s; }
.ai-sort-zone.active { border-color: #FF4F28; background: #FFF6F3; cursor: pointer; }
.ai-sort-zone.active:hover { transform: translateY(-2px); }
.ai-sort-zone.flash { animation: aiShake 0.4s ease; border-color: #FF4F28; }
.ai-sort-zone-title { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(13px,1.9vw,16px); color: #5A5A60; }
.ai-sort-zone-items { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.ai-sort-placed { width: clamp(38px,9vw,54px); height: clamp(38px,9vw,54px); display: block; animation: g1pop 0.35s ease both; }
.ai-tray-empty { font-size: clamp(28px,6vw,42px); color: #1F7A4D; }
@keyframes aiShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }

/* --- s10 tartibla --- */
.ai-order-slots { display: flex; align-items: stretch; justify-content: center; gap: clamp(8px,2vw,14px); }
.ai-order-slot { flex: 1; max-width: clamp(90px,24vw,140px); border: 2px dashed #CFC8BC; border-radius: 14px; min-height: clamp(84px,19vw,120px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; position: relative; }
.ai-order-slot.filled { border-style: solid; border-color: #1F7A4D; background: #E3F0E8; }
.ai-order-idx { position: absolute; top: 6px; left: 8px; color: #A7A6A2; font-weight: 700; font-size: clamp(11px,1.6vw,14px); }
.ai-order-bit { display: flex; flex-direction: column; align-items: center; gap: 3px; animation: g1pop 0.4s ease both; }
.ai-order-bit svg { height: clamp(48px,11vw,68px); width: auto; }
.ai-order-tag, .ai-trio-tag { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(11px,1.6vw,13px); color: #019ACB; }
.ai-bittrio { display: flex; flex-wrap: wrap; align-items: stretch; justify-content: center; gap: clamp(10px,2.4vw,18px); }
.ai-trio-card { -webkit-appearance: none; appearance: none; background: #FFFFFF; border: 2px solid transparent; border-radius: 16px; padding: clamp(8px,1.8vw,12px); display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; box-shadow: 0 6px 16px -8px rgba(58,53,48,0.26); transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
.ai-trio-card:not(.used):hover { transform: translateY(-3px); border-color: #FF4F28; }
.ai-trio-card svg { height: clamp(56px,13vw,82px); width: auto; }
.ai-trio-card.used { opacity: 0.35; cursor: default; }
.ai-trio-card.wrong { animation: aiShake 0.4s ease; border-color: #FF4F28; }

/* --- sd mini-o'yin --- */
.ai-game-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(8px,2vw,14px); }
.ai-game-cell { -webkit-appearance: none; appearance: none; background: #FFFFFF; border: none; border-radius: 16px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; padding: clamp(6px,1.6vw,12px); cursor: pointer; box-shadow: 0 6px 16px -8px rgba(58,53,48,0.24); transition: transform 0.12s; }
.ai-game-cell:hover { transform: scale(1.05); }
.ai-game-cell:active { transform: scale(0.94); }
.ai-game-cell.gone { visibility: hidden; }
.ai-game-cell.shake { animation: aiShake 0.42s ease; }

/* --- s11 fakt --- */
.ai-fact-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ai-fact-ic { font-size: clamp(18px,3vw,24px); }
.ai-fact-title { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(14px,2vw,17px); color: #1F7A4D; }
.ai-fact-txt { color: #0E0E10; font-size: clamp(14px,2vw,17px); line-height: 1.5; }

@keyframes g1bitfloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

/* ============================================================
   === Dars05 — INTRO-KINO (sIntro: tungi robot-laboratoriya) ===
   ============================================================ */

/* sarlavha: harflar birma-bir sakrab chiqadi */
.d5-word { display: inline-block; white-space: pre; }
.d5-tl { display: inline-block; opacity: 0; animation: d5letter 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes d5letter { 0% { opacity: 0; transform: translateY(20px) scale(0.5) rotate(-8deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); } }

.d5-frame { padding: clamp(10px, 2vw, 16px) !important; overflow: hidden; }
.d5-scene { position: relative; width: 100%; min-height: clamp(250px, 50vw, 360px); border-radius: 14px; overflow: hidden; background: #132C41; }
.d5-bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }

/* fon jonlanishi: LEDlar, yulduzlar, shahar chiroqlari, zarralar, radar */
.d5-led { animation: d5blink 1.6s ease-in-out infinite; }
.d5-led2 { animation-duration: 2.1s; animation-delay: 0.4s; }
.d5-led3 { animation-duration: 1.2s; animation-delay: 0.8s; }
@keyframes d5blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
.d5-ledline { animation: d5glowpulse 3s ease-in-out infinite alternate; }
@keyframes d5glowpulse { from { opacity: 0.3; } to { opacity: 0.75; } }
.d5-star { transform-box: fill-box; transform-origin: center; animation: d5twinkle 2s ease-in-out infinite; }
.d5-st2 { animation-delay: 0.6s; }
.d5-st3 { animation-delay: 1.1s; }
.d5-st4 { animation-delay: 1.6s; }
@keyframes d5twinkle { 0%, 100% { opacity: 0.25; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.15); } }
.d5-citylite { animation: d5blink 3s ease-in-out infinite; }
.d5-cl2 { animation-delay: 1s; }
.d5-cl3 { animation-delay: 2s; }
.d5-shoot { opacity: 0; animation: d5shoot 8s ease-out 2s infinite; }
@keyframes d5shoot { 0% { transform: translate(0, 0); opacity: 0; } 3% { opacity: 0.9; } 11% { transform: translate(72px, 36px); opacity: 0; } 100% { transform: translate(72px, 36px); opacity: 0; } }
.d5-mote { animation: d5mote 8s ease-in-out infinite alternate; }
.d5-m2 { animation-duration: 10s; animation-delay: 1s; }
.d5-m3 { animation-duration: 12s; animation-delay: 2s; }
@keyframes d5mote { 0% { transform: translate(0, 0); } 100% { transform: translate(8px, -22px); } }
.d5-spot { animation: d5glowpulse 4s ease-in-out infinite alternate; }
.d5-podglow { transform-box: fill-box; transform-origin: center; animation: d5podpulse 3s ease-in-out infinite; }
@keyframes d5podpulse { 0%, 100% { opacity: 0.75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.07); } }
.d5-ripple { transform-box: fill-box; transform-origin: center; animation: d5rip 2.6s ease-out infinite; }
.d5-rp2 { animation-delay: 1.3s; }
@keyframes d5rip { 0% { transform: scale(0.55); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }

/* teleport nuri — Bit paydo bo'lish chaqnashi (chapda) */
.d5-beam { position: absolute; left: 21%; top: 0; bottom: 10%; width: clamp(64px, 15vw, 104px); margin-left: calc(clamp(64px, 15vw, 104px) / -2); z-index: 2; background: linear-gradient(180deg, rgba(140,225,255,0) 0%, rgba(140,225,255,0.55) 30%, rgba(140,225,255,0.1) 100%); opacity: 0; pointer-events: none; }
.d5-beam.in { animation: d5beam 1.3s ease-out both; transform-origin: top center; }
@keyframes d5beam { 0% { opacity: 0; transform: scaleY(0); } 20% { opacity: 0.95; transform: scaleY(1); } 65% { opacity: 0.6; } 100% { opacity: 0; transform: scaleY(1); } }

/* Bit — chapda, nurda "materializatsiya" bo'ladi, so'ng podium ustida suzadi */
.d5-bit { position: absolute; left: 21%; bottom: 10%; height: clamp(116px, 25vw, 188px); margin-left: calc(clamp(116px, 25vw, 188px) * -0.4); z-index: 3; opacity: 0; }
.d5-bit.in { opacity: 1; animation: d5material 1.1s ease-out 0.4s both; }
@keyframes d5material {
  0% { opacity: 0; transform: translateY(-44px) scale(0.7); filter: brightness(2.4) drop-shadow(0 0 20px rgba(91,214,242,0.95)); }
  55% { opacity: 1; transform: translateY(0) scale(1.04); filter: brightness(1.5) drop-shadow(0 0 16px rgba(91,214,242,0.7)); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1) drop-shadow(0 0 10px rgba(91,214,242,0.4)); }
}
.d5-bitsvg { height: 100%; width: auto; display: block; filter: drop-shadow(0 0 12px rgba(91,214,242,0.35)); }
.d5-bit.in .d5-bitsvg { animation: g1bitfloat 3.4s ease-in-out 1.8s infinite; }

/* === AiMonitor — markaziy tizim ekrani === */
.d5-mon { position: absolute; left: 40%; right: 3%; top: 7%; bottom: 13%; z-index: 4; display: flex; flex-direction: column; background: rgba(8,26,40,0.88); border: 1.5px solid rgba(91,214,242,0.7); border-radius: 14px; box-shadow: 0 0 22px rgba(91,214,242,0.3), inset 0 0 16px rgba(91,214,242,0.08); overflow: hidden; opacity: 0.25; transition: opacity 0.4s ease; }
.d5-mon.on { opacity: 1; animation: d5monon 0.7s ease both; }
@keyframes d5monon { 0% { opacity: 0.2; filter: brightness(0.4); } 40% { opacity: 1; filter: brightness(1.8); } 60% { filter: brightness(0.9); } 100% { opacity: 1; filter: brightness(1); } }
.d5-mon-head { display: flex; align-items: center; gap: 8px; padding: clamp(5px, 1vw, 8px) clamp(8px, 1.6vw, 12px); background: rgba(14,36,54,0.9); border-bottom: 1px solid rgba(91,214,242,0.45); }
.d5-mon-dots { display: flex; gap: 4px; }
.d5-mon-dots i { width: 7px; height: 7px; border-radius: 50%; background: #FF6B57; }
.d5-mon-dots i:nth-child(2) { background: #FFC23C; }
.d5-mon-dots i:nth-child(3) { background: #7BE495; }
.d5-mon-title { flex: 1; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(8px, 1.3vw, 12px); letter-spacing: 0.6px; color: #8FE0F7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.d5-mon-live { width: 8px; height: 8px; border-radius: 50%; background: #7BE495; box-shadow: 0 0 8px rgba(123,228,149,0.9); animation: d5blink 1.4s ease-in-out infinite; flex-shrink: 0; }
.d5-mon-body { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: clamp(4px, 1vw, 8px); padding: clamp(6px, 1.2vw, 12px); overflow: hidden; }
/* matritsa-yomg'ir */
.d5-rains { position: absolute; inset: 0; display: flex; justify-content: space-around; pointer-events: none; opacity: 0.35; }
.d5-rain { display: flex; flex-direction: column; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: clamp(7px, 1.1vw, 10px); line-height: 1.6; color: #3FA8C9; animation: d5rainfall 7s linear infinite; }
.d5-rain1 { animation-duration: 9s; animation-delay: -3s; color: #2E7D9A; }
.d5-rain2 { animation-duration: 6s; animation-delay: -1.5s; }
.d5-rain3 { animation-duration: 11s; animation-delay: -5s; color: #2E7D9A; }
@keyframes d5rainfall { from { transform: translateY(-50%); } to { transform: translateY(0); } }
/* kod satrlari + neyro-yadro */
.d5-mon-mid { position: relative; display: flex; align-items: center; gap: clamp(6px, 1.4vw, 12px); flex: 1; min-height: 0; }
.d5-code { flex: 1; display: flex; flex-direction: column; gap: clamp(4px, 0.9vw, 7px); min-width: 0; }
.d5-cl { display: block; height: clamp(5px, 1vw, 8px); border-radius: 3px; background: rgba(91,214,242,0.55); transform-origin: left center; animation: d5type 3.6s ease-in-out infinite; }
.d5-cl:nth-child(2) { animation-delay: 0.3s; }
.d5-cl:nth-child(3) { animation-delay: 0.6s; }
.d5-cl:nth-child(4) { animation-delay: 0.9s; }
.d5-cl:nth-child(5) { animation-delay: 1.2s; }
.d5-cl:nth-child(6) { animation-delay: 1.5s; }
.d5-cl-g { background: rgba(123,228,149,0.55); }
.d5-cl-o { background: rgba(255,184,77,0.55); }
@keyframes d5type { 0% { transform: scaleX(0); } 25% { transform: scaleX(1); } 85% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(1); opacity: 0.35; } }
.d5-cursor { position: relative; }
.d5-cursor::after { content: ''; position: absolute; right: -8px; top: -1px; bottom: -1px; width: 4px; background: #5BD6F2; animation: d5blink 0.8s steps(1) infinite; }
.d5-core { width: clamp(84px, 17vw, 132px); height: clamp(84px, 17vw, 132px); flex-shrink: 0; }
.d5-el { animation: d5orbit 5s linear infinite; transform-origin: 0 0; }
.d5-el2 { animation-duration: 7s; animation-direction: reverse; }
.d5-el3 { animation-duration: 9s; }
@keyframes d5orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.d5-corec { transform-box: fill-box; transform-origin: center; animation: d5corepulse 2.4s ease-in-out infinite; }
@keyframes d5corepulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
/* bilim chiplari */
.d5-know { position: relative; display: flex; flex-wrap: wrap; gap: clamp(4px, 1vw, 8px); animation: g1pop 0.5s ease both; }
.d5-kchip { display: inline-flex; align-items: center; gap: 5px; background: rgba(14,40,60,0.9); border: 1px solid rgba(91,214,242,0.55); border-radius: 99px; padding: clamp(3px, 0.7vw, 5px) clamp(7px, 1.4vw, 11px); font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(8px, 1.3vw, 12px); color: #DFF3FF; animation: g1pop 0.45s ease both; }
.d5-kchip2 { animation-delay: 0.18s; }
.d5-kchip3 { animation-delay: 0.36s; }
.d5-kchip b { color: #7BE495; font-family: 'JetBrains Mono', monospace; font-size: clamp(8px, 1.2vw, 11px); }
.d5-kicon { width: clamp(12px, 2.2vw, 17px); height: clamp(12px, 2.2vw, 17px); flex-shrink: 0; }
/* so'rov -> javob */
.d5-query { position: relative; display: flex; align-items: center; gap: clamp(5px, 1.2vw, 10px); font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(9px, 1.4vw, 13px); animation: g1pop 0.45s ease both; }
.d5-q-ask { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,184,77,0.14); border: 1px solid rgba(255,184,77,0.6); color: #FFD9A0; border-radius: 8px; padding: clamp(3px, 0.7vw, 5px) clamp(7px, 1.4vw, 11px); }
.d5-q-ask b { color: #FFB84D; }
.d5-q-arrow { color: #5BD6F2; animation: d5arrowgo 1.1s ease-in-out infinite; }
@keyframes d5arrowgo { 0%, 100% { transform: translateX(0); opacity: 0.6; } 50% { transform: translateX(5px); opacity: 1; } }
.d5-q-ans { display: inline-flex; align-items: center; gap: 5px; background: rgba(123,228,149,0.14); border: 1px solid rgba(123,228,149,0.6); color: #C9F2D6; border-radius: 8px; padding: clamp(3px, 0.7vw, 5px) clamp(7px, 1.4vw, 11px); animation: g1pop 0.4s ease 0.45s both; }
.d5-q-ans b { color: #7BE495; }
.d5-q-time { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(8px, 1.2vw, 11px); color: #8FE0F7; opacity: 0.85; }
/* final holati */
.d5-status { position: relative; display: flex; align-items: center; gap: clamp(6px, 1.4vw, 10px); animation: g1pop 0.5s ease both; }
.d5-status-bar { flex: 1; height: clamp(7px, 1.3vw, 10px); border-radius: 99px; background: rgba(91,214,242,0.15); border: 1px solid rgba(91,214,242,0.4); overflow: hidden; }
.d5-status-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #019ACB, #7BE495); animation: d5fill 1.1s ease-out 0.2s both; }
@keyframes d5fill { from { width: 0; } to { width: 100%; } }
.d5-status-txt { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(9px, 1.4vw, 13px); letter-spacing: 0.6px; color: #7BE495; text-shadow: 0 0 10px rgba(123,228,149,0.6); white-space: nowrap; }

/* === AiPromptScreen (s0) — "Muzqaymoq" buyrug'i + generatsiya === */
.d5p { width: min(100%, 520px); margin: 0 auto; background: rgba(8,26,40,0.92); border: 1.5px solid rgba(91,214,242,0.7); border-radius: 14px; box-shadow: 0 0 22px rgba(91,214,242,0.22), inset 0 0 16px rgba(91,214,242,0.08); overflow: hidden; }
.d5p-body { display: flex; flex-direction: column; gap: clamp(8px, 1.6vw, 12px); padding: clamp(10px, 2vw, 16px); }
.d5p-promptrow { display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(14px, 2.2vw, 19px); color: #DFF3FF; background: rgba(14,36,54,0.9); border: 1px solid rgba(91,214,242,0.4); border-radius: 10px; padding: clamp(8px, 1.6vw, 12px) clamp(10px, 2vw, 16px); }
.d5p-gt { color: #7BE495; }
.d5p-typed { overflow: hidden; white-space: nowrap; max-width: 9ch; animation: d5ptype 1.6s steps(9) 0.5s both; }
@keyframes d5ptype { from { max-width: 0; } to { max-width: 9ch; } }
.d5p-caret { width: 9px; height: 1.15em; border-radius: 2px; background: #5BD6F2; animation: d5blink 0.8s steps(1) infinite; flex-shrink: 0; }
.d5p-result { min-height: clamp(116px, 24vw, 176px); border: 1.5px dashed rgba(91,214,242,0.5); border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; transition: border-color 0.3s; }
.d5p-result.done { border-style: solid; border-color: rgba(123,228,149,0.7); }
.d5p-think { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.d5p-q { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(30px, 6vw, 46px); line-height: 1; color: #5BD6F2; text-shadow: 0 0 14px rgba(91,214,242,0.7); animation: d5corepulse 1.6s ease-in-out infinite; }
.d5p-dots { display: flex; gap: 6px; }
.d5p-dots i { width: 7px; height: 7px; border-radius: 50%; background: #5BD6F2; animation: d5blink 1.2s ease-in-out infinite; }
.d5p-dots i:nth-child(2) { animation-delay: 0.3s; }
.d5p-dots i:nth-child(3) { animation-delay: 0.6s; }
.d5p-genwrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: clamp(8px, 1.6vw, 12px); }
.d5p-ice { height: clamp(92px, 19vw, 142px); width: auto; display: block; animation: d5gen 1.7s ease both; }
@keyframes d5gen { 0% { filter: blur(12px) saturate(0.2); opacity: 0.25; } 60% { filter: blur(4px) saturate(0.7); opacity: 0.85; } 100% { filter: blur(0) saturate(1); opacity: 1; } }
.d5p-scan { position: absolute; left: 6%; right: 6%; top: 8%; height: 3px; border-radius: 2px; background: linear-gradient(90deg, transparent, #5BD6F2, transparent); box-shadow: 0 0 12px rgba(91,214,242,0.8); animation: d5pscan 1.7s ease both; pointer-events: none; }
@keyframes d5pscan { 0% { top: 6%; opacity: 1; } 88% { top: 86%; opacity: 1; } 100% { top: 86%; opacity: 0; } }
.d5p-file { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(10px, 1.5vw, 13px); color: #7BE495; animation: g1pop 0.4s ease 1.55s both; }
.d5p-optl { display: inline-flex; align-items: center; justify-content: center; width: clamp(20px, 3.4vw, 26px); height: clamp(20px, 3.4vw, 26px); border-radius: 8px; background: #FFE8E1; color: #FF4F28; font-weight: 800; font-size: clamp(11px, 1.6vw, 14px); flex-shrink: 0; }

/* === PromptBuilder (s1) — so'zlardan prompt yig'ish + #00FF00 kompilyatsiya === */
.d5w-next { animation: aiPulse 1.4s ease-in-out infinite; }
.d5w-line { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-height: 1.2em; }
.d5w-compile { display: flex; align-items: center; justify-content: center; gap: clamp(6px, 1.4vw, 12px); flex-wrap: wrap; padding: 2px 0; animation: g1pop 0.45s ease both; }
.d5w-src { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(11px, 1.6vw, 14px); color: #DFF3FF; }
.d5w-flow { display: flex; gap: 4px; }
.d5w-flow i { width: clamp(10px, 2vw, 16px); height: 3px; border-radius: 2px; background: #5BD6F2; opacity: 0.25; animation: d5wflow 1s linear infinite; }
.d5w-flow i:nth-child(2) { animation-delay: 0.15s; }
.d5w-flow i:nth-child(3) { animation-delay: 0.3s; }
.d5w-flow i:nth-child(4) { animation-delay: 0.45s; }
@keyframes d5wflow { 0%, 100% { opacity: 0.2; } 40% { opacity: 1; box-shadow: 0 0 8px rgba(91,214,242,0.8); } }
.d5w-hex { color: #7BE495; font-weight: 700; font-size: clamp(11px, 1.7vw, 15px); border: 1px solid rgba(123,228,149,0.6); background: rgba(123,228,149,0.12); padding: 3px 10px; border-radius: 8px; }
.d5w-swatch { width: clamp(18px, 3vw, 24px); height: clamp(18px, 3vw, 24px); border-radius: 6px; background: #00FF00; box-shadow: 0 0 12px rgba(0,255,0,0.6); flex-shrink: 0; }
.d5w-preview { min-height: clamp(46px, 9vw, 66px); border-radius: 10px; background: rgba(14,36,54,0.9); border: 1.5px dashed rgba(91,214,242,0.4); display: flex; align-items: center; justify-content: center; transition: background 0.9s ease, border-color 0.9s ease, box-shadow 0.9s ease; }
.d5w-preview.on { background: linear-gradient(135deg, #00E676, #00FF00); border-style: solid; border-color: rgba(0,180,70,0.85); box-shadow: 0 0 22px rgba(0,255,0,0.35), inset 0 0 14px rgba(255,255,255,0.25); }
.d5w-preview-label { font-weight: 700; font-size: clamp(11px, 1.7vw, 14px); letter-spacing: 1.4px; color: rgba(223,243,255,0.7); transition: color 0.9s ease; }
.d5w-preview.on .d5w-preview-label { color: #045D2B; text-shadow: 0 1px 0 rgba(255,255,255,0.35); }

/* === Dizayn-buyruqlar (s2) — okean/kosmos fon almashtirish === */
.d5f-btns { display: flex; justify-content: center; gap: clamp(10px, 2.4vw, 18px); flex-wrap: wrap; }
.d5f-btn { -webkit-appearance: none; appearance: none; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(14px, 2.1vw, 18px); color: #FFFFFF; padding: clamp(12px, 2.2vw, 16px) clamp(18px, 3.4vw, 28px); border-radius: 16px; box-shadow: 0 8px 20px -8px rgba(58,53,48,0.45); outline: 3px solid transparent; outline-offset: 2px; transition: transform 0.18s, box-shadow 0.18s, outline-color 0.18s; }
.d5f-btn:hover { transform: translateY(-3px); }
.d5f-btn:active { transform: scale(0.96); }
.d5f-btn-ocean { background: linear-gradient(135deg, #014F6E, #0FA3A8); }
.d5f-btn-space { background: linear-gradient(135deg, #3A2C5E, #6B4FA0); }
.d5f-btn.sel { outline-color: #FF4F28; }
.d5f-ic { font-size: clamp(18px, 3vw, 24px); line-height: 1; }
.d5f-stage { position: relative; min-height: clamp(140px, 28vw, 210px); border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(14,36,54,0.9); border: 1.5px dashed rgba(91,214,242,0.4); transition: background 0.9s ease, border-color 0.9s ease; }
.d5f-ocean { background: linear-gradient(180deg, #012A47 0%, #015C7A 55%, #0FA3A8 100%); border-style: solid; border-color: rgba(15,163,168,0.7); }
.d5f-space { background: linear-gradient(180deg, #17131F 0%, #2E2340 55%, #4A3C66 100%); border-style: solid; border-color: rgba(107,79,160,0.75); }
.d5f-hint { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(12px, 1.8vw, 15px); color: rgba(223,243,255,0.6); }
.d5f-layer { position: absolute; inset: 0; animation: d5ffade 0.7s ease both; }
@keyframes d5ffade { from { opacity: 0; } to { opacity: 1; } }
/* okean: aylanuvchi to'lqin yuzasi + ko'tarilayotgan pufakchalar + baliqlar */
.d5f-wave { position: absolute; left: -50%; top: 58%; width: 200%; height: 200%; border-radius: 42%; background: rgba(255,255,255,0.09); animation: d5fspin 9s linear infinite; }
.d5f-wave2 { top: 64%; border-radius: 46%; background: rgba(255,255,255,0.06); animation-duration: 13s; animation-direction: reverse; }
@keyframes d5fspin { to { transform: rotate(360deg); } }
.d5f-bub { position: absolute; bottom: -12px; width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.4); animation: d5frise 4.2s ease-in infinite; }
.d5f-bub1 { left: 18%; }
.d5f-bub2 { left: 42%; width: 7px; height: 7px; animation-delay: 1.2s; animation-duration: 3.4s; }
.d5f-bub3 { left: 64%; animation-delay: 2.1s; }
.d5f-bub4 { left: 84%; width: 6px; height: 6px; animation-delay: 0.6s; animation-duration: 5s; }
@keyframes d5frise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 0.85; } 100% { transform: translateY(-190px); opacity: 0; } }
.d5f-fish { position: absolute; left: 24%; top: 38%; font-size: clamp(22px, 4vw, 32px); animation: d5fswim 5s ease-in-out infinite alternate; }
.d5f-fish2 { left: 60%; top: 60%; font-size: clamp(17px, 3vw, 24px); animation-duration: 7s; animation-delay: 1s; }
@keyframes d5fswim { from { transform: translateX(-22px); } to { transform: translateX(26px) translateY(-8px); } }
/* kosmos: miltillovchi yulduzlar + halqali sayyora + uchayotgan raketa */
.d5f-star { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 6px rgba(255,255,255,0.85); animation: d5ftw 1.8s ease-in-out infinite; }
@keyframes d5ftw { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.25); } }
.d5f-planet { position: absolute; right: 13%; top: 18%; width: clamp(36px, 6.4vw, 54px); height: clamp(36px, 6.4vw, 54px); border-radius: 50%; background: radial-gradient(circle at 35% 30%, #C9A0E8, #8E5DBF 60%, #5E3A8C); box-shadow: 0 0 18px rgba(150,100,220,0.5); }
.d5f-planet::after { content: ''; position: absolute; left: -26%; top: 42%; width: 152%; height: 16%; border-radius: 50%; border: 2.5px solid rgba(220,190,255,0.65); transform: rotate(-16deg); }
.d5f-rocket { position: absolute; left: 14%; bottom: 16%; font-size: clamp(22px, 4vw, 34px); animation: d5frocket 4s ease-in-out infinite alternate; }
@keyframes d5frocket { from { transform: translate(0, 0) rotate(0); } to { transform: translate(16px, -18px) rotate(8deg); } }

/* === Ob'ekt tahriri (s5) — mushuk rangi/aksessuarini prompt bilan almashtirish === */
.d5f-btn-cblack { background: linear-gradient(135deg, #1E1E27, #4B4B5C); }
.d5f-btn-cyellow { background: linear-gradient(135deg, #B87800, #E8A20C); }
.d5c-black { background: linear-gradient(180deg, #F7F1E4 0%, #E9DCC6 100%); border-style: solid; border-color: rgba(58,53,48,0.4); }
.d5c-yellow { background: linear-gradient(180deg, #E3F2FF 0%, #BFE0F8 100%); border-style: solid; border-color: rgba(58,140,200,0.55); }
.d5c-cat { width: clamp(110px, 22vw, 168px); height: clamp(110px, 22vw, 168px); animation: d5ffade 0.7s ease both; filter: drop-shadow(0 10px 16px rgba(20,24,32,0.28)); }
.d5c-acc { animation: d5cpop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: 0.25s; transform-box: fill-box; transform-origin: center; }
@keyframes d5cpop { 0% { opacity: 0; transform: scale(0.4) translateY(-8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.d5c-hint { position: absolute; left: 50%; bottom: clamp(8px, 1.6vw, 14px); transform: translateX(-50%); }

/* === Promptni yig' (s6) — chiplarni uyalarga tartib bilan joylash === */
.d5o-slots { display: flex; justify-content: center; gap: clamp(8px, 1.8vw, 14px); flex-wrap: wrap; margin-bottom: clamp(8px, 1.6vw, 12px); }
.d5o-slot { min-width: clamp(78px, 15vw, 124px); min-height: clamp(40px, 7vw, 54px); padding: 4px 10px; border-radius: 12px; border: 2px dashed rgba(91,214,242,0.45); display: inline-flex; align-items: center; justify-content: center; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(14px, 2.1vw, 18px); color: rgba(223,243,255,0.4); }
.d5o-slot.full { border-style: solid; border-color: rgba(123,228,149,0.85); background: rgba(123,228,149,0.14); color: #7BE495; animation: d5opop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes d5opop { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
.d5o-chips { display: flex; justify-content: center; gap: clamp(10px, 2.2vw, 16px); flex-wrap: wrap; }
.d5o-chip { display: inline-flex; align-items: center; gap: 9px; font-size: clamp(15px, 2.2vw, 19px); padding: clamp(10px, 2vw, 14px) clamp(16px, 3vw, 24px); }
.d5o-chip.used { opacity: 0.25; }
.d5o-chip.shake { animation: aiShake 0.42s ease; }
.d5o-tag { width: clamp(20px, 3vw, 24px); height: clamp(20px, 3vw, 24px); border-radius: 7px; background: #0E2436; color: #5BD6F2; font-size: clamp(11px, 1.6vw, 13px); font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.d5o-made { position: absolute; bottom: clamp(8px, 1.6vw, 12px); left: 50%; transform: translateX(-50%); z-index: 2; font-size: clamp(10px, 1.5vw, 12px); letter-spacing: 2px; color: #CDB4F2; background: rgba(23,19,31,0.75); border: 1px solid rgba(107,79,160,0.7); border-radius: 99px; padding: 4px 12px; animation: d5ffade 0.7s ease 0.4s both; }

/* === Amaliy topshiriq (s7) — xona maketi + prompt tokchasi === */
.d5m-room { width: 100%; max-width: 540px; height: auto; display: block; margin: 0 auto; border-radius: 8px; }
.d5m-wall { fill: #E8E2D4; transition: fill 0.9s ease; }
.d5m-room.on-wall .d5m-wall { fill: #6FBF73; }
.d5m-glow { opacity: 0; transition: opacity 0.8s ease; }
.d5m-room.on-lamp .d5m-glow { opacity: 1; animation: d5mpulse 2.6s ease-in-out infinite; }
@keyframes d5mpulse { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
.d5m-shade { fill: #4A4038; transition: fill 0.6s ease; }
.d5m-room.on-lamp .d5m-shade { fill: #7A5C3E; }
.d5m-bulb { fill: #6B6157; transition: fill 0.4s ease; }
.d5m-room.on-lamp .d5m-bulb { fill: #FFE9A8; filter: drop-shadow(0 0 6px #FFE9A8); }
.d5m-warm { opacity: 0; transition: opacity 0.9s ease; pointer-events: none; }
.d5m-room.on-lamp .d5m-warm { opacity: 0.12; }
.d5m-pop { animation: d5opop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-box: fill-box; transform-origin: center; }
.d5m-shelf { position: relative; border: 1.5px solid rgba(91,214,242,0.35); border-radius: 14px; background: rgba(8,26,40,0.55); padding: clamp(10px, 2vw, 14px) clamp(12px, 2.4vw, 18px) clamp(16px, 3vw, 22px); }
.d5m-shelf::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: 6px; height: 5px; border-radius: 3px; background: linear-gradient(180deg, #8A5A33, #6E4524); }
.d5m-shelf-label { display: block; text-align: center; font-size: clamp(10px, 1.5vw, 12px); letter-spacing: 2px; color: rgba(91,214,242,0.8); margin-bottom: clamp(8px, 1.6vw, 10px); }
.d5m-chips { display: flex; justify-content: center; gap: clamp(8px, 1.8vw, 14px); flex-wrap: wrap; }
.d5m-chip { font-size: clamp(13px, 1.9vw, 16px); padding: clamp(9px, 1.8vw, 12px) clamp(13px, 2.4vw, 18px); }

/* === Tanishuv (sAis) — mashhur AI kartochkalari (3D flip) === */
.d5g-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(10px, 2.2vw, 18px); }
@media (max-width: 640px) { .d5g-grid { grid-template-columns: 1fr; } }
.d5g-card { -webkit-appearance: none; appearance: none; background: none; border: none; padding: 0; cursor: pointer; perspective: 900px; text-align: center; }
.d5g-inner { position: relative; width: 100%; min-height: clamp(158px, 27vw, 205px); transform-style: preserve-3d; transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1); }
.d5g-card.open .d5g-inner { transform: rotateY(180deg); }
.d5g-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(6px, 1.2vw, 10px); padding: clamp(10px, 2vw, 14px); }
.d5g-front { background: #FFFFFF; box-shadow: 0 6px 16px -6px rgba(58,53,48,0.2); transition: transform 0.18s; }
.d5g-card:hover:not(.open) .d5g-front { transform: translateY(-3px); }
.d5g-back { transform: rotateY(180deg); background: rgba(8,26,40,0.95); border: 1.5px solid rgba(91,214,242,0.55); box-shadow: 0 0 18px rgba(91,214,242,0.2); }
.d5g-logo { width: clamp(46px, 8.5vw, 66px); height: clamp(46px, 8.5vw, 66px); }
.d5g-name { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(15px, 2.2vw, 19px); color: #0E0E10; }
.d5g-tap { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: clamp(11px, 1.6vw, 13px); color: #8B8B93; animation: d5gtap 1.6s ease-in-out infinite; }
@keyframes d5gtap { 0%, 100% { opacity: 0.55; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
.d5g-backname { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(13px, 1.9vw, 16px); color: #8FE0F7; }
.d5g-by { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: clamp(10px, 1.5vw, 12px); letter-spacing: 0.6px; color: #7BE495; background: rgba(123,228,149,0.12); border: 1px solid rgba(123,228,149,0.5); border-radius: 99px; padding: 3px 10px; }
.d5g-desc { font-family: 'Manrope', sans-serif; font-weight: 600; font-size: clamp(12px, 1.8vw, 15px); line-height: 1.45; color: #DFF3FF; }
.d5g-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 640px; margin: 0 auto; width: 100%; }
@media (max-width: 640px) { .d5g-grid-2 { grid-template-columns: 1fr; } }
.d5g-grid-2 .d5g-inner { min-height: clamp(196px, 32vw, 240px); }
.d5g-mini { width: clamp(64px, 11vw, 90px); height: auto; flex-shrink: 0; }

/* === Kartochkali test (sQg) — Gamma yoki Canva? === */
.d5q-cards { display: flex; justify-content: center; gap: clamp(14px, 3vw, 26px); flex-wrap: wrap; }
.d5q-card { -webkit-appearance: none; appearance: none; border: none; cursor: pointer; background: #FFFFFF; border-radius: 18px; box-shadow: 0 10px 26px -10px rgba(58,53,48,0.28); padding: clamp(16px, 3vw, 26px) clamp(22px, 4.4vw, 38px); display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.6vw, 12px); min-width: clamp(150px, 27vw, 224px); outline: 3px solid transparent; outline-offset: 2px; transition: transform 0.18s, box-shadow 0.18s, opacity 0.3s, background 0.3s, outline-color 0.3s; }
.d5q-card:hover:not(:disabled) { transform: translateY(-4px); box-shadow: 0 14px 30px -10px rgba(58,53,48,0.34); }
.d5q-card:disabled { cursor: default; }
.d5q-card.ok { background: #E3F0E8; outline-color: #1F7A4D; box-shadow: 0 12px 28px -10px rgba(31,122,77,0.45); }
.d5q-card.off { opacity: 0.35; }
.d5q-card.shake { animation: aiShake 0.42s ease; }

/* === AI musiqasi (sMus) — Suno pleyeri === */
.d5s-wrap { max-width: 560px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: clamp(10px, 2vw, 14px); }
.d5s-head { display: flex; align-items: center; justify-content: center; gap: 10px; }
.d5s-logo { width: clamp(40px, 6.4vw, 54px); height: clamp(40px, 6.4vw, 54px); filter: drop-shadow(0 6px 12px rgba(142,93,191,0.35)); }
.d5s-brand { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(18px, 2.8vw, 24px); color: #0E0E10; }
.d5s-player { background: rgba(8,26,40,0.95); border: 1.5px solid rgba(91,214,242,0.5); border-radius: 16px; padding: clamp(12px, 2.4vw, 18px); display: flex; flex-direction: column; gap: clamp(8px, 1.6vw, 12px); box-shadow: 0 14px 30px -12px rgba(14,36,54,0.5); }
.d5s-screen { position: relative; min-height: clamp(90px, 16vw, 130px); border-radius: 12px; background: rgba(14,36,54,0.9); border: 1.5px dashed rgba(91,214,242,0.4); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.d5s-eq { display: flex; align-items: flex-end; gap: clamp(5px, 1vw, 8px); height: 62%; }
.d5s-eq i { width: clamp(6px, 1.2vw, 9px); height: 18%; border-radius: 4px; background: linear-gradient(180deg, #FF7A59, #8E5DBF); transition: height 0.3s; }
.d5s-eq.on i { animation: d5seq 0.62s ease-in-out infinite alternate; }
@keyframes d5seq { from { height: 14%; opacity: 0.7; } to { height: 94%; opacity: 1; } }
.d5s-status { position: absolute; right: 10px; top: 8px; font-size: clamp(9px, 1.4vw, 11px); letter-spacing: 1.6px; color: #8FE0F7; }
.d5f-btn-rap { background: linear-gradient(135deg, #8A1C13, #E8590C); }

/* === Qoida (s3) — Bit qo'lida PROMPT paneli === */
.d5r-fig { display: flex; align-items: center; gap: clamp(0px, 0.6vw, 6px); }
.d5r-bit { height: clamp(112px, 22vw, 172px); width: auto; flex-shrink: 0; }
.d5r-panel { display: flex; flex-direction: column; gap: clamp(5px, 1vw, 8px); width: clamp(150px, 30vw, 230px); background: rgba(8,26,40,0.92); border: 1.5px solid rgba(91,214,242,0.75); border-radius: 14px; padding: clamp(12px, 2.2vw, 18px); margin-left: clamp(-26px, -2.6vw, -12px); box-shadow: 0 0 20px rgba(91,214,242,0.3), inset 0 0 14px rgba(91,214,242,0.1); animation: d5rfloat 3.4s ease-in-out infinite; }
@keyframes d5rfloat { 0%, 100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(-1.6deg) translateY(-8px); } }
.d5r-title { font-weight: 700; font-size: clamp(18px, 3.4vw, 28px); letter-spacing: 2.5px; color: #5BD6F2; text-shadow: 0 0 12px rgba(91,214,242,0.8); text-align: center; margin-bottom: 2px; }
.d5r-line { display: block; height: clamp(6px, 1.1vw, 9px); border-radius: 3px; background: rgba(91,214,242,0.5); }
.d5r-line-g { background: rgba(123,228,149,0.5); }
.d5r-line-o { background: rgba(255,184,77,0.5); }

/* === Aniq prompt testi (s4) — maqsad-olma === */
.d5a-apple { width: clamp(120px, 24vw, 180px); height: clamp(120px, 24vw, 180px); filter: drop-shadow(0 10px 18px rgba(156,16,8,0.25)); animation: d5abob 3.2s ease-in-out infinite; }
@keyframes d5abob { 0%, 100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-8px) rotate(1.5deg); } }

/* final: nur portlashi + konfetti + nishon */
.d5-burst { opacity: 0; transform-box: fill-box; transform-origin: center; }
.d5-burst.show { animation: d5burstin 1s ease both; }
@keyframes d5burstin { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
.d5-confetti { position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden; }
.d5-badge { position: absolute; bottom: clamp(10px, 2.4vw, 18px); left: 55%; z-index: 6; display: inline-flex; align-items: center; gap: 7px; background: rgba(8,26,40,0.92); color: #8FE0F7; border: 1.5px solid rgba(91,214,242,0.8); font-family: 'Manrope', sans-serif; font-weight: 800; font-size: clamp(13px, 2vw, 17px); padding: clamp(7px, 1.4vw, 10px) clamp(14px, 2.6vw, 20px); border-radius: 99px; box-shadow: 0 0 18px rgba(91,214,242,0.35), inset 0 0 12px rgba(91,214,242,0.12); text-shadow: 0 0 10px rgba(91,214,242,0.55); white-space: nowrap; animation: d5badge 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes d5badge { 0% { opacity: 0; transform: translate(-50%, 22px) scale(0.5); } 70% { opacity: 1; transform: translate(-50%, -4px) scale(1.06); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.d5-badge-star { display: inline-block; animation: d5wig 1.2s ease-in-out infinite; }
@keyframes d5wig { 0%, 100% { transform: rotate(-18deg) scale(1); } 50% { transform: rotate(18deg) scale(1.2); } }

@media (prefers-reduced-motion: reduce) {
  .d5-led, .d5-ledline, .d5-star, .d5-citylite, .d5-shoot, .d5-mote, .d5-spot, .d5-podglow, .d5-ripple,
  .d5-beam.in, .d5-bitsvg, .d5-badge-star, .d5-mon-live, .d5-rain, .d5-cl, .d5-cursor::after, .d5-el,
  .d5-corec, .d5-q-arrow, .d5-know, .d5-kchip, .d5-query, .d5-q-ans, .d5-status { animation: none !important; }
  .d5-tl { animation: none !important; opacity: 1; }
  .d5-bit.in, .d5-mon.on { animation: none !important; opacity: 1; transform: none; }
  .d5-ripple { opacity: 0; }
  .d5-cl { transform: scaleX(1); }
  .d5-status-bar i { animation: none !important; width: 100%; }
  .d5-burst.show { animation: none !important; opacity: 1; transform: none; }
  .d5-badge { animation: none !important; transform: translateX(-50%); }
  .d5p-typed, .d5p-caret, .d5p-q, .d5p-dots i, .d5p-ice, .d5p-scan, .d5p-file { animation: none !important; }
  .d5p-typed { max-width: 9ch; }
  .d5p-ice, .d5p-file { opacity: 1; filter: none; }
  .d5p-scan { opacity: 0; }
  .d5w-next, .d5w-flow i, .d5w-compile { animation: none !important; }
  .d5w-flow i { opacity: 0.8; }
  .d5w-preview, .d5w-preview-label { transition: none; }
  .d5f-wave, .d5f-bub, .d5f-fish, .d5f-star, .d5f-rocket, .d5f-layer { animation: none !important; }
  .d5c-cat, .d5c-acc { animation: none !important; opacity: 1; }
  .d5o-slot.full, .d5o-chip.shake, .d5o-made { animation: none !important; opacity: 1; }
  .d5m-glow, .d5m-pop { animation: none !important; }
  .d5m-wall, .d5m-glow, .d5m-shade, .d5m-bulb, .d5m-warm { transition: none; }
  .d5g-tap { animation: none !important; }
  .d5g-inner { transition: none; }
  .d5q-card.shake { animation: none !important; }
  .d5s-eq.on i { animation: none !important; height: 62%; }
  .d5f-star { opacity: 0.9; }
  .d5f-bub { opacity: 0; }
  .d5f-stage { transition: none; }
  .d5r-panel { animation: none !important; transform: rotate(-3deg); }
  .d5a-apple { animation: none !important; }
}

@media (prefers-reduced-motion: reduce) {
  .ai-hero-bit, .ai-scanline, .ai-pattern.show .ai-part, .ai-meter-seg.on, .ai-bg-float, .ai-bg-float2 { animation: none !important; }
  .ai-card-next { animation: none; }
}

/* === sFin — YAKUNIY NATIJALAR (15-sahifa) === */
.d5fin-wrap { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; gap: clamp(12px, 2.2vw, 20px); }

/* havodan tushayotgan AI logolari (dekor qatlam) */
.d5fin-rain { position: absolute; inset: clamp(-16px, -2vw, -8px) 0; overflow: hidden; pointer-events: none; z-index: 0; }
.d5fin-drop { position: absolute; top: 0; width: clamp(26px, 4.6vw, 40px); height: clamp(26px, 4.6vw, 40px); opacity: 0; animation: d5finFall linear infinite; }
.d5fin-drop svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 6px 12px rgba(14,14,16,0.16)); }
@keyframes d5finFall {
  0%   { transform: translateY(-12%) rotate(-10deg); opacity: 0; }
  8%   { opacity: 0.5; }
  50%  { transform: translateY(28vh) rotate(4deg); opacity: 0.5; }
  92%  { opacity: 0.5; }
  100% { transform: translateY(62vh) rotate(12deg); opacity: 0; }
}

/* 3 oltin reyting yulduzi — pop-in (sakrab chiqadi) */
.d5fin-stars { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: center; gap: clamp(10px, 2.4vw, 22px); }
.d5fin-star { display: inline-block; width: clamp(52px, 9.5vw, 84px); height: clamp(52px, 9.5vw, 84px); filter: drop-shadow(0 8px 16px rgba(216,137,26,0.4)); opacity: 0; transform: scale(0); animation: d5finPop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.d5fin-star svg { width: 100%; height: 100%; display: block; }
.d5fin-star2 { width: clamp(66px, 12vw, 106px); height: clamp(66px, 12vw, 106px); margin-bottom: clamp(8px, 1.6vw, 14px); animation-delay: 0.35s; }
.d5fin-star1 { animation-delay: 0.12s; }
.d5fin-star3 { animation-delay: 0.58s; }
@keyframes d5finPop {
  0%   { opacity: 0; transform: scale(0) rotate(-30deg); }
  70%  { opacity: 1; transform: scale(1.18) rotate(6deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

/* natijalar paneli */
.d5fin-panel { position: relative; z-index: 2; width: min(100%, 560px); margin: 0 auto; display: flex; flex-direction: column; gap: clamp(10px, 2vw, 16px); box-shadow: 0 14px 34px -10px rgba(58, 53, 48, 0.22); }
.d5fin-title { text-align: center; font-size: clamp(18px, 3.2vw, 26px); }
.d5fin-stats { display: flex; flex-direction: column; gap: clamp(8px, 1.6vw, 12px); }
.d5fin-stat { display: flex; align-items: center; gap: clamp(10px, 2vw, 14px); background: #F6F4EF; border-radius: 12px; padding: clamp(10px, 1.8vw, 14px) clamp(12px, 2.2vw, 18px); box-shadow: inset 0 0 0 1px rgba(58,53,48,0.06); }
.d5fin-stat-icon { font-size: clamp(18px, 3vw, 24px); flex-shrink: 0; }
.d5fin-stat-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.d5fin-stat-label { font-weight: 700; font-size: clamp(13px, 1.9vw, 16px); color: #0E0E10; }
.d5fin-stat-sub { font-size: clamp(10px, 1.4vw, 12px); color: #5A5A60; line-height: 1.35; }
.d5fin-stat-val { flex-shrink: 0; font-weight: 700; font-size: clamp(15px, 2.4vw, 20px); color: #FF4F28; white-space: nowrap; }

/* Bit + AI ekrani — xursand idle-bob */
.d5fin-cast { position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: center; gap: clamp(6px, 1.6vw, 16px); }
.d5fin-bob { animation: d5finBob 3.2s ease-in-out infinite; }
.d5fin-bob2 { animation-delay: -1.6s; }
@keyframes d5finBob { 0%, 100% { transform: translateY(0) rotate(-0.8deg); } 50% { transform: translateY(-7px) rotate(0.8deg); } }
.d5fin-bit { height: clamp(88px, 16vw, 138px); width: auto; display: block; filter: drop-shadow(0 8px 14px rgba(14,14,16,0.18)); }
.d5fin-mon { width: clamp(132px, 24vw, 196px); background: rgba(8,26,40,0.92); border: 1.5px solid rgba(91,214,242,0.7); border-radius: 12px; overflow: hidden; box-shadow: 0 0 18px rgba(91,214,242,0.28), inset 0 0 12px rgba(91,214,242,0.08); }
.d5fin-mon-body { display: flex; flex-direction: column; align-items: center; gap: clamp(3px, 0.8vw, 6px); padding: clamp(8px, 1.6vw, 12px); }
.d5fin-face { font-size: clamp(20px, 3.6vw, 30px); font-weight: 700; color: #5BD6F2; text-shadow: 0 0 12px rgba(91,214,242,0.8); }
.d5fin-mon-txt { font-size: clamp(8px, 1.3vw, 11px); font-weight: 700; letter-spacing: 0.6px; color: #7BE495; white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .d5fin-drop { animation: none !important; opacity: 0; }
  .d5fin-star { animation: none !important; opacity: 1; transform: none; }
  .d5fin-bob, .d5fin-bob2 { animation: none !important; }
}

/* === d5cy — 1-SAHIFA KIBER-TEMASI (tungi ko'k fon + Matrix-yomg'ir + glassmorphism) === */
.lesson-root.d5cy { background: #0B132B; color: #FFFFFF; }
.d5cy .amb { display: none; }

/* Matrix/binary yomg'ir — och ko'k 0/1 ustunlari pastga sekin oqadi */
.d5cy-rain { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 8%, #000 90%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 8%, #000 90%, transparent 100%); }
.d5cy-col { position: absolute; top: 0; height: 100%; color: #5BD6F2; text-shadow: 0 0 8px rgba(91,214,242,0.6); }
.d5cy-col-in { display: flex; flex-direction: column; animation: d5cyStream 20s linear infinite; }
.d5cy-copy { display: flex; flex-direction: column; }
.d5cy-copy i { font-style: normal; line-height: 1.9; }
/* ikki nusxa ketma-ket: -50% -> 0 siljish pastga uzluksiz oqim beradi */
@keyframes d5cyStream { 0% { transform: translateY(-50%); } 100% { transform: translateY(0); } }

/* header — quyuq fon, neon ajratkich */
.d5cy .stage-header { background: rgba(11,19,43,0.88); border-bottom: 1px solid rgba(91,214,242,0.12); }
/* footer — kiber-konsol: fon asosiy fonga qo'shilib ketadi, faqat ingichka
   neon-ko'k chiziq ajratib turadi (pastdan yuqoriga yorug'lik taraladi) */
.d5cy .stage-nav {
  background: transparent;
  border-top: 1px solid rgba(91, 214, 242, 0.55);
  box-shadow: 0 -1px 14px -4px rgba(1, 154, 203, 0.45);
}
.d5cy .dot { background: #5BD6F2; box-shadow: 0 0 8px rgba(91,214,242,0.7); }
.d5cy .stage-header button { color: #8FE0F7 !important; }

/* status (• ИСТОРИЯ) va slayd raqamlari — och firuza, kiber-shrift, porlash */
.d5cy .chrome-left { color: #8FE0F7; font-family: 'JetBrains Mono', monospace; text-shadow: 0 0 10px rgba(91,214,242,0.65); }
.d5cy .stage-header .mono { color: #8FE0F7 !important; text-shadow: 0 0 10px rgba(91,214,242,0.65); }

/* progress — yonayotgan neon firuza-yashil "loading" chizig'i */
.d5cy .progress-track { background: rgba(91,214,242,0.14); box-shadow: inset 0 0 6px rgba(1,154,203,0.25); }
.d5cy .progress-bar {
  background: linear-gradient(90deg, #019ACB 0%, #5BD6F2 35%, #7BE495 60%, #5BD6F2 85%, #019ACB 100%);
  background-size: 200% 100%;
  animation: d5cyLoad 2.4s linear infinite;
  box-shadow: 0 0 12px rgba(91,214,242,0.8), 0 0 4px rgba(123,228,149,0.6);
}
@keyframes d5cyLoad { 0% { background-position: 0% 0; } 100% { background-position: -200% 0; } }

/* sarlavha va matnlar — fonda turganlari oq; oq karta ichidagilari qora qoladi */
.d5cy .title { color: #FFFFFF; text-shadow: 0 0 18px rgba(91,214,242,0.3); }
.d5cy .frame .title { color: #0E0E10; text-shadow: none; }
.d5cy .d5s-brand { color: #EAF6FB; }

/* intro-freym (1-sahifa) -> to'q ko'k shaffof oyna (glassmorphism) + neon.
   Boshqa sahifalardagi .frame kartalar OQ qoladi — ichidagi kontent o'qilsin. */
.d5cy .d5-frame {
  background: rgba(22, 34, 56, 0.7);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(91, 214, 242, 0.35);
  box-shadow: 0 0 15px rgba(1, 154, 203, 0.25), inset 0 0 24px rgba(1, 154, 203, 0.08);
}

/* onboard-hint pill — shisha + neon */
.d5cy .g1-onboard { background: rgba(22, 34, 56, 0.7); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid rgba(91,214,242,0.35); box-shadow: 0 0 15px rgba(1,154,203,0.25); }
.d5cy .g1-onboard-txt { color: #8FE0F7; }
.d5cy .g1-onboard-arrow { color: rgba(234,246,251,0.55); }
.d5cy .g1-onboard-ic { stroke: #5BD6F2; }

/* "Дальше/Davom" — dars ochiq payt yorqin firuza, neon nur bilan yonib turadi */
.d5cy .btn-white-accent {
  background: #019ACB;
  color: #FFFFFF;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 16px rgba(1, 154, 203, 0.6), 0 0 0 1px rgba(91, 214, 242, 0.75);
  animation: d5cyBtnPulse 2s ease-in-out infinite;
}
.d5cy .btn-white-accent:hover:not(:disabled) {
  background: #5BD6F2;
  color: #0B132B;
  text-shadow: none;
  box-shadow: 0 0 28px rgba(91, 214, 242, 0.9), 0 0 0 1px #5BD6F2;
}
@keyframes d5cyBtnPulse {
  0%, 100% { box-shadow: 0 0 14px rgba(1, 154, 203, 0.55), 0 0 0 1px rgba(91, 214, 242, 0.7); }
  50%      { box-shadow: 0 0 26px rgba(1, 154, 203, 0.95), 0 0 5px rgba(91, 214, 242, 0.7), 0 0 0 1px rgba(91, 214, 242, 1); }
}
/* bloklangan holat — xira shisha, pulssiz */
.d5cy .btn-white-accent:disabled {
  background: rgba(22, 34, 56, 0.75);
  color: #5BD6F2;
  text-shadow: none;
  opacity: 0.45;
  box-shadow: 0 0 0 1px rgba(91, 214, 242, 0.25);
  animation: none;
}
/* "Назад" — shaffof, chetlari yorug'lik taratuvchi kontur */
.d5cy .btn-ghost {
  color: #EAF6FB;
  background: transparent;
  box-shadow: 0 0 0 1px rgba(91, 214, 242, 0.45), 0 0 12px rgba(1, 154, 203, 0.3), inset 0 0 10px rgba(1, 154, 203, 0.12);
}
.d5cy .btn-ghost:hover:not(:disabled) {
  background: rgba(22, 34, 56, 0.8);
  color: #5BD6F2;
  box-shadow: 0 0 0 1px rgba(91, 214, 242, 0.8), 0 0 18px rgba(1, 154, 203, 0.55), inset 0 0 12px rgba(1, 154, 203, 0.2);
}

/* sarlavhadagi urg'u (accent) so'zlar — to'q fonda xira qizil o'rniga yorqin
   neon-apelsin + issiq porlash (inline T.accent'ni yengish uchun !important).
   Oq karta ichidagi sarlavhalarda asl accent qoladi. */
.d5cy .title .italic { color: #FF8A5C !important; text-shadow: 0 0 18px rgba(255, 110, 60, 0.5), 0 0 4px rgba(255, 138, 92, 0.35); }
.d5cy .frame .title .italic { color: #FF4F28 !important; text-shadow: none; }

/* javob kartalari — hover'da neon-firuza kontur va nur: bosgisi kelsin */
.d5cy .g1-tile:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px -8px rgba(1, 154, 203, 0.6), 0 0 0 2px rgba(91, 214, 242, 0.7), 0 0 18px rgba(91, 214, 242, 0.35);
}
/* noto'g'ri tanlangan karta to'q fonda butunlay yo'qolmasin */
.d5cy .g1-tile-used { opacity: 0.45; }

/* skroll chizig'i — oq tizim scrollbar o'rniga ingichka neon-firuza */
.d5cy .stage-content::-webkit-scrollbar { width: 8px; }
.d5cy .stage-content::-webkit-scrollbar-track { background: rgba(91, 214, 242, 0.07); }
.d5cy .stage-content::-webkit-scrollbar-thumb { background: rgba(91, 214, 242, 0.35); border-radius: 8px; }
.d5cy .stage-content::-webkit-scrollbar-thumb:hover { background: rgba(91, 214, 242, 0.55); }

/* til paneli (RU/UZ, preview) — asos ko'rinish (och tema) */
.d5lang { position: fixed; top: 10px; right: 10px; z-index: 1000; display: flex; gap: 4px; background: #FFFFFF; border-radius: 99px; padding: 4px; box-shadow: 0 4px 12px -4px rgba(58, 53, 48, 0.25); }
.d5lang-btn { border: none; cursor: pointer; border-radius: 99px; padding: 4px 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; background: transparent; color: #5A5A60; transition: all 0.2s; }
.d5lang-btn.on { background: #FF4F28; color: #FFFFFF; }

/* til paneli — kiber-rejim: burchaklari kesilgan (clip-path), neon firuza */
.d5cy .d5lang {
  background: rgba(22, 34, 56, 0.88);
  border-radius: 0;
  padding: 5px 6px;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  box-shadow: none;
  /* glow filter orqali — clip-path kesgan shaklga ergashadi */
  filter: drop-shadow(0 0 8px rgba(1, 154, 203, 0.55));
}
.d5cy .d5lang-btn {
  border-radius: 0;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  color: #8FE0F7;
  text-shadow: 0 0 8px rgba(91, 214, 242, 0.5);
}
.d5cy .d5lang-btn.on {
  background: #5BD6F2;
  color: #0B132B;
  text-shadow: none;
  box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.45);
}

/* === d5cy-lite — 1-SAHIFA: yorug'lik taratuvchi och firuza-havorang gradient === */
.lesson-root.d5cy.d5cy-lite { background: linear-gradient(135deg, #7FA2C6 0%, #56799F 55%, #3D5F88 100%); }
/* och fonda kiber-effekt yaqqol ko'rinsin: raqamlar yirik, qalin va to'qroq firuza
   (font-size inline berilgani uchun !important bilan yengiladi) */
.d5cy-lite .d5cy-col {
  font-size: clamp(16px, 2.2vw, 24px) !important;
  font-weight: 700;
  color: #16C6EE;
  text-shadow: 0 0 10px rgba(22, 198, 238, 0.55);
}
/* och fonda o'qilishi uchun: fondagi sarlavha to'q */
.d5cy-lite .title { color: #0E0E10; text-shadow: 0 0 16px rgba(1, 154, 203, 0.2); }

/* til paneli — shaffof kiber-oyna: yumaloq, xira ko'k shisha + firuza kontur */
.d5cy-lite .d5lang {
  background: rgba(22, 34, 56, 0.1);
  border: 1px solid rgba(1, 154, 203, 0.25);
  border-radius: 12px;
  clip-path: none;
  filter: none;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 14px -6px rgba(1, 154, 203, 0.3);
}
.d5cy-lite .d5lang-btn { clip-path: none; border-radius: 9px; color: #EAF6FB; text-shadow: 0 1px 4px rgba(11, 19, 43, 0.45); }
.d5cy-lite .d5lang-btn.on {
  background: #019ACB;
  color: #FFFFFF;
  box-shadow: 0 0 12px rgba(1, 154, 203, 0.55);
}

/* footer — ochiq kiber-fonga silliq qo'shiladi, ingichka neon-firuza chiziq */
.d5cy-lite .stage-nav {
  background: transparent;
  border-top: 1px solid rgba(1, 154, 203, 0.2);
  box-shadow: 0 -1px 10px -6px rgba(1, 154, 203, 0.35);
}

/* header — footer bilan bir xil: shaffof, ingichka neon-firuza chiziq.
   Och gradient ustida matn/ikonkalar to'q kiber-ko'k rangda o'qiladi. */
.d5cy-lite .stage-header {
  background: transparent;
  border-bottom: 1px solid rgba(1, 154, 203, 0.2);
  box-shadow: 0 1px 10px -6px rgba(1, 154, 203, 0.35);
}
.d5cy-lite .chrome-left { color: #0E2040; text-shadow: none; }
.d5cy-lite .stage-header .mono { color: #0E2040 !important; text-shadow: none; }
.d5cy-lite .stage-header button { color: #01608C !important; }
.d5cy-lite .dot { background: #019ACB; box-shadow: 0 0 8px rgba(1, 154, 203, 0.6); }
.d5cy-lite .progress-track { background: rgba(11, 19, 43, 0.18); box-shadow: inset 0 0 6px rgba(1, 154, 203, 0.2); }

/* "Orqaga" — shaffof, yengil neon-firuza kontur, to'q kiber-ko'k matn */
.d5cy-lite .btn-ghost {
  color: #0E2040;
  background: transparent;
  box-shadow: 0 0 0 1px rgba(1, 154, 203, 0.35), 0 0 10px rgba(1, 154, 203, 0.18);
}
.d5cy-lite .btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.75);
  color: #019ACB;
  box-shadow: 0 0 0 1px rgba(1, 154, 203, 0.6), 0 0 14px rgba(1, 154, 203, 0.35);
}

/* "Davom etish" — yorqin kiber-firuza, 12px yumaloq, neon nurlanish (puls d5cy'dan) */
.d5cy-lite .btn-white-accent {
  background: #019ACB;
  color: #FFFFFF;
  border-radius: 12px;
  text-shadow: none;
  box-shadow: 0 0 16px rgba(1, 154, 203, 0.5), 0 0 0 1px rgba(1, 154, 203, 0.55);
}
.d5cy-lite .btn-white-accent:hover:not(:disabled) {
  background: #0FB6E6;
  color: #FFFFFF;
  box-shadow: 0 0 24px rgba(1, 154, 203, 0.75), 0 0 0 1px #0FB6E6;
}
.d5cy-lite .btn-white-accent:disabled {
  background: rgba(22, 34, 56, 0.18);
  color: #1E3A5C;
  box-shadow: 0 0 0 1px rgba(1, 154, 203, 0.3);
}

@media (prefers-reduced-motion: reduce) {
  .d5cy-col-in { animation: none !important; transform: translateY(-25%); }
  .d5cy .progress-bar { animation: none !important; }
  .d5cy .btn-white-accent { animation: none !important; }
}

`;
