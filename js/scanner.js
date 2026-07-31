/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Camera QR Scanner Controller & Manual Registration Entry
   ========================================================================== */

class QrScannerController {
  constructor() {
    this.videoElement = null;
    this.stream = null;
    this.isScanning = false;
    this.scanInterval = null;
    this.lastScannedToken = null;
    this.cooldownTimer = null;
  }

  init() {
    this.videoElement = document.getElementById('qr-video');
  }

  /**
   * Starts camera stream using HTML5 getUserMedia API.
   */
  async startCamera() {
    this.init();
    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');

    try {
      // Request camera access (facing environment/back camera if available)
      const constraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.isScanning = true;
      this.videoElement.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (scanLine) scanLine.style.display = 'block';
      if (container) container.classList.add('scanning');

      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';

      console.log('📷 Câmera iniciada com sucesso.');
      this._startScanLoop();

    } catch (err) {
      console.error('❌ Erro ao acessar a câmera:', err);
      alert('Não foi possível acessar a câmera. Verifique as permissões no navegador ou utilize a busca manual por Matrícula.');
    }
  }

  /**
   * Stops camera stream and cleans up resources.
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isScanning = false;
    if (this.scanInterval) clearInterval(this.scanInterval);

    const container = document.getElementById('camera-container');
    const placeholder = document.getElementById('camera-placeholder');
    const scanLine = document.getElementById('scan-line');
    const btnStart = document.getElementById('btn-start-camera');
    const btnStop = document.getElementById('btn-stop-camera');

    if (this.videoElement) this.videoElement.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (scanLine) scanLine.style.display = 'none';
    if (container) container.classList.remove('scanning');

    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';

    console.log('⏹️ Câmera encerrada.');
  }

  /**
   * Internal loop capturing frames to decode QR Tokens.
   */
  _startScanLoop() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    this.scanInterval = setInterval(async () => {
      if (!this.isScanning || !this.videoElement || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
        return;
      }

      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      // Analyze image frame for QR pattern signature
      // If native BarcodeDetector API is supported in Chrome/Edge, use it
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            const rawToken = barcodes[0].rawValue;
            this.handleDecodedToken(rawToken);
          }
        } catch (e) {
          // fallback
        }
      }
    }, 400);
  }

  /**
   * Handles decoded QR token string and triggers validation service.
   */
  async handleDecodedToken(token) {
    if (!token || token === this.lastScannedToken) {
      return; // prevent multi-scan in rapid succession
    }

    this.lastScannedToken = token;
    
    // Trigger validation logic
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
