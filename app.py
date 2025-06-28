import os
import uuid
import time
import subprocess
import threading
import datetime
import zipfile
import math
import io
import json
import logging
from PIL import Image
from fpdf import FPDF
import fitz  # PyMuPDF
import aspose.slides as slides
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, flash, url_for, jsonify, send_file, abort
from flask_mail import Mail, Message
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "chave-padrao-fallback")
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024

# ---------------------------- CONFIGURAÇÕES ----------------------------
app.config['MAIL_SERVER'] = os.getenv("MAIL_SERVER")
app.config['MAIL_PORT'] = int(os.getenv("MAIL_PORT", 587))
app.config['MAIL_USE_TLS'] = os.getenv("MAIL_USE_TLS", "True").lower() in ("true", "1", "yes")
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_DEFAULT_SENDER'] = (os.getenv("MAIL_DEFAULT_SENDER_NAME"), os.getenv("MAIL_DEFAULT_SENDER_EMAIL"))
mail = Mail(app)

UPLOAD_FOLDER = 'uploads'
PROCESSED_FOLDER = 'processed'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)
tasks_lock = threading.Lock()
tasks = {}


logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
                    handlers=[logging.FileHandler("app.log", encoding='utf-8'), logging.StreamHandler()])


# ---------------------------- ROTAS DE TEMPLATES ----------------------------
@app.route('/')
def index():
    return render_template('main.html')

@app.route('/compress', methods=['GET'])
def compress_form():
    return render_template('compress.html')

@app.route('/split', methods=['GET'])
def split_form():
    return render_template('split.html')

@app.route('/convert', methods=['GET'])
def convert_form():
    return render_template('convert.html')

@app.route('/merge', methods=['GET'])
def merge_form():
    return render_template('merge.html')

@app.route('/organize', methods=['GET'])
def organize_form():
    return render_template('organize.html')

# ---------------------------- ENVIO DE FEEDBACK ----------------------------
@app.route('/enviar-feedback', methods=['POST'])
def enviar_feedback():
    nome = request.form.get('name')
    email = request.form.get('email')
    setor = request.form.get('sector')
    mensagem = request.form.get('message')

    corpo_email_html = f"""
    <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #444; background: #f9fafc; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 30px;">
        <h2 style="
            background: linear-gradient(90deg, #0052cc, #007bff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
            font-size: 28px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;">
            📬 Novo feedback recebido
        </h2>

        <p style="font-size: 16px; margin: 10px 0;"><strong>👤 Nome:</strong> {nome}</p>
        <p style="font-size: 16px; margin: 10px 0;"><strong>📧 E-mail:</strong> {email}</p>
        <p style="font-size: 16px; margin: 10px 0;"><strong>🏢 Setor:</strong> {setor}</p>

        <p style="font-size: 16px; margin: 20px 0 10px 0;"><strong>💬 Mensagem:</strong></p>
        <p style="
            background-color: #f5f7fa;
            border-left: 5px solid #007bff;
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 15px;
            white-space: pre-wrap;
            color: #333;">
            {mensagem}
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; text-align: center; font-style: italic;">
            Enviado automaticamente pelo sistema de feedback do site.
        </p>
        </div>
    </body>
    </html>
    """

    try:
        msg = Message(subject="Feedback do Site",
                      recipients=["ti@zavagnagralha.com.br"])  # seu email para receber o feedback
        msg.body = "Você recebeu um novo feedback!"
        msg.html = corpo_email_html
        mail.send(msg)
        flash("Mensagem enviada com sucesso! Obrigado pelo seu feedback.", "success")
    except Exception as e:
        flash(f"Erro ao enviar mensagem: {e}", "error")

    return redirect(url_for('index'))


# ---------------------------- COMPRESSÃO DE PDF ----------------------------
@app.route('/compress', methods=['POST'])
def compress():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400

    compression_type = request.form.get('compression', 'screen')
    filename = secure_filename(file.filename)
    task_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_FOLDER, f"{task_id}_{filename}")
    output_path = os.path.join(PROCESSED_FOLDER, f"comprimidoZG_{filename}")
    file.save(input_path)

    with tasks_lock:
        tasks[task_id] = {
            'percent': 0,
            'status': 'Iniciando compressão...',
            'file': None, # Garante que 'file' exista desde o início
            'error': None # Para capturar erros na thread
        }

    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    estimated_time = min(max(2, int(file_size_mb * 1.5)), 15)


    def compress_task_thread(current_task_id, current_input_path, current_output_path, current_compression_type, current_estimated_time):
        logging.info(f"Thread de compressão iniciada para a tarefa: {current_task_id}")
        try:
            # Simular o progresso e executar a compressão
            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['percent'] = 10
                    tasks[current_task_id]['status'] = "Preparando compressão..."

            logging.info(f"Executando subprocesso para a tarefa: {current_task_id}. Input: {current_input_path}, Output: {current_output_path}") # Log do caminho

            result = subprocess.run([
                'gswin64c', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
                f'-dPDFSETTINGS=/{current_compression_type}', '-dNOPAUSE', '-dBATCH',
                '-dQUIET', f'-sOutputFile={current_output_path}', current_input_path
            ], check=True, capture_output=True, text=True)

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['percent'] = 90
                    tasks[current_task_id]['status'] = "Finalizando compressão..."

            logging.info(f"Ghostscript stdout: {result.stdout}")
            logging.info(f"Ghostscript stderr: {result.stderr}")

            # Verificação da existência do arquivo DEPOIS do Ghostscript
            if not os.path.exists(current_output_path):
                raise FileNotFoundError(f"Arquivo de saída não foi gerado pelo Ghostscript: {current_output_path}")
            logging.info(f"Arquivo de saída gerado com sucesso: {current_output_path}")

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['percent'] = 100
                    tasks[current_task_id]['status'] = 'Concluído!'
                    tasks[current_task_id]['file'] = current_output_path
            logging.info(f"Compressão concluída para a tarefa: {current_task_id}")

        except subprocess.CalledProcessError as e:
            logging.error(f"Erro no Ghostscript para a tarefa {current_task_id}: STDOUT: {e.stdout} STDERR: {e.stderr}")
            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Erro no processamento'
                    tasks[current_task_id]['error'] = f"Erro no Ghostscript. Detalhes: {e.stderr or e.stdout or e.output}"
                    tasks[current_task_id]['percent'] = -1
        except Exception as e:
            logging.error(f"Erro inesperado na thread de compressão para a tarefa {current_task_id}: {e}")
            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Erro interno'
                    tasks[current_task_id]['error'] = str(e)
                    tasks[current_task_id]['percent'] = -1
        finally:
            
            if os.path.exists(current_input_path):
                try:
                    os.remove(current_input_path)
                    logging.info(f"Arquivo de entrada removido: {current_input_path}")
                except OSError as e:
                    logging.warning(f"Não foi possível remover o arquivo de entrada {current_input_path}: {e}")


    # Iniciar a thread, passando explicitamente os argumentos
    thread = threading.Thread(target=compress_task_thread, args=(
        task_id, input_path, output_path, compression_type, estimated_time
    ))
    thread.daemon = True # Torna a thread um daemon para que ela não impeça o Flask de sair
    thread.start()

    return jsonify({'task_id': task_id})

@app.route('/progress/<task_id>')
def progress(task_id):
    # Use o lock ao ler a tarefa para garantir que o estado seja consistente
    with tasks_lock:
        task = tasks.get(task_id)

    if task:
        # Se a tarefa tiver um erro, retorne um status de erro para o frontend
        if task.get('error'):
            return jsonify(task), 500 # Ou 400, dependendo de como você quer sinalizar erros
        return jsonify(task)
    else:
        logging.warning(f"Tarefa {task_id} não encontrada para requisição de progresso.") # Adicione este log para depuração
        return jsonify({'error': 'Tarefa não encontrada'}), 404

@app.route('/download/<task_id>')
def download(task_id):
    logging.info(f"Requisição de download recebida para task_id: {task_id}") # Log quando a requisição chega

    task = tasks.get(task_id)
    if not task:
        logging.warning(f"Download: Tarefa {task_id} não encontrada.")
        return jsonify({'error': 'Tarefa não encontrada'}), 404

    file_path = task.get('file') # Usar .get() para evitar KeyError se a chave 'file' não existir

    if not file_path:
        logging.warning(f"Download: Chave 'file' ausente para tarefa {task_id}.")
        return jsonify({'error': 'Arquivo não disponível'}), 404

    if not os.path.exists(file_path):
        logging.error(f"Download: Arquivo '{file_path}' não encontrado no disco para tarefa {task_id}.")
        return jsonify({'error': 'Arquivo processado não encontrado no servidor.'}), 404

    logging.info(f"Servindo arquivo: {file_path} para download da tarefa: {task_id}")

    def delayed_file_cleanup(path_to_clean, task_id_to_clean):
        time.sleep(5)
        
        logging.info(f"Tentando limpar arquivo para tarefa {task_id_to_clean}: {path_to_clean}")
        if os.path.exists(path_to_clean):
            try:
                os.remove(path_to_clean)
                logging.info(f"Arquivo '{path_to_clean}' (tarefa {task_id_to_clean}) removido com sucesso.")
            except OSError as e:
                logging.warning(f"Não foi possível remover o arquivo '{path_to_clean}' (tarefa {task_id_to_clean}): {e}")
        else:
            logging.info(f"Arquivo '{path_to_clean}' (tarefa {task_id_to_clean}) já foi removido ou não existia.")
        

        with tasks_lock:
            if task_id_to_clean in tasks:
                del tasks[task_id_to_clean]
                logging.info(f"Tarefa {task_id_to_clean} removida do dicionário de tarefas.")


    # Inicie a thread de limpeza, passando o caminho do arquivo e o ID da tarefa
    threading.Thread(target=delayed_file_cleanup, args=(file_path, task_id)).start()

    return send_file(file_path, as_attachment=True)





# ---------------------------- CONVERSÃO DE ARQUIVOS ----------------------------
def convert_office_to_pdf_libreoffice(input_path):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir',
                    os.path.dirname(input_path), input_path],
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return os.path.splitext(input_path)[0] + '.pdf'

def convert_file_to_pdf(file_path, file_ext):
    pdf_stream = io.BytesIO()
    if file_ext in ['.jpg', '.jpeg', '.png', '.gif']:
        image = Image.open(file_path).convert('RGB')
        pdf = FPDF()
        pdf.add_page()
        temp_path = os.path.join(UPLOAD_FOLDER, 'temp_image.jpg')
        image.save(temp_path)
        pdf.image(temp_path, x=10, y=10, w=180)
        pdf_stream.write(pdf.output(dest='S').encode('latin1'))
        os.remove(temp_path)
    elif file_ext in ['.docx', '.xlsx']:
        pdf_path = convert_office_to_pdf_libreoffice(file_path)
        with open(pdf_path, 'rb') as f:
            pdf_stream.write(f.read())
        os.remove(pdf_path)
    elif file_ext == '.pptx':
        pres = slides.Presentation(file_path)
        pres.save(pdf_stream, slides.export.SaveFormat.PDF)
    else:
        raise ValueError(f"Extensão não suportada: {file_ext}")
    pdf_stream.seek(0)
    return pdf_stream

@app.route('/convert_all', methods=['POST'])
def convert_all_files():
    files = request.files
    if not files:
        return jsonify({"error": "Nenhum arquivo recebido"}), 400
    memory_zip = io.BytesIO()
    with zipfile.ZipFile(memory_zip, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        for key in files:
            uploaded = files[key]
            filename = secure_filename(uploaded.filename)
            ext = os.path.splitext(filename)[1].lower()
            path = os.path.join(UPLOAD_FOLDER, filename)
            uploaded.save(path)
            stream = convert_file_to_pdf(path, ext)
            if stream:
                zf.writestr(os.path.splitext(filename)[0] + '.pdf', stream.getvalue())
            os.remove(path)
    memory_zip.seek(0)
    return send_file(memory_zip, mimetype='application/zip', as_attachment=True, download_name='converted_files.zip')


# ---------------------------- UNIR / DIVIDIR / ORGANIZAR PDFs ----------------------------
@app.route('/merge', methods=['POST'])
def merge_pdfs():
    files = request.files.getlist('files')
    merged_pdf = fitz.open()
    for f in files:
        doc = fitz.open(stream=f.read(), filetype='pdf')
        merged_pdf.insert_pdf(doc)
    buffer = io.BytesIO()
    merged_pdf.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='unido.pdf')

# Garanta que estes imports estejam no topo do seu arquivo app.py
import io
import math
import zipfile
import fitz  # PyMuPDF
from flask import request, send_file, jsonify
from datetime import datetime # <--- ESTA É A LINHA DA CORREÇÃO!

# ... (seu código da app Flask e outras rotas) ...

@app.route('/split', methods=['POST'])
def split_pdfs():
    print(f"[{datetime.now()}] REQUISIÇÃO /split recebida.")
    
    if 'pdfs' not in request.files:
        return jsonify({"message": "Nenhum arquivo enviado."}), 400

    f = request.files.getlist('pdfs')[0]
    mode = request.form.get('mode')
    
    # --- MUDANÇA #1: LÓGICA DE REPARO OPCIONAL ---
    # Verifica se o frontend enviou a flag para reparar o PDF
    repair_needed = request.form.get('repair_pdf') == 'true'
    
    try:
        pdf_bytes = f.read()

        if repair_needed:
            print(f"[{datetime.now()}] Reparo solicitado. Iniciando limpeza do PDF em memória...")
            # Abre o PDF original
            original_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            # Cria um buffer em memória para salvar a versão reparada
            repaired_buffer = io.BytesIO()
            # Salva no buffer com a opção 'clean=True', que repara a estrutura do PDF
            original_doc.save(repaired_buffer, garbage=4, deflate=True, clean=True)
            original_doc.close()
            # O 'pdf_bytes' agora será o do PDF reparado para o resto da função
            pdf_bytes = repaired_buffer.getvalue()
            print(f"[{datetime.now()}] PDF reparado com sucesso.")

        # O resto da função continua igual, mas usando 'pdf_bytes' (que pode ter sido reparado)
        pdf_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        print(f"[{datetime.now()}] PDF aberto com sucesso. {pdf_doc.page_count} páginas.")
    except Exception as e:
        print(f"[{datetime.now()}] Erro ao abrir ou reparar PDF: {e}")
        return jsonify({"message": f"Arquivo PDF inválido ou corrompido demais para reparar: {e}"}), 400
    # ----------------------------------------------------
        
    filename = f.filename.rsplit('.', 1)[0]
    zip_buffer = io.BytesIO()

    # O resto da sua função continua exatamente como estava antes
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        if mode == 'parts':
            # ... (código do modo 'parts' sem alterações) ...
            try:
                parts = int(request.form.get('parts'))
                if parts <= 0: return jsonify({"message": "O número de partes deve ser maior que 0."}), 400
                if parts > pdf_doc.page_count: return jsonify({"message": f"O número de partes ({parts}) não pode ser maior que o número de páginas ({pdf_doc.page_count})."}), 400
            except (ValueError, TypeError): return jsonify({"message": "Número de partes inválido."}), 400

            pages_per_part = math.ceil(pdf_doc.page_count / parts)
            for i in range(parts):
                start_page = i * pages_per_part
                end_page = min(start_page + pages_per_part - 1, pdf_doc.page_count - 1)
                if start_page > end_page: continue
                new_pdf = fitz.open()
                new_pdf.insert_pdf(pdf_doc, from_page=start_page, to_page=end_page)
                output_buffer = io.BytesIO()
                new_pdf.save(output_buffer, garbage=4, deflate=True) 
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{i+1}_de_{parts}.pdf", output_buffer.read())
                new_pdf.close()

        elif mode == 'size':
            # ... (código do modo 'size' com busca binária sem alterações) ...
            try:
                max_size_mb = float(request.form.get('max_size_mb'))
                if max_size_mb <= 0: return jsonify({"message": "O tamanho máximo deve ser maior que 0 MB."}), 400
            except (ValueError, TypeError): return jsonify({"message": "Tamanho máximo inválido."}), 400

            max_size_bytes = max_size_mb * 1024 * 1024
            part_number = 1
            chunk_start_page = 0
            
            print(f"[{datetime.now()}] Iniciando divisão por tamanho com BUSCA BINÁRIA. Limite: {max_size_mb}MB.")

            while chunk_start_page < pdf_doc.page_count:
                print(f"[{datetime.now()}] ===== Processando Bloco #{part_number} (começando da pág. {chunk_start_page + 1}) =====")
                
                single_page_doc = fitz.open()
                single_page_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=chunk_start_page)
                single_page_buffer = io.BytesIO()
                single_page_doc.save(single_page_buffer)
                if single_page_buffer.tell() > max_size_bytes:
                     print(f"[{datetime.now()}] ERRO: Página única maior que o limite.")
                     return jsonify({"message": f"A página {chunk_start_page + 1} sozinha ({single_page_buffer.tell() / (1024*1024):.2f}MB) já é maior que o limite de {max_size_mb} MB."}), 400
                
                low = chunk_start_page
                high = pdf_doc.page_count - 1
                best_end_page = chunk_start_page

                while low <= high:
                    mid = (low + high) // 2
                    test_doc = fitz.open()
                    test_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=mid)
                    test_buffer = io.BytesIO()
                    test_doc.save(test_buffer)
                    test_doc.close()
                    
                    if test_buffer.tell() <= max_size_bytes:
                        best_end_page = mid
                        low = mid + 1
                    else:
                        high = mid - 1
                
                chunk_end_page = best_end_page
                print(f"[{datetime.now()}] Bloco #{part_number} definido via busca: páginas {chunk_start_page + 1} a {chunk_end_page + 1}. Criando PDF final...")

                final_chunk_doc = fitz.open()
                final_chunk_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=chunk_end_page)
                output_buffer = io.BytesIO()
                final_chunk_doc.save(output_buffer, garbage=4, deflate=True)
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{part_number}.pdf", output_buffer.read())
                
                print(f"[{datetime.now()}] Bloco #{part_number} salvo no ZIP. Total de {final_chunk_doc.page_count} páginas.")
                
                final_chunk_doc.close()
                part_number += 1
                chunk_start_page = chunk_end_page + 1
                
    pdf_doc.close()
    zip_buffer.seek(0)
    
    print(f"[{datetime.now()}] Processo finalizado. Enviando ZIP para o cliente.")
    return send_file(zip_buffer, as_attachment=True, download_name=f'{filename}_dividido.zip', mimetype='application/zip')


@app.route('/organize', methods=['POST'])
def organize_pdf():
    file = request.files.get('pdf')
    new_order = json.loads(request.form.get('order'))
    pdf_doc = fitz.open(stream=file.read(), filetype='pdf')
    new_doc = fitz.open()
    for item in new_order:
        page = pdf_doc[item['page'] - 1]
        page.set_rotation(item.get('rotation', 0))
        new_doc.insert_pdf(pdf_doc, from_page=item['page'] - 1, to_page=item['page'] - 1)
    buffer = io.BytesIO()
    new_doc.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='organized.pdf')


# ---------------------------- FINAL ----------------------------
@app.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
