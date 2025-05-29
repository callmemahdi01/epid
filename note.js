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
        
        this.modalOverlay = null;
        this.modalMessage = null;
        this.modalButtonsContainer = null;

        this.isTwoFingerActive = false;
        this.twoFingerTapData = null; 
        this.TAP_DURATION_THRESHOLD = 300; 
        this.TAP_MOVEMENT_THRESHOLD = 20; // پیکسل - آستانه حرکت برای تشخیص ضربه

        if(this.targetContainer) {
            this.init();
        }
    }

    init() {
        this._createModalDOM();
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
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'custom-modal-overlay';
        this.modalOverlay.style.display = 'none';

        const modalDialog = document.createElement('div');
        modalDialog.className = 'custom-modal';

        this.modalMessage = document.createElement('div');
        this.modalMessage.className = 'custom-modal-message';

        this.modalButtonsContainer = document.createElement('div');
        this.modalButtonsContainer.className = 'custom-modal-buttons';

        modalDialog.appendChild(this.modalMessage);
        modalDialog.appendChild(this.modalButtonsContainer);
        this.modalOverlay.appendChild(modalDialog);
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
        this.masterAnnotationToggleBtn.style.position = 'fixed'; // استفاده از fixed برای قرارگیری نسبت به viewport
        this.masterAnnotationToggleBtn.style.top = '10px'; 
        this.masterAnnotationToggleBtn.style.right = '10px';
        this.masterAnnotationToggleBtn.style.zIndex = '1001'; // بالاتر از بوم
        document.body.appendChild(this.masterAnnotationToggleBtn); // اضافه کردن به body


        this.toolsPanel = document.createElement('div');
        this.toolsPanel.id = 'annotationToolsPanel';
        this.toolsPanel.style.display = 'none'; 
        this.toolsPanel.style.position = 'fixed'; // استفاده از fixed برای قرارگیری نسبت به viewport
        this.toolsPanel.style.flexDirection = 'column'; 
        this.toolsPanel.style.top = '55px'; 
        this.toolsPanel.style.right = '10px';
        this.toolsPanel.style.zIndex = '1001'; // بالاتر از بوم
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

        document.body.appendChild(this.toolsPanel); // اضافه کردن به body
        this.updateToolSettingsVisibility();
    }
    
    _showModal(message, buttonsConfig) {
        if (!this.modalOverlay || !this.modalMessage || !this.modalButtonsContainer) {
            console.error("Modal elements were not created correctly.");
            this._createModalDOM(); 
            if (!this.modalOverlay) return; 
        }
        this.modalMessage.textContent = message;
        this.modalButtonsContainer.innerHTML = ''; 

        buttonsConfig.forEach(config => {
            const button = document.createElement('button');
            button.textContent = config.text;
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

        // { passive: false } اجازه می دهد تا event.preventDefault() فراخوانی شود
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this)); // مشابه touchend برای لغو

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
            // this.targetContainer.classList.add('annotation-active'); // اگر targetContainer تمام صفحه نیست، این ممکن است لازم نباشد
            this.masterAnnotationToggleBtn.textContent = 'NOTE ✏️ (فعال)';
            this.masterAnnotationToggleBtn.classList.add('active');
            this.toolsPanel.style.display = 'flex';
            if (!this.currentTool) this.selectTool('pen'); 
        } else {
            this.canvas.style.pointerEvents = 'none';
            document.body.classList.remove('annotation-active');
            // this.targetContainer.classList.remove('annotation-active');
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
            console.warn("AnnotationApp: Could not determine coordinates from event:", e);
            return { x: 0, y: 0 }; 
        }
        return { x, y };
    }

    getCurrentToolProperties() {
        if (this.currentTool === 'pen') return { color: this.penColor, lineWidth: this.penLineWidth, opacity: 1.0 };
        if (this.currentTool === 'highlighter') return { color: this.highlighterColor, lineWidth: this.highlighterLineWidth, opacity: this.highlighterOpacity };
        if (this.currentTool === 'eraser') return { lineWidth: this.eraserWidth }; // پاک کن فقط به lineWidth نیاز دارد
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
    
    // ---------- BEGIN MODIFIED TOUCH HANDLERS ----------
    handleTouchStart(event) {
        if (!this.noteModeActive) return;

        // اگر رویداد لمسی روی بوم باشد و حالت یادداشت فعال باشد، از رفتار پیش‌فرض مرورگر جلوگیری کنید.
        // این برای مدیریت ژست‌های سفارشی مانند ضربه دو انگشتی حیاتی است.
        if (event.target === this.canvas) {
            event.preventDefault();
        }

        const numTouches = event.touches.length;
        // console.log(`TouchStart: ${numTouches} touches, isTwoFingerActive: ${this.isTwoFingerActive}`);

        if (numTouches === 2) {
            this.isTwoFingerActive = true;
            this.isDrawing = false; // هرگونه عملیات رسم تک انگشتی را متوقف کنید

            // اگر یک رسم تک انگشتی در حال انجام بود و سپس انگشت دوم لمس کرد،
            // مسیر ناقص تک انگشتی باید دور انداخته شود.
            if (this.currentPath) {
                // console.log("TouchStart: Clearing currentPath due to 2-finger touch.");
                this.currentPath = null;
                this.cancelRenderVisibleCanvas(); // مهم برای پاک کردن مسیر موقت
                this.renderVisibleCanvas();     // از روی صفحه نمایش
            }

            this.twoFingerTapData = {
                startTime: Date.now(),
                initialPoints: Array.from(event.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }))
            };
            // console.log("TouchStart: Initialized twoFingerTapData.");
        } else if (numTouches === 1 && !this.isTwoFingerActive) {
            // فقط در صورتی شروع به رسم کنید که شروع یک لمس تکی تمیز باشد،
            // نه اینکه یک ژست دو انگشتی به تازگی تمام شده و یک انگشت باقی مانده باشد.
            // console.log("TouchStart: Starting single finger drawing.");
            this.isDrawing = true;
            const { x, y } = this.getEventCoordinates(event); // اصلاح شده: ارسال خود رویداد
            this.currentPath = { tool: this.currentTool, points: [{ x, y }], ...this.getCurrentToolProperties() };
        } else if (numTouches > 2) {
            // مدیریت 3 انگشت یا بیشتر: به عنوان چند لمسی رفتار کنید، رسم را متوقف کنید، ضربه را نامعتبر کنید
            // console.log("TouchStart: More than 2 fingers, treating as multi-touch.");
            this.isTwoFingerActive = true; // یا یک وضعیت جدید مانند isMultiFingerActive
            this.isDrawing = false;
            this.currentPath = null;
            this.twoFingerTapData = null; // این یک ضربه دو انگشتی نیست
            this.cancelRenderVisibleCanvas();
            this.renderVisibleCanvas();
        }
    }

    handleTouchMove(event) {
        if (!this.noteModeActive) return;

        if (event.target === this.canvas) {
            event.preventDefault();
        }

        const numTouches = event.touches.length;
        // console.log(`TouchMove: ${numTouches} touches, isDrawing: ${this.isDrawing}, isTwoFingerActive: ${this.isTwoFingerActive}`);


        if (this.isTwoFingerActive && numTouches === 2) {
            if (this.twoFingerTapData) {
                const currentPoints = Array.from(event.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
                const p0_initial = this.twoFingerTapData.initialPoints[0];
                const p1_initial = this.twoFingerTapData.initialPoints[1];
                const c0_current = currentPoints[0];
                const c1_current = currentPoints[1];

                const dist0 = Math.hypot(c0_current.clientX - p0_initial.clientX, c0_current.clientY - p0_initial.clientY);
                const dist1 = Math.hypot(c1_current.clientX - p1_initial.clientX, c1_current.clientY - p1_initial.clientY);

                if (dist0 > this.TAP_MOVEMENT_THRESHOLD || dist1 > this.TAP_MOVEMENT_THRESHOLD) {
                    // console.log("TouchMove: Two-finger movement detected, invalidating tap.");
                    this.twoFingerTapData = null; // حرکت تشخیص داده شد، ضربه نیست
                }
            }
        } else if (this.isDrawing && !this.isTwoFingerActive && numTouches === 1) {
            const { x, y } = this.getEventCoordinates(event); // اصلاح شده: ارسال خود رویداد
            this.addPointToCurrentPath(x, y);
            this.requestRenderVisibleCanvas();
        } else if (this.isTwoFingerActive && numTouches !== 2) {
            // تعداد لمس‌ها در حین ژستی که دو انگشتی در نظر گرفته شده بود، تغییر کرد
            // console.log("TouchMove: Number of touches changed during two-finger gesture, invalidating tap.");
            this.twoFingerTapData = null; // ضربه را نامعتبر کنید
            this.isDrawing = false; // اطمینان حاصل کنید که رسم خاموش است
        }
    }

    handleTouchEnd(event) {
        if (!this.noteModeActive) return;
        // event.preventDefault() معمولاً در touchend لازم نیست.

        const numRemainingTouches = event.touches.length;
        // console.log(`TouchEnd: ${numRemainingTouches} remaining touches, isTwoFingerActive: ${this.isTwoFingerActive}, wasDrawing: ${this.isDrawing}`);

        if (this.isTwoFingerActive) {
            // این بلوک پایان ژستی را مدیریت می‌کند که *به عنوان* دو انگشتی شروع شده است
            if (this.twoFingerTapData && numRemainingTouches === 0) { // هر دو انگشت برداشته شدند
                const duration = Date.now() - this.twoFingerTapData.startTime;
                if (duration < this.TAP_DURATION_THRESHOLD) {
                    console.log("AnnotationApp: Two-finger tap detected for undo.");
                    this.undoLastDrawing();
                } else {
                    // console.log("TouchEnd: Two-finger interaction was too long for a tap or fingers moved too much.");
                }
            } else if (this.twoFingerTapData && numRemainingTouches > 0) {
                // console.log("TouchEnd: One finger lifted from a two-finger gesture, tap invalidated.");
            }
            
            // وضعیت دو انگشتی را بازنشانی کنید اگر تمام انگشتان درگیر در ژست برداشته شوند،
            // یا اگر تعداد انگشتان به طور قابل توجهی تغییر کند و ژست را بشکند.
            if (numRemainingTouches < 2) {
                // console.log("TouchEnd: Resetting two-finger active state.");
                this.isTwoFingerActive = false;
                this.twoFingerTapData = null;
            }
            
            this.isDrawing = false; 
            this.currentPath = null; 
            this.cancelRenderVisibleCanvas();
            this.renderVisibleCanvas(); 
            return; 
        }

        // منطق رسم تک انگشتی (isTwoFingerActive برابر false است)
        if (this.isDrawing) {
            if (numRemainingTouches === 0) { // اگر انگشت رسم کننده برداشته شد
                // console.log("TouchEnd: Committing single finger drawing.");
                this.commitCurrentPath();
            } else {
                // console.log("TouchEnd: Drawing was active, but not all fingers lifted. Path not committed here.");
            }
        } else if (this.currentPath) { 
            // مسیر وجود داشت (مثلاً از یک ضربه یا یک رسم ناقص) اما به طور فعال رسم نمی‌شد.
            // console.log("TouchEnd: Clearing non-drawing currentPath.");
            this.currentPath = null; 
            this.renderVisibleCanvas();
        }
        // اگر isDrawing پس از commitCurrentPath به false تنظیم شده باشد، این شرط دیگر برقرار نیست.
        // اطمینان از اینکه isDrawing پس از commitCurrentPath به درستی مدیریت می‌شود.
        // commitCurrentPath در حال حاضر this.isDrawing = false را انجام می‌دهد.
    }
    // ---------- END MODIFIED TOUCH HANDLERS ----------


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
            console.log("AnnotationApp: Last drawing undone.");
        } else {
            console.log("AnnotationApp: No drawings to undo.");
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
                    // آستانه برخورد باید ترکیبی از ضخامت رسم و پاک‌کن باشد
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
        // اطمینان از اینکه targetContainer والد بوم‌ها است و ابعاد صحیحی دارد
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
            if (path.tool !== 'eraser') { // مسیرهای پاک‌کن را دوباره رسم نکنید
                this._drawSinglePath(path, this.committedCtx);
            }
        });
    }

    renderVisibleCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.committedCanvas.width > 0 && this.committedCanvas.height > 0) {
            this.ctx.drawImage(this.committedCanvas, 0, 0);
        }
        // فقط مسیر فعلی را رسم کنید اگر در حال رسم فعال هستیم و ژست دو انگشتی فعال نیست
        if (this.currentPath && this.isDrawing && !this.isTwoFingerActive) {
            this._drawSinglePath(this.currentPath, this.ctx);
        }
    }

    _drawSinglePath(path, context) {
        if (!path || path.points.length === 0) return;

        context.beginPath();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        // نمایش بصری برای پاک‌کن در حین رسم (اختیاری)
        if (path.tool === 'eraser' && this.isDrawing && path === this.currentPath) {
            context.strokeStyle = 'rgba(128, 128, 128, 0.5)'; // خاکستری نیمه‌شفاف برای نشانگر پاک‌کن
            context.lineWidth = this.eraserWidth; 
            context.globalAlpha = 0.5;
        } else if (path.tool !== 'eraser') { 
            context.strokeStyle = path.color;
            context.lineWidth = path.lineWidth;
            context.globalAlpha = path.opacity; 
        } else {
            return; // مسیرهای پاک‌کن ذخیره شده را رسم نکنید (آنها فقط برای حذف استفاده می‌شوند)
        }

        if (path.points.length > 0) {
            context.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
                context.lineTo(path.points[i].x, path.points[i].y);
            }
            context.stroke();
        }
        context.globalAlpha = 1.0; // بازگرداندن آلفا به حالت پیش‌فرض
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
            // فقط مسیرهایی که ابزار پاک‌کن نیستند را ذخیره کنید
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
                // اطمینان از وجود خصوصیات پیش‌فرض برای سازگاری با نسخه‌های قدیمی‌تر
                this.drawings.forEach(path => {
                    path.opacity = path.opacity !== undefined ? path.opacity : (path.tool === 'highlighter' ? this.highlighterOpacity : 1.0);
                    path.lineWidth = path.lineWidth !== undefined ? path.lineWidth :
                                    (path.tool === 'pen' ? this.penLineWidth :
                                    (path.tool === 'highlighter' ? this.highlighterLineWidth : this.eraserWidth));
                    // اگر ابزار پاک‌کن به اشتباه ذخیره شده بود، آن را نادیده بگیرید یا تبدیل کنید
                    if (path.tool === 'eraser') {
                        // این مسیرها نباید در هنگام بارگذاری مشکل ایجاد کنند زیرا _drawSinglePath آنها را رسم نمی‌کند
                    }
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
