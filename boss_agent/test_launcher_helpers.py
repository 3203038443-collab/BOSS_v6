import unittest

from launcher import Bot


class LauncherHelpersTest(unittest.TestCase):
    def setUp(self):
        self.bot = Bot()
        self.bot.candidates = [
            {"name": "张三", "has_read": False},
            {"name": "李四", "has_read": True},
            {"name": "王五", "has_read": False},
        ]

    def test_resolve_comm_batch_targets_unread(self):
        items, title = self.bot.resolve_comm_batch_targets("2")
        self.assertEqual(title, "沟通页未读名单")
        self.assertEqual([item["name"] for item in items], ["张三", "王五"])

    def test_resolve_comm_batch_targets_empty_read(self):
        self.bot.candidates = [{"name": "张三", "has_read": False}]
        items, title = self.bot.resolve_comm_batch_targets("3")
        self.assertEqual(title, "沟通页已读名单")
        self.assertEqual(items, [])

    def test_resolve_comm_batch_targets_all(self):
        items, title = self.bot.resolve_comm_batch_targets("1")
        self.assertEqual(title, "沟通页全部名单")
        self.assertEqual([item["name"] for item in items], ["张三", "李四", "王五"])

    def test_format_recommend_candidate(self):
        text = self.bot.format_recommend_candidate(
            {
                "name": "赵六",
                "location": "上海",
                "intent": "产品经理",
                "school": "复旦大学",
                "major": "计算机科学",
                "degree": "硕士",
            }
        )
        self.assertEqual(text, "赵六【上海 产品经理｜复旦大学｜计算机科学｜硕士】")


if __name__ == "__main__":
    unittest.main()
