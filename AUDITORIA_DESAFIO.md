# Auditoria de conformidade com o enunciado do desafio

## 1. Papel e objetivo

Atue como **auditor técnico independente** do projeto. Compare o repositório **em seu estado atual** com todas as exigências explícitas do enunciado abaixo. Avalie funcionalidades, regras de negócio, fluxos, dados, integrações, interface, documentação, requisitos técnicos e critérios de avaliação — somente quando estiverem presentes no enunciado.

**Objetivo:** identificar precisamente o que está implementado, o que está incompleto, o que está ausente e o que não pode ser comprovado, com referências concretas ao código e aos testes. Não marque algo como atendido apenas por existir uma tela, rota, tabela ou comentário com nome parecido.

## 2. Regras obrigatórias da auditoria

1. **Não modifique o projeto nesta etapa.** Não implemente funcionalidades, não faça refatorações, não altere dependências, arquivos de configuração, dados ou banco. A tarefa é somente inspecionar, executar verificações seguras quando possível e produzir relatório. Peça autorização antes de qualquer correção.
2. Trate o **enunciado original** como a fonte principal dos requisitos. `README`, `AGENTS.md` e demais documentos explicam a implementação, mas não substituem exigências do desafio. Respeite as orientações existentes do repositório sempre que não conflitarem com esta auditoria.
3. Não suponha que uma funcionalidade funciona por estar declarada. Confira o caminho completo quando aplicável: interface → integração/API → regras de negócio → persistência → resposta ao usuário.
4. **Não invente** resultados de execução, cobertura de testes, rotas funcionais, dados reais, integrações externas ou evidências. Quando não for possível verificar, use **Não verificado** e informe o motivo.
5. Diferencie **dados reais** de **dados fictícios, mocks, seeds ou simulações**. Se o desafio exigir dados geográficos reais, por exemplo, contornos fictícios ou simulados não atendem automaticamente ao requisito.
6. Diferencie o que é **obrigatório**, **opcional**, **recomendado** e **interpretação sua**. Não transforme uma sugestão técnica em requisito obrigatório.
7. Em cada achado, cite **arquivos, caminhos e símbolos relevantes**; inclua linhas quando for possível obtê-las com confiança. Evite observações vagas como “falta melhorar o frontend”.
8. Não exponha segredos, chaves, tokens ou dados pessoais no relatório. Avalie a existência e o uso correto sem copiar os valores.
9. Execute apenas comandos de inspeção e testes **não destrutivos** quando as dependências e o ambiente estiverem disponíveis. Não execute migrações, seeds, deploys ou operações que possam modificar dados sem autorização. Se não puder testar, registre claramente a limitação.
10. Inspecione todo o escopo relevante do projeto, incluindo frontend, backend, scripts, banco de dados, testes e documentação, conforme existirem. Não conclua conformidade a partir de uma única pasta.

## 3. Procedimento

### Etapa A — Levantamento

- Leia todo o enunciado na seção 6.
- Identifique os entregáveis, requisitos funcionais, não funcionais, regras de negócio, restrições técnicas, integrações e critérios de avaliação.
- Numere cada exigência de modo único (`REQ-001`, `REQ-002` etc.). Desmembre requisitos compostos quando houver condições independentes.
- Marque passagens ambíguas ou conflitantes, citando o trecho correspondente.

### Etapa B — Inspeção do repositório

- Identifique a arquitetura, os pontos de entrada, as telas/rotas, os serviços, modelos, estruturas de banco, testes e instruções de execução.
- Para cada requisito, localize evidências de implementação e, quando possível, de funcionamento.
- Identifique mocks, TODOs, código não conectado à aplicação, endpoints sem consumidores e telas que não completam o fluxo prometido.
- Considere cenários de erro, validações, permissões, carregamento, estados vazios e responsividade **quando forem relevantes ao requisito**.

### Etapa C — Verificação

- Consulte os scripts disponíveis para lint, typecheck, build e testes; execute os que forem seguros e viáveis no ambiente atual.
- Registre o comando, resultado e eventual bloqueio de cada verificação.
- Quando uma integração externa ou serviço local não estiver disponível, **não** afirme que ela passou.
- Não instale dependências nem altere a configuração do ambiente sem autorização.

### Etapa D — Classificação

Use exatamente estes estados:

- **Atendido:** implementação e evidência suficientes para o requisito.
- **Parcial:** existe implementação, mas falta alguma condição exigida.
- **Não atendido:** exigência ausente ou implementação incompatível.
- **Não verificado:** evidência insuficiente ou impossibilidade de teste.
- **Não aplicável:** somente quando o requisito explicitamente não se aplica; justificar.

Classifique problemas por prioridade: **P0 (bloqueia entrega)**, **P1 (requisito obrigatório relevante)**, **P2 (problema secundário)**, **P3 (melhoria opcional)**. Fundamente a prioridade no enunciado, sem exagerar a gravidade.

## 4. Relatório de saída

Crie ou atualize o arquivo **`AUDITORIA_RESULTADO.md` na raiz do workspace**, sem editar outros arquivos. Estruture-o assim:

### Resumo executivo

- Estado geral: **Conforme**, **Parcialmente conforme** ou **Não conforme**.
- Quantidade de requisitos por estado.
- Principais riscos à avaliação/entrega.
- Escopo efetivamente inspecionado e limitações.

### Matriz de rastreabilidade

| ID | Exigência do desafio | Criticidade | Estado | Evidência no projeto | Lacuna / observação |
|---|---|---|---|---|---|
| REQ-001 | ... | P1 | Parcial | `caminho/arquivo.ext` | ... |

Inclua **todos os requisitos identificados**, não apenas os que falharam.

### Problemas e recomendações

Para cada lacuna: informe requisito, impacto, evidência, comportamento esperado versus encontrado e **correção objetiva sugerida** (sem implementá-la).

### Verificações executadas

Apresente comandos, saídas resumidas e motivos de testes não executados. Diferencie análise estática de teste executado.

### Plano de adequação

Ordene as tarefas necessárias por **P0 → P1 → P2 → P3**, destaque dependências e indique quais alterações devem ser validadas antes da entrega.

### Pendências de esclarecimento

Liste apenas ambiguidades reais do enunciado ou informações externas indispensáveis para comprovar conformidade.

## 5. Critério de conclusão

A auditoria termina somente quando cada exigência do enunciado tiver um ID e um estado fundamentado na matriz. Informe ao final **se o projeto está pronto para entrega e quais condições ainda impedem essa conclusão**. Não declare conformidade total enquanto houver requisitos obrigatórios parciais, não atendidos ou não verificados.

---

## 6. ENUNCIADO ORIGINAL DO DESAFIO

> **COLE O TEXTO INTEGRAL DO DESAFIO ABAIXO DESTA LINHA.** Mantenha títulos, listas, requisitos, critérios de pontuação e condições exatamente como recebidos. Se houver anexos, inclua seus nomes/caminhos no workspace.

<!-- INÍCIO DO ENUNCIADO -->

1ª Parte – Inventário Inteligente da Cidade
O primeiro passo é catalogar os equipamentos de apoio à segurança e ao trânsito que serão instalados nas vias. São equipamentos munidos de IoT, cuja telemetria alimentará PROMETHEUS e servirão de base para tomadas de decisão com foco em melhoria urbana. Sua tarefa é construir um sistema que seja capaz de catalogar as principais informações desses equipamentos:

Tipo de equipamento: radar de fiscalização (velocidade, semáforo, retorno proibido etc), câmera de videomonitoramento, balança de caminhão, veículos autônomos de fiscalização de estacionamento rotativo, cancela automatizada, veículos de transporte (táxi, mototáxi, escolares), totem de autoatendimento para estacionamento rotativo, patinetes elétricos públicos e compartilhados, motos dos agentes de trânsito, viaturas da guarda municipal e polícia militar, entre outros.
Número de série, marca e modelo do equipamento;
Localização de instalação do equipamento ou da base: composta de CEP, bairro, cidade/UF, nome de rua, referência ("número 181", "oposto ao número 181", "KM 203", "S/N", "em frente ao Mercado do Tio" etc) e coordenadas GPS;
Situação: deve ser registrada a situação atual do equipamento, como: "ainda não instalado", "operacional", "mau funcionamento", "desativado", "furtado" etc;
Necessidade de manutenção: deve ser registrada a necessidade de manutenção do equipamento, se imediata (ex.: mau funcionamento) ou se agendada/periódica, bem como a data da próxima manutenção, se for o caso;
Outras características: propriedades particulares de cada tipo de equipamento. Ex.: câmeras de monitoramento podem ou não ter visão noturna, variam de resolução de captura, podem ser coloridas ou preto e branco etc; radares podem ser de velocidade (indicando qual é a velocidade máxima), de semáforo, fiscalização de conversão proibida etc.
Além dos equipamentos, a solução também deverá permitir o cadastro dos agentes que atuam diretamente nas operações de mobilidade e segurança da cidade, como agentes de trânsito, guardas municipais e policiais, possibilitando que esses profissionais também façam parte da visão integrada do F.O.G.O.
2ª Parte – Central de Operações da Cidade
Com os equipamentos e agentes devidamente cadastrados, o próximo passo é transformar esses dados em uma visão operacional da cidade.

PROMETHEUS passará a receber continuamente informações dos dispositivos IoT instalados nas vias, além da posição e situação das equipes que atuam em campo. Sua missão será criar uma Central de Operações capaz de apresentar, em tempo real, o que está acontecendo na cidade, permitindo que gestores identifiquem rapidamente problemas, acompanhem a disponibilidade dos recursos e tomem decisões com base em informações atualizadas.

O sistema deverá contar com um dashboard integrado a um mapa, no qual equipamentos e agentes possam ser visualizados de acordo com sua localização e situação atual.

A solução deverá permitir, no mínimo:

visualizar no mapa todos os equipamentos e agentes cadastrados, utilizando ícones ou identificações diferentes para cada tipo;
identificar de forma simples a situação de cada equipamento, como operacional, com mau funcionamento, em manutenção, desativado, furtado ou ainda não instalado;
acompanhar indicadores gerais, como quantidade total de equipamentos, equipamentos operacionais, equipamentos indisponíveis, percentual de disponibilidade e agentes em atividade;
aplicar filtros por tipo de equipamento, situação, bairro, região, órgão responsável ou outros critérios que considerar relevantes;
destacar equipamentos que necessitem de manutenção imediata ou que estejam próximos da data prevista para manutenção;
apresentar alertas para situações consideradas críticas, permitindo que eventos importantes ganhem maior destaque no painel;
possibilitar a consulta aos detalhes de cada equipamento ou agente diretamente pelo mapa;
apresentar uma visão consolidada que permita compreender rapidamente quais regiões da cidade estão operando normalmente e quais exigem atenção.
O objetivo é transformar os dados cadastrados na primeira parte em uma ferramenta de monitoramento e apoio à decisão, permitindo que os gestores e PROMETHEUS tenham uma visão única e atualizada da operação da cidade.

Sinta-se à vontade para criar novos indicadores, mapas de calor, gráficos, níveis de criticidade, agrupamentos por região ou qualquer outra funcionalidade que ajude a responder uma pergunta simples:

Se algo estiver acontecendo na cidade agora, PROMETHEUS conseguirá perceber?

3ª Parte – Cidade Preditiva
Agora que o F.O.G.O. já conhece os recursos disponíveis e consegue acompanhar a operação da cidade em tempo real, chegou o momento de dar o próximo passo: tentar antecipar o que ainda não aconteceu.

PROMETHEUS possui acesso aos dados históricos e às informações geradas continuamente pelos equipamentos, agentes e demais recursos da cidade. Sua missão será utilizar esses dados para criar mecanismos capazes de identificar padrões, tendências e situações que possam ajudar os gestores a agir antes que um problema aconteça ou se agrave.

Nesta etapa, a criatividade será parte importante do desafio. Não existe uma única resposta correta nem uma lista fechada de previsões que precisam ser desenvolvidas. Cada participante ou equipe poderá escolher quais problemas deseja antecipar e quais dados utilizar para isso.

identificar regiões, dias ou horários com maior probabilidade de ocorrências ou situações críticas;
estimar momentos em que determinadas regiões poderão necessitar de reforço de agentes ou equipes de segurança e mobilidade;
detectar comportamentos fora do padrão que possam indicar algum problema na operação;
identificar tendências na disponibilidade e utilização dos equipamentos;
criar índices ou níveis de risco para bairros, regiões ou períodos do dia;
gerar alertas preventivos ou recomendações para apoiar a tomada de decisão;
ou desenvolver qualquer outra solução preditiva que utilize os dados disponíveis para melhorar a operação da cidade.
As previsões poderão utilizar desde regras e análises estatísticas até algoritmos mais sofisticados, modelos de Machine Learning ou Inteligência Artificial. A tecnologia escolhida não será o mais importante. O que será avaliado é a capacidade de utilizar os dados de maneira inteligente e transformar uma previsão em algo realmente útil.

O sistema deverá deixar claro o que está sendo previsto, quais informações foram consideradas e como essa previsão pode ajudar na tomada de decisão.

Sinta-se à vontade para criar gráficos, mapas de calor, indicadores de risco, alertas, recomendações automáticas ou qualquer outra forma de demonstrar suas previsões.

<!-- FIM DO ENUNCIADO -->
