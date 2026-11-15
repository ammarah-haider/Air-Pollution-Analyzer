"""
what the backend calls

    from predict import predict_week
    predict_week(row, today_date)  -> list of 7 days

row = list of numbers from features.build_row()

this reads aleks's lightgbm .txt files itself (they are just lists of
decision trees), so the server does not need the lightgbm package
"""

import os

import numpy as np

from features import MODEL_DIR

_models = {}

AQI_CATS = [(50, "Good"), (100, "Moderate"), (150, "Unhealthy for Sensitive Groups"),
            (200, "Unhealthy"), (300, "Very Unhealthy"), (float("inf"), "Hazardous")]


def read_model_file(path):
    """turns one lightgbm .txt file into a list of trees"""
    n_features = 0
    raw_trees = []
    current = None

    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("Tree="):
                current = {}
                raw_trees.append(current)
                continue
            if line.startswith("end of trees"):
                break
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            if current is None:
                if key == "max_feature_idx":
                    n_features = int(value) + 1
            else:
                current[key] = value

    trees = []
    for raw in raw_trees:
        tree = {"leaves": int(raw["num_leaves"]),
                "leaf_value": [float(x) for x in raw["leaf_value"].split()]}
        if tree["leaves"] > 1:
            tree["feature"] = [int(x) for x in raw["split_feature"].split()]
            tree["threshold"] = [float(x) for x in raw["threshold"].split()]
            tree["left"] = [int(x) for x in raw["left_child"].split()]
            tree["right"] = [int(x) for x in raw["right_child"].split()]
        trees.append(tree)
    return {"n_features": n_features, "trees": trees}


def _model(day):
    # load each day's model once and keep it in memory
    if day not in _models:
        path = os.path.join(MODEL_DIR, "lgbm_model_day_" + str(day) + ".txt")
        _models[day] = read_model_file(path)
    return _models[day]


def run_trees(model, row):
    total = 0.0
    for tree in model["trees"]:
        if tree["leaves"] == 1:
            total += tree["leaf_value"][0]
            continue
        node = 0
        while node >= 0:
            value = row[tree["feature"][node]]
            if value != value:
                value = 0.0  # empty becomes 0, same as training
            if value <= tree["threshold"][node]:
                node = tree["left"][node]
            else:
                node = tree["right"][node]
        # a negative number means we hit a leaf, leaf number is -node - 1
        total += tree["leaf_value"][-node - 1]
    return total


def category(aqi):
    for top, name in AQI_CATS:
        if aqi <= top:
            return name


def predict(row, day):
    if day not in range(1, 8):
        raise ValueError("day must be 1-7")
    model = _model(day)
    if len(row) != model["n_features"]:
        raise ValueError("Model wants " + str(model["n_features"]) + " numbers, got " + str(len(row)))
    answer = run_trees(model, row)
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
