# Phase 0 smoke test: one question to Gemini (Google AI Studio) through LangChain,
# traced to Langfuse.
from dotenv import load_dotenv

load_dotenv()  # before importing Langfuse, which reads its keys from the environment

from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: E402
from langfuse import get_client, propagate_attributes  # noqa: E402
from langfuse.langchain import CallbackHandler  # noqa: E402


def main() -> None:
    # shortcut: 3.5 because gemini-3.8-flash was overloaded (503/504) on 2026-10-27; retry 3.8 later.
    # include_thoughts so the trace shows the model's reasoning, not just the answer.
    model = ChatGoogleGenerativeAI(model="gemini-3.5-flash", include_thoughts=True)
    with propagate_attributes(trace_name="answer-question", tags=["smoke-test"]):
        answer = model.invoke(
            "What is a nine-dart finish?",
            config={"callbacks": [CallbackHandler()], "run_name": "generate-answer"},
        )
    print(answer.text)
    get_client().shutdown()  # short-lived script: send queued traces before exiting
