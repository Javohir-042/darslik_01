import React, { useState } from 'react';
import * as THREE from 'three';
import { buildModel } from './models';

// ============================================================
// UMUMIY QOLIP VA YORDAMCHILAR — 3D sahifalar uchun.
// Mexanika 2D dars bilan bir xil: to'g'ri -> konfetti + yulduz;
// xato -> silkinish + "hmm"; sahifa faqat "Keyingi" bilan o'tadi.
// ============================================================

export const FlightCtx = React.createContext({ onCorrect: () => {} });
export const useFlightApi = () => React.useContext(FlightCtx);

// ---------- DOM qolip: sarlavha + kontent + futer ----------
export const PageShell = ({ title, children, onBack, onNext, nextOk }) => (
  <div className="d3-card fade-up">
    {title && <h2 className="d3-title">{title}</h2>}
    {children}
    <div className="d3-footer">
      <button type="button" className="d3-nav-back" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6"/>
        </svg>
        Orqaga
      </button>
      <button type="button" className="d3-nav-next" disabled={!nextOk} onClick={onNext}>
        Keyingi
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  </div>
);

// ---------- karnaycha tugmasi (2D dagi bilan bir xil xatti-harakat) ----------
export const VoiceButton = ({ muted, onClick, corner = 'tr' }) => (
  <button
    type="button"
    className={`d3-voice-btn ${corner !== 'tr' ? corner : ''} ${muted ? 'off' : ''}`}
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

export const PageVoice = ({ voice, corner = 'bl' }) => {
  const [muted, setMuted] = useState(false);
  const onClick = () => {
    if (voice.isSpeaking()) { voice.stop(); setMuted(true); }
    else { voice.replay(); setMuted(false); }
  };
  return <VoiceButton corner={corner} muted={muted} onClick={onClick}/>;
};

// ---------- 3D sahna yordamchilari ----------

// soya qabul qiluvchi ko'rinmas yer (CSS gradient fon ustида soya ko'rinadi)
export function addShadowGround(api, y = 0) {
  const geo = new THREE.PlaneGeometry(30, 30);
  const mat = new THREE.ShadowMaterial({ opacity: 0.18 });
  const p = new THREE.Mesh(geo, mat);
  p.rotation.x = -Math.PI / 2;
  p.position.y = y;
  p.receiveShadow = true;
  api.scene.add(p);
  return p;
}

// rangli dumaloq maydoncha (o'tloq/sahna poli)
export function addDisc(api, { r = 6, color = 0xA8D96A, y = -0.02, x = 0, z = 0 } = {}) {
  const geo = new THREE.CylinderGeometry(r, r * 1.02, 0.12, 48);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const d = new THREE.Mesh(geo, mat);
  d.position.set(x, y - 0.06, z);
  d.receiveShadow = true;
  api.scene.add(d);
  return d;
}

// oq yumaloq pedestal — variant kartalarining 3D muqobili
export function addPedestal(api, { x = 0, z = 0, r = 0.85, color = 0xFFFFFF } = {}) {
  const geo = new THREE.CylinderGeometry(r, r * 1.06, 0.16, 36);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const p = new THREE.Mesh(geo, mat);
  p.position.set(x, 0.08, z);
  p.receiveShadow = true;
  p.castShadow = true;
  api.scene.add(p);
  return p;
}

// 3D so'roq belgisi (torus yoyi + tayoqcha + nuqta)
export function buildQuestionMark(color = 0xF6A623) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 12, 24, Math.PI * 1.5), mat);
  arc.rotation.z = Math.PI * 0.75;
  arc.position.y = 0.75;
  g.add(arc);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 12), mat);
  stem.position.set(0, 0.32, 0);
  g.add(stem);
  const dotm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
  dotm.position.set(0, 0.02, 0);
  g.add(dotm);
  g.traverse(ch => { if (ch.isMesh) ch.castShadow = true; });
  return g;
}

// modelni pedestal ustiga qo'yish + bosish nishoni qilish
export function placePick(api, group, { x = 0, y = 0, z = 0, scale = 1, pick = null, rotY = 0 } = {}) {
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  group.rotation.y = rotY;
  if (pick) {
    group.userData.pick = pick;
    api.clickables.push(group);
  }
  api.scene.add(group);
  return group;
}

// guruh ranglarini xira/yorqin holatga o'tkazish uchun asl ranglarni eslab qolamiz
export function rememberColors(group) {
  group.traverse(ch => {
    if (ch.isMesh && ch.material && ch.material.color && !ch.userData.baseColor) {
      ch.userData.baseColor = ch.material.color.clone();
    }
  });
}

// modelning yarim shaffof "sharpa" versiyasi (g'oyib bo'lgan narsa uchun)
export function makeGhostly(group, opacity = 0.35) {
  group.traverse(ch => {
    if (ch.isMesh && ch.material) {
      ch.material.transparent = true;
      ch.material.opacity = opacity;
      ch.castShadow = false;
    }
  });
  return group;
}

// ko'rinmas, lekin bosiladigan nishon (ghost-farq uchun)
export function buildHitBox(w = 1, h = 1, d = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ob'ektni silliq uchirib borish (ease-out), tugagach onDone
export function flyTo(api, obj, target, dur = 0.35, onDone) {
  const from = obj.position.clone();
  const t0 = performance.now();
  const stop = api.addTick(() => {
    const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
    const e = 1 - Math.pow(1 - k, 3);
    obj.position.lerpVectors(from, target, e);
    if (k >= 1) { stop(); if (onDone) onDone(); }
  });
  return stop;
}

export { buildModel, THREE };
