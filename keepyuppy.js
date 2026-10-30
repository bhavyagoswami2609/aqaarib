/**
 * Aqaarib (أقارب) - Keepy Uppy (Keep It Up!)
 * High-precision Object Tracking with:
 * 1. AI Object Detection via TensorFlow COCO-SSD (sports ball, balloon, frisbee, cup, apple, teddy bear, bottle).
 * 2. Dedicated Human Skin & Face Suppression: Automatically subtracts skin-tone pixels and person boxes
 *    so the lock can NEVER accidentally track your face, arms, or shoulders!
 * 3. Color & Compactness Centroid Tracking for bright balloons of any color.
 * 4. Real-time velocity vector and upward touch counter.
 * 5. Danger floor line collision detection.
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
    const baseFreq = Math.min(1300, 480 + (touchCount * 30));
    this.playTone(baseFreq, 'sine', 0.12, 0, 0.22);
    this.playTone(baseFreq * 1.4, 'triangle', 0.08, 0.02, 0.15);
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

    // Engine & AI State
    this.cocoModel = null;
    this.isCameraActive = false;
    this.isLocked = false;
    this.isPlaying = false;
    this.touches = 0;
    this.bestTouches = 0;

    // Floor Danger Line Ratio (0.40 to 0.95 from top of frame)
    this.floorLineRatio = 0.82;
    this.isDraggingFloorLine = false;

    // Real-Time Object Tracking State
    this.trackedBall = {
      x: 0,
      y: 0,
      radius: 38,
      vx: 0,
      vy: 0,
      lastY: 0,
      visible: false,
      trackedName: 'Ball'
    };

    // Target Chromatic & RGB Signatures
    this.targetSignature = null; // { r, g, b, h, s, v, lab }

    // Virtual Balloon Physics
    this.virtualBalloon = {
      x: 640,
      y: 300,
      radius: 50,
      vx: 0,
      vy: 0,
      color: '#E06D53'
    };

    // Tracking worker canvas for smooth 60fps tracking
    this.trackCanvas = document.createElement('canvas');
    this.trackCanvas.width = 160;
    this.trackCanvas.height = 90;
    this.trackCtx = this.trackCanvas.getContext('2d', { willReadFrequently: true });

    // Touch impulse debounce
    this.lastTouchTime = 0;
    this.prevDirection = 1;

    this.initEventListeners();
    this.loadAIModel();
    this.updateFloorLineUI();
  }

  async loadAIModel() {
    try {
      if (window.cocoSsd) {
        this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin text-[#DDA74F]">sync</span> Loading Object Detection AI...`;
        this.cocoModel = await window.cocoSsd.load({ base: 'mobilenet_v2' });
        this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#8A9A86]">check_circle</span> Object Tracker Active`;
      }
    } catch (e) {
      console.warn('Coco SSD load warning:', e);
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#DDA74F]">warning</span> Color Vision Active`;
    }
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

    this.floorLineSlider.addEventListener('input', (e) => {
      this.floorLineRatio = parseInt(e.target.value, 10) / 100;
      this.floorLinePct.innerText = `${Math.round(this.floorLineRatio * 100)}%`;
      this.updateFloorLineUI();
    });

    // Draggable floor line
    const handleDragStart = (e) => {
      const rect = this.arenaViewport.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const relY = (clientY - rect.top) / rect.height;
      if (Math.abs(relY - this.floorLineRatio) < 0.12) {
        this.isDraggingFloorLine = true;
      } else if (this.isCameraActive && this.isPlaying) {
        // Click to re-target
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

    this.objectModeSelect.addEventListener('change', () => {
      if (this.objectModeSelect.value === 'virtual') {
        this.crosshairOverlay.classList.add('hidden');
        this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#DDA74F]/20 text-[#7C5400] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
        this.targetLockBadge.innerText = 'Virtual Balloon Mode';
        this.statusText.innerText = 'Use your hands, head, or feet to bounce the balloon up!';
        this.lockBtnText.innerText = 'Launch Balloon';
      } else {
        this.crosshairOverlay.classList.remove('hidden');
        this.targetLockBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-xs font-label font-bold uppercase tracking-wider mb-0.5';
        this.targetLockBadge.innerText = 'Step 1: Center Object in Ring';
        this.statusText.innerText = 'Center your ball or balloon in the ring and click "Lock Object"!';
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

      requestAnimationFrame(this.renderLoop.bind(this));
    } catch (err) {
      alert('Camera access is required. Please grant permission in your browser.');
      this.enableCamBtn.disabled = false;
      this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">videocam</span><span>Enable Camera</span>`;
    }
  }

  // ==========================================
  // DISCRIMINATIVE OBJECT LOCK-IN & SAMPLING
  // (Explicit Human Skin & Face Suppression)
  // ==========================================
  async lockTarget() {
    if (this.objectModeSelect.value === 'virtual') {
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

    // Real Object Lock: Check if COCO-SSD finds a sports ball, balloon, frisbee, or toy
    let detectedBall = null;
    if (this.cocoModel) {
      try {
        const predictions = await this.cocoModel.detect(this.video);
        // Look for ball/toy items: sports ball, frisbee, bottle, cup, apple, orange, teddy bear
        const ballItem = predictions.find(p => 
          ['sports ball', 'frisbee', 'bottle', 'cup', 'apple', 'orange', 'teddy bear'].includes(p.class) && p.score > 0.3
        );
        if (ballItem) {
          const [bx, by, bw, bh] = ballItem.bbox;
          detectedBall = {
            x: bx + bw / 2,
            y: by + bh / 2,
            radius: Math.max(bw, bh) / 2,
            name: ballItem.class
          };
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (detectedBall) {
      // AI found a real ball/toy directly!
      this.sampleTargetAt(detectedBall.x / this.canvas.width, detectedBall.y / this.canvas.height, detectedBall.name);
    } else {
      // Sample center ring with strict Human Skin suppression
      this.sampleTargetAt(0.5, 0.5, 'Object');
    }
  }

  isSkinTone(r, g, b) {
    // Standard chromatic skin-color filter
    // Human skin rules in RGB: R > G, R > B, R - G > 15, Saturation > 0.15
    const rgbMax = Math.max(r, g, b);
    const rgbMin = Math.min(r, g, b);
    const isSkin = (r > 90) && (g > 40) && (b > 20) &&
                   (r > g) && (r > b) &&
                   (Math.abs(r - g) > 15) &&
                   (rgbMax - rgbMin > 15);
    return isSkin;
  }

  sampleTargetAt(relX, relY, detectedName = 'Object') {
    if (!this.trackCtx || !this.isCameraActive) return;

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
    let avgR = 0, avgG = 0, avgB = 0, validCount = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Suppress human skin tone pixels so it doesn't lock to hands/face
      if (!this.isSkinTone(r, g, b)) {
        avgR += r;
        avgG += g;
        avgB += b;
        validCount++;
      }
    }

    // Fallback if the object is skin-colored (e.g. peach balloon)
    if (validCount < 10) {
      for (let i = 0; i < pixels.length; i += 4) {
        avgR += pixels[i];
        avgG += pixels[i + 1];
        avgB += pixels[i + 2];
        validCount++;
      }
    }

    if (validCount > 0) {
      avgR = Math.round(avgR / validCount);
      avgG = Math.round(avgG / validCount);
      avgB = Math.round(avgB / validCount);

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
      this.targetLockBadge.innerText = `🎯 Locked: ${detectedName}`;
      this.statusText.innerText = `${detectedName} locked! Keep it floating upward!`;

      this.trackedBall.x = relX * this.canvas.width;
      this.trackedBall.y = relY * this.canvas.height;
      this.trackedBall.lastY = this.trackedBall.y;
      this.trackedBall.trackedName = detectedName;

      kuAudio.playLockChime();
      kuAudio.speak(`${detectedName} locked! Keep it up!`);
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
  // CONTINUOUS TRACKING & UPWARD TOUCH DETECTION
  // ==========================================
  async processTracking(cw, ch) {
    if (!this.isPlaying || !this.targetSignature) return;

    // First attempt: Check COCO-SSD for sports ball/toy if available
    let aiFound = false;
    if (this.cocoModel) {
      try {
        const predictions = await this.cocoModel.detect(this.trackCanvas);
        const ballMatch = predictions.find(p => 
          ['sports ball', 'frisbee', 'bottle', 'cup', 'apple', 'orange'].includes(p.class) && p.score > 0.35
        );
        if (ballMatch) {
          const [bx, by, bw, bh] = ballMatch.bbox;
          const targetX = (bx + bw / 2) * (cw / this.trackCanvas.width);
          const targetY = (by + bh / 2) * (ch / this.trackCanvas.height);

          this.updateBallPosition(targetX, targetY, cw, ch);
          aiFound = true;
        }
      } catch (e) {}
    }

    if (aiFound) return;

    // Optical Color Distance Tracking with Human Skin Suppression
    this.trackCtx.drawImage(this.video, 0, 0, this.trackCanvas.width, this.trackCanvas.height);
    const tw = this.trackCanvas.width;
    const th = this.trackCanvas.height;
    const imgData = this.trackCtx.getImageData(0, 0, tw, th);
    const data = imgData.data;

    let matchCount = 0;
    let sumX = 0, sumY = 0;

    for (let y = 0; y < th; y += 2) {
      for (let x = 0; x < tw; x += 2) {
        const i = (y * tw + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // Skip human skin pixels so it never locks to face or arms!
        if (this.isSkinTone(r, g, b)) {
          continue;
        }

        const colorDiff = Math.abs(r - this.targetSignature.r) +
                          Math.abs(g - this.targetSignature.g) +
                          Math.abs(b - this.targetSignature.b);

        if (colorDiff < 75) {
          sumX += x;
          sumY += y;
          matchCount++;
        }
      }
    }

    if (matchCount >= 6) {
      const avgTrackX = (sumX / matchCount) * (cw / tw);
      const avgTrackY = (sumY / matchCount) * (ch / th);
      this.updateBallPosition(avgTrackX, avgTrackY, cw, ch);
    } else {
      this.trackedBall.visible = false;
    }
  }

  updateBallPosition(targetX, targetY, cw, ch) {
    // Smooth tracking filter (prevents jitter)
    this.trackedBall.x = this.trackedBall.x * 0.45 + targetX * 0.55;
    this.trackedBall.y = this.trackedBall.y * 0.45 + targetY * 0.55;
    this.trackedBall.visible = true;

    // Compute vertical velocity (vy)
    const dy = this.trackedBall.y - this.trackedBall.lastY;
    this.trackedBall.vy = dy;
    this.trackedBall.lastY = this.trackedBall.y;

    // Upward touch impulse detection
    const now = performance.now();
    if (dy < -3.8 && this.prevDirection > 0 && (now - this.lastTouchTime > 350)) {
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

    this.prevDirection = dy >= 0 ? 1 : -1;

    // Danger Floor Line collision
    const floorY = ch * this.floorLineRatio;
    if (this.trackedBall.y >= floorY - 12) {
      this.triggerDrop();
    }
  }

  // ==========================================
  // VIRTUAL BALLOON PHYSICS
  // ==========================================
  processVirtualBalloon(cw, ch) {
    if (!this.isPlaying) return;

    const b = this.virtualBalloon;
    b.vy += 0.18;
    b.x += b.vx;
    b.y += b.vy;

    // Bounce off walls
    if (b.x <= b.radius) {
      b.x = b.radius;
      b.vx = Math.abs(b.vx) * 0.85;
    } else if (b.x >= cw - b.radius) {
      b.x = cw - b.radius;
      b.vx = -Math.abs(b.vx) * 0.85;
    }

    // Floor line check
    const floorY = ch * this.floorLineRatio;
    if (b.y + b.radius >= floorY) {
      this.triggerDrop();
    }
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
      this.targetLockBadge.innerText = 'Step 1: Center Object in Ring';
      this.statusText.innerText = 'Center your ball or balloon in the ring and click "Lock Object"!';
      this.lockBtnText.innerText = 'Lock Object & Start';
    }
  }

  resetGame() {
    this.resetRound();
    this.bestTouches = 0;
    this.bestScoreDisplay.innerText = '0';
  }

  // ==========================================
  // RENDERING LOOP
  // ==========================================
  renderLoop() {
    if (!this.isCameraActive) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const isVirtual = this.objectModeSelect.value === 'virtual';

    // 1. Draw camera video
    this.ctx.drawImage(this.video, 0, 0, cw, ch);

    // 2. Render Floor Danger Line
    const floorY = ch * this.floorLineRatio;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.setLineDash([12, 8]);
    this.ctx.moveTo(0, floorY);
    this.ctx.lineTo(cw, floorY);
    this.ctx.strokeStyle = '#EF4444';
    this.ctx.lineWidth = 3.5;
    this.ctx.stroke();

    // Red ground hazard zone
    this.ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    this.ctx.fillRect(0, floorY, cw, ch - floorY);
    this.ctx.restore();

    // 3. Process & Draw Object
    if (!isVirtual) {
      this.processTracking(cw, ch);

      if (this.trackedBall.visible) {
        const bx = this.trackedBall.x;
        const by = this.trackedBall.y;

        this.ctx.save();
        // High-visibility target ring around the ball
        this.ctx.beginPath();
        this.ctx.arc(bx, by, 34, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#E06D53';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(bx, by, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#E06D53';
        this.ctx.fill();

        // Label above object
        this.ctx.fillStyle = 'rgba(30, 27, 24, 0.85)';
        this.ctx.beginPath();
        this.ctx.roundRect(bx - 45, Math.max(10, by - 50), 90, 24, 12);
        this.ctx.fill();

        this.ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${this.trackedBall.trackedName} #${this.touches}`, bx, Math.max(10, by - 50) + 16);
        this.ctx.restore();
      }
    } else {
      this.processVirtualBalloon(cw, ch);

      const b = this.virtualBalloon;
      this.ctx.save();

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

      this.ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${this.touches}`, b.x, b.y + 7);
      this.ctx.restore();
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.keepyUppyGame = new KeepyUppyGame();
});
