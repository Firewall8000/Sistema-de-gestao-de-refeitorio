# Ajuste de velocidade da leitura QR

O fluxo anterior esperava consultas sequenciais à nuvem, gravação remota, posição na fila e atualização de painéis. O indicador verde do leitor apenas confirma a decodificação; não confirma o registro do aluno. Um Wi-Fi conectado sem acesso funcional à internet ainda pode informar `navigator.onLine = true`.

## Alterações

- Com a migração `sql/migrations/06_register_scan.sql` aplicada, o leitor faz uma única chamada `register_scan_rpc` ao Supabase para identificar o aluno, verificar atividade/entrada/duplicidade, gravar e devolver posição e resultado. O registro principal ocorre antes da confirmação; os painéis são atualizados depois. Negativas e erros de permissão não acionam aprovação local.
- Orçamento total de 1,8 segundo para as requisições remotas iniciadas durante uma validação. Não é uma promessa de tempo total de câmera, armazenamento e renderização.
- Ao esgotar esse prazo, cancelamento da requisição quando suportado e uso do banco local. Por 15 segundos, novas leituras usam a alternativa local para evitar repetir a espera em cada aluno.
- Confirmação somente após a gravação local; registros sem confirmação remota continuam pendentes para o sincronizador existente, que tenta novamente a cada 30 segundos ou ao reconectar.
- Contadores e fila atualizados em segundo plano, sem prender a próxima leitura. A validação do almoço deixa de baixar e regravar todos os cadastros.
- Decodificador pausado durante a validação. Leitor alternativo processa imagens com lado máximo de 640 pixels e evita decodificar enquanto há registro em andamento.
- Mensagem imediata de QR identificado, separada da confirmação de entrada/almoço. A alternativa local informa que a fila pode estar incompleta.

## Operação e limites

Antes do atendimento, carregue a lista de alunos em cada aparelho enquanto há internet. Sem cadastro local e sem acesso à nuvem, o sistema não consegue identificar um aluno novo. Cadastros locais podem estar desatualizados; registros de outros aparelhos também podem não estar disponíveis durante uma interrupção. Nesse cenário, a posição da fila é provisória e não há garantia de prevenção de duplicidade entre aparelhos desconectados. A verificação de entrada na portaria continua obrigatória para o almoço.

As alterações estão no código local. Após a publicação, reabra a aplicação com internet para atualizar os arquivos do PWA (cache v3.5.8).

## Ativação da chamada única

1. Conferir o esquema do projeto Supabase: a migração é para `sql/schema.sql` (IDs TEXT e `meal_logs.date`). A antiga RPC em `migrations_staging` usa outro contrato e não deve ser aplicada junto por conveniência. A nova migração recusa as diferenças incompatíveis mais importantes.
2. Aplicar `sql/migrations/06_register_scan.sql` no SQL Editor do projeto correto. Ela cria a função e índices; não altera as políticas RLS nem concede acesso adicional às tabelas. A função usa as permissões de quem a chamou (`SECURITY INVOKER`).
3. Publicar o frontend e reabrir a aplicação. Se a função ainda não existir, o frontend mantém o caminho anterior e deixa de sondá-la até recarregar a página.
4. Com internet, conferir no painel de rede que há uma chamada a `/rest/v1/rpc/register_scan_rpc` por leitura antes da confirmação; consultas de atualização dos painéis podem ocorrer depois.

A função usa data e horário do servidor no fuso de Fortaleza. Uma resposta perdida não prova que a gravação falhou: o identificador da tentativa é preservado no registro local, para não gerar um novo ID ao sincronizar. As restrições únicas por aluno/dia continuam sendo a proteção contra concorrência no banco. Sem rede, permanecem as limitações entre aparelhos descritas acima.

O SQL foi exercitado em PostgreSQL WASM (PGlite), com o esquema local e políticas RLS, sem dados reais. Não houve aplicação nem teste no Supabase remoto. Para repetir os testes SQL no PowerShell:

```powershell
$scanTestTools = Join-Path $env:TEMP 'santos-dumont-sql-tests'
npm install --prefix $scanTestTools --no-audit --no-fund @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $scanTestTools 'node_modules/@electric-sql/pglite'
node --test tests/sql/register-scan.test.js
```

Os testes do frontend continuam disponíveis por `npm test`.

## Verificação na escola

1. Testar ao menos 20 crachás seguidos em aparelho antigo e recente, nos modos portaria e refeitório.
2. Medir separadamente o tempo até identificar o QR e o tempo até a confirmação do aluno.
3. Repetir com internet normal, Wi-Fi conectado sem internet e modo avião, com cadastros previamente carregados.
4. Repetir um crachá e conferir o bloqueio de duplicidade. Reconectar e conferir os registros e horários sincronizados.

Testes automatizados cobrem rede que nunca responde, cancelamento, orçamento compartilhado, reaproveitamento local, painel lento, falha de armazenamento, duplicidade local, aluno inativo e retomada do decodificador. Eles não substituem a medição da câmera física nos aparelhos.
