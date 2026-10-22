import httpx

OPEN_METEO_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
DFW_LAT, DFW_LON = 32.8998, -97.0403  # dfw airport
MAX_PAST_DAYS = 92                    # open-meteo limit

FIELDS = {
    "us_aqi_pm2_5": "PM2.5",
    "us_aqi_ozone": "OZONE",
    "us_aqi_pm10": "PM10",
}


async def fetch_raw(days):
    params = {
        "latitude": DFW_LAT,
        "longitude": DFW_LON,
        "hourly": ",".join(FIELDS),
        "past_days": min(max(days, 1), MAX_PAST_DAYS),
        "forecast_days": 1,
        "timezone": "America/Chicago",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
    response.raise_for_status()
    return response.json()


def daily_highs(times, values):
    # highest hour of each day
    highs = {}
    for i in range(len(times)):
        value = values[i]
        if value is None:
            continue
        day = times[i][:10]
        if day not in highs or value > highs[day]:
            highs[day] = value
    return highs


def parse(raw, start=None, end=None):
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    series = {}

    for field in FIELDS:
        name = FIELDS[field]
        highs = daily_highs(times, hourly.get(field, []))

        points = []
        for day in sorted(highs):
            if start is not None and day < start:
                continue
            if end is not None and day > end:
                continue
            points.append({"date": day, "value": round(highs[day])})
        series[name] = points

    return {"source": "Open-Meteo (modeled estimate, not station readings)", "series": series}
