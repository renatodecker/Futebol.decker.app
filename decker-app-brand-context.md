# decker.app — contexto de marca e identidade visual
> Arquivo de referência para desenvolvimento do site. Use como fonte única de verdade para decisões de design, copy e posicionamento.

---

## 1. Sobre a empresa

**Nome:** decker.app  
**Domínio:** decker.app.br  
**Segmento:** Desenvolvimento digital — apps mobile, sistemas web, UI/UX, cloud, IA  
**Fase atual:** Pré-mercado / construção de portfólio e credibilidade

### O que a decker.app faz de verdade
Não vende código. Vende **clareza**: a capacidade de pegar uma demanda vaga, traduzir no que ela realmente precisa ser, e entregar sem retrabalho.

### Diferencial defensável
O fundador transita em dois mundos que raramente coexistem:
- Background técnico: desenvolvedor Progress/ABL → analista de requisitos → engenheiro de software → gerente de implantação de ERP
- Vocação em pessoas: leitura de entrelinhas, escuta ativa, tradução de problema de negócio em solução técnica

Esse perfil é o de um **technical translator** — raro o suficiente para ser diferencial real.

---

## 2. Posicionamento

### Cliente-alvo
Médias empresas com problema digital real mas sem estrutura interna para resolver. O interlocutor direto é um **gerente de TI ou diretor operacional** que já se frustrou com agências que "não entenderam o projeto".

### O que o cliente compra
Não tecnologia. Compra **previsibilidade e método** — saber que quem vai executar entende o problema antes de propor solução.

### O que NÃO somos
- Agência que "faz site"
- "Menino de TI"
- Mais uma fábrica de software genérica
- Empresa de uma pessoa só (opera com time de freelancers sob demanda)

---

## 3. Tom de voz

**Referência:** direto, técnico, sem enrolação. Quem já entendeu o problema antes de o cliente terminar de explicar.

### Palavras proibidas no site
`soluções`, `inovação`, `transformação`, `seamless`, `empower`, `leverage`, `disruptivo`, `ecossistema`

### Princípios de copy
- Frase curta. Sem subordinadas desnecessárias.
- Ativo, não passivo. ("Entregamos" não "É entregado")
- Fala com o decisor corporativo, não com o usuário final
- Nunca usar "pessoas" como público — o pagante é empresa
- Métricas concretas quando existirem (50+ projetos, 5+ anos)

### Taglines candidatas (escolher uma)
| Opção | Tagline | Quando usar |
|-------|---------|-------------|
| 1 | "Do requisito ao deploy. Sem ruído." | Foco no processo — fala com gerente de TI |
| 2 | "A tecnologia que faltava era entender o problema." | Foco na dor — ataca frustração com agências |
| 3 | "Seu próximo sistema vai funcionar porque começou certo." | Foco no resultado |
| 4 | "Tech que entende negócio." | Versão curta — headline, LinkedIn, bio |

**Recomendação:** Opção 1 como headline principal do hero. Opção 4 como tagline compacta em contextos de espaço reduzido.

---

## 4. Identidade visual — Direção "Layer"

### Conceito
Dois retângulos deslocados evocam camadas, stack, deploy — mas também: "enxergo o que está por baixo". Metáfora direta do diferencial do fundador: leitura nas entrelinhas.

---

## 5. Paleta de cores

```
--color-bg-primary:     #0A0F1E   /* fundo principal — azul-noite, não preto puro */
--color-bg-secondary:   #0C1F3F   /* fundo de seções alternadas, cards */
--color-bg-surface:     #111827   /* superfícies elevadas, modais */

--color-blue-strong:    #185FA5   /* azul primário — botões, layer traseiro do logo */
--color-blue-mid:       #378ADD   /* azul acento — layer frontal do logo, destaques */
--color-blue-light:     #85B7EB   /* azul suave — hover states, bordas sutis */
--color-blue-tint:      #B5D4F4   /* tint claro — versão light do logo, backgrounds */

--color-text-primary:   #FFFFFF   /* texto principal */
--color-text-secondary: rgba(255,255,255,0.55)  /* texto de suporte, nav links */
--color-text-muted:     rgba(255,255,255,0.35)  /* captions, labels, meta */
--color-text-accent:    #378ADD   /* eyebrows, destaques inline */

--color-border-subtle:  rgba(255,255,255,0.06)  /* divisores sutis entre seções */
--color-border-mid:     rgba(255,255,255,0.12)  /* bordas de cards */
```

### Uso de cor
- **Nunca vermelho** como cor de marca ou destaque
- Azul elétrico (#00BFFF e similares) deve ser evitado — remete a agência genérica
- O azul da decker.app é profundo e profissional, não vibrante
- Fundo `#0A0F1E` é inegociável: não substituir por `#000000` (preto puro = gamer) nem por cinza neutro

---

## 6. Logo

### Construção do símbolo
Dois retângulos com `border-radius: 4-5px`, deslocados em diagonal (offset ~6-8px horizontal e vertical).

```
Layer traseiro:  cor #185FA5, opacidade 0.5, posição base
Layer frontal:   cor #378ADD, opacidade 1.0, deslocado para cima e direita
```

### Variação recomendada (V1 — dois layers sólidos)
É a mais versátil: funciona em header, favicon 16px e avatar de perfil sem perder identidade.

### Wordmark
```
"decker"   → Inter, font-weight: 500, letter-spacing: -0.5px, fill: #ffffff
".app"     → Inter, font-weight: 300, fill: #378ADD
```

### Versão fundo claro
```
Layer traseiro:  #B5D4F4
Layer frontal:   #185FA5
"decker"         fill: #0A0F1E
".app"           fill: #185FA5
```

### SVG do logo (fundo escuro) — referência
```svg
<svg viewBox="0 0 200 52" xmlns="http://www.w3.org/2000/svg">
  <!-- layer traseiro -->
  <rect x="0" y="14" width="34" height="34" rx="5" fill="#185FA5" opacity="0.5"/>
  <!-- layer frontal -->
  <rect x="8" y="4" width="34" height="34" rx="5" fill="#378ADD"/>
  <!-- wordmark -->
  <text x="54" y="36"
    font-family="Inter, -apple-system, sans-serif"
    font-size="26" font-weight="500" letter-spacing="-0.5"
    fill="#ffffff">decker<tspan font-weight="300" fill="#378ADD">.app</tspan>
  </text>
</svg>
```

### Favicon / ícone isolado
```svg
<svg viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="10" width="26" height="26" rx="4" fill="#185FA5" opacity="0.5"/>
  <rect x="6" y="4" width="26" height="26" rx="4" fill="#378ADD"/>
</svg>
```

---

## 7. Tipografia

**Fonte principal:** Inter (Google Fonts)  
**Fonte alternativa:** Plus Jakarta Sans (mais personalidade, mesma família de uso)

```css
/* Escala tipográfica */
--font-display:    Inter, -apple-system, sans-serif;

--size-h1:         38-48px;   font-weight: 600; letter-spacing: -1px;
--size-h2:         28-32px;   font-weight: 600; letter-spacing: -0.5px;
--size-h3:         20-22px;   font-weight: 500; letter-spacing: -0.3px;
--size-body:       15-16px;   font-weight: 400; line-height: 1.65;
--size-small:      13px;      font-weight: 400; line-height: 1.5;
--size-eyebrow:    11px;      font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase;
--size-nav:        13px;      font-weight: 400;
--size-cta:        13-14px;   font-weight: 500;
```

---

## 8. Componentes de UI

### Header
```
altura: 64px
fundo: #0A0F1E
border-bottom: 0.5px solid rgba(255,255,255,0.06)
padding horizontal: 2.5rem (desktop), 1.25rem (mobile)
logo: alinhado à esquerda
nav: alinhado à direita
CTA do header: "Falar sobre seu projeto" — background #185FA5, border-radius: 6px
```

### Hero section
```
fundo: #0A0F1E
padding: 4rem 2.5rem 3rem
eyebrow: uppercase, letter-spacing 0.1em, cor #378ADD
h1: 38-48px, font-weight 600, letter-spacing -1px, cor #ffffff
  — palavra ou frase de destaque: cor #378ADD
subtítulo: 15px, cor rgba(255,255,255,0.5), max-width: 420px
botão primário: "Iniciar projeto" — bg #185FA5, padding 10px 20px, border-radius 7px
botão secundário: texto puro com seta → sem border, cor rgba(255,255,255,0.55)
```

### Botões
```css
/* Primário */
.btn-primary {
  background: #185FA5;
  color: #ffffff;
  border-radius: 7px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
}
.btn-primary:hover { background: #1a6bb8; }

/* Secundário */
.btn-secondary {
  background: transparent;
  color: rgba(255,255,255,0.55);
  border: 0.5px solid rgba(255,255,255,0.2);
  border-radius: 7px;
  padding: 10px 20px;
  font-size: 13px;
}
.btn-secondary:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
```

### Cards de métricas
```
background: #0C1F3F
border: 0.5px solid rgba(255,255,255,0.08)
border-radius: 8px
padding: 1.25rem 1.5rem
número: 28-32px, font-weight 600, color #ffffff, letter-spacing -1px
label: 12px, color rgba(255,255,255,0.4)
```

### Seções de serviços
- Ícones: SVG vetorial limpo, **sem emojis**
- Cards com `background: #0C1F3F`, borda sutil
- Stack de tecnologias: pills com `background: rgba(255,255,255,0.06)`, `border: 0.5px solid rgba(255,255,255,0.12)`

---

## 9. Estrutura sugerida do site

```
/ (home)
├── Header fixo com logo + nav + CTA
├── Hero — headline + tagline + 2 botões + métricas
├── Serviços — 6 cards (Apps Mobile, Sistemas Web, UI/UX, Cloud, IA, Suporte)
├── Diferencial — seção que explica o perfil "technical translator"
├── Portfólio — cases (a construir)
├── Processo — como funciona (etapas)
├── CTA final — "Falar sobre seu projeto"
└── Footer

/servicos  (privado — consultoria)
```

### Nav labels
```
Serviços | Projetos | Sobre | [Falar sobre seu projeto]
```
Não usar "Contato" — muito genérico. CTA direto converte melhor com o perfil B2B.

---

## 10. Métricas reais (usar no site)

```
50+    Projetos entregues
98%    Clientes satisfeitos
5+     Anos de experiência
```

> Atualizar conforme portfólio crescer. Não inflar números — o cliente-alvo é racional e cético.

---

## 11. O que evitar (anti-padrões)

| Evitar | Motivo |
|--------|--------|
| Fundo `#000000` puro | Remete a agência gamer/noturna |
| Azul elétrico `#00BFFF` | Visual de agência genérica BR |
| Emojis como ícones de serviço | Destrói credibilidade B2B |
| "Transformamos ideias em..." | Clichê de agência — invisível ao mercado |
| Animações excessivas | Distrai, parece template de IA |
| Layout hero com mockup de celular centralizado | Usado por 300 agências com o mesmo template |
| Gradients chamativos | Incompatível com a direção "tech moderno sóbrio" |

---

## 12. Referências visuais de mercado

- **Vercel** (vercel.com) — minimalismo dark, tipografia precisa
- **Linear** (linear.app) — dark profissional, alto contraste, sem excesso
- **Raycast** (raycast.com) — uso de cor contida, copy técnico mas acessível

O objetivo não é copiar — é entender o nível de refinamento esperado pelo público-alvo dessas marcas.

---

*Gerado em sessão de branding — junho/2026*  
*Versão 1.0 — para revisão após primeiros testes de portfólio*
