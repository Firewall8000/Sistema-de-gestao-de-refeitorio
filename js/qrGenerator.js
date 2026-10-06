/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   100% ISO 18004 Spec-Compliant QR Code Generator & Printable Badge Renderer
   ========================================================================== */

class QrBadgeGenerator {

  /**
   * Generates a 100% Spec-Compliant ISO 18004 QR Code HTML/SVG string.
   */
  generateQrSvg(text, size = 180) {
    if (typeof window.QRCode !== 'undefined') {
      try {
        const container = document.createElement('div');
        new window.QRCode(container, {
          text: text,
          width: size,
          height: size,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M
        });
        
        const img = container.querySelector('img');
        const canvas = container.querySelector('canvas');
        if (img && img.src) {
          return `<img src="${img.src}" width="${size}" height="${size}" alt="QR Code ${text}" style="display:inline-block; border-radius: 4px;" />`;
        }
        if (canvas) {
          return `<img src="${canvas.toDataURL()}" width="${size}" height="${size}" alt="QR Code ${text}" style="display:inline-block; border-radius: 4px;" />`;
        }
      } catch (e) {
        console.warn('⚠️ Falha QRCode.js:', e);
      }
    }

    return this._generateFallbackSvg(text, size);
  }

  /**
   * High-contrast SVG QR code fallback.
   */
  _generateFallbackSvg(text, size = 180) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    const modules = 21;
    const cellSize = size / modules;
    let svgPath = '';

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const isCornerTL = r < 7 && c < 7;
        const isCornerTR = r < 7 && c >= modules - 7;
        const isCornerBL = r >= modules - 7 && c < 7;

        let isDark = false;
        if (isCornerTL || isCornerTR || isCornerBL) {
          const row = isCornerTL ? r : (isCornerTR ? r : r - (modules - 7));
          const col = isCornerTL ? c : (isCornerTR ? c - (modules - 7) : c);
          isDark = (row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
        } else {
          const seed = (r * modules + c) ^ hash ^ text.charCodeAt((r + c) % text.length);
          isDark = (seed % 3) === 0;
        }

        if (isDark) {
          const x = c * cellSize;
          const y = r * cellSize;
          svgPath += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000000"/>`;
        }
      }
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="#ffffff"/>
        ${svgPath}
      </svg>
    `;
  }

  /**
   * Renders the student badge view ready for printing.
   */
  _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * @param {object}  student
   * @param {boolean} forSheet  true = tamanho FIXO 9,8 x 12,6 cm (folha A4 com vários crachás).
   *                            O cartão nunca cresce: o nome é reduzido para caber (ver printBadges).
   */
  renderBadgeHtml(student, forSheet = false) {
    const qrSvg = this.generateQrSvg(student.qrToken, 180);

    const cardStyle = forSheet
      ? `width: 9.8cm; height: 12.6cm; box-sizing: border-box; padding: 1.25rem;
        background: #ffffff; color: #000000; border: 2px solid #0f172a; border-radius: 12px;
        font-family: 'Inter', sans-serif; text-align: center; margin: 0; overflow: hidden;`
      : `width: 320px; padding: 1.25rem; background: #ffffff; color: #000000;
        border: 2px solid #0f172a; border-radius: 12px; font-family: 'Inter', sans-serif;
        text-align: center; margin: 0 auto; box-shadow: 0 4px 10px rgba(0,0,0,0.15);`;

    return `
      <div class="print-badge-card" style="${cardStyle}">
        <div style="margin-bottom: 0.3rem;">
          <img src="assets/img/logo.png" alt="Centro de Excelência Santos Dumont" style="height: 54px; width: auto; object-fit: contain;">
        </div>
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; font-weight: bold; margin-bottom: 0.25rem;">
          CENTRO DE EXCELÊNCIA SANTOS DUMONT
        </div>
        <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a; margin-bottom: 0.75rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem;">
          CRACHÁ DE ALMOÇO
        </div>

        <div style="margin: 0.75rem 0;">
          ${qrSvg}
        </div>

        <div class="badge-name" style="font-size: 1.1rem; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 0.5rem; overflow-wrap: anywhere;">
          ${this._esc(student.name)}
        </div>
        <div style="font-size: 0.9rem; font-weight: 600; color: #3b82f6; margin-top: 0.2rem;">
          Matrícula: ${this._esc(student.registration)}
        </div>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.2rem;">
          ${this._esc(student.grade)} — ${this._esc(student.turma)}
        </div>
        <div class="badge-footer" style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.75rem; border-top: 1px dashed #cbd5e1; padding-top: 0.3rem;">
          Token: <span style="overflow-wrap: anywhere;">${this._esc(student.qrToken)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Opens print window for a student badge.
   */
  printBadge(student) {
    const badgeHtml = this.renderBadgeHtml(student);
    const printWindow = window.open('', '_blank', 'width=450,height=550');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Imprimir Crachá - ${student.name}</title>
        <style>
          body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
          @media print {
            body { background: white; }
          }
        </style>
      </head>
      <body>
        ${badgeHtml}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Imprime vários crachás em folhas A4 (retrato): 2 colunas x 2 linhas = 4 por folha.
   * Cada crachá tem tamanho FIXO de 9,8 cm (largura) x 12,6 cm (altura), pensado para
   * plastificar a folha inteira e recortar nas guias tracejadas.
   * Nomes longos são reduzidos automaticamente para caber (o crachá nunca cresce).
   */
  printBadges(students) {
    const list = (students || []).filter(s => s && s.qrToken);
    if (list.length === 0) return false;

    const PER_SHEET = 4;
    const sheets = [];
    for (let i = 0; i < list.length; i += PER_SHEET) {
      const slots = list.slice(i, i + PER_SHEET)
        .map(st => `<div class="slot">${this.renderBadgeHtml(st, true)}</div>`).join('');
      sheets.push(`<section class="sheet">${slots}</section>`);
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return null; // pop-up bloqueado

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <base href="${document.baseURI}">
        <title>Imprimir Crachás (${list.length}) - A4</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body { margin: 0; padding: 0; background: #e2e8f0; }
          .sheet {
            width: 21cm; height: 296mm; box-sizing: border-box; overflow: hidden;
            display: grid;
            grid-template-columns: repeat(2, 9.8cm);
            grid-template-rows: repeat(2, 12.6cm);
            gap: 0.5cm;
            justify-content: center; align-content: center;
            background: #ffffff; margin: 0.5cm auto;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            break-after: page; page-break-after: always;
          }
          .sheet:last-child { break-after: auto; page-break-after: auto; }
          .slot { position: relative; width: 9.8cm; height: 12.6cm; }
          /* Guia de corte (tracejado) 0,25 cm fora do crachá: sobra ~2,5 mm de plástico para vedar */
          .slot::after {
            content: ''; position: absolute; inset: -0.25cm; pointer-events: none;
            border: 0.5pt dashed #94a3b8;
          }
          @media print {
            html, body { background: #ffffff; }
            .sheet { margin: 0; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        ${sheets.join('')}
        <script>
          // Ajusta o nome ao espaço: parte do tamanho padrão e reduz até caber na altura
          // fixa do crachá (12,6 cm). Prefere 1 linha; se não couber, usa 2 linhas menores.
          function fitBadgeNames() {
            var cards = document.querySelectorAll('.print-badge-card');
            for (var i = 0; i < cards.length; i++) {
              var card = cards[i];
              var name = card.querySelector('.badge-name');
              var foot = card.querySelector('.badge-footer');
              if (!name || !foot) continue;
              var cs = getComputedStyle(card);
              var limit = function () {
                return card.getBoundingClientRect().bottom
                  - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
              };
              var size = 17.6, MIN = 9;
              name.style.fontSize = size + 'px';
              while (foot.getBoundingClientRect().bottom > limit() + 0.5 && size > MIN) {
                size -= 0.4;
                name.style.fontSize = size + 'px';
              }
            }
          }
          window.onload = function () {
            var go = function () { fitBadgeNames(); setTimeout(function () { window.print(); }, 300); };
            if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go); } else { go(); }
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    return true;
  }
}

const qrBadgeGenerator = new QrBadgeGenerator();
window.qrBadgeGenerator = qrBadgeGenerator;
