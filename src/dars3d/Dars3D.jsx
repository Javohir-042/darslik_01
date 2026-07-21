import React, { useState, useEffect, useRef, useCallback } from 'react';
import { configureLesson, sfxChiling } from './audio';
import { FlightCtx } from './common';
import {
  ShadowPage3D, SHADOW_CFG_MEADOW, SHADOW_CFG_LION,
  ColorSortPage3D, SORT_CFG_FRUITS_3D, SORT_CFG_TOYS_3D,
  SequencePage3D, SEQ_CFG_ANIMALS_3D, SEQ_CFG_SHAPES_3D, SEQ_CFG_COLORS_3D,
  DiffPage3D, DIFF_CFG_TOYS_3D, DIFF_CFG_NIGHT_3D, DIFF_CFG_SPACE_3D,
} from './pagesA';
import {
  ColorChangePage3D, MemoryBasketPage3D, SwapShelfPage3D,
  CountPage3D, COUNT_CFG_FRUITS_3D, COUNT_CFG_CANDY_3D,
  FishPairPage3D, HiddenDuckPage3D, OddOutPage3D,
} from './pagesB';
import { CoverPage3D, MotivationPage3D, CertificatePage3D, GoldStarSVG } from './screens';

// ============================================================
// ░░ Dars01 — 3D VERSIYA (Three.js) · att-1-01-v1-3d
// 2D dars bilan AYNAN bir xil oqim: 21 sahifa, bir xil ovozlar,
// bir xil yulduz limitlari (jami 42), bir xil mexanika.
// Farqi — har o'yin jonli 3D sahna sifatida qurilgan.
// ============================================================

const PAGE_MAX = { 1: 1, 2: 1, 3: 3, 4: 3, 5: 1, 6: 1, 7: 3, 8: 4, 9: 1, 10: 0, 11: 1, 12: 3, 13: 3, 14: 3, 15: 4, 16: 3, 17: 1, 18: 2, 19: 4, 20: 0 };
const TOTAL_STARS = Object.values(PAGE_MAX).reduce((a, b) => a + b, 0); // 42
const LAST_PAGE = 20;

// 2D dagi mini-tulki (topbar brendi uchun kichik SVG)
const FoxMini = () => (
  <svg viewBox="0 0 200 210" aria-hidden="true">
    <path d="M48 44 L62 8 L84 38 Z" fill="#FF8A50"/>
    <path d="M152 44 L138 8 L116 38 Z" fill="#FF8A50"/>
    <circle cx="100" cy="88" r="58" fill="#FF8A50"/>
    <path d="M100 146 q-46 0 -48 -38 q15 15 32 10 q10 17 16 17 q6 0 16 -17 q17 5 32 -10 q-2 38 -48 38 Z" fill="#FFF4E8"/>
    <circle cx="78" cy="82" r="11" fill="#3D3A50"/>
    <circle cx="122" cy="82" r="11" fill="#3D3A50"/>
    <circle cx="82" cy="78" r="4" fill="#FFFFFF"/>
    <circle cx="126" cy="78" r="4" fill="#FFFFFF"/>
    <ellipse cx="100" cy="104" rx="7" ry="5.5" fill="#5C4033"/>
  </svg>
);

export default function Dars3D({ ttsApiBase, voiceGender, onFinished }) {
  configureLesson({ ttsApiBase: ttsApiBase || '', voiceGender: voiceGender || 'f' });

  const [page, setPage] = useState(0);
  const [stars, setStars] = useState(0);
  const [flight, setFlight] = useState(null);
  const [bump, setBump] = useState(false);
  const counterRef = useRef(null);
  const timersRef = useRef([]);
  const pageRef = useRef(0);
  const starsByRef = useRef({});
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Yulduz parvozi — 2D bilan bir xil: pop -> hisoblagichga uchadi -> +1
  const startFlight = useCallback((pt) => {
    const startPage = pageRef.current;
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
        onFinished({ lessonId: 'att-1-01-v1-3d', stars, total: TOTAL_STARS });
      }
    }
    if (page === 0) finishedRef.current = false;
  }, [page, stars, onFinished]);

  const inGame = page >= 1 && page <= LAST_PAGE - 1;
  const nav = { onBack: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => Math.min(LAST_PAGE, p + 1)) };

  // 21 sahifalik xarita — 2D bilan bir xil tartib
  const view = (() => {
    switch (page) {
      case 0:  return <CoverPage3D onStart={() => setPage(1)}/>;
      case 1:  return <ShadowPage3D key={page} cfg={SHADOW_CFG_MEADOW} {...nav}/>;
      case 2:  return <ShadowPage3D key={page} cfg={SHADOW_CFG_LION} {...nav}/>;
      case 3:  return <ColorSortPage3D key={page} cfg={SORT_CFG_FRUITS_3D} {...nav}/>;
      case 4:  return <ColorSortPage3D key={page} cfg={SORT_CFG_TOYS_3D} {...nav}/>;
      case 5:  return <SequencePage3D key={page} cfg={SEQ_CFG_ANIMALS_3D} {...nav}/>;
      case 6:  return <SequencePage3D key={page} cfg={SEQ_CFG_SHAPES_3D} {...nav}/>;
      case 7:  return <DiffPage3D key={page} cfg={DIFF_CFG_TOYS_3D} {...nav}/>;
      case 8:  return <DiffPage3D key={page} cfg={DIFF_CFG_NIGHT_3D} {...nav}/>;
      case 9:  return <ColorChangePage3D key={page} {...nav}/>;
      case 10: return <MotivationPage3D key={page} stars={stars} onNext={nav.onNext}/>;
      case 11: return <MemoryBasketPage3D key={page} {...nav}/>;
      case 12: return <CountPage3D key={page} cfg={COUNT_CFG_FRUITS_3D} {...nav}/>;
      case 13: return <CountPage3D key={page} cfg={COUNT_CFG_CANDY_3D} {...nav}/>;
      case 14: return <FishPairPage3D key={page} {...nav}/>;
      case 15: return <DiffPage3D key={page} cfg={DIFF_CFG_SPACE_3D} {...nav}/>;
      case 16: return <HiddenDuckPage3D key={page} {...nav}/>;
      case 17: return <SequencePage3D key={page} cfg={SEQ_CFG_COLORS_3D} {...nav}/>;
      case 18: return <SwapShelfPage3D key={page} {...nav}/>;
      case 19: return <OddOutPage3D key={page} {...nav}/>;
      default: return <CertificatePage3D stars={stars} total={TOTAL_STARS} onReplay={replay} onBack={nav.onBack}/>;
    }
  })();

  const flyStyle = flight ? (
    flight.phase === 'go'
      ? { left: flight.tx, top: flight.ty, transform: 'translate(-50%, -50%) scale(0.42)' }
      : { left: flight.x, top: flight.y, transform: `translate(-50%, -50%) scale(${flight.phase === 'pop' ? 1.25 : 0.1})` }
  ) : null;

  return (
    <FlightCtx.Provider value={flightApi}>
      <style>{STYLES}</style>
      <div className="d3-root">
        {inGame && (
          <div className="d3-pageline" aria-hidden="true">
            <span className="d3-pageline-fill" style={{ width: `${((page + 1) / (LAST_PAGE + 1)) * 100}%` }}/>
          </div>
        )}
        {inGame && (
          <div className="d3-topbar">
            <div className="d3-brand">
              <span className="d3-brand-fox"><FoxMini/></span>
              <span className="d3-brand-txt" aria-label="Zukko ko'zlar · 3D">
                {"Zukko ko'zlar · 3D".split('').map((ch, i) => (
                  <span key={i} className="d3-brand-ch" aria-hidden="true"
                    style={{ animationDelay: `${i * 0.12}s` }}>
                    {ch === ' ' ? ' ' : ch}
                  </span>
                ))}
              </span>
            </div>
            <div className="d3-top-right">
              <span className="d3-pagenum" aria-label={`Sahifa ${page + 1} / ${LAST_PAGE + 1}`}>
                {String(page + 1).padStart(2, '0')} / {LAST_PAGE + 1}
              </span>
              <div ref={counterRef} className={`d3-counter ${bump ? 'bump' : ''}`}>
                <span className="d3-counter-star"><GoldStarSVG/></span>
                <span className="d3-counter-num">x{stars}</span>
              </div>
            </div>
          </div>
        )}

        {view}

        {flight && (
          <span className={`d3-fly ${flight.phase === 'go' ? 'go' : ''}`} style={flyStyle} aria-hidden="true">
            <GoldStarSVG/>
          </span>
        )}
      </div>
    </FlightCtx.Provider>
  );
}

// ============================================================
// STILLAR — 2D dars uslubida (yumaloq, yumshoq), d3- prefiks
// ============================================================
const STYLES = `
html, body { margin: 0; padding: 0; }
.d3-root, .d3-root * { box-sizing: border-box; }
.d3-root {
  font-family: 'Manrope', 'Nunito', system-ui, sans-serif;
  color: #3D3A50;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: linear-gradient(160deg, #FFE9A8 0%, #CDEFFF 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}
.fade-up { animation: d3FadeUp 0.45s ease both; }
@keyframes d3FadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* ---------- yuqori panel ---------- */
.d3-pageline { position: fixed; top: 0; left: 0; right: 0; height: 7px; background: rgba(255, 255, 255, 0.55); z-index: 50; }
.d3-pageline-fill { display: block; height: 100%; background: linear-gradient(90deg, #FFB03A, #FF7043); border-radius: 0 99px 99px 0; transition: width 0.45s ease; }
.d3-topbar {
  width: 100%; max-width: 1080px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 4px;
  z-index: 5;
}
.d3-brand { display: flex; align-items: center; gap: 9px; }
.d3-brand-fox { width: 44px; height: 44px; display: block; }
.d3-brand-fox svg { width: 100%; height: 100%; }
.d3-brand-txt { font-weight: 800; font-size: 19px; color: #7A5230; display: inline-flex; }
.d3-brand-ch { display: inline-block; animation: d3Wave 2.4s ease-in-out infinite; white-space: pre; }
@keyframes d3Wave { 0%, 100% { transform: none; } 50% { transform: translateY(-3px); } }
.d3-top-right { display: flex; align-items: center; gap: 12px; }
.d3-pagenum { font-weight: 800; font-size: 15px; color: #8A7550; background: rgba(255,255,255,0.7); padding: 7px 12px; border-radius: 99px; }
.d3-counter {
  display: flex; align-items: center; gap: 7px;
  background: #FFFFFF; border-radius: 99px; padding: 7px 16px 7px 9px;
  box-shadow: 0 4px 14px rgba(122, 82, 48, 0.18);
}
.d3-counter.bump { animation: d3Bump 0.5s ease; }
@keyframes d3Bump { 0% { transform: scale(1); } 40% { transform: scale(1.22); } 100% { transform: scale(1); } }
.d3-counter-star { width: 26px; height: 26px; display: block; }
.d3-counter-star svg { width: 100%; height: 100%; }
.d3-counter-num { font-weight: 900; font-size: 18px; color: #E8A21F; }

/* ---------- sahifa qolipi ---------- */
.d3-card {
  width: min(1040px, calc(100% - 24px));
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px 0 14px;
  min-height: 0;
}
.d3-title { text-align: center; font-size: clamp(18px, 2.6vw, 26px); font-weight: 900; margin: 4px 0 10px; }
.d3-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 10px 34px rgba(122, 82, 48, 0.22), inset 0 0 0 6px rgba(255,255,255,0.55);
}
.d3-canvas { position: absolute; inset: 0; }
.d3-canvas canvas { display: block; }
.d3-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 4px 0;
}
.d3-nav-back, .d3-nav-next, .d3-start-btn {
  display: inline-flex; align-items: center; gap: 8px;
  border: none; cursor: pointer; font-family: inherit;
  font-weight: 800; font-size: 17px;
  border-radius: 99px; padding: 13px 24px;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.d3-nav-back { background: #FFFFFF; color: #8A7550; box-shadow: 0 4px 12px rgba(122, 82, 48, 0.16); }
.d3-nav-back:hover { transform: translateY(-2px); }
.d3-nav-next { background: linear-gradient(135deg, #43C465, #2FA45C); color: #fff; box-shadow: 0 6px 16px rgba(47, 164, 92, 0.4); }
.d3-nav-next:hover:not(:disabled) { transform: translateY(-2px); }
.d3-nav-next:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.d3-start-btn {
  background: linear-gradient(135deg, #FFB03A, #FF7043);
  color: #fff; font-size: 21px; padding: 16px 34px;
  box-shadow: 0 8px 22px rgba(255, 112, 67, 0.45);
}
.d3-start-btn:hover { transform: translateY(-2px) scale(1.03); }

/* ---------- ovoz tugmasi ---------- */
.d3-voice-btn {
  position: absolute; top: 14px; right: 14px; z-index: 20;
  width: 48px; height: 48px; border-radius: 50%;
  border: none; cursor: pointer;
  background: #FFFFFF; color: #FF8A50;
  box-shadow: 0 4px 14px rgba(61, 58, 80, 0.22);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s ease;
}
.d3-voice-btn:hover { transform: scale(1.08); }
.d3-voice-btn.off { color: #A9A6B8; }
.d3-voice-btn.bl { top: auto; right: auto; bottom: 14px; left: 14px; }

/* ---------- o'yin ustki elementlari ---------- */
.d3-dots {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 9px; z-index: 15;
}
.d3-dot {
  width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255,255,255,0.75);
  border: 3px dashed #C9BFA8;
  display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 16px; color: #fff;
  transition: all 0.25s ease;
}
.d3-dot.on { background: #43C465; border-color: #2FA45C; border-style: solid; box-shadow: 0 3px 10px rgba(47,164,92,0.4); }
.d3-count {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: clamp(70px, 13vw, 130px); font-weight: 900; color: #FFFFFF;
  text-shadow: 0 6px 24px rgba(61, 58, 80, 0.4);
  z-index: 15; pointer-events: none;
  animation: d3Pop 0.9s ease both;
}
@keyframes d3Pop { 0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; } 30% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; } }
.d3-lamps { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 15; }
.d3-bulb {
  width: 34px; height: 34px; border-radius: 50%;
  background: #D9D4C8; border: 3px solid #B8B2A2;
  transition: all 0.3s ease;
}
.d3-bulb.on {
  background: radial-gradient(circle at 40% 35%, #FFF3C4, #FFD34D);
  border-color: #E8A21F;
  box-shadow: 0 0 18px 4px rgba(255, 211, 77, 0.65);
}
.d3-badges { position: absolute; top: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: clamp(60px, 18vw, 210px); z-index: 15; pointer-events: none; }
.d3-badge {
  width: 42px; height: 42px; border-radius: 50%;
  background: #FFFFFF; border: 3px dashed #C9BFA8;
  display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 20px; color: #8A7550;
  transition: all 0.25s ease;
}
.d3-badge.on { background: #43C465; border-color: #2FA45C; border-style: solid; color: #fff; }
.d3-nums {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 14px; z-index: 15;
}
.d3-num {
  width: 60px; height: 60px; border-radius: 22px;
  border: none; cursor: pointer; font-family: inherit;
  font-weight: 900; font-size: 28px; color: #3D3A50;
  background: #FFFFFF;
  box-shadow: 0 5px 14px rgba(61, 58, 80, 0.2);
  transition: transform 0.15s ease;
}
.d3-num:hover:not(:disabled) { transform: translateY(-3px) scale(1.06); }
.d3-num.used { opacity: 0.35; cursor: default; }
.d3-shake { animation: d3Shake 0.5s ease; }
@keyframes d3Shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); } 40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); } 80% { transform: translateX(6px); }
}

/* ---------- muqova ---------- */
.d3-cover {
  width: 100%; flex: 1;
  display: flex; flex-direction: column; align-items: center;
  position: relative; min-height: 100vh; min-height: 100dvh;
}
.d3-cover-top { padding: 34px 12px 0; z-index: 5; }
.d3-cover-title { margin: 0; text-align: center; font-size: clamp(38px, 7vw, 74px); font-weight: 900; }
.d3-title-ch { display: inline-block; animation: d3TitlePop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; text-shadow: 0 4px 0 rgba(255,255,255,0.7), 0 8px 18px rgba(122, 82, 48, 0.25); }
.d3-title-space { display: inline-block; width: 0.4em; }
@keyframes d3TitlePop { 0% { opacity: 0; transform: scale(0.2) translateY(30px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.d3-cover-mid { flex: 1; width: min(880px, calc(100% - 24px)); position: relative; min-height: 0; }
.d3-cover-bottom { padding: 8px 0 40px; z-index: 5; }

/* ---------- final ekranlar ---------- */
.d3-final {
  width: 100%; flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; position: relative; padding: 20px 12px 34px;
  min-height: 100vh; min-height: 100dvh;
}
.d3-final-title { margin: 6px 0 0; font-size: clamp(36px, 6vw, 60px); font-weight: 900; color: #FF7043; text-shadow: 0 4px 0 rgba(255,255,255,0.75); z-index: 5; }
.d3-final-canvas { width: min(700px, calc(100% - 20px)); height: min(44vh, 420px); position: relative; }
.d3-motiv-stars { display: flex; align-items: center; gap: 10px; z-index: 5; }
.d3-motiv-star { width: 52px; height: 52px; display: block; animation: d3Bump 1.6s ease infinite; }
.d3-motiv-star svg { width: 100%; height: 100%; }
.d3-motiv-num { font-size: 34px; font-weight: 900; color: #E8A21F; }
.d3-rain { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2; }
.d3-rain i {
  position: absolute; top: -20px;
  width: 12px; height: 12px; border-radius: 3px;
  animation: d3Rain 3.4s linear infinite;
}
@keyframes d3Rain {
  0% { transform: translateY(-30px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(540deg); opacity: 0.7; }
}
.d3-cert {
  background: #FFFDF6;
  border: 6px solid #FFD34D;
  outline: 4px solid #E8A21F;
  border-radius: 30px;
  padding: 20px 30px 22px;
  width: min(640px, calc(100% - 16px));
  display: flex; flex-direction: column; align-items: center;
  box-shadow: 0 16px 44px rgba(122, 82, 48, 0.3);
  z-index: 5;
}
.d3-cert-eyebrow { margin: 0; font-weight: 800; letter-spacing: 2px; font-size: 13px; color: #B8912E; }
.d3-cert-title { margin: 4px 0 6px; font-size: clamp(30px, 5vw, 44px); font-weight: 900; color: #FF7043; }
.d3-cert-canvas { width: 100%; height: min(34vh, 300px); position: relative; border-radius: 20px; overflow: hidden; background: linear-gradient(180deg, #CDEFFF, #E3F6E3); }
.d3-cert-name { display: flex; align-items: baseline; gap: 12px; margin-top: 14px; width: 80%; }
.d3-cert-name-label { font-weight: 800; font-size: 18px; color: #8A7550; }
.d3-cert-name-line { flex: 1; border-bottom: 3px dotted #C9BFA8; height: 22px; }
.d3-cert-stars { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.d3-cert-star { width: 40px; height: 40px; display: block; }
.d3-cert-star svg { width: 100%; height: 100%; }
.d3-cert-count { font-size: 26px; font-weight: 900; color: #E8A21F; }
.d3-cert-sub { font-weight: 700; color: #8A7550; }
.d3-cert-actions { display: flex; gap: 16px; z-index: 5; }

/* ---------- uchuvchi yulduzcha ---------- */
.d3-fly {
  position: fixed; z-index: 90;
  width: 54px; height: 54px;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.d3-fly svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 10px rgba(232, 162, 31, 0.55)); }
.d3-fly.go { transition: left 0.85s cubic-bezier(0.5, -0.1, 0.3, 1), top 0.85s cubic-bezier(0.5, -0.1, 0.3, 1), transform 0.85s ease; }

@media (max-width: 640px) {
  .d3-topbar { padding: 12px 10px 2px; }
  .d3-brand-txt { font-size: 15px; }
  .d3-nums { gap: 9px; }
  .d3-num { width: 50px; height: 50px; font-size: 23px; }
  .d3-footer button { font-size: 15px; padding: 11px 18px; }
}
`;
