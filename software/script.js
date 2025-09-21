class ColorShiftVR {
    constructor() {
        // --- DOM Elements ---
        this.cameraVideo = document.getElementById('cameraVideo');
        this.leftCanvas = document.getElementById('leftCanvas');
        this.rightCanvas = document.getElementById('rightCanvas');
        this.stopBtn = document.getElementById('stopBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.sharpnessUpBtn = document.getElementById('sharpnessUpBtn');
        this.sharpnessDownBtn = document.getElementById('sharpnessDownBtn');
        this.sharpnessIndicator = document.getElementById('sharpnessIndicator');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.vrView = document.getElementById('vrView');
        this.controls = document.querySelector('.controls');
        this.zoomControls = document.querySelector('.zoom-controls');
        
        // --- State Properties ---
        this.stream = null;
        this.isRunning = false;
        this.zoomLevel = 1.2;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        this.controlsTimeout = null;
        this.sharpnessLevel = 2.5;
        this.minSharpness = 0.5;
        this.maxSharpness = 2.5;
        this.lastFrameTime = 0;
        this.targetFPS = 30; // Smooth 30fps for mobile
        
        // --- Color shift & WebGL Properties ---
        this.hueShift = 0.4;
        this.leftGl = null;
        this.rightGl = null;
        this.leftProgram = null;
        this.rightProgram = null;
        this.leftTexture = null;
        this.rightTexture = null;
        this.leftUniforms = {};
        this.rightUniforms = {};
        
        // --- API and Audio Properties ---
        
        this.apiUrl = 'https://flask-hello-world4-seven.vercel.app/speak_description';
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        
        this.initWebGL();
        this.initEventListeners();
        this.autoStart();
    }

    initWebGL() {
        try {
            // Get WebGL contexts for both canvases
            this.leftGl = this.leftCanvas.getContext('webgl', { preserveDrawingBuffer: true });
            this.rightGl = this.rightCanvas.getContext('webgl', { preserveDrawingBuffer: true });
            
            if (!this.leftGl || !this.rightGl) {
                throw new Error('WebGL not supported');
            }
            
            // Set up WebGL for both contexts
            this.leftProgram = this.setupWebGLContext(this.leftGl, 'left');
            this.rightProgram = this.setupWebGLContext(this.rightGl, 'right');
            
        } catch (error) {
            console.error('WebGL initialization failed:', error);
            this.showError('WebGL not supported. Please use a compatible browser.');
        }
    }

    setupWebGLContext(gl, side) {
        // Vertex shader source
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        // Fragment shader source with all effects
        const fragmentShaderSource = `
            precision highp float;
            
            uniform sampler2D u_texture;
            uniform float u_hueShift;
            uniform float u_contrast;
            uniform float u_brightness;
            uniform float u_saturationBoost;
            uniform float u_sharpness;
            uniform vec2 u_resolution;
            
            varying vec2 v_texCoord;
            
            vec3 rgb2hsv(vec3 c) {
                vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;
                return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }
            
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            
            float getEdge(sampler2D tex, vec2 coord, vec2 resolution) {
                vec2 texel = 1.0 / resolution;
                float tl = length(texture2D(tex, coord + vec2(-texel.x, -texel.y)).rgb);
                float tm = length(texture2D(tex, coord + vec2(0.0, -texel.y)).rgb);
                float tr = length(texture2D(tex, coord + vec2(texel.x, -texel.y)).rgb);
                float ml = length(texture2D(tex, coord + vec2(-texel.x, 0.0)).rgb);
                float mm = length(texture2D(tex, coord).rgb);
                float mr = length(texture2D(tex, coord + vec2(texel.x, 0.0)).rgb);
                float bl = length(texture2D(tex, coord + vec2(-texel.x, texel.y)).rgb);
                float bm = length(texture2D(tex, coord + vec2(0.0, texel.y)).rgb);
                float br = length(texture2D(tex, coord + vec2(texel.x, texel.y)).rgb);
                float edge = abs(-tl - tm - tr - ml + 8.0*mm - mr - bl - bm - br);
                return edge;
            }
            
            void main() {
                vec4 color = texture2D(u_texture, v_texCoord);
                vec3 hsv = rgb2hsv(color.rgb);
                hsv.x = fract(hsv.x + u_hueShift);
                hsv.y = min(1.0, hsv.y * u_saturationBoost);
                vec3 rgb = hsv2rgb(hsv);
                rgb = (rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                rgb = clamp(rgb, 0.0, 1.0);
                float edge = getEdge(u_texture, v_texCoord, u_resolution);
                rgb += edge * u_sharpness * 0.1;
                gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
            }
        `;

        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = this.createProgram(gl, vertexShader, fragmentShader);
        gl.useProgram(program);
        
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
        
        const uniforms = {
            texture: gl.getUniformLocation(program, 'u_texture'),
            hueShift: gl.getUniformLocation(program, 'u_hueShift'),
            contrast: gl.getUniformLocation(program, 'u_contrast'),
            brightness: gl.getUniformLocation(program, 'u_brightness'),
            saturationBoost: gl.getUniformLocation(program, 'u_saturationBoost'),
            sharpness: gl.getUniformLocation(program, 'u_sharpness'),
            resolution: gl.getUniformLocation(program, 'u_resolution')
        };
        
        if (side === 'left') { this.leftUniforms = uniforms; } else { this.rightUniforms = uniforms; }
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        
        if (side === 'left') { this.leftTexture = texture; } else { this.rightTexture = texture; }
        
        return program;
    }

    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    initEventListeners() {
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.sharpnessUpBtn.addEventListener('click', () => this.increaseSharpness());
        this.sharpnessDownBtn.addEventListener('click', () => this.decreaseSharpness());
        
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        
        // --- Event listeners for showing controls AND triggering audio description ---
        // We use a single handler on the document to manage both behaviors.
        const handleInteraction = (event) => {
            this.showControls();
            
            // If the interaction is a click/tap and not on a button, trigger audio.
            if (event.type === 'click' && !event.target.closest('button')) {
                 this.handleScreenTap(event);
            }
        };

        document.addEventListener('mousemove', () => this.showControls());
        document.addEventListener('touchstart', () => this.showControls());
        document.addEventListener('click', handleInteraction);
    }

    async autoStart() {
        await this.startCamera();
        setTimeout(() => { this.enterFullscreen(); }, 1000);
        this.hideControlsAfterDelay();
    }

    async startCamera() {
        try {
            this.showLoading();
            this.hideError();
            
            const constraints = {
                video: {
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 },
                    facingMode: 'environment',
                    frameRate: { ideal: 30, max: 30 }
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.cameraVideo.srcObject = this.stream;
            
            this.cameraVideo.addEventListener('loadedmetadata', () => {
                const width = window.innerWidth / 2;
                const height = window.innerHeight;
                this.leftCanvas.width = width;
                this.leftCanvas.height = height;
                this.rightCanvas.width = width;
                this.rightCanvas.height = height;
                if (this.leftGl) this.leftGl.viewport(0, 0, width, height);
                if (this.rightGl) this.rightGl.viewport(0, 0, width, height);
                this.startProcessing();
            });
            
            this.showVRView();
            this.updateButtonStates(true);
            this.isRunning = true;
            
        } catch (err) {
            console.error('Error accessing camera:', err);
            this.showError(`Camera access failed: ${err.message}`);
            this.hideLoading();
        }
    }

    startProcessing() {
        this.processFrame();
    }

    processFrame() {
        if (!this.isRunning || !this.leftGl || !this.rightGl) return;
        
        if (this.cameraVideo.videoWidth === 0) {
            requestAnimationFrame(() => this.processFrame());
            return;
        }
        
        const now = performance.now();
        const timeSinceLastFrame = now - this.lastFrameTime;
        const targetFrameTime = 1000 / this.targetFPS;
        
        if (timeSinceLastFrame < targetFrameTime) {
            requestAnimationFrame(() => this.processFrame());
            return;
        }
        
        this.lastFrameTime = now;
        
        try {
            this.renderWithWebGL();
        } catch (error) {
            console.error('WebGL rendering error:', error);
            this.clearCanvases();
        }
        
        requestAnimationFrame(() => this.processFrame());
    }

    renderWithWebGL() {
        if (this.leftGl && this.leftProgram) {
            this.updateVideoTexture(this.leftGl, this.leftTexture);
            this.renderToCanvas(this.leftGl, this.leftUniforms, this.leftProgram);
        }
        if (this.rightGl && this.rightProgram) {
            this.updateVideoTexture(this.rightGl, this.rightTexture);
            this.renderToCanvas(this.rightGl, this.rightUniforms, this.rightProgram);
        }
    }

    updateVideoTexture(gl, texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cameraVideo);
    }

    renderToCanvas(gl, uniforms, program) {
        gl.useProgram(program);
        gl.uniform1f(uniforms.hueShift, this.hueShift);
        gl.uniform1f(uniforms.contrast, 1.2);
        gl.uniform1f(uniforms.brightness, 0.02);
        gl.uniform1f(uniforms.saturationBoost, 1.1);
        gl.uniform1f(uniforms.sharpness, this.sharpnessLevel);
        gl.uniform2f(uniforms.resolution, this.cameraVideo.videoWidth, this.cameraVideo.videoHeight);
        gl.uniform1i(uniforms.texture, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    clearCanvases() {
        const clear = (gl) => {
            if (gl) {
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        };
        clear(this.leftGl);
        clear(this.rightGl);
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.cameraVideo.srcObject = null;
        this.clearCanvases();
        this.hideVRView();
        this.updateButtonStates(false);
        this.isRunning = false;
    }

    // --- Screen Tap and API Methods ---

    handleScreenTap(event) {
        event.preventDefault();
        if (this.isProcessingFrame) {
            console.log('⏳ Already processing a frame, please wait...');
            return;
        }
        this.captureAndDescribeFrame();
    }

    async captureAndDescribeFrame() {
        if (!this.cameraVideo || this.cameraVideo.videoWidth === 0) {
            console.error('❌ Camera not ready for frame capture.');
            return;
        }

        this.isProcessingFrame = true;
        console.log('📸 Capturing frame for description...');

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.cameraVideo.videoWidth;
            tempCanvas.height = this.cameraVideo.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw the raw, unprocessed video frame to the canvas
            tempCtx.drawImage(this.cameraVideo, 0, 0);
            
            const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
            
            const response = await this.makeApiRequest(imageDataUrl);
            
            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            await audio.play();
            
            audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
            });

        } catch (error) {
            console.error('❌ Error in description process:', error);
            this.playFallbackSound();
        } finally {
            this.isProcessingFrame = false;
        }
    }

    async makeApiRequest(imageDataUrl, retryCount = 0) {
        try {
            console.log(`🔄 API attempt ${retryCount + 1}/${this.maxRetries + 1}`);
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({ image: imageDataUrl }),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            return response;
        } catch (error) {
            console.error(`❌ API attempt ${retryCount + 1} failed:`, error);
            if (retryCount < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.makeApiRequest(imageDataUrl, retryCount + 1);
            }
            throw error;
        }
    }

    playFallbackSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('❌ Error playing fallback sound:', error);
        }
    }

    // --- UI and Control Methods ---

    toggleFullscreen() {
        if (!this.isFullscreen()) this.enterFullscreen();
        else this.exitFullscreen();
    }

    isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    enterFullscreen() {
        const element = document.documentElement;
        if (element.requestFullscreen) element.requestFullscreen().catch(() => this.fallbackFullscreen());
        else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    }

    exitFullscreen() {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    
    fallbackFullscreen() {
        this.vrView.classList.add('fullscreen');
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    }
    
    handleFullscreenChange() {
        this.vrView.classList.toggle('fullscreen', this.isFullscreen());
    }

    updateButtonStates(isRunning) {
        const buttons = [this.stopBtn, this.fullscreenBtn, this.zoomInBtn, this.zoomOutBtn, this.sharpnessUpBtn, this.sharpnessDownBtn];
        buttons.forEach(btn => btn.disabled = !isRunning);
    }

    zoomIn() { this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + 0.2); }
    zoomOut() { this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - 0.2); }

    increaseSharpness() {
        this.sharpnessLevel = Math.min(this.maxSharpness, this.sharpnessLevel + 0.2);
        this.updateSharpnessIndicator();
    }

    decreaseSharpness() {
        this.sharpnessLevel = Math.max(this.minSharpness, this.sharpnessLevel - 0.2);
        this.updateSharpnessIndicator();
    }

    updateSharpnessIndicator() {
        const display = Math.round(((this.sharpnessLevel - this.minSharpness) / (this.maxSharpness - this.minSharpness)) * 9 + 1);
        this.sharpnessIndicator.textContent = `Sharp: ${display}/10`;
    }

    showControls() {
        this.controls.classList.remove('hidden');
        this.zoomControls.classList.remove('hidden');
        this.hideControlsAfterDelay();
    }

    hideControlsAfterDelay() {
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            this.controls.classList.add('hidden');
            this.zoomControls.classList.add('hidden');
        }, 3000);
    }

    showLoading() { this.loading.classList.remove('hidden'); }
    hideLoading() { this.loading.classList.add('hidden'); }
    showError(msg) { this.error.textContent = msg; this.error.classList.remove('hidden'); }
    hideError() { this.error.classList.add('hidden'); }
    showVRView() { this.vrView.classList.remove('hidden'); this.hideLoading(); }
    hideVRView() { this.vrView.classList.add('hidden'); }
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    new ColorShiftVR();
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
});
