import unittest

from launcher import Bot


class RecommendFlowTest(unittest.TestCase):
    def test_recommend_flow_allows_empty_page_when_already_on_recommend(self):
        bot = Bot()
        bot.page_url = "https://www.zhipin.com/web/chat/recommend"
        bot.page_title = "推荐牛人"
        self.assertTrue(bot.can_enter_recommend_filter())

    def test_recommend_flow_blocks_other_pages(self):
        bot = Bot()
        bot.page_url = "https://www.zhipin.com/web/chat/index"
        bot.page_title = "沟通"
        self.assertFalse(bot.can_enter_recommend_filter())


if __name__ == "__main__":
    unittest.main()
