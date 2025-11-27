const convertBtn = document.getElementById('convert-btn');
const startConvertBtn = document.getElementById('start-convert');
const previewGrid = document.getElementById('preview-grid');
const conversionModeLabel = document.getElementById('conversion-mode-label');

let selectedConversion = null;   // usado no modo unitário
let conversionTaskId = null;     // task_id para 1 arquivo

// modo de conversão e dados em lote
let conversionMode = 'single';   // 'single' | 'batch'
let batchId = null;
let batchItems = [];


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
        'csv': `${staticAssetsPath}/file-csv-fill.png`,
        'pptx': `${staticAssetsPath}/pptx.png`
    };
    return iconMap[ext] || `${staticAssetsPath}/file.png`;
}

async function uploadForConversion(file) {
    conversionMode = 'single';
    conversionModeLabel.textContent = '1 arquivo selecionado (conversão unitária)';

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/upload-conversion', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (!response.ok) {
        showError(data.error || 'Erro ao enviar o arquivo para conversão.');
        return;
    }

    if (!data.options || data.options.length === 0) {
        showError('Tipo de arquivo não suportado para conversão.');
        return;
    }

    conversionTaskId = data.task_id;
    renderConversionOptions(data.options);

    if (data.is_scanned) {
        showFloatingAlert('Aviso: seu PDF é escaneado, a conversão pode demorar mais do que o normal.');
    }
}

async function uploadForConversionBatch(files) {
    conversionMode = 'batch';
    conversionModeLabel.textContent = `${files.length} arquivos selecionados (conversão em lote)`;

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const response = await fetch('/upload-conversion-batch', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (!response.ok) {
        showError(data.error || 'Erro ao enviar os arquivos para conversão em lote.');
        return;
    }

    batchId = data.batch_id;
    batchItems = data.items || [];

    const supportedItems = batchItems.filter(it => it.supported);

    if (supportedItems.length === 0) {
        showError('Nenhum dos arquivos selecionados é suportado para conversão.');
        return;
    }

    renderBatchConversionOptions(batchItems);

    // Algum PDF escaneado?
    if (supportedItems.some(it => it.is_scanned)) {
        showFloatingAlert('Aviso: alguns PDFs são escaneados, a conversão pode demorar mais do que o normal.');
    }
}

function showFloatingAlert(message, duration = 5000) {
    const alertDiv = document.getElementById('floating-alert');
    if (!alertDiv) return;

    alertDiv.textContent = message;
    alertDiv.style.display = 'block';

    // Se já tiver animação, reinicia (pra segurar o tempo certinho)
    alertDiv.style.animation = 'none';
    // Força reflow pra resetar a animação
    void alertDiv.offsetWidth;
    alertDiv.style.animation = null;

    // Depois do tempo, some o popup
    setTimeout(() => {
        alertDiv.style.display = 'none';
    }, duration);
}


function renderConversionOptions(options) {
    const container = document.getElementById('convert-options-list');
    container.innerHTML = '';
    container.classList.remove('batch-file-list'); // garante que não fique no layout de lote

    const iconMap = {
        'pdf': `${staticAssetsPath}/pdf.png`,
        'docx': `${staticAssetsPath}/word.png`,
        'xlsx': `${staticAssetsPath}/excel.png`,
        'jpeg': `${staticAssetsPath}/image.png`,
        'jpg': `${staticAssetsPath}/image.png`,
        'png': `${staticAssetsPath}/image.png`,
        'txt': `${staticAssetsPath}/txt.png`,
        'csv': `${staticAssetsPath}/csv.png`,
        'pptx': `${staticAssetsPath}/pptx.png`
    };

    selectedConversion = null;

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

function renderBatchConversionOptions(items) {
    const container = document.getElementById('convert-options-list');
    container.innerHTML = '';
    container.classList.add('batch-file-list'); // aplica layout de lista vertical

    items.forEach(item => {
        const row = document.createElement('div');
        row.classList.add('file-convert-row');
        if (!item.supported) {
            row.classList.add('unsupported');
        }

        const info = document.createElement('div');
        info.classList.add('file-convert-info');

        const icon = document.createElement('img');
        icon.classList.add('file-convert-icon');
        icon.src = getIconForFile(item.filename);
        icon.alt = 'Ícone do arquivo';

        const textBox = document.createElement('div');

        const nameEl = document.createElement('div');
        nameEl.classList.add('file-convert-name');
        nameEl.textContent = item.filename;

        const extEl = document.createElement('div');
        extEl.classList.add('file-convert-ext');
        extEl.textContent = item.extension.toUpperCase();

        textBox.appendChild(nameEl);
        textBox.appendChild(extEl);

        info.appendChild(icon);
        info.appendChild(textBox);

        row.appendChild(info);

        if (item.supported) {
            const targetBox = document.createElement('div');
            targetBox.classList.add('file-convert-target');

            const label = document.createElement('label');
            label.textContent = 'Converter para:';

            const select = document.createElement('select');
            select.classList.add('file-convert-select');
            select.dataset.taskId = item.task_id;
            select.dataset.filename = item.filename;

            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Selecione...';
            select.appendChild(defaultOpt);

            (item.options || []).forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt.toUpperCase();
                select.appendChild(o);
            });

            targetBox.appendChild(label);
            targetBox.appendChild(select);
            row.appendChild(targetBox);
        } else {
            const unsupportedLabel = document.createElement('div');
            unsupportedLabel.classList.add('file-convert-unsupported-label');
            unsupportedLabel.textContent = 'Formato não suportado';
            row.appendChild(unsupportedLabel);
        }

        container.appendChild(row);
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
    if (conversionMode === 'batch') {
        await startBatchConversion();
    } else {
        await startSingleConversion();
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

    if (selectedFiles.length === 1) {
        await uploadForConversion(selectedFiles[0]);
    } else {
        await uploadForConversionBatch(selectedFiles);
    }
});

function autoOpenExtractMenu() {
    openMenu(extractMenu);
    if (mainButtons) mainButtons.style.display = 'none';
    if (extractButtons) extractButtons.style.display = 'flex';

    previewContainer.innerHTML = '';
    generateExtractPreviews();
    previewTitle.textContent = 'Selecione as páginas que deseja extrair:';
}


async function startSingleConversion() {
    if (!selectedConversion) {
        showError('Selecione um formato de saída.', errorMessage2);
        return;
    }

    startConvertBtn.disabled = true;
    showSpinner();
    convertMenu.classList.add('blurred');
    errorMessage2.style.display = 'none';

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

            resetApp();
        } else {
            const err = await res.json();
            showError(err.error || 'Erro na conversão.', errorMessage2);
        }
    } catch (error) {
        showError('Erro inesperado: ' + error.message, errorMessage2);
    } finally {
        convertMenu.classList.remove('blurred');
        hideSpinner();
        startConvertBtn.disabled = false;
    }
}

async function startBatchConversion() {
    if (!batchId || !batchItems.length) {
        showError('Nenhum lote de conversão foi preparado.', errorMessage2);
        return;
    }

    // Monta o array de targets a partir dos selects
    const selects = document.querySelectorAll('.file-convert-select');
    const targets = [];

    selects.forEach(sel => {
        const fmt = sel.value;
        const taskId = sel.dataset.taskId;
        if (fmt && taskId) {
            targets.push({
                task_id: taskId,
                target_format: fmt
            });
        }
    });

    if (targets.length === 0) {
        showError('Selecione ao menos um formato de saída para os arquivos.', errorMessage2);
        return;
    }

    // Se quiser obrigar TODOS os suportados terem formato selecionado:
    const supportedCount = batchItems.filter(it => it.supported).length;
    if (targets.length < supportedCount) {
        showError('Selecione o formato de saída para todos os arquivos suportados.', errorMessage2);
        return;
    }

    startConvertBtn.disabled = true;
    showSpinner();
    convertMenu.classList.add('blurred');
    errorMessage2.style.display = 'none';

    try {
        const res = await fetch('/execute-conversion-batch', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                batch_id: batchId,
                targets: targets
            })
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `conversao_lote.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            resetApp();
        } else {
            const err = await res.json();
            showError(err.error || 'Erro na conversão em lote.', errorMessage2);
        }
    } catch (error) {
        showError('Erro inesperado na conversão em lote: ' + error.message, errorMessage2);
    } finally {
        convertMenu.classList.remove('blurred');
        hideSpinner();
        startConvertBtn.disabled = false;
    }
}
