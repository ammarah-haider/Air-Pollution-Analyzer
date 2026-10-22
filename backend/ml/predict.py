"""
what the backend calls

    from predict import predict, predict_week
    predict(features_dict, horizon=1)  -> predicted AQI (float)

features_dict keys = model/model_meta.json "feature_order". easiest way to build
it is features.build_row(), or predict_week() which does it for every day

needs: pip install xgboost pandas numpy
"""

import json
import os
import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from features import FEATURES, build_row

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
_models = {}

AQI_CATS = [(50, "Good"), (100, "Moderate"), (150, "Unhealthy for Sensitive Groups"),
            (200, "Unhealthy"), (300, "Very Unhealthy"), (float("inf"), "Hazardous")]


def _model(h):
    # load each horizon once and keep it in memory
    if h not in _models:
        m = XGBRegressor()
        m.load_model(os.path.join(MODEL_DIR, f"aqi_xgb_h{h}.json"))
        _models[h] = m
    return _models[h]


def category(aqi):
    for top, name in AQI_CATS:
        if aqi <= top:
            return name


def predict(features, horizon=1):
    """features = dict or 1-row dataframe with every name in FEATURES. returns AQI"""
    if horizon not in range(1, 8):
        raise ValueError("horizon must be 1-7")
    x = pd.DataFrame([features]) if isinstance(features, dict) else features
    missing = [f for f in FEATURES if f not in x]
    if missing:
        raise ValueError(f"missing features: {missing}")
    y = float(_model(horizon).predict(x[FEATURES])[0])
    return max(0.0, round(y, 1))


def predict_week(today, forecast_by_day, aqi_last7, today_date, days=7):
    """today = dict of today's daily weather + pollutant values (features.WX + POLL)
    forecast_by_day = list of dicts of daily forecast weather (features.WX), [tomorrow, day 2, ...]
    aqi_last7 = last 7 daily AQIs from AirNow, oldest first, last one = today
    returns list of {date, days_ahead, aqi, category, confidence}"""
    out = []
    for h in range(1, min(days, len(forecast_by_day)) + 1):
        d = pd.Timestamp(today_date) + pd.Timedelta(days=h)
        row = build_row(today, forecast_by_day[h - 1], aqi_last7, d, h)
        aqi = predict(row, h)
        out.append({"date": str(d.date()), "days_ahead": h, "aqi": aqi, "category": category(aqi),
                    "confidence": "normal" if h <= 3 else "low"})
    return out


def model_info():
    return json.load(open(os.path.join(MODEL_DIR, "model_meta.json")))
