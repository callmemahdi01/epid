// annotation-module-optimized.js
class AnnotationApp {
    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error("AnnotationApp: Target container for annotations not found:", targetContainerSelector);
            return;
        }
        if (getComputedStyle(this.targetContainer).position === 'static') {
            this.targetContainer.style.position = 'relative';
        }

        // Canvas elements
        this.canvas = null;
        this.ctx = null;
        this.committedCanvas = null;
        this.committedCtx = null;

        // Drawing state
        this.isDrawing = false;
        this.noteModeActive = false;
        this.currentTool = 'pen';
        this.penColor = '#000000';
        this.penLineWidth = 3;
        this.highlighterColor = '#FFFF00';
        this.highlighterLineWidth = 20;
        this.highlighterOpacity = 0.4;
        this.eraserWidth = 15;
        this.currentPath = null;
        this.drawings = [];

        // Performance optimizations
        this.animationFrameRequestId = null;
        this.lastMousePosition = { x: 0, y: 0 };
        this.minDistanceThreshold = 2; // Minimum distance between points
        this.renderBatch = [];
        this.maxBatchSize = 10;
        this.lastRenderTime = 0;
        this.renderInterval = 16; // ~60fps

        // Storage
        const baseStorageKey = 'pageAnnotations';
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_');
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        // Optimized icons (using simpler paths)
        this.icons = {
            pen: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>',
            highlighter: '<svg viewBox="0 0 24 24"><path d="M19.44 5.3L17.32 3.18c-.6-.6-1.59-.59-2.2.03l-1.63 1.63L18 9.28l1.47-1.47c.6-.61.61-1.59.03-2.2l-.06-.06zm-3.66 4.14L5.28 20H2v-3.28l10.5-10.5 3.28 3.28z"/></svg>',
            eraser: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
        };

        if(this.targetContainer) {
            this.init();
        }
    }

    init() {
        this.createCanvases();
        this.createToolbar();
        this.addEventListeners();
        this.loadDrawings();
        this.resizeCanvases();
        this.selectTool('pen');
        this.precompileRenderingContext();
        this.initializeWorker();
    }

    // Pre-compile rendering context for better performance
    precompileRenderingContext() {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.committedCtx.lineCap = 'round';
        this.committedCtx.lineJoin = 'round';
    }

    // Initialize Web Worker for heavy computations (if supported)
    initializeWorker() {
        if (typeof Worker !== 'undefined') {
            try {
                const workerCode = `
                    self.onmessage = function(e) {
                        const { type, data } = e.data;
                        
                        if (type === 'OPTIMIZE_PATH') {
                            const optimizedPath = optimizePath(data.points, data.threshold);
                            self.postMessage({ type: 'PATH_OPTIMIZED', data: optimizedPath });
                        }
                        
                        if (type === 'COLLISION_DETECT') {
                            const collisions = detectCollisions(data.eraserPoints, data.drawings, data.threshold);
                            self.postMessage({ type: 'COLLISIONS_DETECTED', data: collisions });
                        }
                    };
                    
                    function optimizePath(points, threshold) {
                        if (points.length < 3) return points;
                        
                        const optimized = [points[0]];
                        let lastPoint = points[0];
                        
                        for (let i = 1; i < points.length - 1; i++) {
                            const current = points[i];
                            const distance = Math.sqrt(
                                Math.pow(current.x - lastPoint.x, 2) + 
                                Math.pow(current.y - lastPoint.y, 2)
                            );
                            
                            if (distance >= threshold) {
                                optimized.push(current);
                                lastPoint = current;
                            }
                        }
                        
                        optimized.push(points[points.length - 1]);
                        return optimized;
                    }
                    
                    function detectCollisions(eraserPoints, drawings, eraserWidth) {
                        const toDelete = [];
                        
                        for (let drawingIndex = 0; drawingIndex < drawings.length; drawingIndex++) {
                            const drawing = drawings[drawingIndex];
                            if (drawing.tool === 'eraser') continue;
                            
                            let shouldDelete = false;
                            for (const eraserPoint of eraserPoints) {
                                for (const pathPoint of drawing.points) {
                                    const distance = Math.sqrt(
                                        Math.pow(eraserPoint.x - pathPoint.x, 2) + 
                                        Math.pow(eraserPoint.y - pathPoint.y, 2)
                                    );
                                    
                                    const collisionThreshold = (drawing.lineWidth / 2) + (eraserWidth / 2);
                                    if (distance < collisionThreshold) {
                                        shouldDelete = true;
                                        break;
                                    }
                                }
                                if (shouldDelete) break;
                            }
                            
                            if (shouldDelete) {
                                toDelete.push(drawingIndex);
                            }
                        }
                        
                        return toDelete;
                    }
                `;
                
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                this.worker = new Worker(URL.createObjectURL(blob));
                
                this.worker.onmessage = (e) => {
                    const { type, data } = e.data;
                    
                    if (type === 'PATH_OPTIMIZED' && this.currentPath) {
                        this.currentPath.points = data;
                        this.scheduleRender();
                    }
                    
                    if (type === 'COLLISIONS_DETECTED') {
                        this.handleCollisionResults(data);
                    }
                };
            } catch (error) {
                console.warn('Web Worker not available, using fallback methods');
                this.worker = null;
            }
        }
    }

    createCanvases() {
        this.canvas = document.createElement('canvas'); 
        this.canvas.id = 'annotationCanvas';
        
        // Performance optimization: disable image smoothing for better performance
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.willChange = 'transform';
        
        this.targetContainer.appendChild(this.canvas); 
        this.ctx = this.canvas.getContext('2d', { 
            alpha: true,
            desynchronized: true, // Enable low-latency rendering
            powerPreference: 'high-performance'
        });

        this.committedCanvas = document.createElement('canvas');
        this.committedCtx = this.committedCanvas.getContext('2d', { 
            alpha: true,
            willReadFrequently: true
        });
    }

    // Optimized event coordinate calculation with caching
    getEventCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        let x, y;
        
        if (event.touches && event.touches.length > 0) {
            x = event.touches[0].clientX - rect.left; 
            y = event.touches[0].clientY - rect.top;
        } else {
            x = event.clientX - rect.left; 
            y = event.clientY - rect.top;
        }
        
        // Use integer coordinates for better performance
        return { x: Math.round(x), y: Math.round(y) };
    }

    handleStart(event) {
        if (!this.noteModeActive || (event.touches && event.touches.length > 1)) return;
        event.preventDefault(); 
        
        this.isDrawing = true;
        const { x, y } = this.getEventCoordinates(event);
        this.lastMousePosition = { x, y };
        
        this.currentPath = { tool: this.currentTool, points: [{ x, y }] };
        
        if (this.currentTool === 'pen') {
            this.currentPath.color = this.penColor; 
            this.currentPath.lineWidth = this.penLineWidth; 
            this.currentPath.opacity = 1.0;
        } else if (this.currentTool === 'highlighter') {
            this.currentPath.color = this.highlighterColor; 
            this.currentPath.lineWidth = this.highlighterLineWidth; 
            this.currentPath.opacity = this.highlighterOpacity;
        } else if (this.currentTool === 'eraser') {
            this.currentPath.lineWidth = this.eraserWidth;
        }
    }

    handleMove(event) {
        if (!this.isDrawing || !this.noteModeActive || (event.touches && event.touches.length > 1)) return;
        event.preventDefault();
        
        const { x, y } = this.getEventCoordinates(event);
        
        // Distance-based filtering to reduce points
        const distance = Math.sqrt(
            Math.pow(x - this.lastMousePosition.x, 2) + 
            Math.pow(y - this.lastMousePosition.y, 2)
        );
        
        if (distance >= this.minDistanceThreshold) {
            this.lastMousePosition = { x, y };
            
            if (this.currentPath) {
                this.currentPath.points.push({ x, y });
                
                // Use Web Worker for path optimization if available
                if (this.worker && this.currentPath.points.length > 10) {
                    this.worker.postMessage({
                        type: 'OPTIMIZE_PATH',
                        data: {
                            points: this.currentPath.points,
                            threshold: this.minDistanceThreshold
                        }
                    });
                } else {
                    this.scheduleRender();
                }
            }
        }
    }

    // Improved rendering scheduling
    scheduleRender() {
        if (this.animationFrameRequestId === null) {
            this.animationFrameRequestId = requestAnimationFrame((timestamp) => {
                if (timestamp - this.lastRenderTime >= this.renderInterval) {
                    this.renderVisibleCanvas();
                    this.lastRenderTime = timestamp;
                }
                this.animationFrameRequestId = null;
            });
        }
    }

    handleEnd(mouseLeftCanvas = false) {
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }

        if (mouseLeftCanvas && !this.isDrawing) return;
        
        if (this.isDrawing) {
            this.isDrawing = false;
            
            if (this.currentPath && this.currentPath.points.length > 1) {
                if (this.currentTool === 'eraser') { 
                    this.eraseStrokesOptimized(); 
                } else { 
                    this.drawings.push(this.currentPath); 
                }
                this.redrawCommittedDrawings();
                this.saveDrawingsThrottled();
            }
            
            this.currentPath = null; 
            this.renderVisibleCanvas(); 
        }
    }

    // Optimized eraser with Web Worker support
    eraseStrokesOptimized() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;
        
        if (this.worker) {
            this.worker.postMessage({
                type: 'COLLISION_DETECT',
                data: {
                    eraserPoints: this.currentPath.points,
                    drawings: this.drawings,
                    eraserWidth: this.eraserWidth
                }
            });
        } else {
            this.eraseStrokes(); // Fallback to original method
        }
    }

    handleCollisionResults(toDeleteIndices) {
        if (toDeleteIndices.length > 0) {
            // Remove in reverse order to maintain indices
            toDeleteIndices.sort((a, b) => b - a);
            for (const index of toDeleteIndices) {
                this.drawings.splice(index, 1);
            }
        }
    }

    // Original eraser method as fallback
    eraseStrokes() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;
        
        const drawingsToDelete = new Set();
        
        for (const eraserPoint of this.currentPath.points) {
            for (let i = 0; i < this.drawings.length; i++) {
                const drawing = this.drawings[i];
                if (drawingsToDelete.has(drawing) || drawing.tool === 'eraser') continue;
                
                for (const pathPoint of drawing.points) {
                    const distance = Math.sqrt(
                        Math.pow(eraserPoint.x - pathPoint.x, 2) + 
                        Math.pow(eraserPoint.y - pathPoint.y, 2)
                    );
                    
                    const collisionThreshold = (drawing.lineWidth / 2) + (this.eraserWidth / 2);
                    if (distance < collisionThreshold) { 
                        drawingsToDelete.add(drawing); 
                        break; 
                    }
                }
            }
        }
        
        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(drawing => !drawingsToDelete.has(drawing));
        }
    }

    // Optimized rendering with batch processing
    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas, 0, 0);
        }
        
        if (this.currentPath && this.isDrawing) {
            this._drawSinglePathOptimized(this.currentPath, this.ctx);
        }
    }

    // Optimized single path drawing
    _drawSinglePathOptimized(path, context) {
        if (!path || path.points.length === 0) return;

        const points = path.points;
        
        // Set context properties once
        context.lineCap = 'round';
        context.lineJoin = 'round';
        
        if (path.tool === 'eraser' && this.isDrawing && path === this.currentPath) { 
            context.strokeStyle = 'rgba(200, 0, 0, 0.6)'; 
            context.lineWidth = 2; 
            context.globalAlpha = 0.6;
        } else if (path.tool !== 'eraser') { 
            context.strokeStyle = path.color; 
            context.lineWidth = path.lineWidth; 
            context.globalAlpha = path.opacity;
        } else { 
            return; 
        }

        // Use more efficient path drawing for better performance
        if (points.length > 1) {
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            
            // Use quadratic curves for smoother lines with fewer operations
            for (let i = 1; i < points.length - 1; i++) {
                const currentPoint = points[i];
                const nextPoint = points[i + 1];
                const midX = (currentPoint.x + nextPoint.x) / 2;
                const midY = (currentPoint.y + nextPoint.y) / 2;
                
                context.quadraticCurveTo(currentPoint.x, currentPoint.y, midX, midY);
            }
            
            // Draw to the last point
            if (points.length > 1) {
                const lastPoint = points[points.length - 1];
                context.lineTo(lastPoint.x, lastPoint.y);
            }
            
            context.stroke();
        }
        
        context.globalAlpha = 1.0;
    }

    // Throttled save to prevent excessive localStorage writes
    saveDrawingsThrottled() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            this.saveDrawings();
        }, 500); // Save after 500ms of inactivity
    }

    // Rest of the methods remain the same but with minor optimizations
    _createStyledButton(id, title, innerHTML, className = 'tool-button') {
        const button = document.createElement('button'); 
        button.id = id; 
        button.title = title; 
        button.className = className;
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    createToolbar() {
        this.masterAnnotationToggleBtn = this._createStyledButton('masterAnnotationToggleBtn', 'NOTE - enable/disable', 'NOTE ✏️', '');
        this.masterAnnotationToggleBtn.style.cssText = 'position: absolute; top: 5px; right: 5px; z-index: 1000;';
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);

        this.toolsPanel = document.createElement('div'); 
        this.toolsPanel.id = 'annotationToolsPanel';
        this.toolsPanel.style.cssText = 'display: none; position: absolute; flex-direction: column; top: 50px; right: 5px; z-index: 1000;';

        const toolsGroup = document.createElement('div'); 
        toolsGroup.className = 'toolbar-group';
        this.penBtn = this._createStyledButton('penBtn', 'قلم', this.icons.pen);
        this.highlighterBtn = this._createStyledButton('highlighterBtn', 'هایلایتر', this.icons.highlighter);
        this.eraserBtn = this._createStyledButton('eraserBtn', 'پاک‌کن', this.icons.eraser);
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);

        const penSettingsGroup = document.createElement('div'); 
        penSettingsGroup.className = 'toolbar-group'; 
        penSettingsGroup.id = 'penSettingsGroup';
        this.penColorPicker = document.createElement('input'); 
        this.penColorPicker.type = 'color'; 
        this.penColorPicker.value = this.penColor; 
        this.penColorPicker.title = 'رنگ قلم';
        this.penLineWidthInput = document.createElement('input'); 
        this.penLineWidthInput.type = 'number'; 
        this.penLineWidthInput.value = this.penLineWidth; 
        this.penLineWidthInput.min = '1'; 
        this.penLineWidthInput.max = '20'; 
        this.penLineWidthInput.title = 'ضخامت قلم';
        penSettingsGroup.append(this.penColorPicker, this.penLineWidthInput);
        this.toolsPanel.appendChild(penSettingsGroup);

        const highlighterSettingsGroup = document.createElement('div'); 
        highlighterSettingsGroup.className = 'toolbar-group'; 
        highlighterSettingsGroup.id = 'highlighterSettingsGroup';
        this.highlighterColorPicker = document.createElement('input'); 
        this.highlighterColorPicker.type = 'color'; 
        this.highlighterColorPicker.value = this.highlighterColor; 
        this.highlighterColorPicker.title = 'رنگ هایلایتر';
        this.highlighterLineWidthInput = document.createElement('input'); 
        this.highlighterLineWidthInput.type = 'number'; 
        this.highlighterLineWidthInput.value = this.highlighterLineWidth; 
        this.highlighterLineWidthInput.min = '5'; 
        this.highlighterLineWidthInput.max = '50'; 
        this.highlighterLineWidthInput.title = 'ضخامت هایلایتر';
        highlighterSettingsGroup.append(this.highlighterColorPicker, this.highlighterLineWidthInput);
        this.toolsPanel.appendChild(highlighterSettingsGroup);

        this.clearBtn = this._createStyledButton('clearAnnotationsBtn', 'پاک کردن تمام یادداشت‌ها', 'پاک کردن همه', '');
        this.clearBtn.id = 'clearAnnotationsBtn';
        this.toolsPanel.appendChild(this.clearBtn);

        this.targetContainer.appendChild(this.toolsPanel);
        this.updateToolSettingsVisibility();
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById('penSettingsGroup');
        const highlighterSettings = document.getElementById('highlighterSettingsGroup');
        if (penSettings) {
            penSettings.style.display = (this.currentTool === 'pen' && this.noteModeActive) ? 'flex' : 'none';
        }
        if (highlighterSettings) {
            highlighterSettings.style.display = (this.currentTool === 'highlighter' && this.noteModeActive) ? 'flex' : 'none';
        }
    }

    addEventListeners() {
        // Throttled resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resizeCanvases(), 100);
        });

        // Optimized touch events with passive where possible
        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.handleEnd(), { passive: true });
        this.canvas.addEventListener('touchcancel', () => this.handleEnd(), { passive: true });

        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleEnd());
        this.canvas.addEventListener('mouseleave', () => this.handleEnd(true));

        this.masterAnnotationToggleBtn.addEventListener('click', () => this.toggleMasterAnnotationMode());

        this.penBtn.addEventListener('click', () => this.selectTool('pen'));
        this.highlighterBtn.addEventListener('click', () => this.selectTool('highlighter'));
        this.eraserBtn.addEventListener('click', () => this.selectTool('eraser'));
        this.clearBtn.addEventListener('click', () => this.clearAnnotations());

        this.penColorPicker.addEventListener('input', (e) => { this.penColor = e.target.value;});
        this.penLineWidthInput.addEventListener('input', (e) => { this.penLineWidth = parseInt(e.target.value, 10);});
        this.highlighterColorPicker.addEventListener('input', (e) => { this.highlighterColor = e.target.value;});
        this.highlighterLineWidthInput.addEventListener('input', (e) => { this.highlighterLineWidth = parseInt(e.target.value, 10);});
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        if (this.noteModeActive) {
            this.canvas.style.pointerEvents = 'auto';
            document.body.classList.add('annotation-active');
            this.targetContainer.classList.add('annotation-active');
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (فعال)';
            this.masterAnnotationToggleBtn.classList.add('active');
            this.toolsPanel.style.display = 'flex';
            if (!this.currentTool) this.selectTool('pen');
        } else {
            this.canvas.style.pointerEvents = 'none';
            document.body.classList.remove('annotation-active');
            this.targetContainer.classList.remove('annotation-active');
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (غیرفعال)';
            this.masterAnnotationToggleBtn.classList.remove('active');
            this.toolsPanel.style.display = 'none';
            this.isDrawing = false; 
            this.currentPath = null; 
            if (this.animationFrameRequestId !== null) {
                cancelAnimationFrame(this.animationFrameRequestId);
                this.animationFrameRequestId = null;
            }
            this.renderVisibleCanvas(); 
        }
        this.updateToolSettingsVisibility();
    }

    resizeCanvases() {
        const width = this.targetContainer.scrollWidth;
        const height = this.targetContainer.scrollHeight;

        this.canvas.width = width; 
        this.canvas.height = height;
        this.canvas.style.width = `${width}px`; 
        this.canvas.style.height = `${height}px`;

        this.committedCanvas.width = width;
        this.committedCanvas.height = height;

        this.redrawCommittedDrawings();
        this.renderVisibleCanvas();
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => {
            this._drawSinglePathOptimized(path, this.committedCtx);
        });
    }

    selectTool(toolName) {
        this.currentTool = toolName;
        this.updateActiveToolButtonVisuals();
        this.updateToolSettingsVisibility();
    }

    updateActiveToolButtonVisuals() {
        if(this.penBtn) this.penBtn.classList.remove('active');
        if(this.highlighterBtn) this.highlighterBtn.classList.remove('active');
        if(this.eraserBtn) this.eraserBtn.classList.remove('active');

        if (this.currentTool === 'pen' && this.penBtn) this.penBtn.classList.add('active');
        else if (this.currentTool === 'highlighter' && this.highlighterBtn) this.highlighterBtn.classList.add('active');
        else if (this.currentTool === 'eraser' && this.eraserBtn) this.eraserBtn.classList.add('active');
    }

    clearAnnotations() {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟')) {
            this.drawings = []; 
            localStorage.removeItem(this.storageKey);
            this.redrawCommittedDrawings();
            this.renderVisibleCanvas();
        }
    }

    saveDrawings() {
        try { 
            const drawingsToSave = this.drawings.filter(path => path.tool !== 'eraser');
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        }
        catch (error) { 
            console.error("AnnotationApp: Failed to save drawings:", error); 
            alert("خطا در ذخیره‌سازی یادداشت‌ها. ممکن است حافظه مرورگر پر باشد."); 
        }
    }

    loadDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData); 
                this.drawings.forEach(path => {
                    path.opacity = path.opacity !== undefined ? path.opacity : (path.tool === 'highlighter' ? this.highlighterOpacity : 1.0);
                    path.lineWidth = path.lineWidth !== undefined ? path.lineWidth : 
                                     (path.tool === 'pen' ? this.penLineWidth : 
                                     (path.tool === 'highlighter' ? this.highlighterLineWidth : this.eraserWidth));
                });
            } catch (error) { 
                console.error("AnnotationApp: Failed to parse drawings from localStorage:", error); 
                this.drawings = [];
                localStorage.removeItem(this.storageKey);
            }
        } else {
            this.drawings = [];
        }
        this.redrawCommittedDrawings();
        this.renderVisibleCanvas();
    }

    // Cleanup method
    destroy() {
        if (this.worker) {
            this.worker.terminate();
        }
        
        if (this.animationFrameRequestId) {
            cancelAnimationFrame(this.animationFrameRequestId);
        }
        
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
    }
}