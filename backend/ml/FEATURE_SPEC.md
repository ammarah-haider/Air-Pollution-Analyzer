# Model feature spec (34 features, this exact order)

All values are daily, for a Dallas local day (America/Chicago). Units match Open-Meteo with
`temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`, so pull from Open-Meteo with
those params and no conversion is needed. `features.daily_from_hourly()` turns Open-Meteo hourly data into these daily values.

| # | feature | where it comes from live | unit / how it's computed |
|---|---|---|---|
| 0 | `epa_aqi_today` | AirNow (daily max AQI across pollutants, tx004) | US AQI (today's daily AQI, EPA/AirNow) |
| 1 | `epa_aqi_7day_mean` | AirNow (daily max AQI across pollutants, tx004) | US AQI (mean of the last 7 daily AQIs incl. today) |
| 2 | `temp_max_today` | Open-Meteo forecast API `temperature_2m`, today's 24 hours | °F, daily max of hourly temperature_2m |
| 3 | `temp_mean_today` | Open-Meteo forecast API `temperature_2m`, today's 24 hours | °F, daily mean of hourly temperature_2m |
| 4 | `rh_mean_today` | Open-Meteo forecast API `relative_humidity_2m`, today's 24 hours | %, daily mean of hourly relative_humidity_2m |
| 5 | `dewpt_mean_today` | Open-Meteo forecast API `dew_point_2m`, today's 24 hours | °F, daily mean of hourly dew_point_2m |
| 6 | `wind_spd_mean_today` | Open-Meteo forecast API `wind_speed_10m`, today's 24 hours | mph, daily mean of hourly wind_speed_10m |
| 7 | `gust_max_today` | Open-Meteo forecast API `wind_gusts_10m`, today's 24 hours | mph, daily max of hourly wind_gusts_10m |
| 8 | `precip_sum_today` | Open-Meteo forecast API `precipitation`, today's 24 hours | inch, daily sum of hourly precipitation |
| 9 | `cloud_mean_today` | Open-Meteo forecast API `cloud_cover`, today's 24 hours | %, daily mean of hourly cloud_cover |
| 10 | `sw_rad_sum_today` | Open-Meteo forecast API `shortwave_radiation`, today's 24 hours | W/m² summed over the day's hours of shortwave_radiation |
| 11 | `p_msl_mean_today` | Open-Meteo forecast API `pressure_msl`, today's 24 hours | hPa, daily mean of hourly pressure_msl |
| 12 | `wind_u_today` | Open-Meteo forecast API `wind_speed_10m + wind_direction_10m`, today's 24 hours | mph, daily mean of -wind_speed_10m*sin(wind_direction_10m) |
| 13 | `wind_v_today` | Open-Meteo forecast API `wind_speed_10m + wind_direction_10m`, today's 24 hours | mph, daily mean of -wind_speed_10m*cos(wind_direction_10m) |
| 14 | `pm25_mean_today` | Open-Meteo air quality API `pm2_5`, today | µg/m³, daily mean of hourly pm2_5 |
| 15 | `o3_max_today` | Open-Meteo air quality API `ozone`, today | µg/m³, daily max of hourly ozone |
| 16 | `no2_mean_today` | Open-Meteo air quality API `nitrogen_dioxide`, today | µg/m³, daily mean of hourly nitrogen_dioxide |
| 17 | `aod_mean_today` | Open-Meteo air quality API `aerosol_optical_depth`, today | unitless, daily mean of hourly aerosol_optical_depth |
| 18 | `horizon_days` | computed from the target date / horizon | days ahead, 1-3 |
| 19 | `dow` | computed from the target date / horizon | day of week of the target day, Mon=0 |
| 20 | `doy_sin` | computed from the target date / horizon | sin(2*pi*day_of_year/365.25) of the target day |
| 21 | `doy_cos` | computed from the target date / horizon | cos(2*pi*day_of_year/365.25) of the target day |
| 22 | `temp_max_target` | Open-Meteo forecast API `temperature_2m`, forecast for the target day | °F, daily max of hourly temperature_2m |
| 23 | `temp_mean_target` | Open-Meteo forecast API `temperature_2m`, forecast for the target day | °F, daily mean of hourly temperature_2m |
| 24 | `rh_mean_target` | Open-Meteo forecast API `relative_humidity_2m`, forecast for the target day | %, daily mean of hourly relative_humidity_2m |
| 25 | `dewpt_mean_target` | Open-Meteo forecast API `dew_point_2m`, forecast for the target day | °F, daily mean of hourly dew_point_2m |
| 26 | `wind_spd_mean_target` | Open-Meteo forecast API `wind_speed_10m`, forecast for the target day | mph, daily mean of hourly wind_speed_10m |
| 27 | `gust_max_target` | Open-Meteo forecast API `wind_gusts_10m`, forecast for the target day | mph, daily max of hourly wind_gusts_10m |
| 28 | `precip_sum_target` | Open-Meteo forecast API `precipitation`, forecast for the target day | inch, daily sum of hourly precipitation |
| 29 | `cloud_mean_target` | Open-Meteo forecast API `cloud_cover`, forecast for the target day | %, daily mean of hourly cloud_cover |
| 30 | `sw_rad_sum_target` | Open-Meteo forecast API `shortwave_radiation`, forecast for the target day | W/m² summed over the day's hours of shortwave_radiation |
| 31 | `p_msl_mean_target` | Open-Meteo forecast API `pressure_msl`, forecast for the target day | hPa, daily mean of hourly pressure_msl |
| 32 | `wind_u_target` | Open-Meteo forecast API `wind_speed_10m + wind_direction_10m`, forecast for the target day | mph, daily mean of -wind_speed_10m*sin(wind_direction_10m) |
| 33 | `wind_v_target` | Open-Meteo forecast API `wind_speed_10m + wind_direction_10m`, forecast for the target day | mph, daily mean of -wind_speed_10m*cos(wind_direction_10m) |

## If you use NWS instead of Open-Meteo for anything

- temperature / dew point: °F = °C × 9/5 + 32
- wind speed / gusts: mph = km/h × 0.621371
- precipitation: inch = mm ÷ 25.4
- pressure: hPa = Pa ÷ 100 (NWS barometricPressure is in Pa)
- NWS is one station reading per hour, so you still need the daily max/mean/sum.

I'd use Open-Meteo for all weather inputs (live and forecast) since that's what the model was trained on. Use NWS/AirNow only for display.