from __future__ import annotations

import io
import re
import zipfile

from ..errors import ApiError, bad_request

ALLOWED_EXT = (".txt", ".md", ".pdf", ".docx")
MAX_PAGES, MAX_DOCX_XML = 500, 20 * 1024 * 1024


def extract_pages(filename: str, data: bytes) -> list[tuple[int, str]]:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise ApiError(415, "unsupported_type", f"Supported file types: {', '.join(ALLOWED_EXT)}")
    if ext in (".txt", ".md"):
        text = data.decode("utf-8", "replace")
        return [(i + 1, p) for i, p in enumerate(text.split("\f")) if p.strip()] or [(1, text)]
    if ext == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                info = z.getinfo("word/document.xml")
                if info.file_size > MAX_DOCX_XML:
                    raise bad_request("DOCX content is too large")
                xml = z.read(info).decode("utf-8", "replace")
        except (zipfile.BadZipFile, KeyError):
            raise bad_request("Not a valid .docx file") from None
        xml = re.sub(r"</w:p>", "\n", xml)
        xml = re.sub(r"<w:tab/>|<w:br/>", " ", xml)
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>|(\n)", xml) and [a or b for a, b in re.findall(r"<w:t[^>]*>([^<]*)</w:t>|(\n)", xml)])
        text = (text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'"))
        return [(1, text)]
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ApiError(415, "pdf_support_missing", "PDF support needs the optional 'pypdf' package (pip install pypdf).") from None
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise bad_request("Encrypted PDFs are not supported")
        return [(i + 1, (p.extract_text() or "")) for i, p in enumerate(reader.pages[:MAX_PAGES])]
    except ApiError:
        raise
    except Exception:
        raise bad_request("Could not read this PDF") from None


def chunk_text(text: str, target: int = 900, overlap: int = 120) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    pieces: list[str] = []
    for p in paras:
        while len(p) > target * 1.4:
            cut = p.rfind(". ", 0, target)
            cut = cut + 1 if cut > target * 0.5 else target
            pieces.append(p[:cut].strip())
            p = p[cut:].strip()
        if p:
            pieces.append(p)
    chunks, cur = [], ""
    for p in pieces:
        if cur and len(cur) + len(p) + 2 > target:
            chunks.append(cur)
            cur = (cur[-overlap:] + "\n\n" if overlap else "") + p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur.strip():
        chunks.append(cur)
    return [c.strip() for c in chunks if len(c.strip()) >= 20 or len(chunks) == 1]
