// script.js - v20 (Submit All Functionality) - CORRECTED ORIGINAL VERSION
(function() {
    'use strict';

    // --- CONFIGURATION & STATE---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    // IMPORTANT: This URL is for assignment submission.
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbze5K91wdQtilTZLU8IW1iRIrXnAhlhf4kLn4xq0IKXIS7BCYN5H3YZlz32NYhqgtcLSA/exec';
    const DB_NAME = 'allgemeinbildungDB';
    const ATTACHMENT_STORE = 'attachments';
    let quill; // Global state for the editor
    let db; // Global state for the IndexedDB connection

    // --- Step 1.1: Set up the IndexedDB Database ---
    function initializeDB() {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
                const attachmentStore = db.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id', autoIncrement: true });
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

    // --- IndexedDB HELPER FUNCTIONS ---
    function saveAttachment(attachment) {
        if (!db) return;
        const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = store.add(attachment);
        request.onsuccess = () => { console.log('Attachment saved.'); loadAndDisplayAttachments(); };
        request.onerror = (e) => console.error('Error saving attachment:', e.target.error);
    }

    function getAttachments(assignmentId, subId, callback) {
        if (!db) return;
        const transaction = db.transaction([ATTACHMENT_STORE], 'readonly');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const index = store.index('assignment_sub_idx');
        const request = index.getAll([assignmentId, subId]);
        request.onsuccess = () => callback(request.result);
        request.onerror = (e) => console.error('Error fetching attachments:', e.target.error);
    }

    function deleteAttachment(id) {
        if (!db) return;
        const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = store.delete(id);
        request.onsuccess = () => { console.log('Attachment deleted.'); loadAndDisplayAttachments(); };
        request.onerror = (e) => console.error('Error deleting attachment:', e.target.error);
    }

    function getAllAttachmentsForAssignment(assignmentId, callback) {
        if (!db) return callback([]);
        const transaction = db.transaction([ATTACHMENT_STORE], 'readonly');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = store.getAll();
        request.onsuccess = function() {
            const filtered = (request.result || []).filter(att => att.assignmentId === assignmentId);
            callback(filtered);
        };
        request.onerror = function(event) {
            console.error('Error fetching all attachments:', event.target.error);
            callback([]);
        };
    }

    // --- HELPER FUNCTIONS ---
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }
    const getQueryParams = () => new URLSearchParams(window.location.search);
    const parseMarkdown = (text) => { if (!text) return ''; text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>'); text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>'); return text; };
    function showSaveIndicator() { const i = document.getElementById('saveIndicator'); if (!i) return; i.style.opacity = '1'; setTimeout(() => { i.style.opacity = '0'; }, 2000); }
    
    function showPasteError() {
        const notification = document.getElementById('paste-error-notification');
        if (notification) {
            if (notification.style.display === 'block') return; // Don't stack messages
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000); // Hide after 3 seconds
        }
    }

    async function createSha256Hash(str) { const b = new TextEncoder().encode(str); const h = await crypto.subtle.digest('SHA-256', b); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }
    function getCanonicalJSONString(data) { if (data === null || typeof data !== 'object') return JSON.stringify(data); if (Array.isArray(data)) return `[${data.map(getCanonicalJSONString).join(',')}]`; const k = Object.keys(data).sort(); const p = k.map(key => `${JSON.stringify(key)}:${getCanonicalJSONString(data[key])}`); return `{${p.join(',')}}`; }

    // --- DATA SAVING & LOADING ---
    function saveContent() {
        if (!quill) return;
        const htmlContent = quill.root.innerHTML;
        if (htmlContent === '<p><br></p>' || htmlContent === '') return;
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId) return;
        localStorage.setItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, htmlContent);
        showSaveIndicator();
    }
    const debouncedSave = debounce(saveContent, 1500);

    function loadContent() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        if (!assignmentId || !subId || !quill) return;
        const savedText = localStorage.getItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`);
        if (savedText) { quill.root.innerHTML = savedText; }
    }

    // --- FOCUSED DATA GATHERING LOGIC (FOR PRINT/BACKUP) ---
    async function gatherCurrentAssignmentData(promptForIdentifier = true) {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        if (!assignmentId) {
            alert("Fehler: Keine 'assignmentId' in der URL gefunden. Aktion nicht möglich.");
            return null;
        }

        let identifier = localStorage.getItem('aburossi_exporter_identifier') || '';
        if (promptForIdentifier) {
            identifier = prompt('Bitte gib deinen Namen oder eine eindeutige Kennung für diese Aktion ein:', identifier);
            if (!identifier) {
                alert('Aktion abgebrochen. Eine Kennung ist erforderlich.');
                return null;
            }
            localStorage.setItem('aburossi_exporter_identifier', identifier);
        }

        const payload = { [assignmentId]: {} };
        const answerPrefix = `${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;
        const questionPrefix = `${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}`;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(answerPrefix)) {
                const subId = key.substring(answerPrefix.length);
                if (!payload[assignmentId][subId]) payload[assignmentId][subId] = {};
                payload[assignmentId][subId].answer = localStorage.getItem(key);
            }
        }

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
        
        const currentParams = getQueryParams();
        const currentAssignmentId = currentParams.get('assignmentId');
        const currentSubId = currentParams.get('subIds');

        if (quill && currentAssignmentId && currentSubId && currentAssignmentId === assignmentId) {
            const currentAnswer = quill.root.innerHTML;
            if (!payload[assignmentId][currentSubId]) {
                payload[assignmentId][currentSubId] = {};
            }
            if (currentAnswer && currentAnswer.trim() !== '<p><br></p>') {
                payload[assignmentId][currentSubId].answer = currentAnswer;
            }
        }

        const attachments = await new Promise(resolve => getAllAttachmentsForAssignment(assignmentId, resolve));
        
        attachments.forEach(att => {
            if (!payload[assignmentId][att.subId]) payload[assignmentId][att.subId] = {};
            if (!payload[assignmentId][att.subId].attachments) payload[assignmentId][att.subId].attachments = [];
            payload[assignmentId][att.subId].attachments.push({ fileName: att.fileName, fileType: att.fileType, data: att.data });
        });

        if (Object.keys(payload[assignmentId]).length === 0) {
            alert("Für diesen Auftrag wurden keine Daten zum Verarbeiten gefunden.");
            return null;
        }

        let signature = null;
        if (window.crypto && window.crypto.subtle) {
            try {
                signature = await createSha256Hash(getCanonicalJSONString(payload));
            } catch (e) { console.error("Error creating signature:", e); }
        }

        return { identifier, assignmentId, payload, signature, createdAt: new Date().toISOString() };
    }

    // --- COMPREHENSIVE DATA GATHERING LOGIC (FOR SUBMIT ALL) ---
    async function gatherAllAssignmentsData(promptForIdentifier = true) {
        let identifier = localStorage.getItem('aburossi_exporter_identifier') || '';
        if (promptForIdentifier) {
            identifier = prompt('Bitte gib deinen Namen oder eine eindeutige Kennung für diese Abgabe ein:', identifier);
            if (!identifier) {
                alert('Aktion abgebrochen. Eine Kennung ist erforderlich.');
                return null;
            }
            localStorage.setItem('aburossi_exporter_identifier', identifier);
        }

        const allDataPayload = {};
        const answerRegex = new RegExp(`^${STORAGE_PREFIX}(.+)_${SUB_STORAGE_PREFIX}(.+)$`);
        const questionRegex = new RegExp(`^${QUESTIONS_PREFIX}(.+)_${SUB_STORAGE_PREFIX}(.+)$`);

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const answerMatch = key.match(answerRegex);
            if (answerMatch) {
                const [, assignmentId, subId] = answerMatch;
                if (!allDataPayload[assignmentId]) allDataPayload[assignmentId] = {};
                if (!allDataPayload[assignmentId][subId]) allDataPayload[assignmentId][subId] = {};
                allDataPayload[assignmentId][subId].answer = localStorage.getItem(key);
            }
        }

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const questionMatch = key.match(questionRegex);
            if (questionMatch) {
                const [, assignmentId, subId] = questionMatch;
                if (!allDataPayload[assignmentId]) allDataPayload[assignmentId] = {};
                if (!allDataPayload[assignmentId][subId]) allDataPayload[assignmentId][subId] = {};
                try {
                    allDataPayload[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
                } catch (e) { console.error(`Error parsing questions for key ${key}`, e); }
            }
        }
        
        const currentParams = getQueryParams();
        const currentAssignmentId = currentParams.get('assignmentId');
        const currentSubId = currentParams.get('subIds');
        if (quill && currentAssignmentId && currentSubId) {
            const currentAnswer = quill.root.innerHTML;
            if (currentAnswer && currentAnswer.trim() !== '<p><br></p>') {
                if (!allDataPayload[currentAssignmentId]) allDataPayload[currentAssignmentId] = {};
                if (!allDataPayload[currentAssignmentId][currentSubId]) allDataPayload[currentAssignmentId][currentSubId] = {};
                allDataPayload[currentAssignmentId][currentSubId].answer = currentAnswer;
            }
        }

        const allAttachments = await new Promise(resolve => {
            if (!db) { resolve([]); return; }
            const transaction = db.transaction([ATTACHMENT_STORE], 'readonly');
            const store = transaction.objectStore(ATTACHMENT_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => { console.error("Error fetching all attachments:", e.target.error); resolve([]); };
        });
        
        allAttachments.forEach(att => {
            if (allDataPayload[att.assignmentId] && allDataPayload[att.assignmentId][att.subId]) {
                if (!allDataPayload[att.assignmentId][att.subId].attachments) {
                    allDataPayload[att.assignmentId][att.subId].attachments = [];
                }
                allDataPayload[att.assignmentId][att.subId].attachments.push({ fileName: att.fileName, fileType: att.fileType, data: att.data });
            }
        });

        if (Object.keys(allDataPayload).length === 0) {
            alert("Es wurden keine gespeicherten Aufträge zum Senden gefunden.");
            return null;
        }

        let signature = null;
        if (window.crypto && window.crypto.subtle) {
            try {
                signature = await createSha256Hash(getCanonicalJSONString(allDataPayload));
            } catch (e) { console.error("Error creating signature:", e); }
        }

        return { identifier, payload: allDataPayload, signature, createdAt: new Date().toISOString() };
    }

    // --- SUBMISSION FUNCTION ---
    async function submitAssignment() {
        console.log("Starting submission process for ALL assignments...");
        const finalObject = await gatherAllAssignmentsData(true); 
        if (!finalObject) return;

        if (!GOOGLE_SCRIPT_URL) {
            alert('Konfigurationsfehler: Die Abgabe-URL ist nicht festgelegt. Bitte kontaktiere deinen Lehrer.');
            return;
        }
        const confirmation = confirm("Du bist dabei, ALLE gespeicherten Aufträge an deinen Lehrer zu senden. Fortfahren?");
        if (!confirmation) {
            alert("Abgabe abgebrochen.");
            return;
        }
        alert('Deine Arbeiten werden an Google Drive übermittelt. Dies kann einen Moment dauern. Bitte warte auf die Erfolgsbestätigung.');
        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'cors', body: JSON.stringify(finalObject) });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                const successMessage = `Deine Arbeiten wurden erfolgreich übermittelt.\n\nDu kannst alle deine Abgaben in diesem Ordner einsehen:\n${result.folderUrl}`;
                alert(successMessage);
            }
            else {
                throw new Error(result.message || 'Ein unbekannter Fehler ist auf dem Server aufgetreten.');
            }
        } catch (error) {
            console.error('Google Drive submission failed:', error);
            alert(`Fehler beim Senden der Daten an Google Drive. Dies könnte ein Internetproblem sein.\n\nBitte versuche es erneut.\n\nFehler: ${error.message}`);
        }
    }

    // --- PRINT FUNCTION ---
    async function printAssignment() {
        const data = await gatherCurrentAssignmentData(false);
        if (!data || !data.payload) return;
        const assignmentId = data.assignmentId;
        const assignmentData = data.payload[assignmentId];
        const assignmentSuffix = assignmentId.includes('_') ? assignmentId.substring(assignmentId.indexOf('_') + 1) : assignmentId;
        const sortedSubIds = Object.keys(assignmentData).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        let allContent = `<h2>${assignmentSuffix}</h2>`;
        sortedSubIds.forEach((subId, index) => {
            const subData = assignmentData[subId];
            const answerContent = subData.answer;
            const questions = subData.questions;
            let questionsHtml = '';
            if (questions && Object.keys(questions).length > 0) {
                const sortedKeys = Object.keys(questions).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10)));
                questionsHtml = '<div class="questions-print"><ol>';
                sortedKeys.forEach(qKey => { questionsHtml += `<li>${parseMarkdown(questions[qKey])}</li>`; });
                questionsHtml += '</ol></div>';
            }
            if (questionsHtml || answerContent) {
                const blockClass = 'sub-assignment-block' + (index > 0 ? ' new-page' : '');
                allContent += `<div class="${blockClass}">`;
                allContent += `<h3>Thema: ${subId}</h3>`;
                if (questionsHtml) allContent += questionsHtml;
                allContent += `<div class="lined-content">${answerContent || '<p><em>Keine Antwort vorhanden.</em></p>'}</div>`;
                allContent += `</div>`;
            }
        });
        printFormattedContent(allContent, `Druckansicht: ${assignmentSuffix}`);
    }

    function printFormattedContent(content, printWindowTitle = 'Druckansicht') {
        const printWindow = window.open('', '', 'height=800,width=800');
        if (!printWindow) { alert("Bitte erlaube Pop-up-Fenster, um drucken zu können."); return; }
        const lineHeight = '1.4em';
        const lineColor = '#d2d2d2';
        printWindow.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${printWindowTitle}</title><style>body{font-family:Arial,sans-serif;color:#333;line-height:${lineHeight};padding:${lineHeight};margin:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:1cm}.lined-content{background-color:#fdfdfa;position:relative;min-height:calc(22 * ${lineHeight});height:auto;overflow:visible;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${lineHeight} - 1px),${lineColor} calc(${lineHeight} - 1px),${lineColor} ${lineHeight});background-size:100% ${lineHeight};background-position:0 0;background-repeat:repeat-y}h1,h2,h3,p,li,div,.questions-print,.sub-assignment-block{line-height:inherit;background-color:transparent!important;margin-top:0;margin-bottom:0}h2{color:#003f5c;margin-bottom:${lineHeight}}h3{color:#2f4b7c;margin-top:${lineHeight};margin-bottom:${lineHeight};page-break-after:avoid}ul,ol{margin-top:0;margin-bottom:${lineHeight};padding-left:2em}.questions-print ol{margin-bottom:${lineHeight};padding-left:1.5em}.questions-print li{margin-bottom:.25em}.sub-assignment-block{margin-bottom:${lineHeight};padding-top:.1px}@media print{.sub-assignment-block{page-break-after:always}.sub-assignment-block:last-child{page-break-after:auto}}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500); };
    }

    // --- LOCAL RESTORE FUNCTIONALITY ---
    async function importLocalBackup(event) {
        const file = event.target.files[0];
        const importFileInput = document.getElementById('importFileInput');
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            alert("Ungültiger Dateityp. Bitte eine .json Backup-Datei auswählen.");
            if (importFileInput) importFileInput.value = '';
            return;
        }

        if (!confirm("WARNUNG: Das Einspielen eines Backups löscht ALLE aktuell in diesem Kontext (z.B. Obsidian) gespeicherten Daten und ersetzt sie. Fortfahren?")) {
            if (importFileInput) importFileInput.value = '';
            return;
        }

        try {
            const jsonContent = await file.text();
            const importedData = JSON.parse(jsonContent);
            const dataToRestore = importedData.payload || importedData;

            if (typeof dataToRestore !== 'object' || dataToRestore === null) {
                throw new Error("Die JSON-Datei hat nicht das erwartete Format.");
            }

            await restoreDataFromStoreObject(dataToRestore);
        } catch (error) {
            console.error("Import-Fehler:", error);
            alert(`Ein Fehler ist beim Einspielen des Backups aufgetreten. Die Datei ist möglicherweise beschädigt oder hat ein falsches Format.\n\nFehler: ${error.message}`);
        } finally {
            if (importFileInput) importFileInput.value = '';
        }
    }

    async function restoreDataFromStoreObject(dataStore) {
        await clearAllData(true); // Clear existing data silently
        const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        for (const assignmentId in dataStore) {
            for (const subId in dataStore[assignmentId]) {
                const subData = dataStore[assignmentId][subId];
                if (subData.answer) localStorage.setItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, subData.answer);
                if (subData.questions && Object.keys(subData.questions).length > 0) localStorage.setItem(`${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, JSON.stringify(subData.questions));
                if (subData.attachments) subData.attachments.forEach(att => { if (att) store.add(att); });
            }
        }
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                alert("Backup erfolgreich wiederhergestellt! Die Seite wird neu geladen, um die Änderungen anzuzeigen.");
                window.location.reload();
                resolve();
            };
            transaction.onerror = (e) => {
                console.error("Fehler bei der Wiederherstellung der Anhänge:", e.target.error);
                alert("Die Wiederherstellung ist fehlgeschlagen. Fehler beim Schreiben in die Datenbank.");
                reject(e.target.error);
            };
        });
    }

    async function clearAllData(silent = false) {
        if (!silent) {
            if (!confirm("Bist du absolut sicher, dass du ALLE gespeicherten Arbeiten und Anhänge in diesem Kontext löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
            if (!confirm("Letzte Warnung: Wirklich ALLE Daten löschen?")) return;
        }
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('textbox-')) keysToRemove.push(key);
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        return new Promise((resolve, reject) => {
            if (!db) {
                if (!silent) alert("Alle Textantworten wurden gelöscht. Die Datenbank für Anhänge war nicht erreichbar.");
                resolve();
                return;
            }
            const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
            const store = transaction.objectStore(ATTACHMENT_STORE);
            const request = store.clear();
            request.onsuccess = () => { if (!silent) alert("Alle Daten wurden erfolgreich gelöscht."); resolve(); };
            request.onerror = (e) => { if (!silent) alert("Fehler beim Löschen der Anhänge."); reject(e.target.error); };
        });
    }

    // --- ATTACHMENT & QUESTION LOGIC ---
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
            try { localStorage.setItem(`${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, JSON.stringify(questions)); } catch (e) { console.error("Error saving questions:", e); }
        }
        return { subId, questions };
    }

    // --- PAGE INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        initializeDB();

        const Delta = Quill.import('delta');

        quill = new Quill('#answerBox', {
            theme: 'snow',
            placeholder: 'Hier können Bilder eingefügt werden. Text kann geschrieben, aber nicht eingefügt werden.',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['clean'],
                    ['image']
                ],
                clipboard: {
                    matchers: [
                        [Node.TEXT_NODE, (node, delta) => {
                            if (node.textContent && node.textContent.trim().length > 0) {
                                showPasteError();
                            }
                            // Return an empty Delta object to ignore the pasted text
                            return new Delta();
                        }]
                    ]
                }
            }
        });
        
        quill.on('text-change', debouncedSave);

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
        
        document.getElementById('file-attachment').addEventListener('change', (event) => {
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

        // Event Listeners for all buttons
        document.getElementById('submitAssignmentBtn')?.addEventListener('click', submitAssignment);
        document.getElementById('printAssignmentBtn')?.addEventListener('click', printAssignment);
        
        const importBtn = document.getElementById('importLocalBackupBtn');
        const importFileInput = document.getElementById('importFileInput');
        importBtn?.addEventListener('click', () => importFileInput.click());
        importFileInput?.addEventListener('change', importLocalBackup);
    });

})();