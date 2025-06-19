// script.js - v6 (Phase 2: JSON Export - CORRECTED)

(function() {
    'use strict';

    // --- CONFIGURATION & STATE---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    let quill; // Global state for the editor
    let db; // Global state for the IndexedDB connection

    // --- Step 1.1: Set up the IndexedDB Database ---
    function initializeDB() {
        const request = indexedDB.open('allgemeinbildungDB', 1);

        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('attachments')) {
                const attachmentStore = db.createObjectStore('attachments', { keyPath: 'id', autoIncrement: true });
                attachmentStore.createIndex('assignment_sub_idx', ['assignmentId', 'subId'], { unique: false });
                // NEW: Index for fetching all attachments for an entire assignment
                attachmentStore.createIndex('assignment_idx', 'assignmentId', { unique: false });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("Database initialized successfully.");
            loadAndDisplayAttachments();
        };

        request.onerror = function(event) {
            console.error("IndexedDB error:", event.target.errorCode);
        };
    }

    // --- IndexedDB HELPER FUNCTIONS ---
    function saveAttachment(attachment) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readwrite');
        const store = transaction.objectStore('attachments');
        store.add(attachment).onsuccess = () => {
            console.log('Attachment saved to DB.');
            loadAndDisplayAttachments();
        };
    }

    function getAttachments(assignmentId, subId, callback) {
        if (!db) return;
        const store = db.transaction(['attachments'], 'readonly').objectStore('attachments');
        const index = store.index('assignment_sub_idx');
        index.getAll([assignmentId, subId]).onsuccess = (event) => callback(event.target.result);
    }

    function deleteAttachment(id) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readwrite');
        const store = transaction.objectStore('attachments');
        store.delete(id).onsuccess = () => {
            console.log('Attachment deleted from DB.');
            loadAndDisplayAttachments();
        };
    }

    // --- MISSING CODE BLOCK 1: Helper to get all attachments for the export ---
    function getAllAttachmentsForAssignment(assignmentId, callback) {
        if (!db) return;
        const store = db.transaction(['attachments'], 'readonly').objectStore('attachments');
        const index = store.index('assignment_idx');
        index.getAll(assignmentId).onsuccess = (event) => callback(event.target.result);
    }

    // --- MISSING CODE BLOCK 2: Hashing logic required for signing the export ---
    async function createSha256Hash(str) {
        const textAsBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', textAsBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function getCanonicalJSONString(data) {
        if (data === null || typeof data !== 'object') return JSON.stringify(data);
        if (Array.isArray(data)) return `[${data.map(getCanonicalJSONString).join(',')}]`;
        const sortedKeys = Object.keys(data).sort();
        const keyValuePairs = sortedKeys.map(key => `${JSON.stringify(key)}:${getCanonicalJSONString(data[key])}`);
        return `{${keyValuePairs.join(',')}}`;
    }


    // --- HELPER FUNCTIONS ---
    const getQueryParams = () => new URLSearchParams(window.location.search);

    const parseMarkdown = (text) => {
        if (!text) return '';
        text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>');
        text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>');
        return text;
    };

    function showSaveIndicator() {
        const indicator = document.getElementById('saveIndicator');
        if (!indicator) return;
        indicator.style.opacity = '1';
        setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
    }

    // --- MISSING CODE BLOCK 3: Helper to trigger the file download ---
    function triggerDownload(content, fileName) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- DATA SAVING (TEXT) ---
    function saveContent() {
        if (!quill) return;
        const htmlContent = quill.root.innerHTML;
        if (htmlContent === '<p><br></p>' || htmlContent === '') return;
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;
        const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        localStorage.setItem(localStorageKey, htmlContent);
        showSaveIndicator();
    }
    const debouncedSave = debounce(saveContent, 250);

    // --- DATA LOADING (TEXT) ---
    function loadContent() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId || !quill) return;
        const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        const savedText = localStorage.getItem(localStorageKey);
        if (savedText) {
            quill.root.innerHTML = savedText;
        }
    }
    
    // --- MISSING CODE BLOCK 4: The main export function ---
    async function exportToJson() {
        const assignmentId = getQueryParams().get('assignmentId');
        if (!assignmentId) {
            alert("No assignment ID found in URL. Cannot export.");
            return;
        }

        console.log(`Starting export for assignment: ${assignmentId}`);
        const payload = { [assignmentId]: {} };
        const answerPrefix = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;
        const questionPrefix = `${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;

        // 1. Gather all text answers and questions from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            let subId;

            if (key && key.startsWith(answerPrefix)) {
                subId = key.substring(answerPrefix.length);
                payload[assignmentId][subId] = payload[assignmentId][subId] || {};
                payload[assignmentId][subId].answer = localStorage.getItem(key);
            } else if (key && key.startsWith(questionPrefix)) {
                subId = key.substring(questionPrefix.length);
                payload[assignmentId][subId] = payload[assignmentId][subId] || {};
                payload[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
            }
        }

        // 2. Fetch all attachments from IndexedDB
        getAllAttachmentsForAssignment(assignmentId, async (attachments) => {
            console.log(`Found ${attachments.length} attachments to export.`);
            if (attachments && attachments.length > 0) {
                attachments.forEach(att => {
                    payload[assignmentId][att.subId] = payload[assignmentId][att.subId] || {};
                    payload[assignmentId][att.subId].attachments = payload[assignmentId][att.subId].attachments || [];
                    payload[assignmentId][att.subId].attachments.push({
                        fileName: att.fileName,
                        fileType: att.fileType,
                        data: att.data
                    });
                });
            }

            // 3. Sign the complete payload
            const canonicalString = getCanonicalJSONString(payload);
            const signature = await createSha256Hash(canonicalString);

            // 4. Wrap and trigger download
            const finalObject = {
                payload: payload,
                signature: signature,
                createdAt: new Date().toISOString()
            };

            triggerDownload(JSON.stringify(finalObject, null, 2), `${assignmentId}_export.json`);
            console.log("Export complete.");
        });
    }

    // --- ATTACHMENT & UI LOGIC ---
    function loadAndDisplayAttachments() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;

        getAttachments(assignmentId, subId, (attachments) => {
            const container = document.getElementById('current-attachments');
            if (!container) return;
            container.innerHTML = '';
            if (attachments.length === 0) {
                container.innerHTML = '<p>No files attached.</p>';
            } else {
                attachments.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'attachment-item';
                    item.innerHTML = `
                        <span>${file.fileName}</span>
                        <button class="remove-attachment-btn" data-id="${file.id}">Remove</button>
                    `;
                    container.appendChild(item);
                });
            }
        });
    }

    function getQuestionsFromUrlAndSave() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return { subId: null, questions: {} };
        const questions = {};
        params.forEach((value, key) => {
            if (key.startsWith('question')) questions[key] = value;
        });
        if (Object.keys(questions).length > 0) {
            const storageKey = `${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            try {
                localStorage.setItem(storageKey, JSON.stringify(questions));
            } catch (e) { console.error("Error saving questions:", e); }
        }
        return { subId, questions };
    }

    // --- PAGE INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        console.log(`DOM Content Loaded.`);
        initializeDB();
        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Gib hier deinen Text ein...',
            modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean'], ['image'] ] }
        });
        
        if (quill.root) {
            quill.root.addEventListener('paste', function(e) {
                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) { return; }
                e.preventDefault();
                alert("Einfügen von Text ist in diesem Editor deaktiviert. Bilder können eingefügt werden.");
            });
        }

        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                debouncedSave();
                delta.ops.forEach(op => {
                    if (op.insert && op.insert.image) {
                        const params = getQueryParams();
                        const assignmentId = params.get('assignmentId');
                        const subId = params.get('subIds');
                        if (!assignmentId || !subId) return;
                        saveAttachment({
                            assignmentId: assignmentId,
                            subId: subId,
                            fileName: `screenshot_${Date.now()}.png`,
                            fileType: 'image/png',
                            data: op.insert.image
                        });
                    }
                });
            }
        });

        const { subId, questions } = getQuestionsFromUrlAndSave();
        const subIdInfoElement = document.getElementById('subIdInfo');
        if (subId) {
            let infoHtml = `<h4>${subId}</h4>`;
            if (Object.keys(questions).length > 0) {
                infoHtml += '<div class="questions-container"><ol>';
                Object.keys(questions).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10))).forEach(key => { infoHtml += `<li>${parseMarkdown(questions[key])}</li>`; });
                infoHtml += '</ol></div>';
            }
            subIdInfoElement.innerHTML = infoHtml;
        }

        loadContent();

        // --- MISSING CODE BLOCK 5: The event listener that makes the button work ---
        document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);

        const fileInput = document.getElementById('file-attachment');
        fileInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const params = getQueryParams();
                const assignmentId = params.get('assignmentId');
                const subId = params.get('subIds');
                if (!assignmentId || !subId) return;
                saveAttachment({
                    assignmentId: assignmentId,
                    subId: subId,
                    fileName: file.name,
                    fileType: file.type,
                    data: e.target.result
                });
            };
            reader.readAsDataURL(file);
            event.target.value = null;
        });

        document.getElementById('current-attachments').addEventListener('click', function(event) {
            if (event.target && event.target.classList.contains('remove-attachment-btn')) {
                const fileId = parseInt(event.target.getAttribute('data-id'), 10);
                if (confirm('Are you sure you want to remove this attachment?')) {
                    deleteAttachment(fileId);
                }
            }
        });

        // The old print button is removed as it's superseded by the JSON export
        // If you still need it, you can add it back here.
    });

})();