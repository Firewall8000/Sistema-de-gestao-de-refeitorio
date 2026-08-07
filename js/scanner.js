/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Dual-Engine QR Scanner Controller (Html5Qrcode + jsQR Integration)
   ========================================================================== */

class QrScannerController {
  constructor() {
    this.html5Qrcode = null;
    this.isScanning = false;
    this.lastScannedToken = null;
    this.cooldownTimer = null;
    this.videoStream = null;
    this.jsQrInterval = null;
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

      // Ensure reader container element exists
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
          fps: 12,
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
          () => {} // silent frame scan callback
        );
        this.isScanning = true;
      } else {
        // Fallback HTML5 video + jsQR decoder
        await this._startJsQrCameraFallback(container);
      }

    } catch (err) {
      console.error('❌ Erro ao iniciar scanner de QR Code:', err);
      // Fallback try with jsQR
      try {
        await this._startJsQrCameraFallback(container);
      } catch (fallbackErr) {
        if (typeof window.showAlertModal === 'function') {
          window.showAlertModal({
            title: 'Acesso à Câmera',
            message: 'Não foi possível iniciar a câmera. Verifique as permissões do navegador ou utilize a busca manual por Matrícula.',
            type: 'warning'
          });
        }
        this.stopCamera();
      }
    }
  }

  /**
   * Fallback camera loop using jsQR decoder engine.
   */
  async _startJsQrCameraFallback(container) {
    const constraints = { video: { facingMode: { ideal: 'environment' } } };
    this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    let video = document.getElementById('qr-video');
    if (!video) {
      video = document.createElement('video');
      video.id = 'qr-video';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      if (container) container.appendChild(video);
    }
    video.srcObject = this.videoStream;
    await video.play();
    this.isScanning = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    this.jsQrInterval = setInterval(() => {
      if (!this.isScanning || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });
        if (code && code.data) {
          this.handleDecodedToken(code.data);
        }
      }
    }, 250);
  }

  /**
   * Stops camera stream and cleans up resources.
   */
  async stopCamera() {
    this.isScanning = false;

    if (this.jsQrInterval) {
      clearInterval(this.jsQrInterval);
      this.jsQrInterval = null;
    }

    if (this.html5Qrcode) {
      try {
        await this.html5Qrcode.stop();
        this.html5Qrcode.clear();
      } catch (e) {}
      this.html5Qrcode = null;
    }

    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }

    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');
    const readerDiv = document.getElementById('html5qr-reader');
    const rawVideo = document.getElementById('qr-video');

    if (readerDiv) readerDiv.remove();
    if (rawVideo) rawVideo.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (scanLine) scanLine.style.display = 'none';
    if (container) container.classList.remove('scanning');

    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
  }

  /**
   * Decodes a QR Code from an uploaded image file (Dual Engine: Html5Qrcode + jsQR).
   */
  async scanImageFile(file) {
    if (!file) return;

    if (typeof window.showLoadingModal === 'function') {
      window.showLoadingModal('Processando imagem do QR Code...', 'Decodificando Imagem');
    }

    try {
      // 1. Try Html5Qrcode scanFile engine
      if (typeof Html5Qrcode !== 'undefined') {
        try {
          let tempDiv = document.getElementById('temp-qr-reader');
          if (!tempDiv) {
            tempDiv = document.createElement('div');
            tempDiv.id = 'temp-qr-reader';
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
          }
          const html5QrInstance = new Html5Qrcode('temp-qr-reader');
          const decodedText = await html5QrInstance.scanFile(file, true);
          try { html5QrInstance.clear(); } catch (e) {}
          if (decodedText) {
            if (typeof window.hideLoadingModal === 'function') window.hideLoadingModal();
            await this.handleDecodedToken(decodedText);
            return;
          }
        } catch (hErr) {
          console.warn('⚠️ Html5Qrcode scanFile falhou, tentando motor jsQR...', hErr);
        }
      }

      // 2. Try jsQR canvas engine
      const decodedToken = await this._scanImageWithJsQr(file);
      if (decodedToken) {
        if (typeof window.hideLoadingModal === 'function') window.hideLoadingModal();
        await this.handleDecodedToken(decodedToken);
        return;
      }

      throw new Error('Nenhum decodificador conseguiu ler o QR Code da imagem.');

    } catch (err) {
      if (typeof window.hideLoadingModal === 'function') window.hideLoadingModal();
      console.error('❌ Erro ao decodificar imagem de QR Code:', err);
      if (typeof window.showAlertModal === 'function') {
        window.showAlertModal({
          title: 'Leitura de Imagem',
          message: 'Não foi possível decodificar um QR Code válido na imagem selecionada. Tente gerar um novo crachá no sistema.',
          type: 'warning'
        });
      }
    }
  }

  /**
   * Helper to decode image file using jsQR canvas engine.
   */
  _scanImageWithJsQr(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              return resolve(code.data);
            }
          }
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
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
