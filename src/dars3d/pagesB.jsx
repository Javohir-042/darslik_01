import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Scene3D } from './engine';
import { useVoice, useMemorizeCountdown, sfxDingDing, sfxHmm } from './audio';
import {
  PageShell, PageVoice, useFlightApi, THREE, buildModel,
  addShadowGround, addDisc, addPedestal, placePick, flyTo,
} from './common';
import { BG } from './pagesA';

// ============================================================
// B-FORMATLAR: yodlash o'yinlari (rang o'zgardi / savat / polka) ·
// sanoq · juftini top (baliqchalar) · berkinmachoq · ortiqchasini top.
// ============================================================

// ============================================================
// QAYSI DO'STIMIZ RANGINI O'ZGARTIRDI? — o'tloqda 4 do'st;
// sanoqdan keyin quyoncha QORA rangga bo'yalib qoladi.
// ============================================================
const CC_VOICE = "Do'stlarni yaxshilab yodlab oling!";
const CC_QUESTION = "Qaysi biri o'zgarib qoldi? Topib bosing!";
const CC_ANIMALS = ['rabbit', 'cat', 'dog', 'cow'];
const CC_SECRET = { id: 'rabbit', tint: '#3A3A3A' };

export const ColorChangePage3D = ({ onBack, onNext }) => {
  const voice = useVoice(CC_VOICE);
  const { onCorrect } = useFlightApi();
  const [lamps, setLamps] = useState(3);
  const [phase, setPhase] = useState('show');
  const [solved, setSolved] = useState(false);
  const solvedRef = useRef(false);
  const sceneRef = useRef(null);

  useMemorizeCountdown({
    voice,
    question: CC_QUESTION,
    onTick: (n) => setLamps(n),
    onDone: () => { setLamps(0); setPhase('quiz'); },
  });

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: 0xA8D96A, z: 0.4 });
    const animals = {};
    CC_ANIMALS.forEach((kind, i) => {
      const g = buildModel(kind);
      placePick(api, g, { x: (i - 1.5) * 2.1, z: -0.7, scale: 1.25 });
      api.float(g, { amp: 0.04, speed: 1.5, phase: i * 1.2 });
      animals[kind] = g;
    });
    [{ k: 'tree', x: -4.7, z: -2.9, s: 1.6 }, { k: 'tree', x: 4.7, z: -3.0, s: 1.5 },
     { k: 'flower', x: -3.9, z: 0.9, s: 0.7 }, { k: 'flower', x: 3.9, z: 1.0, s: 0.7 },
     { k: 'cloud', x: -3.2, y: 3.4, z: -3.8, s: 1.2 }, { k: 'cloud', x: 3.4, y: 3.7, z: -4.0, s: 1.0 }]
      .forEach(d => {
        const g = buildModel(d.k);
        placePick(api, g, { x: d.x, y: d.y || 0, z: d.z, scale: d.s });
      });
    sceneRef.current = { api, animals };
    return () => { sceneRef.current = null; };
  }, []);

  // savol bosqichi: sirli do'st rangi o'zgaradi + variantlar chiqadi
  useEffect(() => {
    if (phase !== 'quiz') return;
    const s = sceneRef.current;
    if (!s) return;
    const { api, animals } = s;
    const old = animals[CC_SECRET.id];
    const changed = buildModel(CC_SECRET.id, { tint: CC_SECRET.tint });
    changed.position.copy(old.position);
    changed.scale.copy(old.scale);
    api.scene.remove(old);
    api.scene.add(changed);

    CC_ANIMALS.forEach((kind, i) => {
      const x = (i - 1.5) * 2.3;
      addPedestal(api, { x, z: 2.1, r: 0.75 });
      const g = buildModel(kind);
      placePick(api, g, {
        x, y: 0.16, z: 2.1, scale: 0.8,
        pick: (root, screenPt) => {
          if (solvedRef.current) return;
          if (kind === CC_SECRET.id) {
            solvedRef.current = true;
            setSolved(true);
            sfxDingDing();
            const wp = new THREE.Vector3();
            root.getWorldPosition(wp);
            wp.y += 0.7;
            api.burst(wp);
            api.ringOk(new THREE.Vector3(x, 0.22, 2.1), 0.95);
            onCorrect(screenPt, true);
          } else {
            sfxHmm();
            api.shake(root);
          }
        },
      });
    });
  }, [phase]);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d3-stage" style={{ background: BG.meadow }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        {phase === 'show' && (
          <div className="d3-lamps" aria-label={`${lamps} soniya qoldi`}>
            {[0, 1, 2].map(i => <span key={i} className={`d3-bulb ${i < lamps ? 'on' : ''}`}/>)}
          </div>
        )}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// NIMA YO'QOLDI? — savat oldida 4 meva; sanoqdan keyin uzum yo'qoladi,
// qolganlari BOSHQA tartibda; variantlardan yo'qolganini top.
// ============================================================
const MEM_VOICE = "Savatdagi mevalarni yaxshilab yodlab oling!";
const MEM_QUESTION = "Savatdan nima yo'qoldi? Topib bosing!";
const MEM_FRUITS = [
  { id: 'apple',  kind: 'apple',  c: '#FF5A4E' },
  { id: 'banana', kind: 'banana', c: '#FFD34D' },
  { id: 'grape',  kind: 'grape',  c: '#8E5AE8' },
  { id: 'pear',   kind: 'pear',   c: '#A8CC5A' },
];
const MEM_MISSING = MEM_FRUITS[2];
const MEM_QUIZ_ORDER = [MEM_FRUITS[3], MEM_FRUITS[0], MEM_FRUITS[1]];

export const MemoryBasketPage3D = ({ onBack, onNext }) => {
  const voice = useVoice(MEM_VOICE);
  const { onCorrect } = useFlightApi();
  const [phase, setPhase] = useState('show');
  const [count, setCount] = useState(null);
  const [solved, setSolved] = useState(false);
  const solvedRef = useRef(false);
  const sceneRef = useRef(null);

  useMemorizeCountdown({
    voice,
    question: MEM_QUESTION,
    onTick: setCount,
    onDone: () => { setCount(null); setPhase('quiz'); },
  });

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: 0xEFE3C2, z: 0.4 });
    const basket = buildModel('basket');
    placePick(api, basket, { x: 0, z: -1.4, scale: 2.2 });
    const fruits = {};
    MEM_FRUITS.forEach((f, i) => {
      const g = buildModel(f.kind, { c: f.c });
      placePick(api, g, { x: (i - 1.5) * 1.7, z: 0.5, scale: 1.05 });
      fruits[f.id] = g;
    });
    sceneRef.current = { api, fruits };
    return () => { sceneRef.current = null; };
  }, []);

  useEffect(() => {
    if (phase !== 'quiz') return;
    const s = sceneRef.current;
    if (!s) return;
    const { api, fruits } = s;
    // uzum yo'qoladi, qolganlar boshqa tartibda joylashadi
    api.scene.remove(fruits[MEM_MISSING.id]);
    MEM_QUIZ_ORDER.forEach((f, i) => {
      flyTo(api, fruits[f.id], new THREE.Vector3((i - 1) * 1.9, 0, 0.5), 0.5);
    });
    // variantlar
    MEM_FRUITS.forEach((f, i) => {
      const x = (i - 1.5) * 2.3;
      addPedestal(api, { x, z: 2.2, r: 0.72 });
      const g = buildModel(f.kind, { c: f.c });
      placePick(api, g, {
        x, y: 0.16, z: 2.2, scale: 0.78,
        pick: (root, screenPt) => {
          if (solvedRef.current) return;
          if (f.id === MEM_MISSING.id) {
            solvedRef.current = true;
            setSolved(true);
            sfxDingDing();
            const wp = new THREE.Vector3();
            root.getWorldPosition(wp);
            wp.y += 0.6;
            api.burst(wp);
            api.ringOk(new THREE.Vector3(x, 0.22, 2.2), 0.9);
            onCorrect(screenPt, true);
          } else {
            sfxHmm();
            api.shake(root);
          }
        },
      });
    });
  }, [phase]);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d3-stage" style={{ background: BG.fruits }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        {count !== null && <span key={count} className="d3-count">{count}</span>}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// QAYSI IKKITASI JOY ALMASHDI? — yog'och polkada 4 o'yinchoq;
// sanoqdan keyin mashina va koptok joy almashadi.
// ============================================================
const SWAP_VOICE = "O'yinchoqlar tartibini yaxshilab yodlab oling!";
const SWAP_QUESTION = "Qaysi ikkitasi joy almashdi? Topib bosing!";
const SWAP_TOYS = [
  { id: 'car',  kind: 'car',  c: '#F5C518' },
  { id: 'bear', kind: 'bear', c: '#C98A5B' },
  { id: 'ball', kind: 'ball', c: '#43C465' },
  { id: 'gift', kind: 'gift', c: '#B06BFF' },
];
const SWAP_PAIR = ['car', 'ball'];

export const SwapShelfPage3D = ({ onBack, onNext }) => {
  const voice = useVoice(SWAP_VOICE);
  const { onCorrect } = useFlightApi();
  const [phase, setPhase] = useState('show');
  const [count, setCount] = useState(null);
  const [foundCount, setFoundCount] = useState(0);
  const foundRef = useRef(new Set());
  const sceneRef = useRef(null);

  useMemorizeCountdown({
    voice,
    question: SWAP_QUESTION,
    onTick: setCount,
    onDone: () => { setCount(null); setPhase('quiz'); },
  });

  const onReady = useCallback((api) => {
    addShadowGround(api);
    // yog'och polka
    const plankMat = new THREE.MeshStandardMaterial({ color: 0xC98A4B, roughness: 0.75 });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.22, 1.9), plankMat);
    plank.position.set(0, 0.65, -0.6);
    plank.castShadow = true;
    plank.receiveShadow = true;
    api.scene.add(plank);
    [-3.3, 3.3].forEach(x => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.68, 1.5), plankMat.clone());
      leg.position.set(x, 0.31, -0.6);
      leg.castShadow = true;
      api.scene.add(leg);
    });
    const toys = {};
    SWAP_TOYS.forEach((t, i) => {
      const g = buildModel(t.kind, { c: t.c });
      placePick(api, g, { x: (i - 1.5) * 1.8, y: 0.76, z: -0.6, scale: 1.0 });
      toys[t.id] = g;
    });
    sceneRef.current = { api, toys };
    return () => { sceneRef.current = null; };
  }, []);

  useEffect(() => {
    if (phase !== 'quiz') return;
    const s = sceneRef.current;
    if (!s) return;
    const { api, toys } = s;
    // mashina va koptok joy almashadi (uchib borib)
    const a = toys[SWAP_PAIR[0]];
    const b = toys[SWAP_PAIR[1]];
    const pa = a.position.clone();
    const pb = b.position.clone();
    flyTo(api, a, pb, 0.6);
    flyTo(api, b, pa, 0.6);
    // variantlar
    SWAP_TOYS.forEach((t, i) => {
      const x = (i - 1.5) * 2.3;
      addPedestal(api, { x, z: 2.2, r: 0.72 });
      const g = buildModel(t.kind, { c: t.c });
      placePick(api, g, {
        x, y: 0.16, z: 2.2, scale: 0.72,
        pick: (root, screenPt) => {
          const found = foundRef.current;
          if (found.size === SWAP_PAIR.length || found.has(t.id)) return;
          if (SWAP_PAIR.includes(t.id)) {
            found.add(t.id);
            setFoundCount(found.size);
            root.userData.disabled = true;
            sfxDingDing();
            const wp = new THREE.Vector3();
            root.getWorldPosition(wp);
            wp.y += 0.6;
            api.burst(wp);
            api.ringOk(new THREE.Vector3(x, 0.22, 2.2), 0.9);
            onCorrect(screenPt, found.size === SWAP_PAIR.length);
          } else {
            sfxHmm();
            api.shake(root);
          }
        },
      });
    });
  }, [phase]);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={foundCount === SWAP_PAIR.length}>
      <div className="d3-stage" style={{ background: BG.toys }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        {count !== null && <span key={count} className="d3-count">{count}</span>}
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// SANOQ — 3 aylana maydonchada har xil sondagi narsalar; pastdagi
// raqam tugmalaridan (DOM) to'g'risini tanlash. Faol maydoncha pulslanadi.
// ============================================================
export const CountPage3D = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [answered, setAnswered] = useState({});
  const [shakeN, setShakeN] = useState(null);
  const sceneRef = useRef(null);
  const shakeTimer = useRef(null);
  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const doneCount = Object.keys(answered).length;
  const allDone = doneCount === cfg.groups.length;
  const active = cfg.groups.findIndex((_, i) => !answered[i]);

  const onReady = useCallback((api) => {
    addShadowGround(api);
    const platforms = [];
    cfg.groups.forEach((g, i) => {
      const x = (i - 1) * 2.9;
      const plat = addPedestal(api, { x, z: 0.3, r: 1.25, color: 0xFFFFFF });
      // narsalar doira bo'ylab
      const items = new THREE.Group();
      for (let k = 0; k < g.n; k++) {
        const a = (k / g.n) * Math.PI * 2 + 0.6;
        const rr = g.n === 2 ? 0.42 : 0.62;
        const item = buildModel(g.kind, { c: g.c });
        item.position.set(x + Math.cos(a) * rr, 0.16, 0.3 + Math.sin(a) * rr * 0.75);
        item.scale.setScalar(0.52);
        items.add(item);
      }
      api.scene.add(items);
      platforms.push({ plat, items, x });
    });
    // faol maydoncha "nafas oladi"
    api.addTick((t) => {
      const s = sceneRef.current;
      if (!s) return;
      platforms.forEach((p, i) => {
        const isActive = i === s.active;
        const k = isActive ? 1 + Math.sin(t * 3) * 0.04 : 1;
        p.plat.scale.set(k, 1, k);
        p.items.position.y = isActive ? Math.sin(t * 3) * 0.04 : 0;
      });
    });
    sceneRef.current = { api, platforms, active: 0 };
    return () => { sceneRef.current = null; };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.active = active;
  }, [active]);

  const pickNum = (num) => {
    const s = sceneRef.current;
    if (allDone || !s) return;
    if (num === cfg.groups[active].n) {
      const next = { ...answered, [active]: true };
      setAnswered(next);
      sfxDingDing();
      const p = s.platforms[active];
      const wp = new THREE.Vector3(p.x, 1.0, 0.3);
      s.api.burst(wp);
      s.api.ringOk(new THREE.Vector3(p.x, 0.22, 0.3), 1.3);
      onCorrect(s.api.worldToScreen(wp), Object.keys(next).length === cfg.groups.length);
    } else {
      sfxHmm();
      if (s) s.api.shake(s.platforms[active].plat);
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
      <div className="d3-stage" style={{ background: cfg.bg }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <div className="d3-badges" aria-hidden="true">
          {cfg.groups.map((g, i) => (
            <span key={i} className={`d3-badge ${answered[i] ? 'on' : ''}`}>{answered[i] ? g.n : '?'}</span>
          ))}
        </div>
        {!allDone && (
          <div className="d3-nums">
            {cfg.numbers.map((num) => {
              const used = cfg.groups.some((g, i) => answered[i] && g.n === num);
              return (
                <button key={num} type="button"
                  className={`d3-num ${used ? 'used' : ''} ${shakeN === num ? 'd3-shake' : ''}`}
                  disabled={used} onClick={() => pickNum(num)}>
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

export const COUNT_CFG_FRUITS_3D = {
  voice: "Nechta meva bor? Sanab, to'g'ri raqamni bosing!",
  groups: [
    { n: 3, kind: 'apple',    c: '#FF5A4E' },
    { n: 2, kind: 'pear',     c: '#A8CC5A' },
    { n: 4, kind: 'mushroom', c: '#FF5A4E' },
  ],
  numbers: [2, 4, 3],
  bg: BG.fruits,
};
export const COUNT_CFG_CANDY_3D = {
  voice: "Nechta shirinlik bor? Sanab, to'g'ri raqamni bosing!",
  groups: [
    { n: 4, kind: 'candy',    c: '#FF5A8A' },
    { n: 3, kind: 'icecream', c: '#F2A9C4' },
    { n: 5, kind: 'cookie',   c: '#D9A25F' },
  ],
  numbers: [3, 5, 4],
  bg: BG.candy,
};

// ============================================================
// JUFTINI TOP — dengiz tubida 6 baliqcha (3 juft); juft topilsa
// ikkinchisi birinchisining YONIGA suzib boradi.
// ============================================================
const FISH_VOICE = "Bir xil baliqchalarni topib, juftlarini birlashtiring!";
const FISH_SLOTS = [
  { x: -2.7, y: 2.6 }, { x: 0, y: 2.6 }, { x: 2.7, y: 2.6 },
  { x: -2.7, y: 1.0 }, { x: 0, y: 1.0 }, { x: 2.7, y: 1.0 },
];
const FISH_FIXED = [
  { id: 'f0a', pair: 0, kind: 'fishA' },
  { id: 'f1a', pair: 1, kind: 'fishB' },
  { id: 'f2a', pair: 2, kind: 'fishC' },
  { id: 'f1b', pair: 1, kind: 'fishB' },
  { id: 'f2b', pair: 2, kind: 'fishC' },
  { id: 'f0b', pair: 0, kind: 'fishA' },
];

export const FishPairPage3D = ({ onBack, onNext }) => {
  const voice = useVoice(FISH_VOICE);
  const { onCorrect } = useFlightApi();
  const [matchedCount, setMatchedCount] = useState(0);

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 1.8, 9.2);
    api.camera.lookAt(0, 1.6, 0);
    // qum tubi
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.5, 40),
      new THREE.MeshStandardMaterial({ color: 0xEFD9A0, roughness: 0.95 })
    );
    sand.position.y = -0.3;
    sand.receiveShadow = true;
    api.scene.add(sand);
    // suv o'tlari
    [[-4.2, 1.3], [-3.4, 0.9], [4.1, 1.4], [3.3, 1.0]].forEach(([x, s], i) => {
      const w = buildModel('seaweed', { c: i % 2 ? '#54D584' : '#2FA45C' });
      placePick(api, w, { x, y: -0.1, z: -1.5, scale: s * 1.6 });
      api.addTick((t) => { w.rotation.z = Math.sin(t * 1.3 + i) * 0.09; });
    });
    // pufakchalar
    const bubbles = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 + (i % 3) * 0.03, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xCDEFFF, transparent: true, opacity: 0.45, roughness: 0.2 })
      );
      b.position.set(-4 + i * 1.1, (i % 4) * 1.2, -1.8);
      api.scene.add(b);
      bubbles.push({ b, sp: 0.5 + (i % 3) * 0.25, x0: -4 + i * 1.1, ph: i });
    }
    api.addTick((t, dt) => {
      bubbles.forEach(bb => {
        bb.b.position.y += bb.sp * dt;
        bb.b.position.x = bb.x0 + Math.sin(t * 1.5 + bb.ph) * 0.15;
        if (bb.b.position.y > 4.6) bb.b.position.y = -0.2;
      });
    });

    // baliqchalar
    const slots = {};
    const fishG = {};
    const matched = {};
    let sel = null;
    let selRing = null;
    const mkRing = () => {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.05, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0xFFD34D })
      );
      r.visible = false;
      api.scene.add(r);
      return r;
    };
    selRing = mkRing();

    FISH_FIXED.forEach((f, i) => {
      slots[f.id] = i;
      const g = buildModel(f.kind);
      const s = FISH_SLOTS[i];
      placePick(api, g, { x: s.x, y: s.y, z: 0, scale: 1.25 });
      api.float(g, { amp: 0.09, speed: 1.3 + (i % 3) * 0.2, phase: i * 1.1 });
      fishG[f.id] = g;
      g.userData.pick = (root, screenPt) => {
        if (Object.keys(matched).length === 6 || matched[f.id]) return;
        if (sel === f.id) {
          sel = null;
          selRing.visible = false;
          return;
        }
        if (sel === null) {
          sel = f.id;
          selRing.visible = true;
          return;
        }
        const first = FISH_FIXED.find(x => x.id === sel);
        if (first.pair === f.pair) {
          matched[sel] = true;
          matched[f.id] = true;
          const firstId = sel;
          sel = null;
          selRing.visible = false;
          // ikkinchisi birinchisining yonidagi slotga suzib boradi
          const sa = slots[firstId];
          const target = sa % 3 === 2 ? sa - 1 : sa + 1;
          if (slots[f.id] !== target) {
            const occupant = FISH_FIXED.find(x => slots[x.id] === target).id;
            const oldSlot = slots[f.id];
            slots[f.id] = target;
            slots[occupant] = oldSlot;
            const ts = FISH_SLOTS[target];
            const os = FISH_SLOTS[oldSlot];
            flyTo(api, fishG[f.id], new THREE.Vector3(ts.x, ts.y, 0), 0.7);
            flyTo(api, fishG[occupant], new THREE.Vector3(os.x, os.y, 0), 0.7);
          }
          sfxDingDing();
          const wp = new THREE.Vector3();
          root.getWorldPosition(wp);
          api.burst(wp);
          const n = Object.keys(matched).length;
          setMatchedCount(n);
          onCorrect(screenPt, n === 6);
        } else {
          sfxHmm();
          api.shake(fishG[sel]);
          api.shake(root);
          sel = null;
          selRing.visible = false;
        }
      };
      api.clickables.push(g);
    });
    // tanlov halqasi tanlangan baliqqa ergashadi
    api.addTick(() => {
      if (sel && fishG[sel]) {
        selRing.position.copy(fishG[sel].position);
        selRing.position.z -= 0.1;
      }
    });
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={matchedCount === 6}>
      <div className="d3-stage" style={{ background: BG.sea }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <div className="d3-dots" aria-label={`${matchedCount / 2} / 3 juftlik topildi`}>
          {[0, 1, 2].map(i => (
            <span key={i} className={`d3-dot ${i < matchedCount / 2 ? 'on' : ''}`}>{i < matchedCount / 2 ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// BERKINMACHOQ — o'yinchoqlar xonasida 3 o'rdakcha berkinib olgan,
// boshi ko'rinib turadi. Boshqa joy bosilsa xona silkinadi.
// ============================================================
const DUCK_VOICE = "Uchta o'rdakcha berkinib oldi. Ularni topib bosing!";
const DUCK_TOYS_3D = [
  { kind: 'frame',   x: -3.1, wall: true,  h: 1.9, s: 1.0, c: '#5AC8FA' },
  { kind: 'balloon', x: 3.6,  wall: true,  h: 1.7, s: 1.0, c: '#F2A9C4' },
  { kind: 'bear',    x: -3.6, z: 0.2,  s: 1.25, c: '#C98A5B' },
  { kind: 'pyramid', x: 3.5,  z: 1.0,  s: 1.1,  c: '#43C465' },
  { kind: 'doll',    x: 2.2,  z: 1.6,  s: 1.0,  c: '#E86A8A' },
  { kind: 'ball',    x: 0.9,  z: 0.9,  s: 0.95, c: '#FF5A4E' },
  { kind: 'car',     x: -0.9, z: 1.7,  s: 1.15, c: '#F5C518' },
  { kind: 'cube',    x: -2.3, z: 1.2,  s: 0.95, c: '#4A90E2' },
  { kind: 'cube',    x: -1.7, z: 1.5,  s: 0.9,  c: '#43C465' },
  { kind: 'cube',    x: -2.0, z: 0.6,  s: 0.9,  c: '#FF5A4E' },
];
// o'rdakchalar joyi: kubiklar orqasida, quti orqasida, piramida ortida
const DUCK_SPOTS_3D = [
  { x: -2.0, z: 0.15, flip: false },
  { x: 1.9,  z: -0.75, flip: false },
  { x: 3.15, z: 0.55,  flip: true },
];

export const HiddenDuckPage3D = ({ onBack, onNext }) => {
  const voice = useVoice(DUCK_VOICE);
  const { onCorrect } = useFlightApi();
  const [foundCount, setFoundCount] = useState(0);
  const foundRef = useRef(new Set());

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 3.0, 9.0);
    api.camera.lookAt(0, 0.9, 0);
    addShadowGround(api);
    const room = new THREE.Group();
    api.scene.add(room);
    // pol + orqa devor + gilamcha
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.24, 5.4),
      new THREE.MeshStandardMaterial({ color: 0xF0C27E, roughness: 0.85 })
    );
    floor.receiveShadow = true;
    room.add(floor);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 3.4, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xFFF0CE, roughness: 0.9 })
    );
    wall.position.set(0, 1.8, -2.7);
    room.add(wall);
    const rug = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 0.05, 36),
      new THREE.MeshStandardMaterial({ color: 0xA8D96A, roughness: 0.9 })
    );
    rug.position.set(-0.3, 0.14, 0.9);
    rug.receiveShadow = true;
    room.add(rug);
    // ochiq o'yinchoq qutisi
    const box = buildModel('box');
    box.position.set(1.9, 0.12, -0.1);
    box.scale.setScalar(1.8);
    room.add(box);
    // o'yinchoqlar
    DUCK_TOYS_3D.forEach(t => {
      const g = buildModel(t.kind, { c: t.c });
      if (t.wall) {
        g.position.set(t.x, t.h, -2.55);
      } else {
        g.position.set(t.x, 0.12, t.z);
      }
      g.scale.setScalar(t.s);
      room.add(g);
    });
    // o'rdakchalar — o'yinchoqlar ORQASIDA, boshi ko'rinib turadi
    DUCK_SPOTS_3D.forEach((s, i) => {
      const d = buildModel('duck');
      d.position.set(s.x, 0.12, s.z - 0.55);
      d.scale.setScalar(0.9);
      if (s.flip) d.rotation.y = -0.5;
      room.add(d);
      d.userData.pick = (root, screenPt) => {
        const found = foundRef.current;
        if (found.has(i)) return;
        found.add(i);
        setFoundCount(found.size);
        root.userData.disabled = true;
        sfxDingDing();
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        wp.y += 0.5;
        api.burst(wp);
        api.ringOk(new THREE.Vector3(wp.x, 0.26, wp.z), 0.7);
        // topilgan o'rdakcha oldinga sakrab chiqadi
        flyTo(api, root, new THREE.Vector3(s.x, 0.12, s.z + 0.75), 0.4);
        onCorrect(screenPt, found.size === 3);
      };
      api.clickables.push(d);
    });
    api.missHandler = () => {
      if (foundRef.current.size < 3) {
        sfxHmm();
        api.shake(room);
      }
    };
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={foundCount === 3}>
      <div className="d3-stage" style={{ background: BG.toys }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <div className="d3-dots" aria-label={`${foundCount} / 3 o'rdakcha topildi`}>
          {[0, 1, 2].map(i => (
            <span key={i} className={`d3-dot ${i < foundCount ? 'on' : ''}`}>{i < foundCount ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

// ============================================================
// ORTIQCHASINI TOP — 4 ekran ketma-ket, har birida 4 pedestal;
// bittasi guruhga mos kelmaydi.
// ============================================================
const ODD_VOICE = "Bittasi bu yerga to'g'ri kelmaydi. Ortiqchasini topib bosing!";
const ODD_ROUNDS = [
  [
    { kind: 'apple',  c: '#FF5A4E' },
    { kind: 'banana', c: '#FFD34D' },
    { kind: 'ball',   c: '#FF5A4E', odd: true },
    { kind: 'pear',   c: '#A8CC5A' },
  ],
  [
    { kind: 'cat' },
    { kind: 'rabbit' },
    { kind: 'car', c: '#F5C518', odd: true },
    { kind: 'dog' },
  ],
  [
    { kind: 'dot',    c: '#4A90E2' },
    { kind: 'heart',  c: '#FFB03A', odd: true },
    { kind: 'square', c: '#4A90E2' },
    { kind: 'heart',  c: '#4A90E2' },
  ],
  [
    { kind: 'bear', c: '#C98A4B' },
    { kind: 'bear', c: '#C98A4B', small: true, odd: true },
    { kind: 'bear', c: '#C98A4B' },
    { kind: 'bear', c: '#C98A4B' },
  ],
];

export const OddOutPage3D = ({ onBack, onNext }) => {
  const voice = useVoice(ODD_VOICE);
  const { onCorrect } = useFlightApi();
  const [done, setDone] = useState(0);
  const sceneRef = useRef(null);
  const roundRef = useRef(0);
  const lockRef = useRef(false);
  const nextTimer = useRef(null);
  useEffect(() => () => clearTimeout(nextTimer.current), []);

  const buildRound = useCallback((api, roundItems) => {
    const group = new THREE.Group();
    api.scene.add(group);
    roundItems.forEach((it, i) => {
      const x = (i - 1.5) * 2.4;
      const ped = addPedestal(api, { x, z: 0.8, r: 0.95 });
      group.add(ped);
      const g = buildModel(it.kind, { c: it.c });
      g.position.set(x, 0.16, 0.8);
      g.scale.setScalar(it.small ? 0.62 : 1.05);
      group.add(g);
      g.userData.pick = (root, screenPt) => {
        if (lockRef.current) return;
        if (it.odd) {
          lockRef.current = true;
          sfxDingDing();
          const wp = new THREE.Vector3();
          root.getWorldPosition(wp);
          wp.y += 0.7;
          api.burst(wp);
          api.ringOk(new THREE.Vector3(x, 0.22, 0.8), 1.05);
          const isLast = roundRef.current === ODD_ROUNDS.length - 1;
          setDone(d => d + 1);
          onCorrect(screenPt, isLast);
          if (!isLast) {
            nextTimer.current = setTimeout(() => {
              // eski ekranni yig'ishtirib, keyingisini quramiz
              api.scene.remove(group);
              const idx = api.clickables.length;
              for (let k = idx - 1; k >= 0; k--) {
                if (group.children.includes(api.clickables[k])) api.clickables.splice(k, 1);
              }
              roundRef.current += 1;
              lockRef.current = false;
              buildRound(api, ODD_ROUNDS[roundRef.current]);
            }, 1100);
          }
        } else {
          sfxHmm();
          api.shake(root);
        }
      };
      api.clickables.push(g);
    });
  }, []);

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: 0xEFE3EF, z: 0.4 });
    sceneRef.current = { api };
    roundRef.current = 0;
    lockRef.current = false;
    buildRound(api, ODD_ROUNDS[0]);
    return () => { sceneRef.current = null; };
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={done === ODD_ROUNDS.length}>
      <div className="d3-stage" style={{ background: BG.shapes }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <div className="d3-dots" aria-label={`${done} / ${ODD_ROUNDS.length} ekran yakunlandi`}>
          {ODD_ROUNDS.map((_, i) => (
            <span key={i} className={`d3-dot ${i < done ? 'on' : ''}`}>{i < done ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};
