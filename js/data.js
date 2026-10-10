/* ===========================================================
   ECHO EARTH — mock datasets
   All numbers are illustrative; no model has been trained.
   =========================================================== */

(function (global) {
  'use strict';

  // Bangladesh focus bbox (slightly wider than country border)
  const BBOX = { s: 20.5, n: 26.75, w: 88.0, e: 92.75 };
  const GRID_STEP = 0.35; // degrees

  // Deterministic pseudo-random for repeatable visuals
  function hash(x, y, s) {
    let h = Math.sin(x * 374.84 + y * 921.17 + s * 51.17) * 43758.5453;
    return h - Math.floor(h);
  }

  // Smooth-ish spatial field (sum of sines + hash noise)
  function field(lat, lon, cfg) {
    const u = (lon - BBOX.w) / (BBOX.e - BBOX.w);
    const v = (lat - BBOX.s) / (BBOX.n - BBOX.s);
    let f = 0;
    f += Math.sin((u * cfg.ax + cfg.bx) * Math.PI) * cfg.wx;
    f += Math.cos((v * cfg.ay + cfg.by) * Math.PI) * cfg.wy;
    f += Math.sin((u + v) * cfg.axy * Math.PI) * cfg.wxy;
    f += (hash(u, v, cfg.seed) - 0.5) * cfg.noise;
    return cfg.base + f * cfg.scale;
  }

  // Build grid of cells
  function makeGrid(cfg) {
    const cells = [];
    for (let lat = BBOX.s; lat < BBOX.n; lat += GRID_STEP) {
      for (let lon = BBOX.w; lon < BBOX.e; lon += GRID_STEP) {
        const centerLat = lat + GRID_STEP / 2;
        const centerLon = lon + GRID_STEP / 2;
        const value = field(centerLat, centerLon, cfg);
        cells.push({
          bounds: [[lat, lon], [lat + GRID_STEP, lon + GRID_STEP]],
          center: [centerLat, centerLon],
          value: value,
        });
      }
    }
    return cells;
  }

  // Variable definitions ------------------------------------------------
  // Theil–Sen slopes per year, Mann–Kendall p-values are illustrative.
  const VARIABLES = {
    temperature: {
      id: 'temperature',
      label: 'Surface temperature',
      short: 'Temperature',
      source: 'NASA MERRA-2',
      unit: '°C / year',
      overall: { slope: 0.028, pValue: 0.001, significance: 'sig', years: '2001–2024' },
      summary: 'A consistent warming signal of about +0.03 °C per year across most of Bangladesh, strongest in the northeast and over urban Dhaka.',
      swatch: '#ff8a3d',
      ramp: ['#1e40af', '#38bdf8', '#64748b', '#f97316', '#fc3d21'],
      domain: [-0.02, 0.06],
      grid: makeGrid({
        base: 0.028, scale: 0.025,
        ax: 1.4, bx: 0.1, wx: 0.6,
        ay: 1.1, by: 0.2, wy: 0.5,
        axy: 0.9, wxy: 0.25,
        noise: 0.6, seed: 11,
      }),
      regions: [
        { name: 'Northeast · Sylhet', value: '+0.034 °C/yr', ctx: 'Strongest warming in the sample.', dir: 'up' },
        { name: 'Southwest · Khulna', value: '+0.019 °C/yr', ctx: 'Moderated by proximity to the Bay of Bengal.', dir: 'up' },
        { name: 'Central · Dhaka',    value: '+0.041 °C/yr', ctx: 'Urban heat signal above the regional trend.', dir: 'up' },
      ],
    },
    precipitation: {
      id: 'precipitation',
      label: 'Precipitation',
      short: 'Precipitation',
      source: 'GPM IMERG Final',
      unit: 'mm / year',
      overall: { slope: 3.4, pValue: 0.08, significance: 'mar', years: '2001–2024' },
      summary: 'Rainfall is increasing over the northeast and weakening in the southwest — a contrasting regional pattern rather than a national trend.',
      swatch: '#38bdf8',
      ramp: ['#78350f', '#d97706', '#64748b', '#38bdf8', '#1e40af'],
      domain: [-18, 18],
      grid: makeGrid({
        base: 2.0, scale: 14.0,
        ax: 1.6, bx: 0.25, wx: 0.8,
        ay: 1.3, by: 0.1, wy: -0.6,
        axy: 1.2, wxy: 0.5,
        noise: 2.0, seed: 29,
      }),
      regions: [
        { name: 'Northeast · Sylhet',  value: '+14.2 mm/yr', ctx: 'Pre-monsoon intensification; significant at p<0.05.', dir: 'up' },
        { name: 'Southwest · Khulna',  value: '−9.8 mm/yr', ctx: 'Weakening late-monsoon rainfall.', dir: 'down' },
        { name: 'Southeast · Chittagong', value: '+5.6 mm/yr', ctx: 'Mild upward trend; not significant.', dir: 'up' },
      ],
    },
    vegetation: {
      id: 'vegetation',
      label: 'Vegetation index (NDVI)',
      short: 'Vegetation',
      source: 'MODIS NDVI',
      unit: 'NDVI / decade',
      overall: { slope: -0.014, pValue: 0.03, significance: 'sig', years: '2001–2024' },
      summary: 'Vegetation is declining in rapidly urbanising areas, with modest increases in forested uplands — a mixed picture that averages to a slight decline.',
      swatch: '#4ade80',
      ramp: ['#991b1b', '#f87171', '#64748b', '#4ade80', '#15803d'],
      domain: [-0.05, 0.05],
      grid: makeGrid({
        base: -0.01, scale: 0.04,
        ax: 1.1, bx: 0.3, wx: -0.6,
        ay: 1.4, by: 0.4, wy: 0.5,
        axy: 1.0, wxy: 0.3,
        noise: 1.0, seed: 43,
      }),
      regions: [
        { name: 'Dhaka metropolitan',  value: '−0.052 / dec', ctx: 'Vegetation loss driven by built-up expansion.', dir: 'down' },
        { name: 'Chittagong Hill Tracts', value: '+0.018 / dec', ctx: 'Modest greening in forested uplands.', dir: 'up' },
        { name: 'Barind tract · NW',   value: '−0.021 / dec', ctx: 'Groundwater stress and cropping shift.', dir: 'down' },
      ],
    },
    wind: {
      id: 'wind',
      label: 'Surface wind speed',
      short: 'Wind speed',
      source: 'NASA MERRA-2 (components → speed)',
      unit: 'm·s⁻¹ / decade',
      overall: { slope: -0.08, pValue: 0.21, significance: 'ns', years: '2001–2024' },
      summary: 'A slight overall decline in surface wind speed, consistent with regional stilling, but not statistically significant across the study area.',
      swatch: '#a78bfa',
      ramp: ['#1e40af', '#60a5fa', '#64748b', '#fbbf24', '#78350f'],
      domain: [-0.3, 0.3],
      grid: makeGrid({
        base: -0.08, scale: 0.22,
        ax: 0.9, bx: 0.4, wx: 0.4,
        ay: 1.2, by: 0.5, wy: -0.5,
        axy: 0.7, wxy: 0.4,
        noise: 1.4, seed: 67,
      }),
      regions: [
        { name: 'Coastal belt',         value: '−0.11 m/s/dec', ctx: 'Coastal stilling signal; p=0.09.', dir: 'down' },
        { name: 'Northern plains',      value: '−0.04 m/s/dec', ctx: 'Weak, not significant.', dir: 'down' },
        { name: 'Hill tracts · SE',     value: '+0.06 m/s/dec', ctx: 'Terrain-channelled flow; isolated grid cells.', dir: 'up' },
      ],
    },
  };

  // Monthly anomaly time series (288 months, 2001-01 → 2024-12) --------
  function makeAnomalySeries(cfg) {
    const months = [];
    const values = [];
    for (let y = 2001; y <= 2024; y++) {
      for (let m = 0; m < 12; m++) {
        const t = (y - 2001) + m / 12;
        const trend = cfg.trend * (t - 12); // centred mid-period
        const season = Math.sin((m / 12) * Math.PI * 2 + cfg.phase) * cfg.seasonAmp;
        const noise = (hash(t, m, cfg.seed) - 0.5) * cfg.noise;
        const spike = (hash(y, m, cfg.seed + 1) > 0.985) ? (hash(y, m, cfg.seed + 2) - 0.5) * cfg.spike : 0;
        months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
        values.push(+(trend + season + noise + spike).toFixed(3));
      }
    }
    return { months, values };
  }

  VARIABLES.temperature.anomaly  = makeAnomalySeries({ trend: 0.028, seasonAmp: 0.15, phase: 0.4, noise: 0.6, spike: 1.2, seed: 11 });
  VARIABLES.precipitation.anomaly = makeAnomalySeries({ trend: 0.6,  seasonAmp: 2.4,  phase: 1.2, noise: 6.0, spike: 18,  seed: 29 });
  VARIABLES.vegetation.anomaly   = makeAnomalySeries({ trend: -0.0012, seasonAmp: 0.03, phase: 2.1, noise: 0.04, spike: 0.08, seed: 43 });
  VARIABLES.wind.anomaly         = makeAnomalySeries({ trend: -0.004, seasonAmp: 0.25, phase: 0.9, noise: 0.6, spike: 1.0, seed: 67 });

  // Locations (sidebar picker) -----------------------------------------
  const LOCATIONS = [
    { id: 'sylhet',    name: 'Sylhet basin · Bangladesh',   lat: 24.89, lon: 91.87, country: 'Bangladesh' },
    { id: 'dhaka',     name: 'Dhaka metropolitan',           lat: 23.81, lon: 90.41, country: 'Bangladesh' },
    { id: 'khulna',    name: 'Khulna delta · Bangladesh',    lat: 22.84, lon: 89.56, country: 'Bangladesh' },
    { id: 'chittagong',name: 'Chittagong coast',             lat: 22.36, lon: 91.78, country: 'Bangladesh' },
    { id: 'rangpur',   name: 'Rangpur · Teesta basin',       lat: 25.74, lon: 89.25, country: 'Bangladesh' },
    { id: 'nepal_mustang', name: 'Mustang · Nepal (border)', lat: 28.78, lon: 83.67, country: 'Nepal' },
  ];

  // Hazard signature (per location, 48h baseline) ----------------------
  const HAZARD = {
    sylhet: {
      layers: {
        climate: { value: '+0.028 °C/yr', pct: 72, note: 'Significant long-term warming over the basin.' },
        anomaly: { value: '+3.1 σ',        pct: 88, note: '7-day rainfall far above seasonal norm.' },
        hazard:  { value: '0.72',          pct: 72, note: 'Probability of threshold-flood event in 48 hr.' },
        exposure:{ value: '7.2M people',   pct: 64, note: 'Settlements and road network within flood plain.' },
      },
      probability: { h24: 0.58, h48: 0.72, h72: 0.81 },
      shap: [
        { k: '7-day rainfall',         v:  0.28, label: '352 mm' },
        { k: 'Upstream rainfall (IN)', v:  0.19, label: '+2.4 σ' },
        { k: 'Soil moisture (SMAP)',   v:  0.14, label: '0.46' },
        { k: 'River stage forecast',   v:  0.11, label: '+1.8 m' },
        { k: 'Terrain slope',          v: -0.08, label: '0.4°' },
        { k: 'Antecedent dry days',    v: -0.05, label: '1' },
        { k: 'Climate trend (temp)',   v:  0.03, label: '+0.028' },
      ],
      exposure: [
        { k: 'Population at risk',  v: '7.2M' },
        { k: 'Settlements',         v: '2,840 villages' },
        { k: 'Primary roads',       v: '418 km' },
        { k: 'Rice cropland',       v: '12,400 ha' },
        { k: 'Health facilities',   v: '94' },
      ],
      advisory: 'Experimental hazard estimate. Verify against Bangladesh FFWC and GloFAS before any operational use.',
    },
    dhaka: {
      layers: {
        climate: { value: '+0.041 °C/yr', pct: 86, note: 'Urban heat signal above the regional trend.' },
        anomaly: { value: '+1.4 σ',        pct: 48, note: 'Rainfall slightly above seasonal norm.' },
        hazard:  { value: '0.41',          pct: 41, note: 'Localised urban flooding probability (48 hr).' },
        exposure:{ value: '21.5M people',  pct: 94, note: 'Dense exposure in low-lying wards.' },
      },
      probability: { h24: 0.34, h48: 0.41, h72: 0.52 },
      shap: [
        { k: '3-day rainfall',         v:  0.18, label: '92 mm' },
        { k: 'Impervious surface',     v:  0.14, label: '68%' },
        { k: 'Drainage capacity',      v: -0.11, label: 'low' },
        { k: 'Soil moisture',          v:  0.08, label: '0.38' },
        { k: 'River stage (Buriganga)',v:  0.07, label: '+0.9 m' },
        { k: 'Vegetation (NDVI)',      v: -0.04, label: 'declining' },
      ],
      exposure: [
        { k: 'Population at risk',  v: '21.5M' },
        { k: 'Low-lying wards',     v: '38' },
        { k: 'Primary roads',       v: '112 km' },
        { k: 'Hospitals',           v: '27' },
      ],
      advisory: 'Urban flood module is a research prototype. Not a substitute for Dhaka WASA guidance.',
    },
    khulna: {
      layers: {
        climate: { value: '+0.019 °C/yr', pct: 48, note: 'Moderate warming, buffered by proximity to the bay.' },
        anomaly: { value: '+0.6 σ',        pct: 32, note: 'Current rainfall near seasonal norm.' },
        hazard:  { value: '0.22',          pct: 22, note: 'Low flood probability in the current window.' },
        exposure:{ value: '4.1M people',   pct: 58, note: 'Delta embankments and shrimp farms exposed.' },
      },
      probability: { h24: 0.17, h48: 0.22, h72: 0.28 },
      shap: [
        { k: '7-day rainfall',         v:  0.08, label: '48 mm' },
        { k: 'Storm surge forecast',   v:  0.11, label: '+0.4 m' },
        { k: 'Tide window',            v:  0.06, label: 'spring' },
        { k: 'Antecedent dry days',    v: -0.09, label: '4' },
        { k: 'Terrain slope',          v: -0.07, label: '0.1°' },
      ],
      exposure: [
        { k: 'Population at risk',  v: '4.1M' },
        { k: 'Embankments',         v: '640 km' },
        { k: 'Aquaculture',         v: '8,900 ha' },
      ],
      advisory: 'Cyclone/surge coupling is a future extension; current module is rainfall-driven.',
    },
    chittagong: {
      layers: {
        climate: { value: '+0.025 °C/yr', pct: 60, note: 'Warming on the coastal strip.' },
        anomaly: { value: '+2.2 σ',        pct: 72, note: 'Pre-monsoon rainfall above norm.' },
        hazard:  { value: '0.54',          pct: 54, note: 'Rainfall-triggered landslide and flood risk.' },
        exposure:{ value: '8.6M people',   pct: 70, note: 'Hillside slums and port infrastructure.' },
      },
      probability: { h24: 0.44, h48: 0.54, h72: 0.63 },
      shap: [
        { k: '3-day rainfall',         v:  0.21, label: '184 mm' },
        { k: 'Slope angle',            v:  0.14, label: '18°' },
        { k: 'Soil moisture',          v:  0.09, label: '0.52' },
        { k: 'Deforestation (NDVI)',   v:  0.06, label: '−0.03' },
        { k: 'Drainage',               v: -0.05, label: 'medium' },
      ],
      exposure: [
        { k: 'Population at risk',  v: '8.6M' },
        { k: 'Hillside settlements',v: '340' },
        { k: 'Port infrastructure', v: 'Chittagong Port' },
      ],
      advisory: 'LHASA landslide guidance should be consulted alongside this estimate.',
    },
    rangpur: {
      layers: {
        climate: { value: '+0.031 °C/yr', pct: 74, note: 'Significant warming on the Teesta plain.' },
        anomaly: { value: '+1.9 σ',        pct: 62, note: 'Teesta discharge above norm after upstream rainfall.' },
        hazard:  { value: '0.49',          pct: 49, note: 'River-flood probability over 48 hr.' },
        exposure:{ value: '3.4M people',   pct: 52, note: 'Char communities and chars in the river bed.' },
      },
      probability: { h24: 0.38, h48: 0.49, h72: 0.58 },
      shap: [
        { k: 'Upstream rainfall (IN)', v:  0.24, label: '+2.1 σ' },
        { k: 'River stage forecast',   v:  0.17, label: '+1.3 m' },
        { k: '7-day rainfall',         v:  0.09, label: '96 mm' },
        { k: 'Barrage release',        v:  0.07, label: 'unknown' },
        { k: 'Terrain slope',          v: -0.06, label: '0.3°' },
      ],
      exposure: [
        { k: 'Population at risk',  v: '3.4M' },
        { k: 'Char settlements',    v: '210' },
        { k: 'Cropland',            v: '18,600 ha' },
      ],
      advisory: 'Transboundary rainfall is critical; forecast lead time depends on upstream data.',
    },
    nepal_mustang: {
      layers: {
        climate: { value: '+0.046 °C/yr', pct: 92, note: 'Rapid high-elevation warming over 2001–2024.' },
        anomaly: { value: 'N/A',           pct: 14, note: 'No unusual rainfall in the pre-event window.' },
        hazard:  { value: '— ',            pct: 20, note: 'Rainfall-based model has low confidence for this event type.' },
        exposure:{ value: '18k people',    pct: 36, note: 'Villages along the Kali Gandaki corridor.' },
      },
      probability: { h24: 0.11, h48: 0.20, h72: 0.26 },
      shap: [
        { k: 'Glacier retreat trend',  v:  0.22, label: '+' },
        { k: 'High-altitude warming',  v:  0.19, label: '+0.046' },
        { k: '7-day rainfall',         v: -0.14, label: '12 mm' },
        { k: 'Terrain slope',          v:  0.10, label: '32°' },
        { k: 'Snow-line change',       v:  0.08, label: 'rising' },
      ],
      exposure: [
        { k: 'Villages at risk',    v: '14' },
        { k: 'Trekking routes',     v: 'Kali Gandaki' },
      ],
      advisory: 'Rainfall-based flood models cannot anticipate glacier-collapse triggers. Treat this as a susceptibility case.',
    },
  };

  // Historical events (Back in time) -----------------------------------
  const EVENTS = {
    sylhet_2022: {
      id: 'sylhet_2022',
      label: 'Sylhet flood · June 2022',
      locationId: 'sylhet',
      summary: 'Pre-monsoon rainfall in NE Bangladesh and the Indian state of Meghalaya produced one of the worst floods on record. Over 7 million people affected.',
      timeline: [
        { date: '2022-06-01', tag: 'Baseline',       phase: 'past' },
        { date: '2022-06-10', tag: 'Rising rainfall',phase: 'past' },
        { date: '2022-06-14', tag: 'Frozen',         phase: 'now' },
        { date: '2022-06-17', tag: 'Peak',           phase: 'future' },
        { date: '2022-06-22', tag: 'Receding',       phase: 'future' },
      ],
      frozen: {
        issued: '2022-06-14 00:00 UTC',
        known: [
          { k: '7-day rainfall (basin mean)',  v: '352 mm' },
          { k: '7-day anomaly',                v: '+3.1 σ' },
          { k: 'Upstream rainfall (Cherrapunji)', v: '812 mm · 3 d' },
          { k: 'Soil moisture (SMAP, 0-5 cm)', v: '0.46 m³/m³' },
          { k: 'Surma river stage',            v: '+1.8 m above warning' },
          { k: 'Forecast rain (48 hr, GEOS)',  v: '180 mm' },
          { k: 'Climate trend (temp)',         v: '+0.028 °C/yr' },
          { k: 'Climate trend (precip)',       v: '+14.2 mm/yr · NE' },
        ],
        prediction: { horizon: 48, prob: 0.72, confidence: 'moderate', note: 'EHS-Flood v1 · experimental output' },
      },
      outcome: {
        verdict: 'Hit',
        title: 'Historic flood confirmed · 17 June 2022',
        text: 'Flooding peaked three days after the frozen issue time. 7.2M people affected, 94 fatalities, 4 districts under water. Satellite imagery showed Surma and Kushiyara basins fully inundated.',
        scores: [
          { k: 'Lead time',   v: '72 hr' },
          { k: 'Model prob',  v: '0.72' },
          { k: 'Threshold',   v: '0.50' },
        ],
      },
    },
    nepal_2026: {
      id: 'nepal_2026',
      label: 'Nepal flash flood · August 2026',
      locationId: 'nepal_mustang',
      summary: 'A devastating flash flood near the Tibetan border, which experts have examined as a possible glacier-collapse event. The precise trigger is not confirmed.',
      timeline: [
        { date: '2026-08-20', tag: 'Baseline',    phase: 'past' },
        { date: '2026-08-23', tag: 'Warm spell',  phase: 'past' },
        { date: '2026-08-25', tag: 'Frozen',      phase: 'now' },
        { date: '2026-08-26', tag: 'Event',       phase: 'future' },
        { date: '2026-08-28', tag: 'Assessment',  phase: 'future' },
      ],
      frozen: {
        issued: '2026-08-25 06:00 UTC',
        known: [
          { k: '7-day rainfall',               v: '12 mm' },
          { k: '7-day anomaly',                v: '−0.6 σ' },
          { k: 'Air temp anomaly (5 d)',       v: '+4.2 °C' },
          { k: 'Freezing level',               v: '5,650 m (↑)' },
          { k: 'Soil moisture',                v: '0.21 m³/m³' },
          { k: 'River stage (Kali Gandaki)',   v: 'normal' },
          { k: 'Climate trend (temp)',         v: '+0.046 °C/yr' },
          { k: 'Glacier susceptibility',       v: 'elevated' },
        ],
        prediction: { horizon: 24, prob: 0.11, confidence: 'low', note: 'Rainfall-driven model; glacier-collapse triggers out of scope.' },
      },
      outcome: {
        verdict: 'Miss (out of scope)',
        title: 'Flash flood on 26 August 2026',
        text: 'A sudden flood swept the Kali Gandaki corridor on 26 August. Investigators have examined a possible glacier-collapse mechanism. The rainfall-based model did not flag the event, which is consistent with its stated scope — a limitation we report rather than hide.',
        scores: [
          { k: 'Lead time',   v: '— ' },
          { k: 'Model prob',  v: '0.11' },
          { k: 'Threshold',   v: '0.50' },
        ],
      },
    },
  };

  global.ECHO = {
    BBOX,
    VARIABLES,
    LOCATIONS,
    HAZARD,
    EVENTS,
    hash,
  };

})(window);
