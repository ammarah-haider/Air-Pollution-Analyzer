import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import airnow  # noqa: E402  (needs .env loaded first)
import cache   # noqa: E402
import history  # noqa: E402
import nws     # noqa: E402
import prediction  # noqa: E402

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="Air Pollution Analyzer API")

origins = []
for origin in os.getenv("CORS_ORIGINS", "*").split(","):
    origins.append(origin.strip())
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])

# airnow limits requests, so keep results for a while
AIR_TTL = 10 * 60
WEATHER_TTL = 5 * 60
HISTORY_TTL = 60 * 60
PREDICTION_TTL = 60 * 60
CENTRAL = ZoneInfo("America/Chicago")


async def get_air():
    hit = cache.get("air", AIR_TTL)
    if hit:
        return hit
    data = airnow.parse(await airnow.fetch_raw())
    cache.put("air", data)
    return data


async def get_weather():
    hit = cache.get("weather", WEATHER_TTL)
    if hit:
        return hit
    data = nws.parse(await nws.fetch_raw())
    cache.put("weather", data)
    return data


async def get_history(start, end):
    today = datetime.now(CENTRAL).date()
    days = (today - start).days + 1
    key = "history-" + str(days)

    raw = cache.get(key, HISTORY_TTL)
    if raw is None:
        raw = await history.fetch_raw(days)
        cache.put(key, raw)
    return history.parse(raw, start.isoformat(), end.isoformat())


async def get_prediction(air_now=None):
    hit = cache.get("prediction", PREDICTION_TTL)
    if hit:
        return hit
    data = await prediction.run(air_now)
    cache.put("prediction", data)
    return data


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/air-quality")
async def air_quality():
    return await get_air()


@app.get("/weather")
async def weather():
    return await get_weather()


@app.get("/historical")
async def historical(start: date | None = None, end: date | None = None):
    today = datetime.now(CENTRAL).date()
    return await get_history(start or today - timedelta(days=30), end or today)


@app.get("/prediction")
async def predict():
    try:
        air = await get_air()
    except Exception as err:
        log.error("AirNow failed (predicting without it): %s", err)
        air = None
    return await get_prediction(air)


@app.get("/dashboard")
async def dashboard(start: date | None = None, end: date | None = None):
    today = datetime.now(CENTRAL).date()
    start = start or today - timedelta(days=30)
    end = end or today

    air, wx, hist = await asyncio.gather(
        get_air(), get_weather(), get_history(start, end), return_exceptions=True
    )

    if isinstance(air, Exception):
        log.error("AirNow failed: %s", air)
        air = None
    if isinstance(wx, Exception):
        log.error("NWS failed: %s", wx)
        wx = None
    if isinstance(hist, Exception):
        log.error("History failed: %s", hist)
        hist = None

    # model needs air data first
    try:
        pred = await get_prediction(air)
    except Exception as err:
        log.error("Prediction failed: %s", err)
        pred = None

    air_quality = None
    if air:
        air_quality = {
            "ozone_aqi": air["ozone_aqi"],
            "pm25_aqi": air["pm25_aqi"],
            "pm10_aqi": air["pm10_aqi"],
        }

    return {
        "timestamp": (air or {}).get("timestamp") or (wx or {}).get("observed_at"),
        "location": (air or {}).get("area", "Dallas-Fort Worth"),
        "air_quality": air_quality,
        "weather": wx,
        "historical": hist,
        "prediction": pred,
        "validation": None,
    }
