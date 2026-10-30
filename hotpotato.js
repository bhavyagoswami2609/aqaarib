/**
 * Aqaarib (أقارب) - Camera Hot Potato (Freeze Tag)
 * Full-body & body-part AI tracking:
 * Dual Engine: COCO-SSD (Full Body / Person / Limbs / Hidden Face Detection)
 * + MoveNet (17-joint skeletal landmarks: arms, legs, ankles, wrists, torso, head)
 * If ANY body part is visible (e.g. leg, arm, covered head, torso), it is caught!
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

    // Dual Detection Engines: MoveNet + COCO-SSD
    this.poseDetector = null;
    this.cocoModel = null;
    this.isCameraActive = false;
    this.isModelLoaded = false;
    this.isRoundRunning = false;
    this.currentDetections = [];

    // Timer & Game State
    this.countdownTimer = null;
    this.timeRemaining = 5.0;
    this.totalDuration = 5.0;
    this.roundsPlayed = 0;

    this.initEventListeners();
    this.initDetectionEngines();
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

  async initDetectionEngines() {
    try {
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin text-[#DDA74F]">sync</span> Loading Full-Body AI Vision...`;

      // 1. MoveNet Pose Tracking (17 keypoints: ankles, knees, wrists, shoulders, torso)
      if (window.poseDetection) {
        this.poseDetector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          {
            modelType: window.poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
            enableTracking: true,
            trackerType: window.poseDetection.TrackerType.BoundingBox
          }
        );
      }

      // 2. COCO-SSD Full Body & Person Object Model (detects humans even with face covered or partially cut off)
      if (window.cocoSsd) {
        this.cocoModel = await window.cocoSsd.load({ base: 'mobilenet_v2' });
      }

      this.isModelLoaded = true;
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#8A9A86]">check_circle</span> Full Body & Limb AI Ready`;
    } catch (e) {
      console.warn('AI engine loading error:', e);
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#DDA74F]">warning</span> Basic Body Vision Active`;
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

    this.totalDuration = parseFloat(this.timerSelect.value) || 5.0;
    this.timeRemaining = this.totalDuration;

    this.statusText.innerText = 'Pass the potato and dive completely out of the frame!';
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

  // Detects any person, limb, leg, arm, or covered body in image
  async detectAnyBodyOrPart(imageSource, cw, ch) {
    const detectedBoxes = [];

    // Method 1: COCO-SSD Person Object Detection (Detects whole person, covered head, torso, partial frame)
    if (this.cocoModel) {
      try {
        const predictions = await this.cocoModel.detect(imageSource);
        predictions.forEach(pred => {
          if (pred.class === 'person' && pred.score > 0.35) {
            const [x, y, w, h] = pred.bbox;
            detectedBoxes.push({
              x: Math.max(0, x),
              y: Math.max(0, y),
              w: Math.min(cw - x, w),
              h: Math.min(ch - y, h),
              label: 'PERSON / BODY IN FRAME',
              score: pred.score
            });
          }
        });
      } catch (e) {
        console.warn(e);
      }
    }

    // Method 2: MoveNet Skeletal Keypoint & Limb Detection (detects legs, feet, hands, arms even if head is outside)
    if (this.poseDetector) {
      try {
        const poses = await this.poseDetector.estimatePoses(imageSource, { maxPoses: 4, flipHorizontal: false });
        poses.forEach(pose => {
          if (!pose.keypoints) return;
          // Look for any confident body keypoints: shoulders (5,6), elbows (7,8), wrists (9,10), hips (11,12), knees (13,14), ankles (15,16)
          const visibleKeypoints = pose.keypoints.filter(kp => kp.score > 0.28);
          if (visibleKeypoints.length >= 2) {
            let minX = 9999, minY = 9999, maxX = -9999, maxY = -9999;
            let limbNames = [];
            visibleKeypoints.forEach(kp => {
              minX = Math.min(minX, kp.x);
              minY = Math.min(minY, kp.y);
              maxX = Math.max(maxX, kp.x);
              maxY = Math.max(maxY, kp.y);
              if (kp.name) limbNames.push(kp.name.replace(/_/g, ' '));
            });

            // If not overlapping an existing coco-ssd box, add as limb detection
            const pad = 24;
            const bX = Math.max(0, minX - pad);
            const bY = Math.max(0, minY - pad);
            const bW = Math.min(cw - bX, (maxX - minX) + pad * 2);
            const bH = Math.min(ch - bY, (maxY - minY) + pad * 2);

            const isDuplicate = detectedBoxes.some(b => {
              const overlapX = Math.max(0, Math.min(b.x + b.w, bX + bW) - Math.max(b.x, bX));
              const overlapY = Math.max(0, Math.min(b.y + b.h, bY + bH) - Math.max(b.y, bY));
              return (overlapX * overlapY) > (bW * bH * 0.4);
            });

            if (!isDuplicate) {
              const sampleName = limbNames.length > 0 ? limbNames[0].toUpperCase() : 'BODY PART';
              detectedBoxes.push({
                x: bX,
                y: bY,
                w: bW,
                h: bH,
                label: `DETECTED ${sampleName}`,
                score: pose.score
              });
            }
          }
        });
      } catch (e) {
        console.warn(e);
      }
    }

    return detectedBoxes;
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

    // Grab current snapshot on offscreen canvas
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = this.canvas.width;
    snapCanvas.height = this.canvas.height;
    const snapCtx = snapCanvas.getContext('2d');
    snapCtx.drawImage(this.video, 0, 0, snapCanvas.width, snapCanvas.height);

    // Run Full-Body & Limb Detection on the snapshot
    const detectedTargets = await this.detectAnyBodyOrPart(snapCanvas, snapCanvas.width, snapCanvas.height);

    snapCtx.save();
    if (detectedTargets.length > 0) {
      // Highlight every caught body or limb with solid red evidence outlines
      detectedTargets.forEach((target, idx) => {
        snapCtx.strokeStyle = '#EF4444';
        snapCtx.lineWidth = 6;
        snapCtx.strokeRect(target.x, target.y, target.w, target.h);

        snapCtx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        snapCtx.fillRect(target.x, target.y, target.w, target.h);

        // Label Tag
        const tagH = 32;
        const tagY = Math.max(0, target.y - tagH);
        snapCtx.fillStyle = '#EF4444';
        snapCtx.fillRect(target.x, tagY, Math.max(160, target.label.length * 9.5), tagH);
        snapCtx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
        snapCtx.fillStyle = '#FFFFFF';
        snapCtx.fillText(`❌ ${target.label}`, target.x + 10, tagY + 21);
      });

      // Big Stamp on top
      snapCtx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      snapCtx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      snapCtx.fillText('📸 VISUAL EVIDENCE: BODY CAUGHT IN FRAME!', 24, 52);

      hpAudio.playCaughtBuzzer();
      hpAudio.speak(`${detectedTargets.length} person or body part caught in frame! Eliminated!`);

      this.statusText.innerText = `Visual evidence captured! Body part detected in frame—Player Eliminated!`;
    } else {
      // Clean frame: Completely safe!
      snapCtx.fillStyle = 'rgba(16, 185, 129, 0.95)';
      snapCtx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      snapCtx.fillText('✨ CLEAN FRAME: ALL SAFE!', 24, 52);

      hpAudio.playSafeChime();
      hpAudio.speak('Clean frame! Zero body parts detected! Everyone escaped in time!');

      this.statusText.innerText = 'Clean frame! Everyone escaped in time—No one eliminated.';
    }
    snapCtx.restore();

    // Store evidence photo
    const photoDataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);
    this.addEvidenceCard(photoDataUrl, detectedTargets.length, this.roundsPlayed);
  }

  addEvidenceCard(imgUrl, caughtCount, roundNum) {
    const card = document.createElement('div');
    card.className = 'bg-[#FFFFFF] p-3 rounded-2xl border border-[#E9E1DC] shadow-sm flex flex-col justify-between group';

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const badgeHtml = caughtCount > 0
      ? `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-label font-bold">Caught In Frame (${caughtCount})</span>`
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
    this.statusText.innerText = 'Choose your timer duration and start the countdown!';
  }

  async renderLoop() {
    if (!this.isCameraActive) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Draw live video stream
    this.ctx.drawImage(this.video, 0, 0, cw, ch);

    // Live AI detection for live frame preview
    if (this.isModelLoaded) {
      try {
        this.currentDetections = await this.detectAnyBodyOrPart(this.video, cw, ch);
      } catch (e) {}
    }

    // Update real-time count
    this.playersDetectedCount.innerText = this.currentDetections.length;

    // Draw live indicator boxes around any detected person/limbs
    this.currentDetections.forEach((target, idx) => {
      this.ctx.save();
      this.ctx.strokeStyle = this.isRoundRunning ? '#E06D53' : '#8A9A86';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(target.x, target.y, target.w, target.h);

      this.ctx.fillStyle = this.isRoundRunning ? 'rgba(224, 109, 83, 0.9)' : 'rgba(30, 27, 24, 0.85)';
      this.ctx.beginPath();
      this.ctx.roundRect(target.x, Math.max(4, target.y - 24), 110, 20, 10);
      this.ctx.fill();

      this.ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(target.label.slice(0, 14), target.x + 55, Math.max(4, target.y - 24) + 14);
      this.ctx.restore();
    });

    requestAnimationFrame(this.renderLoop.bind(this));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.hotPotatoGame = new CameraHotPotatoGame();
});
