# Recuperação do administrador — implantação

Diagnóstico em 19/10/2026: o login retornou `invalid_credentials`. A conta
existe e está confirmada. O vídeo de recuperação mostrou o link retornando a
`http://localhost:3000`, onde não há servidor. São problemas distintos: a
senha enviada foi recusada e o fluxo de recuperação não tinha destino funcional.

## Publicar

1. Publicar esta alteração na Vercel com o build normal (`npm run build`).
   Manter as variáveis SUPABASE_URL e SUPABASE_ANON_KEY do projeto
   `bxbouiubbyakwostjypu`; não usar as variáveis locais do staging.
   Fazer commit **e push** para a branch de produção conectada à Vercel e
   aguardar o deployment de Production ficar Ready. Commit apenas local não
   publica. O build está explícito em vercel.json e a saída é public/.
   Incluir os arquivos novos de recuperação no commit, não somente os modificados.
2. No projeto correto do Supabase, abrir Authentication → URL Configuration.
3. Definir **Site URL** como `https://refeitoriocesd.vercel.app/`.
4. Adicionar às **Redirect URLs** os dois endereços exatos:
   - `https://refeitoriocesd.vercel.app/recuperar-senha.html`
   - `https://refeitoriocesd.vercel.app/recuperar-senha`
5. Salvar. Não é necessário excluir usuários nem alterar tabelas ou RLS.
6. No site publicado, clicar em “Esqueci minha senha” e solicitar um novo link.
   A solicitação envia e-mail: deve ser feita pelo usuário ou a pedido explícito dele.
   Antes, confirmar que https://refeitoriocesd.vercel.app/recuperar-senha abre
   a página. Antes desta publicação esse endereço retorna 404.
7. Abrir o e-mail mais recente, definir a nova senha e voltar ao sistema para
   testar o login. Links anteriores podem ter expirado ou já ter sido usados.

O botão “Send password recovery” do painel também é atendido: quando o link
retorna à raiz do site com `type=recovery`, a aplicação encaminha para a página
de recuperação antes de inicializar sua sessão habitual.

## Segurança e limites

- O fluxo implementado usa os links implícitos do Supabase (fragmento com
  access_token, refresh_token e type=recovery), como observado na gravação.
- A página verifica a sessão e o e-mail com o Supabase antes de permitir a troca.
- Usa somente chave pública e sessão temporária em memória; não usa service_role.
- Não carrega Sentry nem grava senha/tokens nos logs ou armazenamento local.
- A alteração da senha só ocorre após o usuário preencher e enviar o formulário.
- Uma sessão comum existente não libera a troca nesta página.
- Não cole links de recuperação completos em chats: eles contêm credenciais.
- Validação automatizada usa respostas simuladas. O ciclo real de envio de
  e-mail, alteração de senha e novo login depende da publicação e da configuração
  do painel; não foi executado contra a conta real.

Referências:
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/auth/redirect-urls

## Conferência das ligações

- Login e recuperação chamam Supabase Auth diretamente; não passam pelo Render.
- Variáveis obrigatórias de build na Vercel: SUPABASE_URL, SUPABASE_ANON_KEY
  (chave pública anon ou publishable) e RENDER_API_URL. Esta última continua
  obrigatória no build existente, embora não seja usada no login.
- No site consultado, SUPABASE_URL é https://bxbouiubbyakwostjypu.supabase.co
  e RENDER_API_URL é https://sistema-de-gestao-santos-dumont.onrender.com.
- backend/.env é apenas configuração local do backend, não alimenta o build
  do frontend. Não copiá-lo para a Vercel nem trocar produção por staging.
- public/ é gerada no build e ignorada pelo Git. Não publicar manualmente uma
  cópia gerada com variáveis fictícias de teste.
- A Vercel usa cleanUrls: true: .html redireciona para a URL sem extensão.
  Os dois destinos de recuperação foram incluídos nas instruções do Supabase.
- A lista de Redirect URLs e o Site URL são configurações privadas do painel;
  não foram alterados nem confirmados por esta revisão do código.
