import unittest

from tools.import_network_observations import project_historical_friends


class HistoricalFriendGraphTest(unittest.TestCase):
    @staticmethod
    def event(day, status, *ids):
        time = f"2026-11-{day:02d}T10:00:00.000Z"
        return {"id": f"event_{day}", "index": day, "source_id": "1", "method": "roblox_website",
                "at": time, "checked_at": time, "status": status, "source_url": "https://www.roblox.com/users/1/profile",
                "items": [{"id": other, "source_url": "https://www.roblox.com/users/1/profile",
                           "observed_at": time} for other in ids]}

    def test_historical_projection_retains_only_superseded_positives(self):
        first = self.event(23, "partial", "2", "3")
        replacement = self.event(24, "complete", "2")
        partial = self.event(25, "partial", "4")
        [edge] = project_historical_friends([partial, replacement, first])
        self.assertEqual((edge["from"], edge["to"]), ("1", "3"))
        self.assertEqual(edge["evidence"][0]["observed_at"], first["at"])
        self.assertEqual(edge["laterChecks"][0]["observed_at"], replacement["at"])

    def test_partial_and_unavailable_checks_cannot_supersede_positives(self):
        self.assertEqual(project_historical_friends([
            self.event(23, "partial", "2"), self.event(24, "unavailable"), self.event(25, "partial")
        ]), [])


if __name__ == "__main__":
    unittest.main()
