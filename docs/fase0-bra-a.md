# Fase 0 — gate de viabilidade — Brasileirão Série A (bra-a)

Gerado em: 2026-07-11T17:17:24.171Z
espnSlug: `bra.1` | fonte canônica: `football-data` (BSA)

## 1-5. Summaries ESPN (3 jogo(s) finalizado(s) encontrados)

### Diagnóstico das requisições ao scoreboard

- Falhas HTTP (não-200 ou erro de rede): 0 / 42
- Nomes de status vistos nos eventos: STATUS_FULL_TIME
- Amostra das últimas requisições:
```
20260711 -> http=200 events=0
20260710 -> http=200 events=0
20260709 -> http=200 events=0
20260708 -> http=200 events=0
20260707 -> http=200 events=0
20260706 -> http=200 events=0
20260705 -> http=200 events=0
20260704 -> http=200 events=0
20260703 -> http=200 events=0
20260702 -> http=200 events=0
20260701 -> http=200 events=0
20260630 -> http=200 events=0
20260629 -> http=200 events=0
20260628 -> http=200 events=0
20260627 -> http=200 events=0
```

### Jogo 401841141 — Red Bull Bragantino 3 x 1 Internacional
- Gols: 4 — Fernando (assist: Lucas Barbosa); Juninho Capixaba (sem assistência marcada); Tiago Volpi (sem assistência marcada); Brian Aguirre (assist: Bruno Henrique)
- Cartões: 6 — Yellow Card: Gustavo Marques; Yellow Card: Alerrando; Yellow Card: Alan Patrick; Yellow Card: Gabriel Mercado; Yellow Card: Rafael Borré; Yellow Card: Juninho Capixaba
- Substituições: 10 — Ramires -> Gustavinho; Rodrigo Villagra -> Brian Aguirre; Alerrando -> Rafael Borré; José Herrera -> Marcelinho Braz; Fernando -> Eduardo Sasha; Bruno Henrique -> Paulinho; Isidro Pitta -> Ignacio Sosa; Juninho Capixaba -> Vanderlan; Johan Carbonero -> Bruno Tabata; Matheus Bahia -> Allex
- Escalação traz número de camisa: sim

### Jogo 401841140 — Palmeiras 1 x 0 Chapecoense
- Gols: 1 — Paulinho (assist: Felipe Anderson)
- Cartões: 3 — Yellow Card: Luis Felipe; Red Card: Allan Andrade; Yellow Card: Italo
- Substituições: 10 — Luis Felipe -> Riquelme; Luighi Hanri -> Paulinho; Lucas Evangelista -> Larson; Giovanni Augusto -> Jean; Marcinho -> Italo; Bruno Leonardo -> Vinicius Eduardo De Almeida Gomes Da Silva; Arthur Gabriel -> Jefté; Felipe Anderson -> Luiz Benedetti; Ênio -> Neto; Everton -> Rubens Tadeu Hartmann Ricoldi
- Escalação traz número de camisa: sim

### Jogo 401841142 — Vasco da Gama 0 x 1 Atlético-MG
- Gols: 1 — Vitor Hugo (assist: Bernard)
- Cartões: 2 — Yellow Card: Cauan Barros; Yellow Card: Iván Román
- Substituições: 8 — Nuno Moreira -> David; Bernard -> Mamady Cissé; Victor Hugo -> Alexsander; Johan Rojas -> Bruno Lopes; José Luis Rodríguez -> Paulo Henrique; Adson -> Lukas Zuccarello; Renan Lodi -> Kauã Pascini; Reiner -> Cauã Soares
- Escalação traz número de camisa: sim

## 6. Roster — football-data squad vs ESPN roster (2 clubes)

### Red Bull Bragantino (espnId=6079)
- 48 atletas no elenco. Número de camisa: 46/48. Nacionalidade: 48/48. Posição: 48/48. Nascimento: 48/48.
- Amostra (1 atleta, campos relevantes):
```json
{
  "fullName": "Tiago Volpi",
  "displayName": "Tiago Volpi",
  "shortName": "T. Volpi",
  "jersey": "18",
  "position": "G",
  "dateOfBirth": "1990-12-19T08:00Z",
  "citizenship": "Brazil"
}
```
- football-data squad: pendente — requer `teams.json` com `fdId` já cruzado (feito na Fase 1, script build-teams.js). Este check cobre apenas o formato ESPN.

### Internacional (espnId=1936)
- 40 atletas no elenco. Número de camisa: 40/40. Nacionalidade: 40/40. Posição: 40/40. Nascimento: 37/40.
- Amostra (1 atleta, campos relevantes):
```json
{
  "fullName": "Sergio Rochet",
  "displayName": "Sergio Rochet",
  "shortName": "S. Rochet",
  "jersey": "1",
  "position": "G",
  "dateOfBirth": "1993-03-23T08:00Z",
  "citizenship": "Uruguay"
}
```
- football-data squad: pendente — requer `teams.json` com `fdId` já cruzado (feito na Fase 1, script build-teams.js). Este check cobre apenas o formato ESPN.

## Decisões

- (1) Gols com jogador identificado: OK.
- (2) Assistências marcadas: OK, presentes no summary ESPN.
- (3) Cartões com jogador: OK (quando houve cartões na amostra).
- (4) Escalações com número da camisa: OK.
- (5) Substituições com entra/sai: OK.
- (6) Roster (nome completo, nascimento, nacionalidade, número, nome na camisa): ver amostra ESPN acima; comparação com football-data squad pendente de token + teams.json.

## Veredito final

**GATE PASSA.** ESPN summary cobre gols/assistências/cartões/substituições com jogador identificado e escalação com número de camisa para `bra-a`. Roster ESPN traz nome completo, apelido curto, número, posição, nascimento e nacionalidade com cobertura quase total. Liberado para Fase 1 (com a ressalva de comparar squad football-data assim que `teams.json` + `FOOTBALL_DATA_TOKEN` existirem).

_Amostras completas de JSON em `docs/fase0-bra-a-samples/`._