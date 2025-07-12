import pandas as pd
from datetime import datetime, timedelta

# Função para calcular o número de dias entre o 1º dia de dois meses consecutivos
def get_days_in_month(year, month):
    if month == 12:
        next_month = 1
        next_year = year + 1
    else:
        next_month = month + 1
        next_year = year
    start_date = datetime(year, month, 1)
    end_date = datetime(next_year, next_month, 1)
    return (end_date - start_date).days

# Função para interpolar CPI diário entre dois meses
def interpolate_daily_cpi(cpi_start, cpi_end, days):
    daily_increment = (cpi_end - cpi_start) / days
    daily_cpis = []
    for i in range(days):
        cpi = cpi_start + i * daily_increment
        daily_cpis.append(cpi)
    return daily_cpis

# Carregar o CSV
csv_path = "CPI_U.csv"
df = pd.read_csv(csv_path, sep=',')  # Ajuste o separador, se necessário (ex.: sep=';')

# Lista para armazenar os dados diários
daily_data = []

# Iterar sobre cada ano
for _, row in df.iterrows():
    year = int(row['Year'])
    monthly_cpis = row[['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']]
    
    # Converter para float, tratando valores vazios como NaN
    monthly_cpis = pd.to_numeric(monthly_cpis, errors='coerce').values
    
    # Processar apenas meses com dados válidos
    for month in range(1, 13):
        current_cpi = monthly_cpis[month - 1]
        if pd.isna(current_cpi):  # Pular se o CPI atual for NaN
            continue
        
        # Último mês do ano usa o CPI de Jan do próximo ano (se disponível)
        if month == 12:
            if year < df['Year'].max():
                next_cpi = df[df['Year'] == year + 1]['Jan'].iloc[0]
                next_cpi = pd.to_numeric(next_cpi, errors='coerce')
                if pd.isna(next_cpi):  # Pular se o próximo CPI for NaN
                    continue
            else:
                break  # Último ano, último mês: parar
        else:
            next_cpi = monthly_cpis[month]
            if pd.isna(next_cpi):  # Pular se o próximo CPI for NaN
                continue
        
        # Calcular número de dias entre o 1º dia do mês atual e o próximo
        days = get_days_in_month(year, month)
        
        # Interpolar CPIs diários
        daily_cpis = interpolate_daily_cpi(current_cpi, next_cpi, days)
        
        # Criar entradas diárias
        current_date = datetime(year, month, 1)
        for i in range(days):
            daily_data.append({
                'timestamp': current_date.strftime('%Y-%m-%d'),
                'CPI': round(daily_cpis[i], 4)
            })
            current_date += timedelta(days=1)

# Criar DataFrame com os dados diários
daily_df = pd.DataFrame(daily_data)

# Calcular o daily_multiplicator
daily_df['daily_multiplicator'] = 1.0  # Primeiro dia tem multiplicador 1.0
for i in range(1, len(daily_df)):
    cpi_n = daily_df.loc[i, 'CPI']
    cpi_n_1 = daily_df.loc[i - 1, 'CPI']
    daily_df.loc[i, 'daily_multiplicator'] = round(1 + (cpi_n - cpi_n_1) / cpi_n_1, 6)

# Salvar o novo CSV
output_path = "daily_cpi_inflation.csv"  # Ajuste o caminho, se necessário
daily_df.to_csv(output_path, sep=';', index=False, columns=['timestamp', 'CPI', 'daily_multiplicator'])

# Mostrar as primeiras linhas para verificação
print(daily_df.head(10))