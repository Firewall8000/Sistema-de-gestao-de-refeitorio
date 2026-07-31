/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Web Audio API Synthetic Sound Feedback Engine
   ========================================================================== */

class AudioFeedbackService {
  constructor() {
    this.audioCtx = null;
  }

  _initContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Plays a high-pitch double beep for successful validation (Green).
   */
  playSuccessSound() {
    try {
      this._initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // Note 1: High E (659Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Note 2: High A (880Hz)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.1);
      gain2.gain.setValueAtTime(0.3, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.28);

    } catch (err) {
      console.warn('⚠️ Não foi possível reproduzir som de sucesso:', err);
    }
  }

  /**
   * Plays a low-pitch double buzz for blocked validation (Red).
   */
  playErrorSound() {
    try {
      this._initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // Buzz 1: Low Sawtooth 150Hz
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Buzz 2: Low Sawtooth 120Hz
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(120, now + 0.22);
      gain2.gain.setValueAtTime(0.4, now + 0.22);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.22);
      osc2.stop(now + 0.45);

    } catch (err) {
      console.warn('⚠️ Não foi possível reproduzir som de erro:', err);
    }
  }
}

const audioFeedback = new AudioFeedbackService();
window.audioFeedback = audioFeedback;
