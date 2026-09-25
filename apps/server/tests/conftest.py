import os
import signal

import dspy
import pytest

# mutmut runs each mutant in a fork, and macOS reports a crashed Python with a
# "Python quit unexpectedly" dialog. Two things would crash it here.
#
# httpx looks up the system proxy settings whenever a client is made, and on
# macOS that calls SystemConfiguration, which segfaults in a forked process. A
# proxy setting in the environment ends the lookup before it reaches the system.
os.environ.setdefault("no_proxy", "*")

# mutmut stops a mutant that runs too long with SIGXCPU, whose default action
# dumps core. Exiting with the code mutmut reads as a timeout ends the fork the
# same way without the crash.
MUTMUT_TIMEOUT_EXIT = 24
signal.signal(signal.SIGXCPU, lambda *_: os._exit(MUTMUT_TIMEOUT_EXIT))


@pytest.fixture(autouse=True)
def no_dspy_state():
    """A cached answer returns before the model is called, so a test would
    exercise nothing and a timing test would measure nothing. DSPy's disk cache
    also outlives the test run, which makes results depend on earlier runs.

    A model configured by one test would likewise become every later test's
    default, so it is cleared.
    """
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    yield
    dspy.configure(lm=None)
