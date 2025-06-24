
const compressBtn = document.querySelector('.function-btn'); // Botão principal do compressor
const startButton = document.getElementById('start-compression'); // Botão "Iniciar Compressão"

let selectedCompression = null; // Tipo de compressão selecionado

/**
 * Função de renderização de previews específica para o módulo de compressão.
 * Ela usa `selectedFile` (singular) e exibe o preview do PDF.
 */
async function renderModulePreviews() {
    const pdfPreviewContainer = document.getElementById("pdf-preview-container");
    const pdfCanvas = document.getElementById("pdf-canvas");
    const pdfInfo = document.getElementById("pdf-info");

    if (selectedFile && selectedFile.type === "application/pdf") {
        hideAllErrors(); // Oculta mensagens de erro
        if (pdfPreviewContainer) pdfPreviewContainer.style.display = "block";

        const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
        if (pdfInfo) pdfInfo.textContent = ` 📦 Tamanho: ${fileSizeMB} MB • 📄 Lendo número de páginas...`;

        const reader = new FileReader();
        reader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                const totalPages = pdf.numPages;
                if (pdfInfo) pdfInfo.textContent = ` 📦 Tamanho: ${fileSizeMB} MB 📄 Páginas: ${totalPages}`;

                pdf.getPage(1).then(page => {
                    const viewport = page.getViewport({
                        scale: 1.5
                    });
                    if (pdfCanvas) {
                        const ctx = pdfCanvas.getContext("2d");
                        pdfCanvas.height = viewport.height;
                        pdfCanvas.width = viewport.width;
                        const renderContext = {
                            canvasContext: ctx,
                            viewport: viewport
                        };
                        page.render(renderContext);
                    }
                });
            }).catch(err => {
                if (pdfInfo) pdfInfo.textContent = `Erro ao ler número de páginas.`;
                console.error(err);
            });
        };
        reader.readAsArrayBuffer(selectedFile);
        if (compressBtn) compressBtn.disabled = false;
    } else {
        if (errorMessage) {
            errorMessage.textContent = "Por favor, selecione um arquivo PDF.";
            errorMessage.style.display = "block";
        }
        selectedFile = null;
        if (compressBtn) compressBtn.disabled = true;
        if (pdfPreviewContainer) pdfPreviewContainer.style.display = "none";
        if (pdfCanvas) pdfCanvas.getContext("2d").clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        if (pdfInfo) pdfInfo.textContent = "";
    }
}


/**
 * Seleciona o tipo de compressão e atualiza a interface.
 * @param {HTMLElement} element - O elemento do botão de opção de compressão clicado.
 */
function selectCompression(element) {
    document.querySelectorAll('.compression-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.opacity = '0.6';
    });
    element.classList.add('selected');
    element.style.opacity = '1';
    selectedCompression = element.getAttribute('data-type');
    if (startButton) startButton.disabled = false;
}

/**
 * Inicia o processo de compressão real, comunicando-se com o backend.
 * Exibe barra de progresso e mensagens de status.
 */
function startCompression() {
    if (!selectedFile || !selectedCompression) {
        alert("Selecione um arquivo e o modo de compressão.");
        return;
    }
    if (progressContainer) progressContainer.style.display = 'block';
    if (statusMessage) {
        statusMessage.style.display = 'block';
        statusMessage.textContent = 'Enviando arquivo...';
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('compression', selectedCompression);

    fetch('/compress', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            const taskId = data.task_id;
            pollProgress(taskId);
        })
        .catch(error => {
            console.error('Erro ao iniciar compressão:', error);
            if (statusMessage) statusMessage.textContent = 'Erro ao iniciar compressão.';
        });
}

/**
 * Verifica o progresso da tarefa de compressão com o backend.
 * @param {string} taskId - O ID da tarefa de compressão.
 */
function pollProgress(taskId) {
    const interval = setInterval(() => {
        fetch(`/progress/${taskId}`)
            .then(response => {
                if (!response.ok) throw new Error("Erro ao verificar progresso");
                return response.json();
            })
            .then(data => {
                const percent = data.percent;
                const status = data.status;
                if (progressBar) progressBar.style.width = percent + '%';
                if (statusMessage) statusMessage.textContent = status;

                // --- LÓGICA DE FINALIZAÇÃO (APENAS UMA VEZ) ---
                if (percent >= 100) {
                    clearInterval(interval); // Para de verificar o progresso
                    if (statusMessage) statusMessage.textContent = 'Compressão concluída';

                    // Opção 1: Iniciar Download e depois recarregar/resetar (com um pequeno delay)
                    setTimeout(() => {
                        window.location.href = `/download/${taskId}`; // Inicia o download
                    
                        setTimeout(() => {
                            resetApp(); 
                        }, 2000); 
                    }, 1000); 
                }
            })
            .catch(err => {
                clearInterval(interval);
                console.error('Erro ao buscar progresso:', err);
                if (statusMessage) statusMessage.textContent = 'Erro ao buscar progresso.';
            });
    }, 1000);
}


// --- Listeners de Eventos do Compressor ---

document.addEventListener('DOMContentLoaded', () => {
    // Listener para o botão principal "Selecionar modo de compressão"
    if (compressBtn) {
        compressBtn.addEventListener('click', () => {
            if (!selectedFile) {
                showError("Por favor, selecione um arquivo PDF para comprimir.");
            } else {
                openMenu(compressionMenu, [mergeMenu, splitMenu, organizeMenu, convertMenu]); // Passa os outros menus para fechar
            }
        });
    }

    // Listener para o botão "Iniciar Compressão"
    if (startButton) {
        startButton.addEventListener('click', startCompression);
    }

    // Corrige comportamento dos botões de compressão (opções "Alta", "Baixa")
    document.querySelectorAll('.compression-option').forEach(opt => {
        opt.addEventListener('click', function() {
            selectCompression(this);
        });
    });
});