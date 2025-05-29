// optimized-annotation-module.js
class AnnotationApp {
    constructor(targetContainerSelector) {
        this.targetContainer = document.querySelector(targetContainerSelector);
        if (!this.targetContainer) {
            console.error("AnnotationApp: Target container not found:", targetContainerSelector);
            return;
        }

        // Performance optimizations
        this.rafId = null;
        this.isRenderScheduled = false;
        this.lastRenderTime = 0;
        this.renderThrottle = 16; // ~60fps

        // Canvas setup
        this.canvas = null;
        this.ctx = null;
        this.committedCanvas = null;
        this.committedCtx = null;

        // Drawing state
        this.isDrawing = false;
        this.noteModeActive = false;
        this.currentTool = 'pen';
        this.currentPath = null;
        this.drawings = [];

        // Tool settings with optimized defaults
        this.tools = {
            pen: { color: '#000000', lineWidth: 3, opacity: 1.0 },
            highlighter: { color: '#FFFF00', lineWidth: 20, opacity: 0.4 },
            eraser: { lineWidth: 15 }
        };

        // Cache DOM elements to avoid repeated queries
        this.elements = {};

        // Storage
        const pageId = window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_');
        this.storageKey = `pageAnnotations_${pageId}`;

        // Optimized icons (smaller SVG)
        this.icons = {
            pen: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
            highlighter: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M19.44 5.3L17.32 3.18c-.6-.6-1.59-.59-2.2.03l-1.63 1.63L18 9.28l1.47-1.47c.6-.61.61-1.59.03-2.2l-.06-.06z"/></svg>',
            eraser: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
        };

        if (this.targetContainer) {
            this.init();
        }
    }

    init() {
        this.setupContainer();
        this.createCanvases();
        this.createToolbar();
        this.bindEvents();
        this.loadDrawings();
        this.resizeCanvases();
        this.selectTool('pen');
    }

    setupContainer() {
        if (getComputedStyle(this.targetContainer).position === 'static') {
            this.targetContainer.style.position = 'relative';
        }
    }

    createCanvases() {
        // Main canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'annotationCanvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1000;
            touch-action: none;
        `;
        this.targetContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // Committed canvas (offscreen)
        this.committedCanvas = document.createElement('canvas');
        this.committedCtx = this.committedCanvas.getContext('2d');

        // Optimize canvas settings
        [this.ctx, this.committedCtx].forEach(ctx => {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.imageSmoothingEnabled = true;
        });
    }

    createToolbar() {
        // Master toggle button
        this.elements.toggleBtn = this.createElement('button', {
            id: 'masterAnnotationToggleBtn',
            className: 'annotation-toggle-btn',
            innerHTML: 'NOTE ✏️',
            title: 'فعال/غیرفعال کردن حالت یادداشت',
            style: `
                position: absolute;
                top: 5px;
                right: 5px;
                z-index: 1001;
                padding: 8px 12px;
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s ease;
            `
        });

        // Tools panel
        this.elements.toolsPanel = this.createElement('div', {
            id: 'annotationToolsPanel',
            style: `
                position: absolute;
                top: 50px;
                right: 5px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 8px;
                display: none;
                flex-direction: column;
                gap: 8px;
                z-index: 1001;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            `
        });

        // Tool buttons container
        const toolsContainer = this.createElement('div', {
            style: 'display: flex; gap: 4px;'
        });

        // Create tool buttons
        this.elements.penBtn = this.createToolButton('pen', 'قلم', this.icons.pen);
        this.elements.highlighterBtn = this.createToolButton('highlighter', 'هایلایتر', this.icons.highlighter);
        this.elements.eraserBtn = this.createToolButton('eraser', 'پاک‌کن', this.icons.eraser);

        toolsContainer.append(
            this.elements.penBtn,
            this.elements.highlighterBtn,
            this.elements.eraserBtn
        );

        // Settings containers
        this.elements.penSettings = this.createSettingsGroup('pen');
        this.elements.highlighterSettings = this.createSettingsGroup('highlighter');

        // Clear button
        this.elements.clearBtn = this.createElement('button', {
            innerHTML: 'پاک کردن همه',
            title: 'پاک کردن تمام یادداشت‌ها',
            style: `
                padding: 6px 12px;
                background: #ff4444;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
            `
        });

        // Append all elements
        this.elements.toolsPanel.append(
            toolsContainer,
            this.elements.penSettings,
            this.elements.highlighterSettings,
            this.elements.clearBtn
        );

        this.targetContainer.append(this.elements.toggleBtn, this.elements.toolsPanel);
    }

    createElement(tag, options = {}) {
        const element = document.createElement(tag);
        Object.entries(options).forEach(([key, value]) => {
            if (key === 'style') {
                element.style.cssText = value;
            } else {
                element[key] = value;
            }
        });
        return element;
    }

    createToolButton(tool, title, icon) {
        return this.createElement('button', {
            className: `tool-btn tool-${tool}`,
            innerHTML: icon,
            title: title,
            dataset: { tool },
            style: `
                width: 32px;
                height: 32px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            `
        });
    }

    createSettingsGroup(tool) {
        const container = this.createElement('div', {
            className: `settings-${tool}`,
            style: 'display: none; gap: 4px; align-items: center;'
        });

        const colorPicker = this.createElement('input', {
            type: 'color',
            value: this.tools[tool].color,
            title: `رنگ ${tool === 'pen' ? 'قلم' : 'هایلایتر'}`,
            style: 'width: 24px; height: 24px; border: none; cursor: pointer;'
        });

        const widthInput = this.createElement('input', {
            type: 'range',
            min: tool === 'pen' ? '1' : '5',
            max: tool === 'pen' ? '20' : '50',
            value: this.tools[tool].lineWidth,
            title: `ضخامت ${tool === 'pen' ? 'قلم' : 'هایلایتر'}`,
            style: 'width: 60px;'
        });

        container.append(colorPicker, widthInput);
        
        // Store references
        this.elements[`${tool}Color`] = colorPicker;
        this.elements[`${tool}Width`] = widthInput;

        return container;
    }

    // Optimized event binding with delegation
    bindEvents() {
        // Debounced resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resizeCanvases(), 150);
        });

        // Canvas events with passive listeners where possible
        const canvasEvents = [
            ['touchstart', this.handleStart.bind(this), { passive: false }],
            ['touchmove', this.handleMove.bind(this), { passive: false }],
            ['touchend', this.handleEnd.bind(this)],
            ['mousedown', this.handleStart.bind(this)],
            ['mousemove', this.handleMove.bind(this)],
            ['mouseup', this.handleEnd.bind(this)],
            ['mouseleave', () => this.handleEnd(true)]
        ];

        canvasEvents.forEach(([event, handler, options]) => {
            this.canvas.addEventListener(event, handler, options);
        });

        // Use event delegation for better performance
        this.elements.toggleBtn.addEventListener('click', this.toggleAnnotationMode.bind(this));
        this.elements.toolsPanel.addEventListener('click', this.handleToolClick.bind(this));
        this.elements.toolsPanel.addEventListener('input', this.handleSettingsChange.bind(this));
    }

    handleToolClick(e) {
        const tool = e.target.dataset?.tool || e.target.closest('[data-tool]')?.dataset?.tool;
        if (tool) {
            this.selectTool(tool);
        } else if (e.target === this.elements.clearBtn) {
            this.clearAnnotations();
        }
    }

    handleSettingsChange(e) {
        const input = e.target;
        if (input.type === 'color') {
            if (input === this.elements.penColor) {
                this.tools.pen.color = input.value;
            } else if (input === this.elements.highlighterColor) {
                this.tools.highlighter.color = input.value;
            }
        } else if (input.type === 'range') {
            const value = parseInt(input.value, 10);
            if (input === this.elements.penWidth) {
                this.tools.pen.lineWidth = value;
            } else if (input === this.elements.highlighterWidth) {
                this.tools.highlighter.lineWidth = value;
            }
        }
    }

    toggleAnnotationMode() {
        this.noteModeActive = !this.noteModeActive;
        
        if (this.noteModeActive) {
            this.canvas.style.pointerEvents = 'auto';
            this.elements.toggleBtn.innerHTML = 'NOTE ✏️ (فعال)';
            this.elements.toggleBtn.style.background = '#4CAF50';
            this.elements.toggleBtn.style.color = 'white';
            this.elements.toolsPanel.style.display = 'flex';
        } else {
            this.canvas.style.pointerEvents = 'none';
            this.elements.toggleBtn.innerHTML = 'NOTE ✏️';
            this.elements.toggleBtn.style.background = '#fff';
            this.elements.toggleBtn.style.color = '#333';
            this.elements.toolsPanel.style.display = 'none';
            this.stopDrawing();
        }
        
        this.updateToolVisibility();
    }

    selectTool(tool) {
        this.currentTool = tool;
        this.updateToolStates();
        this.updateToolVisibility();
    }

    updateToolStates() {
        // Update button states
        [this.elements.penBtn, this.elements.highlighterBtn, this.elements.eraserBtn].forEach(btn => {
            btn.style.background = btn.dataset.tool === this.currentTool ? '#e3f2fd' : 'white';
            btn.style.borderColor = btn.dataset.tool === this.currentTool ? '#2196F3' : '#ddd';
        });
    }

    updateToolVisibility() {
        this.elements.penSettings.style.display = 
            this.currentTool === 'pen' && this.noteModeActive ? 'flex' : 'none';
        this.elements.highlighterSettings.style.display = 
            this.currentTool === 'highlighter' && this.noteModeActive ? 'flex' : 'none';
    }

    // Optimized drawing methods
    getEventCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.touches?.[0]?.clientX || e.clientX) - rect.left;
        const y = (e.touches?.[0]?.clientY || e.clientY) - rect.top;
        return { x, y };
    }

    handleStart(e) {
        if (!this.noteModeActive || (e.touches?.length > 1)) return;
        
        e.preventDefault();
        this.isDrawing = true;
        
        const { x, y } = this.getEventCoords(e);
        const toolSettings = this.tools[this.currentTool];
        
        this.currentPath = {
            tool: this.currentTool,
            points: [{ x, y }],
            ...toolSettings
        };
    }

    handleMove(e) {
        if (!this.isDrawing || !this.noteModeActive || (e.touches?.length > 1)) return;
        
        e.preventDefault();
        const { x, y } = this.getEventCoords(e);
        
        if (this.currentPath) {
            this.currentPath.points.push({ x, y });
            this.scheduleRender();
        }
    }

    handleEnd(leftCanvas = false) {
        if (leftCanvas && !this.isDrawing) return;
        
        this.stopDrawing();
        
        if (this.currentPath?.points.length > 1) {
            if (this.currentTool === 'eraser') {
                this.performErase();
            } else {
                this.drawings.push(this.currentPath);
            }
            
            this.commitDrawings();
            this.saveDrawings();
        }
        
        this.currentPath = null;
        this.scheduleRender();
    }

    stopDrawing() {
        this.isDrawing = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this.isRenderScheduled = false;
        }
    }

    // Optimized rendering with throttling
    scheduleRender() {
        if (this.isRenderScheduled) return;
        
        this.isRenderScheduled = true;
        this.rafId = requestAnimationFrame((timestamp) => {
            if (timestamp - this.lastRenderTime >= this.renderThrottle) {
                this.render();
                this.lastRenderTime = timestamp;
            }
            this.isRenderScheduled = false;
            this.rafId = null;
        });
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw committed drawings
        if (this.committedCanvas.width > 0) {
            this.ctx.drawImage(this.committedCanvas, 0, 0);
        }
        
        // Draw current path
        if (this.currentPath && this.isDrawing) {
            this.drawPath(this.currentPath, this.ctx);
        }
    }

    commitDrawings() {
        this.committedCtx.clearRect(0, 0, this.committedCanvas.width, this.committedCanvas.height);
        this.drawings.forEach(path => this.drawPath(path, this.committedCtx));
    }

    drawPath(path, context) {
        if (!path?.points?.length) return;
        
        context.save();
        
        if (path.tool === 'eraser' && this.isDrawing && path === this.currentPath) {
            context.strokeStyle = 'rgba(200, 0, 0, 0.6)';
            context.lineWidth = 2;
        } else if (path.tool !== 'eraser') {
            context.strokeStyle = path.color;
            context.lineWidth = path.lineWidth;
            context.globalAlpha = path.opacity;
        } else {
            context.restore();
            return;
        }
        
        context.beginPath();
        context.moveTo(path.points[0].x, path.points[0].y);
        
        for (let i = 1; i < path.points.length; i++) {
            context.lineTo(path.points[i].x, path.points[i].y);
        }
        
        context.stroke();
        context.restore();
    }

    performErase() {
        if (!this.currentPath?.points.length) return;
        
        const toDelete = new Set();
        const eraserWidth = this.tools.eraser.lineWidth;
        
        for (const eraserPoint of this.currentPath.points) {
            for (let i = 0; i < this.drawings.length; i++) {
                const drawing = this.drawings[i];
                if (toDelete.has(i) || drawing.tool === 'eraser') continue;
                
                for (const point of drawing.points) {
                    const distance = Math.hypot(eraserPoint.x - point.x, eraserPoint.y - point.y);
                    if (distance < (drawing.lineWidth + eraserWidth) / 2) {
                        toDelete.add(i);
                        break;
                    }
                }
            }
        }
        
        if (toDelete.size > 0) {
            this.drawings = this.drawings.filter((_, index) => !toDelete.has(index));
        }
    }

    resizeCanvases() {
        const { scrollWidth: width, scrollHeight: height } = this.targetContainer;
        
        [this.canvas, this.committedCanvas].forEach(canvas => {
            canvas.width = width;
            canvas.height = height;
        });
        
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        
        this.commitDrawings();
        this.scheduleRender();
    }

    clearAnnotations() {
        if (!confirm('آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها را پاک کنید؟')) return;
        
        this.drawings = [];
        localStorage.removeItem(this.storageKey);
        this.commitDrawings();
        this.scheduleRender();
    }

    saveDrawings() {
        try {
            const data = this.drawings.filter(p => p.tool !== 'eraser');
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error("Save failed:", error);
        }
    }

    loadDrawings() {
        try {
            const data = localStorage.getItem(this.storageKey);
            this.drawings = data ? JSON.parse(data) : [];
            
            // Ensure backward compatibility
            this.drawings.forEach(path => {
                if (!path.opacity) {
                    path.opacity = path.tool === 'highlighter' ? 0.4 : 1.0;
                }
            });
            
            this.commitDrawings();
            this.scheduleRender();
        } catch (error) {
            console.error("Load failed:", error);
            this.drawings = [];
            localStorage.removeItem(this.storageKey);
        }
    }
}

// Usage
// const annotationApp = new AnnotationApp('#targetContainer');