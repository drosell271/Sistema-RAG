import re

def clean_email_text(text: str) -> str:
    """
    Cleans email text by removing reply chains and signatures.
    Returns only the latest message content.
    """
    if not text:
        return ""

    # Common separators for replies
    patterns = [
        # Original Message separators
        r'-----Original Message-----',
        r'----- Original Message -----',
        r'________________________________',
        
        # On [Date], [Name] wrote:
        r'On\s+.*,\s+.*wrote:',
        r'El\s+.*,\s+.*escribió:',
        
        # From: [Name] [mailto:...] 
        r'From:\s+.*Sent:',
        r'De:\s+.*Enviado el:',
        r'De:\s+.*Fecha:',
        
        # Simple headers often used in forwards/replies
        r'^From:\s+',
        r'^De:\s+',
        r'^Subject:\s+',
        r'^Asunto:\s+',
    ]
    
    lines = text.splitlines()
    cleaned_lines = []
    
    for line in lines:
        is_separator = False
        for pattern in patterns:
            # Check if line matches a separator pattern
            if re.search(pattern, line, re.IGNORECASE):
                is_separator = True
                break
        
        if is_separator:
            # If we hit a separator, we assume everything after is old history
            break
            
        cleaned_lines.append(line)
        
    # Rejoin
    result = "\n".join(cleaned_lines).strip()
    return result
