# The assistant's four prompts live in Langfuse (text prompts, one label per environment) so they can be edited and
# compared without a deploy. The text in the code stays as the fallback and as what `prompts push` uploads.
import os
import re
import sys
import time

from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder  # noqa: E402
from langfuse import get_client  # noqa: E402

PROMPT_LABEL = os.environ.get("PROMPT_LABEL", "production")


def to_langfuse(text: str) -> str:
    # {var} -> {{var}}, Langfuse's syntax; get_langchain_prompt() turns it back. shortcut: only {identifier} is
    # converted, so a literal brace in a code prompt would need escaping here; none has one today.
    return re.sub(r"\{(\w+)\}", r"{{\1}}", text)


_skip_until = 0.0  # monotonic time until which Langfuse is not asked again after a failed fetch


def template(name: str, fallback: str, human: str | None = None) -> ChatPromptTemplate:
    # Langfuse is only a nicety: an outage, a missing key or a slow fetch must never block an answer. The SDK does not
    # cache failures, so after one failed fetch the code text is used for a minute without asking again.
    # shortcut: the one fetch per minute that probes Langfuse can still be slow in an outage; run it in a background
    # thread with a timeout if that shows up in latency.
    global _skip_until
    prompt = None
    if time.monotonic() >= _skip_until:
        try:  # cached by the SDK for 60 s otherwise; a fallback client means the fetch failed
            prompt = get_client().get_prompt(name, type="text", label=PROMPT_LABEL, fallback=to_langfuse(fallback),
                                             max_retries=0, fetch_timeout_seconds=3)
        except Exception:
            pass
        if prompt is None or prompt.is_fallback:
            _skip_until = time.monotonic() + 60
            prompt = None
    text = prompt.get_langchain_prompt() if prompt else fallback  # code text is already in LangChain syntax
    # The callback handler links a generation to the prompt in this metadata. The code text has no version to link.
    metadata = {"langfuse_prompt": prompt} if prompt else None
    last = ("human", human) if human else MessagesPlaceholder("messages")
    return ChatPromptTemplate(messages=[("system", text), last], metadata=metadata)


def main() -> None:
    # uv run prompts push [--label X]: upload the prompts in the code as new versions carrying the label.
    from assistant.agent import OFF_TOPIC_PROMPT, REWRITE_PROMPT, SYSTEM_PROMPT  # imported here: they need the model env
    from assistant.router import SYSTEM_PROMPT as ROUTER_PROMPT

    args = sys.argv[1:]
    if args[:1] != ["push"]:
        sys.exit("usage: prompts push [--label LABEL]")
    label = args[args.index("--label") + 1] if "--label" in args else PROMPT_LABEL
    langfuse = get_client()
    for name, text in {"agent": SYSTEM_PROMPT, "off-topic": OFF_TOPIC_PROMPT, "rewrite": REWRITE_PROMPT,
                       "router": ROUTER_PROMPT}.items():
        created = langfuse.create_prompt(name=name, prompt=to_langfuse(text), labels=[label], type="text")
        print(f"{name}: version {created.version}, label {label}")
    langfuse.flush()


if __name__ == "__main__":
    main()
