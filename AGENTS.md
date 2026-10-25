# AGENTS.md — Projeto F.O.G.O. | DSIN

## 1. Objetivo e prioridades

Este arquivo define regras permanentes para agentes de IA que alteram o projeto F.O.G.O. da DSIN.

- Entregue código funcional, legível, consistente com a arquitetura existente e visualmente profissional.
- Qualidade visual não é opcional nem uma etapa posterior: toda mudança que afete a interface deve respeitar o design system, a usabilidade, a responsividade e a acessibilidade.
- Priorize, nesta ordem: **correção funcional e segurança**, **preservação do comportamento existente**, **consistência visual e usabilidade**, **manutenibilidade** e **performance**.
- Não interprete “funciona” ou “compila” como sinônimo de “está pronto”.
- Instruções explícitas da tarefa prevalecem quando conflitarem com preferências estéticas deste documento, sem autorizar violações de segurança ou mudanças fora do escopo.

## 2. Antes de alterar qualquer arquivo

1. Inspecione a estrutura relevante do repositório, as dependências, os componentes reutilizáveis e os estilos existentes.
2. Leia este arquivo e procure outras instruções do repositório aplicáveis à pasta que será modificada.
3. Entenda o comportamento atual da funcionalidade, os dados usados, os estados de interface e as integrações envolvidas.
4. Identifique padrões já adotados antes de criar uma abordagem nova. Reutilize componentes, hooks, utilitários e tokens disponíveis.
5. Faça somente as alterações necessárias ao pedido; não aproveite a tarefa para reescrever módulos não relacionados.
6. Se houver referência visual, analise hierarquia, cores, dimensões, alinhamento, bordas, espaçamentos e estados. Não copie erros evidentes de usabilidade.

## 3. Escopo de alterações visuais

- Quando a solicitação for visual, **altere apenas a apresentação**. Preserve comportamento, rotas, fluxos, integrações, validações, contratos de API e dados, salvo pedido explícito.
- Não adicione, remova ou reorganize funcionalidades por decisão estética. Melhorias funcionais sugeridas devem ser relatadas separadamente, não implementadas sem autorização.
- Preserve os padrões de navegação e os layouts estabelecidos quando o pedido limitar a mudança a estilos, cores, bordas ou tipografia.
- Não inclua bibliotecas de UI, CSS ou ícones sem necessidade demonstrável; prefira as dependências presentes no projeto.

- Toda alteração no frontend deve atender tanto ao tema claro quanto ao tema escuro. Confira contraste, superfícies, textos, bordas e estados de interação nos dois temas.
- Use os tokens de tema para cores de interface, evitando valores fixos que deixem componentes ilegíveis ou incoerentes em um dos temas.

## 4. Identidade visual da DSIN

Referências de marca fornecidas até agora:

- **Amarelo de destaque:** `#FECC00` (confirmado pelo usuário).
- **Cinza carvão:** `#3C4548` (aproximação visual das capturas).
- **Azul-grafite para texto:** `#1E2B3A` (aproximação visual das capturas).
- **Base:** branco e cinzas neutros suaves para superfícies, divisórias e textos secundários.

Regras de aplicação:

- Use o amarelo com parcimônia em CTAs, seleções e destaques. Garanta texto/ícones escuros sobre amarelo.
- Use carvão em navegação, cabeçalhos e elementos estruturais, quando compatível com a tela.
- Priorize superfícies claras, contraste e hierarquia visual; evite excesso de bordas grossas, sombras, cores ou elementos decorativos.
- Cores semânticas (sucesso/operacional, alerta/manutenção, erro/indisponível) devem ter significado consistente e não depender exclusivamente da cor.
- Os tons aproximados devem ser substituídos se a DSIN fornecer valores oficiais. Não os apresente como cores oficiais.
- Centralize tokens globais em `front/src/index.css`, respeitando nomes já existentes. Não espalhe valores hexadecimais repetidos entre componentes nem sobrescreva estilos globais sem necessidade.
- Registre neste arquivo novas especificações oficiais de marca recebidas do usuário: paleta, tipografia, logotipo, espaçamento e padrões de componentes.

## 5. Padrão obrigatório de frontend profissional

Toda interface nova ou alterada deve cumprir os critérios abaixo.

### 5.1 Hierarquia, composição e espaçamento

- Crie uma hierarquia clara entre título da página, seções, rótulos, conteúdo, ações e informações secundárias.
- Use uma escala de espaçamento coerente, preferencialmente múltiplos de 4 px (por exemplo: 4, 8, 12, 16, 24 e 32 px), ajustada ao design system existente.
- Alinhe textos, ícones, botões, campos e cards por eixos consistentes. Componentes equivalentes devem ter alturas e recuos equivalentes.
- Defina larguras e `max-width` apropriados ao conteúdo. Não estique controles indiscriminadamente nem concentre tudo em um canto sem justificativa.
- Use espaços vazios intencionalmente, sem produzir áreas desproporcionais por falta de organização.
- Escolha poucos raios de borda, pesos de fonte e níveis de sombra e reutilize-os em toda a aplicação.

### 5.2 Tipografia e elementos visuais

- Mantenha uma família tipográfica coerente e uma escala definida para títulos, subtítulos, rótulos e corpo.
- Como referência, textos comuns devem ser confortavelmente legíveis (em geral 14–16 px); títulos devem ter destaque proporcional, sem exagero.
- Utilize pesos, line-height, contraste e espaçamentos para estabelecer hierarquia; não dependa apenas de tamanhos grandes.
- Use ícones de uma mesma biblioteca/linguagem visual, com tamanho, espessura e alinhamento consistentes.
- Evite aparência de HTML padrão sem acabamento: campos, selects, tabelas, botões, modais e mensagens precisam seguir o mesmo padrão visual.

### 5.3 Componentes, formulários e filtros

- Padronize altura, padding, borda, raio, ícone, posicionamento do indicador e estados de `input`, `select`, `button` e demais controles.
- Inclua rótulos claros e persistentes; placeholders não substituem rótulos quando necessários.
- Organize filtros em grupo visual coerente, com espaçamento, alinhamento e largura adequados. Não entregue apenas campos isolados sem considerar sua relação com o conteúdo filtrado.
- Preveja estados aplicáveis: padrão, hover, foco visível, seleção/ativo, desabilitado, carregando, vazio, erro e sucesso.
- Não crie botões que não funcionam, filtros fictícios, dados simulados em produção ou interações sem feedback.
- Reutilize componentes compartilhados quando o mesmo padrão aparecer mais de uma vez.

### 5.4 Responsividade

- Considere telas pequenas, tablets e desktop desde a implementação, não como correção posterior.
- Verifique ao menos larguras aproximadas de **360 px, 768 px e 1440 px** quando houver como executar a interface.
- Evite rolagem horizontal acidental, sobreposição, corte de textos, controles fora da tela e espaços exagerados.
- Ajuste grids, quebras, larguras e densidade de informação sem prejudicar a navegação.
- Alvos de toque devem ser confortáveis; adote cerca de **44 × 44 px** quando adequado ao componente.

### 5.5 Acessibilidade e interação

- Use HTML semântico e associe rótulos a campos. Dê nomes acessíveis a botões somente com ícones.
- Garanta navegação por teclado, ordem de foco lógica, foco visível e indicação de erros compreensível.
- Busque contraste mínimo WCAG AA para texto comum (**4,5:1**) e evite transmitir status apenas por cor.
- Use animações discretas e curtas apenas quando ajudarem; respeite `prefers-reduced-motion`.
- Não sacrifique usabilidade, contraste ou legibilidade por aparência.

### 5.6 Contexto do F.O.G.O.

- Em páginas com mapas, marcadores e filtros de equipamentos, mantenha controles legíveis, agrupados e posicionados sem obstruir desnecessariamente o mapa ou seus elementos interativos.
- Preserve a correspondência entre filtros, estados e dados reais; não altere a lógica de filtragem como consequência de um ajuste visual.
- Para muitas marcações no mapa, evite renderizações e processamento desnecessários; só introduza agrupamento de marcadores, novas bibliotecas ou mudança de comportamento com justificativa e dentro do escopo aprovado.
- Não trate uma captura de uma área isolada (como o painel de filtros) como se definisse o layout inteiro da aplicação.

## 6. Qualidade de código e segurança

- Siga a linguagem, as convenções, a arquitetura, a estrutura de pastas e o gerenciador de pacotes já adotados.
- Evite duplicação, componentes monolíticos sem necessidade, CSS com regras conflitantes e seletores globais excessivamente abrangentes.
- Prefira nomes descritivos, tipagem existente e tratamento explícito de estados assíncronos e erros.
- Não introduza dependências, alterações de schema, endpoints ou refatorações extensas sem necessidade relacionada à tarefa.
- Não exponha credenciais, tokens ou dados sensíveis; não copie segredos para o frontend, logs, testes ou documentação.
- Não apague dados, arquivos ou configurações nem execute ações destrutivas sem autorização explícita.
- Não modifique configurações de build, lint ou testes apenas para ocultar falhas.

## 7. Processo de implementação e validação

1. **Inspecionar:** identifique os arquivos afetados, padrões existentes e critérios de aceitação da tarefa.
2. **Implementar:** faça mudanças pequenas, coerentes e estritamente dentro do escopo.
3. **Verificar funcionalidade:** execute lint, testes e build/typecheck pertinentes, conforme os scripts realmente existentes no repositório. Confirme que fluxos alterados continuam funcionando.
4. **Verificar visual:** para tarefas de UI, execute a aplicação e inspecione a tela no navegador/em capturas sempre que as ferramentas disponíveis permitirem. Confira estados relevantes e larguras mobile, tablet e desktop.
5. **Revisar:** procure desalinhamentos, espaçamentos inconsistentes, baixa legibilidade, bordas divergentes, sobreposição, comportamento quebrado e CSS duplicado.
6. **Relatar:** informe objetivamente o que mudou, quais verificações executou, seus resultados e o que não pôde verificar.

**Nunca afirme que a interface foi revisada visualmente se não a abriu nem analisou uma captura real da implementação.** Na falta de navegador ou ambiente executável, informe a limitação e faça a melhor revisão estática possível; não declare validação visual concluída.

## 8. Critério de conclusão (Definition of Done)

Uma tarefa de frontend só pode ser considerada concluída quando:

- [ ] O pedido foi implementado sem alterações funcionais fora do escopo.
- [ ] A identidade visual DSIN e os tokens/componentes existentes foram respeitados.
- [ ] Há hierarquia clara, alinhamento, espaçamento consistente e acabamento de controles.
- [ ] Estados de interação pertinentes e feedbacks existentes funcionam corretamente.
- [ ] O layout foi considerado para mobile, tablet e desktop, sem problemas evidentes.
- [ ] A interface mantém legibilidade, contraste e acesso por teclado quando aplicável.
- [ ] Build, lint, testes e/ou typecheck relevantes foram executados quando disponíveis, com resultados reais relatados.
- [ ] A revisão visual foi feita quando possível; se não foi, a limitação está explícita na entrega.
- [ ] Nenhum erro foi escondido, nenhuma funcionalidade fictícia foi introduzida e nenhum segredo foi exposto.

Se algum item não puder ser confirmado, **não invente aprovação**: descreva a pendência e a forma de verificá-la.

## 9. Formato da resposta ao finalizar uma tarefa

Responda de forma breve e verificável, usando esta ordem:

1. **Alterações:** o que foi feito e em quais áreas/arquivos principais.
2. **Validação:** comandos/testes executados e resultado; indique se houve inspeção visual real.
3. **Pendências:** limitações, riscos ou verificações não realizadas, sem afirmar que tudo está correto quando não foi verificado.

O objetivo é entregar interfaces bem acabadas e aplicações estáveis, não apenas gerar código rapidamente.

## 10. Cadastros e dados de demonstração

- Todo novo cadastro de equipamento deve ser completo e coerente com os registros existentes; não basta inserir uma linha básica na tabela `equipamentos`.
- Cadastros de demonstração devem usar localizações válidas e variadas, atributos específicos do tipo, histórico de situação e ocorrências vinculadas.
- Equipamentos móveis de demonstração também devem ter viagens e posições GPS coerentes, relacionadas ao equipamento e à sua localização cadastrada.
- Ao adicionar dados, mantenha schema, seed, gerador, migrações, API e exibição alinhados. Garanta chaves estrangeiras e evite posições compartilhadas usadas apenas como placeholder.
- Antes de concluir, confira que cada cadastro novo possui os dados relacionados exigidos para seu tipo e que migrações existentes recebem o mesmo tratamento que bancos novos.
