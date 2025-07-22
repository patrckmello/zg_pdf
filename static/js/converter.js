const convertBtn = document.getElementById('convert-btn');
const startConvertBtn = document.getElementById('start-convert');
const previewGrid = document.getElementById('preview-grid');

let selectedConversion = null;
let conversionTaskId = null;

/**
 * Retorna o caminho do ícone baseado na extensão do arquivo.
 * @param {string} filename - Nome do arquivo.
 * @returns {string} - Caminho da imagem do ícone.
 */
function getIconForFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': `${staticAssetsPath}/file-pdf-fill.png`,
        'docx': `${staticAssetsPath}/file-doc-fill.png`,
        'xlsx': `${staticAssetsPath}/file-xls-fill.png`,
        'jpeg': `${staticAssetsPath}/image-fill.png`,
        'jpg': `${staticAssetsPath}/image-fill.png`,
        'png': `${staticAssetsPath}/image-fill.png`,
        'txt': `${staticAssetsPath}/file-txt-fill.png`,
        'csv': `${staticAssetsPath}/file-csv-fill.png`
    };
    return iconMap[ext] || `${staticAssetsPath}/file.png`;
}

async function uploadForConversion(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/upload-conversion', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (data.options.length === 0) {
        showError('Tipo de arquivo não suportado para conversão.');
        return;
    }

    conversionTaskId = data.task_id;
    renderConversionOptions(data.options);
}

function renderConversionOptions(options) {
    const container = document.getElementById('convert-options-list');
    container.innerHTML = '';

    const iconMap = {
        'pdf': `${staticAssetsPath}/pdf.png`,
        'docx': `${staticAssetsPath}/word.png`,
        'xlsx': `${staticAssetsPath}/excel.png`,
        'jpeg': `${staticAssetsPath}/image.png`,
        'jpg': `${staticAssetsPath}/image.png`,
        'png': `${staticAssetsPath}/image.png`,
        'txt': `${staticAssetsPath}/txt.png`,
        'csv': `${staticAssetsPath}/csv.png`
    };

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.classList.add('convert-option-btn');
        btn.innerHTML = `
            <img src="${iconMap[opt] || staticAssetsPath + '/file.png'}" alt="${opt}">
            <span>${opt.toUpperCase()}</span>
        `;

        btn.addEventListener('click', () => {
            document.querySelectorAll('.convert-option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedConversion = opt;
        });

        container.appendChild(btn);
    });
}

const loadingSpinner = document.getElementById('loading-spinner');

function showSpinner() {
    loadingSpinner.classList.remove('hidden');
    convertMenu.classList.add('blurred');
}

function hideSpinner() {
    loadingSpinner.classList.add('hidden');
    convertMenu.classList.remove('blurred');
}

startConvertBtn.addEventListener('click', async () => {
    if (!selectedConversion) {
        showError('Selecione um formato de saída.', errorMessage2);
        return;
    }

    // Bloqueia botão, mostra spinner e aplica blur no menu
    startConvertBtn.disabled = true;
    showSpinner();
    convertMenu.classList.add('blurred');
    errorMessage2.style.display = 'none'; // esconde erro antigo

    try {
        const res = await fetch('/execute-conversion', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                task_id: conversionTaskId,
                target_format: selectedConversion
            })
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `convertido.${selectedConversion}`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            resetApp(); // Reseta o app após o download
        } else {
            const err = await res.json();
            showError(err.error || 'Erro na conversão.', errorMessage2);
        }
    } catch (error) {
        showError('Erro inesperado: ' + error.message, errorMessage2);
    } finally {
        // Remove blur, esconde spinner e libera botão
        convertMenu.classList.remove('blurred');
        hideSpinner();
        startConvertBtn.disabled = false;
    }
});

/**
 * Renderiza as prévias dos arquivos selecionados.
 */
async function renderModulePreviews() {
    refreshPreviews();
}

/**
 * Cria uma prévia de um arquivo com ícone dinâmico.
 * @param {File} file 
 * @param {number} index 
 */
async function createPreview(file, index) {
    const previewItem = document.createElement('div');
    previewItem.classList.add('preview-item');
    previewItem.style.position = 'relative';

    const img = document.createElement('img');
    img.src = getIconForFile(file.name);
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
 * Atualiza as prévias para manter índices corretos.
 */
function refreshPreviews() {
    if (previewGrid) previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
        createPreview(file, idx);
    });
}

// --- Listener do botão de conversão ---
convertBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        showError('Nenhum arquivo selecionado. Por favor, selecione ao menos um arquivo.');
        return;
    }

    hideError();
    openMenu(convertMenu);

    await uploadForConversion(selectedFiles[0]);
});

function autoOpenExtractMenu() {
    openMenu(extractMenu);
    if (mainButtons) mainButtons.style.display = 'none';
    if (extractButtons) extractButtons.style.display = 'flex';

    previewContainer.innerHTML = '';
    generateExtractPreviews();
    previewTitle.textContent = 'Selecione as páginas que deseja extrair:';
}
