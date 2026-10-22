import os
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

NWS_URL = "https://api.weather.gov/stations/KDFW/observations/latest"
CENTRAL = ZoneInfo("America/Chicago")


async def fetch_raw():
    headers = {
        "User-Agent": os.getenv("NWS_USER_AGENT", "(cs4485-capstone-team-t6, team-email@utdallas.edu)"),
        "Accept": "application/geo+json",
    }
    # no require_qc here, it returns readings that are hours old
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(NWS_URL, headers=headers)
    response.raise_for_status()
    return response.json()


def _value(props, key):
    item = props.get(key)
    if not isinstance(item, dict):
        return None
    # X means bad reading
    if item.get("qualityControl") == "X":
        return None
    return item.get("value")


def _rain_mm(props):
    item = props.get("precipitationLast3Hours")
    if not isinstance(item, dict):
        return 0.0
    # missing or Z means no rain
    if item.get("value") is None or item.get("qualityControl") == "Z":
        return 0.0
    return item["value"]


def parse(raw):
    props = raw.get("properties", raw)

    observed = None
    if props.get("timestamp"):
        observed = datetime.fromisoformat(props["timestamp"]).astimezone(CENTRAL).isoformat()

    layers = props.get("cloudLayers") or []
    cloud_base = layers[0].get("base", {}).get("value") if layers else None

    return {
        "source": "NWS",
        "station_id": props.get("stationId") or props.get("station", "KDFW"),
        "observed_at": observed,
        "weather_condition": props.get("textDescription"),
        "temperature_c": _value(props, "temperature"),
        "dewpoint_c": _value(props, "dewpoint"),
        "humidity_pct": _value(props, "relativeHumidity"),
        "wind_speed_kmh": _value(props, "windSpeed"),
        "wind_direction_deg": _value(props, "windDirection"),
        "pressure_pa": _value(props, "barometricPressure"),
        "visibility_m": _value(props, "visibility"),
        "heat_index_c": _value(props, "heatIndex"),
        "cloud_base_m": cloud_base,
        "precipitation_3h_mm": _rain_mm(props),
    }
