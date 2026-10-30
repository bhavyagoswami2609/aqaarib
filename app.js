/**
 * Aqaarib (أقارب) - Red Light, Green Light
 * High-performance, client-side AI Skeletal Body & Center-of-Mass Tracking Game.
 * Built for ADU Hackathon 2k26 with TensorFlow.js MoveNet & Web Audio API.
 */

// ==========================================
// AUDIO SYNTHESIS & SOUND FX (Web Audio API)
// ==========================================
class SoundFXEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voiceEnabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, startTime = 0, gainLevel = 0.15) {
    if (this.muted) return;
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
      console.warn('Audio playTone error:', e);
    }
  }

  playCountdownTick() {
    this.playTone(660, 'sine', 0.12, 0, 0.2);
  }

  playCountdownGo() {
    this.playTone(1046.5, 'triangle', 0.25, 0, 0.22);
    this.playTone(1318.5, 'sine', 0.35, 0.06, 0.2);
  }

  playGreenChime() {
    this.playTone(523.25, 'sine', 0.22, 0, 0.15);     // C5
    this.playTone(659.25, 'sine', 0.25, 0.08, 0.15);  // E5
    this.playTone(783.99, 'sine', 0.32, 0.15, 0.18);  // G5
  }

  playSquidGameMelody(speed = 1.0) {
    const notes = [
      { f: 659.25, d: 0.22 }, // E5
      { f: 659.25, d: 0.22 }, // E5
      { f: 783.99, d: 0.22 }, // G5
      { f: 659.25, d: 0.22 }, // E5
      { f: 587.33, d: 0.22 }, // D5
      { f: 523.25, d: 0.32 }, // C5
      { f: 587.33, d: 0.25 }, // D5
      { f: 659.25, d: 0.45 }  // E5
    ];
    let time = 0;
    notes.forEach(n => {
      const noteDuration = (n.d / speed);
      this.playTone(n.f, 'triangle', noteDuration, time, 0.14);
      time += noteDuration * 0.9;
    });
    return time;
  }

  playWarningBeep() {
    this.playTone(700, 'square', 0.14, 0, 0.12);
    this.playTone(850, 'square', 0.16, 0.1, 0.14);
  }

  playRedAlarm() {
    this.playTone(320, 'sawtooth', 0.3, 0, 0.2);
    this.playTone(335, 'sawtooth', 0.3, 0, 0.2);
  }

  playEliminationBuzzer() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(65, this.ctx.currentTime + 0.55);

      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.55);
    } catch (e) {
      console.warn(e);
    }
  }

  playVictoryFanfare() {
    const fanfare = [
      { f: 523.25, t: 0 },
      { f: 659.25, t: 0.12 },
      { f: 783.99, t: 0.24 },
      { f: 1046.50, t: 0.36 },
      { f: 880.00, t: 0.50 },
      { f: 1046.50, t: 0.65 }
    ];
    fanfare.forEach(item => {
      this.playTone(item.f, 'triangle', 0.32, item.t, 0.22);
    });
  }

  speak(text) {
    if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.15;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')));
      if (preferredVoice) utterance.voice = preferredVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }
}

const soundEngine = new SoundFXEngine();

// Reference color palette
const LANE_CONFIGS = [
  { id: 1, name: 'Player 1', color: '#E06D53', rgb: [224, 109, 83] }, // Primary
  { id: 2, name: 'Player 2', color: '#8A9A86', rgb: [138, 154, 134] }, // Secondary
  { id: 3, name: 'Player 3', color: '#DDA74F', rgb: [221, 167, 79] },  // Tertiary
  { id: 4, name: 'Player 4', color: '#4F7C73', rgb: [79, 124, 115] }
];

// MoveNet Keypoint Skeletons Connections
const POSE_CONNECTIONS = [
  [0, 1], [0, 2], [1, 3], [2, 4], // Head & eyes/ears
  [5, 6],                         // Shoulders
  [5, 7], [7, 9],                 // Left arm
  [6, 8], [8, 10],                // Right arm
  [5, 11], [6, 12],               // Torso
  [11, 12],                       // Hips
  [11, 13], [13, 15],             // Left leg
  [12, 14], [14, 16]              // Right leg
];

const GameState = {
  IDLE: 'IDLE',
  COUNTDOWN: 'COUNTDOWN',
  GREEN: 'GREEN',
  WARNING: 'WARNING',
  RED: 'RED',
  FINISHED: 'FINISHED'
};

class RedLightGreenLightGame {
  constructor() {
    this.video = document.getElementById('webcam-video');
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.arenaViewport = document.getElementById('arena-viewport');
    this.cameraTintLayer = document.getElementById('camera-tint-layer');
    this.finishLinePill = document.getElementById('finish-line-pill');

    // UI Elements
    this.startBtn = document.getElementById('start-game-btn');
    this.resetBtn = document.getElementById('reset-game-btn');
    this.enableCamBtn = document.getElementById('enable-camera-btn');
    this.loadingOverlay = document.getElementById('camera-loading-overlay');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');
    this.winnerOverlay = document.getElementById('winner-overlay');
    this.playAgainBtn = document.getElementById('play-again-btn');
    this.winnerTitle = document.getElementById('winner-title');
    this.winnerSubtitle = document.getElementById('winner-subtitle');

    this.bulbRed = document.getElementById('signal-bulb-red');
    this.bulbYellow = document.getElementById('signal-bulb-yellow');
    this.bulbGreen = document.getElementById('signal-bulb-green');
    this.statusLabel = document.getElementById('signal-status-label');
    this.survivorsCount = document.getElementById('survivors-count');
    this.roundTimer = document.getElementById('round-timer');
    this.playersRoster = document.getElementById('players-roster');

    this.sensitivitySlider = document.getElementById('sensitivity-slider');
    this.sensitivityVal = document.getElementById('sensitivity-value');
    this.difficultySelect = document.getElementById('difficulty-select');
    this.finishLineSlider = document.getElementById('finish-line-slider');
    this.finishLinePct = document.getElementById('finish-line-pct');

    this.mirrorCheckbox = document.getElementById('mirror-camera-checkbox');
    this.skeletonCheckbox = document.getElementById('show-skeleton-checkbox');
    this.comCheckbox = document.getElementById('show-com-checkbox');
    this.voiceToggleBtn = document.getElementById('toggle-voice-btn');
    this.voiceIcon = document.getElementById('voice-icon');
    this.voiceText = document.getElementById('voice-text');
    this.modelStatusText = document.getElementById('model-status-text');

    // Engine flags & detector
    this.detector = null;
    this.isCameraActive = false;
    this.isModelLoaded = false;
    this.state = GameState.IDLE;
    
    // Tracking & Players
    this.players = [];
    this.lastFrameTime = performance.now();
    this.redTurnStartTime = 0;
    this.gracePeriodMs = 280;

    // Finish Line Position: Defaults to 35% from top of canvas
    this.finishLineRatio = 0.35;
    this.finishLineSlider.value = 35;
    this.finishLinePct.innerText = '35%';
    this.isDraggingFinishLine = false;

    // Round Timing
    this.roundDurationSec = 60;
    this.remainingSec = 60;
    this.roundStartTime = 0;
    this.timerInterval = null;
    this.stateTimeout = null;
    this.countdownInterval = null;

    // Motion sensitivity
    this.motionThreshold = 8.5;
    this.updateSensitivityFromUI();

    // Fallback frame differencer
    this.prevFrameData = null;
    this.diffCanvas = document.createElement('canvas');
    this.diffCanvas.width = 160;
    this.diffCanvas.height = 90;
    this.diffCtx = this.diffCanvas.getContext('2d', { willReadFrequently: true });

    this.initEventListeners();
    this.initPoseDetector();
    this.updateFinishLineUI();
  }

  initEventListeners() {
    this.enableCamBtn.addEventListener('click', () => {
      soundEngine.init();
      this.setupCamera();
    });

    this.startBtn.addEventListener('click', () => {
      soundEngine.init();
      if (!this.isCameraActive) {
        this.setupCamera().then(() => this.startCountdown());
      } else {
        this.startCountdown();
      }
    });

    this.resetBtn.addEventListener('click', () => {
      this.resetGame();
    });

    this.playAgainBtn.addEventListener('click', () => {
      this.winnerOverlay.classList.add('hidden');
      this.startCountdown();
    });

    this.sensitivitySlider.addEventListener('input', () => {
      this.sensitivityVal.innerText = this.sensitivitySlider.value;
      this.updateSensitivityFromUI();
    });

    this.difficultySelect.addEventListener('change', () => {
      this.updateSensitivityFromUI();
    });

    // Finish line slider
    this.finishLineSlider.addEventListener('input', (e) => {
      this.finishLineRatio = parseInt(e.target.value, 10) / 100;
      this.finishLinePct.innerText = `${Math.round(this.finishLineRatio * 100)}%`;
      this.updateFinishLineUI();
    });

    // Draggable finish line directly on the camera viewport
    const handleDragStart = (e) => {
      const rect = this.arenaViewport.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const relY = (clientY - rect.top) / rect.height;
      if (Math.abs(relY - this.finishLineRatio) < 0.12) {
        this.isDraggingFinishLine = true;
      }
    };

    const handleDragMove = (e) => {
      if (!this.isDraggingFinishLine) return;
      const rect = this.arenaViewport.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let newRatio = (clientY - rect.top) / rect.height;
      newRatio = Math.max(0.12, Math.min(0.85, newRatio));
      this.finishLineRatio = newRatio;
      this.finishLineSlider.value = Math.round(newRatio * 100);
      this.finishLinePct.innerText = `${Math.round(newRatio * 100)}%`;
      this.updateFinishLineUI();
    };

    const handleDragEnd = () => {
      this.isDraggingFinishLine = false;
    };

    this.arenaViewport.addEventListener('mousedown', handleDragStart);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);

    this.arenaViewport.addEventListener('touchstart', handleDragStart, { passive: true });
    window.addEventListener('touchmove', handleDragMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);

    this.voiceToggleBtn.addEventListener('click', () => {
      soundEngine.voiceEnabled = !soundEngine.voiceEnabled;
      soundEngine.muted = !soundEngine.voiceEnabled;
      if (soundEngine.voiceEnabled) {
        this.voiceIcon.innerText = 'volume_up';
        this.voiceText.innerText = 'Voice On';
      } else {
        this.voiceIcon.innerText = 'volume_off';
        this.voiceText.innerText = 'Muted';
      }
    });
  }

  updateFinishLineUI() {
    if (this.finishLinePill) {
      this.finishLinePill.style.top = `${this.finishLineRatio * 100}%`;
      this.finishLinePill.style.left = '20px';
      this.finishLinePill.style.transform = 'translateY(-50%)';
    }
  }

  updateSensitivityFromUI() {
    const sliderVal = parseFloat(this.sensitivitySlider.value) || 5;
    const diff = this.difficultySelect ? this.difficultySelect.value : 'normal';

    let diffMultiplier = 1.0;
    if (diff === 'easy') diffMultiplier = 1.45;
    if (diff === 'hard') diffMultiplier = 0.65;

    this.motionThreshold = (15 - sliderVal * 0.9) * diffMultiplier;
  }

  async initPoseDetector() {
    try {
      if (window.poseDetection) {
        this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin text-[#DDA74F]">sync</span> Loading MoveNet Pose Engine...`;
        
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
        this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#8A9A86]">check_circle</span> AI Skeleton Tracker Ready`;
      }
    } catch (e) {
      console.warn('TensorFlow MoveNet load warning:', e);
      this.modelStatusText.innerHTML = `<span class="material-symbols-outlined text-[16px] text-[#DDA74F]">warning</span> Camera Motion Tracker Enabled`;
    }
  }

  async setupCamera() {
    this.enableCamBtn.disabled = true;
    this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px] animate-spin">sync</span><span>Starting Camera...</span>`;

    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
      console.error('Camera access error:', err);
      alert('Camera access is required. Please grant permission in your browser to play!');
      this.enableCamBtn.disabled = false;
      this.enableCamBtn.innerHTML = `<span class="material-symbols-outlined text-[20px]">videocam</span><span>Enable Camera</span>`;
    }
  }

  // ==========================================
  // CLEAN 3-2-1 COUNTDOWN WITH PROPER STATE
  // ==========================================
  startCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    clearTimeout(this.stateTimeout);

    this.resetRoundState();
    this.state = GameState.COUNTDOWN;
    this.startBtn.disabled = true;

    this.countdownOverlay.classList.remove('hidden');

    let count = 3;
    const updateCountdownDisplay = (val) => {
      this.countdownNumber.innerText = val;
      this.countdownNumber.style.transform = 'scale(1.2)';
      this.countdownNumber.style.opacity = '0.7';
      requestAnimationFrame(() => {
        this.countdownNumber.style.transform = 'scale(1)';
        this.countdownNumber.style.opacity = '1';
      });
    };

    updateCountdownDisplay(count);
    soundEngine.playCountdownTick();
    soundEngine.speak('Ready!');

    this.countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        updateCountdownDisplay(count);
        soundEngine.playCountdownTick();
      } else if (count === 0) {
        updateCountdownDisplay('GO!');
        soundEngine.playCountdownGo();
        soundEngine.speak('Go!');
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.countdownOverlay.classList.add('hidden');
        this.startBtn.disabled = false;
        this.startRound();
      }
    }, 850);
  }

  startRound() {
    this.remainingSec = this.roundDurationSec;
    this.roundStartTime = performance.now();
    this.updateTimerDisplay();

    const ch = this.canvas.height;
    const finishY = ch * this.finishLineRatio;

    this.players.forEach(p => {
      p.status = 'active';
      p.progress = 0;
      p.startComY = p.com ? p.com.y : (ch * 0.75);
      p.startForwardY = p.forwardY || p.startComY;
      p.startTorsoSize = p.torsoSize || 100;
      p.eliminatedAt = null;
    });

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.remainingSec--;
      this.updateTimerDisplay();
      if (this.remainingSec <= 0) {
        this.endRound('Time Up! Survivors win.');
      }
    }, 1000);

    this.triggerGreenLight();
  }

  triggerGreenLight() {
    if (this.state === GameState.FINISHED) return;
    this.state = GameState.GREEN;

    this.updateSignalUI('GREEN');
    soundEngine.playGreenChime();

    const duration = 2800 + Math.random() * 2400;

    soundEngine.speak('Green light!');
    soundEngine.playSquidGameMelody(1.1);

    clearTimeout(this.stateTimeout);
    this.stateTimeout = setTimeout(() => {
      this.triggerWarning();
    }, duration);
  }

  triggerWarning() {
    if (this.state === GameState.FINISHED) return;
    this.state = GameState.WARNING;

    this.updateSignalUI('WARNING');
    soundEngine.playWarningBeep();

    clearTimeout(this.stateTimeout);
    this.stateTimeout = setTimeout(() => {
      this.triggerRedLight();
    }, 850);
  }

  triggerRedLight() {
    if (this.state === GameState.FINISHED) return;
    this.state = GameState.RED;
    this.redTurnStartTime = performance.now();

    this.updateSignalUI('RED');
    soundEngine.playRedAlarm();
    soundEngine.speak('Red light! Freeze!');

    const duration = 2400 + Math.random() * 2000;

    clearTimeout(this.stateTimeout);
    this.stateTimeout = setTimeout(() => {
      this.triggerGreenLight();
    }, duration);
  }

  updateSignalUI(light) {
    this.bulbRed.className = 'w-10 h-10 rounded-full bg-[#331814] flex items-center justify-center transition-all duration-300';
    this.bulbYellow.className = 'w-10 h-10 rounded-full bg-[#302410] flex items-center justify-center transition-all duration-300';
    this.bulbGreen.className = 'w-10 h-10 rounded-full bg-[#122A16] flex items-center justify-center transition-all duration-300';

    this.bulbRed.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-25';
    this.bulbYellow.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-25';
    this.bulbGreen.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-25';

    if (light === 'GREEN') {
      this.bulbGreen.className = 'w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center signal-active-green transition-all duration-300';
      this.bulbGreen.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-100';
      this.statusLabel.innerText = 'GREEN LIGHT — RUN!';
      this.statusLabel.className = 'text-2xl font-label font-black text-[#10B981] tracking-tight uppercase';
      this.cameraTintLayer.className = 'absolute inset-0 pointer-events-none transition-colors duration-300 bg-emerald-500/15';

    } else if (light === 'WARNING') {
      this.bulbYellow.className = 'w-10 h-10 rounded-full bg-[#DDA74F] flex items-center justify-center transition-all duration-300';
      this.bulbYellow.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-100';
      this.statusLabel.innerText = 'GET READY TO FREEZE...';
      this.statusLabel.className = 'text-2xl font-label font-black text-[#DDA74F] tracking-tight uppercase';
      this.cameraTintLayer.className = 'absolute inset-0 pointer-events-none transition-colors duration-300 bg-amber-500/10';

    } else if (light === 'RED') {
      this.bulbRed.className = 'w-10 h-10 rounded-full bg-[#E06D53] flex items-center justify-center signal-active-red transition-all duration-300';
      this.bulbRed.querySelector('span').className = 'material-symbols-outlined text-white text-[20px] opacity-100';
      this.statusLabel.innerText = 'RED LIGHT — FREEZE!';
      this.statusLabel.className = 'text-2xl font-label font-black text-[#E06D53] tracking-tight uppercase';
      this.cameraTintLayer.className = 'absolute inset-0 pointer-events-none transition-colors duration-300 bg-red-500/20';

    } else {
      this.statusLabel.innerText = 'Waiting to Start';
      this.statusLabel.className = 'text-2xl font-label font-black text-[#1E1B18] tracking-tight uppercase';
      this.cameraTintLayer.className = 'absolute inset-0 pointer-events-none transition-colors duration-300 bg-transparent';
    }
  }

  updateTimerDisplay() {
    const mins = Math.floor(this.remainingSec / 60);
    const secs = this.remainingSec % 60;
    this.roundTimer.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  resetRoundState() {
    clearTimeout(this.stateTimeout);
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.state = GameState.IDLE;
    this.startBtn.disabled = false;
    this.updateSignalUI('');

    this.players.forEach(p => {
      p.status = 'active';
      p.progress = 0;
      p.startComY = null;
      p.eliminatedAt = null;
    });
    this.updateSurvivorsUI();
    this.renderRosterCards();
  }

  resetGame() {
    this.resetRoundState();
    this.winnerOverlay.classList.add('hidden');
    this.countdownOverlay.classList.add('hidden');
    this.remainingSec = this.roundDurationSec;
    this.updateTimerDisplay();
  }

  endRound(message, winner = null) {
    this.state = GameState.FINISHED;
    clearTimeout(this.stateTimeout);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.updateSignalUI('');

    if (winner) {
      soundEngine.playVictoryFanfare();
      soundEngine.speak(`Winner! ${winner.name} crossed the finish line!`);

      if (window.confetti) {
        window.confetti({
          particleCount: 160,
          spread: 85,
          origin: { y: 0.55 }
        });
      }

      this.winnerTitle.innerText = `${winner.name} Wins!`;
      this.winnerSubtitle.innerText = `You crossed the finish line safely without moving on red!`;
      this.winnerOverlay.classList.remove('hidden');
    } else {
      soundEngine.speak('Game over! Try again!');
    }
  }

  // ==========================================
  // REAL-TIME RENDERING & TRACKING LOOP
  // ==========================================
  async renderLoop() {
    if (!this.isCameraActive) return;

    const now = performance.now();
    this.lastFrameTime = now;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const isMirrored = this.mirrorCheckbox.checked;

    // Draw video stream (mirrored or standard natural view)
    this.ctx.save();
    if (isMirrored) {
      this.ctx.translate(cw, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(this.video, 0, 0, cw, ch);
    this.ctx.restore();

    // Estimate poses
    let rawPoses = [];
    if (this.detector && this.isModelLoaded) {
      try {
        rawPoses = await this.detector.estimatePoses(this.video, {
          maxPoses: 4,
          flipHorizontal: isMirrored
        });
      } catch (e) {
        // Fallback
      }
    }

    this.processPoses(rawPoses, cw, ch);
    this.renderOverlays(cw, ch);
    this.updateGameLogic(cw, ch);

    requestAnimationFrame(this.renderLoop.bind(this));
  }

  processPoses(rawPoses, cw, ch) {
    if (!rawPoses || rawPoses.length === 0) {
      // Clear all cached poses
      this.players.forEach(p => p.pose = null);
      this.detectMotionFallback(cw, ch);
      return;
    }

    // Filter to genuine, confident human poses (filters out background ghosts/reflections)
    const validPoses = rawPoses.filter(p => {
      if (!p || p.score < 0.35) return false;
      if (!p.keypoints || p.keypoints.length === 0) return false;
      const confidentPoints = p.keypoints.filter(kp => kp.score > 0.35).length;
      return confidentPoints >= 4;
    });

    if (validPoses.length === 0) {
      this.players.forEach(p => p.pose = null);
      return;
    }

    // Sort valid poses horizontally across the camera frame
    const sortedPoses = validPoses.sort((a, b) => {
      const boxA = a.box || { xMin: a.keypoints[0].x };
      const boxB = b.box || { xMin: b.keypoints[0].x };
      return boxA.xMin - boxB.xMin;
    });

    const activeCount = Math.min(4, sortedPoses.length);

    // Keep players array strictly matching detected real people count
    while (this.players.length < activeCount) {
      const idx = this.players.length;
      const config = LANE_CONFIGS[idx % LANE_CONFIGS.length];
      this.players.push({
        id: idx + 1,
        name: config.name,
        color: config.color,
        rgb: config.rgb,
        status: 'active',
        progress: 0,
        com: { x: cw / 2, y: ch * 0.75 },
        prevCom: null,
        startComY: null,
        torsoSize: 100,
        startTorsoSize: 100,
        currentMotion: 0,
        smoothedMotion: 0,
        pose: null,
        eliminatedAt: null
      });
    }

    // If fewer people detected than before, trim extra slots so no phantom players stay
    if (this.players.length > activeCount) {
      this.players = this.players.slice(0, activeCount);
    }

    const finishLineY = ch * this.finishLineRatio;

    sortedPoses.forEach((pose, i) => {
      if (i >= this.players.length) return;
      const player = this.players[i];
      player.pose = pose;

      // If this player is already eliminated, do not track movement or progress
      if (player.status === 'eliminated') {
        return;
      }

      let comX = 0, comY = 0, count = 0;
      const keypoints = pose.keypoints;
      const torsoIdxs = [5, 6, 11, 12];

      torsoIdxs.forEach(k => {
        if (keypoints[k] && keypoints[k].score > 0.25) {
          comX += keypoints[k].x;
          comY += keypoints[k].y;
          count++;
        }
      });

      if (count === 0) {
        keypoints.forEach(k => {
          if (k.score > 0.3) {
            comX += k.x;
            comY += k.y;
            count++;
          }
        });
      }

      if (count > 0) {
        const newCom = { x: comX / count, y: comY / count };

        // Foremost body point moving toward the finish line (head, shoulders, or center of mass)
        const headY = keypoints[0] && keypoints[0].score > 0.25 ? keypoints[0].y : newCom.y;
        const leftShoulderY = keypoints[5] && keypoints[5].score > 0.25 ? keypoints[5].y : headY;
        const rightShoulderY = keypoints[6] && keypoints[6].score > 0.25 ? keypoints[6].y : headY;
        const forwardY = Math.min(headY, leftShoulderY, rightShoulderY, newCom.y);
        player.forwardY = forwardY;

        // Measure torso size
        if (keypoints[5] && keypoints[6] && keypoints[5].score > 0.3 && keypoints[6].score > 0.3) {
          player.torsoSize = Math.hypot(keypoints[5].x - keypoints[6].x, keypoints[5].y - keypoints[6].y) * 2.8;
        }

        // Initialize starting baseline if in green phase and not recorded yet
        if (!player.startComY && this.state === GameState.GREEN) {
          player.startComY = newCom.y;
          player.startForwardY = forwardY;
          player.startTorsoSize = player.torsoSize;
        }

        // Measure displacement
        let motionDelta = 0;
        if (player.prevCom) {
          const dX = newCom.x - player.prevCom.x;
          const dY = newCom.y - player.prevCom.y;
          motionDelta = Math.hypot(dX, dY);
        }

        // Wrist/ankle limb movements
        if (player.prevKeypoints) {
          let limbMotion = 0;
          let limbCount = 0;
          [9, 10, 15, 16].forEach(lk => {
            if (keypoints[lk] && player.prevKeypoints[lk] && keypoints[lk].score > 0.3) {
              const ldX = keypoints[lk].x - player.prevKeypoints[lk].x;
              const ldY = keypoints[lk].y - player.prevKeypoints[lk].y;
              limbMotion += Math.hypot(ldX, ldY);
              limbCount++;
            }
          });
          if (limbCount > 0) {
            motionDelta = Math.max(motionDelta, (limbMotion / limbCount) * 1.2);
          }
        }

        player.prevCom = newCom;
        player.com = newCom;
        player.prevKeypoints = keypoints.map(kp => ({ x: kp.x, y: kp.y }));

        player.currentMotion = motionDelta;
        player.smoothedMotion = player.smoothedMotion * 0.7 + motionDelta * 0.3;

        // Progress Calculation towards the translucent dotted finish line
        if (player.status === 'active' && this.state === GameState.GREEN) {
          const startY = player.startForwardY || player.startComY || (ch * 0.75);
          
          if (startY > finishLineY) {
            const totalDistance = Math.max(30, startY - finishLineY);
            const distanceCovered = startY - forwardY;
            const progress = Math.max(0, Math.min(100, Math.round((distanceCovered / totalDistance) * 100)));
            player.progress = Math.max(player.progress, progress);
          } else {
            const startScale = player.startTorsoSize || 100;
            const targetScale = startScale * 1.4;
            const scaleProgress = Math.max(0, Math.min(100, Math.round(((player.torsoSize - startScale) / (targetScale - startScale)) * 100)));
            player.progress = Math.max(player.progress, scaleProgress);
          }
        }
      }
    });
  }

  detectMotionFallback(cw, ch) {
    if (!this.diffCtx) return;
    try {
      this.diffCtx.drawImage(this.video, 0, 0, this.diffCanvas.width, this.diffCanvas.height);
      const curData = this.diffCtx.getImageData(0, 0, this.diffCanvas.width, this.diffCanvas.height);

      if (this.prevFrameData && this.players.length === 0) {
        const config = LANE_CONFIGS[0];
        this.players.push({
          id: 1,
          name: 'Player 1',
          color: config.color,
          rgb: config.rgb,
          status: 'active',
          progress: 0,
          com: { x: cw / 2, y: ch * 0.75 },
          prevCom: { x: cw / 2, y: ch * 0.75 },
          startComY: ch * 0.75,
          torsoSize: 100,
          startTorsoSize: 100,
          currentMotion: 0,
          smoothedMotion: 0,
          pose: null
        });
      }

      if (this.prevFrameData && this.players.length > 0) {
        let diffSum = 0;
        let weightedY = 0;
        const curPixels = curData.data;
        const prevPixels = this.prevFrameData.data;
        const total = curPixels.length;

        for (let i = 0; i < total; i += 8) {
          const dR = Math.abs(curPixels[i] - prevPixels[i]);
          const dG = Math.abs(curPixels[i + 1] - prevPixels[i + 1]);
          const dB = Math.abs(curPixels[i + 2] - prevPixels[i + 2]);
          if (dR + dG + dB > 60) {
            diffSum++;
            const pixelIdx = i / 4;
            const py = Math.floor(pixelIdx / this.diffCanvas.width);
            weightedY += py;
          }
        }

        const normDiff = (diffSum / (total / 8)) * 100;
        this.players[0].currentMotion = normDiff;
        this.players[0].smoothedMotion = this.players[0].smoothedMotion * 0.7 + normDiff * 0.3;

        // Only increment progress steadily during GREEN light if real motion is detected
        if (this.players[0].status === 'active' && this.state === GameState.GREEN) {
          const timeSinceStart = performance.now() - this.roundStartTime;
          if (normDiff > 2.0 && timeSinceStart > 1000) {
            this.players[0].progress = Math.min(100, this.players[0].progress + 0.45);
            if (diffSum > 0) {
              const avgY = (weightedY / diffSum) * (ch / this.diffCanvas.height);
              this.players[0].com.y = avgY;
            }
          }
        }
      }

      this.prevFrameData = curData;
    } catch (e) {
      // diff capture error
    }
  }

  // ==========================================
  // OVERLAY & TRANSLUCENT DOTTED FINISH LINE
  // ==========================================
  renderOverlays(cw, ch) {
    const showSkeleton = this.skeletonCheckbox.checked;
    const showCom = this.comCheckbox.checked;

    // 1. Lane Boundaries
    if (this.players.length > 1) {
      const laneWidth = cw / this.players.length;
      for (let i = 1; i < this.players.length; i++) {
        const x = i * laneWidth;
        this.ctx.beginPath();
        this.ctx.setLineDash([6, 6]);
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, ch);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    // 2. Translucent Dotted Finish Line Across Screen
    const finishY = ch * this.finishLineRatio;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.setLineDash([10, 8]);
    this.ctx.moveTo(0, finishY);
    this.ctx.lineTo(cw, finishY);
    this.ctx.strokeStyle = 'rgba(224, 109, 83, 0.75)'; // Soft translucent primary coral
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    // Subtle glow on the finish line
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.restore();

    // 3. Render Skeleton & Bones ONLY for active/winning players (Eliminated players are removed from view)
    this.players.forEach((player) => {
      // "someone's out then they go out" - hide skeleton and reticle completely once eliminated
      if (player.status === 'eliminated') {
        return;
      }

      if (!player.pose || !player.pose.keypoints) {
        return;
      }

      const isWinner = player.status === 'winner';
      const isMovingAlert = this.state === GameState.RED && player.currentMotion > this.motionThreshold;
      const baseColor = isWinner ? '#DDA74F' : player.color;

      // Skeletons
      if (showSkeleton) {
        const keypoints = player.pose.keypoints;

        POSE_CONNECTIONS.forEach(([i, j]) => {
          const kp1 = keypoints[i];
          const kp2 = keypoints[j];
          if (kp1 && kp2 && kp1.score > 0.35 && kp2.score > 0.35) {
            this.ctx.beginPath();
            this.ctx.moveTo(kp1.x, kp1.y);
            this.ctx.lineTo(kp2.x, kp2.y);
            this.ctx.strokeStyle = isMovingAlert ? '#EF4444' : baseColor;
            this.ctx.lineWidth = isMovingAlert ? 4 : 3;
            this.ctx.stroke();
          }
        });

        keypoints.forEach((kp) => {
          if (kp.score > 0.35) {
            this.ctx.beginPath();
            this.ctx.arc(kp.x, kp.y, isMovingAlert ? 5.5 : 4, 0, Math.PI * 2);
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.strokeStyle = isMovingAlert ? '#EF4444' : baseColor;
            this.ctx.lineWidth = 2;
            this.ctx.fill();
            this.ctx.stroke();
          }
        });
      }

      // Center of Mass Reticle & Status Tag
      if (showCom && player.com) {
        const cx = player.com.x;
        const cy = player.com.y;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        this.ctx.strokeStyle = isMovingAlert ? '#EF4444' : baseColor;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        this.ctx.fillStyle = isMovingAlert ? '#EF4444' : baseColor;
        this.ctx.fill();

        // Tag pill above center of mass
        const tagY = Math.max(28, cy - 38);
        this.ctx.fillStyle = 'rgba(30, 27, 24, 0.85)';
        this.ctx.beginPath();
        this.ctx.roundRect(cx - 48, tagY - 12, 96, 24, 12);
        this.ctx.fill();

        this.ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
          isWinner ? '★ WINNER!' : player.name,
          cx,
          tagY
        );

        this.ctx.restore();
      }
    });
  }

  // ==========================================
  // GAME LOGIC, WINNING & ELIMINATIONS
  // ==========================================
  updateGameLogic(cw, ch) {
    const now = performance.now();
    const finishLineY = ch * this.finishLineRatio;
    const timeSinceStart = now - this.roundStartTime;

    // 1. Red Light Motion Violation Checks
    if (this.state === GameState.RED) {
      const timeSinceRed = now - this.redTurnStartTime;

      if (timeSinceRed > this.gracePeriodMs) {
        this.players.forEach(player => {
          if (player.status === 'active') {
            if (player.currentMotion > this.motionThreshold) {
              player.status = 'eliminated';
              player.eliminatedAt = now;
              soundEngine.playEliminationBuzzer();
              soundEngine.speak(`${player.name} eliminated!`);
            }
          }
        });
      }
    }

    // 2. Winner Check: Crossing Finish Line!
    // Active during GREEN or WARNING light after a short grace buffer (600ms)
    if ((this.state === GameState.GREEN || this.state === GameState.WARNING) && timeSinceStart > 600) {
      const winner = this.players.find(p => {
        if (p.status !== 'active') return false;

        const forwardY = p.forwardY || (p.com ? p.com.y : 9999);
        const startY = p.startForwardY || p.startComY || (ch * 0.75);

        // Player crossed if foremost point reaches the dotted finish line
        const reachedLine = forwardY <= (finishLineY + 8);
        const hasAdvanced = (startY - forwardY) >= 12 || p.progress >= 95;

        return (reachedLine && hasAdvanced) || (p.progress >= 100 && hasAdvanced);
      });

      if (winner) {
        winner.status = 'winner';
        winner.progress = 100;
        this.endRound(`${winner.name} crossed the finish line!`, winner);
      }
    }

    // 3. Survivor check
    if (this.state === GameState.RED || this.state === GameState.GREEN) {
      const survivors = this.players.filter(p => p.status === 'active');
      if (this.players.length > 0 && survivors.length === 0) {
        this.endRound('All players eliminated!');
      }
    }

    this.updateSurvivorsUI();
    this.renderRosterCards();
  }

  updateSurvivorsUI() {
    const total = this.players.length;
    const survivors = this.players.filter(p => p.status === 'active' || p.status === 'winner').length;
    this.survivorsCount.innerText = `${survivors} / ${total || 0}`;
  }

  renderRosterCards() {
    if (this.players.length === 0) return;

    let html = '';
    this.players.forEach(p => {
      let statusBadge = '';
      if (p.status === 'active') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-[#8A9A86]/20 text-[#3A4E37] text-[11px] font-label font-bold">In Play</span>`;
      } else if (p.status === 'eliminated') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-[#E06D53]/20 text-[#B93E28] text-[11px] font-label font-bold">Eliminated</span>`;
      } else if (p.status === 'winner') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-[#DDA74F]/25 text-[#7C5400] text-[11px] font-label font-bold">🏆 Winner</span>`;
      }

      const motionPct = Math.min(100, Math.round((p.currentMotion / (this.motionThreshold * 1.5)) * 100));
      const isRedAlert = this.state === GameState.RED && p.currentMotion > this.motionThreshold;

      html += `
        <div class="bg-[#F4ECE5] p-4 rounded-2xl border ${isRedAlert ? 'border-[#E06D53] shadow-sm' : 'border-[#E9E1DC]'} flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" style="background-color: ${p.color};"></span>
              <span class="font-label font-bold text-sm text-[#1E1B18]">${p.name}</span>
            </div>
            ${statusBadge}
          </div>

          <!-- Finish Line Progress -->
          <div class="my-2">
            <div class="flex items-center justify-between text-xs font-label mb-1">
              <span class="text-[#6E6761] font-medium">To Finish Line</span>
              <span class="font-bold text-[#1E1B18]">${p.progress}%</span>
            </div>
            <div class="w-full h-2 bg-[#E9E1DC] rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300" style="width: ${p.progress}%; background-color: ${p.color};"></div>
            </div>
          </div>

          <!-- Real-Time Motion Jitter -->
          <div class="mt-2 pt-2 border-t border-[#E9E1DC] flex items-center justify-between text-xs font-label">
            <span class="text-[#6E6761]">Motion Jitter:</span>
            <div class="flex items-center gap-1.5">
              <div class="w-16 h-1.5 bg-[#E9E1DC] rounded-full overflow-hidden">
                <div class="h-full ${motionPct > 70 ? 'bg-[#E06D53]' : 'bg-[#8A9A86]'} transition-all" style="width: ${motionPct}%;"></div>
              </div>
              <span class="font-mono text-[11px] font-bold ${isRedAlert ? 'text-[#E06D53]' : 'text-[#6E6761]'}">${p.currentMotion.toFixed(1)}</span>
            </div>
          </div>
        </div>
      `;
    });

    this.playersRoster.innerHTML = html;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.aqaaribGame = new RedLightGreenLightGame();
});
