#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from time import sleep

import pandas as pd
import yfinance as yf


@dataclass(frozen=True)
class Metal:
    name: str
    ticker: str
    csv_path: Path


CSV_COLUMNS = ["Price", "Close", "High", "Low", "Open", "Volume"]


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()

def _resolve_dataset_path(default_relative: str) -> Path:
    """
    Resolve dataset paths robustly for Docker binds.

    Typical expected usage:
    - CWD == repo root: datasets/gold.csv exists

    But if the user mounted the parent directory (e.g. -v "$PWD/..":/work -w /work),
    then the repo might live at /work/debase and the datasets at /work/debase/datasets.
    This resolver checks:
    - ./<default_relative>
    - ./*/<default_relative> (one directory below)
    """
    p = Path(default_relative)
    if p.is_absolute():
        return p

    cwd = Path.cwd()
    direct = cwd / p
    if direct.exists():
        return direct

    # one-level search (fast)
    for child in cwd.iterdir():
        if not child.is_dir():
            continue
        candidate = child / p
        if candidate.exists():
            return candidate

    # Fall back to the direct path even if missing; caller can decide what to do.
    return direct


def _read_last_date(csv_path: Path) -> date | None:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return None

    df = pd.read_csv(csv_path, usecols=["Price"])
    if df.empty:
        return None

    parsed = pd.to_datetime(df["Price"], errors="coerce", utc=True)
    parsed = parsed.dropna()
    if parsed.empty:
        return None

    return parsed.max().date()


def _download_yahoo_daily(ticker: str, start_inclusive: date, end_inclusive: date) -> pd.DataFrame:
    # yfinance end is exclusive
    end_exclusive = end_inclusive + timedelta(days=1)

    df: pd.DataFrame | None = None
    for attempt in range(1, 4):
        try:
            df = yf.download(
                ticker,
                start=start_inclusive.isoformat(),
                end=end_exclusive.isoformat(),
                interval="1d",
                auto_adjust=False,
                actions=False,
                progress=False,
                threads=False,
            )
            break
        except Exception as e:
            if attempt == 3:
                print(f"[yahoo:{ticker}] download failed after {attempt} attempts: {e}")
                return pd.DataFrame(columns=CSV_COLUMNS)
            sleep(1.5 * attempt)

    if df is None or df.empty:
        return pd.DataFrame(columns=CSV_COLUMNS)

    # yfinance can return a MultiIndex even for a single ticker:
    # e.g. ('Close', 'GC=F') instead of 'Close'
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Make reset_index() produce a predictable date column
    if getattr(df.index, "name", None) is None:
        df.index.name = "Date"
    df = df.reset_index()
    # Common fallback if index name wasn't preserved for any reason
    if "Date" not in df.columns and "index" in df.columns:
        df = df.rename(columns={"index": "Date"})
    if "Date" not in df.columns:
        # Don't crash the whole run for a weird response; just skip.
        print(f"[yahoo:{ticker}] unexpected columns (skipping): {list(df.columns)}")
        return pd.DataFrame(columns=CSV_COLUMNS)

    df["Date"] = pd.to_datetime(df["Date"], errors="coerce", utc=True)
    df = df.dropna(subset=["Date"])
    df["Price"] = df["Date"].dt.date.astype(str)

    # Align to repo's CSV schema
    out = pd.DataFrame(
        {
            "Price": df["Price"],
            "Close": df.get("Close"),
            "High": df.get("High"),
            "Low": df.get("Low"),
            "Open": df.get("Open"),
            "Volume": df.get("Volume"),
        }
    )

    # Drop rows that are all-NaN except the date
    value_cols = [c for c in out.columns if c != "Price"]
    out = out.dropna(subset=value_cols, how="all")

    return out[CSV_COLUMNS]


def _merge_append(existing_csv: Path, new_rows: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    if existing_csv.exists() and existing_csv.stat().st_size > 0:
        existing = pd.read_csv(existing_csv)
    else:
        existing = pd.DataFrame(columns=CSV_COLUMNS)

    if existing.empty:
        merged = new_rows.copy()
    else:
        # Ensure schema (some older files might miss columns)
        for col in CSV_COLUMNS:
            if col not in existing.columns:
                existing[col] = pd.NA
        merged = pd.concat([existing[CSV_COLUMNS], new_rows[CSV_COLUMNS]], ignore_index=True)

    before = len(merged)
    merged["Price"] = merged["Price"].astype(str)
    merged = merged.drop_duplicates(subset=["Price"], keep="last")
    merged["__dt__"] = pd.to_datetime(merged["Price"], errors="coerce", utc=True)
    merged = merged.dropna(subset=["__dt__"]).sort_values("__dt__").drop(columns=["__dt__"])
    after = len(merged)

    # return merged + number of unique rows that survived de-dupe (best-effort)
    return merged[CSV_COLUMNS], after


def _write_csv(csv_path: Path, df: pd.DataFrame) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)


def update_metal(metal: Metal, end: date, dry_run: bool) -> None:
    if not metal.csv_path.exists():
        print(
            f"[{metal.name}] WARNING: {metal.csv_path} not found "
            f"(CWD={Path.cwd()}; are you mounting the repo root into /work?)"
        )

    last = _read_last_date(metal.csv_path)
    if last is None:
        # If file is missing/empty, pull from the earliest date already used in your datasets.
        start = date(2001, 1, 1)
    else:
        start = last + timedelta(days=1)

    if start > end:
        print(f"[{metal.name}] up to date (last={last})")
        return

    print(f"[{metal.name}] downloading {metal.ticker} from {start} to {end} into {metal.csv_path}")
    new_rows = _download_yahoo_daily(metal.ticker, start_inclusive=start, end_inclusive=end)
    if new_rows.empty:
        print(f"[{metal.name}] no new rows returned")
        return

    merged, _ = _merge_append(metal.csv_path, new_rows)
    merged_dates = pd.to_datetime(merged["Price"], errors="coerce").dt.date
    if last is None:
        added = len(merged)
    else:
        added = int((merged_dates > last).sum())

    if dry_run:
        print(f"[{metal.name}] dry-run: would write {len(merged)} rows (estimated added={added})")
        return

    _write_csv(metal.csv_path, merged)
    new_last = _read_last_date(metal.csv_path)
    print(f"[{metal.name}] wrote {len(merged)} rows (added~{added}), new last={new_last}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Update datasets/gold.csv and datasets/silver.csv from Yahoo Finance.")
    parser.add_argument("--gold-path", default="datasets/gold.csv", help="Path to gold CSV (default: datasets/gold.csv)")
    parser.add_argument("--silver-path", default="datasets/silver.csv", help="Path to silver CSV (default: datasets/silver.csv)")
    parser.add_argument("--end", default=None, help="End date (YYYY-MM-DD). Default: today (UTC).")
    parser.add_argument("--dry-run", action="store_true", help="Download and merge in-memory without writing files.")
    parser.add_argument("--debug", action="store_true", help="Print debug info about Yahoo responses.")
    args = parser.parse_args()

    end = _utc_today() if args.end is None else datetime.strptime(args.end, "%Y-%m-%d").date()

    gold_path = _resolve_dataset_path(args.gold_path)
    silver_path = _resolve_dataset_path(args.silver_path)
    gold = Metal(name="gold", ticker="GC=F", csv_path=gold_path)
    silver = Metal(name="silver", ticker="SI=F", csv_path=silver_path)

    if args.debug:
        # Keep yfinance's own logging quiet; we print our own signals.
        print(f"[debug] cwd={Path.cwd()}")
        print(f"[debug] gold_path={gold.csv_path} exists={gold.csv_path.exists()}")
        print(f"[debug] silver_path={silver.csv_path} exists={silver.csv_path.exists()}")

    update_metal(gold, end=end, dry_run=args.dry_run)
    update_metal(silver, end=end, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

