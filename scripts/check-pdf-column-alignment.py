"""Check rendered PDF header/figure edges; run after the desktop ledger E2E.

Requires PyMuPDF. This checks output geometry, independently of jsPDF options.
Usage: python scripts/check-pdf-column-alignment.py [frontend/test-results]
"""
import re
import sys
from pathlib import Path
import fitz

root = Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/test-results")
documents = {
    "credit-statement.pdf": ["Credit", "Payments", "Balance"],
    "supplier-statement-desktop.pdf": ["Bills", "Payments", "Balance"],
    "sales-register.pdf": ["Quantity", "Rate", "Sale", "Received", "Due"],
    "daily-closing.pdf": ["Opening", "In", "Out", "Closing", "Entries", "Amount"],
    "stock-valuation.pdf": ["Stock", "Cost", "Value", "Retail", "Profit"],
    "transaction-receipt.pdf": ["Qty", "Unit price", "Amount"],
}
numeric = re.compile(r"^(?:Rs\.\s*)?-?[\d,]+(?:\.\d+)?(?:\s+(?:kg|bag|ton|sack))?$")
checked = 0
for filename, headings in documents.items():
    document = fitz.open(root / filename)
    found = set()
    for page in document:
        spans = [span for block in page.get_text("dict")["blocks"]
                 for line in block.get("lines", []) for span in line["spans"]]
        for header in spans:
            title = header["text"].strip()
            if title not in headings:
                continue
            edge, baseline = header["bbox"][2], header["bbox"][3]
            matches = [span for span in spans if numeric.fullmatch(span["text"].strip())
                       and baseline < span["bbox"][1] < baseline + 140
                       and abs(span["bbox"][2] - edge) < 0.6]
            if not matches:
                raise AssertionError(f"{filename}: '{title}' has no figure aligned below its right edge on page {page.number + 1}")
            found.add(title)
            checked += 1
    if found != set(headings):
        raise AssertionError(f"{filename}: missing numeric headings {set(headings) - found}")
    print(f"PASS {filename}: {len(document)} page(s), {len(found)} numeric columns")
print(f"Verified {checked} numeric header edges across {len(documents)} PDF types.")
