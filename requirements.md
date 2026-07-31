# Documento de Especificação de Requisitos (SRS)
## Sistema de Gestão de Almoço por QR Code - Escola Santos Dumont

---

### 1. Visão Geral
O Sistema de Gestão de Refeitório por QR Code da Escola Santos Dumont é uma solução web responsiva projetada para automatizar, controlar e auditar a distribuição de refeições (almoço) para alunos do ensino médio em uma escola pública de tempo integral. O sistema permite o cadastro de estudantes, emissão e revogação de tokens de QR Code, leitura ágil via câmera de dispositivo móvel no refeitório, armazenamento resiliente com suporte a operação offline e exibição de relatórios e dashboards em tempo real para a diretoria.

---

### 2. Problema
Atualmente, o refeitório da escola enfrenta a ausência de um mecanismo automatizado e seguro para registrar quais alunos já almoçaram no dia. Isso acarreta:
- Filas e lentidão no atendimento;
- Possibilidade de dupla refeição por um mesmo aluno;
- Uso indevido de crachás perdidos;
- Falta de dados consolidados e em tempo real para a diretoria acompanhar a adesão à alimentação escolar e o dimensionamento da produção da cozinha.

---

### 3. Objetivos
- **Reduzir o tempo de validação** de cada aluno para menos de 1,5 segundo no refeitório.
- **Eliminar duplicidade de registros** e fraudes no recebimento de refeições no mesmo dia.
- **Garantir a operação contínua** mesmo durante quedas de conexão com a internet através de armazenamento local e sincronização automática.
- **Prover controle total à diretoria** com dashboards em tempo real e relatórios exportáveis.
- **Permitir a gestão ágil de crachás**, viabilizando a revogação de QR Codes perdidos e geração imediata de novos códigos.

---

### 4. Público-Alvo
1. **Funcionários do Refeitório / Cozinha**: Operadores do sistema de leitura no celular/tablet.
2. **Secretaria / Administrador**: Responsáveis pelo cadastro de alunos, emissão de novos QR Codes e desativação de matrículas.
3. **Diretora / Gestão Escolar**: Visualizadores dos relatórios analíticos, gráficos de pico e acompanhamento ao vivo.
4. **Alunos do Ensino Médio**: Portadores das fichas/crachás com QR Code.

---

### 5. Escopo (O que O Sistema FAZ)
- Cadastro completo de alunos (Nome, Matrícula, Turma, Série).
- Busca e filtragem por nome, matrícula, turma ou série.
- Ativação, edição e desativação de alunos.
- Geração de QR Code individual único para cada aluno.
- Mecanismo de reemissão de QR Code (revogação do código anterior em caso de perda do crachá).
- Exportação/Download da ficha com QR Code individual ou em lote para impressão.
- Tela de validação rápida por leitura de câmera (Mobile/Desktop) com feedback auditivo e visual instantâneo (Verde = Liberado, Vermelho = Bloqueado/Duplicado).
- Registro manual de emergência por matrícula caso a câmera falhe.
- Operação offline inteligente (PWA / Local Storage / IndexedDB) com fila de sincronização automática.
- Dashboard ao vivo para a Diretoria (contadores de almoços do dia, taxa de adesão, gráfico por turma/série).
- Relatórios históricos com filtros por data, turma e exportação para PDF/CSV.

---

### 6. Itens Fora do Escopo (O que O Sistema NÃO FAZ)
- Controle de lanches (manhã/tarde) ou outras refeições além do almoço.
- Gestão financeira, compra de insumos, receitas ou custos da cozinha.
- Reconhecimento facial ou biometria.
- Captura ou armazenamento de fotos dos estudantes.
- Aplicativo nativo baixado em lojas (App Store / Play Store); o sistema é estritamente Web/PWA.
- Impressão gráfica física de crachás (o sistema apenas gera o arquivo com o QR Code e dados para impressão em impressora comum).

---

### 7. Histórias de Usuário

| ID | Como [Papel] | Eu quero [Ação] | Para que [Benefício] |
|---|---|---|---|
| US-01 | Funcionário da Cozinha | Escanear o QR Code do aluno pelo celular no refeitório | Validar em segundos se o aluno pode almoçar sem formar filas |
| US-02 | Funcionário da Cozinha | Receber um aviso sonoro/visual de bloqueio quando um aluno tentar almoçar pela 2ª vez | Evitar duplicidade e garantir refeição para todos os alunos |
| US-03 | Secretária / Admin | Cadastrar e editar dados dos alunos e suas turmas | Manter a base de alunos atualizada |
| US-04 | Secretária / Admin | Gerar um novo QR Code invalidando o antigo após perda de crachá | Impedir que terceiros utilizem o crachá achado |
| US-05 | Secretária / Admin | Baixar a ficha do aluno com QR Code para impressão | Entregar o documento plastificado ao aluno |
| US-06 | Diretora | Visualizar um dashboard em tempo real com total de almoços servidos hoje | Acompanhar a adesão e o fluxo do refeitório ao vivo |
| US-07 | Diretora | Gerar relatório de alunos que almoçaram ou faltaram ao almoço em determinado dia | Ter transparência e auditoria na gestão alimentar |
| US-08 | Funcionário da Cozinha | Validar a refeição do aluno digitando a matrícula quando o crachá não for lido | Não interromper a fila caso o papel esteja danificado |

---

### 8. Requisitos Funcionais (RF)

- **RF-001 (Cadastro de Aluno)**: O sistema deve permitir cadastrar alunos com os campos obrigatórios: Nome Completo, Matrícula (única), Turma e Série (ex: 1º Ano A).
- **RF-002 (Edição e Desativação)**: O sistema deve permitir editar os dados dos alunos e desativar/inativar alunos transferidos ou evadidos.
- **RF-003 (Busca e Filtro)**: O sistema deve permitir buscar alunos por Nome ou Matrícula, e filtrar por Série e Turma.
- **RF-004 (Geração de QR Code Único)**: O sistema deve gerar um token aleatório e seguro codificado em QR Code para cada aluno ativo.
- **RF-005 (Revogação e Reemissão de QR Code)**: O sistema deve permitir gerar um novo QR Code para o aluno, invalidando imediatamente o QR Code anterior (em caso de perda/extravio).
- **RF-006 (Exportação de Ficha de QR Code)**: O sistema deve gerar uma visualização/layout de ficha individual e em lote (por turma) pronta para impressão.
- **RF-007 (Validação de QR Code via Câmera)**: O sistema deve permitir abrir a câmera do celular/tablet/computador para ler o QR Code do aluno no refeitório.
- **RF-008 (Validação Manual por Matrícula)**: O sistema deve permitir a validação manual digitando a matrícula quando o QR Code não puder ser lido.
- **RF-009 (Bloqueio de Duplicidade Diária)**: O sistema deve impedir mais de um registro de almoço para o mesmo aluno no mesmo dia civil.
- **RF-010 (Feedback Auditivo e Visual de Validação)**: O sistema deve emitir um sinal visual (tela verde para sucesso, vermelha para erro/bloqueio) e auditivo (beep agudo para sucesso, beep grave duplo para bloqueio).
- **RF-011 (Modo Offline e Sincronização Local)**: O sistema deve permitir a validação de refeições mesmo sem conexão com a internet, armazenando os registros localmente e sincronizando automaticamente quando a conexão retornar.
- **RF-012 (Dashboard em Tempo Real para Diretoria)**: O sistema deve exibir indicadores ao vivo: Total de alunos ativos, Alunos que já almoçaram hoje, Alunos pendentes e percentual de adesão.
- **RF-013 (Relatórios Informativos com Filtros)**: O sistema deve permitir a consulta de relatórios por período de datas, por turma e por série, listando alunos presentes e ausentes no almoço.
- **RF-014 (Exportação de Relatórios)**: O sistema deve permitir a exportação de relatórios em formato CSV e visualização amigável para impressão/PDF.
- **RF-015 (Autenticação e Perfis)**: O sistema deve possuir tela de login e divisão por perfil: `Operador` (leitura e busca) e `Administrador/Diretoria` (acesso total).

---

### 9. Requisitos Não Funcionais (RNF)

- **RNF-001 (Tempo de Resposta na Leitura)**: A decodificação do QR Code e a resposta de validação na tela não devem exceder 1,5 segundo em modo online e 500ms em modo offline.
- **RNF-002 (Compatibilidade de Dispositivos)**: O sistema deve ser um Web App Responsivo compatível com navegadores modernos (Chrome, Edge, Safari, Firefox) em Android, iOS e Windows.
- **RNF-003 (Resiliência e Tolerância a Falhas)**: O sistema deve funcionar perfeitamente em redes instáveis ou totalmente sem internet (PWA com Service Workers e IndexedDB).
- **RNF-004 (Usabilidade da Interface da Cozinha)**: A interface de validação do operador deve ter botões grandes, contraste elevado e foco automatizado na câmera/busca para facilitar o manuseio rápido no refeitório.
- **RNF-005 (Simplicidade de Banco de Dados e Administração)**: O sistema deve utilizar uma estrutura de banco de dados leve, sem dependências de infraestrutura complexa ou cara.
- **RNF-006 (Segurança dos Tokens)**: Os QR Codes não devem conter dados pessoais abertos (como CPF ou nome completo), apenas um token criptográfico/hash vinculado à matrícula.

---

### 10. Regras de Negócio (RN)

- **RN-001 (Uma Refeição por Aluno por Dia)**: Cada aluno ativo pode registrar no máximo 1 (um) almoço por data civil (00:00 às 23:59).
- **RN-002 (Invalidação Automática de Código Antigo)**: Ao emitir uma segunda via do QR Code para um aluno, o token anterior é marcado como `REVOGADO` instantaneamente e rejeitado se apresentado no refeitório.
- **RN-003 (Alunos Inativos Bloqueados)**: Alunos com status `INATIVO` no cadastro não podem ter refeição validada no refeitório.
- **RN-004 (Sincronização de Data do Registro)**: Registros feitos offline devem preservar o timestamp exato do momento em que a leitura ocorreu no celular do operador, e não a hora em que a internet voltou.

---

### 11. Critérios de Aceitação Verificáveis

1. **Validação Rápida**: Ao apontar o QR Code para a câmera, a tela exibe o nome do aluno, turma e status verde em menos de 1,5 segundo.
2. **Duplicidade**: Ao tentar escanear o mesmo QR Code duas vezes no mesmo dia, o sistema exibe mensagem "Almoço já registrado hoje às HH:MM" com fundo vermelho e áudio de erro.
3. **Reemissão de Crachá**: Ao clicar em "Revogar e Gerar Novo QR Code" no perfil de um aluno, a tentativa de leitura do código antigo resulta em "Código Invalidado/Revogado".
4. **Modo Offline**: Ao desconectar a internet (Modo Avião no dispositivo de leitura), o sistema continua registrando almoços e exibe o aviso "Operando Offline - X registros pendentes". Ao reconectar, a contagem de registros pendentes zera e os dados aparecem no dashboard da Diretoria.
5. **Filtro de Relatório**: Ao selecionar a turma "1º Ano A" no relatório do dia, o sistema lista apenas os alunos cadastrados no 1º Ano A com status "Almoçou" ou "Pendente".

---

### 12. Casos de Erro e Situações Extremas

- **Câmera indisponível ou sem permissão no navegador**: Exibir alerta explicativo com botão para tentar reativar permissão e atalho automático para digitação manual da matrícula.
- **QR Code rasurado / danificado**: O operador digita a matrícula no campo de busca rápida de emergência e clica em "Confirmar Almoço".
- **Tentativa de validação com aluno inativo**: Exibir aviso visual de "Aluno Inativo/Desativado no Sistema. Procure a Secretaria."
- **Queda de energia/bateria no celular do refeitório**: Ao religar o aparelho e abrir o navegador, todos os registros offline realizados antes do desligamento devem permanecer salvos no IndexedDB local sem perda de dados.
- **Conflito de sincronização (Relógio do celular desajustado)**: O sistema deve validar os timestamps offline considerando a data local e flag de sincronização.

---

### 13. Dependências
- Dispositivo com câmera funcional (celular, tablet ou webcam) no refeitório.
- Navegador web moderno com suporte a HTML5 Camera API (MediaDevices/getUserMedia), Service Worker e IndexedDB.
- Conexão de rede (Wi-Fi ou local) para sincronização e acesso inicial.

---

### 14. Riscos
- **Relógio do celular incorreto**: Pode gerar timestamps inconsistentes se o celular estiver fora da hora certa durante o modo offline.
- **Limpeza de cache/dados pelo usuário no navegador**: Apagar o histórico do navegador no dispositivo offline antes da sincronização pode perder registros locais não enviados ao servidor. (*Mitigação*: persistência no IndexedDB + aviso visual claro sobre registros pendentes).

---

### 15. Definição de Pronto (Definition of Done)
O sistema estará pronto quando:
1. Todos os requisitos funcionais (RF-001 a RF-015) estiverem implementados e validados por testes.
2. A leitura por câmera funcionar fluidamente em telas mobile e desktop.
3. O modo offline for testado simulando desconexão total e recuperação de rede.
4. O dashboard da diretora atualizar as estatísticas do dia dinamicamente.
5. A revogação e reemissão de novos QR codes impedir o reúso de crachás perdidos.
