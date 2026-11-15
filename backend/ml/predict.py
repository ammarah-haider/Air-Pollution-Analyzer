"""
what the backend calls

    from predict import predict_week
    predict_week(row, today_date)  -> list of 7 days

row = list of numbers from features.build_row()
needs: pip install lightgbm numpy
"""

import os

import numpy as np
import lightgbm as lgb

from features import MODEL_DIR

_models = {}

AQI_CATS = [(50, "Good"), (100, "Moderate"), (150, "Unhealthy for Sensitive Groups"),
            (200, "Unhealthy"), (300, "Very Unhealthy"), (float("inf"), "Hazardous")]


def _model(day):
    # load each day's model once and keep it in memory
    if day not in _models:
        path = os.path.join(MODEL_DIR, "lgbm_model_day_" + str(day) + ".txt")
        _models[day] = lgb.Booster(model_file=path)
    return _models[day]


def category(aqi):
    for top, name in AQI_CATS:
        if aqi <= top:
            return name


def predict(row, day):
    if day not in range(1, 8):
        raise ValueError("day must be 1-7")
    x = np.array([row], dtype=float)
    answer = float(_model(day).predict(x)[0])
    return max(0.0, round(answer, 1))


def predict_week(row, today_date):
    out = []
    for day in range(1, 8):
        date = np.datetime64(today_date, "D") + np.timedelta64(day, "D")
        aqi = predict(row, day)
        confidence = "low"
        if day <= 3:
            confidence = "normal"
        out.append({"date": str(date), "days_ahead": day, "aqi": aqi,
                    "category": category(aqi), "confidence": confidence})
    return out
