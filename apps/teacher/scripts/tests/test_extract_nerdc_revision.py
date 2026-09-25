import unittest

from scripts.extract_nerdc_revision import SOURCE_LINK_CORRECTIONS, TOPIC_MAPPINGS


class ExtractNerdcRevisionTests(unittest.TestCase):
    def test_reviewed_mapping_covers_every_planning_topic_once(self) -> None:
        target_codes = [
            target_code
            for mapping in TOPIC_MAPPINGS
            for target_code in mapping.target_codes
        ]

        self.assertEqual(len(TOPIC_MAPPINGS), 23)
        self.assertEqual(len(target_codes), 24)
        self.assertEqual(len(target_codes), len(set(target_codes)))

    def test_reviewed_mapping_covers_each_source_page_once(self) -> None:
        physical_pages = [
            physical_page
            for mapping in TOPIC_MAPPINGS
            for physical_page, _ in mapping.pages
        ]
        page_labels = [
            page_label
            for mapping in TOPIC_MAPPINGS
            for _, page_label in mapping.pages
        ]

        self.assertEqual(physical_pages, list(range(14, 38)))
        self.assertEqual(len(page_labels), len(set(page_labels)))
        self.assertNotIn("19", page_labels)

    def test_source_link_corrections_are_unique(self) -> None:
        keys = [
            (objective_code, record_id)
            for objective_code, record_id, _ in SOURCE_LINK_CORRECTIONS
        ]

        self.assertEqual(len(keys), 11)
        self.assertEqual(len(keys), len(set(keys)))


if __name__ == "__main__":
    unittest.main()
