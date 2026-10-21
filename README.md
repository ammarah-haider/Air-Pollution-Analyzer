# Air Pollution Analyzer & Predictor

A web app that shows current air quality for the Dallas-Fort Worth area, looks back at how it's changed, and predicts what's coming using machine learning. It's our CS 4485 senior project (Team T6).

The first version is DFW only. Air quality comes from EPA AirNow, weather comes from the NOAA National Weather Service, and the predictions come from our ML model (still in progress).

## What's in the dashboard

- Current air quality (ozone, PM2.5, PM10)
- Current weather
- Past air quality for any date range
- Predicted air quality for the next few days
- Actual vs. predicted, so we can see how the model is doing
- A plain-words summary and the AQI scale

## Running it

Just open `index.html` in a browser, or serve the folder:

```
python -m http.server 5500
```

then go to http://localhost:5500. It's plain HTML, CSS, and JavaScript, so there's nothing to install. The animations use [AOS](https://michalsnik.github.io/aos/), which loads from a CDN.

## Sample data vs. the real backend

Right now the dashboard shows made-up sample data. At the top of `script.js`:

```js
const USE_SAMPLE_DATA = true;
const API_URL = "http://localhost:8000/dashboard";
```

Set `USE_SAMPLE_DATA` to `false` and it will call the backend instead. It expects JSON like this, and anything that's missing just shows a "not connected yet" message:

```json
{
  "timestamp": "2026-10-15T15:00:00-05:00",
  "location": "Dallas-Fort Worth",
  "air_quality": { "ozone_aqi": 44, "pm25_aqi": 44, "pm10_aqi": 22 },
  "weather": {
    "temperature_c": 32,
    "humidity_pct": 46.18,
    "pressure_pa": 101388.48,
    "visibility_m": 16093.44,
    "wind_speed_kmh": 20.376,
    "wind_direction_deg": 100
  },
  "historical": { "source": "Open-Meteo", "series": { "PM2.5": [{ "date": "2026-10-01", "value": 41 }] } },
  "prediction": { "points": [{ "date": "2026-10-16", "value": 40, "low": 32, "high": 49 }] },
  "validation": { "metrics": { "mae": 0, "rmse": 0 }, "points": [{ "date": "2026-10-01", "actual": 41, "predicted": 38 }] }
}
```

`historical`, `prediction`, and `validation` can be left out (or `null`) until the data and ML work is finished. The frontend converts the units (°C to °F, km/h to mph, and so on) itself.

The backend will also need to allow requests from the frontend (CORS) if they run on different ports.

## Files

- `index.html` - page layout
- `styles.css` - styling
- `script.js` - fetching data, drawing the charts, and updating the page

## Still to do

- Connect to the real backend
- Hook up the ML predictions and accuracy numbers
- Add precipitation once we settle on a source
- Deploy it (Vercel is the plan)
