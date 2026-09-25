"""The app's model as each request's default. Not dspy.configure: only the
task that first called it may call it again, and a Worker builds the app in
whichever request arrives first, so a failed build would fail every retry on
that rule."""

from __future__ import annotations

import dspy


class ModelContextMiddleware:
    """A model already in context wins, as a test's stand-in does."""

    def __init__(self, app, *, lm: dspy.LM) -> None:
        self.app = app
        self.lm = lm

    async def __call__(self, scope, receive, send) -> None:
        if dspy.settings.lm is not None:
            await self.app(scope, receive, send)
            return
        with dspy.context(lm=self.lm):
            await self.app(scope, receive, send)
