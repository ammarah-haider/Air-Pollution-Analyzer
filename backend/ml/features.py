"""
one place that builds the model inputs, used by training AND the backend predict
so the feature names/order/units can never drift between the two

inputs are daily values for a dallas local day (America/Chicago), units match
open-meteo with temperature_unit=fahrenheit, wind_speed_unit=mph, precipitation_unit=inch
"""

import numpy as np
import pandas as pd

# daily weather values, used for "today" (observed) and for the target day (forecast)
WX = ["temp_max", "temp_mean", "rh_mean", "dewpt_mean", "wind_spd_mean", "gust_max",
      "precip_sum", "cloud_mean", "sw_rad_sum", "p_msl_mean", "wind_u", "wind_v"]
# daily pollutant concentrations for today, from open-meteo air quality
POLL = ["pm25_mean", "o3_max", "no2_mean", "aod_mean"]

FEATURES = (["epa_aqi_today", "epa_aqi_7day_mean"]
            + [f"{c}_today" for c in WX + POLL]
            + ["horizon_days", "dow", "doy_sin", "doy_cos"]
            + [f"{c}_target" for c in WX])

UNITS = {
    "epa_aqi_today": "US AQI (today's daily AQI, EPA/AirNow)",
    "epa_aqi_7day_mean": "US AQI (mean of the last 7 daily AQIs incl. today)",
    "temp_max": "°F, daily max of hourly temperature_2m",
    "temp_mean": "°F, daily mean of hourly temperature_2m",
    "rh_mean": "%, daily mean of hourly relative_humidity_2m",
    "dewpt_mean": "°F, daily mean of hourly dew_point_2m",
    "wind_spd_mean": "mph, daily mean of hourly wind_speed_10m",
    "gust_max": "mph, daily max of hourly wind_gusts_10m",
    "precip_sum": "inch, daily sum of hourly precipitation",
    "cloud_mean": "%, daily mean of hourly cloud_cover",
    "sw_rad_sum": "W/m² summed over the day's hours of shortwave_radiation",
    "p_msl_mean": "hPa, daily mean of hourly pressure_msl",
    "wind_u": "mph, daily mean of -wind_speed_10m*sin(wind_direction_10m)",
    "wind_v": "mph, daily mean of -wind_speed_10m*cos(wind_direction_10m)",
    "pm25_mean": "µg/m³, daily mean of hourly pm2_5",
    "o3_max": "µg/m³, daily max of hourly ozone",
    "no2_mean": "µg/m³, daily mean of hourly nitrogen_dioxide",
    "aod_mean": "unitless, daily mean of hourly aerosol_optical_depth",
    "horizon_days": "days ahead, 1-3",
    "dow": "day of week of the target day, Mon=0",
    "doy_sin": "sin(2*pi*day_of_year/365.25) of the target day",
    "doy_cos": "cos(2*pi*day_of_year/365.25) of the target day",
}


def daily_from_hourly(h):
    """h = hourly dataframe with open-meteo column names (not renamed), a 'time' column
    in UTC or local. returns one row per dallas day with the WX + POLL columns"""
    h = h.copy()
    t = pd.to_datetime(h["time"])
    t = t.dt.tz_localize("UTC") if t.dt.tz is None else t
    h["date"] = t.dt.tz_convert("America/Chicago").dt.tz_localize(None).dt.normalize()
    rad = np.deg2rad(h["wind_direction_10m"])
    h["_u"] = -h["wind_speed_10m"] * np.sin(rad)
    h["_v"] = -h["wind_speed_10m"] * np.cos(rad)
    g = h.groupby("date")
    out = pd.DataFrame({
        "temp_max": g["temperature_2m"].max(), "temp_mean": g["temperature_2m"].mean(),
        "rh_mean": g["relative_humidity_2m"].mean(), "dewpt_mean": g["dew_point_2m"].mean(),
        "wind_spd_mean": g["wind_speed_10m"].mean(), "gust_max": g["wind_gusts_10m"].max(),
        "precip_sum": g["precipitation"].sum(), "cloud_mean": g["cloud_cover"].mean(),
        "sw_rad_sum": g["shortwave_radiation"].sum(), "p_msl_mean": g["pressure_msl"].mean(),
        "wind_u": g["_u"].mean(), "wind_v": g["_v"].mean(), "hours": g.size(),
    })
    for raw, col, how in [("pm2_5", "pm25_mean", "mean"), ("ozone", "o3_max", "max"),
                          ("nitrogen_dioxide", "no2_mean", "mean"), ("aerosol_optical_depth", "aod_mean", "mean")]:
        if raw in h:
            out[col] = g[raw].agg(how)
    return out.reset_index()


def build_row(today, target_wx, aqi_last7, target_date, horizon):
    """one model input row. today = dict of WX+POLL for today, target_wx = dict of WX
    forecast for the target day, aqi_last7 = list of the last 7 daily AQIs (oldest first)"""
    target_date = pd.Timestamp(target_date)
    row = {"epa_aqi_today": aqi_last7[-1], "epa_aqi_7day_mean": float(np.mean(aqi_last7))}
    for c in WX + POLL:
        row[f"{c}_today"] = today[c]
    row["horizon_days"] = horizon
    row["dow"] = target_date.dayofweek
    row["doy_sin"] = np.sin(2 * np.pi * target_date.dayofyear / 365.25)
    row["doy_cos"] = np.cos(2 * np.pi * target_date.dayofyear / 365.25)
    for c in WX:
        row[f"{c}_target"] = target_wx[c]
    return pd.DataFrame([row])[FEATURES]


def build_training_table(daily, horizons):
    """daily = one row per day with epa_aqi + WX + POLL. stacks one block per horizon"""
    daily = daily.sort_values("date").reset_index(drop=True)
    blocks = []
    for h in horizons:
        b = pd.DataFrame({"date": daily["date"].shift(-h), "aqi": daily["epa_aqi"].shift(-h)})
        b["epa_aqi_today"] = daily["epa_aqi"]
        b["epa_aqi_7day_mean"] = daily["epa_aqi"].rolling(7).mean()
        for c in WX + POLL:
            b[f"{c}_today"] = daily[c]
        b["horizon_days"] = h
        d = b["date"]
        b["dow"] = d.dt.dayofweek
        b["doy_sin"] = np.sin(2 * np.pi * d.dt.dayofyear / 365.25)
        b["doy_cos"] = np.cos(2 * np.pi * d.dt.dayofyear / 365.25)
        for c in WX:
            b[f"{c}_target"] = daily[c].shift(-h)
        b["persistence"] = daily["epa_aqi"]
        blocks.append(b.dropna())
    return pd.concat(blocks, ignore_index=True)
