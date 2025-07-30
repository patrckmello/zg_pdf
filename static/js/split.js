// =================================================================================
// SPLIT (DIVIDIR)
// =================================================================================

// --- CONSTS DO SPLIT ---
const splitBtn = document.getElementById('split-btn');
const startSplitBtn = document.getElementById('start-split');
const modeButtons = document.querySelectorAll('.mode-btn');
const partsOption = document.getElementById('parts-option');
const sizeOption = document.getElementById('size-option');
let selectedSplitMode = null; // Variável específica do Split

// --- FUNÇÕES DO SPLIT ---

function disableFileInputAndDropZone() {
    if (fileInput) fileInput.disabled = true;
    if (dropZone) dropZone.classList.add('disabled-upload');
}

function enableFileInputAndDropZone() {
    if (fileInput) fileInput.disabled = false;
    if (dropZone) dropZone.classList.remove('disabled-upload');
}

async function renderModulePreviews() {
    await rebuildPreviews();
}

async function rebuildPreviews() {
    if (!previewContainer) {
        console.error("Elemento 'sortable-preview' não foi encontrado no DOM. Verifique o HTML.");
        return;
    }

    previewContainer.innerHTML = ''; // Limpa previews antigos

    if (selectedFiles.length === 0) {
        showError('Nenhum arquivo selecionado para dividir.', errorMessage);
        enableFileInputAndDropZone(); // libera input e dropzone para novo arquivo
        return;
    }

    if (selectedFiles.length > 1) {
        showError('Apenas um arquivo pode ser dividido. Apenas o primeiro será usado.', errorMessage);
        // Mantém só o primeiro arquivo
        selectedFiles = [selectedFiles[0]];
        // Atualiza input para ter só o primeiro arquivo
        if (fileInput) {
            const dt = new DataTransfer();
            dt.items.add(selectedFiles[0]);
            fileInput.files = dt.files;
        }
    } else {
        hideError();
    }

    // Bloqueia novos uploads após 1 arquivo
    disableFileInputAndDropZone();

    // Cria preview para o arquivo único
    const previewElement = await createPreview(selectedFiles[0], 0);
    previewContainer.appendChild(previewElement);

    checkPreviewVisibility();
}

// --- LISTENERS DO SPLIT ---

// Listener principal para iniciar a funcionalidade de divisão
document.addEventListener('DOMContentLoaded', () => {
    if (splitBtn) {
        splitBtn.addEventListener('click', () => { 
            hideAllErrors();
            if (selectedFiles.length === 0) {
                showError('Por favor, selecione um arquivo para dividir.', errorMessage2);
            } else if (selectedFiles.length > 1) {
                // Embora o preview só mostre um, a validação aqui ainda é útil.
                showError('Por favor, selecione apenas um arquivo para dividir.', errorMessage2);
            } else {
                // A pré-visualização já foi criada. Apenas abra o menu.
                openMenu(splitMenu, [compressionMenu, mergeMenu, organizeMenu, convertMenu]);
            }
        });
    }
});



if (startSplitBtn) {
    startSplitBtn.addEventListener('click', () => { // Remova o 'async' daqui
        hideAllErrors();
        showSpinner(); // 1. Mostra o spinner imediatamente

        // 2. Adia o resto da lógica para o próximo ciclo de eventos
        setTimeout(async () => { 
            // Todo o seu código original vai aqui dentro
            if (selectedFiles.length !== 1) {
                hideSpinner();
                showError('Por favor, selecione apenas UM arquivo para dividir.');
                return;
            }

            const selectedModeBtn = document.querySelector('.mode-btn.active');
            if (!selectedModeBtn) {
                hideSpinner();
                showError('Por favor, selecione um modo de divisão.');
                return;
            }

            const mode = selectedModeBtn.dataset.mode;
            const formData = new FormData();
            formData.append('pdfs', selectedFiles[0]);
            formData.append('mode', mode);

            // ... (resto da sua lógica de 'parts' e 'size')
            if (mode === 'parts') {
                const partsInput = document.getElementById('split-parts-input');
                const parts = parseInt(partsInput.value);
                if (isNaN(parts) || parts <= 0) {
                    hideSpinner();
                    showError('Número de partes inválido. Informe um valor numérico maior que 0.');
                    return;
                }
                formData.append('parts', parts);
            } else if (mode === 'size') {
                const sizeInput = document.getElementById('split-size-input');
                const sizeMB = parseFloat(sizeInput.value);
                if (isNaN(sizeMB) || sizeMB <= 0) {
                    hideSpinner();
                    showError('Tamanho inválido. Informe um valor em MB (maior que 0).');
                    return;
                }
                formData.append('max_size_mb', sizeMB);
            }


            try {
                const response = await fetch('/split', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido do servidor.' }));
                    throw new Error(errorData.message || 'Erro na resposta do servidor.');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'split_result.zip';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

                setTimeout(() => resetApp(), 3000);

            } catch (error) {
                console.error("ERRO CAPTURADO:", error);
                showError(`Ocorreu um erro ao dividir o PDF: ${error.message}`);
            } finally {
                hideSpinner();
                if (typeof closeMenu === 'function' && typeof splitMenu !== 'undefined') {
                    closeMenu(splitMenu);
                }
            }
        }, 50); // Um pequeno delay de 50ms é suficiente
    });
}

// Listener para alternar entre os modos de divisão (por partes / por tamanho)
if (modeButtons) {
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSplitMode = btn.dataset.mode;

            if (partsOption) partsOption.style.display = 'none';
            if (sizeOption) sizeOption.style.display = 'none';

            if (btn.dataset.mode === 'parts') {
                if (partsOption) partsOption.style.display = 'block';
            } else if (btn.dataset.mode === 'size') {
                if (sizeOption) sizeOption.style.display = 'block';
            }
        });
    });
}

async function renderModulePreviews() {
    // Esta função é o ponto de entrada correto vindo do global.js
    await rebuildPreviews(); 
}

