// annotation-module.js
class AnnotationApp {
    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error("AnnotationApp: Target container for annotations not found:", targetContainerSelector);
            return;
        }
        // Ensure targetContainer has a non-static position for absolute positioning of children
        if (getComputedStyle(this.targetContainer).position === 'static') {
            this.targetContainer.style.position = 'relative';
        }

        // Visible canvas for drawing
        this.canvas = null;
        this.ctx = null;

        // Offscreen canvas for committed drawings
        this.committedCanvas = null;
        this.committedCtx = null;

        this.isDrawing = false;
        this.noteModeActive = false;
        this.currentTool = 'pen'; // Default tool
        this.penColor = '#000000';
        this.penLineWidth = 3;
        this.highlighterColor = '#FFFF00';
        this.highlighterLineWidth = 20;
        this.highlighterOpacity = 0.4;
        this.eraserWidth = 15;
        this.currentPath = null; // Holds the current path being drawn
        this.drawings = []; // Array to store all paths

        // For requestAnimationFrame optimization
        this.rafId = null;
        this.isRenderScheduled = false;

        // DOM element caching
        this.domCache = {};

        // Unique storage key per page
        const baseStorageKey = 'pageAnnotations';
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_');
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        this.icons = {
            pen: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
            highlighter: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19.44 5.3L17.32 3.18c-.6-.6-1.59-.59-2.2.03l-1.63 1.63L18 9.28l1.47-1.47c.6-.61.61-1.59.03-2.2l-.06-.06zm-3.66 4.14L5.28 20H2v-3.28l10.5-10.5 3.28 3.28zM4 18.72V20h1.28l.99-.99-1.28-1.28-.99.99z"/></svg>',
            eraser: '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>'
        };

        if (this.targetContainer) {
            this.init();
        }
    }

    init() {
        this._applyStyles(); // Inject CSS styles
        this.createCanvases();
        this.createToolbar();
        this.addEventListeners();
        this.loadDrawings();
        this.resizeCanvases(); // Initial resize
        this.selectTool(this.currentTool); // Set initial tool
    }

    _applyStyles() {
        const styleId = 'annotation-app-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            .annotation-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none; /* Initially no pointer events */
                z-index: 1000; /* Ensure canvas is on top */
            }
            .annotation-active .annotation-canvas {
                pointer-events: auto; /* Enable drawing when active */
            }
            .annotation-master-toggle {
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                background-color: #f0f0f0;
                border: 1px solid #ccc;
                border-radius: 4px;
                cursor: pointer;
                z-index: 1002;
                font-size: 14px;
            }
            .annotation-master-toggle.active {
                background-color: #e0e0e0;
                font-weight: bold;
            }
            .annotation-tools-panel {
                position: absolute;
                top: 50px;
                right: 10px;
                background-color: white;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 10px;
                display: none; /* Hidden by default */
                flex-direction: column;
                gap: 10px;
                z-index: 1001;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 0;
                transform: translateY(-10px);
            }
            .annotation-tools-panel.visible {
                display: flex;
                opacity: 1;
                transform: translateY(0);
            }
            .annotation-toolbar-group {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .annotation-tool-button {
                padding: 8px;
                background-color: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .annotation-tool-button svg {
                display: block; /* Prevents extra space below SVG */
            }
            .annotation-tool-button:hover {
                background-color: #f5f5f5;
            }
            .annotation-tool-button.active {
                background-color: #e0e0e0;
                border-color: #bbb;
            }
            .annotation-tool-button.clear-button {
                background-color: #ffdddd;
                border-color: #ffaaaa;
                width: 100%; /* Make clear button full width within its group */
            }
            .annotation-tool-button.clear-button:hover {
                background-color: #ffcccc;
            }

            .annotation-settings-group {
                 display: flex; /* Default, will be overridden by style.display in JS */
                 flex-direction: column;
                 gap: 5px;
                 padding: 5px;
                 border: 1px solid #eee;
                 border-radius: 3px;
            }
            .annotation-settings-group input[type="color"] {
                width: 40px;
                height: 25px;
                padding: 0;
                border: 1px solid #ccc;
            }
            .annotation-settings-group input[type="number"] {
                width: 50px;
                padding: 3px;
                border: 1px solid #ccc;
                border-radius: 3px;
            }
            /* Target container class when annotation is active for potential global overrides */
            .annotation-target-active {
                 /* Example: might want to prevent text selection on target while drawing */
                /* user-select: none; */
            }
        `;
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    }

    createCanvases() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'annotationCanvas';
        this.canvas.className = 'annotation-canvas'; // Apply CSS class
        this.targetContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.committedCanvas = document.createElement('canvas');
        this.committedCtx = this.committedCanvas.getContext('2d');

        // Cache canvas elements
        this.domCache.canvas = this.canvas;
        this.domCache.committedCanvas = this.committedCanvas;
    }

    _createStyledButton(id, title, innerHTML, datasetAttributes = {}, baseClass = 'annotation-tool-button') {
        const button = document.createElement('button');
        button.id = id;
        button.title = title;
        button.className = baseClass;
        if (innerHTML) button.innerHTML = innerHTML;
        for (const key in datasetAttributes) {
            button.dataset[key] = datasetAttributes[key];
        }
        return button;
    }

    createToolbar() {
        this.domCache.masterAnnotationToggleBtn = this._createStyledButton(
            'masterAnnotationToggleBtn',
            'NOTE - enable/disable annotations',
            'یادداشت ✏️',
            {},
            'annotation-master-toggle'
        );
        this.targetContainer.appendChild(this.domCache.masterAnnotationToggleBtn);

        this.domCache.toolsPanel = document.createElement('div');
        this.domCache.toolsPanel.id = 'annotationToolsPanel';
        this.domCache.toolsPanel.className = 'annotation-tools-panel'; // Apply CSS class

        const toolsGroup = document.createElement('div');
        toolsGroup.className = 'annotation-toolbar-group';
        this.domCache.penBtn = this._createStyledButton('penBtn', 'قلم', this.icons.pen, { tool: 'pen' });
        this.domCache.highlighterBtn = this._createStyledButton('highlighterBtn', 'هایلایتر', this.icons.highlighter, { tool: 'highlighter' });
        this.domCache.eraserBtn = this._createStyledButton('eraserBtn', 'پاک‌کن', this.icons.eraser, { tool: 'eraser' });
        toolsGroup.append(this.domCache.penBtn, this.domCache.highlighterBtn, this.domCache.eraserBtn);
        this.domCache.toolsPanel.appendChild(toolsGroup);
        this.domCache.toolsGroup = toolsGroup; // Cache for event delegation

        // Pen Settings
        this.domCache.penSettingsGroup = document.createElement('div');
        this.domCache.penSettingsGroup.className = 'annotation-settings-group';
        this.domCache.penSettingsGroup.style.display = 'none'; // Initially hidden
        this.domCache.penColorPicker = document.createElement('input');
        this.domCache.penColorPicker.type = 'color';
        this.domCache.penColorPicker.value = this.penColor;
        this.domCache.penColorPicker.title = 'رنگ قلم';
        this.domCache.penLineWidthInput = document.createElement('input');
        this.domCache.penLineWidthInput.type = 'number';
        this.domCache.penLineWidthInput.value = this.penLineWidth;
        this.domCache.penLineWidthInput.min = '1'; this.domCache.penLineWidthInput.max = '30';
        this.domCache.penLineWidthInput.title = 'ضخامت قلم';
        this.domCache.penSettingsGroup.append(this.domCache.penColorPicker, this.domCache.penLineWidthInput);
        this.domCache.toolsPanel.appendChild(this.domCache.penSettingsGroup);

        // Highlighter Settings
        this.domCache.highlighterSettingsGroup = document.createElement('div');
        this.domCache.highlighterSettingsGroup.className = 'annotation-settings-group';
        this.domCache.highlighterSettingsGroup.style.display = 'none'; // Initially hidden
        this.domCache.highlighterColorPicker = document.createElement('input');
        this.domCache.highlighterColorPicker.type = 'color';
        this.domCache.highlighterColorPicker.value = this.highlighterColor;
        this.domCache.highlighterColorPicker.title = 'رنگ هایلایتر';
        this.domCache.highlighterLineWidthInput = document.createElement('input');
        this.domCache.highlighterLineWidthInput.type = 'number';
        this.domCache.highlighterLineWidthInput.value = this.highlighterLineWidth;
        this.domCache.highlighterLineWidthInput.min = '5'; this.domCache.highlighterLineWidthInput.max = '50';
        this.domCache.highlighterLineWidthInput.title = 'ضخامت هایلایتر';
        this.domCache.highlighterSettingsGroup.append(this.domCache.highlighterColorPicker, this.domCache.highlighterLineWidthInput);
        this.domCache.toolsPanel.appendChild(this.domCache.highlighterSettingsGroup);

        // Clear Button
        this.domCache.clearBtn = this._createStyledButton(
            'clearAnnotationsBtn',
            'پاک کردن تمام یادداشت‌ها',
            'پاک کردن همه',
            {},
            'annotation-tool-button clear-button' // Added 'clear-button' for specific styling
        );
        this.domCache.toolsPanel.appendChild(this.domCache.clearBtn);

        this.targetContainer.appendChild(this.domCache.toolsPanel);
        this.updateToolSettingsVisibility();
    }

    updateToolSettingsVisibility() {
        if (this.domCache.penSettingsGroup) {
            this.domCache.penSettingsGroup.style.display = (this.currentTool === 'pen' && this.noteModeActive) ? 'flex' : 'none';
        }
        if (this.domCache.highlighterSettingsGroup) {
            this.domCache.highlighterSettingsGroup.style.display = (this.currentTool === 'highlighter' && this.noteModeActive) ? 'flex' : 'none';
        }
    }

    // Optimized Event Handler for tool selection using Event Delegation
    handleToolClick(e) {
        const clickedButton = e.target.closest('[data-tool]');
        if (clickedButton && this.domCache.toolsGroup.contains(clickedButton)) {
            const tool = clickedButton.dataset.tool;
            if (tool) {
                this.selectTool(tool);
            }
        }
    }

    addEventListeners() {
        // Use .bind(this) to ensure 'this' context is correct
        this.boundResizeCanvases = this.resizeCanvases.bind(this);
        this.boundHandleStart = this.handleStart.bind(this);
        this.boundHandleMove = this.handleMove.bind(this);
        this.boundHandleEnd = this.handleEnd.bind(this);
        this.boundHandleToolClick = this.handleToolClick.bind(this);
        this.boundToggleMasterAnnotationMode = this.toggleMasterAnnotationMode.bind(this);
        this.boundClearAnnotations = this.clearAnnotations.bind(this);

        window.addEventListener('resize', this.boundResizeCanvases);

        this.domCache.canvas.addEventListener('touchstart', this.boundHandleStart, { passive: false });
        this.domCache.canvas.addEventListener('touchmove', this.boundHandleMove, { passive: false });
        this.domCache.canvas.addEventListener('touchend', this.boundHandleEnd);
        this.domCache.canvas.addEventListener('touchcancel', this.boundHandleEnd);

        this.domCache.canvas.addEventListener('mousedown', this.boundHandleStart);
        this.domCache.canvas.addEventListener('mousemove', this.boundHandleMove);
        this.domCache.canvas.addEventListener('mouseup', this.boundHandleEnd);
        this.domCache.canvas.addEventListener('mouseleave', () => this.handleEnd(true)); // Pass flag for mouseleave

        // Event delegation for tool buttons
        if (this.domCache.toolsGroup) {
            this.domCache.toolsGroup.addEventListener('click', this.boundHandleToolClick);
        }

        this.domCache.masterAnnotationToggleBtn.addEventListener('click', this.boundToggleMasterAnnotationMode);
        this.domCache.clearBtn.addEventListener('click', this.boundClearAnnotations);

        // Listeners for settings (these don't delegate as easily for 'input' event)
        this.domCache.penColorPicker.addEventListener('input', (e) => { this.penColor = e.target.value; });
        this.domCache.penLineWidthInput.addEventListener('input', (e) => { this.penLineWidth = parseInt(e.target.value, 10); });
        this.domCache.highlighterColorPicker.addEventListener('input', (e) => { this.highlighterColor = e.target.value; });
        this.domCache.highlighterLineWidthInput.addEventListener('input', (e) => { this.highlighterLineWidth = parseInt(e.target.value, 10); });
    }

    removeEventListeners() {
        window.removeEventListener('resize', this.boundResizeCanvases);

        if (this.domCache.canvas) {
            this.domCache.canvas.removeEventListener('touchstart', this.boundHandleStart);
            this.domCache.canvas.removeEventListener('touchmove', this.boundHandleMove);
            this.domCache.canvas.removeEventListener('touchend', this.boundHandleEnd);
            this.domCache.canvas.removeEventListener('touchcancel', this.boundHandleEnd);

            this.domCache.canvas.removeEventListener('mousedown', this.boundHandleStart);
            this.domCache.canvas.removeEventListener('mousemove', this.boundHandleMove);
            this.domCache.canvas.removeEventListener('mouseup', this.boundHandleEnd);
            this.domCache.canvas.removeEventListener('mouseleave', () => this.handleEnd(true)); // May need a bound version if logic is complex
        }

        if (this.domCache.toolsGroup) {
            this.domCache.toolsGroup.removeEventListener('click', this.boundHandleToolClick);
        }
        if (this.domCache.masterAnnotationToggleBtn) {
            this.domCache.masterAnnotationToggleBtn.removeEventListener('click', this.boundToggleMasterAnnotationMode);
        }
        if (this.domCache.clearBtn) {
            this.domCache.clearBtn.removeEventListener('click', this.boundClearAnnotations);
        }

        // Note: Color picker and line width input listeners are anonymous, harder to remove without storing them.
        // For full cleanup, they would need to be stored similar to bound methods.
        // However, if the entire toolbar is removed from DOM, their listeners are also garbage collected.
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        const { masterAnnotationToggleBtn, toolsPanel, canvas } = this.domCache;

        if (this.noteModeActive) {
            // canvas.style.pointerEvents = 'auto'; // Handled by .annotation-active .annotation-canvas CSS
            document.body.classList.add('annotation-active');
            this.targetContainer.classList.add('annotation-target-active');
            masterAnnotationToggleBtn.textContent = 'یادداشت ✏️ (فعال)';
            masterAnnotationToggleBtn.classList.add('active');
            toolsPanel.classList.add('visible');
            if (!this.currentTool) this.selectTool('pen'); // Default tool if none selected
        } else {
            // canvas.style.pointerEvents = 'none'; // Handled by .annotation-canvas CSS default
            document.body.classList.remove('annotation-active');
            this.targetContainer.classList.remove('annotation-target-active');
            masterAnnotationToggleBtn.textContent = 'یادداشت ✏️ (غیرفعال)';
            masterAnnotationToggleBtn.classList.remove('active');
            toolsPanel.classList.remove('visible');
            this.isDrawing = false;
            this.currentPath = null;
            this.cancelScheduledRender(); // Cancel any pending frame
            this.scheduleRender(); // Render one last time to clear current path display
        }
        this.updateToolSettingsVisibility();
    }

    getEventCoordinates(event) {
        let x, y;
        const rect = this.domCache.canvas.getBoundingClientRect();
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
        if (!this.noteModeActive || (event.button && event.button !== 0) /* main mouse button */ || (event.touches && event.touches.length > 1)) return;
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
            // Eraser path itself is not usually "drawn" with color but used for collision
        }
    }

    handleMove(event) {
        if (!this.isDrawing || !this.noteModeActive || (event.touches && event.touches.length > 1)) return;
        event.preventDefault();
        const { x, y } = this.getEventCoordinates(event);
        if (this.currentPath) {
            this.currentPath.points.push({ x, y });
            this.scheduleRender();
        }
    }

    handleEnd(mouseLeftCanvas = false) {
        this.cancelScheduledRender(); // Cancel pending rAF from move

        if (mouseLeftCanvas && !this.isDrawing) return; // Avoid processing if mouse left but wasn't drawing

        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.currentPath && this.currentPath.points.length > (this.currentTool === 'eraser' ? 0 : 1) ) { // Eraser can work with a single point for dabbing
                if (this.currentTool === 'eraser') {
                    this.eraseStrokes();
                } else {
                    this.drawings.push(this.currentPath);
                }
                this.redrawCommittedDrawings(); // Update the committed (offscreen) canvas
                this.saveDrawings();
            }
            this.currentPath = null;
            this.scheduleRender(); // Schedule a final render to clear the live path and show committed state
        }
    }

    eraseStrokes() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;
        const drawingsToDelete = new Set();
        const eraserRadius = this.currentPath.lineWidth / 2;

        for (const eraserPoint of this.currentPath.points) {
            for (let i = 0; i < this.drawings.length; i++) {
                const drawing = this.drawings[i];
                if (drawingsToDelete.has(drawing) || drawing.tool === 'eraser') continue;

                const pathPointRadius = drawing.lineWidth / 2;
                for (const pathPoint of drawing.points) {
                    // Using Math.hypot for distance calculation
                    const distance = Math.hypot(eraserPoint.x - pathPoint.x, eraserPoint.y - pathPoint.y);
                    const collisionThreshold = pathPointRadius + eraserRadius;
                    if (distance < collisionThreshold) {
                        drawingsToDelete.add(drawing);
                        break; // Move to the next drawing
                    }
                }
            }
        }
        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(drawing => !drawingsToDelete.has(drawing));
        }
    }

    resizeCanvases() {
        // Use clientWidth/Height for dimensions excluding scrollbars but including padding
        const width = this.targetContainer.clientWidth;
        const height = this.targetContainer.clientHeight;

        if (this.domCache.canvas.width !== width || this.domCache.canvas.height !== height) {
            this.domCache.canvas.width = width;
            this.domCache.canvas.height = height;
            // No need to set style.width/height if using 100% via CSS, but good if not.
            // this.domCache.canvas.style.width = `${width}px`;
            // this.domCache.canvas.style.height = `${height}px`;

            this.domCache.committedCanvas.width = width;
            this.domCache.committedCanvas.height = height;

            this.redrawCommittedDrawings();
            this.scheduleRender(); // Render changes due to resize
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.domCache.committedCanvas.width, this.domCache.committedCanvas.height);
        this.drawings.forEach(path => {
            if (path.tool !== 'eraser') { // Do not "draw" eraser paths on committed canvas
                this._drawSinglePath(path, this.committedCtx);
            }
        });
    }

    // Optimized rendering function
    _performRender() {
        this.ctx.clearRect(0, 0, this.domCache.canvas.width, this.domCache.canvas.height);
        // Draw committed drawings from offscreen canvas
        if (this.domCache.committedCanvas.width > 0 && this.domCache.committedCanvas.height > 0) {
            this.ctx.drawImage(this.domCache.committedCanvas, 0, 0);
        }
        // Draw the current path if actively drawing
        if (this.currentPath && this.isDrawing) {
            this._drawSinglePath(this.currentPath, this.ctx);
        }
        this.isRenderScheduled = false;
        this.rafId = null;
    }

    scheduleRender() {
        if (this.isRenderScheduled) return;
        this.isRenderScheduled = true;
        this.rafId = requestAnimationFrame(this._performRender.bind(this));
    }

    cancelScheduledRender() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this.isRenderScheduled = false;
        }
    }


    _drawSinglePath(path, context) {
        if (!path || !path.points || path.points.length === 0) return;

        context.save(); // Save context state

        context.beginPath();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        if (path.tool === 'eraser') {
            // Visualize eraser path only on the live canvas while drawing
            if (this.isDrawing && path === this.currentPath && context === this.ctx) {
                context.strokeStyle = 'rgba(128, 128, 128, 0.7)'; // Semi-transparent grey for eraser guide
                context.lineWidth = path.lineWidth;
                context.globalAlpha = 0.7;
            } else {
                context.restore(); // Nothing to draw for committed eraser paths
                return;
            }
        } else { // Pen or Highlighter
            context.strokeStyle = path.color;
            context.lineWidth = path.lineWidth;
            context.globalAlpha = path.opacity;
        }

        if (path.points.length > 0) {
            context.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
                const p1 = path.points[i-1];
                const p2 = path.points[i];
                // For smoother curves, could use quadraticCurveTo or bezierCurveTo
                // context.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
                context.lineTo(p2.x, p2.y);
            }
            context.stroke();
        }
        context.restore(); // Restore context state
    }

    selectTool(toolName) {
        this.currentTool = toolName;
        this.updateActiveToolButtonVisuals();
        this.updateToolSettingsVisibility();
    }

    updateActiveToolButtonVisuals() {
        const { penBtn, highlighterBtn, eraserBtn } = this.domCache;
        if (penBtn) penBtn.classList.remove('active');
        if (highlighterBtn) highlighterBtn.classList.remove('active');
        if (eraserBtn) eraserBtn.classList.remove('active');

        if (this.currentTool === 'pen' && penBtn) penBtn.classList.add('active');
        else if (this.currentTool === 'highlighter' && highlighterBtn) highlighterBtn.classList.add('active');
        else if (this.currentTool === 'eraser' && eraserBtn) eraserBtn.classList.add('active');
    }

    clearAnnotations() {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟')) {
            this.drawings = [];
            localStorage.removeItem(this.storageKey);
            this.redrawCommittedDrawings(); // Clear offscreen canvas
            this.scheduleRender();         // Clear visible canvas
        }
    }

    saveDrawings() {
        try {
            // Filter out any potential eraser paths if they were stored (should not happen with current logic)
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
                // Sanitize loaded data, ensure defaults for older drawings
                this.drawings.forEach(path => {
                    path.opacity = path.opacity !== undefined ? path.opacity :
                                   (path.tool === 'highlighter' ? this.highlighterOpacity : 1.0);
                    path.lineWidth = path.lineWidth !== undefined ? path.lineWidth :
                                     (path.tool === 'pen' ? this.penLineWidth :
                                     (path.tool === 'highlighter' ? this.highlighterLineWidth : this.eraserWidth)); // Eraser width default might not be relevant here
                });
            } catch (error) {
                console.error("AnnotationApp: Failed to parse drawings from localStorage:", error);
                this.drawings = [];
                localStorage.removeItem(this.storageKey); // Clear corrupted data
            }
        } else {
            this.drawings = [];
        }
        this.redrawCommittedDrawings();
        this.scheduleRender();
    }

    // Method to clean up when the annotation app instance is no longer needed
    destroy() {
        this.cancelScheduledRender();
        this.removeEventListeners();

        // Remove canvases
        if (this.domCache.canvas) this.domCache.canvas.remove();
        if (this.domCache.committedCanvas) this.domCache.committedCanvas.remove(); // Though not in DOM

        // Remove toolbar elements
        if (this.domCache.masterAnnotationToggleBtn) this.domCache.masterAnnotationToggleBtn.remove();
        if (this.domCache.toolsPanel) this.domCache.toolsPanel.remove();

        // Remove injected styles if no other instances are using them
        // This might need a more sophisticated check if multiple instances can exist.
        // For simplicity, we'll assume one instance or shared styles are okay to remove if this is the last one.
        const styleElement = document.getElementById('annotation-app-styles');
        if (styleElement) {
             // Add a check here if you expect multiple instances:
             // if (!document.querySelector('.annotation-canvas')) styleElement.remove();
             styleElement.remove();
        }


        // Clear caches and references
        this.drawings = [];
        this.domCache = {};
        this.targetContainer.classList.remove('annotation-target-active');
        document.body.classList.remove('annotation-active');

        console.log("AnnotationApp destroyed.");
    }
}

// Example Usage (optional, for testing):
/*
document.addEventListener('DOMContentLoaded', () => {
    // Ensure you have a div with id="myAnnotationContainer" in your HTML
    // or change the selector accordingly.
    // Example: <div id="myAnnotationContainer" style="width: 800px; height: 600px; border: 1px solid black; background-color: #f9f9f9;"></div>
    const app = new AnnotationApp('#myAnnotationContainer');

    // To test destroy method:
    // setTimeout(() => {
    //     app.destroy();
    // }, 10000); // Destroy after 10 seconds
});
*/

