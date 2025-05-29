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

        this.canvas = null;
        this.ctx = null;

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

        this.animationFrameRequestId = null;

        const baseStorageKey = 'pageAnnotations';
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_');
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        this.icons = {
            pen: '<span class="material-symbols-outlined">stylus_note</span>',
            highlighter: '<span class="material-symbols-outlined">ink_highlighter</span>',
            eraser: '<span class="material-symbols-outlined">ink_eraser</span>'
        };

        if (this.targetContainer) {
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
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '1000'; // Keep zIndex for layering
        this.canvas.style.pointerEvents = 'none';
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
        return button; // Reverted to original: no inline styles
    }


    createToolbar() {
        this.masterAnnotationToggleBtn = this._createStyledButton('masterAnnotationToggleBtn', 'NOTE - enable/disable annotations', 'NOTE ✏️', ''); // Original className
        this.masterAnnotationToggleBtn.style.top = '5px'; // Original style
        this.masterAnnotationToggleBtn.style.right = '5px'; // Original style
        // Removed: this.masterAnnotationToggleBtn.style.position = 'absolute'; (Let user CSS handle or rely on parent)
        // Removed: this.masterAnnotationToggleBtn.style.zIndex = '1002';
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);


        this.toolsPanel = document.createElement('div');
        this.toolsPanel.id = 'annotationToolsPanel';
        this.toolsPanel.style.display = 'none'; // Original style
        this.toolsPanel.style.flexDirection = 'column'; // Original style
        this.toolsPanel.style.top = '50px'; // Original style
        this.toolsPanel.style.right = '5px'; // Original style
        // Removed: position, zIndex, backgroundColor, border, borderRadius, padding, boxShadow, gap

        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'toolbar-group';
        // Removed: toolsGroup.style.display = 'flex';
        // Removed: toolsGroup.style.gap = '5px';

        this.penBtn = this._createStyledButton('penBtn', 'قلم', this.icons.pen);
        this.highlighterBtn = this._createStyledButton('highlighterBtn', 'هایلایتر', this.icons.highlighter);
        this.eraserBtn = this._createStyledButton('eraserBtn', 'پاک‌کن', this.icons.eraser);
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);

        const penSettingsGroup = document.createElement('div');
        penSettingsGroup.className = 'toolbar-group setting-group'; // Keep class for user CSS
        penSettingsGroup.id = 'penSettingsGroup';
        // Removed: penSettingsGroup.style.display = 'flex'; (Handled by updateToolSettingsVisibility)
        // Removed: penSettingsGroup.style.flexDirection = 'column';
        // Removed: penSettingsGroup.style.gap = '5px';

        const penColorLabel = document.createElement('label');
        this.penColorPicker = document.createElement('input');
        this.penColorPicker.type = 'color';
        this.penColorPicker.value = this.penColor;
        // Removed: this.penColorPicker.style.marginLeft = '5px';

        const penWidthLabel = document.createElement('label');
        this.penLineWidthInput = document.createElement('input');
        this.penLineWidthInput.type = 'number';
        this.penLineWidthInput.value = this.penLineWidth;
        this.penLineWidthInput.min = '1'; this.penLineWidthInput.max = '20';
        // Removed: this.penLineWidthInput.style.marginLeft = '5px';
        // Removed: this.penLineWidthInput.style.width = '50px';

        penSettingsGroup.append(penColorLabel, this.penColorPicker, penWidthLabel, this.penLineWidthInput);
        this.toolsPanel.appendChild(penSettingsGroup);


        const highlighterSettingsGroup = document.createElement('div');
        highlighterSettingsGroup.className = 'toolbar-group setting-group'; // Keep class for user CSS
        highlighterSettingsGroup.id = 'highlighterSettingsGroup';
        // Removed: highlighterSettingsGroup.style.display = 'none'; (Handled by updateToolSettingsVisibility)
        // Removed: highlighterSettingsGroup.style.flexDirection = 'column';
        // Removed: highlighterSettingsGroup.style.gap = '5px';

        const highlighterColorLabel = document.createElement('label');
        this.highlighterColorPicker = document.createElement('input');
        this.highlighterColorPicker.type = 'color';
        this.highlighterColorPicker.value = this.highlighterColor;
        // Removed: this.highlighterColorPicker.style.marginLeft = '5px';

        const highlighterWidthLabel = document.createElement('label');
        this.highlighterLineWidthInput = document.createElement('input');
        this.highlighterLineWidthInput.type = 'number';
        this.highlighterLineWidthInput.value = this.highlighterLineWidth;
        this.highlighterLineWidthInput.min = '5';
        this.highlighterLineWidthInput.max = '50';
        // Removed: this.highlighterLineWidthInput.style.marginLeft = '5px';
        // Removed: this.highlighterLineWidthInput.style.width = '50px';

        highlighterSettingsGroup.append(highlighterColorLabel, this.highlighterColorPicker, highlighterWidthLabel, this.highlighterLineWidthInput);
        this.toolsPanel.appendChild(highlighterSettingsGroup);


        this.clearBtn = this._createStyledButton('clearAnnotationsBtn', 'پاک کردن تمام یادداشت‌ها', 'پاک کردن همه', ''); // Original className
        this.clearBtn.id = 'clearAnnotationsBtn'; // Original had this
        // Removed: this.clearBtn.style.marginTop = '10px';
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

        this.penColorPicker.addEventListener('input', (e) => { this.penColor = e.target.value; });
        this.penLineWidthInput.addEventListener('input', (e) => { this.penLineWidth = parseInt(e.target.value, 10); });
        this.highlighterColorPicker.addEventListener('input', (e) => { this.highlighterColor = e.target.value; });
        this.highlighterLineWidthInput.addEventListener('input', (e) => { this.highlighterLineWidth = parseInt(e.target.value, 10); });
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        if (this.noteModeActive) {
            this.canvas.style.pointerEvents = 'auto';
            document.body.classList.add('annotation-active');
            this.targetContainer.classList.add('annotation-active');
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (فعال)';
            this.masterAnnotationToggleBtn.classList.add('active');
            this.toolsPanel.style.display = 'flex'; // This was in original logic for visibility
            if (!this.currentTool) this.selectTool('pen');
        } else {
            this.canvas.style.pointerEvents = 'none';
            document.body.classList.remove('annotation-active');
            this.targetContainer.classList.remove('annotation-active');
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (غیرفعال)';
            this.masterAnnotationToggleBtn.classList.remove('active');
            this.toolsPanel.style.display = 'none'; // This was in original logic for visibility
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
            if (this.currentTool === 'highlighter') {
                if (this.currentPath.points.length <= 1) {
                    this.currentPath.points.push({ x, y });
                } else {
                    this.currentPath.points[1] = { x, y };
                }
            } else {
                this.currentPath.points.push({ x, y });
            }

            if (this.animationFrameRequestId === null) {
                this.animationFrameRequestId = requestAnimationFrame(() => {
                    this.renderVisibleCanvas();
                    this.animationFrameRequestId = null;
                });
            }
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
            if (this.currentPath && this.currentPath.points.length > 0) {
                if (this.currentTool === 'highlighter') {
                    const startPoint = this.currentPath.points[0];
                    const endPoint = this.currentPath.points.length > 1 ? this.currentPath.points[1] : startPoint;

                    this.currentPath.points = [startPoint, endPoint];

                    this.currentPath.color = this.highlighterColor;
                    this.currentPath.lineWidth = this.highlighterLineWidth;
                    this.currentPath.opacity = this.highlighterOpacity;

                    this.drawings.push(this.currentPath);

                } else if (this.currentTool === 'eraser') {
                    this.eraseStrokes();
                } else {
                    if (this.currentPath.points.length > 1) {
                        this.drawings.push(this.currentPath);
                    }
                }
                this.redrawCommittedDrawings();
                this.saveDrawings();
            }
            this.currentPath = null;
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

        if (this.currentPath && this.isDrawing) {
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
        if (this.penBtn) this.penBtn.classList.remove('active');
        if (this.highlighterBtn) this.highlighterBtn.classList.remove('active');
        if (this.eraserBtn) this.eraserBtn.classList.remove('active');

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
        } catch (error) {
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
