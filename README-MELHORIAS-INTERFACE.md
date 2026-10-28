# Melhorias de interface implementadas

Este documento complementa o README principal do projeto e descreve as alterações de interface aprovadas nos itens **1, 3, 4 e 6**.

## 1. Direção visual mais sóbria

- Paleta mais contida, com verde escuro, superfícies claras e detalhes em dourado discreto.
- Menos sombras, gradientes e cantos arredondados excessivos nos elementos principais.
- Tela de acesso com descrição objetiva das áreas do sistema e aviso de que este é um protótipo acadêmico local.
- Tipografia, botões, foco de teclado e contraste ajustados para leitura e uso mais consistentes.
- Ícones vetoriais uniformes na navegação, em vez de símbolos Unicode com aparência variável entre sistemas.

## 3. Navegação mais direta

- As áreas principais ficam visíveis como destinos próprios: Visão geral, Imóveis, Pessoas, Documentos, Agenda, Financeiro e Equipe e acessos.
- As áreas são agrupadas por contexto e a página atual recebe indicação visual e semântica de seleção.
- O número de visitas futuras aparece junto de Agenda.
- Em telas pequenas, a navegação passa para uma faixa horizontal rolável.
- Os rótulos “Clientes” e “Usuários e acessos” foram simplificados para “Pessoas” e “Equipe e acessos”, respectivamente.

## 4. Painel organizado por prioridade

- Pendências financeiras e visitas de hoje aparecem antes dos indicadores gerais.
- O painel explica os períodos considerados: competência atual, cobranças vencidas até a data de hoje e contratos que vencem nos próximos 60 dias.
- Os indicadores usam títulos mais explícitos, como “Recebido na competência” e “Cobranças vencidas”.
- Vencimentos próximos e o resumo de recebimentos de hoje permanecem disponíveis como informações secundárias.
- Os valores continuam sendo calculados a partir dos registros existentes; esta mudança reorganiza e esclarece sua apresentação.

## 6. Formulários e retorno de ações

- Formulários principais informam quando há campos obrigatórios; os campos obrigatórios dos formulários de cadastro e acesso também recebem marcador visual.
- Erros de envio aparecem junto ao formulário e usam regiões acessíveis para leitores de tela.
- Ações em andamento exibem estados como “Salvando…” e desabilitam o envio duplicado.
- Salvamentos confirmados exibem mensagens de sucesso; erros de carregamento e gravação permanecem destacados como erros.
- O tratamento de retorno foi uniformizado nas áreas de acesso, equipe, cadastros de pessoas e imóveis, agenda, contratos, vistorias, reajustes e recebimentos.

## Arquivos alterados

- `web/src/App.jsx` — navegação, painel, títulos e retornos de ações.
- `web/src/Auth.jsx` — apresentação e mensagens das telas de acesso e equipe.
- `web/src/style-refresh.css` — identidade visual, navegação responsiva, acessibilidade e estados dos formulários.

## Verificação

teste teste

- Os arquivos JSX foram analisados com o parser Babel instalado no projeto.
- A compilação de produção foi tentada com `npm run build --workspace=@perugine/web`, mas o ambiente atual bloqueou a inicialização de subprocessos do Vite com `spawn EPERM`. Portanto, a compilação completa não pôde ser confirmada aqui.
- Nenhuma suíte de testes foi executada.
