import csv
import math
from pathlib import Path

CSV_FILE = Path(__file__).parent / "ml" / "walk_forward_predictions_2025.csv"
SHOW_DAYS = 30

_saved = None


def read_next_day_rows():
    rows = []
    with open(CSV_FILE, newline="") as f:
        for row in csv.DictReader(f):
            if row["days_ahead"] != "1":
                continue
            rows.append({
                "date": row["date"],
                "actual": float(row["actual_aqi"]),
                "predicted": float(row["predicted_aqi"]),
                "baseline": float(row["baseline_aqi"]),
            })
    rows.sort(key=lambda r: r["date"])
    return rows


def build(rows):
    # scores use the whole year, the chart only shows the last month
    model_misses = 0.0
    model_squares = 0.0
    baseline_misses = 0.0
    for r in rows:
        miss = r["predicted"] - r["actual"]
        model_misses += abs(miss)
        model_squares += miss * miss
        baseline_misses += abs(r["baseline"] - r["actual"])
    count = len(rows)

    points = []
    for r in rows[-SHOW_DAYS:]:
        points.append({
            "date": r["date"],
            "actual": round(r["actual"]),
            "predicted": round(r["predicted"]),
            "baseline": round(r["baseline"]),
        })

    return {
        "source": "Walk-forward test on 2025, next-day forecasts",
        "start": points[0]["date"],
        "end": points[-1]["date"],
        "metrics": {
            "mae": round(model_misses / count, 1),
            "rmse": round(math.sqrt(model_squares / count), 1),
            "baseline_mae": round(baseline_misses / count, 1),
            "days": count,
        },
        "points": points,
    }


def get():
    global _saved
    if _saved is None:
        _saved = build(read_next_day_rows())
    return _saved
