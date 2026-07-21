import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

// ============================================================
// 3D DVIJOK — threejs-fundamentals / threejs-interaction skilllari
// naqshlari asosida: renderer + kamera + yorug'lik + raycast +
// animatsiya sikli + effektlar (silkinish, konfetti, ok-halqa).
// Har o'yin sahifasi bitta <Scene3D onReady={build}/> oladi;
// build(api) sahnani to'ldiradi va ixtiyoriy cleanup qaytaradi.
// ============================================================

const CONFETTI_COLORS = [0xFF5A8A, 0xFFD34D, 0x5AC8FA, 0x43C465, 0x8E5AE8, 0xFF7043];

// umumiy (dispose qilinmaydigan) geometriyalar — konfetti uchun
const _confettiGeo = new THREE.BoxGeometry(0.09, 0.09, 0.02);
const _ringGeo = new THREE.TorusGeometry(1, 0.06, 10, 40);

export function Scene3D({ onReady, className, style }) {
  const hostRef = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // --- renderer / sahna / kamera ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 2.6, 8.5);
    camera.lookAt(0, 1, 0);

    // --- standart bolalarbop yorug'lik: osmon-yer + quyosh (soya bilan) ---
    const hemi = new THREE.HemisphereLight(0xfff6e0, 0xbfe49c, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // --- ichki holat ---
    const clickables = [];       // raycast nishonlari (userData.pick bilan)
    const ticks = new Set();     // har kadrda chaqiriladigan fn(t, dt)
    const shakes = [];           // { obj, baseX, t0 }
    const bursts = [];           // { group, parts:[{m,v,rs}], t0 }
    const rings = [];            // { mesh, t0 }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let disposed = false;

    const toPointer = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      return r;
    };

    // bosilgan nuqtadan yuqoriga ko'tarilib, pick belgilangan guruhni topamiz
    const findPickRoot = (obj) => {
      let cur = obj;
      while (cur) {
        if (cur.userData && cur.userData.pick) return cur;
        cur = cur.parent;
      }
      return null;
    };

    const api = {
      THREE, scene, camera, renderer, sun, hemi,
      dom: renderer.domElement,
      clickables,
      missHandler: null,          // bo'sh joy bosilganda
      moveHandler: null,          // pointer harakati (fonar, drag uchun)
      upHandler: null,
      addTick: (fn) => { ticks.add(fn); return () => ticks.delete(fn); },

      // ob'ekt (yoki Vector3) ekran koordinatasiga — yulduz parvozi uchun
      worldToScreen(target) {
        const v = new THREE.Vector3();
        if (target.isVector3) v.copy(target);
        else target.getWorldPosition(v);
        v.project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        return {
          x: r.left + ((v.x + 1) / 2) * r.width,
          y: r.top + ((-v.y + 1) / 2) * r.height,
        };
      },

      // pointerdan sahnaga nur — ray-plane kesishmasi (drag & fonar uchun)
      rayToPlane(e, plane, out) {
        toPointer(e);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.ray.intersectPlane(plane, out);
      },

      // yumshoq chapga-o'ngga silkinish (noto'g'ri javob)
      shake(obj) {
        if (!shakes.find(s => s.obj === obj)) {
          shakes.push({ obj, baseX: obj.position.x, t0: performance.now() });
        }
      },

      // 3D konfetti portlashi — worldPos atrofида 16 bo'lakcha
      burst(worldPos) {
        const group = new THREE.Group();
        group.position.copy(worldPos);
        const parts = [];
        for (let i = 0; i < 16; i++) {
          const mat = new THREE.MeshBasicMaterial({
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            transparent: true, side: THREE.DoubleSide,
          });
          const m = new THREE.Mesh(_confettiGeo, mat);
          const a = (i / 16) * Math.PI * 2;
          const sp = 1.6 + (i % 4) * 0.5;
          parts.push({
            m,
            v: new THREE.Vector3(Math.cos(a) * sp, 1.6 + (i % 3) * 0.7, Math.sin(a) * sp * 0.4),
            rs: 4 + (i % 5) * 2,
          });
          group.add(m);
        }
        scene.add(group);
        bursts.push({ group, parts, t0: performance.now() });
      },

      // yashil "barakalla" halqasi — to'g'ri javob atrofida kengayadi
      ringOk(worldPos, radius = 0.9) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x2FA45C, transparent: true });
        const mesh = new THREE.Mesh(_ringGeo, mat);
        mesh.position.copy(worldPos);
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.setScalar(radius * 0.3);
        mesh.userData.targetR = radius;
        scene.add(mesh);
        rings.push({ mesh, t0: performance.now() });
      },

      // ob'ektni sekin tebranib "suzib" turadigan qilish
      float(obj, { amp = 0.08, speed = 1.6, phase = 0, spin = 0 } = {}) {
        const baseY = obj.position.y;
        return api.addTick((t) => {
          obj.position.y = baseY + Math.sin(t * speed + phase) * amp;
          if (spin) obj.rotation.y += spin * 0.016;
        });
      },
    };

    // --- pointer hodisalari ---
    const onDown = (e) => {
      toPointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickables, true);
      const root = hits.length ? findPickRoot(hits[0].object) : null;
      if (root && !root.userData.disabled) {
        const wp = new THREE.Vector3();
        root.getWorldPosition(wp);
        root.userData.pick(root, api.worldToScreen(wp), hits[0]);
      } else if (api.missHandler) {
        api.missHandler(e, hits);
      }
    };
    const onMove = (e) => { if (api.moveHandler) api.moveHandler(e); };
    const onUp = (e) => { if (api.upHandler) api.upHandler(e); };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);

    // --- o'lcham: konteynerga moslashadi ---
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // --- sahifaning o'z quruvchisi ---
    const cleanup = readyRef.current ? readyRef.current(api) : null;

    // --- animatsiya sikli ---
    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      const now = performance.now();

      ticks.forEach(fn => fn(t, dt));

      // silkinishlar (~0.5 s, so'nuvchi sinus)
      for (let i = shakes.length - 1; i >= 0; i--) {
        const s = shakes[i];
        const k = (now - s.t0) / 500;
        if (k >= 1) { s.obj.position.x = s.baseX; shakes.splice(i, 1); }
        else s.obj.position.x = s.baseX + Math.sin(k * Math.PI * 6) * 0.12 * (1 - k);
      }
      // konfetti bo'lakchalari
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const k = (now - b.t0) / 1100;
        if (k >= 1) {
          scene.remove(b.group);
          b.parts.forEach(p => p.m.material.dispose());
          bursts.splice(i, 1);
        } else {
          b.parts.forEach(p => {
            p.v.y -= 6.5 * dt;
            p.m.position.addScaledVector(p.v, dt);
            p.m.rotation.x += p.rs * dt;
            p.m.rotation.y += p.rs * 0.7 * dt;
            p.m.material.opacity = 1 - k * k;
          });
        }
      }
      // ok-halqalar (kengayib so'nadi)
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const k = (now - r.t0) / 700;
        if (k >= 1) {
          scene.remove(r.mesh);
          r.mesh.material.dispose();
          rings.splice(i, 1);
        } else {
          r.mesh.scale.setScalar(r.mesh.userData.targetR * (0.3 + k * 0.9));
          r.mesh.material.opacity = 1 - k;
        }
      }

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      if (cleanup) cleanup();
      // sahnadagi barcha geometriya/materiallarni bo'shatamiz
      scene.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { if (m && !m.userData.shared) m.dispose(); });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className={className} style={style}/>;
}
