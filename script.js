// Flip this to false once the backend is running.
const USE_SAMPLE_DATA = true;
const API_URL = "http://localhost:8000/dashboard";

const locationInput = document.getElementById("location-input");
const startInput = document.getElementById("start-date");
const endInput = document.getElementById("end-date");
const analyzeBtn = document.getElementById("analyze-btn");
const formMessage = document.getElementById("form-message");
const pollutantSelect = document.getElementById("pollutant-select");
const simulateSelect = document.getElementById("simulate-select");

let currentData = null;
const chartConfigs = {};

const pollutantInfo = {
  "OZONE": { label: "Ozone", note: "O₃" },
  "PM2.5": { label: "PM2.5", note: "fine particles" },
  "PM10": { label: "PM10", note: "coarse particles" }
};

const aqiCategories = [
  { name: "Good", max: 50, range: "0–50", className: "aqi-good",
    text: "The air is fine and there's little or no risk." },
  { name: "Moderate", max: 100, range: "51–100", className: "aqi-moderate",
    text: "The air is acceptable, but a few unusually sensitive people might notice it." },
  { name: "Unhealthy for Sensitive Groups", max: 150, range: "101–150", className: "aqi-usg",
    text: "Kids, older adults, and people with heart or lung problems may feel it." },
  { name: "Unhealthy", max: 200, range: "151–200", className: "aqi-unhealthy",
    text: "Everyone may start to feel some effects." },
  { name: "Very Unhealthy", max: 300, range: "201–300", className: "aqi-very",
    text: "This is a health warning. Everyone is more likely to be affected." },
  { name: "Hazardous", max: 500, range: "301+", className: "aqi-hazardous",
    text: "Emergency conditions. Everyone is likely to be affected." }
];

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];


/* helpers */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  return node;
}

function getCategory(aqi) {
  return aqiCategories.find(c => aqi <= c.max) || aqiCategories[aqiCategories.length - 1];
}

function pollutantLabel(key) {
  return pollutantInfo[key] ? pollutantInfo[key].label : key;
}

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

function addDays(iso, n) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

function listDates(start, end) {
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function shortDate(iso) {
  const date = parseDate(iso);
  return shortMonths[date.getMonth()] + " " + date.getDate();
}

function fullDate(iso) {
  return shortDate(iso) + ", " + parseDate(iso).getFullYear();
}

function formatHour(hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return h + ":00 " + (hour < 12 ? "AM" : "PM");
}

function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function countUp(node, target) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = target;
    return;
  }
  const start = performance.now();
  const length = 700;
  function tick(now) {
    const t = Math.min((now - start) / length, 1);
    node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


/* sample data (only used while USE_SAMPLE_DATA is true) */

function isSupportedLocation(text) {
  const t = text.toLowerCase();
  const names = ["dallas", "fort worth", "dfw", "arlington", "plano", "irving", "frisco", "garland"];
  return names.some(n => t.includes(n)) || /^7[56]\d{3}$/.test(t.trim());
}

function makeSampleSeries(dates, base, swing, seed) {
  return dates.map((date, i) => {
    const wave = Math.sin(i / 3 + seed) * swing * 0.6;
    const noise = (pseudoRandom(i + seed) - 0.5) * swing;
    return { date: date, value: Math.max(5, Math.round(base + wave + noise)) };
  });
}

function makeEmptyData(locationName) {
  return {
    location: { name: locationName },
    airQuality: { status: "no_data" },
    weather: { status: "unavailable" },
    historical: { status: "no_data" },
    prediction: { status: "no_data" },
    validation: { status: "no_data" }
  };
}

function getSampleData(location, startDate, endDate) {
  const simulate = simulateSelect.value;
  if (simulate === "no-data" || !isSupportedLocation(location)) return makeEmptyData(location);

  const dates = listDates(startDate, endDate);
  const pm25 = makeSampleSeries(dates, 38, 14, 1);
  const lastValue = pm25[pm25.length - 1].value;

  const futureDates = listDates(addDays(endDate, 1), addDays(endDate, 7));
  const predictionPoints = futureDates.map((date, i) => {
    const value = Math.round(lastValue * 0.6 + 38 * 0.4 + Math.sin(i / 2) * 6 + (pseudoRandom(i + 200) - 0.5) * 6);
    return { date: date, value: value, low: Math.max(0, value - 8 - i), high: value + 8 + i };
  });

  const validationPoints = pm25.slice(-14).map((p, i) => ({
    date: p.date,
    actual: p.value,
    predicted: Math.max(0, p.value + Math.round((pseudoRandom(i + 300) - 0.5) * 14))
  }));

  const now = new Date();
  const reading = (parameter, aqi) => ({
    parameter: parameter, aqi: aqi, category: getCategory(aqi).name,
    dateObserved: toISO(now), hourObserved: now.getHours(), timeZone: "CDT",
    reportingArea: "Dallas-Fort Worth", agency: "TCEQ"
  });

  const data = {
    location: { name: "Dallas-Fort Worth, TX" },
    airQuality: {
      status: "ok",
      source: "EPA AirNow / Texas Commission on Environmental Quality",
      pollutants: [reading("OZONE", 44), reading("PM2.5", 44), reading("PM10", 22)]
    },
    weather: {
      status: "ok",
      source: "NOAA / National Weather Service",
      station: "KDFW",
      observedAt: formatHour(now.getHours()) + " CDT",
      values: [
        { label: "Temperature", value: 90, unit: "°F" },
        { label: "Humidity", value: 46, unit: "%" },
        { label: "Pressure", value: 29.94, unit: "inHg" },
        { label: "Visibility", value: 10, unit: "mi" },
        { label: "Wind speed", value: 13, unit: "mph" },
        { label: "Wind direction", value: "E (100°)", unit: "" }
      ]
    },
    historical: {
      status: "ok",
      series: {
        "PM2.5": pm25,
        "OZONE": makeSampleSeries(dates, 42, 18, 50),
        "PM10": makeSampleSeries(dates, 30, 10, 100)
      }
    },
    prediction: { status: "ok", isPlaceholder: true, points: predictionPoints },
    validation: { status: "ok", metrics: null, points: validationPoints }
  };

  if (simulate === "no-weather") data.weather = { status: "unavailable" };
  if (simulate === "no-model") {
    data.prediction = { status: "not_connected" };
    data.validation = { status: "not_connected" };
  }
  return data;
}


/* talking to the backend */

// The backend's /dashboard response uses snake_case and metric units.
// This turns it into the shape the rest of this file draws from.
// Anything the backend doesn't send yet just shows a "not connected" message.
function fromBackend(raw, locationName) {
  const aq = raw.air_quality || {};
  const wx = raw.weather || {};
  const stamp = raw.timestamp || "";

  const pollutants = [["OZONE", "ozone_aqi"], ["PM2.5", "pm25_aqi"], ["PM10", "pm10_aqi"]]
    .filter(pair => aq[pair[1]] !== null && aq[pair[1]] !== undefined)
    .map(pair => ({
      parameter: pair[0],
      aqi: aq[pair[1]],
      category: getCategory(aq[pair[1]]).name,
      dateObserved: stamp.slice(0, 10),
      hourObserved: parseInt(stamp.slice(11, 13), 10),
      timeZone: "CT",
      agency: "TCEQ"
    }));

  const has = v => v !== null && v !== undefined;
  const weatherValues = [];
  if (has(wx.temperature_c))  weatherValues.push({ label: "Temperature", value: Math.round(wx.temperature_c * 9 / 5 + 32), unit: "°F" });
  if (has(wx.humidity_pct))   weatherValues.push({ label: "Humidity", value: Math.round(wx.humidity_pct), unit: "%" });
  if (has(wx.pressure_pa))    weatherValues.push({ label: "Pressure", value: +(wx.pressure_pa * 0.0002953).toFixed(2), unit: "inHg" });
  if (has(wx.visibility_m))   weatherValues.push({ label: "Visibility", value: Math.round(wx.visibility_m / 1609.34), unit: "mi" });
  if (has(wx.wind_speed_kmh)) weatherValues.push({ label: "Wind speed", value: Math.round(wx.wind_speed_kmh * 0.6214), unit: "mph" });
  if (has(wx.wind_direction_deg)) {
    const dir = compass[Math.round(wx.wind_direction_deg / 22.5) % 16];
    weatherValues.push({ label: "Wind direction", value: dir + " (" + Math.round(wx.wind_direction_deg) + "°)", unit: "" });
  }

  const pred = raw.prediction;
  const predPoints = pred ? (Array.isArray(pred) ? pred : pred.points) : null;

  return {
    location: { name: raw.location || locationName },
    airQuality: pollutants.length
      ? { status: "ok", source: "EPA AirNow / TCEQ", pollutants: pollutants }
      : { status: "no_data" },
    weather: weatherValues.length
      ? { status: "ok", source: "NOAA / National Weather Service", station: wx.station_id || "KDFW",
          observedAt: stamp.slice(11, 16), values: weatherValues }
      : { status: "unavailable" },
    historical: raw.historical ? { status: "ok", series: raw.historical } : { status: "not_connected" },
    prediction: predPoints && predPoints.length
      ? { status: "ok", isPlaceholder: false, points: predPoints }
      : { status: "not_connected" },
    validation: raw.validation
      ? { status: "ok", metrics: raw.validation.metrics || null, points: raw.validation.points || [] }
      : { status: "not_connected" }
  };
}

async function getDashboardData(location, startDate, endDate) {
  if (USE_SAMPLE_DATA) {
    await new Promise(resolve => setTimeout(resolve, 400));
    return getSampleData(location, startDate, endDate);
  }

  const url = API_URL + "?location=" + encodeURIComponent(location) + "&start=" + startDate + "&end=" + endDate;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Backend returned " + response.status);
  const raw = await response.json();
  return raw.air_quality || raw.weather ? fromBackend(raw, location) : raw;
}


/* panel states */

function setPanelState(panelId, title, detail) {
  const panel = document.getElementById(panelId);
  const stateBox = panel.querySelector(".state-message");
  const body = panel.querySelector(".panel-body");

  if (!title) {
    stateBox.hidden = true;
    body.hidden = false;
    return;
  }

  stateBox.innerHTML = "";
  stateBox.appendChild(el("strong", "", title));
  if (detail) stateBox.appendChild(el("span", "", detail));
  stateBox.hidden = false;
  body.hidden = true;
}

const noDataTitle = "Not enough data for this location or date range";
const noDataDetail = "Try a different location or dates and run it again.";


/* updating the page */

function updateAirQuality(data) {
  const aq = data.airQuality;
  document.getElementById("aq-location").textContent = data.location ? "Reporting area: " + data.location.name : "";

  if (!aq || aq.status !== "ok" || !aq.pollutants || aq.pollutants.length === 0) {
    setPanelState("air-quality-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("air-quality-panel", null);

  const grid = document.getElementById("pollutant-grid");
  grid.innerHTML = "";

  aq.pollutants.forEach((p, i) => {
    const info = pollutantInfo[p.parameter] || { label: p.parameter, note: "" };
    const card = el("div", "pollutant-card " + getCategory(p.aqi).className);
    card.style.animationDelay = i * 90 + "ms";

    const title = el("h3", "", info.label);
    if (info.note) title.appendChild(el("span", "pollutant-note", info.note));
    card.appendChild(title);

    const value = el("p", "aqi-value");
    const number = el("strong", "", "0");
    value.appendChild(number);
    value.appendChild(el("span", "", "AQI"));
    card.appendChild(value);
    countUp(number, p.aqi);

    card.appendChild(el("p", "aqi-category", p.category));
    card.appendChild(el("p", "card-meta", "Observed " + formatHour(p.hourObserved) + " " + p.timeZone));
    grid.appendChild(card);
  });

  const latest = aq.pollutants[0];
  document.getElementById("aq-source").textContent =
    "Last updated " + fullDate(latest.dateObserved) + " at " + formatHour(latest.hourObserved) + " " + latest.timeZone +
    ". Source: " + aq.source + ".";
}

function updateWeather(data) {
  const w = data.weather;

  if (!w || w.status !== "ok" || !w.values) {
    setPanelState("weather-panel", "Weather isn't available right now",
      "We couldn't reach the National Weather Service. The rest of the dashboard still works.");
    return;
  }
  setPanelState("weather-panel", null);

  const list = document.getElementById("weather-list");
  list.innerHTML = "";

  w.values.forEach(item => {
    const row = el("div", "weather-item");
    row.appendChild(el("dt", "", item.label));

    const dd = el("dd");
    if (item.value === null || item.value === undefined) {
      dd.appendChild(el("span", "not-reported", "Not reported"));
    } else {
      const shown = typeof item.value === "number" ? item.value.toLocaleString("en-US") : item.value;
      dd.appendChild(document.createTextNode(shown));
      if (item.unit) dd.appendChild(el("span", "unit", item.unit));
    }
    row.appendChild(dd);
    list.appendChild(row);
  });

  document.getElementById("weather-source").textContent =
    "Source: " + w.source + ". Station " + w.station + ", observed " + w.observedAt + ".";
}

function updateHistorical() {
  const h = currentData && currentData.historical;
  const pollutant = pollutantSelect.value;
  const subtitle = document.getElementById("historical-subtitle");

  if (h && h.status === "not_connected") {
    subtitle.textContent = "";
    setPanelState("historical-panel", "Historical data isn't connected yet",
      "Past readings will show up here once the backend sends them.");
    return;
  }

  const points = h && h.status === "ok" && h.series ? h.series[pollutant] : null;
  if (!points || points.length < 2) {
    subtitle.textContent = "";
    setPanelState("historical-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("historical-panel", null);

  const label = pollutantLabel(pollutant);
  subtitle.textContent = "Daily " + label + " AQI, " + shortDate(points[0].date) + " to " + fullDate(points[points.length - 1].date);

  drawChart("historical-chart", {
    labels: points.map(p => p.date),
    ariaLabel: "Line chart of daily " + label + " AQI over the selected dates",
    series: [{ name: label + " AQI", className: "series-actual", area: true, values: points.map(p => p.value) }]
  });
  drawLegend("historical-legend", [{ name: label + " AQI (daily)", className: "series-actual" }]);
}

function updatePrediction(data) {
  const p = data.prediction;
  const subtitle = document.getElementById("prediction-subtitle");

  if (!p || p.status === "not_connected") {
    subtitle.textContent = "";
    setPanelState("prediction-panel", "The prediction model isn't connected yet",
      "Forecasts will show up here once the ML model is hooked up to the backend.");
    return;
  }
  if (p.status !== "ok" || !p.points || p.points.length === 0) {
    subtitle.textContent = "";
    setPanelState("prediction-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("prediction-panel", null);
  document.getElementById("prediction-notice").hidden = !p.isPlaceholder;
  subtitle.textContent = "PM2.5 AQI, next " + p.points.length + " days";

  const history = data.historical && data.historical.status === "ok" ? (data.historical.series["PM2.5"] || []) : [];
  const recent = history.slice(-5);
  const blanks = recent.map(() => null);

  drawChart("prediction-chart", {
    labels: recent.map(r => r.date).concat(p.points.map(x => x.date)),
    ariaLabel: "Line chart of predicted PM2.5 AQI for the next few days",
    series: [
      { name: "Recent actual", className: "series-context",
        values: recent.map(r => r.value).concat(p.points.map(() => null)) },
      { name: "Prediction", className: "series-predicted",
        values: blanks.concat(p.points.map(x => x.value)),
        low: blanks.concat(p.points.map(x => x.low)),
        high: blanks.concat(p.points.map(x => x.high)) }
    ]
  });
  drawLegend("prediction-legend", [
    { name: "Recent actual", className: "series-context" },
    { name: "Prediction", className: "series-predicted" },
    { name: "Likely range", className: "series-predicted swatch-band" }
  ]);
}

function updateValidation(data) {
  const v = data.validation;
  const note = document.getElementById("validation-note");

  if (!v || v.status === "not_connected") {
    setPanelState("validation-panel", "The prediction model isn't connected yet",
      "Once the model is trained and tested, you'll see how its guesses stack up against real readings.");
    return;
  }
  if (v.status !== "ok" || !v.points || v.points.length < 2) {
    setPanelState("validation-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("validation-panel", null);
  document.getElementById("validation-subtitle").textContent = "Last " + v.points.length + " days, PM2.5 AQI";

  drawChart("validation-chart", {
    height: 220,
    labels: v.points.map(p => p.date),
    ariaLabel: "Line chart comparing actual and predicted PM2.5 AQI",
    series: [
      { name: "Actual", className: "series-actual", values: v.points.map(p => p.actual) },
      { name: "Predicted", className: "series-predicted", values: v.points.map(p => p.predicted) }
    ]
  });
  drawLegend("validation-legend", [
    { name: "Actual", className: "series-actual" },
    { name: "Predicted", className: "series-predicted" }
  ]);

  note.textContent = v.metrics
    ? "MAE: " + v.metrics.mae + "  |  RMSE: " + v.metrics.rmse
    : "Placeholder: accuracy numbers (MAE and RMSE) will go here once the ML team finishes testing.";
}

function updateSummary(data) {
  const aq = data.airQuality;

  if (!aq || aq.status !== "ok" || !aq.pollutants || aq.pollutants.length === 0) {
    setPanelState("summary-panel", "No summary yet", noDataTitle + ".");
    return;
  }
  setPanelState("summary-panel", null);

  // whichever pollutant is worst sets the overall rating
  const worst = aq.pollutants.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const category = getCategory(worst.aqi);

  document.getElementById("summary-main").textContent =
    "Air quality in " + data.location.name + " is " + category.name.toLowerCase() + " right now.";
  document.getElementById("summary-detail").textContent =
    category.text + " The highest reading is " + pollutantLabel(worst.parameter) + " at an AQI of " + worst.aqi + ".";
}

function renderAqiScale() {
  const list = document.getElementById("aqi-scale");
  aqiCategories.forEach(c => {
    const item = el("li", c.className);
    item.appendChild(el("span", "scale-swatch"));
    item.appendChild(el("span", "", c.name));
    item.appendChild(el("span", "scale-range", c.range));
    list.appendChild(item);
  });
}

function renderDashboard(data) {
  currentData = data;
  updateAirQuality(data);
  updateWeather(data);
  updateHistorical();
  updatePrediction(data);
  updateValidation(data);
  updateSummary(data);
  if (window.AOS) AOS.refresh();
}


/* charts: plain SVG, no library */

function linePath(values, xPos, yPos) {
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined) { penDown = false; return; }
    d += (penDown ? " L " : " M ") + xPos(i).toFixed(1) + " " + yPos(v).toFixed(1);
    penDown = true;
  });
  return d;
}

function areaPath(values, xPos, yPos, baseline) {
  const idx = [];
  values.forEach((v, i) => { if (v != null) idx.push(i); });
  if (idx.length < 2) return "";
  let d = "M " + xPos(idx[0]).toFixed(1) + " " + baseline;
  idx.forEach(i => { d += " L " + xPos(i).toFixed(1) + " " + yPos(values[i]).toFixed(1); });
  return d + " L " + xPos(idx[idx.length - 1]).toFixed(1) + " " + baseline + " Z";
}

function bandPath(low, high, xPos, yPos) {
  const idx = [];
  high.forEach((v, i) => { if (v != null && low[i] != null) idx.push(i); });
  if (idx.length === 0) return "";

  let d = "";
  idx.forEach((i, k) => {
    d += (k === 0 ? "M " : " L ") + xPos(i).toFixed(1) + " " + yPos(high[i]).toFixed(1);
  });
  idx.slice().reverse().forEach(i => {
    d += " L " + xPos(i).toFixed(1) + " " + yPos(low[i]).toFixed(1);
  });
  return d + " Z";
}

function drawChart(id, config) {
  chartConfigs[id] = config;
  const box = document.getElementById(id);
  box.querySelectorAll("svg").forEach(svg => svg.remove());

  const width = box.clientWidth;
  if (width === 0) return; // panel is hidden right now

  const height = config.height || 290;
  const margin = { top: 10, right: 18, bottom: 28, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const count = config.labels.length;

  const allValues = [];
  config.series.forEach(s => {
    allValues.push(...s.values);
    if (s.high) allValues.push(...s.high);
  });
  const maxValue = Math.max(...allValues.filter(v => v != null));
  const roughMax = Math.max(60, maxValue * 1.1);
  const step = roughMax <= 100 ? 20 : roughMax <= 200 ? 50 : 100;
  const yMax = Math.ceil(roughMax / step) * step;

  const xPos = i => margin.left + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const yPos = v => margin.top + plotH - (v / yMax) * plotH;

  const svg = svgEl("svg", { width: width, height: height, role: "img", "aria-label": config.ariaLabel });

  [{ from: 0, to: 50, cls: "band-good", label: "Good" },
   { from: 50, to: 100, cls: "band-moderate", label: "Moderate" }].forEach(b => {
    if (b.from >= yMax) return;
    const top = Math.min(b.to, yMax);
    svg.appendChild(svgEl("rect", { x: margin.left, y: yPos(top), width: plotW, height: yPos(b.from) - yPos(top), class: b.cls }));
    const text = svgEl("text", { x: margin.left + 6, y: yPos(top) + 13, class: "band-label" });
    text.textContent = b.label;
    svg.appendChild(text);
  });

  for (let v = 0; v <= yMax; v += step) {
    svg.appendChild(svgEl("line", { x1: margin.left, x2: margin.left + plotW, y1: yPos(v), y2: yPos(v), class: "grid-line" }));
    const label = svgEl("text", { x: margin.left - 8, y: yPos(v) + 4, "text-anchor": "end", class: "axis-label" });
    label.textContent = v;
    svg.appendChild(label);
  }

  const maxTicks = width < 480 ? 4 : 7;
  const tickStep = Math.ceil(count / maxTicks);
  for (let i = 0; i < count; i += tickStep) {
    const label = svgEl("text", { x: xPos(i), y: height - 8, "text-anchor": "middle", class: "axis-label" });
    label.textContent = shortDate(config.labels[i]);
    svg.appendChild(label);
  }

  config.series.forEach(s => {
    const group = svgEl("g", { class: "series " + s.className });
    if (s.area) group.appendChild(svgEl("path", { d: areaPath(s.values, xPos, yPos, yPos(0)), class: "series-area" }));
    if (s.low && s.high) group.appendChild(svgEl("path", { d: bandPath(s.low, s.high, xPos, yPos), class: "series-band" }));
    group.appendChild(svgEl("path", { d: linePath(s.values, xPos, yPos), class: "series-line" }));
    if (count <= 16) {
      s.values.forEach((v, i) => {
        if (v != null) group.appendChild(svgEl("circle", { cx: xPos(i), cy: yPos(v), r: 2.5, class: "series-dot" }));
      });
    }
    svg.appendChild(group);
  });

  const tooltip = box.querySelector(".tooltip");
  const hoverLine = svgEl("line", { y1: margin.top, y2: margin.top + plotH, class: "hover-line" });
  hoverLine.style.display = "none";
  svg.appendChild(hoverLine);

  const overlay = svgEl("rect", { x: margin.left, y: margin.top, width: plotW, height: plotH, fill: "transparent" });
  svg.appendChild(overlay);

  overlay.addEventListener("pointermove", event => {
    const rect = svg.getBoundingClientRect();
    let i = count === 1 ? 0 : Math.round(((event.clientX - rect.left - margin.left) / plotW) * (count - 1));
    i = Math.max(0, Math.min(count - 1, i));

    hoverLine.setAttribute("x1", xPos(i));
    hoverLine.setAttribute("x2", xPos(i));
    hoverLine.style.display = "block";

    tooltip.innerHTML = "";
    tooltip.appendChild(el("strong", "", fullDate(config.labels[i])));
    config.series.forEach(s => {
      if (s.values[i] == null) return;
      let text = s.name + ": " + s.values[i];
      if (s.low && s.low[i] != null) text += " (range " + s.low[i] + "–" + s.high[i] + ")";
      tooltip.appendChild(el("div", "", text));
    });
    tooltip.hidden = false;
    tooltip.style.left = (xPos(i) > width / 2 ? xPos(i) - tooltip.offsetWidth - 10 : xPos(i) + 10) + "px";
  });

  overlay.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    hoverLine.style.display = "none";
  });

  box.insertBefore(svg, tooltip);
}

function drawLegend(id, items) {
  const legend = document.getElementById(id);
  legend.innerHTML = "";
  items.forEach(item => {
    const entry = el("span", "legend-item");
    entry.appendChild(el("span", "swatch " + item.className));
    entry.appendChild(document.createTextNode(item.name));
    legend.appendChild(entry);
  });
}


/* form */

function showFormMessage(text) {
  formMessage.textContent = text;
  formMessage.hidden = !text;
}

function checkInputs(location, start, end) {
  if (!location) return "Type in a city, ZIP code, or area.";
  if (!start || !end) return "Pick both a start date and an end date.";
  if (start >= end) return "The start date has to come before the end date.";
  if (listDates(start, end).length > 90) return "Keep the date range to 90 days or less.";
  return "";
}

function setLoading(isLoading) {
  document.getElementById("dashboard").classList.toggle("is-loading", isLoading);
  analyzeBtn.disabled = isLoading;
  analyzeBtn.textContent = isLoading ? "Analyzing..." : "Analyze";
}

async function analyze() {
  const location = locationInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;

  const problem = checkInputs(location, start, end);
  if (problem) {
    showFormMessage(problem);
    return;
  }
  showFormMessage("");
  setLoading(true);

  try {
    renderDashboard(await getDashboardData(location, start, end));
  } catch (error) {
    console.error(error);
    showFormMessage("Couldn't get data from the server. Give it another try in a bit.");
    renderDashboard(makeEmptyData(location));
  }
  setLoading(false);
}

document.getElementById("search-form").addEventListener("submit", event => {
  event.preventDefault();
  analyze();
});

pollutantSelect.addEventListener("change", updateHistorical);

window.addEventListener("resize", () => {
  Object.keys(chartConfigs).forEach(id => drawChart(id, chartConfigs[id]));
});


/* start */

const today = toISO(new Date());
endInput.value = today;
startInput.value = addDays(today, -30);

document.getElementById("data-mode").textContent = USE_SAMPLE_DATA ? "Showing sample data" : "Connected to backend";
document.getElementById("mock-tools").hidden = !USE_SAMPLE_DATA;

if (window.AOS) {
  AOS.init({
    duration: 700,
    easing: "ease-out-cubic",
    once: true,
    offset: 50,
    disable: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
}

renderAqiScale();
analyze();
