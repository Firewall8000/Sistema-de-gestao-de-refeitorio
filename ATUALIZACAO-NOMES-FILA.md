# Correção de nomes durante o uso

A fila da TV (portaria e refeitório), a fila do leitor e as mensagens de vez
passam a consultar o nome atual do cadastro pelo mesmo identificador do aluno.
Se o cadastro não estiver disponível, usam o nome histórico da entrada.

## Preservação dos dados

- A edição de aluno existente faz UPDATE por id, somente em name, registration,
  grade, turma e updated_at. Não faz upsert nem recria um registro ausente.
- QR Code, foto, dispositivo vinculado, situação ativo/inativo e data de criação
  não são enviados nessa atualização.
- Nenhum registro de school_entries ou meal_logs é alterado: ficam preservados
  identificador, data, horário de chegada, refeições e ausências.
- Os nomes históricos nos registros permanecem intactos. As filas exibem o nome
  atual por associação ao cadastro, sem reescrever o histórico.
- A ordenação por horário de chegada e as regras de liberação do almoço não
  foram modificadas. Corrigir um nome não introduz ordenação alfabética.
- Empates exatos de horário continuam sujeitos à ordem devolvida pela fonte,
  uma limitação anterior. Esta alteração não define uma nova regra de desempate,
  pois isso poderia reposicionar alunos de uma fila já em andamento.

## Salvamento e atualização das telas

A edição exige internet e confirmação de uma linha atualizada pelo Supabase.
Falhas de permissão, aluno não encontrado ou conexão não são mais tratadas
como sucesso local. A política RLS do projeto precisa autorizar o UPDATE;
este trabalho não altera permissões do banco.

Depois de salvar, a tela atual atualiza as listas. Outros dispositivos usam o
evento Realtime de students já existente, com consulta de recuperação a cada
30 segundos enquanto a página estiver visível. Sem conexão, só é possível
mostrar o último cadastro disponível no cache.

Respostas antigas de consultas concorrentes da TV e do leitor não substituem
uma renderização iniciada mais recentemente.

## Publicação e conferência

1. Fazer commit e push, incluindo o teste novo. Aguardar a publicação na Vercel.
2. Atualizar as páginas abertas nos aparelhos da portaria, refeitório e TV para
   carregar esta versão do código antes de testar.
3. Anotar posição e horário de um aluno com nome a corrigir.
4. Editar o cadastro existente, alterando somente o nome.
5. Conferir o nome atualizado e o mesmo horário/posição nas duas colunas da TV
   e na fila do leitor. Outro aparelho deve atualizar por Realtime ou pela
   consulta periódica, se estiver conectado.
6. Se o salvamento for recusado, não excluir nem recadastrar o aluno; verificar
   a permissão de UPDATE no Supabase.

Os testes automatizados usam alunos fictícios e respostas simuladas, cobrindo
preservação de posição, estado do atendimento, dados históricos, QR e foto,
falhas de gravação, cache ausente, atualização das listas e respostas fora de
ordem. Nenhum aluno real foi alterado durante o desenvolvimento.
