#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import sleep

import pandas as pd
import requests


MONTH_COLS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CSV_COLUMNS = ["Year", *MONTH_COLS, "HALF1", "HALF2"]

MONTH_NUM_TO_COL = {
    1: "Jan",
    2: "Feb",
    3: "Mar",
    4: "Apr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dec",
}


@dataclass(frozen=True)
class CpiConfig:
    series_id: str
    cpi_csv: Path
    generator_py: Path


def _utc_year() -> int:
    return datetime.now(timezone.utc).year


def _resolve_path(default_relative: str) -> Path:
    """
    Resolve paths robustly for Docker binds.

    Checks:
    - ./<path>
    - ./*/<path>  (one directory below)
    """
    p = Path(default_relative)
    if p.is_absolute():
        return p

    cwd = Path.cwd()
    direct = cwd / p
    if direct.exists():
        return direct

    for child in cwd.iterdir():
        if not child.is_dir():
            continue
        candidate = child / p
        if candidate.exists():
            return candidate

    return direct


def _load_cpi_table(csv_path: Path) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing CPI CSV: {csv_path}")

    # keep_default_na=False so empty cells stay "" (not NaN -> "nan" when cast to str)
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    if "Year" not in df.columns:
        raise ValueError(f"{csv_path} has no 'Year' column")

    # Ensure schema
    for col in CSV_COLUMNS:
        if col not in df.columns:
            df[col] = ""

    df = df[CSV_COLUMNS].copy()
    df["Year"] = pd.to_numeric(df["Year"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["Year"]).copy()
    df["Year"] = df["Year"].astype(int)
    df = df.sort_values("Year").reset_index(drop=True)
    return df


def _find_last_filled_month(df: pd.DataFrame) -> tuple[int, int]:
    """
    Returns (year, month_num) for the latest month that has a numeric CPI value.
    """
    for _, row in df.sort_values("Year", ascending=False).iterrows():
        year = int(row["Year"])
        for month_num in range(12, 0, -1):
            col = MONTH_NUM_TO_COL[month_num]
            v = pd.to_numeric(row[col], errors="coerce")
            if pd.notna(v):
                return year, month_num
    raise ValueError("Could not find any numeric CPI values in CPI_U.csv")


def _find_update_start(df: pd.DataFrame) -> tuple[int, int]:
    """
    Decide the first (year, month) we should try to update.

    Normally we append from the last filled month+1, but the latest year row can
    sometimes contain placeholders (e.g. '-') creating "holes" (missing months)
    even though later months are present. In that case, start at the first hole.
    """
    max_year = int(df["Year"].max())
    row = df[df["Year"] == max_year].iloc[0]

    vals = [pd.to_numeric(row[MONTH_NUM_TO_COL[m]], errors="coerce") for m in range(1, 13)]
    numeric_months = [m for m, v in enumerate(vals, start=1) if pd.notna(v)]
    if not numeric_months:
        return max_year, 1

    last_numeric = max(numeric_months)

    # First hole before the last numeric month (e.g. '-' in Oct but Nov/Dec exist)
    for m in range(1, last_numeric + 1):
        if pd.isna(vals[m - 1]):
            return max_year, m

    # Otherwise, append after the last numeric month (if year incomplete)
    if last_numeric < 12:
        return max_year, last_numeric + 1

    # Full year present: start at next year's Jan
    return max_year + 1, 1

def _bls_fetch_series(series_id: str, start_year: int, end_year: int, debug: bool) -> list[dict]:
    url = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
    payload = {"seriesid": [series_id], "startyear": str(start_year), "endyear": str(end_year)}
    headers = {"Content-Type": "application/json"}

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=20)
            r.raise_for_status()
            data = r.json()
            if debug:
                status = data.get("status")
                print(f"[debug] bls status={status} message={data.get('message')}")
            if data.get("status") != "REQUEST_SUCCEEDED":
                raise RuntimeError(f"BLS API status={data.get('status')} message={data.get('message')}")

            series = data["Results"]["series"][0]
            return series.get("data", [])
        except Exception as e:
            last_err = e
            if attempt == 3:
                break
            sleep(1.5 * attempt)

    raise RuntimeError(f"Failed to fetch BLS CPI series after retries: {last_err}")


def _bls_fetch_series_range(series_id: str, start_year: int, end_year: int, debug: bool) -> list[dict]:
    """
    Fetch BLS data in year chunks (public API can be finicky with large ranges).
    """
    all_rows: list[dict] = []
    chunk = 20
    y = start_year
    while y <= end_year:
        y2 = min(end_year, y + chunk - 1)
        rows = _bls_fetch_series(series_id, start_year=y, end_year=y2, debug=debug)
        all_rows.extend(rows)
        y = y2 + 1
    return all_rows


def _extract_monthly_points(bls_rows: list[dict]) -> list[tuple[int, int, str]]:
    """
    Returns list of (year, month_num, value_str) for M01..M12 rows.
    """
    out: list[tuple[int, int, str]] = []
    for item in bls_rows:
        period = item.get("period", "")
        if not isinstance(period, str) or not period.startswith("M"):
            continue
        if period == "M13":  # annual average
            continue
        try:
            month_num = int(period[1:])
        except Exception:
            continue
        if month_num < 1 or month_num > 12:
            continue
        year = int(item["year"])
        value_str = str(item.get("value", "")).strip()
        # BLS can return placeholders like "-" for unavailable months.
        if pd.isna(pd.to_numeric(value_str, errors="coerce")):
            continue
        out.append((year, month_num, value_str))

    # BLS returns newest-first; we don't rely on order.
    return out


def _ensure_year_row(df: pd.DataFrame, year: int) -> pd.DataFrame:
    if (df["Year"] == year).any():
        return df
    row = {c: "" for c in CSV_COLUMNS}
    row["Year"] = year
    df2 = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    return df2.sort_values("Year").reset_index(drop=True)


def _recalc_halves_for_year(df: pd.DataFrame, year: int) -> None:
    row_idx = df.index[df["Year"] == year]
    if len(row_idx) != 1:
        return
    i = int(row_idx[0])

    def avg_if_full(cols: list[str]) -> str:
        vals = pd.to_numeric(df.loc[i, cols], errors="coerce")
        if vals.isna().any():
            return ""
        return f"{float(vals.mean()):.3f}"

    df.loc[i, "HALF1"] = avg_if_full(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])
    df.loc[i, "HALF2"] = avg_if_full(["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])


def _years_with_missing_months(df: pd.DataFrame) -> set[int]:
    missing: set[int] = set()
    for _, row in df.iterrows():
        y = int(row["Year"])
        vals = pd.to_numeric(row[MONTH_COLS], errors="coerce")
        # missing if any month cell is empty or non-numeric (NaN after coercion)
        # but ignore full missing years (all NaN) if they ever exist
        if vals.isna().any():
            missing.add(y)
    return missing


def update_cpi(
    cfg: CpiConfig,
    end_year: int,
    dry_run: bool,
    debug: bool,
    lookback_years: int,
    overwrite_existing: bool,
) -> None:
    df = _load_cpi_table(cfg.cpi_csv)

    # Normalize: remove any non-numeric placeholders like "-" from numeric fields.
    cleaned_any = False
    for col in [*MONTH_COLS, "HALF1", "HALF2"]:
        s = df[col].astype(str)
        non_empty = s.str.strip() != ""
        non_numeric = pd.to_numeric(s, errors="coerce").isna()
        mask = non_empty & non_numeric
        if mask.any():
            df.loc[mask, col] = ""
            cleaned_any = True

    last_year, last_month = _find_last_filled_month(df)

    # Always refresh a recent window (BLS can publish previously-missing months later),
    # and also revisit any years that still have missing months.
    min_year = int(df["Year"].min())
    max_year = int(df["Year"].max())
    window_start = max(min_year, max_year - max(0, lookback_years))
    missing_years = _years_with_missing_months(df)
    if missing_years:
        window_start = min(window_start, min(missing_years))

    start_year = window_start
    start_month = 1

    if start_year > end_year:
        print(f"[cpi] up to date (last={last_year}-{last_month:02d})")
        return

    if debug:
        print(f"[debug] cpi_csv={cfg.cpi_csv} exists={cfg.cpi_csv.exists()}")
        print(f"[debug] generator_py={cfg.generator_py} exists={cfg.generator_py.exists()}")
        print(f"[debug] updating series={cfg.series_id} from {start_year} to {end_year} (lookback_years={lookback_years})")
        print(f"[debug] overwrite_existing={overwrite_existing} missing_years={sorted(missing_years)}")

    bls_rows = _bls_fetch_series_range(cfg.series_id, start_year=start_year, end_year=end_year, debug=debug)
    points = _extract_monthly_points(bls_rows)

    to_apply = [(y, m, v) for (y, m, v) in points if start_year <= y <= end_year]

    if not to_apply:
        if cleaned_any:
            if dry_run:
                print("[cpi] dry-run: would normalize non-numeric placeholders in CPI_U.csv")
                return
            cfg.cpi_csv.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(cfg.cpi_csv, index=False)
            print(f"[cpi] wrote {cfg.cpi_csv} (normalized placeholders)")
            print(f"[cpi] regenerating daily CPI via {cfg.generator_py.name}")
            subprocess.run([sys.executable, cfg.generator_py.name], cwd=str(cfg.generator_py.parent), check=True)
            return

        print("[cpi] no new monthly points returned (nothing to update)")
        return

    touched_years: set[int] = set()
    changed_cells = 0
    for y, m, v in to_apply:
        df = _ensure_year_row(df, y)
        col = MONTH_NUM_TO_COL[m]
        cur = str(df.loc[df["Year"] == y, col].iloc[0]).strip()
        cur_num = pd.to_numeric(cur, errors="coerce")
        new_num = pd.to_numeric(v, errors="coerce")

        # Decide if we should write:
        # - Always fill blanks/NaNs
        # - If overwrite is enabled, update only if the numeric value differs
        if cur == "" or pd.isna(cur_num):
            should_write = True
        elif overwrite_existing:
            # both numeric -> compare numerically (string formatting can differ)
            should_write = bool(pd.notna(new_num) and float(cur_num) != float(new_num))
        else:
            should_write = False

        if should_write:
            df.loc[df["Year"] == y, col] = str(v)
            touched_years.add(y)
            changed_cells += 1

    for y in sorted(touched_years):
        _recalc_halves_for_year(df, y)

    df = df.sort_values("Year").reset_index(drop=True)

    if dry_run:
        max_year = max(touched_years) if touched_years else last_year
        extra = " + normalize placeholders" if cleaned_any else ""
        print(
            f"[cpi] dry-run: would update years={sorted(touched_years)} "
            f"(latest touched={max_year}), changed_cells={changed_cells}{extra}"
        )
        return

    if not touched_years and not cleaned_any:
        print("[cpi] nothing changed")
        return

    cfg.cpi_csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(cfg.cpi_csv, index=False)
    print(f"[cpi] wrote {cfg.cpi_csv}")

    # Regenerate daily CPI series
    if not cfg.generator_py.exists():
        raise FileNotFoundError(f"Missing generator script: {cfg.generator_py}")
    print(f"[cpi] regenerating daily CPI via {cfg.generator_py.name}")
    subprocess.run([sys.executable, cfg.generator_py.name], cwd=str(cfg.generator_py.parent), check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update CPI_U.csv from BLS and regenerate daily CPI series.")
    parser.add_argument("--series-id", default="CUUR0000SA0", help="BLS series id (default: CUUR0000SA0)")
    parser.add_argument("--cpi-path", default="datasets/CPI_U.csv", help="Path to CPI_U.csv (default: datasets/CPI_U.csv)")
    parser.add_argument(
        "--generator-path",
        default="datasets/generator_cpi_daily.py",
        help="Path to generator script (default: datasets/generator_cpi_daily.py)",
    )
    parser.add_argument("--end-year", type=int, default=None, help="End year (default: current UTC year)")
    parser.add_argument(
        "--lookback-years",
        type=int,
        default=3,
        help="Always refresh this many recent years to catch backfilled/revised months (default: 3)",
    )
    parser.add_argument(
        "--no-overwrite",
        action="store_true",
        help="Do not overwrite existing numeric CPI values; only fill missing/blank months.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch and compute updates without writing files.")
    parser.add_argument("--debug", action="store_true", help="Print debug info.")
    args = parser.parse_args()

    cfg = CpiConfig(
        series_id=args.series_id,
        cpi_csv=_resolve_path(args.cpi_path),
        generator_py=_resolve_path(args.generator_path),
    )
    end_year = _utc_year() if args.end_year is None else int(args.end_year)
    update_cpi(
        cfg,
        end_year=end_year,
        dry_run=args.dry_run,
        debug=args.debug,
        lookback_years=int(args.lookback_years),
        overwrite_existing=not args.no_overwrite,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

