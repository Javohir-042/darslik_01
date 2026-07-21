import React, { useState, useCallback, useEffect } from 'react';
import { Scene3D } from './engine';
import { useVoice, sfxFanfare, sfxFestive } from './audio';
import { VoiceButton, THREE, buildModel, addShadowGround, addDisc, placePick } from './common';

// ============================================================
// MUQOVA · MOTIVATSIYA · SERTIFIKAT — 3D maskot bilan.
// ============================================================

const COVER_VOICE = "Assalomu alaykum! Men — kichkina tulkichaman. " +
  "Sizni o'zim bilan ajoyib bir sayohatga taklif qilaman. " +
  "Tayyor bo'lsangiz, boshlaymiz!";

const TITLE_TEXT = 'Farqini toping!';
const TITLE_COLORS = ['#FF7043', '#FFB03A', '#43C465', '#5AC8FA', '#8E5AE8', '#FF5A8A'];

const CoverTitle = () => (
  <h1 className="d3-cover-title" aria-label={TITLE_TEXT}>
    {TITLE_TEXT.split('').map((ch, i) => (
      ch === ' '
        ? <span key={i} className="d3-title-space"> </span>
        : (
          <span key={i} className="d3-title-ch"
            style={{
              color: TITLE_COLORS[i % TITLE_COLORS.length],
              animationDelay: `${0.15 + i * 0.06}s`,
              transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 3}deg)`,
            }}>
            {ch}
          </span>
        )
    ))}
  </h1>
);

// muqova sahnasi: o'tloq ustida lupali tulkicha, atrofda yulduz va bulutlar
const buildCoverScene = (api, { cheer = false } = {}) => {
  addShadowGround(api);
  addDisc(api, { r: 6.5, color: 0xA8D96A, z: 0.6 });
  const fox = buildModel('foxLens');
  placePick(api, fox, { x: 0, y: 0.35, z: 0.4, scale: 2.1 });
  api.float(fox, { amp: 0.07, speed: 1.5 });
  api.addTick((t) => {
    fox.rotation.y = Math.sin(t * 0.5) * 0.25;
    if (cheer) fox.position.y = 0.35 + Math.abs(Math.sin(t * 3.2)) * 0.25;
  });
  // aylanib turuvchi oltin yulduzlar
  for (let i = 0; i < 6; i++) {
    const st = buildModel('star5');
    const a = (i / 6) * Math.PI * 2;
    placePick(api, st, { x: Math.cos(a) * 3.6, y: 1.6 + (i % 3) * 0.7, z: Math.sin(a) * 1.8 - 0.6, scale: 0.55 });
    api.float(st, { amp: 0.14, speed: 1.2, phase: i * 1.4, spin: 1.2 });
  }
  [[-4.1, 3.4, -3], [4.2, 3.8, -3.4], [-2.6, 4.2, -3.8]].forEach(([x, y, z], i) => {
    const cl = buildModel('cloud');
    placePick(api, cl, { x, y, z, scale: 1.5 - i * 0.2 });
    api.float(cl, { amp: 0.1, speed: 0.7, phase: i * 2 });
  });
  return fox;
};

export const CoverPage3D = ({ onStart }) => {
  const { replay: replayVoice, stop: stopVoice } = useVoice(COVER_VOICE, null);
  const [voiceOn, setVoiceOn] = useState(true);
  const toggleVoice = () => {
    if (voiceOn) { stopVoice(); setVoiceOn(false); }
    else { replayVoice(); setVoiceOn(true); }
  };

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 2.4, 8.8);
    api.camera.lookAt(0, 1.3, 0);
    buildCoverScene(api);
  }, []);

  return (
    <div className="d3-cover fade-up">
      <VoiceButton muted={!voiceOn} onClick={toggleVoice}/>
      <div className="d3-cover-top">
        <CoverTitle/>
      </div>
      <div className="d3-cover-mid">
        <Scene3D onReady={onReady} className="d3-canvas"/>
      </div>
      <div className="d3-cover-bottom">
        <button type="button" className="d3-start-btn" onClick={onStart}>
          Boshlash
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

// ---------- konfetti yomg'iri (DOM) ----------
export const RAIN = [
  { x: 4,  d: 0,   c: '#FF5A8A' }, { x: 12, d: 1.4, c: '#FFD34D' },
  { x: 22, d: 0.6, c: '#5AC8FA' }, { x: 30, d: 2.0, c: '#43C465' },
  { x: 40, d: 0.2, c: '#8E5AE8' }, { x: 48, d: 1.7, c: '#FF7043' },
  { x: 58, d: 0.9, c: '#FFD34D' }, { x: 66, d: 2.3, c: '#FF5A8A' },
  { x: 76, d: 0.4, c: '#43C465' }, { x: 84, d: 1.2, c: '#5AC8FA' },
  { x: 92, d: 1.9, c: '#8E5AE8' }, { x: 97, d: 0.7, c: '#FF7043' },
];
const Rain = () => (
  <div className="d3-rain" aria-hidden="true">
    {RAIN.map(({ x, d, c }, i) => (
      <i key={i} style={{ left: `${x}%`, background: c, animationDelay: `${d}s` }}/>
    ))}
  </div>
);

const GoldStarSVG = () => (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 5 L61 37 L95 37 L67 57 L77 91 L50 71 L23 91 L33 57 L5 37 L39 37 Z"
      fill="#FFD34D" stroke="#E8A21F" strokeWidth="4" strokeLinejoin="round"/>
  </svg>
);

// ---------- ORALIQ MOTIVATSIYA ----------
const MOTIV_VOICE = "Barakalla! Juda chiroyli bajardingiz! Davom etamizmi?";

export const MotivationPage3D = ({ stars, onNext }) => {
  useVoice(MOTIV_VOICE);
  useEffect(() => { const id = setTimeout(sfxFanfare, 500); return () => clearTimeout(id); }, []);

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 2.2, 8.2);
    api.camera.lookAt(0, 1.2, 0);
    buildCoverScene(api, { cheer: true });
  }, []);

  return (
    <div className="d3-final fade-up">
      <Rain/>
      <h1 className="d3-final-title">Ajoyib!</h1>
      <div className="d3-motiv-stars">
        <span className="d3-motiv-star"><GoldStarSVG/></span>
        <span className="d3-motiv-num">x{stars}</span>
      </div>
      <div className="d3-final-canvas">
        <Scene3D onReady={onReady} className="d3-canvas"/>
      </div>
      <button type="button" className="d3-start-btn" onClick={onNext}>
        Davom etish
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  );
};

// ---------- SERTIFIKAT ----------
const CERT_VOICE = "Tabriklayman! Barcha topshiriqlarni bajardingiz. Siz — haqiqiy Diqqat chempionisiz!";

export const CertificatePage3D = ({ stars, total, onReplay, onBack }) => {
  useVoice(CERT_VOICE);
  useEffect(() => { const id = setTimeout(sfxFestive, 700); return () => clearTimeout(id); }, []);

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 2.0, 7.6);
    api.camera.lookAt(0, 1.1, 0);
    addShadowGround(api);
    addDisc(api, { r: 5, color: 0xFFE9A8, z: 0.4 });
    const fox = buildModel('foxLens');
    placePick(api, fox, { x: 0, y: 0.3, z: 0.4, scale: 1.9 });
    api.addTick((t) => {
      fox.position.y = 0.3 + Math.abs(Math.sin(t * 3)) * 0.22;
      fox.rotation.y = Math.sin(t * 0.6) * 0.2;
    });
    const medal = buildModel('medal');
    placePick(api, medal, { x: 1.6, y: 0.9, z: 1.1, scale: 1.1 });
    api.float(medal, { amp: 0.1, speed: 1.6, spin: 0.8 });
    for (let i = 0; i < 5; i++) {
      const st = buildModel('star5');
      const a = (i / 5) * Math.PI * 2 + 0.5;
      placePick(api, st, { x: Math.cos(a) * 3.1, y: 1.8 + (i % 2) * 0.8, z: Math.sin(a) * 1.4 - 0.4, scale: 0.5 });
      api.float(st, { amp: 0.12, speed: 1.3, phase: i, spin: 1.4 });
    }
  }, []);

  return (
    <div className="d3-final fade-up">
      <Rain/>
      <div className="d3-cert">
        <p className="d3-cert-eyebrow">✦ DIQQAT CHEMPIONI — 1-daraja ✦</p>
        <h1 className="d3-cert-title">Tabriklaymiz!</h1>
        <div className="d3-cert-canvas">
          <Scene3D onReady={onReady} className="d3-canvas"/>
        </div>
        <div className="d3-cert-name">
          <span className="d3-cert-name-label">Ism:</span>
          <span className="d3-cert-name-line"/>
        </div>
        <div className="d3-cert-stars">
          <span className="d3-cert-star"><GoldStarSVG/></span>
          <span className="d3-cert-count">{stars} / {total}</span>
          <span className="d3-cert-sub">ta yulduzcha yig'dingiz!</span>
        </div>
      </div>
      <div className="d3-cert-actions">
        <button type="button" className="d3-nav-back" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6"/>
          </svg>
          Orqaga
        </button>
        <button type="button" className="d3-start-btn" onClick={onReplay}>Qayta o'ynash</button>
      </div>
    </div>
  );
};

export { GoldStarSVG };
