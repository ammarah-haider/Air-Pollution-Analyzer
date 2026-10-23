// set to true to use fake data
const USE_SAMPLE_DATA = false;

const BACKEND_ONLINE = "https://air-pollution-analyzer-ht42-eight.vercel.app";
const BACKEND_LOCAL = "http://localhost:8000";

let API_URL = BACKEND_ONLINE + "/dashboard";
if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") {
  API_URL = BACKEND_LOCAL + "/dashboard";
}

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
  "OZONE": { label: "Ozone", note: "O₃", css: "ozone" },
  "PM2.5": { label: "PM2.5", note: "fine particles", css: "pm25" },
  "PM10": { label: "PM10", note: "coarse particles", css: "pm10" }
};

const aqiCategories = [
  { name: "Good", short: "Good", max: 50, range: "0–50", className: "aqi-good", key: "good",
    text: "The air is fine and there's little or no risk." },
  { name: "Moderate", short: "Moderate", max: 100, range: "51–100", className: "aqi-moderate", key: "moderate",
    text: "The air is acceptable, but a few unusually sensitive people might notice it." },
  { name: "Unhealthy for Sensitive Groups", short: "Sensitive", max: 150, range: "101–150", className: "aqi-usg", key: "usg",
    text: "Kids, older adults, and people with heart or lung problems may feel it." },
  { name: "Unhealthy", short: "Unhealthy", max: 200, range: "151–200", className: "aqi-unhealthy", key: "unhealthy",
    text: "Everyone may start to feel some effects." },
  { name: "Very Unhealthy", short: "Very unhealthy", max: 300, range: "201–300", className: "aqi-very", key: "very",
    text: "This is a health warning. Everyone is more likely to be affected." },
  { name: "Hazardous", short: "Hazardous", max: 500, range: "301+", className: "aqi-hazardous", key: "hazardous",
    text: "Emergency conditions. Everyone is likely to be affected." }
];

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const key in attrs) {
    node.setAttribute(key, attrs[key]);
  }
  return node;
}

function getCategory(aqi) {
  if (aqi <= 50) return aqiCategories[0];
  if (aqi <= 100) return aqiCategories[1];
  if (aqi <= 150) return aqiCategories[2];
  if (aqi <= 200) return aqiCategories[3];
  if (aqi <= 300) return aqiCategories[4];
  return aqiCategories[5];
}

function pollutantLabel(key) {
  if (pollutantInfo[key]) return pollutantInfo[key].label;
  return key;
}

function parseDate(iso) {
  const parts = iso.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function toISO(date) {
  let month = String(date.getMonth() + 1);
  let day = String(date.getDate());
  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;
  return date.getFullYear() + "-" + month + "-" + day;
}

function addDays(iso, n) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

function listDates(start, end) {
  const dates = [];
  let day = start;
  while (day <= end) {
    dates.push(day);
    day = addDays(day, 1);
  }
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
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return hour + ":00 AM";
  if (hour === 12) return "12:00 PM";
  return (hour - 12) + ":00 PM";
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
  const startTime = performance.now();
  const length = 700;

  function tick(now) {
    let progress = (now - startTime) / length;
    if (progress > 1) progress = 1;
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function isSupportedLocation(text) {
  const t = text.toLowerCase();
  const names = ["dallas", "fort worth", "dfw", "arlington", "plano", "irving", "frisco", "garland"];
  for (let i = 0; i < names.length; i++) {
    if (t.indexOf(names[i]) !== -1) return true;
  }
  return /^7[56]\d{3}$/.test(t.trim());
}

function makeSampleSeries(dates, base, swing, seed) {
  const series = [];
  for (let i = 0; i < dates.length; i++) {
    const wave = Math.sin(i / 3 + seed) * swing * 0.6;
    const noise = (pseudoRandom(i + seed) - 0.5) * swing;
    let value = Math.round(base + wave + noise);
    if (value < 5) value = 5;
    series.push({ date: dates[i], value: value });
  }
  return series;
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

function makeReading(parameter, aqi) {
  const now = new Date();
  return {
    parameter: parameter,
    aqi: aqi,
    category: getCategory(aqi).name,
    dateObserved: toISO(now),
    hourObserved: now.getHours(),
    timeZone: "CDT",
    reportingArea: "Dallas-Fort Worth",
    agency: "TCEQ"
  };
}

function getSampleData(location, startDate, endDate) {
  const simulate = simulateSelect.value;
  if (simulate === "no-data" || !isSupportedLocation(location)) {
    return makeEmptyData(location);
  }

  const dates = listDates(startDate, endDate);
  const pm25 = makeSampleSeries(dates, 62, 70, 1);
  const lastValue = pm25[pm25.length - 1].value;

  const futureDates = listDates(addDays(endDate, 1), addDays(endDate, 7));
  const predictionPoints = [];
  for (let i = 0; i < futureDates.length; i++) {
    const wobble = Math.sin(i / 2) * 8 + (pseudoRandom(i + 200) - 0.5) * 8;
    const value = Math.round(lastValue * 0.6 + 55 * 0.4 + wobble);
    predictionPoints.push({
      date: futureDates[i],
      value: value,
      low: Math.max(0, value - 8 - i),
      high: value + 8 + i
    });
  }

  const validationPoints = [];
  const lastTwoWeeks = pm25.slice(-14);
  for (let i = 0; i < lastTwoWeeks.length; i++) {
    const guess = lastTwoWeeks[i].value + Math.round((pseudoRandom(i + 300) - 0.5) * 18);
    validationPoints.push({
      date: lastTwoWeeks[i].date,
      actual: lastTwoWeeks[i].value,
      predicted: Math.max(0, guess)
    });
  }

  const now = new Date();
  const data = {
    location: { name: "Dallas-Fort Worth, TX" },
    airQuality: {
      status: "ok",
      source: "EPA AirNow / Texas Commission on Environmental Quality",
      pollutants: [makeReading("OZONE", 44), makeReading("PM2.5", 44), makeReading("PM10", 22)]
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
        "OZONE": makeSampleSeries(dates, 55, 50, 50),
        "PM10": makeSampleSeries(dates, 30, 16, 100)
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

function formatObserved(iso) {
  const hour = parseInt((iso || "").slice(11, 13), 10);
  if (isNaN(hour)) return "recently";
  return formatHour(hour) + " CT";
}

function hasValue(v) {
  return v !== null && v !== undefined;
}

// changes backend data into what the page uses
// anything missing shows not connected
function fromBackend(raw, locationName) {
  const aq = raw.air_quality || {};
  const wx = raw.weather || {};
  const stamp = raw.timestamp || "";

  const dateObserved = stamp.slice(0, 10);
  const hourObserved = parseInt(stamp.slice(11, 13), 10);
  const pollutants = [];

  if (hasValue(aq.ozone_aqi)) {
    pollutants.push({
      parameter: "OZONE",
      aqi: aq.ozone_aqi,
      category: getCategory(aq.ozone_aqi).name,
      dateObserved: dateObserved,
      hourObserved: hourObserved,
      timeZone: "CT",
      agency: "TCEQ"
    });
  }
  if (hasValue(aq.pm25_aqi)) {
    pollutants.push({
      parameter: "PM2.5",
      aqi: aq.pm25_aqi,
      category: getCategory(aq.pm25_aqi).name,
      dateObserved: dateObserved,
      hourObserved: hourObserved,
      timeZone: "CT",
      agency: "TCEQ"
    });
  }
  if (hasValue(aq.pm10_aqi)) {
    pollutants.push({
      parameter: "PM10",
      aqi: aq.pm10_aqi,
      category: getCategory(aq.pm10_aqi).name,
      dateObserved: dateObserved,
      hourObserved: hourObserved,
      timeZone: "CT",
      agency: "TCEQ"
    });
  }

  const weatherValues = [];
  if (hasValue(wx.temperature_c)) {
    weatherValues.push({ label: "Temperature", value: Math.round(wx.temperature_c * 9 / 5 + 32), unit: "°F" });
  }
  if (hasValue(wx.humidity_pct)) {
    weatherValues.push({ label: "Humidity", value: Math.round(wx.humidity_pct), unit: "%" });
  }
  if (hasValue(wx.pressure_pa)) {
    weatherValues.push({ label: "Pressure", value: Number((wx.pressure_pa * 0.0002953).toFixed(2)), unit: "inHg" });
  }
  if (hasValue(wx.visibility_m)) {
    weatherValues.push({ label: "Visibility", value: Math.round(wx.visibility_m / 1609.34), unit: "mi" });
  }
  if (hasValue(wx.wind_speed_kmh)) {
    weatherValues.push({ label: "Wind speed", value: Math.round(wx.wind_speed_kmh * 0.6214), unit: "mph" });
  }
  if (hasValue(wx.wind_direction_deg)) {
    const dir = compass[Math.round(wx.wind_direction_deg / 22.5) % 16];
    weatherValues.push({ label: "Wind direction", value: dir + " (" + Math.round(wx.wind_direction_deg) + "°)", unit: "" });
  }

  let airQuality = { status: "no_data" };
  if (pollutants.length > 0) {
    airQuality = { status: "ok", source: "EPA AirNow / TCEQ", pollutants: pollutants };
  }

  let weatherSource = "NOAA / National Weather Service";
  if (wx.source === "Open-Meteo") {
    weatherSource = "Open-Meteo (the NWS station was out of date)";
  }

  let weather = { status: "unavailable" };
  if (weatherValues.length > 0) {
    weather = {
      status: "ok",
      source: weatherSource,
      station: wx.station_id || "KDFW",
      observedAt: formatObserved(wx.observed_at || stamp),
      values: weatherValues
    };
  }

  let historical = { status: "not_connected" };
  if (raw.historical) {
    historical = {
      status: "ok",
      series: raw.historical.series || raw.historical,
      source: raw.historical.source
    };
  }

  let prediction = { status: "not_connected" };
  if (raw.prediction) {
    let points = raw.prediction.points;
    if (Array.isArray(raw.prediction)) points = raw.prediction;
    if (points && points.length > 0) {
      prediction = { status: "ok", isPlaceholder: false, points: points };
    }
  }

  let validation = { status: "not_connected" };
  if (raw.validation) {
    validation = {
      status: "ok",
      metrics: raw.validation.metrics || null,
      points: raw.validation.points || []
    };
  }

  return {
    location: { name: raw.location || locationName },
    airQuality: airQuality,
    weather: weather,
    historical: historical,
    prediction: prediction,
    validation: validation
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
  if (raw.air_quality || raw.weather) {
    return fromBackend(raw, location);
  }
  return raw;
}

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

function setPageColor(category) {
  if (category) {
    document.body.setAttribute("data-aqi", category.key);
  } else {
    document.body.removeAttribute("data-aqi");
  }
}

function updateAirQuality(data) {
  const aq = data.airQuality;
  if (data.location) {
    document.getElementById("aq-location").textContent = "Reporting area: " + data.location.name;
  } else {
    document.getElementById("aq-location").textContent = "";
  }

  if (!aq || aq.status !== "ok" || !aq.pollutants || aq.pollutants.length === 0) {
    setPanelState("air-quality-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("air-quality-panel", null);

  const grid = document.getElementById("pollutant-grid");
  grid.innerHTML = "";

  for (let i = 0; i < aq.pollutants.length; i++) {
    const p = aq.pollutants[i];
    let info = pollutantInfo[p.parameter];
    if (!info) info = { label: p.parameter, note: "", css: "" };

    const card = el("div", "pollutant-card " + getCategory(p.aqi).className);
    card.style.animationDelay = i * 90 + "ms";

    const title = el("h3", "pol-name-" + info.css);
    title.appendChild(el("span", "pol-dot"));
    title.appendChild(el("span", "pol-label", info.label));
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
  }

  const latest = aq.pollutants[0];
  document.getElementById("aq-source").textContent =
    "Last updated " + fullDate(latest.dateObserved) + " at " + formatHour(latest.hourObserved) + " " + latest.timeZone +
    ". Source: " + aq.source + ".";
}

function weatherColorClass(item) {
  if (typeof item.value !== "number") return "";

  if (item.label === "Temperature") {
    if (item.value < 32) return "temp-freezing";
    if (item.value < 50) return "temp-cold";
    if (item.value < 65) return "temp-cool";
    if (item.value < 80) return "temp-mild";
    if (item.value < 90) return "temp-warm";
    if (item.value < 100) return "temp-hot";
    return "temp-extreme";
  }
  if (item.label === "Humidity") {
    if (item.value < 30) return "humid-dry";
    if (item.value > 70) return "humid-wet";
    return "humid-ok";
  }
  if (item.label === "Visibility") {
    if (item.value < 3) return "temp-extreme";
    if (item.value < 6) return "temp-warm";
  }
  return "";
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

  for (let i = 0; i < w.values.length; i++) {
    const item = w.values[i];
    const row = el("div", "weather-item");
    row.appendChild(el("dt", "", item.label));

    const dd = el("dd");
    if (item.value === null || item.value === undefined) {
      dd.appendChild(el("span", "not-reported", "Not reported"));
    } else {
      let shown = item.value;
      if (typeof item.value === "number") shown = item.value.toLocaleString("en-US");

      const colorClass = weatherColorClass(item);
      if (colorClass) {
        dd.appendChild(el("span", colorClass, String(shown)));
      } else {
        dd.appendChild(document.createTextNode(shown));
      }
      if (item.unit) dd.appendChild(el("span", "unit", item.unit));
    }
    row.appendChild(dd);
    list.appendChild(row);
  }

  document.getElementById("weather-source").textContent =
    "Source: " + w.source + ". Station " + w.station + ", observed " + w.observedAt + ".";
}

function updateHistorical() {
  const h = currentData ? currentData.historical : null;
  const choice = pollutantSelect.value;
  const subtitle = document.getElementById("historical-subtitle");

  if (h && h.status === "not_connected") {
    subtitle.textContent = "";
    setPanelState("historical-panel", "Historical data isn't connected yet",
      "Past readings will show up here once the backend sends them.");
    return;
  }

  let keys = [];
  if (choice === "ALL") {
    keys.push("OZONE");
    keys.push("PM2.5");
    keys.push("PM10");
  } else {
    keys.push(choice);
  }

  const lines = [];
  let firstDates = null;
  if (h && h.status === "ok" && h.series) {
    for (let i = 0; i < keys.length; i++) {
      const points = h.series[keys[i]];
      if (points && points.length >= 2) {
        lines.push({ key: keys[i], points: points });
        if (!firstDates) firstDates = points;
      }
    }
  }

  if (lines.length === 0) {
    subtitle.textContent = "";
    setPanelState("historical-panel", noDataTitle, noDataDetail);
    return;
  }
  setPanelState("historical-panel", null);

  document.getElementById("historical-source").textContent = h.source ? "Source: " + h.source + "." : "";

  const dates = [];
  for (let i = 0; i < firstDates.length; i++) {
    dates.push(firstDates[i].date);
  }
  const range = shortDate(dates[0]) + " to " + fullDate(dates[dates.length - 1]);

  const chartSeries = [];
  const legendItems = [];
  for (let i = 0; i < lines.length; i++) {
    const info = pollutantInfo[lines[i].key] || { label: lines[i].key, css: "" };
    const values = [];
    for (let j = 0; j < lines[i].points.length; j++) {
      values.push(lines[i].points[j].value);
    }
    chartSeries.push({
      name: info.label,
      className: "series-" + info.css,
      area: lines.length === 1,
      colorDots: lines.length === 1,
      values: values
    });
    legendItems.push({ name: info.label, className: "series-" + info.css });
  }

  if (lines.length === 1) {
    const label = chartSeries[0].name;
    subtitle.textContent = "Daily " + label + " AQI, " + range;
    legendItems[0].name = label + " AQI (daily), dots colored by air quality level";
  } else {
    subtitle.textContent = "Daily AQI for all three pollutants, " + range;
  }

  drawChart("historical-chart", {
    labels: dates,
    ariaLabel: "Line chart of daily AQI over the selected dates",
    series: chartSeries
  });
  drawLegend("historical-legend", legendItems);
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
  subtitle.textContent = "Daily AQI (highest pollutant), next " + p.points.length + " days";

  // model predicts the highest aqi so use highest of the three
  let history = [];
  if (data.historical && data.historical.status === "ok") {
    const series = data.historical.series;
    const ozone = series["OZONE"] || [];
    const pm25 = series["PM2.5"] || [];
    const pm10 = series["PM10"] || [];

    let longest = pm25;
    if (ozone.length > longest.length) longest = ozone;
    if (pm10.length > longest.length) longest = pm10;

    for (let i = 0; i < longest.length; i++) {
      let biggest = 0;
      if (ozone[i] && ozone[i].value > biggest) biggest = ozone[i].value;
      if (pm25[i] && pm25[i].value > biggest) biggest = pm25[i].value;
      if (pm10[i] && pm10[i].value > biggest) biggest = pm10[i].value;
      history.push({ date: longest[i].date, value: biggest });
    }
  }
  const recent = history.slice(-5);

  const labels = [];
  const recentValues = [];
  const predValues = [];
  const lows = [];
  const highs = [];

  for (let i = 0; i < recent.length; i++) {
    labels.push(recent[i].date);
    recentValues.push(recent[i].value);
    predValues.push(null);
    lows.push(null);
    highs.push(null);
  }
  for (let i = 0; i < p.points.length; i++) {
    labels.push(p.points[i].date);
    recentValues.push(null);
    predValues.push(p.points[i].value);
    lows.push(p.points[i].low);
    highs.push(p.points[i].high);
  }

  drawChart("prediction-chart", {
    labels: labels,
    ariaLabel: "Line chart of predicted daily AQI for the next few days",
    series: [
      { name: "Recent actual", className: "series-context", values: recentValues },
      { name: "Prediction", className: "series-predicted", values: predValues, low: lows, high: highs }
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

  const dates = [];
  const actual = [];
  const predicted = [];
  for (let i = 0; i < v.points.length; i++) {
    dates.push(v.points[i].date);
    actual.push(v.points[i].actual);
    predicted.push(v.points[i].predicted);
  }

  drawChart("validation-chart", {
    height: 220,
    labels: dates,
    ariaLabel: "Line chart comparing actual and predicted PM2.5 AQI",
    series: [
      { name: "Actual", className: "series-actual", values: actual },
      { name: "Predicted", className: "series-predicted", values: predicted }
    ]
  });
  drawLegend("validation-legend", [
    { name: "Actual", className: "series-actual" },
    { name: "Predicted", className: "series-predicted" }
  ]);

  if (v.metrics) {
    note.textContent = "MAE: " + v.metrics.mae + "  |  RMSE: " + v.metrics.rmse;
  } else {
    note.textContent = "Placeholder: accuracy numbers (MAE and RMSE) will go here once the ML team finishes testing.";
  }
}

function drawAqiScale(currentKey) {
  const list = document.getElementById("aqi-scale");
  list.innerHTML = "";

  for (let i = 0; i < aqiCategories.length; i++) {
    const c = aqiCategories[i];
    const item = el("li", c.className);
    item.appendChild(el("span", "scale-swatch"));
    item.appendChild(el("span", "", c.name));

    if (c.key === currentKey) {
      item.classList.add("is-current");
      item.appendChild(el("span", "now-tag", "Now"));
    }
    item.appendChild(el("span", "scale-range", c.range));
    list.appendChild(item);
  }
}

function updateSummary(data) {
  const aq = data.airQuality;
  const main = document.getElementById("summary-main");

  if (!aq || aq.status !== "ok" || !aq.pollutants || aq.pollutants.length === 0) {
    setPanelState("summary-panel", "No summary yet", noDataTitle + ".");
    setPageColor(null);
    drawAqiScale(null);
    return;
  }
  setPanelState("summary-panel", null);

  let worst = aq.pollutants[0];
  for (let i = 1; i < aq.pollutants.length; i++) {
    if (aq.pollutants[i].aqi > worst.aqi) worst = aq.pollutants[i];
  }
  const category = getCategory(worst.aqi);

  main.className = "summary-main " + category.className;
  main.textContent = "Air quality in " + data.location.name + " is " + category.name.toLowerCase() + " right now.";
  document.getElementById("summary-detail").textContent =
    category.text + " The highest reading is " + pollutantLabel(worst.parameter) + " at an AQI of " + worst.aqi + ".";

  setPageColor(category);
  drawAqiScale(category.key);
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

function linePath(values, xPos, yPos) {
  let d = "";
  let penDown = false;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || values[i] === undefined) {
      penDown = false;
      continue;
    }
    d += (penDown ? " L " : " M ") + xPos(i).toFixed(1) + " " + yPos(values[i]).toFixed(1);
    penDown = true;
  }
  return d;
}

function areaPath(values, xPos, yPos, baseline) {
  const used = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined) used.push(i);
  }
  if (used.length < 2) return "";

  let d = "M " + xPos(used[0]).toFixed(1) + " " + baseline;
  for (let i = 0; i < used.length; i++) {
    d += " L " + xPos(used[i]).toFixed(1) + " " + yPos(values[used[i]]).toFixed(1);
  }
  d += " L " + xPos(used[used.length - 1]).toFixed(1) + " " + baseline + " Z";
  return d;
}

function bandPath(low, high, xPos, yPos) {
  const used = [];
  for (let i = 0; i < high.length; i++) {
    if (high[i] != null && low[i] != null) used.push(i);
  }
  if (used.length === 0) return "";

  let d = "";
  for (let k = 0; k < used.length; k++) {
    d += (k === 0 ? "M " : " L ") + xPos(used[k]).toFixed(1) + " " + yPos(high[used[k]]).toFixed(1);
  }
  for (let k = used.length - 1; k >= 0; k--) {
    d += " L " + xPos(used[k]).toFixed(1) + " " + yPos(low[used[k]]).toFixed(1);
  }
  return d + " Z";
}

function drawChart(id, config) {
  chartConfigs[id] = config;
  const box = document.getElementById(id);

  const oldCharts = box.querySelectorAll("svg");
  for (let i = 0; i < oldCharts.length; i++) {
    oldCharts[i].remove();
  }

  const width = box.clientWidth;
  if (width === 0) return; // panel is hidden right now

  const height = config.height || 290;
  const margin = { top: 10, right: 18, bottom: 28, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const count = config.labels.length;

  let maxValue = 0;
  for (let s = 0; s < config.series.length; s++) {
    const series = config.series[s];
    for (let i = 0; i < series.values.length; i++) {
      if (series.values[i] != null && series.values[i] > maxValue) maxValue = series.values[i];
      if (series.high && series.high[i] != null && series.high[i] > maxValue) maxValue = series.high[i];
    }
  }
  let roughMax = maxValue * 1.1;
  if (roughMax < 60) roughMax = 60;

  let step = 100;
  if (roughMax <= 100) step = 20;
  else if (roughMax <= 200) step = 50;
  const yMax = Math.ceil(roughMax / step) * step;

  function xPos(i) {
    if (count === 1) return margin.left + plotW / 2;
    return margin.left + (i / (count - 1)) * plotW;
  }
  function yPos(v) {
    return margin.top + plotH - (v / yMax) * plotH;
  }

  const svg = svgEl("svg", { width: width, height: height, role: "img", "aria-label": config.ariaLabel });

  let bandBottom = 0;
  for (let i = 0; i < aqiCategories.length; i++) {
    const cat = aqiCategories[i];
    const from = bandBottom;
    bandBottom = cat.max;
    if (from >= yMax) break;

    const top = Math.min(cat.max, yMax);
    const bandHeight = yPos(from) - yPos(top);
    svg.appendChild(svgEl("rect", {
      x: margin.left, y: yPos(top), width: plotW, height: bandHeight, class: "band " + cat.className
    }));

    if (bandHeight > 16) {
      const text = svgEl("text", { x: margin.left + plotW - 6, y: yPos(top) + 13, "text-anchor": "end", class: "band-label" });
      text.textContent = cat.short;
      svg.appendChild(text);
    }
  }

  for (let v = 0; v <= yMax; v += step) {
    svg.appendChild(svgEl("line", { x1: margin.left, x2: margin.left + plotW, y1: yPos(v), y2: yPos(v), class: "grid-line" }));
    const label = svgEl("text", { x: margin.left - 8, y: yPos(v) + 4, "text-anchor": "end", class: "axis-label" });
    label.textContent = v;
    svg.appendChild(label);
  }

  let maxTicks = 7;
  if (width < 480) maxTicks = 4;
  const tickStep = Math.ceil(count / maxTicks);
  for (let i = 0; i < count; i += tickStep) {
    const label = svgEl("text", { x: xPos(i), y: height - 8, "text-anchor": "middle", class: "axis-label" });
    label.textContent = shortDate(config.labels[i]);
    svg.appendChild(label);
  }

  for (let s = 0; s < config.series.length; s++) {
    const series = config.series[s];
    const group = svgEl("g", { class: "series " + series.className });

    if (series.area) {
      group.appendChild(svgEl("path", { d: areaPath(series.values, xPos, yPos, yPos(0)), class: "series-area" }));
    }
    if (series.low && series.high) {
      group.appendChild(svgEl("path", { d: bandPath(series.low, series.high, xPos, yPos), class: "series-band" }));
    }
    group.appendChild(svgEl("path", { d: linePath(series.values, xPos, yPos), class: "series-line" }));

    if (count <= 16 || series.colorDots) {
      for (let i = 0; i < series.values.length; i++) {
        const v = series.values[i];
        if (v == null) continue;

        let dotClass = "series-dot";
        if (series.colorDots) dotClass += " colored " + getCategory(v).className;
        group.appendChild(svgEl("circle", { cx: xPos(i), cy: yPos(v), r: series.colorDots ? 3 : 2.5, class: dotClass }));
      }
    }
    svg.appendChild(group);
  }

  const tooltip = box.querySelector(".tooltip");
  const hoverLine = svgEl("line", { y1: margin.top, y2: margin.top + plotH, class: "hover-line" });
  hoverLine.style.display = "none";
  svg.appendChild(hoverLine);

  const overlay = svgEl("rect", { x: margin.left, y: margin.top, width: plotW, height: plotH, fill: "transparent" });
  svg.appendChild(overlay);

  overlay.addEventListener("pointermove", function (event) {
    const rect = svg.getBoundingClientRect();
    let i = 0;
    if (count > 1) {
      i = Math.round(((event.clientX - rect.left - margin.left) / plotW) * (count - 1));
    }
    if (i < 0) i = 0;
    if (i > count - 1) i = count - 1;

    hoverLine.setAttribute("x1", xPos(i));
    hoverLine.setAttribute("x2", xPos(i));
    hoverLine.style.display = "block";

    tooltip.innerHTML = "";
    tooltip.appendChild(el("strong", "", fullDate(config.labels[i])));
    const multi = config.series.length > 1;

    for (let s = 0; s < config.series.length; s++) {
      const series = config.series[s];
      const v = series.values[i];
      if (v == null) continue;

      const cat = getCategory(v);
      let text = series.name + ": " + v + " (" + cat.short + ")";
      if (series.low && series.low[i] != null) {
        text += ", range " + series.low[i] + "–" + series.high[i];
      }

      const line = el("div", "tip-line " + cat.className);
      line.appendChild(el("span", multi ? "tip-dot " + series.className : "tip-dot"));
      line.appendChild(document.createTextNode(text));
      tooltip.appendChild(line);
    }

    tooltip.hidden = false;
    if (xPos(i) > width / 2) {
      tooltip.style.left = (xPos(i) - tooltip.offsetWidth - 10) + "px";
    } else {
      tooltip.style.left = (xPos(i) + 10) + "px";
    }
  });

  overlay.addEventListener("pointerleave", function () {
    tooltip.hidden = true;
    hoverLine.style.display = "none";
  });

  box.insertBefore(svg, tooltip);
}

function drawLegend(id, items) {
  const legend = document.getElementById(id);
  legend.innerHTML = "";
  for (let i = 0; i < items.length; i++) {
    const entry = el("span", "legend-item");
    entry.appendChild(el("span", "swatch " + items[i].className));
    entry.appendChild(document.createTextNode(items[i].name));
    legend.appendChild(entry);
  }
}

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
    const data = await getDashboardData(location, start, end);
    renderDashboard(data);
  } catch (error) {
    console.error(error);
    showFormMessage("Couldn't get data from the server. Give it another try in a bit.");
    renderDashboard(makeEmptyData(location));
  }
  setLoading(false);
}

document.getElementById("search-form").addEventListener("submit", function (event) {
  event.preventDefault();
  analyze();
});

pollutantSelect.addEventListener("change", updateHistorical);

window.addEventListener("resize", function () {
  const ids = Object.keys(chartConfigs);
  for (let i = 0; i < ids.length; i++) {
    drawChart(ids[i], chartConfigs[ids[i]]);
  }
});

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

analyze();