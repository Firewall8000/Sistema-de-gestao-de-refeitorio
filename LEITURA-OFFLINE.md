# Leitura e sincronização

O resultado de cada leitura aparece somente no aviso grande da própria página:
verde para entrada ou almoço liberado e amarelo com verde para almoço fora da
ordem. Não abre uma segunda janela com OK. Durante o processamento de uma leitura,
novas leituras são ignoradas. A ausência confirmada continua
exigindo confirmação própria no Admin.

As entradas e os almoços são guardados no IndexedDB do aparelho. O envio pendente
ocorre ao abrir o sistema online, ao recuperar a conexão e a cada 30 segundos
com a página aberta. Somente registros do dia atual da escola (America/Fortaleza)
são enviados, preservando a data e o horário originais. Pendências locais de dias
anteriores são excluídas ao abrir ou retomar a página e nas tentativas periódicas,
mesmo sem internet. Isso não apaga dados do Supabase nem histórico local já enviado.
Com o navegador fechado, a limpeza aguarda a próxima abertura. Falhas mantêm as
pendências de hoje para nova tentativa; elas expiram ao mudar o dia. Reenvios
usam as restrições únicas do banco e não sobrescrevem registros existentes.

## Condições de uso

- Abra e carregue o sistema com internet antes de usá-lo offline, no mesmo
  navegador e aparelho. O cadastro dos alunos e as bibliotecas da câmera precisam
  estar disponíveis no cache. O primeiro acesso sem internet não é garantido.
- Não limpe os dados do navegador nem use sessão anônima para guardar leituras.
- Mantenha ou reabra o sistema ao voltar a ter internet. Não há garantia de envio
  em segundo plano com o navegador fechado.
- Sem internet, aparelhos diferentes não trocam leituras. Se a chegada foi
  registrada em outro aparelho e não está disponível localmente no refeitório,
  a exigência de passagem pela portaria continua bloqueando o almoço.
- A colocação offline reflete os registros disponíveis naquele aparelho. Pode
  mudar quando chegarem registros de outros aparelhos. Mantenha o relógio correto.
- A mesma refeição pode ser autorizada por dois aparelhos desconectados sem que
  um saiba do outro. O banco evita registros duplicados no envio, mas não pode
  desfazer o atendimento físico já realizado.

Validação automatizada usa dados fictícios para confirmação única, bloqueio de
leituras simultâneas, armazenamento offline, envio das entradas ao reconectar e
manutenção de pendências quando há erro. Não substitui o teste de câmera e modo
avião no celular utilizado pela escola, nem valida as permissões do banco remoto.
