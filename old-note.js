// annotation-module.js

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
        if (getComputedStyle(this.targetContainer).position === "static") {
            this.targetContainer.style.position = "relative";
        }

        this.canvas = null;
        this.ctx = null;

        this.committedCanvas = null;
        this.committedCtx = null;

        // Virtual canvas properties
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
        this.penColor = "#000000";
        this.penLineWidth = 1;
        this.highlighterColor = "#FFFF00";
        this.highlighterLineWidth = 20;
        this.highlighterOpacity = 0.4;
        this.eraserWidth = 15;
        this.currentPath = null;
        this.drawings = [];

        this.animationFrameRequestId = null;

        const baseStorageKey = "pageAnnotations";
        const pageIdentifier = window.location.pathname.replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
        );
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        this.icons = {
            pen: '<span class="material-symbols-outlined">stylus_note</span>',
            highlighter:
                '<span class="material-symbols-outlined">format_ink_highlighter</span>',
            eraser: '<span class="material-symbols-outlined">ink_eraser</span>',
        };

        if (this.targetContainer) {
            this.init();
        }
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
        this.virtualCanvasContainer.style.position = "fixed";
        this.virtualCanvasContainer.style.top = "0";
        this.virtualCanvasContainer.style.left = "0";
        this.virtualCanvasContainer.style.width = "100vw";
        this.virtualCanvasContainer.style.height = "100vh";
        this.virtualCanvasContainer.style.pointerEvents = "none";
        this.virtualCanvasContainer.style.zIndex = "1000";
        this.virtualCanvasContainer.style.overflow = "hidden";
        document.body.appendChild(this.virtualCanvasContainer);
    }

    createCanvases() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "annotationCanvas";
        this.canvas.style.position = "absolute";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.zIndex = "1000";
        this.canvas.style.pointerEvents = "none";
        this.virtualCanvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        // Create committed canvas with full document size
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
        this.masterAnnotationToggleBtn = this._createStyledButton(
            "masterAnnotationToggleBtn",
            "NOTE - enable/disable annotations",
            "NOTE ✏️",
            ""
        );
        this.masterAnnotationToggleBtn.style.top = "5px";
        this.masterAnnotationToggleBtn.style.right = "5px";
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);

        this.toolsPanel = document.createElement("div");
        this.toolsPanel.id = "annotationToolsPanel";
        this.toolsPanel.style.display = "none";
        this.toolsPanel.style.flexDirection = "column";
        this.toolsPanel.style.top = "45px";
        this.toolsPanel.style.right = "5px";

        const toolsGroup = document.createElement("div");
        toolsGroup.className = "toolbar-group";

        this.penBtn = this._createStyledButton("penBtn", "قلم", this.icons.pen);
        this.highlighterBtn = this._createStyledButton(
            "highlighterBtn",
            "هایلایتر",
            this.icons.highlighter
        );
        this.eraserBtn = this._createStyledButton(
            "eraserBtn",
            "پاک‌کن",
            this.icons.eraser
        );
        toolsGroup.append(this.penBtn, this.highlighterBtn, this.eraserBtn);
        this.toolsPanel.appendChild(toolsGroup);

        const penSettingsGroup = document.createElement("div");
        penSettingsGroup.className = "toolbar-group setting-group";
        penSettingsGroup.id = "penSettingsGroup";

        const penColorLabel = document.createElement("label");
        this.penColorPicker = document.createElement("input");
        this.penColorPicker.type = "color";
        this.penColorPicker.value = this.penColor;

        const penWidthLabel = document.createElement("label");
        this.penLineWidthInput = document.createElement("input");
        this.penLineWidthInput.type = "number";
        this.penLineWidthInput.value = this.penLineWidth;
        this.penLineWidthInput.min = "1";
        this.penLineWidthInput.max = "20";

        penSettingsGroup.append(
            penColorLabel,
            this.penColorPicker,
            penWidthLabel,
            this.penLineWidthInput
        );
        this.toolsPanel.appendChild(penSettingsGroup);

        const highlighterSettingsGroup = document.createElement("div");
        highlighterSettingsGroup.className = "toolbar-group setting-group";
        highlighterSettingsGroup.id = "highlighterSettingsGroup";

        const highlighterColorLabel = document.createElement("label");
        this.highlighterColorPicker = document.createElement("input");
        this.highlighterColorPicker.type = "color";
        this.highlighterColorPicker.value = this.highlighterColor;

        const highlighterWidthLabel = document.createElement("label");
        this.highlighterLineWidthInput = document.createElement("input");
        this.highlighterLineWidthInput.type = "number";
        this.highlighterLineWidthInput.value = this.highlighterLineWidth;
        this.highlighterLineWidthInput.min = "5";
        this.highlighterLineWidthInput.max = "50";

        highlighterSettingsGroup.append(
            highlighterColorLabel,
            this.highlighterColorPicker,
            highlighterWidthLabel,
            this.highlighterLineWidthInput
        );
        this.toolsPanel.appendChild(highlighterSettingsGroup);

        this.clearBtn = this._createStyledButton(
            "clearAnnotationsBtn",
            "پاک کردن تمام یادداشت‌ها",
            "پاک کردن همه",
            ""
        );
        this.clearBtn.id = "clearAnnotationsBtn";
        this.toolsPanel.appendChild(this.clearBtn);

        this.targetContainer.appendChild(this.toolsPanel);
        this.updateToolSettingsVisibility();
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById("penSettingsGroup");
        const highlighterSettings = document.getElementById(
            "highlighterSettingsGroup"
        );

        if (penSettings) {
            penSettings.style.display =
                this.currentTool === "pen" && this.noteModeActive
                    ? "flex"
                    : "none";
        }
        if (highlighterSettings) {
            highlighterSettings.style.display =
                this.currentTool === "highlighter" && this.noteModeActive
                    ? "flex"
                    : "none";
        }
    }

    updateVirtualCanvas() {
        // Get viewport dimensions
        this.viewportWidth = window.innerWidth;
        this.viewportHeight = window.innerHeight;

        // Get scroll offset
        this.scrollOffsetX =
            window.pageXOffset || document.documentElement.scrollLeft;
        this.scrollOffsetY =
            window.pageYOffset || document.documentElement.scrollTop;

        // Get total document dimensions
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

        // Resize canvas to viewport size
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
        this.canvas.style.width = `${this.viewportWidth}px`;
        this.canvas.style.height = `${this.viewportHeight}px`;

        // Update committed canvas to full document size
        if (
            this.committedCanvas.width !== this.totalWidth ||
            this.committedCanvas.height !== this.totalHeight
        ) {
            const oldWidth = this.committedCanvas.width;
            const oldHeight = this.committedCanvas.height;

            this.committedCanvas.width = this.totalWidth;
            this.committedCanvas.height = this.totalHeight;

            // If size changed, redraw all committed drawings
            if (
                oldWidth !== this.totalWidth ||
                oldHeight !== this.totalHeight
            ) {
                this.redrawCommittedDrawings();
            }
        }

        this.renderVisibleCanvas();
    }

    addEventListeners() {
        // Virtual canvas update events
        window.addEventListener("resize", () => this.updateVirtualCanvas());
        window.addEventListener("scroll", () => this.updateVirtualCanvas());

        this.canvas.addEventListener("touchstart", (e) => this.handleStart(e), {
            passive: false,
        });
        this.canvas.addEventListener("touchmove", (e) => this.handleMove(e), {
            passive: false,
        });
        this.canvas.addEventListener("touchend", () => this.handleEnd());
        this.canvas.addEventListener("touchcancel", () => this.handleEnd());

        this.canvas.addEventListener("mousedown", (e) => this.handleStart(e));
        this.canvas.addEventListener("mousemove", (e) => this.handleMove(e));
        this.canvas.addEventListener("mouseup", () => this.handleEnd());
        this.canvas.addEventListener("mouseleave", () => this.handleEnd(true));

        this.masterAnnotationToggleBtn.addEventListener("click", () =>
            this.toggleMasterAnnotationMode()
        );

        this.penBtn.addEventListener("click", () => this.selectTool("pen"));
        this.highlighterBtn.addEventListener("click", () =>
            this.selectTool("highlighter")
        );
        this.eraserBtn.addEventListener("click", () =>
            this.selectTool("eraser")
        );
        this.clearBtn.addEventListener("click", () => this.clearAnnotations());

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
            this.canvas.style.pointerEvents = "auto";
            document.body.classList.add("annotation-active");
            this.targetContainer.classList.add("annotation-active");
            this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (فعال)";
            this.masterAnnotationToggleBtn.classList.add("active");
            this.toolsPanel.style.display = "flex";
            if (!this.currentTool) this.selectTool("pen");
        } else {
            this.canvas.style.pointerEvents = "none";
            document.body.classList.remove("annotation-active");
            this.targetContainer.classList.remove("annotation-active");
            this.masterAnnotationToggleBtn.textContent = "NOTE ✏️ (غیرفعال)";
            this.masterAnnotationToggleBtn.classList.remove("active");
            this.toolsPanel.style.display = "none";
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
        if (event.touches && event.touches.length > 0) {
            x = event.touches[0].clientX;
            y = event.touches[0].clientY;
        } else {
            x = event.clientX;
            y = event.clientY;
        }

        // Convert viewport coordinates to document coordinates
        const docX = x + this.scrollOffsetX;
        const docY = y + this.scrollOffsetY;

        return { x: docX, y: docY };
    }

    handleStart(event) {
        if (!this.noteModeActive || (event.touches && event.touches.length > 1))
            return;
        event.preventDefault();
        this.isDrawing = true;
        const { x, y } = this.getEventCoordinates(event);

        this.currentPath = { tool: this.currentTool, points: [{ x, y }] };

        if (this.currentTool === "pen") {
            this.currentPath.color = this.penColor;
            this.currentPath.lineWidth = this.penLineWidth;
            this.currentPath.opacity = 1.0;
        } else if (this.currentTool === "highlighter") {
            this.currentPath.color = this.highlighterColor;
            this.currentPath.lineWidth = this.highlighterLineWidth;
            this.currentPath.opacity = this.highlighterOpacity;
        } else if (this.currentTool === "eraser") {
            this.currentPath.lineWidth = this.eraserWidth;
        }
    }

    handleMove(event) {
        if (
            !this.isDrawing ||
            !this.noteModeActive ||
            (event.touches && event.touches.length > 1)
        )
            return;
        event.preventDefault();
        const { x, y } = this.getEventCoordinates(event);

        if (this.currentPath) {
            if (this.currentTool === "highlighter") {
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
                if (this.currentTool === "highlighter") {
                    const startPoint = this.currentPath.points[0];
                    const endPoint =
                        this.currentPath.points.length > 1
                            ? this.currentPath.points[1]
                            : startPoint;

                    this.currentPath.points = [startPoint, endPoint];

                    this.currentPath.color = this.highlighterColor;
                    this.currentPath.lineWidth = this.highlighterLineWidth;
                    this.currentPath.opacity = this.highlighterOpacity;

                    this.drawings.push(this.currentPath);
                } else if (this.currentTool === "eraser") {
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
                if (drawingsToDelete.has(drawing) || drawing.tool === "eraser")
                    continue;

                for (const pathPoint of drawing.points) {
                    const distance = Math.sqrt(
                        Math.pow(eraserPoint.x - pathPoint.x, 2) +
                            Math.pow(eraserPoint.y - pathPoint.y, 2)
                    );
                    const collisionThreshold =
                        drawing.lineWidth / 2 + this.eraserWidth / 2;
                    if (distance < collisionThreshold) {
                        drawingsToDelete.add(drawing);
                        break;
                    }
                }
            }
        }

        if (drawingsToDelete.size > 0) {
            this.drawings = this.drawings.filter(
                (drawing) => !drawingsToDelete.has(drawing)
            );
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(
            0,
            0,
            this.committedCanvas.width,
            this.committedCanvas.height
        );
        this.drawings.forEach((path) => {
            this._drawSinglePath(path, this.committedCtx, false);
        });
    }

    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw the visible portion of the committed canvas
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(
                this.committedCanvas,
                this.scrollOffsetX,
                this.scrollOffsetY,
                this.viewportWidth,
                this.viewportHeight,
                0,
                0,
                this.viewportWidth,
                this.viewportHeight
            );
        }

        // Draw current path if drawing
        if (this.currentPath && this.isDrawing) {
            this._drawSinglePath(this.currentPath, this.ctx, true);
        }
    }

    _drawSinglePath(path, context, isVirtual = false) {
        if (!path || path.points.length === 0) return;

        context.beginPath();
        context.lineCap = "round";
        context.lineJoin = "round";

        if (
            path.tool === "eraser" &&
            this.isDrawing &&
            path === this.currentPath
        ) {
            context.strokeStyle = "rgba(200, 0, 0, 0.6)";
            context.lineWidth = 2;
            context.globalAlpha = 0.6;
        } else if (path.tool !== "eraser") {
            context.strokeStyle = path.color;
            context.lineWidth = path.lineWidth;
            context.globalAlpha = path.opacity;
        } else {
            return;
        }

        if (path.points.length > 0) {
            let firstPoint = path.points[0];

            if (isVirtual) {
                // Convert document coordinates to viewport coordinates
                firstPoint = {
                    x: firstPoint.x - this.scrollOffsetX,
                    y: firstPoint.y - this.scrollOffsetY,
                };
            }

            context.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < path.points.length; i++) {
                let point = path.points[i];

                if (isVirtual) {
                    // Convert document coordinates to viewport coordinates
                    point = {
                        x: point.x - this.scrollOffsetX,
                        y: point.y - this.scrollOffsetY,
                    };
                }

                context.lineTo(point.x, point.y);
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
        if (this.penBtn) this.penBtn.classList.remove("active");
        if (this.highlighterBtn) this.highlighterBtn.classList.remove("active");
        if (this.eraserBtn) this.eraserBtn.classList.remove("active");

        if (this.currentTool === "pen" && this.penBtn)
            this.penBtn.classList.add("active");
        else if (this.currentTool === "highlighter" && this.highlighterBtn)
            this.highlighterBtn.classList.add("active");
        else if (this.currentTool === "eraser" && this.eraserBtn)
            this.eraserBtn.classList.add("active");
    }

    clearAnnotations() {
        if (
            confirm(
                "آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟"
            )
        ) {
            this.drawings = [];
            localStorage.removeItem(this.storageKey);
            this.redrawCommittedDrawings();
            this.renderVisibleCanvas();
        }
    }

    saveDrawings() {
        try {
            const drawingsToSave = this.drawings.filter(
                (path) => path.tool !== "eraser"
            );
            localStorage.setItem(
                this.storageKey,
                JSON.stringify(drawingsToSave)
            );
        } catch (error) {
            console.error("AnnotationApp: Failed to save drawings:", error);
            alert(
                "خطا در ذخیره‌سازی یادداشت‌ها. ممکن است حافظه مرورگر پر باشد."
            );
        }
    }

    loadDrawings() {
        const savedData = localStorage.getItem(this.storageKey);
        if (savedData) {
            try {
                this.drawings = JSON.parse(savedData);
                this.drawings.forEach((path) => {
                    path.opacity =
                        path.opacity !== undefined
                            ? path.opacity
                            : path.tool === "highlighter"
                            ? this.highlighterOpacity
                            : 1.0;
                    path.lineWidth =
                        path.lineWidth !== undefined
                            ? path.lineWidth
                            : path.tool === "pen"
                            ? this.penLineWidth
                            : path.tool === "highlighter"
                            ? this.highlighterLineWidth
                            : this.eraserWidth;
                });
            } catch (error) {
                console.error(
                    "AnnotationApp: Failed to parse drawings from localStorage:",
                    error
                );
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

// اضافه کردن فایل note.css
const localCSS = document.createElement("link");
localCSS.rel = "stylesheet";
localCSS.href = "./note.css";
document.head.appendChild(localCSS);

// اضافه کردن فونت Google Material Symbols
const googleFont = document.createElement("link");
googleFont.rel = "stylesheet";
googleFont.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined";
document.head.appendChild(googleFont);

// prevent PDF
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.onkeydown = function(e) {
    if (e.ctrlKey && (e.key === 'p' || e.key === 's')) {
      e.preventDefault();
    }
  };
