from typing import List, Dict
import re

class Chunker:
    def __init__(self, chunk_size: int = 1000, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap
        # Separators in priority order: Paragraph -> Line -> Sentence -> Word -> Char
        self.separators = ["\n\n", "\n", ". ", "? ", "! ", " ", ""]

    def split_text(self, text: str) -> List[str]:
        """
        Splits text into chunks using recursive splitting strategy.
        """
        if not text:
            return []
            
        return self._split_text_recursive(text, self.separators)

    def _split_text_recursive(self, text: str, separators: List[str]) -> List[str]:
        final_chunks = []
        
        # Determine effective separator
        separator = separators[-1]
        new_separators = []
        
        for i, sep in enumerate(separators):
            if sep == "":
                separator = ""
                break
            if sep in text:
                separator = sep
                new_separators = separators[i + 1:]
                break
                
        # Split
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text) # Char split

        # Merge splits into chunks
        good_splits = []
        _separator = separator if separator else ""
        
        for s in splits:
             if s.strip():
                 good_splits.append(s if not separator else s + _separator) # Append separator back roughly

        # Now accumulate
        current_chunk = []
        current_length = 0
        
        for split in good_splits:
            split_len = len(split)
            
            if current_length + split_len > self.chunk_size:
                if current_chunk:
                    # Join and add to final
                    # If we used separator, it is at end of split except maybe last one.
                    # Simplified joining:
                    doc = "".join(current_chunk).strip()
                    if doc:
                        final_chunks.append(doc)
                    
                    # Overlap logic
                    # Keep trailing splits that fit in overlap
                    if self.overlap > 0:
                        overlap_buf = []
                        overlap_len = 0
                        for s in reversed(current_chunk):
                            if overlap_len + len(s) > self.overlap:
                                break
                            overlap_buf.insert(0, s)
                            overlap_len += len(s)
                        current_chunk = overlap_buf
                        current_length = overlap_len
                    else:
                        current_chunk = []
                        current_length = 0
            
            current_chunk.append(split)
            current_length += split_len
            
        # Add remainder
        if current_chunk:
            doc = "".join(current_chunk).strip()
            if doc:
                final_chunks.append(doc)
                
        # Recursion check? 
        # Actually standard recursive splitter recursively splits distinct chunks if they are still too big.
        # Here I implemented iterative accumulation. 
        # If a single split is larger than chunk_size, we should recurse on it with next separator.
        
        # Let's verify if any chunk is too big
        post_processed_chunks = []
        for chunk in final_chunks:
            if len(chunk) > self.chunk_size and new_separators:
                # Recurse
                sub_chunks = self._split_text_recursive(chunk, new_separators)
                post_processed_chunks.extend(sub_chunks)
            else:
                post_processed_chunks.append(chunk)
                
        return post_processed_chunks

    def chunk_document(self, pages: List[Dict]) -> List[Dict]:
        """
        Takes parsed pages with blocks and returns chunks with metadata.
        """
        all_chunks = []
        
        for page in pages:
            # Reconstruct full page text first
            blocks = page.get('blocks', [])
            if not blocks:
                # Fallback if no blocks (raw text mode)
                full_page_text = page.get('text', "")
            else:
                full_page_text = " ".join([b['text'] for b in blocks])
            
            if not full_page_text.strip():
                continue
            
            # Use new split logic
            text_chunks = self.split_text(full_page_text)
            
            for i, text_chunk in enumerate(text_chunks):
                all_chunks.append({
                    "chunk_id": f"{page.get('filepath','doc')}_p{page.get('page_num',0)}_{i}",
                    "text": text_chunk,
                    "page_num": page.get('page_num', 1),
                    "filepath": page.get('filepath', 'unknown'),
                    "metadata": {"chunk_index": i}
                })
                
        return all_chunks
