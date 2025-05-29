// annotation-module.js
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

        // Visible canvas
        this.canvas = null;
        this.ctx = null;

        // Offscreen canvas for committed drawings
        this.committedCanvas = null;
        this.committedCtx = null;

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

        // For requestAnimationFrame
        this.animationFrameRequestId = null;

        const baseStorageKey = 'pageAnnotations';
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_');
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        this.icons = {
            pen: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
            highlighter: '<svg viewBox="0 0 24 24"><path d="M19.44 5.3L17.32 3.18c-.6-.6-1.59-.59-2.2.03l-1.63 1.63L18 9.28l1.47-1.47c.6-.61.61-1.59.03-2.2l-.06-.06zm-3.66 4.14L5.28 20H2v-3.28l10.5-10.5 3.28 3.28zM4 18.72V20h1.28l.99-.99-1.28-1.28-.99.99z"/></svg>',
            eraser: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>'
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
    }

    createCanvases() {
        this.canvas = document.createElement('canvas'); 
        this.canvas.id = 'annotationCanvas';
        this.targetContainer.appendChild(this.canvas); 
        this.ctx = this.canvas.getContext('2d');

        this.committedCanvas = document.createElement('canvas');
        this.committedCtx = this.committedCanvas.getContext('2d');
    }

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
        this.masterAnnotationToggleBtn.style.top = '5px'; 
        this.masterAnnotationToggleBtn.style.right = '5px'; 
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);

        this.toolsPanel = document.createElement('div'); 
        this.toolsPanel.id = 'annotationToolsPanel';
        this.toolsPanel.style.display = 'none';
        this.toolsPanel.style.flexDirection = 'column';
        this.toolsPanel.style.top = '50px'; 
        this.toolsPanel.style.right = '5px'; 

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
        this.penLineWidthInput.min = '1'; this.penLineWidthInput.max = '20'; 
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
        window.addEventListener('resize', () => this.resizeCanvases());

        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.handleEnd());
        this.canvas.addEventListener('touchcancel', () => this.handleEnd());

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
            document.body.classList.add('annotation-active'); // Correct: Add class when active
            this.targetContainer.classList.add('annotation-active'); // Correct: Add class when active
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (فعال)'; // Indicates action to disable
            this.masterAnnotationToggleBtn.classList.add('active'); // Visually show it's active
            this.toolsPanel.style.display = 'flex';
            if (!this.currentTool) this.selectTool('pen');
        } else {
            this.canvas.style.pointerEvents = 'none';
            document.body.classList.remove('annotation-active'); // Correct: Remove class when inactive
            this.targetContainer.classList.remove('annotation-active'); // Correct: Remove class when inactive
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (غیرفعال)'; // Indicates action to enable
            this.masterAnnotationToggleBtn.classList.remove('active'); // Visually show it's inactive
            this.toolsPanel.style.display = 'none';
            this.isDrawing = false; 
            this.currentPath = null; 
            if (this.animationFrameRequestId !== null) { // Cancel any pending frame if disabling
                cancelAnimationFrame(this.animationFrameRequestId);
                this.animationFrameRequestId = null;
            }
            this.renderVisibleCanvas(); 
        }
        this.updateToolSettingsVisibility();
    }

    getEventCoordinates(event) {
        let x, y; 
        const rect = this.canvas.getBoundingClientRect();
        if (event.touches && event.touches.length > 0) {
            x = event.touches[0].clientX - rect.left; 
            y = event.touches[0].clientY - rect.top;
        } else {
            x = event.clientX - rect.left; 
            y = event.clientY - rect.top;
        }
        return { x, y };
    }

    handleStart(event) {
        if (!this.noteModeActive || (event.touches && event.touches.length > 1)) return;
        event.preventDefault(); 
        this.isDrawing = true;
        const { x, y } = this.getEventCoordinates(event);
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
        if (this.currentPath) {
            this.currentPath.points.push({ x, y });
            // Schedule rendering with requestAnimationFrame
            if (this.animationFrameRequestId === null) {
                this.animationFrameRequestId = requestAnimationFrame(() => {
                    this.renderVisibleCanvas();
                    this.animationFrameRequestId = null; // Reset for next frame
                });
            }
        }
    }

    handleEnd(mouseLeftCanvas = false) {
        // Cancel any pending animation frame from handleMove
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }

        if (mouseLeftCanvas && !this.isDrawing) return;
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.currentPath && this.currentPath.points.length > 1) {
                if (this.currentTool === 'eraser') { 
                    this.eraseStrokes(); 
                } else { 
                    this.drawings.push(this.currentPath); 
                }
                this.redrawCommittedDrawings();
                this.saveDrawings();
            }
            this.currentPath = null; 
            // Ensure final state is rendered immediately after drawing ends
            this.renderVisibleCanvas(); 
        }
    }

    eraseStrokes() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;
        const drawingsToDelete = new Set();
        for (const eraserPoint of this.currentPath.points) {
            for (let i = 0; i < this.drawings.length; i++) {
                const drawing = this.drawings[i];
                if (drawingsToDelete.has(drawing) || drawing.tool === 'eraser') continue;
                for (const pathPoint of drawing.points) {
                    const distance = Math.sqrt(Math.pow(eraserPoint.x - pathPoint.x, 2) + Math.pow(eraserPoint.y - pathPoint.y, 2));
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
            this._drawSinglePath(path, this.committedCtx);
        });
    }

    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas, 0, 0);
        }
        if (this.currentPath && this.isDrawing) { // Only draw currentPath if actively drawing
            this._drawSinglePath(this.currentPath, this.ctx);
        }
    }

    _drawSinglePath(path, context) {
        if (!path || path.points.length === 0) return;

        context.beginPath(); 
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

        if (path.points.length > 0) {
            context.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
                context.lineTo(path.points[i].x, path.points[i].y);
            }
            context.stroke();
        }
        context.globalAlpha = 1.0;
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
}