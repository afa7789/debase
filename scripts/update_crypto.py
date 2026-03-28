#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from time import sleep

import pandas as pd
import requests


@dataclass(frozen=True)
class Crypto:
    name: str
    pair: str
    csv_path: Path


CSV_COLUMNS = ["Start", "End", "Open", "High", "Low", "Close", "Volume", "Market Cap"]


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _resolve_dataset_path(default_relative: str) -> Path:
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


def _read_last_date(csv_path: Path) -> date | None:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return None

    df = pd.read_csv(csv_path, usecols=["End"])
    if df.empty:
        return None

    parsed = pd.to_datetime(df["End"], errors="coerce", utc=True)
    parsed = parsed.dropna()
    if parsed.empty:
        return None

    return parsed.max().date()


def _fetch_kraken_ohlc(pair: str, since: int) -> list[dict]:
    url = (
        f"https://api.kraken.com/0/public/OHLC?pair={pair}&interval=1440&since={since}"
    )

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            data = r.json()

            if data.get("error"):
                raise RuntimeError(f"Kraken API error: {data['error']}")

            result = data.get("result", {})
            result_pair = list(result.keys())[0]
            ohlc_data = result[result_pair]

            return [
                {
                    "timestamp": int(row[0]),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "vwap": float(row[5]),
                    "volume": float(row[6]),
                    "count": int(row[7]),
                }
                for row in ohlc_data
            ]
        except Exception as e:
            last_err = e
            if attempt == 3:
                break
            sleep(1.5 * attempt)

    raise RuntimeError(f"Failed to fetch Kraken {pair} after retries: {last_err}")


def _convert_to_csv_format(rows: list[dict]) -> pd.DataFrame:
    out = []
    for row in rows:
        ts = row["timestamp"]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        end_dt = dt + timedelta(days=1)

        out.append(
            {
                "Start": dt.strftime("%Y-%m-%d"),
                "End": end_dt.strftime("%Y-%m-%d"),
                "Open": row["open"],
                "High": row["high"],
                "Low": row["low"],
                "Close": row["close"],
                "Volume": row["volume"],
                "Market Cap": "",
            }
        )
    return pd.DataFrame(out, columns=CSV_COLUMNS)


def _merge_append(
    existing_csv: Path, new_rows: pd.DataFrame
) -> tuple[pd.DataFrame, int]:
    if existing_csv.exists() and existing_csv.stat().st_size > 0:
        existing = pd.read_csv(existing_csv)
    else:
        existing = pd.DataFrame(columns=CSV_COLUMNS)

    if existing.empty:
        merged = new_rows.copy()
    else:
        for col in CSV_COLUMNS:
            if col not in existing.columns:
                existing[col] = pd.NA

        new_dates = set(zip(new_rows["Start"], new_rows["End"]))
        existing = existing[
            ~(
                existing["Start"].isin([s for s, _ in new_dates])
                & existing["End"].isin([e for _, e in new_dates])
            )
        ]

        merged = pd.concat(
            [new_rows[CSV_COLUMNS], existing[CSV_COLUMNS]], ignore_index=True
        )

    before = len(merged)
    merged = merged.drop_duplicates(subset=["Start", "End"], keep="first")
    after = len(merged)

    return merged[CSV_COLUMNS], after


def _write_csv(csv_path: Path, df: pd.DataFrame) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)


def update_crypto(crypto: Crypto, end: date, dry_run: bool, debug: bool) -> None:
    if not crypto.csv_path.exists():
        print(
            f"[{crypto.name}] WARNING: {crypto.csv_path} not found "
            f"(CWD={Path.cwd()}; are you mounting the repo root into /work?)"
        )

    last = _read_last_date(crypto.csv_path)
    if last is None:
        print(
            f"[{crypto.name}] No existing data found, please provide initial CSV manually"
        )
        return

    start_date = last + timedelta(days=1)

    if start_date > end:
        print(f"[{crypto.name}] up to date (last={last})")
        return

    since_ts = int(
        datetime.combine(start_date, datetime.min.time())
        .replace(tzinfo=timezone.utc)
        .timestamp()
    )

    if debug:
        print(f"[debug] fetching {crypto.pair} since {start_date} (ts={since_ts})")

    print(f"[{crypto.name}] downloading {crypto.pair} from {start_date} to {end}")
    rows = _fetch_kraken_ohlc(crypto.pair, since=since_ts)

    if not rows:
        print(f"[{crypto.name}] no new data returned")
        return

    new_df = _convert_to_csv_format(rows)

    merged, _ = _merge_append(crypto.csv_path, new_df)
    merged_dates = pd.to_datetime(merged["Start"], errors="coerce").dt.date
    added = int((merged_dates > last).sum())

    if dry_run:
        print(
            f"[{crypto.name}] dry-run: would write {len(merged)} rows (estimated added={added})"
        )
        return

    _write_csv(crypto.csv_path, merged)
    new_last = _read_last_date(crypto.csv_path)
    print(
        f"[{crypto.name}] wrote {len(merged)} rows (added={added}), new last={new_last}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Update crypto CSVs from Kraken API.")
    parser.add_argument(
        "--btc-path",
        default="datasets/bitcoin_2010-07-17_2025-07-25.csv",
        help="Path to Bitcoin CSV",
    )
    parser.add_argument(
        "--eth-path",
        default="datasets/ethereum_2015-08-07_2025-07-25.csv",
        help="Path to Ethereum CSV",
    )
    parser.add_argument(
        "--xmr-path",
        default="datasets/monero_2014-05-21_2025-07-25.csv",
        help="Path to Monero CSV",
    )
    parser.add_argument(
        "--end", default=None, help="End date (YYYY-MM-DD). Default: today (UTC)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download and merge in-memory without writing files.",
    )
    parser.add_argument("--debug", action="store_true", help="Print debug info.")
    args = parser.parse_args()

    end = (
        _utc_today()
        if args.end is None
        else datetime.strptime(args.end, "%Y-%m-%d").date()
    )

    btc_path = _resolve_dataset_path(args.btc_path)
    eth_path = _resolve_dataset_path(args.eth_path)
    xmr_path = _resolve_dataset_path(args.xmr_path)

    cryptos = [
        Crypto(name="bitcoin", pair="XBTUSD", csv_path=btc_path),
        Crypto(name="ethereum", pair="ETHUSD", csv_path=eth_path),
        Crypto(name="monero", pair="XMRUSD", csv_path=xmr_path),
    ]

    for crypto in cryptos:
        try:
            update_crypto(crypto, end=end, dry_run=args.dry_run, debug=args.debug)
        except Exception as e:
            print(f"[{crypto.name}] ERROR: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
