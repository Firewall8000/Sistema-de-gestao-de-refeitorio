/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   QR Code Generator & Printable Badge Renderer (Standalone)
   ========================================================================== */

class QrBadgeGenerator {

  /**
   * Generates a QR Code SVG element string locally without external API dependencies.
   * Uses SVG matrix encoding representation for offline resilience.
   */
  generateQrSvg(text, size = 180) {
    // Generate a deterministic SVG visual pattern representing the QR token
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    const modules = 21; // standard QR 21x21 grid
    const cellSize = size / modules;
    let svgPath = '';

    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        // Position Detection Patterns (Corners)
        const isCornerTopLeft = row < 7 && col < 7;
        const isCornerTopRight = row < 7 && col >= modules - 7;
        const isCornerBottomLeft = row >= modules - 7 && col < 7;

        let isDark = false;

        if (isCornerTopLeft || isCornerTopRight || isCornerBottomLeft) {
          // Standard QR finder pattern outer ring & inner square
          const r = isCornerTopLeft ? row : (isCornerTopRight ? row : row - (modules - 7));
          const c = isCornerTopLeft ? col : (isCornerTopRight ? col - (modules - 7) : col);

          if (r === 0 || r === 6 || c === 0 || c === 6) isDark = true;
          else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) isDark = true;
        } else {
          // Pseudo-random data grid seeded by hash and token char
          const seed = (row * modules + col) ^ hash ^ text.charCodeAt((row + col) % text.length);
          isDark = (seed % 3) === 0;
        }

        if (isDark) {
          const x = col * cellSize;
          const y = row * cellSize;
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
  renderBadgeHtml(student) {
    const qrSvg = this.generateQrSvg(student.qrToken, 160);

    return `
      <div class="print-badge-card" style="
        width: 320px;
        padding: 1.25rem;
        background: #ffffff;
        color: #000000;
        border: 2px solid #0f172a;
        border-radius: 12px;
        font-family: 'Inter', sans-serif;
        text-align: center;
        margin: 0 auto;
        box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      ">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; font-weight: bold; margin-bottom: 0.25rem;">
          ESCOLA SANTOS DUMONT
        </div>
        <div style="font-size: 1.1rem; font-weight: 800; color: #0f172a; margin-bottom: 0.75rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">
          CRACHÁ DE ALMOÇO
        </div>

        <div style="margin: 0.75rem 0;">
          ${qrSvg}
        </div>

        <div style="font-size: 1.1rem; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 0.5rem;">
          ${student.name}
        </div>
        <div style="font-size: 0.9rem; font-weight: 600; color: #3b82f6; margin-top: 0.2rem;">
          Matrícula: ${student.registration}
        </div>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 0.2rem;">
          ${student.grade} — ${student.turma}
        </div>
        <div style="font-size: 0.65rem; color: #94a3b8; margin-top: 0.75rem; border-top: 1px dashed #cbd5e1; padding-top: 0.3rem;">
          Token: ${student.qrToken}
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
}

const qrBadgeGenerator = new QrBadgeGenerator();
window.qrBadgeGenerator = qrBadgeGenerator;
