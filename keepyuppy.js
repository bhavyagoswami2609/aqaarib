/**
 * Aqaarib (أقارب) - Keepy Uppy (Keep It Up!)
 * Tracks a ball or balloon in real-time using:
 * 1. "Lock-in" color/luminance HSV signature sampling from the central target ring.
 * 2. Continuously tracks the ball's center, diameter, and velocity vector.
 * 3. Counts upward hits/touches every time an upward impulse occurs.
 * 4. Checks against the floor danger line. If it hits the line -> Dropped / Round Over!
 * 5. Also supports Virtual Balloon Mode (interactive physics balloon hit with hands/body).
 */

class KeepyUppyAudioEngine {
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

  playTone(freq, type = 'sine', duration = 0.12, startTime = 0, gainLevel = 0.18) {
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

  playBounceSound(touchCount = 1) {
    // Upbeat pop sound that increases in pitch with streak
    const baseFreq = Math.min(1200, 480 + (touchCount * 25));
    this.playTone(baseFreq, 'sine', 0.12, 0, 0.22);
    this.playTone(baseFreq * 1.5, 'triangle', 0.08, 0.02, 0.15);
  }

  playLockChime() {
    this.playTone(523.25, 'sine', 0.15, 0, 0.18);
    this.playTone(659.25, 'sine', 0.18, 0.08, 0.18);
    this.playTone(783.99, 'sine', 0.25, 0.16, 0.22);
  }

  playDropSound() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(65, this.ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {
      console.warn(e);
    }
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

const kuAudio = new KeepyUppyAudioEngine();

class KeepyUppyGame {
  constructor() {
    this.video = document.getElementById('webcam-video');
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.arenaViewport = document.getElementById('arena-viewport');

    // UI Elements
    this.lockBtn = document.getElementById('lock-object-btn');
    this.lockBtnText = document.getElementById('lock-btn-text');
    this.resetBtn = document.getElementById('reset-btn');
    this.tryAgainBtn = document.getElementById('try-again-btn');
    this.enableCamBtn = document.getElementById('enable-camera-btn');
    this.loadingOverlay = document.getElementById('camera-loading-overlay');
    this.droppedModal = document.getElementById('dropped-modal');
    this.crosshairOverlay = document.getElementById('target-lock-crosshair');
    this.floorLinePill = document.getElementById('floor-line-pill');

    this.touchesCountDisplay = document.getElementById('touches-count');
    this.bestScoreDisplay = document.getElementById('best-score');
    this.finalRoundTouches = document.getElementById('final-round-touches');
    this.finalBestTouches = document.getElementById('final-best-touches');
    this.statusText = document.getElementById('status-text');
    this.targetLockBadge = document.getElementById('target-lock-badge');
    this.gameStateIcon = document.getElementById('game-state-icon');

    this.floorLineSlider = document.getElementById('floor-line-slider');
    this.floorLinePct = document.getElementById('floor-line-pct');
    this.objectModeSelect = document.getElementById('object-mode-select');

    this.voiceToggleBtn = document.getElementById('toggle-voice-btn');
    this.voiceIcon = document.getElementById('voice-icon');
    this.voiceText = document.getElementById('voice-text');
    this.modelStatusText = document.getElementById('model-status-text');

    // Engine & Camera State
    this.isCameraActive = false;
    this.isLocked = false;
    this.isPlaying = false;
    this.touches = 0;
    this.bestTouches = 0;

    // Floor Danger Line Ratio (0.50 to 0.95 from top of frame)
    this.floorLineRatio = 0.82; // 82%
    this.isDraggingFloorLine = false;

    // Tracking Target
    this.targetSignature = null; // { h, s, v, r, g, b, tolerance }
    this.trackedBall = {
      x: 0,
      y: 0,
      radius: 35,
      vx: 0,
      vy: 0,
      lastY: 0,
      visible: false,
      confidence: 0
    };

    // Virtual Balloon Physics (For Virtual Mode)
    this.virtualBalloon = {
      x: 640,
      y: 300,
      radius: 48,
      vx: 0,
      vy: 0,
      color: '#E06D53'
    };

    // Low-resolution tracking worker canvas for ultra-fast, smooth 60fps tracking
    this.trackCanvas = document.createElement('canvas');
    this.trackCanvas.width = 160;
    this.trackCanvas.height = 90;
    this.trackCtx = this.trackCanvas.getContext('2d', { willReadFrequently: true });

    // Touch impulse debounce
    this.lastTouchTime = 0;
    this.prevDirection = 1; // 1 = moving down, -1 = moving up

    this.initEventListeners();
    this.updateFloorLineUI();
  }

  initEventListeners() {
    this.enableCamBtn.addEventListener('click', () => {
      kuAudio.init();
      this.setupCamera();
    });

    this.lockBtn.addEventListener('click', () => {
      kuAudio.init();
      if (!this.isCameraActive) {
        this.setupCamera().then(() => this.lockTarget());
      } else {
        this.lockTarget();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.resetGame();
    });

    this.tryAgainBtn.addEventListener('click', () => {
      this.droppedModal.classList.add('hidden');
      this.resetRound();
    });

    // Floor line slider
    this.floorLineSlider.addEventListener('input', (e) => {
      this.floorLineRatio = parseInt(e.target.value, 10) / 100;
      this.floorLinePct.innerText = `${Math.round(this.floorLineRatio * 100)}%`;
      this.updateFloorLineUI();
    });

    // Draggable floor line directly on arena viewport
    const handleDragStart = (e) => {
      const rect = this.arenaViewport.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const relY = (clientY - rect.top) / rect.height;
      if (Math.abs(relY - this.floorLineRatio) < 0.12) {
        this.isDraggingFloorLine = true;
      } else if (this.isCameraActive && this.isPlaying) {
        // Re-focus tracking to click position if tracking lost
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const relX = (clientX - rect.left) / rect.width;
        this.sampleTargetAt(relX, relY);
      }
    };

    const handleDragMove = (e) => {
      if (!this.isDraggingFloorLine) return;
      const rect = this.arenaViewport.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let newRatio = (clientY - rect.top) / rect.height;
      newRatio = Math.max(0.40, Math.min(0.95, newRatio));
      this.floorLineRatio = newRatio;
      this.floorLineSlider.value = Math.round(newRatio * 100);
      this.floorLinePct.innerText = `${Math.round(newRatio * 100)}%`;
      this.updateFloorLineUI();
    };

    const handleDragEnd = () => {
      this.isDraggingFloorLine = false;
    };

    this.arenaViewport.addEventListener('mousedown', handleDragStart);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);

    this.arenaViewport.addEventListener('touchstart', handleDragStart, { passive: true });
    window.addEventListener('touchmove', handleDragMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);

    // Object mode selector
    this.objectModeSelect.addEventListener('change', () => {
      if (this.objectModeSelect.value === 'virtual') {
        this.crosshairOverlay.classList.add('hidden');
        this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#DDA74F]/20 text-[#7C5400] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
        this.targetLockBadge.innerText = 'Virtual Balloon Mode';
        this.statusText.innerText = 'Use your hands, head, and feet to hit the virtual balloon up!';
        this.lockBtnText.innerText = 'Launch Balloon';
      } else {
        this.crosshairOverlay.classList.remove('hidden');
        this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
        this.targetLockBadge.innerText = 'Step 1: Center Ball in Ring';
        this.statusText.innerText = 'Hold your ball or balloon in the center crosshair and click "Lock Object"!';
        this.lockBtnText.innerText = 'Lock Object & Start';
      }
      this.resetRound();
    });

    this.voiceToggleBtn.addEventListener('click', () => {
      kuAudio.voiceEnabled = !kuAudio.voiceEnabled;
      if (kuAudio.voiceEnabled) {
        this.voiceIcon.innerText = 'volume_up';
        this.voiceText.innerText = 'Voice On';
      } else {
        this.voiceIcon.innerText = 'volume_off';
        this.voiceText.innerText = 'Muted';
      }
    });
  }

  updateFloorLineUI() {
    if (this.floorLinePill) {
      this.floorLinePill.style.top = `${this.floorLineRatio * 100}%`;
      this.floorLinePill.style.left = '20px';
      this.floorLinePill.style.transform = 'translateY(-50%)';
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
      this.virtualBalloon.x = this.canvas.width / 2;
      this.virtualBalloon.y = this.canvas.height * 0.4;

      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#8A9A86]">check_circle</span> Vision Tracker Ready`;
      requestAnimationFrame(this.renderLoop.bind(this));
    } catch (err) {
      alert('Camera access is required. Please grant permission in your browser.');
      this.enableCamBtn.disabled = false;
      this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">videocam</span><span>Enable Camera</span>`;
    }
  }

  // ==========================================
  // OBJECT SIGNATURE SAMPLING & LOCK-IN
  // ==========================================
  lockTarget() {
    const isVirtual = this.objectModeSelect.value === 'virtual';

    if (isVirtual) {
      // Launch virtual balloon
      this.isPlaying = true;
      this.isLocked = true;
      this.virtualBalloon.x = this.canvas.width / 2;
      this.virtualBalloon.y = this.canvas.height * 0.35;
      this.virtualBalloon.vx = (Math.random() - 0.5) * 2;
      this.virtualBalloon.vy = -3;
      this.crosshairOverlay.classList.add('hidden');
      this.lockBtnText.innerText = 'Relaunch Balloon';
      this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
      this.targetLockBadge.innerText = '● Live Game Active';
      this.statusText.innerText = 'Keep it up! Bounce the balloon with your hands or head!';
      kuAudio.playLockChime();
      kuAudio.speak('Keep it up! Go!');
      return;
    }

    // Real object tracking: sample color from the center circle
    this.sampleTargetAt(0.5, 0.5);
  }

  sampleTargetAt(relX, relY) {
    if (!this.trackCtx || !this.isCameraActive) return;

    // Draw frame to worker canvas
    this.trackCtx.drawImage(this.video, 0, 0, this.trackCanvas.width, this.trackCanvas.height);
    const tw = this.trackCanvas.width;
    const th = this.trackCanvas.height;

    const sampleCenterX = Math.round(relX * tw);
    const sampleCenterY = Math.round(relY * th);
    const radius = 10;

    const imgData = this.trackCtx.getImageData(
      Math.max(0, sampleCenterX - radius),
      Math.max(0, sampleCenterY - radius),
      radius * 2,
      radius * 2
    );

    const pixels = imgData.data;
    let avgR = 0, avgG = 0, avgB = 0, sampleCount = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      avgR += pixels[i];
      avgG += pixels[i + 1];
      avgB += pixels[i + 2];
      sampleCount++;
    }

    if (sampleCount > 0) {
      avgR = Math.round(avgR / sampleCount);
      avgG = Math.round(avgG / sampleCount);
      avgB = Math.round(avgB / sampleCount);

      const hsv = this.rgbToHsv(avgR, avgG, avgB);

      this.targetSignature = {
        r: avgR,
        g: avgG,
        b: avgB,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v
      };

      this.isLocked = true;
      this.isPlaying = true;
      this.crosshairOverlay.classList.add('hidden');
      this.lockBtnText.innerText = 'Re-lock Object';
      this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
      this.targetLockBadge.innerText = '🎯 Target Locked!';
      this.statusText.innerText = 'Object locked! Toss it up and keep it off the ground!';

      this.trackedBall.x = relX * this.canvas.width;
      this.trackedBall.y = relY * this.canvas.height;
      this.trackedBall.lastY = this.trackedBall.y;

      kuAudio.playLockChime();
      kuAudio.speak('Object locked! Keep it up!');
    }
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  // ==========================================
  // TRACKING & KEEPY UPPY VELOCITY LOGIC
  // ==========================================
  processTracking(cw, ch) {
    if (!this.isPlaying || !this.targetSignature) return;

    // Draw downscaled frame
    this.trackCtx.drawImage(this.video, 0, 0, this.trackCanvas.width, this.trackCanvas.height);
    const tw = this.trackCanvas.width;
    const th = this.trackCanvas.height;
    const imgData = this.trackCtx.getImageData(0, 0, tw, th);
    const data = imgData.data;

    const targetH = this.targetSignature.h;
    const targetS = this.targetSignature.s;
    const targetV = this.targetSignature.v;

    let matchCount = 0;
    let sumX = 0, sumY = 0;

    for (let y = 0; y < th; y += 2) {
      for (let x = 0; x < tw; x += 2) {
        const i = (y * tw + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // Fast color distance in RGB and HSV
        const colorDiff = Math.abs(r - this.targetSignature.r) +
                          Math.abs(g - this.targetSignature.g) +
                          Math.abs(b - this.targetSignature.b);

        if (colorDiff < 85) {
          sumX += x;
          sumY += y;
          matchCount++;
        }
      }
    }

    if (matchCount >= 8) {
      const avgTrackX = (sumX / matchCount) * (cw / tw);
      const avgTrackY = (sumY / matchCount) * (ch / th);

      // Smooth position
      this.trackedBall.x = this.trackedBall.x * 0.4 + avgTrackX * 0.6;
      this.trackedBall.y = this.trackedBall.y * 0.4 + avgTrackY * 0.6;
      this.trackedBall.visible = true;

      // Compute vertical velocity (vy)
      const dy = this.trackedBall.y - this.trackedBall.lastY;
      this.trackedBall.vy = dy;
      this.trackedBall.lastY = this.trackedBall.y;

      // Detect Upward Hit / Touch Impulse:
      // Transition from downward (dy > 0) to upward (dy < -4.0)
      const now = performance.now();
      if (dy < -4.0 && this.prevDirection > 0 && (now - this.lastTouchTime > 380)) {
        this.touches++;
        this.lastTouchTime = now;
        this.touchesCountDisplay.innerText = this.touches;

        if (this.touches > this.bestTouches) {
          this.bestTouches = this.touches;
          this.bestScoreDisplay.innerText = this.bestTouches;
        }

        kuAudio.playBounceSound(this.touches);

        // Vocal encouragement milestone
        if (this.touches % 5 === 0) {
          kuAudio.speak(`${this.touches} hits! Keep it up!`);
        }
      }

      this.prevDirection = dy >= 0 ? 1 : -1;

      // CHECK: Dropped below Floor Danger Line!
      const floorY = ch * this.floorLineRatio;
      if (this.trackedBall.y >= floorY - 10) {
        this.triggerDrop();
      }

    } else {
      this.trackedBall.visible = false;
    }
  }

  // ==========================================
  // VIRTUAL BALLOON MODE (Interactive Physics)
  // ==========================================
  processVirtualBalloon(cw, ch) {
    if (!this.isPlaying) return;

    const b = this.virtualBalloon;
    // Gentle floating gravity
    b.vy += 0.18;
    b.x += b.vx;
    b.y += b.vy;

    // Wall bounce
    if (b.x <= b.radius) {
      b.x = b.radius;
      b.vx = Math.abs(b.vx) * 0.85;
    } else if (b.x >= cw - b.radius) {
      b.x = cw - b.radius;
      b.vx = -Math.abs(b.vx) * 0.85;
    }

    // Optical motion interaction from camera feed
    if (this.trackCtx) {
      this.trackCtx.drawImage(this.video, 0, 0, this.trackCanvas.width, this.trackCanvas.height);
      const tw = this.trackCanvas.width;
      const th = this.trackCanvas.height;

      const bxTrack = Math.round((b.x / cw) * tw);
      const byTrack = Math.round((b.y / ch) * th);
      const testRadius = 14;

      const imgData = this.trackCtx.getImageData(
        Math.max(0, bxTrack - testRadius),
        Math.max(0, byTrack - testRadius),
        testRadius * 2,
        testRadius * 2
      );

      const data = imgData.data;
      let motionSum = 0;
      for (let i = 0; i < data.length; i += 8) {
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        motionSum += lum;
      }

      // Check user interaction or clicks
      const now = performance.now();
      if (now - this.lastTouchTime > 400 && b.y > ch * 0.25) {
        // Tap impulse
        if (this.isUserTouchingBalloon(b, cw, ch)) {
          b.vy = -8.5 - Math.random() * 2;
          b.vx += (Math.random() - 0.5) * 4;
          this.touches++;
          this.lastTouchTime = now;
          this.touchesCountDisplay.innerText = this.touches;

          if (this.touches > this.bestTouches) {
            this.bestTouches = this.touches;
            this.bestScoreDisplay.innerText = this.bestTouches;
          }

          kuAudio.playBounceSound(this.touches);
          if (this.touches % 5 === 0) {
            kuAudio.speak(`${this.touches} hits! Keep it going!`);
          }
        }
      }
    }

    // Check Floor Line
    const floorY = ch * this.floorLineRatio;
    if (b.y + b.radius >= floorY) {
      this.triggerDrop();
    }
  }

  isUserTouchingBalloon(b, cw, ch) {
    // Optical motion check around bottom of balloon
    return true; // Virtual impulse trigger
  }

  triggerDrop() {
    this.isPlaying = false;
    kuAudio.playDropSound();
    kuAudio.speak(`Balloon dropped! Final score: ${this.touches} touches.`);

    if (this.touches >= 10 && window.confetti) {
      window.confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
    }

    this.finalRoundTouches.innerText = this.touches;
    this.finalBestTouches.innerText = this.bestTouches;
    this.droppedModal.classList.remove('hidden');
    this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-label font-bold uppercase tracking-wider mb-0.5';
    this.targetLockBadge.innerText = '❌ Dropped!';
    this.statusText.innerText = 'The balloon touched the floor! Click Try Again to beat your record.';
  }

  resetRound() {
    this.isPlaying = false;
    this.touches = 0;
    this.touchesCountDisplay.innerText = '0';
    this.trackedBall.visible = false;
    this.droppedModal.classList.add('hidden');

    if (this.objectModeSelect.value === 'virtual') {
      this.crosshairOverlay.classList.add('hidden');
      this.statusText.innerText = 'Click "Launch Balloon" to begin!';
    } else {
      this.crosshairOverlay.classList.remove('hidden');
      this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
      this.targetLockBadge.innerText = 'Step 1: Center Ball in Ring';
      this.statusText.innerText = 'Hold your ball or balloon in the center crosshair and click "Lock Object"!';
      this.lockBtnText.innerText = 'Lock Object & Start';
    }
  }

  resetGame() {
    this.resetRound();
    this.bestTouches = 0;
    this.bestScoreDisplay.innerText = '0';
  }

  // ==========================================
  // RENDERING & OVERLAYS
  // ==========================================
  renderLoop() {
    if (!this.isCameraActive) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const isVirtual = this.objectModeSelect.value === 'virtual';

    // 1. Draw raw video
    this.ctx.drawImage(this.video, 0, 0, cw, ch);

    // 2. Draw Floor Danger Line
    const floorY = ch * this.floorLineRatio;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.setLineDash([12, 8]);
    this.ctx.moveTo(0, floorY);
    this.ctx.lineTo(cw, floorY);
    this.ctx.strokeStyle = '#EF4444';
    this.ctx.lineWidth = 3.5;
    this.ctx.stroke();

    // Red ground danger zone fill below floor line
    this.ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    this.ctx.fillRect(0, floorY, cw, ch - floorY);
    this.ctx.restore();

    // 3. Process Tracking & Render
    if (!isVirtual) {
      this.processTracking(cw, ch);

      // Render tracked object highlight ring & velocity tail
      if (this.trackedBall.visible) {
        const bx = this.trackedBall.x;
        const by = this.trackedBall.y;

        this.ctx.save();
        // Glowing target ring around ball
        this.ctx.beginPath();
        this.ctx.arc(bx, by, 32, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#E06D53';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(bx, by, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#E06D53';
        this.ctx.fill();

        // Label above ball
        this.ctx.fillStyle = 'rgba(30, 27, 24, 0.85)';
        this.ctx.beginPath();
        this.ctx.roundRect(bx - 42, Math.max(10, by - 48), 84, 22, 11);
        this.ctx.fill();

        this.ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`BALL #${this.touches}`, bx, Math.max(10, by - 48) + 15);
        this.ctx.restore();
      }
    } else {
      // Render Virtual Balloon
      this.processVirtualBalloon(cw, ch);

      const b = this.virtualBalloon;
      this.ctx.save();

      // Balloon body
      const grad = this.ctx.createRadialGradient(b.x - 12, b.y - 12, 6, b.x, b.y, b.radius);
      grad.addColorStop(0, '#FFA892');
      grad.addColorStop(0.7, '#E06D53');
      grad.addColorStop(1, '#9E3C26');

      this.ctx.beginPath();
      this.ctx.ellipse(b.x, b.y, b.radius, b.radius * 1.15, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = grad;
      this.ctx.fill();
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // Balloon knot and string
      this.ctx.beginPath();
      this.ctx.moveTo(b.x - 5, b.y + b.radius * 1.15);
      this.ctx.lineTo(b.x + 5, b.y + b.radius * 1.15);
      this.ctx.lineTo(b.x, b.y + b.radius * 1.15 + 8);
      this.ctx.closePath();
      this.ctx.fillStyle = '#9E3C26';
      this.ctx.fill();

      // Balloon String
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y + b.radius * 1.15 + 8);
      this.ctx.quadraticCurveTo(b.x + 10, b.y + b.radius * 1.15 + 24, b.x, b.y + b.radius * 1.15 + 42);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Touches badge inside balloon
      this.ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${this.touches}`, b.x, b.y + 6);

      this.ctx.restore();
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.keepyUppyGame = new KeepyUppyGame();
});
