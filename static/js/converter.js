
const convertBtn = document.getElementById('convert-btn');
const convertStartBtn = document.getElementById('start-convert');
const previewGrid = document.getElementById('preview-grid');

const iconPath = 'caminho/para/seu/icone-arquivo.svg';

/**
 * Função de renderização de previews específica para o módulo de conversão.
 * Ela usa `selectedFiles` (plural) e exibe ícones genéricos.
 */
async function renderModulePreviews() {
    refreshPreviews(); // Chama a função para reconstruir o grid
    // Não precisa de selectedFile aqui, o checkPreviewVisibility global já cuida
}

/**
 * Cria uma pré-visualização de um arquivo na área de conversão.
 * @param {File} file - O arquivo a ser pré-visualizado.
 * @param {number} index - O índice do arquivo na lista de selectedFiles.
 */
async function createPreview(file, index) {
    const previewItem = document.createElement('div');
    previewItem.classList.add('preview-item');
    previewItem.style.position = 'relative';

    const img = document.createElement('img');
    img.src = iconPath;
    img.alt = 'Ícone do arquivo';
    img.classList.add('preview-icon');
    img.style.width = '150px';
    img.style.height = '150px';

    const filenameElement = document.createElement('div');
    filenameElement.classList.add('preview-filename');
    filenameElement.textContent = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.classList.add('remove-btn');
    removeBtn.title = 'Remover arquivo';

    removeBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        previewItem.remove();
        checkPreviewVisibility();
        if (selectedFiles.length === 0) {
            resetApp();
        } else {
            refreshPreviews();
        }
    });

    previewItem.appendChild(img);
    previewItem.appendChild(filenameElement);
    previewItem.appendChild(removeBtn);
    if (previewGrid) previewGrid.appendChild(previewItem);
}

/**
 * Atualiza todas as pré-visualizações para garantir que os índices estejam corretos após remoções.
 */
function refreshPreviews() {
    if (previewGrid) previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
        createPreview(file, idx);
    });
}

/**
 * Função para converter TODOS os arquivos selecionados para PDF e baixá-los em um ZIP.
 * @param {Array<File>} files - Array de arquivos a serem convertidos.
 */
async function convertAllToPDF(files) {
    const formData = new FormData();
    files.forEach((file, index) => {
        formData.append(`file${index}`, file);
    });

    showSpinner();
    hideError();

    try {
        const response = await fetch('/convert_all', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errorMsg = 'Erro ao converter os arquivos.';
            try {
                const errorJson = await response.json();
                if (errorJson.error) errorMsg = errorJson.error;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'converted_files.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        closeMenu(convertMenu);
        selectedFiles = []; // Limpa a lista após o download
        if (previewGrid) previewGrid.innerHTML = '';
        checkPreviewVisibility();

    } catch (error) {
        console.error(error);
        showError(error.message);
    } finally {
        hideSpinner();
    }
}

// --- Listeners de Eventos do Conversor ---

document.addEventListener('DOMContentLoaded', () => {
    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            if (selectedFiles.length === 0) {
                showError('Nenhum arquivo selecionado. Por favor, selecione ao menos um arquivo.');
            } else {
                openMenu(convertMenu, [compressionMenu, mergeMenu, splitMenu, organizeMenu]); // Passa outros menus para fechar
            }
        });
    }

    if (convertStartBtn) {
        convertStartBtn.addEventListener('click', async () => {
            hideError();
            if (selectedFiles.length === 0) {
                showError('Selecione pelo menos um arquivo antes de converter.');
                return;
            }
            await convertAllToPDF(selectedFiles);
        });
    }
});