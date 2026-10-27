# Phase 0 smoke test: one question to Gemini (Google AI Studio) through LangChain.
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI


def main() -> None:
    load_dotenv()  # reads GOOGLE_API_KEY from assistant/.env
    # shortcut: 3.5 because gemini-3.8-flash was overloaded (503/504) on 2026-10-27; retry 3.8 later.
    model = ChatGoogleGenerativeAI(model="gemini-3.5-flash")
    print(model.invoke("What is a nine-dart finish?").text)
