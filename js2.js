class AnnotationApp {
    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error(
                "AnnotationApp: Target container for annotations not found:",
                targetContainerSelector
            );
            return;
        }
        
        this._ensureRelativePosition();
        this._initializeProperties();
        this._initializeStorageKey();
        this._initializeIcons();
        
        if (this.targetContainer) {
            this.init();
        }
    }

    _ensureRelativePosition() {
        if (getComputedStyle(this.targetContainer).position === "static") {
            this.targetContainer.style.position = "relative";
        }
    }

    _initializeProperties() {
        this.canvas = null;
        this.ctx = null;
        this.committedCanvas = null;
        this.committedCtx = null;
        this.virtualCanvasContainer = null;
        this.viewportWidth = 0;
        this.viewportHeight = 0;
        this.scrollOffsetX = 0;
        this.scrollOffsetY = 0;
        this.totalWidth = 0;
        this.totalHeight = 0;
        this.isDrawing = false;
        this.noteModeActive = false;
        this.currentTool = "pen";
        this.currentPath = null;
        this.drawings = [];
        this.penColor = "#000000";
        this.penLineWidth = 1;
        this.highlighterColor = "#FFFF00";
        this.highlighterLineWidth = 20;
        this.highlighterOpacity = 0.4;
        this.eraserWidth = 15;
        this.animationFrameRequestId = null;
        this._boundUpdateVirtualCanvas = this.updateVirtualCanvas.bind(this);
        
        this.isPanning = false;
        this.panStartFinger1 = null; 
        this.panStartFinger2 = null; 
        this.panInitialScrollX = 0;
        this.panInitialScrollY = 0;
        this.panMoveThreshold = 15; // آستانه حرکت برای تشخیص کشیدن از ضربه
        this.isPotentialTwoFingerTap = false;
        this.twoFingerTapProcessed = false;
        this.justUndidWithTap = false; 
        
        this.lastPanMidX = null; // برای اسکرول نرم
        this.lastPanMidY = null; // برای اسکرول نرم
    }

    _initializeStorageKey() {
        const baseStorageKey = "pageAnnotations";
        const pageIdentifier = window.location.pathname.replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
        );
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;
    }

    _initializeIcons() {
        this.icons = {
            pen: '<span class="material-symbols-outlined">stylus_note</span>',
            highlighter: '<span class="material-symbols-outlined">format_ink_highlighter</span>',
            eraser: '<span class="material-symbols-outlined">ink_eraser</span>',
        };
    }

    init() {
        this.createVirtualCanvasContainer();
        this.createCanvases();
        this.createToolbar();
        this.addEventListeners();
        this.loadDrawings();
        this.updateVirtualCanvas();
        this.selectTool("pen");
    }

    createVirtualCanvasContainer() {
        this.virtualCanvasContainer = document.createElement("div");
        Object.assign(this.virtualCanvasContainer.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            pointerEvents: "none",
            zIndex: "1000",
            overflow: "hidden"
        });
        document.body.appendChild(this.virtualCanvasContainer);
    }

    createCanvases() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "annotationCanvas";
        Object.assign(this.canvas.style, {
            position: "absolute",
            top: "0",
            left: "0",
            zIndex: "1000",
            pointerEvents: "none" 
        });
        this.virtualCanvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        this.committedCanvas = document.createElement("canvas");
        this.committedCtx = this.committedCanvas.getContext("2d");
    }

    _createStyledButton(id, title, innerHTML, className = "tool-button") {
        const button = document.createElement("button");
        button.id = id;
        button.title = title;
        button.className = className;
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    createToolbar() {
        this._createMasterToggleButton();
        this._createToolsPanel();
        this._createToolButtons();
        this._createSettingsGroups();
        this._createClearButton();
        
        this.targetContainer.appendChild(this.toolsPanel);
        this.updateToolSettingsVisibility();
    }

    _createMasterToggleButton() {
        this.masterAnnotationToggleBtn = this._createStyledButton(
            "masterAnnotationToggleBtn",
            "NOTE - enable/disable annotations",
            "NOTE ✏️",
            ""
        );
        Object.assign(this.masterAnnotationToggleBtn.style, {
            top: "5px",
            right: "5px"
        });
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);
    }

    _createToolsPanel() {
        this.toolsPanel = document.createElement("div");
        this.toolsPanel.id = "annotationToolsPanel";
        Object.assign(this.toolsPanel.style, {
            display: "none",
            flexDirection: "column",
            top: "45px",
            right: "5px"
        });
    }

    _createToolButtons() {
        const toolsGroup = document.createElement("div");
        toolsGroup.className = "toolbar-group";

        this.penBtn = this._createStyledButton("penBtn", "قلم", this.icons.pen);
        this.highlighterBtn = this._createStyledButton("highlighterBtn", "هایلایتر", this.icons.highlighter);
        this.eraserBtn = this._createStyledButton("eraserBtn", "پاک‌کن", this.icons.eraser);
        
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);
    }

    _createSettingsGroups() {
        this._createPenSettings();
        this._createHighlighterSettings();
    }

    _createPenSettings() {
        const penSettingsGroup = document.createElement("div");
        penSettingsGroup.className = "toolbar-group setting-group";
        penSettingsGroup.id = "penSettingsGroup";

        const penColorLabel = document.createElement("label");
        this.penColorPicker = document.createElement("input");
        this.penColorPicker.type = "color";
        this.penColorPicker.value = this.penColor;

        const penWidthLabel = document.createElement("label");
        this.penLineWidthInput = document.createElement("input");
        Object.assign(this.penLineWidthInput, {
            type: "number",
            value: this.penLineWidth,
            min: "1",
            max: "20"
        });

        penSettingsGroup.append(penColorLabel, this.penColorPicker, penWidthLabel, this.penLineWidthInput);
        this.toolsPanel.appendChild(penSettingsGroup);
    }

    _createHighlighterSettings() {
        const highlighterSettingsGroup = document.createElement("div");
        highlighterSettingsGroup.className = "toolbar-group setting-group";
        highlighterSettingsGroup.id = "highlighterSettingsGroup";

        const highlighterColorLabel = document.createElement("label");
        this.highlighterColorPicker = document.createElement("input");
        this.highlighterColorPicker.type = "color";
        this.highlighterColorPicker.value = this.highlighterColor;

        const highlighterWidthLabel = document.createElement("label");
        this.highlighterLineWidthInput = document.createElement("input");
        Object.assign(this.highlighterLineWidthInput, {
            type: "number",
            value: this.highlighterLineWidth,
            min: "5",
            max: "50"
        });

        highlighterSettingsGroup.append(highlighterColorLabel, this.highlighterColorPicker, highlighterWidthLabel, this.highlighterLineWidthInput);
        this.toolsPanel.appendChild(highlighterSettingsGroup);
    }

    _createClearButton() {
        this.clearBtn = this._createStyledButton(
            "clearAnnotationsBtn",
            "پاک کردن تمام یادداشت‌ها",
            "پاک کردن همه",
            ""
        );
        this.clearBtn.id = "clearAnnotationsBtn";
        this.toolsPanel.appendChild(this.clearBtn);
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById("penSettingsGroup");
        const highlighterSettings = document.getElementById("highlighterSettingsGroup");

        if (penSettings) {
            penSettings.style.display = 
                this.currentTool === "pen" && this.noteModeActive ? "flex" : "none";
        }
        if (highlighterSettings) {
            highlighterSettings.style.display = 
                this.currentTool === "highlighter" && this.noteModeActive ? "flex" : "none";
        }
    }

    updateVirtualCanvas() {
        const hasChanges = this._calculateDimensions();
        
        if (hasChanges) {
            this._resizeCanvases();
        }
        
        this.renderVisibleCanvas();
    }

    _calculateDimensions() {
        const oldViewportWidth = this.viewportWidth;
        const oldViewportHeight = this.viewportHeight;
        const oldScrollX = this.scrollOffsetX;
        const oldScrollY = this.scrollOffsetY;

        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;
        this.scrollOffsetX = window.pageXOffset || document.documentElement.scrollLeft;
        this.scrollOffsetY = window.pageYOffset || document.documentElement.scrollTop;
        this.totalWidth = Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
            this.targetContainer.scrollWidth
        );
        this.totalHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            this.targetContainer.scrollHeight
        );

        return oldViewportWidth !== this.viewportWidth || 
               oldViewportHeight !== this.viewportHeight ||
               oldScrollX !== this.scrollOffsetX ||
               oldScrollY !== this.scrollOffsetY;
    }

    _resizeCanvases() {
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
        this.canvas.style.width = `${this.viewportWidth}px`;
        this.canvas.style.height = `${this.viewportHeight}px`;

        if (this.committedCanvas.width !== this.totalWidth || 
            this.committedCanvas.height !== this.totalHeight) {
            this.committedCanvas.width = this.totalWidth;
            this.committedCanvas.height = this.totalHeight;
            this.redrawCommittedDrawings();
        }
    }

    addEventListeners() {
        window.addEventListener("resize", this._boundUpdateVirtualCanvas);
        window.addEventListener("scroll", this._boundUpdateVirtualCanvas);
        this._addTouchEventListeners();
        this._addMouseEventListeners();
        this._addUIEventListeners();
        this._addSettingsEventListeners();
    }

    _addTouchEventListeners() {
        const touchOptions = { passive: false };
        this.canvas.addEventListener("touchstart", (e) => this._handleTouchStart(e), touchOptions);
        this.canvas.addEventListener("touchmove", (e) => this._handleTouchMove(e), touchOptions);
        this.canvas.addEventListener("touchend", (e) => this._handleTouchEnd(e), touchOptions);
        this.canvas.addEventListener("touchcancel", (e) => this._handleTouchEnd(e), touchOptions);
    }

    _handleTouchStart(event) {
        if (!this.noteModeActive) return;

        if (event.touches.length === 1) {
            this.justUndidWithTap = false; 
            if (!this.isPanning && !this.isPotentialTwoFingerTap) {
                 this.handleStart(event);
            }
        } else if (event.touches.length === 2) {
            event.preventDefault();
            this.isDrawing = false; 
            this.currentPath = null;
            if (this.animationFrameRequestId !== null) {
                 cancelAnimationFrame(this.animationFrameRequestId);
                 this.animationFrameRequestId = null;
            }
            this.renderVisibleCanvas(); 

            this.isPotentialTwoFingerTap = true;
            this.twoFingerTapProcessed = false; // آماده برای پردازش ضربه جدید دو انگشتی
            this.isPanning = false; 
            this.justUndidWithTap = false;

            const t1 = event.touches[0];
            const t2 = event.touches[1];
            this.panStartFinger1 = { clientX: t1.clientX, clientY: t1.clientY };
            this.panStartFinger2 = { clientX: t2.clientX, clientY: t2.clientY };
            
            this.lastPanMidX = (t1.clientX + t2.clientX) / 2;
            this.lastPanMidY = (t1.clientY + t2.clientY) / 2;
        } else {
            // اگر تعداد انگشتان بیش از 2 یا کمتر از 1 (در عمل غیرممکن) باشد، وضعیت‌های مربوط به ژست دو انگشتی را ریست کن
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
            if (event.touches.length > 1) { // یا اگر از 2 به بیشتر تغییر کند
                 this.isDrawing = false;
            }
        }
    }

    _handleTouchMove(event) {
        if (!this.noteModeActive) return;

        if (event.touches.length === 2 && (this.isPotentialTwoFingerTap || this.isPanning)) {
            event.preventDefault();
            const t1 = event.touches[0];
            const t2 = event.touches[1];
            const currentMidX = (t1.clientX + t2.clientX) / 2;
            const currentMidY = (t1.clientY + t2.clientY) / 2;

            if (this.isPotentialTwoFingerTap) {
                const initialMidX = (this.panStartFinger1.clientX + this.panStartFinger2.clientX) / 2;
                const initialMidY = (this.panStartFinger1.clientY + this.panStartFinger2.clientY) / 2;
                const deltaFromStartSq = Math.pow(currentMidX - initialMidX, 2) + Math.pow(currentMidY - initialMidY, 2);

                if (deltaFromStartSq > Math.pow(this.panMoveThreshold, 2)) {
                    this.isPanning = true;
                    this.isPotentialTwoFingerTap = false; 
                    this.isDrawing = false; 
                    // مهم: lastPanMidX/Y را با موقعیت فعلی به‌روز کن تا اولین scrollBy پایه درستی داشته باشد
                    this.lastPanMidX = currentMidX;
                    this.lastPanMidY = currentMidY;
                }
            }

            if (this.isPanning) {
                const deltaScrollX = currentMidX - this.lastPanMidX;
                const deltaScrollY = currentMidY - this.lastPanMidY;

                window.scrollBy(-deltaScrollX, -deltaScrollY); // اسکرول نسبی

                this.lastPanMidX = currentMidX; // برای فریم بعدی به‌روز کن
                this.lastPanMidY = currentMidY;
            }
        } else if (this.isDrawing && event.touches.length === 1 && !this.isPanning && !this.isPotentialTwoFingerTap) {
            this.handleMove(event);
        } else if (event.touches.length !== 2 && (this.isPotentialTwoFingerTap || this.isPanning)) {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
        }
    }

    _handleTouchEnd(event) {
        if (!this.noteModeActive) return;

        // مدیریت ضربه دو انگشتی برای بازگشت
        if (this.isPotentialTwoFingerTap && !this.isPanning && !this.twoFingerTapProcessed) {
            // این یک ضربه بود، نه کشیدن، و هنوز به عنوان بازگشت پردازش نشده است.
            // این باید زمانی اتفاق بیفتد که ژست به پایان می‌رسد (مثلاً انگشت دوم بلند می‌شود).
            this.undoLastDrawing();
            this.justUndidWithTap = true;
            this.twoFingerTapProcessed = true; // این ضربه خاص را به عنوان پردازش شده علامت بزن
            this.isDrawing = false; 
            this.isPotentialTwoFingerTap = false; // ضربه مدیریت شد، ریست کن
        }
        
        // مدیریت پایان یک رسم تک انگشتی
        if (this.isDrawing && !this.isPanning && !this.isPotentialTwoFingerTap && event.touches.length === 0) {
             this.handleEnd(event); 
        }

        // ریست کردن وضعیت‌ها زمانی که همه انگشتان برداشته می‌شوند
        if (event.touches.length === 0) {
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
            this.isDrawing = false; 
            this.panStartFinger1 = null;
            this.panStartFinger2 = null;
            this.lastPanMidX = null;
            this.lastPanMidY = null;
            // twoFingerTapProcessed در _handleTouchStart برای ژست دو انگشتی جدید ریست می‌شود
            this.justUndidWithTap = false;
        } else if (event.touches.length === 1 && (this.isPanning || this.isPotentialTwoFingerTap || this.twoFingerTapProcessed )) {
            // اگر یک انگشت از ژست دو انگشتی برداشته شود (کشیدن یا ضربه پردازش شده)،
            // وضعیت‌های مربوط به ژست دو انگشتی را ریست کن.
            this.isPotentialTwoFingerTap = false;
            this.isPanning = false;
        }
    }
    
    undoLastDrawing() {
        if (this.drawings.length > 0) {
            this.drawings.pop();
            this.redrawCommittedDrawings();
            this.renderVisibleCanvas();
            this.saveDrawings();
        }
    }

    _addMouseEventListeners() {
        this.canvas.addEventListener("mousedown", (e) => this.handleStart(e));
        this.canvas.addEventListener("mousemove", (e) => this.handleMove(e));
        this.canvas.addEventListener("mouseup", (e) => this.handleEnd(e));
        this.canvas.addEventListener("mouseleave", (e) => this.handleEnd(e, true));
    }

    _addUIEventListeners() {
        this.masterAnnotationToggleBtn.addEventListener("click", () => this.toggleMasterAnnotationMode());
        this.penBtn.addEventListener("click", () => this.selectTool("pen"));
        this.highlighterBtn.addEventListener("click", () => this.selectTool("highlighter"));
        this.eraserBtn.addEventListener("click", () => this.selectTool("eraser"));
        this.clearBtn.addEventListener("click", () => this.clearAnnotations());
    }

    _addSettingsEventListeners() {
        this.penColorPicker.addEventListener("input", (e) => {
            this.penColor = e.target.value;
        });
        this.penLineWidthInput.addEventListener("input", (e) => {
            this.penLineWidth = parseInt(e.target.value, 10);
        });
        this.highlighterColorPicker.addEventListener("input", (e) => {
            this.highlighterColor = e.target.value;
        });
        this.highlighterLineWidthInput.addEventListener("input", (e) => {
            this.highlighterLineWidth = parseInt(e.target.value, 10);
        });
    }

    toggleMasterAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        
        if (this.noteModeActive) {
            this._activateAnnotationMode();
        } else {
            this._deactivateAnnotationMode();
        }
        
        this.updateToolSettingsVisibility();
    }

    _activateAnnotationMode() {
        this.canvas.style.pointerEvents = "auto";
        document.body.classList.add("annotation-active");
        this.targetContainer.classList.add("annotation-active");
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (فعال)";
        this.masterAnnotationToggleBtn.classList.add("active");
        this.toolsPanel.style.display = "flex";
        if (!this.currentTool) this.selectTool("pen");
    }

    _deactivateAnnotationMode() {
        this.canvas.style.pointerEvents = "none";
        document.body.classList.remove("annotation-active");
        this.targetContainer.classList.remove("annotation-active");
        this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (غیرفعال)";
        this.masterAnnotationToggleBtn.classList.remove("active");
        this.toolsPanel.style.display = "none";
        this._resetDrawingState();
        this.renderVisibleCanvas();
    }

    _resetDrawingState() {
        this.isDrawing = false;
        this.currentPath = null;
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    getEventCoordinates(event) {
        const clientX = event.touches?.[0]?.clientX ?? event.clientX;
        const clientY = event.touches?.[0]?.clientY ?? event.clientY;

        return {
            x: clientX + this.scrollOffsetX,
            y: clientY + this.scrollOffsetY
        };
    }

    handleStart(event) {
        if (this.justUndidWithTap) {
            return; 
        }
        if (this.isPanning || this.isPotentialTwoFingerTap) return;

        if (!this._shouldHandleEvent(event)) { 
            return;
        }
        
        event.preventDefault();
        this.isDrawing = true;
        const { x, y } = this.getEventCoordinates(event);
        this.currentPath = this._createNewPath(x, y);
    }

    _shouldHandleEvent(event) { 
        return this.noteModeActive && 
               (!event.touches || event.touches.length === 1) &&
               !this.isPanning && 
               !this.isPotentialTwoFingerTap;
    }

    _createNewPath(x, y) {
        const path = { 
            tool: this.currentTool, 
            points: [{ x, y }] 
        };

        switch (this.currentTool) {
            case "pen":
                Object.assign(path, {
                    color: this.penColor,
                    lineWidth: this.penLineWidth,
                    opacity: 1.0
                });
                break;
            case "highlighter":
                Object.assign(path, {
                    color: this.highlighterColor,
                    lineWidth: this.highlighterLineWidth,
                    opacity: this.highlighterOpacity
                });
                break;
            case "eraser":
                path.lineWidth = this.eraserWidth;
                break;
        }
        return path;
    }

    handleMove(event) {
        if (!this.isDrawing || this.isPanning || this.isPotentialTwoFingerTap) return; 
        
        event.preventDefault();
        const { x, y } = this.getEventCoordinates(event);

        if (this.currentPath) {
            this._updateCurrentPath(x, y);
            this._requestRenderFrame();
        }
    }

    _updateCurrentPath(x, y) {
        if (this.currentTool === "highlighter") {
            if (this.currentPath.points.length <= 1) {
                this.currentPath.points.push({ x, y });
            } else {
                this.currentPath.points[1] = { x, y };
            }
        } else {
            this.currentPath.points.push({ x, y });
        }
    }

    _requestRenderFrame() {
        if (this.animationFrameRequestId === null) {
            this.animationFrameRequestId = requestAnimationFrame(() => {
                this.renderVisibleCanvas();
                this.animationFrameRequestId = null;
            });
        }
    }

    handleEnd(event, mouseLeftCanvas = false) { 
        if (this.isPanning || this.isPotentialTwoFingerTap) {
            if (mouseLeftCanvas) {
                this.isPanning = false;
                this.isPotentialTwoFingerTap = false;
            }
            if (!this.isDrawing && mouseLeftCanvas) { 
                 this._resetDrawingState();
                 this.renderVisibleCanvas();
            }
            return;
        }

        this._cancelRenderFrame();

        if (mouseLeftCanvas && !this.isDrawing) return;

        if (this.isDrawing) {
            this._processCompletedPath();
            this._resetDrawingState(); 
            this.renderVisibleCanvas();
        }
    }

    _cancelRenderFrame() {
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    _processCompletedPath() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;

        switch (this.currentTool) {
            case "highlighter":
                this._processHighlighterPath();
                break;
            case "eraser":
                this.eraseStrokes();
                break;
            default:
                if (this.currentPath.points.length > 1) {
                    this.drawings.push(this.currentPath);
                }
                break;
        }

        this.redrawCommittedDrawings();
        this.saveDrawings();
    }

    _processHighlighterPath() {
        const startPoint = this.currentPath.points[0];
        const endPoint = this.currentPath.points.length > 1 
            ? this.currentPath.points[1] 
            : startPoint;

        this.currentPath.points = [startPoint, endPoint];
        this.drawings.push(this.currentPath);
    }

    eraseStrokes() {
        if (!this.currentPath || this.currentPath.points.length === 0) return;

        const drawingsToDelete = new Set();

        for (const eraserPoint of this.currentPath.points) {
            for (const drawing of this.drawings) {
                if (drawingsToDelete.has(drawing) || drawing.tool === "eraser") continue;

                const shouldDelete = drawing.points.some(pathPoint => {
                    const distance = Math.sqrt(
                        Math.pow(eraserPoint.x - pathPoint.x, 2) +
                        Math.pow(eraserPoint.y - pathPoint.y, 2)
                    );
                    const collisionThreshold = drawing.lineWidth / 2 + this.eraserWidth / 2;
                    return distance < collisionThreshold;
                });

                if (shouldDelete) {
                    drawingsToDelete.add(drawing);
                }
            }
        }

        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(drawing => !drawingsToDelete.has(drawing));
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => {
            this._drawSinglePath(path, this.committedCtx, false);
        });
    }

    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(
                this.committedCanvas,
                this.scrollOffsetX, this.scrollOffsetY,
                this.viewportWidth, this.viewportHeight,
                0, 0,
                this.viewportWidth, this.viewportHeight
            );
        }

        if (this.currentPath && this.isDrawing) { 
            this._drawSinglePath(this.currentPath, this.ctx, true);
        }
    }

    _drawSinglePath(path, context, isVirtual = false) {
        if (!path || path.points.length === 0) return;

        this._setupDrawingContext(path, context);
        
        if (path.tool === "eraser" && !(this.isDrawing && path === this.currentPath)) {
            return;
        }

        this._drawPathPoints(path, context, isVirtual);
        context.globalAlpha = 1.0;
    }

    _setupDrawingContext(path, context) {
        context.beginPath();
        context.lineCap = "round";
        context.lineJoin = "round";

        if (path.tool === "eraser" && this.isDrawing && path === this.currentPath) {
            context.strokeStyle = "rgba(200, 0, 0, 0.6)";
            context.lineWidth = 2;
            context.globalAlpha = 0.6;
        } else if (path.tool !== "eraser") {
            context.strokeStyle = path.color;
            context.lineWidth = path.lineWidth;
            context.globalAlpha = path.opacity;
        }
    }

    _drawPathPoints(path, context, isVirtual) {
        if (path.points.length === 0) return;

        const firstPoint = this._transformPoint(path.points[0], isVirtual);
        context.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < path.points.length; i++) {
            const point = this._transformPoint(path.points[i], isVirtual);
            context.lineTo(point.x, point.y);
        }
        
        context.stroke();
    }

    _transformPoint(point, isVirtual) {
        if (isVirtual) {
            return {
                x: point.x - this.scrollOffsetX,
                y: point.y - this.scrollOffsetY
            };
        }
        return point;
    }

    selectTool(toolName) {
        this.currentTool = toolName;
        this.updateActiveToolButtonVisuals();
        this.updateToolSettingsVisibility();
    }

    updateActiveToolButtonVisuals() {
        const buttons = [this.penBtn, this.highlighterBtn, this.eraserBtn];
        const tools = ["pen", "highlighter", "eraser"];
        
        buttons.forEach((button, index) => {
            if (button) {
                button.classList.toggle("active", this.currentTool === tools[index]);
            }
        });
    }

    clearAnnotations() {
        const confirmed = window.confirm("آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟");

        if (confirmed) {
            this.drawings = [];
            localStorage.removeItem(this.storageKey);
            this.redrawCommittedDrawings();
            this.renderVisibleCanvas();
        }
    }

    saveDrawings() {
        try {
            const drawingsToSave = this.drawings.filter(path => path.tool !== "eraser");
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        } catch (error) {
            console.error("AnnotationApp: Failed to save drawings:", error);
            console.warn("خطا در ذخیره‌سازی یادداشت‌ها. ممکن است حافظه مرورگر پر باشد.");
        }
    }

    loadDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData);
                this._normalizeLoadedDrawings();
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

    _normalizeLoadedDrawings() {
        this.drawings.forEach(path => {
            if (path.opacity === undefined) {
                path.opacity = path.tool === "highlighter" ? this.highlighterOpacity : 1.0;
            }
            
            if (path.lineWidth === undefined) {
                switch (path.tool) {
                    case "pen":
                        path.lineWidth = this.penLineWidth;
                        break;
                    case "highlighter":
                        path.lineWidth = this.highlighterLineWidth;
                        break;
                    default: 
                        path.lineWidth = this.eraserWidth; 
                        break; 
                }
            }
        });
    }

    destroy() {
        window.removeEventListener("resize", this._boundUpdateVirtualCanvas);
        window.removeEventListener("scroll", this._boundUpdateVirtualCanvas);
        
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
        }
        
        if (this.virtualCanvasContainer) {
            this.virtualCanvasContainer.remove();
        }
        
        this.targetContainer = null;
        this.canvas = null;
        this.ctx = null;
        this.committedCanvas = null;
        this.committedCtx = null;
    }
}

const localCSS = document.createElement("link");
localCSS.rel = "stylesheet";
localCSS.href = "./note.css"; 
document.head.appendChild(localCSS);

const googleFont = document.createElement("link");
googleFont.rel = "stylesheet";
googleFont.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined";
document.head.appendChild(googleFont);

document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function(e) {
    if (e.ctrlKey && (e.key === 'p' || e.key === 's')) {
        e.preventDefault();
    }
};
