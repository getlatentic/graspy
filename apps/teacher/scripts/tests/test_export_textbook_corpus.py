import base64
import tempfile
import unittest
from pathlib import Path

from scripts.export_textbook_corpus import load_figures


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class ExportTextbookCorpusTests(unittest.TestCase):
    def test_admits_only_available_source_owned_png_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            figure_directory = Path(temporary_directory)
            (figure_directory / "fraction-model.png").write_bytes(PNG_1X1)
            record = {
                "record_id": "record-1",
                "chapter_title": "Fractions",
                "content_text": "Look at the fraction diagram below.",
                "raw_html": '<p>Look at the fraction diagram below.</p><img src="https://electricbookworks.github.io/siyavula-open-textbooks-images/items/images/web/fraction-model.png">',
                "asset_refs": [
                    {
                        "asset_type": "image",
                        "ordinal": 1,
                        "src": "https://electricbookworks.github.io/siyavula-open-textbooks-images/items/images/web/fraction-model.png",
                    },
                    {
                        "asset_type": "image",
                        "ordinal": 2,
                        "src": "https://third-party.invalid/photo.png",
                    },
                ],
            }

            figures, source_paths = load_figures([record], figure_directory)

            self.assertEqual(len(figures), 1)
            self.assertEqual(figures[0]["file_name"], "fraction-model.png")
            self.assertEqual(figures[0]["caption"], "Look at the fraction diagram below.")
            self.assertEqual((figures[0]["width"], figures[0]["height"]), (1, 1))
            self.assertEqual(source_paths, [figure_directory / "fraction-model.png"])


if __name__ == "__main__":
    unittest.main()
