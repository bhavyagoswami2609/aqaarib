/**
 * Aqaarib (أقارب) - Camera Hot Potato (Freeze Tag)
 * Fast-paced family game: A ticking camera timer counts down.
 * When it strikes ZERO, it snaps a photo and runs pose detection.
 * Whoever is caught inside the camera frame gets eliminated with photographic proof!
 */

// Shared Sound FX Engine
class HotPotatoAudioEngine {
  constructor() {
    this.ctx = null;
    this.voiceEnabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, startTime = 0, gainLevel = 0.15) {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
      gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + startTime);
      osc.stop(this.ctx.currentTime + startTime + duration);
    } catch (e) {
      console.warn(e);
    }
  }

  playTick(pitch = 800) {
    this.playTone(pitch, 'square', 0.08, 0, 0.18);
  }

  playShutterSound() {
    // Crisp camera mechanical shutter sound
    this.playTone(1800, 'sine', 0.04, 0, 0.25);
    this.playTone(900, 'square', 0.08, 0.04, 0.22);
    this.playTone(2200, 'sine', 0.06, 0.12, 0.25);
  }

  playCaughtBuzzer() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch (e) {
      console.warn(e);
    }
  }

  playSafeChime() {
    this.playTone(523.25, 'sine', 0.2, 0, 0.18);
    this.playTone(659.25, 'sine', 0.25, 0.08, 0.18);
    this.playTone(783.99, 'sine', 0.35, 0.16, 0.22);
  }

  speak(text) {
    if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const humanVoice = voices.find(v => 
        (v.lang.startsWith('en') || v.lang.includes('US') || v.lang.includes('GB')) &&
        (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Samantha') || 
         v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Serena') || 
         v.name.includes('Google US English') || v.name.includes('Arthur'))
      ) || voices.find(v => v.lang.startsWith('en'));

      if (humanVoice) utterance.voice = humanVoice;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn(e);
    }
  }
}

const hpAudio = new HotPotatoAudioEngine();

class CameraHotPotatoGame {
  constructor() {
    this.video = document.getElementById('webcam-video');
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.evidenceGallery = document.getElementById('evidence-gallery');

    // UI Buttons & Elements
    this.startBtn = document.getElementById('start-round-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.enableCamBtn = document.getElementById('enable-camera-btn');
    this.loadingOverlay = document.getElementById('camera-loading-overlay');
    this.cameraFlashLayer = document.getElementById('camera-flash-layer');
    this.shutterOverlay = document.getElementById('shutter-overlay');
    this.timerSelect = document.getElementById('timer-duration-select');
    this.timerCountdownDisplay = document.getElementById('timer-countdown-display');
    this.gameStatusBadge = document.getElementById('game-status-badge');
    this.statusText = document.getElementById('status-text');
    this.playersDetectedCount = document.getElementById('players-detected-count');
    this.roundsPlayedCount = document.getElementById('rounds-played-count');
    this.modelStatusText = document.getElementById('model-status-text');
    this.voiceToggleBtn = document.getElementById('toggle-voice-btn');
    this.voiceIcon = document.getElementById('voice-icon');
    this.voiceText = document.getElementById('voice-text');

    // Pose & Camera Engine
    this.detector = null;
    this.isCameraActive = false;
    this.isModelLoaded = false;
    this.isRoundRunning = false;
    this.currentPoses = [];

    // Timer & Game State
    this.countdownTimer = null;
    this.timeRemaining = 5.0;
    this.totalDuration = 5.0;
    this.roundsPlayed = 0;
    this.evidenceList = [];

    this.initEventListeners();
    this.initPoseDetector();
  }

  initEventListeners() {
    this.enableCamBtn.addEventListener('click', () => {
      hpAudio.init();
      this.setupCamera();
    });

    this.startBtn.addEventListener('click', () => {
      hpAudio.init();
      if (!this.isCameraActive) {
        this.setupCamera().then(() => this.startRound());
      } else {
        this.startRound();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.resetGame();
    });

    this.voiceToggleBtn.addEventListener('click', () => {
      hpAudio.voiceEnabled = !hpAudio.voiceEnabled;
      if (hpAudio.voiceEnabled) {
        this.voiceIcon.innerText = 'volume_up';
        this.voiceText.innerText = 'Voice On';
      } else {
        this.voiceIcon.innerText = 'volume_off';
        this.voiceText.innerText = 'Muted';
      }
    });
  }

  async initPoseDetector() {
    try {
      if (window.poseDetection) {
        const detectorConfig = {
          modelType: window.poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
          enableTracking: true,
          trackerType: window.poseDetection.TrackerType.BoundingBox
        };
        this.detector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          detectorConfig
        );
        this.isModelLoaded = true;
        this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#8A9A86]">check_circle</span> AI Person Detector Ready`;
      }
    } catch (e) {
      console.warn('Pose engine load warning:', e);
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#DDA74F]">warning</span> Basic Vision Active`;
    }
  }

  async setupCamera() {
    this.enableCamBtn.disabled = true;
    this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">sync</span><span>Starting Camera...</span>`;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      this.video.srcObject = stream;

      await new Promise(resolve => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      this.isCameraActive = true;
      this.loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => this.loadingOverlay.classList.add('hidden'), 350);

      this.canvas.width = this.video.videoWidth || 1280;
      this.canvas.height = this.video.videoHeight || 720;

      requestAnimationFrame(this.renderLoop.bind(this));
    } catch (err) {
      alert('Camera access is required for Hot Potato. Please grant permission in your browser.');
      this.enableCamBtn.disabled = false;
      this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">videocam</span><span>Enable Camera</span>`;
    }
  }

  startRound() {
    if (this.isRoundRunning) return;
    this.isRoundRunning = true;
    this.startBtn.disabled = true;

    // Read timer duration
    this.totalDuration = parseFloat(this.timerSelect.value) || 5.0;
    this.timeRemaining = this.totalDuration;

    this.gameStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E06D53]/15 text-[#E06D53] text-xs font-label font-bold uppercase tracking-wider animate-pulse';
    this.gameStatusBadge.innerText = '💣 Hot Potato Ticking!';
    this.statusText.innerText = 'Pass the potato and dive out of the camera frame!';

    hpAudio.speak(`Round starting! ${this.totalDuration} seconds! Run!`);

    const intervalStep = 100;
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    let lastBeepSec = Math.ceil(this.timeRemaining);

    this.countdownTimer = setInterval(() => {
      this.timeRemaining = Math.max(0, this.timeRemaining - (intervalStep / 1000));
      this.timerCountdownDisplay.innerText = this.timeRemaining.toFixed(1) + 's';

      const currentSec = Math.ceil(this.timeRemaining);
      if (currentSec !== lastBeepSec && currentSec > 0) {
        lastBeepSec = currentSec;
        // Faster, higher pitch as time runs out
        const freq = 600 + (this.totalDuration - currentSec) * 150;
        hpAudio.playTick(freq);
      }

      if (this.timeRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.capturePhotoAndEvaluate();
      }
    }, intervalStep);
  }

  async capturePhotoAndEvaluate() {
    this.isRoundRunning = false;
    this.startBtn.disabled = false;
    this.roundsPlayed++;
    this.roundsPlayedCount.innerText = this.roundsPlayed;

    // Flash screen effect & shutter sound
    hpAudio.playShutterSound();
    this.cameraFlashLayer.classList.remove('opacity-0');
    setTimeout(() => {
      this.cameraFlashLayer.classList.add('opacity-0');
    }, 180);

    // Grab current snapshot on an offscreen canvas
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = this.canvas.width;
    snapCanvas.height = this.canvas.height;
    const snapCtx = snapCanvas.getContext('2d');
    snapCtx.drawImage(this.video, 0, 0, snapCanvas.width, snapCanvas.height);

    // Detect who is in frame at the exact shutter moment
    let detectedPersons = [];
    if (this.detector && this.isModelLoaded) {
      try {
        const rawPoses = await this.detector.estimatePoses(snapCanvas, { maxPoses: 4, flipHorizontal: false });
        detectedPersons = rawPoses.filter(p => {
          if (!p || p.score < 0.35) return false;
          const confPoints = p.keypoints.filter(kp => kp.score > 0.35).length;
          return confPoints >= 4;
        });
      } catch (e) {
        console.warn(e);
      }
    }

    // Annotate snapshot with red visual evidence highlights
    snapCtx.save();
    if (detectedPersons.length > 0) {
      detectedPersons.forEach((person, idx) => {
        // Find person bounding box
        let minX = 9999, minY = 9999, maxX = -9999, maxY = -9999;
        person.keypoints.forEach(kp => {
          if (kp.score > 0.25) {
            minX = Math.min(minX, kp.x);
            minY = Math.min(minY, kp.y);
            maxX = Math.max(maxX, kp.x);
            maxY = Math.max(maxY, kp.y);
          }
        });

        const pad = 24;
        const boxX = Math.max(10, minX - pad);
        const boxY = Math.max(10, minY - pad);
        const boxW = Math.min(snapCanvas.width - boxX - 10, (maxX - minX) + pad * 2);
        const boxH = Math.min(snapCanvas.height - boxY - 10, (maxY - minY) + pad * 2);

        // Highlight box
        snapCtx.strokeStyle = '#EF4444';
        snapCtx.lineWidth = 6;
        snapCtx.strokeRect(boxX, boxY, boxW, boxH);

        // Semi-transparent red fill
        snapCtx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        snapCtx.fillRect(boxX, boxY, boxW, boxH);

        // Label Tag
        snapCtx.fillStyle = '#EF4444';
        snapCtx.fillRect(boxX, Math.max(0, boxY - 32), 140, 32);
        snapCtx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
        snapCtx.fillStyle = '#FFFFFF';
        snapCtx.fillText(`CAUGHT #${idx + 1}`, boxX + 12, Math.max(0, boxY - 32) + 22);
      });

      // Big Stamp on top
      snapCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      snapCtx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      snapCtx.fillText('📸 VISUAL EVIDENCE: CAUGHT!', 24, 50);

      hpAudio.playCaughtBuzzer();
      hpAudio.speak(`${detectedPersons.length} player caught in frame! Eliminated!`);

      this.gameStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-label font-bold uppercase tracking-wider';
      this.gameStatusBadge.innerText = `🚨 ${detectedPersons.length} Player Caught!`;
      this.statusText.innerText = `Visual evidence recorded! Player caught in the lens is out!`;

    } else {
      // Nobody in frame: SAFE!
      snapCtx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      snapCtx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      snapCtx.fillText('✨ CLEAN FRAME: ALL SAFE!', 24, 50);

      hpAudio.playSafeChime();
      hpAudio.speak('Clean frame! Everyone escaped in time! Nobody eliminated!');

      this.gameStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-label font-bold uppercase tracking-wider';
      this.gameStatusBadge.innerText = '✨ Safe! Zero Caught';
      this.statusText.innerText = 'Everyone dove out in time! No one eliminated.';
    }
    snapCtx.restore();

    // Store evidence photo
    const photoDataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);
    this.addEvidenceCard(photoDataUrl, detectedPersons.length, this.roundsPlayed);
  }

  addEvidenceCard(imgUrl, caughtCount, roundNum) {
    const card = document.createElement('div');
    card.className = 'bg-[#FFFFFF] p-3 rounded-2xl border border-[#E9E1DC] shadow-sm flex flex-col justify-between group';

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const badgeHtml = caughtCount > 0
      ? `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-label font-bold">Caught (${caughtCount})</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-label font-bold">Clean Escape</span>`;

    card.innerHTML = `
      <div class="relative aspect-video rounded-xl overflow-hidden bg-stone-100 mb-2 border border-[#E9E1DC]">
        <img src="${imgUrl}" class="w-full h-full object-cover"/>
        <div class="absolute top-2 right-2">${badgeHtml}</div>
      </div>
      <div class="flex items-center justify-between text-xs font-label text-[#6E6761]">
        <span class="font-bold text-[#1E1B18]">Round #${roundNum}</span>
        <span>${timeStr}</span>
      </div>
      <div class="mt-2 pt-2 border-t border-[#E9E1DC] flex justify-between items-center">
        <a href="${imgUrl}" download="Aqaarib_Evidence_Round_${roundNum}.jpg" class="text-[#E06D53] hover:underline font-semibold text-xs flex items-center gap-1">
          <span class="material-symbols-outlined text-[15px]">download</span> Save Photo
        </a>
      </div>
    `;

    // Prepend to evidence gallery
    if (this.evidenceGallery.children[0] && this.evidenceGallery.children[0].innerText.includes('No photos taken yet')) {
      this.evidenceGallery.innerHTML = '';
    }
    this.evidenceGallery.prepend(card);
  }

  resetGame() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.isRoundRunning = false;
    this.startBtn.disabled = false;
    this.timeRemaining = parseFloat(this.timerSelect.value) || 5.0;
    this.timerCountdownDisplay.innerText = this.timeRemaining.toFixed(1) + 's';
    this.gameStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#8A9A86]/15 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider';
    this.gameStatusBadge.innerText = 'Ready to Play';
    this.statusText.innerText = 'Choose your timer duration and start the countdown!';
  }

  async renderLoop() {
    if (!this.isCameraActive) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Draw live video stream
    this.ctx.drawImage(this.video, 0, 0, cw, ch);

    // Live AI pose tracking
    if (this.detector && this.isModelLoaded) {
      try {
        const rawPoses = await this.detector.estimatePoses(this.video, { maxPoses: 4, flipHorizontal: false });
        this.currentPoses = rawPoses.filter(p => {
          if (!p || p.score < 0.35) return false;
          return p.keypoints.filter(kp => kp.score > 0.35).length >= 4;
        });
      } catch (e) {}
    }

    // Update real-time count
    this.playersDetectedCount.innerText = this.currentPoses.length;

    // Draw live target boxes around anyone currently in frame
    this.currentPoses.forEach((person, idx) => {
      let minX = 9999, minY = 9999, maxX = -9999, maxY = -9999;
      person.keypoints.forEach(kp => {
        if (kp.score > 0.25) {
          minX = Math.min(minX, kp.x);
          minY = Math.min(minY, kp.y);
          maxX = Math.max(maxX, kp.x);
          maxY = Math.max(maxY, kp.y);
        }
      });

      const pad = 18;
      const x = Math.max(8, minX - pad);
      const y = Math.max(8, minY - pad);
      const w = Math.min(cw - x - 8, (maxX - minX) + pad * 2);
      const h = Math.min(ch - y - 8, (maxY - minY) + pad * 2);

      this.ctx.save();
      this.ctx.strokeStyle = this.isRoundRunning ? '#E06D53' : '#8A9A86';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(x, y, w, h);

      // Person pill tag
      this.ctx.fillStyle = this.isRoundRunning ? 'rgba(224, 109, 83, 0.9)' : 'rgba(30, 27, 24, 0.85)';
      this.ctx.beginPath();
      this.ctx.roundRect(x, Math.max(4, y - 24), 84, 20, 10);
      this.ctx.fill();

      this.ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`TARGET #${idx + 1}`, x + 42, Math.max(4, y - 24) + 14);
      this.ctx.restore();
    });

    requestAnimationFrame(this.renderLoop.bind(this));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.hotPotatoGame = new CameraHotPotatoGame();
});
