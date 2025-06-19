// script.js - v5 (Phase 1: Attachments & IndexedDB)

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
                // Create an index to query by assignmentId and subId
                attachmentStore.createIndex('assignment_sub_idx', ['assignmentId', 'subId'], { unique: false });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("Database initialized successfully.");
            // Once DB is ready, load existing attachments
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
        const request = store.add(attachment);

        request.onsuccess = function() {
            console.log('Attachment saved to DB.');
            loadAndDisplayAttachments(); // Refresh the list
        };
        request.onerror = function(event) {
            console.error('Error saving attachment:', event.target.error);
        };
    }

    function getAttachments(assignmentId, subId, callback) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readonly');
        const store = transaction.objectStore('attachments');
        const index = store.index('assignment_sub_idx');
        const request = index.getAll([assignmentId, subId]);

        request.onsuccess = function() {
            callback(request.result);
        };
        request.onerror = function(event) {
            console.error('Error fetching attachments:', event.target.error);
        };
    }

    function deleteAttachment(id) {
        if (!db) return;
        const transaction = db.transaction(['attachments'], 'readwrite');
        const store = transaction.objectStore('attachments');
        const request = store.delete(id);

        request.onsuccess = function() {
            console.log('Attachment deleted from DB.');
            loadAndDisplayAttachments(); // Refresh the list
        };
        request.onerror = function(event) {
            console.error('Error deleting attachment:', event.target.error);
        };
    }


    // --- HELPER FUNCTIONS ---

    const isExtensionActive = () => document.documentElement.hasAttribute('data-extension-installed');

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

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

    // --- DATA SAVING (Checks for extension on each call) ---
    function saveContent() {
        if (!quill) return;
        const htmlContent = quill.root.innerHTML;
        if (htmlContent === '<p><br></p>' || htmlContent === '') return;

        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;

        if (isExtensionActive()) {
            const extensionKey = `${assignmentId}|${subId}`;
            console.log(`Saving to Extension with key: ${extensionKey}`);
            window.dispatchEvent(new CustomEvent('ab-save-request', {
                detail: { key: extensionKey, content: htmlContent }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            console.log(`Saving to LocalStorage with key: ${localStorageKey}`);
            localStorage.setItem(localStorageKey, htmlContent);
        }
        showSaveIndicator();
    }
    const debouncedSave = debounce(saveContent, 1500);

    // --- DATA LOADING (Checks for extension on each call) ---
    function loadContent() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId || !quill) return;

        if (isExtensionActive()) {
            const extensionKey = `${assignmentId}|${subId}`;
            console.log(`Requesting data from Extension for key: ${extensionKey}`);
            window.addEventListener('ab-load-response', (e) => {
                if (e.detail.key === extensionKey && e.detail.content) {
                    console.log('Extension data received, loading into Quill.');
                    quill.root.innerHTML = e.detail.content;
                }
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-load-request', {
                detail: { key: extensionKey }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            console.log(`Loading from LocalStorage with key: ${localStorageKey}`);
            const savedText = localStorage.getItem(localStorageKey);
            if (savedText) {
                quill.root.innerHTML = savedText;
            }
        }
    }

    // --- PRINTING LOGIC (Checks for extension on each call) ---
    function printAllSubIdsForAssignment() {
        const assignmentId = getQueryParams().get('assignmentId') || 'defaultAssignment';

        const processAndPrint = (data, sourceIsExtension) => {
            const subIdAnswerMap = new Map();
            const subIdSet = new Set();
            const assignmentSuffix = assignmentId.includes('_') ? assignmentId.substring(assignmentId.indexOf('_') + 1) : assignmentId;

            if (sourceIsExtension) {
                for (const key in data) {
                    const [keyAssignmentId, subId] = key.split('|');
                    if (keyAssignmentId === assignmentId) {
                        subIdAnswerMap.set(subId, data[key]);
                        subIdSet.add(subId);
                    }
                }
            } else { // Source is LocalStorage
                const answerPrefix = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;
                for (let i = 0; i < data.length; i++) {
                    const key = data.key(i);
                    if (key && key.startsWith(answerPrefix)) {
                        const subId = key.substring(answerPrefix.length);
                        subIdAnswerMap.set(subId, data.getItem(key));
                        subIdSet.add(subId);
                    }
                }
            }

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`${QUESTIONS_PREFIX}${assignmentId}`)) {
                    const subId = key.substring(key.indexOf(SUB_STORAGE_PREFIX) + SUB_STORAGE_PREFIX.length);
                    subIdSet.add(subId);
                }
            }
            if (subIdSet.size === 0) {
                 alert("Keine gespeicherten Themen für dieses Kapitel gefunden.");
                 return;
            }

            const sortedSubIds = Array.from(subIdSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            let allContent = `<h2>${assignmentSuffix}</h2>`;
            sortedSubIds.forEach((subId, index) => {
                const answerContent = subIdAnswerMap.get(subId);
                const questionsHtml = getQuestionsHtmlFromStorage(assignmentId, subId);
                if (questionsHtml || answerContent) {
                    const blockClass = 'sub-assignment-block' + (index > 0 ? ' new-page' : '');
                    allContent += `<div class="${blockClass}">`;
                    allContent += `<h3>Thema: ${subId}</h3>`;
                    if (questionsHtml) allContent += questionsHtml;
                    allContent += `<div class="lined-content">${answerContent || '<p><em>Antworten:</em></p>'}</div>`;
                    allContent += `</div>`;
                }
            });
            printFormattedContent(allContent, assignmentSuffix);
        };

        if (isExtensionActive()) {
            console.log("Requesting all data from extension for printing.");
            window.addEventListener('ab-get-all-response', (e) => {
                processAndPrint(e.detail.allData || {}, true);
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-get-all-request'));
        } else {
            console.log("Gathering data from localStorage for printing.");
            processAndPrint(localStorage, false);
        }
    }
    
    // --- Step 1.5: Retrieval and Display Logic ---
    function loadAndDisplayAttachments() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;

        getAttachments(assignmentId, subId, (attachments) => {
            const container = document.getElementById('current-attachments');
            if (!container) return;
            container.innerHTML = ''; // Clear current list

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

    // --- QUESTION HANDLING (Unaffected, always uses LocalStorage) ---
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

    function getQuestionsHtmlFromStorage(assignmentId, subId) {
        const key = `${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        const stored = localStorage.getItem(key);
        if (!stored) return '';
        try {
            const questionsObject = JSON.parse(stored);
            const sortedKeys = Object.keys(questionsObject).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10)));
            let html = '<div class="questions-print"><ol>';
            sortedKeys.forEach(qKey => { html += `<li>${parseMarkdown(questionsObject[qKey])}</li>`; });
            html += '</ol></div>';
            return html;
        } catch (e) { return ''; }
    }

    // --- PRINT WINDOW FUNCTION ---
    function printFormattedContent(content, printWindowTitle = 'Alle Antworten') {
        const printWindow = window.open('', '', 'height=800,width=800');
        if (!printWindow) { alert("Bitte erlauben Sie Pop-up-Fenster, um drucken zu können."); return; }
        const lineHeight = '1.4em';
        const lineColor = '#d2d2d2';
        printWindow.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${printWindowTitle}</title><style>body{font-family:Arial,sans-serif;color:#333;line-height:${lineHeight};padding:${lineHeight};margin:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:1cm}.lined-content{background-color:#fdfdfa;position:relative;min-height:calc(22 * ${lineHeight});height:auto;overflow:visible;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${lineHeight} - 1px),${lineColor} calc(${lineHeight} - 1px),${lineColor} ${lineHeight});background-size:100% ${lineHeight};background-position:0 0;background-repeat:repeat-y}h1,h2,h3,p,li,div,.questions-print,.sub-assignment-block{line-height:inherit;background-color:transparent!important;margin-top:0;margin-bottom:0}h2{color:#003f5c;margin-bottom:${lineHeight}}h3{color:#2f4b7c;margin-top:${lineHeight};margin-bottom:${lineHeight};page-break-after:avoid}ul,ol{margin-top:0;margin-bottom:${lineHeight};padding-left:2em}.questions-print ol{margin-bottom:${lineHeight};padding-left:1.5em}.questions-print li{margin-bottom:.25em}.sub-assignment-block{margin-bottom:${lineHeight};padding-top:.1px}@media print{.sub-assignment-block{page-break-after:always}.sub-assignment-block:last-child{page-break-after:auto}}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500); };
    }

    // --- PAGE INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        console.log(`DOM Content Loaded. Extension active: ${isExtensionActive()}`);
        
        initializeDB(); // Initialize IndexedDB as soon as the DOM is ready

        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Gib hier deinen Text ein...',
            modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean'], ['image'] ] }
        });
        
        // Add paste event listener to deactivate pasting text, but allow images
        if (quill.root) {
            quill.root.addEventListener('paste', function(e) {
                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
                    // Allow native image pasting
                    return;
                }
                e.preventDefault();
                alert("Einfügen von Text ist in diesem Editor deaktiviert. Bilder können eingefügt werden.");
            });
        }

        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                debouncedSave();
                
                // Step 1.2: Integrate Image Pasting into Quill
                delta.ops.forEach(op => {
                    if (op.insert && op.insert.image) {
                        const params = getQueryParams();
                        const assignmentId = params.get('assignmentId');
                        const subId = params.get('subIds');
                        if (!assignmentId || !subId) return;

                        const imageData = {
                            assignmentId: assignmentId,
                            subId: subId,
                            fileName: `screenshot_${Date.now()}.png`,
                            fileType: 'image/png',
                            data: op.insert.image
                        };
                        saveAttachment(imageData);
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
        // loadAndDisplayAttachments is now called on DB success

        const printAllSubIdsBtn = document.createElement('button');
        printAllSubIdsBtn.id = 'printAllSubIdsBtn';
        printAllSubIdsBtn.textContent = 'Alle Inhalte drucken / Als PDF speichern';
        printAllSubIdsBtn.addEventListener('click', printAllSubIdsForAssignment);
        document.querySelector('.button-container').appendChild(printAllSubIdsBtn);
        
        // --- Step 1.4: Implement Attachment Logic (Listeners) ---
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

                const fileData = {
                    assignmentId: assignmentId,
                    subId: subId,
                    fileName: file.name,
                    fileType: file.type,
                    data: e.target.result // Base64 string
                };
                saveAttachment(fileData);
            };
            reader.readAsDataURL(file);
            event.target.value = null; // Reset input so the same file can be re-added
        });

        // Add event listener for remove buttons using delegation
        const attachmentsContainer = document.getElementById('current-attachments');
        attachmentsContainer.addEventListener('click', function(event) {
            if (event.target && event.target.classList.contains('remove-attachment-btn')) {
                const fileId = parseInt(event.target.getAttribute('data-id'), 10);
                if (confirm('Are you sure you want to remove this attachment?')) {
                    deleteAttachment(fileId);
                }
            }
        });
    });

})();