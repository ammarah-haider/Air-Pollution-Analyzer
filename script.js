// Air Pollution Analyzer & Predictor - dashboard script
//
// The backend should return ONE combined response shaped like this:
// {
//   location:   { name },
//   airQuality: { status, source, pollutants: [{ parameter, aqi, category, dateObserved,
//                 hourObserved, timeZone, reportingArea, agency }] },
//   weather:    { status, source, station, observedAt, values: [{ key, label, value, unit }] },
//   historical: { status, series: { "PM2.5": [{ date, value }], "OZONE": [...], "PM10": [...] } },
//   prediction: { status, isPlaceholder, points: [{ date, value, low, high }] },
//   validation: { status, metrics, points: [{ date, actual, predicted }] }
// }
// Each status is "ok", "no_data", "unavailable" or "not_connected".

const USE_SAMPLE_DATA = true;   // set to false once the backend is ready
const API_URL = "/api/analyze"; // placeholder endpoint

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
    text: "Air quality is satisfactory and poses little or no risk." },
  { name: "Moderate", max: 100, range: "51–100", className: "aqi-moderate",
    text: "Air quality is acceptable, but a small number of unusually sensitive people may be affected." },
  { name: "Unhealthy for Sensitive Groups", max: 150, range: "101–150", className: "aqi-usg",
    text: "Children, older adults, and people with heart or lung disease may be affected." },
  { name: "Unhealthy", max: 200, range: "151–200", className: "aqi-unhealthy",
    text: "Everyone may begin to experience health effects." },
  { name: "Very Unhealthy", max: 300, range: "201–300", className: "aqi-very",
    text: "Health warnings of emergency conditions. Everyone is more likely to be affected." },
  { name: "Hazardous", max: 500, range: "301+", className: "aqi-hazardous",
    text: "Emergency conditions. Everyone is likely to be affected." }
];

const apMonths = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


/* ---------- small helpers ---------- */

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

function getPollutantLabel(key) {
  return pollutantInfo[key] ? pollutantInfo[key].label : key;
}

function parseDate(iso) {
  const parts = iso.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toISO(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function addDays(iso, n) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

function listDates(start, end) {
  const dates = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function formatShortDate(iso) {
  const date = parseDate(iso);
  return shortMonths[date.getMonth()] + " " + date.getDate();
}

function formatFullDate(iso) {
  return formatShortDate(iso) + ", " + parseDate(iso).getFullYear();
}

function formatHour(hour) {
  const hr = hour % 12 === 0 ? 12 : hour % 12;
  return hr + ":00 " + (hour < 12 ? "AM" : "PM");
}

function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}


/* ---------- sample data until backend is connected ---------- */

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

  if (simulate === "no-data" || !isSupportedLocation(location)) {
    return makeEmptyData(location);
  }

  const dates = listDates(startDate, endDate);
  const pm25 = makeSampleSeries(dates, 38, 14, 1);
  const lastValue = pm25[pm25.length - 1].value;

  const futureDates = listDates(addDays(endDate, 1), addDays(endDate, 7));
  const predictionPoints = futureDates.map((date, i) => {
    const value = Math.round(lastValue * 0.6 + 38 * 0.4 + Math.sin(i / 2) * 6 + (pseudoRandom(i + 200) - 0.5) * 6);
    return { date: date, value: value, low: Math.max(0, value - 8 - i), high: value + 8 + i };
  });

  const validationPoints = pm25.slice(-14).map((point, i) => ({
    date: point.date,
    actual: point.value,
    predicted: Math.max(0, point.value + Math.round((pseudoRandom(i + 300) - 0.5) * 14))
  }));

  const data = {
    location: { name: "Dallas-Fort Worth, TX" },
    airQuality: {
      status: "ok",
      source: "EPA AirNow / Texas Commission on Environmental Quality",
      pollutants: [
        { parameter: "OZONE", aqi: 37, category: "Good", dateObserved: "2026-09-30", hourObserved: 13, timeZone: "CDT", reportingArea: "Dallas-Fort Worth", agency: "TCEQ" },
        { parameter: "PM2.5", aqi: 36, category: "Good", dateObserved: "2026-09-30", hourObserved: 13, timeZone: "CDT", reportingArea: "Dallas-Fort Worth", agency: "TCEQ" },
        { parameter: "PM10", aqi: 34, category: "Good", dateObserved: "2026-09-30", hourObserved: 13, timeZone: "CDT", reportingArea: "Dallas-Fort Worth", agency: "TCEQ" }
      ]
    },
    weather: {
      status: "ok",
      source: "NOAA / National Weather Service",
      station: "KDFW",
      observedAt: "12:53 PM CDT",
      values: [
        { key: "temperature", label: "Temperature", value: 84, unit: "°F" },
        { key: "humidity", label: "Humidity", value: 52, unit: "%" },
        { key: "windSpeed", label: "Wind speed", value: 9, unit: "mph" },
        { key: "windDirection", label: "Wind direction", value: "SSE (150°)", unit: "" },
        { key: "ceiling", label: "Atmospheric ceiling", value: 4500, unit: "ft" }
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

  if (simulate === "no-weather") {
    data.weather = { status: "unavailable" };
  }
  if (simulate === "no-model") {
    data.prediction = { status: "not_connected" };
    data.validation = { status: "not_connected" };
  }
  return data;
}


/* ---------- getting data ---------- */

async function getDashboardData(location, startDate, endDate) {
  if (USE_SAMPLE_DATA) {
    await new Promise(resolve => setTimeout(resolve, 400)); // pretend to wait for the server
    return getSampleData(location, startDate, endDate);
  }

  const url = API_URL + "?location=" + encodeURIComponent(location) + "&start=" + startDate + "&end=" + endDate;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed with status " + response.status);
  return response.json();
}


/* ---------- panel states ---------- */

// show a message instead of the panel content (or show the content again if title is empty)
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

const noDataTitle = "Not enough data is available for this location or date range";
const noDataDetail = "Check the location or choose a different date range, then try again.";


/* ---------- update the page ---------- */

// update air quality cards
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

  aq.pollutants.forEach(p => {
    const info = pollutantInfo[p.parameter] || { label: p.parameter, note: "" };
    const card = el("div", "pollutant-card " + getCategory(p.aqi).className);

    const title = el("h3", "", info.label);
    if (info.note) title.appendChild(el("span", "pollutant-note", info.note));
    card.appendChild(title);

    const value = el("p", "aqi-value", String(p.aqi));
    value.appendChild(el("span", "", "AQI"));
    card.appendChild(value);

    card.appendChild(el("p", "aqi-category", p.category));
    card.appendChild(el("p", "card-meta", "Observed " + formatHour(p.hourObserved) + " " + p.timeZone + " \u2022 " + p.agency));
    grid.appendChild(card);
  });

  // use the first reading for the "last updated" line
  const latest = aq.pollutants[0];
  const date = parseDate(latest.dateObserved);
  const dateText = apMonths[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  document.getElementById("aq-source").textContent =
    "Last updated: " + dateText + " at " + formatHour(latest.hourObserved) + " " + latest.timeZone +
    " \u2022 Source: " + aq.source + ".";
}

// update weather section
function updateWeather(data) {
  const w = data.weather;

  if (!w || w.status !== "ok" || !w.values) {
    setPanelState("weather-panel", "Weather data unavailable",
      "Observations from the National Weather Service could not be loaded. Other sections are not affected.");
    return;
  }
  setPanelState("weather-panel", null);

  const list = document.getElementById("weather-list");
  list.innerHTML = "";

  // every item in w.values gets a row, so new weather features only need to be added in the backend response
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
    "Source: " + w.source + " \u2022 Station " + w.station + ", observed " + w.observedAt + ".";
}

// render historical chart
function updateHistorical() {
  const h = currentData && currentData.historical;
  const pollutant = pollutantSelect.value;
  const points = h && h.status === "ok" && h.series ? h.series[pollutant] : null;

  if (!points || points.length < 2) {
    document.getElementById("historical-subtitle").textContent = "";
    setPanelState("historical-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("historical-panel", null);

  const label = getPollutantLabel(pollutant);
  document.getElementById("historical-subtitle").textContent =
    "Daily " + label + " AQI, " + formatShortDate(points[0].date) + " to " + formatFullDate(points[points.length - 1].date);

  drawChart("historical-chart", {
    labels: points.map(p => p.date),
    ariaLabel: "Line chart of daily " + label + " AQI over the selected date range",
    series: [{ name: label + " AQI", className: "series-actual", values: points.map(p => p.value) }]
  });
  drawLegend("historical-legend", [{ name: label + " AQI (daily)", className: "series-actual" }]);
}

// render prediction chart
function updatePrediction(data) {
  const p = data.prediction;
  const subtitle = document.getElementById("prediction-subtitle");

  if (!p || p.status === "not_connected") {
    subtitle.textContent = "";
    setPanelState("prediction-panel", "Prediction model not connected yet",
      "Predicted values will appear here once the ML model is connected to the backend.");
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

  // a few recent actual days give the prediction some context
  const history = data.historical && data.historical.status === "ok" ? (data.historical.series["PM2.5"] || []) : [];
  const recent = history.slice(-5);
  const blanks = recent.map(() => null);

  drawChart("prediction-chart", {
    labels: recent.map(r => r.date).concat(p.points.map(x => x.date)),
    ariaLabel: "Line chart of predicted PM2.5 AQI for the upcoming days (model output)",
    series: [
      { name: "Recent actual", className: "series-context",
        values: recent.map(r => r.value).concat(p.points.map(() => null)) },
      { name: "Prediction / Model Output", className: "series-predicted",
        values: blanks.concat(p.points.map(x => x.value)),
        low: blanks.concat(p.points.map(x => x.low)),
        high: blanks.concat(p.points.map(x => x.high)) }
    ]
  });
  drawLegend("prediction-legend", [
    { name: "Recent actual", className: "series-context" },
    { name: "Prediction / Model Output", className: "series-predicted" },
    { name: "Estimated range", className: "series-predicted swatch-band" }
  ]);
}

// render actual vs predicted chart
function updateValidation(data) {
  const v = data.validation;
  const note = document.getElementById("validation-note");

  if (!v || v.status === "not_connected") {
    setPanelState("validation-panel", "Prediction model not connected yet",
      "The comparison with actual readings will appear here after the model is trained and tested.");
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

  if (v.metrics) {
    note.textContent = "MAE: " + v.metrics.mae + " \u2022 RMSE: " + v.metrics.rmse;
  } else {
    note.textContent = "Placeholder: model accuracy metrics (such as MAE and RMSE) will be added once the ML team finishes training and testing.";
  }
}

// plain-language summary
function updateSummary(data) {
  const aq = data.airQuality;

  if (!aq || aq.status !== "ok" || !aq.pollutants || aq.pollutants.length === 0) {
    setPanelState("summary-panel", "No summary available", noDataTitle + ".");
    return;
  }
  setPanelState("summary-panel", null);

  // overall category follows the pollutant with the highest AQI
  const highest = aq.pollutants.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const category = getCategory(highest.aqi);

  document.getElementById("summary-main").textContent =
    "Air quality in " + data.location.name + " is currently " + category.name +
    " based on the latest available AirNow readings.";
  document.getElementById("summary-detail").textContent =
    category.text + " The highest reading is " + getPollutantLabel(highest.parameter) + " (AQI " + highest.aqi + ").";
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
}


/* ---------- charts (plain SVG, no library) ---------- */

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

function bandPath(low, high, xPos, yPos) {
  const indexes = [];
  high.forEach((v, i) => {
    if (v != null && low[i] != null) indexes.push(i);
  });
  if (indexes.length === 0) return "";

  let d = "";
  indexes.forEach((i, k) => {
    d += (k === 0 ? "M " : " L ") + xPos(i).toFixed(1) + " " + yPos(high[i]).toFixed(1);
  });
  indexes.slice().reverse().forEach(i => {
    d += " L " + xPos(i).toFixed(1) + " " + yPos(low[i]).toFixed(1);
  });
  return d + " Z";
}

function drawChart(id, config) {
  chartConfigs[id] = config;
  const box = document.getElementById(id);
  box.querySelectorAll("svg").forEach(svg => svg.remove());

  const width = box.clientWidth;
  if (width === 0) return; // panel is hidden

  const height = config.height || 290;
  const margin = { top: 10, right: 18, bottom: 28, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const count = config.labels.length;

  // work out the y axis range
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

  // light bands for the Good and Moderate AQI ranges
  [{ from: 0, to: 50, cls: "band-good", label: "Good" },
   { from: 50, to: 100, cls: "band-moderate", label: "Moderate" }].forEach(b => {
    if (b.from >= yMax) return;
    const top = Math.min(b.to, yMax);
    svg.appendChild(svgEl("rect", { x: margin.left, y: yPos(top), width: plotW, height: yPos(b.from) - yPos(top), class: b.cls }));
    const text = svgEl("text", { x: margin.left + 6, y: yPos(top) + 13, class: "band-label" });
    text.textContent = b.label;
    svg.appendChild(text);
  });

  // grid lines and y labels
  for (let v = 0; v <= yMax; v += step) {
    svg.appendChild(svgEl("line", { x1: margin.left, x2: margin.left + plotW, y1: yPos(v), y2: yPos(v), class: "grid-line" }));
    const label = svgEl("text", { x: margin.left - 8, y: yPos(v) + 4, "text-anchor": "end", class: "axis-label" });
    label.textContent = v;
    svg.appendChild(label);
  }

  // x labels (skip some dates when there are many)
  const maxTicks = width < 480 ? 4 : 7;
  const tickStep = Math.ceil(count / maxTicks);
  for (let i = 0; i < count; i += tickStep) {
    const label = svgEl("text", { x: xPos(i), y: height - 8, "text-anchor": "middle", class: "axis-label" });
    label.textContent = formatShortDate(config.labels[i]);
    svg.appendChild(label);
  }

  // lines
  config.series.forEach(s => {
    const group = svgEl("g", { class: "series " + s.className });
    if (s.low && s.high) {
      group.appendChild(svgEl("path", { d: bandPath(s.low, s.high, xPos, yPos), class: "series-band" }));
    }
    group.appendChild(svgEl("path", { d: linePath(s.values, xPos, yPos), class: "series-line" }));
    if (count <= 16) {
      s.values.forEach((v, i) => {
        if (v != null) group.appendChild(svgEl("circle", { cx: xPos(i), cy: yPos(v), r: 2.5, class: "series-dot" }));
      });
    }
    svg.appendChild(group);
  });

  // hover tooltip
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
    tooltip.appendChild(el("strong", "", formatFullDate(config.labels[i])));
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


/* ---------- form ---------- */

function showFormMessage(text) {
  formMessage.textContent = text;
  formMessage.hidden = !text;
}

// returns a message if something is wrong, otherwise an empty string
function checkInputs(location, start, end) {
  if (!location) return "Enter a city, ZIP code, or supported location.";
  if (!start || !end) return "Choose both a start date and an end date.";
  if (start >= end) return "The start date must be before the end date.";
  if (listDates(start, end).length > 90) return "Choose a date range of 90 days or less.";
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
    const data = await getDashboardData(location, start, end);
    renderDashboard(data);
  } catch (error) {
    console.error(error);
    showFormMessage("Could not load data from the server. Please try again.");
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


/* ---------- start ---------- */

document.getElementById("data-mode").textContent = USE_SAMPLE_DATA ? "Mockup: showing sample data" : "Connected to backend";
document.getElementById("mock-tools").hidden = !USE_SAMPLE_DATA;
renderAqiScale();
analyze();
