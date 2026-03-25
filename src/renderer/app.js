const recordBtn = document.getElementById('record-btn-container');
const statusText = document.getElementById('status-text');
const sourcesModal = document.getElementById('sources-modal');
const resolutionSelect = document.getElementById('resolution');
const fpsSelect = document.getElementById('fps');
const qualitySelect = document.getElementById('quality');
const formatSelect = document.getElementById('format');

// Custom Dropdown Logic
document.querySelectorAll('.settings-dropdown').forEach(dropdown => {
    const menu = dropdown.querySelector('.dropdown-menu');
    const input = dropdown.querySelector('input[type="hidden"]');
    const valueDisplay = dropdown.querySelector('.selected-value');
    
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isClosed = menu.classList.contains('opacity-0');
        
        document.querySelectorAll('.settings-dropdown .dropdown-menu').forEach(m => {
            m.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
        });

        if (isClosed) {
            menu.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
        }
    });

    menu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (input) input.value = item.getAttribute('data-value');
            if (valueDisplay) valueDisplay.textContent = item.textContent;
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
        });
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.settings-dropdown')) {
        document.querySelectorAll('.settings-dropdown .dropdown-menu').forEach(menu => {
            menu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
        });
    }
});

// Windows management
document.getElementById('minimize-btn').onclick = () => window.api.minimizeMainWindow();
document.getElementById('close-btn').onclick = () => window.api.closeMainWindow();

/**
 * Encapsulates the recording state and logic
 */
class RecordingManager {
    constructor() {
        this.mediaRecorder = null;
        this.currentStream = null;
        this.isRecording = false;
        this.isPaused = false;
        this.filePath = '';
    }

    async start(source, constraints, filePath) {
        try {
            this.filePath = filePath;
            this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Use VP9 for much sharper text and better compression
            this.mediaRecorder = new MediaRecorder(this.currentStream, {
                mimeType: 'video/webm; codecs=vp9',
                videoBitsPerSecond: constraints.video.videoBitsPerSecond || 5000000
            });

            window.api.startSaving(filePath);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        // Pass ArrayBuffer directly - Node.js will wrap it on the other side
                        window.api.saveChunk(reader.result);
                    };
                    reader.readAsArrayBuffer(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                window.api.stopSaving();
                if (this.currentStream) {
                    this.currentStream.getTracks().forEach(track => track.stop());
                }
                // Notify main process to close toolbar and show main window
                window.api.recordingStopped();
                
                // Cleanup internal state
                this.mediaRecorder = null;
                this.currentStream = null;
                this.isRecording = false;
                this.isPaused = false;
            };

            this.mediaRecorder.start(1000); // 1-second chunks for better data persistence
            this.isRecording = true;
            
            // Sync UI
            statusText.innerText = 'Recording...';
            const indicator = document.getElementById('record-indicator');
            indicator.className = 'w-8 h-8 rounded-sm bg-white transition-all duration-300';
            
            return true;
        } catch (e) {
            console.error("Recording Manager Start Error:", e);
            throw e;
        }
    }

    stop() {
        if (this.isRecording && this.mediaRecorder?.state !== 'inactive') {
            this.mediaRecorder.stop();
            statusText.innerText = 'Finalizing...';
            
            // Revert record button icon to circle
            const indicator = document.getElementById('record-indicator');
            indicator.className = 'w-10 h-10 rounded-full bg-white transition-all duration-300 group-hover:scale-110';
        }
    }

    pause() {
        if (this.isRecording && this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            statusText.innerText = 'Paused...';
        }
    }

    resume() {
        if (this.isRecording && this.mediaRecorder?.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            statusText.innerText = 'Recording...';
        }
    }
}

const recorder = new RecordingManager();
let currentDialogPath = '';

// IPC Listener Routing
window.api.onPauseRecording(() => recorder.pause());
window.api.onResumeRecording(() => recorder.resume());
window.api.onStopRecording(() => recorder.stop());

window.api.onConversionStarted(() => {
    statusText.innerText = 'Converting...';
    // Add a spin animation to the indicator to show busy state
    const indicator = document.getElementById('record-indicator');
    indicator.className = 'w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-500 transition-all duration-300 animate-spin bg-transparent';
});

window.api.onConversionDone((finalPath) => {
    statusText.innerText = 'Start Record';
    const indicator = document.getElementById('record-indicator');
    indicator.className = 'w-10 h-10 rounded-full bg-white transition-all duration-500';
    if (finalPath) {
        addToRecents(finalPath);
    } else if (recorder.filePath && !recorder.filePath.endsWith('.mp4')) {
        // If it wasn't an MP4 conversion, the original file is the result
        addToRecents(recorder.filePath);
    }
});

// Main User Interaction
recordBtn.onclick = async () => {
    if (recorder.isRecording) {
        recorder.stop();
        return;
    }

    try {
        const ext = formatSelect.value;
        const filePath = await window.api.showSaveDialog(ext);
        if (!filePath) {
            statusText.innerText = 'Start Record';
            return;
        }

        currentDialogPath = filePath;
        statusText.innerText = 'Loading sources...';

        const sourcesGrid = document.getElementById('sources-grid');
        sourcesGrid.innerHTML = '';
        
        const sources = await window.api.getSources();
        const filteredSources = sources.filter(s => s.name !== 'wv_1001' && s.name !== 'Program Manager');
        
        filteredSources.forEach(source => {
            const card = document.createElement('button');
            card.className = `w-[150px] flex flex-col items-center p-2 rounded-xl border-2 transition-all hover:shadow-md focus:outline-none focus:ring-2 group ${source.id.startsWith('screen:') ? 'border-blue-100 bg-blue-50/20 focus:ring-blue-100' : 'border-green-100 bg-green-50/20 focus:ring-green-100'}`;
            
            const thumbContainer = document.createElement('div');
            thumbContainer.className = `w-full aspect-[16/10] rounded-lg flex items-center justify-center mb-2 overflow-hidden relative shadow-sm ${source.id.startsWith('screen:') ? 'bg-blue-100' : 'bg-green-100'}`;
            
            const img = document.createElement('img');
            img.src = source.thumbnail;
            img.className = 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-105';
            
            thumbContainer.appendChild(img);
            const name = document.createElement('span');
            name.className = 'text-xs font-medium text-gray-600 truncate w-full px-1 text-center';
            const parts = source.name.split(/\s+-\s+|\s+—\s+|\s+\|\s+/);
            const appName = parts.length > 1 ? parts.pop().trim() : source.name.trim();
            name.innerText = source.id.startsWith('screen:') ? source.name : appName;
            
            card.appendChild(thumbContainer);
            card.appendChild(name);
            card.onclick = () => {
                document.getElementById('sources-modal').classList.remove('active');
                selectSource(source);
            };
            sourcesGrid.appendChild(card);
        });

        statusText.innerText = 'Select a capture mode...';
        document.getElementById('sources-modal').classList.add('active');
    } catch (e) {
        console.error(e);
        statusText.innerText = "Error requesting sources";
    }
};

const cancelBtn = document.getElementById('cancel-selection');
if (cancelBtn) cancelBtn.onclick = () => {
    document.getElementById('sources-modal').classList.remove('active');
    statusText.innerText = 'Start Record';
};

async function selectSource(source) {
    const filePath = currentDialogPath;
    if (!filePath) return;
    
    // Pass visual feedback to main process about drawing availability
    window.api.setDrawingAvailable(source.id.startsWith('screen:'));

    // Parse selection settings
    const [width, height] = resolutionSelect.value.split('x').map(Number);
    const fps = parseInt(fpsSelect.value, 10);
    const qualityStr = qualitySelect.value;
    
    let bps = 6000000;
    if (qualityStr === 'high') bps = 30000000; // 30Mbps for Ultra-Sharp quality
    if (qualityStr === 'low') bps = 2000000;

    const constraints = {
        audio: false,
        video: {
            videoBitsPerSecond: bps,
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                cursor: 'always',
                minFrameRate: fps,
                maxFrameRate: fps
            }
        }
    };

    // Only apply resolution constraints if not set to 'native'
    if (resolutionSelect.value !== 'native') {
        const [width, height] = resolutionSelect.value.split('x').map(Number);
        constraints.video.mandatory.minWidth = width;
        constraints.video.mandatory.maxWidth = width;
        constraints.video.mandatory.minHeight = height;
        constraints.video.mandatory.maxHeight = height;
    }

    try {
        // Signal main process to minimize the window and spawn toolbars immediately
        window.api.recordingStarted(source);
        statusText.innerText = 'Preparing...';
        
        // Delay actual recording by 800ms to avoid capturing the minimization animation
        setTimeout(async () => {
            try {
                await recorder.start(source, constraints, filePath);
            } catch (e) {
                console.error(e);
                statusText.innerText = "Recording failed to start";
            }
        }, 800);
    } catch (e) {
        console.error(e);
        statusText.innerText = "Recording failed to start";
    }
}

// Persistant Recents Management
async function addToRecents(path) {
    if (!path) return;
    const recents = JSON.parse(localStorage.getItem('recentVideos') || '[]');
    
    // Deduplicate and prune
    const filtered = recents.filter(p => p !== path);
    filtered.unshift(path);
    
    localStorage.setItem('recentVideos', JSON.stringify(filtered.slice(0, 10)));
    renderRecents();
}

async function renderRecents() {
    const recentList = document.getElementById('recent-list');
    recentList.innerHTML = '';
    const recents = JSON.parse(localStorage.getItem('recentVideos') || '[]');
    
    // Async validation to ensure files still exist on disk
    const validRecents = [];
    for (const path of recents) {
        try {
            if (await window.api.fileExists(path)) {
                validRecents.push(path);
            }
        } catch (e) { /* ignore */ }
    }
    
    // Update storage if we found dead links
    if (validRecents.length !== recents.length) {
        localStorage.setItem('recentVideos', JSON.stringify(validRecents));
    }

    validRecents.forEach(path => {
        const item = document.createElement('div');
        item.className = 'bg-white/80 border border-slate-50 px-5 py-4 rounded-xl flex items-center justify-between group-hover:bg-white transition-all hover:shadow-md';
        
        const namePart = document.createElement('span');
        namePart.className = 'text-slate-600 font-medium text-sm truncate max-w-[200px] text-left flex-grow';
        namePart.innerText = path.split('\\').pop();
        
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-4 shrink-0';
        
        const openBtn = document.createElement('button');
        openBtn.className = 'text-indigo-400 hover:text-indigo-600 flex items-center gap-1.5 transition-colors text-sm font-semibold';
        openBtn.innerHTML = '<i class="far fa-play-circle text-base"></i> Play';
        openBtn.onclick = () => window.api.openPath(path);

        const folderBtn = document.createElement('button');
        folderBtn.className = 'text-slate-400 hover:text-indigo-500 transition-colors duration-200';
        folderBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
        folderBtn.title = 'Open Folder';
        folderBtn.onclick = () => window.api.showItemInFolder(path);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'text-slate-400 hover:text-rose-400 transition-colors duration-200 ml-1';
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.onclick = async () => {
            const confirmed = await window.api.deleteFile(path);
            if (confirmed) {
                const refreshed = JSON.parse(localStorage.getItem('recentVideos') || '[]').filter(p => p !== path);
                localStorage.setItem('recentVideos', JSON.stringify(refreshed));
                renderRecents();
            }
        };
        
        actions.appendChild(openBtn);
        actions.appendChild(folderBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(namePart);
        item.appendChild(actions);
        recentList.appendChild(item);
    });
}

// Initial render
renderRecents();
