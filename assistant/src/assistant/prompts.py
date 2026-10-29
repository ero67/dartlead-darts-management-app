# The assistant's four prompts live in Langfuse (text prompts, one label per environment) so they can be edited and
# compared without a deploy. The text in the code stays as the fallback and as what `prompts push` uploads.
import os
import re
import sys

from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder  # noqa: E402
from langfuse import get_client  # noqa: E402

PROMPT_LABEL = os.environ.get("PROMPT_LABEL", "production")


def to_langfuse(text: str) -> str:
    # {var} -> {{var}}, Langfuse's syntax; get_langchain_prompt() turns it back. shortcut: only {identifier} is
    # converted, so a literal brace in a code prompt would need escaping here; none has one today.
    return re.sub(r"\{(\w+)\}", r"{{\1}}", text)


def template(name: str, fallback: str, human: str | None = None) -> ChatPromptTemplate:
    # Cached by the SDK for 60 s, so building this per call is cheap. On a fetch error the code text is used.
    # No retries and a short timeout: a failed fetch is not cached, so with Langfuse down every prompt would
    # otherwise wait ~7 s before falling back (several per question).
    prompt = get_client().get_prompt(name, type="text", label=PROMPT_LABEL, fallback=to_langfuse(fallback),
                                     max_retries=0, fetch_timeout_seconds=3)
    # The callback handler links a generation to the prompt in this metadata. A fallback has no version to link.
    metadata = None if prompt.is_fallback else {"langfuse_prompt": prompt}
    last = ("human", human) if human else MessagesPlaceholder("messages")
    return ChatPromptTemplate(messages=[("system", prompt.get_langchain_prompt()), last], metadata=metadata)


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
