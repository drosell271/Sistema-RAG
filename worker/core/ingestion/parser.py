import fitz  # PyMuPDF
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PDFParser:
    def __init__(self):
        pass

    def load_pdf(self, file_path: str) -> fitz.Document:
        """Opens a PDF file."""
        try:
            doc = fitz.open(file_path)
            return doc
        except Exception as e:
            logger.error(f"Error opening PDF {file_path}: {e}")
            raise

    def extract_text(self, file_path: str) -> List[Dict]:
        """
        Extracts text from a PDF. 
        Returns a list of dicts with page content and metadata.
        Structure: [{'page_num': 1, 'text': '...', 'filepath': '...'}]
        """
        doc = self.load_pdf(file_path)
        extracted_pages = []

        for page_num, page in enumerate(doc, 1):
            # Extract blocks: (x0, y0, x1, y1, "lines", block_no, block_type)
            # block_type=0 is text, 1 is image
            raw_blocks = page.get_text("blocks")
            
            clean_blocks = []
            full_text = []
            
            for b in raw_blocks:
                if b[6] == 0: # text block
                    text_content = b[4].strip()
                    if text_content:
                        clean_blocks.append({
                            "text": text_content,
                            "bbox": list(b[:4]) # [x0, y0, x1, y1]
                        })
                        full_text.append(text_content)
            
            extracted_pages.append({
                "page_num": page_num,
                "text": "\n\n".join(full_text), # Fallback full text
                "blocks": clean_blocks,
                "filepath": file_path
            })
            
        return extracted_pages
