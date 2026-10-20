# Impressão das colocações para as portas das salas

## Como usar

1. Entrar no perfil Admin e abrir a aba **TV Refeitório**.
2. Clicar em **Imprimir colocações por turma**.
3. Escolher uma turma ou **Todas as turmas**.
4. Clicar em **Abrir prévia de impressão**.
5. Na nova janela, clicar em **Imprimir / Salvar em PDF**.
6. Usar papel A4, escala 100% e desativar os cabeçalhos e rodapés do navegador.
   Conferir as páginas na prévia antes de imprimir.

Cada turma começa numa página nova. Turmas grandes continuam em outras páginas,
com cabeçalho de tabela repetido. A folha mostra série, turma, data da fila,
horário de geração, posição geral e nome atual do aluno.

## Regras preservadas

- A posição é calculada na fila geral antes de separar as turmas.
  Uma turma pode ter posições 3º, 18º e 42º: elas não viram 1º, 2º e 3º.
- A origem e a ordenação são as mesmas usadas na fila operacional.
- Somente alunos com entrada registrada hoje são incluídos, inclusive os já
  atendidos ou marcados ausentes, preservando a referência de chegada.
- Nomes são obtidos do cadastro atual; se indisponível, usa-se o nome histórico.
- Uma única consulta à fila e uma ao cadastro preparam todas as folhas.
- Após a captura, novas chegadas ou correções não mudam aquela impressão.
  Fechar e reabrir o seletor gera outra versão.
- Não há gravações no Supabase nem alterações de chegada, atendimento ou cadastro.
- A função aparece apenas no perfil Admin e verifica esse perfil ao abrir a prévia,
  seguindo o controle de interface existente.

## Antes de afixar

Confirmar que os aparelhos da portaria sincronizaram as entradas. Sem conexão,
a impressão usa dados disponíveis localmente e traz um aviso. Mesmo online, a
consulta segue os fallbacks do sistema; acesso à internet não comprova que todos
os registros já chegaram ao servidor.

O papel representa o momento indicado no cabeçalho. A equipe continua usando
a fila operacional para liberar a entrada. Empates exatos de horário mantêm a
regra anterior do sistema; esta impressão não cria um novo critério de desempate.

## Publicação e testes

Incluir js/queuePrint.js e tests/queue-print.test.js no commit, junto das alterações
de index.html, js/auth.js e sw.js. Fazer push, aguardar a Vercel e recarregar as
páginas abertas.

`npm test` cobre agrupamento sem renumeração, nomes atualizados, snapshot fixo,
turmas de séries diferentes, ausência de gravações no fluxo, escape de HTML,
fila vazia, modo offline, bloqueio de popup e troca de dia durante a consulta.
As regras CSS de impressão foram verificadas nos testes; a conferência visual
da paginação e a impressão física devem ser feitas na prévia do navegador.
