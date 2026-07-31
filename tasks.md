# Lista Ordenada de Tarefas de Implementação (Tasks)
## Sistema de Gestão de Almoço por QR Code - Escola Santos Dumont

---

### Tarefas Numeradas e Ordenadas por Dependência

#### TASK-01: Estrutura Base do Projeto e Design System CSS
- **Objetivo**: Criar a estrutura inicial de arquivos e o sistema visual responsivo (CSS com tokens de cores, tipografia Inter/Outfit, alto contraste para refeitório, componentes de cards, botões, modais e alertas).
- **Arquivos a Criar/Alterar**: 
  - `index.html`
  - `css/main.css`
  - `css/components.css`
- **Requisitos Relacionados**: RNF-002, RNF-004.
- **Critérios de Conclusão**: Estilos carregados corretamente, variáveis de cor definidas e layout responsivo funcionando em telas de 360px a 1920px.
- **Testes Necessários**: Teste visual nos navegadores comuns e em resolução mobile.
- **Dependências**: Nenhuma.

---

#### TASK-02: Camada de Banco de Dados Local (IndexedDB)
- **Objetivo**: Implementar o módulo `js/db.js` com suporte a operações assíncronas (CRUD) no IndexedDB para persistência de alunos, registros de almoço e sessão de usuários com resiliência offline.
- **Arquivos a Criar/Alterar**: 
  - `js/db.js`
- **Requisitos Relacionados**: RF-011, RNF-003, RNF-005.
- **Critérios de Conclusão**: Inicialização do banco `SantosDumontDB`, criação das stores (`students`, `meal_logs`, `users`) e métodos `get`, `put`, `getAll`, `delete` funcionais.
- **Testes Necessários**: Testar inclusão, consulta e exclusão de dados simulando recarga de página e persistência.
- **Dependências**: TASK-01.

---

#### TASK-03: Módulo de Autenticação e Perfis (`OPERATOR` / `ADMIN`)
- **Objetivo**: Implementar o fluxo de autenticação e permissões para alternar entre a visão de leitura da cozinha e a gestão/diretoria.
- **Arquivos a Criar/Alterar**: 
  - `js/auth.js`
- **Requisitos Relacionados**: RF-015.
- **Critérios de Conclusão**: Login funcional com persistência de sessão, controle de visibilidade das abas conforme o perfil e botão de logout.
- **Testes Necessários**: Login como operador (acesso restrito à leitura) e como admin (acesso total).
- **Dependências**: TASK-02.

---

#### TASK-04: Módulo de Gestão e Cadastro de Alunos
- **Objetivo**: Implementar formulários para cadastrar, editar, buscar e inativar alunos (Nome, Matrícula, Turma e Série).
- **Arquivos a Criar/Alterar**: 
  - `js/studentService.js`
- **Requisitos Relacionados**: RF-001, RF-002, RF-003, RN-003.
- **Critérios de Conclusão**: Cadastro de alunos com validação de matrícula única, busca dinâmica por nome ou matrícula e alteração de status ativo/inativo.
- **Testes Necessários**: Tentar cadastrar matrícula duplicada (deve bloquear); buscar por nome parcial; inativar um aluno e verificar alteração no banco.
- **Dependências**: TASK-02.

---

#### TASK-05: Módulo de Geração e Reemissão de QR Codes
- **Objetivo**: Gerar tokens únicos em hash para os alunos, renderizar QR Codes e permitir a revogação/reemissão de novo QR Code em caso de perda do crachá.
- **Arquivos a Criar/Alterar**: 
  - `js/qrGenerator.js`
- **Requisitos Relacionados**: RF-004, RF-005, RF-006, RN-002, RNF-006.
- **Critérios de Conclusão**: QR Code gerado em SVG/Canvas a partir do token seguro, revogação substituindo o token antigo por um novo e renderização de ficha individual para impressão.
- **Testes Necessários**: Gerar QR Code; reemitir segunda via; verificar se o token antigo foi marcado como revogado e se o novo QR Code renderiza corretamente.
- **Dependências**: TASK-04.

---

#### TASK-06: Módulo de Feedback Sonoro (Web Audio API)
- **Objetivo**: Criar o sintetizador de áudio para dar resposta imediata no refeitório ao validar cada aluno.
- **Arquivos a Criar/Alterar**: 
  - `js/audio.js`
- **Requisitos Relacionados**: RF-010, RNF-001.
- **Critérios de Conclusão**: Sons reproduzidos sem latência (Beep agudo para verde/sucesso e Beep grave duplo para vermelho/bloqueio).
- **Testes Necessários**: Executar comandos `playSuccessSound()` e `playErrorSound()` pelo console ou evento de botão.
- **Dependências**: TASK-01.

---

#### TASK-07: Leitor de QR Code via Câmera e Digitação Manual de Emergência
- **Objetivo**: Integrar o leitor de QR Code no navegador usando a câmera do dispositivo e adicionar campo numérico para digitação manual de emergência.
- **Arquivos a Criar/Alterar**: 
  - `js/scanner.js`
  - `css/scanner.css`
- **Requisitos Relacionados**: RF-007, RF-008, RNF-001, RNF-004.
- **Critérios de Conclusão**: Câmera acionada com sucesso, leitura do código em menos de 1,5s e campo de busca rápida por matrícula disponível caso a câmera não seja utilizada.
- **Testes Necessários**: Testar scanner com câmera do celular/webcam; testar digitação manual da matrícula.
- **Dependências**: TASK-01, TASK-06.

---

#### TASK-08: Serviço de Validação de Refeição e Trava de Duplicidade Diária
- **Objetivo**: Processar o token lido ou matrícula informada, verificar validade do aluno e aplicar a Regra de Negócio **RN-001** (máximo 1 refeição/dia).
- **Arquivos a Criar/Alterar**: 
  - `js/mealService.js`
- **Requisitos Relacionados**: RF-009, RF-010, RN-001, RN-003, RN-004.
- **Critérios de Conclusão**: Bloqueio imediato na segunda tentativa de leitura do mesmo aluno no dia civil; exibição de banner visual verde/vermelho com o horário da primeira leitura.
- **Testes Necessários**: Escanear aluno liberado (deve retornar verde + áudio); escanear o mesmo aluno em seguida (deve retornar vermelho + aviso "Já almoçou às HH:MM").
- **Dependências**: TASK-02, TASK-04, TASK-06, TASK-07.

---

#### TASK-09: Suporte PWA Offline e Engine de Sincronização
- **Objetivo**: Configurar o Service Worker para cache da aplicação e o módulo de sincronização em background quando a rede alternar entre offline/online.
- **Arquivos a Criar/Alterar**: 
  - `sw.js`
  - `manifest.json`
  - `js/sync.js`
- **Requisitos Relacionados**: RF-011, RNF-003, RN-004.
- **Critérios de Conclusão**: Aplicação carrega totalmente sem internet; registros offline são salvos localmente com flag `synced: false` e atualizados quando a rede restabelecer.
- **Testes Necessários**: Desconectar a internet no navegador; realizar leituras; reconectar e validar atualização do status de sincronização.
- **Dependências**: TASK-02, TASK-08.

---

#### TASK-10: Dashboard em Tempo Real para a Diretoria e Relatórios
- **Objetivo**: Desenvolver os indicadores ao vivo para a diretora (Alunos que almoçaram, ausentes, % de adesão) e gerador de relatórios com exportação em CSV.
- **Arquivos a Criar/Alterar**: 
  - `js/dashboard.js`
  - `css/dashboard.css`
- **Requisitos Relacionados**: RF-012, RF-013, RF-014.
- **Critérios de Conclusão**: Gráficos e contadores atualizados em tempo real a cada leitura; relatórios filtráveis por data/turma com download de arquivo CSV.
- **Testes Necessários**: Filtrar por data e turma; exportar relatório CSV; verificar precisão dos números no dashboard.
- **Dependências**: TASK-04, TASK-08.

---

#### TASK-11: Integração Completa da Aplicação Web e Testes de Aceitação (DoD)
- **Objetivo**: Integrar todas as partes no `index.html` e `js/app.js`, realizando o fluxo ponta a ponta e validando os critérios de aceitação.
- **Arquivos a Criar/Alterar**: 
  - `index.html`
  - `js/app.js`
- **Requisitos Relacionados**: Todos (RF-001 a RF-015, RNF-001 a RNF-006).
- **Critérios de Conclusão**: Sistema 100% navegável, sem erros no console, pronto para uso no ambiente da escola.
- **Testes Necessários**: Execução do fluxo completo (Cadastro -> Impressão QR -> Leitura no Refeitório -> Bloqueio de Duplicidade -> Dashboard Diretoria -> Exportação).
- **Dependências**: TASK-01 a TASK-10.
