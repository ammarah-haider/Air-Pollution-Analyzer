"""
builds the model input row for the lightgbm models

the model takes the daily average of every open-meteo weather and air quality
column (the same way aleks trained it), plus the census numbers for dallas county
the column order comes from lgbm_model/features.json, so it cant drift
"""

import json
import os

import pandas as pd

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lgbm_model")

# open-meteo weather columns, the names the api uses
WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature",
    "vapour_pressure_deficit", "precipitation", "rain", "snowfall", "weather_code",
    "pressure_msl", "surface_pressure", "cloud_cover", "cloud_cover_low", "cloud_cover_mid",
    "cloud_cover_high", "wind_speed_10m", "wind_speed_100m", "wind_direction_10m",
    "wind_direction_100m", "wind_gusts_10m", "shortwave_radiation", "direct_radiation",
    "diffuse_radiation", "direct_normal_irradiance", "sunshine_duration",
    "et0_fao_evapotranspiration", "soil_moisture_0_to_7cm", "soil_temperature_0_to_7cm",
    "boundary_layer_height", "is_day",
]

# open-meteo air quality columns
AIR_VARS = [
    "pm2_5", "pm10", "ozone", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide",
    "carbon_dioxide", "methane", "dust", "aerosol_optical_depth", "uv_index",
    "uv_index_clear_sky",
]

_info = None
_census = None


def info():
    global _info
    if _info is None:
        with open(os.path.join(MODEL_DIR, "features.json"), encoding="utf-8") as f:
            _info = json.load(f)
    return _info


def census_values():
    # the file is the raw census api answer, first row = names, second row = numbers
    global _census
    if _census is None:
        with open(os.path.join(MODEL_DIR, "census_2025.json"), encoding="utf-8") as f:
            rows = json.load(f)
        names = rows[0]
        numbers = rows[1]
        _census = {}
        for i in range(len(names)):
            if names[i] in ("NAME", "state", "county"):
                continue
            _census["census_" + names[i]] = float(numbers[i])
    return _census


def last_24_hours(weather_hourly, air_hourly, now):
    """the 24 hours up to now, weather and air quality side by side"""
    wx = pd.DataFrame(weather_hourly)
    aq = pd.DataFrame(air_hourly)
    both = wx.merge(aq, on="time", how="left")
    both["time"] = pd.to_datetime(both["time"], utc=True)

    now = pd.Timestamp(now)
    if now.tzinfo is None:
        now = now.tz_localize("UTC")
    now = now.floor("h")

    recent = both[(both["time"] > now - pd.Timedelta(hours=24)) & (both["time"] <= now)]
    if len(recent) < 18:
        raise ValueError("Not enough recent hours of weather, only found " + str(len(recent)))
    return recent


def build_row(weather_hourly, air_hourly, now):
    """returns a list of numbers in the exact order the models want"""
    recent = last_24_hours(weather_hourly, air_hourly, now)
    census = census_values()

    row = []
    for name in info()["feature_columns"]:
        if name.startswith("census_"):
            row.append(census[name])
            continue

        # "temperature_2m (°F)" -> "temperature_2m"
        api_name = name.split(" (")[0]
        value = 0.0
        if api_name in recent:
            avg = recent[api_name].mean()  # skips empty hours
            if pd.notna(avg):
                value = float(avg)
        # empty columns get 0, same as in training
        row.append(value)
    return row
