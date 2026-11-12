# Biblioteca de presets · coleta e conversão

Gera o pacote `CubeRemote-Biblioteca-CubeBaby.zip` que o app importa em Memórias > Biblioteca.

1. Coletar (abre as páginas públicas de cube-baby-presets.vercel.app num navegador, uma por vez,
   com pausa entre elas; só o modelo Cube Baby; pode ser interrompido e retomado):
   ```bash
   node tools/biblioteca/coletar.js /tmp/dados.json
   ```
2. Converter (confere modelo e faixas, monta um .json por preset com os 16 bytes da pedaleira,
   pastas por categoria, `indice.csv` e `LEIA-ME.txt`):
   ```bash
   python3 tools/biblioteca/converter.py /tmp/dados.json CubeRemote-Biblioteca-CubeBaby.zip
   ```
A escala do site é a mesma da pedaleira (conferida pelo tamanho das barras de cada valor no site).
Os presets são da comunidade; créditos aos autores indicados em cada arquivo.
