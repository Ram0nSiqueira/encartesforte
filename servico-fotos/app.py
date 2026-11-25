"""
Serviço de fotos do EncartesForte (Flask).

- Busca produtos no Open Food Facts e tira o fundo da foto (rembg).
- Foto enviada pelo usuário vira a FOTO PRINCIPAL do produto (vem primeiro nas buscas).
- Dados no SQLite dados/encartesforte.db; imagens em dados/imagens-produtos/.

Rodar:  .venv\\Scripts\\python app.py   (ou "npm start" na raiz do projeto)
"""

import hashlib
import io
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
from collections import deque
from datetime import datetime

import numpy as np
import requests
from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, ImageOps
from scipy import ndimage
from rembg import new_session, remove
from werkzeug.exceptions import HTTPException

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_DADOS = os.path.join(RAIZ, "dados")
PASTA_IMAGENS = os.path.join(PASTA_DADOS, "imagens-produtos")
ARQUIVO_BANCO = os.path.join(PASTA_DADOS, "encartesforte.db")
ARQUIVO_CACHE_ANTIGO = os.path.join(PASTA_DADOS, "cache-produtos.json")
os.makedirs(PASTA_IMAGENS, exist_ok=True)

PORTA = int(os.environ.get("PORTA_FOTOS", "5175"))

# O OFF exige um User-Agent identificando o app e um e-mail de contato.
CONTATO = os.environ.get("CONTATO_EMAIL", "ramonelias728@gmail.com")
USER_AGENT = f"EncartesForte/1.0 ({CONTATO})"
TIMEOUT = 10  # segundos

# Passo 12: se a primeira base não encontrar, tenta as outras (mesma API).
BASES = [
    ("Open Food Facts", "https://world.openfoodfacts.org"),
    ("Open Products Facts", "https://world.openproductsfacts.org"),
    ("Open Beauty Facts", "https://world.openbeautyfacts.org"),
]
CAMPOS = "code,product_name,brands,image_front_url"

# Limites do OFF: 10 buscas/min por texto, 100/min por código. Controlamos antes de chamar.
LIMITE_BUSCA = 10
LIMITE_CODIGO = 100

TAMANHO_MAX = 1000

# Modelo "isnet-general-use" (~170 MB, uso comercial permitido; o padrão do rembg não permite).
MODELO_REMBG = os.environ.get("MODELO_REMBG", "isnet-general-use")


# ---------------------------------------------------------------------------
# Erros com mensagem amigável
# ---------------------------------------------------------------------------
class ErroAmigavel(Exception):
    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status = status


# ---------------------------------------------------------------------------
# Controle de limite de requisições ao OFF
# ---------------------------------------------------------------------------
_chamadas = {"busca": deque(), "codigo": deque()}
_trava_limite = threading.Lock()


def registrar_chamada(tipo):
    limite = LIMITE_BUSCA if tipo == "busca" else LIMITE_CODIGO
    agora = time.time()
    with _trava_limite:
        fila = _chamadas[tipo]
        while fila and agora - fila[0] > 60:
            fila.popleft()
        if len(fila) >= limite:
            raise ErroAmigavel("Muitas buscas, aguarde um minuto.", 429)
        fila.append(agora)


# ---------------------------------------------------------------------------
# Banco SQLite
#   cache_off:       termo normalizado ou "codigo:<ean>" -> produto do OFF já processado (passo 4)
#   fotos_principais: termo normalizado ou "codigo:<ean>" -> foto enviada pelo usuário (prioridade)
# ---------------------------------------------------------------------------
_trava_banco = threading.Lock()


def conectar():
    con = sqlite3.connect(ARQUIVO_BANCO)
    con.row_factory = sqlite3.Row
    return con


def criar_banco():
    with conectar() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS cache_off (
                chave TEXT PRIMARY KEY,
                code TEXT, nome TEXT, marca TEXT, arquivo_png TEXT NOT NULL, fonte TEXT,
                criado_em TEXT
            );
            CREATE TABLE IF NOT EXISTS fotos_principais (
                chave TEXT PRIMARY KEY,
                code TEXT, nome TEXT, arquivo_png TEXT NOT NULL,
                sem_fundo INTEGER NOT NULL,
                atualizado_em TEXT
            );
            """
        )
    # Migra o cache em JSON da versão anterior (uma vez).
    if os.path.exists(ARQUIVO_CACHE_ANTIGO):
        try:
            with open(ARQUIVO_CACHE_ANTIGO, encoding="utf-8") as f:
                antigo = json.load(f)
            for chave, r in antigo.items():
                if r.get("fonte") == "Envio manual":
                    continue
                salvar_cache_off([chave], r)
            os.replace(ARQUIVO_CACHE_ANTIGO, ARQUIVO_CACHE_ANTIGO + ".migrado")
            print(f"[fotos] Cache antigo migrado para o banco ({len(antigo)} itens).", flush=True)
        except Exception as e:
            print(f"[fotos] Não foi possível migrar o cache antigo: {e}", flush=True)


def agora():
    return datetime.now().isoformat(timespec="seconds")


def imagem_existe(arquivo):
    return bool(arquivo) and os.path.exists(os.path.join(PASTA_IMAGENS, arquivo))


def salvar_cache_off(chaves, r):
    with _trava_banco, conectar() as con:
        for chave in chaves:
            con.execute(
                "INSERT OR REPLACE INTO cache_off (chave, code, nome, marca, arquivo_png, fonte, criado_em) VALUES (?,?,?,?,?,?,?)",
                (chave, r.get("code", ""), r.get("nome", ""), r.get("marca", ""), r["arquivo_png"], r.get("fonte", ""), agora()),
            )


def ler_cache_off(chave):
    with conectar() as con:
        row = con.execute("SELECT * FROM cache_off WHERE chave = ?", (chave,)).fetchone()
    return dict(row) if row and imagem_existe(row["arquivo_png"]) else None


def salvar_foto_principal(chaves, code, nome, arquivo, sem_fundo):
    with _trava_banco, conectar() as con:
        for chave in chaves:
            con.execute(
                "INSERT OR REPLACE INTO fotos_principais (chave, code, nome, arquivo_png, sem_fundo, atualizado_em) VALUES (?,?,?,?,?,?)",
                (chave, code, nome, arquivo, 1 if sem_fundo else 0, agora()),
            )


def ler_foto_principal(chaves):
    with conectar() as con:
        for chave in chaves:
            row = con.execute("SELECT * FROM fotos_principais WHERE chave = ?", (chave,)).fetchone()
            if row and imagem_existe(row["arquivo_png"]):
                return dict(row)
    return None


def apagar_foto_principal(chaves):
    with _trava_banco, conectar() as con:
        total = 0
        for chave in chaves:
            total += con.execute("DELETE FROM fotos_principais WHERE chave = ?", (chave,)).rowcount
    return total


def total_registros():
    with conectar() as con:
        off = con.execute("SELECT COUNT(*) FROM cache_off").fetchone()[0]
        usuario = con.execute("SELECT COUNT(DISTINCT arquivo_png) FROM fotos_principais").fetchone()[0]
    return off, usuario


# ---------------------------------------------------------------------------
# Chaves de busca
# ---------------------------------------------------------------------------
def normalizar(texto):
    texto = unicodedata.normalize("NFD", texto.strip().lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", "-", texto)


def eh_codigo(texto):
    return re.fullmatch(r"\d{8,14}", texto or "") is not None


def chaves_do_produto(nome="", codigo=""):
    """Chaves pelas quais um produto pode ser encontrado: código de barras e nome."""
    chaves = []
    if eh_codigo(codigo):
        chaves.append(f"codigo:{codigo}")
    if nome and nome.strip():
        chaves.append(normalizar(nome))
    return chaves


# ---------------------------------------------------------------------------
# Respostas
# ---------------------------------------------------------------------------
def resposta(code, nome, marca, arquivo, fonte, *, cache=False, principal=False, sem_fundo=True, aviso=None):
    corpo = {
        "ok": True,
        "code": code or "",
        "nome": nome or "",
        "marca": marca or "",
        "imagem_url": f"/imagens-produtos/{arquivo}",
        "fonte": fonte or "",
        "cache": cache,
        "principal": principal,
        "sem_fundo": sem_fundo,
    }
    if aviso:
        corpo["aviso"] = aviso
    return jsonify(corpo)


def resposta_foto_principal(f):
    return resposta(
        f["code"], f["nome"], "", f["arquivo_png"], "Sua foto",
        cache=True, principal=True, sem_fundo=bool(f["sem_fundo"]),
    )


# ---------------------------------------------------------------------------
# Cliente OFF (passos 1, 3 e 10)
# ---------------------------------------------------------------------------
def get_off(url, params=None, tipo="busca", tentativa=1):
    registrar_chamada(tipo)
    try:
        r = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        # O OFF às vezes responde 503 por alguns segundos: tenta de novo uma única vez.
        if r.status_code == 503 and tentativa == 1:
            time.sleep(2)
            return get_off(url, params, tipo, tentativa=2)
    except requests.Timeout:
        raise ErroAmigavel("O Open Food Facts demorou para responder. Tente novamente em instantes.", 503)
    except requests.RequestException:
        raise ErroAmigavel("Não foi possível acessar o Open Food Facts agora. Verifique a internet.", 503)
    if r.status_code == 429:
        raise ErroAmigavel("Muitas buscas, aguarde um minuto.", 429)
    if r.status_code >= 500:
        raise ErroAmigavel("O Open Food Facts está fora do ar no momento. Tente novamente mais tarde.", 503)
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        raise ErroAmigavel(f"Erro ao consultar o Open Food Facts (HTTP {r.status_code}).", 502)
    try:
        return r.json()
    except ValueError:
        raise ErroAmigavel("Resposta inválida do Open Food Facts.", 502)


def buscar_por_texto(termo):
    """Busca nas bases em sequência; devolve o primeiro produto com foto."""
    for fonte, base in BASES:
        dados = get_off(
            f"{base}/cgi/search.pl",
            {"search_terms": termo, "json": 1, "page_size": 5, "fields": CAMPOS},
            tipo="busca",
        )
        for p in (dados or {}).get("products", []):
            if p.get("image_front_url"):
                return p, fonte
    return None, None


def buscar_por_codigo(codigo):
    for fonte, base in BASES:
        dados = get_off(f"{base}/api/v2/product/{codigo}.json", {"fields": CAMPOS}, tipo="codigo")
        if dados and dados.get("status") == 1:
            produto = dados.get("product") or {}
            if produto.get("image_front_url"):
                produto.setdefault("code", codigo)
                return produto, fonte
    return None, None


# ---------------------------------------------------------------------------
# Imagem: download (passo 5) e remoção de fundo (passo 6)
# ---------------------------------------------------------------------------
print(f"[fotos] Carregando o modelo do rembg '{MODELO_REMBG}' (na primeira vez ele é baixado, ~170 MB)...", flush=True)
SESSAO = new_session(MODELO_REMBG)
print("[fotos] Modelo pronto.", flush=True)


def baixar_imagem(url):
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    except requests.RequestException:
        raise ErroAmigavel("Não foi possível baixar a foto do produto.", 502)
    if r.status_code != 200:
        raise ErroAmigavel(f"Não foi possível baixar a foto do produto (HTTP {r.status_code}).", 502)
    if not r.headers.get("Content-Type", "").startswith("image/"):
        raise ErroAmigavel("O endereço da foto não retornou uma imagem.", 502)
    return r.content


def ajustar(imagem):
    """Recorta bordas transparentes e limita a TAMANHO_MAX px no maior lado."""
    if imagem.mode == "RGBA":
        caixa = imagem.getchannel("A").getbbox()
        if caixa:
            imagem = imagem.crop(caixa)
    imagem.thumbnail((TAMANHO_MAX, TAMANHO_MAX))
    return imagem


def abrir_imagem(conteudo):
    try:
        imagem = Image.open(io.BytesIO(conteudo))
        imagem.load()
        imagem = ImageOps.exif_transpose(imagem)  # fotos de celular "deitadas"
        return imagem.convert("RGBA")
    except Exception:
        raise ErroAmigavel("O arquivo enviado não é uma imagem válida (use PNG, JPG ou WEBP).", 400)


def caminho(arquivo):
    return os.path.join(PASTA_IMAGENS, arquivo)


def variante(arquivo, sufixo):
    """'123.png' + 'branco' -> '123-branco.png'"""
    base, ext = os.path.splitext(arquivo)
    return f"{base}-{sufixo}{ext}"


class RecorteFalhou(Exception):
    pass


def recortar_produto(original):
    """
    Recorta o produto: o rembg acha ONDE ele está (máscara) e o produto sai 100% sólido
    (sem partes translúcidas, buracos ou pontinhos soltos), com contorno suave e cores originais.
    """
    # Fundo transparente da foto original vira branco antes de ir para o modelo.
    rgb = Image.new("RGB", original.size, (255, 255, 255))
    rgb.paste(original, mask=original.getchannel("A"))
    mascara = remove(rgb, session=SESSAO, only_mask=True).convert("L")
    if mascara.size != original.size:
        mascara = mascara.resize(original.size, Image.LANCZOS)

    a = np.asarray(mascara, dtype=np.float32) / 255.0
    solido = a > 0.1  # inclui as partes que o modelo marcou só "um pouco" como produto

    # Fecha falhas na borda (ex.: pacote transparente) e preenche os buracos internos.
    raio = max(2, int(max(solido.shape) * 0.03))
    y, x = np.ogrid[-raio:raio + 1, -raio:raio + 1]
    disco = x * x + y * y <= raio * raio
    margem = raio + 2  # evita "colar" o produto na borda da foto
    solido = np.pad(solido, margem)
    solido = ndimage.binary_closing(solido, structure=disco)[margem:-margem, margem:-margem]
    solido = ndimage.binary_fill_holes(solido)

    # Mantém o produto principal (e partes grandes), descarta pontinhos soltos.
    rotulos, n = ndimage.label(solido)
    if n > 1:
        areas = ndimage.sum(solido, rotulos, index=np.arange(1, n + 1))
        manter = np.concatenate(([False], areas >= areas.max() * 0.05))
        solido = manter[rotulos]

    cobertura = solido.mean()
    if cobertura < 0.03:
        raise RecorteFalhou(f"o produto ocupa só {cobertura:.1%} da foto")

    # Contorno suave: desfoca levemente a borda da máscara sólida.
    alfa = ndimage.gaussian_filter(solido.astype(np.float32), sigma=1.0)
    alfa = np.where(ndimage.binary_erosion(solido, iterations=2), 1.0, alfa)

    produto = original.copy()
    produto.putalpha(Image.fromarray((np.clip(alfa, 0, 1) * 255).astype(np.uint8), "L"))
    return produto


def processar_e_salvar(conteudo, nome_arquivo):
    """
    Salva <nome>.png (sem fundo; se falhar, a original) e <nome>-original.png.
    A de fundo branco é gerada sob demanda. Devolve (sem_fundo, aviso).
    """
    original = abrir_imagem(conteudo)  # valida antes de gastar tempo com o rembg
    ajustar(original.copy()).save(caminho(variante(nome_arquivo, "original")), "PNG", optimize=True)
    try:
        imagem = recortar_produto(original)
        sem_fundo, aviso = True, None
    except RecorteFalhou as e:
        print(f"[fotos] recorte descartado: {e}", flush=True)
        imagem = original
        sem_fundo, aviso = False, "Não foi possível separar o produto do fundo nesta foto; ela foi salva com o fundo original."
    except Exception as e:  # falha do rembg (passo 10)
        print(f"[fotos] rembg falhou: {e}", flush=True)
        imagem = original
        sem_fundo, aviso = False, "Não foi possível remover o fundo; a foto foi salva com o fundo original."
    ajustar(imagem).save(caminho(nome_arquivo), "PNG", optimize=True)
    branco = caminho(variante(nome_arquivo, "branco"))
    if os.path.exists(branco):  # reprocessado: a versão branca antiga fica desatualizada
        os.remove(branco)
    return sem_fundo, aviso


def gerar_fundo_branco(arquivo):
    """Produto sem fundo aplicado sobre um quadrado branco, centralizado, com margem."""
    destino = caminho(variante(arquivo, "branco"))
    if not os.path.exists(destino):
        produto = Image.open(caminho(arquivo)).convert("RGBA")
        lado = max(produto.width, produto.height)
        margem = round(lado * 0.08)
        lado += margem * 2
        fundo = Image.new("RGBA", (lado, lado), (255, 255, 255, 255))
        fundo.alpha_composite(produto, ((lado - produto.width) // 2, (lado - produto.height) // 2))
        fundo.convert("RGB").save(destino, "PNG", optimize=True)
    return os.path.basename(destino)


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024


@app.get("/api/status")
def status():
    off, usuario = total_registros()
    return jsonify({"ok": True, "servico": "fotos", "cache": off, "fotos_principais": usuario})


@app.get("/api/buscar-produto")
def buscar_produto():
    """
    q: nome ou código de barras (8 a 14 dígitos) — passo 2.
    nome (opcional): nome do produto, para achar a foto principal mesmo quando q é um código.
    ignorar_principal=1: pula a foto do usuário e busca no OFF.
    """
    termo = (request.args.get("q") or "").strip()
    nome = (request.args.get("nome") or "").strip()
    ignorar_principal = request.args.get("ignorar_principal") == "1"
    if len(termo) < 2:
        raise ErroAmigavel("Digite o nome ou o código de barras do produto.")

    codigo_busca = termo if eh_codigo(termo) else ""

    # 1) Foto principal enviada pelo usuário (prioridade): procura pelo código e pelo nome.
    if not ignorar_principal:
        chaves = chaves_do_produto(nome, codigo_busca)
        if not codigo_busca:
            chaves.append(normalizar(termo))
        principal = ler_foto_principal(chaves)
        if principal:
            return resposta_foto_principal(principal)

    # 2) Cache do OFF (passo 4), antes de qualquer chamada externa.
    chave = f"codigo:{termo}" if codigo_busca else normalizar(termo)
    r = ler_cache_off(chave)
    if r:
        return resposta(r["code"], r["nome"], r["marca"], r["arquivo_png"], r["fonte"], cache=True)

    # 3) Open Food Facts (e bases irmãs).
    produto, fonte = buscar_por_codigo(termo) if codigo_busca else buscar_por_texto(termo)
    if not produto:
        raise ErroAmigavel("Produto não encontrado.", 404)

    codigo = re.sub(r"\D", "", str(produto.get("code") or "")) or hashlib.sha1(termo.encode()).hexdigest()[:16]

    # O mesmo produto pode já estar no cache por outro termo.
    r = ler_cache_off(f"codigo:{codigo}")
    if r:
        salvar_cache_off([chave], r)
        return resposta(r["code"], r["nome"], r["marca"], r["arquivo_png"], r["fonte"], cache=True)

    arquivo = f"{codigo}.png"
    sem_fundo, aviso = processar_e_salvar(baixar_imagem(produto["image_front_url"]), arquivo)
    registro = {
        "code": codigo,
        "nome": produto.get("product_name") or "",
        "marca": produto.get("brands") or "",
        "arquivo_png": arquivo,
        "fonte": fonte,
    }
    salvar_cache_off([chave, f"codigo:{codigo}"], registro)
    return resposta(codigo, registro["nome"], registro["marca"], arquivo, fonte, sem_fundo=sem_fundo, aviso=aviso)


@app.post("/api/foto-principal")
def enviar_foto_principal():
    """
    Upload do usuário (campos: imagem, nome, codigo opcional). Salva sem fundo e original;
    a foto vira a principal do produto nas próximas buscas.
    """
    arquivo = request.files.get("imagem")
    if not arquivo:
        raise ErroAmigavel("Envie uma imagem (campo 'imagem').")
    conteudo = arquivo.read()
    if not conteudo:
        raise ErroAmigavel("Imagem vazia.")
    nome = (request.form.get("nome") or "").strip()
    codigo = re.sub(r"\D", "", request.form.get("codigo") or "")
    chaves = chaves_do_produto(nome, codigo)
    if not chaves:
        raise ErroAmigavel("Informe o nome (ou o código de barras) do produto antes de enviar a foto.")

    nome_arquivo = f"usuario-{hashlib.sha1(conteudo).hexdigest()[:16]}.png"
    sem_fundo, aviso = processar_e_salvar(conteudo, nome_arquivo)
    salvar_foto_principal(chaves, codigo, nome, nome_arquivo, sem_fundo)
    return resposta(codigo, nome, "", nome_arquivo, "Sua foto", principal=True, sem_fundo=sem_fundo, aviso=aviso)


@app.delete("/api/foto-principal")
def esquecer_foto_principal():
    """Deixa de usar a foto principal do produto (o arquivo continua guardado)."""
    nome = (request.args.get("nome") or "").strip()
    codigo = re.sub(r"\D", "", request.args.get("codigo") or "")
    removidas = apagar_foto_principal(chaves_do_produto(nome, codigo))
    return jsonify({"ok": True, "removidas": removidas})


@app.post("/api/remover-fundo")
def remover_fundo_compat():
    """Compatibilidade com a versão anterior: mesmo que /api/foto-principal."""
    return enviar_foto_principal()


@app.get("/imagens-produtos/<path:arquivo>")
def imagens(arquivo):
    """
    ?fundo=transparente (padrão) -> sem fundo
    ?fundo=branco                -> produto sobre fundo branco (gerado na primeira vez)
    ?fundo=original              -> foto como veio (se não houver, devolve a sem fundo)
    """
    fundo = request.args.get("fundo", "transparente")
    if os.path.basename(arquivo) != arquivo or not os.path.exists(caminho(arquivo)):
        raise ErroAmigavel("Imagem não encontrada.", 404)
    if fundo == "branco":
        arquivo = gerar_fundo_branco(arquivo)
    elif fundo == "original" and os.path.exists(caminho(variante(arquivo, "original"))):
        arquivo = variante(arquivo, "original")
    return send_from_directory(PASTA_IMAGENS, arquivo, max_age=0)


@app.errorhandler(ErroAmigavel)
def erro_amigavel(e):
    return jsonify({"ok": False, "erro": e.mensagem}), e.status


@app.errorhandler(413)
def muito_grande(_e):
    return jsonify({"ok": False, "erro": "Imagem grande demais (máximo 15 MB)."}), 413


@app.errorhandler(Exception)
def erro_geral(e):
    if isinstance(e, HTTPException):  # 404, 405... mantêm o status original
        return jsonify({"ok": False, "erro": e.description}), e.code
    print(f"[fotos] Erro inesperado: {e!r}", flush=True)
    return jsonify({"ok": False, "erro": "Erro inesperado no serviço de fotos."}), 500


# 2 = produto sólido (máscara preenchida) a partir da foto original
# 3 = + fechamento das falhas de borda (pacotes transparentes)
VERSAO_RECORTE = 3


def reprocessar_imagens_antigas():
    """Refaz, uma única vez, as imagens salvas com o método de recorte anterior."""
    with conectar() as con:
        con.execute("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)")
        row = con.execute("SELECT valor FROM config WHERE chave = 'versao_recorte'").fetchone()
        if row and int(row[0]) >= VERSAO_RECORTE:
            return
        off = {r[0] for r in con.execute("SELECT arquivo_png FROM cache_off")}
        usuario = {r[0] for r in con.execute("SELECT arquivo_png FROM fotos_principais")}

    refeitos, descartados = 0, 0
    for arquivo in off | usuario:
        original = caminho(variante(arquivo, "original"))
        if os.path.exists(original):
            with open(original, "rb") as f:
                processar_e_salvar(f.read(), arquivo)
            refeitos += 1
        elif arquivo in off and arquivo not in usuario:
            # Sem a original: sai do cache (é baixada de novo na próxima busca).
            with _trava_banco, conectar() as con:
                con.execute("DELETE FROM cache_off WHERE arquivo_png = ?", (arquivo,))
            for sufixo in ("", "-branco"):
                alvo = caminho(variante(arquivo, sufixo) if sufixo else arquivo)
                if os.path.exists(alvo):
                    os.remove(alvo)
            descartados += 1

    with conectar() as con:
        con.execute("INSERT OR REPLACE INTO config (chave, valor) VALUES ('versao_recorte', ?)", (str(VERSAO_RECORTE),))
    print(f"[fotos] Recorte atualizado: {refeitos} imagens refeitas, {descartados} serão baixadas de novo na próxima busca.", flush=True)


criar_banco()
reprocessar_imagens_antigas()

if __name__ == "__main__":
    off, usuario = total_registros()
    print(f"[fotos] Banco: {off} produtos do OFF em cache, {usuario} fotos principais de usuário.", flush=True)
    print(f"[fotos] Serviço de fotos em http://127.0.0.1:{PORTA}", flush=True)
    app.run(host="127.0.0.1", port=PORTA, threaded=True)
