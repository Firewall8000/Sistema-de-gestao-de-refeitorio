/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Camera QR Scanner Controller (Universal Html5Qrcode Integration)
   ========================================================================== */

class QrScannerController {
  constructor() {
    this.html5Qrcode = null;
    this.isScanning = false;
    this.lastScannedToken = null;
    this.cooldownTimer = null;
    this.videoElement = null;
    this.stream = null;
  }

  /**
   * Starts camera stream and decodes QR tokens using universal Html5Qrcode engine.
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

      // Ensure video element exists for scanner rendering
      let videoElem = document.getElementById('qr-video');
      if (!videoElem) {
        videoElem = document.createElement('video');
        videoElem.id = 'qr-video';
        videoElem.style.width = '100%';
        videoElem.style.height = '100%';
        videoElem.style.objectFit = 'cover';
        if (container) container.appendChild(videoElem);
      }
      this.videoElement = videoElem;
      this.videoElement.style.display = 'block';

      // Check if Html5Qrcode library is loaded
      if (typeof Html5Qrcode !== 'undefined') {
        // Create an internal div target for Html5Qrcode if needed
        let readerDiv = document.getElementById('html5qr-reader');
        if (!readerDiv) {
          readerDiv = document.createElement('div');
          readerDiv.id = 'html5qr-reader';
          readerDiv.style.width = '100%';
          readerDiv.style.height = '100%';
          if (container) container.appendChild(readerDiv);
        }
        this.videoElement.style.display = 'none'; // hide raw video, use readerDiv

        this.html5Qrcode = new Html5Qrcode('html5qr-reader');
        const qrConfig = { fps: 10, qrbox: { width: 220, height: 220 } };

        await this.html5Qrcode.start(
          { facingMode: 'environment' },
          qrConfig,
          (decodedText) => this.handleDecodedToken(decodedText),
          () => {} // silent scan frame error handler
        );
        this.isScanning = true;
        console.log('📷 Scanner Html5Qrcode iniciado com sucesso.');
      } else {
        // Fallback: Use standard navigator.mediaDevices.getUserMedia
        const constraints = { video: { facingMode: { ideal: 'environment' } } };
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
        this.isScanning = true;
        this._startFallbackScanLoop();
      }

    } catch (err) {
      console.error('❌ Erro ao acessar a câmera:', err);
      if (typeof window.showAlertModal === 'function') {
        window.showAlertModal({
          title: 'Acesso à Câmera',
          message: 'Não foi possível acessar a câmera do dispositivo. Verifique a permissão do navegador ou utilize a busca manual por Matrícula.',
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

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');
    const readerDiv = document.getElementById('html5qr-reader');

    if (readerDiv) readerDiv.remove();
    if (this.videoElement) this.videoElement.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (scanLine) scanLine.style.display = 'none';
    if (container) container.classList.remove('scanning');

    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';

    console.log('⏹️ Câmera encerrada.');
  }

  /**
   * Fallback loop for browsers without Html5Qrcode.
   */
  _startFallbackScanLoop() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const interval = setInterval(() => {
      if (!this.isScanning || !this.videoElement) {
        clearInterval(interval);
        return;
      }
      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
      }
    }, 400);
  }

  /**
   * Handles decoded QR token string and triggers validation service.
   */
  async handleDecodedToken(token) {
    if (!token || token === this.lastScannedToken) {
      return; // prevent rapid multi-scan of the same code
    }

    this.lastScannedToken = token;
    console.log('🔍 QR Code Lido:', token);
    
    // Trigger meal validation
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
