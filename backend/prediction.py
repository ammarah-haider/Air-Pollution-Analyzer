import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml"))

from features import POLL, WX, daily_from_hourly  # noqa: E402
from predict import predict_week  # noqa: E402

import airnow  # noqa: E402
import history  # noqa: E402

CENTRAL = ZoneInfo("America/Chicago")
log = logging.getLogger("uvicorn.error")
LAT, LON = 32.8998, -97.0403  # dfw airport

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_VARS = ("temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,cloud_cover,"
           "pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation")
AQ_VARS = "pm2_5,ozone,nitrogen_dioxide,aerosol_optical_depth"

# how far off the model was in 2025 tests
FIRST_DAY_ERROR = 13
OTHER_DAY_ERROR = 16


async def fetch_raw():
    common = {"latitude": LAT, "longitude": LON, "timezone": "UTC"}
    wx_params = {**common, "hourly": WX_VARS, "past_days": 1, "forecast_days": 9,
                 "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
                 "precipitation_unit": "inch"}
    aq_params = {**common, "hourly": AQ_VARS, "past_days": 1, "forecast_days": 2}

    async with httpx.AsyncClient(timeout=20) as client:
        wx, aq = await asyncio.gather(
            client.get(FORECAST_URL, params=wx_params),
            client.get(AIR_URL, params=aq_params),
        )
    wx.raise_for_status()
    aq.raise_for_status()
    return {"weather": wx.json(), "air": aq.json()}


async def fetch_recent_aqi():
    # airnow first, open-meteo only if airnow fails
    today = datetime.now(CENTRAL).date()
    start = str(today - timedelta(days=7))
    try:
        rows = await airnow.fetch_daily_raw(start, str(today))
        days = airnow.parse_daily(rows)
        if len(days) >= 6:
            return days, "AirNow daily AQI"
    except Exception as err:
        log.warning("AirNow daily history failed, using Open-Meteo instead: %s", err)

    raw = await history.fetch_raw(8)
    series = history.parse(raw)["series"]

    biggest = {}
    for name in series:
        for point in series[name]:
            day = point["date"]
            if day not in biggest or point["value"] > biggest[day]:
                biggest[day] = point["value"]
    return biggest, "Open-Meteo (estimate, runs high in summer)"


def last_seven(recent, today, air_now, source):
    days = []
    for d in pd.date_range(end=today, periods=7):
        days.append(str(d.date()))
    today_key = days[-1]

    todays_reading = None
    if air_now:
        readings = []
        for key in ("ozone_aqi", "pm25_aqi", "pm10_aqi"):
            if air_now.get(key) is not None:
                readings.append(air_now[key])
        if len(readings) > 0:
            todays_reading = max(readings)

    # airnow daily number for today might not be there yet
    if todays_reading is not None:
        if today_key not in recent or source != "AirNow daily AQI":
            recent = dict(recent)
            recent[today_key] = todays_reading

    values = []
    for day in days:
        if day in recent:
            values.append(recent[day])

    if len(values) < 7:
        raise ValueError("Need 7 days of AQI to predict, only found " + str(len(values)))
    return values


def build(raw, recent, air_now=None, source="Open-Meteo"):
    hourly_wx = pd.DataFrame(raw["weather"]["hourly"])
    hourly_aq = pd.DataFrame(raw["air"]["hourly"])
    days = daily_from_hourly(hourly_wx.merge(hourly_aq, on="time", how="left"))
    days = days[days["hours"] >= 18]  # drop partial days

    today = pd.Timestamp(datetime.now(CENTRAL).date())
    today_rows = days[days.date == today]
    if today_rows.empty:
        raise ValueError("No full day of weather found for today")
    t = today_rows.iloc[0]
    future = days[days.date > today].head(7)

    today_values = {}
    for name in WX + POLL:
        today_values[name] = t[name]

    forecast_days = []
    for index, row in future.iterrows():
        one_day = {}
        for name in WX:
            one_day[name] = row[name]
        forecast_days.append(one_day)

    aqi_list = last_seven(recent, today, air_now, source)
    week = predict_week(today_values, forecast_days, aqi_list, today)

    points = []
    for day in week:
        miss = OTHER_DAY_ERROR
        if day["days_ahead"] == 1:
            miss = FIRST_DAY_ERROR
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
        "source": "XGBoost model (UTD CS 4485 ML team)",
        "aqi_input": source,
        "points": points,
    }


async def run(air_now=None):
    raw, (recent, source) = await asyncio.gather(fetch_raw(), fetch_recent_aqi())
    # model is slow, run it in a thread
    return await asyncio.to_thread(build, raw, recent, air_now, source)
