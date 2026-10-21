# Orientações do projeto

## Escopo de mudanças no frontend

- Ao atualizar a identidade visual, altere somente a apresentação do frontend. Preserve o comportamento, os fluxos, as integrações e os dados da aplicação, a menos que o usuário peça mudanças funcionais.
- Registre neste arquivo as orientações visuais da DSIN assim que forem fornecidas pelo usuário. Inclua tokens de cor, tipografia, uso de marca e padrões de componentes que possam ser reaproveitados em futuras implementações.
- Consulte as orientações visuais deste arquivo antes de fazer alterações futuras no frontend.

## Identidade visual DSIN

- Capturas do site fornecidas pelo usuário mostram cabeçalho e áreas escuras em cinza carvão (aproximação `#3C4548`), acentos amarelos (`#FECC00`, confirmado pelo usuário), texto escuro azul-grafite (aproximação `#1E2B3A`) e fundos brancos.
- Use amarelo em ações e destaques, com texto escuro para manter contraste. Use cinza carvão em navegação, cabeçalhos e marcadores. Use branco como base e cinzas suaves em bordas e conteúdo secundário.
- Os tons carvão e azul-grafite são aproximações visuais das capturas; atualize esta referência quando houver códigos oficiais ou arquivos originais da marca.
- Preserve contraste legível entre texto e fundo. Reserve cores funcionais de estado (por exemplo, erro, manutenção e operacional) para comunicar esses estados.
- Ao atualizar a interface existente, mantenha suas funcionalidades, fluxos e integrações; mudanças de identidade visual devem ser apenas de apresentação, salvo pedido explícito em contrário.
- Aplique esses valores por tokens CSS reutilizáveis em `front/src/index.css` e reutilize-os nos estilos dos componentes.
