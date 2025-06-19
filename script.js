// script.js - v11 (Phase 6: Focused Assignment Submission)

(function() {
    'use strict';

    // --- CONFIGURATION & STATE---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbze5K91wdQtilTZLU8IW1iRIrXnAhlhf4kLn4xq0IKXIS7BCYN5H3YZlz32NYhqgtcLSA/exec';
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

    // --- IndexedDB HELPER FUNCTIONS (Unchanged) ---
    function saveAttachment(attachment) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readwrite');
        const store = transaction.objectStore('attachments');
        const request = store.add(attachment);
        request.onsuccess = () => { console.log('Attachment saved.'); loadAndDisplayAttachments(); };
        request.onerror = (e) => console.error('Error saving attachment:', e.target.error);
    }

    function getAttachments(assignmentId, subId, callback) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readonly');
        const store = transaction.objectStore('attachments');
        const index = store.index('assignment_sub_idx');
        const request = index.getAll([assignmentId, subId]);
        request.onsuccess = () => callback(request.result);
        request.onerror = (e) => console.error('Error fetching attachments:', e.target.error);
    }

    function deleteAttachment(id) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readwrite');
        const store = transaction.objectStore('attachments');
        const request = store.delete(id);
        request.onsuccess = () => { console.log('Attachment deleted.'); loadAndDisplayAttachments(); };
        request.onerror = (e) => console.error('Error deleting attachment:', e.target.error);
    }

    function getAllAttachmentsForAssignment(assignmentId, callback) {
        if (!db) return callback([]);
        const transaction = db.transaction(['attachments'], 'readonly');
        const store = transaction.objectStore('attachments');
        const request = store.getAll(); // Get all attachments first
        request.onsuccess = function() {
            // Filter them by assignmentId client-side
            const filtered = (request.result || []).filter(att => att.assignmentId === assignmentId);
            callback(filtered);
        };
        request.onerror = function(event) {
            console.error('Error fetching all attachments:', event.target.error);
            callback([]);
        };
    }

    // --- HELPER FUNCTIONS (Unchanged) ---
    const isExtensionActive = () => document.documentElement.hasAttribute('data-extension-installed');
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }
    const getQueryParams = () => new URLSearchParams(window.location.search);
    const parseMarkdown = (text) => { if (!text) return ''; text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>'); text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>'); return text; };
    function showSaveIndicator() { const i = document.getElementById('saveIndicator'); if (!i) return; i.style.opacity = '1'; setTimeout(() => { i.style.opacity = '0'; }, 2000); }
    async function createSha256Hash(str) { const b = new TextEncoder().encode(str); const h = await crypto.subtle.digest('SHA-256', b); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }
    function getCanonicalJSONString(data) { if (data === null || typeof data !== 'object') return JSON.stringify(data); if (Array.isArray(data)) return `[${data.map(getCanonicalJSONString).join(',')}]`; const k = Object.keys(data).sort(); const p = k.map(key => `${JSON.stringify(key)}:${getCanonicalJSONString(data[key])}`); return `{${p.join(',')}}`; }

    // --- DATA SAVING & LOADING (Unchanged) ---
    function saveContent() {
        if (!quill) return;
        const htmlContent = quill.root.innerHTML;
        if (htmlContent === '<p><br></p>' || htmlContent === '') return;
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;
        if (isExtensionActive()) {
            window.dispatchEvent(new CustomEvent('ab-save-request', { detail: { key: `${assignmentId}|${subId}`, content: htmlContent } }));
        } else {
            localStorage.setItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, htmlContent);
        }
        showSaveIndicator();
    }
    const debouncedSave = debounce(saveContent, 1500);

    function loadContent() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId || !quill) return;
        if (isExtensionActive()) {
            window.addEventListener('ab-load-response', (e) => { if (e.detail.key === `${assignmentId}|${subId}` && e.detail.content) { quill.root.innerHTML = e.detail.content; } }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-load-request', { detail: { key: `${assignmentId}|${subId}` } }));
        } else {
            const savedText = localStorage.getItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`);
            if (savedText) { quill.root.innerHTML = savedText; }
        }
    }

    // --- *** MODIFIED: FOCUSED DATA GATHERING LOGIC *** ---
    async function gatherCurrentAssignmentData() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        if (!assignmentId) {
            alert("Fehler: Keine 'assignmentId' in der URL gefunden. Abgabe nicht möglich.");
            return null;
        }

        const storedIdentifier = localStorage.getItem('aburossi_exporter_identifier') || '';
        const identifier = prompt('Bitte gib deinen Namen oder eine eindeutige Kennung für diese Abgabe ein:', storedIdentifier);

        if (!identifier) {
            alert('Abgabe abgebrochen. Eine Kennung ist erforderlich.');
            return null;
        }
        localStorage.setItem('aburossi_exporter_identifier', identifier);

        const payload = { [assignmentId]: {} };
        const answerPrefix = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;
        const questionPrefix = `${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;

        // Gather answers for the current assignment
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(answerPrefix)) {
                const subId = key.substring(answerPrefix.length);
                if (!payload[assignmentId][subId]) payload[assignmentId][subId] = {};
                payload[assignmentId][subId].answer = localStorage.getItem(key);
            }
        }

        // Gather questions for the current assignment
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(questionPrefix)) {
                const subId = key.substring(questionPrefix.length);
                if (!payload[assignmentId][subId]) payload[assignmentId][subId] = {};
                try {
                    payload[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
                } catch (e) { console.error("Error parsing questions for export", e); }
            }
        }
        
        // Gather attachments for the current assignment
        const attachmentsPromise = new Promise(resolve => {
            getAllAttachmentsForAssignment(assignmentId, attachments => resolve(attachments));
        });
        const attachments = await attachmentsPromise;
        
        attachments.forEach(att => {
            if (!payload[assignmentId][att.subId]) payload[assignmentId][att.subId] = {};
            if (!payload[assignmentId][att.subId].attachments) payload[assignmentId][att.subId].attachments = [];
            payload[assignmentId][att.subId].attachments.push({
                fileName: att.fileName,
                fileType: att.fileType,
                data: att.data
            });
        });

        if (Object.keys(payload[assignmentId]).length === 0) {
            alert("Für diesen Auftrag wurden keine Daten zum Abgeben gefunden.");
            return null;
        }

        let signature = null;
        if (window.crypto && window.crypto.subtle) {
            try {
                signature = await createSha256Hash(getCanonicalJSONString(payload));
            } catch (e) { console.error("Error creating signature:", e); }
        }

        return {
            identifier: identifier,
            assignmentId: assignmentId, // Add assignmentId to the top level for the new filename
            payload,
            signature,
            createdAt: new Date().toISOString()
        };
    }

    // --- *** MODIFIED: SUBMISSION FUNCTION *** ---
    async function submitAssignment() {
        console.log("Starting assignment submission process...");
        
        const finalObject = await gatherCurrentAssignmentData();
        if (!finalObject) return; // User cancelled or no data

        if (!GOOGLE_SCRIPT_URL) {
            alert('Konfigurationsfehler: Die Abgabe-URL ist nicht festgelegt. Bitte kontaktiere deinen Lehrer.');
            return;
        }
        
        const confirmation = confirm("Du bist dabei, alle gespeicherten Aufträge für dieses Kapitel an deinen Lehrer zu senden. Fortfahren?");
        if (!confirmation) {
            alert("Abgabe abgebrochen.");
            return;
        }

        alert('Deine Arbeit wird an Google Drive übermittelt. Dies kann einen Moment dauern. Bitte warte auf die Erfolgsbestätigung.');

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify(finalObject)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                alert(`Erfolg! Deine Arbeit wurde in Google Drive gespeichert als: ${result.fileName}`);
            } else {
                throw new Error(result.message || 'Ein unbekannter Fehler ist auf dem Server aufgetreten.');
            }
        } catch (error) {
            console.error('Google Drive submission failed:', error);
            alert(`Fehler beim Senden der Daten an Google Drive. Dies könnte ein Internetproblem sein.\n\nBitte versuche es erneut.\n\nFehler: ${error.message}`);
        }
    }

    // --- ATTACHMENT & QUESTION LOGIC (Unchanged) ---
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
                    item.innerHTML = `<span>${file.fileName}</span><button class="remove-attachment-btn" data-id="${file.id}">Remove</button>`;
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
        params.forEach((value, key) => { if (key.startsWith('question')) questions[key] = value; });
        if (Object.keys(questions).length > 0) {
            try {
                localStorage.setItem(`${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, JSON.stringify(questions));
            } catch (e) { console.error("Error saving questions:", e); }
        }
        return { subId, questions };
    }

    // --- PAGE INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        console.log(`DOM Content Loaded. Extension active: ${isExtensionActive()}`);
        initializeDB();

        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Gib hier deinen Text ein...',
            modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean'], ['image'] ] }
        });
        
        if (quill.root) {
            quill.root.addEventListener('paste', (e) => {
                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) return;
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
                        saveAttachment({ assignmentId, subId, fileName: `screenshot_${Date.now()}.png`, fileType: 'image/png', data: op.insert.image });
                    }
                });
            }
        });

        const { subId, questions } = getQuestionsFromUrlAndSave();
        const subIdInfoElement = document.getElementById('subIdInfo');
        if (subId) {
            let infoHtml = `<h4>${subId}</h4>`;
            const sortedQuestionKeys = Object.keys(questions).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10)));
            if (sortedQuestionKeys.length > 0) {
                infoHtml += '<div class="questions-container"><ol>';
                sortedQuestionKeys.forEach(key => { infoHtml += `<li>${parseMarkdown(questions[key])}</li>`; });
                infoHtml += '</ol></div>';
            }
            subIdInfoElement.innerHTML = infoHtml;
        }

        loadContent();
        
        const fileInput = document.getElementById('file-attachment');
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const params = getQueryParams();
                const assignmentId = params.get('assignmentId');
                const subId = params.get('subIds');
                if (!assignmentId || !subId) return;
                saveAttachment({ assignmentId, subId, fileName: file.name, fileType: file.type, data: e.target.result });
            };
            reader.readAsDataURL(file);
            event.target.value = null;
        });

        document.getElementById('current-attachments').addEventListener('click', (event) => {
            if (event.target && event.target.classList.contains('remove-attachment-btn')) {
                const fileId = parseInt(event.target.getAttribute('data-id'), 10);
                if (confirm('Bist du sicher, dass du diesen Anhang entfernen möchtest?')) {
                    deleteAttachment(fileId);
                }
            }
        });

        // Add event listener for the main submission button
        const submitBtn = document.getElementById('submitAssignmentBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', submitAssignment);
        }
    });

})();