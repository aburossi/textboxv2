// script.js - v10 (Phase 5: Hard-coded Google Drive Webhook)

(function() {
    'use strict';

    // --- CONFIGURATION & STATE---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    // *** MODIFIED: The Google Apps Script URL is now hard-coded here. ***
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

        request.onsuccess = function() {
            console.log('Attachment saved to DB.');
            loadAndDisplayAttachments();
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
            loadAndDisplayAttachments();
        };
        request.onerror = function(event) {
            console.error('Error deleting attachment:', event.target.error);
        };
    }

    function getAllAttachments(callback) {
        if (!db) return callback([]);
        const transaction = db.transaction(['attachments'], 'readonly');
        const store = transaction.objectStore('attachments');
        const request = store.getAll();

        request.onsuccess = function() {
            callback(request.result || []);
        };
        request.onerror = function(event) {
            console.error('Error fetching all attachments:', event.target.error);
            callback([]);
        };
    }

    // --- HELPER FUNCTIONS (Unchanged) ---
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

    // --- HASHING & EXPORT HELPERS (Unchanged) ---
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
            const extensionKey = `${assignmentId}|${subId}`;
            window.dispatchEvent(new CustomEvent('ab-save-request', {
                detail: { key: extensionKey, content: htmlContent }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            localStorage.setItem(localStorageKey, htmlContent);
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
            const extensionKey = `${assignmentId}|${subId}`;
            window.addEventListener('ab-load-response', (e) => {
                if (e.detail.key === extensionKey && e.detail.content) {
                    quill.root.innerHTML = e.detail.content;
                }
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-load-request', {
                detail: { key: extensionKey }
            }));
        } else {
            const localStorageKey = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            const savedText = localStorage.getItem(localStorageKey);
            if (savedText) {
                quill.root.innerHTML = savedText;
            }
        }
    }

    // --- PRINTING LOGIC (Unchanged) ---
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
            window.addEventListener('ab-get-all-response', (e) => {
                processAndPrint(e.detail.allData || {}, true);
            }, { once: true });
            window.dispatchEvent(new CustomEvent('ab-get-all-request'));
        } else {
            processAndPrint(localStorage, false);
        }
    }
    
    // --- REFACTORED DATA GATHERING LOGIC (Unchanged) ---
    async function gatherAllExportData() {
        const storedIdentifier = localStorage.getItem('aburossi_exporter_identifier') || '';
        const identifier = prompt('Please enter your name or a unique identifier for this export:', storedIdentifier);

        if (!identifier) {
            alert('Export cancelled. An identifier is required.');
            return null;
        }
        localStorage.setItem('aburossi_exporter_identifier', identifier);

        const answersPromise = new Promise(resolve => {
            if (isExtensionActive()) {
                window.addEventListener('ab-get-all-response', e => resolve(e.detail.allData || {}), { once: true });
                window.dispatchEvent(new CustomEvent('ab-get-all-request'));
            } else {
                const allData = {};
                const subPrefix = `_${SUB_STORAGE_PREFIX}`;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(STORAGE_PREFIX) && key.includes(subPrefix)) {
                        const value = localStorage.getItem(key);
                        const strippedKey = key.substring(STORAGE_PREFIX.length);
                        const lastIndex = strippedKey.lastIndexOf(subPrefix);
                        if (lastIndex > -1) {
                            const assignmentId = strippedKey.substring(0, lastIndex);
                            const subId = strippedKey.substring(lastIndex + subPrefix.length);
                            allData[`${assignmentId}|${subId}`] = value;
                        }
                    }
                }
                resolve(allData);
            }
        });

        const attachmentsPromise = new Promise(resolve => {
            getAllAttachments(attachments => resolve(attachments));
        });

        const [answersData, allAttachments] = await Promise.all([answersPromise, attachmentsPromise]);

        const payload = {};
        const ensurePath = (assignmentId, subId) => {
            if (!payload[assignmentId]) payload[assignmentId] = {};
            if (!payload[assignmentId][subId]) {
                payload[assignmentId][subId] = { questions: {}, answer: null, attachments: [] };
            }
        };

        for (const key in answersData) {
            const [assignmentId, subId] = key.split('|');
            ensurePath(assignmentId, subId);
            payload[assignmentId][subId].answer = answersData[key];
        }

        const subPrefix = `_${SUB_STORAGE_PREFIX}`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(QUESTIONS_PREFIX) && key.includes(subPrefix)) {
                const strippedKey = key.substring(QUESTIONS_PREFIX.length);
                const lastIndex = strippedKey.lastIndexOf(subPrefix);
                if (lastIndex > -1) {
                    const assignmentId = strippedKey.substring(0, lastIndex);
                    const subId = strippedKey.substring(lastIndex + subPrefix.length);
                    ensurePath(assignmentId, subId);
                    try {
                        payload[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
                    } catch (e) { console.error("Error parsing questions for export", e); }
                }
            }
        }

        allAttachments.forEach(att => {
            ensurePath(att.assignmentId, att.subId);
            payload[att.assignmentId][att.subId].attachments.push({
                fileName: att.fileName,
                fileType: att.fileType,
                data: att.data
            });
        });

        if (Object.keys(payload).length === 0) {
            alert("No data found to export.");
            return null;
        }

        let signature = null;
        if (window.crypto && window.crypto.subtle) {
            try {
                const canonicalString = getCanonicalJSONString(payload);
                signature = await createSha256Hash(canonicalString);
            } catch (e) {
                console.error("Error creating signature:", e);
            }
        }

        return {
            identifier: identifier,
            payload,
            signature,
            createdAt: new Date().toISOString()
        };
    }

    // --- *** MODIFIED: GOOGLE DRIVE EXPORT FUNCTION *** ---
    // Now uses the hard-coded URL and provides better user feedback.
    async function exportToGoogleDrive() {
        console.log("Starting Google Drive export process...");
        
        const finalObject = await gatherAllExportData();
        if (!finalObject) return; // User cancelled or no data

        if (!GOOGLE_SCRIPT_URL) {
            alert('Configuration Error: The submission URL is not set. Please contact your teacher.');
            return;
        }
        
        alert('Submitting your work to Google Drive. This may take a moment. Please wait for the success confirmation.');

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify(finalObject)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                alert(`Success! Your work has been saved to Google Drive as: ${result.fileName}`);
            } else {
                throw new Error(result.message || 'An unknown error occurred on the server.');
            }
        } catch (error) {
            console.error('Google Drive export failed:', error);
            alert(`Failed to send data to Google Drive. This could be an internet issue.\n\nPlease try again, or use the "Export as File (Fallback)" button and send the file to your teacher manually.\n\nError: ${error.message}`);
        }
    }

    // --- JSON FILE EXPORT FUNCTION (FALLBACK) (Unchanged) ---
    async function exportAllToJson() {
        console.log("Starting JSON file export process...");

        const finalObject = await gatherAllExportData();
        if (!finalObject) return; // User cancelled or no data

        const jsonString = JSON.stringify(finalObject, null, 2);
        const safeIdentifier = finalObject.identifier.replace(/[^a-z0-9_.-]/gi, '_');
        const fileName = `allgemeinbildung_export_${safeIdentifier}_${new Date().toISOString().split('T')[0]}.json`;

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("Fallback export successful.");
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

    function printFormattedContent(content, printWindowTitle = 'Alle Antworten') {
        const printWindow = window.open('', '', 'height=800,width=800');
        if (!printWindow) { alert("Bitte erlauben Sie Pop-up-Fenster, um drucken zu können."); return; }
        const lineHeight = '1.4em';
        const lineColor = '#d2d2d2';
        printWindow.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${printWindowTitle}</title><style>body{font-family:Arial,sans-serif;color:#333;line-height:${lineHeight};padding:${lineHeight};margin:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:1cm}.lined-content{background-color:#fdfdfa;position:relative;min-height:calc(22 * ${lineHeight});height:auto;overflow:visible;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${lineHeight} - 1px),${lineColor} calc(${lineHeight} - 1px),${lineColor} ${lineHeight});background-size:100% ${lineHeight};background-position:0 0;background-repeat:repeat-y}h1,h2,h3,p,li,div,.questions-print,.sub-assignment-block{line-height:inherit;background-color:transparent!important;margin-top:0;margin-bottom:0}h2{color:#003f5c;margin-bottom:${lineHeight}}h3{color:#2f4b7c;margin-top:${lineHeight};margin-bottom:${lineHeight};page-break-after:avoid}ul,ol{margin-top:0;margin-bottom:${lineHeight};padding-left:2em}.questions-print ol{margin-bottom:${lineHeight};padding-left:1.5em}.questions-print li{margin-bottom:.25em}.sub-assignment-block{margin-bottom:${lineHeight};padding-top:.1px}@media print{.sub-assignment-block{page-break-after:always}.sub-assignment-block:last-child{page-break-after:auto}}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500); };
    }

    // --- PAGE INITIALIZATION (Unchanged) ---
    document.addEventListener("DOMContentLoaded", function() {
        console.log(`DOM Content Loaded. Extension active: ${isExtensionActive()}`);
        
        initializeDB();

        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Gib hier deinen Text ein...',
            modules: { toolbar: [ ['bold', 'italic', 'underline'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean'], ['image'] ] }
        });
        
        if (quill.root) {
            quill.root.addEventListener('paste', function(e) {
                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
                    return;
                }
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

        const printAllSubIdsBtn = document.createElement('button');
        printAllSubIdsBtn.id = 'printAllSubIdsBtn';
        printAllSubIdsBtn.textContent = 'Alle Inhalte drucken / Als PDF speichern';
        printAllSubIdsBtn.addEventListener('click', printAllSubIdsForAssignment);
        document.querySelector('.button-container').appendChild(printAllSubIdsBtn);
        
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
                    data: e.target.result
                };
                saveAttachment(fileData);
            };
            reader.readAsDataURL(file);
            event.target.value = null;
        });

        const attachmentsContainer = document.getElementById('current-attachments');
        attachmentsContainer.addEventListener('click', function(event) {
            if (event.target && event.target.classList.contains('remove-attachment-btn')) {
                const fileId = parseInt(event.target.getAttribute('data-id'), 10);
                if (confirm('Are you sure you want to remove this attachment?')) {
                    deleteAttachment(fileId);
                }
            }
        });

        // Add event listener for Google Drive export
        const exportGoogleDriveBtn = document.getElementById('exportGoogleDriveBtn');
        if (exportGoogleDriveBtn) {
            exportGoogleDriveBtn.addEventListener('click', exportToGoogleDrive);
        }

        // Add event listener for fallback file export
        const exportJsonBtn = document.getElementById('exportJsonBtn');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', exportAllToJson);
        }
    });

})();