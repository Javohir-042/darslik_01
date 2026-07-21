import * as THREE from 'three';

// ============================================================
// MODELLAR KUTUBXONASI — barcha belgichalar KODDA YIG'ILGAN low-poly
// 3D shakllar (threejs-geometry / threejs-materials skilllari naqshida).
// Tashqi asset YO'Q. Registr: MODELS (kind -> builder).
//   buildModel(kind, { c, sil, tint }) -> THREE.Group
//     c    — asosiy rang almashtirish (saralash/farq o'yinlari uchun)
//     sil  — soya rejimi: butun figura yaxlit quyuq rang
//     tint — "rang o'zgardi" o'yinlari: barcha ranglar shu tomonга suriladi
// Har model ~1.2 birlik balandlikda, tagida y=0.
// ============================================================

export const SIL = '#32363F';

// umumiy (qayta ishlatiladigan) birlik geometriyalar — dispose qilinmaydi
const SPH = new THREE.SphereGeometry(1, 24, 18);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 24);
const CONE = new THREE.ConeGeometry(1, 1, 24);
[SPH, BOX, CYL, CONE].forEach(g => { g.userData.shared = true; });

// yulduz va yurak shakllari (extrude) — bir marta yasab ulashamiz
const starGeo = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = -Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  g.center(); g.userData.shared = true;
  return g;
})();
const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.85);
  s.bezierCurveTo(-1.15, -0.1, -0.95, 0.75, -0.45, 0.75);
  s.bezierCurveTo(-0.12, 0.75, 0, 0.5, 0, 0.35);
  s.bezierCurveTo(0, 0.5, 0.12, 0.75, 0.45, 0.75);
  s.bezierCurveTo(0.95, 0.75, 1.15, -0.1, 0, -0.85);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  g.center(); g.userData.shared = true;
  return g;
})();

// rangni tint tomonga surish (2D dagi tintFilter o'rnini bosadi)
const tintHex = (hex, tint) => {
  const c = new THREE.Color(hex);
  const t = new THREE.Color(tint);
  const l = (c.r + c.g + c.b) / 3;                    // yorug'likni saqlaymiz
  const out = t.clone().multiplyScalar(0.35 + l * 0.85);
  return out.lerp(t, 0.35);
};

// ---------- builder konteksti ----------
function makeCtx(opts = {}) {
  const mats = [];
  const M = (hex, extra = {}) => {
    let col = hex;
    if (opts.sil) col = SIL;
    else if (opts.tint) col = tintHex(hex, opts.tint);
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0.04, ...extra });
    if (opts.sil) { m.roughness = 0.95; m.emissive = new THREE.Color(0x0a0b10); }
    mats.push(m);
    return m;
  };
  // mesh yasash: geo, rang, scale, pozitsiya, rotatsiya
  const m = (geo, hex, s = [1, 1, 1], p = [0, 0, 0], r = [0, 0, 0], extra = {}) => {
    const mesh = new THREE.Mesh(geo, M(hex, extra));
    mesh.scale.set(...s);
    mesh.position.set(...p);
    mesh.rotation.set(...r);
    mesh.castShadow = true;
    return mesh;
  };
  return { M, m, mats };
}

// ko'zlar (soya rejimida chizilmaydi)
function addEyes(group, opts, { dx = 0.16, y = 0, z = 0.3, r = 0.055 } = {}) {
  if (opts.sil) return;
  const dark = new THREE.MeshStandardMaterial({ color: 0x2E3140, roughness: 0.4 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach(sgn => {
    const e = new THREE.Mesh(SPH, dark);
    e.scale.setScalar(r);
    e.position.set(dx * sgn, y, z);
    group.add(e);
    const g = new THREE.Mesh(SPH, white);
    g.scale.setScalar(r * 0.35);
    g.position.set(dx * sgn + r * 0.3, y + r * 0.35, z + r * 0.8);
    group.add(g);
  });
}

// ============================================================
// JONIVORLAR — chibi uslub: dumaloq tana + katta bosh (old tomoni +Z)
// ============================================================
function chibiBase(o, main, dark, belly) {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, main, [0.42, 0.38, 0.36], [0, 0.42, 0]));          // tana
  g.add(m(SPH, belly, [0.26, 0.24, 0.2], [0, 0.4, 0.2]));         // qorincha
  g.add(m(SPH, dark, [0.11, 0.08, 0.13], [-0.22, 0.09, 0.14]));   // oyoqchalar
  g.add(m(SPH, dark, [0.11, 0.08, 0.13], [0.22, 0.09, 0.14]));
  g.add(m(SPH, dark, [0.09, 0.09, 0.09], [-0.4, 0.5, 0.05]));     // qo'lchalar
  g.add(m(SPH, dark, [0.09, 0.09, 0.09], [0.4, 0.5, 0.05]));
  return g;
}
const headAt = 1.0;

const animalRabbit = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#BFBAB2', '#A69F94', '#EDE9E2');
  g.add(m(SPH, '#BFBAB2', [0.36, 0.34, 0.33], [0, headAt, 0]));           // bosh
  g.add(m(SPH, '#EDE9E2', [0.16, 0.12, 0.1], [0, headAt - 0.12, 0.26]));  // tumshuq
  // uzun quloqlar (ichida pushti)
  [-1, 1].forEach(sgn => {
    g.add(m(SPH, '#BFBAB2', [0.09, 0.32, 0.07], [0.16 * sgn, headAt + 0.5, -0.02], [0, 0, -0.12 * sgn]));
    if (!opts.sil) g.add(m(SPH, '#EFB9C7', [0.045, 0.22, 0.03], [0.16 * sgn, headAt + 0.5, 0.03], [0, 0, -0.12 * sgn]));
  });
  g.add(m(SPH, '#F4F0E7', [0.12, 0.12, 0.12], [0, 0.42, -0.36]));         // paxmoq dum
  if (!opts.sil) g.add(m(SPH, '#D89AAC', [0.045, 0.035, 0.03], [0, headAt - 0.04, 0.32]));  // burun
  addEyes(g, opts, { y: headAt + 0.06, z: 0.29 });
  return g;
};

const animalCat = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#F1863F', '#DE6E2C', '#FFC9A0');
  g.add(m(SPH, '#F1863F', [0.36, 0.34, 0.33], [0, headAt, 0]));
  [-1, 1].forEach(sgn => {
    g.add(m(CONE, '#F1863F', [0.14, 0.22, 0.1], [0.22 * sgn, headAt + 0.36, 0], [0, 0, -0.35 * sgn]));
    if (!opts.sil) g.add(m(CONE, '#FFC9A0', [0.08, 0.13, 0.06], [0.22 * sgn, headAt + 0.35, 0.04], [0, 0, -0.35 * sgn]));
  });
  g.add(m(SPH, '#FFC9A0', [0.15, 0.11, 0.09], [0, headAt - 0.12, 0.27]));  // tumshuq
  if (!opts.sil) g.add(m(SPH, '#D8747F', [0.04, 0.03, 0.03], [0, headAt - 0.06, 0.34]));
  // dum — egilgan
  g.add(m(new THREE.TorusGeometry(0.28, 0.06, 10, 20, Math.PI * 0.8), '#DE6E2C', [1, 1, 1], [0.3, 0.35, -0.3], [0.4, 0.6, 0]));
  addEyes(g, opts, { y: headAt + 0.05, z: 0.29 });
  return g;
};

const animalDog = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#C08552', '#A96F3F', '#F3DBB8');
  g.add(m(SPH, '#C08552', [0.36, 0.34, 0.33], [0, headAt, 0]));
  [-1, 1].forEach(sgn => {
    g.add(m(SPH, '#8F5A2E', [0.09, 0.2, 0.06], [0.3 * sgn, headAt + 0.12, 0], [0, 0, 0.5 * sgn]));  // shalpang quloq
  });
  g.add(m(SPH, '#F3DBB8', [0.17, 0.13, 0.11], [0, headAt - 0.12, 0.26]));
  if (!opts.sil) g.add(m(SPH, '#2E3140', [0.055, 0.045, 0.04], [0, headAt - 0.05, 0.35]));
  g.add(m(SPH, '#A96F3F', [0.06, 0.14, 0.06], [0.32, 0.5, -0.28], [0.5, 0, -0.5]));  // dum
  addEyes(g, opts, { y: headAt + 0.05, z: 0.29 });
  return g;
};

const animalCow = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#F7F3EA', '#E2DACB', '#FFFFFF');
  g.add(m(SPH, '#F7F3EA', [0.36, 0.34, 0.33], [0, headAt, 0]));
  if (!opts.sil) {
    g.add(m(SPH, '#6B4A33', [0.13, 0.1, 0.05], [-0.15, headAt + 0.12, 0.24]));   // dog'lar
    g.add(m(SPH, '#6B4A33', [0.1, 0.12, 0.05], [0.2, 0.5, 0.26]));
  }
  [-1, 1].forEach(sgn => {
    g.add(m(CONE, '#C9B08E', [0.06, 0.12, 0.06], [0.18 * sgn, headAt + 0.38, 0], [0, 0, -0.5 * sgn]));  // shoxlar
    g.add(m(SPH, '#E2DACB', [0.1, 0.06, 0.05], [0.33 * sgn, headAt + 0.1, 0], [0, 0, 0.3 * sgn]));      // quloqlar
  });
  g.add(m(SPH, '#F2B8C6', [0.18, 0.12, 0.1], [0, headAt - 0.14, 0.26]));   // pushti tumshuq
  if (!opts.sil) {
    g.add(m(SPH, '#D67F98', [0.03, 0.035, 0.02], [-0.07, headAt - 0.14, 0.35]));
    g.add(m(SPH, '#D67F98', [0.03, 0.035, 0.02], [0.07, headAt - 0.14, 0.35]));
  }
  addEyes(g, opts, { y: headAt + 0.06, z: 0.29 });
  return g;
};

const animalDuck = (o, opts) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, '#FFD24D', [0.36, 0.3, 0.34], [0, 0.34, 0]));               // tana
  g.add(m(SPH, '#FFE9A8', [0.22, 0.18, 0.18], [0, 0.32, 0.16]));           // ko'krak
  g.add(m(SPH, '#F5B92E', [0.14, 0.1, 0.2], [-0.28, 0.36, -0.04], [0, 0, 0.5]));  // qanotlar
  g.add(m(SPH, '#F5B92E', [0.14, 0.1, 0.2], [0.28, 0.36, -0.04], [0, 0, -0.5]));
  g.add(m(SPH, '#FFD24D', [0.26, 0.25, 0.25], [0, 0.82, 0.04]));           // bosh
  g.add(m(SPH, '#FF9E2E', [0.14, 0.05, 0.11], [0, 0.76, 0.28]));           // tumshuq
  g.add(m(SPH, '#F5B92E', [0.1, 0.05, 0.08], [0, 0.98, -0.02], [0.3, 0, 0]));  // popuk
  addEyes(g, opts, { dx: 0.12, y: 0.86, z: 0.2, r: 0.05 });
  return g;
};

const animalRooster = (o, opts) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, '#F4F0E6', [0.36, 0.32, 0.34], [0, 0.36, 0]));
  g.add(m(SPH, '#FFFDF6', [0.2, 0.18, 0.16], [0, 0.34, 0.18]));
  g.add(m(SPH, '#F4F0E6', [0.27, 0.26, 0.26], [0, 0.86, 0.04]));
  // toj (3 qizil shar) + soqolcha
  if (!opts.sil) {
    g.add(m(SPH, '#E8573F', [0.07, 0.09, 0.05], [-0.08, 1.12, 0.04]));
    g.add(m(SPH, '#E8573F', [0.08, 0.11, 0.05], [0, 1.15, 0.04]));
    g.add(m(SPH, '#E8573F', [0.07, 0.09, 0.05], [0.08, 1.12, 0.04]));
    g.add(m(SPH, '#E8573F', [0.05, 0.08, 0.04], [0, 0.72, 0.26]));
  } else {
    g.add(m(SPH, '#E8573F', [0.1, 0.12, 0.06], [0, 1.14, 0.04]));
  }
  g.add(m(CONE, '#FF9E2E', [0.07, 0.12, 0.07], [0, 0.82, 0.3], [1.35, 0, 0]));  // tumshuq
  // rangli dum patlari
  const tail = opts.sil ? [SIL, SIL, SIL] : ['#3E8A4F', '#E8573F', '#2C6E8F'];
  tail.forEach((tc, i) => {
    g.add(m(SPH, tc, [0.07, 0.26, 0.05], [(i - 1) * 0.1, 0.6, -0.32], [0.5, 0, (i - 1) * 0.25]));
  });
  addEyes(g, opts, { dx: 0.12, y: 0.92, z: 0.21, r: 0.05 });
  return g;
};

const animalLion = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#F2C14E', '#E0A93C', '#FBE8BC');
  // yol — bosh atrofida halqa bo'lib turgan sharchalar
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(m(SPH, '#E8963C', [0.13, 0.13, 0.09], [Math.cos(a) * 0.36, headAt + Math.sin(a) * 0.36, -0.08]));
  }
  g.add(m(SPH, '#F2C14E', [0.34, 0.32, 0.31], [0, headAt, 0]));
  g.add(m(SPH, '#FBE8BC', [0.16, 0.12, 0.1], [0, headAt - 0.12, 0.25]));
  if (!opts.sil) g.add(m(SPH, '#8F5A2E', [0.05, 0.04, 0.03], [0, headAt - 0.05, 0.33]));
  g.add(m(SPH, '#E0A93C', [0.05, 0.13, 0.05], [0.34, 0.42, -0.3], [0.5, 0, -0.6]));  // dum
  g.add(m(SPH, '#8F5A2E', [0.06, 0.06, 0.06], [0.4, 0.32, -0.34]));                  // dum uchi
  addEyes(g, opts, { y: headAt + 0.06, z: 0.27 });
  return g;
};

const animalGiraffe = (o, opts) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, '#F2C14E', [0.36, 0.32, 0.32], [0, 0.38, 0]));              // tana
  g.add(m(SPH, '#FBE8BC', [0.2, 0.17, 0.15], [0, 0.36, 0.18]));
  g.add(m(CYL, '#F2C14E', [0.11, 0.5, 0.11], [0, 0.85, -0.02], [0.08, 0, 0]));  // bo'yin
  g.add(m(SPH, '#F2C14E', [0.24, 0.22, 0.22], [0, 1.24, 0.02]));           // bosh
  g.add(m(SPH, '#FBE8BC', [0.13, 0.1, 0.09], [0, 1.16, 0.2]));
  [-1, 1].forEach(sgn => {
    g.add(m(CYL, '#C98A3B', [0.02, 0.1, 0.02], [0.08 * sgn, 1.44, 0]));    // shoxchalar
    g.add(m(SPH, '#C98A3B', [0.04, 0.04, 0.04], [0.08 * sgn, 1.5, 0]));
    g.add(m(SPH, '#F2C14E', [0.08, 0.05, 0.04], [0.2 * sgn, 1.32, 0], [0, 0, 0.4 * sgn]));  // quloq
  });
  if (!opts.sil) {
    g.add(m(SPH, '#E0A93C', [0.07, 0.06, 0.04], [-0.15, 0.5, 0.24]));      // dog'lar
    g.add(m(SPH, '#E0A93C', [0.06, 0.07, 0.04], [0.17, 0.34, 0.24]));
    g.add(m(SPH, '#E0A93C', [0.05, 0.05, 0.03], [0.05, 0.95, 0.09]));
  }
  addEyes(g, opts, { dx: 0.1, y: 1.28, z: 0.17, r: 0.045 });
  return g;
};

const animalMonkey = (o, opts) => {
  const { m } = o;
  const g = chibiBase(o, '#B96A28', '#A85A1E', '#F7DDB4');
  g.add(m(SPH, '#B96A28', [0.34, 0.32, 0.31], [0, headAt, 0]));
  if (!opts.sil) g.add(m(SPH, '#F7DDB4', [0.24, 0.19, 0.12], [0, headAt - 0.06, 0.22]));  // yuz dog'i
  [-1, 1].forEach(sgn => {
    g.add(m(SPH, '#B96A28', [0.11, 0.11, 0.05], [0.34 * sgn, headAt + 0.05, 0]));
    if (!opts.sil) g.add(m(SPH, '#F7DDB4', [0.06, 0.06, 0.03], [0.35 * sgn, headAt + 0.05, 0.04]));
  });
  if (!opts.sil) g.add(m(SPH, '#8F4A16', [0.04, 0.03, 0.02], [0, headAt - 0.13, 0.32]));
  g.add(m(new THREE.TorusGeometry(0.3, 0.05, 10, 20, Math.PI), '#A85A1E', [1, 1, 1], [0.32, 0.4, -0.3], [0.3, 1.2, 0]));  // dum
  addEyes(g, opts, { y: headAt + 0.04, z: 0.28 });
  return g;
};

const animalFox = (o, opts) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, '#FF8A50', [0.4, 0.36, 0.34], [0, 0.4, 0]));                 // tana
  g.add(m(SPH, '#FFF4E8', [0.24, 0.22, 0.18], [0, 0.38, 0.2]));             // qorincha
  g.add(m(SPH, '#E8703A', [0.1, 0.07, 0.12], [-0.2, 0.07, 0.14]));          // oyoqlar
  g.add(m(SPH, '#E8703A', [0.1, 0.07, 0.12], [0.2, 0.07, 0.14]));
  g.add(m(SPH, '#FF8A50', [0.36, 0.33, 0.32], [0, 1.0, 0]));                // bosh
  g.add(m(SPH, '#FFF4E8', [0.2, 0.15, 0.12], [0, 0.88, 0.24]));             // oq tumshuq
  if (!opts.sil) g.add(m(SPH, '#5C4033', [0.05, 0.045, 0.04], [0, 0.92, 0.35]));
  [-1, 1].forEach(sgn => {
    g.add(m(CONE, '#FF8A50', [0.13, 0.26, 0.08], [0.2 * sgn, 1.42, -0.02], [0, 0, -0.28 * sgn]));
    if (!opts.sil) g.add(m(CONE, '#5C4033', [0.06, 0.11, 0.04], [0.21 * sgn, 1.5, 0], [0, 0, -0.28 * sgn]));
  });
  // katta paxmoq dum (uchi oq)
  g.add(m(SPH, '#FF8A50', [0.16, 0.3, 0.14], [0.4, 0.4, -0.22], [0, 0, -0.7]));
  g.add(m(SPH, '#FFFFFF', [0.1, 0.12, 0.09], [0.58, 0.62, -0.22]));
  addEyes(g, opts, { y: 1.06, z: 0.28 });
  return g;
};

// lupali tulkicha — muqova/sertifikat maskoti
const foxWithLens = (o, opts) => {
  const g = animalFox(o, opts);
  const { m } = o;
  const lens = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.03, 28),
    new THREE.MeshStandardMaterial({ color: 0xCDEFFF, transparent: true, opacity: 0.55, roughness: 0.1 })
  );
  glass.rotation.x = Math.PI / 2;
  lens.add(glass);
  lens.add(m(new THREE.TorusGeometry(0.21, 0.045, 12, 28), '#7A5230'));
  lens.add(m(CYL, '#7A5230', [0.04, 0.26, 0.04], [0.16, -0.3, 0], [0, 0, 0.6]));
  lens.position.set(0.52, 0.85, 0.22);
  lens.rotation.z = 0.25;
  g.add(lens);
  return g;
};

// ============================================================
// NARSALAR
// ============================================================
const objApple = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FF5A4E', [0.42, 0.38, 0.42], [0, 0.4, 0]));
  g.add(m(CYL, '#8F5A2E', [0.035, 0.16, 0.035], [0, 0.82, 0], [0, 0, 0.2]));
  g.add(m(SPH, '#43A047', [0.12, 0.05, 0.07], [0.12, 0.84, 0], [0, 0, -0.4]));
  return g;
};
const objPear = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#A8CC5A', [0.36, 0.33, 0.36], [0, 0.33, 0]));
  g.add(m(SPH, c || '#A8CC5A', [0.24, 0.26, 0.24], [0, 0.72, 0]));
  g.add(m(CYL, '#8F5A2E', [0.03, 0.14, 0.03], [0, 0.98, 0], [0, 0, 0.15]));
  return g;
};
const objBanana = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(new THREE.TorusGeometry(0.42, 0.13, 14, 24, Math.PI * 0.95), c || '#FFD34D', [1, 1, 0.8], [0, 0.55, 0], [0, 0, -0.1]));
  g.add(m(SPH, '#8F5A2E', [0.045, 0.06, 0.045], [-0.42, 0.62, 0]));
  g.add(m(SPH, '#8F5A2E', [0.045, 0.06, 0.045], [0.44, 0.58, 0]));
  return g;
};
const objGrape = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const spots = [[0, 0.25], [-0.16, 0.38], [0.16, 0.38], [-0.08, 0.55], [0.08, 0.55], [0, 0.72], [-0.2, 0.6], [0.2, 0.6]];
  spots.forEach(([x, y], i) => g.add(m(SPH, c || '#8E5AE8', [0.14, 0.14, 0.14], [x, y, (i % 2) * 0.08 - 0.04])));
  g.add(m(CYL, '#8F5A2E', [0.03, 0.14, 0.03], [0, 0.9, 0]));
  g.add(m(SPH, '#43A047', [0.11, 0.045, 0.07], [0.1, 0.9, 0], [0, 0, -0.4]));
  return g;
};
const objOrange = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FFB03A', [0.4, 0.38, 0.4], [0, 0.4, 0]));
  g.add(m(SPH, '#43A047', [0.1, 0.05, 0.06], [0, 0.8, 0]));
  return g;
};
const objBasket = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const wall = new THREE.CylinderGeometry(0.58, 0.44, 0.5, 18, 1, true);
  const wm = m(wall, c || '#C98A4B', [1, 1, 1], [0, 0.28, 0]);
  wm.material.side = THREE.DoubleSide;
  g.add(wm);
  g.add(m(CYL, '#B8793A', [0.44, 0.03, 0.44], [0, 0.04, 0]));
  g.add(m(new THREE.TorusGeometry(0.58, 0.05, 10, 24), '#B8793A', [1, 1, 1], [0, 0.53, 0], [Math.PI / 2, 0, 0]));
  g.add(m(new THREE.TorusGeometry(0.4, 0.045, 10, 24, Math.PI), '#B8793A', [1, 1, 1], [0, 0.55, 0], [0, 0, 0]));
  return g;
};
const objBall = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FF5A4E', [0.4, 0.4, 0.4], [0, 0.4, 0]));
  if (!opts.sil && !opts.tint) {
    g.add(m(new THREE.TorusGeometry(0.4, 0.055, 10, 32), '#FFFFFF', [1, 1, 1], [0, 0.4, 0], [0.35, 0, 0]));
  }
  return g;
};
const objCube = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, c || '#4A90E2', [0.66, 0.66, 0.66], [0, 0.33, 0], [0, 0.5, 0]));
  if (!opts.sil) g.add(m(BOX, '#FFFFFF', [0.4, 0.4, 0.05], [0, 0.33, 0.24], [0, 0.5, 0], { opacity: 0.85, transparent: true }));
  return g;
};
const objSquare = objCube;
const objDot = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#4A90E2', [0.4, 0.4, 0.4], [0, 0.4, 0]));
  return g;
};
const objStar5 = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(starGeo, c || '#FFD34D', [0.45, 0.45, 0.45], [0, 0.5, 0]));
  return g;
};
const objHeart = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(heartGeo, c || '#FF5A8A', [0.45, 0.45, 0.45], [0, 0.48, 0]));
  return g;
};
const objPyramid = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const cols = opts.sil ? [SIL, SIL, SIL, SIL] : ['#FF5A4E', '#FFB03A', c || '#43C465', '#4A90E2'];
  cols.forEach((cc, i) => {
    g.add(m(new THREE.TorusGeometry(0.42 - i * 0.09, 0.1, 12, 24), cc, [1, 1, 1], [0, 0.14 + i * 0.2, 0], [Math.PI / 2, 0, 0]));
  });
  g.add(m(SPH, '#8E5AE8', [0.09, 0.09, 0.09], [0, 0.95, 0]));
  return g;
};
const objGift = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, c || '#B06BFF', [0.7, 0.55, 0.7], [0, 0.28, 0]));
  g.add(m(BOX, '#FFD34D', [0.74, 0.14, 0.16], [0, 0.28, 0]));
  g.add(m(BOX, '#FFD34D', [0.16, 0.14, 0.74], [0, 0.28, 0]));
  g.add(m(SPH, '#FFD34D', [0.1, 0.08, 0.1], [0, 0.6, 0]));
  return g;
};
const objCar = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, c || '#F5C518', [1.1, 0.3, 0.5], [0, 0.32, 0]));
  g.add(m(BOX, c || '#F5C518', [0.55, 0.28, 0.46], [-0.05, 0.6, 0]));
  if (!opts.sil) {
    g.add(m(BOX, '#BEE3F5', [0.2, 0.18, 0.48], [0.12, 0.6, 0]));
    g.add(m(BOX, '#BEE3F5', [0.18, 0.18, 0.48], [-0.28, 0.6, 0]));
  }
  [[-0.35, 0.26], [0.35, 0.26], [-0.35, -0.26], [0.35, -0.26]].forEach(([x, z]) => {
    g.add(m(CYL, '#2E3140', [0.14, 0.1, 0.14], [x, 0.14, z], [Math.PI / 2, 0, 0]));
    if (!opts.sil) g.add(m(CYL, '#8A8F9C', [0.07, 0.11, 0.07], [x, 0.14, z], [Math.PI / 2, 0, 0]));
  });
  return g;
};
const objBear = (o, opts, c) => {
  const { m } = o;
  const main = c || '#C98A4B';
  const g = new THREE.Group();
  g.add(m(SPH, main, [0.34, 0.3, 0.28], [0, 0.32, 0]));
  g.add(m(SPH, '#E8B888', [0.18, 0.15, 0.12], [0, 0.3, 0.18]));
  g.add(m(SPH, main, [0.1, 0.08, 0.1], [-0.2, 0.06, 0.12]));
  g.add(m(SPH, main, [0.1, 0.08, 0.1], [0.2, 0.06, 0.12]));
  g.add(m(SPH, main, [0.1, 0.1, 0.1], [-0.32, 0.42, 0.02]));
  g.add(m(SPH, main, [0.1, 0.1, 0.1], [0.32, 0.42, 0.02]));
  g.add(m(SPH, main, [0.27, 0.25, 0.24], [0, 0.78, 0]));
  [-1, 1].forEach(sgn => {
    g.add(m(SPH, main, [0.09, 0.09, 0.05], [0.19 * sgn, 0.98, 0]));
    if (!opts.sil) g.add(m(SPH, '#E8B888', [0.05, 0.05, 0.03], [0.19 * sgn, 0.98, 0.04]));
  });
  g.add(m(SPH, '#E8B888', [0.12, 0.09, 0.08], [0, 0.7, 0.2]));
  if (!opts.sil) g.add(m(SPH, '#2E3140', [0.04, 0.035, 0.03], [0, 0.74, 0.28]));
  addEyes(g, opts, { dx: 0.1, y: 0.84, z: 0.21, r: 0.04 });
  return g;
};
const objBowbear = (o, opts, c) => {
  const g = objBear(o, opts, c);
  const { m } = o;
  if (!opts.sil) {
    g.add(m(CONE, '#FF5A8A', [0.09, 0.12, 0.05], [-0.1, 1.06, 0.05], [0, 0, 1.9]));
    g.add(m(CONE, '#FF5A8A', [0.09, 0.12, 0.05], [0.1, 1.06, 0.05], [0, 0, -1.9]));
    g.add(m(SPH, '#E84A78', [0.05, 0.05, 0.04], [0, 1.06, 0.07]));
  }
  return g;
};
const objDoll = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CONE, c || '#E86A8A', [0.34, 0.6, 0.34], [0, 0.3, 0]));            // ko'ylak
  g.add(m(SPH, '#FFDBC4', [0.2, 0.2, 0.19], [0, 0.74, 0]));                  // yuz
  g.add(m(SPH, '#8F5A2E', [0.22, 0.2, 0.21], [0, 0.8, -0.04]));              // soch
  if (!opts.sil) {
    g.add(m(SPH, '#8F5A2E', [0.08, 0.14, 0.08], [-0.2, 0.66, 0]));
    g.add(m(SPH, '#8F5A2E', [0.08, 0.14, 0.08], [0.2, 0.66, 0]));
    g.add(m(SPH, '#FFDBC4', [0.05, 0.05, 0.05], [-0.28, 0.36, 0.08]));
    g.add(m(SPH, '#FFDBC4', [0.05, 0.05, 0.05], [0.28, 0.36, 0.08]));
  }
  addEyes(g, opts, { dx: 0.08, y: 0.76, z: 0.16, r: 0.035 });
  return g;
};
const objBalloon = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FF8FB3', [0.34, 0.42, 0.34], [0, 0.85, 0]));
  g.add(m(CONE, c || '#FF8FB3', [0.07, 0.09, 0.07], [0, 0.42, 0], [Math.PI, 0, 0]));
  g.add(m(CYL, '#8A8F9C', [0.012, 0.4, 0.012], [0, 0.2, 0]));
  return g;
};
const objCandy = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FF5A8A', [0.3, 0.3, 0.3], [0, 0.4, 0]));
  if (!opts.sil && !opts.tint) g.add(m(new THREE.TorusGeometry(0.3, 0.05, 10, 24), '#FFFFFF', [1, 1, 1], [0, 0.4, 0], [0, 0.5, 1.1]));
  g.add(m(CONE, c || '#FF5A8A', [0.13, 0.2, 0.1], [-0.42, 0.4, 0], [0, 0, 1.57]));
  g.add(m(CONE, c || '#FF5A8A', [0.13, 0.2, 0.1], [0.42, 0.4, 0], [0, 0, -1.57]));
  return g;
};
const objIcecream = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CONE, '#E8A05F', [0.24, 0.55, 0.24], [0, 0.3, 0], [Math.PI, 0, 0]));
  g.add(m(SPH, c || '#F2A9C4', [0.26, 0.24, 0.26], [0, 0.68, 0]));
  g.add(m(SPH, '#FF5A4E', [0.07, 0.07, 0.07], [0, 0.92, 0]));
  return g;
};
const objCookie = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CYL, c || '#D9A25F', [0.42, 0.14, 0.42], [0, 0.12, 0]));
  if (!opts.sil) {
    [[-0.15, 0.1], [0.12, 0.18], [0.2, -0.12], [-0.05, -0.2], [0.02, 0.02]].forEach(([x, z]) => {
      g.add(m(SPH, '#6B4A33', [0.06, 0.03, 0.06], [x, 0.2, z]));
    });
  }
  return g;
};
const objHouse = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, c || '#F2A45E', [0.9, 0.62, 0.7], [0, 0.31, 0]));
  g.add(m(new THREE.ConeGeometry(0.72, 0.45, 4), '#C0392B', [1, 1, 1], [0, 0.85, 0], [0, Math.PI / 4, 0]));
  if (!opts.sil) {
    g.add(m(BOX, '#8F5A2E', [0.2, 0.32, 0.06], [-0.2, 0.16, 0.36]));
    g.add(m(BOX, '#BEE3F5', [0.2, 0.2, 0.06], [0.2, 0.36, 0.36]));
  }
  return g;
};
const objTree = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CYL, '#8F5A2E', [0.09, 0.4, 0.09], [0, 0.2, 0]));
  g.add(m(SPH, c || '#43A047', [0.38, 0.34, 0.38], [0, 0.72, 0]));
  g.add(m(SPH, c || '#43A047', [0.26, 0.24, 0.26], [-0.26, 0.55, 0.05]));
  g.add(m(SPH, c || '#43A047', [0.26, 0.24, 0.26], [0.26, 0.55, -0.05]));
  return g;
};
const objMushroom = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CYL, '#FFEFD6', [0.14, 0.34, 0.14], [0, 0.17, 0]));
  g.add(m(SPH, c || '#FF5A4E', [0.4, 0.24, 0.4], [0, 0.42, 0]));
  if (!opts.sil) {
    g.add(m(SPH, '#FFFFFF', [0.07, 0.04, 0.07], [-0.16, 0.58, 0.12]));
    g.add(m(SPH, '#FFFFFF', [0.05, 0.035, 0.05], [0.14, 0.6, -0.08]));
    g.add(m(SPH, '#FFFFFF', [0.05, 0.03, 0.05], [0.1, 0.56, 0.22]));
  }
  return g;
};
const objFlower = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CYL, '#43A047', [0.035, 0.5, 0.035], [0, 0.25, 0]));
  const petal = c || '#F2A9C4';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(m(SPH, petal, [0.14, 0.14, 0.06], [Math.cos(a) * 0.2, 0.62 + Math.sin(a) * 0.2, 0]));
  }
  g.add(m(SPH, '#FFD34D', [0.12, 0.12, 0.08], [0, 0.62, 0.04]));
  g.add(m(SPH, '#43A047', [0.1, 0.04, 0.05], [0.12, 0.35, 0], [0, 0, -0.5]));
  return g;
};
const objMoon = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FFE9A8', [0.4, 0.4, 0.4], [0, 0.45, 0], [0, 0, 0], { roughness: 0.85 }));
  if (!opts.sil) {
    g.add(m(SPH, '#EED690', [0.09, 0.09, 0.04], [-0.12, 0.55, 0.34]));
    g.add(m(SPH, '#EED690', [0.06, 0.06, 0.03], [0.15, 0.4, 0.36]));
    g.add(m(SPH, '#EED690', [0.05, 0.05, 0.025], [-0.02, 0.28, 0.37]));
  }
  return g;
};
const objPlanet = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#3CE0C8', [0.36, 0.36, 0.36], [0, 0.45, 0]));
  g.add(m(new THREE.TorusGeometry(0.55, 0.05, 10, 36), '#FFD34D', [1, 1, 1], [0, 0.45, 0], [1.35, 0.2, 0]));
  return g;
};
const objPlanetPlain = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#B06BFF', [0.38, 0.38, 0.38], [0, 0.45, 0]));
  if (!opts.sil) {
    g.add(m(SPH, '#9A54E8', [0.1, 0.1, 0.05], [-0.12, 0.55, 0.32]));
    g.add(m(SPH, '#9A54E8', [0.07, 0.07, 0.04], [0.14, 0.38, 0.34]));
  }
  return g;
};
const objRocket = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(CYL, c || '#FF5A4E', [0.2, 0.6, 0.2], [0, 0.55, 0]));
  g.add(m(CONE, '#E8EEF4', [0.2, 0.3, 0.2], [0, 1.0, 0]));
  g.add(m(new THREE.TorusGeometry(0.1, 0.03, 10, 20), '#E8EEF4', [1, 1, 1], [0, 0.62, 0.18], [0, 0, 0]));
  if (!opts.sil) g.add(m(SPH, '#5AC8FA', [0.09, 0.09, 0.03], [0, 0.62, 0.19]));
  [-1, 1].forEach(sgn => g.add(m(BOX, '#FFB03A', [0.08, 0.3, 0.2], [0.24 * sgn, 0.28, 0], [0, 0, 0.35 * sgn])));
  g.add(m(CONE, '#FFB03A', [0.12, 0.22, 0.12], [0, 0.14, 0], [Math.PI, 0, 0], opts.sil ? {} : { emissive: 0xFF7043, emissiveIntensity: 0.6 }));
  return g;
};
const objCloud = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const col = c || '#FFFFFF';
  g.add(m(SPH, col, [0.34, 0.26, 0.26], [-0.25, 0.4, 0], [0, 0, 0], { roughness: 0.9 }));
  g.add(m(SPH, col, [0.4, 0.34, 0.3], [0.05, 0.48, 0], [0, 0, 0], { roughness: 0.9 }));
  g.add(m(SPH, col, [0.3, 0.24, 0.24], [0.35, 0.4, 0], [0, 0, 0], { roughness: 0.9 }));
  return g;
};
const objFrame = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, c || '#5AC8FA', [0.8, 0.64, 0.07], [0, 0.42, 0]));
  if (!opts.sil) {
    g.add(m(BOX, '#FFFDF6', [0.6, 0.44, 0.03], [0, 0.42, 0.04]));
    g.add(m(SPH, '#FFD34D', [0.07, 0.07, 0.02], [-0.14, 0.52, 0.06]));
    g.add(m(CONE, '#43A047', [0.14, 0.18, 0.05], [0.12, 0.36, 0.06]));
  }
  return g;
};
const objLamp = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FFD34D', [0.28, 0.32, 0.28], [0, 0.62, 0], [0, 0, 0],
    opts.sil ? {} : { emissive: 0xFFC23C, emissiveIntensity: 0.7 }));
  g.add(m(CYL, '#8A8F9C', [0.13, 0.16, 0.13], [0, 0.26, 0]));
  g.add(m(CYL, '#6E7380', [0.1, 0.08, 0.1], [0, 0.14, 0]));
  return g;
};
const objBox = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const col = c || '#C98A4B';
  g.add(m(BOX, col, [1.1, 0.08, 0.7], [0, 0.04, 0]));
  g.add(m(BOX, col, [1.1, 0.5, 0.08], [0, 0.25, -0.31]));
  g.add(m(BOX, col, [1.1, 0.5, 0.08], [0, 0.25, 0.31]));
  g.add(m(BOX, col, [0.08, 0.5, 0.7], [-0.51, 0.25, 0]));
  g.add(m(BOX, col, [0.08, 0.5, 0.7], [0.51, 0.25, 0]));
  if (!opts.sil) g.add(m(BOX, '#B8793A', [1.1, 0.4, 0.06], [0, 0.55, -0.5], [-0.5, 0, 0]));
  return g;
};
const mkFish = (main, dark, deco) => (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const body = c || main;
  g.add(m(SPH, body, [0.5, 0.32, 0.24], [0, 0.45, 0]));
  g.add(m(CONE, dark, [0.2, 0.3, 0.08], [-0.55, 0.45, 0], [0, 0, -1.57]));       // dum
  g.add(m(CONE, dark, [0.12, 0.18, 0.06], [0, 0.72, 0], [0, 0, -0.4]));          // ust suzgich
  if (!opts.sil) {
    if (deco === 'stripes') {
      g.add(m(SPH, dark, [0.06, 0.3, 0.25], [-0.1, 0.45, 0]));
      g.add(m(SPH, dark, [0.06, 0.26, 0.25], [0.12, 0.45, 0]));
    } else if (deco === 'dots') {
      g.add(m(SPH, dark, [0.05, 0.05, 0.03], [-0.12, 0.52, 0.22]));
      g.add(m(SPH, dark, [0.04, 0.04, 0.03], [0.08, 0.4, 0.23]));
      g.add(m(SPH, dark, [0.04, 0.04, 0.03], [0.05, 0.58, 0.2]));
    } else {
      g.add(m(SPH, '#FFFFFF', [0.2, 0.14, 0.1], [0.15, 0.38, 0.14]));
    }
    const eye = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.scale.setScalar(0.07); eye.position.set(0.32, 0.52, 0.16);
    g.add(eye);
    const pup = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x2E3140 }));
    pup.scale.setScalar(0.04); pup.position.set(0.35, 0.52, 0.2);
    g.add(pup);
  }
  return g;
};
const objMedal = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(BOX, '#E8573F', [0.16, 0.3, 0.03], [-0.08, 0.85, 0], [0, 0, 0.35]));
  g.add(m(BOX, '#4A90E2', [0.16, 0.3, 0.03], [0.08, 0.85, 0], [0, 0, -0.35]));
  g.add(m(CYL, c || '#FFD34D', [0.3, 0.06, 0.3], [0, 0.5, 0], [Math.PI / 2, 0, 0], { metalness: 0.5, roughness: 0.3 }));
  g.add(m(starGeo, '#E8A21F', [0.14, 0.14, 0.14], [0, 0.5, 0.05]));
  return g;
};
const objButterfly = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const col = c || '#B48CE0';
  g.add(m(SPH, '#2E3140', [0.05, 0.2, 0.05], [0, 0.5, 0]));
  [-1, 1].forEach(sgn => {
    g.add(m(SPH, col, [0.2, 0.16, 0.04], [0.2 * sgn, 0.62, 0], [0, 0, 0.4 * sgn]));
    g.add(m(SPH, col, [0.15, 0.12, 0.04], [0.16 * sgn, 0.4, 0], [0, 0, -0.3 * sgn]));
  });
  return g;
};
const objSun = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  g.add(m(SPH, c || '#FFD34D', [0.4, 0.4, 0.4], [0, 0.45, 0], [0, 0, 0], { emissive: 0xFFC23C, emissiveIntensity: 0.8 }));
  return g;
};
const objSeaweed = (o, opts, c) => {
  const { m } = o;
  const g = new THREE.Group();
  const col = c || '#2FA45C';
  [[-0.15, 0.15, 0.9], [0.05, -0.1, 1.15], [0.22, 0.2, 0.75]].forEach(([x, tilt, h]) => {
    g.add(m(new THREE.CylinderGeometry(0.03, 0.06, h, 8), col, [1, 1, 1], [x, h / 2, 0], [0, 0, tilt]));
  });
  return g;
};

// ============================================================
// REGISTR
// ============================================================
const MODELS = {
  // jonivorlar
  rabbit: animalRabbit, cat: animalCat, dog: animalDog, cow: animalCow,
  duck: animalDuck, rooster: animalRooster, lion: animalLion,
  giraffe: animalGiraffe, monkey: animalMonkey, fox: animalFox, foxLens: foxWithLens,
  // narsalar
  apple: objApple, pear: objPear, banana: objBanana, grape: objGrape, orange: objOrange,
  basket: objBasket, ball: objBall, cube: objCube, square: objSquare, dot: objDot,
  star5: objStar5, heart: objHeart, pyramid: objPyramid, gift: objGift, car: objCar,
  bear: objBear, bowbear: objBowbear, doll: objDoll, balloon: objBalloon,
  candy: objCandy, icecream: objIcecream, cookie: objCookie,
  house: objHouse, tree: objTree, mushroom: objMushroom, flower: objFlower,
  moon: objMoon, planet: objPlanet, planetPlain: objPlanetPlain, rocket: objRocket,
  cloud: objCloud, frame: objFrame, lamp: objLamp, box: objBox,
  fishA: mkFish('#F1863F', '#C25A1F', 'stripes'),
  fishB: mkFish('#5AC8FA', '#2E7DB0', 'dots'),
  fishC: mkFish('#FF8FB3', '#E86A8A', 'plain'),
  medal: objMedal, butterfly: objButterfly, sun: objSun, seaweed: objSeaweed,
};

export function buildModel(kind, { c = null, sil = false, tint = null } = {}) {
  const builder = MODELS[kind] || objStar5;
  const o = makeCtx({ sil, tint });
  const g = builder(o, { sil, tint }, c);
  g.userData.kind = kind;
  g.traverse(ch => { if (ch.isMesh) ch.castShadow = true; });
  return g;
}
