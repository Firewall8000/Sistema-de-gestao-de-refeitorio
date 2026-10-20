/* Class-door notices: read-only snapshots of the existing arrival queue. */
class QueuePrintController {
  constructor() {
    this.snapshot = null;
    this.loading = false;
    this.revision = 0;
  }

  escape(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  buildSnapshot(entries, students, date, generatedAt, offline) {
    const byId = new Map(students.map(student => [student.id, student]));
    const groups = new Map();
    // Assign positions BEFORE grouping. Never re-sort or filter the general queue.
    entries.forEach((entry, index) => {
      const student = byId.get(entry.student_id || entry.studentId);
      const grade = student?.grade || entry.grade || 'Série não informada';
      const turma = student?.turma || entry.turma || 'Turma não informada';
      const key = JSON.stringify([grade, turma]);
      if (!groups.has(key)) groups.set(key, { key, grade, turma, rows: [] });
      groups.get(key).rows.push({
        position: index + 1,
        name: window.studentService.getDisplayName(entry, student)
      });
    });
    return {
      date, generatedAt, offline, total: entries.length,
      groups: [...groups.values()].sort((a, b) =>
        a.grade.localeCompare(b.grade, 'pt-BR', { numeric: true }) ||
        a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true }))
    };
  }

  async open() {
    if (!window.authManager?.isAdmin() || this.loading) return;
    const revision = ++this.revision;
    this.snapshot = null;
    this.loading = true;
    const modal = document.getElementById('modal-queue-print');
    const select = document.getElementById('queue-print-class');
    const status = document.getElementById('queue-print-status');
    const button = document.getElementById('btn-preview-queue-print');
    select.innerHTML = '';
    select.disabled = button.disabled = true;
    status.textContent = 'Preparando as colocações de hoje…';
    modal.classList.add('active');
    try {
      const service = window.mealValidatorService;
      const date = service.getTodayDateString();
      const [entries, students] = await Promise.all([
        service.getTodayOrderedEntries(),
        window.studentService.getAllStudents()
      ]);
      if (revision !== this.revision || !window.authManager?.isAdmin()) return;
      if (date !== service.getTodayDateString()) {
        throw new Error('O dia mudou durante a consulta. Feche e abra novamente para gerar a lista de hoje.');
      }
      this.snapshot = this.buildSnapshot(entries, students, date, new Date(), !navigator.onLine);
      if (!this.snapshot.total) {
        status.textContent = 'Nenhuma chegada registrada hoje. Não há colocações para imprimir.';
        return;
      }
      select.innerHTML = '<option value="all">Todas as turmas</option>' +
        this.snapshot.groups.map((group, index) =>
          `<option value="${index}">${this.escape(group.grade)} — ${this.escape(group.turma)} (${group.rows.length} alunos)</option>`
        ).join('');
      status.textContent = `${this.snapshot.total} alunos • ${this.snapshot.groups.length} turmas • Lista capturada às ${this.formatTime(this.snapshot.generatedAt)}.` +
        (this.snapshot.offline ? ' Sem conexão: os dados locais podem estar incompletos.' : '') +
        ' Para incluir novas chegadas ou correções, feche e abra esta janela novamente.';
      select.disabled = button.disabled = false;
    } catch (error) {
      status.textContent = error.message || 'Não foi possível preparar a lista. Tente novamente.';
    } finally {
      this.loading = false;
    }
  }

  close() {
    this.revision++;
    this.snapshot = null;
    document.getElementById('modal-queue-print').classList.remove('active');
  }

  formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  renderDocument(snapshot, selection = 'all') {
    const groups = selection === 'all' ? snapshot.groups :
      snapshot.groups.filter((group, index) => String(index) === selection);
    if (!groups.length) throw new Error('Selecione uma turma válida.');
    const esc = value => this.escape(value);
    const date = esc(snapshot.date.split('-').reverse().join('/'));
    const time = esc(this.formatTime(snapshot.generatedAt));
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Colocações por turma — ${date}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9edf2; color: #111; font-family: Arial, sans-serif; }
  .toolbar { padding: 16px; text-align: center; background: #17243a; color: white; }
  .toolbar button { padding: 12px 20px; font-size: 16px; cursor: pointer; border: 0; border-radius: 6px; }
  .toolbar p { margin: 10px 0 0; font-size: 14px; }
  .sheet { max-width: 210mm; margin: 20px auto; padding: 12mm; background: white; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.position { width: 32mm; }
  .heading { text-align: left; border: 0; padding: 0 0 7mm; }
  .school { font-size: 10pt; font-weight: normal; margin-bottom: 3mm; }
  h1 { font-size: 19pt; margin: 0 0 3mm; }
  .class-name { font-size: 16pt; margin-bottom: 3mm; }
  .date { font-size: 10pt; font-weight: normal; margin-bottom: 4mm; }
  .notice { padding: 3mm; border: 2px solid #111; font-size: 12pt; line-height: 1.4; }
  .labels th { font-size: 11pt; padding: 3mm 2mm; border-bottom: 2px solid #111; text-align: left; }
  .labels th:first-child { text-align: center; }
  td { border-bottom: 1px solid #aaa; padding: 2.5mm 2mm; overflow-wrap: anywhere; }
  td:first-child { font-size: 18pt; font-weight: bold; text-align: center; }
  td:last-child { font-size: 12pt; line-height: 1.3; }
  .footnote { font-size: 9pt; line-height: 1.4; margin-top: 5mm; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print {
    body { background: white; }
    .toolbar { display: none; }
    .sheet { max-width: none; margin: 0; padding: 0; }
    .sheet + .sheet { break-before: page; page-break-before: always; }
  }
</style></head><body>
<div class="toolbar">
  <button type="button" onclick="window.print()">Imprimir / Salvar em PDF</button>
  <p>Use papel A4, escala 100% e desative os cabeçalhos e rodapés do navegador.</p>
</div>
${groups.map(group => `<section class="sheet">
  <table><colgroup><col class="position"><col></colgroup><thead>
    <tr><th colspan="2" class="heading">
      <div class="school">Centro de Excelência Santos Dumont</div>
      <h1>FILA DO REFEITÓRIO</h1>
      <div class="class-name">${esc(group.grade)} — ${esc(group.turma)}</div>
      <div class="date">Data: ${date} • Lista gerada às ${time} • ${group.rows.length} alunos nesta turma</div>
      <div class="notice">Esta é sua colocação de chegada na fila geral.<br>Aguarde a chamada da equipe para entrar.</div>
    </th></tr>
    <tr class="labels"><th>Posição geral</th><th>Aluno</th></tr>
  </thead><tbody>
  ${group.rows.map(row => `<tr><td>${row.position}º</td><td>${esc(row.name)}</td></tr>`).join('\n')}
  </tbody></table>
  <p class="footnote">As posições são da fila geral da escola, não apenas desta turma.
  Esta lista registra as chegadas disponíveis no momento da geração, inclusive de alunos já atendidos.
  Novas entradas e sincronizações posteriores não aparecem nesta impressão.
  ${snapshot.offline ? '<strong>Gerada sem conexão; confirme os dados com a equipe.</strong>' : ''}</p>
</section>`).join('\n')}
</body></html>`;
  }

  preview() {
    if (!window.authManager?.isAdmin() || !this.snapshot?.total) return;
    const status = document.getElementById('queue-print-status');
    const selection = document.getElementById('queue-print-class').value;
    try {
      const html = this.renderDocument(this.snapshot, selection);
      // Open synchronously from the user's click to avoid popup blocking.
      const preview = window.open('', '_blank');
      if (!preview) {
        status.textContent = 'O navegador bloqueou a prévia. Permita pop-ups deste site e clique novamente.';
        return;
      }
      preview.document.open();
      preview.document.write(html);
      preview.document.close();
      preview.opener = null;
      preview.focus();
    } catch (error) {
      status.textContent = error.message || 'Não foi possível abrir a impressão.';
    }
  }
}

window.queuePrintController = new QueuePrintController();
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-open-queue-print')?.addEventListener('click', () => window.queuePrintController.open());
  document.getElementById('btn-close-queue-print')?.addEventListener('click', () => window.queuePrintController.close());
  document.getElementById('btn-preview-queue-print')?.addEventListener('click', () => window.queuePrintController.preview());
});
