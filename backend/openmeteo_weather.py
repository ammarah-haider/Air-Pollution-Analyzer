from datetime import datetime

import httpx

URL = "https://api.open-meteo.com/v1/forecast"
LAT, LON = 32.8998, -97.0403  # dfw airport

HOURLY = ("temperature_2m,relative_humidity_2m,dew_point_2m,surface_pressure,"
          "visibility,wind_speed_10m,wind_direction_10m,precipitation")


async def fetch_raw():
    params = {
        "latitude": LAT,
        "longitude": LON,
        "hourly": HOURLY,
        "past_days": 1,
        "forecast_days": 1,
        "timezone": "America/Chicago",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(URL, params=params)
    response.raise_for_status()
    return response.json()


def parse(raw, now):
    hourly = raw["hourly"]
    times = hourly["time"]

    # find the hour that matches right now
    wanted = now.strftime("%Y-%m-%dT%H:00")
    spot = None
    for i in range(len(times)):
        if times[i] == wanted:
            spot = i
    if spot is None:
        raise ValueError("Open-Meteo has no row for " + wanted)

    pressure_hpa = hourly["surface_pressure"][spot]
    pressure_pa = None
    if pressure_hpa is not None:
        pressure_pa = pressure_hpa * 100

    observed = datetime.strptime(times[spot], "%Y-%m-%dT%H:%M").replace(tzinfo=now.tzinfo)

    # nws stops at 10 miles, so do the same
    visibility = hourly["visibility"][spot]
    if visibility is not None and visibility > 16093.44:
        visibility = 16093.44

    return {
        "source": "Open-Meteo",
        "station_id": "Open-Meteo",
        "observed_at": observed.isoformat(),
        "weather_condition": None,
        "temperature_c": hourly["temperature_2m"][spot],
        "dewpoint_c": hourly["dew_point_2m"][spot],
        "humidity_pct": hourly["relative_humidity_2m"][spot],
        "wind_speed_kmh": hourly["wind_speed_10m"][spot],
        "wind_direction_deg": hourly["wind_direction_10m"][spot],
        "pressure_pa": pressure_pa,
        "visibility_m": visibility,
        "heat_index_c": None,
        "cloud_base_m": None,
        "precipitation_3h_mm": 0.0,
    }
