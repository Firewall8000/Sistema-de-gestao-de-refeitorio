# Controle de sincronização deste aparelho

Disponível no leitor, nos modos Portaria e Refeitório. Não é o painel remoto de aparelhos discutido anteriormente.

- Com conexão detectada: **Sincronizar e Conferir** envia os registros pendentes, consulta o Supabase para comparar aluno/data/horário e situação do almoço, e baixa cadastros e registros de hoje para uso offline.
- Sem conexão detectada: **Atualizar dados para uso offline** aparece desabilitado. Baixar dados exige conexão; a explicação aparece abaixo do botão. O sistema testa novamente o acesso ao servidor a cada 15 segundos, quando não está sincronizando.
- A borda e o brilho âmbar destacam registros pendentes, ainda não conferidos ou com divergências. A quantidade também aparece em texto. O destaque não depende da cor para comunicar o problema.
- Durante o envio automático, o botão informa **Enviando registros automaticamente…**, com progresso de entradas/almoços. O envio usa um orçamento de rede de 20 segundos na tentativa automática e 60 segundos na manual (até 8 segundos por requisição); o restante fica salvo para outra tentativa. Esses limites não incluem a etapa posterior de conferência e preparação offline. Falhas de envio aparecem na página e interrompem a operação manual antes de anunciar conferência.
- Uma gravação aceita pelo servidor não é suficiente para anunciar conferência: o botão consulta o registro por aluno e data e compara o horário. Divergências ficam listadas, sem sobrescrever horários.
- A conferência e os contadores cobrem somente os registros de hoje existentes neste navegador, pelo fuso America/Fortaleza. Não identificam alunos nunca lidos, dados apagados nem pendências de outros aparelhos. O histórico já enviado é preservado, mas não entra na conferência diária.
- Pendências locais de dias anteriores são excluídas automaticamente, mesmo offline, ao abrir/retomar o sistema ou na tentativa periódica com a página aberta. A quantidade excluída aparece no painel. Não há exclusão no Supabase nem envio de leituras antigas com a data de hoje. Leituras que expiram sem envio não serão recuperadas nos relatórios históricos.
- O recebimento dos dados offline é feito em uma transação local: erro na gravação mantém o conjunto anterior. Pendências de hoje, divergências e histórico já enviado são preservados. O cache de cadastros é substituído pelos cadastros visíveis no servidor.
- O horário e a data da preparação são mostrados. Novas entradas na portaria exigem atualização para aparecerem num refeitório desconectado. Vários aparelhos offline continuam sem trocar liberações entre si.

## Publicação

Enviar os arquivos alterados ao GitHub e aguardar a Vercel. Esta alteração não exige novo SQL. Reabrir o site conectado no mesmo navegador; não apagar os dados. Se a atualização local solicitar fechar outras abas, fechá-las e reabrir. Cache do aplicativo: v3.6.2; banco local: versão 3, com descarte das pendências anteriores ao dia atual.

O envio de almoços usa o conflito `(student_id, date)`, correspondente à restrição de `sql/schema.sql` e da RPC atual. Não usa mais `(date, student_registration)`, que não está definido nesse esquema.

## Verificação

`npm test` inclui estados do botão, divergências, recuperação de conexão, paginação e erros. Para testar a transação IndexedDB e o ciclo completo preparação → almoço offline → duplicidade → sincronização → conferência:

```powershell
$syncTestTools = Join-Path $env:TEMP 'santos-dumont-sql-tests'
npm install --prefix $syncTestTools --no-audit --no-fund fake-indexeddb
$env:FAKE_INDEXEDDB_MODULE = Join-Path $syncTestTools 'node_modules/fake-indexeddb'
node --test tests/sql/offline-snapshot.test.js
```

Testes usam dados fictícios. Não houve teste nos celulares da escola nem alteração do banco remoto.
