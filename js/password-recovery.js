(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  // Tokens are held only in memory, never printed or stored in localStorage.
  window.history.replaceState(null, '', window.location.pathname);
  const requestForm = document.getElementById('request-recovery');
  const updateForm = document.getElementById('update-password');
  const status = document.getElementById('recovery-status');
  const sendButton = document.getElementById('send-recovery');
  const saveButton = document.getElementById('save-password');
  const password = document.getElementById('new-password');
  const confirmation = document.getElementById('confirm-password');
  let client;
  let recoveryReady = false;
  let sending = false;
  let saving = false;

  function showError(error) {
    status.textContent = window.authErrorMessage(error);
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || sending) return;
    sending = true;
    sendButton.disabled = true;
    status.textContent = 'Enviando link…';
    try {
      const { error } = await client.auth.resetPasswordForEmail(window.ADMIN_EMAIL, {
        redirectTo: new URL('recuperar-senha.html', window.location.href).href
      });
      if (error) throw error;
      status.textContent = 'Solicitação recebida. Confira a caixa de entrada e o spam do e-mail administrativo e use o link mais recente.';
    } catch (error) {
      showError(error);
    } finally {
      sending = false;
      sendButton.disabled = false;
    }
  });

  updateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!recoveryReady || saving) return;
    if (password.value.length < 8) {
      status.textContent = 'Use pelo menos 8 caracteres.';
      return;
    }
    if (password.value !== confirmation.value) {
      status.textContent = 'As duas senhas precisam ser iguais.';
      return;
    }
    saving = true;
    saveButton.disabled = true;
    status.textContent = 'Salvando nova senha…';
    try {
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) throw error;
      recoveryReady = false;
      password.value = '';
      confirmation.value = '';
      updateForm.hidden = true;
      status.textContent = 'Senha alterada com sucesso. Volte ao sistema e entre com a nova senha.';
      // A cleanup failure must not report a completed password update as failed.
      try { await client.auth.signOut({ scope: 'local' }); } catch (_) { /* Memory-only session. */ }
    } catch (error) {
      showError(error);
    } finally {
      saving = false;
      saveButton.disabled = false;
    }
  });

  async function initialize() {
    try {
      if (!window.supabase?.createClient || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        throw { code: 'config_missing' };
      }
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
          storageKey: 'sd-password-recovery', flowType: 'implicit' }
      });
      if (params.has('error') || params.has('error_code')) {
        throw { code: params.get('error_code') || 'otp_expired' };
      }
      if (!params.has('access_token') && !params.has('refresh_token')) {
        status.textContent = 'O link será enviado ao e-mail administrativo cadastrado.';
        return;
      }
      if (params.get('type') !== 'recovery' || !params.get('access_token') || !params.get('refresh_token')) {
        throw { code: 'otp_expired' };
      }
      sendButton.disabled = true;
      status.textContent = 'Validando link de recuperação…';
      const { error: sessionError } = await client.auth.setSession({
        access_token: params.get('access_token'), refresh_token: params.get('refresh_token')
      });
      params.delete('access_token');
      params.delete('refresh_token');
      if (sessionError) throw sessionError;
      // Verify identity with Auth; do not trust user data decoded from a token.
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (data.user?.email?.toLowerCase() !== window.ADMIN_EMAIL.toLowerCase()) {
        status.textContent = 'Este link não pertence à conta administrativa do sistema. Solicite o link correto.';
        await client.auth.signOut({ scope: 'local' });
        return;
      }
      recoveryReady = true;
      requestForm.hidden = true;
      updateForm.hidden = false;
      document.getElementById('recovery-intro').textContent = 'Defina sua nova senha de acesso administrativo.';
      status.textContent = 'Link validado. Preencha os dois campos.';
      password.focus();
    } catch (error) {
      showError(error);
    } finally {
      params.delete('access_token');
      params.delete('refresh_token');
      sendButton.disabled = !client;
    }
  }
  initialize();
})();
