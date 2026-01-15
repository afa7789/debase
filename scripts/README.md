# scripts/

This folder contains both the scripts used by the web app and a few standalone scripts/experiments.

## Standalone scripts (not used by `index.html`)

- `update_metals.py`: updates `datasets/gold.csv` (GC=F) and `datasets/silver.csv` (SI=F)
  - Docker: `scripts/Dockerfile.metals`
- `update_cpi.py`: updates `datasets/CPI_U.csv` from BLS and regenerates `datasets/daily_cpi_inflation.csv`
  - Docker: `scripts/Dockerfile.cpi`
- `analytic.py`: small analysis script that prints BTC/ETH/XMR ATH events from the datasets
  - output example: `analytic_ATH_result.txt`
- `SRS_stake.py`: small staking/yield comparison experiment using ETH historical prices
  - output example: `stake_srs_script_result.txt`

For data sourcing and update notes, see `datasets/README.md`.

