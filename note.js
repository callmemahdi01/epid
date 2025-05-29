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
        const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_') || 'homepage';
        this.storageKey = `${baseStorageKey}_${pageIdentifier}`;

        this.icons = {
            pen: '<span class="material-symbols-outlined">stylus_note</span>',
            highlighter: '<span class="material-symbols-outlined">format_ink_highlighter</span>',
            eraser: '<span class="material-symbols-outlined">ink_eraser</span>'
        };
        
        // ارجاع به عناصر مودال در اینجا تعریف می‌شود اما در _createModalDOM مقداردهی می‌شود
        this.modalOverlay = null;
        this.modalMessage = null;
        this.modalButtonsContainer = null;

        this.isTwoFingerActive = false;
        this.twoFingerTapData = null; 
        this.TAP_DURATION_THRESHOLD = 300; 
        this.TAP_MOVEMENT_THRESHOLD = 20;  

        if(this.targetContainer) {
            this.init();
        }
    }

    init() {
        this._createModalDOM(); // ایجاد عناصر مودال به صورت پویا
        this.createCanvases();
        this.createToolbar();
        this.addEventListeners();
        this.loadDrawings();
        requestAnimationFrame(() => {
            this.resizeCanvases(); 
            this.selectTool('pen'); 
        });
    }

    _createModalDOM() {
        // ایجاد پوشش مودال
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'custom-modal-overlay';
        this.modalOverlay.style.display = 'none'; // در ابتدا مخفی

        // ایجاد دیالوگ مودال (محتوا)
        const modalDialog = document.createElement('div');
        modalDialog.className = 'custom-modal';

        // ایجاد عنصر پیام مودال
        this.modalMessage = document.createElement('div');
        this.modalMessage.className = 'custom-modal-message';

        // ایجاد نگهدارنده دکمه‌های مودال
        this.modalButtonsContainer = document.createElement('div');
        this.modalButtonsContainer.className = 'custom-modal-buttons';

        // مونتاژ مودال
        modalDialog.appendChild(this.modalMessage);
        modalDialog.appendChild(this.modalButtonsContainer);
        this.modalOverlay.appendChild(modalDialog);

        // افزودن مودال به body سند
        document.body.appendChild(this.modalOverlay);
    }

    createCanvases() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'annotationCanvas';
        this.targetContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.committedCanvas = document.createElement('canvas');
        this.committedCtx = this.committedCanvas.getContext('2d');
        
        this.canvas.style.pointerEvents = this.noteModeActive ? 'auto' : 'none';
    }

    _createStyledButton(id, title, innerHTML, baseClassName = 'tool-button') {
        const button = document.createElement('button');
        button.id = id;
        button.title = title;
        button.className = baseClassName; 
        if (innerHTML) button.innerHTML = innerHTML;
        return button;
    }

    createToolbar() {
        this.masterAnnotationToggleBtn = this._createStyledButton('masterAnnotationToggleBtn', 'NOTE - enable/disable', 'NOTE ✏️', ''); 
        this.masterAnnotationToggleBtn.style.top = '10px'; 
        this.masterAnnotationToggleBtn.style.right = '10px';
        // اطمینان از اینکه targetContainer والد صحیح است
        // اگر targetContainer کل صفحه نیست، شاید بهتر باشد دکمه اصلی و پنل ابزار به body اضافه شوند
        // یا موقعیت آن‌ها نسبت به targetContainer تنظیم شود. در اینجا فرض بر این است که targetContainer مناسب است.
        this.targetContainer.appendChild(this.masterAnnotationToggleBtn);


        this.toolsPanel = document.createElement('div');
        this.toolsPanel.id = 'annotationToolsPanel';
        this.toolsPanel.style.display = 'none'; // Original style
        this.toolsPanel.style.flexDirection = 'row'; // Original style
        this.toolsPanel.style.top = '5px'; // Original style
        this.toolsPanel.style.right = '140px'; // Original style

=======
>>>>>>> parent of 41a690b (fix bug)
        this.toolsPanel.style.display = 'none'; 
        this.toolsPanel.style.flexDirection = 'column'; 
        this.toolsPanel.style.top = '55px'; 
        this.toolsPanel.style.right = '10px';
        // استفاده از کلاس‌های Tailwind برای استایل‌دهی پنل ابزار
        this.toolsPanel.classList.add('p-2', 'rounded-md', 'shadow-lg', 'bg-white', 'border', 'border-gray-200', 'flex', 'flex-col', 'gap-2');


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
    
    _showModal(message, buttonsConfig) {
        // عناصر مودال اکنون به صورت پویا ایجاد شده‌اند و در this.modalOverlay و غیره ذخیره شده‌اند.
        if (!this.modalOverlay || !this.modalMessage || !this.modalButtonsContainer) {
            console.error("Modal elements were not created correctly.");
            // شاید بخواهید در اینجا مودال را دوباره ایجاد کنید یا یک پیام خطا به کاربر نشان دهید
            this._createModalDOM(); // سعی در ایجاد مجدد
            if (!this.modalOverlay) return; // اگر باز هم ایجاد نشد، خارج شوید
        }
        this.modalMessage.textContent = message;
        this.modalButtonsContainer.innerHTML = ''; // پاک کردن دکمه‌های قبلی

        buttonsConfig.forEach(config => {
            const button = document.createElement('button');
            button.textContent = config.text;
            // کلاس‌های CSS برای دکمه‌ها از فایل CSS شما اعمال می‌شوند
            button.className = `custom-modal-button ${config.className}`; 
            button.addEventListener('click', () => {
                this._hideModal();
                if (config.callback) {
                    config.callback();
                }
            });
            this.modalButtonsContainer.appendChild(button);
        });
        this.modalOverlay.style.display = 'flex';
    }

    _hideModal() {
        if (!this.modalOverlay) return;
        this.modalOverlay.style.display = 'none';
    }

    showConfirmModal(message, onConfirm, onCancel) {
        const buttons = [
            { text: 'بله', className: 'custom-modal-button-confirm', callback: onConfirm },
            { text: 'خیر', className: 'custom-modal-button-cancel', callback: onCancel }
        ];
        this._showModal(message, buttons);
    }

    showAlertModal(message, onOk) {
        const buttons = [
            { text: 'باشه', className: 'custom-modal-button-alert', callback: onOk }
        ];
        this._showModal(message, buttons);
    }

    updateToolSettingsVisibility() {
        const penSettings = document.getElementById('penSettingsGroup'); // اینها هنوز از طریق ID گرفته می‌شوند چون در createToolbar ایجاد می‌شوند
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

        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

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
            this.isTwoFingerActive = false; 
            this.twoFingerTapData = null;
            this.cancelRenderVisibleCanvas();
            this.renderVisibleCanvas(); 
        }
        this.updateToolSettingsVisibility();
    }

    getEventCoordinates(e) {
        let x, y;
        const rect = this.canvas.getBoundingClientRect();
        let source = e; 

        if (e.touches && e.touches.length > 0) {
            source = e.touches[0];
        }
    
        if (typeof source.clientX === 'number' && typeof source.clientY === 'number') {
            x = source.clientX - rect.left;
            y = source.clientY - rect.top;
        } else {
            return { x: 0, y: 0 }; 
        }
        return { x, y };
    }

    getCurrentToolProperties() {
        if (this.currentTool === 'pen') return { color: this.penColor, lineWidth: this.penLineWidth, opacity: 1.0 };
        if (this.currentTool === 'highlighter') return { color: this.highlighterColor, lineWidth: this.highlighterLineWidth, opacity: this.highlighterOpacity };
        if (this.currentTool === 'eraser') return { lineWidth: this.eraserWidth };
        return {};
    }

    addPointToCurrentPath(x, y) {
        if (!this.currentPath) return;
        if (this.currentTool === 'highlighter') {
            if (this.currentPath.points.length <= 1) this.currentPath.points.push({ x, y });
            else this.currentPath.points[1] = { x, y };
        } else {
            this.currentPath.points.push({ x, y });
        }
    }

    requestRenderVisibleCanvas() {
        if (this.animationFrameRequestId === null) {
            this.animationFrameRequestId = requestAnimationFrame(() => {
                this.renderVisibleCanvas();
                this.animationFrameRequestId = null;
            });
        }
    }

    cancelRenderVisibleCanvas() {
        if (this.animationFrameRequestId !== null) {
            cancelAnimationFrame(this.animationFrameRequestId);
            this.animationFrameRequestId = null;
        }
    }

    commitCurrentPath(isMouseLeave = false) {
        this.cancelRenderVisibleCanvas();
        if (isMouseLeave && !this.isDrawing) return;

        if (this.isDrawing) {
            this.isDrawing = false; 
            if (this.currentPath && this.currentPath.points.length > 0) {
                if (this.currentTool === 'highlighter') {
                    const startPoint = this.currentPath.points[0];
                    const endPoint = this.currentPath.points.length > 1 ? this.currentPath.points[1] : startPoint;
                    this.currentPath.points = [startPoint, endPoint];
                }
                if (this.currentTool === 'eraser') {
                    this.eraseStrokes(); 
                } else if (this.currentTool === 'pen' && this.currentPath.points.length <= 1) {
                    // برای کلیک تکی با قلم کاری انجام نده
                } else if (this.currentPath.tool !== 'eraser') { 
                    this.drawings.push(this.currentPath);
                }
                this.redrawCommittedDrawings();
                this.saveDrawings();
            }
        }
        this.currentPath = null;
        this.renderVisibleCanvas(); 
    }
    
    handleTouchStart(event) {
        if (!this.noteModeActive) return;

        if (event.touches.length === 2) {
            this.isTwoFingerActive = true;
            this.isDrawing = false; 
            this.currentPath = null; 
            this.twoFingerTapData = {
                startTime: Date.now(),
                initialPoints: Array.from(event.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }))
            };
        } else if (event.touches.length === 1 && !this.isTwoFingerActive) {
            event.preventDefault(); 
            this.isDrawing = true;
            const { x, y } = this.getEventCoordinates(event.touches[0]);
            this.currentPath = { tool: this.currentTool, points: [{ x, y }], ...this.getCurrentToolProperties() };
        } else if (event.touches.length > 2) {
            this.isTwoFingerActive = true; 
            this.isDrawing = false;
            this.currentPath = null;
        }
    }

    handleTouchMove(event) {
        if (!this.noteModeActive) return;

        if (this.isTwoFingerActive && event.touches.length === 2) {
            if (this.twoFingerTapData) {
                const currentPoints = Array.from(event.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
                const p0 = this.twoFingerTapData.initialPoints[0];
                const p1 = this.twoFingerTapData.initialPoints[1];
                const c0 = currentPoints[0];
                const c1 = currentPoints[1];

                if (Math.hypot(c0.clientX - p0.clientX, c0.clientY - p0.clientY) > this.TAP_MOVEMENT_THRESHOLD ||
                    Math.hypot(c1.clientX - p1.clientX, c1.clientY - p1.clientY) > this.TAP_MOVEMENT_THRESHOLD) {
                    this.twoFingerTapData = null; 
                }
            }
        } else if (this.isDrawing && !this.isTwoFingerActive && event.touches.length === 1) {
            event.preventDefault(); 
            const { x, y } = this.getEventCoordinates(event.touches[0]);
            this.addPointToCurrentPath(x, y);
            this.requestRenderVisibleCanvas();
        }
    }

    handleTouchEnd(event) {
        if (!this.noteModeActive) return;

        if (this.isTwoFingerActive) {
            if (this.twoFingerTapData && event.touches.length === 0) { 
                const duration = Date.now() - this.twoFingerTapData.startTime;
                if (duration < this.TAP_DURATION_THRESHOLD) { 
                    this.undoLastDrawing();
                }
            }
            
            if (event.touches.length < 2) { 
                this.isTwoFingerActive = false;
                this.twoFingerTapData = null;
            }
            this.isDrawing = false; 
            this.currentPath = null;
            this.cancelRenderVisibleCanvas();
            this.renderVisibleCanvas(); 
            return; 
        }

        if (this.isDrawing) {
          this.commitCurrentPath();
        } else if (this.currentPath) { 
            this.currentPath = null; 
            this.renderVisibleCanvas();
        }
    }

    handleMouseDown(event) {
        if (this.isTwoFingerActive || !this.noteModeActive || (event.button && event.button !== 0)) return;
        event.preventDefault(); 
        this.isDrawing = true;
        const { x, y } = this.getEventCoordinates(event);
        this.currentPath = { tool: this.currentTool, points: [{ x, y }], ...this.getCurrentToolProperties() };
    }

    handleMouseMove(event) {
        if (!this.isDrawing || this.isTwoFingerActive || !this.noteModeActive) return;
        event.preventDefault();
        const { x, y } = this.getEventCoordinates(event);
        this.addPointToCurrentPath(x,y);
        this.requestRenderVisibleCanvas();
    }

    handleMouseUp() {
        if (this.isTwoFingerActive) return; 
        this.commitCurrentPath();
    }

    handleMouseLeave() {
        if (this.isTwoFingerActive) return;
        this.commitCurrentPath(true); 
    }

    undoLastDrawing() {
        if (this.drawings.length > 0) {
            this.drawings.pop();
            this.redrawCommittedDrawings();
            this.renderVisibleCanvas();
            this.saveDrawings();
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
                    const distance = Math.hypot(eraserPoint.x - pathPoint.x, eraserPoint.y - pathPoint.y);
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

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;

            this.committedCanvas.width = width;
            this.committedCanvas.height = height;

            this.redrawCommittedDrawings(); 
            this.renderVisibleCanvas();     
        }
    }

    redrawCommittedDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => {
            if (path.tool !== 'eraser') {
                this._drawSinglePath(path, this.committedCtx);
            }
        });
    }

    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas, 0, 0);
        }
        if (this.currentPath && this.isDrawing && !this.isTwoFingerActive) {
            this._drawSinglePath(this.currentPath, this.ctx);
        }
    }

    _drawSinglePath(path, context) {
        if (!path || path.points.length === 0) return;

        context.beginPath();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        if (path.tool === 'eraser' && this.isDrawing && path === this.currentPath) {
            context.strokeStyle = 'rgba(200, 0, 0, 0.5)'; 
            context.lineWidth = 2; 
            context.globalAlpha = 0.5;
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
        this.showConfirmModal(
            'آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و هایلایت‌ها را پاک کنید؟',
            () => { 
                this.drawings = [];
                localStorage.removeItem(this.storageKey);
                this.redrawCommittedDrawings(); 
                this.renderVisibleCanvas();     
            }
        );
    }

    saveDrawings() {
        try {
            const drawingsToSave = this.drawings.filter(path => path.tool !== 'eraser');
            localStorage.setItem(this.storageKey, JSON.stringify(drawingsToSave));
        } catch (error) {
            console.error("AnnotationApp: Failed to save drawings:", error);
            this.showAlertModal("خطا در ذخیره‌سازی یادداشت‌ها. ممکن است حافظه مرورگر پر باشد.");
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
    }
}
