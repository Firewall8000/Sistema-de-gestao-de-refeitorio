/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Camera QR Scanner Controller & File Upload Decoder (Html5Qrcode Engine)
   ========================================================================== */

class QrScannerController {
  constructor() {
    this.html5Qrcode = null;
    this.isScanning = false;
    this.lastScannedToken = null;
    this.cooldownTimer = null;
  }

  /**
   * Initializes and starts camera stream for QR Code decoding.
   */
  async startCamera() {
    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');

    if (this.isScanning) return;

    try {
      if (placeholder) placeholder.style.display = 'none';
      if (scanLine) scanLine.style.display = 'block';
      if (container) container.classList.add('scanning');

      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';

      // Ensure scanner element exists
      let readerDiv = document.getElementById('html5qr-reader');
      if (!readerDiv) {
        readerDiv = document.createElement('div');
        readerDiv.id = 'html5qr-reader';
        readerDiv.style.width = '100%';
        readerDiv.style.minHeight = '280px';
        if (container) container.appendChild(readerDiv);
      }

      if (typeof Html5Qrcode !== 'undefined') {
        this.html5Qrcode = new Html5Qrcode('html5qr-reader');

        const qrConfig = {
          fps: 12, // 10 to 15 FPS
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.floor(minDim * 0.85);
            return { width: boxSize, height: boxSize };
          },
          aspectRatio: 1.0,
          formatsToSupport: typeof Html5QrcodeSupportedFormats !== 'undefined' 
            ? [Html5QrcodeSupportedFormats.QR_CODE] 
            : undefined
        };

        // Prefer back camera (environment)
        await this.html5Qrcode.start(
          { facingMode: 'environment' },
          qrConfig,
          (decodedText) => this.handleDecodedToken(decodedText),
          () => {} // silent frame scan error callback
        );
        this.isScanning = true;
      } else {
        throw new Error('Biblioteca Html5Qrcode não encontrada.');
      }

    } catch (err) {
      console.error('❌ Erro ao iniciar scanner de QR Code:', err);
      if (typeof window.showAlertModal === 'function') {
        window.showAlertModal({
          title: 'Acesso à Câmera',
          message: 'Não foi possível iniciar a câmera. Verifique a permissão do navegador ou utilize a busca manual por Matrícula.',
          type: 'warning'
        });
      }
      this.stopCamera();
    }
  }

  /**
   * Stops camera stream and cleans up resources.
   */
  async stopCamera() {
    this.isScanning = false;

    if (this.html5Qrcode) {
      try {
        await this.html5Qrcode.stop();
        this.html5Qrcode.clear();
      } catch (e) {}
      this.html5Qrcode = null;
    }

    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');
    const readerDiv = document.getElementById('html5qr-reader');

    if (readerDiv) readerDiv.remove();
    if (placeholder) placeholder.style.display = 'block';
    if (scanLine) scanLine.style.display = 'none';
    if (container) container.classList.remove('scanning');

    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
  }

  /**
   * Decodes a QR Code from an uploaded image file (Test feature & Fallback).
   */
  async scanImageFile(file) {
    if (!file) return;

    try {
      if (typeof window.showLoadingModal === 'function') {
        window.showLoadingModal('Processando imagem do QR Code...', 'Decodificando Imagem');
      }

      let scannerInstance = this.html5Qrcode;
      let tempDivCreated = false;

      if (!scannerInstance && typeof Html5Qrcode !== 'undefined') {
        let tempDiv = document.getElementById('temp-qr-reader');
        if (!tempDiv) {
          tempDiv = document.createElement('div');
          tempDiv.id = 'temp-qr-reader';
          tempDiv.style.display = 'none';
          document.body.appendChild(tempDiv);
          tempDivCreated = true;
        }
        scannerInstance = new Html5Qrcode('temp-qr-reader');
      }

      if (scannerInstance && typeof scannerInstance.scanFile === 'function') {
        const decodedText = await scannerInstance.scanFile(file, true);
        if (typeof window.hideLoadingModal === 'function') window.hideLoadingModal();
        if (tempDivCreated && scannerInstance) {
          try { scannerInstance.clear(); } catch (e) {}
        }
        await this.handleDecodedToken(decodedText);
      } else {
        throw new Error('Mecanismo de decodificação de imagem indisponível.');
      }
    } catch (err) {
      if (typeof window.hideLoadingModal === 'function') window.hideLoadingModal();
      console.error('❌ Erro ao decodificar imagem de QR Code:', err);
      if (typeof window.showAlertModal === 'function') {
        window.showAlertModal({
          title: 'Leitura de Imagem',
          message: 'Não foi possível decodificar um QR Code válido na imagem selecionada.',
          type: 'warning'
        });
      }
    }
  }

  /**
   * Handles decoded QR token string and triggers validation service.
   */
  async handleDecodedToken(token) {
    if (!token || token === this.lastScannedToken) {
      return; // prevent rapid multi-scan of the same code
    }

    this.lastScannedToken = token;
    
    // Trigger meal validation service
    if (window.mealValidatorService) {
      await window.mealValidatorService.validateAndRecordMeal({ qrToken: token });
    }

    // Cooldown reset after 3 seconds
    clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      this.lastScannedToken = null;
    }, 3000);
  }
}

const qrScannerController = new QrScannerController();
window.qrScannerController = qrScannerController;
