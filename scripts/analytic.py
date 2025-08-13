# para rodar:
#  python3 scripts/analytic.py
import pandas as pd

def analyze_crypto_aths(btc_data_path, eth_data_path, xmr_data_path):
    """
    Analyses Bitcoin, Ethereum, and Monero All-Time Highs (ATHs) since November 2021.

    Args:
        btc_data_path (str): Path to the Bitcoin data file (CSV).
        eth_data_path (str): Path to the Ethereum data file (CSV).
        xmr_data_path (str): Path to the Monero data file (CSV).

    Returns:
        pd.DataFrame: A DataFrame with ATH dates, the coins that made ATHs, and
                      the corresponding prices of all three coins.
        dict: A dictionary containing the count of ATHs for each coin.
        dict: A dictionary with the ATHs of each coin before the analysis start date.
    """
    try:
        df_btc = pd.read_csv(btc_data_path, parse_dates=['Start']).drop_duplicates(subset='Start', keep='last').set_index('Start').sort_index()
        df_eth = pd.read_csv(eth_data_path, parse_dates=['Start']).drop_duplicates(subset='Start', keep='last').set_index('Start').sort_index()
        df_xmr = pd.read_csv(xmr_data_path, parse_dates=['Start']).drop_duplicates(subset='Start', keep='last').set_index('Start').sort_index()
    except FileNotFoundError as e:
        print(f"Erro: Arquivo não encontrado - {e}")
        return None, None, None
    except Exception as e:
        print(f"Erro ao carregar dados: {e}")
        return None, None, None

    start_date = pd.to_datetime('2021-11-01')

    # Find ATHs before the start date
    df_btc_pre_nov = df_btc[df_btc.index < start_date]
    df_eth_pre_nov = df_eth[df_eth.index < start_date]
    df_xmr_pre_nov = df_xmr[df_xmr.index < start_date]

    pre_ath_values = {
        'BTC': df_btc_pre_nov['Close'].max() if not df_btc_pre_nov.empty else None,
        'ETH': df_eth_pre_nov['Close'].max() if not df_eth_pre_nov.empty else None,
        'XMR': df_xmr_pre_nov['Close'].max() if not df_xmr_pre_nov.empty else None
    }
    
    # Calculate cumulative max from the beginning of the entire dataset
    df_btc['is_ath'] = df_btc['Close'] == df_btc['Close'].cummax()
    df_eth['is_ath'] = df_eth['Close'] == df_eth['Close'].cummax()
    df_xmr['is_ath'] = df_xmr['Close'] == df_xmr['Close'].cummax()
    
    # Filter the ATH dates to only include those that occurred on or after the start_date
    btc_ath_dates = df_btc[df_btc['is_ath'] & (df_btc.index >= start_date)].index.tolist()
    eth_ath_dates = df_eth[df_eth['is_ath'] & (df_eth.index >= start_date)].index.tolist()
    xmr_ath_dates = df_xmr[df_xmr['is_ath'] & (df_xmr.index >= start_date)].index.tolist()

    all_ath_dates = sorted(set(btc_ath_dates + eth_ath_dates + xmr_ath_dates))
    
    if not all_ath_dates:
        print("Nenhum novo ATH encontrado para Bitcoin, Ethereum ou Monero desde Novembro de 2021.")
        return pd.DataFrame(), {}, pre_ath_values

    result_data = []
    for date in all_ath_dates:
        ath_coins = []
        if date in btc_ath_dates:
            ath_coins.append('BTC')
        if date in eth_ath_dates:
            ath_coins.append('ETH')
        if date in xmr_ath_dates:
            ath_coins.append('XMR')

        row = {
            'Date': date,
            'ATH_Coins': ', '.join(ath_coins),
            'BTC_Price': df_btc.loc[date, 'Close'] if date in df_btc.index else None,
            'ETH_Price': df_eth.loc[date, 'Close'] if date in df_eth.index else None,
            'XMR_Price': df_xmr.loc[date, 'Close'] if date in df_xmr.index else None
        }
        result_data.append(row)

    df_result = pd.DataFrame(result_data)
    
    ath_counts = {
        'BTC': len(btc_ath_dates),
        'ETH': len(eth_ath_dates),
        'XMR': len(xmr_ath_dates)
    }

    return df_result, ath_counts, pre_ath_values

if __name__ == '__main__':
    BTC_DATA_FILE = 'datasets/bitcoin_2010-07-17_2025-07-25.csv'
    ETH_DATA_FILE = 'datasets/ethereum_2015-08-07_2025-07-25.csv'
    XMR_DATA_FILE = 'datasets/monero_2014-05-21_2025-07-25.csv'

    result_df, ath_counts, pre_ath_values = analyze_crypto_aths(BTC_DATA_FILE, ETH_DATA_FILE, XMR_DATA_FILE)

    if result_df is not None:
        print("\n--- ATHs de Bitcoin, Ethereum e Monero Antes de Novembro de 2021 ---")
        for coin, price in pre_ath_values.items():
            if price is not None:
                print(f"ATH para {coin} (antes de 2021-11-01): {price:.2f}")
            else:
                print(f"ATH para {coin} (antes de 2021-11-01): N/A")

        if not result_df.empty:
            print("\n--- ATHs de Bitcoin, Ethereum e Monero desde Novembro de 2021 ---")
            
            df_display = result_df.copy()
            numeric_cols = ['BTC_Price', 'ETH_Price', 'XMR_Price']
            for col in numeric_cols:
                if col in df_display.columns:
                    df_display[col] = df_display[col].apply(lambda x: f"{x:.2f}" if pd.notnull(x) else "N/A")
            
            print(df_display.to_string(index=False))
            
            print("\n--- Contagem de ATHs desde Novembro de 2021 ---")
            for coin, count in ath_counts.items():
                print(f"ATHs para {coin}: {count}")
            
            print(f"\nResumo final: BTC: {ath_counts['BTC']} | ETH: {ath_counts['ETH']} | XMR: {ath_counts['XMR']}")
            print("\n--- Fim da Análise ---")
        else:
            print("Não houve novos ATHs desde Novembro de 2021.")
    else:
        print("Não foi possível gerar a análise.")