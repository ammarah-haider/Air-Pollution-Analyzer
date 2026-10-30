import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import airnow
import history
import main
import nws

# the sample responses from the data team's spec
AIRNOW_MERGED = {
    "timestamp": "2026-10-15T15:00:00-05:00", "reportingAreaName": "Dallas-Fort Worth",
    "pollutants": {"OZONE": {"aqi": 44}, "PM2.5": {"aqi": 44}, "PM10": {"aqi": 22}},
}

# what the plain AirNow API sends back
AIRNOW_LIST = [
    {"DateObserved": "2026-10-15 ", "HourObserved": 15, "LocalTimeZone": "CDT",
     "ReportingArea": "Dallas-Fort Worth", "ParameterName": "O3", "AQI": 44},
    {"DateObserved": "2026-10-15 ", "HourObserved": 15, "LocalTimeZone": "CDT",
     "ReportingArea": "Dallas-Fort Worth", "ParameterName": "PM2.5", "AQI": 44},
    {"DateObserved": "2026-10-15 ", "HourObserved": 15, "LocalTimeZone": "CDT",
     "ReportingArea": "Dallas-Fort Worth", "ParameterName": "PM10", "AQI": -1},
]

NWS_RAW = {"properties": {
    "timestamp": "2026-10-15T21:00:00+00:00", "stationId": "KDFW", "textDescription": "Cloudy",
    "temperature": {"value": 32}, "dewpoint": {"value": 19}, "windDirection": {"value": 100},
    "windSpeed": {"value": 20.376}, "barometricPressure": {"value": 101388.48},
    "relativeHumidity": {"value": 46.178}, "visibility": {"value": 16093.44},
    "heatIndex": {"value": 33.49}, "cloudLayers": [{"base": {"value": 1524}, "amount": "BKN"}],
}}


# Open-Meteo hourly response, trimmed down, times already in Central
HISTORY_RAW = {"hourly": {
    "time": ["2026-10-16T00:00", "2026-10-16T13:00", "2026-10-17T00:00", "2026-10-17T13:00", "2026-10-18T00:00"],
    "us_aqi_pm2_5": [40, 62, 35, None, 51],
    "us_aqi_ozone": [20, 55, 18, 70, 33],
    "us_aqi_pm10": [10, 12, None, None, 15],
}}


def test_airnow_merged_format():
    out = airnow.parse(AIRNOW_MERGED)
    assert (out["ozone_aqi"], out["pm25_aqi"], out["pm10_aqi"]) == (44, 44, 22)


def test_airnow_list_format_and_missing_value():
    out = airnow.parse(AIRNOW_LIST)
    assert out["ozone_aqi"] == 44 and out["pm10_aqi"] is None
    assert out["timestamp"] == "2026-10-15T15:00:00-05:00"


def test_nws_converts_to_central_time():
    out = nws.parse(NWS_RAW)
    assert out["observed_at"] == "2026-10-15T16:00:00-05:00"
    assert out["temperature_c"] == 32 and out["cloud_base_m"] == 1524


def test_dashboard_shape(monkeypatch):
    async def fake_air(): return airnow.parse(AIRNOW_LIST)
    async def fake_wx(): return nws.parse(NWS_RAW)
    monkeypatch.setattr(main, "get_air", fake_air)
    monkeypatch.setattr(main, "get_weather", fake_wx)

    body = TestClient(main.app).get("/dashboard").json()
    assert body["air_quality"]["pm25_aqi"] == 44
    assert body["weather"]["humidity_pct"] == 46.178
    assert body["prediction"] is None


def test_dashboard_survives_one_source_down(monkeypatch):
    async def broken(): raise RuntimeError("down")
    async def fake_wx(): return nws.parse(NWS_RAW)
    monkeypatch.setattr(main, "get_air", broken)
    monkeypatch.setattr(main, "get_weather", fake_wx)

    res = TestClient(main.app).get("/dashboard")
    assert res.status_code == 200
    assert res.json()["air_quality"] is None and res.json()["weather"]["station_id"] == "KDFW"


def test_history_takes_daily_max_and_trims_to_range():
    out = history.parse(HISTORY_RAW, "2026-10-16", "2026-10-17")
    assert out["series"]["PM2.5"] == [{"date": "2026-10-16", "value": 62}, {"date": "2026-10-17", "value": 35}]
    assert out["series"]["OZONE"][-1] == {"date": "2026-10-17", "value": 70}
    assert [p["date"] for p in out["series"]["PM10"]] == ["2026-10-16"]


def test_dashboard_includes_history(monkeypatch):
    async def fake_air(): return airnow.parse(AIRNOW_LIST)
    async def fake_wx(): return nws.parse(NWS_RAW)
    async def fake_hist(start, end): return history.parse(HISTORY_RAW, start.isoformat(), end.isoformat())
    monkeypatch.setattr(main, "get_air", fake_air)
    monkeypatch.setattr(main, "get_weather", fake_wx)
    monkeypatch.setattr(main, "get_history", fake_hist)

    body = TestClient(main.app).get("/dashboard?start=2026-10-16&end=2026-10-18").json()
    assert len(body["historical"]["series"]["PM2.5"]) == 3


# ---- prediction (uses the real model files, fake Open-Meteo data) ----

def fake_open_meteo():
    import math
    from datetime import datetime, timedelta, timezone
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(11 * 24)]
    n = len(times)
    weather = {"time": times,
               "temperature_2m": [70 + 15 * math.sin(i / 3.8) for i in range(n)],
               "relative_humidity_2m": [55] * n, "dew_point_2m": [58] * n, "precipitation": [0] * n,
               "cloud_cover": [30] * n, "pressure_msl": [1015] * n, "wind_speed_10m": [9] * n,
               "wind_direction_10m": [170] * n, "wind_gusts_10m": [18] * n,
               "shortwave_radiation": [max(0, 600 * math.sin(i / 3.8)) for i in range(n)]}
    air = {"time": times[:3 * 24], "pm2_5": [12] * (3 * 24), "ozone": [80] * (3 * 24),
           "nitrogen_dioxide": [10] * (3 * 24), "aerosol_optical_depth": [0.1] * (3 * 24)}
    return {"weather": {"hourly": weather}, "air": {"hourly": air}}


def fake_recent():
    from datetime import datetime, timedelta
    today = datetime.now(main.CENTRAL).date()
    return {str(today - timedelta(days=i)): 50 + i for i in range(8)}


def test_prediction_returns_seven_days():
    import prediction
    out = prediction.build(fake_open_meteo(), fake_recent(), {"ozone_aqi": 44, "pm25_aqi": 60, "pm10_aqi": 22})
    assert len(out["points"]) == 7
    first = out["points"][0]
    assert first["days_ahead"] == 1
    assert first["low"] <= first["value"] <= first["high"]
    assert out["points"][6]["confidence"] == "low"


def test_prediction_needs_seven_days_of_aqi():
    import prediction
    import pytest
    with pytest.raises(ValueError):
        prediction.build(fake_open_meteo(), {}, None)


def test_dashboard_includes_prediction(monkeypatch):
    import prediction

    async def fake_run(air_now=None):
        return prediction.build(fake_open_meteo(), fake_recent(), air_now)

    monkeypatch.setattr(prediction, "run", fake_run)
    main.cache._store.clear()

    async def fake_air():
        return {"area": "Dallas-Fort Worth", "timestamp": "2026-10-15T15:00:00-05:00",
                "ozone_aqi": 44, "pm25_aqi": 44, "pm10_aqi": 22}

    async def boom():
        raise RuntimeError("down")

    monkeypatch.setattr(main, "get_air", fake_air)
    monkeypatch.setattr(main, "get_weather", boom)
    monkeypatch.setattr(main, "get_history", lambda s, e: fake_air())
    body = TestClient(main.app).get("/dashboard").json()
    assert len(body["prediction"]["points"]) == 7
    assert body["weather"] is None


def test_airnow_handles_data_teams_real_sample():
    rows = [
        {"dateObserved": "2026-10 21", "hourObserved": "10:00", "localTimeZone": "CDT",
         "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM2.5", "nowcastAQI": 76},
        {"dateObserved": "2026-10-21", "hourObserved": "10:00", "reportingAreaName": "Dallas-Fort Worth",
         "parameterName": "OZONE", "nowcastAQI": 39},
        {"dateObserved": "2026-10-21", "hourObserved": "10:00", "reportingAreaName": "Dallas-Fort Worth",
         "parameterName": "PM10", "nowcastAQI": 56},
    ]
    out = airnow.parse(rows)
    assert (out["ozone_aqi"], out["pm25_aqi"], out["pm10_aqi"]) == (39, 76, 56)
    assert out["timestamp"].startswith("2026-10-21T10:00")


def test_nws_skips_bad_readings_and_zeroes_missing_rain():
    raw = {"properties": {
        "stationId": "KDFW",
        "temperature": {"value": 30, "qualityControl": "V"},
        "dewpoint": {"value": 99, "qualityControl": "X"},
        "windSpeed": {"value": 10, "qualityControl": "C"},
        "precipitationLast3Hours": {"value": None, "qualityControl": "Z"},
    }}
    out = nws.parse(raw)
    assert out["temperature_c"] == 30
    assert out["dewpoint_c"] is None
    assert out["wind_speed_kmh"] == 10
    assert out["precipitation_3h_mm"] == 0.0


def test_airnow_daily_picks_dfw_and_highest_pollutant():
    rows = [
        {"dateObserved": "2026-10-21", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM2.5", "dailyAQI": 64},
        {"dateObserved": "2026-10-21", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "OZONE", "dailyAQI": 105},
        {"dateObserved": "2026-10-21", "reportingAreaName": "Houston-Galveston-Brazoria", "parameterName": "OZONE", "dailyAQI": 115},
        {"dateObserved": "2026-10-20", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM10", "dailyAQI": 33},
        {"dateObserved": "2026-10-20", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "OZONE", "dailyAQI": 71},
    ]
    assert airnow.parse_daily(rows) == {"2026-10-21": 105, "2026-10-20": 71}


def test_today_comes_from_current_reading_when_daily_is_missing():
    import prediction
    import pandas as pd
    today = pd.Timestamp(datetime.now(main.CENTRAL).date())
    recent = {str((today - pd.Timedelta(days=i)).date()): 40 + i for i in range(1, 7)}
    values = prediction.last_seven(recent, today, {"ozone_aqi": 90, "pm25_aqi": 20}, "AirNow daily AQI")
    assert len(values) == 7
    assert values[-1] == 90
    assert values[-2] == 41


def test_old_nws_reading_is_replaced_by_open_meteo(monkeypatch):
    import openmeteo_weather
    from datetime import timedelta
    main.cache._store.clear()

    old_time = (datetime.now(main.CENTRAL) - timedelta(hours=9)).isoformat()

    async def old_nws():
        return {"properties": {"stationId": "KDFW", "timestamp": old_time,
                               "temperature": {"value": 15, "qualityControl": "V"}}}

    async def fake_open_meteo():
        now = datetime.now(main.CENTRAL).strftime("%Y-%m-%dT%H:00")
        return {"hourly": {"time": [now], "temperature_2m": [24.0], "dew_point_2m": [10.0],
                           "relative_humidity_2m": [40], "surface_pressure": [1000.0],
                           "visibility": [20000], "wind_speed_10m": [12.0],
                           "wind_direction_10m": [180], "precipitation": [0]}}

    monkeypatch.setattr(nws, "fetch_raw", old_nws)
    monkeypatch.setattr(openmeteo_weather, "fetch_raw", fake_open_meteo)

    import asyncio
    data = asyncio.run(main.get_weather())
    assert data["station_id"] == "Open-Meteo"
    assert data["temperature_c"] == 24.0
    assert data["pressure_pa"] == 100000.0


def test_fresh_nws_reading_is_kept(monkeypatch):
    from datetime import timedelta
    main.cache._store.clear()
    fresh = (datetime.now(main.CENTRAL) - timedelta(minutes=30)).isoformat()

    async def fresh_nws():
        return {"properties": {"stationId": "KDFW", "timestamp": fresh,
                               "temperature": {"value": 22, "qualityControl": "V"}}}

    monkeypatch.setattr(nws, "fetch_raw", fresh_nws)
    import asyncio
    data = asyncio.run(main.get_weather())
    assert data["source"] == "NWS"
    assert data["temperature_c"] == 22


def test_airnow_daily_keeps_each_pollutant_apart():
    rows = [
        {"dateObserved": "2026-10-21", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM2.5", "dailyAQI": 64},
        {"dateObserved": "2026-10-21", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "OZONE", "dailyAQI": 105},
        {"dateObserved": "2026-10-21", "reportingAreaName": "Houston-Galveston-Brazoria", "parameterName": "OZONE", "dailyAQI": 115},
        {"dateObserved": "2026-10-20", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM10", "dailyAQI": 33},
    ]
    out = airnow.parse_daily_by_pollutant(rows)
    assert out["OZONE"] == {"2026-10-21": 105}
    assert out["PM2.5"] == {"2026-10-21": 64}
    assert out["PM10"] == {"2026-10-20": 33}


def test_history_uses_airnow_and_lines_up_the_days(monkeypatch):
    from datetime import date
    import asyncio
    main.cache._store.clear()

    async def fake_daily(start, end):
        rows = []
        for day in ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]:
            rows.append({"dateObserved": day, "reportingAreaName": "Dallas-Fort Worth", "parameterName": "OZONE", "dailyAQI": 50})
        rows.append({"dateObserved": "2026-10-19", "reportingAreaName": "Dallas-Fort Worth", "parameterName": "PM2.5", "dailyAQI": 60})
        return rows

    monkeypatch.setattr(main.airnow, "fetch_daily_raw", fake_daily)
    out = asyncio.run(main.get_history(date(2026, 10, 18), date(2026, 10, 21)))
    assert out["source"].startswith("EPA AirNow")
    assert len(out["series"]["OZONE"]) == 4
    assert len(out["series"]["PM2.5"]) == 4
    assert out["series"]["PM2.5"][0]["value"] is None
    assert out["series"]["PM2.5"][1]["value"] == 60


def test_history_falls_back_to_open_meteo_when_airnow_fails(monkeypatch):
    from datetime import date
    import asyncio
    main.cache._store.clear()

    async def broken(start, end):
        raise RuntimeError("airnow down")

    async def fake_raw(days):
        return {"hourly": {"time": ["2026-10-20T01:00", "2026-10-21T01:00"],
                           "us_aqi_pm2_5": [40, 45], "us_aqi_ozone": [30, 35], "us_aqi_pm10": [10, 12]}}

    monkeypatch.setattr(main.airnow, "fetch_daily_raw", broken)
    monkeypatch.setattr(main.history, "fetch_raw", fake_raw)
    out = asyncio.run(main.get_history(date(2026, 10, 20), date(2026, 10, 21)))
    assert out["source"].startswith("Open-Meteo")
    assert out["series"]["PM2.5"][1]["value"] == 45

