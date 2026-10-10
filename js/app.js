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
    // Leaflet needs a size invalidation when its container becomes visible
    if (name === 'trends' && trendMap) {
      setTimeout(() => trendMap.invalidateSize(), 60);
    }
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
      // Centre the map on the new location
      const loc = D.LOCATIONS.find(l => l.id === state.locationId);
      if (loc && trendMap) {
        trendMap.setView([loc.lat, loc.lon], 7, { animate: true });
        placeMarker(loc);
      }
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
  // Trends — map
  // ------------------------------------------------------------------

  let trendMap, gridLayer, markerLayer;

  function initMap() {
    trendMap = L.map('trendMap', {
      center: [23.6, 90.4],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    // Soft, scientific base map — CARTO Positron is clean and labels well.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 10,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(trendMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 10, subdomains: 'abcd', attribution: '', pane: 'overlayPane',
    }).addTo(trendMap);

    gridLayer   = L.layerGroup().addTo(trendMap);
    markerLayer = L.layerGroup().addTo(trendMap);

    const loc = D.LOCATIONS.find(l => l.id === state.locationId);
    if (loc) placeMarker(loc);
  }

  function placeMarker(loc) {
    markerLayer.clearLayers();
    const html = `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#a4292d;border:2px solid #fff;
      box-shadow:0 0 0 3px rgba(164,41,45,0.25), 0 2px 6px rgba(0,0,0,.25);">
    </div>`;
    L.marker([loc.lat, loc.lon], {
      icon: L.divIcon({ html, className: '', iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).bindTooltip(loc.name, { direction: 'top', offset: [0, -10] }).addTo(markerLayer);
  }

  function renderMapGrid() {
    gridLayer.clearLayers();
    const v = D.VARIABLES[state.variable];
    const [dmin, dmax] = v.domain;
    v.grid.forEach(cell => {
      const t = (cell.value - dmin) / (dmax - dmin);
      const color = colorAt(v.ramp, t);
      L.rectangle(cell.bounds, {
        color: color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.68,
        interactive: true,
      }).bindTooltip(
        `<div style="font-family:'JetBrains Mono', monospace; font-size: 11px;">
          <strong>${v.short}</strong><br/>
          ${cell.center[0].toFixed(2)}°N · ${cell.center[1].toFixed(2)}°E<br/>
          ${cell.value.toFixed(3)} ${v.unit}
         </div>`,
        { sticky: true }
      ).addTo(gridLayer);
    });
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

    const colors = values.map(x => (x >= 0 ? v.ramp[v.ramp.length - 1] : v.ramp[0]));

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
            backgroundColor: '#141513',
            titleFont: { family: 'JetBrains Mono' },
            bodyFont:  { family: 'JetBrains Mono' },
          },
        },
        scales: {
          x: {
            ticks: {
              font: { family: 'JetBrains Mono', size: 10 },
              color: '#8c8b84',
              maxRotation: 0,
              autoSkip: true,
              autoSkipPadding: 24,
              callback(_, i) {
                const lbl = this.getLabelForValue(i);
                return lbl && lbl.endsWith('-01') ? lbl.slice(0, 4) : '';
              },
            },
            grid: { display: false },
            border: { color: '#d9d7cc' },
          },
          y: {
            ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#8c8b84' },
            grid: { color: '#ecebe4' },
            border: { display: false },
            title: { display: true, text: 'Anomaly', color: '#8c8b84', font: { family: 'Inter', size: 11 } },
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
