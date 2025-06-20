// image-uploader.js
document.addEventListener("DOMContentLoaded", function() {
    'use strict';

    // !!! IMPORTANT !!!
    // PASTE YOUR NEW GOOGLE APPS SCRIPT URL HERE (must be the same as in upload.js)
    const IMAGE_UPLOAD_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_NEW_IMAGE_UPLOAD_SCRIPT_URL/exec';

    let phoneUploadInterval = null;
    let qrCodeInstance = null;
    let quill = null;

    // This function waits for the main script.js to initialize Quill
    function waitForQuill() {
        const quillCheckInterval = setInterval(() => {
            // The main script assigns the Quill instance to the window or a global var
            // We assume it's available on a global `quill` variable as per script.js
            const mainEditor = document.querySelector('#answerBox .ql-editor');
            if (mainEditor && mainEditor.__quill) {
                quill = mainEditor.__quill;
                clearInterval(quillCheckInterval);
                initializeImageUploader();
            }
        }, 200); // Check every 200ms
    }

    function initializeImageUploader() {
        if (IMAGE_UPLOAD_SCRIPT_URL.includes('YOUR_NEW_IMAGE_UPLOAD_SCRIPT_URL')) {
            console.error("Image Uploader: Script URL is not configured.");
            return;
        }

        const toolbar = document.querySelector('.ql-toolbar');
        if (!toolbar) {
            console.error('Quill toolbar not found.');
            return;
        }

        // Create a new button for the toolbar
        const phoneButton = document.createElement('button');
        phoneButton.type = 'button';
        phoneButton.classList.add('ql-phone-upload');
        phoneButton.title = 'Bild von Smartphone hinzufügen';
        phoneButton.innerHTML = '<svg viewBox="0 0 18 18"><path class="ql-stroke" d="M14,6.5A1.5,1.5,0,0,1,12.5,8A1.5,1.5,0,0,1,11,6.5A1.5,1.5,0,0,1,14,6.5Z"></path><path class="ql-stroke" d="M15,13.5H3a1,1,0,0,1-1-1V5.5a1,1,0,0,1,1-1h1.5l1-2h5l1,2H15a1,1,0,0,1,1,1v7A1,1,0,0,1,15,13.5Z"></path></svg>';

        phoneButton.addEventListener('click', startPhoneUploadProcess);
        
        // Find an existing button group to append to, or just append to the toolbar
        let targetGroup = toolbar.querySelector('.ql-formats');
        if (targetGroup) {
             targetGroup.appendChild(phoneButton);
        } else {
             toolbar.appendChild(phoneButton);
        }
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function startPhoneUploadProcess() {
        const modal = document.getElementById('phoneUploadModal');
        const qrCodeDiv = document.getElementById('qrcode');
        const modalStatus = document.getElementById('modalStatus');
        const sessionId = generateUUID();

        qrCodeDiv.innerHTML = '';
        const uploadUrl = new URL(window.location.href);
        uploadUrl.pathname = uploadUrl.pathname.replace('answers.html', 'upload.html');
        uploadUrl.search = `?sessionId=${sessionId}`;
    
        if (!qrCodeInstance) {
            qrCodeInstance = new QRCode(qrCodeDiv, { text: uploadUrl.href, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
        } else {
            qrCodeInstance.makeCode(uploadUrl.href);
        }
    
        modalStatus.textContent = "Warte auf Bild-Upload...";
        modal.style.display = 'flex';

        pollForImage(sessionId);

        document.getElementById('cancelUploadBtn').onclick = () => {
            stopPolling();
            modal.style.display = 'none';
        };
    }

    function pollForImage(sessionId) {
        stopPolling();
        phoneUploadInterval = setInterval(async () => {
            try {
                const response = await fetch(IMAGE_UPLOAD_SCRIPT_URL, {
                    method: 'POST', mode: 'cors',
                    body: JSON.stringify({ action: 'checkUpload', sessionId: sessionId }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await response.json();
                if (response.ok && result.status === 'success' && result.imageData) {
                    stopPolling();
                    document.getElementById('phoneUploadModal').style.display = 'none';
                    const range = quill.getSelection(true) || { index: quill.getLength() };
                    quill.insertEmbed(range.index, 'image', result.imageData);
                    quill.setSelection(range.index + 1);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 3000);

        setTimeout(() => {
            if (phoneUploadInterval) {
                stopPolling();
                document.getElementById('modalStatus').textContent = "Zeitüberschreitung. Bitte erneut versuchen.";
            }
        }, 300000); // 5 minute timeout
    }

    function stopPolling() {
        clearInterval(phoneUploadInterval);
        phoneUploadInterval = null;
    }

    // Start the process
    waitForQuill();
});