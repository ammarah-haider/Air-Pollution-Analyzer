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

History comes from AirNow's daily data for Dallas-Fort Worth, one number per pollutant per day. Days with no reading show up as empty so the lines on the chart still match up. If AirNow is down or has too many empty days, it uses Open-Meteo instead, which is a modeled estimate and can read higher than AirNow in summer. The dashboard says which one it used under the chart.

`/dashboard` includes the prediction and the validation. `validation` comes from `ml/walk_forward_predictions_2025.csv` (the ML team's test results), next-day forecasts only. It sends the last 30 days of the test year for the chart, plus MAE and RMSE for the whole year and the "tomorrow = today" baseline. You can also get it alone at `GET /validation`. If one source is down, the others still come through.

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

- Retrain the model with 2022 and 2023 data, and swap in the new files

## Prediction (ML model)

`GET /prediction` (also inside `/dashboard`) returns the next 7 days of predicted AQI from the ML team's LightGBM models.

- The model files are in `backend/ml/lgbm_model/` (7 models, one for each day ahead, plus `features.json` with the 82 inputs in order). Don't edit them; ask the ML team and drop in the new files.
- `prediction.py` pulls the last 24 hours of Open-Meteo weather and air quality, takes the average of each column (that is how the model was trained), adds the Dallas County census numbers (`census_2025.json`), and calls `predict_week()`.
- Empty columns become 0, same as in training.
- The likely range on each day is just the model's typical miss from the ML team's test (about 8 AQI on day 1, 12 to 15 after that). It is not a statistical interval.
- Days 4 to 7 are marked `confidence: "low"`.
- This model does not use today's AQI, so AirNow is not needed for the prediction anymore.
- The model was trained on Open-Meteo's own AQI number, not the EPA/AirNow one, so it can be a bit different from the AirNow numbers on the site.
- The first call is slower (two Open-Meteo requests plus loading the models). Results are cached for an hour.
- Needs `pip install -r requirements.txt` again (adds lightgbm, removes xgboost and scikit-learn).

## Notes from the data team

- AirNow: tries the reporting area route (`tx004`) first, and if the key isn't allowed on it (401, 403 or 404) it falls back to the ZIP 75261 route.
- NWS: any reading with `qualityControl` "X" is left out. "V" and "C" are fine to show.
- Rain in the last 3 hours (`precipitation_3h_mm`) is 0.0 when it's missing or flagged "Z".
