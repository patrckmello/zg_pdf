// =================================================================================
// MERGE (UNIR)
// =================================================================================

// --- CONSTS DO MERGE ---
const mergeBtn = document.getElementById('merge-btn');
const startMergeBtn = document.getElementById('start-merge');
const sortMenu = document.getElementById('sort-menu');
const sortAscBtn = document.getElementById('sort-asc-btn');
const sortDescBtn = document.getElementById('sort-desc-btn');

// --- FUNÇÕES DO MERGE ---
function updateMergeButtonState() {
    if (startMergeBtn) {
        if (previewContainer && previewContainer.children.length > 1) {
            startMergeBtn.disabled = false;
            hideError(errorMessage3); // Assumindo que errorMessage3 é a variável de erro do merge
        } else {
            startMergeBtn.disabled = true;
        }
    }
}
async function rebuildPreviews() {
    if (previewContainer) previewContainer.innerHTML = '';

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        await createPreview(file, i);
    }
    updatePreviewIndices();
    updateMergeButtonState();
    checkPreviewVisibility(); 

    if (sortableInstance) sortableInstance.destroy();
    if (previewContainer) {
        sortableInstance = Sortable.create(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onSort: function(evt) {
                const newOrderFileNames = Array.from(evt.to.children).map(item => item.getAttribute('data-filename'));
                const reorderedSelectedFiles = [];
                newOrderFileNames.forEach(fileName => {
                    const file = selectedFiles.find(f => f.name === fileName);
                    if (file) {
                        reorderedSelectedFiles.push(file);
                    }
                });
                selectedFiles = reorderedSelectedFiles;
                updatePreviewIndices();
            }
        });
    }
}

// --- LISTENERS DO MERGE ---

// Listener principal para iniciar a funcionalidade de união
document.addEventListener('DOMContentLoaded', () => {
    if (mergeBtn) {
        mergeBtn.addEventListener('click', () => {
            hideAllErrors();
            if (selectedFiles.length < 2) {
                showError(' ⚠️ Selecione pelo menos 2 arquivos para unir.', errorMessage3);
            } else {
                openMenu(mergeMenu, [compressionMenu, splitMenu, organizeMenu, convertMenu]); // Funções de menu globais
            }
        });
    }
});

// Listener para o botão que efetivamente executa a união no servidor
if (startMergeBtn) {
    startMergeBtn.addEventListener('click', () => {
        showSpinner();
        hideAllErrors();

        if (selectedFiles.length < 2) {
            hideSpinner();
            showError(' ⚠️ Selecione pelo menos 2 arquivos para realizar a união.', errorMessage3);
            return;
        }

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('files', file, file.name);
        });

        fetch('/merge', {
            method: 'POST',
            body: formData,
        })
        .then(response => {
            if (!response.ok) throw new Error('Erro ao unir PDFs');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedFiles[0].name.split('.')[0]}_unido.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setTimeout(() => resetApp(), 3000);
        })
        .catch(err => {
            hideSpinner();
            console.error(err);
            showError('Erro ao unir PDFs.', errorMessage3);
        })
        .finally(() => {
            closeMenu(mergeMenu);
        });
    });
}

// Listeners para os botões de ordenação (A-Z, Z-A)
if (sortAscBtn) {
    sortAscBtn.addEventListener('click', async () => {
        if (sortMenu) sortMenu.style.display = 'none';
        selectedFiles.sort((a, b) => {
            const nameA = a.name.split('.').shift();
            const nameB = b.name.split('.').shift();
            return isNumericName(nameA) && isNumericName(nameB) ? Number(nameA) - Number(nameB) : nameA.localeCompare(nameB);
        });
        await rebuildPreviews();
    });
}

if (sortDescBtn) {
    sortDescBtn.addEventListener('click', async () => {
        if (sortMenu) sortMenu.style.display = 'none';
        selectedFiles.sort((a, b) => {
            const nameA = a.name.split('.').shift();
            const nameB = b.name.split('.').shift();
            return isNumericName(nameA) && isNumericName(nameB) ? Number(nameB) - Number(nameA) : nameB.localeCompare(nameA);
        });
        await rebuildPreviews();
    });
}

// Listener para o ícone de ordenação
document.addEventListener("DOMContentLoaded", () => {
    const sortIcon = document.getElementById("sort-icon");
    if (sortIcon) {
        sortIcon.addEventListener("click", function() {
            if (sortMenu) sortMenu.style.display = sortMenu.style.display === "none" ? "block" : "none";
        });
    }

    // Fecha o menu de ordenação se clicar fora dele
    document.addEventListener("click", function(event) {
        const sortIcon = document.getElementById("sort-icon");
        if (sortMenu && sortIcon && !sortMenu.contains(event.target) && event.target !== sortIcon) {
            sortMenu.style.display = "none";
        }
    });
});