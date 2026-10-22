# Backend

A small FastAPI service that pulls current air quality (AirNow) and weather (NWS) for Dallas-Fort Worth and sends one clean response to the frontend.

## Setup

```
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then put your AirNow key in .env
uvicorn main:app --reload --port 8000
```

Check that it's alive: http://localhost:8000/health

Then see the combined data: http://localhost:8000/dashboard

The `.env` file has the AirNow key, so it's in `.gitignore`. Never commit it.

## Endpoints

- `GET /health` - is the server up
- `GET /air-quality` - ozone, PM2.5, PM10 AQI
- `GET /weather` - latest KDFW observation
- `GET /historical?start=2026-09-18&end=2026-10-18` - daily AQI for the history chart
- `GET /dashboard` - everything the frontend needs in one response (accepts the same `start` and `end`)

History comes from Open-Meteo's air quality API, which allows the last 92 days and needs no key. It's modeled data, not station readings, so it can read higher than AirNow in summer. The dashboard says so under the chart.

`/dashboard` includes the prediction. `validation` is still `null`, so the frontend shows "not connected yet" for that panel. If one source is down, the others still come through.

## Connecting the frontend

1. Start the backend (above).
2. In `script.js`, set `USE_SAMPLE_DATA = false`. `API_URL` already points at `http://localhost:8000/dashboard`.
3. Serve the frontend with `python -m http.server 5500` from the main folder, and open http://localhost:5500.

CORS is wide open by default for development. When it's deployed, set `CORS_ORIGINS` in the environment to the real frontend URL.

## Things to know

- Results are cached for a few minutes (AirNow updates hourly and limits requests), so a refresh won't always hit the APIs.
- Timestamps are converted to America/Chicago so AirNow and weather line up.
- The AirNow parser accepts both the plain AirNow format and the merged format from the data team's spec. Run it once with the real key and check the field names match.
- NWS needs a real contact in `NWS_USER_AGENT`.

## Tests

```
pytest
```

They use the sample responses from the spec, so no API key or internet is needed.

## Next up

- ML model prediction endpoint once the model's input and output are set
- Deploy

## Prediction (ML model)

`GET /prediction` (also inside `/dashboard`) returns the next 7 days of predicted AQI from the ML team's XGBoost models.

- The model files and their code are in `backend/ml/` (straight from their `ml_eval.zip`). Don't edit them; ask the ML team and drop in the new files.
- `prediction.py` pulls Open-Meteo weather and air quality (°F, mph, inches, as `ml/FEATURE_SPEC.md` says), builds the 34 features, and calls `predict_week()`.
- The likely range on each day is just the model's typical miss from their 2025 test (about 13 AQI on day 1, about 16 after that). It is not a statistical interval.
- Days 4 to 7 are marked `confidence: "low"` because weather forecasts get worse that far out.
- The last 7 daily AQIs come from AirNow's daily route (`fetch_daily_raw` in `airnow.py`, Dallas-Fort Worth only, highest pollutant each day). If that fails, it falls back to Open-Meteo, which runs about 15 points high in summer. The response says which one it used in `aqi_input`. Today's number is the current AirNow reading, since the daily one isn't final until tomorrow.
- The first call is slower (two Open-Meteo requests plus loading the model). Results are cached for an hour.
- Needs `pip install -r requirements.txt` again (adds xgboost, scikit-learn, pandas, numpy).

## Notes from the data team

- AirNow: tries the reporting area route (`tx004`) first, and if the key isn't allowed on it (401, 403 or 404) it falls back to the ZIP 75261 route.
- NWS: any reading with `qualityControl` "X" is left out. "V" and "C" are fine to show.
- Rain in the last 3 hours (`precipitation_3h_mm`) is 0.0 when it's missing or flagged "Z".
