import os
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

AIRNOW_URL = "https://www.airnowapi.org/aq/observation/current/racode/"
HISTORY_URL = "https://www.airnowapi.org/aq/observation/historical/state/"
ZIP_URL = "https://www.airnowapi.org/aq/observation/zipCode/current/"
AREA_CODE = "tx004"  # dallas fort worth
ZIP_CODE = "75261"   # dfw airport
CENTRAL = ZoneInfo("America/Chicago")

POLLUTANT_KEYS = {
    "OZONE": "ozone_aqi",
    "O3": "ozone_aqi",
    "PM2.5": "pm25_aqi",
    "PM10": "pm10_aqi",
}


async def fetch_raw():
    key = os.getenv("AIRNOW_API_KEY")
    if not key:
        raise RuntimeError("AIRNOW_API_KEY is missing. Add it to your .env file.")

    params = {"format": "application/json", "reportingAreaCode": AREA_CODE, "API_KEY": key}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(AIRNOW_URL, params=params)

        # some keys cant use this route, try zip code
        if response.status_code in (401, 403, 404):
            zip_params = {"format": "application/json", "zipCode": ZIP_CODE, "distance": 25, "API_KEY": key}
            response = await client.get(ZIP_URL, params=zip_params)
    response.raise_for_status()
    return response.json()


def _pick(row, *names):
    for name in names:
        if name in row and row[name] is not None:
            return row[name]
    return None


def _to_aqi(value):
    # -1 means no reading
    if value is None:
        return None
    value = int(value)
    return value if value >= 0 else None


def _local_iso(date_text, hour):
    # sample had a space instead of a dash once
    cleaned = date_text.strip().replace(" ", "-")
    try:
        when = datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        return None
    return when.replace(hour=hour, tzinfo=CENTRAL).isoformat()


def parse(raw):
    result = {"timestamp": None, "area": "Dallas-Fort Worth",
              "ozone_aqi": None, "pm25_aqi": None, "pm10_aqi": None}

    if isinstance(raw, dict) and "pollutants" in raw:
        result["timestamp"] = raw.get("timestamp")
        result["area"] = raw.get("reportingAreaName") or result["area"]
        for name, item in raw["pollutants"].items():
            field = POLLUTANT_KEYS.get(name.upper())
            if field:
                result[field] = _to_aqi(item.get("aqi"))
        return result

    # normal airnow format, one row per pollutant
    rows = raw if isinstance(raw, list) else [raw]
    for row in rows:
        name = _pick(row, "parameterName", "ParameterName")
        field = POLLUTANT_KEYS.get(str(name).upper())
        if not field:
            continue
        result[field] = _to_aqi(_pick(row, "nowcastAQI", "AQI", "aqi"))

        date_text = _pick(row, "dateObserved", "DateObserved")
        hour = _pick(row, "hourObserved", "HourObserved")
        if date_text and hour is not None and not result["timestamp"]:
            result["timestamp"] = _local_iso(date_text, int(str(hour).split(":")[0]))
        result["area"] = _pick(row, "reportingAreaName", "ReportingArea") or result["area"]
    return result


async def fetch_daily_raw(start, end):
    # sends all of texas, parse_daily keeps dfw
    key = os.getenv("AIRNOW_API_KEY")
    if not key:
        raise RuntimeError("AIRNOW_API_KEY is missing. Add it to your .env file.")

    params = {"format": "application/json", "stateCode": "TX",
              "startDate": start, "endDate": end, "API_KEY": key}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(HISTORY_URL, params=params)
    response.raise_for_status()
    return response.json()


def parse_daily(rows):
    # highest pollutant per day
    highs = {}
    for row in rows:
        if row.get("reportingAreaName") != "Dallas-Fort Worth":
            continue
        aqi = row.get("dailyAQI")
        day = row.get("dateObserved")
        if aqi is None or aqi < 0 or not day:
            continue
        if day not in highs or aqi > highs[day]:
            highs[day] = aqi
    return highs
