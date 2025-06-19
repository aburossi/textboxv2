// viewer.js
(function() {
    'use strict';

    // --- CONFIGURATION ---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    const DB_NAME = 'allgemeinbildungDB';
    const ATTACHMENT_STORE = 'attachments';
    const BACKUP_FILENAME = 'aburossi_backup.json';

    // --- DOM ELEMENTS ---
    const dataContainer = document.getElementById('data-container');
    const reloadDataBtn = document.getElementById('reloadDataBtn');
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const importFileInput = document.getElementById('importFileInput');

    let db; // Global state for the IndexedDB connection

    // --- HELPER FUNCTIONS ---
    function parseMarkdown(text) {
        if (!text) return '';
        text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>');
        text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>');
        return text;
    }

    // --- DATABASE LOGIC (Unchanged) ---
    function initializeDB(callback) {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = function(event) {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(ATTACHMENT_STORE)) {
                const attachmentStore = dbInstance.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id', autoIncrement: true });
                attachmentStore.createIndex('assignment_sub_idx', ['assignmentId', 'subId'], { unique: false });
            }
        };
        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("Database initialized successfully for viewer.");
            if (callback) callback();
        };
        request.onerror = function(event) {
            console.error("IndexedDB error:", event.target.errorCode);
            dataContainer.innerHTML = `<p class="error-message">Fehler beim Zugriff auf die Datenbank. Anhänge können nicht geladen werden.</p>`;
        };
    }

    function getAllAttachments(callback) {
        if (!db) return callback([]);
        const transaction = db.transaction([ATTACHMENT_STORE], 'readonly');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = store.getAll();
        request.onsuccess = () => callback(request.result || []);
        request.onerror = (e) => {
            console.error('Error fetching all attachments:', e.target.error);
            callback([]);
        };
    }

    // --- DATA GATHERING & PROCESSING (Unchanged) ---
    function loadAndDisplayData() {
        dataContainer.innerHTML = `<p class="loading-message">Lade Daten...</p>`;
        initializeDB(() => {
            getAllAttachments(attachments => {
                const dataStore = processAllData(attachments);
                renderData(dataStore);
            });
        });
    }

    function processAllData(attachments) {
        const dataStore = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            let isAnswerKey = key.startsWith(STORAGE_PREFIX);
            let isQuestionKey = key.startsWith(QUESTIONS_PREFIX);
            if (isAnswerKey || isQuestionKey) {
                const prefix = isAnswerKey ? STORAGE_PREFIX : QUESTIONS_PREFIX;
                const keyParts = key.substring(prefix.length).split(`_${SUB_STORAGE_PREFIX}`);
                if (keyParts.length !== 2) continue;
                const [assignmentId, subId] = keyParts;
                if (!dataStore[assignmentId]) dataStore[assignmentId] = {};
                if (!dataStore[assignmentId][subId]) dataStore[assignmentId][subId] = { answer: '', questions: {}, attachments: [] };
                if (isAnswerKey) {
                    dataStore[assignmentId][subId].answer = localStorage.getItem(key);
                } else if (isQuestionKey) {
                    try {
                        dataStore[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
                    } catch (e) { console.error(`Error parsing questions for ${key}:`, e); }
                }
            }
        }
        attachments.forEach(att => {
            if (dataStore[att.assignmentId] && dataStore[att.assignmentId][att.subId]) {
                dataStore[att.assignmentId][att.subId].attachments.push(att);
            }
        });
        return dataStore;
    }

    // --- UI RENDERING (Unchanged) ---
    function renderData(dataStore) {
        dataContainer.innerHTML = '';
        const assignmentIds = Object.keys(dataStore).sort();
        if (assignmentIds.length === 0) {
            dataContainer.innerHTML = '<p class="no-data-message">Keine gespeicherten Arbeiten gefunden.</p>';
            return;
        }
        assignmentIds.forEach(assignmentId => {
            const assignmentContainer = document.createElement('details');
            assignmentContainer.className = 'assignment-container';
            assignmentContainer.open = true;
            const assignmentSummary = document.createElement('summary');
            assignmentSummary.textContent = `Kapitel: ${assignmentId}`;
            assignmentContainer.appendChild(assignmentSummary);
            const subIds = Object.keys(dataStore[assignmentId]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            subIds.forEach(subId => {
                const subData = dataStore[assignmentId][subId];
                const subContainer = document.createElement('details');
                subContainer.className = 'sub-container';
                const subSummary = document.createElement('summary');
                subSummary.textContent = `Thema: ${subId}`;
                subContainer.appendChild(subSummary);
                const subContent = document.createElement('div');
                subContent.className = 'sub-content';
                const questionKeys = Object.keys(subData.questions).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10)));
                if (questionKeys.length > 0) {
                    const questionsList = document.createElement('ol');
                    questionsList.className = 'questions-list';
                    questionKeys.forEach(key => {
                        const li = document.createElement('li');
                        li.innerHTML = parseMarkdown(subData.questions[key]);
                        questionsList.appendChild(li);
                    });
                    subContent.appendChild(questionsList);
                }
                if (subData.answer) {
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'answer-content';
                    answerDiv.innerHTML = `<h4>Antwort:</h4>${subData.answer}`;
                    subContent.appendChild(answerDiv);
                }
                if (subData.attachments.length > 0) {
                    const attachmentsDiv = document.createElement('div');
                    attachmentsDiv.className = 'attachments-display';
                    attachmentsDiv.innerHTML = '<h4>Anhänge:</h4>';
                    subData.attachments.forEach(att => {
                        if (att.fileType && att.fileType.startsWith('image/')) {
                            const img = document.createElement('img');
                            img.src = att.data;
                            img.alt = att.fileName;
                            img.title = att.fileName;
                            attachmentsDiv.appendChild(img);
                        } else {
                            const link = document.createElement('a');
                            link.href = att.data;
                            link.download = att.fileName;
                            link.textContent = `Download: ${att.fileName}`;
                            attachmentsDiv.appendChild(link);
                        }
                    });
                    subContent.appendChild(attachmentsDiv);
                }
                subContainer.appendChild(subContent);
                assignmentContainer.appendChild(subContainer);
            });
            dataContainer.appendChild(assignmentContainer);
        });
    }

    // --- BACKUP & RESTORE LOGIC (MODIFIED) ---
    async function exportBackup() {
        alert("Backup wird erstellt. Dies kann einen Moment dauern.");
        try {
            const attachments = await new Promise(resolve => getAllAttachments(resolve));
            const dataStore = processAllData(attachments);
            if (Object.keys(dataStore).length === 0) {
                alert("Keine Daten zum Sichern gefunden.");
                return;
            }
            const zip = new JSZip();
            zip.file(BACKUP_FILENAME, JSON.stringify(dataStore, null, 2));
            const content = await zip.generateAsync({ type: "blob" });
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            saveAs(content, `allgemeinbildung-backup-${timestamp}.zip`);
        } catch (error) {
            console.error("Backup-Fehler:", error);
            alert("Ein Fehler ist beim Erstellen des Backups aufgetreten.");
        }
    }

    async function importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm("WARNUNG: Das Einspielen eines Backups löscht ALLE aktuell gespeicherten Daten und ersetzt sie durch die Daten aus der Backup-Datei. Fortfahren?")) {
            importFileInput.value = '';
            return;
        }

        try {
            let jsonContent;
            // Check file type and get JSON content accordingly
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(file);
                const backupFile = zip.file(BACKUP_FILENAME);
                if (!backupFile) {
                    alert(`Fehler: Die ZIP-Datei enthält nicht die erwartete Datei '${BACKUP_FILENAME}'.`);
                    importFileInput.value = '';
                    return;
                }
                jsonContent = await backupFile.async("string");
            } else if (file.name.endsWith('.json')) {
                jsonContent = await file.text();
            } else {
                alert("Ungültiger Dateityp. Bitte eine .zip oder .json Backup-Datei auswählen.");
                importFileInput.value = '';
                return;
            }

            const dataStore = JSON.parse(jsonContent);
            await restoreDataFromStoreObject(dataStore);

        } catch (error) {
            console.error("Import-Fehler:", error);
            alert("Ein Fehler ist beim Einspielen des Backups aufgetreten. Die Datei ist möglicherweise beschädigt oder hat ein falsches Format.");
        } finally {
            importFileInput.value = '';
        }
    }

    async function restoreDataFromStoreObject(dataStore) {
        // This function now contains the core restoration logic
        await clearAllData(true); // Clear existing data silently

        const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
        const store = transaction.objectStore(ATTACHMENT_STORE);

        for (const assignmentId in dataStore) {
            for (const subId in dataStore[assignmentId]) {
                const subData = dataStore[assignmentId][subId];
                if (subData.answer) {
                    localStorage.setItem(`${STORAGE_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, subData.answer);
                }
                if (subData.questions && Object.keys(subData.questions).length > 0) {
                    localStorage.setItem(`${QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`, JSON.stringify(subData.questions));
                }
                if (subData.attachments) {
                    subData.attachments.forEach(att => {
                        const { id, ...attachmentData } = att;
                        store.add(attachmentData);
                    });
                }
            }
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                alert("Backup erfolgreich wiederhergestellt!");
                loadAndDisplayData();
                resolve();
            };
            transaction.onerror = (e) => {
                 console.error("Fehler bei der Wiederherstellung der Anhänge:", e.target.error);
                 alert("Die Wiederherstellung ist fehlgeschlagen. Fehler beim Schreiben in die Datenbank.");
                 reject(e.target.error);
            };
        });
    }

    // --- DESTRUCTIVE ACTIONS (Unchanged) ---
    async function clearAllData(silent = false) {
        if (!silent) {
            const confirmation1 = confirm("Bist du absolut sicher, dass du ALLE gespeicherten Arbeiten und Anhänge löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.");
            if (!confirmation1) return;
            const confirmation2 = confirm("Letzte Warnung: Wirklich ALLE Daten löschen?");
            if (!confirmation2) return;
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
            request.onsuccess = () => {
                if (!silent) {
                    alert("Alle Daten wurden erfolgreich gelöscht.");
                    loadAndDisplayData();
                }
                resolve();
            };
            request.onerror = (e) => {
                if (!silent) {
                    alert("Fehler beim Löschen der Anhänge. Die Textantworten wurden jedoch gelöscht.");
                    loadAndDisplayData();
                }
                reject(e.target.error);
            };
        });
    }

    // --- INITIALIZATION & EVENT LISTENERS (Unchanged) ---
    document.addEventListener('DOMContentLoaded', () => {
        loadAndDisplayData();
        reloadDataBtn.addEventListener('click', loadAndDisplayData);
        clearAllDataBtn.addEventListener('click', () => clearAllData(false));
        exportBackupBtn.addEventListener('click', exportBackup);
        importBackupBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', importBackup);
    });

})();