/* ===========================================================
   ECHO EARTH — dashboard app
   =========================================================== */

(function () {
  'use strict';

  const D = window.ECHO;

  const state = {
    view: 'trends',
    variable: 'temperature',
    locationId: 'sylhet',
    horizon: 48,
    eventId: 'sylhet_2022',
  };

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function hexToRgb(h) {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0,2), 16), parseInt(s.slice(2,4), 16), parseInt(s.slice(4,6), 16)];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(n => clamp(Math.round(n),0,255).toString(16).padStart(2,'0')).join('');
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0]-A[0])*t, A[1] + (B[1]-A[1])*t, A[2] + (B[2]-A[2])*t);
  }
  function colorAt(ramp, t) {
    t = clamp(t, 0, 1);
    const n = ramp.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const u = t * n - i;
    return mixHex(ramp[i], ramp[i+1], u);
  }

  function sigLabel(code) {
    return { sig: 'significant', mar: 'marginal', ns: 'not significant' }[code] || '—';
  }

  // ------------------------------------------------------------------
  // View switching
  // ------------------------------------------------------------------

  function setView(name) {
    state.view = name;
    $$('#viewNav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  }

  $('#viewNav').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setView(b.dataset.view);
  });

  // ------------------------------------------------------------------
  // Location & horizon
  // ------------------------------------------------------------------

  function initLocation() {
    const sel = $('#locationSelect');
    sel.innerHTML = D.LOCATIONS.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    sel.value = state.locationId;
    updateCoord();
    sel.addEventListener('change', () => {
      state.locationId = sel.value;
      updateCoord();
      renderHazard();
      const loc = D.LOCATIONS.find(l => l.id === state.locationId);
      if (loc) placeMarker(loc);
    });
  }
  function updateCoord() {
    const loc = D.LOCATIONS.find(l => l.id === state.locationId);
    $('#locCoord').textContent = loc ? `${loc.lat.toFixed(2)}°N · ${loc.lon.toFixed(2)}°E` : '—';
  }

  $('#horizonTabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.horizon = parseInt(b.dataset.h, 10);
    $$('#horizonTabs button').forEach(x => x.classList.toggle('active', x === b));
    renderHazard();
  });

  // ------------------------------------------------------------------
  // Trends — variable tabs
  // ------------------------------------------------------------------

  function initVarTabs() {
    const row = $('#varTabs');
    row.innerHTML = Object.values(D.VARIABLES).map(v => `
      <button class="var-tab ${v.id === state.variable ? 'active' : ''}" data-v="${v.id}">
        <span class="swatch" style="background:${v.swatch}"></span>${v.short}
      </button>
    `).join('');
    row.addEventListener('click', e => {
      const b = e.target.closest('.var-tab');
      if (!b) return;
      state.variable = b.dataset.v;
      $$('.var-tab').forEach(x => x.classList.toggle('active', x.dataset.v === state.variable));
      renderTrends();
    });
  }

  // ------------------------------------------------------------------
  // Trends — SVG mock map (no tile API, no external data)
  // ------------------------------------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROJ = {
    lonMin: 87.5, lonMax: 93.4,
    latMin: 20.1, latMax: 27.1,
    w: 820, h: 640,
  };
  function proj(lon, lat) {
    return [
      (lon - PROJ.lonMin) * (PROJ.w / (PROJ.lonMax - PROJ.lonMin)),
      (PROJ.latMax - lat) * (PROJ.h / (PROJ.latMax - PROJ.latMin)),
    ];
  }

  // Simplified Bangladesh outline — hand-digitised, ~55 points.
  // Lon, Lat. Rough but recognisable.
  const BD_OUTLINE = [
    [88.42, 26.63],[88.46, 26.75],[88.60, 26.60],[88.80, 26.52],
    [89.00, 26.47],[89.25, 26.37],[89.45, 26.20],[89.60, 26.17],
    [89.72, 26.26],[89.85, 25.93],[89.90, 25.33],[90.10, 25.20],
    [90.44, 25.12],[90.76, 25.17],[91.14, 25.19],[91.45, 25.17],
    [91.70, 25.12],[92.00, 25.04],[92.25, 24.95],[92.33, 24.73],
    [92.27, 24.42],[92.08, 24.15],[92.00, 23.72],[92.33, 23.42],
    [92.42, 22.88],[92.57, 22.35],[92.65, 21.95],[92.60, 21.55],
    [92.35, 21.37],[92.20, 21.12],[92.17, 20.80],[92.08, 20.72],
    [91.95, 20.92],[91.86, 21.33],[91.80, 21.48],[91.60, 21.72],
    [91.42, 21.97],[90.85, 21.81],[90.42, 21.84],[90.13, 21.77],
    [89.70, 21.80],[89.45, 21.72],[89.15, 21.95],[88.95, 22.18],
    [88.95, 22.56],[88.85, 22.90],[88.80, 23.25],[88.70, 23.60],
    [88.60, 24.10],[88.42, 24.37],[88.29, 24.70],[88.11, 25.00],
    [88.42, 25.42],[88.82, 25.75],[88.60, 26.10],[88.42, 26.33],
    [88.42, 26.63],
  ];

  // Decorative schematic river traces — not geographically accurate,
  // just enough to read as "delta country" at a glance.
  const RIVERS = [
    // Padma/Ganges — comes in from NW, flows SE
    [[88.2, 25.0],[88.9, 24.7],[89.5, 24.4],[89.9, 24.0],[90.4, 23.7],[90.6, 23.3],[90.9, 22.9]],
    // Jamuna/Brahmaputra — from N, flows S
    [[89.6, 26.1],[89.7, 25.6],[89.8, 25.0],[89.9, 24.5],[90.0, 24.0],[90.3, 23.6]],
    // Meghna — from NE, flows S
    [[91.8, 24.9],[91.5, 24.6],[91.0, 24.2],[90.8, 23.8],[90.7, 23.2],[90.8, 22.5]],
    // Karnaphuli — Chittagong
    [[92.3, 22.7],[92.0, 22.5],[91.9, 22.3]],
  ];

  let svgRoot = null;
  let markerGroupEl = null;

  function initMap() {
    const container = document.getElementById('trendMap');
    if (!container) return;
    container.innerHTML = '';

    svgRoot = document.createElementNS(SVG_NS, 'svg');
    svgRoot.setAttribute('viewBox', `0 0 ${PROJ.w} ${PROJ.h}`);
    svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgRoot.setAttribute('class', 'trend-svg');
    svgRoot.innerHTML = `
      <defs>
        <radialGradient id="trendBg" cx="50%" cy="42%" r="78%">
          <stop offset="0%"  stop-color="#0b1428"/>
          <stop offset="55%" stop-color="#070a15"/>
          <stop offset="100%" stop-color="#03050c"/>
        </radialGradient>
        <radialGradient id="landGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%"  stop-color="rgba(77,139,245,0.08)"/>
          <stop offset="100%" stop-color="rgba(77,139,245,0)"/>
        </radialGradient>
        <filter id="markerGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#trendBg)"/>
      <circle cx="${PROJ.w*0.5}" cy="${PROJ.h*0.45}" r="${PROJ.w*0.4}" fill="url(#landGlow)"/>
      <g id="svgGraticule"></g>
      <g id="svgCountries"></g>
      <g id="svgRivers"></g>
      <g id="svgGrid"></g>
      <g id="svgMarkers"></g>
      <g id="svgChrome"></g>
    `;
    container.appendChild(svgRoot);

    drawGraticule();
    drawCountries();
    drawRivers();
    drawChrome();

    markerGroupEl = svgRoot.querySelector('#svgMarkers');
    const loc = D.LOCATIONS.find(l => l.id === state.locationId);
    if (loc) placeMarker(loc);
  }

  function drawGraticule() {
    const g = svgRoot.querySelector('#svgGraticule');
    let out = '';
    for (let lon = Math.ceil(PROJ.lonMin); lon <= Math.floor(PROJ.lonMax); lon++) {
      const [x] = proj(lon, 0);
      out += `<line x1="${x}" y1="0" x2="${x}" y2="${PROJ.h}" stroke="rgba(154,166,192,0.08)" stroke-dasharray="2 6"/>`;
      out += `<text x="${x + 3}" y="12" fill="#5e6a84" font-family="JetBrains Mono" font-size="10">${lon}°E</text>`;
    }
    for (let lat = Math.ceil(PROJ.latMin); lat <= Math.floor(PROJ.latMax); lat++) {
      const [, y] = proj(0, lat);
      out += `<line x1="0" y1="${y}" x2="${PROJ.w}" y2="${y}" stroke="rgba(154,166,192,0.08)" stroke-dasharray="2 6"/>`;
      out += `<text x="4" y="${y - 2}" fill="#5e6a84" font-family="JetBrains Mono" font-size="10">${lat}°N</text>`;
    }
    g.innerHTML = out;
  }

  function drawCountries() {
    const g = svgRoot.querySelector('#svgCountries');
    const points = BD_OUTLINE.map(p => proj(p[0], p[1]).join(',')).join(' ');
    g.innerHTML = `
      <polygon points="${points}"
               fill="rgba(77,139,245,0.07)"
               stroke="rgba(77,139,245,0.55)"
               stroke-width="1.4"
               stroke-linejoin="round"
               style="filter: drop-shadow(0 0 6px rgba(77,139,245,0.35));" />
      <text x="${proj(90.4, 23.78)[0]}" y="${proj(90.4, 23.78)[1] - 6}"
            text-anchor="middle" font-family="Inter" font-size="11"
            letter-spacing="0.18em" fill="rgba(154,166,192,0.55)">BANGLADESH</text>
      <text x="${proj(88.2, 26.2)[0]}" y="${proj(88.2, 26.2)[1]}"
            font-family="JetBrains Mono" font-size="9" fill="rgba(94,106,132,0.6)">INDIA</text>
      <text x="${proj(92.9, 22.7)[0]}" y="${proj(92.9, 22.7)[1]}"
            font-family="JetBrains Mono" font-size="9" fill="rgba(94,106,132,0.6)">MYANMAR</text>
      <text x="${proj(90.0, 21.3)[0]}" y="${proj(90.0, 21.3)[1]}"
            text-anchor="middle" font-family="Fraunces" font-style="italic" font-size="12"
            fill="rgba(94,106,132,0.5)">Bay of Bengal</text>
    `;
  }

  function drawRivers() {
    const g = svgRoot.querySelector('#svgRivers');
    const paths = RIVERS.map(r => {
      const d = r.map((p, i) => {
        const [x, y] = proj(p[0], p[1]);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
      return `<path d="${d}" stroke="rgba(56,189,248,0.35)" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    }).join('');
    g.innerHTML = paths;
  }

  function drawChrome() {
    const g = svgRoot.querySelector('#svgChrome');
    // Scale bar: 100 km ≈ 0.9° latitude
    const [x0] = proj(PROJ.lonMin, 0);
    const [x1] = proj(PROJ.lonMin + 0.9, 0);
    const scaleW = x1 - x0;
    const sx = PROJ.w - scaleW - 24;
    const sy = PROJ.h - 24;
    // North arrow
    const nx = PROJ.w - 44, ny = 48;
    g.innerHTML = `
      <g transform="translate(${sx} ${sy})">
        <line x1="0" y1="0" x2="${scaleW}" y2="0" stroke="rgba(154,166,192,0.75)" stroke-width="2"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(154,166,192,0.75)" stroke-width="2"/>
        <line x1="${scaleW}" y1="-4" x2="${scaleW}" y2="4" stroke="rgba(154,166,192,0.75)" stroke-width="2"/>
        <text x="${scaleW / 2}" y="-7" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="rgba(154,166,192,0.9)">100 km</text>
      </g>
      <g transform="translate(${nx} ${ny})">
        <circle r="22" fill="rgba(5,7,15,0.55)" stroke="rgba(255,255,255,0.14)"/>
        <polygon points="0,-16 5,8 0,4 -5,8" fill="#fc3d21"/>
        <polygon points="0,16 5,-8 0,-4 -5,-8" fill="rgba(255,255,255,0.35)"/>
        <text y="28" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#9aa6c0">N</text>
      </g>
      <g transform="translate(18 ${PROJ.h - 38})">
        <text font-family="JetBrains Mono" font-size="10" fill="rgba(154,166,192,0.6)">EQUIRECTANGULAR · WGS84</text>
      </g>
    `;
  }

  function placeMarker(loc) {
    if (!markerGroupEl) return;
    const [x, y] = proj(loc.lon, loc.lat);
    const short = (loc.name || '').split('·')[0].trim();
    markerGroupEl.innerHTML = `
      <g transform="translate(${x} ${y})" class="marker-group">
        <circle r="20" fill="none" stroke="#fc3d21" stroke-width="1" opacity="0.35" class="marker-pulse"/>
        <circle r="12" fill="none" stroke="#fc3d21" stroke-width="1.4" opacity="0.55"/>
        <circle r="4"  fill="#fc3d21" stroke="#ffffff" stroke-width="1.5" filter="url(#markerGlow)"/>
        <line x1="0" y1="0" x2="0" y2="-26" stroke="rgba(252,61,33,0.55)" stroke-width="1"/>
        <rect x="-56" y="-44" width="112" height="18" rx="2" fill="rgba(5,7,15,0.78)" stroke="rgba(252,61,33,0.5)"/>
        <text y="-31" text-anchor="middle" font-family="Inter" font-size="11" font-weight="600" fill="#ffffff">${short}</text>
      </g>
    `;
  }

  function renderMapGrid() {
    if (!svgRoot) return;
    const v = D.VARIABLES[state.variable];
    const [dmin, dmax] = v.domain;
    const g = svgRoot.querySelector('#svgGrid');
    const html = v.grid.map(cell => {
      const t = (cell.value - dmin) / (dmax - dmin);
      const color = colorAt(v.ramp, t);
      const [x0, y0] = proj(cell.bounds[0][1], cell.bounds[1][0]); // lon_min, lat_max
      const [x1, y1] = proj(cell.bounds[1][1], cell.bounds[0][0]); // lon_max, lat_min
      const w = x1 - x0, h = y1 - y0;
      const title = `${v.short}\n${cell.center[0].toFixed(2)}°N · ${cell.center[1].toFixed(2)}°E\n${cell.value.toFixed(3)} ${v.unit}`;
      return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
                   fill="${color}" fill-opacity="0.62" class="trend-cell"
                   data-val="${cell.value.toFixed(3)}" data-unit="${v.unit}"
                   data-lat="${cell.center[0].toFixed(2)}" data-lon="${cell.center[1].toFixed(2)}"><title>${title}</title></rect>`;
    }).join('');
    g.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Trends — legend / stats / regions
  // ------------------------------------------------------------------

  function renderLegend() {
    const v = D.VARIABLES[state.variable];
    $('#legendTitle').textContent = `${v.label} · trend`;
    $('#legendUnit').textContent  = v.unit;
    $('#legendMin').textContent   = v.domain[0];
    $('#legendMax').textContent   = v.domain[1] > 0 ? '+' + v.domain[1] : v.domain[1];
    const stops = v.ramp.map((c, i) => `${c} ${(i / (v.ramp.length - 1)) * 100}%`).join(', ');
    $('#legendBar').style.background = `linear-gradient(90deg, ${stops})`;
  }

  function renderStats() {
    const v = D.VARIABLES[state.variable];
    const slope = v.overall.slope;
    const sign = slope > 0 ? '+' : '';
    $('#statSlope').textContent = `${sign}${slope} ${v.unit}`;
    $('#statUnit').textContent  = `Over the full record (${v.overall.years})`;
    $('#statP').textContent     = `p = ${v.overall.pValue}`;
    const sd = $('#sigDot');
    sd.className = 'sig-dot ' + v.overall.significance;
    $('#statSigLabel').textContent = sigLabel(v.overall.significance);
    $('#trendSummary').textContent = v.summary;
    $('#trendSource').textContent  = `source: ${v.source}`;
  }

  function renderRegions() {
    const v = D.VARIABLES[state.variable];
    const html = v.regions.map(r => `
      <article class="region-tile">
        <h4>${r.name}</h4>
        <div class="val ${r.dir === 'up' ? 'trend-up' : 'trend-down'}">${r.value}</div>
        <div class="ctx">${r.ctx}</div>
      </article>
    `).join('');
    $('#regionContrast').innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Trends — anomaly chart
  // ------------------------------------------------------------------

  let anomalyChart = null;

  function renderAnomalyChart() {
    const v = D.VARIABLES[state.variable];
    const labels = v.anomaly.months;
    const values = v.anomaly.values;

    // Positive → warm orange/red; negative → cool cyan
    const colors = values.map(x => (x >= 0 ? '#ff8a3d' : '#38bdf8'));

    if (anomalyChart) anomalyChart.destroy();

    const ctx = $('#anomalyChart').getContext('2d');
    anomalyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 0.95,
        }],
      },
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => items[0].label,
              label: item => `${item.formattedValue} ${v.unit.replace('/ year','').replace('/ decade','')}`.trim(),
            },
            backgroundColor: 'rgba(5,7,15,0.95)',
            titleColor: '#e6ebf5',
            bodyColor: '#38bdf8',
            borderColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            titleFont: { family: 'JetBrains Mono' },
            bodyFont:  { family: 'JetBrains Mono' },
          },
        },
        scales: {
          x: {
            ticks: {
              font: { family: 'JetBrains Mono', size: 10 },
              color: '#5e6a84',
              maxRotation: 0,
              autoSkip: true,
              autoSkipPadding: 24,
              callback(_, i) {
                const lbl = this.getLabelForValue(i);
                return lbl && lbl.endsWith('-01') ? lbl.slice(0, 4) : '';
              },
            },
            grid: { display: false },
            border: { color: 'rgba(255,255,255,0.1)' },
          },
          y: {
            ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#5e6a84' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { display: false },
            title: { display: true, text: 'Anomaly', color: '#9aa6c0', font: { family: 'Inter', size: 11 } },
          },
        },
      },
    });

    $('#anomalyPeriod').textContent = `${labels[0]} → ${labels[labels.length - 1]}`;
  }

  // ------------------------------------------------------------------
  // Trends — render all
  // ------------------------------------------------------------------

  function renderTrends() {
    renderMapGrid();
    renderLegend();
    renderStats();
    renderRegions();
    renderAnomalyChart();
  }

  // ------------------------------------------------------------------
  // Hazard view
  // ------------------------------------------------------------------

  const EHS_META = [
    { k: 'climate',  label: 'Climate trend',         q: 'Have conditions been changing significantly?', cls: 'l1' },
    { k: 'anomaly',  label: 'Environmental anomaly', q: 'How unusual are recent conditions?',           cls: 'l2' },
    { k: 'hazard',   label: 'Hazard likelihood',     q: 'What does the model indicate for this window?',cls: 'l3' },
    { k: 'exposure', label: 'Exposure',              q: 'Who or what could be affected?',               cls: 'l4' },
  ];

  function renderEhsLayers() {
    const h = D.HAZARD[state.locationId];
    if (!h) return;
    $('#ehsLayers').innerHTML = EHS_META.map((m, i) => {
      const l = h.layers[m.k];
      return `
        <article class="ehs ${m.cls}">
          <div class="ehs-head"><span>${m.label}</span><span class="idx">0${i + 1}</span></div>
          <div class="ehs-val">${l.value}</div>
          <div class="ehs-sub">${l.note}</div>
          <div class="meter"><span style="width:${l.pct}%"></span></div>
        </article>
      `;
    }).join('');
  }

  function renderGauge() {
    const h = D.HAZARD[state.locationId];
    if (!h) return;
    const p = h.probability[`h${state.horizon}`] ?? 0;
    const total = Math.PI * 80; // ≈ 251.3
    const offset = total * (1 - p);
    const fill = $('#gaugeFill');
    // Color scales from blue → amber → red
    const color = p < 0.33 ? '#1f6feb' : (p < 0.66 ? '#c0652a' : '#a4292d');
    fill.setAttribute('stroke', color);
    fill.setAttribute('stroke-dashoffset', offset);
    $('#gaugeVal').textContent = p.toFixed(2);
    $('#probHorizon').textContent = `${state.horizon} hr`;
    $('.gauge-val .u').textContent = `event probability · ${state.horizon} hr`;
    const conf = p >= 0.7 ? 'moderate' : (p >= 0.4 ? 'low' : 'very low');
    $('#probConf').textContent = conf;
  }

  function renderShap() {
    const h = D.HAZARD[state.locationId];
    if (!h) return;
    const max = Math.max(...h.shap.map(s => Math.abs(s.v)));
    const html = h.shap.map(s => {
      const t = Math.abs(s.v) / max * 50; // half-width %
      const pos = s.v >= 0;
      return `
        <div class="shap-row">
          <span>${s.k}</span>
          <div class="shap-bar">
            ${pos
              ? `<span class="pos" style="width:${t}%; left:50%;"></span>`
              : `<span class="neg" style="width:${t}%; left:${50 - t}%; transform:none;"></span>`}
          </div>
          <span class="mono" style="text-align:right;">${s.label}</span>
        </div>
      `;
    }).join('');
    $('#shapList').innerHTML = html;
  }

  function renderExposure() {
    const h = D.HAZARD[state.locationId];
    if (!h) return;
    $('#exposureList').innerHTML = h.exposure.map(e => `
      <li><span>${e.k}</span><span class="mono">${e.v}</span></li>
    `).join('');
    $('#advisory').innerHTML = `<strong>Advisory ·</strong> ${h.advisory}`;
  }

  function renderHazard() {
    const loc = D.LOCATIONS.find(l => l.id === state.locationId);
    $('#hazardWhere').textContent = loc ? `${loc.name} · ${loc.lat.toFixed(2)}°N · ${loc.lon.toFixed(2)}°E` : '—';
    renderEhsLayers();
    renderGauge();
    renderShap();
    renderExposure();
  }

  // ------------------------------------------------------------------
  // Back-in-time view
  // ------------------------------------------------------------------

  function renderEventSwitch() {
    const row = $('#eventSwitch');
    row.innerHTML = Object.values(D.EVENTS).map(e => `
      <button data-e="${e.id}" class="${e.id === state.eventId ? 'active' : ''}">${e.label}</button>
    `).join('');
    row.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      state.eventId = b.dataset.e;
      $$('#eventSwitch button').forEach(x => x.classList.toggle('active', x.dataset.e === state.eventId));
      renderBack();
    });
  }

  function renderStepper() {
    const ev = D.EVENTS[state.eventId];
    $('#stepper').innerHTML = ev.timeline.map(s => `
      <div class="step ${s.phase}">
        <div class="pin"></div>
        <div class="label">${s.date}</div>
        <div class="tag">${s.tag}</div>
      </div>
    `).join('');
  }

  function renderKnown() {
    const ev = D.EVENTS[state.eventId];
    $('#timelineTitle').textContent = ev.label;
    $('#timelineIssued').textContent = `Frozen at ${ev.frozen.issued}`;
    $('#knownList').innerHTML = ev.frozen.known.map(k => `
      <li><span class="k">${k.k}</span><span class="v">${k.v}</span></li>
    `).join('');
    $('#eventSummary').textContent = ev.summary;
  }

  function renderPrediction() {
    const ev = D.EVENTS[state.eventId];
    const p = ev.frozen.prediction;
    $('#predN').textContent        = p.prob.toFixed(2);
    $('#predSub').textContent      = p.note;
    $('#predHorizon').textContent  = `${p.horizon} hr`;
    $('#predConfidence').textContent = p.confidence;
  }

  function renderOutcome() {
    const ev = D.EVENTS[state.eventId];
    const o = ev.outcome;
    $('#outcomeVerdict').textContent = o.verdict;
    $('#outcomeTitle').textContent   = o.title;
    $('#outcomeText').textContent    = o.text;
    $('#outcomeScores').innerHTML = o.scores.map(s => `
      <div><div class="k">${s.k}</div><div class="v">${s.v}</div></div>
    `).join('');
    // Reset reveal
    $('#revealWrap').classList.remove('revealed');
    $('#outcomePill').textContent = 'hidden';
    $('#outcomePill').className   = 'pill pill-muted';
  }

  function initReveal() {
    $('#revealBtn').addEventListener('click', () => {
      $('#revealWrap').classList.add('revealed');
      $('#outcomePill').textContent = 'revealed';
      $('#outcomePill').className   = 'pill pill-alert';
    });
  }

  function renderBack() {
    renderStepper();
    renderKnown();
    renderPrediction();
    renderOutcome();
  }

  // ------------------------------------------------------------------
  // Bootstrap
  // ------------------------------------------------------------------

  function boot() {
    initLocation();
    initVarTabs();
    initMap();
    renderTrends();

    renderHazard();

    renderEventSwitch();
    renderBack();
    initReveal();

    $('#btnReport').addEventListener('click', e => {
      e.preventDefault();
      window.print();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
