import unittest

from launcher import Bot


class RecommendFlowTest(unittest.TestCase):
    def test_recommend_flow_allows_empty_page_when_already_on_recommend(self):
        bot = Bot()
        bot.page_url = "https://www.zhipin.com/web/chat/recommend"
        bot.page_title = "recommend"
        self.assertTrue(bot.can_enter_recommend_filter())

    def test_recommend_flow_blocks_other_pages(self):
        bot = Bot()
        bot.page_url = "https://www.zhipin.com/web/chat/index"
        bot.page_title = "chat"
        self.assertFalse(bot.can_enter_recommend_filter())

    def test_recommend_send_mode_platform_greet(self):
        bot = Bot()
        payload = bot.resolve_recommend_send_payload("1")
        self.assertEqual(payload, {"mode": "platform_greet", "text": ""})

    def test_recommend_send_mode_custom_text(self):
        bot = Bot()
        payload = bot.resolve_recommend_send_payload("2", custom_text="hello")
        self.assertEqual(payload, {"mode": "custom_text", "text": "hello"})


if __name__ == "__main__":
    unittest.main()
