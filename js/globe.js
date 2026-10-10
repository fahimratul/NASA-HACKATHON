/* ===========================================================
   ECHO EARTH — Mission Globe (Three.js)
   =========================================================== */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

// Immediately hide the spinner as a hard fail-safe even if init() errors
setTimeout(() => {
  const el = document.getElementById('globeLoading');
  if (el) { el.classList.add('hidden'); setTimeout(() => el.remove(), 600); }
}, 8000);

const TEX = {
  earth:  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_atmos_2048.jpg',
  normal: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_normal_2048.jpg',
  spec:   'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_specular_2048.jpg',
  clouds: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_clouds_1024.png',
  night:  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r161/examples/textures/planets/earth_lights_2048.png',
};

const state = {
  initialized: false,
  autoRotate: true,
  dragging: false,
  lastX: 0, lastY: 0,
  activeLocationId: null,
  targetQuat: null,  // slerp target
};

let scene, camera, renderer, earthGroup, earth, clouds, atmosphere, stars, markers;
let markerMeshes = {}; // id → mesh
let container, hoverId = null;
let rafId = null;

// ---------- utils ----------

function latLonToVec3(lat, lon, radius) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Target quaternion that brings a point on the Earth to face the camera (+Z)
function faceQuaternionFor(lat, lon) {
  const target = latLonToVec3(lat, lon, 1).normalize();
  // We want earthGroup.rotation such that R * target = (0,0,1) in world
  const forward = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(target, forward);
  return q;
}

// ---------- scene ----------

function init() {
  if (state.initialized) return;
  container = document.getElementById('globeCanvas');
  if (!container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 1000);
  camera.position.set(0, 0, 3.2);

  // --- Earth group (rotates + markers follow)
  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const hideLoader = () => {
    const el = document.getElementById('globeLoading');
    if (el) { el.classList.add('hidden'); setTimeout(() => el.remove(), 600); }
  };

  // --- Earth sphere renders INSTANTLY with a solid colour.
  // Textures swap in once they finish loading.
  const earthGeo = new THREE.SphereGeometry(1, 96, 96);
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x1a3d6b,
    specular: new THREE.Color(0x2a3240),
    shininess: 14,
  });
  earth = new THREE.Mesh(earthGeo, earthMat);
  earthGroup.add(earth);

  // Clouds — placeholder transparent material; swap in when texture loads
  const cloudsGeo = new THREE.SphereGeometry(1.012, 96, 96);
  const cloudsMat = new THREE.MeshPhongMaterial({
    transparent: true, opacity: 0, depthWrite: false,
  });
  clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
  earthGroup.add(clouds);

  // Hide spinner right away — the sphere is already visible.
  hideLoader();

  // --- Async texture loading
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  loader.load(TEX.earth,
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      earthMat.map = tex;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
    },
    undefined,
    err => console.warn('[globe] earth texture failed', err)
  );
  loader.load(TEX.normal, tex => { earthMat.normalMap = tex; earthMat.needsUpdate = true; });
  loader.load(TEX.spec,   tex => { earthMat.specularMap = tex; earthMat.needsUpdate = true; });
  loader.load(TEX.clouds, tex => {
    cloudsMat.map = tex;
    cloudsMat.opacity = 0.42;
    cloudsMat.needsUpdate = true;
  });
  // Night-side city lights as emissive — simple and robust
  loader.load(TEX.night, tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    earthMat.emissive = new THREE.Color(0xffffff);
    earthMat.emissiveMap = tex;
    earthMat.emissiveIntensity = 0.35;
    earthMat.needsUpdate = true;
  });

  // Atmosphere glow (fresnel)
  const atmoGeo = new THREE.SphereGeometry(1.09, 96, 96);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x4d8bf5) },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
        gl_FragColor = vec4(glowColor, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  scene.add(atmosphere);

  // Starfield (3D points)
  const starsGeo = new THREE.BufferGeometry();
  const N = 4000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 90 + Math.random() * 40;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(p) * Math.cos(t);
    pos[i*3+1] = r * Math.sin(p) * Math.sin(t);
    pos[i*3+2] = r * Math.cos(p);
    const tint = Math.random();
    if (tint > 0.9) { col[i*3]=0.75; col[i*3+1]=0.85; col[i*3+2]=1.0; }       // blue star
    else if (tint > 0.75) { col[i*3]=1.0; col[i*3+1]=0.9; col[i*3+2]=0.75; }  // warm star
    else { col[i*3]=1.0; col[i*3+1]=1.0; col[i*3+2]=1.0; }                    // white
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starsGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starsMat = new THREE.PointsMaterial({
    size: 0.35, sizeAttenuation: true,
    vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false,
  });
  stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // Lights — a key sun light + fill
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 2, 6);
  scene.add(sun);

  const fill = new THREE.AmbientLight(0x334155, 0.35);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x4d8bf5, 0.4);
  rim.position.set(-5, 1, -3);
  scene.add(rim);

  // Markers group — follow earth rotation
  markers = new THREE.Group();
  earthGroup.add(markers);
  addMarkers();

  // Interactions
  setupInteraction();

  // Observe resize
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  state.initialized = true;
  animate();
}

function addMarkers() {
  const D = window.ECHO;
  if (!D) return;

  D.LOCATIONS.forEach(loc => {
    const g = new THREE.Group();
    const pos = latLonToVec3(loc.lat, loc.lon, 1.005);
    g.position.copy(pos);

    // Dot
    const dotGeo = new THREE.SphereGeometry(0.014, 20, 20);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    g.add(dot);

    // Halo (ring facing outward)
    const haloGeo = new THREE.RingGeometry(0.02, 0.028, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.lookAt(pos.clone().multiplyScalar(2));
    g.add(halo);

    // Pulse ring (animated)
    const pulseGeo = new THREE.RingGeometry(0.02, 0.028, 48);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.lookAt(pos.clone().multiplyScalar(2));
    g.add(pulse);

    // Beacon line (short vertical from surface)
    const beamMat = new THREE.LineBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0.55,
    });
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      pos.clone().normalize().multiplyScalar(0.08),
    ]);
    const beam = new THREE.Line(beamGeo, beamMat);
    g.add(beam);

    g.userData = { loc, pulse, dot, halo, isMarker: true };
    markers.add(g);
    markerMeshes[loc.id] = g;
  });
}

function setActiveMarker(id) {
  state.activeLocationId = id;
  Object.entries(markerMeshes).forEach(([k, g]) => {
    const active = (k === id);
    g.userData.dot.material.color.set(active ? 0x38bdf8 : 0xff6b35);
    g.userData.halo.material.color.set(active ? 0x38bdf8 : 0xff8a3d);
    g.userData.pulse.material.color.set(active ? 0x38bdf8 : 0xff8a3d);
    g.userData.active = active;
  });
}

function focusOn(lat, lon) {
  if (!earthGroup) return;
  state.targetQuat = faceQuaternionFor(lat, lon);
  state.autoRotate = false;
}

function setupInteraction() {
  const dom = renderer.domElement;

  dom.addEventListener('pointerdown', e => {
    state.dragging = true;
    state.lastX = e.clientX; state.lastY = e.clientY;
    state.autoRotate = false;
    state.targetQuat = null;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointerup', e => {
    state.dragging = false;
    try { dom.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  dom.addEventListener('pointermove', e => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), dx * 0.005);
    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), dy * 0.005);
    // apply world-space rotations
    earthGroup.quaternion.premultiply(qY).premultiply(qX);
    state.lastX = e.clientX; state.lastY = e.clientY;
  });

  dom.addEventListener('wheel', e => {
    e.preventDefault();
    const d = e.deltaY * 0.0015;
    camera.position.z = Math.max(1.6, Math.min(6, camera.position.z + d));
  }, { passive: false });

  // Reset button
  const btn = document.getElementById('globeReset');
  if (btn) btn.addEventListener('click', () => {
    state.autoRotate = true;
    state.targetQuat = null;
  });
}

function onResize() {
  if (!container || !renderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------- animation ----------

const _clock = new THREE.Clock();

function animate() {
  rafId = requestAnimationFrame(animate);
  const dt = _clock.getDelta();
  const t = _clock.elapsedTime;

  // Smooth slerp toward a target orientation
  if (state.targetQuat) {
    earthGroup.quaternion.slerp(state.targetQuat, 0.08);
    if (earthGroup.quaternion.angleTo(state.targetQuat) < 0.01) {
      state.targetQuat = null;
    }
  } else if (state.autoRotate && !state.dragging) {
    earthGroup.rotation.y += dt * 0.08;
  }

  if (clouds) clouds.rotation.y += dt * 0.015;
  if (stars)  stars.rotation.y  += dt * 0.004;

  // Pulse rings
  Object.values(markerMeshes).forEach(g => {
    const p = g.userData.pulse;
    const scalePhase = (t * 1.2 + (g.position.x + g.position.y)) % 1.6;
    const s = 1 + scalePhase * 2.2;
    p.scale.set(s, s, s);
    p.material.opacity = Math.max(0, 0.7 - scalePhase * 0.5);
  });

  renderer.render(scene, camera);
}

// ---------- side panel wiring ----------

function renderStationList() {
  const D = window.ECHO;
  const ul = document.getElementById('stationList');
  if (!ul || !D) return;
  ul.innerHTML = D.LOCATIONS.map(l => `
    <li data-id="${l.id}">
      <span class="beacon"></span>
      <span class="name">${l.name}</span>
      <span class="coord">${l.lat.toFixed(2)}°, ${l.lon.toFixed(2)}°</span>
    </li>
  `).join('');
  ul.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = li.dataset.id;
    selectStation(id);
  });
}

function selectStation(id) {
  const D = window.ECHO;
  const loc = D.LOCATIONS.find(l => l.id === id);
  if (!loc) return;
  // highlight list
  document.querySelectorAll('#stationList li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === id);
  });
  // sync side-wide location picker
  const sel = document.getElementById('locationSelect');
  if (sel && sel.value !== id) {
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
  }
  // readout
  updateReadout(id);
  // globe focus
  focusOn(loc.lat, loc.lon);
  setActiveMarker(id);
}

function updateReadout(id) {
  const h = (window.ECHO.HAZARD || {})[id];
  const sig = document.getElementById('sigPill');
  if (!h) {
    document.getElementById('roClimate').textContent = '—';
    document.getElementById('roAnomaly').textContent = '—';
    document.getElementById('roHazard').textContent  = '—';
    document.getElementById('roExposure').textContent= '—';
    sig.textContent = '—'; sig.className = 'pill pill-muted';
    return;
  }
  document.getElementById('roClimate').textContent  = h.layers.climate.value;
  document.getElementById('roAnomaly').textContent  = h.layers.anomaly.value;
  document.getElementById('roHazard').textContent   = h.layers.hazard.value;
  document.getElementById('roExposure').textContent = h.layers.exposure.value;
  const p = h.probability.h48 ?? 0;
  sig.textContent = p >= 0.66 ? 'high signal' : p >= 0.33 ? 'moderate signal' : 'low signal';
  sig.className   = 'pill ' + (p >= 0.66 ? 'pill-alert' : p >= 0.33 ? 'pill-warn' : 'pill-good');
}

// UTC clock
function startClock() {
  const el = document.getElementById('utcClock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- bootstrap ----------

function boot() {
  renderStationList();
  startClock();

  // Lazy-init on first show (and whenever becoming visible)
  const activate = () => {
    requestAnimationFrame(() => {
      init();
      onResize();
    });
  };

  // If Globe view is already active on load
  if (document.getElementById('view-globe')?.classList.contains('active')) {
    activate();
  }

  // Hook sidebar nav
  document.getElementById('viewNav')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view === 'globe') activate();
  });

  // Sync when global location picker changes
  document.getElementById('locationSelect')?.addEventListener('change', e => {
    const id = e.target.value;
    const D = window.ECHO;
    const loc = D.LOCATIONS.find(l => l.id === id);
    if (loc && state.initialized) {
      focusOn(loc.lat, loc.lon);
      setActiveMarker(id);
      document.querySelectorAll('#stationList li').forEach(li => {
        li.classList.toggle('active', li.dataset.id === id);
      });
      updateReadout(id);
    }
  });

  // Initial selection
  const initial = document.getElementById('locationSelect')?.value || 'sylhet';
  setTimeout(() => {
    updateReadout(initial);
    document.querySelectorAll('#stationList li').forEach(li => {
      li.classList.toggle('active', li.dataset.id === initial);
    });
  }, 50);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
