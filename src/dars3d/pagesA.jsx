import React, { useState, useRef, useCallback } from 'react';
import { Scene3D } from './engine';
import { useVoice, sfxDingDing, sfxHmm } from './audio';
import {
  PageShell, PageVoice, useFlightApi, THREE, buildModel,
  addShadowGround, addDisc, addPedestal, placePick, buildQuestionMark,
  buildHitBox, makeGhostly, flyTo,
} from './common';

// ============================================================
// A-FORMATLAR: soya topish · rangga saralash (drag&drop) ·
// ketma-ketlik · farq top (2 diorama, sehrli fonar bilan).
// Sahna QAT'IY — 2D dars bilan bir xil tartib va javoblar.
// ============================================================

// ---------- FON GRADIENTLARI (2D mavzularidan) ----------
export const BG = {
  meadow: 'linear-gradient(180deg, #CDEFFF 0%, #E3F6E3 55%, #BCE49C 100%)',
  jungle: 'linear-gradient(180deg, #A8DB6E 0%, #8CC94F 60%, #79B540 100%)',
  fruits: 'linear-gradient(180deg, #FFF6D9 0%, #F0F7D8 55%, #D9EFC0 100%)',
  toys:   'linear-gradient(180deg, #FFF3DA 0%, #FFE9C6 55%, #F7D9AE 100%)',
  shapes: 'linear-gradient(180deg, #F3EFFF 0%, #FFF3F8 55%, #E8F4FF 100%)',
  night:  'linear-gradient(180deg, #46549E 0%, #39468C 55%, #2C3878 100%)',
  space:  'linear-gradient(180deg, #4A3F96 0%, #3A3480 55%, #2A2460 100%)',
  candy:  'linear-gradient(180deg, #FFEFF5 0%, #FFF6E8 55%, #FFE3EC 100%)',
  sea:    'linear-gradient(180deg, #5AC8FA 0%, #3A9BD8 55%, #2E7DB0 100%)',
};

// ============================================================
// FORMAT: SOYA TOPISH — markazda aylanib turgan qahramon,
// oldinda 3 pedestal ustida qop-qora soyalar.
// ============================================================
export const ShadowPage3D = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const solvedRef = useRef(false);

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: cfg.discColor || 0xA8D96A, z: 0.4 });
    // qahramon — sekin u yoq-bu yoqqa burilib, suzib turadi
    const hero = buildModel(cfg.hero);
    placePick(api, hero, { x: 0, y: 0.55, z: -1.7, scale: 2.0 });
    api.float(hero, { amp: 0.06, speed: 1.4 });
    api.addTick((t) => { hero.rotation.y = Math.sin(t * 0.6) * 0.45; });
    // atrof bezaklari
    (cfg.decor || []).forEach((d) => {
      const g = buildModel(d.kind, { c: d.c });
      placePick(api, g, { x: d.x, y: d.y || 0, z: d.z, scale: d.s || 1 });
      if (d.floaty) api.float(g, { amp: 0.12, speed: 1.1, phase: d.x });
    });
    // 3 soya-variant
    cfg.options.forEach((kind, i) => {
      const x = (i - 1) * 2.5;
      addPedestal(api, { x, z: 1.9 });
      const sil = buildModel(kind, { sil: true });
      placePick(api, sil, {
        x, y: 0.16, z: 1.9, scale: 1.15,
        pick: (root, screenPt) => {
          if (solvedRef.current) return;
          if (kind === cfg.hero) {
            solvedRef.current = true;
            setSolved(true);
            sfxDingDing();
            const wp = new THREE.Vector3();
            root.getWorldPosition(wp);
            wp.y += 0.8;
            api.burst(wp);
            api.ringOk(new THREE.Vector3(x, 0.22, 1.9), 1.05);
            onCorrect(screenPt, true);
          } else {
            sfxHmm();
            api.shake(sil);
          }
        },
      });
    });
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d3-stage" style={{ background: cfg.bg }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

export const SHADOW_CFG_MEADOW = {
  voice: "Do'stimizning soyasi qaysi? Mos soyani topib bosing!",
  hero: 'rabbit',
  options: ['cat', 'rooster', 'rabbit'],
  bg: BG.meadow,
  decor: [
    { kind: 'tree', x: -4.6, z: -2.6, s: 1.7 },
    { kind: 'tree', x: 4.6, z: -2.8, s: 1.5 },
    { kind: 'flower', x: -3.4, z: 0.6, s: 0.8 },
    { kind: 'flower', x: 3.5, z: 0.7, s: 0.8 },
    { kind: 'cloud', x: -3.6, y: 3.1, z: -3.4, s: 1.3, floaty: true },
    { kind: 'cloud', x: 3.8, y: 3.5, z: -3.6, s: 1.1, floaty: true },
  ],
};
export const SHADOW_CFG_LION = {
  voice: "Bu do'stimiz soyasini yo'qotib qo'ydi. Mos soyani topib bosing!",
  hero: 'lion',
  options: ['giraffe', 'lion', 'monkey'],
  bg: BG.jungle,
  discColor: 0x96CC55,
  decor: [
    { kind: 'tree', x: -4.5, z: -2.4, s: 1.9, c: '#2E7D4F' },
    { kind: 'tree', x: 4.5, z: -2.6, s: 1.7, c: '#2E7D4F' },
    { kind: 'mushroom', x: -3.3, z: 0.8, s: 0.7 },
    { kind: 'flower', x: 3.4, z: 0.9, s: 0.8, c: '#F6C45A' },
  ],
};

// ============================================================
// FORMAT: RANGGA SARALASH — narsani USHLAB o'z rangidagi
// qutiga OLIB BORIB tashlash (ray-plane drag, threejs-interaction).
// ============================================================
export const ColorSortPage3D = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [allDone, setAllDone] = useState(false);

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: cfg.discColor || 0xEFE3C2, z: 0.4 });
    const placed = {};
    const boxMeshes = [];

    // rangli ochiq qutilar — orqa qatorda
    cfg.boxes.forEach((b, i) => {
      const x = (i - 1) * 2.7;
      const box = buildModel('box', { c: b.color });
      placePick(api, box, { x, z: -1.2, scale: 1.35 });
      boxMeshes.push({ color: b.color, group: box, x, z: -1.2, inside: 0 });
    });

    // narsalar — old qatorda
    let drag = null;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
    cfg.items.forEach((it, i) => {
      const x = (i - 1) * 2.1;
      const g = buildModel(it.kind, { c: it.color });
      placePick(api, g, {
        x, z: 2.1, scale: 1.0,
        pick: (root) => {
          if (placed[it.id] || drag) return;
          drag = { g: root, it, home: root.position.clone() };
          root.position.y = 0.55;
        },
      });
      g.userData.home = g.position.clone();
    });

    api.moveHandler = (e) => {
      if (!drag) return;
      const pt = new THREE.Vector3();
      if (api.rayToPlane(e, plane, pt)) {
        drag.g.position.set(
          THREE.MathUtils.clamp(pt.x, -4.2, 4.2),
          0.55,
          THREE.MathUtils.clamp(pt.z, -1.6, 2.5)
        );
      }
      // quti ustида — biroz kattarib turadi
      boxMeshes.forEach(bm => {
        const near = Math.hypot(drag.g.position.x - bm.x, drag.g.position.z - bm.z) < 1.35;
        bm.group.scale.setScalar(near ? 1.5 : 1.35);
      });
    };
    api.upHandler = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      boxMeshes.forEach(bm => bm.group.scale.setScalar(1.35));
      const bm = boxMeshes.find(b => Math.hypot(d.g.position.x - b.x, d.g.position.z - b.z) < 1.35);
      if (!bm) { flyTo(api, d.g, d.home, 0.3); return; }
      if (bm.color === d.it.color) {
        placed[d.it.id] = true;
        d.g.userData.disabled = true;
        sfxDingDing();
        bm.inside += 1;
        flyTo(api, d.g, new THREE.Vector3(bm.x, 0.45, bm.z + 0.15), 0.35, () => {
          d.g.scale.setScalar(0.75);
        });
        const wp = new THREE.Vector3(bm.x, 1.2, bm.z);
        api.burst(wp);
        api.ringOk(new THREE.Vector3(bm.x, 0.2, bm.z), 1.1);
        const isLast = Object.keys(placed).length === cfg.items.length;
        onCorrect(api.worldToScreen(wp), isLast);
        if (isLast) setAllDone(true);
      } else {
        sfxHmm();
        api.shake(bm.group);
        flyTo(api, d.g, d.home, 0.35);
      }
    };
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className="d3-stage" style={{ background: cfg.bg }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

export const SORT_CFG_FRUITS_3D = {
  voice: "Har bir mevani rangiga qarab o'z uychasiga joylashtiring!",
  boxes: [{ color: '#43C465' }, { color: '#8E5AE8' }, { color: '#FFB03A' }],
  items: [
    { id: 'grape',  kind: 'grape',  color: '#8E5AE8' },
    { id: 'orange', kind: 'orange', color: '#FFB03A' },
    { id: 'apple',  kind: 'apple',  color: '#43C465' },
  ],
  bg: BG.fruits,
};
export const SORT_CFG_TOYS_3D = {
  voice: "Har bir o'yinchoqni o'z rangidagi qutichaga joylashtiring!",
  boxes: [{ color: '#FF5A4E' }, { color: '#4A90E2' }, { color: '#FFD34D' }],
  items: [
    { id: 'star',   kind: 'star5',  color: '#FFD34D' },
    { id: 'cube',   kind: 'square', color: '#FF5A4E' },
    { id: 'circle', kind: 'dot',    color: '#4A90E2' },
  ],
  bg: BG.toys,
  discColor: 0xF2D9AE,
};

// ============================================================
// FORMAT: KETMA-KETLIK — naqsh qatori + so'roq belgili uya;
// to'g'ri variant uyaga UCHIB borib joylashadi.
// ============================================================
export const SequencePage3D = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [solved, setSolved] = useState(false);
  const solvedRef = useRef(false);

  const onReady = useCallback((api) => {
    addShadowGround(api);
    addDisc(api, { r: 7, color: cfg.discColor || 0xEFE3EF, z: 0.4 });
    const cycle = cfg.cycle;
    const ans = cycle[cfg.len % cycle.length];

    // naqsh qatori — orqada
    const startX = -((cfg.len) * 1.35) / 2;
    for (let i = 0; i < cfg.len; i++) {
      const p = cycle[i % cycle.length];
      const g = buildModel(p.kind, { c: p.c });
      placePick(api, g, { x: startX + i * 1.35, z: -1.1, scale: 0.82 });
    }
    // uya + suzuvchi so'roq belgisi
    const slotX = startX + cfg.len * 1.35;
    addPedestal(api, { x: slotX, z: -1.1, r: 0.7, color: 0xFFF6DE });
    const qm = buildQuestionMark();
    placePick(api, qm, { x: slotX, y: 0.5, z: -1.1, scale: 0.9 });
    api.float(qm, { amp: 0.1, speed: 2.0 });

    // variantlar — old qatorda
    cfg.options.forEach((o, i) => {
      const x = (i - (cfg.options.length - 1) / 2) * 2.4;
      addPedestal(api, { x, z: 1.9 });
      const g = buildModel(o.kind, { c: o.c });
      const correct = o.kind === ans.kind && o.c === ans.c;
      placePick(api, g, {
        x, y: 0.16, z: 1.9, scale: 1.0,
        pick: (root, screenPt) => {
          if (solvedRef.current) return;
          if (correct) {
            solvedRef.current = true;
            setSolved(true);
            sfxDingDing();
            root.userData.disabled = true;
            qm.visible = false;
            flyTo(api, root, new THREE.Vector3(slotX, 0.16, -1.1), 0.5, () => {
              root.scale.setScalar(0.82);
              const wp = new THREE.Vector3(slotX, 1.0, -1.1);
              api.burst(wp);
              api.ringOk(new THREE.Vector3(slotX, 0.2, -1.1), 0.9);
            });
            onCorrect(screenPt, true);
          } else {
            sfxHmm();
            api.shake(root);
          }
        },
      });
    });
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={solved}>
      <div className="d3-stage" style={{ background: cfg.bg }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

export const SEQ_CFG_ANIMALS_3D = {
  voice: "Hayvonchalar navbat bilan kelyapti. So'roq o'rnida qaysi hayvoncha turadi? Topib bosing!",
  cycle: [{ kind: 'dog' }, { kind: 'duck' }],
  options: [{ kind: 'duck' }, { kind: 'dog' }],
  len: 4,
  bg: BG.meadow,
  discColor: 0xA8D96A,
};
export const SEQ_CFG_SHAPES_3D = {
  voice: "Naqshga qarang: shakllar navbat bilan kelyapti. Keyingi shakl qaysi? Topib bosing!",
  cycle: [{ kind: 'dot', c: '#FF5A4E' }, { kind: 'square', c: '#4A90E2' }],
  options: [{ kind: 'square', c: '#4A90E2' }, { kind: 'dot', c: '#FF5A4E' }],
  len: 4,
  bg: BG.shapes,
};
export const SEQ_CFG_COLORS_3D = {
  voice: "Ranglar naqshiga qarang. Keyingi rang qaysi? Topib bosing!",
  cycle: [
    { kind: 'heart', c: '#FF5A4E' },
    { kind: 'heart', c: '#FFD34D' },
    { kind: 'heart', c: '#4A90E2' },
  ],
  options: [
    { kind: 'heart', c: '#FFD34D' },
    { kind: 'heart', c: '#4A90E2' },
    { kind: 'heart', c: '#FF5A4E' },
  ],
  len: 5,
  bg: BG.shapes,
};

// ============================================================
// FORMAT: FARQ TOP — ikkita 3D diorama yonma-yon; o'ng dioramada
// `alt` belgili farqlar. Fonar rejimida qorong'ulik KURSORGA ergashadi:
// pointer qaysi paneldа bo'lsa — o'shanisi tun, nur doirasi ochib beradi.
// ============================================================
const PANEL_W = 4.6;
const PANEL_D = 3.2;

export const DiffPage3D = ({ cfg, onBack, onNext }) => {
  const voice = useVoice(cfg.voice);
  const { onCorrect } = useFlightApi();
  const [foundCount, setFoundCount] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const diffTotal = cfg.scene.objects.filter(o => o.alt).length;

  const onReady = useCallback((api) => {
    api.camera.position.set(0, 3.4, 9.6);
    api.camera.lookAt(0, 0.9, 0);
    addShadowGround(api);
    const found = new Set();
    const panels = [];      // [{ group, side, meshesInfo }]
    const fireflies = [];
    const darkSide = { v: cfg.lantern ? 'right' : null };
    const beam = new THREE.Vector3(0, 0, 0);

    // ob'ekt joylashuvi: % -> diorama koordinatalari
    const mapPos = (o) => {
      const lx = ((o.x - 50) / 50) * (PANEL_W / 2 - 0.5);
      if (o.y < 45) {
        return { x: lx, y: 1.15 + ((45 - o.y) / 45) * 1.5, z: -PANEL_D / 2 + 0.35, sky: true };
      }
      return { x: lx, y: 0.12, z: -0.85 + ((o.y - 45) / 55) * 1.9, sky: false };
    };
    const mapScale = (o) => THREE.MathUtils.clamp((o.s / 100) * 3.4, 0.5, 1.6) * 0.9;

    [-1, 1].forEach((sideSign) => {
      const side = sideSign < 0 ? 'left' : 'right';
      const altered = side === 'right';
      const px = sideSign * (PANEL_W / 2 + 0.45);
      const group = new THREE.Group();
      group.position.set(px, 0, 0);
      api.scene.add(group);

      // pol + orqa devor
      const floorMat = new THREE.MeshStandardMaterial({ color: cfg.panelFloor || 0xF7EFD9, roughness: 0.85 });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.24, PANEL_D), floorMat);
      floor.position.y = 0;
      floor.receiveShadow = true;
      group.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ color: cfg.panelWall || 0xFFF6E4, roughness: 0.9 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 2.9, 0.14), wallMat);
      wall.position.set(0, 1.55, -PANEL_D / 2);
      group.add(wall);

      const meshesInfo = [];   // { mesh: material yoki mesh ro'yxati, pos }
      const rememberMats = (g, pos) => {
        g.traverse(ch => {
          if (ch.isMesh && ch.material && ch.material.color) {
            meshesInfo.push({ mat: ch.material, base: ch.material.color.clone(), pos });
          }
        });
      };
      rememberMats(floor, new THREE.Vector3(0, 0, 0));
      rememberMats(wall, new THREE.Vector3(0, 1.5, -PANEL_D / 2));

      cfg.scene.objects.forEach((o, idx) => {
        const isDiff = !!o.alt;
        const ghost = altered && isDiff && o.alt.ghost;
        const kind = altered && isDiff && o.alt.kind ? o.alt.kind : o.kind;
        const color = altered && isDiff && o.alt.c ? o.alt.c : o.c;
        const p = mapPos(o);
        const sc = mapScale(o);
        let g;
        if (ghost) {
          g = buildHitBox(sc * 1.1, sc * 1.1, sc * 0.8);
          g.position.set(p.x, p.y + sc * 0.5, p.z);
          group.add(g);
        } else {
          const tintOpt = altered && isDiff && o.alt.c && o.alt.kind ? {} : {};
          g = buildModel(kind, { c: color, ...tintOpt });
          g.position.set(p.x, p.y, p.z);
          g.scale.setScalar(sc);
          group.add(g);
          if (p.sky) api.float(g, { amp: 0.07, speed: 1.2, phase: idx });
          rememberMats(g, g.position.clone());
        }
        g.userData.pick = (root, screenPt) => {
          if (found.has(idx)) return;
          if (isDiff) {
            found.add(idx);
            setFoundCount(found.size);
            sfxDingDing();
            const wp = new THREE.Vector3();
            root.getWorldPosition(wp);
            wp.y += sc * 0.6;
            api.burst(wp);
            api.ringOk(new THREE.Vector3(wp.x, 0.2, wp.z), Math.max(0.6, sc * 0.7));
            // g'oyib bo'lgan narsa topilgach — sharpa ko'rinadi
            if (ghost) {
              const gg = makeGhostly(buildModel(o.kind, { c: o.c }));
              gg.position.set(p.x, p.y, p.z);
              gg.scale.setScalar(sc);
              group.add(gg);
            }
            const isLast = found.size === diffTotal;
            onCorrect(screenPt, isLast);
            if (isLast) setAllDone(true);
          } else {
            sfxHmm();
            api.shake(group);
          }
        };
        api.clickables.push(g);
      });

      // fonar rejimi uchun mitti yoritqichlar (faqat tun panelida ko'rinadi)
      if (cfg.lantern) {
        for (let i = 0; i < 5; i++) {
          const f = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xFFE9A8, transparent: true, opacity: 0.9 })
          );
          f.position.set((Math.sin(i * 2.4) * 1.6), 1.2 + (i % 3) * 0.5, -0.4 - (i % 2) * 0.6);
          group.add(f);
          fireflies.push({ mesh: f, side, phase: i * 1.3 });
        }
      }
      panels.push({ group, side, meshesInfo, px });
    });

    // fonar: qorong'ulik kursorga ergashadi
    if (cfg.lantern) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      api.moveHandler = (e) => {
        const pt = new THREE.Vector3();
        if (api.rayToPlane(e, plane, pt)) {
          darkSide.v = pt.x < 0 ? 'left' : 'right';
          beam.copy(pt);
        }
      };
      const darkCol = new THREE.Color(0x1A2246);
      api.addTick((t) => {
        panels.forEach(panel => {
          const isDark = panel.side === darkSide.v;
          panel.meshesInfo.forEach(info => {
            if (!isDark) {
              info.mat.color.copy(info.base);
            } else {
              const wx = panel.px + info.pos.x;
              const d = Math.hypot(wx - beam.x, info.pos.z - beam.z);
              const lit = THREE.MathUtils.clamp(1 - (d - 0.9) / 0.7, 0, 1);
              info.mat.color.copy(darkCol.clone().multiply(info.base).lerp(info.base, 0.12 + lit * 0.88));
            }
          });
        });
        fireflies.forEach(f => {
          f.mesh.visible = f.side === darkSide.v;
          f.mesh.position.y += Math.sin(t * 2 + f.phase) * 0.003;
          f.mesh.material.opacity = 0.5 + Math.sin(t * 3 + f.phase) * 0.4;
        });
      });
    }
  }, []);

  return (
    <PageShell onBack={onBack} onNext={onNext} nextOk={allDone}>
      <div className="d3-stage" style={{ background: cfg.bg }}>
        <Scene3D onReady={onReady} className="d3-canvas"/>
        <div className="d3-dots" aria-label={`${foundCount} / ${diffTotal} farq topildi`}>
          {Array.from({ length: diffTotal }).map((_, i) => (
            <span key={i} className={`d3-dot ${i < foundCount ? 'on' : ''}`}>{i < foundCount ? '✓' : ''}</span>
          ))}
        </div>
        <PageVoice voice={voice}/>
      </div>
    </PageShell>
  );
};

export const DIFF_CFG_TOYS_3D = {
  voice: "Ikki rasmni solishtiring va uchta farqni topib bosing!",
  scene: {
    objects: [
      { kind: 'frame',   x: 28, y: 16, s: 26, c: '#5AC8FA', alt: { kind: 'lamp', c: '#FFD34D' } },
      { kind: 'bowbear', x: 25, y: 60, s: 38, c: '#C98A4B', alt: { c: '#EDE7DC' } },
      { kind: 'pyramid', x: 58, y: 77, s: 28, c: '#43C465' },
      { kind: 'cube',    x: 78, y: 40, s: 23, c: '#4A90E2' },
      { kind: 'cube',    x: 84, y: 75, s: 23, c: '#FF5A4E' },
      { kind: 'ball',    x: 55, y: 37, s: 18, c: '#FF5A4E', alt: { ghost: true } },
    ],
  },
  bg: BG.toys,
  panelFloor: 0xF0C27E,
  panelWall: 0xFFF0CE,
};
export const DIFF_CFG_NIGHT_3D = {
  voice: "Voy, qorong'u tushdi! Sehrli fonarni rasm ustida yuriting va to'rtta farqni topib bosing!",
  lantern: true,
  scene: {
    objects: [
      { kind: 'moon',     x: 14, y: 15, s: 20, c: '#FFE9A8' },
      { kind: 'star5',    x: 42, y: 12, s: 14, c: '#FFD34D' },
      { kind: 'cloud',    x: 82, y: 11, s: 18, c: '#8FA3D8' },
      { kind: 'house',    x: 76, y: 52, s: 30, c: '#F2A45E', alt: { c: '#E8EEF4' } },
      { kind: 'tree',     x: 11, y: 55, s: 30, c: '#2E7D4F', alt: { c: '#E8A63C' } },
      { kind: 'cat',      x: 32, y: 72, s: 26, c: '#F2A45E', alt: { c: '#A8A8A8' } },
      { kind: 'mushroom', x: 56, y: 82, s: 20, c: '#FF5A4E', alt: { kind: 'flower' } },
      { kind: 'rabbit',   x: 89, y: 76, s: 20 },
    ],
  },
  bg: BG.night,
  panelFloor: 0x3E5A8C,
  panelWall: 0x39468C,
};
export const DIFF_CFG_SPACE_3D = {
  voice: "Kosmosdamiz! Ikki rasmdagi to'rtta farqni topib bosing!",
  scene: {
    objects: [
      { kind: 'star5',  x: 12, y: 18, s: 16, c: '#FFD34D', alt: { kind: 'planetPlain' } },
      { kind: 'moon',   x: 50, y: 12, s: 18, c: '#FFE9A8' },
      { kind: 'star5',  x: 86, y: 14, s: 13, c: '#FFF3C4' },
      { kind: 'planet', x: 78, y: 48, s: 30, c: '#3CE0C8', alt: { c: '#FF8FB3' } },
      { kind: 'rocket', x: 28, y: 56, s: 34, c: '#FF5A4E', alt: { c: '#43C465' } },
      { kind: 'star5',  x: 55, y: 42, s: 15, c: '#FFD34D', alt: { kind: 'heart', c: '#FF5A8A' } },
      { kind: 'planet', x: 14, y: 80, s: 26, c: '#B06BFF' },
      { kind: 'moon',   x: 88, y: 76, s: 22, c: '#FFE9A8' },
      { kind: 'star5',  x: 60, y: 84, s: 15, c: '#FFD34D' },
    ],
  },
  bg: BG.space,
  panelFloor: 0x453E8F,
  panelWall: 0x3A3480,
};
