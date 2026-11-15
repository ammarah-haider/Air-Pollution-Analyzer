import asyncio
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml"))

from features import AIR_VARS, WEATHER_VARS, build_row  # noqa: E402
from predict import predict_week  # noqa: E402

CENTRAL = ZoneInfo("America/Chicago")
LAT, LON = 32.8998, -97.0403  # dfw airport

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# how far off the model was on the ML team's test, per day ahead (average miss, in AQI points)
TYPICAL_MISS = {1: 8, 2: 12, 3: 12, 4: 14, 5: 14, 6: 14, 7: 15}


async def fetch_raw():
    common = {"latitude": LAT, "longitude": LON, "timezone": "UTC",
              "past_days": 2, "forecast_days": 1}
    wx_params = {**common, "hourly": ",".join(WEATHER_VARS),
                 "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
                 "precipitation_unit": "inch", "length_unit": "imperial"}
    aq_params = {**common, "hourly": ",".join(AIR_VARS)}

    async with httpx.AsyncClient(timeout=20) as client:
        wx, aq = await asyncio.gather(
            client.get(FORECAST_URL, params=wx_params),
            client.get(AIR_URL, params=aq_params),
        )
    wx.raise_for_status()
    aq.raise_for_status()
    return {"weather": wx.json(), "air": aq.json()}


def build(raw, air_now=None, now=None):
    # air_now is not used anymore, the model doesnt take today's AQI
    if now is None:
        now = datetime.now(timezone.utc)

    row = build_row(raw["weather"]["hourly"], raw["air"]["hourly"], now)
    today = now.astimezone(CENTRAL).date()
    week = predict_week(row, today)

    points = []
    for day in week:
        miss = TYPICAL_MISS[day["days_ahead"]]
        points.append({
            "date": day["date"],
            "days_ahead": day["days_ahead"],
            "value": round(day["aqi"]),
            "low": max(0, round(day["aqi"] - miss)),
            "high": round(day["aqi"] + miss),
            "category": day["category"],
            "confidence": day["confidence"],
        })
    return {
        "source": "LightGBM model (UTD CS 4485 ML team)",
        "points": points,
    }


async def run(air_now=None):
    raw = await fetch_raw()
    # model is slow, run it in a thread
    return await asyncio.to_thread(build, raw, air_now)
