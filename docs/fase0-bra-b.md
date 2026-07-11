# Fase 0 — gate de viabilidade — Brasileirão Série B (bra-b)

Gerado em: 2026-07-11T17:17:58.610Z
espnSlug: `bra.2` | fonte canônica: `n/a` (n/a)

## 1-5. Summaries ESPN (3 jogo(s) finalizado(s) encontrados)

### Diagnóstico das requisições ao scoreboard

- Falhas HTTP (não-200 ou erro de rede): 0 / 4
- Nomes de status vistos nos eventos: STATUS_FULL_TIME
- Amostra das últimas requisições:
```
20260711 -> http=200 events=0
20260710 -> http=200 events=2
20260709 -> http=200 events=0
20260708 -> http=200 events=1
```

### Jogo 401860231 — Juventude 1 x 0 Vila Nova
- Gols: 1 — Messias (assist: Raí)
- Cartões: 5 — Yellow Card: Luis Mandaca; Yellow Card: Patryck; Yellow Card: André Luis; Yellow Card: Lucas Mineiro; Yellow Card: Rodrigo Sam
- Substituições: 10 — Ryan Lima -> Bruno Cesar Xavier; Bruno Cesar Xavier -> Higor Matheus Meritão; Luan Martins Gonçalves -> Lucas Mineiro; Marcos Paulo -> Manuel Castro; Luis Mandaca -> Fábio Lima; Nathan -> Hayner; Marquinhos Gabriel -> Dodô; Safira -> Allanzinho; Dudu -> Dellatorre; Raí Ramos -> Gabriel
- Escalação traz número de camisa: sim

### Jogo 401860223 — Sport 3 x 3 Botafogo-SP
- Gols: 6 — Hugo (assist: Everton Morelli); Rafael Gava (sem assistência marcada); Chrystian (sem assistência marcada); Marcelo Benevenuto (assist: Clayson); Patrick Brey (assist: Rafael Gava); Chrystian (sem assistência marcada)
- Cartões: 7 — Yellow Card: Rafael Gava; Yellow Card: Zé Lucas; Yellow Card: Matheus Sales; Yellow Card: Habraão; Yellow Card: Felipe Vieira; Yellow Card: Leandro Maciel; Red Card: Clayson
- Substituições: 10 — Marlon -> Clayson; Zé Lucas -> José Gabriel; Mádson -> Augusto Pucci; Fábio Matheus -> Yago Felipe; Kelvin -> Felipe Vieira; Matheus Sales -> Leandro Maciel; Hygor -> Guilherme Queiroz; Rafael Gava -> Wallace; Biel -> Zé Roberto; Hugo -> Wesley Pinheiro
- Escalação traz número de camisa: sim

### Jogo 401873986 — Ponte Preta 1 x 2 Criciúma
- Gols: 3 — Marcelo Hermes (assist: Willean Lepu); Daniel Goncalves Batista (sem assistência marcada); Marcelo Hermes (assist: Luciano Castan)
- Cartões: 5 — Yellow Card: Cunha; Yellow Card: Danilo Barcelos; Yellow Card: Willean Lepu; Yellow Card: Marcio Silva; Yellow Card: Élvis
- Substituições: 9 — Diego Tavares -> Diego Porfirio; André -> Daniel Goncalves Batista; David Conceição -> Juan Rodrigues Leopoldino; Rómulo Otero -> Jhonata Robert; Waguininho -> Diego; Fellipe Mateus -> Romarinho; Brandão -> Miguel; Eduardo -> Cauê; Gui Lobo -> Jean
- Escalação traz número de camisa: sim

## 6. Roster — football-data squad vs ESPN roster (2 clubes)

### Juventude (espnId=6270)
- 50 atletas no elenco. Número de camisa: 38/50. Nacionalidade: 50/50. Posição: 50/50. Nascimento: 50/50.
- Amostra (1 atleta, campos relevantes):
```json
{
  "fullName": "Pedro",
  "displayName": "Pedro",
  "shortName": "Pedro",
  "jersey": "12",
  "position": "G",
  "dateOfBirth": "1998-06-01T07:00Z",
  "citizenship": "Brazil"
}
```
- football-data squad: **não testado nesta rodada** (sem `FOOTBALL_DATA_TOKEN` configurado como secret do repositório, ou liga sem fonte canônica). Configurar o secret e rerodar antes de finalizar a decisão de roster.

### Vila Nova (espnId=9973)
- 42 atletas no elenco. Número de camisa: 30/42. Nacionalidade: 41/42. Posição: 41/42. Nascimento: 41/42.
- Amostra (1 atleta, campos relevantes):
```json
{
  "fullName": "Soares",
  "displayName": "Soares",
  "shortName": "Soares",
  "jersey": "21",
  "position": "F",
  "dateOfBirth": "2005-10-30T07:00Z",
  "citizenship": "Brazil"
}
```
- football-data squad: **não testado nesta rodada** (sem `FOOTBALL_DATA_TOKEN` configurado como secret do repositório, ou liga sem fonte canônica). Configurar o secret e rerodar antes de finalizar a decisão de roster.

## Decisões

- (1) Gols com jogador identificado: OK.
- (2) Assistências marcadas: OK, presentes no summary ESPN.
- (3) Cartões com jogador: OK (quando houve cartões na amostra).
- (4) Escalações com número da camisa: OK.
- (5) Substituições com entra/sai: OK.
- (6) Roster (nome completo, nascimento, nacionalidade, número, nome na camisa): ver amostra ESPN acima; comparação com football-data squad pendente de token + teams.json.

## Veredito final

**GATE PASSA.** ESPN summary cobre gols/assistências/cartões/substituições com jogador identificado e escalação com número de camisa para `bra-b`. Roster ESPN traz nome completo, apelido curto, número, posição, nascimento e nacionalidade com cobertura quase total. Liberado para Fase 1 (com a ressalva de comparar squad football-data assim que `teams.json` + `FOOTBALL_DATA_TOKEN` existirem).

_Amostras completas de JSON em `docs/fase0-bra-b-samples/`._