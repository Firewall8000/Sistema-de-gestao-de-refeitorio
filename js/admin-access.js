/* Shared identity and safe, actionable authentication messages. */
window.ADMIN_EMAIL = 'danielsandes05@gmail.com';
window.authErrorMessage = function (error) {
  const messages = {
    invalid_credentials: 'E-mail ou senha não conferem. Use “Esqueci minha senha” para recuperar o acesso.',
    email_not_confirmed: 'O e-mail desta conta ainda não foi confirmado.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
    over_email_send_rate_limit: 'Limite de envio de e-mails atingido. Aguarde antes de solicitar outro link.',
    otp_expired: 'O link expirou ou já foi usado. Solicite um novo link.',
    same_password: 'Escolha uma senha diferente da senha atual.',
    weak_password: 'A senha não atende às regras de segurança. Use uma senha mais longa com letras, números e símbolos.',
    session_not_found: 'A sessão de recuperação expirou. Solicite um novo link.',
    config_missing: 'A configuração de autenticação não está disponível. Recarregue a página ou contate o responsável pelo sistema.'
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.status === 429) return messages.over_request_rate_limit;
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
    return 'Não foi possível conectar ao serviço de autenticação. Verifique a conexão e tente novamente.';
  }
  return 'Não foi possível concluir a autenticação. Tente novamente mais tarde.';
};
