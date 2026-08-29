GRUPOS DE CRESCIMENTO

Atualização de coordenadas do mapa
==================================

Antes de publicar a página, preencha as coordenadas dos endereços no CSV.
Isso permite que os marcadores do mapa apareçam imediatamente, sem consultar
o serviço de localização no navegador.

Pré-requisito: Python 3 instalado.

1. Simular a atualização
-------------------------

Execute o comando abaixo para consultar os endereços ainda sem coordenadas,
mas sem alterar o arquivo:

    python scripts/geocode_csv.py

2. Gravar as coordenadas no CSV
--------------------------------

Depois de conferir a simulação, execute:

    python scripts/geocode_csv.py --write --user-agent "grupos-de-crescimento/1.0 (contato: seu-email@exemplo.com)"

Troque o e-mail pelo contato responsável pela página. O script consulta apenas
registros que possuem Endereço e ainda não têm Latitude e Longitude.

O que o script faz
------------------

- Adiciona as colunas Latitude e Longitude ao arquivo data/grupos.csv, caso
  elas ainda não existam.
- Respeita um intervalo mínimo de 1,1 segundo entre as consultas.
- Cria data/grupos.csv.bak antes de salvar, preservando uma cópia do CSV.
- Mantém coordenadas já preenchidas sem alteração.

Opções úteis
------------

Alterar o caminho do CSV:

    python scripts/geocode_csv.py --csv caminho/para/grupos.csv --write

Não criar o backup (use apenas se necessário):

    python scripts/geocode_csv.py --write --no-backup

Ver todas as opções:

    python scripts/geocode_csv.py --help
