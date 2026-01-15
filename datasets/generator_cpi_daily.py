"""
Generate a daily CPI time series from the monthly CPI table.

Input:
- Reads `CPI_U.csv` (monthly CPI values, one row per year with Jan..Dec columns).

Output:
- Writes `daily_cpi_inflation.csv` with columns:
  - timestamp (YYYY-MM-DD)
  - CPI (daily CPI value)
  - daily_multiplicator (day-over-day multiplicative change)

How it works:
- Collects all available monthly CPI points as (month_start_date -> CPI_value).
- Builds a daily series by *linear interpolation* between consecutive monthly points.
  - This also fills missing months automatically: e.g. if Oct is missing but we have Sep and Nov,
    we interpolate Sep -> Nov and generate daily values for all October dates.
- Extends the monthly points with a simple *extrapolation* (constant last monthly delta) so the
  most recent month can still produce daily values even when the next official month isn't
  published yet (e.g. generate December daily values even without Jan).

Notes:
- This produces a smooth approximation between known monthly values; it is not an official CPI.
"""

import pandas as pd
from datetime import datetime, timedelta, timezone

MONTH_COLS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def month_start(year: int, month: int) -> datetime:
    return datetime(year, month, 1)


def add_month(d: datetime) -> datetime:
    if d.month == 12:
        return datetime(d.year + 1, 1, 1)
    return datetime(d.year, d.month + 1, 1)


def interpolate_daily(start_value: float, end_value: float, start_date: datetime, end_date: datetime):
    """
    Linear interpolation from (start_date, start_value) inclusive up to end_date exclusive.
    """
    days = (end_date - start_date).days
    if days <= 0:
        return []
    daily_increment = (end_value - start_value) / days
    out = []
    cur = start_date
    for i in range(days):
        out.append({"timestamp": cur.strftime("%Y-%m-%d"), "CPI": round(start_value + i * daily_increment, 4)})
        cur += timedelta(days=1)
    return out


# Load CPI monthly table
csv_path = "CPI_U.csv"
df = pd.read_csv(csv_path, sep=",")

# Build sorted list of known monthly points (month start -> CPI value)
points: list[tuple[datetime, float]] = []
for _, row in df.iterrows():
    year = int(row["Year"])
    monthly = pd.to_numeric(row[MONTH_COLS], errors="coerce").values
    for m in range(1, 13):
        v = monthly[m - 1]
        if pd.isna(v):
            continue
        points.append((month_start(year, m), float(v)))

points.sort(key=lambda x: x[0])
if not points:
    raise SystemExit("No CPI values found in CPI_U.csv")

# Extend with predicted future months so we can generate "in-between" days
# even when the next month isn't published yet (e.g. generate December without Jan).
today_utc = datetime.now(timezone.utc).date()
target_end = datetime(today_utc.year, today_utc.month, today_utc.day) + timedelta(days=1)  # exclusive

last_dt, last_v = points[-1]
prev_v = points[-2][1] if len(points) >= 2 else last_v
monthly_delta = last_v - prev_v  # naive trend

while add_month(last_dt) < target_end:
    nxt_dt = add_month(last_dt)
    nxt_v = last_v + monthly_delta  # simple extrapolation
    points.append((nxt_dt, nxt_v))
    last_dt, last_v = nxt_dt, nxt_v

# Generate daily series by interpolating across consecutive known/predicted points.
# This also fills missing months (e.g. Sep -> Nov fills all October days).
daily_data = []
for i in range(len(points) - 1):
    dt0, v0 = points[i]
    dt1, v1 = points[i + 1]
    daily_data.extend(interpolate_daily(v0, v1, dt0, dt1))

# Optionally cap at target_end (in case we overshot by adding future months)
daily_df = pd.DataFrame(daily_data)
daily_df = daily_df.drop_duplicates(subset=["timestamp"], keep="last")
daily_df["__dt__"] = pd.to_datetime(daily_df["timestamp"], errors="coerce")
daily_df = daily_df.dropna(subset=["__dt__"]).sort_values("__dt__")
daily_df = daily_df[daily_df["__dt__"] < pd.Timestamp(target_end)]
daily_df = daily_df.drop(columns=["__dt__"]).reset_index(drop=True)

# Calculate daily_multiplicator
daily_df["daily_multiplicator"] = 1.0
for i in range(1, len(daily_df)):
    cpi_n = daily_df.loc[i, "CPI"]
    cpi_n_1 = daily_df.loc[i - 1, "CPI"]
    daily_df.loc[i, "daily_multiplicator"] = round(1 + (cpi_n - cpi_n_1) / cpi_n_1, 6)

# Save
output_path = "daily_cpi_inflation.csv"
daily_df.to_csv(output_path, sep=";", index=False, columns=["timestamp", "CPI", "daily_multiplicator"])

print(daily_df.head(10))