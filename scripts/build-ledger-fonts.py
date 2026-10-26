"""Build the PDF font from OFL Noto Latin + Arabic sources (fonttools required).

Run from the repository root. The merged fonts are renamed as required by the
OFL reserved-name clause. Originals stay in a temporary directory.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlretrieve
from fontTools.merge import Merger

root = Path(__file__).resolve().parents[1]
target = root / "frontend/public/fonts"
target.mkdir(parents=True, exist_ok=True)
base = "https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf"
with TemporaryDirectory() as scratch:
    for weight in ("Regular", "Bold"):
        sources = []
        for family in ("NotoSans", "NotoSansArabic"):
            source = Path(scratch) / f"{family}-{weight}.ttf"
            urlretrieve(f"{base}/{family}/{source.name}", source)
            sources.append(str(source))
        font = Merger().merge(sources)
        names = {1: "Ledger Sans", 2: weight, 3: f"LedgerSans-{weight}",
                 4: f"Ledger Sans {weight}", 6: f"LedgerSans-{weight}",
                 16: "Ledger Sans", 17: weight}
        for record in font["name"].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
        font.save(target / f"LedgerSans-{weight}.ttf")

